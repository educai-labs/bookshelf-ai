"""Router raíz de la API v1.

Prefix `/api/v1`; agrega los routers de endpoints. Las features 008-010
(books, notes, lookup) añadirán sus routers aquí sin tocar `main.py`.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import health

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
