"""Tests unitarios del servicio de sugerencias y de la búsqueda textual (feature 023).

Cubre:
- Búsqueda de biblioteca por título / autor / ISBN y aislamiento entre usuarios.
- Umbral de 3 caracteres (sin llamadas al catálogo externo).
- Merge/deduplicación por ISBN-13, prioridad biblioteca, orden y límite.
- Fail-soft del catálogo externo.
- Búsqueda textual (`ISBNLookupService.buscar_texto`): Open Library, fallback
  Google Books, descarte sin ISBN-13, conversión ISBN-10 → ISBN-13, caché y
  timeout sin reintentos.
"""

import httpx

from app.models.isbn import CatalogSearchResult
from app.services.book_suggestions import BookSuggestionsService
from app.services.isbn_lookup import (
    ISBNLookupService,
    isbn10_a_isbn13,
)

USER_ID = "00000000-0000-0000-0000-000000000001"
OTRO_USER_ID = "99999999-9999-9999-9999-999999999999"


# ---------------------------------------------------------------------------
# FakeSupabase mínimo (solo lo que usa `_buscar_biblioteca`)
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


def _seed(fake_db, **overrides) -> dict:
    row = {
        "id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "user_id": USER_ID,
        "isbn13": "9788445001234",
        "title": "La Comunidad del Anillo",
        "authors": ["J. R. R. Tolkien"],
        "cover_url": "https://covers.openlibrary.org/b/id/1-S.jpg",
    }
    row.update(overrides)
    fake_db.books[row["id"]] = row
    return row


# ---------------------------------------------------------------------------
# Fakes del servicio de lookup
# ---------------------------------------------------------------------------


class _FakeLookup:
    """Sustituto de `ISBNLookupService` para tests del merge."""

    def __init__(self, results=None, error=None, calls=None):
        self.results = results or []
        self.error = error
        self.calls = calls if calls is not None else []

    async def buscar_texto(self, query, limit=8):
        self.calls.append((query, limit))
        if self.error is not None:
            raise self.error
        return self.results[:limit]


def _catalog_result(isbn13, title, authors=None, cover=None) -> CatalogSearchResult:
    return CatalogSearchResult(isbn13=isbn13, title=title, authors=authors or [], cover_url=cover)


# ---------------------------------------------------------------------------
# Biblioteca
# ---------------------------------------------------------------------------


async def test_buscar_biblioteca_por_titulo():
    db = FakeSupabase()
    _seed(
        db,
        title="El Silmarillion",
        isbn13="9780000000001",
        id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    )
    service = BookSuggestionsService(_FakeLookup())

    resp = await service.get_suggestions(db, USER_ID, "silmarillion", 8)

    assert [s.title for s in resp.items] == ["El Silmarillion"]
    assert resp.items[0].source == "library"
    assert resp.items[0].book_id is not None
    assert resp.items[0].in_library is True


async def test_buscar_biblioteca_por_autor():
    db = FakeSupabase()
    _seed(
        db,
        title="El Hobbit",
        authors=["J. R. R. Tolkien"],
        isbn13="9780000000002",
        id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    )
    service = BookSuggestionsService(_FakeLookup())

    resp = await service.get_suggestions(db, USER_ID, "tolkien", 8)

    assert [s.title for s in resp.items] == ["El Hobbit"]


async def test_buscar_biblioteca_por_isbn():
    db = FakeSupabase()
    _seed(db, title="Dune", isbn13="9780441172719", id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    service = BookSuggestionsService(_FakeLookup())

    resp = await service.get_suggestions(db, USER_ID, "9780441172719", 8)

    assert [s.title for s in resp.items] == ["Dune"]


async def test_aislamiento_entre_usuarios():
    db = FakeSupabase()
    _seed(db, title="Libro de A", id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    _seed(
        db,
        title="Libro de B",
        user_id=OTRO_USER_ID,
        isbn13="9780000000003",
        id="cccccccc-cccc-cccc-cccc-cccccccccccc",
    )
    service = BookSuggestionsService(_FakeLookup())

    resp = await service.get_suggestions(db, USER_ID, "libro", 8)

    # El usuario A solo ve su libro (el de B nunca aparece).
    assert [s.title for s in resp.items] == ["Libro de A"]


# ---------------------------------------------------------------------------
# Umbral y catálogo externo
# ---------------------------------------------------------------------------


async def test_umbral_menor_a_tres_no_llama_catalogo():
    db = FakeSupabase()
    lookup = _FakeLookup(results=[_catalog_result("9780000000004", "Catálogo")])
    service = BookSuggestionsService(lookup)

    resp = await service.get_suggestions(db, USER_ID, "ab", 8)

    assert resp.items == []
    assert lookup.calls == []  # cero llamadas al catálogo


async def test_tres_o_mas_caracteres_llama_catalogo():
    db = FakeSupabase()
    lookup = _FakeLookup(results=[_catalog_result("9780000000004", "Catálogo")])
    service = BookSuggestionsService(lookup)

    resp = await service.get_suggestions(db, USER_ID, "abc", 8)

    assert [s.title for s in resp.items] == ["Catálogo"]
    assert lookup.calls == [("abc", 8)]


# ---------------------------------------------------------------------------
# Merge / dedup / prioridad / orden / límite
# ---------------------------------------------------------------------------


async def test_merge_biblioteca_primero_catalogo_rellena():
    db = FakeSupabase()
    _seed(db, title="Biblioteca", isbn13="9780000000001", id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    lookup = _FakeLookup(results=[_catalog_result("9780000000004", "Catálogo")])
    service = BookSuggestionsService(lookup)

    resp = await service.get_suggestions(db, USER_ID, "biblio", 8)

    assert [s.source for s in resp.items] == ["library", "catalog"]
    assert [s.title for s in resp.items] == ["Biblioteca", "Catálogo"]


async def test_deduplicacion_por_isbn_gana_biblioteca():
    db = FakeSupabase()
    _seed(
        db,
        title="Ya en biblioteca",
        isbn13="9780000000004",
        id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    )
    lookup = _FakeLookup(
        results=[
            _catalog_result("9780000000004", "Duplicado del catálogo"),
            _catalog_result("9780000000005", "Otro catálogo"),
        ]
    )
    service = BookSuggestionsService(lookup)

    resp = await service.get_suggestions(db, USER_ID, "biblioteca", 8)

    isbns = [s.isbn13 for s in resp.items]
    assert isbns == ["9780000000004", "9780000000005"]
    # La entrada que queda para 9780000000004 es la de biblioteca.
    assert resp.items[0].source == "library"
    assert resp.items[0].title == "Ya en biblioteca"
    assert resp.items[1].source == "catalog"


async def test_truncado_al_limite():
    db = FakeSupabase()
    _seed(db, title="Libro B1", isbn13="9780000000001", id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    lookup = _FakeLookup(
        results=[
            _catalog_result("9780000000004", "C1"),
            _catalog_result("9780000000005", "C2"),
            _catalog_result("9780000000006", "C3"),
        ]
    )
    service = BookSuggestionsService(lookup)

    resp = await service.get_suggestions(db, USER_ID, "libro", 2)

    assert [s.title for s in resp.items] == ["Libro B1", "C1"]
    assert resp.limit == 2


# ---------------------------------------------------------------------------
# Fail-soft
# ---------------------------------------------------------------------------


async def test_fail_soft_catalogo_error_devuelve_solo_biblioteca():
    db = FakeSupabase()
    _seed(db, title="Libro", isbn13="9780000000001", id="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    lookup = _FakeLookup(error=httpx.TimeoutException("timeout"))
    service = BookSuggestionsService(lookup)

    resp = await service.get_suggestions(db, USER_ID, "libro", 8)

    assert [s.title for s in resp.items] == ["Libro"]
    assert all(s.source == "library" for s in resp.items)


# ---------------------------------------------------------------------------
# Búsqueda textual (ISBNLookupService.buscar_texto)
# ---------------------------------------------------------------------------


class SearchFakeClient:
    def __init__(self, side_effect=None):
        self.calls = []
        self.side_effect = side_effect

    async def get(self, url, params=None, timeout=None):
        self.calls.append((url, params, timeout))
        response = self.side_effect(url, params)
        if isinstance(response, httpx.Response):
            response.request = httpx.Request("GET", url)
        return response

    async def aclose(self):  # pragma: no cover
        return None


def _response(payload, status_code=200):
    return httpx.Response(status_code, json=payload)


def _openlibrary_search_payload():
    return {
        "docs": [
            {
                "title": "Dune",
                "author_name": ["Frank Herbert"],
                "isbn": ["9780441172719", "0441172717"],
                "cover_i": 12345,
            },
            {
                "title": "Sin ISBN",
                "author_name": ["Autor"],
                "isbn": [],
                "cover_i": 99999,
            },
        ]
    }


async def test_buscar_texto_open_library():
    client = SearchFakeClient(
        side_effect=lambda url, params: _response(_openlibrary_search_payload())
    )
    service = ISBNLookupService(client=client)

    results = await service.buscar_texto("dune", 8)

    assert len(results) == 1  # el doc sin ISBN se descarta
    assert results[0].isbn13 == "9780441172719"
    assert results[0].title == "Dune"
    assert results[0].authors == ["Frank Herbert"]
    assert results[0].cover_url == "https://covers.openlibrary.org/b/id/12345-M.jpg"
    assert len(client.calls) == 1


async def test_buscar_texto_fallback_google_books():
    def side_effect(url, params=None):
        if "openlibrary.org" in url:
            return _response({"docs": []})
        return _response(
            {
                "items": [
                    {
                        "volumeInfo": {
                            "title": "Dune",
                            "authors": ["Frank Herbert"],
                            "industryIdentifiers": [
                                {"type": "ISBN_13", "identifier": "9780441172719"}
                            ],
                            "imageLinks": {"thumbnail": "https://books.google.com/covers/1.jpg"},
                        }
                    }
                ]
            }
        )

    client = SearchFakeClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    results = await service.buscar_texto("dune", 8)

    assert results[0].isbn13 == "9780441172719"
    assert results[0].title == "Dune"
    assert results[0].cover_url == "https://books.google.com/covers/1.jpg"
    assert len(client.calls) == 2


async def test_buscar_texto_resuelve_isbn10_a_isbn13():
    client = SearchFakeClient(
        side_effect=lambda url, params: _response(
            {
                "docs": [
                    {
                        "title": "Dune",
                        "author_name": ["Frank Herbert"],
                        "isbn": ["0441172717"],  # solo ISBN-10
                        "cover_i": 1,
                    }
                ]
            }
        )
    )
    service = ISBNLookupService(client=client)

    results = await service.buscar_texto("dune", 8)

    assert results[0].isbn13 == isbn10_a_isbn13("0441172717")
    assert results[0].isbn13 == "9780441172719"


async def test_buscar_texto_sin_isbn13_se_descarta():
    client = SearchFakeClient(
        side_effect=lambda url, params: _response(
            {"docs": [{"title": "Sin ISBN", "author_name": ["X"], "isbn": []}]}
        )
    )
    service = ISBNLookupService(client=client)

    results = await service.buscar_texto("sin isbn", 8)

    assert results == []


async def test_buscar_texto_cache_hit_sin_http():
    client = SearchFakeClient(
        side_effect=lambda url, params: _response(_openlibrary_search_payload())
    )
    service = ISBNLookupService(client=client)

    primero = await service.buscar_texto("dune", 8)
    segundo = await service.buscar_texto("dune", 8)

    assert primero == segundo
    assert len(client.calls) == 1  # segunda búsqueda no genera HTTP


async def test_buscar_texto_timeout_sin_reintentos():
    def side_effect(url, params=None):
        raise httpx.TimeoutException(f"timeout en {url}")

    client = SearchFakeClient(side_effect=side_effect)
    service = ISBNLookupService(client=client)

    results = await service.buscar_texto("dune", 8)

    assert results == []
    # Una llamada por fuente (Open Library + Google Books), sin reintentos.
    assert len(client.calls) == 2


async def test_buscar_texto_consulta_vacia_devuelve_lista_vacia():
    service = ISBNLookupService(client=SearchFakeClient())
    assert await service.buscar_texto("   ") == []


def test_isbn10_a_isbn13_conversion():
    assert isbn10_a_isbn13("0441172717") == "9780441172719"
    assert isbn10_a_isbn13("0-441-17271-7") == "9780441172719"
    assert isbn10_a_isbn13("no-es-isbn") is None
    assert isbn10_a_isbn13("123456789") is None
