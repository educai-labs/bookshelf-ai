"""Modelo de creación de nota (feature 007)."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NoteCreate(BaseModel):
    """Payload de `POST /books/{id}/notes`.

    `content` mínimo 1 carácter; `page` opcional y siempre > 0.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    book_id: UUID
    content: Annotated[str, Field(min_length=1)]
    page: Annotated[int | None, Field(gt=0)] = None
