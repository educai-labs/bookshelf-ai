"""Tests de integración de los endpoints de settings (feature 022).

Verifican con un `FakeSupabase` en memoria (sin red ni DB real) que:
- `GET /settings` devuelve defaults si no hay fila y los persiste (upsert).
- `PUT /settings` valida enums/rangos y rechaza campos desconocidos (422).
- `GET /settings/data` agrega libros/notas y devuelve preferencias.
- `GET /settings/export` devuelve libros y notas del usuario (aislamiento por
  `user_id`, sin embeddings).
- `DELETE /settings/account` llama a `auth.admin.delete_user` (sin `user_id` del
  cliente) y la cascada borra datos.
- Todos los endpoints requieren auth (401 sin token).
"""

import uuid

import pytest
from postgrest.exceptions import APIError

from app.core.database import get_supabase
from app.core.security import get_current_user
from app.main import app

USER_ID = "00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "99999999-9999-9999-9999-999999999999"


# ---------------------------------------------------------------------------
# FakeSupabase
# ---------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class FakeQueryBuilder:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._select = "*"
        self._count = False
        self._op = None
        self._payload = None
        self._on_conflict = None
        self._filters = []
        self._single = False

    def _clone(self, *, keep_filters=False):
        new = FakeQueryBuilder(self._db, self._table)
        new._select = self._select
        new._count = self._count
        new._op = self._op
        new._payload = self._payload
        new._on_conflict = self._on_conflict
        if keep_filters:
            new._filters = list(self._filters)
        new._single = self._single
        return new

    def select(self, columns="*", count=None):
        new = self._clone()
        new._select = columns
        new._count = bool(count)
        return new

    def upsert(self, payload, on_conflict=None):
        new = self._clone()
        new._op = "upsert"
        new._payload = payload
        new._on_conflict = on_conflict
        return new

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def single(self):
        self._single = True
        return self

    def execute(self):
        return self._db._execute(self)


class FakeAuthAdmin:
    def __init__(self, db):
        self._db = db
        self.deleted: list[str] = []

    def delete_user(self, uid, should_soft_delete=False):
        self.deleted.append(uid)
        self._db._delete_user_data(uid)


class FakeAuth:
    def __init__(self, db):
        self.admin = FakeAuthAdmin(db)


class FakeSupabase:
    """Mini Supabase en memoria con `account_preferences`, `books`, `book_notes`."""

    def __init__(self):
        self.preferences: dict[str, dict] = {}
        self.books: dict[str, dict] = {}
        self.notes: dict[str, dict] = {}
        self.auth = FakeAuth(self)

    def table(self, name):
        return FakeQueryBuilder(self, name)

    def _store_for(self, table):
        return {
            "account_preferences": self.preferences,
            "books": self.books,
            "book_notes": self.notes,
        }[table]

    def _matches(self, row, filters):
        for op, column, value in filters:
            if op == "eq" and row.get(column) != value:
                return False
        return True

    def _delete_user_data(self, user_id):
        for store in (self.preferences, self.books, self.notes):
            for key in [k for k, v in store.items() if v.get("user_id") == user_id]:
                del store[key]

    def _execute(self, builder):
        store = self._store_for(builder._table)
        rows = [dict(r) for r in store.values() if self._matches(r, builder._filters)]

        if builder._op == "upsert":
            row = dict(builder._payload)
            row.setdefault("id", str(uuid.uuid4()))
            # Busca fila existente por user_id
            existing_id = None
            for k, v in store.items():
                if v.get("user_id") == row.get("user_id"):
                    existing_id = k
                    break
            if existing_id is not None:
                row["id"] = existing_id
                store[existing_id] = row
            else:
                store[row["id"]] = row
            rows = [row]

        # Proyección de columnas (réplica del `select(columns)` de PostgREST).
        if builder._select != "*" and builder._op is None:
            columns = [c.strip() for c in builder._select.split(",")]
            rows = [{c: r[c] for c in columns if c in r} for r in rows]

        if builder._single:
            if not rows:
                raise APIError(
                    {
                        "code": "PGRST116",
                        "message": "Cannot coerce the result to a single JSON object",
                        "details": "The result contains 0 rows.",
                    }
                )
            return FakeResponse(data=rows[0])

        total = len(rows)
        return FakeResponse(data=rows, count=total if builder._count else None)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_db():
    return FakeSupabase()


@pytest.fixture
def client(api_client, fake_db):
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    app.dependency_overrides[get_supabase] = lambda: fake_db
    yield api_client
    app.dependency_overrides.clear()


def _seed_preferences(fake_db, user_id=USER_ID, **overrides):
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "reader": {
            "fontSize": 16,
            "lineWidth": 720,
            "lineHeight": 1.6,
            "font": "system",
            "showBookDetails": True,
            "confirmDeletions": True,
        },
        "chat": {
            "initialMode": "book",
            "showHistory": True,
            "clearHistoryOnLogout": True,
            "respondInInterfaceLanguage": True,
            "autoRecommendations": True,
        },
        "notifications": {
            "errors": True,
            "vectorizationDone": True,
            "recommendations": True,
            "account": True,
        },
        "privacy": {"useNotesForSearch": True},
        "created_at": "2026-01-01T10:00:00+00:00",
        "updated_at": "2026-01-01T10:00:00+00:00",
    }
    row.update(overrides)
    fake_db.preferences[row["id"]] = row
    return row


def _seed_book(fake_db, user_id=USER_ID, book_id=None):
    row = {
        "id": book_id or str(uuid.uuid4()),
        "user_id": user_id,
        "isbn13": "9788445001234",
        "title": "Libro de prueba",
        "authors": ["Autor"],
        "status": "want_to_read",
        "rating": None,
        "created_at": "2026-01-01T10:00:00+00:00",
        "updated_at": "2026-01-01T10:00:00+00:00",
    }
    fake_db.books[row["id"]] = row
    return row


def _seed_note(fake_db, book_id, user_id=USER_ID):
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "book_id": book_id,
        "content": "nota",
        "content_html": "<p>nota</p>",
        "chunk_index": 0,
        "embedding": [0.0] * 768,
        "created_at": "2026-01-01T10:00:00+00:00",
    }
    fake_db.notes[row["id"]] = row
    return row


# ---------------------------------------------------------------------------
# GET /settings
# ---------------------------------------------------------------------------


async def test_get_settings_devuelve_defaults_y_persiste(client, fake_db):
    """Sin fila → devuelve defaults y los persiste (upsert)."""
    resp = await client.get("/api/v1/settings")

    assert resp.status_code == 200
    body = resp.json()
    assert body["reader"]["fontSize"] == 16
    assert body["reader"]["font"] == "system"
    assert body["chat"]["initialMode"] == "book"
    assert body["notifications"]["errors"] is True
    assert body["privacy"]["useNotesForSearch"] is True
    # Persistió una fila
    assert len(fake_db.preferences) == 1


async def test_get_settings_devuelve_fila_existente(client, fake_db):
    """Si hay fila, devuelve sus valores (no pisa)."""
    _seed_preferences(
        fake_db,
        reader={
            "fontSize": 20,
            "lineWidth": 800,
            "lineHeight": 1.8,
            "font": "serif",
            "showBookDetails": False,
            "confirmDeletions": False,
        },
    )

    resp = await client.get("/api/v1/settings")

    assert resp.status_code == 200
    assert resp.json()["reader"]["fontSize"] == 20


# ---------------------------------------------------------------------------
# PUT /settings
# ---------------------------------------------------------------------------


async def test_put_settings_valido(client, fake_db):
    """PUT válido → guarda y devuelve la versión canónica."""
    payload = {
        "reader": {
            "fontSize": 18,
            "lineWidth": 640,
            "lineHeight": 1.7,
            "font": "sans",
            "showBookDetails": False,
            "confirmDeletions": True,
        },
        "chat": {
            "initialMode": "library",
            "showHistory": False,
            "clearHistoryOnLogout": True,
            "respondInInterfaceLanguage": False,
            "autoRecommendations": True,
        },
        "notifications": {
            "errors": True,
            "vectorizationDone": False,
            "recommendations": True,
            "account": True,
        },
        "privacy": {"useNotesForSearch": False},
    }
    resp = await client.put("/api/v1/settings", json=payload)

    assert resp.status_code == 200
    body = resp.json()
    assert body["reader"]["fontSize"] == 18
    assert body["chat"]["initialMode"] == "library"
    assert body["privacy"]["useNotesForSearch"] is False


async def test_put_settings_font_size_fuera_de_rango_422(client):
    """fontSize 13 o 23 → 422 VALIDATION_ERROR."""
    for size in (13, 23):
        payload = {
            "reader": {
                "fontSize": size,
                "lineWidth": 720,
                "lineHeight": 1.6,
                "font": "system",
                "showBookDetails": True,
                "confirmDeletions": True,
            },
            "chat": {
                "initialMode": "book",
                "showHistory": True,
                "clearHistoryOnLogout": True,
                "respondInInterfaceLanguage": True,
                "autoRecommendations": True,
            },
            "notifications": {
                "errors": True,
                "vectorizationDone": True,
                "recommendations": True,
                "account": True,
            },
            "privacy": {"useNotesForSearch": True},
        }
        resp = await client.put("/api/v1/settings", json=payload)
        assert resp.status_code == 422, f"fontSize={size} debería fallar con 422"


async def test_put_settings_enum_invalido_422(client):
    """`font` o `initialMode` inválidos → 422."""
    payload = {
        "reader": {
            "fontSize": 16,
            "lineWidth": 720,
            "lineHeight": 1.6,
            "font": "comic_sans",
            "showBookDetails": True,
            "confirmDeletions": True,
        },
        "chat": {
            "initialMode": "book",
            "showHistory": True,
            "clearHistoryOnLogout": True,
            "respondInInterfaceLanguage": True,
            "autoRecommendations": True,
        },
        "notifications": {
            "errors": True,
            "vectorizationDone": True,
            "recommendations": True,
            "account": True,
        },
        "privacy": {"useNotesForSearch": True},
    }
    resp = await client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 422


async def test_put_settings_campo_desconocido_422(client):
    """Campos desconocidos (extra) → 422."""
    payload = {
        "reader": {
            "fontSize": 16,
            "lineWidth": 720,
            "lineHeight": 1.6,
            "font": "system",
            "showBookDetails": True,
            "confirmDeletions": True,
            "hack": True,
        },
        "chat": {
            "initialMode": "book",
            "showHistory": True,
            "clearHistoryOnLogout": True,
            "respondInInterfaceLanguage": True,
            "autoRecommendations": True,
        },
        "notifications": {
            "errors": True,
            "vectorizationDone": True,
            "recommendations": True,
            "account": True,
        },
        "privacy": {"useNotesForSearch": True},
    }
    resp = await client.put("/api/v1/settings", json=payload)
    assert resp.status_code == 422


async def test_put_settings_no_acepta_user_id_del_cliente(client, fake_db):
    """Un `user_id` ajeno en el payload no altera el aislamiento (se ignora o 422)."""
    payload = {
        "user_id": OTHER_USER_ID,
        "reader": {
            "fontSize": 16,
            "lineWidth": 720,
            "lineHeight": 1.6,
            "font": "system",
            "showBookDetails": True,
            "confirmDeletions": True,
        },
        "chat": {
            "initialMode": "book",
            "showHistory": True,
            "clearHistoryOnLogout": True,
            "respondInInterfaceLanguage": True,
            "autoRecommendations": True,
        },
        "notifications": {
            "errors": True,
            "vectorizationDone": True,
            "recommendations": True,
            "account": True,
        },
        "privacy": {"useNotesForSearch": True},
    }
    resp = await client.put("/api/v1/settings", json=payload)

    # El payload extra se rechaza (422) o se ignora; en ambos casos la fila
    # guardada pertenece al usuario autenticado, nunca al ajeno.
    if resp.status_code == 200:
        assert len(fake_db.preferences) == 1
        row = next(iter(fake_db.preferences.values()))
        assert row["user_id"] == USER_ID
    else:
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# GET /settings/data
# ---------------------------------------------------------------------------


async def test_get_stored_data(client, fake_db):
    """Devuelve recuentos de libros/notas y las preferencias."""
    book = _seed_book(fake_db)
    _seed_note(fake_db, book["id"])
    _seed_preferences(fake_db)

    resp = await client.get("/api/v1/settings/data")

    assert resp.status_code == 200
    body = resp.json()
    assert body["books"] == 1
    assert body["notes"] == 1
    assert body["preferences"]["reader"]["fontSize"] == 16


# ---------------------------------------------------------------------------
# GET /settings/export
# ---------------------------------------------------------------------------


async def test_export_data_solo_del_usuario(client, fake_db):
    """Exporta solo libros/notas del usuario (aislamiento por user_id)."""
    book = _seed_book(fake_db)
    _seed_note(fake_db, book["id"])
    # Datos de OTRO usuario que no deben aparecer
    other_book = _seed_book(fake_db, user_id=OTHER_USER_ID)
    _seed_note(fake_db, other_book["id"], user_id=OTHER_USER_ID)

    resp = await client.get("/api/v1/settings/export")

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["books"]) == 1
    assert len(body["notes"]) == 1
    assert body["books"][0]["user_id"] == USER_ID
    # Las notas exportadas no exponen embeddings
    assert "embedding" not in body["notes"][0]


# ---------------------------------------------------------------------------
# DELETE /settings/account
# ---------------------------------------------------------------------------


async def test_delete_account_llama_a_admin_delete_user(client, fake_db):
    """DELETE borra la cuenta del usuario autenticado (server-side)."""
    book = _seed_book(fake_db)
    _seed_note(fake_db, book["id"])

    resp = await client.delete("/api/v1/settings/account")

    assert resp.status_code == 204
    assert fake_db.auth.admin.deleted == [USER_ID]
    # Cascada: libros y notas del usuario desaparecen
    assert fake_db.books == {}
    assert fake_db.notes == {}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


async def test_settings_requieren_auth(client):
    """Sin token → 401 NOT_AUTHENTICATED."""
    app.dependency_overrides.pop(get_current_user, None)

    resp = await client.get("/api/v1/settings")

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"
