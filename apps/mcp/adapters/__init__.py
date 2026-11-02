"""Paquete de adaptadores de integración del servidor MCP."""

from adapters.backend import (
    inject_backend_settings,
    inject_backend_supabase,
    setup_backend,
)

__all__ = [
    "inject_backend_settings",
    "inject_backend_supabase",
    "setup_backend",
]
