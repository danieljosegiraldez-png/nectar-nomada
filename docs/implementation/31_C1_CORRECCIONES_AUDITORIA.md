# C1 — Correcciones de la auditoría 17_

Ejecuta las correcciones que la auditoría `17_DESIGN_TO_IMPLEMENTATION_AUDIT`
(Partes A–F) identificó, **en el orden de abajo** — está ordenado por
consecuencia, no por esfuerzo.

**No arregles todo lo que la auditoría encontró.** Varios hallazgos son
simplificaciones correctas y quedan explícitamente fuera (§6). Corregir código
que está bien para que coincida con documentación vieja sería peor que no hacer
nada.

**Commits separados por sección.** Si algo se complica, se para ahí sin
bloquear lo demás.

---

## 1. `GAP_ANALYSIS_2026-08-10.md` — lo más urgente, y no por su costo

Ese documento afirma que Trazabilidad y Apiario son "SPECIFIED, cero código".
**Hoy son las partes más probadas de la plataforma.** Una sesión futura que lo
lea de buena fe rediseñaría desde cero trabajo ya construido y verificado.

Tres días bastaron para que sus dos hallazgos más importantes quedaran al
revés. Ese es el riesgo, no el contenido.

**Agregá un encabezado al inicio del archivo**, imposible de pasar por alto,
que diga: fecha en que se escribió, que su estado de construcción está
obsoleto, que Trazabilidad y Apiario están construidos y verificados, y que
para estado actual hay que mirar `README.md` de `docs/implementation/` y el
plan de ejecución de Fase 1.

No lo borres — su método fue bueno y varios hallazgos siguen siendo válidos.
Es un documento histórico que necesita decir que lo es.

## 2. ADR huérfanos — anexar al log

Dos decisiones reales viven fuera de `DECISIONS.md`:

- El ADR de A5.5 (offline, service worker, decisiones de sesión) — hoy solo en
  `22_APIARY_V1_SCOPING_REPORT.md` y README
- `docs/implementation/T12.5_ADR_DRAFT.md` — el de esquema de `Asset`

Anexalos con numeración correcta verificada contra el archivo real, y **borrá
los borradores**. Es exactamente el patrón que `DECISIONS.md` existe para
evitar, y ya pasó antes con ADR-037/038/039.

## 3. Audit trail en escrituras de evidencia — compounding

Solo existen 6 strings de operación de auditoría en todo el código. **Cero
llamadas a `recordAuditEvent`** en `lib/traceability/*`, `lib/apiary/*`,
`lib/sensory/*`.

Las escrituras a tablas clasificadas `measured_fact` y `original_record` —
justo las que CLAUDE.md §35 y `SECURITY.md` §6 señalan para tratamiento
reforzado— no generan ninguna fila de auditoría.

Esto es compounding: cada escritura sin auditar desde ahora es un hueco
permanente en el rastro evidenciario, y ya hay datos reales de producción de
tres clientes en la base.

**Agregá auditoría a las escrituras de evidencia** en esos tres módulos.
Recomendá primero el alcance —qué operaciones exactamente, con qué
granularidad— antes de implementar. No hace falta auditar toda lectura ni toda
escritura trivial; hace falta que un cambio a un hecho evidenciario deje
rastro.

## 4. Documentos que prometen algo falso

Un documento que promete algo que no se cumple es peor que uno que describe
una limitación real. **En todos estos casos el código está bien o la decisión
fue deliberada — se corrige el documento, no el código.**

- **`AI_GOVERNANCE.md` §3 y §5** — dicen que las lecturas de IA están
  scopeadas por RBAC. No lo están: `ai_service` no tiene ningún grant de
  SELECT, y las lecturas van por el cliente `prisma` completo. Describí lo que
  realmente ocurre: escritura restringida estructuralmente, lectura interna sin
  scope.
- **`SECURITY.md` §6** — dice que ningún rol tiene UPDATE/DELETE sobre
  `audit_event`. El rol de la aplicación los tiene. Hoy es append-only solo
  porque el código nunca los llama.
- **`SECURITY.md` §11** — describe sesiones diferenciadas por rol. A5.5 decidió
  deliberadamente 7 días uniformes. Corregí el documento y registrá la decisión
  en `DECISIONS.md`.
- **`RBAC.md` §2** — sus ejemplos (`('sample','create')`, `('order','refund')`)
  no corresponden a permisos reales; no existe el resourceType `order`. Es
  activamente engañoso: alguien podría concluir que los reembolsos están
  gateados por RBAC cuando no lo están.
- **`RBAC.md` §5** — falta "Project Viewer" y "Apiary Colony Event Recorder", y
  Farm Operator no refleja sus permisos reales de apiario.
- **`RBAC.md` §6** — su ejemplo `('classification','view_confidential')` quedó
  obsoleto; el diseño real son cinco acciones, una por nivel. **El código está
  mejor** — una sola acción no podría expresar "autorizado para Internal pero
  no Confidential".
- **`MVP_ROADMAP.md` §3** — todavía lista Apiario/Miel como diferido.
- **`DATA_ARCHITECTURE.md` §1** — la lista de esquemas quedó obsoleta **por
  segunda vez**; faltan `traceability` y `apiary`. Que se haya roto dos veces
  es el hallazgo, no el contenido.

## 5. Cuatro correcciones baratas de código

- **`generateDataCompletenessSuggestions` hace `project.findMany()` sin
  filtro** — sin RBAC, sin clasificación, escaneando todos los Projects. Con
  datos reales de Cafelino, Las Nubes y apiarios en la misma base, eso importa.
  Arreglalo o, si el scope correcto no es obvio, reportá qué haría falta.
- **`platform:manage_users` / `manage_permissions` y
  `research:create_evidence` / `approve_protocol`** están sembrados sin ruta
  que los implemente ni documento que los nombre. Nadie puede saber si fueron
  diferidos, si son solo-DB por diseño, o si se olvidaron. Una frase en
  `RBAC.md` resuelve.
- **`emailVerifiedAt` se escribe y nunca se lee.** `SECURITY.md` §1 promete que
  bloquea acciones de Partner/Research/Sensory. Decidí: o lo implementás, o
  corregís el documento. No dejes la promesa.
- **`SECURITY.md` §4** —el filtro público está bien implementado pero **no
  tiene ningún test**. Agregá uno: es el control que evita exponer un registro
  no público, y hoy nada lo protege de una regresión.

## 6. Fuera de alcance — no toques esto

La auditoría fue explícita en que varios "drifts" son el código estando mejor
que el documento. **No los cambies:**

- La generalización de miel a `Lot` reemplazando las cadenas lineales por
  dominio de `DOMAIN_MODEL.md` §4 — un solo modelo de grafo para todos los
  dominios es mejor, y ya se auto-documenta desde el código
- `Sample.sourceLotId` como denormalización deliberada
- `ProductVariant` con SKU e inventario en columnas directas
- El enum expandido de `Measurement.sourceType`
- El flujo de Stripe Checkout en vez de la API de cargos

**Tampoco entran en este ticket** (son tickets propios, no correcciones):
taxonomía de descriptores y defectos sensoriales, `CompetitionResult.rank`,
rate limiting, capacidad de reembolso, particionado de `measurement`, y el
vocabulario de `AssetStatus` para el pipeline de medios.

## 7. Mecanismo para que no se repita

La auditoría identificó dos patrones de falla recurrentes, no bugs puntuales:
documentos que describen enforcement de base de datos cuando solo hay
enforcement de aplicación, y documentos que se arreglan una vez y se vuelven a
poner obsoletos igual.

**Implementá el marcador de estado por entidad en `DOMAIN_MODEL.md`** — una
etiqueta corta (`BUILT` / `PARTIAL` / `SPECIFIED` / `DEFERRED`) junto a cada
entidad. Habría atrapado la obsolescencia de Apiario y Trazabilidad en
`GAP_ANALYSIS` y `MVP_ROADMAP` de inmediato, porque es el documento contra el
que ambos tendrían que verificarse.

Y **proponé** (sin implementar) atar esta auditoría a las compuertas de fase
del plan de Fase 1 §36, en vez de correrla ad hoc — disparada por "conjunto de
tickets completo", no por calendario ni por pedido manual.

## 8. Entregables

Commits separados por sección. Reportá qué se corrigió, qué se decidió no
corregir, y cualquier cosa de §5 que resulte más grande de lo que parece.

Actualizá `README.md` con el estado del ticket.
