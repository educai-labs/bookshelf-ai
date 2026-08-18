"""Fixtures compartidas para la suite de tests de la API.

`api_client`: cliente `httpx.AsyncClient` con `ASGITransport` (sin red real,
sin lifespan) apuntando a la app FastAPI importada.
"""

import httpx
import pytest
from httpx import ASGITransport

from app.main import app


@pytest.fixture
def api_client():
    """Cliente HTTP async contra la app FastAPI (transport ASGI, sin red)."""
    transport = ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://test")
