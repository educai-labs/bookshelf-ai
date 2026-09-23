"""Tests unitarios de `ISBNLookupService` (feature 008).

Se mockea `httpx.AsyncClient.get` (sin llamadas reales a la red):

- éxito Open Library (respuesta mock con datos completos),
- fallback Google Books (Open Library vacío → Google Books retorna datos),
- error en ambas APIs (ambos mocks fallan → `ISBNNotFoundError`),
- hit de caché (segundo llamado idéntico retorna al instante < 5ms),
- ISBN inválido (lanza `InvalidISBNError`).
"""

import asyncio
import logging
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
        if "api/books" in url:
            return _response({})  # Open Library no devuelve datos
        if "search.json" in url:
            return _response({"docs": []})  # search.json tampoco
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(VALID_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert result.authors == ["J. R. R. Tolkien"]
    assert result.cover_url == "https://books.google.com/covers/1.jpg"
    assert result.publisher == "Minotauro"
    assert client.calls == 3  # Open Library /api/books + search.json + Google Books


async def test_buscar_fallback_google_books_cuando_open_library_incompleta():
    def side_effect(url, params=None):
        if "api/books" in url:
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
        if "search.json" in url:
            return _response({"docs": []})  # search.json sin resultados
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(VALID_ISBN)

    assert result.cover_url == "https://books.google.com/covers/1.jpg"
    assert client.calls == 3


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


# --- Fallback search.json (feature 025) ---------------------------------------

EVIDENCE_ISBN = "9780684838724"

# Fixture real de la evidencia (ISBN 9780684838724, "Unlimited power").
OPEN_LIBRARY_SEARCH_PAYLOAD = {
    "docs": [
        {
            "title": "Unlimited power",
            "author_name": ["Tony Robbins"],
            "isbn": ["9780684838724", "0684838729"],
            "cover_i": 4166860,
            "first_publish_year": 1987,
        }
    ]
}


async def test_buscar_fallback_search_json_mapea_doc_completo():
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(OPEN_LIBRARY_SEARCH_PAYLOAD)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "Unlimited power"
    assert result.authors == ["Tony Robbins"]
    assert result.cover_url == "https://covers.openlibrary.org/b/id/4166860-M.jpg"
    assert result.published_date == "1987"
    assert result.description is None
    assert result.page_count is None
    assert result.publisher is None
    assert client.calls == 2  # /api/books + search.json, sin Google Books


async def test_buscar_search_json_selecciona_doc_con_isbn_exacto():
    payload = {
        "docs": [
            {
                "title": "Otro libro",
                "author_name": ["Otro Autor"],
                "isbn": ["9780000000001"],
                "cover_i": 111,
                "first_publish_year": 1990,
            },
            {
                "title": "Unlimited power",
                "author_name": ["Tony Robbins"],
                "isbn": ["9780684838724"],
                "cover_i": 4166860,
                "first_publish_year": 1987,
            },
        ]
    }

    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(payload)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "Unlimited power"
    assert result.cover_url == "https://covers.openlibrary.org/b/id/4166860-M.jpg"


async def test_buscar_search_json_resuelve_isbn10_equivalente():
    payload = {
        "docs": [
            {
                "title": "Unlimited power",
                "author_name": ["Tony Robbins"],
                "isbn": ["0684838729"],  # ISBN-10 equivalente a 9780684838724
                "cover_i": 4166860,
                "first_publish_year": 1987,
            }
        ]
    }

    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(payload)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "Unlimited power"
    assert result.published_date == "1987"


async def test_buscar_search_json_descarta_docs_otros_isbns_y_continua_google():
    payload = {
        "docs": [
            {
                "title": "Otro libro",
                "author_name": ["Otro Autor"],
                "isbn": ["9780000000001"],
                "cover_i": 111,
                "first_publish_year": 1990,
            }
        ]
    }

    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(payload)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"  # desde Google Books
    assert client.calls == 3


async def test_buscar_search_json_descarta_doc_incompleto_y_continua_google():
    # Doc con ISBN correcto pero sin cover_i → `_es_completo` lo descarta.
    payload = {
        "docs": [
            {
                "title": "Unlimited power",
                "author_name": ["Tony Robbins"],
                "isbn": ["9780684838724"],
                "first_publish_year": 1987,
            }
        ]
    }

    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(payload)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.cover_url == "https://books.google.com/covers/1.jpg"


async def test_buscar_search_json_descarta_doc_sin_autores_y_continua_google():
    # Doc con ISBN y portada pero sin author_name → `_es_completo` lo descarta.
    payload = {
        "docs": [
            {
                "title": "Unlimited power",
                "isbn": ["9780684838724"],
                "cover_i": 4166860,
                "first_publish_year": 1987,
            }
        ]
    }

    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(payload)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.cover_url == "https://books.google.com/covers/1.jpg"


@pytest.mark.parametrize(
    "search_payload",
    [
        {"error": "not found"},  # sin `docs`
        {},  # dict vacío
        ["no", "soy", "dict"],  # `docs` no es lista
    ],
)
async def test_buscar_search_json_respuestas_sin_datos_continua_google(search_payload):
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(search_payload)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"


async def test_buscar_search_json_json_invalido_continua_google():
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return httpx.Response(200, content=b"esto no es json")
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"


async def test_buscar_search_json_http_error_continua_google():
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response({}, status_code=503)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"


async def test_buscar_search_json_timeout_registra_error_y_continua_google(caplog):
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            raise httpx.TimeoutException("timeout search.json")
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client, retry_delays=(0.001, 0.001))

    with caplog.at_level(logging.WARNING, logger="app.services.isbn_lookup"):
        result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert "openlibrary_search_failed" in caplog.text


async def test_buscar_search_json_error_de_red_registra_y_continua_google(caplog):
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            raise httpx.NetworkError("error de red search.json")
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client, retry_delays=(0.001, 0.001))

    with caplog.at_level(logging.WARNING, logger="app.services.isbn_lookup"):
        result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert "openlibrary_search_failed" in caplog.text


async def test_buscar_search_json_reintentos_y_backoff(monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            raise httpx.TimeoutException("timeout search.json")
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)  # retry_delays default (1.0, 2.0)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"
    # search.json: 3 intentos (inicial + 2 reintentos) con backoff 1s → 2s.
    assert sleeps == [1.0, 2.0]
    assert client.calls == 5  # 1 /api/books + 3 search.json + 1 Google Books


async def test_buscar_orden_llamadas_api_books_search_json_google():
    urls: list[tuple[str, dict | None]] = []

    def side_effect(url, params=None):
        urls.append((url, params))
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response({"docs": []})  # sin resultados → continúa
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(EVIDENCE_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert [url for url, _ in urls] == [
        "https://openlibrary.org/api/books",
        "https://openlibrary.org/search.json",
        "https://www.googleapis.com/books/v1/volumes",
    ]
    search_params = urls[1][1]
    assert search_params is not None
    assert search_params["q"] == f"isbn:{EVIDENCE_ISBN}"


async def test_buscar_no_consulta_search_json_si_api_books_completo():
    urls: list[str] = []

    def side_effect(url, params=None):
        urls.append(url)
        if "api/books" in url:
            return _response(OPEN_LIBRARY_PAYLOAD)  # datos completos
        raise AssertionError(f"no debería llamarse a {url}")

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    result = await service.buscar(VALID_ISBN)

    assert result.title == "La Comunidad del Anillo"
    assert urls == ["https://openlibrary.org/api/books"]


async def test_buscar_cache_tras_exito_search_json_sin_segunda_http():
    def side_effect(url, params=None):
        if "api/books" in url:
            return _response({}, status_code=404)
        if "search.json" in url:
            return _response(OPEN_LIBRARY_SEARCH_PAYLOAD)
        return _response(GOOGLE_BOOKS_PAYLOAD)

    client = FakeAsyncClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    primero = await service.buscar(EVIDENCE_ISBN)
    segundo = await service.buscar(EVIDENCE_ISBN)

    assert segundo == primero
    assert client.calls == 2  # solo la primera búsqueda hace HTTP


async def test_buscar_mensaje_isbn_not_found_menciona_tres_fuentes():
    client = FakeAsyncClient(side_effect=lambda url, params: _response({}))
    service = ISBNLookupService(client=client)

    with pytest.raises(ISBNNotFoundError) as exc_info:
        await service.buscar(EVIDENCE_ISBN)

    message = exc_info.value.message
    assert "/api/books" in message
    assert "search.json" in message
    assert "Google Books" in message
    assert EVIDENCE_ISBN in message
