"""Tests de autenticación: mock de `get_current_user` vía dependency override.

El endpoint protegido es un placeholder registrado sobre la app importada
(los endpoints reales protegidos llegan en features 008-010). Aquí solo se
verifica que `Depends(get_current_user)` funciona con override.
"""

import pytest
from fastapi import Depends

from app.core.security import get_current_user
from app.main import app

USER_ID = "00000000-0000-0000-0000-000000000001"


# Placeholder: endpoint protegido (mismo patrón que usarán features 008-010).
@app.get("/api/v1/secure")
async def secure_placeholder(user_id: str = Depends(get_current_user)):
    return {"user_id": user_id}


@pytest.mark.asyncio
async def test_get_current_user_mock(api_client):
    """Override de `get_current_user` → el endpoint devuelve el user_id mockeado."""

    async def fake_get_current_user() -> str:
        return USER_ID

    app.dependency_overrides[get_current_user] = fake_get_current_user
    try:
        resp = await api_client.get("/api/v1/secure")
        assert resp.status_code == 200
        assert resp.json() == {"user_id": USER_ID}
    finally:
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_protected_endpoint_requires_auth(api_client):
    """Sin token Bearer → 401 con detail estructurado (`code`)."""
    app.dependency_overrides.clear()
    resp = await api_client.get("/api/v1/secure")
    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "NOT_AUTHENTICATED"
