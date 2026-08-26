"""Endpoint de chat IA con streaming SSE (feature 017).

`POST /api/v1/ai/chat` autenticado (`get_current_user`) que, según el modo,
prepara el contexto y devuelve un `StreamingResponse` `text/event-stream`:

- Modo `book`: `book_id` requerido, ownership validado (404 si es ajeno/inexistente),
  prompt de contexto libro con las notas completas del usuario.
- Modo `rag`: sin `book_id`; embedding de la consulta → RPC `match_book_notes` →
  prompt RAG global.

Contrato SSE (cada evento separado por `\n\n`):

- chunk:  `data: {"chunk": "...", "done": false}\n\n`
- final:  `data: {"chunk": "", "done": true}\n\n`
- error:  `data: {"error": "...", "done": true}\n\n`

Errores **antes** de iniciar el stream se devuelven como HTTP estructurados
(`{code, message, field?}`): 401 auth, 422 `book_id` ausente en modo `book`,
404 libro ajeno, 500 credenciales ausentes. Los errores **durante** el stream
(Gemini, Supabase, timeout de 60s) se emiten como evento SSE `error` con
`done: true`, sin revelar secretos (la clave de Gemini nunca aparece en el
mensaje; los detalles se registran en el log estructurado del servidor).
"""

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from google.api_core.exceptions import GoogleAPIError
from postgrest.exceptions import APIError
from supabase import Client

from app.core.config import settings
from app.core.database import get_supabase
from app.core.errors import map_supabase_error, raise_book_not_found, raise_http_exception
from app.core.logging import get_logger
from app.core.security import get_current_user
from app.models.chat import ChatMode, ChatRequest
from app.services import chat as chat_service

logger = get_logger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

# Límite total del stream (spec 017): 60 segundos para todo el proceso
# (preparación de contexto + generación). Se aplica con `asyncio.timeout`
# (equivalente moderno de `asyncio.wait_for` sobre el presupuesto total del
# generador), que cancela y libera recursos al vencer.
STREAM_TIMEOUT_SECONDS = 60.0


@router.post(
    "/chat",
    summary="Chat IA con streaming SSE (modo libro o RAG global)",
    description=(
        "Devuelve un `StreamingResponse` `text/event-stream` con la respuesta del "
        "modelo token a token. Modo `book` requiere `book_id`; modo `rag` consulta "
        "toda la biblioteca del usuario vía `match_book_notes`. Timeout total 60s."
    ),
)
async def chat(
    request: ChatRequest,
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> StreamingResponse:
    """Resuelve el modo, valida ownership/credenciales y arranca el stream SSE."""
    mode: ChatMode = request.mode or ("book" if request.book_id else "rag")

    # Validación antes de iniciar el stream (HTTP estructurado).
    if mode == "book" and request.book_id is None:
        raise_http_exception(
            "VALIDATION_ERROR",
            "book_id es obligatorio cuando mode='book'",
            field="book_id",
            status_code=422,
        )

    book: dict | None = None
    if mode == "book":
        try:
            book = chat_service.load_book(supabase, user_id, request.book_id)
        except APIError as exc:
            map_supabase_error(exc)
        if book is None:
            raise_book_not_found()

    if not settings.gemini_api_key:
        raise_http_exception(
            "GEMINI_KEY_MISSING",
            "GEMINI_API_KEY no configurado en el servidor",
            status_code=500,
        )

    return StreamingResponse(
        _event_stream(request, mode, user_id, supabase, book),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# Generador SSE
# ---------------------------------------------------------------------------


async def _event_stream(
    request: ChatRequest,
    mode: ChatMode,
    user_id: str,
    supabase: Client,
    book: dict | None,
) -> AsyncIterator[str]:
    """Generador SSE: prepara contexto, emite chunks y evento final o de error."""
    try:
        async with asyncio.timeout(STREAM_TIMEOUT_SECONDS):
            if mode == "book":
                prompt = _build_book_prompt(supabase, user_id, request.book_id, book)
            else:
                prompt = await _build_rag_prompt(supabase, user_id, request.query)

            async for token in chat_service.stream_chat_tokens(prompt):
                yield _sse_chunk(token)

            yield _sse_done()
    except TimeoutError:
        logger.warning("chat_stream_timeout", user_id=user_id, mode=mode)
        yield _sse_error("La generación excedió el límite de 60 segundos.")
    except GoogleAPIError as exc:
        logger.error(
            "chat_gemini_error",
            user_id=user_id,
            mode=mode,
            error_type=type(exc).__name__,
        )
        yield _sse_error("Error del servicio de IA. Inténtalo de nuevo.")
    except (APIError, httpx.HTTPError) as exc:
        logger.error(
            "chat_supabase_error",
            user_id=user_id,
            mode=mode,
            error_type=type(exc).__name__,
        )
        yield _sse_error("Error al consultar la base de datos. Inténtalo de nuevo.")
    except ValueError as exc:
        # p. ej. genai.configure sin clave o parámetros inválidos del modelo.
        logger.error(
            "chat_value_error",
            user_id=user_id,
            mode=mode,
            error_type=type(exc).__name__,
        )
        yield _sse_error("Error de configuración del servicio de IA.")


# ---------------------------------------------------------------------------
# Preparación de prompt (modo book / rag)
# ---------------------------------------------------------------------------


def _build_book_prompt(
    supabase: Client,
    user_id: str,
    book_id: UUID,
    book: dict | None,
) -> str:
    """Prompt de contexto libro: título + autores + notas completas del usuario."""
    if book is None:
        raise_book_not_found()  # defensivo: ya validado antes del stream
    notes = chat_service.load_book_notes(supabase, user_id, book_id)
    return chat_service.build_book_prompt(book, notes)


async def _build_rag_prompt(supabase: Client, user_id: str, query: str) -> str:
    """Prompt RAG: embedding de la consulta → RPC → prompt con fragmentos + títulos."""
    embedding = await asyncio.to_thread(chat_service.embed_query, query)
    results = chat_service.match_notes(supabase, embedding, user_id)
    return chat_service.build_rag_prompt(results)


# ---------------------------------------------------------------------------
# Serialización SSE
# ---------------------------------------------------------------------------


def _sse_chunk(token: str) -> str:
    """Serializa un token como evento SSE de chunk (done=false)."""
    payload = json.dumps({"chunk": token, "done": False}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _sse_done() -> str:
    """Serializa el evento final (chunk vacío, done=true)."""
    payload = json.dumps({"chunk": "", "done": True}, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _sse_error(message: str) -> str:
    """Serializa un evento de error (done=true, sin secretos)."""
    payload = json.dumps({"error": message, "done": True}, ensure_ascii=False)
    return f"data: {payload}\n\n"
