"""Acceso a Supabase (`service_role`) y filtro de ownership (feature 019).

El servidor MCP es local y monousuario: el cliente Supabase usa `service_role`
(bypass RLS) y **todo** acceso filtra por `user_id = MCP_USER_ID`. Este módulo
centraliza:

- la creación del cliente (solo después de validar la configuración),
- el runtime compartido (config + cliente) que inyecta `server.py`,
- helpers de ownership que añaden `user_id` en inserciones y lo filtran en
  lecturas,
- las consultas de libros/notas limitadas a las columnas de cada contrato.
"""

from __future__ import annotations

from dataclasses import dataclass

from postgrest.exceptions import APIError
from supabase import Client, create_client

from config import MCPConfig

# Columnas de cada contrato (tech-stack.md): libros → resumen; notas → padre.
BOOK_SUMMARY_COLUMNS = "id, title, authors, status, rating"
NOTE_SUMMARY_COLUMNS = "id, content, created_at"


@dataclass(frozen=True)
class Runtime:
    """Configuración + cliente Supabase compartidos por todas las tools."""

    config: MCPConfig
    supabase: Client

    @property
    def user_id(self) -> str:
        return self.config.user_id


_runtime: Runtime | None = None


def create_supabase_client(config: MCPConfig) -> Client:
    """Crea el cliente Supabase `service_role` (solo tras validar la config)."""
    return create_client(config.supabase_url, config.supabase_service_role_key)


def set_runtime(runtime: Runtime) -> None:
    """Registra el runtime global (llamado por `server.py` al arrancar)."""
    global _runtime
    _runtime = runtime


def reset_runtime() -> None:
    """Limpia el runtime global (tests)."""
    global _runtime
    _runtime = None


def get_runtime() -> Runtime:
    """Devuelve el runtime global; falla si el servidor no lo inicializó."""
    if _runtime is None:
        raise RuntimeError("Runtime no inicializado: llama a set_runtime() al arrancar")
    return _runtime


def with_user_id(payload: dict, user_id: str) -> dict:
    """Copia `payload` y fija `user_id` (nunca permite sobrescribir a otro usuario)."""
    data = dict(payload)
    data["user_id"] = user_id
    return data


# ---------------------------------------------------------------------------
# Lecturas
# ---------------------------------------------------------------------------


def search_user_books(supabase: Client, user_id: str, query: str) -> list[dict]:
    """Libros del usuario cuyo título (ILIKE) o autores (Python) coinciden con `query`.

    Devuelve solo las columnas del contrato (`id, title, authors, status, rating`).
    """
    q = query.strip()
    pattern = f"%{q}%"

    title_rows = (
        supabase.table("books")
        .select("id")
        .eq("user_id", user_id)
        .ilike("title", pattern)
        .execute()
    ).data or []

    author_rows = (
        supabase.table("books").select("id, authors").eq("user_id", user_id).execute()
    ).data or []

    title_ids = [row["id"] for row in title_rows]
    author_ids = [
        row["id"]
        for row in author_rows
        if any(q.lower() in (author or "").lower() for author in row.get("authors") or [])
    ]
    ids = list(dict.fromkeys([*title_ids, *author_ids]))

    if not ids:
        return []

    return (
        supabase.table("books")
        .select(BOOK_SUMMARY_COLUMNS)
        .eq("user_id", user_id)
        .in_("id", ids)
        .execute()
    ).data or []


def book_owned_by(supabase: Client, user_id: str, book_id: str) -> bool:
    """True si el libro existe y pertenece al usuario (sin revelar libros ajenos)."""
    try:
        resp = (
            supabase.table("books")
            .select("id")
            .eq("id", book_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code in ("PGRST116", "406"):
            return False
        raise
    return bool(resp and resp.data)


def find_book_by_isbn(supabase: Client, user_id: str, isbn13: str) -> dict | None:
    """Libro del usuario con ese `isbn13` (detección de duplicados); `None` si no existe."""
    try:
        resp = (
            supabase.table("books")
            .select(BOOK_SUMMARY_COLUMNS)
            .eq("user_id", user_id)
            .eq("isbn13", isbn13)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code in ("PGRST116", "406"):
            return None
        raise
    return resp.data if resp else None


def list_parent_notes(supabase: Client, user_id: str, book_id: str) -> list[dict]:
    """Notas completas (`chunk_index = 0`) del libro, orden `created_at` descendente."""
    return (
        supabase.table("book_notes")
        .select(NOTE_SUMMARY_COLUMNS)
        .eq("book_id", book_id)
        .eq("user_id", user_id)
        .eq("chunk_index", 0)
        .order("created_at", desc=True)
        .execute()
    ).data or []


# ---------------------------------------------------------------------------
# Escrituras (inserción con `user_id` fijado al propietario)
# ---------------------------------------------------------------------------


def insert_book(supabase: Client, user_id: str, payload: dict) -> dict:
    """Inserta un libro para `user_id` y devuelve la fila creada."""
    resp = supabase.table("books").insert(with_user_id(payload, user_id)).execute()
    return resp.data[0]


def insert_note(supabase: Client, user_id: str, payload: dict) -> dict:
    """Inserta una nota para `user_id` y devuelve la fila creada."""
    resp = supabase.table("book_notes").insert(with_user_id(payload, user_id)).execute()
    return resp.data[0]
