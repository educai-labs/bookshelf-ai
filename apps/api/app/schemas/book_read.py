"""Modelo de respuesta de libro (feature 007)."""

from datetime import datetime
from uuid import UUID

from app.schemas.book_create import BookCreate


class BookRead(BookCreate):
    """Respuesta de `GET /books` y `GET /books/{id}`.

    `BookCreate` + campos de solo lectura (`id`, timestamps). `user_id` es
    requerido aquí (ya resuelto por auth).
    """

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
