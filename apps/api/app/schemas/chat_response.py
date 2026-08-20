"""Modelo de respuesta de chat IA (feature 007)."""

from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatResponse(BaseModel):
    """Respuesta de `POST /api/v1/ai/chat` (no streaming; ver feature 017 para SSE).

    `sources`: URLs o referencias usadas para responder (RAG).
    """

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    response: str
    sources: Annotated[
        list[str] | None, Field(description="URLs o referencias usadas como fuentes")
    ] = None
    book_id: UUID | None = None
