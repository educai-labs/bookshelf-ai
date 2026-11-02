"""Tests de `chat_with_library` (feature 019).

Cubren modo libro, modo RAG global, consumo completo del stream (respuesta
única no vacía), libro ajeno/inexistente y fallos de Gemini/RPC/timeout sin
stack trace. Se mockea el servicio de chat del backend.
"""

from __future__ import annotations

import asyncio
import types

import pytest
from google.api_core.exceptions import GoogleAPIError
from postgrest.exceptions import APIError

from conftest import OTHER_USER_ID, USER_ID, make_book
from errors import ErrorCode, MCPError
from tools import ai


async def _yield(*tokens):
    for token in tokens:
        yield token


def _service(**overrides) -> types.SimpleNamespace:
    ns = types.SimpleNamespace(
        load_book=lambda supabase, user_id, book_id: {
            "id": str(book_id),
            "title": "T",
            "authors": ["A"],
        },
        load_book_notes=lambda supabase, user_id, book_id: [{"content": "nota", "chunk_index": 0}],
        build_book_prompt=lambda book, notes, language=None: "prompt-libro",
        embed_query=lambda query: [0.1] * 768,
        match_notes=lambda supabase, embedding, user_id: [],
        build_rag_prompt=lambda results, language=None: "prompt-rag",
        stream_chat_tokens=lambda prompt: _yield("hola", " mundo"),
    )
    for key, value in overrides.items():
        setattr(ns, key, value)
    return ns


async def test_chat_modo_libro_consume_stream_completo(runtime, fake_supabase, mcp, monkeypatch):
    book = make_book(USER_ID)
    fake_supabase.add_book(book)
    monkeypatch.setattr(
        ai, "chat_service", _service(stream_chat_tokens=lambda p: _yield("La", " resp", "uesta"))
    )

    result = await mcp.call_tool("chat_with_library", {"query": "¿tema?", "book_id": book["id"]})
    assert result.structured_content == {"answer": "La respuesta"}


async def test_chat_modo_rag_sin_book_id(runtime, fake_supabase, mcp, monkeypatch):
    monkeypatch.setattr(ai, "chat_service", _service())

    result = await mcp.call_tool("chat_with_library", {"query": "biblioteca"})
    assert result.structured_content["answer"] == "hola mundo"


async def test_chat_libro_ajeno_o_inexistente(runtime, fake_supabase, mcp, monkeypatch):
    ajeno = make_book(OTHER_USER_ID)
    fake_supabase.add_book(ajeno)
    monkeypatch.setattr(ai, "chat_service", _service(load_book=lambda s, u, b: None))

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("chat_with_library", {"query": "x", "book_id": ajeno["id"]})
    assert exc_info.value.code == ErrorCode.BOOK_NOT_FOUND


async def test_chat_book_id_uuid_invalido(runtime, mcp, monkeypatch):
    monkeypatch.setattr(ai, "chat_service", _service())
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("chat_with_library", {"query": "x", "book_id": "no-uuid"})
    assert exc_info.value.code == ErrorCode.INVALID_UUID


async def test_chat_fallo_gemini_sin_stack_trace(runtime, mcp, monkeypatch):
    def _boom(prompt):
        raise GoogleAPIError("AIza-SECRETO detalle interno")

    async def _boom_stream(prompt):
        raise GoogleAPIError("AIza-SECRETO detalle interno")
        yield  # pragma: no cover

    monkeypatch.setattr(ai, "chat_service", _service(stream_chat_tokens=_boom_stream))

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("chat_with_library", {"query": "x"})
    err = exc_info.value
    assert err.code == ErrorCode.GEMINI_ERROR
    assert "AIza-SECRETO" not in err.message
    assert "Traceback" not in err.message


async def test_chat_fallo_rpc_sin_detalle_de_conexion(runtime, mcp, monkeypatch):
    def _boom_rpc(supabase, embedding, user_id):
        raise APIError({"code": "42P01", "message": "connection refused host=db"})

    monkeypatch.setattr(ai, "chat_service", _service(match_notes=_boom_rpc))

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("chat_with_library", {"query": "x"})
    err = exc_info.value
    assert err.code == ErrorCode.DB_ERROR
    assert "connection refused" not in err.message


async def test_chat_timeout(runtime, mcp, monkeypatch):
    async def _hang(prompt):
        await asyncio.sleep(1)
        yield "tarde"  # pragma: no cover

    monkeypatch.setattr(ai, "CHAT_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(ai, "chat_service", _service(stream_chat_tokens=_hang))

    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("chat_with_library", {"query": "x"})
    assert exc_info.value.code == ErrorCode.TIMEOUT


async def test_chat_query_vacia(runtime, mcp):
    with pytest.raises(MCPError) as exc_info:
        await mcp.call_tool("chat_with_library", {"query": "   "})
    assert exc_info.value.code == ErrorCode.VALIDATION
