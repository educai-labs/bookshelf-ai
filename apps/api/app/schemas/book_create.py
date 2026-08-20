"""Modelo de creación de libro (feature 007)."""

from uuid import UUID

from app.schemas.book_metadata import BookMetadata


class BookCreate(BookMetadata):
    """Payload de `POST /books`.

    Hereda los metadatos normalizados (`BookMetadata`) y añade `user_id`
    opcional: lo inyecta el auth dependency (`get_current_user`) desde el JWT,
    no el cliente.
    """

    user_id: UUID | None = None
