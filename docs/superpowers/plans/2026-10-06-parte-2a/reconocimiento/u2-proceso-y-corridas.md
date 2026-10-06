# Reconocimiento u2 — el PROCESO y las CORRIDAS tras la Parte 1

**Árbol medido:** `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a`, rama `recetas-parte-2a`,
`git rev-parse --short HEAD` = **`d27068d5`**, `origin/main` = `203d9236`, `git status --porcelain` vacío.
La Parte 1 entera está en el árbol: `git diff --stat 203d9236 d27068d5` = 90 archivos, +14189/−482, una sola
migración nueva (`prisma/migrations/20261003100000_proceso_cubre_al_lote/migration.sql`).

Sólo lectura. Todo número de línea es de `d27068d5`. Donde digo «no aparece», al lado va la búsqueda de control que
sí encuentra algo.

**Desplazamiento de las citas del diseño (escrito sobre `85eab6da`), medido con `git show 85eab6da:<archivo>`:**

| el diseño cita | en `85eab6da` era | hoy (`d27068d5`) |
|---|---|---|
| `fermentation.ts:87,177` (stage_change) | 87, 177 (exacto) | **99, 189** |
| `drying.ts:72,287` | 72, 287 (exacto) | **76, 291** |
| `lotProcess.ts:159–166` (validación de receta en `abrirProceso`) | exacto | **181–188** |
| `lotProcess.ts:324` (`registrarIntervencion`) | — | **339** |
| `schema.prisma:4372` (`@@unique([recipeVersionId, phase])` de fases) | exacto | **4430** |
| `schema.prisma:4416` (`everyHours`) / `:4436` (unique de metas) | exactos | **4474 / 4494** |
| `schema.prisma:4238` (`LotProcessIntervention`) | — | **4269** |

---

## 1. Esquema: `LotProcess`, `FermentationRun`, `DryingRun` y vecinos

### 1.1 `LotProcess` — `prisma/schema.prisma:4121-4257`

Campos (sin comentarios):

```prisma
model LotProcess {
  id            String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotId         String @map("lot_id") @db.Uuid
  lot           Lot    @relation(fields: [lotId], references: [id])
  sequenceOrder Int    @map("sequence_order")
  processRecipeVersionId String?               @map("process_recipe_version_id") @db.Uuid
  processRecipeVersion   ProcessRecipeVersion? @relation(fields: [processRecipeVersionId], references: [id], onDelete: Restrict)
  intent String
  processGradeValueId String               @map("process_grade_value_id") @db.Uuid
  processGradeValue   VariableCatalogValue @relation("LotProcessGrade", fields: [processGradeValueId], references: [id])
  cherryStateValueId  String               @map("cherry_state_value_id") @db.Uuid
  cherryStateValue    VariableCatalogValue @relation("LotProcessCherryState", fields: [cherryStateValueId], references: [id])
  targetMoisturePct Decimal @map("target_moisture_pct") @db.Decimal(5, 2)
  closingMoistureMeasurementId String?      @map("closing_moisture_measurement_id") @db.Uuid
  closingMoistureMeasurement   Measurement? @relation("LotProcessClosingMoisture", fields: [closingMoistureMeasurementId], references: [id], onDelete: Restrict)
  closureKind LotProcessClosure? @map("closure_kind")
  dividedByTransformationId String?            @map("divided_by_transformation_id") @db.Uuid
  dividedByTransformation   LotTransformation? @relation("LotProcessDividedBy", fields: [dividedByTransformationId], references: [id], onDelete: Restrict)
  derivedFromLotProcessId String?      @map("derived_from_lot_process_id") @db.Uuid
  derivedFrom             LotProcess?  @relation("LotProcessDerivation", fields: [derivedFromLotProcessId], references: [id], onDelete: NoAction)
  derivations             LotProcess[] @relation("LotProcessDerivation")
  returnsFromThis  LotProcessReturn[] @relation("LotProcessReturnClosed")
  returnThatOpened LotProcessReturn?  @relation("LotProcessReturnContinuation")
  startedAt       DateTime        @map("started_at")
  endedAt         DateTime?       @map("ended_at")
  notes           String?
  provenanceClass ProvenanceClass @map("provenance_class")
  sourceReference String?         @map("source_reference")
  createdAt       DateTime        @default(now()) @map("created_at")
  createdBy       String?         @map("created_by") @db.Uuid
  creator         UserAccount?    @relation("LotProcessCreatedBy", fields: [createdBy], references: [id])
  interventions    LotProcessIntervention[]
  fermentationRuns FermentationRun[]
  dryingRuns       DryingRun[]
  @@unique([lotId, sequenceOrder])
  @@index([lotId]) @@index([processRecipeVersionId]) @@index([processGradeValueId]) @@index([cherryStateValueId])
  @@index([closingMoistureMeasurementId]) @@index([dividedByTransformationId]) @@index([derivedFromLotProcessId])
  @@map("lot_process") @@schema("traceability")
}
```

`enum LotProcessClosure { moisture divided }` — `schema.prisma:4097-4102`.

**Restricciones que sólo están en SQL** (`20261003100000_proceso_cubre_al_lote/migration.sql`):
- `lot_process_cierre_sii_tipo`: `CHECK (("ended_at" IS NULL) = ("closure_kind" IS NULL))`
- `lot_process_cierre_por_humedad_lleva_medicion`, `lot_process_division_sin_medicion_y_con_transformacion`,
  `lot_process_medicion_solo_si_por_humedad`, `lot_process_transformacion_solo_si_dividido`
- **Índice único parcial** `lot_process_un_abierto_por_lote ON lot_process(lot_id) WHERE ended_at IS NULL` (no está en
  `schema.prisma`; P2002 lo traduce `abrirProceso` a `process_already_open`, `lotProcess.ts:219-221`).
- Además, de migraciones anteriores: `lot_process_lot_id_fkey` **RESTRICT**, `lot_process_process_recipe_version_id_fkey`
  **RESTRICT** (`20260907080000_proceso_del_lote/migration.sql:68-69`).

**`processRecipeVersionId` de un proceso es inmutable en la práctica:** las únicas cuatro escrituras `lotProcess.update`
de `lib app scripts prisma` (búsqueda `lotProcess\.update|updateMany|upsert`; control: `lotProcess\.create` da 1) son
`procesoDelLinaje.ts:681` (cierre `divided`), `lotProcess.ts:254` (objetivo de humedad), `:302` (intención), `:449`
(cierre `moisture`). Ninguna toca la receta.

### 1.2 `FermentationRun` — `schema.prisma:4047-4093`

```prisma
model FermentationRun {
  id               String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  vesselNote       String?      @map("vessel_note")
  startedAt        DateTime     @map("started_at")
  endedAt          DateTime?    @map("ended_at")
  operatorPersonId String?      @map("operator_person_id") @db.Uuid
  operator         Person?      @relation("FermentationRunOperator", fields: [operatorPersonId], references: [id])
  inoculated       Boolean      @default(false)
  inoculationNote  String?      @map("inoculation_note")
  lotProcessId String?     @map("lot_process_id") @db.Uuid
  lotProcess   LotProcess? @relation(fields: [lotProcessId], references: [id])
  createdAt        DateTime     @default(now()) @map("created_at")
  createdBy        String?      @map("created_by") @db.Uuid
  creator          UserAccount? @relation("FermentationRunCreatedBy", fields: [createdBy], references: [id])
  processRecipeVersionId String?               @map("process_recipe_version_id") @db.Uuid
  processRecipeVersion   ProcessRecipeVersion? @relation(fields: [processRecipeVersionId], references: [id])
  interventions              FermentationIntervention[]
  measurements               Measurement[]
  transformations            LotTransformation[]
  assets                     Asset[]
  labourEntries              LabourEntry[]
  materialConsumptionEntries MaterialConsumptionEntry[]
  @@index([processRecipeVersionId])
  @@index([lotProcessId])
  vesselEquipmentId String?    @map("vessel_equipment_id") @db.Uuid
  vesselEquipment   Equipment? @relation("FermentationRunVessel", fields: [vesselEquipmentId], references: [id])
  @@map("fermentation_run") @@schema("traceability")
}
```

FKs en SQL: `fermentation_run_lot_process_id_fkey` **ON DELETE SET NULL** (`20260907080000_proceso_del_lote/migration.sql:78`);
`fermentation_run_process_recipe_version_id_fkey` **ON DELETE SET NULL** (`20260828131007_p2_process_targets/migration.sql:79`).

### 1.3 `DryingRun` — `schema.prisma:4562-4612`

```prisma
model DryingRun {
  samplingEvents SamplingEvent[]
  id           String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  method       String?
  locationId   String?      @map("location_id") @db.Uuid
  location     Location?    @relation(fields: [locationId], references: [id])
  layerDepthCm Decimal?     @map("layer_depth_cm") @db.Decimal(6, 2)
  dryingBedLocationId String?   @map("drying_bed_location_id") @db.Uuid
  dryingBedLocation   Location? @relation("DryingRunBed", fields: [dryingBedLocationId], references: [id])
  lotProcessId String?     @map("lot_process_id") @db.Uuid
  lotProcess   LotProcess? @relation(fields: [lotProcessId], references: [id])
  startedAt    DateTime     @map("started_at")
  endedAt      DateTime?    @map("ended_at")
  endedOutcome DryingOutcome? @map("ended_outcome")
  createdAt    DateTime     @default(now()) @map("created_at")
  createdBy    String?      @map("created_by") @db.Uuid
  creator      UserAccount? @relation("DryingRunCreatedBy", fields: [createdBy], references: [id])
  turningEvents              DryingTurnEvent[]
  trays                      DryingRunTray[]
  measurements               Measurement[]
  transformations            LotTransformation[]
  assets                     Asset[]
  labourEntries              LabourEntry[]
  materialConsumptionEntries MaterialConsumptionEntry[]
  @@index([locationId])
  @@index([lotProcessId])
  @@index([dryingBedLocationId])
  @@map("drying_run") @@schema("traceability")
}
```

**`DryingRun` NO tiene `processRecipeVersionId`** (sólo `FermentationRun` lo tiene). FK `drying_run_lot_process_id_fkey`
**ON DELETE SET NULL** (`20260907080000_proceso_del_lote/migration.sql:79`). `enum DryingOutcome { target_reached abandoned interrupted }` — `schema.prisma:4549-4560`.

### 1.4 Los otros dos registros que el §4.1 de la 2a usa

- `LotProcessIntervention` — `schema.prisma:4269-4289`: `id, lotProcessId (Cascade), catalogValueId (→ VariableCatalogValue), occurredAt, operatorPersonId?, notes?, createdAt, createdBy?`; índices `lotProcessId`, `catalogValueId`, `occurredAt`. FK `lot_process_intervention_lot_process_id_fkey` **ON DELETE CASCADE**.
- `FermentationIntervention` — `schema.prisma:4512-4526`: `id, fermentationRunId (→ FermentationRun, RESTRICT), interventionType FermentationInterventionType, occurredAt, notes?, createdAt, createdBy?`; índice `fermentationRunId`. Sin operario, sin `lotProcessId`.
- `enum FermentationInterventionType { inoculation agitation purge addition sample transfer termination other }` — `schema.prisma:4021-4032`.
- `Measurement` tiene `fermentationRunId?` y `dryingRunId?` con índice (`schema.prisma`, dentro de `model Measurement`): las lecturas ya se pueden colgar de una corrida (útil para `lecturasDeCierre`, §5.3 de la 2a).

**Control de «no hay pasos»:** `grep -niE "recipeStep|stepType|recipe_step|step_type" prisma/schema.prisma` → **0**; control
`grep -c lotProcessId prisma/schema.prisma` → **9**.

### 1.5 `LotTransformationType` — `schema.prisma:3458-3491`

`split merge blend stage_change sample_extraction loss disposal sale selection hulling honey_processing packaging`.
**No hay ningún tipo de despulpado ni de lavado.**

---

## 2. `lib/traceability/lotProcess.ts` (1077 líneas)

Importa de `procesoDelLinaje`: `abrirProcesoEnTx, bloquearLinaje, enMinusculas, TRANSACCION_DEL_LINAJE, exigeSinCorridasAbiertas,
exigeSinOtroProcesoAbierto, idsDeDescendencia, loteDividido, procesoParaUnaCorrida, procesoQueCubre, procesosParaEntrada,
type OrigenDelProceso` (`:21-34`). Reexporta `LotProcessError` desde `./errorDeProceso` (`:39-40`).

### 2.1 `abrirProceso` — `:175-224`

Entrada (`:97-122`):

```ts
export interface AbrirProcesoInput {
  lotId: string;
  /** Null = «Sin receta», que el reporte agrupa aparte (decisión de Daniel). */
  processRecipeVersionId?: string | null;
  intent: string;
  processGradeValueId: string;
  cherryStateValueId: string;
  targetMoisturePct: number;
  startedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}
```

Firma: `export async function abrirProceso(userAccountId: string, input: AbrirProcesoInput)`.

**Orden exacto de las comprobaciones** (importa para dónde poner `sin_receta`):
1. `:176` `loteGestionable` → `lot_not_found` o `requireLotAccess(…, "manage", [lot])` (lanza `TraceabilityAccessError`).
2. `:177` `exigePorcentaje(targetMoisturePct)` → `target_moisture_pct_out_of_range`.
3. `:179` intención vacía → `intent_required`.
4. **`:181-188` la receta, FUERA de la transacción y sin bloqueo:**
   ```ts
   if (input.processRecipeVersionId) {
     const version = await prisma.processRecipeVersion.findUnique({
       where: { id: input.processRecipeVersionId },
       include: { recipe: true },
     });
     if (!version) throw new LotProcessError("recipe_version_not_found");
     if (version.recipe.status === "archived") throw new LotProcessError("recipe_archived");
   }
   ```
   **No mira `version.status`** (un borrador entraría), **no mira la organización de la receta** (sí lo hace el tueste:
   `roasting.ts:148` y `:406`, `recipe_belongs_to_another_organization`), y no bloquea la fila de la versión.
5. `:193-196` grado y estado de cereza obligatorios y de su catálogo (`process_grade_required`, `cherry_state_required`,
   `…_not_found`, `…_wrong_catalog`).
6. `:200-215` transacción con `TRANSACCION_DEL_LINAJE`: `bloquearLinaje(tx, input.lotId)` y `abrirProcesoEnTx(...)`.
7. `:216-222` P2002 → `process_already_open`.

**Qué guarda de la receta:** sólo el puntero `processRecipeVersionId` (`procesoDelLinaje.ts:452`). Nada se copia de la
versión (ni fases, ni metas, ni horas). La auditoría `lot_process.open` lleva la fila entera en `after`.

### 2.2 `registrarIntervencion` (manejo del proceso) — `:339-381`

```ts
export interface RegistrarIntervencionInput {
  lotProcessId: string;
  /** De uno de los catálogos de `CATALOGOS_DE_INTERVENCION`. */
  catalogValueId: string;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}
export async function registrarIntervencion(userAccountId: string, input: RegistrarIntervencionInput)
```

Lee el proceso **fuera de transacción** (`:340`), autoriza con `loteGestionable(proceso.lotId)` (`manage` sobre el lote
DONDE VIVE el proceso), comprueba `endedAt` fuera de la transacción (`:344`), valida el valor contra
`CATALOGOS_DE_INTERVENCION` (`:70-94`: `condicion_oxigeno, manejo_temperatura, medio_lavado, metodo_inoculacion,
sustrato_anadido, recipiente, cereza_flotado, cereza_seleccion, levadura_cultivo`) y crea con su auditoría
`lot_process.record_intervention` en una transacción **sin bloqueo de linaje y sin `TRANSACCION_DEL_LINAJE`** (`:355-380`).

### 2.3 `cerrarProceso` — `:413-475`

`export interface CerrarProcesoInput { lotProcessId: string; endedAt: Date; closingMoistureMeasurementId: string; }`
Comprobaciones fuera: `process_not_found`, `loteGestionable`, `process_already_closed`, `ends_before_it_started`,
`measurement_not_found`, `measurement_is_not_moisture`, `medicion_anterior_al_proceso`. Dentro de la transacción
(`TRANSACCION_DEL_LINAJE`): `bloquearLinaje(tx, proceso.lotId)` (`:433`), relee el proceso, `idsDeDescendencia` para la
medición (`measurement_belongs_to_another_lot`), `exigeSinCorridasAbiertas` (`:447`), escribe `closureKind: "moisture"`
(`:452`), audita `lot_process.close`.

### 2.4 `devolverASecado` — `:590-657` (qué copia a la continuación)

```ts
export interface DevolverASecadoInput { lotId: string; motivoValueId: string; nota?: string | null; ocurrioEn: Date; }
```

La continuación se abre con `abrirProcesoEnTx` **copiando del cerrado** (`:620-632`):

```ts
const continuacion = await abrirProcesoEnTx(tx, userAccountId, {
  lotId: input.lotId,
  processRecipeVersionId: cerrado.processRecipeVersionId,
  intent: cerrado.intent,
  processGradeValueId: cerrado.processGradeValueId,
  cherryStateValueId: cerrado.cherryStateValueId,
  targetMoisturePct: cerrado.targetMoisturePct,
  startedAt: input.ocurrioEn,
  notes: cerrado.notes,
  provenanceClass: cerrado.provenanceClass,
  sourceReference: cerrado.sourceReference,
  derivedFromLotProcessId: cerrado.id,
});
```

**Sí copia la receta (la versión).** No revalida la versión (ni `status`, ni archivada): pasa por el núcleo, no por
`abrirProceso`. Después crea `LotProcessReturn` (`:633-643`) y audita `lot_process.return_to_drying`.
Comprobación previa compartida con la pantalla: `procesoQueDevolver` (`:550-560`, no exportada).

### 2.5 Predicados que usan las pantallas

- `puedeAbrirProceso(userAccountId, lotId)` — `:929-943`; motivos `MOTIVOS_PARA_NO_ABRIR` `:912-921`.
- `puedeEmpezarCorrida(userAccountId, lotId)` — `:1010-1024`: llama a `procesoParaUnaCorrida(prisma, lot.id)` sin bloquear;
  motivos `MOTIVOS_PARA_NO_EMPEZAR` `:989-997` (`lote_dividido, lote_en_bodega, corrida_ya_abierta, lote_consumido,
  lote_mezclado, sin_proceso_abierto, lineage_too_deep`).
- `puedeDevolverASecado` — `:1058-1077`; `puedeGestionarProceso(userAccountId, lotProcessId)` — `:971-981`.
- `coberturaDelLote(userAccountId, lotId)` — `:821-899`: lo que pintan la ficha, la página del proceso y
  `fermentation/new`. Cada proceso de la cadena sale como `{ oculto: false, ...fila, etiqueta, recetaConVersion,
  humedadDeCierre, diferenciaContraObjetivo, origen, profundidad }` o `{ oculto: true, abierto, bloqueadoAlEntrar }`.
  La fila trae `INCLUIR_PARA_PANTALLA` (`:789-798`): `processRecipeVersion.recipe`, grado, cereza, medición de cierre,
  `interventions` (con `catalogValue`, `operator`), `fermentationRuns`, `dryingRuns` (ordenadas por `startedAt`), `lot`.
- `opcionesParaProceso(userAccountId, lotId)` — `:714-784`: vocabulario de intervenciones, humedades, grados, estados de
  cereza y motivos de devolución.

---

## 3. `lib/traceability/procesoDelLinaje.ts` (720 líneas)

### 3.1 La forma exacta de la cobertura — `:32-56`

```ts
export type OrigenDelProceso = "original" | "parte_de_division" | "continuacion";

export interface ProcesoEnCadena {
  readonly id: string;
  readonly lotId: string;
  /** Generaciones entre el lote consultado y el lote donde vive este proceso. 0 = el propio lote. */
  readonly profundidad: number;
  readonly sequenceOrder: number;
  readonly endedAt: Date | null;
  readonly closureKind: "moisture" | "divided" | null;
  readonly derivedFromLotProcessId: string | null;
  readonly origen: OrigenDelProceso;
}

export interface Composicion {
  readonly procesos: readonly ProcesoEnCadena[];
  readonly ramaSinProceso: boolean;
}

export type Cobertura =
  | { readonly estado: "sin_proceso"; readonly vigente: null; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: null }
  | { readonly estado: "abierto" | "cerrado"; readonly vigente: ProcesoEnCadena; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: null }
  | { readonly estado: "mezcla"; readonly vigente: null; readonly cadena: readonly ProcesoEnCadena[]; readonly composicion: Composicion };
```

**Lo que NO trae `ProcesoEnCadena`:** ni `processRecipeVersionId` ni `startedAt`. El §4.3 de la 2a («los procesos de la
cadena que comparten la versión del vigente, en orden de inicio») necesita una consulta más por ids:
`tx.lotProcess.findMany({ where: { id: { in: cadena.map((p) => p.id) } }, select: { id: true, processRecipeVersionId: true, startedAt: true } })`
— el guardia `proceso-por-el-resolvedor` la permite («lectura por una lista de ids», en su lista `FORMAS_QUE_NO_MARCA`).

`origen` se calcula en `enCadena` (`:78-89`):

```ts
origen: p.derivedFromLotProcessId === null ? "original" : p.returnThatOpened ? "continuacion" : "parte_de_division",
```

### 3.2 `procesoQueCubre(tx, lotId): Promise<Cobertura>` — `:232-276`

Sube por niveles; en cada nivel `lotProcess.findMany({ where: { lotId: { in: frontera } }, orderBy: { sequenceOrder: "desc" }, select: SELECCION })`
y se queda con el primero de cada lote (`:241-251`). Ramas distintas o una raíz sin proceso → `mezcla` con `cadena: []`.
Con un solo vigente: `cadena = [vigente, ...(await historiaArriba(tx, vigente))]` (`:274`).

**Orden de la `cadena`** (`historiaArriba`, `:182-215`): primero el vigente; luego los procesos ANTERIORES del mismo lote
(`sequenceOrder < vigente.sequenceOrder`, desc); luego, nivel por nivel hacia arriba, todos los procesos de los lotes
de ese nivel (desc por `sequenceOrder`). No está ordenada por `startedAt`. Lanza `lineage_too_deep` al pasar
`TOPE_DE_LINAJE` (64) también en la historia.

Casos que importan al §4.3:
- **División** (R6): la parte `PA` tiene `derivedFromLotProcessId = P0.id` (`dividirProcesoEnTx`, `:715`); `P0` vive en un
  ancestro y aparece en la cadena (lo afirma `divisionBajoProceso.test.ts:242-243`).
- **Devolución** (R7): la continuación tiene `derivedFromLotProcessId = cerrado.id` y una `LotProcessReturn`, así que
  `origen = "continuacion"`.
- **Reproceso** (R2 lo permite sobre un proceso cerrado): `abrirProceso` nunca pasa `derivedFromLotProcessId`
  (`:203-214`; el núcleo pone `input.derivedFromLotProcessId ?? null`, `:461`), así que **un reproceso es `origen: "original"`
  aunque lleve la MISMA versión** que el proceso anterior de la cadena. Ver Sorpresa 2.

### 3.3 Bloqueo y transacción

```ts
export const TRANSACCION_DEL_LINAJE = { timeout: 60_000, maxWait: 10_000 } as const;   // :296
export async function bloquearLinaje(tx: Prisma.TransactionClient, lotId: string): Promise<void>      // :298
export async function bloquearLinajes(tx: Prisma.TransactionClient, lotIds: readonly string[]): Promise<void> // :302
```

`bloquearLinajes` hace `SELECT id FROM traceability.lot WHERE id = ${id}::uuid FOR UPDATE` sobre el lote y todos sus
ancestros, en `ordenDeBloqueo` (`:309-311`).

**Quién usa `TRANSACCION_DEL_LINAJE`** (búsqueda en `lib app`): `lots.ts:524` (recordTransformation), `fermentation.ts:129`
(start), `drying.ts:106` (start), `lotProcess.ts:215` (abrir), `:474` (cerrar), `:656` (devolver), `storage.ts:40`.
**No la usan** `endFermentationRun` (`fermentation.ts:181-272`, transacción con el tope por defecto de 5 s), `endDryingRun`
(`drying.ts:388-402`), `registrarIntervencion` (`lotProcess.ts:355`), ni `recordFermentationIntervention` (sin transacción).

### 3.4 `abrirProcesoEnTx` y su entrada — `:421-477`

```ts
export interface NucleoDeApertura {
  lotId: string;
  processRecipeVersionId: string | null;
  intent: string;
  processGradeValueId: string;
  cherryStateValueId: string;
  targetMoisturePct: number | Prisma.Decimal;
  startedAt: Date;
  notes: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference: string | null;
  /** R6.4 y R7: de qué proceso viene una parte de una división o una continuación. */
  derivedFromLotProcessId?: string | null;
}
export async function abrirProcesoEnTx(tx: Prisma.TransactionClient, userAccountId: string, input: NucleoDeApertura)
```

Hace `exigeSinOtroProcesoAbierto(tx, input.lotId)` (R2), calcula `sequenceOrder`, crea y audita `lot_process.open`. Lo
llaman los TRES caminos que abren un proceso: `abrirProceso`, `devolverASecado` y `dividirProcesoEnTx`. **No valida la
receta** — por eso el §5.1 de la 2a pone `sin_receta` en `abrirProceso` y no aquí (si se pusiera aquí, la división de un
proceso viejo sin receta caería).

### 3.5 `dividirProcesoEnTx` — `:648-720` (qué copia a cada parte)

```ts
export interface ArgumentosDeDivision {
  procesoId: string; transformationId: string; occurredAt: Date; loteDividido: string;
  cantidadDeEntrada: number | null; partes: readonly string[]; organizationId: string;
}
export async function dividirProcesoEnTx(tx: Prisma.TransactionClient, userAccountId: string, args: ArgumentosDeDivision)
```

Cierra el proceso como `divided` (`:681-684`) y para cada parte (`:702-718`):

```ts
await abrirProcesoEnTx(tx, userAccountId, {
  lotId: parte,
  processRecipeVersionId: proceso.processRecipeVersionId,
  intent: proceso.intent,
  processGradeValueId: proceso.processGradeValueId,
  cherryStateValueId: proceso.cherryStateValueId,
  targetMoisturePct: proceso.targetMoisturePct,
  startedAt: args.occurredAt,
  notes: proceso.notes,
  provenanceClass: proceso.provenanceClass,
  sourceReference: proceso.sourceReference,
  derivedFromLotProcessId: proceso.id,
}),
```

**Copia la receta.** La llaman desde `lots.ts:486` dentro de `recordTransformation` (antes, `antesDeTransformar` en
`lots.ts:340`, `procesoDelLinaje.ts:595-622`).

Comentario de la casa en `:645-647`, que obliga a cualquier función nueva que audite con el `tx` que recibe:
«La firma va en UNA línea y con el tipo nombrado: `audit-atomico` reconoce así una función que audita con el `tx` que
recibe (una firma partida en varias líneas, o con un tipo literal `{ … }`, no la ve).»

### 3.6 `procesoAbiertoParaCorrida` / `procesoParaUnaCorrida` — `:487-548`

```ts
export async function procesoAbiertoParaCorrida(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ id: string; processRecipeVersionId: string | null }>      // :487-495: bloquearLinaje + procesoParaUnaCorrida

export async function procesoParaUnaCorrida(
  tx: Prisma.TransactionClient,
  lotId: string,
): Promise<{ id: string; processRecipeVersionId: string | null }>      // :515-548
```

Orden de rechazos de `procesoParaUnaCorrida`: `lote_dividido` → `lote_en_bodega` → `corrida_ya_abierta` (entrada de una
transformación con fermentación o secado sin `endedAt`) → `lote_consumido` (`FULL_CONSUMPTION_TYPES` con salida, o
`CONSUMING_WITHOUT_OUTPUT`) → `lote_mezclado` → `sin_proceso_abierto`. Devuelve
`tx.lotProcess.findUniqueOrThrow({ where: { id: cobertura.vigente.id }, select: { id: true, processRecipeVersionId: true } })`.
**Es el sitio natural para tomar la versión con la que validar un `recipeStepId` de corrida** (§4.2 de la 2a): ya está
dentro de la transacción y con el linaje bloqueado.

`exigeSinCorridasAbiertas(tx, proceso: { id; lotId })` — `:559-574`: cuenta fermentaciones y secados abiertos unidos por
`lotProcessId` o cuya transformación tenga de entrada un lote cubierto (el del proceso y su descendencia).

---

## 4. Las corridas: `fermentation.ts` (275 líneas) y `drying.ts` (409 líneas)

### 4.1 `startFermentationRun` — `fermentation.ts:69-132`

```ts
export interface StartFermentationRunInput {
  lotId: string;
  vesselNote?: string | null;
  startedAt: Date;
  operatorPersonId?: string | null;
  inoculated?: boolean;
  inoculationNote?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  processRecipeVersionId?: string | null;   // R4: si viene, tiene que ser la del proceso
}
export async function startFermentationRun(userAccountId: string, input: StartFermentationRunInput)
```

- Fuera de la transacción: `lot_not_found`, `requireLotAccess(…, "manage", [lote de la corrida])`, `exigirPersonaPermitida`.
- Transacción con `TRANSACCION_DEL_LINAJE` (`:75-129`):
  - `:79` `const proceso = await procesoAbiertoParaCorrida(tx, input.lotId);`
  - `:81-83` R4: `if (input.processRecipeVersionId && input.processRecipeVersionId !== proceso.processRecipeVersionId) throw new LotProcessError("receta_distinta_del_proceso");`
  - `:84-95` crea la corrida con **`processRecipeVersionId: proceso.processRecipeVersionId` (`:90`)** y **`lotProcessId: proceso.id` (`:91`)**.
  - `:97-111` crea la `LotTransformation` **`transformationType: "stage_change"` (`:99`)**, `fermentationRunId: run.id`, una entrada (el lote) y **cero salidas**.
  - `:116-126` audita `fermentation_run.start` con `after: run`.
- Devuelve `{ run, transformation }`.

### 4.2 `endFermentationRun` — `fermentation.ts:170-275`

`EndFermentationRunInput` (`:156-168`): `fermentationRunId, endedAt, outputLotCode, outputLotType: LotType, quantity?, unit?,
operatorPersonId?, notes?, provenanceClass, sourceReference?`. Comprobaciones fuera: `fermentation_run_not_found`,
`fermentation_run_already_ended`, permiso `manage` sobre el lote de entrada (`resolveRunSourceLot`, `:37-46`).
Transacción **sin opciones y sin bloqueo de linaje** (`:181-272`): `endedAt` (`:182-185`), **segunda `stage_change` (`:187-201`, tipo en `:189`)** con el mismo lote de entrada, lote de salida nuevo (`:203-212`) y su `LotTransformationOutput`, `QuantityEvent` de salida, `settleMassBalance` (consume el lote de entrada), audita `fermentation_run.end`.

### 4.3 `recordFermentationIntervention` — `fermentation.ts:134-154`

```ts
export interface RecordFermentationInterventionInput {
  fermentationRunId: string;
  interventionType: "inoculation" | "agitation" | "purge" | "addition" | "sample" | "transfer" | "termination" | "other";
  occurredAt: Date;
  notes?: string | null;
}
```

Sólo autoriza por el lote de entrada y hace `prisma.fermentationIntervention.create(...)`. **Sin transacción, sin evento de
auditoría, sin comprobar que la corrida siga abierta, sin mirar el proceso.**

### 4.4 `startDryingRun` — `drying.ts:54-109`

```ts
export interface StartDryingRunInput {
  lotId: string;
  method?: string | null;
  locationId?: string | null; // the drying site/bed
  layerDepthCm?: number | null;
  startedAt: Date;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}
export async function startDryingRun(userAccountId: string, input: StartDryingRunInput)
```

Transacción con `TRANSACCION_DEL_LINAJE` (`:60-106`): `:62` `procesoAbiertoParaCorrida`; `:63-72` crea la corrida con
**sólo `lotProcessId: proceso.id` (`:69`)** — no hay columna de versión; `:74-88` **`stage_change` (`:76`)** sin salidas;
`:93-103` audita `drying_run.start`. **No acepta `processRecipeVersionId`.**

### 4.5 Fin del secado — tres puertas

- `cerrarCorridaEnTransaccion(tx, userAccountId, dryingRunId, sourceLot, input: EndDryingRunInput)` — `drying.ts:272-369`:
  `endedAt` + `endedOutcome` (`:284-287`), **`stage_change` (`:289-303`, tipo en `:291`)**, lote de salida (sólo
  `parchment` o `dry_cherry`, `DRYING_OUTPUT_LOT_TYPES` `:250`), `settleMassBalance`. No audita (lo hace cada llamador).
- `endDryingRun` — `drying.ts:371-409`: rechaza con `bandejas_sin_bajar` si hay bandejas cargadas (`:383`), transacción sin
  opciones (`:388-402`), audita `drying_run.end`.
- **`bajarBandeja`** — `lib/traceability/bandejasDelSecado.ts:260` (firma `input: { dryingRunTrayId: string; hasta: Date; cierre?: CierreDelSecado | null }`, `:262`): al bajar la última bandeja cierra la corrida con `cerrarCorridaEnTransaccion` (`:300`) y audita `drying_run.end` en su transacción.

`EndDryingRunInput` (`drying.ts:229-248`) lleva `endedOutcome?: DryingOutcome | null`.

### 4.6 Quién crea `stage_change` (afirmación 4)

`grep -rn 'transformationType: "stage_change"' lib app scripts prisma --include='*.ts' --include='*.tsx' | grep -v /tests/`
(control: la misma búsqueda con `"hulling"` encuentra `lib/traceability/trilla.ts:59`):

| sitio | qué es |
|---|---|
| `fermentation.ts:99` / `:189` | creación al empezar / al terminar |
| `fermentation.ts:246` | argumento de `settleMassBalance`, no una creación |
| `drying.ts:76` / `:291` | creación al empezar / al terminar (la segunda también para `bajarBandeja`) |
| `drying.ts:346` | argumento de `settleMassBalance` |
| `roasting.ts:179` | **una sola** `stage_change` por tueste (no hay empezar/terminar); `:244` es el `settleMassBalance` |
| `lots.ts:842` | un filtro `where`, no una creación |
| `app/actions/traceability.ts:1044` | `recordStageChangeFormAction` — una `stage_change` genérica SIN corrida vía `recordTransformation`. **Ninguna pantalla la usa**: en todo el árbol aparece 2 veces (su definición y un comentario de `tests/traceability/mensajesDeProceso.test.ts:167`); control `endDryingFormAction`: 6 |
| `scripts/import-cafelino-pe.ts:390` | importador histórico: encadena lotes por `stage_change` |

**Despulpado y lavado:** `LotTransformationType` no tiene tipo propio (§1.5) y, además, **ninguno de los 9 catálogos de
`CATALOGOS_DE_INTERVENCION` tiene un valor de despulpado, desmucilaginado ni lavado**. Medido con `node -e` sobre
`lib/research/catalogs.ts` (las nueve claves encontradas, ninguna vacía): `condicion_oxigeno` 4, `manejo_temperatura` 5,
`medio_lavado` 4 (`agua_limpia | mosto_propio | mosto_de_otro_lote | ninguno_natural`), `metodo_inoculacion` 3,
`sustrato_anadido` 3, `recipiente` 6, `cereza_flotado` 7, `cereza_seleccion` 5, `levadura_cultivo` 7. El comentario de
`registrarIntervencion` (`lotProcess.ts:330-332`) nombra «despulpado» como ejemplo, pero hoy no hay valor con el que
registrarlo.

---

## 5. Pantallas y acciones

### 5.1 `app/lots/[id]/process/page.tsx` (273 líneas) — abrir un proceso

- `:66` `puedeGestionar = await puedeGestionarLote(user, lot)`.
- `:71-104` en un `try`: `coberturaDelLote`, `opcionesParaProceso`, `puedeAbrirProceso` (sólo si no hay abierto y
  `puedeGestionar`), `puedeDevolverASecado`, `puedeGestionarProceso(vigente.id)`. Un `LotProcessError` se pinta (`:90-101`).
- **`:109-112` la lista de recetas, FUERA del `try` y sin mirar `puedeGestionar`:**
  ```ts
  const recetas = (await listRecipeVersionsForLot(user.userAccountId, lot.id)).map((v) => ({
    id: v.id,
    label: `${v.recipe.name} · v${v.version} · ${v.targets.length} ${t("targetsCountSuffix")}`,
  }));
  ```
- `:159-216` pinta la cadena (receta con `p.processRecipeVersion?.recipe.name ?? t("processNoRecipeLabel")`, origen,
  intervenciones, «N fermentaciones / M secados» con `processRunsAttached`).
- `:219-241` formularios del proceso abierto (intervención, cierre, intención, objetivo) con `puedeGestionarElAbierto`.
- `:257-270` «Abrir proceso»: `AbrirProcesoForm lotId recetas grados estadosDeCereza` si `puede.puede`.

**Cómo se elige la receta hoy:** `listRecipeVersionsForLot` — `lib/traceability/processTargets.ts:194-226`. Pide `manage`
sobre el lote (`:197`), filtra `status: "approved"` de la VERSIÓN y `recipe: { OR: [{ organizationId: lot.organizationId }, { organizationId: null }] }`
(`:203-208`), y deja **la versión más nueva de cada receta** (`:221-225`, ADR-102). No filtra `recipe.status` (una
receta archivada con versión aprobada se ofrecería; el servicio la rechazaría con `recipe_archived`).

**Formulario** — `app/components/traceability/ProcesoDelLote.tsx:31-127` (`AbrirProcesoForm`). Campos que manda:
`lotId` (oculto), `intent` (textarea, `required`), `targetMoisturePct` (`required`), `processGradeValueId` (select
`required`), `cherryStateValueId` (select `required`), **`processRecipeVersionId` (select, primera opción `""` =
`t("processNoRecipe")`, `:99-110`)**, `notes`. Sin fecha.

**Acción** — `abrirProcesoAction`, `app/actions/traceability.ts:2454-2486`:
```ts
await abrirProceso(user.userAccountId, {
  lotId,
  intent: String(formData.get("intent") ?? ""),
  targetMoisturePct: Number(formData.get("targetMoisturePct")),
  processRecipeVersionId: emptyToNull(formData.get("processRecipeVersionId")),
  processGradeValueId: String(formData.get("processGradeValueId") ?? ""),
  cherryStateValueId: String(formData.get("cherryStateValueId") ?? ""),
  notes: emptyToNull(formData.get("notes")),
  startedAt: new Date(),
  provenanceClass: "original_record",
});
```
Errores por `friendlyError(t, error)`; `redirect` fuera del `try` (`:2484-2485`).

Intervención: `IntervencionForm` (`ProcesoDelLote.tsx:130-175`; manda `lotProcessId`, `lotId`, `catalogValueId`, `notes`)
→ `registrarIntervencionAction` (`traceability.ts:2536-2558`, `occurredAt: new Date()`).

### 5.2 `app/lots/[id]/fermentation/new/page.tsx` (71 líneas)

- `:40` `puedeEmpezarCorrida`; si puede, `coberturaDelLote` y `recetaDelProceso = cobertura.vigente?.oculto ? t("processRecipeHidden") : (cobertura.vigente?.recetaConVersion ?? null)` (`:42-44`).
- `:45-50` sin proceso abierto → frase de `puedeAbrirProceso`; otro motivo → `t(\`error_proceso_${motivo}\`)`.
- `:67` `<FermentationForm lotId={lot.id} recetaDelProceso={recetaDelProceso} />`.

`app/components/traceability/FermentationForm.tsx` (50 líneas): la receta sólo se LEE (`:19-21`); campos `lotId`,
`vesselNote`, `quantity`, `unit`, `inoculated`, `inoculationNote`. **Ningún campo de receta ni de paso.**

`startFermentationAction` — `traceability.ts:545-572`: manda `lotId, vesselNote, startedAt: new Date(), inoculated,
inoculationNote, quantity, unit, provenanceClass: "original_record"`. **No manda `processRecipeVersionId`** (R4).

### 5.3 `app/lots/[id]/drying/new/page.tsx` (58 líneas)

`:31` `puedeEmpezarCorrida`; mismas frases; `:54` `<DryingForm lotId={lot.id} />`. `DryingForm.tsx` (39 líneas): campos
`lotId, method` (texto libre, placeholder `raised_bed, patio, mechanical`), `layerDepthCm, quantity, unit`.
`startDryingAction` — `traceability.ts:687-713`: `lotId, method, layerDepthCm, startedAt: new Date(), quantity, unit,
provenanceClass: "original_record"`.

### 5.4 Terminar corridas e intervenciones de fermentación (ficha del lote)

`app/lots/[id]/page.tsx`: corrida activa = `fermentationRuns.find((r) => r.endedAt === null)` (`:266-267`); formularios en
`:1166` (`recordFermentationInterventionFormAction`, select de `FERMENTATION_INTERVENTION_TYPES`), `:1180`
(`endFermentationFormAction`), `:1276` (`recordDryingTurnFormAction`), `:1293` (`endDryingFormAction`). Los enlaces a
`/fermentation/new` y `/drying/new` en `:474-475`, decididos por `puedeEmpezarCorrida` (`:348`).

Acciones: `recordFermentationInterventionFormAction` `traceability.ts:574-587`, `endFermentationFormAction` `:589-605`,
`endDryingFormAction` `:769-800`. **Ninguna manda `endedOutcome`** (`grep endedOutcome app` → sólo una lectura en
`app/lots/[id]/page.tsx:319`; control en `lib/`: 5 archivos).

### 5.5 Errores

`lib/traceability/errorDeProceso.ts`: `export class LotProcessError extends Error {}` (`:11`), la lista
`CODIGOS_DE_PROCESO_TRADUCIDOS` (`:17-45`) y `claveDeErrorDeProceso(error)` (`:56-61`) que da
`error_proceso_<código>`. `friendlyError` la consulta en `traceability.ts:195` antes de la rama genérica
(`:201`, `t("error_lot_process", { detail })`). Lo vigila `tests/traceability/mensajesDeProceso.test.ts`
(«cada código tiene `Traceability.error_proceso_<código>` en los dos idiomas», `:105`). Un código nuevo de la 2a
(`sin_receta`, `paso_de_otra_receta`, `paso_no_corresponde`, `desviacion_sin_motivo`…) necesita: entrada en esa lista,
claves es/en, y el control de `:101` («trae todos los códigos que el diseño nombra»).

---

## 6. Pruebas que hoy cubren esto

Todas en el grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt` (`:145` drying, `:161` e2e, `:170` fermentation,
`:177-182` lotProcess, procesoDelLinaje, aperturaDeProceso, corridaConProceso, divisionBajoProceso, bodegaConProceso).
`mensajesDeProceso.test.ts` no está en la lista: corre en el carril hermético.

### 6.1 Receta y versión — las que tocan lo que la 2a cambia

| archivo:línea | `it` | qué fija |
|---|---|---|
| `lotProcess.test.ts:239` | «numera la secuencia solo, empezando en 1» | abre CON receta (`recetaVersionId`) |
| `lotProcess.test.ts:263` | «rechaza una receta que no existe» | `recipe_version_not_found` |
| **`lotProcess.test.ts:269`** | **«se puede abrir SIN receta, y el listado lo agrupa como «Sin receta»»** | **contradice el §5.1 de la 2a** |
| `lotProcess.test.ts:595` | «copia receta, intención, objetivo, grado, estado de la cereza, notas, procedencia y referencia» | la continuación de `devolverASecado` copia la versión |
| `divisionBajoProceso.test.ts:193` | «cierra el padre como dividido y da a cada parte su proceso, unido al anterior» | cada parte copia `processRecipeVersionId` (`:222`) y la cadena de la parte contiene al padre (`:242-243`) |
| `corridaConProceso.test.ts:622` | «hereda la versión del proceso» | `run.processRecipeVersionId === recetaVersionId` |
| `corridaConProceso.test.ts:629` | «pedir explícitamente la MISMA versión del proceso empieza… (M5)» | lado que acepta de R4 |
| `corridaConProceso.test.ts:642` | «rechaza otra versión distinta de la del proceso» | `receta_distinta_del_proceso` |
| `corridaConProceso.test.ts:650` | «un proceso «Sin receta» rechaza una receta pedida a mano…» | depende de poder abrir sin receta |
| `corridaConProceso.test.ts:659` | «en un proceso «Sin receta» la corrida tampoco lleva receta» | ídem |
| `corridaConProceso.test.ts:262` / `:272` | «la fermentación queda unida al proceso, sin evento de auditoría nuevo» / «empezar una corrida no escribe ningún evento de auditoría nuevo…» | la 2a no puede añadir eventos al empezar |
| `bodegaConProceso.test.ts:1211` | «el pergamino enseña el proceso de la cereza: … su receta con versión…» | `recetaConVersion` |
| `bodegaConProceso.test.ts:1230` | «un reproceso enseña la cadena entera, del más cercano al más lejano, y un proceso sin receta no inventa versión» | orden de la cadena `[p2, p1]` (en bodegaConProceso) |
| `procesoDelLinaje.test.ts:123` | «reproceso: el verde tiene P2 vigente y P1 en la cadena» | orden de la cadena |
| `reporteDeProceso.test.ts:258` | (proceso «desnudo» SIN receta en el `beforeAll`) | depende de poder abrir sin receta |
| `fermentation.test.ts:94` / `drying.test.ts:109` | «runs the whole cycle and produces the expected stage-change transformations» | la `stage_change` de inicio tiene 0 salidas; auditoría exacta `["fermentation_run.start", "fermentation_run.end"]` |

`recipe_archived` **no tiene ninguna prueba** (búsqueda en `tests lib app messages`: sólo `lotProcess.ts:187`; control
`recipe_version_not_found`: 4 sitios, uno en pruebas).

### 6.2 Resto, por archivo (nombres, para no volver a buscarlos)

- `aperturaDeProceso.test.ts` (9 `it`, `:77-194`): R2 en el linaje — hijo/padre, reproceso bajo cerrado, dividido/bodega/
  mezcla/miel con su código, `descendiente_en_bodega`, >12 generaciones, dos aperturas a la vez, ancestro abierto sobre
  cerrado, evento `lot_process.open`. **Ninguna usa receta**: todas abren con `abrirProcesoDePrueba` sin ella.
- `corridaConProceso.test.ts` (42): R3 (`:194-398`), bloqueo del linaje por puerta (`:411`, `:450`), R7 una sola línea viva
  (`:491-600`), R4 (`:622-659`), R5 (`:675-882`), mayúsculas (`:897`, `:907`), limpieza (`:945`), tablero (`:972`, `:1013`),
  formularios por el lote dueño (`:1058`). Recetas creadas crudas con `status: "approved"` (`:155-157`).
- `lotProcess.test.ts` (45): abrir (`:239-283`), objetivo e intención (`:291-331`), intervenciones (`:338`, `:352`), cerrar
  (`:365-471`), bodega y devolución (`:488-564`), herencia de la continuación (`:595`), motivos (`:645`), grado y cereza
  (`:661-700`), CHECK de `lot_process` (`:738-851`).
- `divisionBajoProceso.test.ts` (25): R6 (`:193-565`), R6.6 lo anterior a la división (`:614-649`), reporte (`:670`, `:702`).
- `bodegaConProceso.test.ts` (44): compuerta (`:227-494`), devolución (`:545-795`), muestra verde (`:863-945`), predicados
  de pantalla (`:1011-1164`), `coberturaDelLote` (`:1211-1305`).
- `procesoDelLinaje.test.ts` (19): resolvedor (`:93-279`).

### 6.3 El ayudante de las pruebas — `tests/helpers/procesoDePrueba.ts`

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
```

Usos (`grep -rc "abrirProcesoDePrueba(" tests`, sin la definición): **147 en 14 archivos** — corridaConProceso 44,
bodegaConProceso 38, divisionBajoProceso 22, aperturaDeProceso 17, measurements 7, drying 6, fermentation 3, samples 3,
operations 2, reports/e2e/venta-temprana/bandejasDelSecado/massBalance 1 cada uno. **Sólo 7 pasan receta.**
`borrarProcesosDeLotesDonde(lot)` (`:55-91`) borra auditoría, devoluciones y procesos; **no borra recetas** (la receta va
después de los procesos: `process_recipe_version_id` es RESTRICT).

---

## 7. Afirmaciones del §1 que me tocaban

**(3) «`FermentationRun` lleva `processRecipeVersionId` y `lotProcessId`; no dice qué paso cumple.» — CIERTA.**
`schema.prisma:4059` (`lotProcessId`) y `:4072` (`processRecipeVersionId`); cero columnas de paso en todo el esquema
(búsqueda `recipeStep|stepType|recipe_step|step_type` → 0; control `lotProcessId` → 9). Matiz que el diseño no dice:
desde la Parte 1 (R4) la versión de la corrida es SIEMPRE la del proceso (`fermentation.ts:81-83, :90`), así que en una
corrida nueva es redundante con `lotProcess.processRecipeVersionId`; y **`DryingRun` no tiene `processRecipeVersionId`**
(`schema.prisma:4562-4612`), sólo `lotProcessId`.

**(4) «Empezar y terminar una corrida crea `stage_change` (`fermentation.ts:87,177`; `drying.ts:72,287`; también los
tuestes). Ningún camino registra el despulpado o el lavado como transformación.» — PARCIAL.**
El fondo es cierto: `fermentation.ts:99` y `:189`, `drying.ts:76` y `:291` (esta última también la usa `bajarBandeja`,
`bandejasDelSecado.ts:300`); `LotTransformationType` no tiene despulpado ni lavado (`schema.prisma:3458-3491`). Pero:
(a) las cuatro líneas citadas están desplazadas (+12 y +4; medidas con `git show 85eab6da:`); (b) el tueste crea **una
sola** `stage_change` por sesión (`roasting.ts:179`), no una al empezar y otra al terminar; (c) existe una `stage_change`
sin corrida, `recordStageChangeFormAction` (`app/actions/traceability.ts:1035-1062`), hoy sin ninguna pantalla que la
llame; (d) **tampoco como intervención**: ningún catálogo de `CATALOGOS_DE_INTERVENCION` tiene valor de despulpado,
desmucilaginado ni lavado (§4.6).

**Extra, de mi lente (§1, segundo punto): «`abrirProceso` sólo rechaza una receta archivada (`lotProcess.ts:159–166`)» —
CIERTA**, hoy en `:181-188`. Y no comprueba ni el estado de la versión, ni la organización de la receta, ni bloquea la fila.

---

## 8. Sorpresas — lo que el diseño no prevé

1. **La receta obligatoria (§5.1) rompe unas 160 aperturas de prueba y la semilla de demo.** `abrirProcesoDePrueba` abre sin
   receta por defecto (147 usos, 140 sin receta); además, sin receta: `lotProcess.test.ts` (14 de sus 17 llamadas a
   `abrirProceso`, con el ayudante `abrir`, `:223-236`, que no la pone; las otras tres pasan `recetaVersionId`
   —`:240`, `:610`— o un id falso a propósito —`:265`—), `bodegaConProceso.test.ts:98` (`abrirDirecto`, `processRecipeVersionId: null`),
   `reporteDeProceso.test.ts:258` (el «desnudo») y **`prisma/seed.ts:889`** (la demo abre sin receta). La Parte 1 ya avisó
   que CI siembra la demo antes del carril con base: **si la semilla falla, el carril cae entero**. Hay que decidir:
   (a) el ayudante crea o recibe una versión aprobada por organización (o compartida, `organizationId: null`) y la
   limpieza la borra DESPUÉS de los procesos (RESTRICT); (b) los «Sin receta» que hay que seguir probando
   (`corridaConProceso.test.ts:650`, `:659`, `bodegaConProceso.test.ts:1230`, el reporte) pasan a insertarse crudos con
   `prisma.lotProcess.create`, que es lo que la transición R9 deja existir; (c) `lotProcess.test.ts:269` se invierte.
2. **El orden de las comprobaciones importa.** Las pruebas de grado y cereza (`lotProcess.test.ts:682`, `:688`, `:694`,
   `:700`) abren SIN receta y esperan su código. Si `sin_receta` se pone donde hoy está la receta (`:181`, antes del grado),
   cambian de código. Hay que ponerla después de `:196` o darles receta.
3. **El §4.3 («comparten la versión del vigente») cuenta mal un reproceso con la misma receta.** Un reproceso abierto con
   `abrirProceso` es siempre `origen: "original"` (`derivedFromLotProcessId` nulo), pero si lleva la misma versión que el
   proceso cerrado de arriba, la regla de la versión hereda sus corridas como «ya ejecutadas» y no propondría nada. El hilo
   que el diseño describe (partes y continuaciones) ya está guardado: seguir `derivedFromLotProcessId` desde el vigente
   mientras `origen !== "original"` da exactamente la cadena de divisiones y devoluciones, y corta en el reproceso. Y
   `ProcesoEnCadena` no lleva ni versión ni `startedAt` (§3.1).
4. **`abrirProceso` no comprueba la organización de la receta** (el selector sí la filtra, `processTargets.ts:207`; el tueste
   la rechaza en el servicio, `roasting.ts:148`, `:406`). Con el formulario manipulado se abre un proceso con la receta de
   otra organización. La «exigencia de `approved`» del §3.3 entra en el mismo sitio, y conviene que entren juntas.
5. **El bloqueo de la versión (§3.3) tiene que ir DESPUÉS de `bloquearLinaje`.** Hoy la versión se lee fuera de la transacción
   (`:182`). R2 exige que el bloqueo del linaje sea lo primero de la transacción («para no romper el orden global por id»,
   `procesoDelLinaje.ts:588-590`); editar y publicar sólo bloquearían la versión, así que el orden linaje→versión no
   produce ciclo.
6. **`DryingRun` no tiene versión.** El guardián del §4.2 para un secado tiene que tomarla de
   `procesoParaUnaCorrida(...).processRecipeVersionId`, dentro de `startDryingRun`, y no de la corrida.
7. **Hay TRES puertas que terminan una corrida, no dos:** `endFermentationRun`, `endDryingRun` y `bajarBandeja`
   (`bandejasDelSecado.ts:300`, la última bandeja). Las `lecturasDeCierre` del §5.3 tienen que entrar por las tres (y por
   `registrarIntervencion`). Ninguna bloquea el linaje, y las dos `end…` usan el tope de 5 s por defecto.
8. **`FermentationIntervention` no tiene ni transacción ni auditoría** (`fermentation.ts:141-154`), ni mira si la corrida sigue
   abierta. Añadirle `recipeStepId` (§4.1) obliga a validarlo con la versión: la tiene la propia corrida
   (`fermentationRun.processRecipeVersionId`). **No hay que leerla por `run.lotProcessId`**: el guardia
   `tests/arquitectura/proceso-por-el-resolvedor.test.ts` marca `where: { id: x.lotProcessId }` y las claves
   `lotProcess: true` / `lotProcess: { … }` en lecturas (`lecturasPorLote`, `:134-145`); el §3.1 de la 2a, cuando haga que la cola y el
   tablero lean «el paso de la corrida», debe usar una clave de paso, no `lotProcess: {…}`.
9. **`registrarIntervencion` decide fuera de la transacción y sin bloquear el linaje** (`lotProcess.ts:340-344`): una división
   concurrente puede cerrar el proceso entre la comprobación y el `create`. Con la 2a esa intervención llevaría un paso de
   un proceso ya cerrado. Además **hay dos `registrarIntervencion`** en el árbol: `lotProcess.ts:339` (manejo del proceso) y
   `lib/traceability/intervenciones.ts:379` (fitosanitario de campo, que usa `app/actions/manejo.ts:145`). Al escribir
   tareas, nombrar el módulo.
10. **Ninguna pantalla deja declarar cómo terminó un secado.** `endDryingFormAction` y el cierre por bandeja no mandan
    `endedOutcome`. El §0 de la 2a da por hecho que «un secado que se corta para un tratamiento se termina con `abandoned`
    o `interrupted`»: hoy sólo se puede por el servicio.
11. **La página del proceso pide `manage` a cualquiera que la abra.** `listRecipeVersionsForLot` (`requireLotAccess(…, "manage")`,
    `processTargets.ts:197`) se llama en `page.tsx:109` fuera del `try` y sin mirar `puedeGestionar`, que justo existe
    para el modo de sólo lectura (`:144`). Por lectura del código, quien sólo VE el lote recibe un
    `TraceabilityAccessError` sin atrapar: un 500. Ya estaba así en `origin/main` (`203d9236`, `:59`). **No lo ejecuté.**
    La 2a va a tocar ese selector; conviene decidir si se arregla en el mismo cambio.
12. **`ProcessRecipe` es único por `[organizationId, name]`** (`schema.prisma:4343`). Con el nombre que propone el §5.2
    («Libre — <intención>»), dos procesos de la misma organización con la misma intención chocarían por SQL.
13. **Claves foráneas que deciden la limpieza y la columna nueva:** `fermentation_run.lot_process_id` y
    `drying_run.lot_process_id` son SET NULL; `lot_process_intervention.lot_process_id` es CASCADE;
    `lot_process.process_recipe_version_id` es RESTRICT; `fermentation_run.process_recipe_version_id` es SET NULL. La
    columna `recipeStepId` de las cuatro tablas necesita su `onDelete` decidido. Si se deja `SET NULL`, un paso borrado
    convertiría un registro en «desviación sin motivo» sin avisar (la regla de `CLAUDE.md` sobre `SET NULL` que borra sin fallar).
14. **Guardias de la casa que pisa cualquier función nueva:** `audit-atomico` (firma en una línea con el tipo nombrado si
    audita con el `tx` recibido, `procesoDelLinaje.ts:645-647`); `acceso-a-datos.test.ts` («ninguna operación nueva entra sin
    que alguien mire a su llamador», `:235`: entrada en `docs/arquitectura/acceso-a-datos.allowlist.json` con
    `archivo, operacion, razon, verificado`); `proceso-por-el-resolvedor` (punto 8).

---

## 9. Cobertura de este reconocimiento

**Leído entero:** `lib/traceability/lotProcess.ts`, `procesoDelLinaje.ts`, `fermentation.ts`, `drying.ts`, `errorDeProceso.ts`;
`app/lots/[id]/process/page.tsx`; las dos páginas `/new`; `FermentationForm.tsx`, `DryingForm.tsx`; `AbrirProcesoForm` e
`IntervencionForm` de `ProcesoDelLote.tsx`; `tests/helpers/procesoDePrueba.ts`; la migración de la Parte 1; los dos diseños.
**Por tramos:** `schema.prisma` (`3295-3315`, `3458-3574`, `4015-4694` y `Measurement`); `app/actions/traceability.ts`
(`540-800`, `1015-1062`, `2445-2615`); `processTargets.ts` (`185-440`); `bandejasDelSecado.ts` (`260-316`); `roasting.ts`
(`140-150`, `170-182`, `238-248`, `396-410`); `prisma/seed.ts` (`870-960`); la ficha del lote (`240-275`, `1150-1320`);
los nombres de TODOS los `it` de los seis archivos de prueba del encargo y el cuerpo de los que tocan receta y versión;
el guardia `proceso-por-el-resolvedor` (`1-200`).
**No leído:** `datosDelTablero.ts` y `colaDeSecado.ts` (otra lente); el resto de `processTargets.ts` (creación de versiones,
R8); `messages/*.json`; los cuerpos del resto de las pruebas. **Nada se ejecutó**: ninguna afirmación de este informe
viene de correr la suite; la del punto 11 de Sorpresas es lectura de código.
