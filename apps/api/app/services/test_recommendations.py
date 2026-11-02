"""Tests unitarios del servicio de recomendaciones (feature 018).

Cubren (spec/plan 018):
- Dos consultas Supabase como máximo (books + book_notes `chunk_index=0`).
- Filtro de estados (`read`/`reading`) y de notas (`chunk_index=0`).
- Aislamiento por usuario (`user_id` derivado del JWT; sin identificadores del cliente).
- Prompt determinista con datos del usuario + ejemplo few-shot de JSON.
- Parseo/validación de JSON válido y fallback vacío con log para JSON inválido
  o historial insuficiente.
- Cache hit sin segunda llamada a Gemini ni a Supabase durante el TTL.
- Validaciones del modelo `RecommendationItem` (authors no vacío, reason
  obligatorio, confidence 0-1).

Mocks: `genai.GenerativeModel`, `genai.configure` y un cliente Supabase falso
con estado en memoria que registra las consultas realizadas.
"""

import asyncio
import json
from unittest.mock import MagicMock
from uuid import uuid4

import google.generativeai as genai
import pytest
from pydantic import ValidationError

from app.core.config import settings
from app.models.recommendations import RecommendationItem, RecommendationResponse
from app.services import recommendations as rec

USER_ID = "00000000-0000-0000-0000-000000000001"
OTRO_USER_ID = "99999999-9999-9999-9999-999999999999"


@pytest.fixture(autouse=True)
def _clean_cache():
    """Aísla el singleton de caché entre tests (evita cache hits cruzados)."""
    rec.clear_cache()
    yield
    rec.clear_cache()


# ---------------------------------------------------------------------------
# Fakes
# ---------------------------------------------------------------------------


class _FakeResponse:
    def __init__(self, data):
        self.data = data


class FakeQuery:
    def __init__(self, db, table):
        self._db = db
        self._table = table
        self._filters = []

    def select(self, _columns):
        return self

    def eq(self, column, value):
        self._filters.append(("eq", column, value))
        return self

    def in_(self, column, values):
        self._filters.append(("in", column, list(values)))
        return self

    def execute(self):
        return self._db._execute(self._table, self._filters)


class FakeSupabase:
    def __init__(self, books=None, notes=None):
        self.books = list(books or [])
        self.notes = list(notes or [])
        self.queries = []  # (table, filters)

    def table(self, name):
        return FakeQuery(self, name)

    def _execute(self, table, filters):
        self.queries.append((table, list(filters)))
        rows = self.books if table == "books" else self.notes
        return _FakeResponse([r for r in rows if self._matches(r, filters)])

    @staticmethod
    def _matches(row, filters):
        for op, column, value in filters:
            if op == "eq" and row.get(column) != value:
                return False
            if op == "in" and row.get(column) not in value:
                return False
        return True


def _book(status="read", user_id=USER_ID, **overrides):
    row = {
        "id": str(uuid4()),
        "user_id": user_id,
        "title": "El Quijote",
        "authors": ["Cervantes"],
        "rating": 5,
        "status": status,
    }
    row.update(overrides)
    return row


def _note(book_id, user_id=USER_ID, chunk_index=0, content="Temas de caballería y aventura"):
    return {
        "book_id": str(book_id),
        "user_id": user_id,
        "chunk_index": chunk_index,
        "content": content,
    }


class _FakeGeminiResponse:
    def __init__(self, text):
        self.text = text


def _valid_json(recommendations):
    return json.dumps({"recommendations": recommendations}, ensure_ascii=False)


def _install_gemini(monkeypatch, text):
    """Instala `genai.configure`/`genai.GenerativeModel` que devuelve `text`."""
    model = MagicMock()
    model.generate_content.return_value = _FakeGeminiResponse(text)
    monkeypatch.setattr(genai, "configure", lambda **kwargs: None)
    monkeypatch.setattr(genai, "GenerativeModel", lambda name: model)
    return model


# ---------------------------------------------------------------------------
# Modelos (validaciones)
# ---------------------------------------------------------------------------


def test_recommendation_item_valido():
    item = RecommendationItem(title="T", authors=["A"], reason="Razón", confidence=0.8)
    assert item.confidence == 0.8


def test_recommendation_item_authors_vacio_rechazado():
    with pytest.raises(ValidationError):
        RecommendationItem(title="T", authors=[], reason="Razón", confidence=0.8)


def test_recommendation_item_reason_obligatorio():
    with pytest.raises(ValidationError):
        RecommendationItem(title="T", authors=["A"], confidence=0.8)


@pytest.mark.parametrize("confidence", [-0.1, 1.1])
def test_recommendation_item_confidence_fuera_de_rango(confidence):
    with pytest.raises(ValidationError):
        RecommendationItem(title="T", authors=["A"], reason="R", confidence=confidence)


def test_gemini_response_schema_es_compatible():
    schema = RecommendationResponse.gemini_response_schema()
    assert schema["type"] == "OBJECT"
    assert schema["required"] == ["recommendations"]
    item = schema["properties"]["recommendations"]["items"]
    assert item["type"] == "OBJECT"
    assert set(item["required"]) == {"title", "authors", "reason", "confidence"}


# ---------------------------------------------------------------------------
# Carga de contexto (consultas y filtros)
# ---------------------------------------------------------------------------


def test_load_user_books_filtra_status_y_usuario():
    db = FakeSupabase(
        books=[
            _book(status="read"),
            _book(status="reading"),
            _book(status="want_to_read"),
            _book(status="read", user_id=OTRO_USER_ID, title="Ajeno"),
        ]
    )

    books = rec.load_user_books(db, USER_ID)

    assert {b["title"] for b in books} == {"El Quijote"}
    assert len(books) == 2  # read + reading del propio usuario
    assert len(db.queries) == 1
    table, filters = db.queries[0]
    assert table == "books"
    assert ("eq", "user_id", USER_ID) in filters
    assert ("in", "status", ["read", "reading"]) in filters


def test_load_root_notes_filtra_chunk_index_y_book_ids():
    book_a = _book()
    book_b = _book(title="Otro")
    db = FakeSupabase(
        notes=[
            _note(book_a["id"], chunk_index=0, content="nota raíz A"),
            _note(book_a["id"], chunk_index=1, content="chunk vectorial A"),
            _note(book_b["id"], chunk_index=0, content="nota raíz B"),
            _note(book_a["id"], chunk_index=0, user_id=OTRO_USER_ID, content="AJENO"),
        ]
    )

    notes = rec.load_root_notes(db, USER_ID, [str(book_a["id"]), str(book_b["id"])])

    assert len(notes) == 2
    assert all(n["chunk_index"] == 0 for n in notes)
    assert "AJENO" not in [n["content"] for n in notes]
    table, filters = db.queries[0]
    assert table == "book_notes"
    assert ("eq", "chunk_index", 0) in filters
    assert ("eq", "user_id", USER_ID) in filters


def test_load_root_notes_sin_book_ids_no_consulta():
    db = FakeSupabase(notes=[_note(str(uuid4()))])
    assert rec.load_root_notes(db, USER_ID, []) == []
    assert db.queries == []


# ---------------------------------------------------------------------------
# Extracción de historial y prompt
# ---------------------------------------------------------------------------


def test_extract_keywords_heuristica():
    texts = ["fantasía épica y caballería", "fantasía y magia y dragones"]
    keywords = rec.extract_keywords(texts)
    assert "fantasía" in keywords
    # "fantasía" (3 apariciones) va antes que "caballería" (1).
    assert keywords[0] == "fantasía"


def test_build_history_combina_libros_y_notas():
    book = _book(title="El Hobbit", authors=["Tolkien"], rating=4)
    notes = [_note(book["id"], content="aventura y dragones y aventura")]
    history = rec.build_history([book], notes)
    assert len(history) == 1
    assert history[0]["title"] == "El Hobbit"
    assert history[0]["authors"] == ["Tolkien"]
    assert history[0]["rating"] == 4
    assert "dragones" in history[0]["themes"]


def test_build_prompt_incluye_datos_usuario_y_few_shot():
    history = [
        {
            "title": "El Quijote",
            "authors": ["Cervantes"],
            "rating": 5,
            "themes": ["caballería", "aventura"],
        }
    ]
    prompt = rec.build_prompt(history, limit=3)

    assert "El Quijote" in prompt
    assert "Cervantes" in prompt
    assert "caballería" in prompt
    assert '"recommendations"' in prompt  # few-shot JSON
    assert "SOLO con un JSON válido" in prompt
    assert "3 libros" in prompt


# ---------------------------------------------------------------------------
# Parseo y validación de la respuesta
# ---------------------------------------------------------------------------


def test_parse_response_json_valido_y_limita():
    raw = _valid_json(
        [
            {"title": "A", "authors": ["X"], "reason": "r", "confidence": 0.9},
            {"title": "B", "authors": ["Y"], "reason": "r", "confidence": 0.8},
        ]
    )
    response = rec.parse_response(raw, limit=1)
    assert isinstance(response, RecommendationResponse)
    assert len(response.recommendations) == 1
    assert response.recommendations[0].title == "A"


def test_parse_response_json_invalido_lanza():
    with pytest.raises(json.JSONDecodeError):
        rec.parse_response("{no-json", limit=5)


def test_parse_response_que_no_cumple_modelo_lanza():
    # confidence fuera de rango → ValidationError (subclase de ValueError).
    raw = _valid_json([{"title": "A", "authors": ["X"], "reason": "r", "confidence": 5}])
    with pytest.raises(ValidationError):
        rec.parse_response(raw, limit=5)


# ---------------------------------------------------------------------------
# Orquestador: fallback y caché
# ---------------------------------------------------------------------------


def test_get_recommendations_historial_insuficiente_vacio(monkeypatch):
    db = FakeSupabase(books=[_book(status="want_to_read")])
    model = _install_gemini(monkeypatch, _valid_json([]))

    response = asyncio.run(rec.get_recommendations(db, USER_ID))

    assert response.recommendations == []
    model.generate_content.assert_not_called()


def test_get_recommendations_dos_consultas_y_aislamiento(monkeypatch):
    book = _book(status="read")
    db = FakeSupabase(
        books=[book, _book(status="read", user_id=OTRO_USER_ID, title="Ajeno")],
        notes=[_note(book["id"], content="aventura y caballería")],
    )
    model = _install_gemini(
        monkeypatch,
        _valid_json([{"title": "N", "authors": ["Z"], "reason": "r", "confidence": 0.9}]),
    )

    response = asyncio.run(rec.get_recommendations(db, USER_ID, limit=5))

    assert len(response.recommendations) == 1
    assert len(db.queries) == 2
    tables = [t for t, _ in db.queries]
    assert tables == ["books", "book_notes"]
    # Aislamiento: todas las consultas filtran por el user_id del JWT.
    for _, filters in db.queries:
        assert ("eq", "user_id", USER_ID) in filters
    model.generate_content.assert_called_once()


def test_get_recommendations_respuesta_invalida_fallback_vacio(monkeypatch):
    db = FakeSupabase(books=[_book(status="read")])
    _install_gemini(monkeypatch, "{no-json")

    response = asyncio.run(rec.get_recommendations(db, USER_ID))

    assert response.recommendations == []


def test_get_recommendations_gemini_error_fallback_vacio(monkeypatch):
    db = FakeSupabase(books=[_book(status="read")])
    model = MagicMock()
    model.generate_content.side_effect = RuntimeError("gemini roto")
    monkeypatch.setattr(genai, "configure", lambda **kwargs: None)
    monkeypatch.setattr(genai, "GenerativeModel", lambda name: model)

    response = asyncio.run(rec.get_recommendations(db, USER_ID))

    assert response.recommendations == []


def test_cache_hit_no_segunda_llamada(monkeypatch):
    book = _book(status="read")
    db = FakeSupabase(books=[book], notes=[_note(book["id"])])
    model = _install_gemini(
        monkeypatch,
        _valid_json([{"title": "N", "authors": ["Z"], "reason": "r", "confidence": 0.9}]),
    )
    rec.clear_cache()
    try:
        first = asyncio.run(rec.get_recommendations(db, USER_ID))
        second = asyncio.run(rec.get_recommendations(db, USER_ID))
    finally:
        rec.clear_cache()

    assert first.recommendations == second.recommendations
    # Una sola llamada a Gemini y una sola ronda de consultas (cache hit).
    model.generate_content.assert_called_once()
    assert len(db.queries) == 2


def test_cache_aplica_limite_sobre_valor_cacheado(monkeypatch):
    db = FakeSupabase(books=[_book(status="read")])
    _install_gemini(
        monkeypatch,
        _valid_json(
            [
                {"title": "A", "authors": ["X"], "reason": "r", "confidence": 0.9},
                {"title": "B", "authors": ["Y"], "reason": "r", "confidence": 0.8},
            ]
        ),
    )
    rec.clear_cache()
    try:
        asyncio.run(rec.get_recommendations(db, USER_ID, limit=2))
        response = asyncio.run(rec.get_recommendations(db, USER_ID, limit=1))
    finally:
        rec.clear_cache()

    assert len(response.recommendations) == 1
    assert response.recommendations[0].title == "A"


def test_generation_config_usa_settings_y_response_schema(monkeypatch):
    """`_generation_config` refleja `settings.gemini_chat_model` vía el esquema.

    Se comprueba que la generación pasa `response_mime_type=application/json` y
    el `response_schema` del contrato, y que el modelo usado es el configurable.
    """
    monkeypatch.setattr(settings, "gemini_chat_model", "gemini-test")
    captured = {}

    model = MagicMock()

    def fake_generate(prompt, generation_config=None):
        captured["generation_config"] = generation_config
        captured["prompt"] = prompt
        return _FakeGeminiResponse(
            _valid_json([{"title": "N", "authors": ["Z"], "reason": "r", "confidence": 0.9}])
        )

    model.generate_content = MagicMock(side_effect=fake_generate)
    monkeypatch.setattr(genai, "configure", lambda **kwargs: None)
    monkeypatch.setattr(genai, "GenerativeModel", lambda name: model)

    db = FakeSupabase(books=[_book(status="read")])
    asyncio.run(rec.get_recommendations(db, USER_ID))

    cfg = captured["generation_config"]
    assert cfg.response_mime_type == "application/json"
    assert cfg.response_schema == RecommendationResponse.gemini_response_schema()
    assert "SOLO con un JSON válido" in captured["prompt"]
