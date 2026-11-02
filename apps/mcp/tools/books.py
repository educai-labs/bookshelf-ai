"""Tools de lectura de la biblioteca: `search_books` y `get_book_notes` (feature 019)."""

from __future__ import annotations

from fastmcp import FastMCP
from pydantic import ValidationError

from db import book_owned_by, get_runtime, list_parent_notes, search_user_books
from errors import ErrorCode, parse_uuid, raise_error, to_validation_error
from schemas import (
    GetBookNotesResponse,
    SearchBooksRequest,
    SearchBooksResponse,
    to_book_summary,
    to_note_summary,
)


def register(mcp: FastMCP) -> None:
    """Registra las tools de lectura en el servidor."""

    @mcp.tool()
    async def search_books(query: str) -> SearchBooksResponse:
        """Busca los libros del usuario por título o autores (sin distinguir mayúsculas).

        Devuelve una lista de libros con `id, title, authors, status, rating`.
        Una búsqueda sin coincidencias devuelve lista vacía (no error).
        """
        try:
            request = SearchBooksRequest(query=query)
        except ValidationError as exc:
            raise to_validation_error(exc) from None

        runtime = get_runtime()
        rows = search_user_books(runtime.supabase, runtime.user_id, request.query)
        return SearchBooksResponse(books=[to_book_summary(row) for row in rows])

    @mcp.tool()
    async def get_book_notes(book_id: str) -> GetBookNotesResponse:
        """Devuelve las notas completas (`chunk_index = 0`) del libro, por creación desc.

        Solo si el libro pertenece al usuario configurado; en caso contrario
        devuelve un error estructurado sin revelar notas ajenas.
        """
        book_uuid = parse_uuid(book_id, field="book_id")
        runtime = get_runtime()
        if not book_owned_by(runtime.supabase, runtime.user_id, str(book_uuid)):
            raise_error(ErrorCode.BOOK_NOT_FOUND, "El libro no existe o no pertenece al usuario.")

        rows = list_parent_notes(runtime.supabase, runtime.user_id, str(book_uuid))
        return GetBookNotesResponse(notes=[to_note_summary(row) for row in rows])
