"""Enums de la capa de schemas (feature 007)."""

from enum import Enum


class BookStatus(str, Enum):
    """Estado de lectura de un libro (columna `books.status`, enum `book_status`).

    Al ser `str, Enum` + `use_enum_values=True` en los modelos, OpenAPI genera
    `enum: ["want_to_read", "reading", "read"]` (strings), compatible con
    `z.enum([...])` en el frontend.
    """

    WANT_TO_READ = "want_to_read"
    READING = "reading"
    READ = "read"
