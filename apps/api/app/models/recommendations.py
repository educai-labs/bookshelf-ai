r"""Modelos Pydantic de recomendaciones (feature 018).

`RecommendationResponse` es la respuesta de `GET /api/v1/ai/recommendations` y,
al mismo tiempo, el esquema de structured output que se pasa a Gemini como
`response_schema` (la salida se restringe a JSON conforme a este contrato).

Validaciones (convención `tech-stack.md` y criterios de aceptación 018):

- `RecommendationItem.authors`: lista no vacía (al menos un autor).
- `RecommendationItem.reason`: obligatorio (1-2 frases justificando la sugerencia).
- `RecommendationItem.confidence`: acotado en `[0, 1]`.
- `RecommendationResponse.recommendations`: lista (vacía si no hay historial útil).

`gemini_response_schema()` expone el subconjunto del esquema JSON que Gemini
acepta como `response_schema` (tipos `OBJECT`/`ARRAY`/`STRING`/`NUMBER`), evitando
el `model_json_schema()` completo de Pydantic (con `$defs`/`anyOf`/`title`) que no
es un `response_schema` válido para la API de generación.
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RecommendationItem(BaseModel):
    """Una recomendación de libro generada por el modelo.

    Contrato JSON (y respuesta API): `{ title, authors, reason, confidence }`.
    """

    model_config = ConfigDict(extra="ignore")

    title: str = Field(min_length=1, description="Título del libro recomendado")
    authors: list[str] = Field(description="Autores del libro (lista no vacía)")
    reason: str = Field(min_length=1, description="Razón de la recomendación (1-2 frases)")
    confidence: float = Field(ge=0, le=1, description="Confianza de la recomendación (0-1)")

    @field_validator("authors")
    @classmethod
    def _authors_no_vacio(cls, value: list[str]) -> list[str]:
        """`authors` debe contener al menos un autor (criterio de aceptación)."""
        if not value:
            raise ValueError("authors no puede estar vacío")
        return value


class RecommendationResponse(BaseModel):
    """Respuesta de `GET /api/v1/ai/recommendations`."""

    model_config = ConfigDict(extra="ignore")

    recommendations: list[RecommendationItem] = Field(
        default_factory=list,
        description="Lista de recomendaciones (vacía si no hay historial útil)",
    )

    @classmethod
    def gemini_response_schema(cls) -> dict:
        """Esquema `response_schema` compatible con Gemini para `RecommendationResponse`.

        Devuelve una copia profunda del esquema canónico para que el llamador
        pueda mutarla sin efectos laterales. Los tipos usan las constantes
        string que `google-generativeai` acepta (`OBJECT`/`ARRAY`/`STRING`/
        `NUMBER`; se normalizan internamente a minúsculas).
        """
        return {
            "type": "OBJECT",
            "properties": {
                "recommendations": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "title": {"type": "STRING"},
                            "authors": {
                                "type": "ARRAY",
                                "items": {"type": "STRING"},
                            },
                            "reason": {"type": "STRING"},
                            "confidence": {"type": "NUMBER"},
                        },
                        "required": ["title", "authors", "reason", "confidence"],
                    },
                },
            },
            "required": ["recommendations"],
        }


# Esquema a nivel de módulo (atajo estable para `generation_config`, sin depender
# de una instancia). Constante de solo lectura; el servicio lo consume tal cual.
GEMINI_RESPONSE_SCHEMA: dict = RecommendationResponse.gemini_response_schema()
