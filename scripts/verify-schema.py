#!/usr/bin/env python3
"""
scripts/verify-schema.py — Verificación del esquema remoto de Supabase (Feature 024)

Convierte el drift de migraciones (esquema esperado en el repo ≠ esquema real
del remoto) en un fallo detectable y accionable. Comprueba, objeto a objeto,
que el proyecto Supabase **remoto** contiene:

  - Tablas:    `books`, `book_notes`, `account_preferences` (PostgREST, service_role)
  - RPC:       `match_book_notes` (PostgREST, service_role)
  - Extensión: `vector` (introspección SQL del catálogo)
  - Índice:    `idx_book_notes_embedding_hnsw` sobre `book_notes.embedding` (SQL)

Credenciales (solo desde variables de entorno; carga `.env.local` si existe,
mismo loader que `verify-supabase.py`):
  - `SUPABASE_URL` (o `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SERVICE_ROLE_KEY`
    → requeridas; falla antes de conectar si falta alguna.
  - `SUPABASE_DB_URL` → usada para la introspección del catálogo (extensión e
    índice). Si falta, esos dos objetos se marcan como "no verificados".

Salida: una marca `✓`/`✗` por objeto, un resumen con el tipo y nombre de los
faltantes y el remedio (`supabase db push --include-all` + `npm run verify:schema`).
Nunca imprime la service_role key ni otros secretos, ni la URL completa del
proyecto.

Exit code: 0 = todos los objetos presentes · 1 = cualquier faltante, error de
conexión o error de autenticación (con mensajes claramente diferenciados).

Uso:
  npm run verify:schema
  # o directamente: .venv/bin/python scripts/verify-schema.py
"""

import os
import re
import sys
from pathlib import Path

# ------------------------------------------------------------------
# El repo tiene un directorio `supabase/` (migraciones SQL) que, si el
# cwd o la raíz del proyecto están en sys.path, ensombrece el paquete
# pip `supabase`. Lo eliminamos de sys.path antes de importar.
# ------------------------------------------------------------------
_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
sys.path = [
    p for p in sys.path if os.path.abspath(p if p else os.getcwd()) != _PROJECT_ROOT
]

try:
    import httpx
    from postgrest.exceptions import APIError

    from supabase import create_client
except ImportError:
    print("✗ No se encontró el paquete `supabase` (supabase-py).")
    print("  → Instálalo: python3 -m venv .venv && .venv/bin/pip install supabase")
    sys.exit(1)

# `psycopg` (conexión SQL directa) es opcional: solo se usa para la
# introspección del catálogo (extensión `vector` e índice HNSW).
try:
    import psycopg

    HAS_PSYCOPG = True
except ImportError:
    psycopg = None
    HAS_PSYCOPG = False


# ------------------------------------------------------------------
# Carga de variables de entorno (.env.local si existe)
# ------------------------------------------------------------------
def load_env_file(path: Path) -> None:
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        os.environ.setdefault(key, value)


env_local = Path(_PROJECT_ROOT) / ".env.local"
if env_local.exists():
    load_env_file(env_local)
    print("> Variables cargadas desde: .env.local")
else:
    print("> Aviso: no existe .env.local. Usando variables del entorno.")

# ------------------------------------------------------------------
# Configuración y validación previa de variables
# ------------------------------------------------------------------
url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
db_url = os.environ.get("SUPABASE_DB_URL")

missing_vars = []
if not url:
    missing_vars.append("SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)")
if not service_role_key:
    missing_vars.append("SUPABASE_SERVICE_ROLE_KEY")

if missing_vars:
    print("\n✗ Faltan variables de entorno requeridas:")
    for var in missing_vars:
        print(f"    - {var}")
    print("  → Copia .env.example a .env.local y rellena los valores reales:")
    print("      SUPABASE_URL: Project URL (Dashboard → Settings → API).")
    print("      SUPABASE_SERVICE_ROLE_KEY: clave service_role (solo backend/MCP).")
    print("\nRESULTADO: FALLO ❌ (exit 1) — no se intentó conectar.")
    sys.exit(1)

url = url.rstrip("/")

# ------------------------------------------------------------------
# Redacción de secretos / URL
# ------------------------------------------------------------------
_JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
_URL_RE = re.compile(r"https?://[^\s\"']+")


def _redact(text: str) -> str:
    """Elimina URLs completas y tokens JWT de un mensaje de error."""
    text = _JWT_RE.sub("[REDACTED]", text)
    text = _URL_RE.sub("<url>", text)
    return text


def _mask_url(url: str) -> str:
    """Devuelve una versión sin el project-ref (solo dominio, sin secretos)."""
    from urllib.parse import urlsplit

    parts = urlsplit(url)
    host = parts.hostname or "<unknown>"
    labels = host.split(".")
    if len(labels) >= 2:
        # conserva solo los dos últimos labels (p. ej. supabase.co)
        redacted_host = "<proyecto>." + ".".join(labels[-2:])
    else:
        redacted_host = "<proyecto>"
    return f"{parts.scheme}://{redacted_host}"


print(f"\nVerificando esquema remoto de Supabase: {_mask_url(url)}")

# ------------------------------------------------------------------
# Clasificación de errores
# ------------------------------------------------------------------
_NETWORK_ERRORS = (
    httpx.ConnectError,
    httpx.ConnectTimeout,
    httpx.ReadTimeout,
    httpx.WriteTimeout,
    httpx.TimeoutException,
    httpx.NetworkError,
)

_AUTH_MARKERS = (
    "invalid api key",
    "api key",
    "apikey",
    "jwt",
    "unauthorized",
    "forbidden",
    "permission denied",
    "not authorized",
)


def _classify(exc: Exception, missing_code: str) -> str:
    """Devuelve: ok | missing | network | auth | other."""
    if isinstance(exc, _NETWORK_ERRORS):
        return "network"
    if isinstance(exc, APIError):
        if exc.code == missing_code:
            return "missing"
        # Código entero (no cadena): postgrest-py no pudo parsear el body de
        # error (respuesta no estándar de PostgREST). 401/403 => credenciales.
        if isinstance(exc.code, int):
            return "auth" if exc.code in (401, 403) else "other"
        message = (exc.message or "").lower()
        if exc.code == "PGRST301" or any(marker in message for marker in _AUTH_MARKERS):
            return "auth"
        return "other"
    return "other"


def _safe_error(exc: Exception) -> str:
    """Resumen de error sin secretos ni URLs completas."""
    if isinstance(exc, APIError):
        code = getattr(exc, "code", None)
        if isinstance(code, int):
            return f"HTTP {code}"
        message = _redact(getattr(exc, "message", "") or "")
        return f"code={code or 'sin código'} {message}".strip()
    # Errores de transporte (httpx): su repr puede incluir la URL completa.
    return type(exc).__name__


# ------------------------------------------------------------------
# Cliente PostgREST
# ------------------------------------------------------------------
try:
    supabase = create_client(url, service_role_key)
except Exception as err:  # noqa: BLE001 — error de inicialización del cliente
    print(f"✗ No se pudo inicializar el cliente supabase-py: {type(err).__name__}")
    sys.exit(1)

# ------------------------------------------------------------------
# Checks individuales (aislados por objeto)
# ------------------------------------------------------------------
# status: "ok" | "missing" | "network" | "auth" | "unverified" | "other"
results: list[dict] = []


def _record(obj_type: str, name: str, status: str, detail: str = "") -> None:
    results.append({"type": obj_type, "name": name, "status": status, "detail": detail})


def check_table(table: str) -> None:
    try:
        supabase.table(table).select("id").limit(1).execute()
        _record("tabla", table, "ok")
    except Exception as err:  # noqa: BLE001 — postgrest lanza APIError/httpx
        _record("tabla", table, _classify(err, "PGRST205"), _safe_error(err))


def check_rpc(name: str) -> None:
    params = {
        "query_embedding": [0.0] * 768,
        "filter_user_id": "00000000-0000-0000-0000-000000000000",
        "match_threshold": 0.7,
        "match_count": 1,
    }
    try:
        supabase.rpc(name, params).execute()
        _record("RPC", name, "ok")
    except Exception as err:  # noqa: BLE001 — postgrest lanza APIError/httpx
        _record("RPC", name, _classify(err, "PGRST202"), _safe_error(err))


def check_catalog() -> None:
    """Extensión `vector` e índice HNSW vía introspección SQL (SUPABASE_DB_URL)."""
    if not HAS_PSYCOPG:
        detail = "psycopg no instalado (pip install psycopg)"
        _record("extensión", "vector", "unverified", detail)
        _record("índice", "idx_book_notes_embedding_hnsw", "unverified", detail)
        return
    if not db_url:
        detail = "falta SUPABASE_DB_URL (cadena de conexión Postgres)"
        _record("extensión", "vector", "unverified", detail)
        _record("índice", "idx_book_notes_embedding_hnsw", "unverified", detail)
        return

    try:
        with psycopg.connect(db_url) as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            if cur.fetchone():
                _record("extensión", "vector", "ok")
            else:
                _record("extensión", "vector", "missing")

            cur.execute("""
                    SELECT 1 FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND tablename = 'book_notes'
                      AND indexname = 'idx_book_notes_embedding_hnsw'
                      AND lower(indexdef) LIKE '%using hnsw%'
                      AND lower(indexdef) LIKE '%embedding%'
                    """)
            if cur.fetchone():
                _record("índice", "idx_book_notes_embedding_hnsw", "ok")
            else:
                _record("índice", "idx_book_notes_embedding_hnsw", "missing")
    except psycopg.OperationalError as err:
        detail = _redact(str(err))
        _record("extensión", "vector", "network", detail)
        _record("índice", "idx_book_notes_embedding_hnsw", "network", detail)
    except Exception as err:  # noqa: BLE001 — error de catálogo no esperado
        detail = type(err).__name__
        _record("extensión", "vector", "other", detail)
        _record("índice", "idx_book_notes_embedding_hnsw", "other", detail)


# ------------------------------------------------------------------
# Ejecución
# ------------------------------------------------------------------
for table in ("books", "book_notes", "account_preferences"):
    check_table(table)
check_rpc("match_book_notes")
check_catalog()

# ------------------------------------------------------------------
# Salida
# ------------------------------------------------------------------
REMEDY = "supabase db push --include-all y vuelve a ejecutar `npm run verify:schema`"

print("\nResultado por objeto:")
for result in results:
    label = f"{result['type']} `{result['name']}`"
    if result["status"] == "ok":
        print(f"  ✓ {label} — presente")
    elif result["status"] == "missing":
        print(f"  ✗ {label} — AUSENTE")
    elif result["status"] == "network":
        print(f"  ✗ {label} — error de conexión/red ({result['detail']})")
    elif result["status"] == "auth":
        print(f"  ✗ {label} — error de autenticación ({result['detail']})")
    elif result["status"] == "unverified":
        print(f"  ✗ {label} — no verificado ({result['detail']})")
    else:
        print(f"  ✗ {label} — error inesperado ({result['detail']})")

missing = [r for r in results if r["status"] == "missing"]
problems = [r for r in results if r["status"] not in ("ok", "missing")]

print("\n------------------------------------------")

if missing:
    print("Faltantes detectados (esquema remoto desactualizado):")
    for result in missing:
        print(f"  - {result['type']} `{result['name']}`")
    print("\nRemedio: aplica las migraciones pendientes y verifica de nuevo:")
    print(f"  {REMEDY}")

if problems:
    for result in problems:
        kind = {
            "network": "conexión/red",
            "auth": "autenticación/credenciales",
            "unverified": "verificación no disponible",
            "other": "error inesperado",
        }[result["status"]]
        print(
            f"Problema de {kind}: {result['type']} `{result['name']}` — {result['detail']}"
        )

if missing or problems:
    print("\nRESULTADO: FALLO ❌ (exit 1)")
    sys.exit(1)

print("RESULTADO: TODO OK ✅ (exit 0)")
sys.exit(0)
