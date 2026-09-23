"""Tests de integración del endpoint `POST /api/v1/ai/chat` (feature 017).

Usa `TestClient` con `dependency_overrides` sobre `get_current_user` y
`get_supabase`, y mocks de las funciones de `app.services.chat` (Gemini,
embedding, RPC) para probar el contrato SSE sin red real:

- auth (401 sin token).
- defaults de modo y exigencia de `book_id` (422).
- ownership del libro (404).
- credenciales Gemini ausentes (500 estructurado).
- chunks SSE + evento final `done`.
- separación entre modo `book` y `rag` (RPC y prompt).
- errores de Gemini/Supabase como evento SSE `error`.
- timeout de 60s → evento `error`.

Formato SSE verificado: `data: {"chunk": "...", "done": false}\n\n` y
`data: {"chunk": "", "done": true}\n\n` / `data: {"error": ..., "done": true}\n\n`.
"""

import asyncio
import json

import google.generativeai as genai
import pytest
from fastapi.testclient import TestClient
from google.api_core.exceptions import GoogleAPIError
from postgrest.exceptions import APIError

from app.api.v1.endpoints import ai as ai_module
from app.core.config import settings
from app.core.database import get_supabase
from app.core.security import get_current_user
from app.main import app
from app.services import chat as chat_service

USER_ID = "00000000-0000-0000-0000-000000000001"
BOOK_ID = "00000000-0000-0000-0000-00000000bbbb"
DIM = 768


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def client(monkeypatch):
    """TestClient con overrides de auth/supabase y settings de Gemini."""
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    app.dependency_overrides[get_supabase] = lambda: object()
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    yield TestClient(app)
    app.dependency_overrides.clear()


def _book(monkeypatch, title="El Quijote"):
    monkeypatch.setattr(
        chat_service,
        "load_book",
        lambda supabase, user_id, book_id: {
            "id": BOOK_ID,
            "title": title,
            "authors": ["Cervantes"],
        },
    )
    monkeypatch.setattr(
        chat_service,
        "load_book_notes",
        lambda supabase, user_id, book_id: [
            {"content": "Nota 1", "chunk_index": 0},
            {"content": "Nota 2", "chunk_index": 1},
        ],
    )


def _stream(tokens):
    """Reemplaza `stream_chat_tokens` por un generador async determinista."""

    async def fake_stream(prompt):
        for token in tokens:
            yield token

    return fake_stream


def _parse_sse(body: str) -> list[dict]:
    """Convierte el cuerpo SSE (`data: {...}\n\n`) en una lista de payloads JSON."""
    events = []
    for block in body.strip().split("\n\n"):
        if block.startswith("data: "):
            events.append(json.loads(block[len("data: ") :]))
    return events


class FakeRpcResponse:
    """Respuesta de un RPC falso (`resp.data`)."""

    def __init__(self, data):
        self.data = data


class _RpcQuery:
    """Query RPC falso que devuelve `resp.data` al ejecutar."""

    def __init__(self, data):
        self._data = data

    def execute(self):
        return FakeRpcResponse(self._data)


class FakeRpcSupabase:
    """Cliente Supabase falso que solo implementa `.rpc()` (modo rag real)."""

    def __init__(self, results=None):
        self.results = results or []
        self.calls = []

    def rpc(self, name, params):
        self.calls.append((name, params))
        return _RpcQuery(self.results)


# ---------------------------------------------------------------------------
# Auth y validaciones antes del stream
# ---------------------------------------------------------------------------


def test_chat_requiere_auth(client, monkeypatch):
    app.dependency_overrides.pop(get_current_user, None)

    resp = client.post("/api/v1/ai/chat", json={"query": "hola"})

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"


def test_chat_mode_book_sin_book_id_422(client, monkeypatch):
    resp = client.post("/api/v1/ai/chat", json={"query": "hola", "mode": "book"})

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"
    assert resp.json()["detail"]["field"] == "book_id"


def test_chat_mode_book_libro_ajeno_404(client, monkeypatch):
    monkeypatch.setattr(chat_service, "load_book", lambda supabase, user_id, book_id: None)

    resp = client.post(
        "/api/v1/ai/chat", json={"query": "hola", "book_id": BOOK_ID, "mode": "book"}
    )

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "BOOK_NOT_FOUND"


def test_chat_sin_gemini_key_503(client, monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "")

    resp = client.post("/api/v1/ai/chat", json={"query": "hola"})

    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "GEMINI_KEY_MISSING"


# ---------------------------------------------------------------------------
# Streaming SSE (modo book)
# ---------------------------------------------------------------------------


def test_chat_mode_book_streams_chunks_y_evento_final(client, monkeypatch):
    _book(monkeypatch)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["Hola", " mundo"]))

    resp = client.post(
        "/api/v1/ai/chat", json={"query": "resumen", "book_id": BOOK_ID, "mode": "book"}
    )

    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(resp.text)
    assert events[0] == {"chunk": "Hola", "done": False}
    assert events[1] == {"chunk": " mundo", "done": False}
    assert events[-1] == {"chunk": "", "done": True}


def test_chat_mode_book_construye_prompt_con_libro_y_notas(client, monkeypatch):
    _book(monkeypatch)
    captured = {}

    def fake_build(book, notes, language=None):
        captured["book"] = book
        captured["notes"] = notes
        captured["language"] = language
        return "PROMPT-LIBRO"

    monkeypatch.setattr(chat_service, "build_book_prompt", fake_build)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    client.post("/api/v1/ai/chat", json={"query": "resumen", "book_id": BOOK_ID, "mode": "book"})

    assert captured["book"]["title"] == "El Quijote"
    assert [n["chunk_index"] for n in captured["notes"]] == [0, 1]


# ---------------------------------------------------------------------------
# Streaming SSE (modo rag) y defaults
# ---------------------------------------------------------------------------


def test_chat_mode_rag_llama_rpc_y_construye_prompt(client, monkeypatch):
    captured = {}

    def fake_embed(query):
        captured["query"] = query
        return [0.1] * DIM

    def fake_match(supabase, embedding, user_id):
        captured["user_id"] = user_id
        return [{"book_title": "Libro A", "content": "Fragmento"}]

    monkeypatch.setattr(chat_service, "embed_query", fake_embed)
    monkeypatch.setattr(chat_service, "match_notes", fake_match)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["respuesta"]))

    resp = client.post("/api/v1/ai/chat", json={"query": "biblioteca", "mode": "rag"})

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[0] == {"chunk": "respuesta", "done": False}
    assert events[-1] == {"chunk": "", "done": True}
    assert captured["query"] == "biblioteca"
    assert captured["user_id"] == USER_ID


def test_chat_mode_rag_real_configura_genai_antes_de_embed(client, monkeypatch):
    """Flujo RAG real (sin mockear `embed_query`/`match_notes`): `genai.configure`
    se ejecuta ANTES que `genai.embed_content`, con la clave de `settings`.

    Regresión feature 017: sin `configure` previo, google-generativeai usa
    `GOOGLE_API_KEY` y `embed_content` lanza `ValueError`.
    """
    order = []
    fake_db = FakeRpcSupabase(
        results=[{"book_title": "Libro A", "content": "Fragmento", "similarity": 0.9}]
    )
    app.dependency_overrides[get_supabase] = lambda: fake_db

    def spy_configure(api_key=None, **kwargs):
        order.append(("configure", api_key))

    def spy_embed(model=None, content=None, task_type=None, **kwargs):
        order.append(("embed", content))
        return {"embedding": [0.1] * DIM}

    monkeypatch.setattr(genai, "configure", spy_configure)
    monkeypatch.setattr(genai, "embed_content", spy_embed)
    # Solo se sustituye la generación (Gemini síncrono), no el pipeline RAG.
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    resp = client.post("/api/v1/ai/chat", json={"query": "biblioteca", "mode": "rag"})

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[-1] == {"chunk": "", "done": True}

    # El orden configure → embed es la invariante que protege el modo rag.
    ops = [op for op, _ in order]
    assert ops == ["configure", "embed"]
    assert order[0][1] == "test-key"
    # La consulta real llega al embedding y el RPC se invoca con el user_id.
    assert order[1][1] == "biblioteca"
    assert len(fake_db.calls) == 1
    assert fake_db.calls[0][0] == "match_book_notes"
    assert fake_db.calls[0][1]["filter_user_id"] == USER_ID


def test_chat_default_book_cuando_hay_book_id(client, monkeypatch):
    """Sin `mode`: default `book` si hay `book_id` (ownership + prompt libro)."""
    _book(monkeypatch)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    resp = client.post("/api/v1/ai/chat", json={"query": "hola", "book_id": BOOK_ID})

    assert resp.status_code == 200


def test_chat_default_rag_sin_book_id(client, monkeypatch):
    """Sin `mode` y sin `book_id`: default `rag` (no toca libro)."""
    monkeypatch.setattr(chat_service, "embed_query", lambda q: [0.1] * DIM)
    monkeypatch.setattr(chat_service, "match_notes", lambda s, e, u: [])
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    resp = client.post("/api/v1/ai/chat", json={"query": "hola"})

    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Preferencia `use_notes` (feature 022): omitir notas sin romper el aislamiento
# ---------------------------------------------------------------------------


def test_chat_mode_book_use_notes_false_omite_notas(client, monkeypatch):
    """`use_notes=false` → el prompt del libro no incluye notas del usuario."""
    _book(monkeypatch)
    captured = {}

    def fake_build(book, notes, language=None):
        captured["notes"] = notes
        return "PROMPT-LIBRO"

    monkeypatch.setattr(chat_service, "build_book_prompt", fake_build)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    resp = client.post(
        "/api/v1/ai/chat",
        json={"query": "resumen", "book_id": BOOK_ID, "mode": "book", "use_notes": False},
    )

    assert resp.status_code == 200
    assert captured["notes"] == []


def test_chat_mode_rag_use_notes_false_omite_embedding_y_rpc(client, monkeypatch):
    """`use_notes=false` → no embebe la consulta ni consulta `match_book_notes`."""
    calls = {"embed": 0, "match": 0}

    def fake_embed(query):
        calls["embed"] += 1
        return [0.1] * DIM

    def fake_match(supabase, embedding, user_id):
        calls["match"] += 1
        return []

    monkeypatch.setattr(chat_service, "embed_query", fake_embed)
    monkeypatch.setattr(chat_service, "match_notes", fake_match)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    resp = client.post(
        "/api/v1/ai/chat", json={"query": "biblioteca", "mode": "rag", "use_notes": False}
    )

    assert resp.status_code == 200
    assert calls["embed"] == 0
    assert calls["match"] == 0


def test_chat_use_notes_default_verdadero_incluye_notas(client, monkeypatch):
    """Sin `use_notes` (default `True`): el modo book sigue incluyendo notas."""
    _book(monkeypatch)
    captured = {}

    def fake_build(book, notes, language=None):
        captured["notes"] = notes
        return "PROMPT-LIBRO"

    monkeypatch.setattr(chat_service, "build_book_prompt", fake_build)
    monkeypatch.setattr(chat_service, "stream_chat_tokens", _stream(["ok"]))

    client.post("/api/v1/ai/chat", json={"query": "resumen", "book_id": BOOK_ID, "mode": "book"})

    assert [n["chunk_index"] for n in captured["notes"]] == [0, 1]


# ---------------------------------------------------------------------------
# Errores durante el stream (evento SSE error)
# ---------------------------------------------------------------------------


def test_chat_error_gemini_emite_evento_error_sin_secretos(client, monkeypatch):
    _book(monkeypatch)

    async def fail_stream(prompt):
        raise GoogleAPIError("API key inválida: sk-1234-secreto")
        yield "nunca"  # pragma: no cover

    monkeypatch.setattr(chat_service, "stream_chat_tokens", fail_stream)

    resp = client.post(
        "/api/v1/ai/chat", json={"query": "hola", "book_id": BOOK_ID, "mode": "book"}
    )

    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert len(events) == 1
    assert events[0]["done"] is True
    assert "error" in events[0]
    # El secreto de la API no debe filtrarse en el mensaje de error.
    assert "sk-1234-secreto" not in events[0]["error"]


def test_chat_error_supabase_emite_evento_error(client, monkeypatch):
    _book(monkeypatch)

    async def fail_stream(prompt):
        raise APIError({"code": "DB_ERROR", "message": "boom", "details": ""})
        yield "nunca"  # pragma: no cover

    monkeypatch.setattr(chat_service, "stream_chat_tokens", fail_stream)

    resp = client.post(
        "/api/v1/ai/chat", json={"query": "hola", "book_id": BOOK_ID, "mode": "book"}
    )

    events = _parse_sse(resp.text)
    assert events[0]["done"] is True
    assert "error" in events[0]


def test_chat_timeout_emite_evento_error(client, monkeypatch):
    _book(monkeypatch)
    monkeypatch.setattr(ai_module, "STREAM_TIMEOUT_SECONDS", 0.01)

    async def slow_stream(prompt):
        await asyncio.sleep(10)
        yield "tarde"  # pragma: no cover — nunca se alcanza

    monkeypatch.setattr(chat_service, "stream_chat_tokens", slow_stream)

    resp = client.post(
        "/api/v1/ai/chat", json={"query": "hola", "book_id": BOOK_ID, "mode": "book"}
    )

    events = _parse_sse(resp.text)
    assert len(events) == 1
    assert events[0]["done"] is True
    assert "60 segundos" in events[0]["error"]


def test_chat_query_vacia_422(client):
    resp = client.post("/api/v1/ai/chat", json={"query": ""})

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"
