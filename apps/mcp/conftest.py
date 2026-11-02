"""Fixtures compartidas de la suite de tests del servidor MCP (feature 019).

- Ajusta el `sys.path` para importar tanto `apps/mcp` (módulos propios) como
  `apps/api` (backend reutilizado por import).
- `FakeSupabase`: mini PostgREST en memoria que replica lo que `db.py` usa
  (`select/eq/ilike/in_/order/single/insert/execute`), para probar el contrato
  completo sin red ni base de datos real.
"""

from __future__ import annotations

import re
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from postgrest.exceptions import APIError

# --- path setup (antes de importar módulos del proyecto) ---------------------

_MCP_DIR = Path(__file__).resolve().parent
_API_DIR = _MCP_DIR.parent / "api"
for _p in (str(_MCP_DIR), str(_API_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from config import MCPConfig
from db import Runtime, reset_runtime, set_runtime

USER_ID = "00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "99999999-9999-9999-9999-999999999999"


def _api_error(code: str, message: str = "") -> APIError:
    return APIError({"code": code, "message": message, "details": None, "hint": None})


class FakeResponse:
    """Equivalente a `postgrest.types.APIResponse` (`data` list/dict + `count`)."""

    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class FakeQuery:
    """Builder encadenable que resuelve en `execute()` contra tablas en memoria.

    `select()`/`insert()` devuelven un builder nuevo (filtros frescos); los
    filtros (`eq`/`ilike`/`in_`/`order`/`single`) mutan y devuelven `self`,
    replicando la semántica de postgrest-py/supabase-py.
    """

    def __init__(self, store: dict, table: str, op: str | None = None, payload=None):
        self._store = store
        self._table = table
        self._op = op
        self._payload = payload
        self._select = "*"
        self._filters: list[tuple] = []
        self._single = False
        self._order_col: str | None = None
        self._order_desc = False

    def select(self, columns: str = "*"):
        q = FakeQuery(self._store, self._table)
        q._select = columns
        return q

    def insert(self, payload):
        return FakeQuery(self._store, self._table, op="insert", payload=payload)

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def ilike(self, column, pattern):
        self._filters.append(("ilike", column, pattern))
        return self

    def in_(self, column, values):
        self._filters.append(("in", column, values))
        return self

    def order(self, column, desc=False):
        self._order_col = column
        self._order_desc = desc
        return self

    def single(self):
        self._single = True
        return self

    def _project(self, rows: list[dict]) -> list[dict]:
        if self._select == "*":
            return rows
        cols = [c.strip() for c in self._select.split(",")]
        return [{c: r[c] for c in cols if c in r} for r in rows]

    def execute(self) -> FakeResponse:
        rows = list(self._store.get(self._table, []))

        for op, col, val in self._filters:
            if op == "eq":
                rows = [r for r in rows if r.get(col) == val]
            elif op == "ilike":
                regex = "^" + re.escape(str(val)).replace("%", ".*") + "$"
                rows = [r for r in rows if re.match(regex, str(r.get(col) or ""), re.IGNORECASE)]
            elif op == "in":
                rows = [r for r in rows if r.get(col) in val]

        if self._op == "insert":
            payloads = [self._payload] if isinstance(self._payload, dict) else self._payload
            created: list[dict] = []
            for payload in payloads:
                row = dict(payload)
                row.setdefault("id", str(uuid.uuid4()))
                row.setdefault("created_at", datetime.now(UTC).isoformat())
                self._store.setdefault(self._table, []).append(row)
                created.append(row)
            return FakeResponse(created)

        rows = self._project(rows)

        if self._order_col:
            rows.sort(key=lambda r: r.get(self._order_col) or "", reverse=self._order_desc)

        if self._single:
            if not rows:
                raise _api_error("PGRST116")
            if len(rows) > 1:
                raise _api_error("406")
            return FakeResponse(rows[0])
        return FakeResponse(rows)


class FakeSupabase:
    """Supabase en memoria: `table(name)` → `FakeQuery` sobre listas de dicts."""

    def __init__(self, books=None, notes=None):
        self._store = {"books": list(books or []), "book_notes": list(notes or [])}

    def table(self, name: str) -> FakeQuery:
        return FakeQuery(self._store, name)

    def add_book(self, row: dict) -> None:
        self._store["books"].append(dict(row))

    def add_note(self, row: dict) -> None:
        self._store["book_notes"].append(dict(row))

    def all_books(self) -> list[dict]:
        return list(self._store["books"])

    def all_notes(self) -> list[dict]:
        return list(self._store["book_notes"])


# --- helpers de datos --------------------------------------------------------


def make_book(
    user_id: str,
    *,
    isbn13: str = "9788445001234",
    title: str = "La Comunidad del Anillo",
    authors=None,
    status: str = "want_to_read",
    rating=None,
    book_id: str | None = None,
) -> dict:
    return {
        "id": book_id or str(uuid.uuid4()),
        "user_id": user_id,
        "isbn13": isbn13,
        "title": title,
        "authors": authors if authors is not None else ["J. R. R. Tolkien"],
        "status": status,
        "rating": rating,
    }


def make_note(
    user_id: str,
    book_id: str,
    *,
    content: str = "Una nota",
    chunk_index: int = 0,
    created_at: str | None = None,
    note_id: str | None = None,
) -> dict:
    return {
        "id": note_id or str(uuid.uuid4()),
        "user_id": user_id,
        "book_id": book_id,
        "content": content,
        "content_html": "",
        "chunk_index": chunk_index,
        "embedding": [0.0] * 768,
        "created_at": created_at or datetime.now(UTC).isoformat(),
    }


# --- fixtures -----------------------------------------------------------------


@pytest.fixture
def fake_supabase():
    """Supabase en memoria vacío."""
    return FakeSupabase()


@pytest.fixture
def runtime(fake_supabase, monkeypatch):
    """Runtime global con el usuario de prueba y un Supabase fake."""
    config = MCPConfig(
        supabase_url="https://xyz.supabase.co",
        supabase_service_role_key="service-role-key",
        gemini_api_key="gemini-key",
        mcp_user_id=UUID(USER_ID),
    )
    rt = Runtime(config=config, supabase=fake_supabase)
    set_runtime(rt)
    yield rt
    reset_runtime()


@pytest.fixture
def mcp():
    """Servidor FastMCP con las 5 tools registradas (para probar el contrato)."""
    from fastmcp import FastMCP

    from tools import register_tools

    server = FastMCP(name="test", mask_error_details=True)
    register_tools(server)
    return server


@pytest.fixture(autouse=True)
def _reset_runtime_after_test():
    yield
    reset_runtime()
