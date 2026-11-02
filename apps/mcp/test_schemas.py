"""Tests de `apps/mcp/schemas.py` (feature 019).

Cubren validación de entradas (no vacío, no solo espacios, longitud), campos
opcionales marcados (`book_id`), respuestas con campos nulables (`rating`) y
enum de estado.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from schemas import (
    BookStatus,
    BookSummary,
    ChatWithLibraryRequest,
    CreateBookRequest,
    CreateNoteRequest,
    NoteCreatedResponse,
    SearchBooksRequest,
    to_book_summary,
    to_note_summary,
)


def test_book_status_enum_valores():
    assert BookStatus.want_to_read == "want_to_read"
    assert BookStatus.reading == "reading"
    assert BookStatus.read == "read"


@pytest.mark.parametrize("query", ["", "   ", " \t "])
def test_search_books_query_vacia_o_espacios(query):
    with pytest.raises(ValidationError):
        SearchBooksRequest(query=query)


def test_search_books_query_valida():
    req = SearchBooksRequest(query="  tolkien  ")
    assert req.query == "  tolkien  "


def test_chat_book_id_opcional():
    assert ChatWithLibraryRequest(query="hola").book_id is None
    assert ChatWithLibraryRequest(query="hola", book_id="abc").book_id == "abc"


def test_chat_query_vacia():
    with pytest.raises(ValidationError):
        ChatWithLibraryRequest(query="   ")


def test_create_note_content_longitud_maxima():
    with pytest.raises(ValidationError):
        CreateNoteRequest(book_id="abc", content="x" * 50001)
    assert CreateNoteRequest(book_id="abc", content="una nota").content == "una nota"


def test_create_note_content_vacio_o_espacios():
    with pytest.raises(ValidationError):
        CreateNoteRequest(book_id="abc", content="   ")


def test_create_book_isbn_vacio():
    with pytest.raises(ValidationError):
        CreateBookRequest(isbn="   ")


def test_book_summary_rating_nulable_y_status_enum():
    summary = BookSummary(
        id=uuid4(),
        title="T",
        authors=["A"],
        status="reading",
        rating=None,
    )
    assert summary.rating is None
    assert summary.status is BookStatus.reading


def test_book_summary_status_invalido():
    with pytest.raises(ValidationError):
        BookSummary(id=uuid4(), title="T", authors=["A"], status="no-existe")


def test_to_book_summary_rating_nulo():
    row = {
        "id": str(uuid4()),
        "title": "T",
        "authors": ["A"],
        "status": "read",
        "rating": None,
    }
    summary = to_book_summary(row)
    assert summary.rating is None
    assert summary.status is BookStatus.read


def test_to_book_summary_authors_none_por_defecto():
    row = {
        "id": str(uuid4()),
        "title": "T",
        "authors": None,
        "status": "want_to_read",
        "rating": None,
    }
    summary = to_book_summary(row)
    assert summary.authors == []


def test_to_note_summary_mapea_created_at():
    created = datetime(2026, 1, 2, 3, 4, 5, tzinfo=UTC)
    row = {"id": str(uuid4()), "content": "nota", "created_at": created.isoformat()}
    summary = to_note_summary(row)
    assert summary.created_at == created
    assert summary.content == "nota"


def test_note_created_response_serializa_campos():
    note = NoteCreatedResponse(
        id=uuid4(),
        content="**md**",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    dumped = note.model_dump(mode="json")
    assert set(dumped) == {"id", "content", "created_at"}
    assert isinstance(dumped["id"], str)
