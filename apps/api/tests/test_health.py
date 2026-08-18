"""Tests del health check (`GET /health` y `GET /api/v1/health`)."""

import pytest


@pytest.mark.asyncio
async def test_health_check(api_client):
    """Criterio: `GET /health` → 200 + `{"status": "ok"}`."""
    resp = await api_client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_check_versioned(api_client):
    """El health check también está disponible versionado en `/api/v1/health`."""
    resp = await api_client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_openapi_docs_available(api_client):
    """Criterio: OpenAPI docs accesibles en `/docs` y OpenAPI en `/openapi.json`."""
    resp = await api_client.get("/openapi.json")
    assert resp.status_code == 200
    paths = resp.json()["paths"]
    assert "/health" in paths
    assert "/api/v1/health" in paths
