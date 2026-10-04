# 020 · Production Deployment — Plan

## Enfoque

Separar el despliegue en dos superficies: Vercel Hobby para Next.js mediante integración GitHub, y Cloud Run en una región europea para la imagen Docker de FastAPI publicada en Artifact Registry. GitHub Actions comprobará calidad, verificará el esquema remoto antes del despliegue y publicará el backend usando OIDC/Workload Identity Federation, sin claves de servicio ni `VERCEL_TOKEN`. La configuración sensible permanecerá en los dashboards de las plataformas y la documentación hará explícitos los límites de los free tiers, las salvaguardas de coste y el rollback.

## Implementación

### A. Cambios en el repositorio

1. Revisar `apps/api/Dockerfile` y conservar su construcción multi-stage, `python:3.11-slim`, usuario no-root, `HEALTHCHECK` sobre `GET /health` y arranque Uvicorn en el puerto 8000; ajustar únicamente lo imprescindible para que la imagen sea reproducible y compatible con Cloud Run.
2. Añadir `.github/workflows/ci.yml` para PRs y `push` a `main`, con jobs explícitos `lint-frontend`, `lint-backend`, `test-frontend`, `test-backend` y `build-backend`. Ejecutar, desde sus directorios reales, `npm run lint`, `npm run test`, `pytest`, `ruff check .`, `black --check .` y `docker build -t bookshelf-api .`.
3. Añadir `.github/workflows/deploy.yml` para merge/push a `main`. El job de despliegue dependerá de `ci` (`needs: ci`), ejecutará primero `npm run verify:schema`, y solo después autenticará con `google-github-actions/auth` mediante `id-token: write`, construirá/tagueará la imagen, la publicará en Artifact Registry y ejecutará `gcloud run deploy` en `europe-west1` (permitiendo `europe-southwest1` como alternativa decidida antes del alta). El comando de Cloud Run fijará imagen, región, puerto 8000, `--cpu=1`, `--memory=512Mi`, `--min-instances=0`, `--max-instances=1` y `--cpu-always-allocate`.
4. Mantener la verificación de esquema como gate previo al despliegue: `npm run verify:schema` debe ejecutarse contra Supabase remoto con un mecanismo operativo seguro y no exponer credenciales en logs. Como no se crean migraciones en esta feature, no modificar `supabase/migrations/`; si la verificación falla, el workflow se detiene y el remedio documentado sigue siendo `supabase db push --include-all` y después `npm run verify:schema`.
5. No crear un pipeline de despliegue frontend en GitHub Actions: dejar que la integración Git de Vercel genere automáticamente los deployments de preview para PRs y producción al fusionar en `main`. Si se añade configuración declarativa, limitarla a `apps/web/vercel.json` para framework Next.js y `buildCommand: "npm run build"`; no duplicar la configuración ya presente en `apps/web/next.config.mjs`.
6. Verificar que `apps/web/next.config.mjs` conserva `output: "standalone"` y el rewrite server-side `/api/v1/:path*` hacia `process.env.API_URL`. Toda documentación y configuración de producción usará `API_URL`; no introducir `NEXT_PUBLIC_API_URL`.
7. Añadir `docker-compose.yml` en la raíz para desarrollo local opcional, con servicios `api` y `web`, puertos 8000/3000, carga de variables desde `.env.local` y posibilidad de añadir Supabase local sin convertirlo en requisito de producción.
8. Crear `DEPLOY.md` con el procedimiento completo: prerrequisitos, creación/configuración de plataformas, variables por servicio, comandos de validación, gate de esquema, health check, logs, límites de free tier y consecuencias de excederlos. Documentar el rollback de Cloud Run apuntando tráfico a la revisión anterior y el `instant rollback` de Vercel.
9. Ejecutar validación final con los comandos del repositorio: en `apps/api`, `pytest`, `ruff check .` y `black --check .`; en `apps/web`, `npm run lint`, `npm run test` y `npm run build`; además de construir la imagen Docker y comprobar `npm run verify:schema` con salida segura.

### B. Configuración manual del usuario en dashboards

10. Crear el proyecto Vercel en plan Hobby, conectar el repositorio GitHub, habilitar previews de PR, configurar `framework: "nextjs"` y `npm run build`, asociar `bookshelf.educai.dev` (o dominio elegido) y verificar SSL automático. Registrar únicamente `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL` y `API_URL`; no registrar `NEXT_PUBLIC_API_URL`.
11. Crear/seleccionar proyecto Google Cloud con billing habilitado, Artifact Registry para la imagen, servicio Cloud Run en región europea y cuenta de servicio de runtime con solo los permisos necesarios. Configurar 1 vCPU, 512 MB, mínimo 0, máximo 1, puerto 8000, `GET /health` y `--cpu-always-allocate`; activar Cloud Logging y revisar que los logs JSON no contengan secretos.
12. Configurar Workload Identity Federation entre GitHub Actions y Google Cloud: proveedor OIDC restringido al repositorio, organización/repository/ref esperados y service account de despliegue con permisos mínimos sobre Artifact Registry y Cloud Run. El workflow tendrá `permissions: contents: read` e `id-token: write`; no crear, descargar ni almacenar JSON keys, `.pem`, `GOOGLE_APPLICATION_CREDENTIALS` ni `VERCEL_TOKEN`.
13. Cargar en Cloud Run, con `APP_ENV=production`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `SUPABASE_JWKS_URL`, `GEMINI_API_KEY`, `GOOGLE_BOOKS_API_KEY`, `LOG_LEVEL=INFO`, `LOG_FORMAT=json` y `CORS_ORIGINS=https://bookshelf.educai.dev`. La configuración centralizada de feature 021 debe fallar rápido si falta una variable obligatoria; no guardar estas variables en el repositorio ni en GitHub Secrets de larga duración.
14. Confirmar que Supabase free ya contiene el esquema remoto esperado y ejecutar el preflight `npm run verify:schema` con las credenciales seguras del entorno autorizado antes de cada despliegue. Configurar en Google Cloud una alerta de presupuesto de `0 USD/mes` y revisar consumo de Cloud Run, Artifact Registry y cualquier otro recurso para preservar la restricción de 0 EUR/mes.
15. Hacer la verificación manual de extremo a extremo: PR con preview Vercel, producción en el dominio, llamada `/api/v1/*` resuelta por el rewrite hacia Cloud Run, `/health` con 200 en menos de un segundo, logs visibles y prueba de crear/editar una nota seguida de la persistencia del embedding tras quedar el servicio sin tráfico.

## Decisiones

- **Vercel Git integration en lugar de despliegue CLI** — Los previews y producción quedan ligados a PR/merge sin `VERCEL_TOKEN` ni secretos de larga duración; se descarta gestionar Vercel desde GitHub Actions.
- **Cloud Run + Artifact Registry** — Reutiliza el Dockerfile existente y el free tier con scale-to-zero; se descartan Cloud SQL, una segunda instancia y plataformas de pago porque contradicen el coste 0 EUR/mes o el alcance MVP.
- **OIDC/Workload Identity Federation** — GitHub recibe credenciales federadas de corta duración y solo para el repositorio/ref autorizado; se descartan claves JSON de cuentas de servicio y `RENDER_API_KEY`.
- **`API_URL` server-side** — El rewrite de `apps/web/next.config.mjs` mantiene las llamadas relativas `/api/v1/*`, evita exponer la URL del backend al navegador y descarta `NEXT_PUBLIC_API_URL`.
- **`--cpu-always-allocate` con máximo de una instancia** — Preserva las background tasks de vectorización de la feature 016 durante la ventana posterior a una escritura, manteniendo scale-to-zero y sin autoscaling horizontal.
- **Verificación remota antes de desplegar** — `npm run verify:schema` es un gate explícito y no autoaplica migraciones; se conserva la convención `supabase db push --include-all` únicamente como remedio manual, sin tocar migraciones aplicadas.
- **Rollback por revisión, no blue/green** — Cloud Run vuelve a dirigir tráfico a la revisión anterior y Vercel ofrece instant rollback; se descartan canary/traffic splitting por no ser necesarios para el MVP.

## Riesgos

- **Exceso de consumo rompe el coste 0 EUR/mes** — Mantener máximo 1 instancia y scale-to-zero, activar alerta de presupuesto 0 USD, revisar cuotas mensuales y documentar que Cloud Run sí puede facturar el exceso, mientras Vercel Hobby solicita upgrade y Gemini devuelve 429.
- **Scale-to-zero congela o interrumpe la vectorización de la feature 016** — Habilitar obligatoriamente `--cpu-always-allocate` y probar manualmente que el embedding queda escrito después de crear/editar una nota sin tráfico posterior.
- **Federación OIDC demasiado permisiva o mal configurada** — Restringir issuer, repositorio, rama y service account; usar permisos mínimos y comprobar que no existen claves persistentes.
- **`verify:schema` bloquea un despliegue por credenciales, red o drift** — Ejecutarlo antes de construir/desplegar, diferenciar fallo de conexión de objeto ausente, no exponer secretos y aplicar la reparación manual documentada antes de reintentar.
- **Variables faltantes o CORS incorrecto causan fallo de arranque o peticiones rechazadas** — Configurar explícitamente todas las variables de Cloud Run, incluir `SUPABASE_JWKS_URL` y `LOG_FORMAT=json`, limitar `CORS_ORIGINS` a dominios oficiales y probar el arranque/health check.
- **La URL del backend se filtra o el rewrite deja de funcionar** — Usar exclusivamente `API_URL`, probar `/api/v1/*` desde el dominio Vercel y no introducir `NEXT_PUBLIC_API_URL` ni URLs hardcodeadas en componentes.
- **Una imagen defectuosa llega a producción** — Hacer que deploy dependa de `ci`, exigir lint/test/build y health check, conservar revisiones inmutables y documentar el retorno inmediato de tráfico a la revisión Cloud Run anterior y el instant rollback de Vercel.
- **Logs estructurados filtran credenciales** — Emitir únicamente stdout JSON seguro, revisar logs de Cloud Logging y Vercel durante la prueba, y no imprimir valores de variables, tokens, cabeceras ni respuestas completas de Supabase.
