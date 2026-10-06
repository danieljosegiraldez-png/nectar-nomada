# Reconocimiento u6 — convenciones y guardias que el plan de la 2a tiene que respetar

Medido en el árbol `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a`, rama `recetas-parte-2a`,
**HEAD `d27068d5`**, el 2026-10-03, en sólo lectura. Toda línea citada es de ese commit salvo que se diga otra.
Node con `PATH=$HOME/.nvm/versions/node/v24.19.0/bin:$PATH`. No se corrió la suite ni se tocó ninguna base.

## 0. De qué árbol hablo — leer antes que nada

| dato | valor medido | cómo |
|---|---|---|
| HEAD | `d27068d5` | `git rev-parse --short HEAD` |
| base común con `origin/main` | `203d9236` | `git merge-base HEAD origin/main` |
| `origin/main` hoy | **`1d24c431`, 18 commits por delante** de esa base | `git log 203d9236..origin/main` |
| cabeza del PR #626 (Parte 1) | **`2bddf32c`, NO es ancestro de HEAD** (`merge-base --is-ancestor` → 1) | `gh pr view 626 … headRefOid` |
| qué tiene #626 que aquí falta | sólo la fusión de `origin/main` `1d24c431` (territorio: rejilla, forma del lote, densidad) | `git log HEAD..2bddf32c` |
| checks de #626 en `2bddf32c` | 6 de 6, incluida «Compuerta · pruebas que necesitan base de datos: SUCCESS» | `gh pr view 626 --json statusCheckRollup` |

**Consecuencia para el plan:** el código de la Parte 1 aquí es el de #626, pero las cifras del inventario, la lista de
pruebas por compuerta, `messages/*.json`, `schema.prisma` y las migraciones **difieren de `main` y de #626**
(`git diff --stat 203d9236 origin/main` toca `acceso-a-datos.allowlist.json`, `inventario-de-acceso.md`,
`messages/{es,en}.json`, `schema.prisma`, `scripts/pruebas-por-compuerta.txt` y dos migraciones
`20261002200000_planton_en_la_rejilla`, `20261002210000_forma_del_lote`). El inventario mide **615 ops / 167 archivos**
aquí y **616 / 167** en `2bddf32c` (allí «depende del llamador» = 94, aquí 93). Todo número de este informe hay que
re-medirlo sobre el árbol donde se escriba el plan.

---

## 1. Mapa: qué guardia dispara cada cosa nueva de la 2a

| la 2a añade… | guardias que se disparan (archivo) | qué hay que tocar para cumplir |
|---|---|---|
| **tabla / columna / índice** (`ProcessRecipeStep`, filas de adición y de fin, columnas en las 4 tablas de registro, `recipeStepId` en `ProcessTarget`) | `tests/derivaDeMigraciones.test.ts` (grupo base-sembrada); `tests/arquitectura/booleanos-de-tres-estados.test.ts`; `tests/arquitectura/vocabulario-de-audit.test.ts` si se lee un `entityType` nuevo | migración SQL a mano + `schema.prisma` que diga lo mismo (§4); `onDelete` explícito en cada relación; booleanos **no** anulables si se preguntan con casilla |
| **servicio nuevo / operación nueva en `lib/`** | `acceso-a-datos.test.ts` (+ `docs/arquitectura/acceso-a-datos.allowlist.json`), `cifras-del-inventario.test.ts` (+ `docs/arquitectura/inventario-de-acceso.md`), `audit-atomico.test.ts`, `proceso-por-el-resolvedor.test.ts`, `quien-lo-hizo-con-su-guardia.test.ts`, `ritmo-con-quien-lo-lea.test.ts` (patrón) | §2.1–§2.6 |
| **acción nueva en `app/actions/`** | `use-server-solo-async.test.ts`, `acciones-traducen-sus-errores.test.ts`, `procedencia-declarada.test.ts`, `confirmacion-que-se-lee.test.ts`, `campos-con-dos-puertas.test.ts` (si toca objetivos o fases) | §2.5, §2.7, §2.11 |
| **pantalla / componente** | `claves-de-traduccion-existen.test.ts`, `accion-que-no-puedes-no-se-ofrece.test.ts`, `envio-sin-doble-toque.test.ts`, `numeros-sin-rueda.test.ts`, `booleanos-de-tres-estados.test.ts`, `cliente-sin-prisma.test.ts`, `confirmacion-que-se-lee.test.ts`, y **`npm run check:rutas`** (`scripts/rutas-declaradas.mjs`) dentro de `npm run verify` | §2.4, §2.8, §2.11 |
| **código de error con texto** | `tests/traceability/mensajesDeProceso.test.ts`, `acciones-traducen-sus-errores.test.ts` | §3 |
| **valor o catálogo nuevo** | `tests/traceability/catalogos-de-intervencion-existen.test.ts`; para rótulos por plantilla, un guardia como `motivos-de-devolucion-traducidos.test.ts` | §2.9, §2.11 |
| **prueba nueva con base** | `scripts/ci.sh` la corre SIN base si no se apunta; `tests/ci-cobertura.test.ts` | §5 |

---

## 2. Las guardias, una por una

### 2.1 `acceso-a-datos.test.ts` + allowlist + inventario + `cifras-del-inventario.test.ts`

**Archivos.** `tests/arquitectura/acceso-a-datos.test.ts` (303 líneas), `docs/arquitectura/acceso-a-datos.allowlist.json`
(1485), `scripts/inventario-de-acceso.mjs` (347), `docs/arquitectura/inventario-de-acceso.md` (1215),
`tests/arquitectura/cifras-del-inventario.test.ts` (86).

**Qué vigila `acceso-a-datos`** (nombres de `it` exactos):
- `:98` «los clientes de base de datos son exactamente los inventariados» (`new PrismaClient`).
- `:108` «nadie importa el cliente total sin estar inventariado» — todo archivo de `app/`/`lib/` que importe `lib/db` tiene
  que estar en `importan_cliente_total` con `razon`. `:119` «el inventario no nombra archivos que ya no existen».
- `:135` «nadie recibe un cliente de transacción sin estar inventariado» — **todo archivo cuyo texto contenga
  `Prisma.TransactionClient` o `TransactionClient`** va en `reciben_transaccion` con razón (`:92-93`).
- `:150` «app/** no crece: hoy son cinco y están justificados» — **está en el tope**: las cinco son `app/actions/auth.ts`,
  `bookings.ts`, `checkout.ts`, `locale.ts` y `app/my-nectar/page.tsx`. Ninguna acción ni página nueva de la 2a puede
  importar `lib/db`.
- `:179` «las que ningún patrón explica están inventariadas» — toda operación de clase «recibe principal, sin guardia
  visible» va en `operaciones_sin_patron` (`archivo` + `operacion` + `razon`; las de la Parte 1 llevan `verificado`).
- `:235` «ninguna operación nueva entra sin que alguien mire a su llamador» y `:251` «cada una dice por qué su llamador
  basta, y desde cuándo» — toda operación «depende del llamador» va en `dependen_del_llamador` con `razon` y
  `verificado: "YYYY-MM-DD"` (regex `^\d{4}-\d{2}-\d{2}$`).
- `:193`/`:243` exigen también lo contrario: borrar la entrada si la operación ya no está en esa clase.

**Cómo clasifica el script** (`scripts/inventario-de-acceso.mjs:241-262`), y es lo que decide en qué lista cae cada
función nueva:

```js
if (guardias.length) clase = "guardia directo";
else if (transitivo.length) clase = "guardia transitivo";
else if (acotado || resolutor) clase = "acotado por construcción";
else if (publica) clase = "público por diseño";
else if (preSesion) clase = "previo a la sesión";
else if (firma) clase = "firma";
else if (principal) clase = "recibe principal, sin guardia visible";
else if (dependeDelLlamador) clase = "depende del llamador (verificar a mano)";
else clase = "SIN CLASIFICAR";
```

- **Guardia** = el cuerpo llama a `require[A-Z]\w*(Access|Admin|Override)(`, `can(`, `resolvedPermissionKeys(`,
  `permissionKeysAnywhere(` (`:42`), o a una función **del mismo archivo** —o importada de un archivo donde guarda— cuyo
  cuerpo llame a uno de ésos (`:183-212`). Por eso `loteGestionable` (`lib/traceability/lotProcess.ts:154-159`, local) y
  `exigeEditarBeneficioEnOrganizacion` (importada de `locations.ts:300`, llama a `can(`) cuentan como guardia.
- **`principal`** = el cuerpo contiene la palabra `userAccountId` (`:229`). Un núcleo `…EnTx(tx, userAccountId, …)` que sólo
  firma (`createdBy`, actor del audit) cae en **«recibe principal, sin guardia visible»** y exige entrada en
  `operaciones_sin_patron` — es lo que pasó con `abrirProcesoEnTx` y `dividirProcesoEnTx`.
- Sin la palabra `userAccountId` y sin guardia → «depende del llamador» → entrada en `dependen_del_llamador`.
- Las funciones privadas se absorben en la exportada que las llama (`:119-142`); `$queryRaw`/`$executeRaw` cuentan como
  modelo `SQL-crudo` (`:63`, `:220`).

**Formato de las entradas** (copiado de la allowlist, entradas reales de la Parte 1):

```json
{ "archivo": "lib/traceability/procesoDelLinaje.ts",
  "razon": "Parte 1 (2026-09-30), R1: el resolvedor … Nada de aquí autoriza; todos sus llamadores ya hicieron requireLotAccess sobre el lote." }
```
(en `reciben_transaccion`)

```json
{ "archivo": "lib/traceability/procesoDelLinaje.ts", "operacion": "abrirProcesoEnTx",
  "razon": "Núcleo con `tx` que abre un proceso y escribe su auditoría en la misma transacción (R2): … Recibe el principal sólo para firmar `createdBy` y el evento, no para decidir nada: no autoriza. Lo llaman `abrirProceso`, después de `loteGestionable` …",
  "verificado": "2026-10-01" }
```
(en `operaciones_sin_patron`)

**Lo que hoy hay en los archivos que la 2a toca** (`node scripts/inventario-de-acceso.mjs --json`, filtrado):

| operación | clase hoy |
|---|---|
| `lotProcess.ts`: `abrirProceso`, `registrarIntervencion`, `cerrarProceso`, `devolverASecado`, `opcionesParaProceso`, `coberturaDelLote`, `puedeAbrirProceso`, `puedeGestionarProceso`, `puedeEmpezarCorrida`, `puedeDevolverASecado`, `listarProcesosDeLote`, `cambiarIntencion`, `cambiarObjetivoDeHumedad` | guardia directo |
| `lotProcess.ts`: `exigeSecadoTerminado` | depende del llamador |
| `processTargets.ts`: `compareRunToTargets`, `listRecipeVersionsForLot`, `createRecipeWithVersion`, `listRecipes`, `listRecipeOrganizations`, `getRecipeForEditor`, `updateRecipeMetadata`, `createRecipeVersion` | guardia directo |
| `fermentation.ts`: `startFermentationRun`, `recordFermentationIntervention`, `endFermentationRun` · `drying.ts`: `startDryingRun`, `recordDryingTurnEvent`, `registrarTandaDeVolteo`, `endDryingRun` | guardia directo |
| `drying.ts`: `cerrarCorridaEnTransaccion` | recibe principal, sin guardia visible |
| `procesoDelLinaje.ts`: `procesoQueCubre`, `idsDeAscendencia`, `idsDeDescendencia`, `bloquearLinajes`, `loteDividido`, `procesosParaEntrada`, `exigeSinOtroProcesoAbierto`, `procesoParaUnaCorrida`, `exigeSinCorridasAbiertas` | depende del llamador |
| `procesoDelLinaje.ts`: `abrirProcesoEnTx`, `dividirProcesoEnTx` | recibe principal, sin guardia visible |
| `colaDeSecado.ts`: `colaDeSecado` · `datosDelTablero.ts`: `datosDelTablero` | guardia directo (`resolveLotVisibility`) |

**`cifras-del-inventario.test.ts`** (`:51` «el total y el número de archivos», `:60` «cada fila de la tabla de patrones»,
`:81` «no hay clases medidas que el documento no nombre») exige que `docs/arquitectura/inventario-de-acceso.md` diga
exactamente lo que mide el script. Las líneas que lee (hoy, `:16` y `:28-33`):

```
**615 operaciones** que tocan la base, en **167 archivos** — medido el 2026-10-03 con …
| **465** | guardia directo | …
| **20** | acotado por construcción | …
| **93** | depende del llamador | …
| **10** | público por diseño | …
| **4** | previo a la sesión | …
| **23** | recibía principal sin guardia visible | Las dieciocho … 23 en total: `cerrarCorridaEnTransaccion` y … `abrirProcesoEnTx` y `dividirProcesoEnTx` …
```

**Convención de la casa al cambiar cifras:** se reescribe la línea en negrita y se añade, encima de las anteriores, una nota
`> **<qué cambió> (fecha): N→M, A→B archivos y «<clase>» X→Y.**` que nombra cada operación nueva y su clase (ver las
cinco notas de la Parte 1, `inventario-de-acceso.md:35-70`). La fila «recibía principal…» además **enumera en prosa** las
operaciones de esa clase: si la 2a añade un núcleo `…EnTx`, hay que nombrarlo ahí aunque el test sólo mire el número.

**Control que leí antes del resultado:** el script dice hoy 615/167 y el documento dice 615/167 (coinciden).

### 2.2 `proceso-por-el-resolvedor.test.ts` — nadie lee el proceso de un lote fuera del resolvedor

`tests/arquitectura/proceso-por-el-resolvedor.test.ts` (280 líneas). Dueño exento: `lib/traceability/procesoDelLinaje.ts`
(`:47`). Excepciones con número EXACTO de lecturas (`:56-85`): `lotProcess.ts` n=1 (`listarProcesosDeLote`),
`datosDelTablero.ts` n=1, `reporteDeProceso.ts` n=1.

**Formas que marca** (`:134-145`), en cualquier archivo de `lib/` o `app/`:
- `lotProcess.find…|count|aggregate|groupBy(` cuyo `where` mencione `lotId` o `lot:`, o `groupBy` con `by: ["lotId"]`;
- `lotProcesses:` (include/select/where desde el lote);
- **`lotProcess: true` o `lotProcess: { …` que no sea `connect|create|connectOrCreate`** — o sea, `include: { lotProcess: true }`
  desde una corrida **se marca**;
- **`where: { …, id: x.lotProcessId`** (dos pasos) salvo `input.` — o sea, leer el proceso de una corrida por su
  `lotProcessId` **se marca**.

**Lo que NO marca y la 2a puede usar** (`FORMAS_QUE_NO_MARCA`, `:197-204`): `lotProcess.findMany({ where: { id: { in: ids } } })`
(«lectura por una lista de ids»), `findUniqueOrThrow({ where: { id: cobertura.vigente.id } })`, escrituras con
`lotProcess: { connect: … }`, y lecturas por lote de OTROS modelos (`measurement.findMany({ where: { lotId } })`).

**Implicación directa para 4.2 y 4.3 del diseño:**
- 4.2 («el paso es de la versión del proceso vigente») tiene precedente exacto en `lib/traceability/fermentation.ts:79-82`:
  ```ts
  const proceso = await procesoAbiertoParaCorrida(tx, input.lotId);
  // R4: la receta es la del proceso. Una distinta pedida a mano es una contradicción, no una opción.
  if (input.processRecipeVersionId && input.processRecipeVersionId !== proceso.processRecipeVersionId) {
    throw new LotProcessError("receta_distinta_del_proceso");
  ```
  `procesoAbiertoParaCorrida(tx, lotId): Promise<{ id: string; processRecipeVersionId: string | null }>`
  (`procesoDelLinaje.ts:487-494`) bloquea el linaje y devuelve la versión: ahí se compara `recipeStepId`. **No** leer
  `run.lotProcess` ni `where: { id: run.lotProcessId }`.
- 4.3 («lo ejecutado sobre la cadena»): `procesoQueCubre(tx, lotId): Promise<Cobertura>` (`:232`) devuelve
  `cadena: readonly ProcesoEnCadena[]`, y **`ProcesoEnCadena` (`:34-44`) NO trae `processRecipeVersionId`** (sólo `id`,
  `lotId`, `profundidad`, `sequenceOrder`, `endedAt`, `closureKind`, `derivedFromLotProcessId`, `origen`). Para filtrar por
  versión hay que ampliar `SELECCION` (`:58-66`, en el archivo dueño) o leer `lotProcess.findMany({ where: { id: { in: ids } } })`.
- Una pantalla o servicio nuevo que llame a `listarProcesosDeLote` cae en `:271` («la excepción exime al archivo que la
  define, no a quien la llama»).

### 2.3 `campos-con-dos-puertas.test.ts` — la 2a lo rompe si cambia la creación de versiones

`tests/arquitectura/campos-con-dos-puertas.test.ts` (184 líneas). Lee `lib/traceability/processTargets.ts`,
`app/actions/traceability.ts`, `app/components/traceability/RecipeForm.tsx` y `RecipeVersionForm.tsx`.

- `camposDeObjetivo()` (`:49-56`) parsea el bloque `targets: ReadonlyArray<{` de `export interface CreateRecipeInput`
  (`processTargets.ts:228-261`) con `^\s{4}(\w+)\??:` — **sangría de 4 espacios**. Hoy saca `variable, moment, phase, unit,
  targetValue, minValue, maxValue, note, everyHours`.
- `:127` «la acción parsea todos los campos del formulario»: cada campo tiene que aparecer como
  `` targets[${i}][<campo>] `` dentro de `function parseTargetRows` (`traceability.ts:1267-1301`).
- `:136` «LOS DOS servicios que escriben objetivos persisten todos los campos»: dentro de `createRecipeWithVersion` y
  `createRecipeVersion`, desde `targets: {` hasta `displayOrder`+40, cada campo como `<campo>:`.
- `:146` «LOS DOS formularios que crean objetivos mandan todos los campos»: `[<campo>]` en los dos `.tsx`.
- `:159` `expectedHours` en los cuatro archivos.
- **R8** `:172` exige que `fases?: ReadonlyArray<{` dé exactamente
  `["phase","expectedHours","turnEveryHours","targetMoistureMinPct","targetMoistureMaxPct"]`, y `:176` «LOS DOS servicios
  escriben todas las columnas de fase» busca un bloque `fases:` **entre `targets: {` y el primer `include:`** de cada una de
  las dos funciones (`bloqueDeFases`, `:99-112`).

**Lo que la 2a cambia y este guardia no tolera sin tocarlo:**
1. Si `recipeStepId` entra en el tipo `targets` de `CreateRecipeInput`, el guardia exige `targets[${i}][recipeStepId]` en
   `parseTargetRows`, `recipeStepId:` en los dos `create` y `[recipeStepId]` en **los dos formularios**. O se pone en un tipo
   aparte, o se cablea por las cinco puertas.
2. §3.1 del diseño («la copia de R8 deja de copiar fases cuando la versión tiene pasos»; «las fases se derivan al
   publicar»): si el bloque `fases:` sale del `create` de `createRecipeWithVersion`/`createRecipeVersion` hacia una función
   `publicar…`, `:176` cae con «no tiene bloque fases:». La lista `["createRecipeWithVersion", "createRecipeVersion"]`
   (`:139`, `:177`) hay que cambiarla **en la misma tarea**, a sabiendas.
3. `phase` hoy es obligatorio en el tipo (`phase: ProcessPhase;`, `:240` de `processTargets.ts`) y `validateTargets` lanza
   `phase_required` (`:355`). §3.2 lo hace nulo con paso; el parseo del guardia sigue funcionando con `phase?:`.

### 2.4 `claves-de-traduccion-existen.test.ts`

`tests/arquitectura/claves-de-traduccion-existen.test.ts` (90). Sólo mira archivos de `app/` con **exactamente una**
llamada `useTranslations("…")`/`getTranslations("…")` (`:54-55`) y sólo claves **literales** `t("…")` (`:58`). Umbral de
control: >1500 claves miradas (`:74-75`). `DEUDA_CONOCIDA` debe seguir vacía (`:80` «no hay ninguna excepción pendiente»).

**Agujeros que la 2a debe tapar por su cuenta:** `app/components/traceability/ProcesoDelLote.tsx` llama seis veces a
`useTranslations` (`:43,140,194,230,275,309`) y **queda fuera entero**; y toda clave de plantilla
(`` t(`tipoPaso_${x}`) ``) queda fuera por construcción. Para rótulos por plantilla la casa escribe un guardia propio
(§2.9).

### 2.5 `acciones-traducen-sus-errores.test.ts`

`tests/arquitectura/acciones-traducen-sus-errores.test.ts` (320). Toma los archivos de `app/actions/` que definen
`function friendlyError` (hoy `manejo.ts`, `research.ts`, `traceability.ts`), sigue cada función importada de `lib/` dos
saltos, junta las clases `extends Error` que lanzan (`throw new X(`) y exige un `instanceof X` en el archivo de la acción
(`:310` «%s traduce todas las clases que le pueden llegar»). Control: `:292` exige ver `ProcessTargetError`,
`TraceabilityAccessError`, `MassBalanceError`…

Para la 2a: una **clase nueva** de error lanzada desde un servicio que importe `traceability.ts` necesita su rama en
`friendlyError` en el mismo cambio. Lanzar con las clases existentes (`LotProcessError`, `ProcessTargetError`) no dispara
nada nuevo. **Un archivo de acciones nuevo sin `friendlyError` queda fuera del guardia** (no hay quien lo vigile).

### 2.6 `audit-atomico.test.ts` y `vocabulario-de-audit.test.ts`

`tests/arquitectura/audit-atomico.test.ts` (705), sobre `lib/`, `app/`, `scripts/`:
- `:645` «cada recordAuditEvent en transacción recibe su cliente»: la llamada dentro de un cierre con parámetro `tx` tiene
  que terminar en `, tx)` o `, tx,)` — regex `/,\s*tx\s*,?\s*\)$/`.
- `:685` «todo recordAuditEvent va en una transacción, o dice por qué no»: fuera de transacción exige, en las 8 líneas de
  encima, `// audit-sin-escritura: <razón de ≥20 caracteres>` (`MARCA_SIN_ESCRITURA`, `:351`).
- `:696` ninguno a ≤4 líneas tras el `});` de una transacción.
- `:601` «quien llama a una función nombrada que audita en transacción le pasa `tx`»: una `function f(tx: X, …)` que
  audita tiene que recibir `tx` como **primer** argumento en todos sus llamadores.
- Puntos ciegos declarados (`:395-415`): la firma `function f(tx…)` sólo se reconoce **en una línea y sin tipo de
  retorno**; `function f(tx: X): Promise<Y> {` desajusta el rastreador de rangos.

Forma de una llamada correcta (`processTargets.ts:719-731`):

```ts
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_version.create",
        entityType: "process_recipe_version",
        entityId: version.id,
        after: version,
        reason: `supersedes_version_${recipe.versions[0]?.version ?? "none"}`,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );
```

Vocabulario existente (snake_case, `entidad.verbo`): `process_recipe.create|update`, `process_recipe_version.create`,
`lot_process.open|close|change_moisture_target|change_intent|record_intervention|return_to_drying`, entidades
`process_recipe`, `process_recipe_version`, `lot_process`, `lot_process_intervention`, `lot_process_return`.
`vocabulario-de-audit.test.ts` sólo exige que todo `entityType` que se LEE (`auditEvent.find…`/`leerEnmiendas`) lo escriba
alguien.

### 2.7 `use-server-solo-async.test.ts`

`tests/arquitectura/use-server-solo-async.test.ts` (94). Todo archivo `"use server"` sólo exporta `export async function`,
`export type`, `export interface` o `export { type … }` (`:47-55`). Y **todos los `"use server"` tienen que vivir en
`app/actions/`** (`:71-73`: `useServer.every(([ruta]) => ruta.startsWith("app/actions/"))`). Por eso `friendlyError` no se
exporta y la lógica testeable (como `claveDeErrorDeProceso`) vive en `lib/`.

### 2.8 `accion-que-no-puedes-no-se-ofrece.test.ts`

`tests/arquitectura/accion-que-no-puedes-no-se-ofrece.test.ts` (115). Regla de Daniel del 2026-09-27: lo que no puedes no
se muestra, ni se explica.
- Todo `href="/…/(nuev[ao]|crear|new)"` en un `page.tsx` tiene que tener en sus 4 líneas anteriores una condición JSX
  `{…(puede|granted|permite|can)…(?|&&)` (`:58-71`). Precedente: `app/recipes/page.tsx:40-47`
  (`{puedeCrearReceta ? (<Link href="/recipes/new" …`).
- Ninguna página `…/(nuev[ao]|new|crear)/page.tsx` pinta una clave `*SinPermiso*|sin_acceso|sinAcceso` que no empiece por
  `error` (`:87-114`); la ruta responde `notFound()` (precedente `app/recipes/new/page.tsx:36`).
- **Trampa medida:** deriva su lista con `git grep -l` y `git ls-files` (`:34-41`, `:89-93`): **una página nueva sin
  `git add` es invisible** para el guardia. Lo mismo `ritmo-con-quien-lo-lea.test.ts` (usa `git grep`).
- La 2a ofrece cosas que dependen de permiso (convertir Libre en receta §5.3, editar borrador, publicar): cada oferta se
  pregunta con el mismo predicado que el servicio (`puedeEditarBeneficioEnOrganizacion`, `locations.ts:339`).

### 2.9 `motivos-de-devolucion-traducidos.test.ts` — el patrón para rótulos por plantilla

`tests/arquitectura/motivos-de-devolucion-traducidos.test.ts` (65), hermético. Lee el catálogo de `VARIABLE_CATALOGS`
(`lib/research/catalogs.ts`), el cuerpo de `DevolverASecadoForm` en `ProcesoDelLote.tsx`, la constante
`CATALOGO_MOTIVO_DEVOLUCION` de `lotProcess.ts:68`, y exige que **cada valor** tenga `Traceability.motivoDevolucion_<valor>`
en es y en (`:60-66`), con control (`:46-57`) de que encontró catálogo, prefijo (una sola plantilla) y espacio (uno solo).
**Si la 2a rotula `tipo_paso`, `fisico`, `modo_secado` o `capacidad` con una clave de plantilla, necesita un hermano de
éste;** `claves-de-traduccion-existen` no lo ve. (Hoy el resto de catálogos se rotulan con `{o.label}`, el valor crudo:
`ProcesoDelLote.tsx:81,93,105,156,210`.)

### 2.10 `booleanos-de-tres-estados.test.ts`

`tests/arquitectura/booleanos-de-tres-estados.test.ts` (141). Lee **todo** `^\s+(\w+)\s+Boolean\?` de `schema.prisma` (hoy
21 campos) y prohíbe, en `app/components/**/*.tsx`, una casilla `type="checkbox"` con `name="<campo>"` o
`checked={<campo>…}`, y los ocultos `name="…Present"`. **El nombre basta para chocar, sea del modelo que sea.**
Consecuencia: `opcional`, `finPorTiempo`, `esLibre` (§3, §5.2) van como `Boolean @default(false)` (no anulables) si se
preguntan con casilla; si se declaran `Boolean?`, el formulario necesita el componente de tres estados
(`TriStateField.tsx`). Ninguno de los tres nombres existe hoy en el esquema (grep con control: `Boolean?` da 21).

### 2.11 Las demás que una pieza de la 2a toca

| guardia | qué exige | dónde importa en la 2a |
|---|---|---|
| `envio-sin-doble-toque.test.ts` | todo `<button type="submit">` en `app/**/*.tsx` con `disabled={…pending…}` o `<BotonDeEnvio>` | editor de pasos, publicar, abrir con Libre, marcar lecturas de cierre |
| `numeros-sin-rueda.test.ts` | todo `<input type="number">` es `<CampoNumerico>` o lleva `onWheel` que suelta el foco | horas, temperaturas, % de mucílago, cantidades de adición, valores de fin |
| `confirmacion-que-se-lee.test.ts` | toda `redirect("…?ok=<código>")` aterriza en un `page.tsx` que tenga `ok ===` y `searchParams` | el extractor sólo casa códigos `[a-z_-]+` o `${…}` (`:52-60`): **`?ok=1` es invisible** (lo usa hoy `createRecipeAction`, `traceability.ts:1263`, y `app/recipes/page.tsx:37` lee `params.ok ?`, sin `===`) |
| `cliente-sin-prisma.test.ts` | un componente cliente no importa valores de un módulo de `lib/` que llegue a `prisma` por cierre transitivo | `EJES_POR_TIPO_DE_PASO` puede vivir en `lib/research/catalogs.ts` (**0 imports**, medido con control: el mismo `grep` da 8 en `lotProcess.ts`); **no** en `lotProcess.ts` ni `processTargets.ts` |
| `quien-lo-hizo-con-su-guardia.test.ts` | toda `<x>PersonId: input.<y>` en `lib/` exige `exigirPersonaPermitida` en esa función | si una intervención o corrida nueva guarda operario (precedente `fermentation.ts:73`) |
| `procedencia-declarada.test.ts` | ninguna acción mete `provenanceClass` del formulario con `as never` | si una acción nueva lee procedencia |
| `ritmo-con-quien-lo-lea.test.ts` | ciertos símbolos de servicio tienen que importarse fuera de `tests/` | patrón para «servicio sin pantalla»: añadir ahí los puntos de entrada nuevos (publicar, abrir con Libre, convertir) si se quiere el guardia |
| `npm run check:rutas` (`scripts/inventario-de-rutas.mjs`, en `npm run verify`) | toda ruta del router declarada en `scripts/rutas-declaradas.mjs`; `requiere-sesion` exige `getCurrentUser` y `redirect("/login")` en el archivo (`:165-174`) | cada `page.tsx` nuevo; formato: `"/recipes/[id]": { clase: "requiere-sesion", razon: "Recetas y formulación." },` (`:157`) |
| `catalogos-de-intervencion-existen.test.ts` (hermético) | cada clave de `CATALOGOS_DE_INTERVENCION` (`lotProcess.ts:70-94`, hoy 9) existe en `VARIABLE_CATALOGS` y tiene valores | si la 2a añade catálogos a esa lista (§7: despulpado, desmucilaginado, lavado) |
| `tests/rbac/permissionCoverage.test.ts` (hermético) | todo permiso del catálogo se aplica en algún sitio | sólo si la 2a crea un permiso nuevo |
| `material-de-dominio-declarado.test.ts` / `fuentes-verbatim.test.ts` | todo `docs/dominio/*` declara su estado; toda copia en `docs/architecture/fuentes/` hashea a su manifiesto o cabecera | el «archivo de datos con las referencias del paquete» de §3.5, según dónde se ponga |
| `numeros-de-adr-unicos.test.ts` | ADR sin número repetido | el máximo es **195** aquí y en `origin/main` (ordenado con `sort -n`, no con `tail`: el archivo no está en orden) |
| `etiquetas-de-transformacion.test.ts` | patrón: cada valor de un enum rotulado por plantilla tiene etiqueta en es/en, leyendo el enum del esquema | si la 2a crea enums (`reglaDeFin`, `momento pre_verde|post_verde`) y los rotula por plantilla |

---

## 3. Cómo se añade un código de error de proceso con texto

Cuatro sitios, en el mismo cambio (precedente: la tarea 12 de la Parte 1).

1. **`lib/traceability/errorDeProceso.ts:17-45`** — añadir el código a la lista:
   ```ts
   export const CODIGOS_DE_PROCESO_TRADUCIDOS = [
     "sin_proceso_abierto",
     …
     "process_already_closed",
   ] as const;
   ```
   `claveDeErrorDeProceso` (`:56-61`) devuelve `error_proceso_<código>` sólo si es `LotProcessError` **y** el código está
   en la lista. Vive en `lib/` para poder probarla (la acción es `"use server"`).
2. **`messages/es.json` y `messages/en.json`**, espacio `Traceability`, clave `error_proceso_<código>`. Hoy hay 22 claves
   `error_proceso_*` en cada idioma. El texto **dice qué hacer** y no manda a una pantalla que no exista.
3. **`tests/traceability/mensajesDeProceso.test.ts`** (299, hermético, fuera de `pruebas-por-compuerta.txt`): añadir el
   código a `CODIGOS_QUE_EL_DISENO_NOMBRA` (`:43-68`; la prueba usa `arrayContaining`, así que sin esto añadir sólo a la
   fuente pasa igual — la lista manual es la que caza que alguien la encoja). Pruebas que lo recorren solas: `:105` «cada
   código tiene `Traceability.error_proceso_<código>` en los dos idiomas» y `:114` «cada código da su clave; otro código u
   otra clase, ninguna». Si el texto se corrigió por falsedad, fila en `LO_QUE_EL_TEXTO_TIENE_QUE_DECIR` (`:172-265`).
4. **`friendlyError`** (`app/actions/traceability.ts:174`) ya lo cubre sin tocarla, porque la rama es genérica
   (`:195-201`):
   ```ts
   const claveDeProceso = claveDeErrorDeProceso(error);
   if (claveDeProceso) return t(claveDeProceso as "error_proceso_sin_proceso_abierto");
   …
   if (error instanceof LotProcessError) return t("error_lot_process", { detail: error.message });
   ```
   `mensajesDeProceso.test.ts:129` vigila que esas tres anclas existan **una vez** y en ese orden en el código sin
   comentarios.

**Lo que no está cubierto:** los códigos de `ProcessTargetError` (la receta) salen todos por
`t("error_process_target", { detail: error.message })` (`traceability.ts:307`), o sea «No se pudo guardar la receta:
paso_de_otra_version» con el código crudo. No hay `claveDeErrorDeProcessTarget`; si la 2a quiere texto para
`paso_de_otra_version`, borrador/publicación, etc., tiene que crear el mecanismo hermano o lanzar con `LotProcessError`.
Los códigos que nombra el diseño (`paso_de_otra_version`, `paso_de_otra_receta`, `paso_no_corresponde`,
`desviacion_sin_motivo`, `sin_receta`) **no existen hoy** en `lib/`, `app/` ni `messages` (control:
`receta_distinta_del_proceso` sí aparece, 2 en código y 1 en `es.json`).

---

## 4. Convenciones de migración

**Nombre de carpeta.** `prisma/migrations/<YYYYMMDDHHMMSS>_<snake_case_en_español>/migration.sql`. Todas casan
`^[0-9]{14}_[a-z0-9_]+$` (único no-casante: `migration_lock.toml`, que es el control). La última aquí es
`20261003100000_proceso_cubre_al_lote`; en `origin/main`, `20261002210000_forma_del_lote`. La de la 2a tiene que ser
posterior a la última de `main` en el momento de fusionar.

**El ejemplo, `20261003100000_proceso_cubre_al_lote/migration.sql`** (93 líneas):
1. **Contar primero y abortar** si los datos no permiten la restricción (decisión humana, no de la migración):
   ```sql
   DO $$
   DECLARE dobles INTEGER; …
   BEGIN
     SELECT count(*) INTO dobles FROM ( … ) d;
     IF dobles > 0 THEN
       RAISE EXCEPTION 'lot_process: % lote(s) con más de un proceso abierto. Elegir cuál sigue abierto es una decisión humana.', dobles;
     END IF;
   …
   END $$;
   ```
   Cuidado de la casa: editar SQL con `$$` mediante `node -e '…replace(…)'` corrompe `$$` en `$` (CLAUDE.md global,
   2026-10-01). Usar la herramienta de edición.
2. **Enum** en su esquema: `CREATE TYPE "traceability"."LotProcessClosure" AS ENUM ('moisture', 'divided');` y en
   `schema.prisma` el `enum` con `@@schema("traceability")`.
3. **CHECK con nombre**, y **`IS NOT DISTINCT FROM` en vez de `=`** cuando la columna comparada puede ser nula (un CHECK que
   da NULL pasa):
   ```sql
   ALTER TABLE "traceability"."lot_process"
     ADD CONSTRAINT "lot_process_medicion_solo_si_por_humedad"
     CHECK ("closing_moisture_measurement_id" IS NULL OR "closure_kind" IS NOT DISTINCT FROM 'moisture');
   ```
4. **Índice único parcial en SQL, no en el esquema:**
   `CREATE UNIQUE INDEX "lot_process_un_abierto_por_lote" ON "traceability"."lot_process"("lot_id") WHERE "ended_at" IS NULL;`
5. **FK con su acción de borrado explícita** y su índice:
   `… FOREIGN KEY ("divided_by_transformation_id") REFERENCES "traceability"."lot_transformation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`
   + `CREATE INDEX "lot_process_divided_by_transformation_id_idx" …`. Autorreferencia con `ON DELETE NO ACTION` (para que
   un `deleteMany` de padre e hijo no choque consigo mismo, `schema.prisma:4224-4228`). `created_by` → `core.user_account`
   con `ON DELETE SET NULL`.
6. Tabla nueva: `"id" UUID NOT NULL DEFAULT gen_random_uuid()`, `"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
   `"created_by" UUID`, `CONSTRAINT "<tabla>_pkey" PRIMARY KEY ("id")`.

**Cómo se declara en `schema.prisma` lo que Prisma no expresa.**
- CHECK: sólo un comentario `///` en el campo — `/// Parte 1, R5/R6. Nulo mientras está abierto (lo exige un CHECK de la migración).`
  (`schema.prisma:4217`).
- Índice único parcial: **no se declara** `@@unique` (pediría un índice que la migración no crea y `derivaDeMigraciones` lo
  cazaría); se explica con `///` en el campo. Precedente literal, `schema.prisma:4964-4973` (`PlotIntervention.correctsId`):
  «**Como mucho UNA corrección vigente por fila, y NO se declara aquí.** El índice real es único PARCIAL … Prisma no sabe
  expresar índices parciales … La restricción vive en la base; el servicio … traduce su violación (P2002) a un error que se
  entiende.»
- Toda relación con `onDelete:` explícito que diga lo mismo que el SQL (ADR-120): una relación opcional sin `onDelete`
  emite `SET NULL`.
- **Clave ajena compuesta** (para que la base, y no sólo el servicio, exija «el paso es de esta versión»): precedente
  `Equipment.model` → `EquipmentModel`, `schema.prisma:5991`
  `model EquipmentModel? @relation("EquipmentOfModel", fields: [modelId, kind], references: [id, kind], onDelete: Restrict)`
  con `@@unique([id, kind])` en el referido (`:5707`) y en SQL
  `FOREIGN KEY ("model_id", "kind") REFERENCES "core"."equipment_model"("id", "kind")`
  (`20260919090000_catalogos_y_rutinas/migration.sql:143`). Otro: `sensory_wheel_node` en `20260923100000_ruedas_sensoriales`.

**Guardia de deriva.** `tests/derivaDeMigraciones.test.ts` (grupo base-sembrada) corre
`prisma migrate diff --from-migrations prisma/migrations --to-schema … --exit-code` y exige 0; control con la marca
`  @@index([lotProcessId])\n`. Los CHECK y los índices parciales de la Parte 1 pasaron este guardia en CI (#626,
`2bddf32c`, compuerta con base SUCCESS): Prisma no los ve, y por eso hay que declararlos en prosa.

**Lo que la 2a va a cambiar aquí, medido:** `ProcessTarget` tiene hoy `@@unique([recipeVersionId, phase, variable, moment])`
(`schema.prisma:4494`; índice SQL `process_target_recipe_version_id_phase_variable_moment_key`,
`20260927210000_ritmo_por_fase/migration.sql:49`). Ningún código usa el selector compuesto
(`recipeVersionId_phase_variable_moment`: 0 usos en `lib/ app/ tests/ prisma/*.ts`; control: el nombre del índice sí aparece
en el SQL). Pasar a los dos índices parciales de §3.2 = quitar el `@@unique` del esquema, `DROP INDEX` del existente,
dos `CREATE UNIQUE INDEX … WHERE` y el `///` que lo explique. `ProcessRecipePhase` tiene `@@unique([recipeVersionId, phase])`
(`:4430`).

**Cómo se prueba un CHECK o un índice** (patrón de `tests/traceability/lotProcess.test.ts:707-865`, `describe("los CHECK de
\`lot_process\`")`): un `crudo(extra)` con `prisma.<modelo>.create` directo, `rejects.toThrow(/<nombre_del_check>/)`, y
**control positivo** («y acepta un proceso bien formado», `:812`), con `afterEach` que borra las filas del `it` (`:734-736`).
Para un índice único Prisma **no da el nombre del índice sino los campos**: `/Unique constraint failed on the fields: \(\`lot_id\`\)/`
(`:854`) — con los dos índices parciales de §3.2 los campos difieren (`recipe_version_id, phase, variable, moment` frente a
`recipe_step_id, variable, moment`), así que el regex puede distinguirlos.

---

## 5. `scripts/pruebas-por-compuerta.txt` y el carril hermético

**Es una lista de EXCLUSIÓN** (247 líneas). `scripts/ci.sh:47-48`:

```bash
EXCLUIDAS="$(cd "$(dirname "$0")/.." && grep -vE '^\s*(#|$)' scripts/pruebas-por-compuerta.txt)"
A_CORRER="$(cd "$(dirname "$0")/.." && find tests -name '*.test.ts' | sort | grep -vxF "$EXCLUIDAS")"
```
y corre `A_CORRER` con `TEST_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/no-se-conecta"` (con tope de control
`-ge 30`). `scripts/ci-con-base.sh` corre **sólo** el grupo `base-sembrada` tras `migrate deploy` y
`SEED_DEMO_ADMIN=true SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true SEED_DEMO_JUDGE=true npm run db:seed`.

**Grupos** (`# @grupo:`): `base-sembrada` (`:16`), `datos-reales` (`:226`, no corre en CI), `maquina` (`:243`).
`tests/ci-cobertura.test.ts` exige que existan exactamente esos grupos, ninguna ruta muerta, ninguna repetida.

**Dónde va una prueba nueva con base de la 2a:** grupo `base-sembrada`, junto a sus hermanas de la Parte 1 que ya están ahí
(`tests/traceability/lotProcess.test.ts:177`, `procesoDelLinaje.test.ts:178`, `aperturaDeProceso`, `corridaConProceso`,
`divisionBajoProceso`, `bodegaConProceso`, `processTargets.test.ts:194`, `recipeAuthoring:196`, `recipeVersions:197`,
`colaDeSecado:220`, y `fermentation:170`, `drying:145`). Una prueba **hermética** (guardias de fuente, funciones puras como
`EJES_POR_TIPO_DE_PASO` o el comparador de parecido si se escribe puro) **no** se apunta: la corre `ci.sh`.

**Cómo comprobar el carril hermético** (CLAUDE.md del repo): `bash scripts/ci.sh` en local (necesita `npm ci` en el
worktree; corre `prisma:generate`, `npm run verify` y la suite sin base) y comprobar que la prueba nueva con base **no**
aparece en su salida. Correr la suite entera en local no lo detecta. Base desechable para el carril con base: nombre
`nectar_ci_<algo>` o `nn_flip_<algo>`, en minúsculas o entre comillas.

**Prosa vieja medida en `ci.sh`:** el comentario de `:27` dice «Sólo estos 14, POR NOMBRE»; el script corre todo lo que no
está excluido. No es una regla del plan, pero no hay que creerla.

---

## 6. Helpers de prueba y patrón de limpieza

**`tests/helpers/procesoDePrueba.ts`** (91):
```ts
export async function abrirProcesoDePrueba(
  userAccountId: string,
  lotId: string,
  extra: { startedAt?: Date; targetMoisturePct?: number; processRecipeVersionId?: string | null } = {},
) {
  return abrirProceso(userAccountId, {
    lotId,
    intent: "TEST: proceso abierto para poder empezar corridas (Parte 1, R3)",
    targetMoisturePct: extra.targetMoisturePct ?? 11.5,
    startedAt: extra.startedAt ?? new Date("2020-01-01T00:00:00Z"),
    provenanceClass: "original_record",
    processGradeValueId: await valorDeCatalogo("grado_proceso", "Washed"),
    cherryStateValueId: await valorDeCatalogo("estado_cereza", "despulpada"),
    processRecipeVersionId: extra.processRecipeVersionId ?? null,
  });
}
export async function borrarProcesosDeLotesDonde(lot: Prisma.LotWhereInput): Promise<void>
```
`borrarProcesosDeLotesDonde` (`:55-91`): rechaza con `UnsafeWhereClauseError` si `!tieneCondicion(lot)`; luego borra
**auditoría** (`entityType: "lot_process"` / `"lot_process_return"` con `entityId in` los ids de ESTA llamada),
**devoluciones** y **procesos**, en ese orden. `tests/helpers/tieneCondicion.test.ts:174-178` **cuenta en la fuente
exactamente tres `.deleteMany(`** y que la guarda va antes del primero: si la 2a amplía el helper (p. ej. para borrar las
recetas Libre que crea `abrirProceso`), esa prueba hay que cambiarla a sabiendas.

**Uso medido:** 147 llamadas a `abrirProcesoDePrueba(` en **14** archivos de prueba; en la misma línea con
`processRecipeVersionId` sólo 7. Llamadas directas a `abrirProceso(`: 17 en `lotProcess.test.ts`, 2 en
`reporteDeProceso.test.ts`, 1 en `bodegaConProceso`, 1 en `divisionBajoProceso`, **1 en `prisma/seed.ts:889`** y 1 en
`app/actions/traceability.ts:2464`. Con §5.1 (receta obligatoria) **todas las que pasan `null` caen con `sin_receta`**
(ver Sorpresas).

**`tests/helpers/assertDefinedWhere.ts:49`** `assertDefinedWhere<T>(where: T): T` — rechaza `where` vacío o con
`undefined` a cualquier profundidad (`UnsafeWhereClauseError`). Todo `deleteMany` de limpieza pasa por él.
**`tests/helpers/tieneCondicion.ts:65`** `tieneCondicion(w: unknown): boolean` — exige una restricción POSITIVA no vacía;
no cuentan `NOT`, `not`, `notIn`, `isNot`, `none`, `every`, `mode`; `OR` exige que estrechen todas sus ramas; `in: []` sí
cuenta. Es pura (sin imports en tiempo de ejecución, lo vigila `tieneCondicion.test.ts`).

**Patrón de fixture de la Parte 1** (`tests/traceability/aperturaDeProceso.test.ts:10-74`):
- `const RUN = \`apertura-${Date.now()}\``; nombres `TEST … ${RUN}`; arreglos `lotes`, `transformaciones`, `mediciones`
  donde cada ayudante empuja lo que crea.
- **Usuario con ámbito acotado, no Platform Admin**: `Farm Operator` en un `scope` de `location` sobre su `plot` (`:50-57`).
  CLAUDE.md del repo: un admin de plataforma ve la base compartida entera y los recuentos se contaminan con los procesos
  vivos de otros archivos. (Las pruebas de recetas usan Platform Admin porque `exigeEditarBeneficioEnOrganizacion` de una
  organización sin `Location` sólo pasa con alcance de plataforma — `recipeVersions.test.ts:41-47`; sirve mientras no se
  cuente nada global.)
- **`afterAll` en orden de claves ajenas** (`corridaConProceso.test.ts:168-190`):
  ```ts
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });            // procesos (y su auditoría) primero
  await prisma.measurement.deleteMany(…mediciones…);                  // tras los procesos que las referencian (RESTRICT)
  await prisma.lotTransformationInput/Output/Transformation.deleteMany(…);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ferm, ...sec] } }) });
  await prisma.fermentationRun.deleteMany(…); await prisma.dryingRun.deleteMany(…);
  await prisma.storageAssignment.deleteMany(…); await prisma.lot.deleteMany(…);
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) }); // cascada a versiones, objetivos, fases
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [gestor, intruso, soloB] } }) });
  await prisma.assignment…; await prisma.scope…; await prisma.userAccount…; await prisma.person…; await prisma.location…; await prisma.organization…;
  ```
  Las recetas de prueba se crean **en la organización propia del archivo** (`organizationId: orgId`), nunca compartidas
  (medido en los 13 archivos que crean recetas). Las recetas Libre que cree `abrirProceso` necesitan `RUN` en su nombre para
  caer en ese `deleteMany`, y `ProcessRecipeStep` hereda la cascada sólo si su FK a la versión es `ON DELETE CASCADE`
  (como `ProcessTarget` y `ProcessRecipePhase`); las columnas `recipeStepId` de los registros, si son `RESTRICT`, obligan a
  borrar corridas e intervenciones **antes** que la receta.
- **Lo que crea un `it` se borra en `afterEach`**, no al final del cuerpo (`lotProcess.test.ts:729-736`): una aserción que
  falla se salta el borrado y la prueba siguiente cae por otra cosa.

---

## 7. `docs/beneficio/03_public_api.md` — qué nombres declara

**No declara ningún nombre de receta, paso, versión, proceso ni intervención.** Medido con `grep -c` sobre el archivo, con
dos controles que sí aparecen (`DryingRunTray` 1, `DryingAmbientReading` 1):

| nombre del diseño 2a (o del modelo existente) | apariciones en `03_public_api.md` |
|---|---|
| `ProcessRecipeStep`, `ProcessRecipe`, `ProcessRecipeVersion`, `ProcessRecipePhase`, `ProcessTarget` | 0 |
| `stepType`, `recipeStepId`, `motivoDesviacion`, `esLibre`, `motivoDeLibre`, `origenDeRecetaVersionId`, `lecturasDeCierre`, `derivadaDeVersionId`, `capacidadesRequeridas`, `tipo_paso`, `prefermentacion`, `fisico`, `modo_secado`, `seq`, `intencion`, `finPorTiempo`, `reglaDeFin`, `horasSugeridas`, `EJES_POR_TIPO_DE_PASO` | 0 |
| `LotProcess`, `LotProcessIntervention`, `FermentationIntervention`, `FermentationRun`, `closureKind`, `LotProcessClosure`, `LotProcessReturn`, `draft`, `approved` | 0 |
| `DryingRun` | 1 — sólo dentro de `DryingRunTray` (`:288`) |
| `capacidad` / `opcional` / `receta` | 2 / 1 / 2 — en otras acepciones (`capacidadDeTipo`, «estante y nivel opcionales», notas de ADR-181) |

Qué cubre el contrato: estados de ciclo de vida, enums de motores (Python), modelos de lectura, firmas de motores, balance
de masas, constantes físicas, §11 secado (instalaciones, bandejas, ambiente) y §12 lugares y rutinas.

**Las reglas en conflicto, medidas:**
- `CLAUDE.md` del repo: «`03_public_api` … es el contrato autoritativo: todo enum, modelo, firma y cadena de estado sale de
  ahí. **Si hace falta un nombre que no esté declarado, se para y se pregunta**».
- `docs/beneficio/00_reglas_del_modulo.md:5` y `:77` (definición de terminado, punto 6): «Todo nombre público nuevo
  declarado en `docs/03_public_api.md` en el mismo commit» — pero el §7 se titula «Un PR que **toque un motor de dominio**»,
  y la 2a no toca motores (la 2b sí, ADR-181).
- `00_reglas_del_modulo.md:50` (§4 Idioma): «Identificadores, enums, claves de esquema, nombres de función y comentarios de
  código en **inglés**». El diseño de la 2a mezcla (`stepType`, `recipeStepId` en inglés; `motivoDesviacion`, `esLibre`,
  `intencion`, `opcional`, `estadoFruto`, `mucilagoRetenidoPct`… en español), igual que la Parte 1 (`procesoQueCubre`,
  `devolverASecado` junto a `closureKind`).
- **Precedente de la Parte 1** (`docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md:409-415`):
  «**Nombres nuevos para que Daniel los revise:** `closureKind` / `divided`, … Ninguno está en `03_public_api.md`, porque ese
  contrato no cubre los procesos de la aplicación.» La Parte 1 no tocó `03_public_api.md`, ni `DECISIONS.md`, ni
  `SESSION_STATE.md` (diff vacío desde `203d9236`; control: el mismo diff sobre `schema.prisma` da +60).
- **El diseño de la 2a no tiene esa sección de nombres para revisar.** Sus nombres están en §3, §4.1, §5 y §7, aprobados
  «sección por sección en conversación», pero ninguna lista los separa para que Daniel los vea juntos.

---

## 8. RBAC: permisos que existen para recetas y procesos

**No existe ningún recurso `recipe`, `process`, `receta` ni `proceso` en `lib/rbac/catalog.ts`** (control: `lot` aparece 5
veces). Todo pasa por dos permisos:

| permiso (clave exacta) | descripción en el catálogo | perfiles que lo tienen |
|---|---|---|
| `lot:manage` (`catalog.ts:62`) | «Create/transform lots, record measurements, fermentation/drying/storage runs.» | Platform Admin (todos), **Farm Manager**, **Farm Operator** |
| `lot:view` (`:63`) | «View lot detail, lineage, and measurements.» | Platform Admin, Farm Manager, Farm Operator, **Project Viewer** |
| `location:edit_beneficio` (`:155`) | «Editar un beneficio: su ficha, atributos y coordenadas. De serie para Farm Manager; a un Farm Operator sólo por concesión.» | Platform Admin, **Farm Manager** (Farm Operator sólo por concesión) |

(Otros de `lot`: `export`, `release`, `override_balance`.)

**Cómo autoriza cada camino hoy:**
- **Procesos** (`lotProcess.ts`): `loteGestionable(userAccountId, lotId)` → `requireLotAccess(userAccountId, "manage", [lot])`
  sobre el lote **donde vive el proceso** (`:154-159`); lectores con `requireLotAccess(view)`. Corridas: `manage` sobre el
  lote de la corrida, nunca sobre el lote del proceso (`fermentation.ts:72`). Firma de `requireLotAccess`
  (`lots.ts:84-95`): `action: "manage" | "view" | "release"`, `candidates: ReadonlyArray<{ projectId?, locationId?, classification }>`.
- **Recetas** (`processTargets.ts`): crear receta (`:379-397`), crear versión (`:640-650`) y renombrar exigen
  `requireLotAccess(manage)` sobre **un lote cualquiera de la organización** + `exigeEditarBeneficioEnOrganizacion(userAccountId, organizationId)`
  (`locations.ts:300-337`). Receta compartida (`organizationId: null`) → `edit_beneficio` con alcance de **plataforma**.
- **Listar y abrir el editor** (`listRecipes`, `:488-499`; `getRecipeForEditor`, `:534-557`): sólo `lot:manage` sobre
  `prisma.lot.findFirst({ where: {} })` o `findFirst({ where: { organizationId: recipe.organizationId ?? undefined } })` —
  **un lote arbitrario de toda la base** cuando no hay organización.
- **Selector** (`listRecipeVersionsForLot`, `:194-226`): `lot:manage` sobre el lote; ya filtra `status: "approved"` y
  `recipe: { OR: [{ organizationId: lot.organizationId }, { organizationId: null }] }`, y ofrece la versión aprobada más nueva
  de cada receta. Lo usan `app/lots/[id]/page.tsx:199`, `app/lots/[id]/process/page.tsx:109` **y**
  `app/lots/[id]/roast/new/page.tsx:42` (los perfiles de tueste también son versiones de receta).
- **Predicados de pantalla:** `puedeCrearRecetaEnAlguna` (`processTargets.ts:480-486`), `puedeEditarBeneficioEnOrganizacion`
  (`locations.ts:339`); `app/recipes/new/page.tsx:30-36` responde `notFound()` sin permiso.

Lo que el diseño decide frente a esto: §5.2 «**No exige `edit_beneficio`**: quien puede abrir procesos puede abrir una
Libre» = `lot:manage`, lo que ya tiene Farm Operator. §5.3 (convertir en receta de la organización) y la publicación de
borradores no dicen qué permiso piden; con la convención de hoy sería `edit_beneficio`, que el Farm Operator no tiene.

---

## Afirmaciones del §1 que me tocaban

Las que se apoyan en convenciones de esquema, migración, catálogos y permisos. Las de corridas y `stage_change` son de otras
lentes.

| # | afirmación del diseño (§1, medida sobre `85eab6da`) | veredicto en `d27068d5` | evidencia |
|---|---|---|---|
| 1 | `ProcessRecipePhase` única por versión y fase (`schema.prisma:4372`); `ProcessTarget` con `everyHours`, única por `[recipeVersionId, phase, variable, moment]` (`:4416`, `:4436`) | **cierta**, con las líneas movidas | `@@unique([recipeVersionId, phase])` en `:4430`; `everyHours Int?` en `:4474`; `phase ProcessPhase?` en `:4492`; `@@unique([recipeVersionId, phase, variable, moment])` en `:4494`; índice SQL en `20260927210000_ritmo_por_fase/migration.sql:49`. Ningún código usa el selector compuesto |
| 2 | Toda versión nace `approved` (`processTargets.ts:406–411`, `:658`); no hay borrador ni función de edición | **cierta**, con una línea movida y un matiz | `status: "approved"` en `:406` (receta), `:411` (versión v1) y **`:684`** (no 658) en `createRecipeVersion`. Sí existe `updateRecipeMetadata` (`:571`), pero sólo cambia nombre y descripción, nunca objetivos. `ProcessRecipe.status` y `ProcessRecipeVersion.status` son `RecordStatus @default(draft)` (`schema.prisma`, enum en `:658-668`): el valor `draft` ya existe en el tipo, sólo que ningún código lo escribe |
| 3 | `abrirProceso` sólo rechaza una receta archivada (`lotProcess.ts:159–166`) | **cierta**, líneas movidas | `lotProcess.ts:180-188`: con `processRecipeVersionId`, rechaza `recipe_version_not_found` y `recipe_archived` (mira `version.recipe.status`, **no** el estado de la versión): un borrador pasaría hoy. Sin `processRecipeVersionId` no comprueba nada |
| 4 | Los catálogos de los ejes ya existen en `lib/research/catalogs.ts` (con `cold_hold_prefermentativo`, `doble_mosto`, `mosto_de_otro_lote`) y un comentario de `lotProcess.ts` recuerda «la lista ya está de antes» | **cierta** | claves en `catalogs.ts`: `recipiente` `:47`, `condicion_oxigeno` `:230`, `manejo_temperatura` `:255`, `fuente_microbiana` `:282`, `sustrato_anadido` `:303`, `estado_cereza` `:320`, `medio_lavado` `:328`; valores `cold_hold_prefermentativo` `:260`, `doble_mosto` `:313`, `mosto_de_otro_lote` `:341`. Comentario en `lotProcess.ts:46`. `tipo_paso`, `fisico`, `modo_secado`, `capacidad`: 0 (no existen) |
| 5 | `VariableCatalogValueDef` (`catalogs.ts:20–36`) sólo tiene `value`, `definition`, `aliasOf`, `displayOrder` e `impliesUnknownIdentity` | **parcial** | la interfaz (`catalogs.ts:18-37`) tiene `value`, `impliesUnknownIdentity?`, `aliasOf?`, `definition?` — **no `displayOrder`** (0 apariciones en `catalogs.ts`; control: `aliasOf` 5). `displayOrder` es columna de `VariableCatalogValue` (`schema.prisma`, `@default(0)`) y la escribe la semilla desde el índice del arreglo (`prisma/seed.ts:102`, `:109`). Lo que §3.5 deduce sigue en pie: no hay dónde guardar «qué ejes aplican a cada tipo» |
| 6 | (§8, convención) «Si una tarea toca TypeScript, su plan manda `npm run build`» | **cierta, y es seguro en local** | `npm run build` = `bash scripts/vercel-build.sh`: `prisma generate` + `next build`, y `migrate deploy` + seed **sólo** con `VERCEL_ENV=production`; si no, imprime «skipping migrate and seed». Con la máquina apretada, `NODE_OPTIONS="--max-old-space-size=4096"` (CLAUDE.md global, 2026-10-02) |

---

## Sorpresas — lo que el diseño no prevé y cambia el plan

1. **La receta obligatoria (§5.1) rompe la semilla de CI.** `prisma/seed.ts:889-897` abre un proceso **sin receta**
   (`seedDemoTraceabilityChain`, bajo `SEED_DEMO_CONTENT=true`), y `scripts/ci-con-base.sh` siembra con
   `SEED_DEMO_CONTENT=true`. Con `sin_receta`, la compuerta con base muere al sembrar, antes de correr ninguna prueba. La
   semilla necesita una receta DEMO (o una Libre) en la misma tarea.
2. **…y rompe casi toda la suite de procesos.** `abrirProcesoDePrueba` pasa `processRecipeVersionId: extra.processRecipeVersionId ?? null`
   (`procesoDePrueba.ts:41`): 147 llamadas en 14 archivos, sólo 7 con receta en la misma línea, más 21 llamadas directas a
   `abrirProceso` en pruebas. El helper necesita una receta de prueba por defecto (con su limpieza, y entonces
   `tieneCondicion.test.ts:174-178`, que cuenta tres `deleteMany` en el helper, cambia también).
3. **`abrirProceso` traduce TODO `P2002` a `process_already_open`** (`lotProcess.ts:216-222`, sin mirar `meta`). Si la
   receta Libre (§5.2) se crea dentro de esa transacción, un choque con `@@unique([organizationId, name])` de `ProcessRecipe`
   —dos Libres con la misma intención en la misma organización, «Libre — <intención>»— saldría como «ya hay un proceso
   abierto». El nombre necesita algo que lo haga único, y el `catch`, distinguir el índice.
4. **El paquete de Daniel no está en el repositorio.** `04_reference_parameters.json`, `processing_axes.json` y
   `06_PROCESSING_TAXONOMY.md` viven en `~/Downloads/coffee farm optimization guide/` (0 en `git ls-files`; control:
   `docs/architecture/fuentes/` sí lista). §3.5 copia referencias «con su procedencia»: hay que traer la fuente al repo
   primero, y si va a `docs/architecture/fuentes/` le aplica `fuentes-verbatim.test.ts` (manifiesto o cabecera con sha256);
   si va a `docs/dominio/`, `material-de-dominio-declarado.test.ts`.
5. **`campos-con-dos-puertas` cae con §3.1/§3.2 tal como está escrito** (§2.3): mover las fases a «publicar» o meter
   `recipeStepId` en `CreateRecipeInput["targets"]` lo pone en rojo. Hay que reescribirlo en la misma tarea, no después.
6. **`ProcesoEnCadena` no lleva la versión de receta** (`procesoDelLinaje.ts:34-44`): 4.3 («los procesos de la cadena que
   comparten la versión del vigente») necesita ampliar `SELECCION` en el archivo dueño del resolvedor o una lectura
   `lotProcess.findMany({ where: { id: { in: ids } } })`. Leer `run.lotProcess` o `where: { id: run.lotProcessId }` lo caza
   `proceso-por-el-resolvedor`.
7. **El selector de recetas ofrecería las Libres.** `listRecipeVersionsForLot` (`processTargets.ts:194-226`) lista toda
   receta aprobada de la organización o compartida; una Libre publicada (`esLibre`) aparecería en el selector del proceso
   **y en el de perfiles de tueste** (`app/lots/[id]/roast/new/page.tsx:42`). Hay que excluir `esLibre` (salvo convertidas).
   Lo mismo el control de parecido de §5.2: debe compararse con las recetas de esa organización y las plantillas, no con
   todas (`listRecipes`, `:488-499`, no filtra por organización y autoriza sobre un lote arbitrario de la base).
8. **«Las plantillas nadie las edita» (§3.4) contradice el código de hoy:** `exigeEditarBeneficioEnOrganizacion(…, null)`
   deja crear y versionar recetas compartidas a quien tenga `edit_beneficio` con alcance de plataforma (Platform Admin), y
   `app/recipes/new/page.tsx:32` lo ofrece (`permiteCompartida`). Es una decisión que el plan tiene que tomar a sabiendas.
9. **Permiso de §5.3 y de «publicar» sin decidir.** El diseño libera la Libre de `edit_beneficio`, pero convertirla en
   receta de la organización y publicar un borrador quedan sin permiso declarado; con la convención actual sería
   `location:edit_beneficio`, que el Farm Operator no tiene de serie, y por la regla de Daniel del 2026-09-27 la oferta «al
   cerrar por humedad» no se puede pintar a quien no pueda usarla.
10. **Orden de bloqueos.** §3.3 pide `SELECT … FOR UPDATE` sobre la versión al editar, publicar y abrir; `abrirProceso` ya
    bloquea el linaje (`bloquearLinaje`, `procesoDelLinaje.ts:298-312`, con `TRANSACCION_DEL_LINAJE = { timeout: 60_000, maxWait: 10_000 }`).
    Dos transacciones que tomen linaje y versión en orden distinto pueden interbloquearse: el plan tiene que fijar un orden
    (precedente: `ordenDeBloqueo` y `enMinusculas` para los uuid). `createRecipeVersion` hoy calcula `nextVersion` **fuera**
    de su transacción y sin bloqueo (`processTargets.ts:676`, la transacción abre en `:678`): dos versiones simultáneas
    chocan en `@@unique([recipeId, version])` (`schema.prisma:4380`) con un P2002 sin traducir.
11. **Ningún código de error de receta tiene texto.** `ProcessTargetError` sale siempre como «No se pudo guardar la receta:
    <código>» (`traceability.ts:307`). Los códigos nuevos de §3.2/§3.3 (`paso_de_otra_version`, borrador, publicación) saldrían
    crudos salvo que el plan cree el hermano de `claveDeErrorDeProceso` o los lance como `LotProcessError`.
12. **El diseño no trae su lista de «nombres nuevos para que Daniel los revise»**, como sí la trajo la Parte 1, y la regla de
    `CLAUDE.md` es parar y preguntar ante un nombre no declarado en `03_public_api.md` (que no declara ninguno de la 2a ni de
    la Parte 1). Además `00_reglas_del_modulo.md:50` pide identificadores en inglés y el diseño los mezcla. Es una pregunta
    para Daniel antes de escribir código, no algo que el plan pueda decidir.
13. **Dos guardias sólo ven lo que está en el índice de git** (`accion-que-no-puedes-no-se-ofrece`, `ritmo-con-quien-lo-lea`
    usan `git grep`/`git ls-files`): una página o un servicio recién creados pasan en verde hasta el `git add`. El plan tiene
    que correrlos después de escenificar.
14. **`?ok=1` es invisible a `confirmacion-que-se-lee`** (el extractor sólo casa `[a-z_-]+`): las redirecciones nuevas de la
    2a tienen que usar códigos de letras y la pantalla compararlos con `ok === "…"`.
15. **`origin/main` avanzó 18 commits y toca los mismos archivos de inventario** (`allowlist`, `inventario-de-acceso.md`,
    `messages`, `schema.prisma`, `pruebas-por-compuerta.txt`): cualquier cifra o línea de este informe se re-mide tras juntar
    `main` o tras fusionar #626. En `2bddf32c` el inventario ya dice 616/167.
16. **Prosa vieja encontrada de camino, sin efecto en las pruebas:** la `_nota` de la allowlist dice «22 el 2026-10-01» para
    `operaciones_sin_patron` (son 23); `scripts/ci.sh:27` dice «Sólo estos 14, POR NOMBRE»; el comentario de
    `procesoDePrueba.ts:5` dice «Treinta llamadas en diez archivos» (son 147 en 14).
