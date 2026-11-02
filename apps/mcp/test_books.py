"""Tests de las tools de lectura `search_books` y `get_book_notes` (feature 019).

Cubren camino feliz (filtros, columnas, orden, `chunk_index`), resultado vacío,
errores de validación estructurados y aislamiento entre dos usuarios.
"""

from __future__ import annotations

import pytest

from conftest import OTHER_USER_ID, USER_ID, make_book, make_note
from errors import ErrorCode, MCPError

# --- search_books -----------------------------------------------------------


async def test_search_books_por_titulo_case_insensitive(runtime, fake_supabase, mcp):
    fake_supabase.add_book(make_book(USER_ID, title="El Hobbit"))
    fake_supabase.add_book(make_book(USER_ID, title="Dune"))
    result = await mcp.call_tool("search_books", {"query": "HOBBIT"})
    books = result.structured_content["books"]
    assert len(books) == 1
    assert books[0]["title"] == "El Hobbit"
    assert set(books[0]) == {"id", "title", "authors", "status", "rating"}


async def test_search_books_por_autor(runtime, fake_supabase, mcp):
    fake_supabase.add_book(make_book(USER_ID, title="X", authors=["Ursula K. Le Guin"]))
    fake_supabase.add_book(make_book(USER_ID, title="Y", authors=["Isaac Asimov"]))
    result = await mcp.call_tool("search_books", {"query": "le guin"})
    books = result.structured_content["books"]
    assert [b["title"] for b in books] == ["X"]


async def test_search_books_sin_coincidencias_devuelve_lista_vacia(runtime, fake_supabase, mcp):
    fake_supabase.add_book(make_book(USER_ID, title="El Hobbit"))
    result = await mcp.call_tool("search_books", {"query": "no existe"})
    assert result.structured_content["books"] == []


@pytest.mark.parametrize("query", ["", "   ", "\t"])
async def test_search_books_query_vacia_o_espacios(runtime, mcp, query):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("search_books", {"query": query})
    assert exc_info.value.code == ErrorCode.VALIDATION


async def test_search_books_aislamiento_entre_usuarios(runtime, fake_supabase, mcp):
    fake_supabase.add_book(make_book(USER_ID, title="Propio"))
    fake_supabase.add_book(make_book(OTHER_USER_ID, title="Ajeno Secreto"))
    result = await mcp.call_tool("search_books", {"query": "Secreto"})
    assert result.structured_content["books"] == []


# --- get_book_notes ---------------------------------------------------------


async def test_get_book_notes_solo_chunk_index_cero_orden_desc(runtime, fake_supabase, mcp):
    book = make_book(USER_ID)
    fake_supabase.add_book(book)
    fake_supabase.add_note(
        make_note(
            USER_ID,
            book["id"],
            content="más nueva",
            chunk_index=0,
            created_at="2026-02-02T00:00:00Z",
        )
    )
    fake_supabase.add_note(
        make_note(
            USER_ID,
            book["id"],
            content="más vieja",
            chunk_index=0,
            created_at="2026-01-01T00:00:00Z",
        )
    )
    fake_supabase.add_note(
        make_note(
            USER_ID,
            book["id"],
            content="chunk vectorial",
            chunk_index=1,
            created_at="2026-03-01T00:00:00Z",
        )
    )

    result = await mcp.call_tool("get_book_notes", {"book_id": book["id"]})
    notes = result.structured_content["notes"]

    assert [n["content"] for n in notes] == ["más nueva", "más vieja"]
    assert all(set(n) == {"id", "content", "created_at"} for n in notes)


async def test_get_book_notes_libro_ajeno_error(runtime, fake_supabase, mcp):
    book = make_book(OTHER_USER_ID)
    fake_supabase.add_book(book)
    fake_supabase.add_note(make_note(OTHER_USER_ID, book["id"], content="nota ajena"))

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("get_book_notes", {"book_id": book["id"]})
    assert exc_info.value.code == ErrorCode.BOOK_NOT_FOUND
    assert "nota ajena" not in exc_info.value.message


async def test_get_book_notes_libro_inexistente_error(runtime, fake_supabase, mcp):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("get_book_notes", {"book_id": "00000000-0000-0000-0000-00000000dead"})
    assert exc_info.value.code == ErrorCode.BOOK_NOT_FOUND


async def test_get_book_notes_uuid_invalido_error(runtime, mcp):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("get_book_notes", {"book_id": "no-es-uuid"})
    assert exc_info.value.code == ErrorCode.INVALID_UUID
