"""Schemas Pydantic v2 de Bookshelf API (feature 007).

Re-exports públicos: los routers/services importan desde aquí
(`from app.schemas import BookCreate, BookRead, ...`). Los archivos granulares
por modelo evitan imports circulares (BookRead → BookCreate → BookMetadata).
"""

from app.schemas.book_create import BookCreate
from app.schemas.book_metadata import BookMetadata
from app.schemas.book_read import BookRead
from app.schemas.book_update import BookUpdate
from app.schemas.chat_request import ChatRequest
from app.schemas.chat_response import ChatResponse
from app.schemas.enums import BookStatus
from app.schemas.note_create import NoteCreate
from app.schemas.note_read import NoteRead
from app.schemas.recommendation_response import RecommendationItem, RecommendationResponse

__all__ = [
    "BookCreate",
    "BookMetadata",
    "BookRead",
    "BookStatus",
    "BookUpdate",
    "ChatRequest",
    "ChatResponse",
    "NoteCreate",
    "NoteRead",
    "RecommendationItem",
    "RecommendationResponse",
]
