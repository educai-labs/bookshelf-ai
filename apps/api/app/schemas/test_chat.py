"""Tests de los schemas de AI Chat (feature 007): happy path + casos inválidos."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import ChatRequest, ChatResponse


def test_chat_request_happy_path_book_mode():
    book_id = uuid4()
    req = ChatRequest(message="¿Qué dice el capítulo 2?", book_id=book_id, mode="book")
    assert req.message == "¿Qué dice el capítulo 2?"
    assert req.book_id == book_id
    assert req.mode == "book"


def test_chat_request_happy_path_library_mode():
    req = ChatRequest(message="Resumen de mi biblioteca", mode="library")
    assert req.mode == "library"
    assert req.book_id is None


def test_chat_request_default_mode_is_book():
    req = ChatRequest(message="hola")
    assert req.mode == "book"


@pytest.mark.parametrize("bad_message", ["", "x" * 4001])
def test_chat_request_message_bounds(bad_message):
    with pytest.raises(ValidationError):
        ChatRequest(message=bad_message, mode="book")


def test_chat_request_max_message_accepted():
    req = ChatRequest(message="x" * 4000, mode="book")
    assert len(req.message) == 4000


@pytest.mark.parametrize("bad_mode", ["books", "rag", 1, None])
def test_chat_request_invalid_mode_raises(bad_mode):
    with pytest.raises(ValidationError):
        ChatRequest(message="hola", mode=bad_mode)


def test_chat_response_happy_path():
    resp = ChatResponse(response="Respuesta generada", sources=["ref-1", "ref-2"], book_id=None)
    assert resp.response == "Respuesta generada"
    assert resp.sources == ["ref-1", "ref-2"]
    assert resp.book_id is None


def test_chat_response_sources_optional():
    resp = ChatResponse(response="Respuesta")
    assert resp.sources is None
