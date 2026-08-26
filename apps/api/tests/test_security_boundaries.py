"""Tests de límites de seguridad entre backend y frontend (feature 021).

Verifica el límite duro de `tech-stack.md`: la `SERVICE_ROLE_KEY` de Supabase
nunca aparece en el frontend (`apps/web`), ni como variable `NEXT_PUBLIC_*` ni
referenciada en el código del bundle.
"""

from pathlib import Path

# Ruta a la raíz del monorepo: `apps/api/tests/` → 3 niveles arriba.
REPO_ROOT = Path(__file__).resolve().parents[3]
WEB_DIR = REPO_ROOT / "apps" / "web"

# Extensiones de archivo de código del frontend (y config) a inspeccionar.
_SCAN_EXTENSIONS = {
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".env.example",
    ".env.local",
    ".md",
}


def _iter_frontend_files():
    """Recorre recursivamente `apps/web` sin seguir `node_modules`/`.next`."""
    ignored = {".next", "node_modules", ".git", "dist", "build", "coverage"}
    for path in WEB_DIR.rglob("*"):
        if not path.is_file():
            continue
        if any(part in ignored for part in path.parts):
            continue
        if path.suffix not in _SCAN_EXTENSIONS and path.name not in (
            ".env.example",
            ".env.local",
        ):
            continue
        yield path


def test_frontend_sin_referencias_a_service_role_key():
    """`apps/web` no contiene ninguna referencia a `SERVICE_ROLE_KEY`."""
    offending: list[str] = []
    for path in _iter_frontend_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "SERVICE_ROLE_KEY" in text or "service_role_key" in text:
            offending.append(str(path.relative_to(REPO_ROOT)))
    assert not offending, "Referencias a SERVICE_ROLE_KEY en el frontend: " + ", ".join(offending)


def test_frontend_sin_referencias_a_service_role():
    """`apps/web` tampoco referencia la clave como `service_role` a secas."""
    offending: list[str] = []
    for path in _iter_frontend_files():
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        if "service_role" in text:
            offending.append(str(path.relative_to(REPO_ROOT)))
    assert not offending, "Referencias a service_role en el frontend: " + ", ".join(offending)
