"""Tests de `create_book` y `create_note` (feature 019).

Cubren normalización ISBN (10/13), fallback del lookup, ISBN inválido/no
encontrado/duplicado (sin filas duplicadas), conservación del Markdown,
placeholder de embedding, ownership del libro y encolado de la vectorización.
"""

from __future__ import annotations

import asyncio

import pytest
from app.models.isbn import ISBNLookupResponse, ISBNNotFoundError

from conftest import OTHER_USER_ID, USER_ID, make_book
from errors import ErrorCode, MCPError
from tools import write

ISBN10 = "0306406152"
ISBN13 = "9780306406157"

METADATA = ISBNLookupResponse(
    title="El Hobbit",
    authors=["J. R. R. Tolkien"],
    cover_url="https://covers.openlibrary.org/b/id/1-L.jpg",
    page_count=310,
    publisher="Minotauro",
    published_date="1937",
    description="Novela de fantasía.",
)


class _Lookup:
    """Mock de `ISBNLookupService`."""

    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls: list[str] = []

    async def buscar(self, isbn):
        self.calls.append(isbn)
        if self.error is not None:
            raise self.error
        return self.result


def _install_lookup(monkeypatch, lookup):
    monkeypatch.setattr(write, "get_lookup_service", lambda: lookup)


async def _drain():
    for _ in range(5):
        await asyncio.sleep(0)


# --- create_book ------------------------------------------------------------


async def test_create_book_isbn13_valido(runtime, fake_supabase, mcp, monkeypatch):
    lookup = _Lookup(result=METADATA)
    _install_lookup(monkeypatch, lookup)

    result = await mcp.call_tool("create_book", {"isbn": ISBN13})
    summary = result.structured_content

    assert summary["title"] == "El Hobbit"
    assert summary["authors"] == ["J. R. R. Tolkien"]
    assert summary["status"] == "want_to_read"
    assert summary["rating"] is None
    assert set(summary) == {"id", "title", "authors", "status", "rating"}

    assert lookup.calls == [ISBN13]
    rows = fake_supabase.all_books()
    assert len(rows) == 1
    assert rows[0]["isbn13"] == ISBN13
    assert rows[0]["user_id"] == USER_ID


async def test_create_book_normaliza_isbn10_a_isbn13(runtime, fake_supabase, mcp, monkeypatch):
    lookup = _Lookup(result=METADATA)
    _install_lookup(monkeypatch, lookup)

    result = await mcp.call_tool("create_book", {"isbn": "0-306-40615-2"})
    assert result.structured_content["title"] == "El Hobbit"
    assert lookup.calls == [ISBN13]
    assert fake_supabase.all_books()[0]["isbn13"] == ISBN13


async def test_create_book_isbn_invalido(runtime, mcp, monkeypatch):
    _install_lookup(monkeypatch, _Lookup())
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("create_book", {"isbn": "no-es-isbn"})
    assert exc_info.value.code == ErrorCode.INVALID_ISBN


async def test_create_book_metadatos_no_encontrados(runtime, mcp, monkeypatch):
    _install_lookup(monkeypatch, _Lookup(error=ISBNNotFoundError(ISBN13)))
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("create_book", {"isbn": ISBN13})
    assert exc_info.value.code == ErrorCode.ISBN_NOT_FOUND


async def test_create_book_duplicado_no_inserta_fila(runtime, fake_supabase, mcp, monkeypatch):
    fake_supabase.add_book(make_book(USER_ID, isbn13=ISBN13))
    _install_lookup(monkeypatch, _Lookup(result=METADATA))

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("create_book", {"isbn": ISBN13})
    assert exc_info.value.code == ErrorCode.ISBN_DUPLICATE
    # Ninguna fila duplicada.
    assert len(fake_supabase.all_books()) == 1


async def test_create_book_duplicado_de_otro_usuario_no_bloquea(
    runtime, fake_supabase, mcp, monkeypatch
):
    # El ISBN pertenece a otro usuario: no es un duplicado para MCP_USER_ID.
    fake_supabase.add_book(make_book(OTHER_USER_ID, isbn13=ISBN13))
    _install_lookup(monkeypatch, _Lookup(result=METADATA))

    result = await mcp.call_tool("create_book", {"isbn": ISBN13})
    assert result.structured_content["title"] == "El Hobbit"
    assert len(fake_supabase.all_books()) == 2


# --- create_note ------------------------------------------------------------


async def test_create_note_conserva_markdown_y_renderiza_html(runtime, fake_supabase, mcp):
    book = make_book(USER_ID)
    fake_supabase.add_book(book)

    result = await mcp.call_tool("create_note", {"book_id": book["id"], "content": "**negrita**"})
    note = result.structured_content
    assert note["content"] == "**negrita**"
    assert set(note) == {"id", "content", "created_at"}

    rows = fake_supabase.all_notes()
    assert len(rows) == 1
    row = rows[0]
    assert row["content"] == "**negrita**"
    assert "<strong>negrita</strong>" in row["content_html"]
    assert row["chunk_index"] == 0
    assert row["embedding"] == [0.0] * 768
    assert row["user_id"] == USER_ID
    assert row["book_id"] == book["id"]


async def test_create_note_libro_ajeno_no_inserta(runtime, fake_supabase, mcp):
    ajeno = make_book(OTHER_USER_ID)
    fake_supabase.add_book(ajeno)

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("create_note", {"book_id": ajeno["id"], "content": "nota"})
    assert exc_info.value.code == ErrorCode.BOOK_NOT_FOUND
    assert fake_supabase.all_notes() == []


async def test_create_note_libro_inexistente(runtime, mcp):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool(
            "create_note",
            {"book_id": "00000000-0000-0000-0000-00000000dead", "content": "nota"},
        )
    assert exc_info.value.code == ErrorCode.BOOK_NOT_FOUND


async def test_create_note_uuid_invalido(runtime, mcp):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("create_note", {"book_id": "no-uuid", "content": "nota"})
    assert exc_info.value.code == ErrorCode.INVALID_UUID


async def test_create_note_content_vacio(runtime, mcp):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("create_note", {"book_id": "0" * 32, "content": "   "})
    assert exc_info.value.code == ErrorCode.VALIDATION


async def test_create_note_encola_vectorizacion_sin_bloquear(
    runtime, fake_supabase, mcp, monkeypatch
):
    book = make_book(USER_ID)
    fake_supabase.add_book(book)

    calls: list[tuple] = []

    async def _fake_vectorize(note_id, user_id, book_id, content):
        calls.append((str(note_id), str(user_id), str(book_id), content))

    monkeypatch.setattr(write, "vectorize_note", _fake_vectorize)

    result = await mcp.call_tool("create_note", {"book_id": book["id"], "content": "nota"})
    # La respuesta llega sin esperar a la vectorización (no bloqueante).
    assert result.structured_content["content"] == "nota"

    await _drain()
    assert len(calls) == 1
    note_id, user_id, book_id, content = calls[0]
    assert user_id == USER_ID
    assert book_id == book["id"]
    assert content == "nota"
    assert note_id == result.structured_content["id"]
