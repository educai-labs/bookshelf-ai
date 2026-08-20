"""Tests unitarios de `ISBNLookupService` (feature 008).

Se mockea `httpx.AsyncClient.get` (sin llamadas reales a la red):

- éxito Open Library (respuesta mock con datos completos),
- fallback Google Books (Open Library vacío → Google Books retorna datos),
- error en ambas APIs (ambos mocks fallan → `ISBNNotFoundError`),
- hit de caché (segundo llamado idéntico retorna al instante < 5ms),
- ISBN inválido (lanza `InvalidISBNError`).
"""

import time

import httpx
import pytest

from app.models.isbn import InvalidISBNError, ISBNNotFoundError
from app.services.isbn_lookup import ISBNLookupService

VALID_ISBN = "9788445001234"

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

GOOGLE_BOOKS_PAYLOAD = {
    "items": [
        {
            "volumeInfo": {
                "title": "La Comunidad del Anillo",
                "authors": ["J. R. R. Tolkien"],
                "imageLinks": {"thumbnail": "https://books.google.com/covers/1.jpg"},
                "pageCount": 423,
                "publisher": "Minotauro",
                "publishedDate": "2001",
                "description": "Frodo y la Compañía emprenden el viaje...",
            }
        }
    ]
}


class FakeAsyncClient:
    """Sustituto de `httpx.AsyncClient` para tests.

    `side_effect` es un callable `(url, params) -> httpx.Response | raise`.
    Registra el número de llamadas (`calls`) para verificar el cache.
    """

    def __init__(self, side_effect=None) -> None:
        self.calls = 0
        self.side_effect = side_effect

    async def get(self, url, params=None):
        self.calls += 1
        if self.side_effect is None:
            raise AssertionError("get() llamado sin side_effect configurado")
        response = self.side_effect(url, params)
        if isinstance(response, httpx.Response):
            # `raise_for_status()` requiere la request adjunta a la respuesta.
            response.request = httpx.Request("GET", url)
        return response

    async def aclose(self) -> None:  # pragma: no cover - compatibilidad
        return None


def _response(payload, status_code: int = 200) -> httpx.Response:
    return httpx.Response(status_code, json=payload)


def _timeout(url, params=None) -> httpx.Response:
    raise httpx.TimeoutException(f"timeout en {url}")


# --- Éxito Open Library --------------------------------------------------------


async def test_buscar_exito_open_library():
    client = FakeAsyncClient(side_effect=lambda url, params: _response(OPEN_LIBRARY_PAYLOAD))
    service = ISBNLookupService(client=client)

    result = await service.buscar(VALID_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert result.authors == ["J. R. R. Tolkien"]
    assert result.cover_url == "https://covers.openlibrary.org/b/id/1-S.jpg"
    assert result.page_count == 423
    assert result.publisher == "Minotauro"
    assert result.published_date == "2001"
    assert client.calls == 1  # solo Open Library, sin fallback


async def test_buscar_normaliza_isbn_con_guiones():
    client = FakeAsyncClient(side_effect=lambda url, params: _response(OPEN_LIBRARY_PAYLOAD))
    service = ISBNLookupService(client=client)

    result = await service.buscar("978-84-45001-23-4")

    assert result.title == "La Comunidad del Anillo"
    assert client.calls == 1


# --- Fallback Google Books ------------------------------------------------------


async def test_buscar_fallback_google_books_cuando_open_library_vacio():
    def side_effect(url, params=None):
        if "openlibrary.org" in url:
            return _response({})  # Open Library no devuelve datos
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(VALID_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert result.authors == ["J. R. R. Tolkien"]
    assert result.cover_url == "https://books.google.com/covers/1.jpg"
    assert result.publisher == "Minotauro"
    assert client.calls == 2  # Open Library + Google Books


async def test_buscar_fallback_google_books_cuando_open_library_incompleta():
    def side_effect(url, params=None):
        if "openlibrary.org" in url:
            # Sin portada → metadatos incompletos → fallback
            return _response(
                {
                    f"ISBN:{VALID_ISBN}": {
                        "title": "La Comunidad del Anillo",
                        "authors": [{"name": "J. R. R. Tolkien"}],
                        "publish_date": "2001",
                    }
                }
            )
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(VALID_ISBN)

    assert result.cover_url == "https://books.google.com/covers/1.jpg"
    assert client.calls == 2


# --- Error en ambas APIs ---------------------------------------------------------


async def test_buscar_error_en_ambas_lanza_isbn_not_found():
    client = FakeAsyncClient(side_effect=_timeout)
    service = ISBNLookupService(client=client, retry_delays=(0.001, 0.001))

    with pytest.raises(ISBNNotFoundError) as exc_info:
        await service.buscar(VALID_ISBN)

    assert exc_info.value.code == "ISBN_NOT_FOUND"
    assert VALID_ISBN in exc_info.value.message


async def test_buscar_ambas_sin_datos_lanza_isbn_not_found():
    client = FakeAsyncClient(side_effect=lambda url, params: _response({}))
    service = ISBNLookupService(client=client)

    with pytest.raises(ISBNNotFoundError):
        await service.buscar(VALID_ISBN)


# --- Caché TTL 1h ------------------------------------------------------------------


async def test_segundo_llamado_hit_de_cache_es_instantaneo():
    client = FakeAsyncClient(side_effect=lambda url, params: _response(OPEN_LIBRARY_PAYLOAD))
    service = ISBNLookupService(client=client)

    primero = await service.buscar(VALID_ISBN)
    assert primero.title == "La Comunidad del Anillo"

    inicio = time.monotonic()
    segundo = await service.buscar(VALID_ISBN)
    elapsed_ms = (time.monotonic() - inicio) * 1000

    assert segundo == primero
    assert elapsed_ms < 5, f"el cache tardó {elapsed_ms:.2f}ms (límite 5ms)"
    assert client.calls == 1  # solo la primera llamada HTTP


# --- ISBN inválido -------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_isbn", ["978841234567", "97884123456789", "abc", "", "978-84-12345-67"]
)
async def test_buscar_isbn_invalido_lanza_invalid_isbn(bad_isbn):
    service = ISBNLookupService(client=FakeAsyncClient())

    with pytest.raises(InvalidISBNError) as exc_info:
        await service.buscar(bad_isbn)

    assert exc_info.value.code == "INVALID_ISBN"


async def test_normalizar_isbn_valido():
    service = ISBNLookupService(client=FakeAsyncClient())
    assert service.normalizar_isbn("978-84-45001-23-4") == VALID_ISBN
    assert service.normalizar_isbn("978 84 45001 23 4") == VALID_ISBN


async def test_normalizar_isbn_invalido_lanza():
    service = ISBNLookupService(client=FakeAsyncClient())
    with pytest.raises(InvalidISBNError):
        service.normalizar_isbn("no-es-un-isbn")
