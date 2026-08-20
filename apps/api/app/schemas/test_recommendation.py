"""Tests de los schemas de Recommendations (feature 007): happy path + casos inválidos."""

import pytest
from pydantic import ValidationError

from app.schemas import RecommendationItem, RecommendationResponse


def test_recommendation_response_happy_path():
    resp = RecommendationResponse(
        recommendations=[
            RecommendationItem(
                book_title="Clean Code",
                author="Robert C. Martin",
                reason="Fundamental para código legible",
                confidence=0.92,
            )
        ]
    )
    item = resp.recommendations[0]
    assert item.book_title == "Clean Code"
    assert item.author == "Robert C. Martin"
    assert item.reason == "Fundamental para código legible"
    assert item.confidence == 0.92


@pytest.mark.parametrize("bad_confidence", [-0.1, 1.1])
def test_confidence_out_of_range_raises(bad_confidence):
    with pytest.raises(ValidationError):
        RecommendationItem(book_title="T", author="A", reason="R", confidence=bad_confidence)


def test_recommendation_response_accepts_dicts():
    resp = RecommendationResponse(
        recommendations=[{"book_title": "T", "author": "A", "reason": "R", "confidence": 0.5}]
    )
    assert resp.recommendations[0].author == "A"
    assert resp.recommendations[0].confidence == 0.5


def test_recommendation_item_missing_fields_raises():
    with pytest.raises(ValidationError):
        RecommendationItem(book_title="T", author="A")
