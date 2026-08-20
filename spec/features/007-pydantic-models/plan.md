# 007 · Pydantic Models — Plan

_Cómo se implementa lo descrito en `spec.md`. Debe respetar la `constitution/`._

## Enfoque

Crear la capa de esquemas Pydantic v2 en `app/schemas/` siguiendo el patrón de separación de operaciones (Create/Read/Update) para Books, Notes, AI Chat y Recommendations. Cada modelo definirá sus validaciones de negocio (ISBN-13 normalizado, rating 1-5, page > 0, message length) y usará `ConfigDict(from_attributes=True, populate_by_name=True)` para compatibilidad con ORM (SQLAlchemy/Supabase) y serialización camelCase en OpenAPI/TypeScript. La estructura por archivos granulares evita imports circulares y facilita la generación de tipos TypeScript desde el schema OpenAPI.

## Implementación

1. **Crear directorio y `__init__.py`** — `app/schemas/__init__.py` que re-exporta todos los modelos públicos para imports limpios (`from app.schemas import BookCreate, BookRead, ...`).

2. **Modelos BookMetadata y BookCreate** — `app/schemas/book_metadata.py` con `BookMetadata` (campos: isbn, title, authors, publisher, published_date, description, page_count, categories, thumbnail_url, language) + validadores `@field_validator` para ISBN (regex `^\d{13}$`, normalización quitando guiones/espacios) y `page_count > 0`. `app/schemas/book_create.py` con `BookCreate` heredando de `BookMetadata` + `user_id: UUID | None = None`.

3. **Modelos BookRead y BookUpdate** — `app/schemas/book_read.py` con `BookRead` heredando de `BookCreate` + `id: UUID`, `created_at: datetime`, `updated_at: datetime`, `user_id: UUID`. `app/schemas/book_update.py` con `BookUpdate` usando campos opcionales de `BookMetadata` (todos `Optional`) + `status: BookStatus | None`, `rating: Annotated[int, Field(ge=1, le=5)] | None`, `review: str | None`.

4. **Enum BookStatus** — `app/schemas/enums.py` con `BookStatus(str, Enum)` valores `want_to_read`, `reading`, `read` para uso en `BookUpdate.status` y validación OpenAPI.

5. **Modelos NoteCreate y NoteRead** — `app/schemas/note_create.py` con `NoteCreate` (`book_id: UUID`, `content: Annotated[str, Field(min_length=1)]`, `page: Annotated[int, Field(gt=0)] | None`). `app/schemas/note_read.py` con `NoteRead` heredando + `id: UUID`, `user_id: UUID`, `created_at: datetime`, `updated_at: datetime`, `chunk_index: list[int]`, `embedding: list[float] | None` (dim 768 documentada en Field description).

6. **Modelos AI Chat** — `app/schemas/chat_request.py` con `ChatRequest` (`message: Annotated[str, Field(min_length=1, max_length=4000)]`, `book_id: UUID | None`, `mode: Literal["book", "library"]`). `app/schemas/chat_response.py` con `ChatResponse` (`response: str`, `sources: list[str] | None`, `book_id: UUID | None`).

7. **Modelo Recommendations** — `app/schemas/recommendation_response.py` con `RecommendationItem` (`book_title: str`, `author: str`, `reason: str`, `confidence: Annotated[float, Field(ge=0, le=1)]`) y `RecommendationResponse` (`recommendations: list[RecommendationItem]`).

8. **ConfigDict en todos los modelos** — Cada clase define `model_config = ConfigDict(from_attributes=True, populate_by_name=True, use_enum_values=True, json_schema_extra={...})` para serialización ORM, alias camelCase y enums como strings en OpenAPI.

9. **Tests unitarios** — `app/schemas/test_*.py` (uno por grupo: `test_book.py`, `test_note.py`, `test_chat.py`, `test_recommendation.py`) cubriendo: happy path (instancia válida → `model_dump()` correcto), casos inválidos (ISBN malformado → ValidationError, rating 0/6 → ValidationError, page -1 → ValidationError, message vacío/4001 chars → ValidationError, mode inválido → ValidationError, confidence -0.1/1.1 → ValidationError).

10. **Verificación OpenAPI** — Ejecutar backend (`uvicorn app.main:app --reload`) y confirmar `GET /openapi.json` incluye todos los schemas sin errores (`components.schemas` con 10+ definiciones, sin `anyOf` inesperados por enums).

## Decisiones

- **Archivos granulares por modelo** (no un `book.py` monolítico) — Evita imports circulares cuando `BookCreate` importa `BookMetadata` y `BookRead` importa `BookCreate`. Cada archivo tiene responsabilidad única y se testea aisladamente. _Descartado: un solo `book.py` con todas las clases; causaba problemas de import order y acoplamiento innecesario._
- **Herencia explícita (Create → Read, Create → Update con campos opcionales)** — Refleja la semántica de la API: `BookRead` es `BookCreate` + campos de solo lectura; `BookUpdate` permite PATCH parcial. _Descartado: composición con `model_config = ConfigDict(extra="forbid")` en todos; la herencia es más DRY y clara para OpenAPI._
- **Enum `BookStatus` como `str, Enum` con `use_enum_values=True`** — Garantiza que OpenAPI genere `enum: ["want_to_read", "reading", "read"]` (strings) en lugar de objetos, compatible con Zod `z.enum([...])` en frontend. _Descartado: `Literal["want_to_read", ...]`; `Enum` permite iteración y validación centralizada._
- **Validación ISBN en `@field_validator(mode="before")` normalizando** — Acepta entrada con guiones/espacios (`978-84-12345-67-8` → `9788412345678`) y valida 13 dígitos. Cumple CHECK DB `isbn13 ~ '^\d{13}$'`. _Descartado: validar solo regex sin normalización; forzaría al cliente a enviar formato exacto._
- **`populate_by_name=True` + alias implícitos snake_case → camelCase** — Pydantic v2 usa `serialization_alias` automático para OpenAPI; el frontend recibe `pageCount`, `createdAt`, etc. sin código extra. _Descartado: definir `Field(alias="pageCount")` manual en cada campo; verboso y propenso a drift._
- **`embedding: list[float] | None` con `Field(description="768 dimensions")`** — Documenta la dimensión esperada (text-embedding-004) sin validar longitud en runtime (costoso). La validación real ocurre en DB (vector(768)) y pipeline de vectorización.

## Riesgos

- **Normalización ISBN inconsistente entre API y DB** — La DB almacena `char(13)` sin guiones. Si el validador Pydantic no normaliza antes de validar, requests con guiones fallan 422 aunque el dato sea válido. _Mitigación: `@field_validator(mode="before")` que limpia guiones/espacios antes del regex `^\d{13}$`; test unitario cubre formatos `9788412345678`, `978-84-12345-67-8`, `978 84 12345 67 8`._
- **Imports circulares entre modelos Book** — `BookRead` importa `BookCreate` que importa `BookMetadata`. Si `__init__.py` hace `from .book_read import BookRead` y `book_read.py` importa `BookCreate` del mismo paquete, puede haber ciclo en import time. _Mitigación: imports absolutos dentro del paquete (`from app.schemas.book_create import BookCreate`), y `__init__.py` importa solo al final (lazy) o usa `TYPE_CHECKING` para type hints._
- **Compatibilidad TypeScript (camelCase) vs Python (snake_case)** — OpenAPI genera schemas con `camelCase` por `populate_by_name=True`, pero si algún campo usa `Field(alias="...")` manual, rompe la convención. _Mitigación: no usar aliases manuales; confiar en `ConfigDict(populate_by_name=True)`. Verificar en test que `model_dump(by_alias=True)` produce claves camelCase._
- **Validación `embedding` dim 768 solo en DB** — Pydantic no valida longitud de `list[float]`. Si el pipeline de embeddings cambia de modelo (ej. 1536 dims), la API acepta pero la DB falla en INSERT. _Mitigación: documentar en `Field(description="...")` y test de integración (feature 016/018) que verifica round-trip. No añadir validador runtime por performance._
- **Enum `mode` en `ChatRequest` como `Literal` vs `Enum`** — `Literal["book", "library"]` genera `enum` en OpenAPI correctamente, pero no es iterable en Python. _Mitigación: usar `Literal` por simplicidad (solo 2 valores, no se itera). Si crece, migrar a `str, Enum`._