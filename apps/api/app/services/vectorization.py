"""Vectorización de notas (stub de la feature 016).

`vectorize_note` se dispara como tarea background tras crear una nota
(`POST /books/{book_id}/notes`, feature 010). Esta feature solo declara el
contrato y deja un stub que loggea un warning: el pipeline real (chunking
~500 tokens / 50 overlap, embeddings `text-embedding-004`, upsert de chunks
en `book_notes` con `chunk_index` + `embedding`) lo implementa la feature 016.

Contrato (no debe romperse): `vectorize_note(note_id, user_id, book_id, content)`.
"""

from uuid import UUID

from app.core.logging import get_logger

logger = get_logger(__name__)


async def vectorize_note(note_id: UUID, user_id: UUID, book_id: UUID, content: str) -> None:
    """Stub: loggea un warning. Feature 016 implementará el pipeline real.

    Args:
        note_id: ID de la nota padre recién creada (chunk_index=0).
        user_id: Propietario de la nota (del JWT).
        book_id: Libro al que pertenece la nota.
        content: Contenido Markdown original de la nota.
    """
    logger.warning(
        "vectorize_note_stub",
        note_id=str(note_id),
        user_id=str(user_id),
        book_id=str(book_id),
        message="Vectorización no implementada aún (feature 016); nota guardada sin chunks",
    )
