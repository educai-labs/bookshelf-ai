"""Modelo de petición de chat IA (feature 007)."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

ChatMode = Literal["book", "library"]


class ChatRequest(BaseModel):
    """Payload de `POST /api/v1/ai/chat`.

    `mode="book"` inyecta contexto del libro (`book_id`); `mode="library"` usa
    RAG global sobre todas las notas del usuario.
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    message: Annotated[str, Field(min_length=1, max_length=4000)]
    book_id: UUID | None = None
    mode: ChatMode = "book"
