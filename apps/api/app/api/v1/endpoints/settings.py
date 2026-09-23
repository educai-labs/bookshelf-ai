"""Endpoints autenticados de preferencias de cuenta (feature 022).

Rutas bajo `/api/v1/settings`, todas con `Depends(get_current_user)` (el
`user_id` se extrae del JWT verificado; NUNCA se acepta `user_id` del cliente):

- `GET /api/v1/settings`: preferencias de cuenta (defaults si aún no hay fila).
- `PUT /api/v1/settings`: guarda preferencias de cuenta (upsert por `user_id`,
  validación Pydantic de enums/rangos/campos desconocidos).
- `GET /api/v1/settings/data`: qué datos se almacenan del usuario.
- `GET /api/v1/settings/export`: exporta libros y notas del usuario (JSON).
- `DELETE /api/v1/settings/account`: elimina la cuenta (server-side vía
  `auth.admin.delete_user`, cascada ON DELETE limpia libros/notas/preferencias).

Errores: `HTTPException` con `detail` estructurado `{code, message, field?}`
(convención `tech-stack.md`).
"""

from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from postgrest.exceptions import APIError
from supabase import Client

from app.core.database import get_supabase
from app.core.errors import map_supabase_error, raise_http_exception
from app.core.security import get_current_user
from app.models.settings import (
    AccountPreferences,
    AccountPreferencesUpdate,
    ExportData,
    StoredDataInfo,
)

router = APIRouter(prefix="/settings", tags=["settings"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _to_preferences(row: dict) -> AccountPreferences:
    """Convierte una fila de `account_preferences` a `AccountPreferences`."""
    return AccountPreferences(
        reader=(row.get("reader") or {}),
        chat=(row.get("chat") or {}),
        notifications=(row.get("notifications") or {}),
        privacy=(row.get("privacy") or {}),
    )


def _fetch_preferences_row(supabase: Client, user_id: str) -> dict | None:
    """Fila de `account_preferences` del usuario, o `None` si no existe."""
    try:
        resp = (
            supabase.table("account_preferences")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
    except APIError as exc:
        if exc.code in ("PGRST116", "406"):
            return None
        map_supabase_error(exc)
    if resp is None:  # defensivo
        return None
    return resp.data


def _upsert_preferences(
    supabase: Client,
    user_id: str,
    preferences: AccountPreferences,
) -> AccountPreferences:
    """Inserta o reemplaza las preferencias de cuenta y devuelve la versión guardada."""
    data = {
        "user_id": user_id,
        "reader": preferences.reader.model_dump(),
        "chat": preferences.chat.model_dump(),
        "notifications": preferences.notifications.model_dump(),
        "privacy": preferences.privacy.model_dump(),
    }
    try:
        resp = supabase.table("account_preferences").upsert(data, on_conflict="user_id").execute()
    except APIError as exc:
        map_supabase_error(exc)
    if not resp.data:
        raise_http_exception(
            "SETTINGS_SAVE_FAILED",
            "No se pudieron guardar las preferencias",
            status_code=500,
        )
    return _to_preferences(resp.data[0])


# ---------------------------------------------------------------------------
# GET /settings
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=AccountPreferences,
    summary="Obtener preferencias de cuenta",
    description=(
        "Devuelve las preferencias de cuenta del usuario autenticado. Si aún no "
        "tiene fila, devuelve los defaults (y los persiste vía upsert)."
    ),
)
async def get_settings(
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> AccountPreferences:
    """Preferencias del usuario; aplica defaults a usuarios sin fila."""
    row = _fetch_preferences_row(supabase, user_id)
    if row is None:
        return _upsert_preferences(supabase, user_id, AccountPreferences())
    return _to_preferences(row)


# ---------------------------------------------------------------------------
# PUT /settings
# ---------------------------------------------------------------------------


@router.put(
    "",
    response_model=AccountPreferences,
    summary="Guardar preferencias de cuenta",
    description=(
        "Reemplaza las preferencias de cuenta (upsert por `user_id`). Valida "
        "enums, rangos y rechaza campos desconocidos (Pydantic v2)."
    ),
)
async def update_settings(
    preferences_in: AccountPreferencesUpdate,
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> AccountPreferences:
    """Valida y persiste las preferencias (nunca acepta `user_id` del cliente)."""
    return _upsert_preferences(supabase, user_id, preferences_in)


# ---------------------------------------------------------------------------
# GET /settings/data
# ---------------------------------------------------------------------------


@router.get(
    "/data",
    response_model=StoredDataInfo,
    summary="Consultar datos almacenados",
    description=(
        "Devuelve cuántos libros y notas se almacenan, cuándo se actualizaron "
        "las preferencias y qué preferencias hay guardadas."
    ),
)
async def get_stored_data(
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> StoredDataInfo:
    """Agrega libros/notas y devuelve las preferencias guardadas."""
    books_count = _count(supabase, "books", user_id)
    notes_count = _count(supabase, "book_notes", user_id)
    row = _fetch_preferences_row(supabase, user_id)
    preferences = _to_preferences(row) if row is not None else AccountPreferences()
    updated_at = row.get("updated_at") if row else None
    return StoredDataInfo(
        books=books_count,
        notes=notes_count,
        preferences_updated_at=updated_at,
        preferences=preferences,
    )


# ---------------------------------------------------------------------------
# GET /settings/export
# ---------------------------------------------------------------------------


@router.get(
    "/export",
    response_model=ExportData,
    summary="Exportar libros y notas",
    description=(
        "Devuelve un JSON con todos los libros y notas del usuario (sin "
        "embeddings). Solo datos del usuario autenticado."
    ),
)
async def export_data(
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> ExportData:
    """Libros + notas del usuario (chunks con `chunk_index=0` y sin embeddings)."""
    books = _select_all(supabase, "books", user_id, "*")
    notes = _select_all(
        supabase,
        "book_notes",
        user_id,
        "id, book_id, content, content_html, chunk_index, created_at",
    )
    return ExportData(
        exported_at=datetime.now(UTC),
        books=books,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# DELETE /settings/account
# ---------------------------------------------------------------------------


@router.delete(
    "/account",
    status_code=204,
    summary="Eliminar cuenta",
    description=(
        "Elimina la cuenta del usuario autenticado (server-side vía "
        "`auth.admin.delete_user`). ON DELETE CASCADE limpia libros, notas y "
        "preferencias. No acepta `user_id` del cliente."
    ),
)
async def delete_account(
    supabase: Annotated[Client, Depends(get_supabase)],
    user_id: Annotated[str, Depends(get_current_user)],
) -> None:
    """Elimina la cuenta y devuelve 204 (o 404 si no existe)."""
    try:
        supabase.auth.admin.delete_user(user_id)
    except APIError as exc:
        map_supabase_error(exc)
    except Exception as exc:  # noqa: BLE001 — red/desconocido
        raise_http_exception(
            "ACCOUNT_DELETE_FAILED",
            f"No se pudo eliminar la cuenta: {exc}",
            status_code=500,
        )


# ---------------------------------------------------------------------------
# Helpers de datos
# ---------------------------------------------------------------------------


def _count(supabase: Client, table: str, user_id: str) -> int:
    """Nº de filas de una tabla para el usuario (head count)."""
    try:
        resp = supabase.table(table).select("id", count="exact").eq("user_id", user_id).execute()
    except APIError as exc:
        map_supabase_error(exc)
    return resp.count if resp.count is not None else 0


def _select_all(supabase: Client, table: str, user_id: str, columns: str) -> list[dict[str, Any]]:
    """Todas las filas (sin paginar) de una tabla para el usuario."""
    try:
        resp = supabase.table(table).select(columns).eq("user_id", user_id).execute()
    except APIError as exc:
        map_supabase_error(exc)
    return list(resp.data or [])
