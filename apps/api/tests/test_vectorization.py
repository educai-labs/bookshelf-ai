"""Tests del pipeline de vectorización de notas (feature 016).

Cubre (spec 016):
- Chunking con `tiktoken` `cl100k_base` (conteo, solapamiento 500/50, nota corta).
- Conversión determinista de Markdown a texto plano.
- Embeddings batch de `genai.embed_content` (shape 768, parámetros correctos).
- Sustitución idempotente en `book_notes` (orden DELETE → INSERT → UPDATE).
- Reintento único ante `GoogleAPIError` y fallo sin escritura tras dos errores.
- Error de base de datos sin reintento automático.

Mocks: `genai.embed_content`, `get_supabase_client` y `time.monotonic` (reloj).
"""

import uuid
from uuid import UUID

import pytest
import tiktoken
from google.api_core.exceptions import GoogleAPIError
from postgrest.exceptions import APIError

from app.core.config import settings
from app.services import vectorization as v
from app.services.vectorization import _chunk_text, _markdown_to_text

NOTE_ID = UUID("00000000-0000-0000-0000-00000000aaaa")
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
BOOK_ID = UUID("00000000-0000-0000-0000-00000000bbbb")

DIM = 768


# ---------------------------------------------------------------------------
# Fake de Supabase (estado en memoria) con soporte delete/insert/update + filtros
# ---------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, data=None):
        self.data = data or []
        self.count = None


class FakeQuery:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._op = None
        self._payload = None
        self._filters = []

    def delete(self):
        self._op = "delete"
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def gt(self, column, value):
        self._filters.append(("gt", column, value))
        return self

    def execute(self):
        return self._db._execute(self)


class FakeSupabase:
    """Cliente Supabase falso con estado (para probar idempotencia y orden)."""

    def __init__(self, fail_on=None):
        self.rows: list[dict] = []
        self.ops: list[dict] = []
        self.fail_on = fail_on  # nombre de op que debe lanzar APIError

    def table(self, name):
        return FakeQuery(self, name)

    def _matches(self, row, filters):
        for op, column, value in filters:
            if op == "eq" and row.get(column) != value:
                return False
            if op == "gt" and not (row.get(column) > value):
                return False
        return True

    def _execute(self, q):
        self.ops.append(
            {
                "table": q._table,
                "op": q._op,
                "payload": q._payload,
                "filters": list(q._filters),
            }
        )
        if self.fail_on == q._op:
            raise APIError({"code": "DB_ERROR", "message": "mock db failure", "details": ""})

        if q._op == "delete":
            self.rows = [r for r in self.rows if not self._matches(r, q._filters)]
        elif q._op == "insert":
            for item in q._payload:
                row = dict(item)
                row.setdefault("id", str(uuid.uuid4()))
                self.rows.append(row)
        elif q._op == "update":
            for r in self.rows:
                if self._matches(r, q._filters):
                    r.update(q._payload)
        return FakeResponse(data=[])


def _seed_parent(db, note_id, book_id, content_html="<p>old</p>"):
    db.rows.append(
        {
            "id": str(note_id),
            "user_id": str(USER_ID),
            "book_id": str(book_id),
            "content": "nota",
            "content_html": content_html,
            "chunk_index": 0,
            "embedding": [0.0] * DIM,
        }
    )


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_db():
    return FakeSupabase()


@pytest.fixture
def configure(monkeypatch, fake_db):
    """Configura settings + mocks de `genai.embed_content` y cliente Supabase."""

    def _setup(embed_fn=None, fail_on=None):
        monkeypatch.setattr(settings, "gemini_api_key", "test-key")
        monkeypatch.setattr("app.services.vectorization.get_supabase_client", lambda: fake_db)
        if fail_on:
            fake_db.fail_on = fail_on
        if embed_fn is not None:
            import google.generativeai as genai

            monkeypatch.setattr(genai, "embed_content", embed_fn)
        return fake_db

    return _setup


def _fake_embed(model=None, content=None, task_type=None, **kwargs):
    """Devuelve un vector de 768 floats por chunk (shape válida)."""
    return {"embedding": [[0.1] * DIM for _ in content]}


def _long_text():
    return "palabra " * 2000


# ---------------------------------------------------------------------------
# Chunking y normalización (unidad)
# ---------------------------------------------------------------------------


def test_markdown_to_text_strips_syntax():
    text = _markdown_to_text("# Título\n\n**negrita** y [link](https://x.com)")
    assert text == "Título negrita y link"


def test_chunking_short_note_single_chunk():
    chunks, token_count = _chunk_text("una nota corta")
    assert token_count > 0
    assert chunks == ["una nota corta"]


def test_chunking_overlap_and_count():
    enc = tiktoken.get_encoding(v.ENCODING_NAME)
    source_tokens = enc.encode(_long_text())
    assert len(source_tokens) > v.CHUNK_SIZE

    chunks, token_count = _chunk_text(_long_text())
    assert token_count == len(source_tokens)
    assert len(chunks) > 1

    chunk_tokens = [enc.encode(c) for c in chunks]
    # Cada chunk completo (salvo el último) tiene exactamente 500 tokens.
    assert all(len(ct) == v.CHUNK_SIZE for ct in chunk_tokens[:-1])
    assert len(chunk_tokens[-1]) <= v.CHUNK_SIZE
    # Solapamiento de 50 tokens entre chunks consecutivos.
    for i in range(len(chunk_tokens) - 1):
        assert chunk_tokens[i][v.CHUNK_ADVANCE :] == chunk_tokens[i + 1][: v.CHUNK_OVERLAP]
    # Orden original conservado.
    assert chunk_tokens[0] == source_tokens[: v.CHUNK_SIZE]
    assert chunk_tokens[-1][-1] == source_tokens[-1]


# ---------------------------------------------------------------------------
# Pipeline completo (mocks)
# ---------------------------------------------------------------------------


async def test_vectorize_note_writes_chunks_and_updates_parent(configure, fake_db, monkeypatch):
    """Happy path: DELETE → INSERT → UPDATE con 1 chunk; padre actualizado."""
    fake_db = configure(embed_fn=_fake_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "# Título\n\n**negrita**")

    ops = [(op["op"], op["table"]) for op in fake_db.ops]
    assert ops == [
        ("delete", "book_notes"),
        ("insert", "book_notes"),
        ("update", "book_notes"),
    ]

    # DELETE: book_id + chunk_index > 0.
    delete_op = fake_db.ops[0]
    assert ("eq", "book_id", str(BOOK_ID)) in delete_op["filters"]
    assert ("gt", "chunk_index", 0) in delete_op["filters"]

    # INSERT: una fila por chunk con índice incremental, content_html vacío.
    insert_op = fake_db.ops[1]
    assert len(insert_op["payload"]) == 1
    row = insert_op["payload"][0]
    assert row["user_id"] == str(USER_ID)
    assert row["book_id"] == str(BOOK_ID)
    assert row["chunk_index"] == 1
    assert row["content_html"] == ""
    assert len(row["embedding"]) == DIM

    # UPDATE: fila padre (chunk_index=0) con HTML renderizado.
    update_op = fake_db.ops[2]
    assert ("eq", "id", str(NOTE_ID)) in update_op["filters"]
    assert "<strong>negrita</strong>" in update_op["payload"]["content_html"]

    # Estado final: padre + 1 chunk (sin duplicados).
    parent = [r for r in fake_db.rows if r["chunk_index"] == 0]
    chunks = [r for r in fake_db.rows if r["chunk_index"] > 0]
    assert len(parent) == 1
    assert len(chunks) == 1


async def test_embeddings_batch_params_and_shape(configure, fake_db):
    """`embed_content` recibe model/task_type/content correctos; N chunks → N filas."""
    captured = {}

    def fake_embed(model=None, content=None, task_type=None, **kwargs):
        captured["model"] = model
        captured["task_type"] = task_type
        captured["content"] = list(content)
        return {"embedding": [[0.5] * DIM for _ in content]}

    configure(embed_fn=fake_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, _long_text())

    assert captured["model"] == v.EMBEDDING_MODEL
    assert captured["task_type"] == v.EMBEDDING_TASK_TYPE
    assert len(captured["content"]) > 1  # nota larga → múltiples chunks

    insert_op = fake_db.ops[1]
    assert len(insert_op["payload"]) == len(captured["content"])
    assert [r["chunk_index"] for r in insert_op["payload"]] == list(
        range(1, len(captured["content"]) + 1)
    )
    assert all(len(r["embedding"]) == DIM for r in insert_op["payload"])


async def test_replace_is_idempotent(configure, fake_db):
    """Llamar 2x con la misma nota → mismo resultado (DELETE previo evita duplicados)."""
    configure(embed_fn=_fake_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota idempotente")
    chunks_after_first = [r for r in fake_db.rows if r["chunk_index"] > 0]
    assert len(chunks_after_first) == 1

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota idempotente")
    chunks_after_second = [r for r in fake_db.rows if r["chunk_index"] > 0]
    assert len(chunks_after_second) == 1
    assert [r["chunk_index"] for r in chunks_after_second] == [1]


async def test_retry_single_and_failure_without_write(configure, fake_db):
    """`GoogleAPIError` dos veces → reintento único, sin escrituras en DB."""
    calls = {"n": 0}

    def fail_embed(**kwargs):
        calls["n"] += 1
        raise GoogleAPIError("mock google error")

    configure(embed_fn=fail_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota que falla")

    assert calls["n"] == 2  # 1 intento + 1 reintento
    assert fake_db.ops == []  # sin escrituras


async def test_retry_succeeds_on_second_attempt(configure, fake_db):
    """Primer intento falla, el reintento tiene éxito → se escriben chunks."""
    calls = {"n": 0}

    def flaky_embed(model=None, content=None, task_type=None, **kwargs):
        calls["n"] += 1
        if calls["n"] == 1:
            raise GoogleAPIError("transient")
        return {"embedding": [[0.1] * DIM for _ in content]}

    configure(embed_fn=flaky_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota con reintento")

    assert calls["n"] == 2
    assert [op["op"] for op in fake_db.ops] == ["delete", "insert", "update"]


async def test_db_error_no_retry(configure, fake_db):
    """Error de DB (DELETE) → alerta, sin reintento automático ni INSERT/UPDATE."""
    configure(embed_fn=_fake_embed, fail_on="delete")
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    # No debe lanzar: el error se registra y la tarea termina.
    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota con error de db")

    assert [op["op"] for op in fake_db.ops] == ["delete"]  # sin reintento


async def test_embeddings_shape_mismatch_no_write(configure, fake_db):
    """Respuesta con número/dimensión incorrecta → sin tocar la base de datos."""

    def bad_embed(model=None, content=None, task_type=None, **kwargs):
        return {"embedding": [[0.1] * 100 for _ in content]}  # dim incorrecta

    configure(embed_fn=bad_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota con shape inválida")

    assert fake_db.ops == []  # sin DELETE/INSERT/UPDATE


async def test_gemini_configure_called_with_api_key(configure, fake_db, monkeypatch):
    """`genai.configure` se llama con `settings.gemini_api_key` (sin loguear la clave)."""
    import google.generativeai as genai

    captured = {}

    def spy_configure(api_key=None, **kwargs):
        captured["api_key"] = api_key

    monkeypatch.setattr(genai, "configure", spy_configure)
    configure(embed_fn=_fake_embed)
    _seed_parent(fake_db, NOTE_ID, BOOK_ID)

    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota con clave")

    assert captured.get("api_key") == "test-key"


async def test_missing_gemini_key_skips_without_write(configure, fake_db, monkeypatch):
    """Sin `GEMINI_API_KEY` → la tarea termina sin escribir ni llamar a Gemini."""
    import google.generativeai as genai

    called = {"n": 0}

    def spy_embed(**kwargs):
        called["n"] += 1
        return {"embedding": [[0.1] * DIM]}

    monkeypatch.setattr(genai, "embed_content", spy_embed)
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr("app.services.vectorization.get_supabase_client", lambda: fake_db)

    _seed_parent(fake_db, NOTE_ID, BOOK_ID)
    await v.vectorize_note(NOTE_ID, USER_ID, BOOK_ID, "nota sin clave")

    assert called["n"] == 0
    assert fake_db.ops == []
