"""Tests unitarios del backfill de portadas (feature 032).

Cubren: éxito y actualización exclusiva de ``cover_url``; error, timeout,
ausencia de portada y resultado no utilizable (conservando la portada previa);
deduplicación de ISBN-13 y reutilización del resultado; lotes, conteo de
intentos Open Library y resumen.
"""

import asyncio

import httpx
import pytest

from app.models.isbn import ISBNLookupResponse
from scripts.backfill_cover_urls import (
    CoverUrlBackfill,
    MissingEnvError,
    OpenLibraryRateLimiter,
    RateLimitedAsyncClient,
    _chunks,
    _es_url_utilizable,
    build_supabase_client,
)

GOOD_COVER = "https://covers.openlibrary.org/b/id/1-L.jpg"


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQueryBuilder:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._op = None
        self._payload = None
        self._filters = []

    def select(self, columns):
        return self

    def update(self, payload):
        self._op = "update"
        self._payload = payload
        return self

    def eq(self, column, value):
        self._filters.append((column, value))
        return self

    def execute(self):
        return self._db._execute(self)


class FakeSupabase:
    """Mini-PostgREST en memoria: solo lo que usa el backfill (select/update)."""

    def __init__(self, rows):
        self.books: dict[str, dict] = {row["id"]: dict(row) for row in rows}
        self.updates: list[tuple[str, str]] = []

    def table(self, name):
        return FakeQueryBuilder(self, name)

    def _execute(self, builder):
        if builder._op == "update":
            for col, value in builder._filters:
                if col == "id" and value in self.books:
                    self.books[value].update(builder._payload)
                    self.updates.append((value, builder._payload.get("cover_url")))
            return FakeResponse(data=[])
        return FakeResponse(data=list(self.books.values()))


class FakeLookupService:
    """Sustituto de `ISBNLookupService`: resultados o errores por ISBN."""

    def __init__(self, results=None, errors=None):
        self.results = results or {}
        self.errors = errors or {}
        self.calls: list[str] = []

    async def buscar(self, isbn: str):
        self.calls.append(isbn)
        if isbn in self.errors:
            raise self.errors[isbn]
        return self.results.get(isbn)


def _metadata(cover_url):
    return ISBNLookupResponse(title="T", authors=["A"], cover_url=cover_url)


# ---------------------------------------------------------------------------
# Éxito y actualización exclusiva de `cover_url`
# ---------------------------------------------------------------------------


async def test_backfill_exito_actualiza_solo_cover_url():
    db = FakeSupabase(
        [
            {
                "id": "id-1",
                "isbn13": "9788445001234",
                "cover_url": "https://covers.openlibrary.org/b/id/1-S.jpg",
                "title": "La Comunidad del Anillo",
            }
        ]
    )
    lookup = FakeLookupService(results={"9788445001234": _metadata(GOOD_COVER)})

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.total_books == 1
    assert summary.total_isbns == 1
    assert summary.updated == 1
    assert summary.preserved_no_cover == 0
    assert summary.preserved_error == 0
    assert summary.update_errors == 0

    row = db.books["id-1"]
    assert row["cover_url"] == GOOD_COVER
    # Solo se tocó `cover_url`: el resto de campos permanecen intactos.
    assert row["isbn13"] == "9788445001234"
    assert row["title"] == "La Comunidad del Anillo"


# ---------------------------------------------------------------------------
# Fail-soft: error, timeout, ausencia de portada, resultado no utilizable
# ---------------------------------------------------------------------------


async def test_backfill_error_de_lookup_conserva_portada():
    db = FakeSupabase(
        [{"id": "id-1", "isbn13": "9788445001234", "cover_url": "https://covers.example/old.jpg"}]
    )
    lookup = FakeLookupService(errors={"9788445001234": httpx.TimeoutException("timeout")})

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.preserved_error == 1
    assert summary.updated == 0
    assert db.books["id-1"]["cover_url"] == "https://covers.example/old.jpg"
    assert db.updates == []


async def test_backfill_sin_portada_conserva_portada():
    db = FakeSupabase(
        [{"id": "id-1", "isbn13": "9788445001234", "cover_url": "https://covers.example/old.jpg"}]
    )
    lookup = FakeLookupService(
        results={"9788445001234": ISBNLookupResponse(title="T", authors=["A"], cover_url=None)}
    )

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.preserved_no_cover == 1
    assert summary.updated == 0
    assert db.books["id-1"]["cover_url"] == "https://covers.example/old.jpg"


async def test_backfill_resultado_no_utilizable_conserva_portada():
    db = FakeSupabase(
        [{"id": "id-1", "isbn13": "9788445001234", "cover_url": "https://covers.example/old.jpg"}]
    )
    lookup = FakeLookupService(
        results={"9788445001234": ISBNLookupResponse(title="T", authors=["A"], cover_url="")}
    )

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.preserved_no_cover == 1
    assert summary.updated == 0
    assert db.books["id-1"]["cover_url"] == "https://covers.example/old.jpg"


async def test_backfill_ignora_filas_sin_isbn13():
    db = FakeSupabase(
        [
            {"id": "id-1", "isbn13": "9788445001234", "cover_url": "a"},
            {"id": "id-2", "isbn13": None, "cover_url": "b"},
        ]
    )
    lookup = FakeLookupService(results={"9788445001234": _metadata(GOOD_COVER)})

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.total_books == 1  # solo cuenta filas con ISBN-13
    assert summary.total_isbns == 1
    assert summary.updated == 1


# ---------------------------------------------------------------------------
# Deduplicación de ISBN-13 y actualización de todas las filas
# ---------------------------------------------------------------------------


async def test_backfill_deduplica_isbn13_y_actualiza_todas_las_filas():
    db = FakeSupabase(
        [
            {"id": "id-1", "isbn13": "9788445001234", "cover_url": "a"},
            {"id": "id-2", "isbn13": "9788445001234", "cover_url": "b"},
            {"id": "id-3", "isbn13": "9780000000001", "cover_url": "c"},
        ]
    )
    lookup = FakeLookupService(
        results={
            "9788445001234": _metadata("https://covers.openlibrary.org/b/id/1-L.jpg"),
            "9780000000001": _metadata("https://covers.openlibrary.org/b/id/2-L.jpg"),
        }
    )

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.total_books == 3
    assert summary.total_isbns == 2
    assert summary.updated == 3
    # Un único re-lookup por ISBN-13 (3 filas → 2 llamadas).
    assert lookup.calls == ["9788445001234", "9780000000001"]
    assert db.books["id-1"]["cover_url"] == "https://covers.openlibrary.org/b/id/1-L.jpg"
    assert db.books["id-2"]["cover_url"] == "https://covers.openlibrary.org/b/id/1-L.jpg"
    assert db.books["id-3"]["cover_url"] == "https://covers.openlibrary.org/b/id/2-L.jpg"


# ---------------------------------------------------------------------------
# Lotes, rate limiter y resumen
# ---------------------------------------------------------------------------


def test_chunks_en_lotes_documentados():
    assert _chunks([str(i) for i in range(120)], 50) == [
        [str(i) for i in range(50)],
        [str(i) for i in range(50, 100)],
        [str(i) for i in range(100, 120)],
    ]
    assert _chunks([], 50) == []


async def test_rate_limiter_cuenta_intentos_y_espera_ventana(monkeypatch):
    sleeps: list[float] = []

    async def fake_sleep(delay):
        sleeps.append(delay)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)

    limiter = OpenLibraryRateLimiter(max_per_window=3, window_seconds=60.0)
    for _ in range(3):
        await limiter.wait_if_needed()
    assert limiter.total_attempts == 3
    assert sleeps == []

    # El cuarto intento supera el límite → espera el resto de la ventana.
    await limiter.wait_if_needed()
    assert limiter.total_attempts == 4
    assert len(sleeps) == 1
    assert sleeps[0] > 0


class _RecordingInnerClient:
    """httpx.AsyncClient falso que registra las URLs solicitadas."""

    def __init__(self):
        self.urls: list[str] = []

    async def get(self, url, params=None, timeout=None, **kwargs):
        self.urls.append(url)
        return httpx.Response(200, json={})


async def test_client_limita_solo_open_library():
    limiter = OpenLibraryRateLimiter(max_per_window=2, window_seconds=60.0)
    inner = _RecordingInnerClient()
    client = RateLimitedAsyncClient(inner, limiter)

    await client.get("https://openlibrary.org/api/books", params={})
    await client.get("https://openlibrary.org/search.json", params={})
    await client.get("https://www.googleapis.com/books/v1/volumes", params={})

    # Solo los hosts de Open Library cuentan para el limitador.
    assert limiter.total_attempts == 2
    assert inner.urls == [
        "https://openlibrary.org/api/books",
        "https://openlibrary.org/search.json",
        "https://www.googleapis.com/books/v1/volumes",
    ]


async def test_resumen_agrega_categorias():
    db = FakeSupabase(
        [
            {"id": "id-1", "isbn13": "9788445001234", "cover_url": "a"},
            {"id": "id-2", "isbn13": "9780000000001", "cover_url": "b"},
            {"id": "id-3", "isbn13": "9780000000002", "cover_url": "c"},
        ]
    )
    lookup = FakeLookupService(
        results={"9788445001234": _metadata(GOOD_COVER)},
        errors={"9780000000001": httpx.TimeoutException("timeout")},
    )
    # 9780000000002 no está en results ni errors → `buscar` devuelve None (sin portada).

    summary = await CoverUrlBackfill(db, lookup).run()

    assert summary.total_books == 3
    assert summary.total_isbns == 3
    assert summary.updated == 1
    assert summary.preserved_error == 1
    assert summary.preserved_no_cover == 1

    rendered = summary.render()
    assert "actualizadas: 1" in rendered
    assert "error de lookup: 1" in rendered
    assert "ausencia de portada: 1" in rendered


# ---------------------------------------------------------------------------
# Credenciales de Supabase
# ---------------------------------------------------------------------------


def test_build_supabase_client_falta_url(monkeypatch):
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(MissingEnvError) as exc_info:
        build_supabase_client()
    assert exc_info.value.name == "SUPABASE_URL"


def test_build_supabase_client_falta_key(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    with pytest.raises(MissingEnvError) as exc_info:
        build_supabase_client()
    assert exc_info.value.name == "SUPABASE_SERVICE_ROLE_KEY"


def test_es_url_utilizable():
    assert _es_url_utilizable("https://covers.openlibrary.org/b/id/1-L.jpg")
    assert _es_url_utilizable("http://example.com/c.jpg")
    assert not _es_url_utilizable("")
    assert not _es_url_utilizable(None)
    assert not _es_url_utilizable("ftp://example.com/c.jpg")
    assert not _es_url_utilizable("   ")
