#!/usr/bin/env python3
"""
scripts/verify-supabase.py — Verificación del setup de Supabase con supabase-py (Feature 001)

Valida el criterio 4 de la spec: las credenciales (URL + service_role key)
funcionan al conectar con `supabase-py`.

Query usada:
    create_client(url, key).table('books').select('count').limit(1).execute()

Semántica del resultado (idéntica a scripts/verify-supabase.ts):
  - Error PostgREST PGRST205 (tabla `books` aún no creada, esperado pre-feature 002)
    → la conexión y credenciales funcionan → OK.
  - Error de red / URL o clave inválidas → FAIL.

Requisitos:
  - Copiar `.env.example` → `.env.local` y rellenar credenciales reales.
  - Instalar supabase-py: `python3 -m venv .venv && .venv/bin/pip install supabase`

Uso:
  npm run verify:supabase:py
  # o directamente: .venv/bin/python scripts/verify-supabase.py

Exit code: 0 = OK · 1 = fallo (con mensaje descriptivo)
"""

import os
import sys
from pathlib import Path

# ------------------------------------------------------------------
# El repo tiene un directorio `supabase/` (migraciones SQL) que, si el
# cwd o la raíz del proyecto están en sys.path, ensombrece el paquete
# pip `supabase`. Lo eliminamos de sys.path antes de importar.
# ------------------------------------------------------------------
_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
sys.path = [
    p for p in sys.path
    if os.path.abspath(p if p else os.getcwd()) != _PROJECT_ROOT
]

try:
    from supabase import create_client
    import httpx
except ImportError:
    print("✗ No se encontró el paquete `supabase` (supabase-py).")
    print("  → Instálalo: python3 -m venv .venv && .venv/bin/pip install supabase")
    sys.exit(1)

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
# Configuración
# ------------------------------------------------------------------
url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not url or not service_role_key:
    print("✗ Faltan variables: SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y SUPABASE_SERVICE_ROLE_KEY.")
    print("  → Copia .env.example a .env.local y rellena los valores reales.")
    sys.exit(1)

url = url.rstrip("/")
print(f"\nVerificando Supabase project (supabase-py): {url}\n")

# ------------------------------------------------------------------
# Test: conexión + credenciales (service_role)
# ------------------------------------------------------------------
try:
    supabase = create_client(url, service_role_key)
except Exception as err:  # noqa: BLE001 — error de inicialización del cliente
    print(f"✗ No se pudo inicializar el cliente supabase-py: {err}")
    sys.exit(1)

try:
    result = supabase.table("books").select("count").limit(1).execute()
    print("  ✓ Conexión OK — tabla `books` accesible con service_role.")
    print(f"    Respuesta: {result}")
    print("\nRESULTADO: TODO OK ✅ (exit 0)")
    sys.exit(0)
except Exception as err:  # noqa: BLE001 — postgrest lanza APIError genérica
    code = getattr(err, "code", None)
    message = getattr(err, "message", str(err))
    if code == "PGRST205":
        # 404: tabla aún no creada (esperado antes de feature 002) → la API y
        # las credenciales responden correctamente.
        print("  ✓ Conexión OK — API responde con service_role")
        print("    (tabla `books` aún no existe: esperado pre-migración 002; PGRST205 = credenciales válidas).")
        print("\nRESULTADO: TODO OK ✅ (exit 0)")
        sys.exit(0)
    if not code and isinstance(
        err, (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout)
    ):
        print(f"✗ Conexión: error de red o URL inválida — {err}")
    else:
        print(f"✗ Conexión: error inesperado (code={code}) — {message}")
    print("\nRESULTADO: FALLO ❌ (exit 1)")
    sys.exit(1)