# 029 · Chat AI Perf & A11y

**Estado:** propuesta

## Qué hace

Mejora el rendimiento y la accesibilidad del chat IA (hallazgos Z4-01…Z4-09 de la auditoría):

1. **Persistencia eficiente del historial:** hoy se hace `JSON.stringify` + `sessionStorage` en **cada token** del stream (Z4-01).
2. **Parseo de Markdown memoizado:** cada mensaje se re-parsea (marked + DOMPurify) en cada render; durante el streaming el coste es O(n²) (Z4-02).
3. **Control del stream:** no hay AbortController ni cleanup al desmontar/navegar (Z4-03) ni botón de cancelar durante el streaming (Z4-06).
4. **A11y:** el contenedor de mensajes no tiene `aria-live="polite"` ni el indicador "pensando" expone `role="status"` (Z4-04); `key={index}` en la lista de mensajes (Z4-05); auto-scroll a `scrollHeight` sin smooth y sin respetar `prefers-reduced-motion` (Z4-09).
5. **Seguridad y errores:** el sanitize permite `target` en enlaces sin forzar `rel="noopener noreferrer"` (Z4-07) y el Alert de error del chat no tiene título ni acción de reintento (Z4-08).

## Por qué

El chat IA es una de las piezas principales de la misión ("conversa con tu biblioteca mediante IA… streaming en tiempo real") y el principio "Streaming-first UX" exige que la UI siga fluida **durante** el stream. Hoy ocurre lo contrario: cada token dispara una serialización completa del historial a sessionStorage y re-parsea el Markdown de los mensajes (coste cuadrático perceptible en conversaciones largas), la respuesta no se puede detener, y al navegar fuera el stream sigue vivo actualizando el estado de un componente desmontado. En accesibilidad, un usuario de lector de pantalla no recibe los tokens por `aria-live` ni sabe que el asistente "está pensando". Son fixes de severidad media/baja, pero sobre el componente con mayor interacción continua de la app.

## Criterios de aceptación

**Rendimiento (Z4-01, Z4-02):**

- [ ] El historial NO se persiste en cada token: se serializa con debounce (≥300 ms) o al finalizar el stream; en un test que simula un stream de N tokens, la escritura a sessionStorage ocurre como máximo una vez por intervalo de debounce o una vez al terminar (spy sobre storage).
- [ ] El HTML de cada mensaje se calcula con `useMemo` dependiente del contenido del mensaje: re-renders ajenos (p. ej. otro mensaje streamando) no re-ejecutan marked+DOMPurify sobre mensajes ya parseados (test con spy: el parseo de un mensaje terminado no aumenta con renders adicionales).

**Control del stream (Z4-03, Z4-06):**

- [ ] El stream usa AbortController con cleanup: al desmontar el componente o navegar fuera, la petición se aborta y no hay updates de estado sobre el componente desmontado (test de unmount durante stream).
- [ ] Durante el streaming hay un botón **"Detener"** visible (i18n es/en) que aborta la respuesta y **conserva** el texto parcial ya recibido.

**Accesibilidad (Z4-04, Z4-05, Z4-09):**

- [ ] El contenedor de mensajes expone `aria-live="polite"` y el indicador "pensando" expone `role="status"` (test de atributos).
- [ ] La lista de mensajes usa ids estables como key (id de mensaje), no `key={index}` (inspección de código + test).
- [ ] El auto-scroll respeta `prefers-reduced-motion`: con la preferencia activada no hay scroll suave (comportamiento instantáneo o nulo según convención del proyecto); con la preferencia desactivada se mantiene el auto-scroll actual.

**Seguridad y errores (Z4-07, Z4-08):**

- [ ] El sanitize del chat fuerza `rel="noopener noreferrer"` en todo enlace con `target="_blank"` (hook `afterSanitizeAttributes` de DOMPurify o equivalente): test con `<a href="https://ejemplo" target="_blank">` que assertea el atributo `rel` resultante.
- [ ] El Alert de error del chat muestra título y un botón de **reintento** que reenvía el último mensaje del usuario; textos en es/en.

**Validación:**

- [ ] `cd apps/web && npm run test`, `npm run lint` y `npm run build` en verde tras la feature; los tests existentes del chat (`ChatPage.test.tsx`, etc.) se actualizan donde cambien contratos internos.

## Fuera de alcance

- **No se modifican las features en "Hecho ✅"** (011–017) más allá de los fixes citados (Z4-*): el protocolo SSE del backend (017) no cambia (mismo endpoint, mismo formato de chunk).
- **No se añaden dependencias**: marked y DOMPurify ya existen; `package.json` sin cambios (límite duro de `tech-stack.md`: ninguna dependencia nueva sin justificación).
- **Historial persistente en base de datos** (sobrevivir entre sesiones/dispositivos): se mantiene sessionStorage como hoy; la persistencia real sería feature nueva (hoy no está en roadmap).
- Virtualización de listas de mensajes muy largas, Markdown avanzado (syntax highlight, tablas complejas) y rediseño visual del chat.
- No se toca el backend ni `supabase/migrations/`.
