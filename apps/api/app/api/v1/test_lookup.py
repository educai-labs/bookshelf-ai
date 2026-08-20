"""Tests de integración del endpoint `GET /api/v1/books/lookup` (features 008-009).

El endpoint consolidado en `books.py` (feature 009) delega en
`ISBNLookupService` (feature 008). Se usa `TestClient` con
`dependency_overrides` sobre `get_lookup_service` y `get_current_user`.

Mapeo de errores del endpoint (spec 009): ISBN no válido → 422
`VALIDATION_ERROR` (pattern del Query), no encontrado en APIs externas → 404
`ISBN_NOT_FOUND`, error de red → 500 `LOOKUP_FAILED`.
"""

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.main import app
from app.models.isbn import ISBNLookupResponse, ISBNNotFoundError
from app.services.isbn_lookup import ISBNLookupService, get_lookup_service

VALID_ISBN = "9788445001234"
USER_ID = "00000000-0000-0000-0000-000000000001"

EXPECTED_RESPONSE = {
    "title": "La Comunidad del Anillo",
    "authors": ["J. R. R. Tolkien"],
    "cover_url": "https://covers.openlibrary.org/b/id/1-S.jpg",
    "page_count": 423,
    "publisher": "Minotauro",
    "published_date": "2001",
    "description": None,
    "isbn13": VALID_ISBN,
}

OPEN_LIBRARY_PAYLOAD = {
    f"ISBN:{VALID_ISBN}": {
        "title": "La Comunidad del Anillo",
        "authors": [{"name": "J. R. R. Tolkien"}],
        "cover": {"small": "https://covers.openlibrary.org/b/id/1-S.jpg"},
        "number_of_pages": 423,
        "publishers": [{"name": "Minotauro"}],
        "publish_date": "2001",
    }
}


class FakeAsyncClient:
    """Sustituto de `httpx.AsyncClient`: `get` devuelve respuestas mock."""

    def __init__(self, payload) -> None:
        self.payload = payload

    async def get(self, url, params=None):
        return httpx.Response(200, json=self.payload, request=httpx.Request("GET", url))


@pytest.fixture
def client():
    """TestClient sin lifespan: override de auth; limpieza de overrides al final."""
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    test_client = TestClient(app)
    yield test_client
    app.dependency_overrides.clear()


def _override_service(service):
    app.dependency_overrides[get_lookup_service] = lambda: service


def _service_real_con_open_library() -> ISBNLookupService:
    """Servicio real con `httpx.AsyncClient` mockeado (éxito Open Library)."""
    fake = FakeAsyncClient(OPEN_LIBRARY_PAYLOAD)
    return ISBNLookupService(client=fake)


def test_lookup_exito_open_library(client):
    """Criterio: `GET /api/v1/books/lookup?isbn=` devuelve metadatos JSON."""
    _override_service(_service_real_con_open_library())

    resp = client.get(f"/api/v1/books/lookup?isbn={VALID_ISBN}")

    assert resp.status_code == 200
    assert resp.json() == EXPECTED_RESPONSE


def test_lookup_requiere_auth(client):
    """Criterio 009: todos los endpoints requieren token → 401 sin auth."""
    app.dependency_overrides.pop(get_current_user, None)
    _override_service(_service_real_con_open_library())

    resp = client.get(f"/api/v1/books/lookup?isbn={VALID_ISBN}")

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"


def test_lookup_usa_el_servicio_correctamente(client):
    """Integración: el endpoint invoca `service.buscar` con el ISBN normalizado."""
    service = MagicMock(spec=ISBNLookupService)
    service.buscar = AsyncMock(
        return_value=ISBNLookupResponse(
            title="La Comunidad del Anillo",
            authors=["J. R. R. Tolkien"],
            cover_url="https://covers.openlibrary.org/b/id/1-S.jpg",
        )
    )
    _override_service(service)

    resp = client.get(f"/api/v1/books/lookup?isbn={VALID_ISBN}")

    assert resp.status_code == 200
    assert resp.json()["title"] == "La Comunidad del Anillo"
    assert resp.json()["isbn13"] == VALID_ISBN
    service.buscar.assert_awaited_once_with(VALID_ISBN)


def test_lookup_isbn_invalido_422(client):
    """ISBN que no son 13 dígitos → 422 `VALIDATION_ERROR` (pattern del Query)."""
    _override_service(_service_real_con_open_library())

    resp = client.get("/api/v1/books/lookup?isbn=97884123")

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


def test_lookup_libro_no_encontrado_404(client):
    """Criterio: ambas APIs fallan → 404 con `detail.code = ISBN_NOT_FOUND`."""
    service = MagicMock(spec=ISBNLookupService)
    service.buscar = AsyncMock(side_effect=ISBNNotFoundError(VALID_ISBN))
    _override_service(service)

    resp = client.get(f"/api/v1/books/lookup?isbn={VALID_ISBN}")

    assert resp.status_code == 404
    detail = resp.json()["detail"]
    assert detail["code"] == "ISBN_NOT_FOUND"
    assert VALID_ISBN in detail["message"]


def test_lookup_sin_parametro_isbn_422(client):
    """Query param `isbn` obligatorio: falta → 422 `VALIDATION_ERROR`."""
    _override_service(_service_real_con_open_library())

    resp = client.get("/api/v1/books/lookup")

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


def test_lookup_error_de_red_500(client):
    """Red no responde (timeout escapa del servicio) → 500 `LOOKUP_FAILED`."""
    service = MagicMock(spec=ISBNLookupService)
    service.buscar = AsyncMock(side_effect=httpx.TimeoutException("timeout"))
    _override_service(service)

    resp = client.get(f"/api/v1/books/lookup?isbn={VALID_ISBN}")

    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "LOOKUP_FAILED"
