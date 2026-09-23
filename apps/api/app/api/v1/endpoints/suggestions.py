"""Endpoint de sugerencias de búsqueda (feature 023).

`GET /api/v1/books/suggestions?q=&limit=` autenticado vía
`Depends(get_current_user)` (el `user_id` se extrae del JWT; NUNCA se acepta
`user_id` del cliente). Combina la biblioteca del usuario con el catálogo
externo (Open Library primario / Google Books fallback) y devuelve una lista
mergeada y deduplicada por ISBN-13.

Reglas (spec 023):
- `q` obligatorio (422 si falta o queda vacío tras trim); `limit` default 8 con
  clamp 1-20.
- Con `len(q) < 3` NO se llama al catálogo externo (solo biblioteca).
- Fail-soft: errores/timeout del catálogo externo → 200 con solo biblioteca
  (nunca error duro).
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from supabase import Client

from app.core.database import get_supabase
from app.core.security import get_current_user
from app.models.suggestions import SuggestionsRequest, SuggestionsResponse
from app.services.book_suggestions import BookSuggestionsService
from app.services.isbn_lookup import ISBNLookupService, get_lookup_service

router = APIRouter(prefix="/books", tags=["books"])


@router.get(
    "/suggestions",
    response_model=SuggestionsResponse,
    summary="Sugerencias de búsqueda en vivo",
    description=(
        "Sugerencias de libros (biblioteca del usuario + catálogo externo) para "
        "el typeahead. `q` obligatorio (mínimo 3 caracteres para consultar el "
        "catálogo); `limit` entre 1 y 20 (default 8)."
    ),
)
async def get_suggestions(
    params: Annotated[SuggestionsRequest, Query()],
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
    lookup_service: Annotated[ISBNLookupService, Depends(get_lookup_service)],
) -> SuggestionsResponse:
    """Merge biblioteca + catálogo para `q`, aislado por `user_id` del JWT."""
    service = BookSuggestionsService(lookup_service)
    return await service.get_suggestions(supabase, user_id, params.q, params.limit)
