r"""Modelos Pydantic v2 de preferencias de cuenta (feature 022).

Contrato estricto para `GET/PUT /api/v1/settings` y los endpoints de datos/
exportación/borrado. Los rangos y enums deben coincidir con los esquemas Zod del
frontend (`apps/web/src/lib/validations/settings.ts`) y con los defaults de
`apps/web/src/lib/settings/defaults.ts`.

Validaciones (convención `tech-stack.md`):
- `fontSize` 14–22, `lineWidth` 480–960, `lineHeight` 1.4–2.0 (leer).
- Enums: `font` (`system|serif|sans`), `initialMode` (`book|library`).
- `extra="forbid"` en todos los modelos de entrada: rechaza campos desconocidos.
"""

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReadingFont(str, Enum):
    """Fuente del área de lectura."""

    SYSTEM = "system"
    SERIF = "serif"
    SANS = "sans"


class ChatInitialMode(str, Enum):
    """Modo inicial del chat: libro o biblioteca completa (RAG)."""

    BOOK = "book"
    LIBRARY = "library"


class ReaderPreferences(BaseModel):
    """Preferencias del lector (sección 3.3)."""

    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    fontSize: int = Field(default=16, ge=14, le=22, description="Tamaño de texto (14-22 px)")
    lineWidth: int = Field(default=720, ge=480, le=960, description="Ancho del área (480-960 px)")
    lineHeight: float = Field(default=1.6, ge=1.4, le=2.0, description="Interlineado (1.4-2.0)")
    font: ReadingFont = ReadingFont.SYSTEM
    showBookDetails: bool = True
    confirmDeletions: bool = True


class ChatPreferences(BaseModel):
    """Preferencias del chat (sección 3.4). El modelo de IA no es configurable."""

    model_config = ConfigDict(extra="forbid", use_enum_values=True)

    initialMode: ChatInitialMode = ChatInitialMode.BOOK
    showHistory: bool = True
    clearHistoryOnLogout: bool = True
    respondInInterfaceLanguage: bool = True
    autoRecommendations: bool = True


class NotificationPreferences(BaseModel):
    """Preferencias de notificaciones (sección 3.5)."""

    model_config = ConfigDict(extra="forbid")

    errors: bool = True
    vectorizationDone: bool = True
    recommendations: bool = True
    account: bool = True


class PrivacyPreferences(BaseModel):
    """Preferencias de privacidad y datos (sección 3.6)."""

    model_config = ConfigDict(extra="forbid")

    useNotesForSearch: bool = True


class AccountPreferences(BaseModel):
    """Preferencias de cuenta agrupadas (lo que persiste en `account_preferences`)."""

    model_config = ConfigDict(extra="forbid")

    reader: ReaderPreferences = Field(default_factory=ReaderPreferences)
    chat: ChatPreferences = Field(default_factory=ChatPreferences)
    notifications: NotificationPreferences = Field(default_factory=NotificationPreferences)
    privacy: PrivacyPreferences = Field(default_factory=PrivacyPreferences)


class AccountPreferencesUpdate(AccountPreferences):
    """Payload de `PUT /api/v1/settings` (reemplazo completo, estricto).

    Se hereda de `AccountPreferences` para exigir los cuatro grupos completos;
    así el cliente siempre envía un estado consistente (no parciales inválidos).
    """


class StoredDataInfo(BaseModel):
    """Respuesta de `GET /api/v1/settings/data` (consulta de datos almacenados)."""

    books: int
    notes: int
    preferences_updated_at: datetime | None = None
    preferences: AccountPreferences


class ExportData(BaseModel):
    """Respuesta de `GET /api/v1/settings/export` (libros y notas)."""

    exported_at: datetime
    books: list[dict[str, Any]]
    notes: list[dict[str, Any]]
