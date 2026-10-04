# 031 · Fix API Startup — get_supabase_client — Plan

## Enfoque

Restaurar el contrato de acceso usado por la vectorización añadiendo en
`apps/api/app/core/database.py` un helper síncrono y nullable que exponga el
singleton `_supabase` sin lanzar excepciones. En el punto de consumo de
`init_db()`, se garantizará que `create_client()` reciba un `str` mediante
`str(settings.supabase_url)`, sin cambiar el tipo Pydantic de configuración.
Se preservarán `get_supabase()`, `close_db()` y el comportamiento de
degradación de `vectorize_note`; el trabajo de integración se limitará a
verificar los imports, las llamadas y los mocks/tests del símbolo real. La
validación cubrirá ambos arranques de Uvicorn —con y sin credenciales—,
incluyendo `GET /health` → 200 con credenciales, además de la suite backend,
Ruff y Black, conforme al stack FastAPI/Python del proyecto.

## Implementación

1. Añadir en `apps/api/app/core/database.py` `get_supabase_client() -> Client | None`,
    colocado junto a `get_supabase()`, que retorne directamente `_supabase` y no
    lance cuando el cliente no esté inicializado. En `init_db()`, convertir
    `settings.supabase_url` a `str` antes de pasarlo a `create_client()` cuando
    las credenciales están configuradas. No modificar el singleton, el
    `HTTPException` 503 de `get_supabase()`, `close_db()` ni el resto del ciclo
    de inicialización.
2. Auditar `apps/api/app/services/vectorization.py` para confirmar que el
   import y la llamada de `get_supabase_client` apuntan al helper de
   `app.core.database`; conservar la comprobación `None`, el log
   `vectorize_note_db_unavailable` y la salida sin escrituras ni excepciones.
   No introducir cambios en el pipeline de chunking, embeddings o persistencia.
3. Revisar `apps/api/tests/test_vectorization.py` y alinear cualquier mock,
   docstring o referencia residual con
   `app.services.vectorization.get_supabase_client`, cubriendo tanto el camino
   con cliente falso como el cliente no inicializado. Mantener intactas las
   pruebas funcionales existentes del pipeline.
4. Ejecutar un barrido de `get_supabase_client` bajo `apps/` para comprobar que
   cada aparición resuelve al helper definido en `apps/api/app/core/database.py`
   y que no queda ninguna referencia huérfana; excluir la documentación
   histórica fuera de alcance.
5. Validar la importación completa con
    `cd apps/api && python -c "import app.main"`, arrancar con
    `cd apps/api && uvicorn app.main:app --host 0.0.0.0 --port 8000` usando el
    entorno sin credenciales y verificar que queda sirviendo sin
    `ImportError` y registra el aviso de cliente omitido. Repetir el arranque
    con las credenciales válidas del `.env` presentes, confirmar que no se
    produce `TypeError` en `init_db()` y comprobar `GET /health` → HTTP 200;
    detener cada proceso tras su comprobación.
6. Ejecutar `cd apps/api && pytest -v` y
    `cd apps/api && ruff check . && black --check .`; resolver únicamente
    regresiones o problemas de formato introducidos por este fix.

## Decisiones

- **Helper nullable separado de `get_supabase()`** — La tarea background de
  vectorización necesita consultar disponibilidad sin convertirla en una
  respuesta HTTP; se descarta reutilizar `get_supabase()`, porque su 503 es el
  contrato correcto para dependencies de endpoints y rompería la degradación
  elegante.
- **Retornar el singleton sin inicialización implícita** — El helper devuelve
  `_supabase` tal cual, por lo que `None` representa configuración ausente o
  cliente aún no inicializado; se descarta crear un cliente bajo demanda o
  alterar el lifespan.
- **Convertir el valor en el punto de consumo** — `init_db()` pasará
  `str(settings.supabase_url)` a `create_client()` para satisfacer el contrato
  del paquete `supabase` sin cambiar `supabase_url: HttpUrl | None` en
  `app/core/config.py`; se descarta alterar el modelo de settings o aplicar
  conversiones globales.
- **Cambio mínimo de integración** — `vectorization.py` ya usa el nombre
  `get_supabase_client` en el import y la llamada; solo se corregirán
  referencias de tests si el barrido detecta alguna desalineada. Se descartan
  refactors del pipeline, cambios de dependencias y modificaciones de
  migraciones.
- **Validación por import, servidor y suite existente** — Los síntomas críticos
  son el `ImportError` durante el import y el `TypeError` al inicializar con
  credenciales; por eso se prueban ambos entornos de Uvicorn y `GET /health`
  → 200 con el `.env` presente. Pytest y Ruff/Black verifican que el contrato
  del servicio y las convenciones backend siguen intactos; no se añade
  infraestructura de pruebas ni dependencias.

## Riesgos

- **El helper altera accidentalmente el contrato de `get_supabase()`** —
  Mantener ambas funciones separadas y comprobar explícitamente el 503 de la
  dependency existente mediante la suite antes de dar el fix por válido.
- **Persisten referencias a un símbolo inexistente** — Ejecutar el barrido
  bajo `apps/`, importar `app.main` y ejecutar pytest; cualquier aparición
  debe resolverse al helper real, sin tocar la mención histórica excluida.
- **Vectorización intenta escribir sin cliente** — Conservar la comprobación
  nullable antes de `_replace_chunks`, el log estructurado y el retorno sin
  escrituras; cubrir el camino con cliente ausente en los tests.
- **El arranque depende de credenciales o del entorno local** — El helper no
  inicializa ni exige credenciales: `import app.main` debe funcionar sin
  Supabase configurado; se probará explícitamente ese camino y, con las
  credenciales del `.env` presentes, que la URL convertida evita el `TypeError`
  y permite responder `GET /health` con 200.
- **Conversión aplicada fuera del punto correcto** — Mantener el tipo
  `HttpUrl | None` en `config.py` y comprobar que únicamente el argumento de
  `create_client()` se convierte a `str`, sin alterar `close_db()` ni otros
  consumidores de settings.
- **Cambios accidentales fuera del alcance** — No tocar `supabase/migrations/`,
  `get_supabase()`, el resto del lifespan fuera de la conversión de URL, la
  documentación histórica de la feature 009 ni el pipeline de vectorización
  más allá de referencias estrictamente necesarias.
