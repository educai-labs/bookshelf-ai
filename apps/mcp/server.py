"""Servidor MCP local y monousuario de Bookshelf (feature 019).

Arranque: `cd apps/mcp && python server.py` (transporte STDIO). Antes de
registrar/exponer ninguna tool, valida la configuración y, si falta o es
inválida, termina con un mensaje en **stderr** que nombra la variable (sin
secretos).

La salida del protocolo MCP (stdout) nunca se mezcla con logs: los logs van a
stderr y no contienen secretos, stack traces ni detalles de conexión. Con
`mask_error_details=True`, cualquier excepción inesperada se enmascara y solo
los errores estructurados explícitos llegan al agente.
"""

from __future__ import annotations

import sys

from dotenv import load_dotenv
from fastmcp import FastMCP

from adapters.backend import (
    inject_backend_settings,
    inject_backend_supabase,
    setup_backend,
)
from config import MCPConfigError, load_config
from db import Runtime, create_supabase_client, set_runtime
from tools import register_tools


def build_mcp() -> FastMCP:
    """Construye el servidor FastMCP con las 5 tools registradas.

    Valida el entorno y conecta el backend **antes** de registrar ninguna tool.
    Lanza `SystemExit(1)` si la configuración es inválida (mensaje en stderr).
    """
    load_dotenv()  # apps/mcp/.env si existe (sin pisar el entorno ya exportado)

    try:
        config = load_config()
    except MCPConfigError as exc:
        print(f"Error de configuración: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    backend = setup_backend()
    inject_backend_settings(config, backend)

    supabase = create_supabase_client(config)
    set_runtime(Runtime(config=config, supabase=supabase))
    inject_backend_supabase(supabase, backend)

    mcp = FastMCP(
        name="bookshelf",
        instructions=(
            "Biblioteca personal de Bookshelf (servidor local y monousuario). "
            "Expone los libros, las notas y el chat IA de la biblioteca del "
            "usuario configurado por MCP_USER_ID."
        ),
        mask_error_details=True,
    )
    register_tools(mcp)
    return mcp


def main() -> None:
    """Entrypoint STDIO: `python server.py`."""
    mcp = build_mcp()
    mcp.run(show_banner=False)


if __name__ == "__main__":
    main()
