"""Servicio de chat IA (feature 017).

Prepara el contexto según el modo solicitado (`book` o `rag`) y expone un
iterador async de tokens de Gemini (`gemini-2.0-flash`). La llamada síncrona de
`google-generativeai` se aísla del event loop en un worker (`asyncio.to_thread`)
y los tokens se puentean al consumidor a través de una `asyncio.Queue`, de modo
que el streaming es progresivo sin bloquear otras peticiones.

Helpers separados (testables de forma aislada, decisión del plan):

- `load_book`: valida ownership y carga el libro del usuario.
- `load_book_notes`: carga las notas propias del libro (chunks `chunk_index >= 0`,
  orden `chunk_index` ascendente).
- `build_book_prompt`: prompt de contexto libro (título + autores + notas completas).
- `embed_query`: embedding de la consulta (`text-embedding-004`, `RETRIEVAL_QUERY`).
- `match_notes`: RPC `match_book_notes` (threshold 0.7, count 10, filtrado por usuario).
- `build_rag_prompt`: prompt RAG con contenido y título de cada fragmento.
- `stream_chat_tokens`: iterador async de tokens de `gemini-2.0-flash`.
"""

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID

import google.generativeai as genai
from postgrest.exceptions import APIError

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# --- Parámetros fijos (límites duros de `tech-stack.md`) --------------------
# Chat fijo a `gemini-2.0-flash` y embedding fijo a `text-embedding-004` (768 dims).
CHAT_MODEL = "gemini-2.0-flash"
EMBEDDING_MODEL = "models/text-embedding-004"
EMBEDDING_TASK_TYPE = "RETRIEVAL_QUERY"
MATCH_THRESHOLD = 0.7
MATCH_COUNT = 10

# Plantillas de prompt (spec 017). Se mantienen como format-strings con
# placeholders nombrados para que los tests verifiquen la construcción exacta.
BOOK_PROMPT_TEMPLATE = (
    "Eres un asistente de lectura. El usuario pregunta sobre el libro '{title}' "
    "de {authors}. Notas del usuario:\n{notes}\n\nResponde basándote en ellas."
)

RAG_PROMPT_TEMPLATE = (
    "Responde usando estos fragmentos de tu biblioteca:\n{chunks}\n\n"
    "Si no hay info relevante, dilo."
)


# ---------------------------------------------------------------------------
# Carga y validación (ownership)
# ---------------------------------------------------------------------------


def load_book(supabase, user_id: str, book_id: UUID) -> dict | None:
    """Carga el libro si pertenece al usuario; `None` si no existe o es ajeno.

    Query: `SELECT id, title, authors FROM books WHERE id = book_id AND user_id = user_id`.
    No filtra existencia (criterio del dominio): el endpoint decide el 404.
    """
    try:
        resp = (
            supabase.table("books")
            .select("id, title, authors")
            .eq("id", str(book_id))
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code in ("PGRST116", "406"):
            return None
        raise
    return resp.data if resp else None


def load_book_notes(supabase, user_id: str, book_id: UUID) -> list[dict]:
    """Notas propias del libro: chunks `chunk_index >= 0`, orden `chunk_index`.

    Incluye la nota "padre" (`chunk_index=0`) y sus chunks vectoriales
    (`chunk_index >= 1`), en orden ascendente de índice para conservar el
    sentido de lectura de las notas completas.
    """
    resp = (
        supabase.table("book_notes")
        .select("content, chunk_index")
        .eq("book_id", str(book_id))
        .eq("user_id", user_id)
        .gte("chunk_index", 0)
        .order("chunk_index")
        .execute()
    )
    return resp.data or []


# ---------------------------------------------------------------------------
# Construcción de prompts
# ---------------------------------------------------------------------------


def build_book_prompt(book: dict, notes: list[dict]) -> str:
    """Prompt de contexto libro con título, autores y notas completas."""
    title = book.get("title") or "Sin título"
    authors = ", ".join(book.get("authors") or []) or "Autor desconocido"
    notes_text = "\n\n".join((note.get("content") or "") for note in notes)
    return BOOK_PROMPT_TEMPLATE.format(title=title, authors=authors, notes=notes_text)


def build_rag_prompt(results: list[dict]) -> str:
    """Prompt RAG con el contenido y el título de cada fragmento devuelto."""
    chunks = [
        f"Libro '{result.get('book_title') or 'Sin título'}': " f"{result.get('content') or ''}"
        for result in results
    ]
    return RAG_PROMPT_TEMPLATE.format(chunks="\n\n".join(chunks))


# ---------------------------------------------------------------------------
# Embedding y RPC (modo rag)
# ---------------------------------------------------------------------------


def _ensure_genai_configured() -> None:
    """Configura el cliente Gemini con la clave de `settings` (idempotente).

    `google-generativeai` usa por defecto `GOOGLE_API_KEY` (no `GEMINI_API_KEY`);
    sin este `configure` explícito, `embed_content` lanza `ValueError` (mismo
    motivo que documenta `vectorization.py`). Se invoca antes de cada uso de
    Gemini (embeddings y generación de chat) para que la clave sea la correcta.
    No registra la clave.
    """
    genai.configure(api_key=settings.gemini_api_key)


def embed_query(query: str) -> list[float]:
    """Embedding de la consulta con `text-embedding-004` y `RETRIEVAL_QUERY`.

    Devuelve un vector de 768 dimensiones. Es síncrono; el endpoint lo invoca
    vía `asyncio.to_thread` para no bloquear el event loop (feature 017).
    """
    _ensure_genai_configured()
    response = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=query,
        task_type=EMBEDDING_TASK_TYPE,
    )
    return response["embedding"]


def match_notes(supabase, embedding: list[float], user_id: str) -> list[dict]:
    """RPC `match_book_notes` con `user_id`, threshold 0.7 y count 10.

    El `user_id` proviene exclusivamente del JWT (nunca del cliente) para
    aislar los resultados por usuario (riesgo de fuga cross-user).
    """
    resp = supabase.rpc(
        "match_book_notes",
        {
            "query_embedding": embedding,
            "filter_user_id": user_id,
            "match_threshold": MATCH_THRESHOLD,
            "match_count": MATCH_COUNT,
        },
    ).execute()
    return resp.data or []


# ---------------------------------------------------------------------------
# Streaming de tokens (Gemini)
# ---------------------------------------------------------------------------


def _chunk_text(chunk) -> str:
    """Texto de un chunk de respuesta de Gemini (vacío si no hay partes).

    Un chunk de streaming puede no incluir `parts` (p. ej. solo ratings de
    seguridad); en ese caso el texto es vacío y se omite, sin abortar el stream.
    """
    try:
        return chunk.text or ""
    except (ValueError, AttributeError, IndexError):
        return ""


async def stream_chat_tokens(prompt: str) -> AsyncIterator[str]:
    """Itera los tokens de `gemini-2.0-flash` sin bloquear el event loop.

    La llamada síncrona `generate_content(stream=True)` se ejecuta en un worker
    (`asyncio.to_thread`) y cada token se encola en una `asyncio.Queue` que este
    generador drena progresivamente. Cualquier error del worker se propaga al
    consumidor. El `finally` cancela el worker si el consumidor se detiene antes
    de tiempo (desconexión del cliente o timeout), cerrando recursos.

    Nota: `google-generativeai` 0.8 expone el streaming como
    `generate_content(..., stream=True)` (no existe `generate_content_stream`);
    este helper encapsula esa interfaz y es el único punto que la usa.
    """
    _ensure_genai_configured()

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[tuple[str | None, BaseException | None]] = asyncio.Queue()

    def _worker() -> None:
        try:
            model = genai.GenerativeModel(CHAT_MODEL)
            response = model.generate_content(prompt, stream=True)
            for chunk in response:
                text = _chunk_text(chunk)
                if text:
                    loop.call_soon_threadsafe(queue.put_nowait, (text, None))
        except BaseException as exc:  # noqa: BLE001 — re-lanzado en el consumidor
            loop.call_soon_threadsafe(queue.put_nowait, (None, exc))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, (None, None))

    worker = asyncio.create_task(asyncio.to_thread(_worker))
    try:
        while True:
            text, error = await queue.get()
            if error is not None:
                raise error
            if text is None:
                return
            yield text
    finally:
        if not worker.done():
            worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass
