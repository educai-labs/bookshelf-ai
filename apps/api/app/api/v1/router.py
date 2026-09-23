"""Router raíz de la API v1.

Prefix `/api/v1`; agrega los routers de endpoints. La feature 009 (books CRUD,
incluye `GET /books/lookup` consolidado aquí) registra su router sin tocar
`main.py`.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import ai, books, health, notes, settings, suggestions

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
# `suggestions` se registra ANTES que `books` para que la ruta literal
# `/books/suggestions` se evalúe antes que `/books/{book_id}` (UUID).
api_router.include_router(suggestions.router)
api_router.include_router(books.router)
api_router.include_router(notes.router)
api_router.include_router(ai.router)
api_router.include_router(settings.router)
