"""Tool de chat IA: `chat_with_library` (modo libro o RAG global, feature 019).

Reutiliza por import el servicio de chat del backend (`app.services.chat`),
conservando prompts, RPC y umbrales, y consume el iterador de tokens hasta
reunir una **respuesta completa** (el protocolo MCP no expone streaming).
"""

from __future__ import annotations

import asyncio

from app.services import chat as chat_service
from fastmcp import FastMCP
from pydantic import ValidationError

from db import get_runtime
from errors import ErrorCode, map_exception, parse_uuid, raise_error, to_validation_error
from schemas import ChatResponse, ChatWithLibraryRequest

# Timeout total de la generación (mismo presupuesto que la web, spec 017).
CHAT_TIMEOUT_SECONDS = 60.0


def register(mcp: FastMCP) -> None:
    """Registra la tool de chat en el servidor."""

    @mcp.tool()
    async def chat_with_library(query: str, book_id: str | None = None) -> ChatResponse:
        """Responde una pregunta sobre la biblioteca del usuario.

        Con `book_id` responde en modo libro (contexto del libro y sus notas);
        sin `book_id` responde en modo RAG sobre toda la biblioteca. Devuelve la
        respuesta completa en un único texto.
        """
        try:
            request = ChatWithLibraryRequest(query=query, book_id=book_id)
        except ValidationError as exc:
            raise to_validation_error(exc) from None

        runtime = get_runtime()

        try:
            async with asyncio.timeout(CHAT_TIMEOUT_SECONDS):
                if request.book_id is not None:
                    book_uuid = parse_uuid(request.book_id, field="book_id")
                    book = chat_service.load_book(runtime.supabase, runtime.user_id, book_uuid)
                    if book is None:
                        raise_error(
                            ErrorCode.BOOK_NOT_FOUND,
                            "El libro no existe o no pertenece al usuario.",
                        )
                    notes = chat_service.load_book_notes(
                        runtime.supabase, runtime.user_id, book_uuid
                    )
                    prompt = chat_service.build_book_prompt(book, notes)
                else:
                    embedding = await asyncio.to_thread(chat_service.embed_query, request.query)
                    results = chat_service.match_notes(runtime.supabase, embedding, runtime.user_id)
                    prompt = chat_service.build_rag_prompt(results)

                tokens: list[str] = []
                async for token in chat_service.stream_chat_tokens(prompt):
                    tokens.append(token)
        except Exception as exc:  # noqa: BLE001 — convertido a error MCP estructurado
            raise map_exception(exc) from None

        return ChatResponse(answer="".join(tokens))
