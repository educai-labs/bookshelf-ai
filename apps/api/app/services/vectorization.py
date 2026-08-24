"""Pipeline de vectorización de notas (feature 016).

`vectorize_note` se dispara como tarea background tras crear una nota
(`POST /books/{book_id}/notes`, feature 010) y ejecuta el proceso completo:

1. Normaliza el Markdown original a texto plano (determinista).
2. Divide el texto en chunks con `tiktoken` (`cl100k_base`), ventana de 500
   tokens, avance de 450 y solapamiento de 50; notas < 500 tokens → 1 chunk.
3. Vectoriza todos los chunks en un único batch de Google Gemini
   (`models/text-embedding-004`, `task_type=RETRIEVAL_DOCUMENT`, 768 dims).
   La llamada síncrona se aísla del event loop con `asyncio.to_thread`.
4. Sustituye idempotentemente los chunks en `book_notes` con cliente
   `service_role`: DELETE (chunk_index > 0) → INSERT batch → UPDATE del padre.
5. Emite logs estructurados (duración, tokens, chunks, `note_id`, errores)
   sin registrar secretos ni contenido.

Contrato (no debe romperse): `vectorize_note(note_id, user_id, book_id, content)`.
"""

import asyncio
import html as _html
import re
import time
from uuid import UUID

import google.generativeai as genai
import httpx
import markdown2
import tiktoken
from google.api_core.exceptions import GoogleAPIError
from postgrest.exceptions import APIError

from app.core.config import settings
from app.core.database import get_supabase_client
from app.core.logging import get_logger
from app.services.notes import render_markdown_to_html

logger = get_logger(__name__)

# --- Parámetros fijos (límites duros de `tech-stack.md`) --------------------
# Chunking fijo: 500 tokens / 50 overlap. Embedding model fijo: text-embedding-004
# (768 dims). Cambiar cualquiera de estos valores exige re-vectorización completa.
ENCODING_NAME = "cl100k_base"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
CHUNK_ADVANCE = CHUNK_SIZE - CHUNK_OVERLAP  # 450
EMBEDDING_MODEL = "models/text-embedding-004"
EMBEDDING_TASK_TYPE = "RETRIEVAL_DOCUMENT"
EMBEDDING_DIMENSIONS = 768
MAX_EMBED_ATTEMPTS = 2  # 1 intento inicial + 1 reintento único

# Regex para despojar etiquetas HTML al convertir Markdown → texto plano.
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


async def vectorize_note(note_id: UUID, user_id: UUID, book_id: UUID, content: str) -> None:
    """Vectoriza una nota: chunking → embeddings → sustitución idempotente en DB.

    Args:
        note_id: ID de la nota padre recién creada (`chunk_index=0`).
        user_id: Propietario de la nota (del JWT).
        book_id: Libro al que pertenece la nota.
        content: Contenido Markdown original de la nota.

    No lanza excepciones: cualquier fallo se registra de forma estructurada y
    la tarea termina sin dejar la base de datos en un estado inconsistente.
    """
    started = time.monotonic()
    note_id_s = str(note_id)
    user_id_s = str(user_id)
    book_id_s = str(book_id)

    logger.info("vectorize_note_started", note_id=note_id_s, book_id=book_id_s)

    # La clave Gemini es requisito del pipeline; sin ella no se escribe nada.
    if not settings.gemini_api_key:
        logger.error(
            "vectorize_note_skipped",
            note_id=note_id_s,
            reason="GEMINI_API_KEY no configurada; nota guardada sin chunks",
        )
        return

    # Inicializar el cliente Google Gemini con la clave de configuración. Sin
    # esta llamada, `google-generativeai` usa la variable `GOOGLE_API_KEY` (no
    # `GEMINI_API_KEY`) y `embed_content` lanza `ValueError`. No se registra la
    # clave ni el contenido.
    genai.configure(api_key=settings.gemini_api_key)

    # 1. Normalización Markdown → texto plano (determinista).
    text = _markdown_to_text(content)

    # 2. Chunking (500 tokens, solapamiento 50) conservando el orden original.
    chunks, token_count = _chunk_text(text)

    # 3. Embeddings en batch (aislados del event loop; reintento único).
    embeddings = await _embed_with_retry(chunks, note_id_s)
    if embeddings is None:
        logger.error(
            "vectorize_note_failed",
            note_id=note_id_s,
            reason="embeddings_no_disponibles",
        )
        return

    # 4. Validar forma de la respuesta antes de modificar la base de datos.
    if len(embeddings) != len(chunks):
        logger.error(
            "vectorize_note_bad_embedding_count",
            note_id=note_id_s,
            expected_chunks=len(chunks),
            got_vectors=len(embeddings),
        )
        return
    if any(len(vector) != EMBEDDING_DIMENSIONS for vector in embeddings):
        logger.error(
            "vectorize_note_bad_embedding_dim",
            note_id=note_id_s,
            expected_dim=EMBEDDING_DIMENSIONS,
        )
        return

    # 5. Sustitución idempotente en `book_notes` (DELETE → INSERT → UPDATE).
    content_html = render_markdown_to_html(content)
    supabase = get_supabase_client()
    if supabase is None:
        logger.error(
            "vectorize_note_db_unavailable",
            note_id=note_id_s,
            reason="Supabase client no inicializado (¿faltan credenciales?)",
        )
        return
    try:
        _replace_chunks(supabase, note_id_s, user_id_s, book_id_s, chunks, embeddings, content_html)
    except (APIError, httpx.HTTPError) as exc:  # errores de Supabase/DB: alerta sin reintento
        logger.error(
            "vectorize_note_db_error",
            note_id=note_id_s,
            book_id=book_id_s,
            error_type=type(exc).__name__,
            error=str(exc),
        )
        return

    duration_ms = round((time.monotonic() - started) * 1000)
    logger.info(
        "vectorize_note_completed",
        note_id=note_id_s,
        book_id=book_id_s,
        tokens=token_count,
        chunks=len(chunks),
        duration_ms=duration_ms,
    )


# ---------------------------------------------------------------------------
# Normalización y chunking
# ---------------------------------------------------------------------------


def _markdown_to_text(content: str) -> str:
    """Convierte Markdown a texto plano determinista (sin sintaxis ni HTML).

    Se renderiza a HTML con `markdown2` y se despojan las etiquetas; el
    resultado se colapsa a espacios simples para que la sintaxis Markdown no
    domine la representación semántica del embedding.
    """
    html = markdown2.markdown(content, extras=["fenced-code-blocks", "tables", "strike"])
    text = _TAG_RE.sub(" ", html)
    text = _html.unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _chunk_text(text: str) -> tuple[list[str], int]:
    """Divide `text` en chunks con ventana deslizante (500 tokens, overlap 50).

    Returns:
        `(chunks, token_count)` donde `chunks` es la lista de textos planos
        decodificados en el orden original y `token_count` el total de tokens
        de la nota. Notas ≤ 500 tokens → un único chunk.
    """
    encoding = tiktoken.get_encoding(ENCODING_NAME)
    tokens = encoding.encode(text)
    token_count = len(tokens)

    # Defensivo: texto vacío tras normalización → un único chunk vacío.
    if token_count == 0:
        return [""], 0

    if token_count <= CHUNK_SIZE:
        return [encoding.decode(tokens)], token_count

    chunks: list[str] = []
    start = 0
    while start < token_count:
        window = tokens[start : start + CHUNK_SIZE]
        chunks.append(encoding.decode(window))
        if start + CHUNK_SIZE >= token_count:
            break
        start += CHUNK_ADVANCE
    return chunks, token_count


# ---------------------------------------------------------------------------
# Embeddings (Google Gemini)
# ---------------------------------------------------------------------------


async def _embed_with_retry(chunks: list[str], note_id: str) -> list[list[float]] | None:
    """Vectoriza `chunks` en batch con un único reintento ante `GoogleAPIError`.

    Devuelve una lista de vectores (uno por chunk) o `None` si ambos intentos
    fallan. La llamada síncrona de Gemini se aísla del event loop con
    `asyncio.to_thread`.
    """
    for attempt in range(1, MAX_EMBED_ATTEMPTS + 1):
        try:
            return await asyncio.to_thread(_embed_batch, chunks)
        except GoogleAPIError as exc:
            logger.warning(
                "gemini_embed_error",
                note_id=note_id,
                attempt=attempt,
                error_type=type(exc).__name__,
                error=str(exc),
            )
    logger.error(
        "gemini_embed_failed",
        note_id=note_id,
        attempts=MAX_EMBED_ATTEMPTS,
        reason="GoogleAPIError tras reintento único",
    )
    return None


def _embed_batch(chunks: list[str]) -> list[list[float]]:
    """Llamada síncrona a `genai.embed_content` (un batch por nota)."""
    response = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=chunks,
        task_type=EMBEDDING_TASK_TYPE,
    )
    return response["embedding"]


# ---------------------------------------------------------------------------
# Sustitución en `book_notes` (cliente `service_role`)
# ---------------------------------------------------------------------------


def _replace_chunks(
    supabase,
    note_id: str,
    user_id: str,
    book_id: str,
    chunks: list[str],
    embeddings: list[list[float]],
    content_html: str,
) -> None:
    """Sustituye idempotentemente los chunks de una nota en `book_notes`.

    Orden estricto DELETE → INSERT → UPDATE (ver plan.md): borra los chunks
    previos (`chunk_index > 0`) del libro, inserta el batch nuevo con índice
    incremental 1..N y actualiza la fila padre (`chunk_index=0`) con el HTML
    renderizado. Opera con `service_role` (bypass RLS). No reintenta: los
    errores de base de datos se propagan para alertar sin duplicar escrituras.
    """
    # 1. DELETE: elimina chunks previos de la nota (idempotencia).
    supabase.table("book_notes").delete().eq("book_id", book_id).gt("chunk_index", 0).execute()

    # 2. INSERT batch: una fila por chunk con índice incremental y embedding.
    rows = [
        {
            "user_id": user_id,
            "book_id": book_id,
            "content": chunk_text,
            "content_html": "",
            "chunk_index": index,
            "embedding": embedding,
        }
        for index, (chunk_text, embedding) in enumerate(zip(chunks, embeddings), start=1)
    ]
    supabase.table("book_notes").insert(rows).execute()

    # 3. UPDATE: refresca el HTML renderizado en la fila padre (chunk_index=0).
    supabase.table("book_notes").update({"content_html": content_html}).eq("id", note_id).execute()
