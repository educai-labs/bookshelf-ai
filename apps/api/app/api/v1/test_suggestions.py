"""Tests de integración del endpoint `GET /api/v1/books/suggestions` (feature 023).

Usa `TestClient` con `dependency_overrides` (auth, Supabase y lookup service) y
un `FakeSupabase` en memoria. Cubre: 401 sin token, validación de `q` y `limit`,
búsqueda por título/autor/ISBN, aislamiento entre usuarios, umbral <3 caracteres
sin llamadas externas y fail-soft del catálogo.
"""

import uuid
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.database import get_supabase
from app.core.security import get_current_user
from app.main import app
from app.models.isbn import CatalogSearchResult
from app.services.isbn_lookup import get_lookup_service

USER_ID = "00000000-0000-0000-0000-000000000001"
OTRO_USER_ID = "99999999-9999-9999-9999-999999999999"


# ---------------------------------------------------------------------------
# FakeSupabase mínimo
# ---------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQueryBuilder:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._filters = []

    def _clone(self):
        new = FakeQueryBuilder(self._db, self._table)
        new._filters = list(self._filters)
        return new

    def select(self, columns="*"):
        # Como postgrest-py: `select()` devuelve un builder nuevo (filtros frescos).
        return self._clone()

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def ilike(self, column, pattern):
        self._filters.append(("ilike", column, pattern))
        return self

    def in_(self, column, values):
        self._filters.append(("in", column, values))
        return self

    def execute(self):
        return self._db._execute(self._table, self._filters)


class FakeSupabase:
    def __init__(self):
        self.books: dict[str, dict] = {}

    def table(self, name):
        return FakeQueryBuilder(self, name)

    def _matches(self, row, filters):
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

    def _execute(self, table, filters):
        rows = [dict(r) for r in self.books.values()]
        rows = [r for r in rows if self._matches(r, filters)]
        return FakeResponse(data=rows)


def _seed(db, **overrides) -> dict:
    row = {
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "isbn13": "9788445001234",
        "title": "La Comunidad del Anillo",
        "authors": ["J. R. R. Tolkien"],
        "cover_url": "https://covers.openlibrary.org/b/id/1-S.jpg",
    }
    row.update(overrides)
    db.books[row["id"]] = row
    return row


@pytest.fixture
def fake_db():
    return FakeSupabase()


@pytest.fixture
def lookup_service():
    service = MagicMock()
    service.buscar_texto = AsyncMock(return_value=[])
    return service


@pytest.fixture
def client(fake_db, lookup_service):
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    app.dependency_overrides[get_supabase] = lambda: fake_db
    app.dependency_overrides[get_lookup_service] = lambda: lookup_service
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_suggestions_requiere_auth(client):
    app.dependency_overrides.pop(get_current_user, None)

    resp = client.get("/api/v1/books/suggestions?q=libro")

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"


# ---------------------------------------------------------------------------
# Validación de q y limit
# ---------------------------------------------------------------------------


def test_suggestions_q_obligatorio_422(client):
    resp = client.get("/api/v1/books/suggestions")

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


def test_suggestions_q_vacio_tras_trim_422(client):
    resp = client.get("/api/v1/books/suggestions?q=%20%20%20")

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


def test_suggestions_limit_clamp(client):
    # limit fuera de rango se clampa a [1, 20].
    resp = client.get("/api/v1/books/suggestions?q=libro&limit=100")
    assert resp.status_code == 200
    assert resp.json()["limit"] == 20

    resp = client.get("/api/v1/books/suggestions?q=libro&limit=0")
    assert resp.status_code == 200
    assert resp.json()["limit"] == 1


def test_suggestions_limit_default_8(client):
    resp = client.get("/api/v1/books/suggestions?q=libro")
    assert resp.status_code == 200
    assert resp.json()["limit"] == 8


# ---------------------------------------------------------------------------
# Búsqueda de biblioteca
# ---------------------------------------------------------------------------


def test_suggestions_biblioteca_por_titulo(client, fake_db):
    _seed(fake_db, title="El Silmarillion", isbn13="9780000000001")

    resp = client.get("/api/v1/books/suggestions?q=silmarillion")

    assert resp.status_code == 200
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["title"] == "El Silmarillion"
    assert items[0]["source"] == "library"
    assert items[0]["book_id"] is not None
    assert items[0]["in_library"] is True


def test_suggestions_biblioteca_por_autor(client, fake_db):
    _seed(fake_db, title="El Hobbit", authors=["J. R. R. Tolkien"], isbn13="9780000000002")

    resp = client.get("/api/v1/books/suggestions?q=tolkien")

    assert resp.status_code == 200
    assert [i["title"] for i in resp.json()["items"]] == ["El Hobbit"]


def test_suggestions_biblioteca_por_isbn(client, fake_db):
    _seed(fake_db, title="Dune", isbn13="9780441172719")

    resp = client.get("/api/v1/books/suggestions?q=9780441172719")

    assert resp.status_code == 200
    assert [i["title"] for i in resp.json()["items"]] == ["Dune"]


def test_suggestions_aislamiento_entre_usuarios(client, fake_db):
    _seed(fake_db, title="Libro de A")
    _seed(
        fake_db,
        title="Libro de B",
        user_id=OTRO_USER_ID,
        isbn13="9780000000003",
    )

    resp = client.get("/api/v1/books/suggestions?q=libro")

    assert resp.status_code == 200
    # El usuario A nunca ve el libro de B.
    assert [i["title"] for i in resp.json()["items"]] == ["Libro de A"]


# ---------------------------------------------------------------------------
# Umbral y catálogo
# ---------------------------------------------------------------------------


def test_suggestions_umbral_menor_a_tres_no_llama_catalogo(client, fake_db, lookup_service):
    _seed(fake_db, title="ab", isbn13="9780000000001")

    resp = client.get("/api/v1/books/suggestions?q=ab")

    assert resp.status_code == 200
    lookup_service.buscar_texto.assert_not_called()


def test_suggestions_llama_catalogo_con_tres_o_mas(client, fake_db, lookup_service):
    lookup_service.buscar_texto = AsyncMock(
        return_value=[CatalogSearchResult(isbn13="9780000000004", title="Catálogo")]
    )

    resp = client.get("/api/v1/books/suggestions?q=libro")

    assert resp.status_code == 200
    lookup_service.buscar_texto.assert_awaited_once_with("libro", 8)
    sources = [i["source"] for i in resp.json()["items"]]
    assert "catalog" in sources


# ---------------------------------------------------------------------------
# Fail-soft
# ---------------------------------------------------------------------------


def test_suggestions_fail_soft_catalogo_error_200(client, fake_db, lookup_service):
    _seed(fake_db, title="Libro", isbn13="9780000000001")
    lookup_service.buscar_texto = AsyncMock(side_effect=httpx.TimeoutException("timeout"))

    resp = client.get("/api/v1/books/suggestions?q=libro")

    assert resp.status_code == 200
    items = resp.json()["items"]
    assert [i["title"] for i in items] == ["Libro"]
    assert all(i["source"] == "library" for i in items)
