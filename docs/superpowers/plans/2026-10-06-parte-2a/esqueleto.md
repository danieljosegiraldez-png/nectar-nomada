# Parte 2a — La receta con pasos · Plan de implementación (ESQUELETO)

> **Para quien redacta una tarea:** este esqueleto FIJA los nombres, las tablas, las firmas y el reparto entre
> tareas. No los cambies. Si al medir el código descubres que uno no puede funcionar, NO lo cambies en tu
> tarea: escríbelo en la sección «Conflictos con el esqueleto» de tu archivo, con la evidencia, y sigue con
> el resto.

**Para agentes:** SUB-SKILL REQUERIDA: superpowers:subagent-driven-development (recomendada) o
superpowers:executing-plans. Los pasos usan casillas (`- [ ]`).

**Objetivo:** la receta pasa a ser una lista ordenada de pasos con borrador y publicación; cada registro del
lote (corrida, intervención) se une a su paso o queda como desviación con motivo; abrir un proceso exige
receta, y la receta «Libre» se define antes de ejecutarse.

**Arquitectura:** tablas nuevas de paso (con adiciones, fines y requisitos) hijas de la versión; cuatro
tablas de registro ganan `stepTypeValueId`, `recipeStepId` y `motivoDesviacion`; un guardián único
(`exigePasoCoherente`) decide dentro de la transacción de cada registro; el avance se calcula sobre la
cadena del resolvedor de la Parte 1. Los lectores leen el paso de la corrida; las fases quedan como
compatibilidad.

**Stack:** Next.js 16, React 19, Prisma 7 (adaptador pg, cliente en `generated/prisma`), PostgreSQL 18,
Vitest 4, next-intl.

**Diseño (autoridad):** `docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md`, con su
§12 del 2026-10-03. **Decisiones del controlador:** `.superpowers/plan-2a/registro.md` (cada «Ruling» con su
porqué). **Reconocimiento con líneas medidas:** `.superpowers/plan-2a/reconocimiento/u1…u6*.md`.

**Corte en dos PR (decisión de Daniel, 2026-10-06; `dos-PR.md`).** La Parte 2a se entrega en **DOS PR**: **PR-A «La receta con pasos: esquema, vocabulario, autoría y editor»** (tareas 0, 1, 2, 3, 4, 5a, 9a, 14 y 15a; lleva la única migración) y **PR-B «La receta en la operación»** (tareas 0 otra vez, 5b, 6 a 13 y 15b; no lleva migración: es código). **La tarea 0 se corre al empezar CADA PR**, y la del PR-B une el `main` que ya trae el PR-A. La columna «PR» de la tabla de tareas dice a cuál pertenece cada una; las tareas conservan su número (5 y 15 se parten en a y b).

**Precondición:** la Parte 1 (PR #626) está en `main`. La tarea 0 lo comprueba y **une `main` con merge** en esta rama, que ya está publicada y la comparte la sesión de la 2b/2c: **nunca se rebasa ni se empuja con force** (registro R1, 2026-10-05).

## Reglas globales (valen para TODAS las tareas)

1. Node: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`. tsc y vitest con
   `NODE_OPTIONS=--max-old-space-size=4096`.
2. **Base de pruebas PROPIA:** `postgresql://postgres@127.0.0.1:55433/nectar_test_recetas_2a`
   (+ `nectar_test_recetas_2a_shadow`). El nombre casa con `^(nectar_test|nectar_ci|nn_flip_)` a propósito
   (la escotilla de limpieza de las tablas de sólo-añadir lo exige). Exportar `DATABASE_URL`,
   `TEST_DATABASE_URL` y `SHADOW_DATABASE_URL` a esas dos antes de vitest. Si hay que rehacerla (la tarea 0
   falla a medias), se crea la **sucesora** `nectar_test_recetas_2a_b` (después `_c`) y la vieja NO se
   borra. La tarea 15 (cada uno de sus dos cierres) crea además `nectar_ci_recetas_2a` (+ `_shadow`) —o el siguiente nombre libre— para `ci-con-base.sh`; la tarea 0 del PR-B elige la sucesora `_b` de la base propia, porque la del PR-A sigue ahí. Las bases
   desechables de un arnés se llaman `nn_flip_*`. Todas las demás se retiran con el visto bueno de Daniel
   tras la fusión.
3. **PROHIBIDO:** `npm run test:db` en cualquier forma, `prisma migrate reset`, `prisma db push
   --force-reset`, borrar bases (salvo las desechables `nn_flip_*` que cree el propio arnés), fijar
   `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`, tocar la base compartida `nectar_test`.
4. `git add` archivo por archivo (nunca `-A`); `git commit -F <archivo>`; contar `git show --stat` antes de
   seguir. Mensajes de commit en español, terminados con el trailer de atribución que pida el entorno que
   ejecuta el commit. Nunca un `git push` desnudo ni con force: se empuja con `git push -u origin recetas-parte-2a`
   al final de las tareas **0, 5a y 15a en el PR-A, y 0, 10 y 15b en el PR-B** (partida del 2026-10-06), cada vez tras comprobar que el remoto es ancestro de HEAD; si el push se
   rechaza, PARAR y avisar (la sesión de la 2b/2c también commitea en esta rama). Si GitHub borró la rama al fusionar el PR-A, el primer empuje del PR-B (el de la tarea 0) la recrea.
5. **Prueba primero** (que caiga por la razón esperada), código, verde, commit, y **después** el flip-test:
   una mutación cada vez, imprimiendo sha del archivo antes y después (distintos), tsc con la mutación,
   `git diff --stat`, y **el nombre** de la prueba que cae; restaurar con `git checkout -- <archivo>`. La
   mutación quita la CONDUCTA, no el token con el que casa un detector.
6. Cada prueba lleva su **control** al lado (el caso válido que pasa), para que no pase vacía. La limpieza de
   lo que crea un `it` va en `afterEach`/`afterAll` con `assertDefinedWhere`, en orden de FK, **nunca**
   debajo de las aserciones. Contar filas de las tablas tocadas antes y después: iguales.
7. Toda prueba nueva que necesite base va al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`,
   y se comprueba con `bash scripts/ci.sh` que no corre en el carril hermético.
8. Si la tarea toca TypeScript: `npx tsc --noEmit` y, al final de la tarea, `npm run build`.
9. Toda función nueva que toque la base: su fila en el inventario (`node scripts/inventario-de-acceso.mjs`,
   cifras y nota en `docs/arquitectura/inventario-de-acceso.md`) y, si no recibe principal, su entrada en
   `docs/arquitectura/acceso-a-datos.allowlist.json`. Una función que audita con el `tx` recibido sigue
   `tests/arquitectura/audit-atomico.test.ts`.
10. Nada lee el proceso de un lote fuera del resolvedor (`tests/arquitectura/proceso-por-el-resolvedor.test.ts`).
11. Textos visibles en español y en inglés (`messages/es.json` y `messages/en.json`), claves nuevas al final
    de su espacio. Un error nuevo que llegue a una acción tiene su rama en `friendlyError`; un `redirect`
    va **fuera** del `try`.
12. Identificadores en el estilo de la Parte 1 (español donde la Parte 1 ya lo usa). Los nombres de este
    esqueleto son la lista que Daniel revisa (diseño §12): no se inventan otros.
13. Lo que el paquete «farm-to-green v2» no trae (p. ej. qué ejes aplican a cada tipo) se dice en el código
    como inferencia de la casa, no del paquete. Nunca se inventan cifras: las referencias se copian con su
    fuente.
14. **Guiones fuera del worktree.** `eslint .` no ignora `.superpowers/`, así que todo guion auxiliar de una
    tarea (`.mjs`, `.cjs`, `.js`, `.jsx`, `.ts`, `.tsx`, `.mts`, `.cts`) vive en
    `~/Developer/nectar-worktrees/recetas-parte-2a--guiones/` (`$GUIONES`). En `.superpowers/plan-2a/out/`
    sólo lo que eslint no lee (`.txt`, `.json`, `.md`, `.sql`, `.sh`, `.tsv`) — ampliada el 2026-10-04 (C10).
15. **Autoría de recetas = el permiso del Coffee Process Manager** (decisión de Daniel V16, 2026-10-04):
    toda escritura de autoría pasa por `exigeAutoriaDeReceta` (tarea 3). `edit_beneficio` ya no basta.
    Abrir un proceso, también con Libre, sigue siendo `lot:manage` (V13).

## Esquema que nace (tarea 1) — nombres FIJOS

Una sola migración `prisma/migrations/<marca>_receta_con_pasos/migration.sql`, con `<marca>` posterior a la
última migración de `main` al construir (la tarea 0 la mide).

**Tablas nuevas (schema `traceability`):**

- `ProcessRecipeStep` → `process_recipe_step`: `id`, `recipeVersionId` (→ version, Cascade), `seq` Int,
  `stepTypeValueId` (→ VariableCatalogValue del catálogo `tipo_paso`, Restrict), `intencion` String?,
  `opcional` Boolean @default(false), ejes: `estadoFrutoValueId?`, `mucilagoObjetivo` Int? (lo que QUEDA),
  `oxigenoValueId?`, `temperaturaValueId?`, `temperaturaMinC` Decimal(5,2)?, `temperaturaMaxC`
  Decimal(5,2)?, `fuenteMicrobianaValueId?`, `medioValueId?`, `fisicoValueId?` (todos → VariableCatalogValue,
  Restrict), `modoSecado DryingEnvironment?`; por defecto: `horasMin Int?`, `horasSugeridas Int?`,
  `horasMax Int?`, `volteoCadaHoras Int?`, `humedadMinPct Decimal(5,2)?`, `humedadMaxPct Decimal(5,2)?`;
  fin: `finPorTiempo Boolean @default(false)`, `reglaDeFin StepEndRule @default(first)`.
  `@@unique([recipeVersionId, seq])` y `@@unique([id, recipeVersionId])` (para la FK compuesta de las metas).
  CHECKs: `process_recipe_step_mucilago_en_tramos`: `mucilago_objetivo IN (0, 10, 25, 50, 75, 100)` (0 = Lavado, 100 = Honey; decisión de Daniel V9); `horas_min <= horas_sugeridas <= horas_max` cuando haya
  valores; `humedad_min_pct <= humedad_max_pct`; `temperatura_min_c <= temperatura_max_c`.
- `ProcessRecipeStepAddition` → `process_recipe_step_addition`: `id`, `stepId` (Cascade),
  `categoriaValueId` (→ VariableCatalogValue: `sustrato_anadido` o `levadura_cultivo`, Restrict),
  `cantidad Decimal(12,4)?`, `unidad String?`, `momento AdditionMoment` (`pre_green | post_green`).
  CHECK: `cantidad` y `unidad` o las dos o ninguna.
- `ProcessRecipeStepEnd` → `process_recipe_step_end`: `id`, `stepId` (Cascade), `variable String`,
  `operador StepEndOperator` (`gte | lte`), `valor Decimal(12,4)`, `unidad String`,
  `desdeLecturaId String?` (→ Measurement, Restrict: la lectura de cierre marcada de la que salió, §5.3).
- `ProcessRecipeStepRequirement` → `process_recipe_step_requirement`: `stepId` (Cascade),
  `capacidadValueId` (→ VariableCatalogValue del catálogo `capacidad`, Restrict); `@@id([stepId, capacidadValueId])`.
- `ProcessStepClosingReading` → `process_step_closing_reading` (§5.3, «lecturas de cierre»): `id`,
  `measurementId` (→ Measurement, Restrict), `fermentationRunId?`, `dryingRunId?`,
  `lotProcessInterventionId?` (Cascade las tres), `createdAt`, `createdBy?`. CHECK: exactamente una de las
  tres no nula. `@@unique` por (measurementId, registro).

**Enums nuevos:** `StepEndRule { first all }`, `StepEndOperator { gte lte }`, `AdditionMoment { pre_green post_green }`.

**Columnas nuevas:**

- `ProcessTarget.recipeStepId String?` con FK COMPUESTA `(recipe_step_id, recipe_version_id)` →
  `process_recipe_step(id, recipe_version_id)` (la meta y su paso son de la misma versión, estructural).
  Se cambia `@@unique([recipeVersionId, phase, variable, moment])` por dos índices únicos parciales en SQL:
  `(recipe_version_id, phase, variable, moment) WHERE recipe_step_id IS NULL` y
  `(recipe_step_id, variable, moment) WHERE recipe_step_id IS NOT NULL`. En `schema.prisma` queda un
  `@@index` con un comentario que dice dónde viven.
- `ProcessRecipe.esLibre Boolean @default(false)`, `ProcessRecipe.derivadaDeVersionId String?` (→ version,
  Restrict: la plantilla de la que se derivó, §3.4), `ProcessRecipe.parecidaAVersionId String?` (→ version,
  Restrict: con qué receta publicada coincidió una Libre), `ProcessRecipe.motivoDeLibre String?`.
  CHECKs: `parecida_a_version_id IS NULL OR motivo_de_libre IS NOT NULL`; `es_libre OR (parecida_a_version_id IS NULL AND motivo_de_libre IS NULL)`.
- `LotProcess.origenDeRecetaVersionId String?` (→ version, Restrict, §5.3).
- `process_recipe.organization_id`: la FK pasa de `ON DELETE SET NULL` a **RESTRICT** (registro, Ruling
  FK-ORG: borrar una organización convertía en silencio sus recetas en plantillas).
- En `FermentationRun`, `DryingRun`, `LotProcessIntervention` y `FermentationIntervention`:
  `stepTypeValueId String?` (→ VariableCatalogValue, Restrict), `recipeStepId String?` (→
  ProcessRecipeStep, **Restrict**: un `SET NULL` convertiría en silencio un registro en desviación),
  `motivoDesviacion String?`. CHECK en las cuatro: `recipe_step_id IS NULL OR step_type_value_id IS NOT NULL`.
- `LotProcessIntervention.catalogValueId` pasa a **anulable**, con CHECK
  `catalog_value_id IS NOT NULL OR step_type_value_id IS NOT NULL` (decisión de Daniel: el acto es el tipo
  de paso).
- `ProcessRecipeVersion.status`: ya es `RecordStatus @default(draft)`; las versiones `approved` de hoy no
  se tocan (se cuentan en la tarea 0 en la base propia; en producción, en el PR).

## Firmas que se pasan entre tareas — FIJAS

**Tarea 2 — `lib/recetas/vocabulario.ts` (puro, sin base):**
```ts
export const TIPOS_DE_PASO: readonly TipoDePaso[]; // los 23 ids del paquete + "prefermentacion"
// Los 23 de processing_axes.json (step_types, en su orden, ids tal cual) + "prefermentacion" (D1):
export type TipoDePaso = "reception" | "sorting_flotation" | "sanitation" | "cold_hold" | "freezing" | "pulping" | "demucilage" | "fermentation" | "immersion_hot" | "immersion_cold" | "inoculation" | "addition" | "washing" | "soaking" | "drying" | "hulling_wet" | "reposo" | "storage" | "aging" | "monsooning" | "barrel_aging" | "decaf" | "milling" | "prefermentacion";
export const TRAMOS_DE_MUCILAGO: readonly [0, 10, 25, 50, 75, 100]; // lo que QUEDA (V9)
export type EjeDelPaso = "estadoFruto" | "mucilagoObjetivo" | "oxigeno" | "temperatura" | "fuenteMicrobiana" | "medio" | "fisico" | "modoSecado" | "adiciones";
export const EJES_POR_TIPO_DE_PASO: Readonly<Record<TipoDePaso, readonly EjeDelPaso[]>>;
export type RegistroDePaso = "fermentationRun" | "dryingRun" | "lotProcessIntervention" | "fermentationIntervention";
export const TIPOS_POR_REGISTRO: Readonly<Record<RegistroDePaso, readonly TipoDePaso[]>>; // tabla §4.1
export const FASE_DEL_TIPO: Readonly<Partial<Record<TipoDePaso, "fermentation" | "drying">>>;
```
**Tarea 2 — `lib/recetas/referencias.ts`** + `lib/recetas/referenciasDelPaquete.json` (copia con procedencia):
```ts
export interface ReferenciaDelPaquete { parametro: string; tipoDePaso: TipoDePaso | null; valor: string; fuente: string; confianza: "high" | "medium" | "low"; alternativas: readonly { valor: string; fuente: string }[]; marcarVisible: boolean; noPrecargar: boolean; nota: string | null }
export const SINONIMOS_ENTRE_CATALOGOS: readonly { termino: string; catalogo: string; valor: string }[];
export function referenciasDelTipo(tipo: TipoDePaso): readonly ReferenciaDelPaquete[];
```
**Tarea 3 — `lib/recetas/autoria.ts`:** `export async function exigeAutoriaDeReceta(userAccountId: string,
organizationId: string | null): Promise<void>` y su gemela booleana `puedeAutoriaDeReceta(userAccountId, organizationId): Promise<boolean>` (misma regla, una sola fuente; la usan las lecturas de T14 y `puedeConvertirLibre`, Ruling C4) — la ÚNICA regla de autoría (registro, Ruling A). Nace con el
permiso nuevo y el perfil «Coffee Process Manager» en `lib/rbac/catalog.ts`.
**Tarea 3 — `lib/recetas/errorDeReceta.ts`:** `export class RecipeError extends Error {}`,
`CODIGOS_DE_RECETA_TRADUCIDOS`, `claveDeErrorDeReceta(error: unknown): string | null` (gemelo de
`claveDeErrorDeProceso`).
**Tarea 3 — `lib/recetas/pasos.ts`:**
```ts
export async function agregarPaso(userAccountId: string, input: { recipeVersionId: string; despuesDeSeq: number | null; paso: PasoEditable }): Promise<{ id: string }>;
export async function actualizarPaso(userAccountId: string, input: { stepId: string; paso: PasoEditable }): Promise<void>;
export async function quitarPaso(userAccountId: string, stepId: string): Promise<void>;
export async function moverPaso(userAccountId: string, input: { stepId: string; aSeq: number }): Promise<void>;
export async function publicarVersion(userAccountId: string, recipeVersionId: string): Promise<void>;
export async function pasosDeLaVersion(userAccountId: string, recipeVersionId: string): Promise<PasoConDetalle[]>;
```
(`PasoEditable` = los campos de `ProcessRecipeStep` con sus adiciones, fines, requisitos y metas del paso.)
**Tarea 4 — `lib/recetas/versiones.ts`:**
```ts
export async function nuevaVersionBorrador(userAccountId: string, desdeVersionId: string): Promise<{ id: string; version: number }>;
export async function derivarReceta(userAccountId: string, input: { plantillaVersionId: string; organizationId: string; nombre: string }): Promise<{ recipeId: string; versionId: string }>;
```
**Tarea 5a (PR-A) — `lib/traceability/lotProcess.ts`:** `abrirProceso`, si se le pasa una versión, la exige publicada, de receta viva y de la organización del lote; nuevos códigos de proceso
`version_no_publicada`, `receta_de_otra_organizacion` (y los dos que ya lanzaba, `recipe_archived` y `recipe_version_not_found`) en `CODIGOS_DE_PROCESO_TRADUCIDOS`. **No hace obligatoria la receta.**
**Tarea 5b (PR-B):** `abrirProceso` exige receta; nuevo código `sin_receta`.
`tests/helpers/procesoDePrueba.ts` gana `recetaDePrueba(orgId)` y `abrirProcesoDePrueba` la usa por defecto.
**Tarea 6 — `lib/traceability/procesoDelLinaje.ts` y `lib/recetas/avance.ts`:**
`ProcesoEnCadena` gana `processRecipeVersionId: string | null`.
```ts
export interface PasoConAvance { stepId: string; seq: number; tipo: TipoDePaso; opcional: boolean; registros: readonly { tabla: RegistroDePaso; id: string; inicio: Date }[] }
export async function avanceDelProceso(tx: Prisma.TransactionClient | typeof prisma, lotId: string): Promise<{ recipeVersionId: string | null; pasos: readonly PasoConAvance[]; siguiente: PasoConAvance | null } | null>;
```
**Tarea 7 — `lib/recetas/guardian.ts`:**
```ts
export async function exigePasoCoherente(tx: Prisma.TransactionClient, input: { registro: RegistroDePaso; recipeVersionIdDelProceso: string | null; recetaTienePasos: boolean; recipeStepId: string | null; stepTypeValueId: string | null; motivoDesviacion: string | null }): Promise<{ recipeStepId: string | null; stepTypeValueId: string | null; motivoDesviacion: string | null }>;
```
Códigos de proceso: `paso_de_otra_receta`, `paso_no_corresponde`, `desviacion_sin_motivo`. El `stepType` del
registro se toma del paso. Lo usan `startFermentationRun`, `startDryingRun`, `recordFermentationIntervention`
(tarea 7) y `registrarIntervencion` del proceso (tarea 8).
**Tarea 11 — `lib/recetas/lecturasDeCierre.ts`:** `marcarLecturasDeCierre(tx, { registro, registroId, measurementIds })`, llamada por las tres puertas de fin.

## Tareas (orden y reparto)

| # | PR | Tarea | Archivos principales | Consume | Produce |
|---|---|---|---|---|---|
| 0 | **A y B** | Preparación: comprobar que la Parte 1 está en main y unir `main` con merge (R1; nunca rebase); `npm ci`; base propia `nectar_test_recetas_2a` (template0, builtin C.UTF-8) restaurada del volcado más nuevo + `migrate deploy` + `db:seed`; medir de nuevo lo que el esqueleto supone (líneas, versiones approved en la base, llamadas a `abrirProcesoDePrueba`); línea base de las pruebas que la 2a toca | — | — | línea base, marca de la migración |
| 1 | **A** | Esquema y migración: tablas, enums, columnas, FK compuesta, índices parciales y CHECKs; pruebas de la BASE (cada CHECK y la FK compuesta con SAVEPOINT y control) | `prisma/schema.prisma`, la migración, `tests/recetas/esquemaDePasos.test.ts` | — | el esquema de arriba |
| 2 | **A** | Vocabulario: `tipo_paso`, `fisico`, `capacidad` y los valores nuevos en catálogos existentes (`lib/research/catalogs.ts`, con definiciones de la casa: lavado, honey, fiebre…); `vocabulario.ts`; `referencias.ts` + JSON del paquete con todas sus autoridades; textos es/en de los tipos con su guardia (como `motivos-de-devolucion-traducidos`) | `lib/research/catalogs.ts`, `lib/recetas/vocabulario.ts`, `lib/recetas/referencias.ts`, `lib/recetas/referenciasDelPaquete.json`, messages, pruebas herméticas | 1 | vocabulario y referencias |
| 3 | **A** | Autoría (`exigeAutoriaDeReceta`, permiso y perfil del Coffee Process Manager), borrador, pasos y publicar: la versión nace `draft` (cambia `createRecipeWithVersion`/`createRecipeVersion` y `recipeAuthoring.test.ts:94`); editar sólo borrador; agregar/actualizar/quitar/mover pasos con validación por `EJES_POR_TIPO_DE_PASO`; metas por paso (`validateTargets` sin `phase` con paso; `paso_de_otra_version`); publicar deriva UNA fase por tipo desde el primer paso de esa fase; FOR UPDATE de la versión; `RecipeError` con textos; `nextVersion` dentro de la transacción | `lib/recetas/pasos.ts`, `lib/recetas/errorDeReceta.ts`, `lib/traceability/processTargets.ts`, pruebas | 1, 2 | firmas de la tarea 3 |
| 4 | **A** | Versiones y plantillas: `nuevaVersionBorrador` copia pasos, adiciones, fines, requisitos, metas y fases con referencias remapeadas (extiende R8; reescribe la copia de fases de `processTargets.ts:633-674`); plantillas sólo editables con alcance de plataforma; `derivarReceta` con `derivadaDeVersionId` | `lib/recetas/versiones.ts`, `processTargets.ts`, pruebas | 3 | firmas de la tarea 4 |
| 5a | **A** | Lo que se pasa a `abrirProceso` y al tueste se exige: `abrirProceso`, si se le pasa una versión, la rechaza si no está publicada, si su receta está archivada o si es de otra organización (`version_no_publicada`, `recipe_archived`, `receta_de_otra_organizacion`, `recipe_version_not_found`, con texto), bloqueando la versión y su receta con `FOR SHARE` DESPUÉS de `bloquearLinaje`; `listRecipeVersionsForLot` y los selectores del tueste no ofrecen borradores, Libres ni archivadas (con el `_count` de pasos y las metas con `recipeStepId: null`, I5); el tueste rechaza una versión no publicada o Libre. **NO hace obligatoria la receta** | `lib/traceability/lotProcess.ts`, `processTargets.ts`, `roasting.ts`, `errorDeProceso.ts`, messages, pruebas | 1, 3 | selectores y puertas |
| 5b | **B** | Receta obligatoria: `abrirProceso` exige receta (`sin_receta`); `recetaDePrueba` en el ayudante y ajuste de las aperturas de prueba; la demo de la semilla abre con receta (con pasos sin cifras); se invierte `lotProcess.test.ts` «se puede abrir SIN receta»; la división y la devolución (R6/R7) NO exigen receta. Va con la Libre (10): sin ella un operario no podría abrir un proceso que no case con ninguna receta | `lib/traceability/lotProcess.ts`, `tests/helpers/procesoDePrueba.ts`, `prisma/seed.ts`, pruebas | 5a | apertura con receta |
| 6 | **B** | Avance sobre la cadena (§4.3): `ProcesoEnCadena` lleva la versión; `avanceDelProceso` sigue `derivedFromLotProcessId` mientras `origen !== 'original'`; propone el siguiente pendiente; un reproceso con la misma receta NO hereda | `lib/traceability/procesoDelLinaje.ts`, `lib/recetas/avance.ts`, pruebas | 1, 3, 5b | `avanceDelProceso` |
| 7 | **B** | Guardián en corridas y en los manejos de fermentación (§4.2, §4.4): `exigePasoCoherente`; `startFermentationRun`/`startDryingRun` reciben `recipeStepId`, `motivoDesviacion`; `recordFermentationIntervention` pasa a transacción con auditoría y bloqueo; no son desviación los registros bajo receta sin pasos, ni bajo proceso viejo sin receta, ni trilla/tueste | `lib/recetas/guardian.ts`, `fermentation.ts`, `drying.ts`, pruebas | 1, 2, 6 | `exigePasoCoherente` |
| 8 | **B** | Guardián en las intervenciones del proceso: `registrarIntervencion` (el del PROCESO, `lotProcess.ts`, no el fitosanitario) decide dentro de una transacción con `bloquearLinaje`; `stepTypeValueId` como acto; el valor de catálogo opcional con tipo; desviación; los cuatro alias de `doble_mosto` en `sustrato_anadido` (registro I7), en el mismo commit que `aliasOfId: null` al ofrecer y `aliasOfId ?? id` al guardar (corte del 2026-10-06: antes los sembraba la 2) | `lotProcess.ts`, `lib/research/catalogs.ts`, pruebas | 7 | intervención con paso |
| 9 | **B** | Lectores por paso (§3.1, §3.2): la cola de secado, el tablero (liberación por corrida) y `compareRunToTargets` leen el paso de la corrida; «dos secados de volteo distinto» (el filtro `recipeStepId IS NULL` de las metas de la versión es de la 9a) | `lib/beneficio/colaDeSecado.ts`, `lib/beneficio/datosDelTablero.ts`, `processTargets.ts`, pruebas | 1, 3, 7, 9a | lectores por paso |
| 9a | **A** | Las metas de la versión son las que no tienen paso (§3.2; corte del 2026-10-06): la cola de secado, el tablero, `compareRunToTargets` y `getPerfilDeTuesteElegido` leen de la versión sólo las metas con `recipeStepId IS NULL`; una meta de un paso no la lee ninguno de los cuatro. Entre la 5a y la 14: no usa nada del PR-B | `lib/beneficio/colaDeSecado.ts`, `lib/beneficio/datosDelTablero.ts`, `lib/traceability/processTargets.ts`, `lib/traceability/roasting.ts`, pruebas | 1, 2, 3 | metas de la versión sin paso |
| 10 | **B** | Receta Libre (§5.2): abrir con Libre exige intención, pasos planeados y grado; crea receta `esLibre` publicada con nombre único; control de parecido contra las publicadas que la organización puede usar (se guarda `parecidaAVersionId`/`motivoDeLibre`); un P2002 de receta no sale como `process_already_open` | `lib/recetas/libre.ts`, `lotProcess.ts`, pruebas | 3, 5b | apertura con Libre |
| 11 | **B** | Lecturas de cierre y convertir la Libre (§5.3): `marcarLecturasDeCierre` por las TRES puertas de fin; convertir copia lo planeado a una receta de la organización en borrador, propone fines SÓLO desde lecturas marcadas, y pone `origenDeRecetaVersionId`; exige el permiso del Process Manager (`exigeAutoriaDeReceta`) | `lib/recetas/lecturasDeCierre.ts`, `lib/recetas/convertir.ts`, `fermentation.ts`, `drying.ts`, `bandejasDelSecado.ts`, pruebas | 4, 10 | conversión |
| 12 | **B** | Recepción (§4.5): avisos calculados al leer, desde todas las recepciones de la ascendencia contra el paso `reception` de la versión; sin recepción → aviso propio; no se guarda nada | `lib/recetas/recepcion.ts`, pruebas | 3, 6 | avisos |
| 13 | **B** | Acciones y pantallas operativas: elegir paso (propuesto por el avance) y motivo de desviación al empezar corridas y registrar manejos; abrir con receta o con Libre; marcar lecturas de cierre por las tres puertas; avisos de recepción; códigos nuevos en `friendlyError`; las acciones que hoy son `Promise<void>` sin `try` ganan su traducción | `app/actions/traceability.ts`, `app/lots/[id]/**`, componentes, messages, pruebas de fuente | 5b–12 | pantallas operativas |
| 14 | **A** | Editor de recetas por pasos (§6): lista de pasos (añadir, quitar, mover, opcional) sólo en borrador; formulario por tipo con sus ejes; referencias con fuente y confianza (low/NN visibles); publicar; nueva versión; derivar plantilla; sustituye a la pantalla de fases; reescribe `campos-con-dos-puertas`. **Sin lo de convertir una Libre**: la redirección a `/recipes/<id>?ok=convertida` la pone la 13 (aquí queda sólo su lector) | `app/recipes/**`, componentes, `tests/arquitectura/campos-con-dos-puertas.test.ts`, messages | 2–4 | editor |
| 15a | **A** | Cierre del PR-A: compuerta entera (verify, ci.sh, build, ci-con-base sobre base nueva, suite), diseño al día en lo que el PR-A construye (esquema, vocabulario, autoría, editor), el párrafo «Retroceso» (la migración vive aquí), el SQL de sólo lectura de producción y la lista de nombres del PR-A; PR que abre la sesión y fusiona quien lleve el turno | docs | 0–4, 5a, 9a, 14 | PR-A |
| 15b | **B** | Cierre del PR-B: compuerta entera, diseño al día en lo demás (lo que el PR-B construye) y la lista de nombres del PR-B; PR sin migración, que abre la sesión y fusiona quien lleve el turno | docs | 0, 5b–13 | PR-B |

## Tabla de guardianes del diseño §8 → tarea que la escribe

4.2 paso de otra receta, tipo que no corresponde, tipo igual al del paso → 7 (y 8 para intervenciones) ·
4.4 desviación → 7 · §3.1 dos secados → 9 · §3.2 metas por paso → 3 (y que los lectores sólo lean las de la versión sin paso → 9a) · §3.3 borrador → 3 · §3.3 una versión no publicada no se abre → 5a · §3.3 copia → 4 ·
4.3 cadena → 6 · §5.1 receta obligatoria → 5b · §5.2 Libre → 10 · §5.3 convertir → 11 · 4.5 recepción → 12.
Además: regla 3 del paquete (el lavado genérico nunca precarga una receta propia) → 2; las dosis de
fabricante nunca son valor por defecto (regla 7) → 2.
