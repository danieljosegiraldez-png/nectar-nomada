# 026 · Treinta y una páginas dan 500 con un id mal formado en la URL

**Estado: medido el 2026-10-09, sin construir — salvo `/lots/[id]` y sus diez subrutas, arregladas en
el PR que trae esta ficha.** Es un defecto, no una decisión: no hace falta preguntar nada para
arreglarlo.

## El defecto

Toda tabla de este esquema tiene el `id` como `@db.Uuid`. Cuando una página pasa el segmento de la
URL a una consulta sin mirar su forma, Postgres rechaza la conversión («invalid input syntax for type
uuid») y Prisma lanza `P2007`. Ninguna página atrapa ese error: la mayoría convierte en `notFound()`
sólo su propia clase de «no existe», algunas redirigen a su lista y otras no atrapan nada. Quien abre
`/plots/no-es-un-id` recibe un 500 donde tocaba un 404.

Con el PR #691 (pantallas de error) el 500 se ve más amable, pero sigue siendo un 500 y sigue diciendo
«algo falló» de una dirección que simplemente no existe.

## Cómo se midió

Un `next dev` desde un worktree de `origin/main` (`63cb99bb` + el arreglo de `/lots`), contra una base
desechable `nectar_ci_*` migrada y sembrada como la siembra `scripts/ci-con-base.sh`, con la sesión
de la cuenta DEMO de **Platform Admin** que crea `prisma/seed.ts`. Cada una de las **52** páginas con
un segmento dinámico (`find app -path '*\[*' -name page.tsx`) se pidió dos veces con `fetch`:

- con `no-es-un-id` en cada segmento, y
- con un UUID **bien formado que no existe** (`6a1f0c2e-8b3d-4e5f-9a7b-1c2d3e4f5a6b`).

Cada 500 se emparejó con el error que el servidor escribió justo antes de su línea `GET` (el log
entero, 2.012 líneas, leído con un guion). Las 39 respuestas 500 se pidieron **dos veces** y dieron
500 las dos.

**Y el árbol se movió mientras tanto.** `main` avanzó a `045f384a` con cambios en
`destinoDeFinca.ts`, `jornadasDeCosecha.ts` y `reporteDeVisita.ts`. Las cinco páginas que dependen
de ellos (`fincas/[siteId]/destino`, `finca/jornadas/[id]`, `field-sessions/[id]` y su reporte,
`informe/[token]`) se **volvieron a medir sobre `045f384a`**: mismos estados, y las líneas de abajo
son las de ese árbol. Los demás archivos citados no cambiaron entre los dos commits.

Los manejadores de API no entran: de los 11 `route.ts`, el único con segmento dinámico es
`api/auth/[...nextauth]`, que es de Auth.js.

**Fila patrón:** el lote DEMO `DCL-2027-BATCH-A` da **200** y su código aparece en el HTML, así que el
servidor hablaba con la base sembrada y la sesión funcionaba.

**El límite, dicho:** se midió con Platform Admin, que pasa todas las comprobaciones de permiso y por
eso llega a la consulta. Una cuenta más acotada puede recibir antes su propio 404 o una redirección en
algunas de estas páginas (`partner/[projectId]`, por ejemplo, rechaza antes a quien no tiene permisos
de socio en ámbito de plataforma). La tabla es el peor caso de esta clase, que es lo que ve quien
administra.

## Las 31 que dan 500 por `P2007`, agrupadas por la función donde revienta

La función es **la primera que reventó** en cada página, no necesariamente la única que recibe el
id. Arreglarla basta cuando es la única lectura del id antes de lo que la página atrapa; donde la
página lanza varias en paralelo, hay que cubrirlas todas. Medido: `apiaries/[id]` manda el id a la
vez a `getApiaryDetail`, a `listFieldSessions` —que lo consulta en `requireFieldSessionAccess`,
`lib/traceability/jornadaDeCampo.ts:34`— y a `getObserverCandidates`, y **no atrapa nada**: con el id
basura reventó en `hives.ts:619` y con el UUID inexistente en `jornadaDeCampo.ts:40`. Ahí la
comprobación va en la página. (`getProjectWorkspace` también lanza cuatro consultas en paralelo
—`lib/partner/workspace.ts:118`—, pero todas dentro de la misma función, así que una guarda al
principio de ella sí las cubre.) Lo señaló la revisión de Codex del 2026-10-09.

| función (archivo:línea donde revienta) | páginas |
|---|---|
| `requireLocationAttributeAccess` (`lib/traceability/locations.ts:189`) | `bodegas/[id]`, `instalaciones/[id]`, `plots/[id]/{ajustes, fotos/nueva, jornada/nueva, microparcela/nueva, muestras/nueva, suelo/nuevo}` — **8** |
| `puedeSubdividirParcela` (`lib/traceability/fincas.ts:343`), fuera del `try` de la página | `plots/[id]` |
| `conAncestros`, dentro de `can()` (`lib/rbac/service.ts:181`) | `plots/[id]/manejo/[interventionId]`, `plots/[id]/manejo/nuevo` |
| `getApiaryDetail` (`lib/apiary/hives.ts:619`) | `apiaries/[id]`, `apiaries/[id]/etiquetas` |
| `getHive` (`lib/apiary/hives.ts:490`) | `apiaries/[id]/hives/[hiveId]` |
| `getBiocharBatch` (`lib/traceability/biocharBatches.ts:276`) | `biochar/[id]` |
| `getCalibrationSessionDetail` (`lib/sensory/calibration.ts:78`) | `calibration/[calibrationSessionId]` |
| `getEditionDetail` (`lib/competitions/service.ts:40`) | `competitions/[editionId]` |
| `getStoryForEditor` (`lib/content/stories.ts:111`) | `content/[id]` |
| `instrumentoParaVerificar` (`lib/equipos/equipos.ts:822`) | `equipos/[id]` |
| `modeloParaFicha` (`lib/equipos/modelos.ts:412`) | `equipos/modelos/[id]` |
| `getFieldSessionTimeline` (`lib/traceability/fieldSessions.ts:613`) | `field-sessions/[id]` |
| `leerReporteDeVisita` (`lib/traceability/reporteDeVisita.ts:296`) | `field-sessions/[id]/report` |
| `detalleDeJornada` (`lib/traceability/jornadasDeCosecha.ts:323`) | `finca/jornadas/[id]` |
| `fincaParaDestino` (`lib/traceability/destinoDeFinca.ts:111`) | `fincas/[siteId]/destino` |
| `fincaParaLogotipo` (`lib/traceability/fincaLogo.ts:156`) | `fincas/[siteId]/logotipo` |
| `getProjectWorkspace` (`lib/partner/workspace.ts:125`) | `partner/[projectId]` |
| `getRecipeForEditor` (`lib/traceability/processTargets.ts:535`) | `recipes/[id]` |
| `getProtocolDetail` (`lib/research/protocols.ts:450`) | `research/[protocolId]` |
| `getProtocolVersionDetail` (`lib/research/protocols.ts:278`) | `research/execute/[protocolVersionId]` |
| `getTreatmentBatchDetail` (`lib/research/treatments.ts:651`) | `research/treatments/[id]` |
| `grantedKeysForSession` (`lib/sensory/service.ts:64`) | `sensory/[sessionId]` |

**`conAncestros` merece cuidado antes de tocarlo.** Está dentro de `can()`, así que una guarda ahí
cambia el servicio de RBAC entero: cualquier `can()` con un `scopeRefId` de ubicación mal formado
pasaría de lanzar a contestar «no». Probablemente es lo correcto —un ámbito que no existe no autoriza
nada—, pero es la frontera de seguridad y merece su propia prueba, no un arreglo de paso.

## Y siete que dan 500 también con un UUID bien formado que no existe — otro defecto

Éstas no las arregla una guarda de forma: el id es válido, la fila no existe, y lo que sube no es
`P2007`.

| página | lo que sube | dónde |
|---|---|---|
| `apiaries/[id]` | `location_not_found` | `requireFieldSessionAccess`, `lib/traceability/jornadaDeCampo.ts:40`, en el `Promise.all` de la página |
| `apiaries/[id]/hives/[hiveId]` | `hive_not_found` | `getHive`, `lib/apiary/hives.ts:500`; la página no atrapa nada |
| `calibration/[calibrationSessionId]` | `P2025` | `findUniqueOrThrow` en `lib/sensory/calibration.ts:78` |
| `competitions/[editionId]` | `P2025` | `findUniqueOrThrow` en `lib/competitions/service.ts:40` |
| `partner/[projectId]` | `P2025` | `findUniqueOrThrow` en `lib/partner/workspace.ts:119` |
| `field-sessions/[id]/report` | `FieldSessionValidationError("session_not_found")` | `lib/traceability/reporteDeVisita.ts:300`; la página sólo atrapa `LocationAccessError` |
| `sensory/herramientas/ruedas/[wheel]` | `PrismaClientValidationError` del enum `domain` | `obtenerRuedaSensorial`, `lib/sensory/ruedas.ts:59` — aquí el segmento no es un id sino un dominio, y **cualquier** valor que no esté en el enum da 500 |

## Rarezas vistas de camino, que no son 500

- `bodegas/[id]` e `instalaciones/[id]` con un UUID que no existe responden **200** con el cuerpo de
  «sin permiso», no 404.
- `content/[id]` y `recipes/[id]` con un UUID que no existe redirigen a su lista.
- `admin/users/[assignmentId]/permisos` redirige a `/admin/users?error=no_access` con las dos entradas:
  su `catch {}` lo atrapa **todo**, así que no da 500 pero tampoco dejaría ver un fallo real.

## Las que ya están bien (20)

Las 11 de `/lots/[id]` (desde el PR de esta ficha); `beneficio/secado/[unidad]`, que interpreta el
segmento con su propia expresión de UUID en `lib/beneficio/fichaDeUnidad.ts`; las cinco `[slug]`
(`experiences`, `locations`, `products`, `projects`, `stories`), que buscan por una columna de texto;
`informe/[token]`, que busca por el hash del token; `inventario/lotes/[id]`, que busca en memoria; y
`admin/users/[assignmentId]/permisos`, con la salvedad de arriba.

Total: 31 + 1 (`ruedas`) + 20 = 52.

## Cómo arreglarlo

El patrón del PR de `/lots`: en el servicio, antes de la consulta,
`if (!UUID.test(id)) throw new <la clase de «no existe» que la página ya atrapa>`, con la constante
de `lib/validation/uuid.ts`. Así no se atrapa ningún error de Prisma y cualquier otro sigue subiendo.
Si una función no tiene una clase así, o la página lanza varias lecturas del id en paralelo, o no
atrapa nada (`apiaries/[id]`, `apiaries/[id]/hives/[hiveId]`), la comprobación va en la página, justo
después de `await params`, con `notFound()`.

Para las siete de la segunda tabla: que la página atrape la clase de «no existe» que ya se lanza, y
cambiar `findUniqueOrThrow` por `findUnique` + la clase propia.

## Cómo se comprueba

Por función, una prueba como `tests/traceability/idMalFormado.test.ts`: el id basura da la clase de
«no existe», **un UUID válido inexistente da exactamente lo mismo** y uno existente se devuelve — y el
flip quitando la guarda tiene que tumbar justo las filas del id basura. Y por página, la medición de
arriba: las 52 con los dos ids, contando cuántas dan 500. Hoy son **32** con el id basura y **7** con
el UUID que no existe.
