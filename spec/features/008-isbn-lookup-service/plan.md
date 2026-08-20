# 008 · ISBN Lookup Service — Plan de implementación

## Enfoque

Implementar un **servicio de dominio puro** (`ISBNLookupService`) encapsulado en `apps/api/app/services/isbn_lookup.py` que orqueste llamadas a Open Library (primario) y Google Books (fallback) con caché en memoria, validación estricta de ISBN-13 y manejo de errores tipado. El servicio se expondrá vía **endpoint REST** en `apps/api/app/api/v1/lookup.py` (feature 009 lo consumirá) y será **inyectable** para tests y futuros consumidores (MCP, workers).  
**Por qué este enfoque**: respeta la arquitectura por capas del stack (services separado de routers), usa `httpx.AsyncClient` nativo de FastAPI para I/O asíncrono, aprovecha Pydantic v2 para validación y serialización, y mantiene el caché simple en memoria (dict + TTL) según decisión de MVP —sin Redis— evitando dependencias extra.

---

## Implementación

| Paso | Acción | Archivos tocados (relativos a root) |
|------|--------|--------------------------------------|
| 1 | **Crear modelos Pydantic** de request/response y errores tipados | `apps/api/app/models/isbn.py` |
| 2 | **Implementar `ISBNLookupService`** con: normalización ISBN, cliente HTTP con timeout/retry, lógica Open Library → Google Books, caché TTL 1h, mapeo de campos | `apps/api/app/services/isbn_lookup.py` |
| 3 | **Crear router `GET /api/v1/books/lookup`** que valide query param, invoque servicio y devuelva `ISBNLookupResponse` o `HTTPException` mapeada | `apps/api/app/api/v1/lookup.py` |
| 4 | **Registrar router** en `apps/api/app/api/v1/__init__.py` (incluir `lookup.router`) | `apps/api/app/api/v1/__init__.py` |
| 5 | **Tests unitarios** mockeando `httpx.AsyncClient`: éxito Open Library, fallback Google Books, error en ambas, hit de cache, ISBN inválido | `apps/api/app/services/test_isbn_lookup.py` |
| 6 | **Test de integración** del endpoint con `TestClient` de FastAPI | `apps/api/app/api/v1/test_lookup.py` |
| 7 | **Ejecutar validación**: `pytest -v`, `ruff check .`, `black --check .` en `apps/api/` | — |

---

## Decisiones

| Tema | Decisión | Justificación | Alternativas descartadas |
|------|----------|---------------|--------------------------|
| **Cliente HTTP** | `httpx.AsyncClient` con `timeout=5.0` y `Retry` personalizado (2 reintentos, backoff exponencial 1s→2s) | Nativo en FastAPI, soporta async/await, permite control fino de timeouts y retries | `aiohttp` (dependencia extra), `requests` (bloqueante) |
| **Caché** | Dict en memoria `Dict[str, Tuple[ISBNLookupResponse, float]]` con TTL 1h verificado en cada `get` | MVP sin Redis; 1h TTL cubre sesión típica; limpieza perezosa (solo al leer) evita thread/background job | `cachetools.TTLCache` (dependencia), Redis (overkill MVP) |
| **Normalización ISBN** | `re.sub(r'[\s-]', '', isbn)` → validar `len==13 and isbn.isdigit()` | Simple, cubre casos reales (guiones, espacios), lanza `InvalidISBNError` temprano | `isbnlib` (dependencia pesada para solo normalizar) |
| **Mapeo campos** | Función `_map_openlibrary()` + `_map_googlebooks()` → `ISBNLookupResponse` unificado | Aísla diferencias de esquema de cada API; facilita tests y futuro cambio de proveedor | Mapeo inline (duplicación, difícil testear) |
| **Errores** | Excepciones de dominio `InvalidISBNError`, `ISBNNotFoundError` → capturadas en router y convertidas a `HTTPException(status_code, detail={code, message})` | Separación dominio/transporte; `detail` estructurado según convención tech-stack | Lanzar `HTTPException` directo en servicio (acopla a FastAPI) |
| **Configuración API keys** | `settings.google_books_api_key` (opcional, `Pydantic-Settings`); Open Library sin key | Respeta `.env.example` y `Pydantic-Settings`; Google Books key opcional para cuota mayor | Hardcodear key (prohibido por tech-stack) |
| **Rate limiting** | No implementado en servicio (cache + 100 req/min Open Library bastan para MVP); feature 020 lo hará distribuido | Tech-stack: "Rate limiting distribuido — feature 020" | Token bucket local (complejidad innecesaria ahora) |

---

## Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| **Open Library cambia esquema / deja de responder** | Fallback a Google Books cubre mayoría de casos; si ambos fallan → `ISBNNotFoundError` visible al usuario | Tests cubren ambos caminos; monitorizar logs de `ISBNNotFoundError` en producción |
| **Google Books requiere API key para cuota razonable** | Sin key: 1000 req/día; con key: 10000 req/día | Key opcional en `.env.example`; documentar en README de la feature; fallback a Open Library primero ahorra cuota |
| **Caché en memoria crece sin límite si muchos ISBNs únicos** | Fuga de memoria en instancias long-running | TTL 1h + limpieza perezosa; en MVP carga esperada baja; feature 020 migrará a Redis con eviction policy |
| **ISBN-13 con prefijo 978/979 pero dígito de control inválido** | Validación actual solo chequea 13 dígitos numéricos | Añadir validación de check-digit en paso 2 (algoritmo ISBN-13 estándar) — bajo coste, evita consultas inútiles |
| **Timeout 5s + 2 retries = hasta 15s latencia peor caso** | Supera criterio "< 3s promedio" solo en casos patológicos | Caché absorbe reintentos; métricas de latencia en logs para alertar si p95 > 3s |

---

## Validación final

- [ ] `pytest apps/api/app/services/test_isbn_lookup.py -v` → 100% pass
- [ ] `pytest apps/api/app/api/v1/test_lookup.py -v` → 100% pass
- [ ] `cd apps/api && ruff check . && black --check .` → sin warnings
- [ ] `cd apps/api && pytest -v` → suite completa pasa
- [ ] Endpoint manual `curl "http://localhost:8000/api/v1/books/lookup?isbn=9788445001234"` devuelve JSON con campos esperados