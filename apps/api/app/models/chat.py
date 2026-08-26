"""Modelos Pydantic del chat IA (feature 017).

`ChatRequest` es el payload de `POST /api/v1/ai/chat`:

- `query`: pregunta del usuario (1-50000 caracteres).
- `book_id`: opcional; obligatorio cuando `mode="book"`.
- `mode`: `"book"` (contexto libro) o `"rag"` (RAG global). El valor por defecto
  se resuelve en el endpoint (feature 017): `"book"` si hay `book_id`, si no
  `"rag"`. Aquí se declara opcional (`None`) para que el endpoint decida.

Validaciones (convención `tech-stack.md`): `query` entre 1 y 50000 caracteres
(`Field(min_length=1, max_length=50000)`), `mode` restringido al literal
`ChatMode` y `extra="forbid"` (rechaza campos no documentados).
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

ChatMode = Literal["book", "rag"]


class ChatRequest(BaseModel):
    """Payload de `POST /api/v1/ai/chat`."""

    model_config = {"extra": "forbid"}

    query: str = Field(
        min_length=1,
        max_length=50000,
        description="Pregunta del usuario (1-50000 caracteres)",
    )
    book_id: UUID | None = Field(
        default=None,
        description="ID del libro (obligatorio cuando mode='book')",
    )
    mode: ChatMode | None = Field(
        default=None,
        description="Modo de contexto: 'book' (libro) o 'rag' (biblioteca global)",
    )
