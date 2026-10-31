"""Backfill administrativo de URLs de portada (feature 032).

Comando asíncrono de **una sola ejecución** (nunca se expone como endpoint ni se
lanza durante el arranque de FastAPI) que re-hace el lookup por ISBN-13 de los
libros ya guardados y actualiza **únicamente** `books.cover_url` cuando el
re-lookup devuelve una portada utilizable. Si el re-lookup falla (red, timeout,
rate limit, 404) o no devuelve portada, la fila conserva intacta su portada
actual: nunca degrada, nunca borra y nunca toca otros campos.

Uso::

    cd apps/api
    python scripts/backfill_cover_urls.py [--batch-size 50]

Variables de entorno requeridas (nunca se registran ni se imprimen):

- ``SUPABASE_URL``: URL del proyecto Supabase.
- ``SUPABASE_SERVICE_ROLE_KEY``: clave `service_role` (solo backend; bypassa RLS).

Comportamiento:

- Lee ``id``, ``isbn13`` y ``cover_url`` de ``books`` con el cliente
  ``service_role``.
- Deduplica ISBN-13 en memoria (mismo ISBN → un solo re-lookup) y reutiliza el
  ``ISBNLookupService`` compartido (una única instancia con su caché TTL de
  1 hora).
- Procesa por lotes documentados de hasta 50 ISBN únicos (parámetro
  ``--batch-size``).
- Limita Open Library a como máximo 100 solicitudes por ventana de 60 segundos,
  contando cada intento HTTP (incluidos reintentos y el fallback ``search.json``)
  y esperando la siguiente ventana antes de continuar.
- Fail-soft por fila: ante error, timeout, rate limit, ausencia de portada o
  resultado no utilizable, la fila queda intacta (sin ``upsert`` ni ``UPDATE``
  global).

Al finalizar imprime un resumen con libros procesados, ISBN únicos, portadas
actualizadas, conservadas por fallo/ausencia de portada y errores de
actualización.

Sin ejecución automática: este script solo se ejecuta manualmente, desde el
backend, contra el entorno autorizado.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

# Al ejecutar `python scripts/backfill_cover_urls.py` directamente, añade
# `apps/api` al `sys.path` para poder importar el paquete `app`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from supabase import create_client

from app.services.isbn_lookup import HTTP_TIMEOUT, ISBNLookupService

DEFAULT_BATCH_SIZE = 50
OPEN_LIBRARY_MAX_PER_WINDOW = 100
OPEN_LIBRARY_WINDOW_SECONDS = 60.0

# URLs/parámetros "utilizables": cadena no vacía con scheme http(s).
_UTILIZABLE_PREFIXES = ("http://", "https://")


class MissingEnvError(RuntimeError):
    """Falta una variable de entorno requerida para ejecutar el backfill."""

    def __init__(self, name: str) -> None:
        self.name = name
        super().__init__(
            f"Falta la variable de entorno requerida '{name}'. "
            "Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY antes de ejecutar el backfill."
        )


@dataclass
class BackfillSummary:
    """Resultado agregado de una ejecución del backfill."""

    total_books: int = 0
    total_isbns: int = 0
    updated: int = 0
    preserved_no_cover: int = 0
    preserved_error: int = 0
    update_errors: int = 0

    def render(self) -> str:
        """Resumen legible para el operador."""
        return (
            "Backfill de portadas finalizado:\n"
            f"  - Libros procesados: {self.total_books} (ISBN únicos: {self.total_isbns})\n"
            f"  - Portadas actualizadas: {self.updated}\n"
            f"  - Conservadas por ausencia de portada: {self.preserved_no_cover}\n"
            f"  - Conservadas por error de lookup: {self.preserved_error}\n"
            f"  - Errores de actualización: {self.update_errors}"
        )


def _es_url_utilizable(url: Any) -> bool:
    """True si `url` es una cadena no vacía con scheme http(s)."""
    if not isinstance(url, str):
        return False
    url = url.strip()
    return url.startswith(_UTILIZABLE_PREFIXES)


def build_supabase_client(url: str | None = None, key: str | None = None) -> Any:
    """Construye el cliente Supabase ``service_role``; falla si faltan credenciales.

    Nunca registra ni imprime los valores de las credenciales.
    """
    url = url or os.getenv("SUPABASE_URL")
    key = key or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url:
        raise MissingEnvError("SUPABASE_URL")
    if not key:
        raise MissingEnvError("SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


class OpenLibraryRateLimiter:
    """Ventana fija: máximo `max_per_window` intentos por `window_seconds` segundos.

    Cuenta cada intento HTTP a Open Library (incluidos los reintentos del
    ``ISBNLookupService`` y el fallback ``search.json``) y, al alcanzar el
    límite, espera hasta el inicio de la siguiente ventana antes de continuar.
    """

    def __init__(
        self,
        max_per_window: int = OPEN_LIBRARY_MAX_PER_WINDOW,
        window_seconds: float = OPEN_LIBRARY_WINDOW_SECONDS,
    ) -> None:
        self._max = max_per_window
        self._window = window_seconds
        self._window_start = time.monotonic()
        self._attempts = 0
        self.total_attempts = 0

    async def wait_if_needed(self) -> None:
        """Registra un intento, esperando la siguiente ventana si es necesario."""
        now = time.monotonic()
        elapsed = now - self._window_start
        if elapsed >= self._window:
            self._window_start = now
            self._attempts = 0
        elif self._attempts >= self._max:
            await asyncio.sleep(self._window - elapsed)
            self._window_start = time.monotonic()
            self._attempts = 0
        self._attempts += 1
        self.total_attempts += 1


class RateLimitedAsyncClient:
    """Envuelve un ``httpx.AsyncClient`` contando cada intento HTTP a Open Library.

    Cada llamada a ``get()`` contra un host de Open Library pasa antes por el
    ``OpenLibraryRateLimiter`` (que cuenta el intento y espera si se supera el
    límite). El resto de hosts (Google Books) no se limita ni se cuenta.
    """

    def __init__(self, client: httpx.AsyncClient, limiter: OpenLibraryRateLimiter) -> None:
        self._client = client
        self._limiter = limiter

    @staticmethod
    def _is_open_library(url: str) -> bool:
        return "openlibrary.org" in url

    async def get(self, url: str, params: dict | None = None, timeout: Any = None, **kwargs: Any):
        if self._is_open_library(url):
            await self._limiter.wait_if_needed()
        return await self._client.get(url, params=params, timeout=timeout, **kwargs)

    async def aclose(self) -> None:
        await self._client.aclose()


class CoverUrlBackfill:
    """Orquesta el backfill: leer → agrupar por ISBN → re-lookup → actualizar."""

    def __init__(
        self,
        supabase: Any,
        lookup_service: Any,
        batch_size: int = DEFAULT_BATCH_SIZE,
    ) -> None:
        self.supabase = supabase
        self.lookup_service = lookup_service
        self.batch_size = batch_size
        self.summary = BackfillSummary()

    async def run(self) -> BackfillSummary:
        """Ejecuta el backfill completo y devuelve el resumen agregado."""
        rows = self._read_books()
        grouped = self._group_by_isbn13(rows)
        self.summary.total_books = len(rows)
        self.summary.total_isbns = len(grouped)

        isbns = list(grouped)
        for batch in _chunks(isbns, self.batch_size):
            for isbn13 in batch:
                await self._process_isbn(isbn13, grouped[isbn13])

        return self.summary

    def _read_books(self) -> list[dict[str, Any]]:
        """Lee ``id``, ``isbn13`` y ``cover_url`` de ``books`` (service_role)."""
        resp = self.supabase.table("books").select("id, isbn13, cover_url").execute()
        rows = resp.data or []
        return [row for row in rows if row.get("isbn13")]

    @staticmethod
    def _group_by_isbn13(rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
        """Agrupa las filas por ISBN-13 (deduplicación en memoria)."""
        grouped: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            isbn = row.get("isbn13")
            if not isbn:
                continue
            grouped.setdefault(isbn, []).append(row)
        return grouped

    async def _process_isbn(self, isbn13: str, rows: list[dict[str, Any]]) -> None:
        """Re-lookup de un ISBN y actualización de sus filas (fail-soft)."""
        try:
            metadata = await self.lookup_service.buscar(isbn13)
        except Exception as exc:  # noqa: BLE001 - fail-soft: cualquier error conserva la fila
            self.summary.preserved_error += len(rows)
            print(f"[conservada] {isbn13}: error de lookup ({exc.__class__.__name__})")
            return

        new_url = getattr(metadata, "cover_url", None)
        if not _es_url_utilizable(new_url):
            self.summary.preserved_no_cover += len(rows)
            print(f"[conservada] {isbn13}: sin portada utilizable")
            return

        for row in rows:
            if await self._update_cover_url(row["id"], new_url):
                self.summary.updated += 1
            else:
                self.summary.update_errors += 1
        print(f"[actualizada] {isbn13}: {new_url}")

    async def _update_cover_url(self, row_id: str, new_url: str) -> bool:
        """``UPDATE books SET cover_url = ... WHERE id = ...`` (solo esa columna)."""
        try:
            self.supabase.table("books").update({"cover_url": new_url}).eq("id", row_id).execute()
            return True
        except Exception:  # noqa: BLE001 - un fallo de escritura no aborta el backfill
            return False


def _chunks(items: list[str], size: int) -> list[list[str]]:
    """Trocea `items` en lotes de hasta `size` elementos."""
    return [items[i : i + size] for i in range(0, len(items), size)]


async def run_backfill(
    supabase: Any, lookup_service: Any, batch_size: int = DEFAULT_BATCH_SIZE
) -> BackfillSummary:
    """Ejecuta el backfill y devuelve su resumen (conveniencia para tests)."""
    return await CoverUrlBackfill(supabase, lookup_service, batch_size).run()


def _build_service() -> tuple[httpx.AsyncClient, OpenLibraryRateLimiter, ISBNLookupService]:
    """Construye un ``ISBNLookupService`` con cliente limitado a Open Library."""
    http_client = httpx.AsyncClient(timeout=HTTP_TIMEOUT, follow_redirects=True)
    limiter = OpenLibraryRateLimiter()
    service = ISBNLookupService(client=RateLimitedAsyncClient(http_client, limiter))
    return http_client, limiter, service


async def _main(args: argparse.Namespace) -> int:
    """Punto de entrada asíncrono: cliente + servicio + backfill + resumen."""
    try:
        supabase = build_supabase_client()
    except MissingEnvError as exc:
        print(str(exc))
        return 1

    http_client, limiter, service = _build_service()
    try:
        summary = await run_backfill(supabase, service, batch_size=args.batch_size)
    finally:
        await http_client.aclose()

    print(summary.render())
    print(f"(intentos HTTP a Open Library: {limiter.total_attempts})")
    return 0


def main() -> int:
    """Entrada CLI síncrona."""
    parser = argparse.ArgumentParser(description="Backfill administrativo de URLs de portada.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"ISBN únicos por lote (default {DEFAULT_BATCH_SIZE}).",
    )
    args = parser.parse_args()
    return asyncio.run(_main(args))


if __name__ == "__main__":  # pragma: no cover - ejecución manual
    raise SystemExit(main())
