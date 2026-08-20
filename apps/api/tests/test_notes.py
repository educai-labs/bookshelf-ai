"""Tests de integración de los endpoints CRUD de notas (feature 010).

Mismo patrón que `test_books.py`: `httpx.AsyncClient` con `ASGITransport`,
`dependency_overrides` (auth + Supabase) y un `FakeSupabase` en memoria que
replica PostgREST para `book_notes` (filtros `eq`, `order`, `range`,
`count=exact`, `single()` → PGRST116, insert con defaults).

Criterios cubiertos (spec 010): creación con HTML renderizado/sanitizado,
validación de contenido vacío (422), sanitizado XSS, paginación,
filtro `chunk_index=0` por defecto, ownership (404 entre usuarios) y
vectorización en background (mock de `BackgroundTasks.add_task`).
"""

import json
import uuid
from datetime import UTC, datetime
from typing import ClassVar

import pytest
from postgrest.exceptions import APIError

from app.core.database import get_supabase
from app.core.security import get_current_user
from app.main import app
from app.services.vectorization import vectorize_note

USER_ID = "00000000-0000-0000-0000-000000000001"
OTRO_USER_ID = "99999999-9999-9999-9999-999999999999"


# ---------------------------------------------------------------------------
# FakeSupabase: mini PostgREST en memoria (con `order`, sin libros duplicados)
# ---------------------------------------------------------------------------


class FakeResponse:
    """Equivalente a `postgrest.types.APIResponse` (`data` list + `count`)."""

    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class FakeQueryBuilder:
    """Mini PostgREST en memoria para `book_notes`.

    `select`/`insert` devuelven builder nuevo (como postgrest-py); los filtros
    (`eq`/`range`/`order`/`single`) mutan y devuelven self.
    """

    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._select = "*"
        self._count = False
        self._op = None
        self._payload = None
        self._filters = []
        self._range = None
        self._order = None
        self._single = False

    def _clone(self, *, keep_filters=False) -> "FakeQueryBuilder":
        new = FakeQueryBuilder(self._db, self._table)
        new._select = self._select
        new._count = self._count
        new._op = self._op
        new._payload = self._payload
        if keep_filters:
            new._filters = list(self._filters)
        new._range = self._range
        new._order = self._order
        new._single = self._single
        return new

    def select(self, columns="*", count=None):
        new = self._clone()
        new._select = columns
        new._count = bool(count)
        return new

    def insert(self, payload):
        new = self._clone()
        new._op = "insert"
        new._payload = payload
        return new

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def order(self, column, *, desc=False):
        self._order = (column, desc)
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        return self._db._execute(self)


class FakeSupabase:
    """Cliente Supabase falso con las tablas `books` y `book_notes`.

    Replica el comportamiento de PostgREST relevante para los endpoints de
    notas: filtros `eq`, orden `order`, paginación `range`, `count=exact`,
    `.single()` sin filas → `APIError` PGRST116, e insert con defaults.
    """

    def __init__(self):
        self.books: dict[str, dict] = {}
        self.notes: dict[str, dict] = {}
        self.log: list[tuple[str, str | None, list]] = []

    # Nombre de tabla PostgREST → atributo del store.
    _TABLES: ClassVar[dict[str, str]] = {"books": "books", "book_notes": "notes"}

    def table(self, name):
        return FakeQueryBuilder(self, name)

    def _matches(self, row, filters) -> bool:
        for op, column, value in filters:
            if op == "eq" and row.get(column) != value:
                return False
        return True

    def _execute(self, builder) -> FakeResponse:
        table = getattr(self, self._TABLES[builder._table])
        rows = [dict(r) for r in table.values()]
        rows = [r for r in rows if self._matches(r, builder._filters)]
        self.log.append((builder._table, builder._op, builder._filters))

        if builder._op == "insert":
            # Réplica de httpx: el payload debe ser JSON-serializable.
            json.dumps(builder._payload)
            row = dict(builder._payload)
            row.setdefault("id", str(uuid.uuid4()))
            row.setdefault("created_at", _now())
            table[row["id"]] = row
            rows = [row]

        if builder._order is not None:
            column, desc = builder._order
            rows.sort(key=lambda r: r.get(column) or "", reverse=desc)

        if builder._single:
            if not rows:
                raise APIError(
                    {
                        "code": "PGRST116",
                        "message": "Cannot coerce the result to a single JSON object",
                        "details": "The result contains 0 rows.",
                    }
                )
            if len(rows) > 1:
                raise APIError(
                    {
                        "code": "406",
                        "message": "Cannot coerce the result to a single JSON object",
                        "details": "The result contains more than one row.",
                    }
                )
            return FakeResponse(data=rows[0])

        total = len(rows)
        if builder._range is not None:
            start, end = builder._range
            rows = rows[start : end + 1]
        return FakeResponse(data=rows, count=total if builder._count else None)


def _now() -> str:
    return datetime.now(UTC).isoformat()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_db():
    """Base de datos en memoria aislada por test."""
    return FakeSupabase()


@pytest.fixture
def client(api_client, fake_db):
    """`httpx.AsyncClient` contra la app con overrides de auth + supabase."""
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    app.dependency_overrides[get_supabase] = lambda: fake_db
    yield api_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Helpers de datos
# ---------------------------------------------------------------------------


def _seed_book(fake_db, **overrides) -> dict:
    """Inserta un libro directamente en el store (simula fila de DB)."""
    row = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "isbn13": "9788445001234",
        "title": "La Comunidad del Anillo",
        "authors": ["J. R. R. Tolkien"],
        "cover_url": None,
        "page_count": 423,
        "publisher": None,
        "published_date": "2001-01-01",
        "description": None,
        "status": "want_to_read",
        "rating": None,
        "started_at": None,
        "finished_at": None,
        "created_at": "2026-01-01T10:00:00+00:00",
        "updated_at": "2026-01-01T10:00:00+00:00",
    }
    row.update(overrides)
    fake_db.books[row["id"]] = row
    return row


def _seed_note(fake_db, book_id, **overrides) -> dict:
    """Inserta una nota directamente en el store (simula fila de `book_notes`)."""
    row = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "book_id": book_id,
        "content": "nota de test",
        "content_html": "<p>nota de test</p>",
        "chunk_index": 0,
        "embedding": [0.0] * 768,
        "created_at": "2026-01-01T10:00:00+00:00",
    }
    row.update(overrides)
    fake_db.notes[row["id"]] = row
    return row


# ---------------------------------------------------------------------------
# POST /books/{book_id}/notes
# ---------------------------------------------------------------------------


async def test_create_note_success(client, fake_db):
    """Criterio: crea nota → 201, `content_html` renderizado, `chunk_index=0`."""
    libro = _seed_book(fake_db)

    resp = await client.post(
        f"/api/v1/books/{libro['id']}/notes",
        json={"content": "# Título\n\n**negrita**"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["id"]
    assert body["book_id"] == libro["id"]
    assert body["content"] == "# Título\n\n**negrita**"
    assert "<strong>negrita</strong>" in body["content_html"]
    assert body["chunk_index"] == 0
    assert body["created_at"]

    # Fila persistida con embedding placeholder (vector zeros 768).
    fila = fake_db.notes[body["id"]]
    assert fila["user_id"] == USER_ID
    assert fila["embedding"] == [0.0] * 768


async def test_create_note_empty_content_fails(client, fake_db):
    """Criterio: `content` vacío → 422 `VALIDATION_ERROR` (min_length=1)."""
    libro = _seed_book(fake_db)

    resp = await client.post(f"/api/v1/books/{libro['id']}/notes", json={"content": ""})

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


async def test_create_note_content_muy_largo_422(client, fake_db):
    """`content` > 50000 chars → 422 (max_length=50000)."""
    libro = _seed_book(fake_db)

    resp = await client.post(f"/api/v1/books/{libro['id']}/notes", json={"content": "a" * 50001})

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


async def test_create_note_xss_sanitized(client, fake_db):
    """Criterio: `<script>` en el Markdown no aparece en `content_html`."""
    libro = _seed_book(fake_db)

    resp = await client.post(
        f"/api/v1/books/{libro['id']}/notes",
        json={"content": 'Hola <script>alert("xss")</script> mundo'},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert "<script" not in body["content_html"]
    assert "<script" not in body["content_html"].lower()


async def test_create_note_book_ajeno_404(client, fake_db):
    """Ownership: nota en libro de otro usuario → 404 `BOOK_NOT_FOUND`."""
    libro_ajeno = _seed_book(
        fake_db, id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", user_id=OTRO_USER_ID
    )

    resp = await client.post(
        f"/api/v1/books/{libro_ajeno['id']}/notes",
        json={"content": "intrusión"},
    )

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "BOOK_NOT_FOUND"


async def test_create_note_requiere_auth(client):
    """Criterio: sin token → 401 `NOT_AUTHENTICATED` (endpoints protegidos)."""
    app.dependency_overrides.pop(get_current_user, None)

    resp = await client.post(
        "/api/v1/books/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/notes",
        json={"content": "nota"},
    )

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"


# ---------------------------------------------------------------------------
# GET /books/{book_id}/notes
# ---------------------------------------------------------------------------


async def test_get_notes_pagination(client, fake_db):
    """Criterio: paginación con `.range()` + total correcto."""
    libro = _seed_book(fake_db)
    for i in range(3):
        _seed_note(fake_db, libro["id"], content=f"nota {i}")

    resp = await client.get(f"/api/v1/books/{libro['id']}/notes?page=1&page_size=2")

    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] == 3
    assert len(body["items"]) == 2


async def test_get_notes_segunda_pagina(client, fake_db):
    """Página 2 devuelve las notas restantes (orden `created_at DESC`)."""
    libro = _seed_book(fake_db)
    _seed_note(fake_db, libro["id"], content="A", created_at="2026-01-03T10:00:00+00:00")
    _seed_note(fake_db, libro["id"], content="B", created_at="2026-01-02T10:00:00+00:00")
    _seed_note(fake_db, libro["id"], content="C", created_at="2026-01-01T10:00:00+00:00")

    resp = await client.get(f"/api/v1/books/{libro['id']}/notes?page=2&page_size=2")

    body = resp.json()
    assert body["page"] == 2
    assert body["total"] == 3
    assert len(body["items"]) == 1
    assert body["items"][0]["content"] == "C"  # más antigua en página 2


async def test_get_notes_orden_desc(client, fake_db):
    """Orden por defecto: `created_at DESC` (notas más recientes primero)."""
    libro = _seed_book(fake_db)
    _seed_note(fake_db, libro["id"], content="vieja", created_at="2026-01-01T10:00:00+00:00")
    _seed_note(fake_db, libro["id"], content="nueva", created_at="2026-01-03T10:00:00+00:00")

    resp = await client.get(f"/api/v1/books/{libro['id']}/notes")

    body = resp.json()
    assert [item["content"] for item in body["items"]] == ["nueva", "vieja"]


async def test_get_notes_filters_chunks_by_default(client, fake_db):
    """Criterio: solo `chunk_index=0` salvo `include_chunks=true`."""
    libro = _seed_book(fake_db)
    _seed_note(fake_db, libro["id"], content="nota completa", chunk_index=0)
    _seed_note(fake_db, libro["id"], content="chunk 1", chunk_index=1)
    _seed_note(fake_db, libro["id"], content="chunk 2", chunk_index=2)

    resp = await client.get(f"/api/v1/books/{libro['id']}/notes")
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["content"] == "nota completa"

    resp = await client.get(f"/api/v1/books/{libro['id']}/notes?include_chunks=true")
    body = resp.json()
    assert body["total"] == 3
    assert len(body["items"]) == 3


async def test_get_notes_page_size_limites_422(client, fake_db):
    """Criterio: `page` ≥ 1 y `page_size` 1-50 → fuera de rango 422."""
    libro = _seed_book(fake_db)

    resp = await client.get(f"/api/v1/books/{libro['id']}/notes?page=0")
    assert resp.status_code == 422
    resp = await client.get(f"/api/v1/books/{libro['id']}/notes?page_size=51")
    assert resp.status_code == 422


async def test_get_notes_ownership_user_a_cannot_access_user_b(client, fake_db):
    """Criterio: user A no ve notas de user B (404, ownership check)."""
    libro_b = _seed_book(fake_db, user_id=OTRO_USER_ID)
    _seed_note(fake_db, libro_b["id"], user_id=OTRO_USER_ID, content="nota secreta de B")

    resp = await client.get(f"/api/v1/books/{libro_b['id']}/notes")

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "BOOK_NOT_FOUND"


async def test_get_notes_libro_inexistente_404(client):
    """Libro inexistente → 404 (mismo camino que ownership)."""
    resp = await client.get("/api/v1/books/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/notes")

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "BOOK_NOT_FOUND"


# ---------------------------------------------------------------------------
# Background task: vectorización
# ---------------------------------------------------------------------------


async def test_background_task_enqueued(client, fake_db, monkeypatch):
    """Criterio: `BackgroundTasks.add_task(vectorize_note, ...)` con args correctos.

    Se mockea `add_task` (clase Starlette) para capturar la llamada sin
    ejecutarla; se verifica que encola `vectorize_note` con
    `(note_id, user_id, book_id, content)`.
    """
    from starlette.background import BackgroundTasks

    calls: list[tuple] = []

    def fake_add_task(self, func, *args, **kwargs):
        calls.append((func, args, kwargs))

    monkeypatch.setattr(BackgroundTasks, "add_task", fake_add_task)

    libro = _seed_book(fake_db)
    resp = await client.post(
        f"/api/v1/books/{libro['id']}/notes",
        json={"content": "nota a vectorizar"},
    )

    assert resp.status_code == 201
    note_id = resp.json()["id"]
    assert len(calls) == 1

    func, args, _kwargs = calls[0]
    assert func is vectorize_note
    assert args[0] == note_id
    assert args[1] == USER_ID
    assert str(args[2]) == libro["id"]
    assert args[3] == "nota a vectorizar"
