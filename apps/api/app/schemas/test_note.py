"""Tests de los schemas de Notes (feature 007): happy path + casos inválidos."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import NoteCreate, NoteRead


def test_note_create_happy_path():
    note = NoteCreate(book_id=uuid4(), content="Resumen del capítulo 3", page=12)
    assert note.content == "Resumen del capítulo 3"
    assert note.page == 12


def test_note_create_page_optional():
    note = NoteCreate(book_id=uuid4(), content="Sin página")
    assert note.page is None


def test_note_create_empty_content_raises():
    with pytest.raises(ValidationError):
        NoteCreate(book_id=uuid4(), content="")


@pytest.mark.parametrize("bad_page", [0, -1])
def test_note_create_page_must_be_positive(bad_page):
    with pytest.raises(ValidationError):
        NoteCreate(book_id=uuid4(), content="Nota", page=bad_page)


def test_note_create_bad_uuid_raises():
    with pytest.raises(ValidationError):
        NoteCreate(book_id="not-a-uuid", content="Nota")


def test_note_read_from_attributes():
    now = datetime.now(UTC)
    obj = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        book_id=uuid4(),
        content="Nota de ejemplo",
        page=3,
        created_at=now,
        updated_at=now,
        chunk_index=[0],
        embedding=[0.1] * 768,
    )
    note = NoteRead.model_validate(obj)
    assert note.id == obj.id
    assert note.user_id == obj.user_id
    assert note.book_id == obj.book_id
    assert note.content == "Nota de ejemplo"
    assert note.page == 3
    assert note.chunk_index == [0]
    assert len(note.embedding) == 768
    assert note.created_at == now
    assert note.updated_at == now
