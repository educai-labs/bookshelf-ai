# 022 · Client Settings

**Estado:** hecho

## Qué hace

Sistema de configuración del cliente (visuales, idioma, privacidad, comportamiento) centralizado en un único módulo/contexto del frontend. Cubre las secciones 3.1–3.7 del mini-doc, la persistencia de preferencias y la accesibilidad. Incluye **i18n de TODA la UI existente** (features 011–017: dashboard, ficha de libro, editor de notas, chat, auth, modales, estados vacíos, formularios, errores, botones, menús, toasts, badges).

Secciones cubiertas (3.1–3.7 del mini-doc):

1. **Apariencia** — tema `light` / `dark` / `system` (sigue el SO). Sin recargar página; persiste entre sesiones; valor inicial `system`; ambos temas funcionan; contraste accesible.
2. **Idioma** — español / inglés. Default = idioma del navegador; si no es soportado → español. Persiste. **Todos los textos visibles traducidos** (errores, botones, menús, estados vacíos, formularios, modales, toasts, chat, badges). Fechas, números y etiquetas adaptados al idioma activo.
3. **Preferencias del lector** — tamaño de texto de lectura, ancho del área de lectura, interlineado, fuente de lectura, mostrar/ocultar info adicional del libro, confirmar antes de eliminar libros/notas. Valores iniciales razonables **a fijar en `plan.md`** (aquí se definen como valores referenciales con rango/validación clara).
4. **Preferencias del chat** — modo inicial (libro o biblioteca completa), mostrar/ocultar historial, limpiar historial al cerrar sesión, respuestas en el idioma de la interfaz, activar/desactivar generación automática de recomendaciones. El **modelo de IA no es configurable** por el usuario final.
5. **Notificaciones** — activar/desactivar: errores, fin de vectorización de nota, recomendaciones, cuenta. Mensajes claros y no bloqueantes.
6. **Privacidad y datos** — cerrar sesión, eliminar cuenta, exportar libros y notas, eliminar historial local del chat, consultar qué datos se almacenan, controlar si las notas se usan para búsquedas semánticas y chat. Las notas de un usuario **nunca** aparecen en resultados de otro.
7. **Accesibilidad** — navegación completa por teclado, estados de foco visibles, etiquetas accesibles para controles e iconos, `prefers-reduced-motion`, contraste adecuado, textos alternativos para portadas, no depender solo del color para estados.

**Persistencia** (reglas estrictas):

- Visuales / interfaz → `localStorage`.
- Cuenta → base de datos (sincronizada entre dispositivos).
- Temporales del chat → `sessionStorage`.
- **Nunca** secretos, tokens ni API keys en `localStorage` o `sessionStorage`.

**Backend**: existen endpoints de preferencias de cuenta que validan también en backend al guardar. Los cambios de preferencias aplican **sin reiniciar la app**.

## Por qué

Las preferencias del cliente son la capa de personalización que hace la app usable y accesible para cada lector. Centralizarlas en un único módulo/contexto evita estado disperso y bugs de sincronía. El i18n completo es prerrequisito de usabilidad bilingüe (misión: lectores activos) y de accesibilidad. La separación de persistencia (localStorage vs DB vs sessionStorage) equilibra velocidad (visuales locales), sincronía entre dispositivos (cuenta) y privacidad (chat efímero). Es **prerrequisito** de Production Deployment (020): sin preferencias tipadas, validadas y aisladas por usuario, la app en producción no garantiza privacidad ni accesibilidad.

## Criterios de aceptación

- [ ] Existe un único módulo/contexto frontend (p. ej. `SettingsProvider` + hook `useSettings`) que centraliza todas las preferencias de las secciones 3.1–3.7; ningún componente lee/escribe preferencias fuera de él.
- [ ] Tema: el usuario puede alternar `light` / `dark` / `system`; `system` sigue `prefers-color-scheme` del SO; el cambio aplica **sin recargar** la página (sin `router.refresh` ni `location.reload`).
- [ ] Tema persistente: tras cerrar y reabrir la app, el tema activo es el último elegido; valor inicial `system` cuando no hay preferencia guardada.
- [ ] Ambos temas (light/dark) renderizan correctamente en todas las vistas 011–017; el contraste cumple WCAG AA en textos y controles.
- [ ] Idioma: el usuario puede alternar español / inglés; el cambio aplica **sin recargar** la página.
- [ ] Idioma default = idioma del navegador (`navigator.language`); si no es `es` ni `en` → español; persiste entre sesiones.
- [ ] **i18n completo**: todos los textos visibles de las features 011–017 están traducidos (dashboard, ficha de libro, editor de notas, chat, login/register, modales, toasts, estados vacíos, formularios, errores, botones, menús, badges); no quedan strings hardcoded en un solo idioma.
- [ ] Fechas, números y etiquetas adaptados al idioma activo (p. ej. `Intl.DateTimeFormat`, `Intl.NumberFormat` o equivalente).
- [ ] Preferencias de lector: tamaño de texto, ancho del área, interlineado, fuente, mostrar/ocultar info adicional del libro y confirmar antes de eliminar libros/notas — todas funcionales y persisted; **valores por defecto definidos en `plan.md`** con rango/validación clara (p. ej. tamaño entre 14–22px, ancho entre 480–960px, interlineado 1.4–2.0).
- [ ] Preferencias de chat: modo inicial (libro / biblioteca completa), mostrar/ocultar historial, limpiar historial al cerrar sesión, respuestas en idioma de la interfaz y activar/desactivar recomendaciones automáticas — funcionales y persisted; el **modelo de IA no es configurable** por el usuario (no expone selector de modelo).
- [ ] Notificaciones: se pueden activar/desactivar errores, fin de vectorización de nota, recomendaciones y cuenta; los mensajes son claros y no bloqueantes (toasts, sin overlay modal obligatorio).
- [ ] Privacidad y datos: disponibles cerrar sesión, eliminar cuenta, exportar libros y notas, eliminar historial local del chat, consultar qué datos se almacenan y controlar si las notas se usan para búsquedas semánticas y chat.
- [ ] Aislamiento: las notas de un usuario **nunca** aparecen en resultados de otro (RLS cubre la DB; 022 verifica que la preferencia "usar notas para búsquedas/chat" respeta el aislamiento por `user_id`).
- [ ] Accesibilidad: navegación completa por teclado en todas las vistas de settings; foco visible; `prefers-reduced-motion` desactiva animaciones; alt text en portadas; los estados no dependen solo del color.
- [ ] Persistencia correcta: visuales/interfaz → `localStorage`; cuenta → DB (sincronizada entre dispositivos); temporales del chat → `sessionStorage`.
- [ ] **No secrets en storage**: un test/verificación confirma que ninguna API key, token, JWT ni `service_role` se almacena en `localStorage` o `sessionStorage`.
- [ ] Restaurar valores por defecto: existe una acción "Restaurar preferencias" que devuelve **todas** las preferencias (visuales + cuenta) a sus defaults.
- [ ] Preferencias de cuenta validadas en backend al guardar: existe(n) endpoint(s) que rechazan valores inválidos con error estructurado (`{ code, message, field? }`).
- [ ] Settings tipados (TypeScript/Zod); valores inválidos en el cliente producen errores claros antes de guardar.
- [ ] Responsive: la interfaz de settings funciona en móvil (`<640px`) y escritorio.
- [ ] Tests frontend: tema persistente y sin recarga; idioma sin recarga y default por navegador; i18n cubre todas las vistas (test de no-string-hardcoded); persistencia por tipo (localStorage/DB/sessionStorage); restaurar defaults; y no-secrets en storage.
- [ ] Tests backend: los endpoints de preferencias de cuenta validan y rechazan valores inválidos, y respetan el aislamiento por `user_id`.

## Fuera de alcance

- Configuración del servidor / desarrollador (entorno, DB, IA, CORS, logs, seguridad) → **feature 021**.
- Modelo de IA configurable por el usuario final — fuera de alcance por diseño (tech-stack fija `gemini-3.5-flash` como default; el modelo es server-side via 021).
- Persistencia de conversaciones de chat en DB → feature futura (017 las guarda en sessionStorage).
- Exportación a formatos adicionales (PDF, EPUB) más allá del mínimo (libros + notas) — feature futura.
- Editor de temas custom / paleta personalizable — feature futura.
- Idiomas adicionales más allá de es/en — feature futura.
- Panel de admin / gestión multiusuario — fuera de misión (no es multi-tenant SaaS).
