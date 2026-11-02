"""Tools de escritura: `create_book` y `create_note` (feature 019).

Reutilizan por import el lookup ISBN (`ISBNLookupService`), el renderizado
Markdown→HTML y el pipeline de vectorización del backend, sin duplicar
chunking, embeddings, prompts ni reglas de negocio.
"""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime
from uuid import UUID

import httpx
from app.models.isbn import InvalidISBNError, ISBNNotFoundError, normalizar_isbn
from app.services.isbn_lookup import get_lookup_service, isbn10_a_isbn13
from app.services.notes import render_markdown_to_html
from app.services.vectorization import vectorize_note
from fastmcp import FastMCP
from postgrest.exceptions import APIError
from pydantic import ValidationError

from db import book_owned_by, find_book_by_isbn, get_runtime, insert_book, insert_note
from errors import ErrorCode, map_exception, parse_uuid, raise_error, to_validation_error
from schemas import (
    BookSummary,
    CreateBookRequest,
    CreateNoteRequest,
    NoteCreatedResponse,
    to_book_summary,
)

# Embedding placeholder: `book_notes.embedding` es NOT NULL (vector(768), modelo
# fijo text-embedding-004). La vectorización real (feature 016) sobrescribirá
# este vector de ceros con el embedding de la nota completa.
EMBEDDING_PLACEHOLDER = [0.0] * 768


def _normalize_isbn(raw: str) -> str:
    """Normaliza un ISBN (10 o 13, con guiones/espacios) a ISBN-13.

    Lanza `InvalidISBNError` si la entrada no es un ISBN-10/13 válido.
    """
    limpio = re.sub(r"[\s-]", "", str(raw)).strip()
    if len(limpio) == 10:
        convertido = isbn10_a_isbn13(limpio)
        if convertido is None:
            raise InvalidISBNError(raw)
        return convertido
    return normalizar_isbn(limpio)


def _parse_published_date(value: str | None) -> str | None:
    """Convierte `published_date` (formatos variados) a una fecha ISO o `None`.

    Mismo criterio que el alta del backend: nunca falla el alta por un formato
    raro de la API externa.
    """
    if not value:
        return None
    value = value.strip()
    for formato in ("%Y-%m-%d", "%Y", "%B %Y", "%b %Y"):
        try:
            return datetime.strptime(value, formato).replace(tzinfo=UTC).date().isoformat()
        except ValueError:
            continue
    return None


def register(mcp: FastMCP) -> None:
    """Registra las tools de escritura en el servidor."""

    @mcp.tool()
    async def create_book(isbn: str) -> BookSummary:
        """Crea un libro desde su ISBN (10 o 13) y devuelve su resumen.

        Obtiene los metadatos con el mismo lookup que la web (Open Library /
        Google Books) y los guarda para el usuario configurado. ISBN ya
        registrado → error "ya existe" sin fila duplicada.
        """
        try:
            request = CreateBookRequest(isbn=isbn)
        except ValidationError as exc:
            raise to_validation_error(exc) from None

        runtime = get_runtime()
        lookup = get_lookup_service()

        try:
            isbn13 = _normalize_isbn(request.isbn)
        except InvalidISBNError as exc:
            raise map_exception(exc) from None

        try:
            metadata = await lookup.buscar(isbn13)
        except ISBNNotFoundError as exc:
            raise map_exception(exc) from None
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise map_exception(exc) from None

        existing = find_book_by_isbn(runtime.supabase, runtime.user_id, isbn13)
        if existing is not None:
            raise_error(
                ErrorCode.ISBN_DUPLICATE,
                "El ISBN ya está en la biblioteca del usuario.",
            )

        payload = {
            "isbn13": isbn13,
            "title": metadata.title,
            "authors": metadata.authors,
            "cover_url": metadata.cover_url,
            "page_count": metadata.page_count,
            "publisher": metadata.publisher,
            "published_date": _parse_published_date(metadata.published_date),
            "description": metadata.description,
        }

        try:
            row = insert_book(runtime.supabase, runtime.user_id, payload)
        except APIError as exc:
            if exc.code == "23505":  # unique_violation (carrera por ISBN duplicado)
                raise_error(
                    ErrorCode.ISBN_DUPLICATE,
                    "El ISBN ya está en la biblioteca del usuario.",
                )
            raise map_exception(exc) from None

        return to_book_summary(row)

    @mcp.tool()
    async def create_note(book_id: str, content: str) -> NoteCreatedResponse:
        """Crea una nota en Markdown para el libro y deja la vectorización en cola.

        Devuelve la nota creada (`id, content, created_at`). Si el libro no
        existe o es de otro usuario, devuelve error y no inserta nada.
        """
        try:
            request = CreateNoteRequest(book_id=book_id, content=content)
        except ValidationError as exc:
            raise to_validation_error(exc) from None

        runtime = get_runtime()
        book_uuid = parse_uuid(request.book_id, field="book_id")

        if not book_owned_by(runtime.supabase, runtime.user_id, str(book_uuid)):
            raise_error(ErrorCode.BOOK_NOT_FOUND, "El libro no existe o no pertenece al usuario.")

        content_html = render_markdown_to_html(request.content)

        try:
            row = insert_note(
                runtime.supabase,
                runtime.user_id,
                {
                    "book_id": str(book_uuid),
                    "content": request.content,
                    "content_html": content_html,
                    "chunk_index": 0,
                    "embedding": EMBEDDING_PLACEHOLDER,
                },
            )
        except Exception as exc:  # noqa: BLE001 — convertido a error MCP estructurado
            raise map_exception(exc) from None

        note_id = row["id"]
        # Encola la vectorización (pipeline 016) sin bloquear la respuesta.
        asyncio.create_task(
            vectorize_note(UUID(str(note_id)), UUID(runtime.user_id), book_uuid, request.content)
        )

        return NoteCreatedResponse(
            id=note_id,
            content=row["content"],
            created_at=row["created_at"],
        )
