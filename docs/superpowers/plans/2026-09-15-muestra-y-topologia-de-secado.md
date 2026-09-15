# La muestra y la topología de secado — plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar
> `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para implementar tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que las mediciones de humedad de una cama de secado lleguen al motor
con la forma que el motor ya exige, de modo que `UNEVEN_DRYING` y `TARGET_REACHED`
—hoy inalcanzables— puedan salir contra un lote real.

**Arquitectura:** todo aditivo. La muestra física (`Sample`) pasa a ser el sujeto de
la medición de humedad, con su estado de material y su papel declarado; la
instalación y la cama entran como tipos de `Location`, siguiendo el precedente
escrito de `plot` y `apiary_site`; el instrumento declara sus modos, y la medición
guarda en cuál estaba. El puente `desdeElLote.ts` deja de rellenar con constantes.
Ningún motor cambia.

**Stack:** Next.js 16 · React 19 · Prisma 7 (cliente generado en `generated/prisma`)
· Postgres (Neon) · vitest · next-intl.

**Spec:** `docs/superpowers/specs/2026-09-15-muestra-y-topologia-de-secado-design.md`

## Restricciones globales

Se aplican a **todas** las tareas. Salen del spec y de `CLAUDE.md`.

- **Worktree propio desde `origin/main` explícito.** `git worktree add <ruta> -b <rama> origin/main`.
- **Nunca `git add -A`.** Archivo por archivo, y `git diff --cached --stat` antes de commitear: si creías escenificar tres y salen nueve, parar.
- **`git commit -F <archivo>`**, nunca `-m` con backticks.
- **Nunca canalizar la compuerta.** `npm test; test $? -eq 0 && ...` — el estado de salida de una tubería es el del último comando.
- **Toda prueba que toque la base va declarada** en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`. Si no, cae en el carril hermético **por omisión** y CI falla con un error de Prisma que no parece de Prisma. Comprobación: `bash scripts/ci.sh` y que la prueba nueva **no** aparezca en su salida.
- **Una validación entre dos tablas va en un disparador, no en un `CHECK`.** Un `CHECK` no puede mirar otra tabla. Precedente de forma: `recalcular_veredicto_de_verificacion` en `20260914180000_equipos_e_instrumentos`.
- **Ninguna columna se rellena hacia atrás.** Ni `sampleType`, ni `method`, ni `spacingMeters`. Una columna que antes significaba una cosa y ahora otra haría mentir a las filas viejas.
- **Toda escritura de servicio va con su `AuditEvent` en la MISMA transacción.** Lo vigila `tests/arquitectura/audit-atomico.test.ts`, que lee la fuente.
- **Ninguna alerta en modo imperativo.** Los textos nuevos pasan por los guardias de `tests/arquitectura/alertas-con-su-texto.test.ts`.
- **`npm run prisma:generate` después de cada migración**, antes de creer al typecheck: el cliente viejo miente.
- **Flip-test obligatorio en cada guardia**, con sus tres exigencias: sha del archivo distinto antes y después, que **compile**, y que caiga un test **por su nombre**. Commitear ANTES de mutar — el arnés restaura desde HEAD.

**`<sello>` en las rutas de migración** es la marca de tiempo que genera quien
implementa, con el formato del repositorio (`AAAAMMDDHHMMSS`). No es un hueco por
rellenar más tarde: es el único dato del plan que depende de cuándo se ejecute.

## Mapa de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` | los modelos; se toca en las tareas 1–5 |
| `prisma/migrations/<sello>_*/migration.sql` | una migración por tarea, nunca una sola grande |
| `lib/traceability/samples.ts` | servicio de muestras; gana los campos nuevos |
| `lib/traceability/samplingEvents.ts` | **nuevo** — la inspección |
| `lib/equipos/modos.ts` | **nuevo** — modos del instrumento y el desajuste |
| `lib/beneficio/desdeElLote.ts` | el puente; las cuatro líneas de la tarea 6 |
| `app/components/traceability/MeasurementForm.tsx` | el formulario, con el aviso previo |
| `app/inspecciones/nueva/page.tsx` | **nueva** — la inspección de cama |
| `app/instalaciones/` | **nuevas** — administración de instalaciones y camas |

**Orden y dependencias.** 1 → 2 (la cama debe existir antes de que la corrida
apunte a ella). 3 y 5 son independientes entre sí y sólo dependen de 1. 4 depende
de 1 y 3. 6 depende de 3, 4 y 5. 7–9 dependen de todo lo anterior.

---

### Tarea 1: La topología — instalación y cama como tipos de `Location`

**Archivos:**
- Modificar: `prisma/schema.prisma` (enum `LocationType`, modelo `Location`)
- Crear: `prisma/migrations/<sello>_topologia_de_secado/migration.sql`
- Prueba: `tests/traceability/topologiaDeSecado.test.ts`

**Interfaces:**
- Produce: `LocationType.drying_facility`, `LocationType.drying_bed`;
  `Location.rackLevel: number | null`; `Location.dryingEnvironment: DryingEnvironment | null`.
- Consume: nada.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// tests/traceability/topologiaDeSecado.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "../../lib/db";

describe("una cama de secado es una Location, no una familia de entidades nueva", () => {
  it("cuelga la cama de la instalación y la instalación del sitio de la finca", async () => {
    const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
    const inv = await prisma.location.create({
      data: {
        name: "TEST Invernadero 1", locationType: "drying_facility",
        parentLocationId: sitio.id, dryingEnvironment: "solar_greenhouse",
      },
    });
    const cama = await prisma.location.create({
      data: {
        name: "TEST Cama 3", locationType: "drying_bed",
        parentLocationId: inv.id, rackLevel: 2,
      },
    });

    expect(cama.parentLocationId).toBe(inv.id);
    expect(inv.parentLocationId).toBe(sitio.id);
    expect(cama.rackLevel).toBe(2);
    // Control positivo: el nivel de rack es de la cama, no de la instalación.
    expect(inv.rackLevel).toBeNull();

    await prisma.location.delete({ where: { id: cama.id } });
    await prisma.location.delete({ where: { id: inv.id } });
  });
});
```

- [ ] **Paso 2: correrla y verla fallar**

Correr: `npx vitest run tests/traceability/topologiaDeSecado.test.ts`
Esperado: FALLA — `Invalid value for argument locationType. Expected LocationType.`

- [ ] **Paso 3: el esquema**

En `prisma/schema.prisma`, dentro de `enum LocationType`, después de `apiary_site`:

```prisma
  /// La instalación de secado —invernadero solar, cuarto oscuro, patio,
  /// marquesina, secadora— y la cama dentro de ella. Mismo patrón que `plot` y
  /// `apiary_site`: una Location con su tipo y su padre, NO una familia de
  /// entidades nueva.
  drying_facility
  drying_bed
```

Y un enum nuevo, junto a `SunExposure`:

```prisma
enum DryingEnvironment {
  solar_greenhouse
  dark_room_climate_controlled
  open_patio
  covered_patio
  mechanical_dryer

  @@schema("core")
}
```

En `model Location`, junto a `plantSpacingMeters`:

```prisma
  /// Sólo para `drying_facility`: qué clase de ambiente es. Es lo que hoy vive
  /// como texto libre en `DryingRun.method`.
  dryingEnvironment DryingEnvironment? @map("drying_environment")
  /// Sólo para `drying_bed`: el nivel del rack en un cuarto de varios niveles.
  /// Anulable, porque una cama de patio no está en ningún rack.
  rackLevel         Int?               @map("rack_level")
```

- [ ] **Paso 4: la migración**

```sql
-- prisma/migrations/<sello>_topologia_de_secado/migration.sql
-- `ADD VALUE` corre dentro de la transacción mientras el valor no se USE aquí.
ALTER TYPE "core"."LocationType" ADD VALUE 'drying_facility';
ALTER TYPE "core"."LocationType" ADD VALUE 'drying_bed';

CREATE TYPE "core"."DryingEnvironment" AS ENUM (
  'solar_greenhouse', 'dark_room_climate_controlled',
  'open_patio', 'covered_patio', 'mechanical_dryer'
);

ALTER TABLE "core"."location"
  ADD COLUMN "drying_environment" "core"."DryingEnvironment",
  ADD COLUMN "rack_level" INTEGER;

-- Un nivel de rack de 0 o negativo no existe. Misma fila, así que CHECK basta.
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_rack_level_positivo"
    CHECK ("rack_level" IS NULL OR "rack_level" > 0);
```

- [ ] **Paso 5: aplicar, regenerar y ver pasar**

```bash
npx prisma migrate deploy
npx prisma generate
npx vitest run tests/traceability/topologiaDeSecado.test.ts
```
Esperado: PASA.

- [ ] **Paso 6: declarar la prueba en el carril con base**

Añadir `tests/traceability/topologiaDeSecado.test.ts` al grupo `base-sembrada` de
`scripts/pruebas-por-compuerta.txt`. Comprobar: `bash scripts/ci.sh` sale 0 y
`grep -c topologiaDeSecado` sobre su salida da **0**.

- [ ] **Paso 7: commit**

```bash
git add prisma/schema.prisma prisma/migrations/<sello>_topologia_de_secado/migration.sql \
        tests/traceability/topologiaDeSecado.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat   # esperado: 4 archivos
git commit -F mensaje.txt
```

---

### Tarea 2: `DryingRun` apunta a la cama, y un disparador exige que lo sea

**Archivos:**
- Modificar: `prisma/schema.prisma` (modelo `DryingRun`)
- Crear: `prisma/migrations/<sello>_corrida_de_secado_en_su_cama/migration.sql`
- Prueba: `tests/traceability/topologiaDeSecado.test.ts` (se amplía)

**Interfaces:**
- Consume: `LocationType.drying_bed` de la tarea 1.
- Produce: `DryingRun.dryingBedLocationId: string | null`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
it("rechaza una corrida cuya cama no es una cama", async () => {
  const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
  await expect(
    prisma.dryingRun.create({
      data: { startedAt: new Date(), dryingBedLocationId: sitio.id },
    }),
  ).rejects.toThrow(/cama de secado/i);
});
```

- [ ] **Paso 2: correrla y verla fallar**

Correr: `npx vitest run tests/traceability/topologiaDeSecado.test.ts`
Esperado: FALLA — `Unknown argument dryingBedLocationId`.

- [ ] **Paso 3: el esquema**

En `model DryingRun`, junto a `locationId`:

```prisma
  /// La cama concreta. `locationId` y `method` se quedan como legado y NO se
  /// rellenan hacia atrás: las corridas viejas nunca dijeron si su Location era
  /// una cama o el sitio entero.
  dryingBedLocationId String?   @map("drying_bed_location_id") @db.Uuid
  dryingBedLocation   Location? @relation("DryingRunBed", fields: [dryingBedLocationId], references: [id])
```

Y en `model Location`, la relación inversa: `dryingRunsOnBed DryingRun[] @relation("DryingRunBed")`.

- [ ] **Paso 4: la migración, con el disparador**

```sql
ALTER TABLE "traceability"."drying_run"
  ADD COLUMN "drying_bed_location_id" UUID
  REFERENCES "core"."location"("id");

CREATE INDEX "drying_run_drying_bed_location_id_idx"
  ON "traceability"."drying_run"("drying_bed_location_id");

-- Un CHECK no puede mirar `location`. Por eso es disparador — el mismo error que
-- se cometió el 2026-09-14 y se corrigió con esta forma.
CREATE OR REPLACE FUNCTION "traceability"."exigir_cama_de_secado"()
RETURNS TRIGGER AS $$
DECLARE tipo TEXT;
BEGIN
  IF NEW."drying_bed_location_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "location_type"::TEXT INTO tipo
    FROM "core"."location" WHERE "id" = NEW."drying_bed_location_id";
  IF tipo IS DISTINCT FROM 'drying_bed' THEN
    RAISE EXCEPTION 'La ubicación de una corrida de secado debe ser una cama de secado (es %)', tipo;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "drying_run_exigir_cama"
  BEFORE INSERT OR UPDATE OF "drying_bed_location_id" ON "traceability"."drying_run"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_cama_de_secado"();
```

- [ ] **Paso 5: aplicar, regenerar, ver pasar**

```bash
npx prisma migrate deploy && npx prisma generate
npx vitest run tests/traceability/topologiaDeSecado.test.ts
```
Esperado: PASA, y la prueba de la tarea 1 sigue pasando.

- [ ] **Paso 6: flip-test del disparador**

Quitar el `RAISE EXCEPTION` (dejar `RETURN NEW`), aplicar a la base de pruebas,
correr. **Esperado: cae exactamente `rechaza una corrida cuya cama no es una cama`,
por su nombre.** Restaurar. Sin ver caer ese test por su nombre, el disparador no
está probado.

- [ ] **Paso 7: commit** (mismo procedimiento que la tarea 1; esperado 3 archivos)

---

### Tarea 3: La muestra gana estado de material, papel, tipo e instantánea

**Archivos:**
- Modificar: `prisma/schema.prisma` (modelo `Sample`), `lib/traceability/samples.ts`
- Crear: `prisma/migrations/<sello>_muestra_con_material_y_papel/migration.sql`
- Prueba: `tests/traceability/muestraConMaterial.test.ts`

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce: `MaterialState = "CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT" | "GREEN"`;
  `SamplingRole = "ZONE" | "REPLICATE"`;
  `SampleKind = "PROCESS" | "MOISTURE" | "ROAST" | "CUPPING" | "RETENTION"`;
  y en el servicio, `createSample(userAccountId, input)` acepta
  `materialState?`, `samplingRole?`, `samplingZone?`, `samplingZoneNote?`,
  `sampleKind?`, `stageAtExtraction?`, `massAtExtraction?`, `massUnitAtExtraction?`,
  `moisturePctAtExtraction?`.

**Los cinco tipos salen de `docs/beneficio`, no se inventan aquí.** Lo que `D-F3-01`
deja abierto es **si el testigo es obligatorio**, que es una regla y no entra en
esta tarea.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// tests/traceability/muestraConMaterial.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "../../lib/db";

describe("una muestra dice de qué material es y para qué se tomó", () => {
  it("guarda material, papel y tipo sin tocar el sampleType legado", async () => {
    const lote = await prisma.lot.findFirstOrThrow();
    const m = await prisma.sample.create({
      data: {
        sampleCode: `TEST-MAT-${Date.now()}`,
        sampleType: "green_coffee",      // legado, intacto
        sampleKind: "MOISTURE",
        materialState: "PARCHMENT",
        samplingRole: "ZONE",
        samplingZone: "NORTH",
        sourceLotId: lote.id,
      },
    });

    expect(m.materialState).toBe("PARCHMENT");
    expect(m.samplingRole).toBe("ZONE");
    // Control positivo: el legado sigue diciendo lo que decía, sin traducir.
    expect(m.sampleType).toBe("green_coffee");
    await prisma.sample.delete({ where: { id: m.id } });
  });

  it("congela el estado del lote al extraer, en columnas consultables", async () => {
    const lote = await prisma.lot.findFirstOrThrow();
    const m = await prisma.sample.create({
      data: {
        sampleCode: `TEST-SNAP-${Date.now()}`,
        sampleType: "green_coffee",
        sourceLotId: lote.id,
        stageAtExtraction: "drying",
        moisturePctAtExtraction: 18.0,
      },
    });
    expect(Number(m.moisturePctAtExtraction)).toBe(18);
    await prisma.sample.delete({ where: { id: m.id } });
  });
});
```

- [ ] **Paso 2: correrla y verla fallar**

Correr: `npx vitest run tests/traceability/muestraConMaterial.test.ts`
Esperado: FALLA — `Unknown argument sampleKind`.

- [ ] **Paso 3: el esquema**

Tres enums nuevos en `core`:

```prisma
enum MaterialState {
  CHERRY
  MUCILAGE_HONEY
  PARCHMENT
  /// El café verde NO pertenece al secado: es post-reposo, cuando el beneficio
  /// ya terminó de transformar (Daniel, 2026-09-15). Existe porque el estado es
  /// real, no porque se pueda medir en una cama.
  GREEN

  @@schema("core")
}

enum SamplingRole {
  /// Dos zonas distintas de la misma cama: su diferencia ES desigualdad de
  /// secado, y el motor puede alertar.
  ZONE
  /// Dos compuestas de la cama entera: su diferencia es ruido de muestreo, y
  /// alertar de desigualdad con ellas sería inventar una señal.
  REPLICATE

  @@schema("core")
}

enum SampleKind {
  PROCESS
  MOISTURE
  ROAST
  CUPPING
  RETENTION

  @@schema("core")
}

enum SamplingZone {
  NORTH
  SOUTH
  EAST
  WEST
  CENTER
  EDGE

  @@schema("core")
}
```

En `model Sample`, junto a `sampleType`:

```prisma
  /// `sampleType` arriba es LEGADO y no se reescribe: hoy es texto libre y su
  /// único valor real, `green_coffee`, no es ninguno de los cinco. Traducirlo
  /// inventaría un hecho. Mismo patrón que `deviceId` / `captureDeviceId`.
  sampleKind    SampleKind?    @map("sample_kind")
  materialState MaterialState? @map("material_state")
  samplingRole  SamplingRole?  @map("sampling_role")
  samplingZone  SamplingZone?  @map("sampling_zone")
  /// Texto libre AL LADO del enum, nunca en su lugar — lo que ordena el
  /// comentario de `SunExposure`.
  samplingZoneNote String? @map("sampling_zone_note")

  /// La instantánea de F3-003, en columnas nombradas y no en un JSON (CLAUDE.md
  /// §49). La transformación ya es inmutable y el estado SE PUEDE reconstruir;
  /// lo que falta es que esté congelado, para que nadie lea el 11 % de hoy
  /// creyendo que es el 18 % de entonces.
  stageAtExtraction       String?  @map("stage_at_extraction")
  massAtExtraction        Decimal? @map("mass_at_extraction") @db.Decimal(12, 4)
  massUnitAtExtraction    String?  @map("mass_unit_at_extraction")
  moisturePctAtExtraction Decimal? @map("moisture_pct_at_extraction")  @db.Decimal(5, 2)
```

- [ ] **Paso 4: la migración**

```sql
CREATE TYPE "core"."MaterialState" AS ENUM ('CHERRY','MUCILAGE_HONEY','PARCHMENT','GREEN');
CREATE TYPE "core"."SamplingRole"  AS ENUM ('ZONE','REPLICATE');
CREATE TYPE "core"."SampleKind"    AS ENUM ('PROCESS','MOISTURE','ROAST','CUPPING','RETENTION');
CREATE TYPE "core"."SamplingZone"  AS ENUM ('NORTH','SOUTH','EAST','WEST','CENTER','EDGE');

ALTER TABLE "core"."sample"
  ADD COLUMN "sample_kind"      "core"."SampleKind",
  ADD COLUMN "material_state"   "core"."MaterialState",
  ADD COLUMN "sampling_role"    "core"."SamplingRole",
  ADD COLUMN "sampling_zone"    "core"."SamplingZone",
  ADD COLUMN "sampling_zone_note" TEXT,
  ADD COLUMN "stage_at_extraction" TEXT,
  ADD COLUMN "mass_at_extraction" DECIMAL(12,4),
  ADD COLUMN "mass_unit_at_extraction" TEXT,
  ADD COLUMN "moisture_pct_at_extraction" DECIMAL(5,2);

-- Una zona sin papel declarado no significa nada, y un papel de réplica con
-- zona se contradice. Misma fila: CHECK basta.
ALTER TABLE "core"."sample"
  ADD CONSTRAINT "sample_zona_exige_papel_zona"
    CHECK ("sampling_zone" IS NULL OR "sampling_role" = 'ZONE');

-- Una masa sin unidad es un número sin significado.
ALTER TABLE "core"."sample"
  ADD CONSTRAINT "sample_masa_con_unidad"
    CHECK (("mass_at_extraction" IS NULL) = ("mass_unit_at_extraction" IS NULL));
```

- [ ] **Paso 5: aplicar, regenerar, ver pasar**

```bash
npx prisma migrate deploy && npx prisma generate
npx vitest run tests/traceability/muestraConMaterial.test.ts
```
Esperado: los dos PASAN.

- [ ] **Paso 6: la prueba del `CHECK` de zona sin papel**

```ts
it("no deja una zona declarada sobre una muestra que es réplica", async () => {
  const lote = await prisma.lot.findFirstOrThrow();
  await expect(
    prisma.sample.create({
      data: {
        sampleCode: `TEST-BAD-${Date.now()}`, sampleType: "green_coffee",
        sourceLotId: lote.id, samplingRole: "REPLICATE", samplingZone: "NORTH",
      },
    }),
  ).rejects.toThrow();
});
```

- [ ] **Paso 7: el servicio**

En `lib/traceability/samples.ts`, ampliar la entrada de creación con los nueve
campos, pasarlos tal cual al `create`, y **no derivar ninguno de otro**. El
`AuditEvent` sigue en la misma transacción — no se toca esa parte.

- [ ] **Paso 8: declarar en el carril con base y commit** (esperado: 5 archivos)

---

### Tarea 4: `SamplingEvent` — la inspección como acto

**Archivos:**
- Modificar: `prisma/schema.prisma` (nuevo modelo, relación en `Sample`)
- Crear: `prisma/migrations/<sello>_evento_de_muestreo/migration.sql`,
  `lib/traceability/samplingEvents.ts`
- Prueba: `tests/traceability/eventoDeMuestreo.test.ts`

**Interfaces:**
- Consume: `LocationType.drying_bed` (tarea 1), los campos de `Sample` (tarea 3).
- Produce: `createSamplingEvent(userAccountId, input: { dryingBedLocationId?: string | null; dryingRunId?: string | null; occurredAt: Date; operatorPersonId?: string | null; notes?: string | null }): Promise<SamplingEvent>` y `Sample.samplingEventId`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
it("agrupa las dos muestras de una cama en un acto, y eso es lo que las hace comparables", async () => {
  const lote = await prisma.lot.findFirstOrThrow();
  const ev = await createSamplingEvent(actorId, { occurredAt: new Date("2026-03-01T09:00:00Z") });
  const a = await prisma.sample.create({ data: {
    sampleCode: `TEST-EV-A-${Date.now()}`, sampleType: "green_coffee", sourceLotId: lote.id,
    samplingEventId: ev.id, samplingRole: "ZONE", samplingZone: "NORTH", materialState: "PARCHMENT" } });
  const b = await prisma.sample.create({ data: {
    sampleCode: `TEST-EV-B-${Date.now()}`, sampleType: "green_coffee", sourceLotId: lote.id,
    samplingEventId: ev.id, samplingRole: "ZONE", samplingZone: "SOUTH", materialState: "PARCHMENT" } });

  const leido = await prisma.samplingEvent.findUniqueOrThrow({
    where: { id: ev.id }, include: { samples: true },
  });
  expect(leido.samples.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
});
```

- [ ] **Paso 2: correrla y verla fallar** — `prisma.samplingEvent is undefined`.

- [ ] **Paso 3: el modelo**

```prisma
/// El ACTO de ir a una cama en un momento y sacar muestras. Existe para que
/// «estas dos son las zonas de esta cama a esta hora» sea ESTRUCTURAL en vez de
/// inferido por cercanía de fechas. No duplica `Sample`: la muestra es la cosa
/// física, esto es la ida a buscarla.
model SamplingEvent {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  dryingBedLocationId String?   @map("drying_bed_location_id") @db.Uuid
  dryingBedLocation   Location? @relation("SamplingEventBed", fields: [dryingBedLocationId], references: [id])
  dryingRunId         String?    @map("drying_run_id") @db.Uuid
  dryingRun           DryingRun? @relation(fields: [dryingRunId], references: [id])

  occurredAt       DateTime @map("occurred_at")
  operatorPersonId String?  @map("operator_person_id") @db.Uuid
  operator         Person?  @relation("SamplingEventOperator", fields: [operatorPersonId], references: [id])
  notes            String?

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("SamplingEventCreatedBy", fields: [createdBy], references: [id])

  samples Sample[]

  @@index([dryingBedLocationId])
  @@index([dryingRunId])
  @@map("sampling_event")
  @@schema("core")
}
```

Y en `Sample`: `samplingEventId String? @map("sampling_event_id") @db.Uuid` con su relación e índice.

- [ ] **Paso 4: la migración** — `CREATE TABLE "core"."sampling_event"` con esas
columnas y sus FK, `ALTER TABLE "core"."sample" ADD COLUMN "sampling_event_id" UUID
REFERENCES "core"."sampling_event"("id")`, más los tres índices. Y el mismo
disparador de la tarea 2 aplicado aquí: si `drying_bed_location_id` no es nulo, su
`location_type` debe ser `drying_bed`.

- [ ] **Paso 5: el servicio**, en `lib/traceability/samplingEvents.ts`: resolver
permiso contra el lote/ubicación como hace el resto del módulo, crear el evento y
su `AuditEvent` **en la misma transacción**.

- [ ] **Paso 6: aplicar, regenerar, ver pasar, declarar en el carril, commit**

---

### Tarea 5: Los modos del instrumento, y la marca del desajuste

**Archivos:**
- Modificar: `prisma/schema.prisma` (`Measurement`, `MeasurementReviewFlag`)
- Crear: `prisma/migrations/<sello>_modos_de_instrumento/migration.sql`,
  `lib/equipos/modos.ts`
- Prueba: `tests/equipos/modosDeInstrumento.test.ts`

**Interfaces:**
- Consume: `MaterialState` (tarea 3); `Equipment` e `InstrumentCheck` ya existen.
- Produce: `InstrumentMeasurementMode`; `Measurement.instrumentModeId`;
  `modoEsperado(materialState: MaterialState, modos: readonly InstrumentMeasurementMode[]): InstrumentMeasurementMode | null`;
  `hayDesajuste(modo: InstrumentMeasurementMode | null, material: MaterialState | null): boolean`.

**Esta tarea toma la decisión que el spec describe y no cierra.**
`MeasurementReviewFlag.raisedByCheckId` es `NOT NULL` y apunta a `InstrumentCheck`:
la marca sólo existe como consecuencia de una verificación de instrumento, y un
desajuste material↔modo no tiene ninguna que la levante. **Se hace anulable y se
añade un motivo declarado**, en vez de crear una marca hermana: dos tablas de
marcas obligarían a toda pantalla a unir las dos para saber si una medición está
señalada, y esa unión se olvida. El motivo pasa a ser obligatorio y explícito, que
es lo que hoy está implícito en «viene de un check».

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// tests/equipos/modosDeInstrumento.test.ts
import { describe, it, expect } from "vitest";
import { modoEsperado, hayDesajuste } from "../../lib/equipos/modos";

const MODOS = [
  { id: "m1", label: "Parchment Coffee", materialState: "PARCHMENT", rangeMin: 8,  rangeMax: 38 },
  { id: "m2", label: "Green Coffee",     materialState: "GREEN",     rangeMin: 7,  rangeMax: 35 },
] as const;

describe("el modo del instrumento se elige por el material, no por la memoria", () => {
  it("propone el modo cuyo material coincide", () => {
    expect(modoEsperado("PARCHMENT", MODOS)?.label).toBe("Parchment Coffee");
  });

  it("devuelve null cuando el aparato no tiene modo para ese material", () => {
    // Un medidor de grano no tiene escala de cereza. Decirlo es más útil que
    // ofrecer una escala al azar.
    expect(modoEsperado("CHERRY", MODOS)).toBeNull();
  });

  it("detecta medir pergamino con el ajuste de verde", () => {
    expect(hayDesajuste(MODOS[1], "PARCHMENT")).toBe(true);
    // Control positivo: el caso correcto NO es desajuste.
    expect(hayDesajuste(MODOS[0], "PARCHMENT")).toBe(false);
  });

  it("sin modo declarado no afirma desajuste", () => {
    // «No sabemos en qué modo estaba» no es «estaba en el modo equivocado».
    expect(hayDesajuste(null, "PARCHMENT")).toBe(false);
  });
});
```

- [ ] **Paso 2: correrla y verla fallar** — `Cannot find module '../../lib/equipos/modos'`.

- [ ] **Paso 3: el dominio puro**, sin Prisma, para que corra en el carril hermético:

```ts
// lib/equipos/modos.ts
import type { MaterialState } from "../../generated/prisma/client";

export interface ModoDeMedicion {
  readonly id: string;
  readonly label: string;
  readonly materialState: MaterialState;
  readonly rangeMin: number | null;
  readonly rangeMax: number | null;
}

/** El modo que este material pide, o `null` si el aparato no tiene ninguno. */
export function modoEsperado(
  material: MaterialState,
  modos: readonly ModoDeMedicion[],
): ModoDeMedicion | null {
  return modos.find((m) => m.materialState === material) ?? null;
}

/**
 * Sólo afirma desajuste cuando se sabe modo Y material. Un nulo es ignorancia,
 * y tratarla como error convertiría «no lo sabemos» en una acusación.
 */
export function hayDesajuste(
  modo: ModoDeMedicion | null,
  material: MaterialState | null,
): boolean {
  if (!modo || !material) return false;
  return modo.materialState !== material;
}

/** Fuera del rango el aparato no da número: no es un cero, es una no-lectura. */
export function fueraDeRango(modo: ModoDeMedicion, valor: number): boolean {
  if (modo.rangeMin != null && valor < modo.rangeMin) return true;
  if (modo.rangeMax != null && valor > modo.rangeMax) return true;
  return false;
}
```

- [ ] **Paso 4: correr y ver pasar** — `npx vitest run tests/equipos/modosDeInstrumento.test.ts`.
**Esta prueba NO va al carril con base**: es dominio puro y debe correr en el
hermético. Comprobar que `bash scripts/ci.sh` **sí** la ejecuta.

- [ ] **Paso 5: la tabla y la columna**

```prisma
/// Hermana de `InstrumentCheckRequirement`, con la misma forma: por instrumento,
/// qué modos tiene y cómo los llama EL APARATO. El nombre es del fabricante y no
/// una paráfrasis nuestra: si la app dice «usa el ajuste de pergamino» y el
/// aparato no lo llama así, el recordatorio estorba en vez de ayudar.
model InstrumentMeasurementMode {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  equipmentId String    @map("equipment_id") @db.Uuid
  equipment   Equipment @relation("EquipmentModes", fields: [equipmentId], references: [id], onDelete: Cascade)

  label         String
  materialState MaterialState @map("material_state")
  rangeMin      Decimal?      @map("range_min") @db.Decimal(12, 4)
  rangeMax      Decimal?      @map("range_max") @db.Decimal(12, 4)
  /// Desfase que una persona aplicó a esta escala. Cambia el número que el
  /// aparato muestra, así que es procedencia: dos aparatos con desfases
  /// distintos dan lecturas distintas del mismo grano.
  calibrationOffset Decimal? @map("calibration_offset") @db.Decimal(5, 2)
  calibrationMode   String?  @map("calibration_mode")

  displayOrder Int       @default(0) @map("display_order")
  retiredAt    DateTime? @map("retired_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  createdBy    String?   @map("created_by") @db.Uuid

  measurements Measurement[] @relation("MeasurementMode")

  @@unique([equipmentId, label])
  @@index([equipmentId])
  @@map("instrument_measurement_mode")
  @@schema("core")
}
```

En `Measurement`, junto a `instrumentId`:

```prisma
  /// EN QUÉ MODO estaba el aparato. `instrumentId` dice cuál midió; esto dice
  /// cómo estaba puesto, que es lo que distingue una lectura buena de un número
  /// plausible y equivocado.
  instrumentModeId String?                    @map("instrument_mode_id") @db.Uuid
  instrumentMode   InstrumentMeasurementMode? @relation("MeasurementMode", fields: [instrumentModeId], references: [id])
```

Y `MeasurementReviewFlag` cambia:

```prisma
  /// Anulable desde 2026-09-15: una marca puede venir de una verificación de
  /// instrumento O de un desajuste entre el modo y el material, que no tiene
  /// check que la levante. El motivo de abajo pasa a decir cuál es.
  raisedByCheckId String?          @map("raised_by_check_id") @db.Uuid
  raisedByCheck   InstrumentCheck? @relation("ReviewFlagRaisedBy", fields: [raisedByCheckId], references: [id], onDelete: Cascade)
  reason          MeasurementReviewReason @default(instrument_check_failed)
```

```prisma
enum MeasurementReviewReason {
  instrument_check_failed
  instrument_check_overdue
  mode_material_mismatch
  material_stage_mismatch

  @@schema("core")
}
```

- [ ] **Paso 6: la migración**, con el `CHECK` que impide que la marca pierda su
causa:

```sql
ALTER TABLE "core"."measurement_review_flag"
  ALTER COLUMN "raised_by_check_id" DROP NOT NULL,
  ADD COLUMN "reason" "core"."MeasurementReviewReason" NOT NULL DEFAULT 'instrument_check_failed';

-- Una marca de instrumento SIN su check no dice de dónde salió.
ALTER TABLE "core"."measurement_review_flag"
  ADD CONSTRAINT "review_flag_causa_coherente"
    CHECK (
      ("reason" IN ('instrument_check_failed','instrument_check_overdue') AND "raised_by_check_id" IS NOT NULL)
      OR ("reason" IN ('mode_material_mismatch','material_stage_mismatch') AND "raised_by_check_id" IS NULL)
    );
```

**Ojo con el `@@unique([measurementId, raisedByCheckId])` existente:** en Postgres
dos filas con `NULL` no colisionan, así que una medición podría acumular marcas
repetidas de desajuste. Añadir un índice único parcial:

```sql
CREATE UNIQUE INDEX "review_flag_una_por_motivo_sin_check"
  ON "core"."measurement_review_flag"("measurement_id","reason")
  WHERE "raised_by_check_id" IS NULL;
```

- [ ] **Paso 7: prueba de las filas viejas** — las marcas existentes deben seguir
teniendo su check y su motivo por defecto:

```ts
it("las marcas que ya existían conservan su check y nacen con el motivo viejo", async () => {
  const previas = await prisma.measurementReviewFlag.findMany({ take: 5 });
  for (const f of previas) {
    expect(f.raisedByCheckId).not.toBeNull();
    expect(f.reason).toBe("instrument_check_failed");
  }
});
```

- [ ] **Paso 8: aplicar, regenerar, correr todo, declarar carriles, commit**

---

### Tarea 6: El puente deja de rellenar con constantes

**Archivos:**
- Modificar: `lib/beneficio/desdeElLote.ts:186-235`
- Prueba: `tests/beneficio/desde-el-lote.test.ts` (existe; se amplía)

**Interfaces:**
- Consume: todo lo anterior.
- Produce: `MedicionDelLote` gana `materialState`, `samplingRole`, `samplingEventId`,
  `waterActivity`; `limitaciones` pasa a ser condicional.

**Es la tarea que hace visible todo el resto.** Cuatro cambios, y el cuarto es el
que más importa.

- [ ] **Paso 1: la prueba que hace SALIR `UNEVEN_DRYING`**

Hoy no puede salir nunca, así que una prueba que no lo ve salir no prueba nada.

```ts
it("emite UNEVEN_DRYING cuando dos zonas de la misma cama difieren, y no cuando son réplica", () => {
  const base = { variable: "moisture", occurredAt: new Date("2026-03-05T09:00:00Z"),
                 provenanceClass: "direct_observation", fueCorregida: false,
                 materialState: "PARCHMENT", samplingEventId: "ev-1" } as const;

  const zonas = veredictoDelLote({
    fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
    gradoDeProceso: "Washed", ahora: new Date("2026-03-05T12:00:00Z"),
    mediciones: [
      { ...base, value: 22, samplingRole: "ZONE" },
      { ...base, value: 13, samplingRole: "ZONE" },
    ],
  });
  expect(zonas.secado?.alerts.map((a) => a.code)).toContain("UNEVEN_DRYING");

  // Control positivo: los MISMOS números como réplica NO alertan — su diferencia
  // es ruido de muestreo, y alertar con ellos sería inventar una señal.
  const replica = veredictoDelLote({
    fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
    gradoDeProceso: "Washed", ahora: new Date("2026-03-05T12:00:00Z"),
    mediciones: [
      { ...base, value: 22, samplingRole: "REPLICATE" },
      { ...base, value: 13, samplingRole: "REPLICATE" },
    ],
  });
  expect(replica.secado?.alerts.map((a) => a.code)).not.toContain("UNEVEN_DRYING");
});
```

- [ ] **Paso 2: la prueba que hace SALIR `TARGET_REACHED`**

```ts
// `veredictoDelLote` devuelve `VeredictoDeFase | SinVeredicto`, y `SinVeredicto`
// es una cadena. Sin este guardia, `v.secado` no compila — y peor, un
// `(v as any).secado` daría `undefined` y el `not.toContain` pasaría VACÍO.
function fase(v: ReturnType<typeof veredictoDelLote>) {
  if (typeof v === "string") throw new Error(`esperaba un veredicto, salió ${v}`);
  return v;
}

const COMUN = {
  fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
  gradoDeProceso: "Washed",
  ahora: new Date("2026-03-20T12:00:00Z"),
} as const;

const HUMEDAD_EN_OBJETIVO = {
  variable: "moisture", value: 11, occurredAt: new Date("2026-03-19T09:00:00Z"),
  provenanceClass: "direct_observation", fueCorregida: false,
  materialState: "PARCHMENT", samplingRole: "ZONE", samplingEventId: "ev-aw",
} as const;

it("emite TARGET_REACHED sólo cuando hay humedad Y actividad de agua", () => {
  const conAw = fase(veredictoDelLote({
    ...COMUN,
    mediciones: [
      HUMEDAD_EN_OBJETIVO,
      { variable: "water_activity", value: 0.58, occurredAt: new Date("2026-03-19T09:05:00Z"),
        provenanceClass: "direct_observation", fueCorregida: false,
        materialState: "PARCHMENT", samplingEventId: "ev-aw" },
    ],
  }));
  expect(conAw.secado?.alerts.map((a) => a.code)).toContain("TARGET_REACHED");

  // Control positivo: LA MISMA humedad sin actividad de agua no alcanza el
  // objetivo, y además lo dice en vez de callarlo.
  const sinAw = fase(veredictoDelLote({ ...COMUN, mediciones: [HUMEDAD_EN_OBJETIVO] }));
  expect(sinAw.secado?.alerts.map((a) => a.code)).not.toContain("TARGET_REACHED");
  expect(sinAw.limitaciones).toContain("SIN_ACTIVIDAD_DE_AGUA");
});
```

- [ ] **Paso 3: la prueba que vigila lo que NO debe romperse**

**La más importante del plan.** Si cae, hemos cambiado el hueco por silencio.

```ts
it("un lote SIN el dato nuevo sigue declarando sus limitaciones, no se calla", () => {
  const viejo = veredictoDelLote({
    fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
    gradoDeProceso: "Washed", ahora: new Date("2026-03-05T12:00:00Z"),
    mediciones: [{ variable: "moisture", value: 15, occurredAt: new Date("2026-03-04T09:00:00Z"),
                   provenanceClass: "direct_observation", fueCorregida: false }],
  });
  expect(viejo.limitaciones).toContain("UN_SOLO_PUNTO_DE_CAMA");
  expect(viejo.limitaciones).toContain("SIN_ACTIVIDAD_DE_AGUA");
});
```

- [ ] **Paso 4: correr las tres y verlas fallar** — las dos primeras por alerta
ausente, la tercera pasa ya (es la red que protege lo existente).

- [ ] **Paso 5: los cuatro cambios en `desdeElLote.ts`**

1. `waterActivity: null` → la medición `water_activity` del mismo `samplingEventId`,
   o `null` si no hay.
2. `bedPointsPct: [m.value]` → agrupar por `samplingEventId` las mediciones con
   `samplingRole === "ZONE"` y pasar sus valores como el arreglo. Con una sola, o
   con réplicas, sigue siendo un punto.
3. `samplePoint: "TANK_LIQUID_MID"` fijo → derivarlo del `materialState`.
4. Las cuatro `limitaciones` pasan a empujarse **sólo cuando el dato falta**:
   `SIN_PUNTO_DE_MUESTREO` si alguna lectura no trae `materialState`;
   `UN_SOLO_PUNTO_DE_CAMA` si ninguna inspección aporta dos o más zonas;
   `SIN_ACTIVIDAD_DE_AGUA` si no hay `water_activity`;
   `SIN_INSTRUMENTO_DECLARADO` como está hoy.

- [ ] **Paso 6: correr las tres y verlas pasar**, más
`npx vitest run tests/beneficio/` entero, que no debe moverse.

- [ ] **Paso 7: flip-test** — invertir la condición de `samplingRole === "ZONE"`.
Esperado: cae `emite UNEVEN_DRYING cuando dos zonas de la misma cama difieren, y no
cuando son réplica`, por su nombre. Compila. Restaurar.

- [ ] **Paso 8: commit**

---

### Tarea 7: El formulario de medición avisa ANTES

**Archivos:**
- Modificar: `app/components/traceability/MeasurementForm.tsx`,
  `app/actions/traceability.ts`, `messages/es.json`, `messages/en.json`
- Prueba: `tests/beneficio/avisoDeModo.test.ts`

**Interfaces:** consume `modoEsperado`/`hayDesajuste` (tarea 5) y `MaterialState` (tarea 3).

**Decisión de Daniel, 2026-09-15: el aviso va al ABRIR, no al guardar, y no
bloquea.** Previene en vez de corregir.

- [ ] **Paso 1: el texto, en los dos idiomas**, sin imperativo — lo vigila
`tests/arquitectura/alertas-con-su-texto.test.ts`:

```json
"aviso_modo_de_instrumento": "Este lote está en pergamino. Conviene comprobar que el medidor esté en el modo «{modo}» antes de leer.",
"aviso_sin_modo_para_material": "Este medidor no declara un modo para {material}. Conviene anotar con qué se midió."
```

- [ ] **Paso 2: la prueba del aviso** — que el texto salga con el `label` del
aparato interpolado, y que **no salga** cuando modo y material coinciden.
Control positivo incluido.

- [ ] **Paso 3: los campos nuevos en el formulario** — modo (sólo los del equipo
elegido, no retirados), estado del material (recortado por la etapa del lote), y si
hay inspección, papel y zona. **Un campo en blanco NO se envía**: el agua es 0 °Bx
y un blanco convertido en cero es un dato falso.

- [ ] **Paso 4: el aviso de material contra etapa — `GREEN` en secado**

El hueco que la auto-revisión del plan encontró: la tarea 5 declara el motivo
`material_stage_mismatch` y ninguna tarea lo levantaba.

**Decisión de Daniel, 2026-09-15: avisa y deja pasar, como todo lo demás.** El
diseño llegó a proponer aquí su única puerta dura y él la cerró al revés, porque
la puerta que se esquiva enseña a esquivar todas.

```ts
it("avisa —y NO impide— registrar café verde en una cama de secado", async () => {
  const guardada = await registrarMedicion(actorId, {
    ...entradaDeSecado, materialState: "GREEN", variable: "moisture", value: 11,
  });
  expect(guardada.id).toBeTruthy();                       // entró
  const marcas = await prisma.measurementReviewFlag.findMany({
    where: { measurementId: guardada.id },
  });
  expect(marcas.map((m) => m.reason)).toContain("material_stage_mismatch");
  expect(marcas[0]!.raisedByCheckId).toBeNull();          // no viene de un check

  // Control positivo: pergamino en secado entra SIN marca.
  const buena = await registrarMedicion(actorId, {
    ...entradaDeSecado, materialState: "PARCHMENT", variable: "moisture", value: 11,
  });
  expect(await prisma.measurementReviewFlag.count({ where: { measurementId: buena.id } })).toBe(0);
});
```

Y el texto, sin imperativo:

```json
"aviso_material_no_es_de_esta_etapa": "El café verde no se ve en secado: es posterior al reposo. Conviene revisar si la etapa del lote o el material de la muestra están bien."
```

- [ ] **Paso 5: doble toque** — los dos botones de envío llevan protección, como
exigen los guardias de la casa.

- [ ] **Paso 6: la ruta declarada** — toda ruta nueva se declara donde el guardia
de rutas lo pide, o la compuerta la señala.

- [ ] **Paso 7: `npm run verify` y `npm run build`.** `vitest` **no comprueba
tipos** y `verify` **no corre `next build`**: un `export class` en un archivo
`"use server"` pasa las dos y rompe producción. Esta tarea toca `app/`, así que
corre `build`.

- [ ] **Paso 8: commit**

---

### Tarea 8: La pantalla de inspección

**Archivos:** crear `app/inspecciones/nueva/page.tsx` y su acción; modificar
`messages/*.json`. Prueba: `tests/traceability/eventoDeMuestreo.test.ts` (se amplía).

**Interfaces:** consume `createSamplingEvent` (tarea 4) y el servicio de muestras (tarea 3).

- [ ] **Paso 1: la prueba de que un envío crea el acto y sus dos muestras en una
transacción** — si la segunda muestra falla, no queda ni el evento ni la primera.
- [ ] **Paso 2: verla fallar.**
- [ ] **Paso 3: la pantalla** — una cama, una hora, y dos bloques de muestra con su
papel y su zona. Medir dos muestras como dos formularios sueltos es la fricción que
esta pantalla existe para quitar.
- [ ] **Paso 4: verla pasar.**
- [ ] **Paso 5: `verify`, `build`, commit.**

---

### Tarea 9: Administración de instalaciones y camas

**Archivos:** crear `app/instalaciones/page.tsx`, `app/instalaciones/nueva/page.tsx`,
`app/instalaciones/[id]/page.tsx` y sus acciones.

**Interfaces:** consume la tarea 1.

- [ ] **Paso 1: la prueba de permisos** — crear una instalación exige
`location:manage_attributes` sobre el sitio padre; **un usuario sin ese permiso
recibe un fallo, no una pantalla vacía**. Las pruebas de RBAC son obligatorias y
deben probar explícitamente el acceso no autorizado.
- [ ] **Paso 2: verla fallar.**
- [ ] **Paso 3: las tres pantallas**, con el árbol sitio → instalación → cama y el
nivel de rack donde aplique.
- [ ] **Paso 4: verla pasar.**
- [ ] **Paso 5: `verify`, `build`, commit.**

---

## Lo que este plan NO hace

Está en §11 del spec y se repite aquí para que nadie lo tome por olvido: la
**receta de secado** (y con ella el camino a `COLD_HOLD_PREFERMENT`), la **capa
ambiental** entera, la **trazabilidad de plantón** y el **reposo mínimo**. Cada uno
es su propio spec.

Y dos decisiones que siguen siendo de Daniel: **`D-F3-01`** —si el testigo es
obligatorio; la tarea 3 declara el vocabulario pero ninguna tarea impone la regla—
y **`P-F`**, que mantiene todo umbral de motor como `[PROVISIONAL]`.
