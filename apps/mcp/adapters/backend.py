"""Adaptador de integración con el backend `apps/api` (feature 019).

El servidor MCP reutiliza por import los servicios de dominio del backend
(chat, lookup ISBN, renderizado de notas y vectorización) para no duplicar
lógica. Este módulo hace importable `apps/api/app` desde `apps/mcp` y conecta
la "capa de conexión" del backend con la del MCP:

1. `setup_backend()` — añade `apps/api` al `sys.path` para que `import app`
   funcione al ejecutar `cd apps/mcp && python server.py`, SIN levantar FastAPI
   ni requerir `API_BASE_URL` (no existe). Devuelve los módulos reutilizados.
2. `inject_backend_settings(config)` — copia a `app.core.config.settings` los
   valores ya validados por `apps/mcp/config.py` (clave Gemini y clave de
   Google Books). Los servicios (`chat.py`, `vectorization.py`, `isbn_lookup.py`)
   leen `settings` del backend; así usan los mismos valores que validó el MCP.
3. `inject_backend_supabase(client)` — registra el cliente Supabase
   `service_role` del MCP en `app.core.database._supabase`, usado por
   `vectorize_note` (que no recibe el cliente por parámetro).

**Ajustes documentados (por qué existe este adaptador):**

- **Path**: `apps/api` no está en el `sys.path` de `apps/mcp`; se añade aquí
  para que `import app` resuelva al árbol fuente del backend.
- **Cliente**: `vectorize_note` obtiene el cliente Supabase del singleton del
  backend (`app.core.database.get_supabase_client()`); se inyecta el cliente
  del MCP para que vectorice contra la misma instancia y con `service_role`.
- **Settings**: los servicios leen `app.core.config.settings` (singleton del
  backend); se inyectan los valores ya validados por el MCP.

No se arranca FastAPI ni se hace HTTP: `apps/api/app/main.py` no se importa, y
no existe ninguna URL de backend (`API_BASE_URL`) en la configuración del MCP.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from supabase import Client

from config import MCPConfig

_API_DIR = Path(__file__).resolve().parents[2] / "api"


def setup_backend() -> dict[str, Any]:
    """Hace importable `app` (backend) y devuelve los módulos reutilizados."""
    api_dir = str(_API_DIR)
    if api_dir not in sys.path:
        sys.path.insert(0, api_dir)

    from app.core import config as backend_config
    from app.core import database as backend_database
    from app.services import chat as chat_service
    from app.services import isbn_lookup as isbn_lookup_service
    from app.services import notes as notes_service
    from app.services import vectorization as vectorization_service

    return {
        "config": backend_config,
        "database": backend_database,
        "chat": chat_service,
        "isbn_lookup": isbn_lookup_service,
        "notes": notes_service,
        "vectorization": vectorization_service,
    }


def inject_backend_settings(config: MCPConfig, backend: dict[str, Any]) -> None:
    """Inyecta en `app.core.config.settings` los valores ya validados por el MCP."""
    settings = backend["config"].settings
    settings.gemini_api_key = config.gemini_api_key
    settings.google_books_api_key = config.google_books_api_key or ""


def inject_backend_supabase(client: Client, backend: dict[str, Any]) -> None:
    """Registra el cliente Supabase del MCP en `app.core.database._supabase`."""
    backend["database"]._supabase = client
