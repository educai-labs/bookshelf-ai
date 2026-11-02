"""Servicio de recomendaciones IA (feature 018).

Genera recomendaciones personalizadas a partir del historial de lectura del
usuario (libros en `read`/`reading` y sus notas `chunk_index=0`), en **dos
consultas Supabase como máximo** y filtrando siempre por el `user_id` derivado
del JWT (nunca del cliente).

Flujo (ver `get_recommendations`):

1. Caché TTL en memoria (24 h) por `user_id` — un hit no consulta ni Supabase
   ni Gemini.
2. Carga libros útiles (`status IN ('read','reading')`) — consulta 1.
3. Carga las notas raíz (`chunk_index=0`) de esos libros — consulta 2.
4. Extrae títulos, autores, ratings y temas/keywords (heurística ligera de
   frecuencia de palabras sobre las notas).
5. Construye un prompt determinista con ejemplos few-shot de JSON y exige
   responder únicamente JSON.
6. Llama al modelo de chat configurable (`settings.gemini_chat_model`) con
   `response_mime_type=application/json` y el `response_schema` de
   `RecommendationResponse`; la llamada síncrona se ejecuta fuera del event
   loop (`asyncio.to_thread`).
7. Parsea y valida la respuesta con `RecommendationResponse` y recorta al
   `limit` solicitado. Ante historial insuficiente, JSON inválido o respuesta
   que no cumple el modelo, devuelve `RecommendationResponse(recommendations=[])`
   con log estructurado (sin secretos).

Los errores de Supabase (`postgrest.exceptions.APIError`) **se propagan** para
que el endpoint los mapee con `map_supabase_error`; los errores de Gemini se
convierten en fallback vacío (la recomendación on-demand nunca debe tumbar el
endpoint).
"""

import asyncio
import json
import re
import threading
import time
from collections import defaultdict
from typing import Any

import google.generativeai as genai
from supabase import Client

from app.core.config import settings
from app.core.logging import get_logger
from app.models.recommendations import RecommendationItem, RecommendationResponse

logger = get_logger(__name__)

# --- Parámetros fijos (límites duros de `tech-stack.md`) --------------------
USEFUL_STATUSES: tuple[str, ...] = ("read", "reading")
CACHE_TTL_SECONDS = 24 * 60 * 60  # 24 horas
CACHE_MAX_ENTRIES = 512

# Umbral mínimo de historial útil: al menos un libro en `read`/`reading`.
MIN_HISTORY_BOOKS = 1

# Nº máximo de temas/keywords extraídos por libro para el prompt.
MAX_KEYWORDS_PER_BOOK = 6

# Palabras vacías para la heurística de temas (es/en, minúsculas). Solo filtra
# conectores y palabras frecuentes; el resto del vocabulario de las notas cuenta.
_STOPWORDS = frozenset(
    {
        "para",
        "como",
        "pero",
        "este",
        "esta",
        "con",
        "del",
        "los",
        "las",
        "una",
        "por",
        "que",
        "the",
        "and",
        "with",
        "this",
        "that",
        "from",
        "have",
        "was",
        "are",
        "for",
        "not",
        "but",
        "you",
        "they",
        "their",
        "about",
        "into",
        "has",
        "been",
    }
)

# Ejemplo few-shot de la salida JSON esperada (insertado verbatim en el prompt).
FEW_SHOT_EXAMPLE = (
    '{"recommendations": ['
    '{"title": "El nombre del viento", "authors": ["Patrick Rothfuss"], '
    '"reason": "Por su narrativa pausada y su mundo rico, afín a tus lecturas de fantasía.", '
    '"confidence": 0.87}'
    "]}"
)

RECOMMENDATION_PROMPT_TEMPLATE = (
    "Eres un recomendador de libros. Basado en la biblioteca del usuario, "
    "sugiere {limit} libros que podrían gustarle. Para cada uno indica: título, "
    "autores (lista), razón (1-2 frases) y confidence (un número entre 0 y 1).\n\n"
    "Biblioteca del usuario:\n{history}\n\n"
    "Responde SOLO con un JSON válido, sin texto adicional, con esta estructura:\n"
    "{few_shot}"
)


# ---------------------------------------------------------------------------
# Caché TTL en memoria (acotada, sin persistencia en PostgreSQL)
# ---------------------------------------------------------------------------


class _TTLCache:
    """Caché TTL acotada en memoria, indexada por clave (`user_id`).

    Thread-safe (el singleton se comparte entre requests async). Evicta entradas
    caducadas de forma perezosa (en lectura) y, si se supera el tamaño máximo,
    descarta la entrada más antigua (orden de inserción).
    """

    def __init__(self, ttl_seconds: float, max_entries: int) -> None:
        self._ttl = ttl_seconds
        self._max = max_entries
        self._entries: dict[str, tuple[float, list[RecommendationItem]]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> list[RecommendationItem] | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            expires_at, value = entry
            if time.monotonic() < expires_at:
                return value
            del self._entries[key]
            return None

    def set(self, key: str, value: list[RecommendationItem]) -> None:
        with self._lock:
            self._evict_expired_locked()
            self._entries[key] = (time.monotonic() + self._ttl, value)
            if len(self._entries) > self._max:
                oldest = next(iter(self._entries))
                del self._entries[oldest]

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()

    def _evict_expired_locked(self) -> None:
        now = time.monotonic()
        for key in [k for k, (exp, _) in self._entries.items() if now >= exp]:
            del self._entries[key]


# Singleton del proceso (scale-to-zero no requiere coordinación entre réplicas;
# cada instancia sirve su propia caché de 24 h — decisión del plan).
_cache = _TTLCache(CACHE_TTL_SECONDS, CACHE_MAX_ENTRIES)


def clear_cache() -> None:
    """Vacía la caché (utilidad para tests y operación)."""
    _cache.clear()


# ---------------------------------------------------------------------------
# Carga de contexto (dos consultas Supabase)
# ---------------------------------------------------------------------------


def load_user_books(supabase: Client, user_id: str) -> list[dict]:
    """Libros del usuario en estados `read`/`reading` (consulta 1).

    Selecciona solo lo necesario para el prompt (`id, title, authors, rating`)
    y filtra por `user_id` (aislamiento por usuario) y `status IN (...)`.
    """
    resp = (
        supabase.table("books")
        .select("id, title, authors, rating")
        .eq("user_id", user_id)
        .in_("status", list(USEFUL_STATUSES))
        .execute()
    )
    return list(resp.data or [])


def load_root_notes(supabase: Client, user_id: str, book_ids: list[str]) -> list[dict]:
    """Notas raíz (`chunk_index=0`) de los libros dados (consulta 2).

    Sin `book_ids` no se consulta (evita una query vacía/innecesaria). La nota
    `chunk_index=0` es la nota completa (ver `tech-stack.md` §book_notes), de
    modo que una sola fila por libro aporta su contenido íntegro para extraer
    temas.
    """
    if not book_ids:
        return []
    resp = (
        supabase.table("book_notes")
        .select("book_id, content")
        .eq("user_id", user_id)
        .in_("book_id", book_ids)
        .eq("chunk_index", 0)
        .execute()
    )
    return list(resp.data or [])


# ---------------------------------------------------------------------------
# Extracción de historial (heurística ligera)
# ---------------------------------------------------------------------------


def extract_keywords(texts: list[str], limit: int = MAX_KEYWORDS_PER_BOOK) -> list[str]:
    """Top palabras frecuentes de las notas (heurística ligera de temas).

    Tokeniza con regex (soporta acentos/ñ), descarta palabras cortas (<4) y
    stopwords, y ordena por frecuencia descendente y alfabético para ser
    determinista.
    """
    freq: dict[str, int] = defaultdict(int)
    for text in texts:
        content = text or ""
        for token in re.findall(r"[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]+", content.lower()):
            if len(token) < 4 or token in _STOPWORDS:
                continue
            freq[token] += 1
    ordered = sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
    return [word for word, _ in ordered[:limit]]


def build_history(books: list[dict], notes: list[dict]) -> list[dict]:
    """Combina libros y notas en entradas de historial listas para el prompt.

    Cada entrada: `title`, `authors`, `rating` y `themes` (keywords de las notas
    de ese libro). Los libros sin notas conservan `themes=[]` (siguen siendo
    historial útil por título/autores/rating).
    """
    notes_by_book: dict[str, list[str]] = defaultdict(list)
    for note in notes:
        book_id = note.get("book_id")
        content = note.get("content")
        if book_id and content:
            notes_by_book[str(book_id)].append(content)

    history: list[dict] = []
    for book in books:
        book_id = str(book.get("id"))
        themes = extract_keywords(notes_by_book.get(book_id, []))
        history.append(
            {
                "title": (book.get("title") or "").strip(),
                "authors": list(book.get("authors") or []),
                "rating": book.get("rating"),
                "themes": themes,
            }
        )
    return history


def _serialize_history(history: list[dict]) -> str:
    """Serializa el historial a líneas legibles para el prompt (determinista)."""
    lines: list[str] = []
    for entry in history:
        authors = ", ".join(entry["authors"]) or "Autor desconocido"
        rating = entry["rating"] if entry["rating"] is not None else "sin valoración"
        themes = ", ".join(entry["themes"]) if entry["themes"] else "sin temas"
        lines.append(f"- '{entry['title']}' de {authors} (valoración: {rating}; temas: {themes})")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------


def build_prompt(history: list[dict], limit: int = 5) -> str:
    """Prompt determinista con los datos del usuario y ejemplo few-shot de JSON.

    Incluye la biblioteca serializada y exige una única respuesta JSON con la
    estructura del ejemplo. Sin historial devuelve un prompt vacío (el servicio
    decide el fallback antes de llegar aquí).
    """
    return RECOMMENDATION_PROMPT_TEMPLATE.format(
        limit=limit,
        history=_serialize_history(history),
        few_shot=FEW_SHOT_EXAMPLE,
    )


# ---------------------------------------------------------------------------
# Generación con Gemini (structured output + JSON mode)
# ---------------------------------------------------------------------------


def _ensure_genai_configured() -> None:
    """Configura el cliente Gemini con la clave de `settings` (idempotente).

    Mismo motivo que `chat.py`/`vectorization.py`: `google-generativeai` usa
    `GOOGLE_API_KEY` por defecto, así que este `configure` explícito garantiza
    que se use `GEMINI_API_KEY`. No registra la clave.
    """
    genai.configure(api_key=settings.gemini_api_key)


def _generation_config() -> Any:
    """`GenerationConfig` de Gemini: JSON mode + `response_schema` del contrato."""
    return genai.types.GenerationConfig(
        response_mime_type="application/json",
        response_schema=RecommendationResponse.gemini_response_schema(),
    )


def _generate_raw(prompt: str) -> str:
    """Llama al modelo de chat configurable (síncrono) y devuelve el JSON crudo.

    Se invoca desde `asyncio.to_thread` (nunca directamente en el event loop).
    """
    _ensure_genai_configured()
    model = genai.GenerativeModel(settings.gemini_chat_model)
    response = model.generate_content(prompt, generation_config=_generation_config())
    return response.text or ""


def parse_response(raw: str, limit: int) -> RecommendationResponse:
    """Parsea y valida el JSON de Gemini con `RecommendationResponse`.

    Lanza `json.JSONDecodeError` si el texto no es JSON y
    `pydantic.ValidationError` (subclase de `ValueError`) si no cumple el
    contrato; ambos casos son fallback vacío en el servicio.
    """
    data = json.loads(raw)
    response = RecommendationResponse.model_validate(data)
    response.recommendations = response.recommendations[:limit]
    return response


# ---------------------------------------------------------------------------
# Orquestador
# ---------------------------------------------------------------------------


async def get_recommendations(
    supabase: Client, user_id: str, limit: int = 5
) -> RecommendationResponse:
    """Devuelve recomendaciones para `user_id`, con caché TTL de 24 h.

    - Cache hit → no toca Supabase ni Gemini.
    - Sin libros `read`/`reading` → fallback vacío (historial insuficiente).
    - Errores de Gemini/JSON/validación → fallback vacío con log estructurado.
    - Errores de Supabase (`APIError`) → se propagan al endpoint.
    """
    cached = _cache.get(user_id)
    if cached is not None:
        return RecommendationResponse(recommendations=list(cached[:limit]))

    books = load_user_books(supabase, user_id)
    if len(books) < MIN_HISTORY_BOOKS:
        logger.info("recommendations_insufficient_history", user_id=user_id, books=len(books))
        return RecommendationResponse(recommendations=[])

    book_ids = [str(book["id"]) for book in books]
    notes = load_root_notes(supabase, user_id, book_ids)

    history = build_history(books, notes)
    if not history:
        # Defensivo: no debería ocurrir si `books` no está vacío.
        logger.info("recommendations_empty_history", user_id=user_id)
        return RecommendationResponse(recommendations=[])

    prompt = build_prompt(history, limit)

    try:
        raw = await asyncio.to_thread(_generate_raw, prompt)
        response = parse_response(raw, limit)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.error(
            "recommendations_invalid_response",
            user_id=user_id,
            error_type=type(exc).__name__,
        )
        return RecommendationResponse(recommendations=[])
    except Exception as exc:  # noqa: BLE001 — Gemini/red: fallback vacío + log
        logger.error(
            "recommendations_generation_error",
            user_id=user_id,
            error_type=type(exc).__name__,
        )
        return RecommendationResponse(recommendations=[])

    _cache.set(user_id, response.recommendations)
    return response
