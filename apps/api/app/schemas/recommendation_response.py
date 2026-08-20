"""Modelos de recomendaciones IA (feature 007)."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field


class RecommendationItem(BaseModel):
    """Una recomendación individual de `GET /ai/recommendations`."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    book_title: str
    author: str
    reason: str
    confidence: Annotated[float, Field(ge=0, le=1, description="Confianza del modelo (0-1)")]


class RecommendationResponse(BaseModel):
    """Respuesta de `GET /ai/recommendations`: lista de recomendaciones."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        use_enum_values=True,
    )

    recommendations: list[RecommendationItem]
