"""Seguridad: verificación JWT HS256 y dependency `get_current_user`.

Los tokens emitidos por Supabase Auth se verifican contra
`SUPABASE_JWT_SECRET` (HS256) con PyJWT, sin llamar a Supabase.

`get_current_user` extrae el `sub` (user_id) del payload verificado y se usa
como `Depends(get_current_user)` en los endpoints protegidos (features 008-010).
"""

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

# HTTPBearer sin auto_error para poder emitir nuestro propio 401 con detail estructurado.
bearer_scheme = HTTPBearer(auto_error=False)


def verify_jwt(token: str) -> dict:
    """Verifica un JWT HS256 contra `SUPABASE_JWT_SECRET`.

    Devuelve el payload decodificado. Lanza `HTTPException` 401 si el token es
    inválido, ha expirado o el secret no coincide.
    """
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "JWT_SECRET_MISSING",
                "message": "SUPABASE_JWT_SECRET no configurado en el servidor",
            },
        )

    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "TOKEN_EXPIRED", "message": "Token expirado"},
        ) from exc
    except jwt.InvalidTokenError as exc:
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
