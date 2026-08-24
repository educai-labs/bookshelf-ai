"""Seguridad: verificación JWT y dependency `get_current_user`.

Los tokens HS256 se verifican contra `SUPABASE_JWT_SECRET`. Los proyectos de
Supabase que usan claves asimétricas (ES256) se verifican contra el endpoint
JWKS público del proyecto.

`get_current_user` extrae el `sub` (user_id) del payload verificado y se usa
como `Depends(get_current_user)` en los endpoints protegidos (features 008-010).
"""

from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError

from app.core.config import settings

# HTTPBearer sin auto_error para poder emitir nuestro propio 401 con detail estructurado.
bearer_scheme = HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    url = settings.supabase_jwks_url or (
        f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    )
    return PyJWKClient(url)


def verify_jwt(token: str) -> dict:
    """Verifica un JWT Supabase HS256 o ES256.

    Devuelve el payload decodificado. Lanza `HTTPException` 401 si el token es
    inválido, ha expirado o el secret no coincide.
    """
    try:
        algorithm = jwt.get_unverified_header(token).get("alg")
        if algorithm == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={
                        "code": "JWT_SECRET_MISSING",
                        "message": "SUPABASE_JWT_SECRET no configurado en el servidor",
                    },
                )
            key = settings.supabase_jwt_secret
        elif algorithm == "ES256":
            key = _jwks_client().get_signing_key_from_jwt(token).key
        else:
            raise InvalidTokenError("algoritmo JWT no permitido")

        payload = jwt.decode(token, key, algorithms=[algorithm], audience="authenticated")
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Token expirado"},
        ) from exc
    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Token inválido"},
        ) from exc

    return payload


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> str:
    """Dependency: valida el Bearer token y devuelve el `user_id` (sub).

    Uso: `def endpoint(user_id: str = Depends(get_current_user))`.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "code": "NOT_AUTHENTICATED",
                "message": "Falta el header Authorization: Bearer <token>",
            },
        )

    payload = verify_jwt(credentials.credentials)
    return payload["sub"]
