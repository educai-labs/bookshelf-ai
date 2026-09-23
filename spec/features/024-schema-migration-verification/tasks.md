# 024 · Schema Migration Verification — Tareas

- [x] Crear `scripts/verify-schema.py` con resolución de la raíz del repositorio, carga opcional de `.env.local` y las mismas convenciones de dependencias que `scripts/verify-supabase.py`.
- [x] Implementar en `scripts/verify-schema.py` la validación de `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` exclusivamente desde el entorno, con fallo previo a la conexión cuando falte cualquiera y sin imprimir secretos ni la URL completa.
- [x] Implementar la comprobación remota, aislada por objeto, de las tablas `books`, `book_notes` y `account_preferences`.
- [x] Implementar la comprobación remota de la RPC `match_book_notes`, la extensión `vector` y el índice HNSW `idx_book_notes_embedding_hnsw` sobre `book_notes.embedding`, distinguiendo objeto ausente de error de red o autenticación.
- [x] Implementar la salida del verificador con marca `✓`/`✗` por objeto, resumen de tipo y nombre para faltantes, remedio explícito (`supabase db push --include-all` seguido de `npm run verify:schema`) y mensajes diferenciados para faltantes frente a conexión/autenticación.
- [x] Garantizar que `scripts/verify-schema.py` devuelve exit 0 únicamente cuando todos los objetos están presentes y exit 1 ante cualquier faltante, error de conexión o error de autenticación, sin autoaplicar migraciones.
- [x] Añadir el wrapper `verify:schema` en `package.json` usando el mismo intérprete y convención que `verify:supabase:py`, sin añadir dependencias innecesarias.
- [x] Actualizar `apps/api/app/core/errors.py` para mapear `PGRST205` y `PGRST202` en `map_supabase_error` a HTTP 503 con `detail.code = "DB_MIGRATION_MISSING"`, mensaje accionable y el remedio `supabase db push --include-all` + `npm run verify:schema`.
- [x] Incluir en el mensaje del nuevo mapeo la tabla, columna o función disponible y registrar el código PostgREST y diagnóstico no sensible mediante el logger común, sin exponer secretos, cabeceras ni la URL completa.
- [x] Preservar sin cambios los mapeos `23505`, `23503`, `PGRST116`, `406` y el fallback `DB_ERROR`.
- [x] Añadir en `apps/api/tests/test_errors.py` (o el módulo de tests existente correspondiente) pruebas con `APIError` simuladas para `PGRST205` y `PGRST202`, verificando status 503, código estructurado, contexto del objeto y remedio operativo.
- [x] Añadir pruebas de regresión del mapeo para `23505`, `23503`, `PGRST116`, `406` y un código desconocido, comparando status, `code`, mensaje y `field` esperados.
- [x] Documentar en `docs/supabase-setup.md` las variables requeridas, la carga opcional de `.env.local`, los objetos verificados, la salida esperada, los códigos de salida y la interpretación de faltantes frente a red o credenciales.
- [x] Documentar en el `AGENTS.md` de la raíz la convención SDD para features que creen migraciones: incluir en `tasks.md` la aplicación remota mediante `supabase db push --include-all` y la verificación mediante `npm run verify:schema`, con evidencia explícita de ambos resultados.
- [x] Documentar y respetar que no se modifican migraciones ya aplicadas; ante drift, aplicar migraciones pendientes o crear una migración nueva numerada, sin usar `db reset` ni auto-reparación.
- [x] Ejecutar `cd apps/api && pytest -v` y corregir cualquier fallo de la suite backend.
- [x] Ejecutar `cd apps/api && ruff check .` y corregir cualquier incumplimiento.
- [x] Ejecutar `cd apps/api && black --check .` y corregir cualquier incumplimiento de formato.
- [x] Comprobar manualmente `npm run verify:schema` sin variables de entorno y verificar exit distinto de cero, identificación de variables faltantes y ausencia de secretos.
- [x] Comprobar manualmente `npm run verify:schema` con el esquema completo y verificar exit 0 y confirmación objeto a objeto.
- [x] Comprobar manualmente `npm run verify:schema` con un objeto faltante y con un error de conexión o credenciales, verificando exit 1, diagnóstico diferenciado y ausencia de secretos.
- [x] Si se toca el esquema remoto para resolver faltantes, ejecutar explícitamente `supabase db push --include-all` y después `npm run verify:schema`, conservar evidencia de ambos comandos y confirmar que no se modificaron migraciones ya aplicadas. _(No aplica: el remoto ya contenía todos los objetos; no se ejecutó `db push`.)_
- [ ] Ejecutar, de forma opcional y no bloqueante, `cd apps/web && npm run lint`, `cd apps/web && npm run test` y `cd apps/web && npm run build`, al no modificarse código de frontend. _(Opcional y no bloqueante: omitida por no modificar código de frontend.)_
- [x] Actualizar documentación si aplica.
- [x] Validar contra los criterios de aceptación de `spec.md`.
- [ ] Mover la feature a "Hecho" en `../../constitution/roadmap.md`. _(La ejecuta el agente `roadmap` al final; fuera del alcance del implementador.)_

## Mantenimiento (checklist recurrente)

- [ ] Cuando una feature futura cree o aplique una migración, registrar en su `tasks.md` la ejecución de `supabase db push --include-all` seguida de `npm run verify:schema`, adjuntando evidencia de ambos comandos y sin modificar migraciones ya aplicadas. _(Directiva para features futuras.)_
