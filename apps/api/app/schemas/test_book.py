"""Tests de los schemas de Books (feature 007): happy path + casos inválidos."""

from datetime import UTC, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import BookCreate, BookMetadata, BookRead, BookStatus, BookUpdate

VALID_ISBN = "9788412345678"


# --- BookCreate / BookMetadata: happy path + ISBN -------------------------------------------


def test_book_create_happy_path():
    book = BookCreate(
        isbn=VALID_ISBN,
        title="Clean Code",
        authors=["Robert C. Martin"],
        publisher="Prentice Hall",
        page_count=464,
    )
    assert book.isbn == VALID_ISBN
    assert book.title == "Clean Code"
    assert book.authors == ["Robert C. Martin"]
    assert book.publisher == "Prentice Hall"
    assert book.page_count == 464
    assert book.user_id is None


def test_book_create_accepts_user_id():
    user_id = uuid4()
    book = BookCreate(isbn=VALID_ISBN, title="T", user_id=user_id)
    assert book.user_id == user_id


def test_isbn_normalized_from_dashes_and_spaces():
    assert BookCreate(isbn="978-84-12345-67-8", title="T").isbn == VALID_ISBN
    assert BookCreate(isbn="978 84 12345 67 8", title="T").isbn == VALID_ISBN


@pytest.mark.parametrize(
    "bad_isbn", ["978841234567", "97884123456789", "abc", "", "978-84-12345-67"]
)
def test_isbn_invalid_raises(bad_isbn):
    with pytest.raises(ValidationError):
        BookCreate(isbn=bad_isbn, title="T")


@pytest.mark.parametrize("bad_page", [0, -1, -100])
def test_page_count_must_be_positive(bad_page):
    with pytest.raises(ValidationError):
        BookCreate(isbn=VALID_ISBN, title="T", page_count=bad_page)


def test_book_metadata_lists_and_nulls():
    meta = BookMetadata(
        isbn=VALID_ISBN,
        title="T",
        publisher=None,
        categories=["Ficción"],
        thumbnail_url="https://example.com/cover.jpg",
    )
    assert meta.authors == []
    assert meta.categories == ["Ficción"]
    assert meta.publisher is None
    assert meta.language is None


# --- BookUpdate: PATCH parcial + rating -----------------------------------------------------


def test_book_update_partial():
    update = BookUpdate(title="Nuevo título", rating=4)
    assert update.title == "Nuevo título"
    assert update.rating == 4
    assert update.isbn is None
    assert update.status is None


def test_book_update_status_enum_value():
    update = BookUpdate(status="reading")
    assert update.status == "reading"


def test_book_update_accepts_status_enum_member():
    update = BookUpdate(status=BookStatus.READ)
    assert update.status == "read"


@pytest.mark.parametrize("bad_rating", [0, 6, -1])
def test_book_update_rating_out_of_range(bad_rating):
    with pytest.raises(ValidationError):
        BookUpdate(rating=bad_rating)


def test_book_update_status_invalid_raises():
    with pytest.raises(ValidationError):
        BookUpdate(status="archived")


def test_book_update_page_count_zero_raises():
    with pytest.raises(ValidationError):
        BookUpdate(page_count=0)


def test_book_update_isbn_normalized():
    update = BookUpdate(isbn="978-84-12345-67-8")
    assert update.isbn == VALID_ISBN


# --- BookRead: from_attributes (ORM) --------------------------------------------------------


def test_book_read_from_attributes():
    now = datetime.now(UTC)
    obj = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        isbn=VALID_ISBN,
        title="Clean Code",
        authors=["Robert C. Martin"],
        publisher=None,
        published_date=None,
        description=None,
        page_count=464,
        categories=None,
        thumbnail_url=None,
        language=None,
        created_at=now,
        updated_at=now,
    )
    book = BookRead.model_validate(obj)
    assert book.id == obj.id
    assert book.user_id == obj.user_id
    assert book.isbn == VALID_ISBN
    assert book.title == "Clean Code"
    assert book.created_at == now
    assert book.updated_at == now
