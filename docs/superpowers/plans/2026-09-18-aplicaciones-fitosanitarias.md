# Manejo fitosanitario de la parcela (PR A) — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA:
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`.
> Los pasos usan casillas (`- [ ]`).

**Objetivo:** que cada intervención contra una plaga en una parcela —aplicación,
liberación biológica o manejo cultural— quede registrada con sus productos, su
carencia y su reentrada; que una cosecha dentro de la carencia se guarde marcada;
y que el tablero y la jornada avisen de la reentrada.

**Arquitectura:** tres tablas nuevas en `traceability` (`PlotIntervention`, sus
áreas y sus líneas) más la marca de la cosecha (`HarvestWithdrawalFlag`). El
catálogo de productos **es `ConsumableMaterial`**, al que se le añaden dos
columnas. La aritmética de carencia se vuelve **un módulo puro compartido** con el
apiario. Los avisos siguen siendo calculados, nunca guardados.

**Stack:** Next.js 16 · React 19 · Prisma 7 · Postgres · vitest · next-intl.

**Spec:** `docs/superpowers/specs/2026-09-18-aplicaciones-fitosanitarias-design.md`.
Este plan es su **PR A** (§6). El **PR B** —áreas por bloque, `TrapRule.suggestedMaterialId`
y el aviso de trampa atendido— espera a que `PlotBlock` y `TrapRule` existan en
`main` (plan `2026-09-17-trampas-de-broca.md`) y lleva su propio plan.

## Restricciones globales

- **Nulo = no declarada; 0 = declarada cero.** Ninguna columna de carencia ni de
  reentrada lleva `DEFAULT 0`. Un cero por defecto convertiría «nadie lo dijo» en
  «dijo cero».
- **`desconocida` nunca pasa a `cumplida` por el paso del tiempo** (spec §3.2).
- **El servicio no rellena carencia ni reentrada** con las del producto. Las
  precarga el formulario, **a la vista**.
- **Avisa, no bloquea**: ni la cosecha en carencia, ni la reentrada, ni el frasco
  vencido.
- **Nunca se edita en sitio.** Corregir es una fila nueva con `correctsId` y un
  motivo.
- **Toda escritura va con su `recordAuditEvent` dentro de la misma
  `$transaction`**, pasando `tx`.
- **SQL a mano con los nombres de la convención** (`<tabla>_<columna>_fkey`), y
  cada `CHECK` con nombre propio.
- **Ninguna cifra ni producto de las guías** entra al código. El único
  vocabulario de dominio es el de Daniel (spec §2.5), copiado tal cual.
- **Cada prueba con base nueva va al grupo `base-sembrada`** de
  `scripts/pruebas-por-compuerta.txt` **en la misma tarea**. Si no va, `scripts/ci.sh`
  la corre sin base y CI se pone rojo por una razón que no es el cambio (ver
  `CLAUDE.md`, «Una prueba nueva que necesita base…»).
- **`npm run verify` y `npm run build` en toda tarea que toque TypeScript.**
  `vitest` no comprueba tipos, y `next build` caza lo que `verify` no ve (un
  archivo `"use server"` sólo puede exportar funciones `async`).
- **Commitear ANTES de mutar**, y el arnés de flip imprime tres cosas: el sha del
  archivo antes y después, si compila, y **qué prueba cayó por su nombre**.
- **La base de pruebas compartida puede ir por delante de git.** Antes de
  «repararla», comparar las migraciones aplicadas con las del disco.

Comandos (Node no está en el PATH):

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test
```

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma` + migración `…_manejo_fitosanitario` | tres enums, tres tablas, la marca de cosecha, dos columnas en el material, la FK en `FieldEvent` |
| `lib/research/catalogs.ts` | el valor `manejo_fitosanitario` en `event_kind` |
| `lib/time/carencia.ts` | **nuevo**, puro: `libreDesdeDe`, `diasQueFaltanDe`, `libreDeReentradaDesde` |
| `lib/apiary/carencia.ts` | reexporta las dos primeras; nada más cambia |
| `lib/traceability/carenciaDeIntervencion.ts` | **nuevo**, puro: `carenciaDeIntervencion`, `reentradaDeIntervencion` |
| `lib/traceability/ubicacionesEmparentadas.ts` | **nuevo**: la ubicación, sus ascendientes y sus descendientes |
| `lib/inventario/materiales.ts`, `lib/inventario/recepcion.ts` | el producto fitosanitario y sus campos |
| `app/actions/inventario.ts`, `app/inventario/recibir/page.tsx`, `app/components/inventario/RecibirMedicamentoForm.tsx` | recibir un producto fitosanitario |
| `lib/traceability/intervenciones.ts` | **nuevo**: registrar, corregir, leer vigentes, listar |
| `lib/traceability/harvest.ts` | la marca de carencia en la cosecha |
| `lib/traceability/pendienteDeLaParcela.ts` | tres avisos nuevos |
| `app/actions/manejo.ts` | **nuevo**: las acciones de servidor |
| `app/plots/[id]/page.tsx`, `app/plots/[id]/manejo/nuevo/page.tsx`, `app/plots/[id]/manejo/[interventionId]/page.tsx`, `app/components/traceability/IntervencionForm.tsx` | las pantallas |
| `app/field-sessions/[id]/page.tsx`, `app/lots/[id]/page.tsx` | la reentrada en la jornada y la marca en la cosecha |
| `messages/es.json`, `messages/en.json` | textos |
| `docs/architecture/DECISIONS.md`, `SESSION_STATE.md` | el ADR y el estado |

---

## Tarea 1: El esquema

**Archivos:**
- Modificar: `prisma/schema.prisma`
- Crear: `prisma/migrations/<AAAAMMDDhhmmss>_manejo_fitosanitario/migration.sql`
- Modificar: `lib/research/catalogs.ts` (valor nuevo en `event_kind`)
- Prueba: `tests/traceability/manejoEsquema.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` (la prueba, al grupo `base-sembrada`)

**Interfaces:**
- Produce: los modelos Prisma `PlotIntervention`, `PlotInterventionArea`,
  `PlotInterventionLine`, `HarvestWithdrawalFlag`; los enums
  `PlotInterventionKind`, `PlotInterventionTarget`, `PlotInterventionMethod`;
  `ConsumableMaterial.isPlantProtection` y `.defaultReentryHours`;
  `FieldEvent.plotInterventionId`.

- [ ] **Paso 1: el esquema.** En `prisma/schema.prisma`, cerca de `LabourEntry`
  (esquema `traceability`):

```prisma
/// Qué clase de intervención. Decisión de Daniel, 2026-09-18: entran las cuatro
/// —productos comprados, preparados de finca, liberaciones y manejo cultural—, y
/// las dos primeras son la misma clase aquí (`aplicacion`): lo que las distingue
/// es el producto, no el acto.
enum PlotInterventionKind {
  aplicacion
  liberacion
  manejo_cultural

  @@schema("traceability")
}

/// Contra qué. **La lista es de Daniel**, 2026-09-18, spec §2.5, con la
/// procedencia de cada nombre. No se añade nada sin él; crecer es una línea.
enum PlotInterventionTarget {
  arana_roja
  broca
  minador_hoja
  cochinillas
  nematodos
  jobotos
  roya
  ojo_de_gallo
  mancha_de_hierro
  antracnosis
  llaga_macana
  chasparria
  otro

  @@schema("traceability")
}

/// Cómo se aplicó. Opcional. Las formas que nombran las guías de Anacafé, sin
/// ninguna de sus cifras.
enum PlotInterventionMethod {
  follaje
  tronco
  suelo
  riego
  cebo
  liberacion
  manual
  otro

  @@schema("traceability")
}

/// Una intervención contra una plaga en una parcela — spec §2.1.
///
/// **Nunca se edita en sitio.** Una corrección es otra fila con `correctsId` y
/// motivo, igual que `Measurement`. Vigente = ninguna fila la corrige.
model PlotIntervention {
  id         String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId String               @map("location_id") @db.Uuid
  location   Location             @relation("PlotInterventionLocation", fields: [locationId], references: [id])
  kind       PlotInterventionKind
  target     PlotInterventionTarget
  targetNote String?              @map("target_note")
  method     PlotInterventionMethod?
  mixVolume  Decimal?             @map("mix_volume") @db.Decimal(10, 3)
  mixUnit    String?              @map("mix_unit")
  occurredAt DateTime             @map("occurred_at")

  operatorPersonId String?       @map("operator_person_id") @db.Uuid
  operator         Person?       @relation("PlotInterventionOperator", fields: [operatorPersonId], references: [id])
  fieldSessionId   String?       @map("field_session_id") @db.Uuid
  fieldSession     FieldSession? @relation("PlotInterventionSession", fields: [fieldSessionId], references: [id])
  /// La lectura de trampa que la motivó. Procedencia, no mecanismo (spec §2.1).
  motivoObservationId String?              @map("motivo_observation_id") @db.Uuid
  motivoObservation   SpecimenObservation? @relation("PlotInterventionMotivo", fields: [motivoObservationId], references: [id])

  provenanceClass ProvenanceClass @map("provenance_class")
  dataQuality     DataQuality?    @map("data_quality")
  notes           String?

  correctsId       String?            @map("corrects_id") @db.Uuid
  corrects         PlotIntervention?  @relation("PlotInterventionCorrection", fields: [correctsId], references: [id])
  correcciones     PlotIntervention[] @relation("PlotInterventionCorrection")
  correctionReason String?            @map("correction_reason")

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("PlotInterventionCreatedBy", fields: [createdBy], references: [id])

  areas         PlotInterventionArea[]
  lineas        PlotInterventionLine[]
  marcasDeCosecha HarvestWithdrawalFlag[]
  fieldEvents   FieldEvent[]

  @@index([locationId, occurredAt])
  @@index([correctsId])
  @@map("plot_intervention")
  @@schema("traceability")
}

/// Dónde, dentro de la parcela. Sin filas = la parcela entera (spec §2.2).
///
/// **En el PR A sólo plantas.** El bloque llega en el PR B, cuando `PlotBlock`
/// exista: entonces `specimenId` pasa a anulable, entra `plotBlockId` y el CHECK
/// de «exactamente uno».
model PlotInterventionArea {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  interventionId String           @map("intervention_id") @db.Uuid
  intervention   PlotIntervention @relation(fields: [interventionId], references: [id])
  specimenId     String           @map("specimen_id") @db.Uuid
  specimen       Specimen         @relation("PlotInterventionAreaSpecimen", fields: [specimenId], references: [id])

  @@unique([interventionId, specimenId])
  @@map("plot_intervention_area")
  @@schema("traceability")
}

/// Una línea por producto de la mezcla (spec §2.3).
model PlotInterventionLine {
  id              String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  interventionId  String             @map("intervention_id") @db.Uuid
  intervention    PlotIntervention   @relation(fields: [interventionId], references: [id])
  materialId      String             @map("material_id") @db.Uuid
  material        ConsumableMaterial @relation("PlotInterventionLineMaterial", fields: [materialId], references: [id])
  consumableLotId String?            @map("consumable_lot_id") @db.Uuid
  consumableLot   ConsumableLot?     @relation("PlotInterventionLineLot", fields: [consumableLotId], references: [id])
  quantity        Decimal?           @db.Decimal(10, 3)
  unit            String?
  /// Nulo = no declarada; 0 = declarada cero. Sin DEFAULT, a propósito.
  withdrawalDays  Int?               @map("withdrawal_days")
  reentryHours    Int?               @map("reentry_hours")
  /// Copia de `ColonyEvent.treatmentLotExpiredAtApplication`. CHECK: exige frasco.
  lotExpiredAtApplication Boolean?   @map("lot_expired_at_application")

  @@index([interventionId])
  @@map("plot_intervention_line")
  @@schema("traceability")
}

/// La marca de carencia de una cosecha: una fila por intervención todavía en
/// carencia al cosechar (spec §3.4). **`diasQueFaltaban` nulo = desconocida**; sin
/// filas = no había ninguna. Es una foto: no se recalcula.
model HarvestWithdrawalFlag {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  harvestEventId  String           @map("harvest_event_id") @db.Uuid
  harvestEvent    HarvestEvent     @relation(fields: [harvestEventId], references: [id])
  interventionId  String           @map("intervention_id") @db.Uuid
  intervention    PlotIntervention @relation(fields: [interventionId], references: [id])
  diasQueFaltaban Int?             @map("dias_que_faltaban")

  @@unique([harvestEventId, interventionId])
  @@map("harvest_withdrawal_flag")
  @@schema("traceability")
}
```

  Y los lados inversos, cada uno junto a las relaciones que ya tiene su modelo:
  `Location.plotInterventions PlotIntervention[] @relation("PlotInterventionLocation")`;
  `Person.plotInterventionsOperadas PlotIntervention[] @relation("PlotInterventionOperator")`;
  `FieldSession.plotInterventions PlotIntervention[] @relation("PlotInterventionSession")`;
  `SpecimenObservation.intervencionesMotivadas PlotIntervention[] @relation("PlotInterventionMotivo")`;
  `UserAccount.plotInterventionsCreadas PlotIntervention[] @relation("PlotInterventionCreatedBy")`;
  `Specimen.intervencionesSobreElla PlotInterventionArea[] @relation("PlotInterventionAreaSpecimen")`;
  `ConsumableMaterial.lineasDeIntervencion PlotInterventionLine[] @relation("PlotInterventionLineMaterial")`;
  `ConsumableLot.lineasDeIntervencion PlotInterventionLine[] @relation("PlotInterventionLineLot")`;
  `HarvestEvent.marcasDeCarencia HarvestWithdrawalFlag[]`.

  En `ConsumableMaterial`, después de `avisarDiasAntes`:

```prisma
  /// Producto de manejo fitosanitario. Gemela de `isVeterinaryMedicine`: separa
  /// lo que se ofrece al registrar una intervención del aserrín y la gallinaza.
  isPlantProtection   Boolean @default(false) @map("is_plant_protection")
  /// Horas de reentrada por defecto. Nulo = no declarada; 0 = declarada cero.
  defaultReentryHours Int?    @map("default_reentry_hours")
```

  En `FieldEvent`, junto a `varroaCountId`:

```prisma
  /// Una intervención fitosanitaria hecha durante la jornada entra en ella —
  /// mismo molde que A9.1.
  plotInterventionId String?           @map("plot_intervention_id") @db.Uuid
  plotIntervention   PlotIntervention? @relation(fields: [plotInterventionId], references: [id])
```

- [ ] **Paso 2: la migración.**

```bash
npx prisma migrate dev --create-only --name manejo_fitosanitario
```

  Revisar el SQL generado y **añadir a mano** al final, con esta cabecera de
  comentario en el archivo:

```sql
-- Manejo fitosanitario de la parcela, PR A. Spec 2026-09-18.
-- Carencia y reentrada: nulo = no declarada, 0 = declarada cero. Sin DEFAULT.
-- Los CHECK viven en la base: un importador o SQL directo se salta el servicio.

ALTER TABLE "traceability"."consumable_material"
  ADD CONSTRAINT "consumable_material_reentrada_no_negativa"
  CHECK ("default_reentry_hours" IS NULL OR "default_reentry_hours" >= 0);

ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_carencia_no_negativa"
  CHECK ("withdrawal_days" IS NULL OR "withdrawal_days" >= 0);
ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_reentrada_no_negativa"
  CHECK ("reentry_hours" IS NULL OR "reentry_hours" >= 0);
ALTER TABLE "traceability"."plot_intervention_line"
  ADD CONSTRAINT "plot_intervention_line_marca_de_vencimiento_exige_frasco"
  CHECK ("consumable_lot_id" IS NOT NULL OR "lot_expired_at_application" IS NULL);

ALTER TABLE "traceability"."harvest_withdrawal_flag"
  ADD CONSTRAINT "harvest_withdrawal_flag_dias_no_negativos"
  CHECK ("dias_que_faltaban" IS NULL OR "dias_que_faltaban" > 0);

-- Una corrección lleva motivo. «Otro» lleva su nota.
ALTER TABLE "traceability"."plot_intervention"
  ADD CONSTRAINT "plot_intervention_correccion_con_motivo"
  CHECK ("corrects_id" IS NULL OR length(btrim("correction_reason")) > 0);
ALTER TABLE "traceability"."plot_intervention"
  ADD CONSTRAINT "plot_intervention_otro_con_nota"
  CHECK ("target" <> 'otro' OR length(btrim("target_note")) > 0);
```

  Comprobar que las FK nuevas del SQL generado **se llamen** según la convención
  y que las de evidencia (`plot_intervention_line.consumable_lot_id`,
  `harvest_withdrawal_flag.intervention_id`) sean `ON DELETE RESTRICT`: no se
  borra el frasco de una aplicación, ni la aplicación que marcó una cosecha.

- [ ] **Paso 3: el valor de catálogo.** En `lib/research/catalogs.ts`, en
  `event_kind`, antes de `otro`:

```ts
      { value: "manejo_fitosanitario", definition: "Una intervención contra una plaga en la parcela. Lo que se hizo vive en PlotIntervention." },
```

  (Producción lo recibe sola: `scripts/vercel-build.sh` siembra los catálogos en
  cada despliegue.)

- [ ] **Paso 4: la prueba de los CHECK, en rojo.** `tests/traceability/manejoEsquema.test.ts`.
  Cada `CHECK` se prueba **dos veces**: una fila que lo viola se rechaza, **y la
  fila válida de al lado entra**. Sin la segunda mitad, «no entró» puede ser un
  fixture roto.

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `mesq-${Date.now()}`;
let organizationId: string;
let parcelaId: string;
let materialId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const p = await prisma.location.create({
    data: { name: `TEST Parcela (${RUN_ID})`, locationType: "plot", classification: "internal", organizationId },
  });
  parcelaId = p.id;
  const m = await prisma.consumableMaterial.create({
    data: { organizationId, name: `Prod ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true },
  });
  materialId = m.id;
}, 30000);

afterAll(async () => {
  const ints = await prisma.plotIntervention.findMany({ where: { locationId: parcelaId }, select: { id: true } });
  const ids = ints.map((i) => i.id);
  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ correctsId: { in: ids } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: parcelaId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const intervencion = (over: Record<string, unknown> = {}) =>
  prisma.plotIntervention.create({
    data: {
      locationId: parcelaId, kind: "aplicacion", target: "broca",
      occurredAt: new Date("2026-09-01T15:00:00Z"), provenanceClass: "original_record", ...over,
    },
  });

describe("los CHECK del manejo fitosanitario viven en la base", () => {
  it("carencia negativa se rechaza; cero entra", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, withdrawalDays: -1 } }))
      .rejects.toThrow(/plot_intervention_line_carencia_no_negativa/);
    const ok = await prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, withdrawalDays: 0 } });
    expect(ok.withdrawalDays).toBe(0);
  });

  it("reentrada negativa se rechaza; nula entra y SIGUE nula", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, reentryHours: -2 } }))
      .rejects.toThrow(/plot_intervention_line_reentrada_no_negativa/);
    const ok = await prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId } });
    expect(ok.reentryHours).toBeNull();
    expect(ok.withdrawalDays).toBeNull();
  });

  it("marca de vencimiento sin frasco se rechaza", async () => {
    const i = await intervencion();
    await expect(prisma.plotInterventionLine.create({ data: { interventionId: i.id, materialId, lotExpiredAtApplication: true } }))
      .rejects.toThrow(/marca_de_vencimiento_exige_frasco/);
  });

  it("`otro` sin nota se rechaza; con nota entra", async () => {
    await expect(intervencion({ target: "otro" })).rejects.toThrow(/plot_intervention_otro_con_nota/);
    const ok = await intervencion({ target: "otro", targetNote: "hormiga arriera" });
    expect(ok.targetNote).toBe("hormiga arriera");
  });

  it("corrección sin motivo se rechaza; con motivo entra", async () => {
    const original = await intervencion();
    await expect(intervencion({ correctsId: original.id, correctionReason: "  " }))
      .rejects.toThrow(/plot_intervention_correccion_con_motivo/);
    const ok = await intervencion({ correctsId: original.id, correctionReason: "la hora era otra" });
    expect(ok.correctsId).toBe(original.id);
  });

  it("reentrada por defecto negativa en el producto se rechaza", async () => {
    await expect(prisma.consumableMaterial.create({
      data: { organizationId, name: `Neg ${RUN_ID}`, defaultUnit: "l", defaultReentryHours: -1 },
    })).rejects.toThrow(/consumable_material_reentrada_no_negativa/);
  });
});
```

- [ ] **Paso 5: verla caer** antes de migrar (`Unknown argument` o la tabla que
  no existe), después aplicar y verla pasar:

```bash
npx vitest run tests/traceability/manejoEsquema.test.ts   # rojo: la tabla no existe
npx prisma migrate dev && npx prisma generate
npx vitest run tests/traceability/manejoEsquema.test.ts   # 6/6
```

- [ ] **Paso 6:** la ruta de la prueba, al grupo `base-sembrada` de
  `scripts/pruebas-por-compuerta.txt`. Correr `bash scripts/ci.sh` y comprobar que
  la prueba **no** sale en su salida. Después `npm run verify` y `npm run build`.

- [ ] **Paso 7: commit**, y **después** el flip-test: quitar del SQL, en una base
  desechable, `plot_intervention_otro_con_nota`, y ver caer **por su nombre**
  «`otro` sin nota se rechaza». Restaurar con `git checkout --`.

```bash
git add prisma/schema.prisma prisma/migrations/<carpeta>/migration.sql lib/research/catalogs.ts tests/traceability/manejoEsquema.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat     # cinco archivos; si son más, parar
git commit -F <archivo-con-el-mensaje>
```

---

## Tarea 2: La aritmética pura

**Archivos:**
- Crear: `lib/time/carencia.ts`
- Modificar: `lib/apiary/carencia.ts` (mueve dos funciones, las reexporta)
- Crear: `lib/traceability/carenciaDeIntervencion.ts`
- Prueba: `tests/traceability/carenciaDeIntervencion.test.ts` (**hermética**: no va
  a `pruebas-por-compuerta.txt`)

**Interfaces:**
- Consume: el enum `PlotInterventionKind` de la Tarea 1 (tipo generado).
- Produce:

```ts
// lib/time/carencia.ts
export function libreDesdeDe(aplicadoEl: Date, diasDeCarencia: number): Date;
export function diasQueFaltanDe(libreDesde: Date, enLaFecha: Date): number;
export function libreDeReentradaDesde(aplicadoEl: Date, horas: number): Date;

// lib/traceability/carenciaDeIntervencion.ts
export interface LineaParaCarencia { readonly withdrawalDays: number | null; readonly reentryHours: number | null }
export interface IntervencionParaCarencia {
  readonly id: string;
  readonly kind: PlotInterventionKind;
  readonly occurredAt: Date;
  readonly lineas: readonly LineaParaCarencia[];
}
export type EstadoDeCarencia =
  | { estado: "no_aplica" }
  | { estado: "cumplida"; libreDesde: Date }
  | { estado: "conocida"; libreDesde: Date; diasQueFaltan: number }
  | { estado: "desconocida"; alMenosHasta: Date | null };
export type EstadoDeReentrada =
  | { estado: "no_aplica" }
  | { estado: "cumplida"; libreDesde: Date }
  | { estado: "vigente"; libreDesde: Date }
  | { estado: "desconocida"; alMenosHasta: Date | null };
export function carenciaDeIntervencion(i: IntervencionParaCarencia, enLaFecha: Date): EstadoDeCarencia;
export function reentradaDeIntervencion(i: IntervencionParaCarencia, ahora: Date): EstadoDeReentrada;
```

- [ ] **Paso 1: la prueba, en rojo.**

```ts
import { describe, expect, it } from "vitest";
import { carenciaDeIntervencion, reentradaDeIntervencion, type IntervencionParaCarencia } from "../../lib/traceability/carenciaDeIntervencion";
import { libreDesdeDe, diasQueFaltanDe } from "../../lib/apiary/carencia";

const aplicada = new Date("2026-09-10T15:00:00Z");
const i = (lineas: IntervencionParaCarencia["lineas"], kind: IntervencionParaCarencia["kind"] = "aplicacion"): IntervencionParaCarencia =>
  ({ id: "x", kind, occurredAt: aplicada, lineas });

describe("carenciaDeIntervencion", () => {
  it("la mezcla manda por la MÁS LARGA, no por la primera", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 3, reentryHours: 0 }, { withdrawalDays: 14, reentryHours: 0 }]), new Date("2026-09-12T15:00:00Z"));
    expect(r).toEqual({ estado: "conocida", libreDesde: new Date("2026-09-24T15:00:00Z"), diasQueFaltan: 12 });
  });

  it("una línea sin declarar la vuelve DESCONOCIDA aunque otra declare, con «al menos hasta»", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 7, reentryHours: 0 }, { withdrawalDays: null, reentryHours: 0 }]), new Date("2026-09-11T15:00:00Z"));
    expect(r).toEqual({ estado: "desconocida", alMenosHasta: new Date("2026-09-17T15:00:00Z") });
  });

  it("todas sin declarar: desconocida sin «al menos»", () => {
    expect(carenciaDeIntervencion(i([{ withdrawalDays: null, reentryHours: null }]), aplicada))
      .toEqual({ estado: "desconocida", alMenosHasta: null });
  });

  it("DESCONOCIDA no pasa a cumplida con el tiempo", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 1, reentryHours: 0 }, { withdrawalDays: null, reentryHours: 0 }]), new Date("2030-01-01T00:00:00Z"));
    expect(r.estado).toBe("desconocida");
  });

  it("cero declarado es cumplida en el acto, no desconocida", () => {
    expect(carenciaDeIntervencion(i([{ withdrawalDays: 0, reentryHours: 0 }]), aplicada))
      .toEqual({ estado: "cumplida", libreDesde: aplicada });
  });

  it("manejo cultural: no aplica, NO desconocida", () => {
    expect(carenciaDeIntervencion(i([], "manejo_cultural"), aplicada)).toEqual({ estado: "no_aplica" });
  });

  it("una intervención POSTERIOR a la fecha no impone carencia sobre ella", () => {
    expect(carenciaDeIntervencion(i([{ withdrawalDays: 30, reentryHours: 0 }]), new Date("2026-09-09T00:00:00Z")))
      .toEqual({ estado: "no_aplica" });
  });

  it("medio día que queda cuenta como un día (redondeo hacia arriba)", () => {
    const r = carenciaDeIntervencion(i([{ withdrawalDays: 1, reentryHours: 0 }]), new Date("2026-09-11T03:00:00Z"));
    expect(r).toMatchObject({ estado: "conocida", diasQueFaltan: 1 });
  });
});

describe("reentradaDeIntervencion", () => {
  it("vigente hasta la hora exacta; cumplida desde ella", () => {
    const x = i([{ withdrawalDays: 0, reentryHours: 4 }, { withdrawalDays: 0, reentryHours: 24 }]);
    expect(reentradaDeIntervencion(x, new Date("2026-09-11T14:59:00Z"))).toEqual({ estado: "vigente", libreDesde: new Date("2026-09-11T15:00:00Z") });
    expect(reentradaDeIntervencion(x, new Date("2026-09-11T15:00:00Z")).estado).toBe("cumplida");
  });
  it("sin declarar: desconocida, para siempre", () => {
    expect(reentradaDeIntervencion(i([{ withdrawalDays: 0, reentryHours: null }]), new Date("2030-01-01T00:00:00Z")).estado).toBe("desconocida");
  });
  it("manejo cultural: no aplica", () => {
    expect(reentradaDeIntervencion(i([], "manejo_cultural"), aplicada)).toEqual({ estado: "no_aplica" });
  });
});

describe("el apiario sigue contando igual tras mover la aritmética", () => {
  it("libreDesdeDe y diasQueFaltanDe se reexportan con el mismo resultado", () => {
    const libre = libreDesdeDe(aplicada, 2);
    expect(libre).toEqual(new Date("2026-09-12T15:00:00Z"));
    expect(diasQueFaltanDe(libre, new Date("2026-09-12T14:00:00Z"))).toBe(1);
  });
});
```

- [ ] **Paso 2: verla caer** con `npx vitest run tests/traceability/carenciaDeIntervencion.test.ts`:
  `Cannot find module '…/carenciaDeIntervencion'`.

- [ ] **Paso 3: mover la aritmética.** Crear `lib/time/carencia.ts` con
  `libreDesdeDe` y `diasQueFaltanDe` **copiadas tal cual** de `lib/apiary/carencia.ts`
  (con sus comentarios y `MS_POR_DIA`), y añadir:

```ts
const MS_POR_HORA = 3_600_000;

/** Cuándo deja de haber reentrada. Instante, no día: se cuenta en horas. */
export function libreDeReentradaDesde(aplicadoEl: Date, horas: number): Date {
  return new Date(aplicadoEl.getTime() + horas * MS_POR_HORA);
}
```

  En `lib/apiary/carencia.ts`, borrar las dos funciones y `MS_POR_DIA` y poner:

```ts
// La aritmética vive en `lib/time/carencia.ts`, compartida con el café: un solo
// sitio decide cuándo deja de haber carencia (spec fitosanitario §3.1).
import { libreDesdeDe, diasQueFaltanDe } from "../time/carencia";
export { libreDesdeDe, diasQueFaltanDe };
```

- [ ] **Paso 4: el módulo puro.** `lib/traceability/carenciaDeIntervencion.ts`:

```ts
/**
 * La carencia y la reentrada de una intervención — spec fitosanitario §3.2.
 *
 * Puro: no consulta la base ni el reloj. Lo llaman la cosecha, el tablero y la
 * jornada con lo que ya leyeron.
 *
 * **Nulo = no declarada, y lo desconocido no se convierte en bueno**: una línea
 * sin declarar vuelve desconocida a toda la mezcla, y eso no caduca.
 */
import type { PlotInterventionKind } from "../../generated/prisma/client";
import { libreDesdeDe, diasQueFaltanDe, libreDeReentradaDesde } from "../time/carencia";

export interface LineaParaCarencia { readonly withdrawalDays: number | null; readonly reentryHours: number | null }
export interface IntervencionParaCarencia {
  readonly id: string;
  readonly kind: PlotInterventionKind;
  readonly occurredAt: Date;
  readonly lineas: readonly LineaParaCarencia[];
}
export type EstadoDeCarencia =
  | { estado: "no_aplica" }
  | { estado: "cumplida"; libreDesde: Date }
  | { estado: "conocida"; libreDesde: Date; diasQueFaltan: number }
  | { estado: "desconocida"; alMenosHasta: Date | null };
export type EstadoDeReentrada =
  | { estado: "no_aplica" }
  | { estado: "cumplida"; libreDesde: Date }
  | { estado: "vigente"; libreDesde: Date }
  | { estado: "desconocida"; alMenosHasta: Date | null };

/** Sin producto, o posterior a la fecha que se pregunta: no impone nada. */
function noAplica(i: IntervencionParaCarencia, enLaFecha: Date): boolean {
  return i.kind === "manejo_cultural" || i.lineas.length === 0 || i.occurredAt > enLaFecha;
}

/** El máximo de los declarados, o null si no hay ninguno. */
function maximo(valores: readonly (number | null)[]): number | null {
  const declarados = valores.filter((v): v is number => v != null);
  return declarados.length === 0 ? null : Math.max(...declarados);
}

export function carenciaDeIntervencion(i: IntervencionParaCarencia, enLaFecha: Date): EstadoDeCarencia {
  if (noAplica(i, enLaFecha)) return { estado: "no_aplica" };
  const dias = i.lineas.map((l) => l.withdrawalDays);
  const mayor = maximo(dias);
  if (dias.some((d) => d == null)) {
    return { estado: "desconocida", alMenosHasta: mayor == null ? null : libreDesdeDe(i.occurredAt, mayor) };
  }
  const libreDesde = libreDesdeDe(i.occurredAt, mayor!);
  const diasQueFaltan = diasQueFaltanDe(libreDesde, enLaFecha);
  return diasQueFaltan === 0 ? { estado: "cumplida", libreDesde } : { estado: "conocida", libreDesde, diasQueFaltan };
}

export function reentradaDeIntervencion(i: IntervencionParaCarencia, ahora: Date): EstadoDeReentrada {
  if (noAplica(i, ahora)) return { estado: "no_aplica" };
  const horas = i.lineas.map((l) => l.reentryHours);
  const mayor = maximo(horas);
  if (horas.some((h) => h == null)) {
    return { estado: "desconocida", alMenosHasta: mayor == null ? null : libreDeReentradaDesde(i.occurredAt, mayor) };
  }
  const libreDesde = libreDeReentradaDesde(i.occurredAt, mayor!);
  return ahora < libreDesde ? { estado: "vigente", libreDesde } : { estado: "cumplida", libreDesde };
}
```

- [ ] **Paso 5: verla pasar**, y además las del apiario que usan la aritmética
  (`npx vitest run tests/apiary` con base) y `npm run verify`.

- [ ] **Paso 6: commit.** Flip-tests, después del commit, uno por mutación:
  `Math.max` → primera línea (debe caer «la mezcla manda por la MÁS LARGA»);
  quitar el `some((d) => d == null)` (debe caer «una línea sin declarar…»);
  `Math.ceil` → `Math.floor` en `lib/time/carencia.ts` (debe caer «medio día…»).

---

## Tarea 3: Ubicaciones emparentadas

**Archivos:**
- Crear: `lib/traceability/ubicacionesEmparentadas.ts`
- Prueba: `tests/traceability/ubicacionesEmparentadas.test.ts` (a `base-sembrada`)

**Interfaces:**
- Produce: `ubicacionesEmparentadas(locationId: string, db?: Prisma.TransactionClient): Promise<string[]>`.
  Devuelve el propio id, sus ascendientes y todos sus descendientes. **No autoriza.**

- [ ] **Paso 1: la prueba, en rojo.** Árbol: finca → parcela A → micro A1; y
  parcela B, hermana de A.

```ts
it("desde la parcela: ella, su finca y su microparcela; NO la hermana", async () => {
  const r = await ubicacionesEmparentadas(parcelaA);
  expect(new Set(r)).toEqual(new Set([parcelaA, finca, microA1]));
});
it("desde la microparcela: sube a la parcela y a la finca", async () => {
  expect(new Set(await ubicacionesEmparentadas(microA1))).toEqual(new Set([microA1, parcelaA, finca]));
});
it("un ciclo de parentLocationId termina", async () => {
  // x → y → x, creado con SQL directo: nada en el esquema lo impide.
  const r = await ubicacionesEmparentadas(cicloX);
  expect(new Set(r)).toEqual(new Set([cicloX, cicloY]));
});
```

  (Mismo andamiaje que `tests/inventario/consumo-descuenta.test.ts`: `RUN_ID`,
  `createTestOrganization`, limpieza con `assertDefinedWhere` en `afterAll`, y el
  ciclo **roto antes de borrar**, con `update … parentLocationId: null`.)

- [ ] **Paso 2: verla caer.**

- [ ] **Paso 3: implementar.**

```ts
/**
 * La ubicación, sus ascendientes y sus descendientes — spec fitosanitario §3.3.
 *
 * Para la carencia: una cosecha de la parcela madre puede llevar café de la
 * microparcela tratada, y al revés. Un HERMANO no.
 *
 * Copia de `conAncestros` (`lib/rbac/service.ts`) el tope de profundidad y la
 * guarda de vistos: nada en el esquema impide un `parentLocationId` en ciclo.
 * **No autoriza**: quien la llama ya pasó la compuerta.
 */
import type { Prisma } from "../../generated/prisma/client";
import { prisma } from "../db";

const PROFUNDIDAD_MAXIMA_DE_UBICACION = 12;

export async function ubicacionesEmparentadas(locationId: string, db: Prisma.TransactionClient = prisma): Promise<string[]> {
  const vistos = new Set<string>([locationId]);

  let actual: string | null = locationId;
  for (let i = 0; i < PROFUNDIDAD_MAXIMA_DE_UBICACION && actual; i += 1) {
    const fila: { parentLocationId: string | null } | null = await db.location.findUnique({
      where: { id: actual }, select: { parentLocationId: true },
    });
    const padre: string | null = fila?.parentLocationId ?? null;
    if (!padre || vistos.has(padre)) break;
    vistos.add(padre);
    actual = padre;
  }

  let frontera = [locationId];
  for (let i = 0; i < PROFUNDIDAD_MAXIMA_DE_UBICACION && frontera.length > 0; i += 1) {
    const hijos = await db.location.findMany({ where: { parentLocationId: { in: frontera } }, select: { id: true } });
    frontera = hijos.map((h) => h.id).filter((id) => !vistos.has(id));
    for (const id of frontera) vistos.add(id);
  }
  return [...vistos];
}
```

- [ ] **Paso 4: verla pasar**; la ruta de la prueba a `base-sembrada`; `bash scripts/ci.sh`.
- [ ] **Paso 5: commit.** Flip: quitar `!vistos.has(id)` del filtro de descendientes
  → «un ciclo… termina» tiene que seguir terminando por el tope, pero **devolver
  lo mismo**; quitar el `if (!padre || vistos.has(padre)) break` → cae «un ciclo».
  Y cambiar la bajada para que parta de `[padre]` en vez de `[locationId]` → cae
  «NO la hermana».

---

## Tarea 4: El producto fitosanitario en el catálogo y en la recepción

**Archivos:**
- Modificar: `lib/inventario/materiales.ts` (`CrearMaterialInput` y el `create`)
- Modificar: `lib/inventario/recepcion.ts`
- Modificar: `app/actions/inventario.ts`, `app/inventario/recibir/page.tsx`,
  `app/components/inventario/RecibirMedicamentoForm.tsx`
- Modificar: `messages/es.json`, `messages/en.json` (espacio `Inventario`)
- Prueba: `tests/inventario/materiales.test.ts` y `tests/inventario/recepcion.test.ts`
  (ya en `base-sembrada`)

**Interfaces:**
- Produce: `CrearMaterialInput.isPlantProtection?: boolean` y
  `.defaultReentryHours?: number | null`; `type ClaseDeProducto = "medicamento" | "fitosanitario"`;
  `opcionesDeRecepcion(userAccountId: string, clase: ClaseDeProducto)`;
  `camposDe(clase: ClaseDeProducto): readonly CampoDelProducto[]`, con
  `"defaultReentryHours"` añadido a `CAMPOS_DEL_PRODUCTO` y sólo en la clase
  `fitosanitario`.

- [ ] **Paso 1: las pruebas, en rojo.** En `materiales.test.ts`:

```ts
it("un producto fitosanitario guarda su reentrada; cero declarado no es nulo", async () => {
  const m = await crearMaterial(gestorId, { locationId, organizationId, name: `Fito ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true, defaultReentryHours: 0 });
  expect(m.isPlantProtection).toBe(true);
  expect(m.defaultReentryHours).toBe(0);
  const s = await crearMaterial(gestorId, { locationId, organizationId, name: `Fito2 ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true });
  expect(s.defaultReentryHours).toBeNull();
});
it("reentrada negativa se rechaza en el servicio, antes de la base", async () => {
  await expect(crearMaterial(gestorId, { locationId, organizationId, name: `Neg ${RUN_ID}`, defaultUnit: "l", defaultReentryHours: -1 }))
    .rejects.toThrow(MaterialValidationError);
});
```

  En `recepcion.test.ts`:

```ts
it("la recepción de fitosanitarios ofrece sólo fitosanitarios, y pide la reentrada", async () => {
  const o = await opcionesDeRecepcion(gestorId, "fitosanitario");
  expect(o.productos.every((p) => p.name.startsWith("Fito"))).toBe(true);
  expect(o.productos.length).toBeGreaterThan(0); // control: no es una lista vacía
  expect(camposDe("fitosanitario")).toContain("defaultReentryHours");
  expect(camposDe("medicamento")).not.toContain("defaultReentryHours");
});
it("la de medicamentos no cambia: sigue sin enseñar fitosanitarios", async () => {
  const o = await opcionesDeRecepcion(gestorId, "medicamento");
  expect(o.productos.some((p) => p.name.startsWith("Fito"))).toBe(false);
});
```

  (Las llamadas existentes a `opcionesDeRecepcion(gestorId)` en esa prueba pasan a
  `opcionesDeRecepcion(gestorId, "medicamento")`.)

- [ ] **Paso 2: verlas caer.**

- [ ] **Paso 3: implementar.** En `materiales.ts`: los dos campos en
  `CrearMaterialInput` (con el comentario «nulo = no declarada»), la validación
  —`if (input.defaultReentryHours != null && !(Number.isInteger(input.defaultReentryHours) && input.defaultReentryHours >= 0)) throw new MaterialValidationError("default_reentry_hours_invalid")`—
  y los dos en el `create` (`isPlantProtection: input.isPlantProtection ?? false`,
  `defaultReentryHours: input.defaultReentryHours ?? null`).

  En `recepcion.ts`: añadir `"defaultReentryHours"` al final de
  `CAMPOS_DEL_PRODUCTO` y a `NUMERICOS`, y:

```ts
export type ClaseDeProducto = "medicamento" | "fitosanitario";

/** Qué campos del producto se piden según su clase. La reentrada no significa
 *  nada para un medicamento de colmena. */
export function camposDe(clase: ClaseDeProducto): readonly CampoDelProducto[] {
  return clase === "fitosanitario" ? CAMPOS_DEL_PRODUCTO : CAMPOS_DEL_PRODUCTO.filter((c) => c !== "defaultReentryHours");
}
```

  `opcionesDeRecepcion(userAccountId, clase)` filtra por
  `clase === "fitosanitario" ? { isPlantProtection: true } : { isVeterinaryMedicine: true }`,
  y calcula `campos` y `faltan` con `camposDe(clase)`.

  En `app/actions/inventario.ts`: la acción lee `clase` del formulario (sólo los
  dos valores; cualquier otro redirige con `?error=clase`), la pasa a
  `opcionesDeRecepcion`, recorre `camposDe(clase)` en vez de `CAMPOS_DEL_PRODUCTO`,
  y crea el material con `isVeterinaryMedicine: clase === "medicamento"`,
  `isPlantProtection: clase === "fitosanitario"` y
  `defaultReentryHours: numero("p_defaultReentryHours")`.

  En `app/inventario/recibir/page.tsx`: leer `searchParams.clase` (por defecto
  `"medicamento"`, que es lo que hacía hasta hoy), pasarla, y dos enlaces arriba
  — «Medicamento» / «Producto fitosanitario». El formulario recibe `clase` como
  campo oculto y pinta la reentrada sólo si viene en `camposDe(clase)`.

- [ ] **Paso 4: verlas pasar**; `npm run verify`; `npm run build`.
- [ ] **Paso 5: commit.** Flip: quitar el filtro por clase → cae «la de
  medicamentos no cambia».

---

## Tarea 5: Registrar y corregir una intervención

**Archivos:**
- Crear: `lib/traceability/intervenciones.ts`
- Prueba: `tests/traceability/intervenciones.test.ts` (a `base-sembrada`)

**Interfaces:**
- Consume: `ubicacionesEmparentadas` (T3), `estadoDeVencimiento` de
  `lib/inventario/vencimiento.ts`, `diaDeHoy`, `requireLotAccess` y
  `DEFAULT_NEW_RECORD_CLASSIFICATION` de `lib/traceability/lots.ts`,
  `unaVezPorEnvio` de `lib/envios/unaVezPorEnvio.ts`, `recordAuditEvent`.
- Produce:

```ts
export class IntervencionValidationError extends Error {}
export class IntervencionAccessError extends Error {}

export interface LineaInput {
  readonly materialId: string;
  readonly consumableLotId?: string | null;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly withdrawalDays?: number | null;
  readonly reentryHours?: number | null;
}
export interface RegistrarIntervencionInput {
  readonly locationId: string;
  readonly kind: PlotInterventionKind;
  readonly target: PlotInterventionTarget;
  readonly targetNote?: string | null;
  readonly method?: PlotInterventionMethod | null;
  readonly mixVolume?: number | null;
  readonly mixUnit?: string | null;
  readonly occurredAt: Date;
  readonly operatorPersonId?: string | null;
  readonly fieldSessionId?: string | null;
  readonly motivoObservationId?: string | null;
  readonly specimenIds?: readonly string[];
  readonly lineas: readonly LineaInput[];
  readonly dataQuality?: DataQuality | null;
  readonly notes?: string | null;
  readonly claveDeEnvio?: string | null;
}
export function registrarIntervencion(userAccountId: string, input: RegistrarIntervencionInput): Promise<PlotIntervention>;
export function corregirIntervencion(
  userAccountId: string,
  input: { readonly interventionId: string; readonly motivo: string; readonly nueva: Omit<RegistrarIntervencionInput, "locationId" | "claveDeEnvio"> },
): Promise<PlotIntervention>;
```

- [ ] **Paso 1: la prueba, en rojo.** Fixture como `consumo-descuenta.test.ts`, con
  una `Location` `plot` y un `Farm Operator` con ámbito en ella; un material
  fitosanitario (`isPlantProtection: true`, `defaultWithdrawalDays: 14`) y uno
  **no** fitosanitario; un lote con 10 l recibido con `recibirLote`; una planta
  (`Specimen` `plant`) de la parcela y otra de otra parcela.

```ts
const base = (over: Partial<RegistrarIntervencionInput> = {}): RegistrarIntervencionInput => ({
  locationId: parcela, kind: "aplicacion", target: "broca",
  occurredAt: new Date("2026-09-10T15:00:00Z"),
  lineas: [{ materialId: fito, withdrawalDays: 7, reentryHours: 12 }], ...over,
});

it("guarda la intervención, sus líneas y su auditoría en una transacción", async () => {
  const r = await registrarIntervencion(operador, base());
  const lineas = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
  expect(lineas).toHaveLength(1);
  const audit = await prisma.auditEvent.findFirst({ where: { entityId: r.id, operation: "plot_intervention.create" } });
  expect(audit).not.toBeNull();
});

it("el servicio NO copia la carencia del producto cuando la línea llega sin ella", async () => {
  const r = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito }] }));
  const [l] = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
  expect(l.withdrawalDays).toBeNull(); // el producto dice 14; la línea no dijo nada
});

it("manejo cultural con líneas se rechaza; aplicación sin líneas se rechaza", async () => {
  await expect(registrarIntervencion(operador, base({ kind: "manejo_cultural" }))).rejects.toThrow(IntervencionValidationError);
  await expect(registrarIntervencion(operador, base({ lineas: [] }))).rejects.toThrow(IntervencionValidationError);
  const ok = await registrarIntervencion(operador, base({ kind: "manejo_cultural", target: "broca", lineas: [] }));
  expect(ok.kind).toBe("manejo_cultural"); // control: la repela sí entra
});

it("un material que NO es fitosanitario se rechaza", async () => {
  await expect(registrarIntervencion(operador, base({ lineas: [{ materialId: aserrin }] }))).rejects.toThrow(IntervencionValidationError);
});

it("una planta de OTRA parcela se rechaza; una de ésta entra", async () => {
  await expect(registrarIntervencion(operador, base({ specimenIds: [plantaAjena] }))).rejects.toThrow(IntervencionValidationError);
  const ok = await registrarIntervencion(operador, base({ specimenIds: [plantaPropia] }));
  expect(await prisma.plotInterventionArea.count({ where: { interventionId: ok.id } })).toBe(1);
});

// El saldo, como lo lee `tests/inventario/consumo-descuenta.test.ts`: con el ámbito.
const saldo = async () => (await existencias(operador, lote, { locationId: parcela })).quantity.toNumber();

it("con frasco y cantidad descuenta; sin cantidad no descuenta y se guarda igual", async () => {
  const antes = await saldo();
  await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote, quantity: 2, unit: "l" }] }));
  expect(await saldo()).toBe(antes - 2);
  await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote }] }));
  expect(await saldo()).toBe(antes - 2);
});

it("unidad distinta a la del frasco se rechaza, y NO queda ni intervención ni descuento", async () => {
  const n = await prisma.plotIntervention.count({ where: { locationId: parcela } });
  await expect(registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote, quantity: 1, unit: "kg" }] })))
    .rejects.toThrow(/unidad distinta/);
  expect(await prisma.plotIntervention.count({ where: { locationId: parcela } })).toBe(n);
});

it("frasco vencido: se guarda y queda marcado", async () => {
  const r = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: loteVencido }] }));
  const [l] = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
  expect(l.lotExpiredAtApplication).toBe(true);
});

it("con jornada: deja un FieldEvent `manejo_fitosanitario` apuntando a ella", async () => {
  const r = await registrarIntervencion(operador, base({ fieldSessionId: jornada }));
  const ev = await prisma.fieldEvent.findFirst({ where: { plotInterventionId: r.id }, include: { eventKindValue: true } });
  expect(ev?.eventKindValue.value).toBe("manejo_fitosanitario");
  expect(ev?.fieldSessionId).toBe(jornada);
});

it("corregir escribe fila NUEVA; la original queda intacta; no se corrige lo corregido", async () => {
  const o = await registrarIntervencion(operador, base());
  const c = await corregirIntervencion(operador, { interventionId: o.id, motivo: "era roya", nueva: { ...base(), target: "roya" } });
  expect(c.correctsId).toBe(o.id);
  expect((await prisma.plotIntervention.findUniqueOrThrow({ where: { id: o.id } })).target).toBe("broca");
  await expect(corregirIntervencion(operador, { interventionId: o.id, motivo: "otra vez", nueva: base() }))
    .rejects.toThrow(IntervencionValidationError);
});

it("corregir una línea con frasco NO vuelve a descontar", async () => {
  const o = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote, quantity: 1, unit: "l" }] }));
  const antes = await saldo();
  await corregirIntervencion(operador, { interventionId: o.id, motivo: "hora", nueva: { ...base(), lineas: [{ materialId: fito, consumableLotId: lote, quantity: 1, unit: "l" }] } });
  expect(await saldo()).toBe(antes);
});

it("sin permiso de gestión sobre la parcela: acceso denegado", async () => {
  await expect(registrarIntervencion(sinPermiso, base())).rejects.toThrow();
});
```

  El lote se recibe con `recibirLote(gestor, { locationId: parcela, … })`, para que
  el ámbito de `existencias` sea la parcela.

- [ ] **Paso 2: verla caer.**

- [ ] **Paso 3: implementar** `lib/traceability/intervenciones.ts`. El orden
  dentro de `registrarIntervencion`:

  1. **Validación pura**, sin base: `manejo_cultural` ⇒ `lineas.length === 0`;
     `aplicacion`/`liberacion` ⇒ `lineas.length >= 1`; `target === "otro"` ⇒
     `targetNote` no vacía; cada `withdrawalDays`/`reentryHours` entero ≥ 0 o nulo.
     Mensajes en español y concretos, como `colonyEvents.ts`.
  2. **La parcela**: existe y `locationType` ∈ {`plot`, `micro_plot`}; si no,
     `IntervencionValidationError("no_es_parcela")`.
  3. **Permiso**: `requireLotAccess(userAccountId, "manage", [{ locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }])`,
     igual que el consumo con padre `location`.
  4. **Referencias**: cada `materialId` existe, `isPlantProtection` y es de la
     `organizationId` de la parcela; cada `consumableLotId` es de ese material;
     cada `specimenId` tiene `locationId === input.locationId`; `fieldSessionId`, si
     viene, tiene su `locationId` en `ubicacionesEmparentadas(input.locationId)`.
  5. **La escritura, dentro de `unaVezPorEnvio(userAccountId, input.claveDeEnvio, { tipo: "PlotIntervention", recuperar, crear })`**:
     crear la intervención (`provenanceClass: "original_record"`), sus áreas, y por
     cada línea: calcular `lotExpiredAtApplication` como `colonyEvents.ts`
     (`estadoDeVencimiento({ expiresAt, avisarDiasAntes: null, hoy: diaDeHoy(occurredAt, zona) })`,
     `SIN_FECHA` ⇒ nulo); si trae frasco **y** cantidad, comprobar la unidad contra
     el primer `ConsumableStockEvent` del lote y escribir el `consumed`, con el mismo
     mensaje «unidad distinta: el frasco va en X y la línea viene en Y»; crear la
     línea. Si hay jornada, crear el `FieldEvent` con el valor
     `manejo_fitosanitario` de `event_kind` (si el valor no existe, lanzar
     `IntervencionValidationError("falta el tipo de evento manejo_fitosanitario: correr db:seed")`).
     Y al final `recordAuditEvent({ operation: "plot_intervention.create", entityType: "plot_intervention", entityId, after: { ...intervencion, lineas, areas }, sourceInterface: "traceability.service" }, tx)`.

  `corregirIntervencion` comprueba que el motivo no esté vacío, que la original
  exista y **no tenga ya una corrección** (`correcciones: { none: {} }`), y el
  permiso sobre **su** parcela. Luego escribe la fila nueva con la misma forma,
  `locationId` = el de la original, `correctsId` y `correctionReason`. **Sin
  descuento**: una corrección no vuelve a gastar producto, y un saldo mal
  descontado se cuadra con `reconciliar` del inventario, que exige su razón.
  Auditoría: `plot_intervention.correct` con `before` (la original) y `after`.

- [ ] **Paso 4: verla pasar**; a `base-sembrada`; `bash scripts/ci.sh`; `verify`; `build`.
- [ ] **Paso 5: commit.** Flips, uno por uno, con su prueba nombrada: sacar el
  descuento de `tx` a `prisma` (cae «unidad distinta… NO queda ni intervención ni
  descuento»); copiar `material.defaultWithdrawalDays` cuando la línea llega sin él
  (cae «el servicio NO copia…»); quitar la comprobación de `specimen.locationId`
  (cae «una planta de OTRA parcela»); quitar `correcciones: { none: {} }` (cae «no
  se corrige lo corregido»).

---

## Tarea 6: Leer las vigentes, y la marca en la cosecha

**Archivos:**
- Modificar: `lib/traceability/intervenciones.ts` (lectores)
- Modificar: `lib/traceability/harvest.ts`
- Prueba: `tests/traceability/carenciaEnLaCosecha.test.ts` (a `base-sembrada`)

**Interfaces:**
- Consume: `carenciaDeIntervencion` (T2), `ubicacionesEmparentadas` (T3).
- Produce:

```ts
/** Vigentes = sin corrección que las sustituya. No autoriza. */
export function intervencionesVigentes(
  locationIds: readonly string[],
  opciones?: { hasta?: Date; db?: Prisma.TransactionClient },
): Promise<(IntervencionParaCarencia & { locationId: string; target: PlotInterventionTarget })[]>;

/** Lista para la pantalla de la parcela. Autoriza con `requireLotAccess(view)`. */
export function listarIntervenciones(userAccountId: string, locationId: string): Promise<IntervencionListada[]>;
```

  `IntervencionListada` = la fila con `lineas` (con `material.name`,
  `material.defaultWithdrawalDays`, `material.defaultReentryHours`,
  `material.safetyNotes`), `areas` (con `specimen.commonName`), `operator.displayName`
  y `correcciones: { id }[]`.

- [ ] **Paso 1: la prueba, en rojo.** Árbol finca → parcela → micro, y una parcela
  hermana. Una aplicación en la micro con carencia 10 el 2026-09-10 15:00.

```ts
it("cosechar en la parcela madre dentro de la carencia de la micro: se guarda Y se marca", async () => {
  const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: parcela, harvestedAt: new Date("2026-09-12T15:00:00Z") }));
  const marcas = await prisma.harvestWithdrawalFlag.findMany({ where: { harvestEventId: harvestEvent.id } });
  expect(marcas).toEqual([expect.objectContaining({ interventionId: enMicro, diasQueFaltaban: 8 })]);
});
it("en la parcela HERMANA no hay marca", async () => {
  const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: hermana, harvestedAt: new Date("2026-09-12T15:00:00Z") }));
  expect(await prisma.harvestWithdrawalFlag.count({ where: { harvestEventId: harvestEvent.id } })).toBe(0);
});
it("carencia desconocida: marca con NULO, no con 0", async () => {
  // aplicación con una línea sin withdrawalDays, en la parcela
  const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: parcela, harvestedAt: new Date("2026-12-01T15:00:00Z") }));
  const m = await prisma.harvestWithdrawalFlag.findFirst({ where: { harvestEventId: harvestEvent.id, interventionId: desconocida } });
  expect(m).not.toBeNull();
  expect(m!.diasQueFaltaban).toBeNull();
});
it("cumplida la carencia: sin marca de esa intervención", async () => {
  const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: micro, harvestedAt: new Date("2026-09-25T15:00:00Z") }));
  expect(await prisma.harvestWithdrawalFlag.count({ where: { harvestEventId: harvestEvent.id, interventionId: enMicro } })).toBe(0);
});
it("una intervención corregida no marca; marca su corrección", async () => {
  // corregir `enMicro` a carencia 20; cosechar el 2026-09-25
  const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: micro, harvestedAt: new Date("2026-09-25T15:00:00Z") }));
  const ids = (await prisma.harvestWithdrawalFlag.findMany({ where: { harvestEventId: harvestEvent.id } })).map((m) => m.interventionId);
  expect(ids).toContain(correccionDeEnMicro);
  expect(ids).not.toContain(enMicro);
});
```

- [ ] **Paso 2: verla caer.**

- [ ] **Paso 3: implementar.** `intervencionesVigentes` hace un solo `findMany`:
  `where: { locationId: { in: locationIds }, correcciones: { none: {} }, ...(hasta ? { occurredAt: { lte: hasta } } : {}) }`,
  con `select` de `id, kind, occurredAt, locationId, target, lineas: { select: { withdrawalDays, reentryHours } }`.

  En `recordHarvestEvent`, dentro de la transacción y **después** de crear
  `harvestEvent`:

```ts
    // La marca de carencia — spec fitosanitario §3.4. Avisa, NO bloquea: la cosecha
    // ya está guardada arriba. Una fila por intervención todavía en carencia;
    // NULO = desconocida. Sin filas = no había ninguna.
    const emparentadas = await ubicacionesEmparentadas(input.locationId, tx);
    const vigentes = await intervencionesVigentes(emparentadas, { hasta: input.harvestedAt, db: tx });
    for (const i of vigentes) {
      const c = carenciaDeIntervencion(i, input.harvestedAt);
      if (c.estado !== "conocida" && c.estado !== "desconocida") continue;
      await tx.harvestWithdrawalFlag.create({
        data: { harvestEventId: harvestEvent.id, interventionId: i.id, diasQueFaltaban: c.estado === "conocida" ? c.diasQueFaltan : null },
      });
    }
```

  La fila de auditoría ya existente (`harvest_event.create`) pasa a llevar las
  marcas en su `after`: `after: { ...harvestEvent, marcasDeCarencia }`.

- [ ] **Paso 4: verla pasar**, y **la suite de cosecha entera sigue igual**:
  `npx vitest run tests/traceability/harvest.test.ts tests/traceability/cerezaComoDato.test.ts`.
- [ ] **Paso 5: commit.** Flips: `diasQueFaltaban: c.estado === "conocida" ? … : 0`
  (cae «marca con NULO, no con 0»); `ubicacionesEmparentadas` → `[input.locationId]`
  (cae «en la parcela madre…»); quitar `correcciones: { none: {} }` (cae «una
  intervención corregida no marca»).

---

## Tarea 7: Los avisos del tablero y la reentrada en la jornada

**Archivos:**
- Modificar: `lib/traceability/pendienteDeLaParcela.ts`
- Modificar: `tests/traceability/pendienteDeLaParcela.test.ts` (hermética)
- Modificar: `app/field-sessions/[id]/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `carenciaDeIntervencion`, `reentradaDeIntervencion`, `IntervencionParaCarencia`.
- Produce: `EntradaDePendiente` gana `ahora: Date` e
  `intervenciones: readonly IntervencionParaCarencia[]`; `Aviso` gana:

```ts
  | { tipo: "reentrada_vigente"; interventionId: string; hasta: Date }
  | { tipo: "carencia_vigente"; interventionId: string; hasta: Date; dias: number }
  | { tipo: "carencia_no_declarada"; interventionId: string; alMenosHasta: Date | null }
  | { tipo: "reentrada_no_declarada"; interventionId: string; alMenosHasta: Date | null }
```

  y `enlaceDelAviso` los manda a `/plots/${locationId}/manejo/${interventionId}`.

- [ ] **Paso 1: la prueba, en rojo.** En `base()` añadir `ahora: new Date("2026-09-16T15:00:00Z")`
  e `intervenciones: []`. **La prueba «un lote en orden no tiene nada pendiente»
  tiene que seguir en verde sin tocarla**: es el control de que añadir los campos
  no inventa avisos.

```ts
const aplic = (lineas: IntervencionParaCarencia["lineas"], occurredAt = new Date("2026-09-16T10:00:00Z")): IntervencionParaCarencia =>
  ({ id: "i1", kind: "aplicacion", occurredAt, lineas });

it("reentrada y carencia vigentes: dos avisos en «toca hacer»", () => {
  const r = pendienteDeLaParcela(base({ intervenciones: [aplic([{ withdrawalDays: 7, reentryHours: 12 }])] }));
  expect(r.tocaHacer).toEqual([
    { tipo: "reentrada_vigente", interventionId: "i1", hasta: new Date("2026-09-16T22:00:00Z") },
    { tipo: "carencia_vigente", interventionId: "i1", hasta: new Date("2026-09-23T10:00:00Z"), dias: 7 },
  ]);
});
it("no declaradas: van a «falta un dato», NUNCA desaparecen", () => {
  const r = pendienteDeLaParcela(base({ ahora: new Date("2030-01-01T00:00:00Z"), intervenciones: [aplic([{ withdrawalDays: null, reentryHours: null }])] }));
  expect(r.faltaUnDato).toEqual(expect.arrayContaining([
    { tipo: "carencia_no_declarada", interventionId: "i1", alMenosHasta: null },
    { tipo: "reentrada_no_declarada", interventionId: "i1", alMenosHasta: null },
  ]));
});
it("cumplidas: nada", () => {
  const r = pendienteDeLaParcela(base({ ahora: new Date("2026-10-30T00:00:00Z"), intervenciones: [aplic([{ withdrawalDays: 7, reentryHours: 12 }])] }));
  expect(r.tocaHacer).toEqual([]);
});
it("manejo cultural: nada", () => {
  const r = pendienteDeLaParcela(base({ intervenciones: [{ id: "c", kind: "manejo_cultural", occurredAt: new Date("2026-09-16T10:00:00Z"), lineas: [] }] }));
  expect(r).toEqual({ tocaHacer: [], faltaUnDato: [] });
});
```

- [ ] **Paso 2: verla caer.**

- [ ] **Paso 3: implementar.** Al final de `pendienteDeLaParcela`, antes del
  `return`:

```ts
  for (const i of e.intervenciones) {
    const re = reentradaDeIntervencion(i, e.ahora);
    if (re.estado === "vigente") tocaHacer.push({ tipo: "reentrada_vigente", interventionId: i.id, hasta: re.libreDesde });
    if (re.estado === "desconocida") faltaUnDato.push({ tipo: "reentrada_no_declarada", interventionId: i.id, alMenosHasta: re.alMenosHasta });
    const ca = carenciaDeIntervencion(i, e.ahora);
    if (ca.estado === "conocida") tocaHacer.push({ tipo: "carencia_vigente", interventionId: i.id, hasta: ca.libreDesde, dias: ca.diasQueFaltan });
    if (ca.estado === "desconocida") faltaUnDato.push({ tipo: "carencia_no_declarada", interventionId: i.id, alMenosHasta: ca.alMenosHasta });
  }
```

  Los cuatro casos nuevos en `enlaceDelAviso` y en `textoDelAviso` de
  `app/plots/[id]/page.tsx` (lo pinta la Tarea 8). En la página de la parcela,
  pasar `ahora: new Date()` y las intervenciones de
  `intervencionesVigentes(await ubicacionesEmparentadas(id))`: la parcela ve también
  las de su microparcela, **igual que la cosecha** (spec §3.3).

  **La jornada:** en `app/field-sessions/[id]/page.tsx`, si la jornada está
  abierta, leer `intervencionesVigentes(await ubicacionesEmparentadas(<id de la ubicación de la jornada>))`
  (`getFieldSessionTimeline` ya la incluye con `location: { select: { id, name, locationType, timezone } }`)
  y pintar arriba, antes de los formularios, una caja por cada reentrada
  `vigente` o `desconocida`:
  «Sin protección no entrar hasta las {hora} — {tipo} del {fecha}» /
  «Reentrada desconocida — {tipo} del {fecha}». **Sin botón y sin confirmar**:
  avisa, no impide.

  Textos nuevos en `messages/es.json` y `en.json`, espacio `Traceability`:
  `plotDashboardAlertReentry`, `plotDashboardAlertWithdrawal`,
  `plotDashboardAlertWithdrawalUnknown`, `plotDashboardAlertReentryUnknown`,
  `fieldSessionReentryWarning`, `fieldSessionReentryUnknown`.

- [ ] **Paso 4: verla pasar**; `verify`; `build`.
- [ ] **Paso 5: commit.** Flips: filtrar `desconocida` fuera de `faltaUnDato` (cae «no
  declaradas… NUNCA desaparecen»); `<` → `<=` en `reentradaDeIntervencion` (cae el
  borde de «vigente hasta la hora exacta» de la Tarea 2).

---

## Tarea 8: Las pantallas

**Archivos:**
- Crear: `app/actions/manejo.ts` (`"use server"`: **sólo** funciones `async`
  exportadas; lo guarda `tests/arquitectura/use-server-solo-async.test.ts`)
- Crear: `app/components/traceability/IntervencionForm.tsx` (cliente)
- Crear: `app/plots/[id]/manejo/nuevo/page.tsx`, `app/plots/[id]/manejo/[interventionId]/page.tsx`
- Modificar: `app/plots/[id]/page.tsx`, `app/lots/[id]/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `registrarIntervencion`, `corregirIntervencion`, `listarIntervenciones`,
  `intervencionesVigentes`, `carenciaDeIntervencion`, `reentradaDeIntervencion`.
- Produce: `registrarIntervencionFormAction(prev, formData)` y
  `corregirIntervencionFormAction(prev, formData)`, con el mismo
  `TraceabilityActionState` y `friendlyError` de `app/actions/traceability.ts`; y
  `productosFitosanitarios(userAccountId, locationId)` en
  `lib/traceability/intervenciones.ts`: los materiales `isPlantProtection` de la
  organización de la parcela, con `defaultWithdrawalDays`, `defaultReentryHours`,
  `safetyNotes`, `storageConditions` y sus lotes (id, `batchLabel`, `expiresAt`).

- [ ] **Paso 1: la acción.** `registrarIntervencionFormAction` lee el formulario:
  `kind`, `target`, `targetNote`, `method`, `mixVolume`, `mixUnit`, `occurredAt`
  con `fechaLocal(formData, "occurredAt")` (instante, **con**
  `TimezoneOffsetField`), `operatorPersonId`, `fieldSessionId`,
  `motivoObservationId`, `specimenIds` (`getAll`), `notes`, `claveDeEnvio`, y las
  líneas como campos indexados `lineas[0].materialId`… hasta que falte el
  `materialId`. Un número vacío es `null`, **nunca 0**. Redirige a
  `/plots/{locationId}` con `?ok=manejo`.

- [ ] **Paso 2: el formulario.** `IntervencionForm` en este orden:
  1. **El tipo primero** (tres botones). `manejo_cultural` oculta las líneas.
  2. **Las líneas**: el selector sólo ofrece `productosFitosanitarios`. Al elegir
     un producto, **enseña sus `safetyNotes` y `storageConditions`** sobre la línea
     y **precarga** carencia y reentrada **en campos visibles y editables**, con el
     rótulo «del producto». Si el producto no las declara, el campo queda vacío con
     el texto «el producto no la declara: si la sabes, escríbela». «Añadir producto»
     suma una línea. El frasco es opcional; si vence antes de hoy, «vencido» al
     lado, sin impedir.
  3. **El área**: «toda la parcela» por defecto, o marcar plantas.
  4. **Objetivo** (los trece valores; `otro` abre la nota), método, volumen del
     caldo, fecha y hora, operario (`getObserverCandidates`), notas.

  Un campo precargado que el operario **borra** llega vacío y se guarda nulo: la
  precarga no es un valor por defecto del servidor.

- [ ] **Paso 3: las páginas.**
  - `/plots/[id]`: sección «Manejo fitosanitario» con las cinco últimas
    intervenciones vigentes (fecha, tipo, objetivo, productos) y el botón
    «Registrar manejo». Los avisos nuevos de la Tarea 7 en `textoDelAviso`.
  - `/plots/[id]/manejo/nuevo`: el formulario. Lee `?motivo=<observationId>` y lo
    pasa oculto (lo usará el PR B desde el aviso de trampa).
  - `/plots/[id]/manejo/[interventionId]`: el detalle. Para cada línea, su carencia
    con **su origen**: «del producto» si coincide con `material.defaultWithdrawalDays`,
    «indicada al registrar» si no, «no declarada» si es nula (rúbrica de
    veracidad, spec §4.3). El estado de hoy (`carenciaDeIntervencion` y
    `reentradaDeIntervencion` con `new Date()`). Si fue corregida: «corregida por…»
    con el enlace y el motivo. Si tiene `motivoObservationId`, la lectura de trampa
    que la motivó y, si la hay, la **siguiente** lectura de esa trampa; si no la
    hay, «todavía no hay revisión después de esta aplicación» (spec §4.3). Y **Corregir**: el mismo formulario precargado con
    todo, más el motivo obligatorio.
  - `/lots/[id]`: si la cosecha del lote tiene `marcasDeCarencia`, una caja:
    «Cosechado dentro de la carencia: faltaban {n} días — {intervención}» o
    «carencia desconocida — {intervención}», cada una con el enlace. Además, el
    cálculo de hoy con `carenciaDeIntervencion` sobre las intervenciones
    **vigentes** a la fecha de cosecha; si **no coincide** con la foto, lo dice:
    «La aplicación se corrigió después: hoy el cálculo da {…}» (spec §3.4).

- [ ] **Paso 4: la compuerta y el navegador.** `npm run verify`, `npm run build` y
  los dos carriles (`bash scripts/ci.sh` y la suite con base). Después, en el
  navegador sobre la copia local (`npm run dev:local`, puerto 3017; ver la memoria
  de verificación local): registrar una aplicación con dos productos, uno sin
  carencia declarada; comprobar el aviso en el tablero; abrir una jornada y ver la
  reentrada; registrar una cosecha y ver la marca en el lote. **Con viewport
  móvil** (375×812), y leyendo el panel **visible**: un panel oculto da `0x0` y
  mide nada. Captura de las cuatro pantallas.

- [ ] **Paso 5: commit.**

---

## Tarea 9: El ADR y el estado

**Archivos:**
- Modificar: `docs/architecture/DECISIONS.md` — el ADR siguiente libre **al
  fusionar** (hoy el último es ADR-162; otras sesiones fusionan a diario, así que
  se comprueba al rebasar).
- Modificar: `SESSION_STATE.md` §2, y `npm run check:state`.

- [ ] **Paso 1: el ADR.** Con: la decisión de las cuatro clases, la lista de
  objetivos con su procedencia, el catálogo sobre `ConsumableMaterial`, el
  descuento directo como el botiquín (y que Daniel lo aprobó sabiendo que era un
  cambio sobre lo que vio en el chat), nulo ≠ cero, la marca de cosecha como foto,
  y lo que queda para el PR B.
- [ ] **Paso 2: el estado.** Una entrada en §2, y en §3 lo que el PR B espera.
  `npm run check:state`; si se queja, archivar lo más viejo.
- [ ] **Paso 3: commit, PR y esperar.** La regla de la casa: fusionar sólo con
  **`SUCCESS` explícito en todas las compuertas**, leídas **una por línea**, sobre el
  mismo sha, y **esperar el check de Vercel**. Fusionar es decisión de Daniel.

---

## Decisiones que toma este plan, y cuánto cuesta revertirlas

| Decisión | Por qué | Revertir |
|---|---|---|
| En el PR A, el área sólo admite plantas | `PlotBlock` no existe; una FK a una tabla que no existe no se puede escribir | el PR B la amplía; nada que migrar hacia atrás |
| Corregir no vuelve a descontar | una corrección no gasta producto; el saldo se cuadra con `reconciliar`, que exige razón | una tarea: descontar la diferencia |
| La parcela ve también las intervenciones de su microparcela en el tablero | la misma regla que la cosecha; si no, el tablero y la marca dirían cosas distintas | un parámetro en la página |
| Una intervención antigua con carencia desconocida marca **todas** las cosechas siguientes | es la regla del spec (`desconocida` no caduca): empuja a corregir el dato | cambiar el spec, no el código |
| `manejo_fitosanitario` como valor de catálogo y no como migración | así crece `event_kind` desde P1, y producción siembra catálogos en cada despliegue | quitar el valor |

## Compuerta final

- [ ] `npm run verify` → salida 0, leída sin tubería.
- [ ] `npm run build` → salida 0.
- [ ] `bash scripts/ci.sh` → salida 0, y ninguna prueba nueva de base aparece en su salida.
- [ ] La suite con base, leyendo el código de salida.
- [ ] Contar la basura de prueba antes y después de la suite (las filas `TEST …` de
  `plot_intervention` deben volver a su número; ver «Una limpieza escrita debajo de
  las aserciones no corre» en `CLAUDE.md`).
- [ ] `git diff --name-only origin/main...HEAD` = sólo los archivos de la tabla de
  arriba.
