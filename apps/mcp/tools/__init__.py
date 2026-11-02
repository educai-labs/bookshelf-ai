"""Registro de las 5 tools del servidor MCP (feature 019)."""

from __future__ import annotations

from fastmcp import FastMCP

from tools import ai, books, write


def register_tools(mcp: FastMCP) -> None:
    """Registra exactamente las 5 tools (2 lectura, 1 chat, 2 escritura)."""
    books.register(mcp)
    ai.register(mcp)
    write.register(mcp)
