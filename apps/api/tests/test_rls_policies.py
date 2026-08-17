"""Test de integración RLS: aislamiento por usuario en `books` y `book_notes`.

Verifica los criterios de aceptación de `spec/features/004-rls-policies/spec.md`
usando dos usuarios reales de Supabase Auth:

- Criterio 5: A inserta libro/nota; B consulta con su token -> 0 filas; A consulta -> filas propias.
- Criterio 6: INSERT/UPDATE/DELETE de B sobre datos de A -> bloqueados por RLS (42501 / 0 filas).
- Criterio 7: rol anónimo (sin login) no ve filas (auth.uid() = NULL).
- Criterio 8: `service_role` bypassea RLS automáticamente.

Requisitos:
- Proyecto Supabase remoto con la migración de RLS aplicada (004_rls_policies.sql).
- Variables de entorno (o `../../.env.local`): NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

Los usuarios de prueba se crean vía Admin API (`service_role`) y se borran al
final (ON DELETE CASCADE limpia sus libros/notas).
"""

import os
import uuid
from pathlib import Path

import httpx
import pytest

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_FILE = REPO_ROOT / ".env.local"

PASSWORD = "TestPass123!"
EMBEDDING_DIMS = 768


def _new_isbn13() -> str:
    """ISBN-13 válido: 13 dígitos (constraint `books_isbn13_format`)."""
    return f"978{uuid.uuid4().int % 10**10:010d}"


def _load_env() -> dict[str, str]:
    """Lee variables de entorno; si faltan, las carga desde `.env.local`."""
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip()
    return {key: os.environ.get(key, value) for key, value in env.items()}


def _headers(
    supabase: dict[str, str], token: str | None = None, service: bool = False
) -> dict[str, str]:
    """Headers de PostgREST/Auth. Sin token -> rol `anon` (auth.uid() = NULL)."""
    if service:
        return {"apikey": supabase["service"], "Authorization": f"Bearer {supabase['service']}"}
    auth = token or supabase["anon"]
    return {"apikey": supabase["anon"], "Authorization": f"Bearer {auth}"}


def _create_user(supabase: dict[str, str], email: str) -> str:
    """Crea un usuario confirmado vía Admin API (service_role)."""
    resp = httpx.post(
        f"{supabase['url']}/auth/v1/admin/users",
        headers=_headers(supabase, service=True),
        json={"email": email, "password": PASSWORD, "email_confirm": True},
        timeout=30,
    )
    assert resp.status_code in (
        200,
        201,
    ), f"admin create user falló: {resp.status_code} {resp.text}"
    return resp.json()["id"]


def _login(supabase: dict[str, str], email: str) -> str:
    """Login password grant -> access_token (rol authenticated)."""
    resp = httpx.post(
        f"{supabase['url']}/auth/v1/token?grant_type=password",
        headers=_headers(supabase),
        json={"email": email, "password": PASSWORD},
        timeout=30,
    )
    assert resp.status_code == 200, f"login falló: {resp.status_code} {resp.text}"
    return resp.json()["access_token"]


def _rest_post(
    supabase: dict[str, str],
    table: str,
    token: str | None,
    payload: dict,
    service: bool = False,
) -> httpx.Response:
    return httpx.post(
        f"{supabase['url']}/rest/v1/{table}",
        headers={
            **_headers(supabase, token, service=service),
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=payload,
        timeout=30,
    )


def _insert_book(supabase: dict[str, str], token: str | None, user_id: str) -> dict:
    isbn13 = _new_isbn13()
    resp = _rest_post(
        supabase,
        "books",
        token,
        {
            "user_id": user_id,
            "isbn13": isbn13,
            "title": "RLS Test Book",
            "authors": ["Test Author"],
        },
    )
    assert resp.status_code == 201, f"insert book falló: {resp.status_code} {resp.text}"
    return resp.json()[0]


def _insert_note(supabase: dict[str, str], token: str | None, user_id: str, book_id: str) -> dict:
    resp = _rest_post(
        supabase,
        "book_notes",
        token,
        {
            "user_id": user_id,
            "book_id": book_id,
            "content": "Nota de prueba RLS.",
            "content_html": "<p>Nota de prueba RLS.</p>",
            "chunk_index": 0,
            "embedding": [0.0] * EMBEDDING_DIMS,
        },
    )
    assert resp.status_code == 201, f"insert note falló: {resp.status_code} {resp.text}"
    return resp.json()[0]


@pytest.fixture(scope="module")
def supabase() -> dict[str, str]:
    env = _load_env()
    url = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    return {
        "url": url,
        "anon": env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        "service": env["SUPABASE_SERVICE_ROLE_KEY"],
    }


@pytest.fixture(scope="module")
def users(supabase: dict[str, str]):
    """Usuarios A y B reales de Supabase Auth. Se borran al final (cascade)."""
    email_a = f"rls_{uuid.uuid4().hex[:12]}@bookshelf.test"
    email_b = f"rls_{uuid.uuid4().hex[:12]}@bookshelf.test"
    id_a = _create_user(supabase, email_a)
    id_b = _create_user(supabase, email_b)
    token_a = _login(supabase, email_a)
    token_b = _login(supabase, email_b)
    try:
        yield {"id_a": id_a, "id_b": id_b, "token_a": token_a, "token_b": token_b}
    finally:
        for uid in (id_a, id_b):
            try:
                httpx.delete(
                    f"{supabase['url']}/auth/v1/admin/users/{uid}",
                    headers=_headers(supabase, service=True),
                    timeout=30,
                )
            except httpx.HTTPError:
                pass


@pytest.fixture(scope="module")
def data_a(supabase: dict[str, str], users: dict):
    """1 libro + 1 nota insertados como usuario A."""
    book = _insert_book(supabase, users["token_a"], users["id_a"])
    note = _insert_note(supabase, users["token_a"], users["id_a"], book["id"])
    return {"book": book, "note": note}


# ---------------------------------------------------------------------------
# Criterio 5: aislamiento de lectura entre usuarios
# ---------------------------------------------------------------------------


def test_a_inserta_y_ve_sus_filas(supabase: dict[str, str], users: dict, data_a: dict):
    """A consulta books y book_notes -> 1 fila cada tabla."""
    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books",
        headers=_headers(supabase, users["token_a"]),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1, f"A debería ver 1 libro, vio {len(resp.json())}"

    resp = httpx.get(
        f"{supabase['url']}/rest/v1/book_notes",
        headers=_headers(supabase, users["token_a"]),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1, f"A debería ver 1 nota, vio {len(resp.json())}"


def test_b_no_ve_filas_de_a(supabase: dict[str, str], users: dict, data_a: dict):
    """B consulta books y book_notes -> 0 filas (aislamiento RLS)."""
    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books",
        headers=_headers(supabase, users["token_b"]),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert resp.json() == [], f"B no debería ver libros de A: {resp.json()}"

    resp = httpx.get(
        f"{supabase['url']}/rest/v1/book_notes",
        headers=_headers(supabase, users["token_b"]),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert resp.json() == [], f"B no debería ver notas de A: {resp.json()}"


def test_anon_no_ve_nada(supabase: dict[str, str], data_a: dict):
    """Criterio 7: rol anónimo (auth.uid() = NULL) -> 0 filas."""
    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books",
        headers=_headers(supabase),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert resp.json() == [], f"anon no debería ver filas: {resp.json()}"


# ---------------------------------------------------------------------------
# Criterio 6: escritura cruzada bloqueada (INSERT / UPDATE / DELETE)
# ---------------------------------------------------------------------------


def test_b_no_puede_insertar_como_a(supabase: dict[str, str], users: dict, data_a: dict):
    """INSERT de B con user_id de A -> WITH CHECK falla (42501 / 403)."""
    resp = _rest_post(
        supabase,
        "books",
        users["token_b"],
        {
            "user_id": users["id_a"],  # intento de suplantación
            "isbn13": _new_isbn13(),
            "title": "Hacked",
            "authors": ["Evil"],
        },
    )
    assert resp.status_code in (
        42501,
        403,
    ), f"B no debería poder insertar filas de A: {resp.status_code} {resp.text}"


def test_b_no_puede_actualizar_filas_de_a(supabase: dict[str, str], users: dict, data_a: dict):
    """UPDATE de B sobre libro de A -> 42501 o 0 filas; el dato no cambia."""
    book_id = data_a["book"]["id"]
    resp = httpx.patch(
        f"{supabase['url']}/rest/v1/books?id=eq.{book_id}",
        headers={**_headers(supabase, users["token_b"]), "Content-Type": "application/json"},
        json={"title": "Hacked"},
        timeout=30,
    )
    assert resp.status_code in (
        204,
        42501,
        403,
    ), f"UPDATE de B debería bloquearse: {resp.status_code} {resp.text}"

    # El título sigue intacto para A
    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books?id=eq.{book_id}",
        headers=_headers(supabase, users["token_a"]),
        params={"select": "title"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert resp.json()[0]["title"] == "RLS Test Book", "El UPDATE de B modificó datos de A"


def test_b_no_puede_borrar_filas_de_a(supabase: dict[str, str], users: dict, data_a: dict):
    """DELETE de B sobre libro de A -> 0 filas afectadas; A sigue viéndolo."""
    book_id = data_a["book"]["id"]
    resp = httpx.delete(
        f"{supabase['url']}/rest/v1/books?id=eq.{book_id}",
        headers=_headers(supabase, users["token_b"]),
        timeout=30,
    )
    assert resp.status_code in (204, 404), f"DELETE de B inesperado: {resp.status_code} {resp.text}"

    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books?id=eq.{book_id}",
        headers=_headers(supabase, users["token_a"]),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert len(resp.json()) == 1, "El DELETE de B eliminó datos de A"


# ---------------------------------------------------------------------------
# Criterio 8: service_role bypassea RLS automáticamente
# ---------------------------------------------------------------------------


def test_service_role_bypassea_rls(supabase: dict[str, str], users: dict, data_a: dict):
    """service_role inserta/lee sin restricciones; B no ve esos datos de A."""
    # Insertar libro para A usando service_role (operación de sistema)
    isbn13 = _new_isbn13()
    resp = _rest_post(
        supabase,
        "books",
        None,
        {
            "user_id": users["id_a"],
            "isbn13": isbn13,
            "title": "Service Role Book",
            "authors": ["System"],
        },
        service=True,
    )
    assert resp.status_code == 201, f"service_role insert falló: {resp.status_code} {resp.text}"

    # service_role ve TODAS las filas (bypass RLS)
    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books",
        headers=_headers(supabase, service=True),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    ids = [row["id"] for row in resp.json()]
    assert data_a["book"]["id"] in ids, "service_role debería ver el libro de A"
    assert len(ids) >= 2, "service_role debería ver al menos 2 libros (fixture A + insert)"

    # B sigue sin ver datos de A (ni los insertados por service_role)
    resp = httpx.get(
        f"{supabase['url']}/rest/v1/books",
        headers=_headers(supabase, users["token_b"]),
        params={"select": "id"},
        timeout=30,
    )
    assert resp.status_code == 200
    assert resp.json() == [], f"B no debería ver libros de A: {resp.json()}"
