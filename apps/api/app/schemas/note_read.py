"""Modelo de respuesta de nota (feature 007)."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import ConfigDict, Field

from app.schemas.note_create import NoteCreate


class NoteRead(NoteCreate):
    """Respuesta de `GET /books/{id}/notes`.

    `NoteCreate` + campos de solo lectura (`id`, `user_id`, timestamps),
    `chunk_index` (índice del chunk en la nota original) y `embedding`
    (vector 768 dims de `text-embedding-004`, nullable para notas sin
    vectorizar aún).
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    chunk_index: list[int]
    embedding: Annotated[
        list[float] | None,
        Field(description="Embedding de 768 dimensiones (text-embedding-004)"),
    ] = None
