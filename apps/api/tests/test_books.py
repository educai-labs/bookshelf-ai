"""Tests de integración de los endpoints CRUD de libros (feature 009).

Usan la app FastAPI con `dependency_overrides` (auth, Supabase y lookup
service) y un `FakeSupabase` en memoria que replica el comportamiento de
PostgREST relevante para los endpoints (filtros `eq`/`in_`/`ilike`, `range`,
`count=exact`, `single()` → `APIError` PGRST116, insert/update/delete con
representación, unique violation 23505 y cascade de notas) para verificar el
contrato completo sin red ni base de datos real.
"""

import json
import uuid
from datetime import UTC, datetime

import pytest
from postgrest.exceptions import APIError

from app.core.database import get_supabase
from app.core.security import get_current_user
from app.main import app
from app.models.isbn import ISBNLookupResponse
from app.services.isbn_lookup import get_lookup_service

USER_ID = "00000000-0000-0000-0000-000000000001"
OTRO_USER_ID = "99999999-9999-9999-9999-999999999999"
VALID_ISBN = "9788445001234"

METADATA = ISBNLookupResponse(
    title="La Comunidad del Anillo",
    authors=["J. R. R. Tolkien"],
    cover_url="https://covers.openlibrary.org/b/id/1-S.jpg",
    page_count=423,
    publisher="Minotauro",
    published_date="2001",
    description="Novela de fantasía épica.",
)


# ---------------------------------------------------------------------------
# FakeSupabase: mini PostgREST en memoria
# ---------------------------------------------------------------------------


class FakeResponse:
    """Equivalente a `postgrest.types.APIResponse` (`data` list + `count`)."""

    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class FakeQueryBuilder:
    """Mini PostgREST en memoria: encadena filtros/ops y `execute()` resuelve.

    Replica la semántica del builder real de postgrest-py: `select()` y las
    operaciones `insert/update/delete` devuelven un builder nuevo (filtros
    frescos), mientras que los filtros (`eq`/`in_`/`ilike`/`range`/`single`)
    mutan y devuelven el mismo builder (encadenamiento tipo supabase-py).
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
        new._single = self._single
        return new

    # --- construcción de query (devuelven builder nuevo, como postgrest-py) ---
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

    def update(self, payload):
        new = self._clone()
        new._op = "update"
        new._payload = payload
        return new

    def delete(self):
        new = self._clone()
        new._op = "delete"
        return new

    # --- filtros (mutan y devuelven self, como supabase-py) ---
    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self._filters.append(("in", column, values))
        return self

    def ilike(self, column, pattern):
        self._filters.append(("ilike", column, pattern))
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def single(self):
        self._single = True
        return self

    # --- ejecución ---
    def execute(self):
        return self._db._execute(self)


class FakeSupabase:
    """Cliente Supabase falso con tablas `books` y `book_notes` en memoria.

    Replica el comportamiento de PostgREST que usan los endpoints:
    - filtros `eq`/`in_`/`ilike`, `range` y `count=exact`
    - `.single()` sin filas → `APIError` PGRST116
    - insert/update/delete devuelven la representación
    - unique violation `(user_id, isbn13)` → `APIError` 23505
    - delete de un libro borra sus notas (FK ON DELETE CASCADE)
    """

    def __init__(self):
        self.books: dict[str, dict] = {}
        self.notes: dict[str, dict] = {}
        self.log: list[tuple[str, str | None, list]] = []

    def table(self, name):
        return FakeQueryBuilder(self, name)

    def _matches(self, row, filters) -> bool:
        for op, column, value in filters:
            if op == "eq":
                if row.get(column) != value:
                    return False
            elif op == "in":
                if row.get(column) not in value:
                    return False
            elif op == "ilike":
                cell = row.get(column)
                pattern = value.replace("%", "")
                if not (isinstance(cell, str) and pattern.lower() in cell.lower()):
                    return False
        return True

    def _execute(self, builder) -> FakeResponse:
        table = getattr(self, builder._table)
        rows = [dict(r) for r in table.values()]
        rows = [r for r in rows if self._matches(r, builder._filters)]
        self.log.append((builder._table, builder._op, builder._filters))

        if builder._op in ("insert", "update"):
            # Réplica de httpx: el payload debe ser JSON-serializable (un `date`
            # crudo lanzaría TypeError como en el cliente real).
            json.dumps(builder._payload)

        if builder._op == "insert":
            row = dict(builder._payload)
            for existing in table.values():
                if existing.get("user_id") == row.get("user_id") and existing.get(
                    "isbn13"
                ) == row.get("isbn13"):
                    raise APIError(
                        {
                            "code": "23505",
                            "message": (
                                "duplicate key value violates unique constraint "
                                '"books_isbn13_unique"'
                            ),
                            "details": (
                                f'Key (user_id, isbn13)=({row.get("user_id")}, '
                                f'{row.get("isbn13")}) already exists.'
                            ),
                        }
                    )
            row.setdefault("id", str(uuid.uuid4()))
            row.setdefault("status", "want_to_read")
            row.setdefault("authors", [])
            row.setdefault("created_at", _now())
            row.setdefault("updated_at", _now())
            table[row["id"]] = row
            rows = [row]

        elif builder._op == "update":
            for row in rows:
                row.update(builder._payload)
                row["updated_at"] = _now()
            table.update({row["id"]: row for row in rows})

        elif builder._op == "delete":
            deleted_ids = [row["id"] for row in rows]
            for rid in deleted_ids:
                table.pop(rid, None)
            for bid in deleted_ids:  # FK ON DELETE CASCADE
                for nid in [nid for nid, n in self.notes.items() if n["book_id"] == bid]:
                    self.notes.pop(nid, None)

        if "book_notes(count)" in builder._select:
            for row in rows:
                count = sum(1 for n in self.notes.values() if n["book_id"] == row["id"])
                row["book_notes"] = [{"count": count}]

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
def lookup_service():
    """Sustituto de `ISBNLookupService`: `buscar` devuelve metadatos fijos."""

    class _FakeLookupService:
        async def buscar(self, isbn: str) -> ISBNLookupResponse:
            return METADATA

    return _FakeLookupService()


@pytest.fixture
def client(api_client, fake_db, lookup_service):
    """`httpx.AsyncClient` contra la app con overrides de auth + supabase + lookup."""
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    app.dependency_overrides[get_supabase] = lambda: fake_db
    app.dependency_overrides[get_lookup_service] = lambda: lookup_service
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
        "isbn13": VALID_ISBN,
        "title": "La Comunidad del Anillo",
        "authors": ["J. R. R. Tolkien"],
        "cover_url": "https://covers.openlibrary.org/b/id/1-S.jpg",
        "page_count": 423,
        "publisher": "Minotauro",
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
# GET /books/lookup
# ---------------------------------------------------------------------------


async def test_lookup_200(client):
    """Criterio: lookup delega en `ISBNLookupService` y devuelve metadatos + isbn13."""
    resp = await client.get(f"/api/v1/books/lookup?isbn={VALID_ISBN}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "La Comunidad del Anillo"
    assert body["authors"] == ["J. R. R. Tolkien"]
    assert body["isbn13"] == VALID_ISBN


# ---------------------------------------------------------------------------
# POST /books
# ---------------------------------------------------------------------------


async def test_create_book_201(client):
    """Criterio: inserta con `user_id` del JWT y retorna `BookRead` completo."""
    resp = await client.post("/api/v1/books", json={"isbn13": VALID_ISBN})

    assert resp.status_code == 201
    body = resp.json()
    assert body["isbn13"] == VALID_ISBN
    assert body["title"] == "La Comunidad del Anillo"
    assert body["authors"] == ["J. R. R. Tolkien"]
    assert body["cover_url"] == "https://covers.openlibrary.org/b/id/1-S.jpg"
    assert body["page_count"] == 423
    assert body["publisher"] == "Minotauro"
    assert body["published_date"] == "2001-01-01"  # "2001" → 2001-01-01 (date DB)
    assert body["status"] == "want_to_read"
    assert body["user_id"] == USER_ID
    assert body["id"]
    assert body["created_at"]
    assert body["updated_at"]
    assert body["notes_count"] == 0


async def test_create_book_con_campos_editables(client):
    """Criterio: status/rating/started_at opcionales se persisten."""
    resp = await client.post(
        "/api/v1/books",
        json={"isbn13": VALID_ISBN, "status": "reading", "rating": 4, "started_at": "2026-01-10"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "reading"
    assert body["rating"] == 4
    assert body["started_at"] == "2026-01-10"


async def test_create_book_isbn_invalido_422(client):
    """Criterio: ISBN que no son 13 dígitos → 422 `VALIDATION_ERROR`."""
    resp = await client.post("/api/v1/books", json={"isbn13": "97884123"})

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


async def test_create_book_rating_fuera_de_rango_422(client):
    """Criterio: rating 0 o 6 → 422."""
    for rating in (0, 6):
        resp = await client.post("/api/v1/books", json={"isbn13": VALID_ISBN, "rating": rating})
        assert resp.status_code == 422, f"rating={rating} debería fallar con 422"


async def test_create_book_duplicado_409(client, fake_db):
    """Criterio: mismo ISBN (unique user_id+isbn13) dos veces → 409 `isbn_duplicate`."""
    _seed_book(fake_db)

    resp = await client.post("/api/v1/books", json={"isbn13": VALID_ISBN})

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert detail["code"] == "isbn_duplicate"
    assert detail["field"] == "isbn13"


# ---------------------------------------------------------------------------
# GET /books (listado)
# ---------------------------------------------------------------------------


async def test_list_books_paginado(client, fake_db):
    """Criterio: paginación con `.range()` + total/total_pages correctos."""
    _seed_book(fake_db, title="Libro A", isbn13="9780000000001")
    _seed_book(fake_db, title="Libro B", isbn13="9780000000002")
    _seed_book(fake_db, title="Libro C", isbn13="9780000000003")

    resp = await client.get("/api/v1/books?page=1&page_size=2")

    assert resp.status_code == 200
    body = resp.json()
    assert body["page"] == 1
    assert body["page_size"] == 2
    assert body["total"] == 3
    assert body["total_pages"] == 2
    assert len(body["items"]) == 2
    assert body["items"][0]["title"] == "Libro A"


async def test_list_books_segunda_pagina(client, fake_db):
    """Criterio: página 2 devuelve los libros restantes."""
    _seed_book(fake_db, title="Libro A", isbn13="9780000000001")
    _seed_book(fake_db, title="Libro B", isbn13="9780000000002")
    _seed_book(fake_db, title="Libro C", isbn13="9780000000003")

    resp = await client.get("/api/v1/books?page=2&page_size=2")

    body = resp.json()
    assert body["page"] == 2
    assert body["total"] == 3
    assert len(body["items"]) == 1
    assert body["items"][0]["title"] == "Libro C"


async def test_list_books_pagina_vacia(client, fake_db):
    """Criterio: página fuera de rango → items vacíos, total real, total_pages real."""
    _seed_book(fake_db)

    resp = await client.get("/api/v1/books?page=5&page_size=20")

    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 1
    assert body["total_pages"] == 1


async def test_list_books_sin_libros(client):
    """Sin libros → página vacía con total 0 y total_pages 0."""
    resp = await client.get("/api/v1/books")

    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["total_pages"] == 0


async def test_list_books_filtro_status(client, fake_db):
    """Criterio: filtro `status` (cada valor del enum)."""
    _seed_book(fake_db, id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title="A", status="want_to_read")
    _seed_book(fake_db, id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title="B", status="reading")
    _seed_book(fake_db, id="cccccccc-cccc-cccc-cccc-cccccccccccc", title="C", status="read")

    for valor, titulo in (("want_to_read", "A"), ("reading", "B"), ("read", "C")):
        resp = await client.get(f"/api/v1/books?status={valor}")
        body = resp.json()
        assert body["total"] == 1, f"status={valor}"
        assert body["items"][0]["title"] == titulo


async def test_list_books_filtro_status_invalido_422(client):
    """Status fuera del enum → 422."""
    resp = await client.get("/api/v1/books?status=no_leido")
    assert resp.status_code == 422


async def test_list_books_filtro_rating(client, fake_db):
    """Criterio: filtro `rating` exacto."""
    _seed_book(fake_db, id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title="A", rating=5)
    _seed_book(fake_db, id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title="B", rating=3)

    resp = await client.get("/api/v1/books?rating=5")

    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "A"


async def test_list_books_filtro_rating_invalido_422(client):
    """Rating fuera de 1-5 → 422."""
    resp = await client.get("/api/v1/books?rating=0")
    assert resp.status_code == 422


async def test_list_books_filtro_q_titulo(client, fake_db):
    """Criterio: `q` busca en título, case-insensitive."""
    _seed_book(fake_db, id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", title="La Comunidad del Anillo")
    _seed_book(fake_db, id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", title="El Silmarillion")

    resp = await client.get("/api/v1/books?q=COMUNIDAD")

    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "La Comunidad del Anillo"


async def test_list_books_filtro_q_autor(client, fake_db):
    """Criterio: `q` busca en autores (case-insensitive, sin ILIKE sobre text[])."""
    _seed_book(
        fake_db,
        id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        title="La Comunidad del Anillo",
        authors=["J. R. R. Tolkien"],
    )
    _seed_book(
        fake_db,
        id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        title="Cien años de soledad",
        authors=["Gabriel García Márquez"],
    )

    resp = await client.get("/api/v1/books?q=TOLKIEN")

    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "La Comunidad del Anillo"


async def test_list_books_page_size_limites_422(client):
    """Criterio: `page` ≥ 1 y `page_size` 1-100 → fuera de rango 422."""
    resp = await client.get("/api/v1/books?page=0")
    assert resp.status_code == 422
    resp = await client.get("/api/v1/books?page_size=101")
    assert resp.status_code == 422


async def test_list_books_añade_notes_count(client, fake_db):
    """Criterio: `.select("*, book_notes(count)")` → `notes_count` por libro."""
    libro = _seed_book(fake_db)
    _seed_note(fake_db, libro["id"])

    resp = await client.get("/api/v1/books")

    body = resp.json()
    assert body["items"][0]["notes_count"] == 1


# ---------------------------------------------------------------------------
# GET /books/{book_id}
# ---------------------------------------------------------------------------


async def test_get_book_200(client, fake_db):
    """Criterio: devuelve el libro con `notes_count`."""
    libro = _seed_book(fake_db)
    _seed_note(fake_db, libro["id"])

    resp = await client.get(f"/api/v1/books/{libro['id']}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == libro["id"]
    assert body["title"] == "La Comunidad del Anillo"
    assert body["isbn13"] == VALID_ISBN
    assert body["notes_count"] == 1


async def test_get_book_404(client):
    """Criterio: ID inexistente → 404 `BOOK_NOT_FOUND`."""
    resp = await client.get("/api/v1/books/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    assert resp.status_code == 404
    assert resp.json()["detail"]["code"] == "BOOK_NOT_FOUND"


async def test_get_book_de_otro_usuario_404(client, fake_db):
    """Criterio: libro de otro usuario → 404 (aislamiento por `user_id`)."""
    _seed_book(fake_db, id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", user_id=OTRO_USER_ID)

    resp = await client.get("/api/v1/books/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PATCH /books/{book_id}
# ---------------------------------------------------------------------------


async def test_update_book_200(client, fake_db):
    """Criterio: actualiza solo los campos enviados; trigger renueva `updated_at`."""
    libro = _seed_book(fake_db)

    resp = await client.patch(f"/api/v1/books/{libro['id']}", json={"status": "read", "rating": 5})

    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "read"
    assert body["rating"] == 5
    assert body["title"] == "La Comunidad del Anillo"  # campos no enviados intactos
    assert body["updated_at"] > libro["updated_at"]


async def test_update_book_sin_campos_422(client, fake_db):
    """Criterio: PATCH vacío → 422 `VALIDATION_ERROR` (model_validator)."""
    libro = _seed_book(fake_db)

    resp = await client.patch(f"/api/v1/books/{libro['id']}", json={})

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


async def test_update_book_rating_invalido_422(client, fake_db):
    """Criterio: rating 0 o 6 → 422."""
    libro = _seed_book(fake_db)

    for rating in (0, 6):
        resp = await client.patch(f"/api/v1/books/{libro['id']}", json={"rating": rating})
        assert resp.status_code == 422, f"rating={rating} debería fallar con 422"


async def test_update_book_404(client):
    """Criterio: ID inexistente → 404."""
    resp = await client.patch(
        "/api/v1/books/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", json={"status": "read"}
    )

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /books/{book_id}
# ---------------------------------------------------------------------------


async def test_delete_book_204_y_cascada_borra_notas(client, fake_db):
    """Criterio: DELETE 204 y las notas se borran (FK ON DELETE CASCADE)."""
    libro = _seed_book(fake_db)
    nota = _seed_note(fake_db, libro["id"])
    assert libro["id"] in fake_db.books
    assert nota["id"] in fake_db.notes

    resp = await client.delete(f"/api/v1/books/{libro['id']}")

    assert resp.status_code == 204
    assert resp.content == b""
    assert libro["id"] not in fake_db.books
    assert nota["id"] not in fake_db.notes


async def test_delete_book_404(client):
    """Criterio: ID inexistente → 404."""
    resp = await client.delete("/api/v1/books/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def test_endpoints_requieren_auth(client):
    """Criterio: todos los endpoints requieren token → 401 sin auth."""
    app.dependency_overrides.pop(get_current_user, None)  # se mantiene el mock de supabase

    resp = await client.get("/api/v1/books")

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"


async def test_token_invalido_401(client):
    """Criterio: token inválido → 401 `INVALID_TOKEN` (JWT real verificado)."""
    from app.core.config import settings

    if not settings.supabase_jwt_secret:
        pytest.skip("SUPABASE_JWT_SECRET no configurado en .env")

    app.dependency_overrides.pop(get_current_user, None)  # se mantiene el mock de supabase
    resp = await client.get("/api/v1/books", headers={"Authorization": "Bearer token-invalido"})

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "INVALID_TOKEN"
