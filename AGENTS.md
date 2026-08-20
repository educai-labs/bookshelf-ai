# AGENTS.md — Flujo Spec-Driven Development (SDD)
**Última spec creada/actualizada**: `spec/features/008-isbn-lookup-service/spec.md` (2026-08-19)

> Esta plantilla documenta el flujo de trabajo obligatorio para el proyecto. Copia este archivo a la raíz de tu proyecto como `AGENTS.md` y adáptalo si es necesario.

## Principio fundamental

**NINGÚN CÓDIGO SE ESCRIBE SIN ESPECIFICACIÓN PREVIA.**

El flujo tiene **3 fases claras**, controlado por el usuario:

```
FASE 1: Inicialización     → generador-especs crea constitution + specs desde doc técnica completa
FASE 2: Desarrollo dirigido → Tú eliges feature → spec → plan → tasks → código → revisor → roadmap (una a una)
FASE 3: Nueva feature      → mini-doc → generador-especs propone spec + roadmap → tú decides cuándo empezar
```

Saltarse cualquier fase está prohibido. **Una sola feature en estado "en curso" a la vez**. La constitución (`spec/constitution/`) manda: si una feature choca con `mission.md` o `tech-stack.md`, se replantea la feature, no la constitución.

---

## Control de flujo (el usuario manda)

- **Fase 1**: Tú entregas la doc técnica completa. `generador-especs` analiza y **propone** (constitution + specs + priorización Siguiente/Backlog); tú validas y confirmas escritura de TODAS las specs.
- **Fase 2**: **Tú decides qué feature y cuándo empieza**. El orquestador nunca auto-inicia; solo arranca cuando dices "empieza feature NNN" o eliges vía `question`.
- **Fase 2**: **Solo una feature en "en curso" bloquea**. Features en "Siguiente 🔜" NO bloquean. Solo bloquea una feature que ya haya empezado su implementación (estado "en curso").
- **Fase 2**: **Confirmación antes de cada fase**. El orquestador te pregunta antes de invocar a cada subagente (especificador → planificador → descomponedor → implementador). No salta de fase sin tu visto bueno.
- **Fase 2**: **Fin = bloqueo**. Al mover a "Hecho ✅", el orquestador se detiene y espera tu indicación para la siguiente.
- **Fase 2**: **Límite de 3 reintentos** implementador↔revisor. Si falla 3 veces → escala a usuario.
- **Fase 2**: **Cancelación explícita**. Puedes cancelar feature en curso → va a Backlog con nota "Cancelada: [motivo]".
- **Fase 3**: Para features nuevas, entregas un **mini-doc técnico**. `generador-especs` propone spec + ubicación en roadmap (pregunta con `question` si faltan datos). **Aviso**: "Siguiente" no bloquea hasta que digas "empieza NNN". Tú validas, se escribe (transaccional: spec + roadmap o rollback), y **tú decides cuándo "empieza NNN"**.

---

## Estados de Feature

| Estado | Cuándo | Qué significa |
|--------|--------|---------------|
| `propuesta` | Creación spec (Fase 1, 2, 3) | En "Siguiente 🔜" o "Backlog 💡". Lista para empezar. NO bloquea. |
| `en curso` | Al confirmar primer `task(implementador)` | **Una sola a la vez**. Bloquea inicio de otras (Regla 0). |
| `hecho` | Revisor APROBADO + roadmap | En "Hecho ✅". Inmutable. Cambio = feature nueva (Fase 3). |
| `cancelada` | Usuario cancela (Regla 0) | En "Backlog 💡" con nota "Cancelada: [motivo]". |

---

## Estructura del proyecto (spec/)

```
spec/
├── constitution/            ← Reglas estables (cambian poco)
│   ├── mission.md           ← Qué construimos, para quién, principios, qué NO es
│   ├── tech-stack.md        ← Tecnologías, comandos, modelo de datos, convenciones, límites duros
│   └── roadmap.md           ← Orden y estado de features (Hecho / Siguiente / Backlog)
└── features/                ← Una carpeta por feature
    └── NNN-nombre-feature/
        ├── spec.md          ← Qué hace + criterios de aceptación (plantilla: spec/features/NNN-nombre-feature/spec.md)
        ├── plan.md          ← Cómo se implementa (plantilla: spec/features/NNN-nombre-feature/plan.md)
        └── tasks.md         ← Checklist de tareas (plantilla: spec/features/NNN-nombre-feature/tasks.md)
```

**Regla de numeración**: `NNN` es secuencial (001, 002, 003…). El siguiente número libre se consulta en `roadmap.md` (max en Hecho + Siguiente + Backlog + 1).

---

## Subagentes disponibles (globales en `~/.config/opencode/agent/`)

| Agente | Modo | Modelo | Rol |
|--------|------|--------|-----|
| `orquestador` | `primary` | `opencode/nemotron-3-ultra-free` | Guardián del flujo. 3 fases; una feature "en curso"; arranque explícito; confirmación por fase; ciclo cambio; reintentos; cancelación; nunca escribe código. |
| `generador-especs` | `subagent` | `opencode/nemotron-3-ultra-free` | **Fase 1 y 3**: Recibe doc técnica (completa o mini) → propone constitution + specs. Fase 1: crea TODAS specs + priorización. Fase 3: transaccional spec+roadmap. No escribe plan/tasks. |
| `especificador` | `subagent` | `opencode/nemotron-3.5-lightning-free` | Escribe y **actualiza** `spec.md` (Qué/Por qué/Criterios/Fuera de alcance) respetando `mission.md`. Estado inicial siempre `propuesta`. |
| `planificador` | `subagent` | `opencode/nemotron-3-ultra-free` | Escribe y **actualiza** `plan.md` (Enfoque/Implementación/Decisiones/Riesgos) respetando `tech-stack.md`. |
| `descomponedor` | `subagent` | `opencode/nemotron-3.5-lightning-free` | Desglosa y **actualiza** `plan.md` en checklist de `tasks.md`. Protege tareas `[x]` hechas. |
| `implementador` | `subagent` | `opencode/deepseek-v4-flash-free` | Ejecuta `tasks.md`, escribe código y valida (build/test/lint). **Marca Estado = en curso al iniciar primera tarea**. |
| `revisor` | `subagent` | `opencode/nemotron-3-ultra-free` | Verifica el código contra criterios de `spec.md` y la constitución. Solo lectura. **Incluye contador "Intento N de 3"**. |
| `roadmap` | `subagent` | `opencode/nemotron-3.5-lightning-free` | Mueve features a "Hecho" o "Cancelada" en `roadmap.md`. No mueve Backlog→Siguiente (usuario decide). |
| `agents-updater` | `subagent` | `opencode/nemotron-3.5-lightning-free` | Edita agentes en `~/.config/opencode/agent/` a petición del usuario. |
| `implementador-tecnico` | `subagent` | `opencode/deepseek-v4-flash-free` | **Standalone (fuera de orquestación)**: Fast-track puntual: doc técnico de UNA feature → código directo. Usuario lo invoca explícitamente. |

**Permisos clave**:
- `orquestador`, `revisor`: `edit: deny`, `bash: deny` (no tocan código).
- `generador-especs`, `especificador`, `planificador`, `descomponedor`, `roadmap`, `agents-updater`: `edit: allow` (solo sus `.md`), `bash: deny`.
- `implementador`, `implementador-tecnico`: `edit: allow`, `bash: allow` (escriben código y ejecutan validación).

---

## FASE 1 — Inicialización (proyecto nuevo)

1. **Tú entregas** documentación técnica completa del proyecto (requisitos, arquitectura, stack, criterios globales).
2. **Orquestador invoca** `generador-especs` con la doc técnica.
3. **`generador-especs` analiza y propone**:
   - `constitution/mission.md`, `tech-stack.md`, `roadmap.md` (con features numeradas en "Siguiente/Backlog").
   - Para cada feature: borrador de `spec.md` (Estado: `propuesta`).
   - **Lista completa de features detectadas**.
   - Si faltan datos críticos → `generador-especs` usa `question` (formato estandarizado) para preguntar.
4. **Tú validas la propuesta** (orquestador te la presenta, usas `question` si hay opciones de priorización).
5. **`generador-especs` escribe** todos los archivos `spec/constitution/` y `spec/features/NNN-*/spec.md` (TODAS las features de una vez).
6. **Roadmap poblado**. Orquestador espera tu orden: "empieza feature 001".

---

## FASE 2 — Desarrollo dirigido (tú mandas, una a una)

1. **Tú dices**: "empieza feature 001" (o eliges vía `question` entre "Siguiente" + "Backlog").
2. **Orquestador verifica Regla 0**: ¿hay feature en estado "en curso"? → Si sí, bloquea (o cancelas).
3. **Sin spec** → Orquestador pide confirmación → `task(especificador)` crea `spec.md` (Estado: `propuesta`).
4. **Sin plan** → Orquestador pide confirmación → `task(planificador)` crea `plan.md` (respeta `tech-stack.md`).
5. **Sin tasks** → Orquestador pide confirmación → `task(descomponedor)` crea `tasks.md` checklist.
6. **Implementación** → Orquestador pide confirmación → `task(implementador)` **marca Estado = en curso al iniciar** → ejecuta tasks, valida (test/lint/build), marca `[x]`.
7. **Revisión** → `task(revisor)` verifica **todos** los criterios de `spec.md` + constitución. **Incluye "Intento N de 3"**.
   - `APROBADO` → continua.
   - `RECHAZADO` (intento < 3) → vuelve a implementador con feedback (bucle).
   - `RECHAZADO` (intento = 3) → **escala a usuario**: "3 intentos fallidos. Último feedback: [resumen]. ¿Cómo procedemos? (revisar spec / cambiar enfoque / cancelar / otro)".
8. **Roadmap** → `task(roadmap)` mueve feature a "Hecho ✅" en `roadmap.md` (Estado: `hecho`).
9. **Orquestador se detiene** y espera tu indicación para la siguiente feature.

---

## FASE 3 — Nueva feature posterior

1. **Tú entregas** un **mini-doc técnico** de la feature nueva (requisitos, criterios, decisiones).
2. **Orquestador invoca** `generador-especs` con el mini-doc.
3. **`generador-especs` procesa y propone**:
   - Borrador de `spec.md` para la feature (número NNN siguiente).
   - Dónde ubicarla en `roadmap.md` ("Siguiente" o "Backlog").
   - **Aviso obligatorio**: "Si eliges 'Siguiente 🔜', la feature estará lista para empezar, pero SOLO bloqueará otras cuando digas 'empieza NNN'."
   - **Si faltan datos** → `generador-especs` usa `question` (formato estandarizado) para preguntar al usuario.
4. **Tú validas la propuesta** → `generador-especs` escribe `spec.md` y actualiza `roadmap.md` **transaccionalmente** (spec primero, verifica, luego roadmap; si falla roadmap → rollback spec).
5. **Tú decides cuándo**: "empieza NNN" → vuelve a **Fase 2**.

---

## Ciclo de Cambio de Spec (Regla 7)

Cuando una spec ya creada necesita modificarse (añadir criterio, corregir alcance, resolver ambigüedad):

**Disparadores:**
- Tú dices: "cambia la spec 002: añade criterio X / modifica alcance"
- `implementador` informa: "criterio Y no se puede implementar tal cual"
- `revisor` informa: "criterio Z es ambiguo / contradictorio"

**Flujo obligatorio (orquestador gestiona con confirmaciones):**
1. Orquestador resume el cambio → **Tú confirmas** iniciar ciclo.
2. `task(especificador modo=actualizar)` → spec.md actualizada (mantiene Estado).
3. `task(planificador modo=actualizar)` → plan.md actualizado (solo lo afectado; opcional: recibe plan anterior para diff).
4. `task(descomponedor modo=actualizar)` → tasks.md actualizado (no toca tareas `[x]` hechas; si invalida trabajo hecho → **pregunta al usuario**: "¿Revertir código? ¿Marcar bloqueada? ¿Continuar asumiendo riesgo?").
5. Vuelve a **Fase 2 normal**: implementador → revisor → roadmap.

**Reglas:**
- **Features en "Hecho ✅" NO se modifican**. Cambio en feature hecha = feature nueva (Fase 3).
- **Solo tú disparas el ciclo**. Implementador/revisor solo informan.
- **Confirmación en cada paso** (igual que Fase 2).

---

## Cancelación de Feature (Regla 0)

Si dices "cancela feature NNN":
1. Orquestador invoca `task(roadmap modo=cancelar)` con número y motivo.
2. `roadmap` mueve feature a "Backlog 💡" con formato: `- NNN · Nombre — **Cancelada**: [motivo]`.
3. Opcional: preguntas si archivar/borrar spec/plan/tasks de esa feature.

---

## Fast-track standalone: implementador-tecnico

**Fuera del flujo orquestado**. Para casos puntuales: "tengo doc técnico completo de una feature, impórtala a código ya".

**Uso**: Usuario invoca directamente `implementador-tecnico` (o se lo pide al orquestador, que aclara que es standalone).
- Recibe doc técnico de UNA feature → implementa directo (respeta `tech-stack.md`).
- **No crea** spec/plan/tasks/roadmap.
- **Valida** tests/lint/build.
- Usuario decide si tras eso quiere revisión (`revisor`) y actualizar roadmap.

---

## Constitución: referencia rápida

- **`mission.md`**: Define el "qué" y "para quién". Filtro para decidir si una feature encaja.
- **`tech-stack.md`**: Define el "cómo". Tecnologías, comandos (`test`, `lint`, `build`), convenciones, límites duros. **Ningún plan ni código puede contradecirlo**.
- **`roadmap.md`**: Vista de estado. Una feature "En curso" a la vez (exigido por el orquestador).

> Si una feature choca con `mission.md` o `tech-stack.md` → **se replantea la feature, no la constitución**.

---

## Plantillas de referencia

Las plantillas base viven en `spec_template/spec_template/` (copia esta carpeta a `spec/` al iniciar el proyecto). Una vez copiadas, los agentes referencian la estructura en `spec/`:

- `spec/constitution/mission.md`
- `spec/constitution/tech-stack.md`
- `spec/constitution/roadmap.md`
- `spec/features/NNN-nombre-feature/spec.md`
- `spec/features/NNN-nombre-feature/plan.md`
- `spec/features/NNN-nombre-feature/tasks.md`

**Uso**: Sustituye todo lo que esté entre `<…>` y borra las notas en _cursiva_.

---

## Formato `question` estandarizado

Todos los agentes usan `question` con esta estructura:
```json
{
  "question": "Pregunta clara al usuario",
  "header": "Etiqueta corta (max 30 chars)",
  "options": [
    {"label": "Opción 1", "description": "Explicación breve"},
    {"label": "Opción 2", "description": "Explicación breve"}
  ]
}
```

---

## Comandos de validación (desde `tech-stack.md`)

| Comando | Propósito |
|---------|-----------|
| `<comando test>` | Ejecuta la suite de tests. Debe pasar al 100%. |
| `<comando lint>` | Revisa estilo y convenciones. Debe pasar sin warnings. |
| `<comando build>` | Compila para producción. Debe generar artefacto válido. |

El implementador **debe** ejecutar los tres (si existen) tras cada tarea relevante y al final.

---

## Checklist para nueva feature (resumen Fase 2)

- [ ] Tú eliges la feature (vía "empieza NNN" o `question`).
- [ ] Orquestador verifica Regla 0: ¿ninguna otra en "en curso"?
- [ ] `especificador` → `spec.md` (Estado: `propuesta`, criterios medibles).
- [ ] `planificador` → `plan.md` (respeta `tech-stack.md`).
- [ ] `descomponedor` → `tasks.md` (tareas pequeñas, `[ ]`).
- [ ] `implementador` → **marca Estado = en curso** → código + validación (test/lint/build).
- [ ] `revisor` → `APROBADO` (todos los criterios + constitución). Incluye "Intento N de 3".
- [ ] `roadmap` → mover a "Hecho ✅" (Estado: `hecho`).
- [ ] Orquestador espera tu orden para la siguiente.

> **Si durante la implementación surge cambio en la spec**: se abre **Ciclo de Cambio de Spec** (Regla 7) → especificador(actualizar) → planificador(actualizar) → descomponedor(actualizar) → vuelve a implementador.
> **Si revisor RECHAZA 3 veces**: orquestador escala a usuario.
> **Si quieres parar**: di "cancela feature NNN" → va a Backlog con nota.

---

## Notas para el equipo

- **No edites** `spec/constitution/` a la ligera. Cambios allí afectan a todo el proyecto.
- **No borres** features de `features/` aunque estén en "Hecho" o "Cancelada"; son historial y trazabilidad.
- **Un agente por fase**: el orquestador garantiza separación de responsabilidades.
- **Si dudas**: consulta `mission.md` (¿encaja?) → `tech-stack.md` (¿cómo se hace?) → `roadmap.md` (¿qué toca ahora?).
- **Cambios en agentes**: usa el subagente `agents-updater` ("cambia X en el agente Y").
- **Fase 1 y 3**: `generador-especs` propone, tú validas, él escribe (transaccional en Fase 3).
- **Fast-track**: `implementador-tecnico` es standalone; úsalo solo para features sueltas con doc técnico listo.
- **Cambios en specs**: usa el **Ciclo de Cambio de Spec** (Regla 7) gestionado por el orquestador. Nunca edites spec/plan/tasks a mano sin pasar por el ciclo.
- **`question` tool**: todos los agentes usan formato estandarizado (label + description).