"""Tests de integración del endpoint `GET /api/v1/ai/recommendations` (feature 018).

Usa `TestClient` con `dependency_overrides` (auth y Supabase) y mockea
`app.services.recommendations.get_recommendations` para probar el contrato HTTP
sin llamar a Gemini ni a la red:

- auth (401 sin token).
- respuesta 200 con `RecommendationResponse`.
- `limit` por defecto 5 y rango 1-10 (422 fuera de rango).
- propagación segura de errores de Supabase (mapeo a HTTP estructurado, sin
  exponer detalles internos).
- aislamiento por usuario: el `user_id` del JWT llega al servicio (nunca un
  identificador del cliente).
"""

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.core.database import get_supabase
from app.core.security import get_current_user
from app.main import app
from app.models.recommendations import RecommendationItem, RecommendationResponse
from app.services import recommendations as recommendations_service

USER_ID = "00000000-0000-0000-0000-000000000001"


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: USER_ID
    app.dependency_overrides[get_supabase] = lambda: object()
    yield TestClient(app)
    app.dependency_overrides.clear()


def _item(title="El nombre del viento"):
    return RecommendationItem(
        title=title, authors=["Patrick Rothfuss"], reason="Por su mundo rico.", confidence=0.87
    )


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


def test_recommendations_requiere_auth(client):
    app.dependency_overrides.pop(get_current_user, None)

    resp = client.get("/api/v1/ai/recommendations")

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"


# ---------------------------------------------------------------------------
# Respuesta y límites de `limit`
# ---------------------------------------------------------------------------


def test_recommendations_devuelve_respuesta(client, monkeypatch):
    async def fake(supabase, user_id, limit=5):
        return RecommendationResponse(recommendations=[_item()])

    monkeypatch.setattr(recommendations_service, "get_recommendations", fake)

    resp = client.get("/api/v1/ai/recommendations")

    assert resp.status_code == 200
    body = resp.json()
    assert body["recommendations"][0]["title"] == "El nombre del viento"
    assert body["recommendations"][0]["confidence"] == 0.87


def test_recommendations_limit_default_5(client, monkeypatch):
    captured = {}

    async def fake(supabase, user_id, limit=5):
        captured["limit"] = limit
        captured["user_id"] = user_id
        return RecommendationResponse(recommendations=[])

    monkeypatch.setattr(recommendations_service, "get_recommendations", fake)

    resp = client.get("/api/v1/ai/recommendations")

    assert resp.status_code == 200
    assert captured["limit"] == 5
    assert captured["user_id"] == USER_ID


def test_recommendations_limit_explicito(client, monkeypatch):
    captured = {}

    async def fake(supabase, user_id, limit=5):
        captured["limit"] = limit
        return RecommendationResponse(recommendations=[])

    monkeypatch.setattr(recommendations_service, "get_recommendations", fake)

    resp = client.get("/api/v1/ai/recommendations?limit=3")

    assert resp.status_code == 200
    assert captured["limit"] == 3


@pytest.mark.parametrize("limit", [0, 11, -1])
def test_recommendations_limit_fuera_de_rango_422(client, limit):
    resp = client.get(f"/api/v1/ai/recommendations?limit={limit}")

    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Propagación de errores
# ---------------------------------------------------------------------------


def test_recommendations_propaga_error_supabase(client, monkeypatch):
    async def boom(supabase, user_id, limit=5):
        raise APIError({"code": "DB_ERROR", "message": "boom", "details": ""})

    monkeypatch.setattr(recommendations_service, "get_recommendations", boom)

    resp = client.get("/api/v1/ai/recommendations")

    assert resp.status_code == 500
    assert resp.json()["detail"]["code"] == "DB_ERROR"
    # El mensaje estructurado no filtra el detalle interno del error.
    assert "boom" not in resp.json()["detail"]["message"]


def test_recommendations_migracion_ausente_503(client, monkeypatch):
    async def boom(supabase, user_id, limit=5):
        raise APIError(
            {
                "code": "PGRST205",
                "message": "Could not find the table 'public.books'",
                "details": "",
            }
        )

    monkeypatch.setattr(recommendations_service, "get_recommendations", boom)

    resp = client.get("/api/v1/ai/recommendations")

    assert resp.status_code == 503
    assert resp.json()["detail"]["code"] == "DB_MIGRATION_MISSING"


# ---------------------------------------------------------------------------
# No rompe el contrato SSE existente (regresión 017)
# ---------------------------------------------------------------------------


def test_chat_endpoint_sigue_registrado():
    """El router `ai` conserva el POST /chat junto al nuevo GET /recommendations."""
    paths = app.openapi()["paths"]
    assert "/api/v1/ai/chat" in paths
    assert "post" in paths["/api/v1/ai/chat"]
    assert "/api/v1/ai/recommendations" in paths
    assert "get" in paths["/api/v1/ai/recommendations"]
