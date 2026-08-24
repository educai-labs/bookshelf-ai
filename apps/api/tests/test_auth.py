"""Tests de autenticación: `get_current_user` vía dependency override.

Usa una app FastAPI local (no la app real) para no contaminar sus rutas.
"""

import httpx
import pytest
from fastapi import Depends, FastAPI
from httpx import ASGITransport

from app.core.security import get_current_user

USER_ID = "00000000-0000-0000-0000-000000000001"

app = FastAPI()


@app.get("/secure")
async def secure(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.asyncio
async def test_get_current_user_mock(client):
    """Override de `get_current_user` → el endpoint devuelve el user_id mockeado."""

    async def fake_get_current_user() -> str:
        return USER_ID

    app.dependency_overrides[get_current_user] = fake_get_current_user
    try:
        resp = await client.get("/secure")
        assert resp.status_code == 200
        assert resp.json() == {"user_id": USER_ID}
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_protected_endpoint_requires_auth(client):
    """Sin token Bearer → 401 con detail estructurado (`code`)."""
    app.dependency_overrides.clear()
    resp = await client.get("/secure")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"
