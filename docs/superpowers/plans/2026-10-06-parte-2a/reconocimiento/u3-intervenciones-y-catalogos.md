# Reconocimiento u3 — intervenciones y catálogos (Parte 2a)

**Árbol medido:** `/Users/danielsan/Developer/nectar-worktrees/recetas-parte-2a`, rama `recetas-parte-2a`,
`git rev-parse --short HEAD` = **`d27068d5`** (Parte 1 construida encima de `origin/main` `203d9236`).
Sólo lectura: nada del repo se tocó; este informe vive en `.superpowers/`, excluido por `.git/info/exclude:8`.

Cómo se midió: `git grep`, `sed -n`, `awk` sobre el árbol, y **un** `node -e` de sólo lectura que importa
`lib/research/catalogs.ts` (Node 24 quita los tipos solo) para contar y listar valores. Cada búsqueda negativa
lleva su control positivo al lado.

---

## 0. Lo esencial en seis líneas

1. **No existe «el catálogo de intervenciones».** `CATALOGOS_DE_INTERVENCION` es una lista de **9 CLAVES de
   catálogo**, no un catálogo; entre las 9 ofrecen **44 valores**, y **ninguno** es despulpado, lavado,
   desmucilaginado, reposo ni mover a sombra.
2. `registrarIntervencion` (`lotProcess.ts:339`) escribe la fila y su `AuditEvent` en **una** transacción, pide
   `manage` sobre el lote **donde vive el proceso**, y **no** bloquea el linaje ni pasa por el resolvedor.
3. `recordFermentationIntervention` (`fermentation.ts:141`) **no tiene transacción, ni auditoría, ni comprueba que
   la corrida siga abierta**; su enum sí trae `inoculation` y `addition`.
4. `VariableCatalogValueDef` **no tiene `displayOrder`**: lo pone la semilla con el índice del arreglo.
5. Los catálogos llegan a la base **sólo por la semilla** (`prisma/seed.ts:89`), nunca por migración; en
   producción la corre `scripts/vercel-build.sh` **después** de `migrate deploy`. Upsert sin borrado.
6. **El alias no cruza catálogos**: la semilla **lanza** si `aliasOf` no está en el mismo catálogo — y en
   producción eso tumba el despliegue con las migraciones ya aplicadas.

---

## 1. `LotProcessIntervention` — esquema

`prisma/schema.prisma:4259–4289` (comentario 4259–4268, modelo 4269–4289). El diseño citaba `:4238`, que era
la línea en `85eab6da` (medido: `git show 85eab6da:prisma/schema.prisma | grep -n "^model LotProcessIntervention"` → 4238).

```prisma
/// Un manejo del lote que no es una fermentación ni un secado: flotado,
/// despulpado, remoción de mucílago, reposo, re-apilado, mover a sombra por
/// lluvia.
///
/// **Vocabulario ABIERTO, no un enum.** La lista de manejos es genuinamente
/// abierta y cambia por finca y por año; un enum cerrado pediría una migración
/// cada vez que se inventa uno, y la presión sería meterlo todo en `other`.
/// Reusa `VariableCatalog`, el mismo mecanismo que ya usan
/// `ProcessingStage.washMediumCatalogValueId` y
/// `LotTransformation.selectionMethodValueId` — no un tercer sistema paralelo.
model LotProcessIntervention {
  id             String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  lotProcessId   String               @map("lot_process_id") @db.Uuid
  lotProcess     LotProcess           @relation(fields: [lotProcessId], references: [id], onDelete: Cascade)
  catalogValueId String               @map("catalog_value_id") @db.Uuid
  catalogValue   VariableCatalogValue @relation("LotProcessInterventionKind", fields: [catalogValueId], references: [id])
  occurredAt     DateTime             @map("occurred_at")

  operatorPersonId String?      @map("operator_person_id") @db.Uuid
  operator         Person?      @relation("LotProcessInterventionOperator", fields: [operatorPersonId], references: [id])
  notes            String?
  createdAt        DateTime     @default(now()) @map("created_at")
  createdBy        String?      @map("created_by") @db.Uuid
  creator          UserAccount? @relation("LotProcessInterventionCreatedBy", fields: [createdBy], references: [id])

  @@index([lotProcessId])
  @@index([catalogValueId])
  @@index([occurredAt])
  @@map("lot_process_intervention")
  @@schema("traceability")
}
```

DDL real: `prisma/migrations/20260907080000_proceso_del_lote/migration.sql:39–76`.
- `catalog_value_id UUID NOT NULL` → **toda intervención exige un valor de catálogo**. Un registro
  `stepType = pulping` de la 2a necesitará *algún* valor (ver Sorpresa S1).
- FKs: `lot_process_id … ON DELETE CASCADE`, `catalog_value_id … ON DELETE RESTRICT`,
  `operator_person_id … SET NULL`, `created_by … SET NULL`. **Sin ningún `CHECK`.**
- Lado inverso: `VariableCatalogValue.lotProcessInterventions LotProcessIntervention[] @relation("LotProcessInterventionKind")`
  (`schema.prisma:9207`).

**Único escritor en todo el repo:** `lib/traceability/lotProcess.ts:356` (`tx.lotProcessIntervention.create`).
Medido con `git grep -n "lotProcessIntervention\b\|lotProcessIntervention\." -- lib app scripts prisma/seed.ts` → 1 línea.
El reimport no escribe intervenciones.

**Lectores:**
- `lotProcess.ts:682` (`listarProcesosDeLote`) y `lotProcess.ts:794` (`INCLUIR_PARA_PANTALLA`):
  `interventions: { orderBy: { occurredAt: "asc" }, include: { catalogValue: true, operator: true } }`.
- `lib/traceability/reporteDeProceso.ts:126` (include) y `:201` → `intervenciones: p.interventions.map((i) => i.catalogValue.value)`.
- Pantalla: `app/lots/[id]/process/page.tsx:196–206` pinta `{fecha(i.occurredAt)} · {i.catalogValue.value}{i.notes ? … : ""}`.

**Limpieza en pruebas** (importa si la 2a añade una FK `RESTRICT` desde aquí hacia un paso):
`tests/traceability/lotProcess.test.ts:196` y `tests/traceability/reporteDeProceso.test.ts:283` borran
`lotProcessIntervention` por `lotProcess.lotId` antes que los procesos.

---

## 2. `CATALOGOS_DE_INTERVENCION` — lo que contiene HOY

`lib/traceability/lotProcess.ts:42–94`. El comentario (42–60) es el de la corrección de Daniel del 2026-09-07
(«la lista ya está de antes»; la primera versión inventaba `intervencion_de_proceso`).

```ts
/** Las claves de los dos catálogos que describen el batch, no un instante. */
export const CATALOGO_GRADO_PROCESO = "grado_proceso";
export const CATALOGO_ESTADO_CEREZA = "estado_cereza";
/** Parte 1, R7: la lista de motivos de devolución a secado. */
export const CATALOGO_MOTIVO_DEVOLUCION = "motivo_devolucion_a_secado";

export const CATALOGOS_DE_INTERVENCION: readonly string[] = [
  "condicion_oxigeno",
  "manejo_temperatura",
  "medio_lavado",
  "metodo_inoculacion",
  "sustrato_anadido",
  "recipiente",
  "cereza_flotado",
  "cereza_seleccion",
  // 2026-09-14, decisión de Daniel: … (comentario de 12 líneas sobre levadura_cultivo)
  "levadura_cultivo",
];
```

**Es una lista de 9 claves de catálogo, no un catálogo.** Los 44 valores que el formulario ofrece hoy
(medido con `node -e` importando `catalogs.ts`):

| clave (orden del formulario: por `catalog.key` asc, luego `displayOrder`) | n | valores |
|---|---|---|
| `cereza_flotado` | 7 | `sin_flotadores` · `<2%` · `2_5%` · `5_10%` · `10_20%` · `20_30%` · `>30%` |
| `cereza_seleccion` | 5 | `uniforme_alta` · `uniforme_media` · `heterogenea_leve` · `heterogenea_alta` · `mezcla_no_controlada` |
| `condicion_oxigeno` | 4 | `abierto_aerobico` · `anaerobico` · `maceracion_carbonica` · `anoxico` |
| `levadura_cultivo` | 7 | `Sunrise Orange` · `Deep Amber` · `Cool Blue` · `Green Origin` · `MP72` · `HDA54` · `Spontaneous Wild` |
| `manejo_temperatura` | 5 | `ambiente` · `cold_hold_prefermentativo` · `fermentacion_fria` · `choque_termico` · `choque_en_frio` |
| `medio_lavado` | 4 | `agua_limpia` · `mosto_propio` · `mosto_de_otro_lote` · `ninguno_natural` |
| `metodo_inoculacion` | 3 | `direct pitch` · `rehydrated` · `spontaneous` |
| `recipiente` | 6 | `Tanque I` · `Tanque II` · `Tanque III` · `Cooler I` · `Cooler II` · `GrainProBag` |
| `sustrato_anadido` | 3 | `ninguno` · `co_fermentacion` · `doble_mosto` |
| **total** | **44** | |

**Búsqueda negativa con su control.** Regex `/despulp|lavad|desmuc|mucil|reposo|sombra|flot/i` sobre los 173
valores y 29 claves de `VARIABLE_CATALOGS`:
- aciertos de **valor**: `cereza_flotado → sin_flotadores`, `estado_cereza → despulpada`,
  `seleccion_metodo → flotacion`, `rechazo_categoria → flotadores`;
- aciertos de **clave**: `cereza_flotado`, `medio_lavado`.

O sea: el patrón **sí ve** «despulpada» y «flotacion» donde están (control positivo), y dentro de los 9 catálogos
de intervención lo único que casa es `sin_flotadores` (un rango de observación) y el nombre de la clave
`medio_lavado` (el *medio*, no el acto). **Despulpado, desmucilaginado, lavado, reposo y mover a sombra no
existen como valor registrable.** `estado_cereza` (que tiene `despulpada`) está **excluido a propósito** de la lista
(comentario `lotProcess.ts:55–58`: «describen el batch entero, no algo que ocurre en un instante»).

`fuente_microbiana` **no** está en la lista: una intervención no puede registrar `koji` ni `bacterias_lab`.

---

## 3. `registrarIntervencion` (proceso del lote) — firma, permisos, transacción, auditoría

**Ojo, homónimo.** Hay DOS funciones `registrarIntervencion`:
- `lib/traceability/lotProcess.ts:339` — la del **proceso del lote** (ésta).
- `lib/traceability/intervenciones.ts:379` — la **fitosanitaria de parcela** (`PlotIntervention`), que usan
  `app/actions/manejo.ts:35` y `app/components/traceability/IntervencionForm.tsx`.
Y DOS componentes `IntervencionForm`: `app/components/traceability/ProcesoDelLote.tsx:130` (proceso) y
`app/components/traceability/IntervencionForm.tsx` (parcela). Un `grep` por nombre mezcla las dos.

`lib/traceability/lotProcess.ts:321–381`, literal:

```ts
export interface RegistrarIntervencionInput {
  lotProcessId: string;
  /** De uno de los catálogos de `CATALOGOS_DE_INTERVENCION`. */
  catalogValueId: string;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}

export async function registrarIntervencion(userAccountId: string, input: RegistrarIntervencionInput) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: input.lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  const lote = await loteGestionable(userAccountId, proceso.lotId);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lote.projectId, locationId: lote.locationId }]);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");

  const valor = await prisma.variableCatalogValue.findUnique({
    where: { id: input.catalogValueId },
    include: { catalog: true },
  });
  if (!valor) throw new LotProcessError("catalog_value_not_found");
  if (!CATALOGOS_DE_INTERVENCION.includes(valor.catalog.key)) {
    throw new LotProcessError("catalog_value_wrong_catalog");
  }

  return prisma.$transaction(async (tx) => {
    const intervencion = await tx.lotProcessIntervention.create({
      data: {
        lotProcessId: input.lotProcessId,
        catalogValueId: input.catalogValueId,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes?.trim() || null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.record_intervention",
        entityType: "lot_process_intervention",
        entityId: intervencion.id,
        after: intervencion,
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return intervencion;
  });
}
```

`loteGestionable` (`lotProcess.ts:154–159`):

```ts
async function loteGestionable(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [lot]);
  return lot;
}
```

Lo que importa para la 2a:
- **Permiso:** `manage` sobre el lote **dueño del proceso** (`proceso.lotId`), que desde R1 puede ser un ancestro
  del lote que se mira. `puedeGestionarProceso` (`lotProcess.ts:971`) hace la misma pregunta para la página.
- **Persona:** `exigirPersonaPermitida` con el `projectId/locationId` del lote dueño.
- **Rechazos que lanza** (todos `LotProcessError`): `process_not_found`, `lot_not_found`, `process_already_closed`,
  `catalog_value_not_found`, `catalog_value_wrong_catalog`. **Ninguno** de los dos de catálogo está en
  `CODIGOS_DE_PROCESO_TRADUCIDOS` (`lib/traceability/errorDeProceso.ts:17–44`) → salen por el mensaje genérico.
  Los códigos nuevos de la 2a (`paso_de_otra_receta`, `paso_no_corresponde`, `desviacion_sin_motivo`, `sin_receta`)
  tendrán que entrar en esa lista **y** en `messages/*.json` como `Traceability.error_proceso_<código>`; lo vigila
  `tests/traceability/mensajesDeProceso.test.ts`.
- **Transacción:** sólo la escritura y su `AuditEvent` (`tx` pasado → cumple `tests/arquitectura/audit-atomico.test.ts`).
  La comprobación de «cerrado» se hace **fuera** de la transacción y **sin `bloquearLinaje`**: hoy una intervención
  puede colarse entre la lectura y un `cerrarProceso` concurrente. Si la 2a valida «el paso es de la versión del
  proceso **vigente**» (§4.2), tendrá que leerlo dentro de la transacción con el linaje bloqueado, como hace
  `cerrarProceso` (`lotProcess.ts:429–435`).
- **No pasa por el resolvedor** (`procesoQueCubre`): recibe el `lotProcessId` ya elegido. Lo documenta la excepción
  de `tests/arquitectura/proceso-por-el-resolvedor.test.ts:56–67` («las otras nueve `lotProcess.find…` … leen por el id
  de un proceso ya conocido»).
- **No valida `occurredAt`** contra `proceso.startedAt` (sí lo hace `cerrarProceso` con la medición).

**Acción y pantalla:**
- `app/actions/traceability.ts:2536–2557` `registrarIntervencionAction(_prev, formData)`: manda `lotProcessId`,
  `catalogValueId`, **`occurredAt: new Date()`** (no hay campo de hora) y `notes`; **no manda `operatorPersonId`**.
  `redirect` fuera del `try`, errores por `friendlyError`.
- `app/components/traceability/ProcesoDelLote.tsx:129–176` `IntervencionForm({ lotProcessId, lotId, opciones })`:
  un `<select name="catalogValueId">` y un `<input name="notes">`. Si `opciones` está vacío pinta
  `t("processNoInterventionVocabulary")`. Se monta en `app/lots/[id]/process/page.tsx:223` sólo con proceso abierto y
  `puedeGestionarElAbierto`.
- Las opciones salen de `opcionesParaProceso` (`lotProcess.ts:714`, consulta en `:730–734`):

```ts
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: { in: [...CATALOGOS_DE_INTERVENCION] } } },
      include: { catalog: true },
      orderBy: [{ catalog: { key: "asc" } }, { displayOrder: "asc" }, { value: "asc" }],
    }),
```

  y se rotulan (`:769`) `intervenciones: valores.map((v) => ({ id: v.id, label: \`${v.catalog.name} · ${v.value}\` }))`
  — **el valor crudo, sin traducir** (a diferencia de los motivos de devolución, que van por clave
  `motivoDevolucion_<valor>`). Incluye también los alias (no filtra `aliasOfId: null`).

**Pruebas que hoy la cubren** (`tests/traceability/lotProcess.test.ts`, grupo `base-sembrada`):
- `describe("intervenciones de manejo")` (l. 337):
  - `it("registra una del catálogo de intervenciones")` (l. 338) — usa un valor `TEST anaerobico ${RUN}` creado en
    `condicion_oxigeno` (`CATALOGOS_DE_INTERVENCION[0]`, l. 133–141).
  - `it("rechaza un valor de un catálogo que no describe manejos, aunque la FK sea válida")` (l. 352) — catálogo
    `test_otro_${RUN}`.
- `describe("cerrar el proceso…")` → `it("un proceso cerrado ya no acepta cambios ni intervenciones")` (l. 457).
- **Sin cubrir:** permiso (nadie prueba que sin `manage` se rechace), el `AuditEvent`
  (`git grep "record_intervention" -- tests` → 0; control: la misma cadena sí aparece en `lib/traceability/lotProcess.ts:370`),
  y la lista `opcionesParaProceso().intervenciones` (ninguna prueba la lee; sólo `.mediciones` y `.motivosDeDevolucion`).

---

## 4. `FermentationIntervention` — esquema, servicio, pantalla

**Enum** `prisma/schema.prisma:4021–4032`:

```prisma
enum FermentationInterventionType {
  inoculation
  agitation
  purge
  addition
  sample
  transfer
  termination
  other

  @@schema("traceability")
}
```

**Modelo** `prisma/schema.prisma:4512–4526`:

```prisma
model FermentationIntervention {
  id                String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  fermentationRunId String                       @map("fermentation_run_id") @db.Uuid
  fermentationRun   FermentationRun              @relation(fields: [fermentationRunId], references: [id])
  interventionType  FermentationInterventionType @map("intervention_type")
  occurredAt        DateTime                     @map("occurred_at")
  notes             String?
  createdAt         DateTime                     @default(now()) @map("created_at")
  createdBy         String?                      @map("created_by") @db.Uuid
  creator           UserAccount?                 @relation("FermentationInterventionCreatedBy", fields: [createdBy], references: [id])

  @@index([fermentationRunId])
  @@map("fermentation_intervention")
  @@schema("traceability")
}
```

DDL: `prisma/migrations/20260810190000_phase1_fermentation/migration.sql:23–57`; FK a la corrida
`ON DELETE RESTRICT`. **Sin operador, sin `lotProcessId` propio** (llega al proceso por
`fermentationRun.lotProcessId`), **sin enlace a ningún catálogo**: una `inoculation` no dice con qué cepa y una
`addition` no dice qué sustancia ni cuánto.

**Servicio** `lib/traceability/fermentation.ts:134–155`:

```ts
export interface RecordFermentationInterventionInput {
  fermentationRunId: string;
  interventionType: "inoculation" | "agitation" | "purge" | "addition" | "sample" | "transfer" | "termination" | "other";
  occurredAt: Date;
  notes?: string | null;
}

export async function recordFermentationIntervention(userAccountId: string, input: RecordFermentationInterventionInput) {
  const sourceLot = await resolveRunSourceLot(input.fermentationRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  return prisma.fermentationIntervention.create({
    data: {
      fermentationRunId: input.fermentationRunId,
      interventionType: input.interventionType,
      occurredAt: input.occurredAt,
      notes: input.notes ?? null,
      createdBy: userAccountId,
    },
  });
}
```

`resolveRunSourceLot` (`fermentation.ts:37–46`) toma el primer lote de entrada de la transformación de la
corrida; lanza `TraceabilityAccessError("fermentation_run_not_found")` si no hay.

Lo que el plan tiene que saber:
- **Sin `$transaction` y sin `recordAuditEvent`.** Ningún guardia lo caza: `audit-atomico` sólo exige que un audit
  *dentro* de una transacción reciba el `tx`, no que exista.
- **No comprueba `endedAt`**: por servicio se puede registrar sobre una corrida terminada (la pantalla sólo ofrece
  el formulario con corrida activa).
- El tipo está escrito **tres veces sin guardia que las ate**: el enum (`schema.prisma:4021`), la unión de TS
  (`fermentation.ts:136`) y `FERMENTATION_INTERVENTION_TYPES` (`app/lots/[id]/page.tsx:75`), más las 8 claves
  `Traceability.interventionType_*` de `messages/es.json:601–608` (y 8 en `en.json`).

**Acción** `app/actions/traceability.ts:574–587` `recordFermentationInterventionFormAction(formData): Promise<void>`:
`interventionType: String(formData.get("interventionType") ?? "other") as never` (sin validar), `occurredAt: new Date()`,
**sin `try/catch`** (un error es una pantalla de error), `revalidatePath` sin `redirect`.

**Pantalla** `app/lots/[id]/page.tsx:1150–1177`: dentro de la tarjeta de la fermentación activa
(`activeFermentation = fermentationRuns.find((r) => r.endedAt === null)`, l. 266) lista
`t(\`interventionType_${iv.interventionType}\`) — cuando(iv.occurredAt)` (**sin las notas**) y un `<form>` con
`lotId`, `fermentationRunId` y un `<select name="interventionType" defaultValue="agitation">`. **No tiene campo de
notas**, así que desde la pantalla una inoculación no puede ni nombrar la cepa en texto.
Datos: `lib/traceability/lots.ts:993` y `lib/traceability/reports.ts:103` (`include: { interventions: { orderBy: { occurredAt: "asc" } } }`).

**Pruebas** (`tests/traceability/fermentation.test.ts`, grupo `base-sembrada`):
- `it("runs the whole cycle and produces the expected stage-change transformations")` (l. 94) — registra una
  `agitation` (l. 128) y comprueba `toHaveLength(1)` (l. 168–169); los audits que afirma son sólo
  `["fermentation_run.start", "fermentation_run.end"]`.
- `it("denies recording an intervention against a run in a different project")` (l. 196).

**Otros sitios donde YA se registra lo que la 2a llama `inoculation` y `addition`** (para no duplicar):
- `FermentationRun.inoculated Boolean @default(false)` e `inoculationNote String?` (modelo `FermentationRun`,
  `StartFermentationRunInput` en `fermentation.ts:48–67`).
- `LotProcessIntervention` con un valor de `levadura_cultivo` / `metodo_inoculacion` / `sustrato_anadido` (los tres
  están en `CATALOGOS_DE_INTERVENCION`).
- `MaterialConsumptionEntry` con `fermentationRunId`/`dryingRunId` y `ConsumableMaterial` (cantidad, unidad, lote de
  existencias). Ver Sorpresa S4.

---

## 5. `lib/research/catalogs.ts` — el tipo y los catálogos pedidos

### 5.1 `VariableCatalogValueDef` (l. 17–36) y `VariableCatalogDef` (l. 38–43), literal sin comentarios

```ts
export interface VariableCatalogValueDef {
  value: string;
  impliesUnknownIdentity?: boolean;
  aliasOf?: string;
  definition?: string;
}

export interface VariableCatalogDef {
  key: string;
  name: string;
  description?: string;
  values: readonly VariableCatalogValueDef[];
}
```

**No hay `displayOrder` en el tipo.** Medido además sobre los datos: las claves usadas en los 173 valores son
`value, impliesUnknownIdentity, definition, aliasOf`; en los 29 catálogos, `key, name, values, description`.
`displayOrder` sólo existe en la **base** (`VariableCatalogValue.displayOrder Int @default(0)`, `schema.prisma:9197`)
y lo escribe la semilla con el **índice** del arreglo (§6).

Totales hoy: **29 catálogos, 173 valores**, **3 alias** (los tres en `cultivar`: `Catuai→Catuaí`, `Gesha→Geisha`,
`Típica→Typica`) y **4** `impliesUnknownIdentity` (`levadura_cultivo: Spontaneous Wild`, y `desconocido` en
`cultivar`, `origen_de_colonia`, `causa_de_perdida_de_colonia`). **Ninguno de los catálogos de esta lente tiene un
solo `aliasOf`.**

### 5.2 Los catálogos, valor por valor (orden = `displayOrder` que pone la semilla)

`aliasOf`: ninguno en todas estas tablas. `impliesUnknownIdentity`: sólo donde se dice.

**`estado_cereza`** — «Estado de la cereza» (`catalogs.ts:319–323`). Lo usa `LotProcess.cherryStateValueId` (NOT NULL,
obligatorio al abrir, `lotProcess.ts:191–193`).

| # | value | definition |
|---|---|---|
| 0 | `entera` | Cereza sin despulpar. |
| 1 | `despulpada` | Cereza sin la piel/pulpa exterior. |

**`condicion_oxigeno`** — «Condición de oxígeno» (`catalogs.ts:229–253`).

| # | value | definition |
|---|---|---|
| 0 | `abierto_aerobico` | Fermentación con oxígeno disponible, sin sellado ni restricción de aire. |
| 1 | `anaerobico` | Fermentación con oxígeno restringido en recipiente sellado. Puede ser con cereza entera o despulpada, y combinarse con cualquier flujo de proceso. No es lo mismo que maceración carbónica ni un alias suyo: anaeróbico no exige CO₂ ni cereza entera — maceración carbónica es un subconjunto específico con ambos requisitos. El mercado a veces los usa indistintamente; este catálogo los mantiene separados a propósito (§4). |
| 2 | `maceracion_carbonica` | Cereza entera en tanque sellado saturado con CO₂; la fermentación ocurre dentro de cada cereza, no en la masa circundante. Es un subconjunto específico de anaeróbico, no equivalente ni intercambiable: exige CO₂ (purgado o medido) y cereza entera, que anaeróbico no exige por sí solo. No aliasear con anaerobico (§4). |
| 3 | `anoxico` | Sin oxígeno y sin CO₂ — cámara sellada con purga de gas inerte. Distinto de anaeróbico: anaeróbico no excluye el CO₂ que la propia fermentación genera; anóxico lo purga activamente. |

**`manejo_temperatura`** — «Manejo de temperatura» (`catalogs.ts:254–280`).

| # | value | definition |
|---|---|---|
| 0 | `ambiente` | Sin manejo activo de temperatura; el ambiente del lugar de fermentación. |
| 1 | `cold_hold_prefermentativo` | Cereza entera enfriada antes de cualquier fermentación, para retrasar actividad microbiana. Protocolo CryoBloom. |
| 2 | `fermentacion_fria` | Fermentación sostenida a temperatura reducida durante todo el proceso, distinta de un enfriamiento puntual. |
| 3 | `choque_termico` | Ciclos rápidos de temperatura durante o después de la fermentación, para arrestar actividad microbiana en un punto preciso. Puede repetirse en varios ciclos. |
| 4 | `choque_en_frio` | Descenso brusco de temperatura una sola vez, distinto del cold hold sostenido y de los ciclos repetidos del choque térmico. |

**`fuente_microbiana`** — «Fuente microbiana» (`catalogs.ts:281–301`). **No** está en `CATALOGOS_DE_INTERVENCION`.

| # | value | definition |
|---|---|---|
| 0 | `espontanea` | Sin inoculación deliberada; los microorganismos presentes de forma natural en la cereza y el ambiente. |
| 1 | `levadura_inoculada` | Levadura comercial o cultivo añadido deliberadamente. La cepa específica se registra en el catálogo Levadura/cultivo. |
| 2 | `bacterias_lab` | Bacterias ácido-lácticas añadidas o favorecidas deliberadamente. |
| 3 | `koji` | Aspergillus oryzae, usado para sacarificación (ver 23_ §5a). |
| 4 | `cultivo_mixto` | Combinación deliberada de más de una fuente microbiana en el mismo tratamiento. |

**`sustrato_anadido`** — «Sustrato añadido» (`catalogs.ts:302–318`).

| # | value | definition |
|---|---|---|
| 0 | `ninguno` | Sin ingrediente añadido durante la fermentación. |
| 1 | `co_fermentacion` | Fruta, especias u otro ingrediente añadido durante la fermentación. Qué se añadió y cuánto se registra aparte, nunca oculto — la divulgación importa, los estándares de declaración varían por productor y mercado. |
| 2 | `doble_mosto` | Reuso de mosto de una fermentación previa. De qué lote vino se registra vía Medio de lavado (mosto_de_otro_lote) cuando ese mosto también se usa como medio; si además hubo inoculación con él, ambos ejes se marcan. |

**`medio_lavado`** — «Medio de lavado» (`catalogs.ts:327–350`). Lo usa `ProcessingStage.washMediumCatalogValueId`
(Research OS); `lib/research/treatments.ts:410–414` compara `catalog.key !== "medio_lavado"` y
`value === "mosto_de_otro_lote"` **por cadena**.

| # | value | definition |
|---|---|---|
| 0 | `agua_limpia` | Agua sin carga microbiana ni compuestos de fermentación previa. Arrastra y diluye. |
| 1 | `mosto_propio` | Mosto del mismo lote. Mantiene el lote cerrado sobre sí mismo — la carga microbiana y los compuestos ya desarrollados vienen del propio proceso. |
| 2 | `mosto_de_otro_lote` | Mosto de un lote distinto o de una fermentación previa. Introduce material externo — más cercano a inocular que a lavar (PE-106/PE-107, "Doble Mosto Guacho"). El lote de origen se registra en ProcessingStage.washMediumSourceLotId, nunca solo en este valor de catálogo. |
| 3 | `ninguno_natural` | Sin lavado — proceso natural; la cereza no pasa por medio líquido de lavado. |

**`recipiente`** — «Recipiente» (`catalogs.ts:46–57`). **Sin definiciones.** Son **recipientes concretos** de una
finca, no tipos (los mapea `lib/research/cafelinoPeImport.ts:304–312`, `mapEquipo`).

| # | value |
|---|---|
| 0 | `Tanque I` |
| 1 | `Tanque II` |
| 2 | `Tanque III` |
| 3 | `Cooler I` |
| 4 | `Cooler II` |
| 5 | `GrainProBag` |

**`grado_proceso`** — «Grado de proceso» (`catalogs.ts:76–95`). Sin definiciones. Lo usa
`LotProcess.processGradeValueId` (NOT NULL); lo leen `procesoDelLinaje.ts:365` y `reporteDeProceso.ts:195` por `.value`.

| # | value |
|---|---|
| 0 | `Natural` |
| 1 | `Washed` |
| 2 | `Semi Wash 50%` |
| 3 | `Semi Wash 75%` |
| 4 | `Honey` |

(`lib/research/cafelinoPeImport.ts:332` mapea además a `"Wash 100%"`, que **no** está en el catálogo; con prueba
propia `tests/research/cafelinoPeImport.test.ts:133`. Fuera de esta lente, se señala.)

**`motivo_devolucion_a_secado`** — «Motivo de devolución a secado» (`catalogs.ts:691–700`, añadido por la Parte 1),
`description`: «Por qué un lote volvió a secado desde bodega o desde la entrada a bodega. «otro» exige nota.»

| # | value | definition |
|---|---|---|
| 0 | `humedad_alta_por_error_de_manejo` | La humedad quedó por encima del objetivo por un error en el manejo del secado. |
| 1 | `error_de_medicion` | La medición con la que se cerró estaba mal tomada o el instrumento fallaba. |
| 2 | `otro` | Siempre con nota libre. |

**Los de intervención que faltan arriba** (sin definiciones salvo donde se indica):
- `metodo_inoculacion` (`catalogs.ts:71–75`): `direct pitch` · `rehydrated` · `spontaneous`.
- `levadura_cultivo` (`catalogs.ts:58–70`): `Sunrise Orange` · `Deep Amber` · `Cool Blue` · `Green Origin` · `MP72` ·
  `HDA54` · `Spontaneous Wild` (**`impliesUnknownIdentity: true`**).
- `cereza_flotado` (`catalogs.ts:147–159`): `sin_flotadores` · `<2%` · `2_5%` · `5_10%` · `10_20%` · `20_30%` · `>30%`.
- `cereza_seleccion` (`catalogs.ts:136–146`): `uniforme_alta` · `uniforme_media` · `heterogenea_leve` ·
  `heterogenea_alta` · `mezcla_no_controlada`.
- Vecino útil, **no** de intervención: `seleccion_metodo` (`catalogs.ts:375–391`, con definiciones): `flotacion`,
  `manual`, `madurez`, `densidad`, `color`, `optica`, `tamano`, `defectos`, `otro` — lo usa `recordSelection`
  (`lib/traceability/selection.ts:95,107`).

### 5.3 ¿Existen ya `tipo_paso`, `fisico`, `modo_secado`, `capacidad`?

Búsqueda de la cadena entre comillas en `lib/research/catalogs.ts` y en `lib app prisma`:

| cadena | `catalogs.ts` | `lib`+`app`+`prisma` |
|---|---|---|
| `"tipo_paso"` | 0 | 0 |
| `"fisico"` | 0 | 0 |
| `"modo_secado"` | 0 | 0 |
| `"capacidad"` | 0 | 2 — `app/beneficio/page.tsx:195` (clave de i18n) y un comentario en `capacidadDeBandeja.ts:130`; **no** es catálogo |
| `"prefermentacion"` | 0 | 0 |
| **control** `"cold_hold_prefermentativo"` | **1** | **2** |
| **control** `"doble_mosto"` | **1** | **1** |
| **control** `"mosto_de_otro_lote"` | **1** | **3** |
| **control** `"condicion_oxigeno"` | **1** | **2** |

Los cuatro **no existen como catálogo**. Tampoco existen `ProcessRecipeStep`, `stepType`, `recipeStepId`
(`git grep -i` → 0 en `lib app prisma tests`; control: `ProcessRecipePhase` → 2 en `schema.prisma`).

**Pero el contenido de `modo_secado` sí existe con otro nombre** — ver Sorpresa S2.

---

## 6. Cómo llegan los catálogos a la base

**Tablas:** `research.variable_catalog` (`VariableCatalog`, `schema.prisma:9162–9175`: `id`, `key @unique`, `name`,
`description?`, `createdAt`) y `research.variable_catalog_value` (`VariableCatalogValue`, `schema.prisma:9177–9223`:
`id`, `catalogId` → `onDelete: Cascade`, `value`, `definition?`, `aliasOfId?` autorreferencia, `displayOrder Int @default(0)`,
`impliesUnknownIdentity Boolean @default(false)`; `@@unique([catalogId, value])`, `@@index([aliasOfId])`).

**Sólo por la semilla.** `prisma/seed.ts:21` importa `VARIABLE_CATALOGS`; `seedVariableCatalogs` (l. 89–136) corre en
`main()` (l. 1474). Literal:

```ts
async function seedVariableCatalogs() {
  for (const catalog of VARIABLE_CATALOGS) {
    const row = await prisma.variableCatalog.upsert({
      where: { key: catalog.key },
      update: { name: catalog.name, description: catalog.description ?? null },
      create: { key: catalog.key, name: catalog.name, description: catalog.description ?? null },
    });

    for (const [index, value] of catalog.values.entries()) {
      await prisma.variableCatalogValue.upsert({
        where: { catalogId_value: { catalogId: row.id, value: value.value } },
        update: {
          impliesUnknownIdentity: value.impliesUnknownIdentity ?? false,
          displayOrder: index,
          definition: value.definition ?? null,
        },
        create: {
          catalogId: row.id,
          value: value.value,
          impliesUnknownIdentity: value.impliesUnknownIdentity ?? false,
          displayOrder: index,
          definition: value.definition ?? null,
        },
      });
    }

    for (const value of catalog.values) {
      if (!value.aliasOf) continue;
      const canonical = await prisma.variableCatalogValue.findUnique({
        where: { catalogId_value: { catalogId: row.id, value: value.aliasOf } },
      });
      if (!canonical) {
        throw new Error(
          `Catalog "${catalog.key}": value "${value.value}" aliases "${value.aliasOf}", which is not defined in the same catalog.`,
        );
      }
      await prisma.variableCatalogValue.update({
        where: { catalogId_value: { catalogId: row.id, value: value.value } },
        data: { aliasOfId: canonical.id },
      });
    }
  }
}
```

(Comentarios del original omitidos; el código es el de `seed.ts:89–136`.)

Consecuencias, medidas en el código:
- **Upsert por `(catalogId, value)`, sin borrado.** Un valor nuevo aparece; uno quitado o renombrado **se queda** en
  la base (y las FK `RESTRICT` de `lot_process_intervention`, `lot_process` y demás impedirían borrarlo igual).
- **`displayOrder` = índice.** Insertar un valor en medio renumera los siguientes en la próxima siembra (inocuo, pero
  cambia el orden del desplegable); añadir al final no toca nada.
- **El alias se resuelve sólo dentro del mismo catálogo y LANZA si no lo encuentra.** Quitar un `aliasOf` del archivo
  **no** limpia `aliasOfId` en la base (sólo se escribe cuando viene).
- **Ninguna migración inserta catálogos.** Medido: de los 199 directorios de migración, 15 mencionan
  `variable_catalog` (todas para FKs/tablas) y `grep -i "insert into.*variable_catalog"` → **0**; control: 3 migraciones
  sí tienen `INSERT INTO` (de otras tablas), así que el `grep` encuentra inserciones.

**En cada entorno:**
- **Producción** (`scripts/vercel-build.sh`, con `set -euo pipefail`): `npx prisma generate` → `npx next build` →
  sólo si `VERCEL_ENV=production`: `npx prisma migrate deploy` → `env -u SEED_DEMO_ADMIN -u SEED_DEMO_CONTENT -u SEED_DEMO_PARTNER -u SEED_DEMO_JUDGE npx prisma db seed`
  (`prisma.config.ts:16`: `seed: "tsx prisma/seed.ts"`). **Un valor nuevo en `catalogs.ts` llega a producción en el
  despliegue, sin migración**, después de las migraciones y antes de promover el código.
  - Corolario 1: **una migración de la 2a no puede depender de filas sembradas por la 2a** (la semilla corre después);
    si una migración necesita un valor (p. ej. para rellenar), tiene que insertarlo ella.
  - Corolario 2: si la semilla **lanza** (alias a otro catálogo, por ejemplo), el build sale ≠ 0 **con las migraciones
    ya aplicadas** y el despliegue no se promueve.
- **Preview:** salta migrate y seed (no hay base).
- **Local:** `npm run db:seed` (`package.json:19`, `tsx prisma/seed.ts`), con `vigilarSiembra` delante
  (`scripts/migrate-guard.ts:133`) que impide sembrar producción por accidente.
- **CI con base** (`scripts/ci-con-base.sh:59–70`): `prisma migrate deploy` y luego
  `SEED_DEMO_ADMIN=true SEED_DEMO_CONTENT=true SEED_DEMO_PARTNER=true SEED_DEMO_JUDGE=true npm run db:seed` sobre una base
  efímera: los valores nuevos aparecen solos.
- **Base de pruebas compartida (55433):** no se resiembra sola. Una prueba de la 2a que lea un valor nuevo de la base
  fallará en local hasta que alguien corra `npm run db:seed` ahí — que es **escribir** en la base compartida. El plan
  tiene que nombrar quién y cuándo.

**Camino en tiempo de ejecución que existe pero nadie usa desde la app:** `lib/research/protocols.ts:298`
`addVariableCatalogValue`, `:363` `updateVariableCatalogValueDefinition`, `:401` `setVariableCatalogValueAlias`
(permiso `approve_protocol`, con `AuditEvent` en `tx`; los dos de alias rechazan `alias_target_not_in_same_catalog` y
`alias_target_is_itself_an_alias`). `git grep` en `app lib scripts` fuera de `protocols.ts` → sólo un comentario en
`treatments.ts:664`. Los usan las pruebas de `ro1.test.ts` (§9.3–§9.5).

---

## 7. Pruebas y guardias que vigilan catálogos

| archivo | carril | its | qué vigila |
|---|---|---|---|
| `tests/traceability/catalogos-de-intervencion-existen.test.ts` | hermético (`ci.sh`; no está en `pruebas-por-compuerta.txt`) | `"el análisis ve los dos lados"` (≥20 claves sembradas, ≥8 de intervención, control `condicion_oxigeno`/`manejo_temperatura`); `"ninguna clave de la lista apunta a un catálogo que no existe"`; `"y ninguno de ellos está sembrado sin valores, que se pintaría igual de vacío"`; `"la cepa de levadura se puede registrar contra un lote, y MP72 está en el vocabulario"` | que cada clave de `CATALOGOS_DE_INTERVENCION` esté en `VARIABLE_CATALOGS` con ≥1 valor. **Un catálogo nuevo en la lista sin su entrada en `catalogs.ts` lo pone en rojo.** |
| `tests/arquitectura/motivos-de-devolucion-traducidos.test.ts` | hermético | `"control: se encontró el catálogo, el formulario, su prefijo y su espacio de nombres"`; `it.each(valores)("el motivo «%s» tiene su rótulo, no vacío, en es.json y en en.json")` | rótulo es/en por valor de `motivo_devolucion_a_secado`, leyendo el prefijo de `DevolverASecadoForm`. **Es el precedente** para traducir valores de catálogo (p. ej. `tipo_paso`). |
| `tests/apiary/origenDeColonia.test.ts` | `base-sembrada` | `"está sembrado, no sólo declarado"` (declarado en `catalogs.ts` == sembrado en la base, ordenados) | el patrón «declarado y sembrado coinciden». Un valor quitado del archivo y vivo en la base lo pone en rojo. |
| `tests/traceability/lotProcess.test.ts` | `base-sembrada` | `"ofrece exactamente los tres motivos del catálogo, cada uno con su id"` (l. 645, con control sobre el catálogo sembrado); `"rechaza en el grado un valor que es de otro catálogo"` (l. 682); `"rechaza en el estado de cereza un valor de otro catálogo"` (l. 688); los dos de intervención (§3) | catálogo correcto por campo |
| `tests/research/ro1.test.ts` | `base-sembrada` | §9.3 `"addVariableCatalogValue inserts a row…"`; §9.4 `"updateVariableCatalogValueDefinition…"`; §9.5 `"setVariableCatalogValueAlias still links/resolves two values within a catalog…"`; RO1.1 §5.3/§5.4 (definiciones de `honey_color`, ningún alias color↔%) | el mecanismo de catálogo |
| `tests/research/ro1-2.test.ts` | **`datos-reales` (no corre en CI)** | §5.5 `"both exist as separate, non-aliased VariableCatalogValue rows with distinguishing definitions"` (anaerobico ≠ maceracion_carbonica); §5.7 `"recordWashMedium requires a source lot for mosto_de_otro_lote and forbids one for mosto_propio"`; §5.11 `"real (non-TEST) Locations, Organizations, and VariableCatalogs are unaffected by this run"` | que dos valores NO se aliasen; dependencia por cadena de `mosto_de_otro_lote` |
| `tests/traceability/selection.test.ts` | `base-sembrada` | crea un alias de `flotadores` (l. 199) | lectura con alias |
| `tests/traceability/mensajesDeProceso.test.ts` | hermético | `claveDeErrorDeProceso` por cada código de `CODIGOS_DE_PROCESO_TRADUCIDOS` | los códigos de error nuevos de la 2a |
| `tests/arquitectura/catalogos-con-contrato.test.ts` | hermético | `"cada tabla registrada tiene dueño anulable, procedencia y retiro"`; `"ningún archivo de lib/ ni app/ borra una tabla de catálogo"`; `"está mirando de verdad"` | **otro** sistema de catálogos (`lib/catalogos/registro.ts`, hoy sólo `EquipmentModel`); **no** cubre `VariableCatalog`. Ver S6. |

---

## 8. Afirmaciones del §1 que me tocaban

| # | afirmación | veredicto | evidencia |
|---|---|---|---|
| 5a | `LotProcessIntervention` (`schema.prisma:4238`) registra, con `registrarIntervencion` (`lotProcess.ts:324`), «flotado, despulpado, reposo, mover a sombra», con un valor de los `CATALOGOS_DE_INTERVENCION` | **parcial** | Tabla y función existen (hoy `schema.prisma:4269`, `lotProcess.ts:339`; en `85eab6da` eran 4238 y **333**, no 324). La frase es el **comentario** (`schema.prisma:4259–4261`, `lotProcess.ts:331–332`), no el vocabulario: `CATALOGOS_DE_INTERVENCION` son 9 **claves** con 44 valores, y ninguno es despulpado, reposo ni mover a sombra; «flotado» sólo existe como rango observado (`cereza_flotado`: `sin_flotadores`, `<2%`…). |
| 5b | `FermentationIntervention` registra lo que pasa dentro de una fermentación, con tipos que incluyen `inoculation` y `addition` | **cierta** | enum `schema.prisma:4021–4032` (`inoculation`, `agitation`, `purge`, `addition`, `sample`, `transfer`, `termination`, `other`); modelo `:4512`. Con matices: sin auditoría, sin transacción, sin comprobar que la corrida siga abierta, sin catálogo (no dice qué cepa ni qué sustancia) y la pantalla no tiene notas. |
| 6 | Los catálogos de ejes ya existen en `catalogs.ts`: `condicion_oxigeno`, `manejo_temperatura` (con `cold_hold_prefermentativo`), `fuente_microbiana`, `sustrato_anadido` (con `doble_mosto`), `estado_cereza`, `medio_lavado` (con `mosto_de_otro_lote`), `recipiente`; y un comentario de `lotProcess.ts` recuerda «la lista ya está de antes» | **cierta** | `catalogs.ts:229, 254 (260), 281, 302 (313), 319, 327 (341), 46`; comentario `lotProcess.ts:42–58`. Matiz: `recipiente` son recipientes concretos de una finca, no tipos (S3). |
| 7 | `VariableCatalogValueDef` (`catalogs.ts:20–36`) sólo tiene `value`, `definition`, `aliasOf`, `displayOrder` e `impliesUnknownIdentity` | **parcial** | El tipo (`catalogs.ts:17–36`) tiene `value`, `impliesUnknownIdentity?`, `aliasOf?`, `definition?` — **no `displayOrder`**. `displayOrder` es columna de la base (`schema.prisma:9197`) y la escribe la semilla con el índice (`seed.ts:97–117`). La conclusión del diseño (no hay dónde guardar «ejes por tipo») sigue en pie. |
| §7 | El despulpado y el lavado aún no están en el catálogo de intervenciones | **cierta**, con un error de premisa | Medido: 0 de 44 valores casan `/despulp|lavad|desmuc|mucil/`; control: el mismo patrón encuentra `despulpada` (en `estado_cereza`, fuera de la lista) y la clave `medio_lavado`. Pero **no hay «un» catálogo de intervenciones**: hay 9, y ninguno es el sitio natural de un acto como «despulpado» (S1). |

---

## 9. Sorpresas — lo que el diseño no prevé y cambia el plan

**S1. «El catálogo de intervenciones gana despulpado, desmucilaginado y lavado» no tiene dónde caer.**
No existe tal catálogo: son 9 claves que describen *ejes* (oxígeno, temperatura, medio, inoculación, sustrato,
recipiente, levadura) y *observaciones* (flotado, selección). Despulpar o lavar no es un valor de ninguno. Las salidas
son tres y **cada una es una decisión de Daniel**:
(a) un catálogo nuevo de actos de manejo añadido a la lista — que es lo que él rechazó el 2026-09-07 con
`intervencion_de_proceso` (`lotProcess.ts:44–51`), aunque aquel rechazo era porque la lista ya existía;
(b) meterlos en un catálogo que no les corresponde (contaminaría un eje);
(c) que el acto lo diga el nuevo `stepType` del registro y `catalogValueId` pase a anulable — cambio de esquema sobre
una columna `NOT NULL` (`migration.sql:42`).
Además `tipo_paso` (D1) ya trae `pulping`, `demucilage`, `washing`: si la intervención lleva `stepType`, un valor
«despulpado» en otro catálogo sería **el mismo dato dos veces**.

**S2. `modo_secado` ya existe como enum, y la 2a crearía un tercero.** `enum DryingEnvironment`
(`schema.prisma:756–767`, esquema `core`): `solar_greenhouse`, `dark_room_climate_controlled`, `open_patio`,
`covered_patio`, `mechanical_dryer`, `african_bed_outdoor` (cama africana), `floor_tarp`. Lo usa
`Location.dryingEnvironment` (`schema.prisma:932`, con comentario «Es lo que hoy vive como texto libre en
`DryingRun.method`») y las pantallas de `app/instalaciones/`, validado por `AMBIENTES_DE_SECADO = Object.values(DryingEnvironment)`
(`lib/traceability/secadoForm.ts:9`). Y `DryingRun.method String?` (`'raised_bed' | 'patio' | 'mechanical' | free text`).
Hay también `enum DryingVentilation` (`schema.prisma:5884`). El «G `modoSecado` (cama africana, patio, marquesina…)»
del diseño es **exactamente** `DryingEnvironment` — la misma equivocación del 2026-09-07 que §7 dice evitar.

**S3. `recipiente` son instancias, no tipos, y ya hay una tabla de equipos.** Sus seis valores son recipientes concretos
de una finca (`Tanque I`…`GrainProBag`, mapeados por el importador de Cafelino), y `FermentationRun.vesselEquipmentId`
apunta a `Equipment` (`kind = vessel`). Añadir «cama africana, sacos de cosecha, bolsa anaeróbica» (§7) mezclaría
**tipos** con **unidades** en el mismo catálogo; y «cama africana» es además `DryingEnvironment.african_bed_outdoor` y
un `Location` de tipo `drying_bed`. Para la 2c, `EquipmentModel` **sí** guarda capacidad (`capacityValue`,
`capacityUnit`) y `EquipmentModelSpec` rangos — la frase E4 «`Equipment` no guarda ninguna capacidad» es cierta para
`Equipment` y falsa para su modelo.

**S4. «Adición: sustancia → `sustrato_anadido`, cantidad, unidad» choca con una regla escrita.** `sustrato_anadido`
tiene tres **categorías** (`ninguno`, `co_fermentacion`, `doble_mosto`), no sustancias. La sustancia con cantidad y
unidad ya se modela como `ConsumableMaterial` + `MaterialConsumptionEntry` (que cuelga de `fermentationRunId` o
`dryingRunId`), y su migración dice literalmente que un material **no** es un `variable_catalog_value`
(`prisma/migrations/20260917200000_material_consumible/migration.sql:17–20`). Las filas de adición de la 2a tienen que
elegir entre categoría (catálogo) y material (inventario), o llevar las dos.

**S5. El alias no cruza catálogos, y la semilla lo hace explotar en producción.** §7 propone «"mosto de otro fermento"
… es `mosto_de_otro_lote` de `medio_lavado`, y se pone como alias» desde `fuente_microbiana`, y sinónimos que apuntan
«a `doble_mosto` / `mosto_de_otro_lote` según el caso» (catálogos distintos). La semilla resuelve `aliasOf` **sólo en
el mismo catálogo** y **lanza** si no lo encuentra (`seed.ts:120–133`); `addVariableCatalogValue` y
`setVariableCatalogValueAlias` lo rechazan con `alias_target_not_in_same_catalog`. En `vercel-build.sh` la semilla corre
**después** de `migrate deploy`, con `set -e`: un alias cruzado deja la base migrada y el despliegue sin promover.
Y «mosto propio» como valor nuevo de `fuente_microbiana` duplicaría `medio_lavado.mosto_propio`.

**S6. Hay un segundo sistema de «catálogos» y la 2a tiene que elegir.** `lib/catalogos/registro.ts` +
`tests/arquitectura/catalogos-con-contrato.test.ts` (spec `docs/superpowers/specs/2026-09-18-catalogos-y-modelos-de-equipo-design.md`):
tablas de referencia con `organizationId` anulable (compartida/propia), `provenanceClass`, `retiredAt`, y prohibido
borrarlas. Es el patrón de §3.4 («plantillas con `organizationId` nulo») y probablemente el natural para
`capacidad` (2c). `VariableCatalog` es otra cosa: global, sin dueño, sin retiro, sólo semilla.

**S7. La flotación con pesos no puede ocurrir bajo un proceso abierto.** La flotación «de verdad» es una
`LotTransformation` de tipo `selection` con `seleccion_metodo = flotacion` y pesos (`recordSelection`), y
`antesDeTransformar` la **rechaza** con `seleccion_bajo_proceso_abierto` si un proceso abierto cubre el lote
(`lib/traceability/procesoDelLinaje.ts:611`). Bajo una receta, un paso `sorting_flotation` sólo puede cumplirlo una
`LotProcessIntervention` con un rango de `cereza_flotado` (observación, sin pesos). La tabla 4.1 del diseño no
distingue las dos; o el paso es anterior al proceso (como la recepción de 4.5), o es sólo observación.

**S8. `recordFermentationIntervention` no audita.** Si la 2a le añade `stepType`, `recipeStepId` y
`motivoDesviacion` (4.1), una desviación quedaría sin `AuditEvent`, y el guardián de 4.2 (que debe leer el proceso
vigente) necesita una transacción que hoy no existe. Tampoco comprueba que la corrida siga abierta. Es trabajo de la
2a, no un detalle.

**S9. `registrarIntervencion` decide «cerrado» fuera de la transacción y sin bloqueo.** El guardián de 4.2 («el paso es
de la versión del proceso **vigente**») hereda esa carrera si no se mueve dentro, con `bloquearLinaje`, como
`cerrarProceso`.

**S10. `estado_cereza` es una columna obligatoria al abrir, no un eje de paso.** §7 propone añadirle «en mucílago,
lavado»; eso aparece en el desplegable **obligatorio** de abrir proceso (`opcionesParaProceso` → `estadosDeCereza`) y
cambia lo que significa `LotProcess.cherryStateValueId` («cómo entra el café»). El eje A del paso puede reusar el
catálogo, pero el plan tiene que decir si el formulario de abrir debe ofrecer los valores nuevos.

**S11. Las etiquetas de intervención no se traducen.** `opcionesParaProceso` rotula `${catalog.name} · ${value}`
(crudo, en el idioma de la semilla) e incluye alias. §6 pide «textos en es y en»; el precedente que sí traduce valores
de catálogo es `motivos-de-devolucion-traducidos.test.ts`. Para `tipo_paso` y los ejes en la pantalla de pasos hará falta
ese mismo mecanismo y su guardia.

**S12. Ninguna prueba vigila tres cosas que la 2a va a tocar:** el `AuditEvent` de `lot_process.record_intervention`
(0 apariciones en `tests/`), el permiso de `registrarIntervencion` del proceso, y la lista
`opcionesParaProceso().intervenciones`. Y las tres copias del tipo de intervención de fermentación (enum, unión de TS,
constante de la página) no tienen guardia que las ate.

---

## Cobertura

Leído entero: el diseño de la 2a; `lib/research/catalogs.ts` (712 líneas); `lib/traceability/lotProcess.ts` 1–470 y
700–830 y 950–1000; los bloques de esquema citados; `seedVariableCatalogs`; `scripts/vercel-build.sh`;
`tests/traceability/catalogos-de-intervencion-existen.test.ts`; `tests/arquitectura/motivos-de-devolucion-traducidos.test.ts`;
`tests/arquitectura/catalogos-con-contrato.test.ts`; las funciones de catálogo de `lib/research/protocols.ts`.
Leído en parte: `tests/traceability/lotProcess.test.ts` (listado de `it` y los bloques citados),
`tests/traceability/fermentation.test.ts`, `app/lots/[id]/page.tsx` (1140–1190), `app/lots/[id]/process/page.tsx`
(185–230), `ProcesoDelLote.tsx` (120–200), `scripts/ci-con-base.sh`, `scripts/pruebas-por-compuerta.txt` (grupos).
Del diseño de la Parte 1 sólo lo que nombra intervenciones y catálogos (§R6.5, tabla de R7).
No leído: la base de datos (prohibido): todo lo dicho sobre «lo sembrado» se deduce del archivo y la semilla, no se
midió en una base. Tampoco `docs/beneficio/*` ni el paquete «farm-to-green v2».
