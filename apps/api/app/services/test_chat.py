"""Tests unitarios del servicio de chat (feature 017).

Cubren (spec/plan 017):
- Construcción de prompt de contexto libro (título, autores, notas completas).
- Construcción de prompt RAG (contenido + título por fragmento).
- Ownership del libro (`load_book` → `None` si es ajeno/inexistente).
- Orden y filtro de notas (`chunk_index >= 0`, orden ascendente).
- Embedding de consulta (`text-embedding-004`, `RETRIEVAL_QUERY`).
- Argumentos del RPC `match_book_notes` (user_id, threshold 0.7, count 10).
- Streaming de tokens de `gemini-2.0-flash` y propagación de errores.

Mocks: `genai.GenerativeModel`, `genai.embed_content`, `genai.configure` y un
cliente Supabase falso con estado en memoria.
"""

import asyncio
from unittest.mock import MagicMock
from uuid import UUID

import google.generativeai as genai
import pytest
from postgrest.exceptions import APIError

from app.core.config import settings
from app.services import chat as c

USER_ID = "00000000-0000-0000-0000-000000000001"
BOOK_ID = UUID("00000000-0000-0000-0000-00000000bbbb")
DIM = 768


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, data=None):
        self.data = data or []


class FakeQuery:
    """Query builder falso que registra filtros y ejecuta contra el fake DB."""

    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._filters = []
        self._order = None
        self._single = False

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def gte(self, column, value):
        self._filters.append(("gte", column, value))
        return self

    def order(self, column):
        self._order = column
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        return self._db._execute(self)


class FakeSupabase:
    """Cliente Supabase falso con estado (para ownership, notas y RPC)."""

    def __init__(self, books=None, notes=None, rpc_results=None, fail_single=False):
        self.books = books or []
        self.notes = notes or []
        self.rpc_results = rpc_results or []
        self.rpc_calls = []
        self.fail_single = fail_single

    def table(self, name):
        return FakeQuery(self, name)

    def rpc(self, name, params):
        self.rpc_calls.append((name, params))
        return _RpcQuery(self, self.rpc_results)

    def _execute(self, q):
        if q._table == "books":
            rows = [r for r in self.books if self._matches(r, q._filters)]
            if q._single:
                if self.fail_single:
                    raise APIError({"code": "PGRST116", "message": "", "details": ""})
                return FakeResponse(data=rows[0] if rows else None)
            return FakeResponse(data=rows)
        if q._table == "book_notes":
            rows = [r for r in self.notes if self._matches(r, q._filters)]
            if q._order == "chunk_index":
                rows = sorted(rows, key=lambda r: r["chunk_index"])
            return FakeResponse(data=rows)
        return FakeResponse(data=[])

    @staticmethod
    def _matches(row, filters):
        for op, column, value in filters:
            if op == "eq" and row.get(column) != value:
                return False
            if op == "gte" and not (row.get(column) >= value):
                return False
        return True


class _RpcQuery:
    def __init__(self, db, results):
        self._db = db
        self._results = results

    def execute(self):
        return FakeResponse(data=self._results)


# ---------------------------------------------------------------------------
# Construcción de prompts
# ---------------------------------------------------------------------------


def test_build_book_prompt_incluye_titulo_autores_y_notas_completas():
    book = {"title": "El Quijote", "authors": ["Cervantes", "Anónimo"]}
    notes = [
        {"content": "Nota 1", "chunk_index": 0},
        {"content": "Nota 2", "chunk_index": 1},
    ]

    prompt = c.build_book_prompt(book, notes)

    assert "El Quijote" in prompt
    assert "Cervantes, Anónimo" in prompt
    assert "Nota 1" in prompt
    assert "Nota 2" in prompt
    assert "Notas del usuario" in prompt


def test_build_book_prompt_con_autor_desconocido():
    book = {"title": "Sin datos", "authors": []}
    prompt = c.build_book_prompt(book, [])
    assert "Autor desconocido" in prompt


def test_build_rag_prompt_incluye_contenido_y_titulo():
    results = [
        {"book_title": "Libro A", "content": "Fragmento 1"},
        {"book_title": "Libro B", "content": "Fragmento 2"},
    ]

    prompt = c.build_rag_prompt(results)

    assert "Libro 'Libro A': Fragmento 1" in prompt
    assert "Libro 'Libro B': Fragmento 2" in prompt
    assert "Si no hay info relevante, dilo." in prompt


def test_build_rag_prompt_sin_resultados():
    prompt = c.build_rag_prompt([])
    assert "fragmentos de tu biblioteca" in prompt


# ---------------------------------------------------------------------------
# Ownership y carga de notas
# ---------------------------------------------------------------------------


def test_load_book_devuelve_libro_del_usuario():
    db = FakeSupabase(books=[{"id": str(BOOK_ID), "title": "T", "authors": [], "user_id": USER_ID}])

    book = c.load_book(db, USER_ID, BOOK_ID)

    assert book is not None
    assert book["title"] == "T"


def test_load_book_ajeno_devuelve_none():
    db = FakeSupabase(
        books=[{"id": str(BOOK_ID), "title": "T", "authors": [], "user_id": "otro"}],
        fail_single=True,
    )

    assert c.load_book(db, USER_ID, BOOK_ID) is None


def test_load_book_notes_ordena_por_chunk_index_y_filtra_user():
    db = FakeSupabase(
        notes=[
            {"book_id": str(BOOK_ID), "user_id": USER_ID, "content": "c1", "chunk_index": 2},
            {"book_id": str(BOOK_ID), "user_id": USER_ID, "content": "c0", "chunk_index": 0},
            {"book_id": str(BOOK_ID), "user_id": USER_ID, "content": "c1b", "chunk_index": 1},
            {"book_id": str(BOOK_ID), "user_id": "otro", "content": "AJENO", "chunk_index": 0},
        ]
    )

    notes = c.load_book_notes(db, USER_ID, BOOK_ID)

    assert [n["chunk_index"] for n in notes] == [0, 1, 2]
    assert all(n["user_id"] == USER_ID for n in notes)
    assert "AJENO" not in [n["content"] for n in notes]


# ---------------------------------------------------------------------------
# Embedding y RPC
# ---------------------------------------------------------------------------


def test_embed_query_usa_modelo_y_task_type_correctos(monkeypatch):
    captured = {}
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    monkeypatch.setattr(genai, "configure", lambda **kwargs: None)

    def fake_embed(model=None, content=None, task_type=None, **kwargs):
        captured["model"] = model
        captured["task_type"] = task_type
        captured["content"] = content
        return {"embedding": [0.1] * DIM}

    monkeypatch.setattr(genai, "embed_content", fake_embed)

    vector = c.embed_query("¿de qué trata?")

    assert captured["model"] == c.EMBEDDING_MODEL
    assert captured["task_type"] == c.EMBEDDING_TASK_TYPE
    assert captured["content"] == "¿de qué trata?"
    assert len(vector) == DIM


def test_embed_query_configura_genai_antes_de_embed(monkeypatch):
    """`embed_query` llama a `genai.configure` ANTES que a `genai.embed_content`.

    Regresión feature 017: sin `configure`, google-generativeai usa `GOOGLE_API_KEY`
    (no `GEMINI_API_KEY`) y `embed_content` lanza `ValueError`.
    """
    order = []
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    def spy_configure(api_key=None, **kwargs):
        order.append(("configure", api_key))

    def spy_embed(model=None, content=None, task_type=None, **kwargs):
        order.append(("embed", content))
        return {"embedding": [0.1] * DIM}

    monkeypatch.setattr(genai, "configure", spy_configure)
    monkeypatch.setattr(genai, "embed_content", spy_embed)

    c.embed_query("consulta")

    assert [op for op, _ in order] == ["configure", "embed"]
    assert order[0][1] == "test-key"


def test_match_notes_pasa_user_id_threshold_y_count():
    db = FakeSupabase(rpc_results=[{"book_title": "T", "content": "c", "similarity": 0.9}])
    embedding = [0.1] * DIM

    results = c.match_notes(db, embedding, USER_ID)

    assert len(db.rpc_calls) == 1
    name, params = db.rpc_calls[0]
    assert name == "match_book_notes"
    assert params["query_embedding"] == embedding
    assert params["filter_user_id"] == USER_ID
    assert params["match_threshold"] == 0.7
    assert params["match_count"] == 10
    assert results[0]["book_title"] == "T"


# ---------------------------------------------------------------------------
# Streaming de tokens
# ---------------------------------------------------------------------------


class _FakeChunk:
    def __init__(self, text):
        self._text = text

    @property
    def text(self):
        return self._text


def _install_generate_content_mock(monkeypatch, generate_content):
    """Instala mocks de `genai.configure`/`genai.GenerativeModel` (module-level)."""
    model = MagicMock()
    model.generate_content = MagicMock(side_effect=generate_content)
    monkeypatch.setattr(genai, "configure", lambda **kwargs: None)
    monkeypatch.setattr(genai, "GenerativeModel", lambda name: model)
    return model


def test_stream_chat_tokens_yield_tokens_progresivos(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")
    captured = {}

    def fake_generate_content(prompt, stream=False):
        captured["prompt"] = prompt
        assert stream is True
        return iter([_FakeChunk("Hola"), _FakeChunk(" "), _FakeChunk("mundo"), _FakeChunk("")])

    model = _install_generate_content_mock(monkeypatch, fake_generate_content)

    async def collect():
        tokens = []
        async for token in c.stream_chat_tokens("un prompt"):
            tokens.append(token)
        return tokens

    tokens = asyncio.run(collect())

    assert tokens == ["Hola", " ", "mundo"]
    assert captured["prompt"] == "un prompt"
    model.generate_content.assert_called_once_with("un prompt", stream=True)


def test_stream_chat_tokens_propaga_error_del_worker(monkeypatch):
    monkeypatch.setattr(settings, "gemini_api_key", "test-key")

    def boom(prompt, stream=False):
        raise RuntimeError("gemini roto")

    _install_generate_content_mock(monkeypatch, boom)

    async def collect():
        async for _token in c.stream_chat_tokens("prompt"):
            pass

    with pytest.raises(RuntimeError, match="gemini roto"):
        asyncio.run(collect())


def test_chunk_sin_partes_devuelve_texto_vacio():
    assert c._chunk_text(_FakeChunk("")) == ""
