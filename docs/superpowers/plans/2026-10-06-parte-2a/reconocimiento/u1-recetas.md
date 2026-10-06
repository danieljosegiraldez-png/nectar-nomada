# Reconocimiento u1-recetas — el modelo y el servicio de RECETAS, medidos en `d27068d5`

**Lente:** u1-recetas. **Árbol:** `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a`, rama
`recetas-parte-2a`, `HEAD d27068d5` (comprobado con `git rev-parse --short HEAD` antes de medir).
Base común con `origin/main`: `203d9236`. **Sólo lectura**: ningún archivo del repo tocado salvo este informe.

**Cómo se midió.** `git grep`/`grep`/`awk` sobre el árbol, `git show 85eab6da:<ruta>` para comparar con la
base sobre la que se escribió el diseño, y un `node -e` que sólo lee `messages/*.json`. Cada búsqueda
negativa lleva al lado su control positivo (algo que se sabe que está y que la misma búsqueda encuentra).
**Nada se midió contra una base de datos**: lo que depende de filas reales lo dice.

**Aviso de instrumento (medido aquí):** en esta shell `grep` es **ugrep** (lo delató un error de sintaxis
`ugrep: error at position 5` con un patrón `^\+\s*`). Las búsquedas de este informe se hicieron con patrones
que ugrep acepta, y las que importaban se repitieron con `git grep` y control. Y una trampa ya vista: buscar
`esLibre` devolvió **7**, todos dentro de `lotesLibres` (`tests/traceability/corridaConProceso.test.ts`): el
nombre real **no existe**.

**Deriva de `origin/main` desde la base:** `origin/main` está hoy en `1d24c431`, 18 commits por delante de
`203d9236`, y **la Parte 1 (`124f2354`) NO está en `origin/main`**. Esos 18 commits no tocan nada de recetas
(son de territorio: `PlotShapeRange`), pero insertan **3 líneas** en `schema.prisma` antes de los modelos de
receta (`+1` hacia la 270, `+2` hacia la 994): tras rebasar, los números de línea de §1 suben 3.

---

## 1. Esquema — `prisma/schema.prisma`

Los cuatro modelos y sus enums, copiados enteros. Los números de línea son de `d27068d5`.

### 1.1 `ProcessRecipe` — líneas 4318–4347 (doc 4318–4325, modelo 4326–4347)

```prisma
// prisma/schema.prisma:4318-4347
/// P2 (ADR-098). A named, reusable process — "Lavado tradicional", "Honey 48h"
/// — carrying the numbers a run of it is aiming for. BeerSmith's shape, and
/// the product owner's own words: the recipe declares the target, the session
/// records what actually happened, and the value is in the difference.
///
/// Deliberately NOT the research Protocol. A protocol is an experiment with
/// approval and deviation machinery; this is routine production. Folding one
/// into the other would make every ordinary fermentation an experiment.
model ProcessRecipe {
  id             String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name           String
  description    String?
  organizationId String?             @map("organization_id") @db.Uuid
  organization   Organization?       @relation(fields: [organizationId], references: [id])
  status         RecordStatus        @default(draft)
  classification ClassificationLevel @default(internal)
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")
  createdBy      String?             @map("created_by") @db.Uuid
  creator        UserAccount?        @relation("ProcessRecipeCreatedBy", fields: [createdBy], references: [id])

  versions ProcessRecipeVersion[]

  // Scoped to the organization rather than globally: two farms may both run a
  // process they each call "Lavado".
  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("process_recipe")
  @@schema("traceability")
}
```

- `status RecordStatus @default(draft)` — **el valor por defecto del esquema y de la base es `draft`**
  (migración `20260828131007_p2_process_targets/migration.sql:16`: `"status" "core"."RecordStatus" NOT NULL DEFAULT 'draft'`).
- `@@unique([organizationId, name])` → índice `process_recipe_organization_id_name_key` (misma migración, línea 58).
  En Postgres dos `NULL` no chocan: **dos recetas compartidas (`organizationId` nulo) pueden llamarse igual**.
- FK `organization_id` → `ON DELETE SET NULL` (misma migración, línea 82).

### 1.2 `ProcessRecipeVersion` — líneas 4349–4384 (doc 4349–4351, modelo 4352–4384)

```prisma
// prisma/schema.prisma:4349-4384
/// An immutable set of targets. Changing a recipe means a new version, never
/// an edit — CLAUDE.md §3's version-preservation rule, and the reason a run
/// points here rather than at the recipe.
model ProcessRecipeVersion {
  id        String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipeId  String       @map("recipe_id") @db.Uuid
  recipe    ProcessRecipe @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  version   Int
  notes     String?
  status    RecordStatus @default(draft)

  /// **Cuánto debe durar la fase que esta receta describe.**
  ///
  /// Es el otro número del ritmo, y es distinto del de arriba: `everyHours` dice
  /// si el lote te debe una lectura; éste dice si el lote va tarde. Un batch
  /// puede ir en hora y deberte una medición, y al revés.
  ///
  /// Anulable por la misma razón: ausencia es «no se declaró».
  expectedHours Int?      @map("expected_hours")

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("ProcessRecipeVersionCreatedBy", fields: [createdBy], references: [id])

  targets          ProcessTarget[]
  fases            ProcessRecipePhase[]
  fermentationRuns FermentationRun[]
  roastSessions    RoastSession[]
  lotRoastProfiles LotRoastProfile[]
  lotProcesses     LotProcess[]

  @@unique([recipeId, version])
  @@index([recipeId])
  @@map("process_recipe_version")
  @@schema("traceability")
}
```

- `status RecordStatus @default(draft)` — también `DEFAULT 'draft'` en la base (migración `20260828131007`, línea 31).
- `@@unique([recipeId, version])` → `process_recipe_version_recipe_id_version_key` (línea 64 de esa migración).
- `expectedHours Int?` entró con `20260913120000_ritmo_de_receta/migration.sql:41`.
- **No hay columna que diga «borrador editable» distinta de `status`**, ni `publishedAt`, ni `derivadaDeVersionId`.

### 1.3 `ProcessRecipePhase` — líneas 4397–4434 (doc 4397–4407, modelo 4408–4434)

**Ojo al leer el archivo:** el bloque `///` de las líneas **4386–4396** («One number a run is aiming for…») es la
documentación de `ProcessTarget`, pero quedó **encima de `ProcessRecipePhase`**: la tabla de fases se insertó
entre el comentario y su modelo (2026-09-27). Prisma pega los `///` al modelo siguiente, así que hoy ese texto
documenta a la fase. Se copia aquí junto a `ProcessTarget` (§1.4) para que se lea donde corresponde.

```prisma
// prisma/schema.prisma:4397-4434
/// Lo que una receta declara **por fase**: cuánto debe durar, cada cuánto se voltea, y a qué humedad
/// se quiere llegar.
///
/// **Por qué una tabla y no más columnas en la versión (2026-09-27).** `ProcessRecipeVersion.expectedHours`
/// es un solo número para toda la receta, y significa lo que siempre significó: la duración de la
/// fermentación. Meter «horas de secado» a su lado daría dos columnas que hay que leer juntas, y
/// mañana tres. Una fila por fase dice una cosa por fila.
///
/// **Y por qué el ritmo de volteo vive aquí y no en `ProcessTarget`.** Un volteo no es una medición:
/// no tiene variable, ni unidad, ni valor. `everyHours` en un objetivo contesta «cada cuánto se mide
/// el pH»; esto contesta «cada cuánto se revuelve el café», que no cuelga de ninguna variable.
model ProcessRecipePhase {
  id              String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipeVersionId String               @map("recipe_version_id") @db.Uuid
  recipeVersion   ProcessRecipeVersion @relation(fields: [recipeVersionId], references: [id], onDelete: Cascade)
  phase           ProcessPhase

  /// Cuánto debe durar la fase. Anulable: ausencia es «no se declaró», y eso hace que la cola ordene
  /// por horas en fase sin prometer que va a tiempo (ADR-080, y la misma regla que `ritmo.ts`).
  expectedHours   Int?                 @map("expected_hours")

  /// Cada cuántas horas se voltea. Sólo tiene sentido en `drying`, y el servicio lo rechaza en otra
  /// fase en vez de guardarlo; esa regla vive en TypeScript, como la de `everyHours`, y se dice aquí
  /// en vez de llamarla estructural.
  turnEveryHours  Int?                 @map("turn_every_hours")

  /// El rango de humedad al que se quiere llegar en esta fase. Los dos o ninguno: un mínimo sin
  /// máximo no es un rango, y el servicio lo rechaza.
  targetMoistureMinPct Decimal?        @map("target_moisture_min_pct") @db.Decimal(5, 2)
  targetMoistureMaxPct Decimal?        @map("target_moisture_max_pct") @db.Decimal(5, 2)

  createdAt       DateTime             @default(now()) @map("created_at")

  @@unique([recipeVersionId, phase])
  @@index([recipeVersionId])
  @@map("process_recipe_phase")
  @@schema("traceability")
}
```

- `@@unique([recipeVersionId, phase])` → `process_recipe_phase_recipe_version_id_phase_key`
  (`20260927210000_ritmo_por_fase/migration.sql:46`). FK a la versión `ON DELETE CASCADE` (línea 52).
- Las reglas (volteo sólo en `drying`, rango de humedad «los dos o ninguno», `0 < x ≤ 100`) viven **sólo en
  TypeScript** (`validateFases`, §2.3). Ningún `CHECK` en la migración (comprobado: la migración no tiene la
  palabra `CHECK`).

### 1.4 `ProcessTarget` — líneas 4386–4396 (su doc, desplazada) + 4436–4498

```prisma
// prisma/schema.prisma:4386-4396
/// One number a run is aiming for: "pH 3.8 at the end", "Brix 22 at the start".
///
/// `moment` is what makes original-vs-final work — the same variable targeted
/// twice in one process is the ordinary case (original gravity and final
/// gravity), not an edge case.
///
/// A target may be a point (`targetValue`), a range (`minValue`/`maxValue`),
/// or both — "aim for 3.8, anywhere in 3.7–3.9 is fine". All three are
/// nullable because a recipe that says "measure pH at the end" without
/// declaring a number is still a useful instruction, and inventing a target
/// to fill the column would be inventing a fact (CLAUDE.md §3).
```

```prisma
// prisma/schema.prisma:4436-4498
model ProcessTarget {
  id               String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  recipeVersionId  String               @map("recipe_version_id") @db.Uuid
  recipeVersion    ProcessRecipeVersion @relation(fields: [recipeVersionId], references: [id], onDelete: Cascade)
  // MeasurementVariable (lib/traceability/units.ts) reused, not duplicated —
  // the same canonical names the readings themselves use, so target and actual
  // are comparable without a mapping table.
  variable         String
  moment           ProcessTargetMoment
  targetValue      Decimal?             @map("target_value") @db.Decimal(12, 4)
  minValue         Decimal?             @map("min_value") @db.Decimal(12, 4)
  maxValue         Decimal?             @map("max_value") @db.Decimal(12, 4)
  unit             String
  note             String?
  displayOrder     Int                  @default(0) @map("display_order")

  /// **Cada cuántas horas toca medir esta variable.**
  ///
  /// Encargo de Daniel (2026-09-13): «una receta requiere un ritmo de medición y
  /// tiene un indicador target de dónde comenzar y terminar, y un +/- rango».
  /// Las otras tres partes ya estaban —`targetValue` es el objetivo,
  /// `minValue`/`maxValue` son el rango, y `moment` distingue el inicio del
  /// final—. Faltaba **sólo** el ritmo.
  ///
  /// **Por qué aquí y no en una tabla nueva.** Es un atributo de la meta, no una
  /// entidad: «pH cada 6 h» no existe sin «pH». Una tabla aparte obligaría a
  /// mantener dos sitios sincronizados para decir una sola cosa.
  ///
  /// **Sólo tiene sentido con `moment: during`.** Un objetivo inicial o final
  /// ocurre una vez; pedirle un ritmo es una contradicción, y el servicio la
  /// rechaza en vez de guardarla. Esa regla vive en TypeScript y **no en la
  /// base**: un importador o un SQL directo se la salta, y se dice en vez de
  /// llamarlo estructural.
  ///
  /// **Anulable a propósito.** Una receta sin ritmo declarado es legítima —las
  /// que existen hoy no lo tienen— y su ausencia significa «no se declaró», no
  /// «no hay que medir». La lista de lotes lo distingue: sin ritmo ordena por
  /// tiempo en fase; con ritmo puede decir «14 h, y la receta dice 12».
  everyHours       Int?                 @map("every_hours")

  /// **De qué fase es este objetivo**: fermentación o secado.
  ///
  /// **Anulable, y no por comodidad.** Los objetivos que ya existían no dicen de qué fase hablan, y
  /// rellenarlos a ciegas con `fermentation` sería un supuesto: una versión de receta puede estar
  /// referenciada por un TUESTE, y entonces sería falso. La migración rellena `fermentation` sólo
  /// donde ningún tueste ni perfil de tueste la referencia —la misma condición que imprime
  /// `npm run data:medir-fases`— y deja nulo lo demás, que significa «no dice de qué fase habla».
  ///
  /// **Lo que la migración NO hace, y por qué.** No pone la columna obligatoria. Las migraciones
  /// corren solas en cada despliegue, así que una que pueda fallar con los datos de producción
  /// tumbaría el despliegue: se prefiere un nulo visible a un despliegue roto o a un dato inventado.
  ///
  /// **La grieta que esto abre, dicha.** La unicidad de abajo lleva la fase dentro, y en Postgres dos
  /// nulos no chocan: dos objetivos heredados con la misma variable y momento podrían coexistir donde
  /// antes no. Se acepta porque **nada escribe ya una fase nula** —`createRecipeWithVersion` la exige—
  /// así que el hueco sólo alcanza a filas que ninguna escritura nueva puede crear.
  phase            ProcessPhase?        @map("phase")

  @@unique([recipeVersionId, phase, variable, moment])
  @@index([recipeVersionId])
  @@map("process_target")
  @@schema("traceability")
}
```

- `@@unique([recipeVersionId, phase, variable, moment])` → `process_target_recipe_version_id_phase_variable_moment_key`,
  creado en `20260927210000_ritmo_por_fase/migration.sql:49`, que **borró** el anterior
  `process_target_recipe_version_id_variable_moment_key` (línea 23 de esa migración; nacido en
  `20260828131007…:70`).
- `phase ProcessPhase?` es **anulable**: los objetivos viejos sin fase pueden duplicarse (dos `NULL` no chocan). El
  propio comentario (4488–4491) lo dice.
- `everyHours Int?` («sólo con `moment: during`», `> 0`, entero): regla **sólo en TypeScript** (`validateTargets`).
- FK a la versión `ON DELETE CASCADE` (`20260828131007…:94`).
- **No existe `recipeStepId`** (búsqueda en `prisma lib app tests messages`: **0**; control `turnEveryHours`: 33).

### 1.5 Enums que usan

`RecordStatus` — líneas 658–668 (esquema `core`):

```prisma
// prisma/schema.prisma:654-668
// DATA_ARCHITECTURE.md §7 — generic record lifecycle, shared by every
// canonical/content entity below. Identity/RBAC tables (Person, UserAccount,
// RoleProfile, Assignment) keep their own bespoke status enums, unchanged,
// since their lifecycle genuinely differs from a content record's.
enum RecordStatus {
  draft
  incomplete
  pending_review
  verified
  approved
  archived
  rejected

  @@schema("core")
}
```

`ClassificationLevel` — líneas 676–685 (de `ProcessRecipe.classification`, default `internal`):

```prisma
// prisma/schema.prisma:676-685
enum ClassificationLevel {
  public
  registered
  partner
  internal
  confidential
  trade_secret

  @@schema("core")
}
```

`ProcessTargetMoment` — líneas 4500–4510:

```prisma
// prisma/schema.prisma:4500-4510
/// When in a run a target applies. Three, because that is what the domain has:
/// a reading at the start (original gravity/Brix), readings along the way that
/// tell you whether to keep going, and a reading at the end (final gravity, pH
/// drop) that says the run is done.
enum ProcessTargetMoment {
  initial
  during
  final

  @@schema("traceability")
}
```

`ProcessPhase` — líneas 5866–5881 (doc 5866–5875; dice que el tueste NO tiene fase de receta):

```prisma
// prisma/schema.prisma:5866-5881
/// De qué fase del proceso habla un objetivo de receta, o una fila de ritmo.
///
/// **Por qué existe (2026-09-27).** Una receta ya sabía decir «pH cada 6 h» y «18 horas», pero no de
/// qué fase hablaba: `moment` distingue inicio, durante y final DENTRO de una fase, no entre fases.
/// Sin esto, el secado no puede tener ni objetivos ni ritmo, y toda la maquinaria de «va tarde» y
/// «te debe una lectura» sólo podía funcionar en fermentación. Decisión de Daniel: el ritmo sale de
/// la receta, con fase.
///
/// El tueste no está: `RoastSession` no cuelga de una fase de receta y darle una aquí sugeriría que
/// sí. Cuando le toque, entra con su propio turno.
enum ProcessPhase {
  fermentation
  drying

  @@schema("traceability")
}
```

### 1.6 Lo que apunta a una versión de receta, y qué pasa al borrarla

| Tabla.columna | Esquema | `ON DELETE` real (SQL) |
|---|---|---|
| `process_target.recipe_version_id` | `schema.prisma:4439` | CASCADE (`20260828131007…:94`) |
| `process_recipe_phase.recipe_version_id` | `:4411` | CASCADE (`20260927210000…:52`) |
| `fermentation_run.process_recipe_version_id` | `:4072–4073` (sin `onDelete` explícito) | **SET NULL** (`20260828131007…:79`) |
| `lot_process.process_recipe_version_id` | `:4132–4133`, `onDelete: Restrict` | RESTRICT (`20260907080000_proceso_del_lote…:69`) |
| `roast_session.recipe_version_id` | `:4796` (sin `onDelete`) | **SET NULL** (`20260906183946_perfil_de_tueste…:53`) |
| `lot_roast_profile.recipe_version_id` | `:4754` (obligatoria) | RESTRICT (`20260906183946…:47`) |

**Las versiones de receta las usan también el tueste y el perfil de tueste** (`RoastSession`, `LotRoastProfile`),
no sólo el beneficio. Ver Sorpresa S5.

### 1.7 `LotProcess` y la receta — líneas 4127–4133

```prisma
// prisma/schema.prisma:4127-4133
  /// Anulable a propósito, y el reporte lo agrupa como «Sin receta» (decisión de
  /// Daniel, 2026-09-07). Un lote se puede haber procesado sin receta con
  /// nombre —o ser viejo y sólo saberse que fue lavado—, y deducir cuál fue a
  /// partir de los eventos sería inferir un hecho y guardarlo como tal, que es
  /// justo lo que CLAUDE.md §3 prohíbe.
  processRecipeVersionId String?               @map("process_recipe_version_id") @db.Uuid
  processRecipeVersion   ProcessRecipeVersion? @relation(fields: [processRecipeVersionId], references: [id], onDelete: Restrict)
```

### 1.8 Lo que NO hay en la base para recetas

- **Ningún disparador** sobre `process_recipe*` ni `process_target`: de las 21 migraciones con `TRIGGER`, ninguna
  nombra esas tablas (control: la búsqueda de `TRIGGER` sí devuelve 21 archivos).
- **Ningún `CHECK`** sobre fases ni metas. La inmutabilidad de una versión es **sólo de servicio** (nadie escribe un
  `update` sobre ellas, §2.10); la base la permite.

---

## 2. El servicio — `lib/traceability/processTargets.ts` (737 líneas)

### 2.1 Mapa de exportaciones

| Línea | Firma | Permiso que exige | Quién la llama (fuera de `tests/`) | Pruebas que la cubren |
|---|---|---|---|---|
| 39 | `export class ProcessTargetError extends Error {}` | — | `app/actions/traceability.ts:38,307`; `app/recipes/page.tsx:5,24`; `app/recipes/[id]/page.tsx:7,29` | varias (abajo) |
| 123 | `export async function compareRunToTargets(userAccountId: string, fermentationRunId: string): Promise<TargetComparison[]>` | `lot:view` sobre el lote de la corrida | `app/lots/[id]/page.tsx:301` | `processTargets.test.ts` (9 `it`), `recipeVersions.test.ts` «leaves the run on version 1…» |
| 194 | `export async function listRecipeVersionsForLot(userAccountId: string, lotId: string)` | `lot:manage` sobre ese lote | `app/lots/[id]/process/page.tsx:109` (abrir proceso), `app/lots/[id]/page.tsx:199` (perfil de tueste, sólo verde), `app/lots/[id]/roast/new/page.tsx:42` (tueste) | `recipeAuthoring` «offers the new version…»; `recipeVersions` «returns version 2 and not version 1» |
| 279 | `export function validateExpectedHours(expectedHours: number \| null \| undefined)` | — | sólo dentro del archivo (384, 655) | indirecta |
| 291 | `export function validateFases(fases: CreateRecipeInput["fases"])` | — | sólo dentro del archivo (383, 656) | `recipeAuthoring` (3 `it` de fases), `recipeVersions` R8 «las fases que recibe se validan…» |
| 324 | `export function validateTargets(targets: CreateRecipeInput["targets"])` | — | sólo dentro del archivo (382, 654) | `recipeAuthoring` «what it refuses» (7 `it`), `recipeVersions` «a new version is validated like a first one» (3 `it`) |
| 379 | `export async function createRecipeWithVersion(userAccountId: string, input: CreateRecipeInput)` | `lot:manage` sobre un lote de la org **y** `location:edit_beneficio` en la org (`null` → plataforma) | `app/actions/traceability.ts:1251` (`createRecipeAction`) | `recipeAuthoring` (todas), `editarBeneficio` (2 `it`), fixtures de `recipeVersions` |
| 480 | `export async function puedeCrearRecetaEnAlguna(userAccountId: string): Promise<boolean>` | (pregunta `edit_beneficio`) | `app/recipes/page.tsx:29` | **ninguna directa** |
| 488 | `export async function listRecipes(userAccountId: string)` | `lot:manage` sobre **el primer lote de la base** (`findFirst({ where: {} })`) | `app/recipes/page.tsx:19` | **ninguna directa** (sólo el comentario de `tests/beneficio/destinos-del-indice.test.ts:10`) |
| 503 | `export async function listRecipeOrganizations(userAccountId: string)` | `lot:manage` sobre un lote de cada org | `app/recipes/new/page.tsx:18`, y `puedeCrearRecetaEnAlguna` | **ninguna directa** |
| 534 | `export async function getRecipeForEditor(userAccountId: string, recipeId: string)` | `lot:manage` sobre un lote de la org de la receta | `app/recipes/[id]/page.tsx:27` | `recipeVersions` (3 usos) |
| 571 | `export async function updateRecipeMetadata(userAccountId: string, recipeId: string, input: { name: string; description?: string \| null })` | `lot:manage` + `location:edit_beneficio` | `app/actions/traceability.ts:1315` (`updateRecipeAction`) | `recipeVersions` «renames…», «audits the rename…»; `editarBeneficio` «un capataz NO edita ni publica…» |
| 620 | `export async function createRecipeVersion(userAccountId: string, recipeId: string, targets: CreateRecipeInput["targets"], notes?: string \| null, expectedHours?: number \| null, fases?: CreateRecipeInput["fases"])` | `lot:manage` + `location:edit_beneficio` | `app/actions/traceability.ts:1339` (`createRecipeVersionAction`, **sin `fases`** → se copian) | `recipeVersions` (todas las de v2 y R8), `editarBeneficio` «un capataz NO publica una versión nueva…» |

Control de la búsqueda de llamadores: `git grep "\bvalidateTargets\b"` y sin `\b` dan lo mismo (**7** y **7**).

**No existe** ninguna función para: archivar una receta, archivar/retirar una versión, editar una versión, sus
metas o sus fases, publicar, derivar, ni crear un borrador. Ver §2.10.

### 2.2 `CreateRecipeInput` — líneas 228–263

```ts
// lib/traceability/processTargets.ts:228-263
export interface CreateRecipeInput {
  name: string;
  description?: string | null;
  organizationId: string | null;
  targets: ReadonlyArray<{
    variable: string;
    moment: ProcessTargetMoment;
    /**
     * De qué fase es este objetivo. **Obligatorio en toda escritura nueva** (2026-09-27): los
     * objetivos heredados pueden no decirlo, pero nada nuevo entra sin decirlo. Sin esto, «pH cada
     * 6 h» y «voltear cada 4 h» vivirían en la misma receta sin poder distinguirse.
     */
    phase: ProcessPhase;
    unit: string;
    targetValue?: number | null;
    minValue?: number | null;
    maxValue?: number | null;
    note?: string | null;
    /** Cada cuántas horas toca medir. Sólo con `moment: "during"`. */
    everyHours?: number | null;
  }>;
  /**
   * Lo que la receta declara POR FASE: cuánto debe durar, cada cuántas horas se voltea y a qué rango
   * de humedad se quiere llegar. Opcional: una receta que sólo describe fermentación no declara la
   * fase de secado, y su ausencia significa «no se declaró», no «cero».
   */
  fases?: ReadonlyArray<{
    phase: ProcessPhase;
    expectedHours?: number | null;
    turnEveryHours?: number | null;
    targetMoistureMinPct?: number | null;
    targetMoistureMaxPct?: number | null;
  }>;
  /** Cuánto debe durar la fase que esta receta describe, en horas. */
  expectedHours?: number | null;
}
```

**Atención:** el guardia `tests/arquitectura/campos-con-dos-puertas.test.ts` lee **esta interfaz por su forma**
(regex `^\s{4}([a-zA-Z][a-zA-Z0-9]*)\??:` entre `targets: ReadonlyArray<{` y `}>;`, y lo mismo para
`fases?: ReadonlyArray<{`). Ver Sorpresa S6.

### 2.3 Las tres validaciones — líneas 279–377

```ts
// lib/traceability/processTargets.ts:279-377
export function validateExpectedHours(expectedHours: number | null | undefined) {
  if (expectedHours == null) return; // no declararlo es legitimo
  if (!Number.isInteger(expectedHours) || expectedHours <= 0) {
    throw new ProcessTargetError("expected_hours_must_be_positive");
  }
}

/**
 * Las reglas de las filas de fase. Viven aquí y **no en la base** por la misma razón que la del ritmo
 * de medición: un importador o un SQL directo se las salta, y eso se dice en vez de llamarlo
 * estructural.
 */
export function validateFases(fases: CreateRecipeInput["fases"]) {
  if (!fases?.length) return;
  const vistas = new Set<ProcessPhase>();
  for (const f of fases) {
    if (vistas.has(f.phase)) throw new ProcessTargetError("duplicate_phase");
    vistas.add(f.phase);

    // Un volteo sólo existe en el secado. En fermentación no hay nada que revolver, y guardarlo
    // sería un número que nadie puede leer sin equivocarse.
    if (f.turnEveryHours != null && f.phase !== "drying") {
      throw new ProcessTargetError("turn_cadence_only_in_drying");
    }
    for (const [valor, error] of [
      [f.expectedHours, "expected_hours_must_be_positive"],
      [f.turnEveryHours, "turn_cadence_must_be_positive_hours"],
    ] as const) {
      if (valor != null && (!Number.isInteger(valor) || valor <= 0)) throw new ProcessTargetError(error);
    }

    // Los dos o ninguno: un mínimo sin máximo no es un rango, y la pantalla no podría decir «cerca
    // del objetivo» con la mitad de una banda.
    const min = f.targetMoistureMinPct ?? null;
    const max = f.targetMoistureMaxPct ?? null;
    if ((min == null) !== (max == null)) throw new ProcessTargetError("moisture_range_needs_both_ends");
    if (min != null && max != null) {
      if (min > max) throw new ProcessTargetError("moisture_range_inverted");
      for (const v of [min, max]) {
        if (!(v > 0 && v <= 100)) throw new ProcessTargetError("moisture_range_out_of_physical_range");
      }
    }
  }
}

export function validateTargets(targets: CreateRecipeInput["targets"]) {
  if (targets.length === 0) throw new ProcessTargetError("at_least_one_target_required");

  for (const t of targets) {
    // A target that declares no number at all is an instruction to measure,
    // not a target, and belongs in ProtocolRequiredMeasurement rather than
    // here.
    if (t.targetValue == null && t.minValue == null && t.maxValue == null) {
      throw new ProcessTargetError("target_needs_a_number");
    }
    if (t.minValue != null && t.maxValue != null && t.minValue > t.maxValue) {
      throw new ProcessTargetError("range_inverted");
    }

    // A target is checked against the same physical bounds a reading is. A
    // declared pH of 15 is a typo, and the comparison table would otherwise
    // report a deviation of −11 for the rest of the run's life (ADR-100).
    const bounds = boundsFor(t.variable);
    if (!bounds) throw new ProcessTargetError("unknown_variable");
    if (t.unit !== bounds.canonicalUnit) throw new ProcessTargetError("wrong_unit_for_variable");
    for (const v of [t.targetValue, t.minValue, t.maxValue]) {
      if (v != null && (v < bounds.min || v > bounds.max)) {
        throw new ProcessTargetError("target_out_of_physical_range");
      }
    }

    // **El ritmo sólo tiene sentido mientras algo dura.** Un objetivo inicial o
    // final ocurre UNA vez —«el pH empieza en 5,2», «termina en 3,9»— y pedirle
    // «cada 6 horas» es una contradicción, no una preferencia. Se rechaza en
    // vez de guardarla: una fila así haría que la pantalla prometiera lecturas
    // periódicas de un momento que no se repite.
    if (!t.phase) throw new ProcessTargetError("phase_required");
    if (t.everyHours != null && t.moment !== "during") {
      throw new ProcessTargetError("cadence_only_while_running");
    }
    // Cero no es «sin ritmo» —para eso está el nulo— y un negativo no es nada.
    // Sin esto, un 0 dividiría por cero al calcular cuántas lecturas se deben.
    if (t.everyHours != null && (!Number.isInteger(t.everyHours) || t.everyHours <= 0)) {
      throw new ProcessTargetError("cadence_must_be_positive_hours");
    }
  }

  // The unique index on (recipeVersionId, variable, moment) would catch this
  // at the database, as a P2002 the operator cannot read. Catching it here
  // names the actual mistake.
  const seen = new Set<string>();
  for (const t of targets) {
    // La fase entra en la clave: la misma variable y el mismo momento pueden repetirse en
    // fermentación y en secado sin ser un duplicado — son dos cosas distintas.
    const key = `${t.phase}:${t.variable}:${t.moment}`;
    if (seen.has(key)) throw new ProcessTargetError("duplicate_variable_and_moment");
    seen.add(key);
  }
}
```

Códigos de `ProcessTargetError` que puede lanzar el archivo entero (para tests y `messages`):
`run_not_found`, `run_has_no_lot`, `lot_not_found`, `expected_hours_must_be_positive`, `duplicate_phase`,
`turn_cadence_only_in_drying`, `turn_cadence_must_be_positive_hours`, `moisture_range_needs_both_ends`,
`moisture_range_inverted`, `moisture_range_out_of_physical_range`, `at_least_one_target_required`,
`target_needs_a_number`, `range_inverted`, `unknown_variable`, `wrong_unit_for_variable`,
`target_out_of_physical_range`, `phase_required`, `cadence_only_while_running`,
`cadence_must_be_positive_hours`, `duplicate_variable_and_moment`, `name_required`,
`organization_has_no_lots`, `recipe_not_found`.

**La clave de duplicado** (373) es `` `${t.phase}:${t.variable}:${t.moment}` ``: la misma forma que el índice único.
Con `recipeStepId` (diseño §3.2) esta clave tiene que cambiar a «paso o fase».

### 2.4 `createRecipeWithVersion` — líneas 379–460 (nace `approved`: líneas **406** y **411**)

```ts
// lib/traceability/processTargets.ts:379-460
export async function createRecipeWithVersion(userAccountId: string, input: CreateRecipeInput) {
  const name = input.name.trim();
  if (!name) throw new ProcessTargetError("name_required");
  validateTargets(input.targets);
  validateFases(input.fases);
  validateExpectedHours(input.expectedHours);

  // Gated on the organization the recipe belongs to, through a lot of that
  // organization — the same authority that operates the batches it will be
  // applied to.
  // A shared recipe (no organization) is gated on any lot the account can
  // manage; an organization's recipe on a lot of that organization.
  const anyLot = await prisma.lot.findFirst({
    where: input.organizationId === null ? {} : { organizationId: input.organizationId },
  });
  if (!anyLot) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", [anyLot]);
  // Configurar recetas es configurar el beneficio (spec #370 §4.3): además del
  // lote, `edit_beneficio` en la organización de la receta; compartida, plataforma.
  await exigeEditarBeneficioEnOrganizacion(userAccountId, input.organizationId);

  const recipe = await prisma.$transaction(async (tx) => {
    const recipe = await tx.processRecipe.create({
      data: {
        name,
        description: input.description?.trim() || null,
        organizationId: input.organizationId,
        status: "approved",
        createdBy: userAccountId,
        versions: {
          create: {
            version: 1,
            status: "approved",
            expectedHours: input.expectedHours ?? null,
            createdBy: userAccountId,
            targets: {
              create: input.targets.map((t, i) => ({
                variable: t.variable,
                moment: t.moment,
                unit: t.unit,
                targetValue: t.targetValue ?? null,
                minValue: t.minValue ?? null,
                maxValue: t.maxValue ?? null,
                note: t.note?.trim() || null,
                everyHours: t.everyHours ?? null,
                phase: t.phase,
                displayOrder: i,
              })),
            },
            fases: input.fases?.length
              ? {
                  create: input.fases.map((f) => ({
                    phase: f.phase,
                    expectedHours: f.expectedHours ?? null,
                    turnEveryHours: f.turnEveryHours ?? null,
                    targetMoistureMinPct: f.targetMoistureMinPct ?? null,
                    targetMoistureMaxPct: f.targetMoistureMaxPct ?? null,
                  })),
                }
              : undefined,
          },
        },
      },
      include: { versions: { include: { targets: true, fases: true } } },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe.create",
        entityType: "process_recipe",
        entityId: recipe.id,
        after: recipe,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );

    return recipe;
  });
  return recipe;
}
```

- Valida **antes** de autorizar (382–384) y fuera de la transacción.
- Escribe receta **y** v1 `status: "approved"` (406, 411). Auditoría `process_recipe.create`, `entityType: "process_recipe"`, en el mismo `tx`.
- Devuelve el `ProcessRecipe` con `versions: [{ targets, fases }]` (442).
- **No captura `P2002`**: un nombre repetido en la misma org (`@@unique([organizationId, name])`) sale como
  `PrismaClientKnownRequestError`, y `friendlyError` lo relanza (`app/actions/traceability.ts:331`, `throw error;`) → 500.

### 2.5 `createRecipeVersion` — líneas 620–737 (nace `approved`: línea **684**; copia R8: **633–674**)

```ts
// lib/traceability/processTargets.ts:620-737
export async function createRecipeVersion(
  userAccountId: string,
  recipeId: string,
  targets: CreateRecipeInput["targets"],
  notes?: string | null,
  /**
   * **Sin esto, publicar una v2 le borraba el ritmo a la receta en silencio.**
   * Lo cazó la revisión independiente de Codex el 2026-09-13: hay DOS caminos
   * que escriben objetivos —crear receta y crear versión— y el primer intento
   * sólo cerró uno. La versión vigente quedaba sin duración esperada aunque la
   * v1 la tuviera, y nada lo decía.
   */
  expectedHours?: number | null,
  /**
   * R8 (Parte 1, 2026-09-30): las fases de la versión. **Sin pasarlas (`undefined`), se copian las de
   * la versión anterior** —la pantalla todavía no las edita, y publicar una v2 desde ella las borraba
   * en silencio, el mismo fallo que con las horas el 2026-09-13—. Un arreglo vacío explícito sí
   * significa «sin fases».
   */
  fases?: CreateRecipeInput["fases"],
) {
  const recipe = await prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: { fases: true } } },
  });
  if (!recipe) throw new ProcessTargetError("recipe_not_found");

  const anyLot = await prisma.lot.findFirst({ where: { organizationId: recipe.organizationId ?? undefined } });
  if (!anyLot) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", [anyLot]);
  // Configurar recetas es configurar el beneficio (spec #370 §4.3): además del
  // lote, `edit_beneficio` en la organización de la receta; compartida, plataforma.
  await exigeEditarBeneficioEnOrganizacion(userAccountId, recipe.organizationId);

  validateTargets(targets);
  validateExpectedHours(expectedHours);
  if (fases !== undefined) validateFases(fases);
  // Las copiadas ya se validaron al escribirse, y traen `Decimal`: no pasan por `validateFases`, que
  // compara números.
  const fasesDeLaVersion =
    fases !== undefined
      ? fases.map((f) => ({
          phase: f.phase,
          expectedHours: f.expectedHours ?? null,
          turnEveryHours: f.turnEveryHours ?? null,
          targetMoistureMinPct: f.targetMoistureMinPct ?? null,
          targetMoistureMaxPct: f.targetMoistureMaxPct ?? null,
        }))
      : (recipe.versions[0]?.fases ?? []).map((f) => ({
          phase: f.phase,
          expectedHours: f.expectedHours,
          turnEveryHours: f.turnEveryHours,
          targetMoistureMinPct: f.targetMoistureMinPct,
          targetMoistureMaxPct: f.targetMoistureMaxPct,
        }));

  const nextVersion = (recipe.versions[0]?.version ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const version = await tx.processRecipeVersion.create({
      data: {
        recipeId,
        version: nextVersion,
        notes: notes?.trim() || null,
        status: "approved",
        expectedHours: expectedHours ?? null,
        createdBy: userAccountId,
        targets: {
          create: targets.map((t, i) => ({
            variable: t.variable,
            moment: t.moment,
            unit: t.unit,
            targetValue: t.targetValue ?? null,
            minValue: t.minValue ?? null,
            maxValue: t.maxValue ?? null,
            everyHours: t.everyHours ?? null,
            // La SEGUNDA puerta. El guardia `campos-con-dos-puertas` existe por esto: cuando se
            // añadieron `everyHours` y `expectedHours` se cerró sólo `createRecipeWithVersion`, y
            // publicar la v2 le borraba el ritmo a la receta en silencio.
            phase: t.phase,
            note: t.note?.trim() || null,
            displayOrder: i,
          })),
        },
        fases: fasesDeLaVersion.length
          ? {
              create: fasesDeLaVersion.map((f) => ({
                phase: f.phase,
                expectedHours: f.expectedHours,
                turnEveryHours: f.turnEveryHours,
                targetMoistureMinPct: f.targetMoistureMinPct,
                targetMoistureMaxPct: f.targetMoistureMaxPct,
              })),
            }
          : undefined,
      },
      include: { targets: true, fases: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_version.create",
        entityType: "process_recipe_version",
        entityId: version.id,
        after: version,
        // The fact worth searching the audit log for later: which version
        // superseded which, and when.
        reason: `supersedes_version_${recipe.versions[0]?.version ?? "none"}`,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );

    return version;
  });
  return version;
}
```

- **R8 (Parte 1)**: con `fases === undefined` copia las de la versión **más alta** (`versions: { orderBy: { version: "desc" }, take: 1, include: { fases: true } }`, 643), como filas nuevas. Con `[]` explícito, sin fases.
- **Lo que NO copia**: las metas (`targets` es obligatorio y viene del llamador — la pantalla las precarga), ni
  `expectedHours` (sin pasarlo queda `null`, 685; la pantalla lo precarga en `RecipeVersionForm`), ni `notes`.
- `nextVersion` = máximo + 1 (676), calculado **fuera** de la transacción y **sin bloqueo**: dos publicaciones a la
  vez → la segunda choca con `@@unique([recipeId, version])` → `P2002` sin capturar → 500.
- Auditoría `process_recipe_version.create`, `reason: supersedes_version_<n>` (728).

### 2.6 `listRecipeVersionsForLot` — líneas 194–226 (el selector)

```ts
// lib/traceability/processTargets.ts:194-226
export async function listRecipeVersionsForLot(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new ProcessTargetError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [lot]);

  const versions = await prisma.processRecipeVersion.findMany({
    // Only approved versions are offered. A draft is someone still deciding
    // what the targets should be, and a run operated against a moving target
    // is worse than a run with none.
    where: {
      status: "approved",
      // A recipe belonging to another organization is not this batch's to use.
      // Null organizationId means a shared recipe, available to everyone.
      recipe: { OR: [{ organizationId: lot.organizationId }, { organizationId: null }] },
    },
    include: { recipe: true, targets: { orderBy: { displayOrder: "asc" } } },
    orderBy: [{ recipe: { name: "asc" } }, { version: "desc" }],
  });

  // Only the newest version of each recipe is offered for a NEW run — ADR-102.
  //
  // Before versions could be created this returned everything approved, which
  // was the same thing because there was only ever one. The moment v2 exists,
  // returning all of them puts "Lavado v1", "Lavado v2" and "Lavado v3" in one
  // picker and asks the operator to know which is current. Older versions stay
  // attached to the runs that used them and stay readable there; they are just
  // not offered again.
  const newestByRecipe = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    if (!newestByRecipe.has(v.recipeId)) newestByRecipe.set(v.recipeId, v);
  }
  return [...newestByRecipe.values()];
}
```

- Filtra `status: "approved"` **de la versión** (204) y la organización (207). **No mira `recipe.status`**: una receta
  archivada seguiría ofrecida (ver §3 y Sorpresa S4).
- Devuelve sólo la versión más alta aprobada de cada receta (221–225).
- Incluye `recipe` y `targets` (209): **no incluye `fases`**.
- **Sin prueba** del filtro `approved` ni del filtro de organización en negativo (sólo positivos: §7).

### 2.7 `updateRecipeMetadata` — líneas 571–611

Cambia **sólo** `name` y `description` de `ProcessRecipe` (590–593), con `AuditEvent` `process_recipe.update`
(antes y después) en el mismo `tx`. Es la única escritura `update` sobre tablas de receta en `lib/ app/ scripts/ prisma/`
(control: la misma búsqueda encuentra exactamente esta línea 590).

### 2.8 Las lecturas de la pantalla

- `listRecipes` (488–500): `lot:manage` sobre `prisma.lot.findFirst({ where: {} })` —**un lote cualquiera de la
  base**— y devuelve **todas las recetas de todas las organizaciones**, con todas sus versiones y metas
  (`orderBy: { version: "desc" }`). Ver Sorpresa S11.
- `getRecipeForEditor` (534–557): receta con `organization`, `versions` (desc) con `targets` y
  `_count: { select: { fermentationRuns: true } }` (sólo cuenta corridas de fermentación; ni procesos ni tuestes).
  No incluye `fases`.
- `listRecipeOrganizations` (503–524): orgs con lotes donde la cuenta tiene `lot:manage`, ordenadas con `compareNames`.
- `puedeCrearRecetaEnAlguna` (480–486): `edit_beneficio` en plataforma o en alguna org de la lista anterior.

### 2.9 `compareRunToTargets` — líneas 123–179

Lee `run.processRecipeVersion.targets` **todas**, sin filtro de fase (130) y las compara con las mediciones de la
**corrida de fermentación**. Una meta de `drying` (p. ej. `moisture during`) se compara contra lecturas de la
fermentación. La pinta `app/lots/[id]/page.tsx:301` para la fermentación activa. Ver Sorpresa S9.

### 2.10 Archivar, editar, borrador: lo que no existe

- `git grep "archived"` en `lib app` filtrado por receta: **una sola línea**, la de `abrirProceso`
  (`lotProcess.ts:187`). Control: `archived` aparece 8 veces en `lib app` (protocolos sensoriales, etc.).
- Ninguna escritura `processRecipe.update` salvo la de 590; ninguna `processRecipeVersion.update|delete`,
  `processTarget.create|update|delete`, `processRecipePhase.create|update|delete` fuera de los `create` anidados
  del servicio. Tampoco SQL crudo (`process_recipe` sólo aparece en los textos de auditoría, 448–449, 598–599, 722–723).
- Ninguna receta en `prisma/seed.ts` ni en `scripts/` (sólo `scripts/medir-fases-de-objetivos.ts`, que lee).
- **Concurrencia:** `FOR UPDATE` en `processTargets.ts`: **0**. El patrón de la casa para bloquear está en
  `procesoDelLinaje.ts:302–312`: `` await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${id}::uuid FOR UPDATE` ``.

---

## 3. `abrirProceso` y la receta (`lib/traceability/lotProcess.ts`)

`AbrirProcesoInput` — líneas 97–122:

```ts
// lib/traceability/lotProcess.ts:97-122
export interface AbrirProcesoInput {
  lotId: string;
  /** Null = «Sin receta», que el reporte agrupa aparte (decisión de Daniel). */
  processRecipeVersionId?: string | null;
  /**
   * La intención de ESTE batch. **Obligatoria aunque no haya receta**, por
   * corrección del dueño: «se puso tanto peso whole cherries, proceso natural
   * anaeróbico, tantas horas». «Sin receta» nunca significa «sin nada
   * declarado» — significa que esta intención no está estandarizada.
   */
  intent: string;
  /**
   * Del catálogo `grado_proceso`: Natural, Washed, Semi Wash 50/75%, Honey.
   * **Obligatorio** (Daniel, 2026-09-08): un café es natural, lavado o honey; no
   * es «ninguno». La columna es NOT NULL, así que el tipo lo dice igual.
   */
  processGradeValueId: string;
  /** Del catálogo `estado_cereza`: entera, despulpada. **Obligatorio.** */
  cherryStateValueId: string;
  /** Obligatorio: «no se abre un proceso sin decir a qué humedad se va a almacenar». */
  targetMoisturePct: number;
  startedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}
```

`abrirProceso` — líneas 175–224; la comprobación de receta es **181–188** (en `85eab6da` era 157–164):

```ts
// lib/traceability/lotProcess.ts:175-224
export async function abrirProceso(userAccountId: string, input: AbrirProcesoInput) {
  await loteGestionable(userAccountId, input.lotId);
  exigePorcentaje(input.targetMoisturePct, "target_moisture_pct");
  // El CHECK de la base la rechaza igual; aquí sale con una frase legible.
  if (input.intent.trim().length === 0) throw new LotProcessError("intent_required");

  if (input.processRecipeVersionId) {
    const version = await prisma.processRecipeVersion.findUnique({
      where: { id: input.processRecipeVersionId },
      include: { recipe: true },
    });
    if (!version) throw new LotProcessError("recipe_version_not_found");
    if (version.recipe.status === "archived") throw new LotProcessError("recipe_archived");
  }

  // Se comprueban SIEMPRE, no «si vienen»: son obligatorios, y una cadena vacía
  // que llegara de un formulario mal armado tiene que salir con una frase, no
  // con una violación de clave foránea.
  if (!input.processGradeValueId?.trim()) throw new LotProcessError("process_grade_required");
  if (!input.cherryStateValueId?.trim()) throw new LotProcessError("cherry_state_required");
  await exigeDelCatalogo(input.processGradeValueId, CATALOGO_GRADO_PROCESO, "process_grade");
  await exigeDelCatalogo(input.cherryStateValueId, CATALOGO_ESTADO_CEREZA, "cherry_state");

  // R2 (Parte 1, 2026-10-01): la comprobación de «otro proceso abierto» ya no se hace aquí, con el cliente
  // global y fuera de la transacción: la hace `abrirProcesoEnTx` dentro, con el linaje bloqueado.
  try {
    return await prisma.$transaction(async (tx) => {
      await bloquearLinaje(tx, input.lotId);
      return abrirProcesoEnTx(tx, userAccountId, {
        lotId: input.lotId,
        processRecipeVersionId: input.processRecipeVersionId ?? null,
        intent: input.intent.trim(),
        processGradeValueId: input.processGradeValueId,
        cherryStateValueId: input.cherryStateValueId,
        targetMoisturePct: input.targetMoisturePct,
        startedAt: input.startedAt,
        notes: input.notes?.trim() || null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference?.trim() || null,
      });
    }, TRANSACCION_DEL_LINAJE);
  } catch (error) {
    // El índice único parcial es la red: si algo se colara entre el bloqueo y la escritura, sale con
    // nombre y no como un error de restricción ilegible.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new LotProcessError("process_already_open");
    }
    throw error;
  }
}
```

Lo que comprueba de la receta, y lo que no:

| Comprueba | No comprueba |
|---|---|
| que la versión exista → `recipe_version_not_found` (186) | `version.status` (un `draft` o `rejected` hecho fuera del servicio **se acepta**) |
| que la **receta** (no la versión) no esté `archived` → `recipe_archived` (187) | la organización de la receta (el tueste sí: `roasting.ts:148–150` y `407–409`, `recipe_belongs_to_another_organization`) |
| | que haya receta (null = «Sin receta», línea 99–100) |

- La lectura de la versión ocurre **antes** y **fuera** de la transacción (181–188); la transacción (201–215) sólo
  bloquea el linaje. Para §3.3 del diseño (bloquear la fila de la versión) la comprobación tiene que entrar al `tx`.
- `abrirProcesoEnTx` (`procesoDelLinaje.ts:441–477`) **no valida** la receta: copia `processRecipeVersionId` tal cual.
  Lo llaman también la división (`procesoDelLinaje.ts:704–706`, `processRecipeVersionId: proceso.processRecipeVersionId`)
  y la devolución a secado (`lotProcess.ts:622`, `processRecipeVersionId: cerrado.processRecipeVersionId`).
- La corrida hereda la receta del proceso: `fermentation.ts:80–82` rechaza otra con `receta_distinta_del_proceso`
  y escribe `proceso.processRecipeVersionId` (90).
- `recipe_archived` y `recipe_version_not_found` **no** están en `CODIGOS_DE_PROCESO_TRADUCIDOS`
  (`lib/traceability/errorDeProceso.ts:17–45`): salen por el genérico `error_lot_process` con el código crudo
  (`app/actions/traceability.ts:201`). El guardia de esa lista es `tests/traceability/mensajesDeProceso.test.ts`
  («cada código tiene `Traceability.error_proceso_<código>` en los dos idiomas»).

---

## 4. Permisos

| Operación | Claves que exige | Dónde |
|---|---|---|
| Crear receta, publicar versión, renombrar | `lot:manage` (vía `requireLotAccess(…, "manage", [unLote])`) **y** `location:edit_beneficio` (vía `exigeEditarBeneficioEnOrganizacion(userAccountId, organizationId)`) | `processTargets.ts:395+398`, `649+652`, `581+584` |
| Receta compartida (`organizationId` nulo) | `location:edit_beneficio` en ámbito **plataforma** | `locations.ts:300–313` |
| Leer lista / editor / selector | sólo `lot:manage` | `processTargets.ts:491`, `554`, `197` |
| Comparar corrida | `lot:view` | `processTargets.ts:143` |

`exigeEditarBeneficioEnOrganizacion` — `lib/traceability/locations.ts:300–335`; su hermana que pregunta,
`puedeEditarBeneficioEnOrganizacion` — `:339–347`. Lanza `LocationAccessError("no_beneficio_edit_access")`,
que `friendlyError` traduce como `error_access` (`app/actions/traceability.ts:206`).

Catálogo RBAC: `lib/rbac/catalog.ts:62` (`lot:manage`), `:155` (`location:edit_beneficio`: «De serie para Farm
Manager; a un Farm Operator sólo por concesión»), concedida al Farm Manager en `:391`.

**No existe ninguna clave `recipe:*`** — los comentarios de 188–192 y 465–466 dicen que es a propósito
(ADR-091/099).

---

## 5. Pantallas y acciones

### 5.1 Pantallas `app/recipes/**` (294 líneas en total)

| Archivo | Qué hace | Permiso efectivo |
|---|---|---|
| `app/recipes/page.tsx` (94) | `listRecipes` (19); si `ProcessTargetError` → `redirect("/lots")` (24); enlace «nueva» sólo si `puedeCrearRecetaEnAlguna` (29, 43–47); pinta las metas de `r.versions[0]` (55–86); `?ok` → `recipeCreatedOk` (37) | `lot:manage` |
| `app/recipes/new/page.tsx` (48) | `listRecipeOrganizations` (18); filtra las orgs con `puedeEditarBeneficioEnOrganizacion` (28–31); `permiteCompartida` (32); sin ninguna → `notFound()` (36); `RecipeForm` (45) con `listVariableDefinitions("proceso_de_cafe")` (38) | `lot:manage` + `edit_beneficio` |
| `app/recipes/[id]/page.tsx` (152) | `getRecipeForEditor` (27); `puedeEditar` (36); precarga la v vigente (`versions[0]`) como `initialTargets` con `phase ?? "fermentation"` (43–56); `RecipeMetadataForm` (78) y `RecipeVersionForm` (94) sólo con `puedeEditar`, si no `recipeSinPermisoEditar` (85, 102); historia de versiones con «usada por N corridas» (`_count.fermentationRuns`, 123–125) | ver: `lot:manage`; editar: + `edit_beneficio` |

**Ninguna pantalla pinta ni edita fases** (`fases`/`turnEveryHours` en `RecipeForm.tsx` + `RecipeVersionForm.tsx`:
**0**; control `expectedHours` en `RecipeForm.tsx`: 1). Es la «pantalla de fases» que la Parte 1 dejó fuera.

### 5.2 Componentes

| Archivo | Acción | Campos que manda |
|---|---|---|
| `app/components/traceability/RecipeForm.tsx` (267) | `createRecipeAction` | `name`, `description`, `organizationId` (`""` = compartida, 85), `expectedHours`; por fila `targets[i][variable|moment|phase|unit|targetValue|minValue|maxValue|everyHours|note]` (120–124, 175–220). Exporta `VariableChoice` (10–15) |
| `app/components/traceability/RecipeVersionForm.tsx` (174) | `createRecipeVersionAction` | `recipeId`, `notes`, `expectedHours` (precargado, 68); las mismas filas `targets[i][…]` (75–145). Exporta `InitialTarget` (11–22) |
| `app/components/traceability/RecipeMetadataForm.tsx` (45) | `updateRecipeAction` | `recipeId`, `name`, `description` |

### 5.3 Acciones de servidor — `app/actions/traceability.ts`

```ts
// app/actions/traceability.ts:1240-1355
export async function createRecipeAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const targets = parseTargetRows(formData);

  try {
    await createRecipeWithVersion(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      description: emptyToNull(formData.get("description")),
      organizationId: emptyToNull(formData.get("organizationId")),
      expectedHours: emptyToNullNumber(formData.get("expectedHours")),
      targets,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath("/recipes");
  redirect("/recipes?ok=1");
}

/** Shared by both recipe forms — the target rows arrive the same way. */
function parseTargetRows(formData: FormData) {
  const targets: {
    variable: string;
    moment: "initial" | "during" | "final";
    phase: "fermentation" | "drying";
    unit: string;
    targetValue: number | null;
    minValue: number | null;
    maxValue: number | null;
    everyHours: number | null;
    note: string | null;
  }[] = [];
  for (let i = 0; i < 50; i++) {
    const variable = formData.get(`targets[${i}][variable]`);
    if (typeof variable !== "string" || variable === "") break;
    targets.push({
      variable,
      moment: String(formData.get(`targets[${i}][moment]`) ?? "final") as "initial" | "during" | "final",
      // La fase por defecto es fermentación, que es lo que toda receta existente describe: un
      // formulario viejo o una llamada sin el campo sigue significando lo que significaba. Lo que
      // NO se admite es una fase inventada, así que cualquier otra cosa cae a fermentación y el
      // servicio la valida igual.
      phase: formData.get(`targets[${i}][phase]`) === "drying" ? "drying" : "fermentation",
      unit: String(formData.get(`targets[${i}][unit]`) ?? ""),
      targetValue: emptyToNullNumber(formData.get(`targets[${i}][targetValue]`)),
      minValue: emptyToNullNumber(formData.get(`targets[${i}][minValue]`)),
      maxValue: emptyToNullNumber(formData.get(`targets[${i}][maxValue]`)),
      // El formulario sólo pinta este campo con `moment: during` y lo limpia al
      // cambiar de momento, pero la acción no se fía de eso: se puede invocar
      // sin pasar por la pantalla, y `validateTargets` rechaza el caso.
      everyHours: emptyToNullNumber(formData.get(`targets[${i}][everyHours]`)),
      note: emptyToNull(formData.get(`targets[${i}][note]`)),
    });
  }
  return targets;
}

/** Rename a recipe, or reword its description — ADR-102. Never its targets. */
export async function updateRecipeAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const recipeId = String(formData.get("recipeId") ?? "");

  try {
    await updateRecipeMetadata(user.userAccountId, recipeId, {
      name: String(formData.get("name") ?? ""),
      description: emptyToNull(formData.get("description")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=renamed`);
}

/** A new version — the only way targets ever change (ADR-102). */
export async function createRecipeVersionAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const recipeId = String(formData.get("recipeId") ?? "");

  try {
    await createRecipeVersion(
      user.userAccountId,
      recipeId,
      parseTargetRows(formData),
      emptyToNull(formData.get("notes")),
      // Sin esto, publicar una v2 dejaba la version vigente sin duracion
      // esperada aunque la v1 la tuviera. Lo cazo la revision de Codex.
      emptyToNullNumber(formData.get("expectedHours")),
    );
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=versioned`);
}
```

- `parseTargetRows` (1267–1302) recorre hasta 50 filas y para en la primera sin `variable`; fase por defecto
  `fermentation` (1289). **No lee `fases`**: ninguna acción las manda.
- Las tres redirigen fuera del `try` (1263, 1325, 1354), como manda la trampa del `redirect` en `CLAUDE.md`.
- `abrirProcesoAction` (2454–2486): `processRecipeVersionId: emptyToNull(formData.get("processRecipeVersionId"))` (2468).

`friendlyError` (174–331): `ProcessTargetError` → `t("error_process_target", { detail: error.message })` (307),
**con el código crudo** («No se pudo guardar la receta: duplicate_variable_and_moment»); `LotProcessError` con
código traducido → `error_proceso_<código>` (195–196), si no → `error_lot_process` (201); al final `throw error;` (331).

### 5.4 Claves de traducción

Namespace **`Traceability`** en todas (`getTranslations("Traceability")` / `useTranslations("Traceability")`).
Las que usan las seis piezas de §5.1–5.2, comprobadas presentes en `messages/es.json` **y** `messages/en.json`
con `node -e` (control: una clave inventada `CONTROL_NO_EXISTE_xyz` sale «falta» en los dos):

`recipesBadge`, `recipesTitle`, `recipesIntro`, `recipesEmpty`, `recipesBackLink`, `recipeNewButton`,
`recipeCreatedOk`, `recipeNewTitle`, `recipeNewIntro`, `recipeVersionCount`, `recipeCurrentVersion`,
`recipeRenamedOk`, `recipeVersionedOk`, `recipeMetadataHeading`, `recipeMetadataIntro`, `recipeSinPermisoEditar`,
`recipeNewVersionHeading`, `recipeNewVersionIntro`, `recipeHistoryHeading`, `recipeHistoryIntro`,
`recipeVersionLabel`, `recipeCurrentBadge`, `recipeVersionUnused`, `recipeVersionUsedBy`, `recipeNameLabel`,
`recipeDescriptionLabel`, `recipeOrganizationLabel`, `recipeSharedOption`, `recipeExpectedHoursLabel`,
`recipeExpectedHoursHint`, `recipeTargetsHeading`, `recipeTargetsIntro`, `recipeVariableLabel`, `recipePhaseLabel`,
`recipeMomentLabel`, `recipeTargetValueLabel`, `recipeMinLabel`, `recipeMaxLabel`, `recipeEveryHoursLabel`,
`recipeEveryHoursPlaceholder`, `recipeEveryHoursHint`, `recipeNoteLabel`, `recipeBoundsHint`, `recipeRemoveTarget`,
`recipeAddTarget`, `recipeSavingButton`, `recipeCreateButton`, `recipeCreateVersionButton`, `recipeSaveNameButton`,
`recipeVersionNotesLabel`, `recipeVersionNotesPlaceholder`, `targetsRange`, `moment_initial|during|final`,
`phase_fermentation|drying`, `error_process_target`, y las dinámicas `variable_${…}` (con `fallback`).
`Traceability` tiene 1455 claves en cada idioma; 51 empiezan por `recipe`. Los selectores de recetas de otras
pantallas usan además `targetsCountSuffix`.

### 5.5 Dónde se elige una receta (todas por `listRecipeVersionsForLot`)

| Pantalla | Línea | Para qué |
|---|---|---|
| `app/lots/[id]/process/page.tsx` | 109–112 | abrir proceso (etiqueta `${recipe.name} · v${version} · ${targets.length} …`) |
| `app/lots/[id]/page.tsx` | 197–203 | perfil de tueste, sólo `lotType === "green"` |
| `app/lots/[id]/roast/new/page.tsx` | 42–44 | tueste |

---

## 6. Lectores de fases y metas (fuera de mi lente; medidos de paso para corregir los números del diseño)

| Diseño (`85eab6da`) | Hoy (`d27068d5`) | Qué lee |
|---|---|---|
| `colaDeSecado.ts:263–275` | `lib/beneficio/colaDeSecado.ts:280–318` | `fases: { where: { phase: "drying" } }` (287), `fases[0]` (295), `targets { variable, everyHours, phase }` (288) → `metasDeSecado` (211–219, filtra `phase === "drying" && everyHours != null`) |
| `datosDelTablero.ts:274–282` | `lib/beneficio/datosDelTablero.ts:121–133` (`procesoSelect`) y 311–320 | `fases { phase, expectedHours }`, `targets { variable, everyHours, phase, moment, minValue, … }`; `fases.find(f => f.phase === c.fase)` (319), `metasDeFase(targets, c.fase, …)` (320) |
| `datosDelTablero.ts:351` | `:392` | `fases.find((f) => f.phase === fase)?.expectedHours` |
| `datosDelTablero.ts:451` | `:486–488` | `metas.filter((t) => abierta && t.variable === variable && t.phase === abierta.fase)` |
| (no lo nombra) | `processTargets.ts:130` (`compareRunToTargets`) | **todas** las metas, sin fase |

---

## 7. Pruebas que existen hoy

### 7.1 Sobre recetas directamente

**`tests/traceability/recipeAuthoring.test.ts`** (256 líneas; `RUN = recipe-${Date.now()}`; admin = un Platform Admin de plataforma; limpieza por prefijo de nombre)
- `describe("creating a recipe")`: «creates the recipe and its first version together» (76) — **afirma `status` `"approved"`** en la línea 94; «offers the new version when starting a run on that organization's batch» (97); «writes an audit row» (102).
- Suelta, fuera de `describe`: «stores each target's phase and the recipe's per-phase rows» (114). Su comentario de la 121 dice «The SAME variable at the SAME moment, in another phase» y **es falso**: las filas son `ph` y `moisture` (Sorpresa S13).
- `describe("what it refuses")`: «refuses a turn rhythm on fermentation» (144, `turn_cadence_only_in_drying`), «refuses a moisture range with only one end» (156, `moisture_range_needs_both_ends`), «refuses an inverted moisture range» (168, `moisture_range_inverted`), «refuses a recipe with no name» (179), «refuses a recipe with no targets — a name declares nothing» (185), «refuses a target carrying no number at all» (191), «refuses an inverted range» (204), «refuses a target outside the variable's physical range» (214), «refuses a unit that does not belong to the variable» (227), «refuses a variable that is not in the registry» (240), «leaves nothing behind when it refuses» (250). Sólo las tres primeras nombran el código; las demás usan `toBeInstanceOf(ProcessTargetError)`.

**`tests/traceability/recipeVersions.test.ts`** (320 líneas; `RUN = rver-…`; fixture: receta v1 con pH final 3.8 y una corrida sobre v1 creada con `prisma` directo)
- `describe("a name may be edited; targets may not")`: «renames the recipe without touching any version» (131), «audits the rename with both sides» (145).
- `describe("creating version 2")`: «numbers it from the highest existing version» (157), «leaves the run on version 1 comparing against 3.8, not 4.0» (167), «records which version it supersedes» (175), «shows version 1 as used by a run, so the page can refuse to treat it as scratch» (183).
- `describe("only the newest version is offered for a new run")`: «returns version 2 and not version 1» (193).
- `describe("a new version is validated like a first one")`: «refuses an impossible value» (205), «refuses two targets for the same variable and moment» (211), «refuses an empty set of targets» (222), «created no version when it refused» (226).
- `describe("R8 (Parte 1) — una versión nueva conserva las fases de la anterior")` (232): «publicar una v2 sin fases copia las de la v1» (272), «si recibe fases, reemplazan a las anteriores; un arreglo vacío significa «sin fases»» (291), «las fases que recibe se validan como las de una receta nueva, y no crea versión si fallan» (309).
- Su `afterAll` (87–128) borra en orden: mediciones, entradas y transformaciones, corridas, auditoría por id de receta, **auditoría por id de versión** (las de versión cuelgan del id de la VERSIÓN), fases, metas, versiones, recetas por prefijo, lotes, orgs; y afirma que no queda nada (126–127). Es la plantilla de limpieza a copiar para pasos.

**`tests/traceability/processTargets.test.ts`** (240 líneas; receta creada con `prisma.processRecipe.create` y **metas sin `phase`** (102–104), `status: "approved"`)
- «reports the final pH against its target» (146), «averages the readings taken during the run, and keeps every one of them» (158), «names how the mean was arrived at — §28» (170), «says whether the average fell inside the declared range» (181), «returns null for withinRange when no range was declared» (188), «flags a single reading serving as both initial and final» (199), «returns an empty comparison for a run with no recipe, not an error» (210), «refuses a run that does not exist rather than returning nothing» (216), «a run points at the version, so a later version cannot rewrite its targets» (224).

**`tests/traceability/editarBeneficio.test.ts`**, `describe("recetas (crear, editar, publicar)")` (298):
«un capataz NO crea una receta de su organización; un Farm Manager sí» (332), «un capataz NO edita ni publica; con la concesión, sí» (340), «un capataz NO publica una versión nueva; con la concesión, sí» (357). Y `describe("exigeEditarBeneficioEnOrganizacion (guardia compartida por las recetas)")` (368): 375, 393 («una receta compartida (sin organización) no la configura un Farm Manager de finca»), 411; `describe("recetas: la organización heredada también cuenta (createRecipeWithVersion)")` (425): 461.

**`tests/arquitectura/campos-con-dos-puertas.test.ts`** — `describe("un campo de receta llega por todas las puertas que lo escriben")` (114): «el parseo encuentra los campos que se sabe que existen» (119), «la acción parsea todos los campos del formulario» (127), «LOS DOS servicios que escriben objetivos persisten todos los campos» (136), «LOS DOS formularios que crean objetivos mandan todos los campos» (146), «la duración esperada llega por sus cuatro puertas» (159); `describe("R8 — las fases llegan por las dos puertas")` (171): «el parseo encuentra los cinco campos de fase (control positivo)» (172), «LOS DOS servicios escriben todas las columnas de fase» (176).

**`tests/traceability/lotProcess.test.ts`**, `describe("abrir un proceso")` (238): «numera la secuencia solo, empezando en 1» (239, abre **con** receta), «rechaza una receta que no existe» (263, `recipe_version_not_found`), **«se puede abrir SIN receta, y el listado lo agrupa como «Sin receta»»** (269). **Ninguna prueba** de `recipe_archived` en todo `tests/` (control: la misma búsqueda encuentra `recipe_version_not_found` en la 266).

Otros que nombran la clase o la lista: `tests/arquitectura/acciones-traducen-sus-errores.test.ts:300` (`ProcessTargetError` en la lista de clases traducidas), `tests/beneficio/destinos-del-indice.test.ts:18,59` (el enlace `/recipes` sólo con `lot:manage`), `tests/traceability/lotesSoloOperacion.test.ts:43`.

### 7.2 Fixtures que crean recetas sin pasar por el servicio

Todas fijan `status: "approved"` en la **versión** (medido una por una):
`tests/beneficio/colaDeSecado.test.ts:107,287,343`; `tests/beneficio/datos-del-tablero.test.ts:702/706,729/733,862/866`;
`tests/traceability/bodegaConProceso.test.ts:1207–1208`; `corridaConProceso.test.ts:155–157, 979`;
`divisionBajoProceso.test.ts:135–136`; `lotProcess.test.ts:120–126`; `perfilDeTueste.test.ts:54–56`
(**la receta sin `status` → `draft`**, la versión `approved`); `processTargets.test.ts:92–99, 227–231`;
`reporteDeProceso.test.ts:122–128, 132–138`. Ninguna crea pasos (no existen).

### 7.3 El ayudante que abre procesos en las pruebas

`tests/helpers/procesoDePrueba.ts:28–43`, `abrirProcesoDePrueba(userAccountId, lotId, extra)`, con
`processRecipeVersionId: extra.processRecipeVersionId ?? null` (41). **148 llamadas en 14 archivos, 141 sin receta**
(contadas recorriendo los argumentos de cada llamada hasta su paréntesis; sólo 7 pasan `processRecipeVersionId`).
Por líneas, los que más: `corridaConProceso` 44, `bodegaConProceso` 38, `divisionBajoProceso` 22, `aperturaDeProceso` 17. Más 21 llamadas directas a `abrirProceso(` en `tests/` (17 en `lotProcess.test.ts`).

---

## 8. Afirmaciones del §1 que me tocaban

**(1) «`ProcessRecipeVersion` tiene fases (`ProcessRecipePhase`: `fermentation | drying`, con horas, volteo y banda
de humedad), únicas por versión y fase (`schema.prisma:4372`), y metas (`ProcessTarget`: variable, momento
`initial|during|final`, rango, unidad, `phase` y `everyHours`, únicas por `[recipeVersionId, phase, variable,
moment]`, `schema.prisma:4416` y `:4436`). No tiene pasos.»** — **CIERTA en contenido; los números de línea
cambiaron.** En `85eab6da` eran 4372/4416/4436 (comprobado con `git show`); hoy son **4430** (`@@unique([recipeVersionId, phase])`),
**4474** (`everyHours`), **4494** (`@@unique([recipeVersionId, phase, variable, moment])`), +58. Matices: `phase` de la
meta es **anulable** (los `NULL` no chocan en el único, y el propio esquema lo dice en 4488–4491); la meta admite
punto (`targetValue`) además de rango; las reglas de `everyHours` y de las fases viven sólo en TypeScript. «No tiene
pasos»: `ProcessRecipeStep`/`recipeStepId` dan **0** (control `turnEveryHours`: 33).

**(2) «Toda versión nace `approved` (`processTargets.ts:406–411`, `:658`); no hay borrador ni función de edición.
`abrirProceso` sólo rechaza una receta archivada (`lotProcess.ts:159–166`).»** — **PARCIAL.**
- «nace `approved`»: cierta **para el servicio** — 406 (receta), 411 (v1), **684** (vN; era 658). Pero el esquema y la
  base dan `draft` por defecto a las dos tablas (4332, 4358; migración `20260828131007` líneas 16 y 31): lo que se
  escribe fuera del servicio nace `draft` salvo que diga otra cosa (`perfilDeTueste.test.ts:54` crea así una receta).
- «no hay borrador»: no hay **flujo** de borrador, pero el estado existe en el enum y **un lector ya lo distingue**:
  `listRecipeVersionsForLot` sólo ofrece `approved` (204), sin prueba.
- «ni función de edición»: cierta para versiones, metas y fases (ninguna escritura `update`/`delete` en `lib app
  scripts prisma`). La receta sí se edita: `updateRecipeMetadata` (590) cambia nombre y descripción.
- «`abrirProceso` sólo rechaza una receta archivada»: **parcial** — rechaza también una versión inexistente
  (`recipe_version_not_found`, 186); lo archivado se mira en la **receta**, no en la versión (`version.recipe.status`,
  187); **no** mira `version.status` ni la organización; y **nada en la aplicación puede archivar** una receta, así
  que `recipe_archived` sólo se alcanza con SQL, y ninguna prueba lo ejercita. Líneas hoy 181–188.

---

## 9. Sorpresas — lo que el diseño de la 2a no prevé

- **S1. Una prueba afirma hoy lo contrario de §3.3.** `recipeAuthoring.test.ts:94` exige
  `versions[0].status === "approved"` con el comentario «Approved on creation, so it is immediately selectable — a
  draft nobody can attach would be a recipe that does nothing». Al nacer `draft` cae; el plan tiene que cambiarla a
  propósito y decirlo, no «arreglar una regresión».
- **S2. La receta obligatoria (§5.1) rompe 141 aperturas de prueba** (de 148 llamadas a `abrirProcesoDePrueba` en 14
  archivos, sólo 7 pasan receta). El ayudante manda `null` por defecto (`procesoDePrueba.ts:41`); además `lotProcess.test.ts:269` («se puede abrir SIN
  receta…») afirma justo lo que §5.1 prohíbe. El ayudante necesita una receta publicada de fixture **por
  organización** (si se añade la comprobación de organización, S3), y su limpieza (versión, auditoría de la versión,
  receta), porque `lot_process.process_recipe_version_id` es RESTRICT.
- **S3. `abrirProceso` no comprueba que la receta sea de la organización del lote**; el tueste sí, dos veces
  (`roasting.ts:148–150`, `407–409`). El selector filtra por organización, pero la acción acepta cualquier id. Si §3.3
  reescribe la comprobación («exigir `approved`»), es el sitio natural para cerrar esto.
- **S4. Los dos `status` no casan entre sí.** El selector mira `version.status === "approved"` e ignora
  `recipe.status`; `abrirProceso` mira `recipe.status === "archived"` e ignora `version.status`. Una versión de una
  receta archivada se ofrece y luego se rechaza; una versión `draft` (hecha por SQL) no se ofrece pero se acepta por
  id. §3.3 («exigen `approved`») tiene que decidir qué `status` manda en cada lector.
- **S5. Las recetas también son perfiles de tueste.** `listRecipeVersionsForLot` alimenta los tres selectores
  (§5.5), dos de ellos de tueste; `RoastSession.recipeVersionId` y `LotRoastProfile.recipeVersionId` apuntan a las
  mismas versiones. El diseño no menciona el tueste: una «Libre» (§5.2) aparecería en los selectores de perfil de
  tueste salvo que se filtre por `esLibre`, y una receta con pasos de beneficio aparece como perfil de tueste.
- **S6. El guardia `campos-con-dos-puertas` ata la forma del código.** Lee `CreateRecipeInput` con una regex de
  cuatro espacios de sangría, los bloques `targets: {`…`displayOrder` de las dos funciones y el bloque `fases:` antes
  del `include:`. Consecuencias para el plan: (a) si `recipeStepId` entra en `CreateRecipeInput.targets`, el guardia
  exige `targets[${i}][recipeStepId]` en `parseTargetRows`, `recipeStepId:` en los dos servicios y `[recipeStepId]` en
  **los dos formularios**; (b) mover la escritura de metas a un ayudante común lo deja ciego o lo hace lanzar
  («no construye targets»); (c) si los pasos tienen sus propias «dos puertas» (crear y copiar a borrador), merecen el
  mismo guardia con su control positivo.
- **S7. Concurrencia y nombres: tres `P2002` sin capturar.** Número de versión `max+1` fuera del `tx` y sin
  bloqueo (676); nombre repetido en la org en crear y renombrar. `friendlyError` los relanza → 500. Para la «Libre»
  (§5.2, nombre «Libre — <intención>») dos Libres con la misma intención en la misma organización **chocan** con
  `@@unique([organizationId, name])`.
- **S8. La copia de R8 sólo copia fases.** Ni metas ni `expectedHours` (sin pasarlo, la versión nueva queda con
  `null`; sólo la pantalla lo salva precargando). La copia a borrador de §3.3 tiene que copiar `expectedHours`,
  metas, fases, pasos, adiciones y fines, y remapear `recipeStepId`.
- **S9. `compareRunToTargets` no filtra por fase** (130) y no está en la lista de lectores de §3.2: compara también
  las metas de secado contra las lecturas de la fermentación, en la página del lote. Con metas por paso mezclaría
  además las de todos los pasos.
- **S10. §3.4 («ninguna organización edita las plantillas») no es lo de hoy.** Una receta con `organizationId` nulo
  se edita con `edit_beneficio` de plataforma (`locations.ts:301–312`), y hay prueba de que un Farm Manager de finca no
  puede (`editarBeneficio.test.ts:393`). «Ninguna» tiene que decir si incluye a plataforma.
- **S11. `/recipes` muestra las recetas de todas las organizaciones y se autoriza contra un lote cualquiera.**
  `listRecipes` usa `prisma.lot.findFirst({ where: {} })` (489) y no filtra por organización (493–499). Quien gestiona
  lotes de una finca pero no ese «primer lote» recibe `TraceabilityAccessError`, que la página no captura (sólo
  `ProcessTargetError`, 24) → error de servidor. **Plausible, no reproducido.** Si §6 rehace la pantalla, es el
  momento.
- **S12. Los códigos de receta salen crudos.** `error_process_target` = «No se pudo guardar la receta: {detail}» con
  el código en inglés; `recipe_archived`/`recipe_version_not_found` igual por `error_lot_process`. Los códigos nuevos
  de la 2a (`paso_de_otra_version`, `sin_receta`, `desviacion_sin_motivo`…) necesitan su clave, y los de proceso van en
  `CODIGOS_DE_PROCESO_TRADUCIDOS` para que el guardia de `mensajesDeProceso.test.ts` los vigile.
- **S13. La unicidad por fase no tiene prueba.** El comentario de `recipeAuthoring.test.ts:121` dice probar «la
  misma variable y el mismo momento en otra fase», pero sus filas son `ph`/fermentación y `moisture`/secado. Ninguna
  prueba nombra `duplicate_variable_and_moment`, y `duplicate_phase` no tiene ninguna. El flip-test de §8 del diseño
  («quitar `recipeStepId` de la unicidad → cae») no tiene hoy hermano para la fase.
- **S14. Los números de línea del diseño se movieron** (§6 y §8 de este informe). Y tras rebasar sobre
  `origin/main` actual, `schema.prisma` suma 3 más.
- **S15. La doc de `ProcessTarget` quedó pegada a `ProcessRecipePhase`** (4386–4396, §1.3). Si se inserta
  `ProcessRecipeStep` en esa zona, conviene no repetir el desplazamiento.
- **S16. No hay datos medidos en ninguna base.** «Las versiones `approved` de hoy siguen siendo publicadas»
  (§3.3) depende de que en producción todas estén `approved`; el servicio sólo escribe `approved`, pero filas
  escritas por SQL o importadas podrían no estarlo. Hay que contarlo antes de la migración.
