# Tablero de parcela — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla de parcela diga de un vistazo cómo está el lote y qué hay pendiente, y que la gestión viva en una pantalla aparte.

**Architecture:** Tres funciones puras nuevas: el estado de producción de cada siembra, los avisos pendientes y las cifras del lote. Se prueban sin base y la página sólo las pinta. «Entró en producción» es un tercer tipo de `PlantingEvent`, con una precisión opcional en su fecha. Los formularios de gestión se mudan a `/plots/[id]/ajustes`, y lo que no puede encolarse dice «Necesita conexión».

**Tech Stack:** Next.js (App Router, Server Actions), Prisma + PostgreSQL, next-intl, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-tablero-de-parcela-design.md`

## Global Constraints

- **Lo que falta se dice con su motivo, nunca con un cero** (ADR-080). Un conteo ausente da «al menos N», nunca 0.
- **Una siembra sin evento `entered_production` es «sin marcar», nunca «en levante».**
- **Gana el evento registrado más recientemente** (`createdAt` mayor), no el de `occurredAt` mayor.
- **`sampledAt` es un campo de día** (medianoche UTC). Se compara como cadena `YYYY-MM-DD` y nunca se le aplica un desfase horario.
- **Sin zona horaria** (`Location.timezone` es NULL en las 26 ubicaciones hoy), «hoy» se calcula en **UTC−12** (`Etc/GMT+12`): el aviso puede llegar un día tarde, nunca uno antes. **No se usa `ZONA_POR_DEFECTO`** (`lib/time/mostrarInstante.ts`): esa zona es un respaldo *para mostrar*, y un aviso de vencimiento es una afirmación.
- **Las funciones puras importan tipos con `import type`.** `plantingCohorts.ts` carga `lib/db` al importarse, y un `import` normal metería la base en pruebas que CI corre sin base.
- **Migración a mano, aplicada con `npx prisma migrate deploy`. Nunca `prisma migrate dev`:** la base de pruebas del 55433 es compartida y `migrate dev` ofrece reiniciarla.
- **Toda escritura evidencial lleva su `AuditEvent` en la misma transacción** (`recordAuditEvent(…, tx)`), como vigila `tests/arquitectura/audit-atomico.test.ts`.
- **Textos nuevos en `messages/es.json` y `messages/en.json`**, bajo `Traceability`, con prefijo `plotDashboard` (`pendingHeading` ya existe en otro sitio).
- **Una prueba nueva que necesite base va al grupo `# @grupo: base-sembrada`** de `scripts/pruebas-por-compuerta.txt`. `tests/traceability/plantingCohorts.test.ts` está en `datos-reales`, que **no corre en CI**: no se amplía ese archivo.
- Entorno: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`. Base de pruebas: `postgresql://postgres@127.0.0.1:55433/nectar_test`. Nunca `git add -A`; siempre `git commit -F <archivo>`.

## File Structure

| archivo | responsabilidad | tarea |
|---|---|---|
| `prisma/schema.prisma` | `PlantingEventType.entered_production`; `PlantingEvent.occurredPrecision` | 1 |
| `prisma/migrations/<sello>_evento_entrada_en_produccion/migration.sql` | la migración | 1 |
| `lib/traceability/plantingEvents.ts` | `recordEnteredProduction` | 1 |
| `tests/traceability/entradaEnProduccion.test.ts` | pruebas con base del servicio y de `getPlotDetail` | 1, 2 |
| `scripts/pruebas-por-compuerta.txt` | la prueba nueva en `base-sembrada` | 1 |
| `lib/traceability/estadoDeProduccion.ts` | puro: estado de cada siembra a partir de sus eventos | 2 |
| `lib/traceability/plantingCohorts.ts` | `getPlotDetail` devuelve también `eventosDeProduccion` | 2 |
| `tests/traceability/estadoDeProduccion.test.ts` | hermética | 2 |
| `lib/time/diaDeHoy.ts` | puro: «hoy» como `YYYY-MM-DD` en una zona, o UTC−12 sin zona | 3 |
| `lib/traceability/pendienteDeLaParcela.ts` | puro: avisos y su enlace | 3 |
| `tests/time/diaDeHoy.test.ts`, `tests/traceability/pendienteDeLaParcela.test.ts` | herméticas | 3 |
| `lib/traceability/cifrasDelLote.ts` | puro: plantas, producción, variedades | 4 |
| `tests/traceability/cifrasDelLote.test.ts` | hermética | 4 |
| `app/components/traceability/useSinConexion.ts` | el patrón de `FieldSyncControls` como hook | 5 |
| `app/components/traceability/BotonQueNecesitaConexion.tsx` | botón que se desactiva sin señal | 5 |
| `app/components/traceability/MarcarEnProduccionForm.tsx` | formulario nuevo | 5 |
| `app/actions/traceability.ts` | `recordEnteredProductionFormAction`; rama nueva en `friendlyError`; `revalidatePath` de ajustes | 5 |
| `app/components/traceability/{PlantingCohortForm,PlotAttributesForm,SoilProfileForm}.tsx` | el botón de corregir pasa a `BotonQueNecesitaConexion` | 5 |
| `app/plots/[id]/ajustes/page.tsx` | pantalla de gestión | 5 |
| `app/plots/[id]/page.tsx` | el tablero | 6 |
| `messages/es.json`, `messages/en.json` | textos | 5, 6 |

---

### Task 1: «Entró en producción» se puede registrar

**Files:**
- Modify: `prisma/schema.prisma` (`enum PlantingEventType`, `model PlantingEvent`)
- Create: `prisma/migrations/<sello>_evento_entrada_en_produccion/migration.sql`
- Modify: `lib/traceability/plantingEvents.ts`
- Create: `tests/traceability/entradaEnProduccion.test.ts`
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consumes: nada.
- Produces: `recordEnteredProduction(userAccountId: string, input: RecordEnteredProductionInput, ahora?: Date): Promise<PlantingEvent>` y `PlantingEventValidationError` (ya existe) con los códigos `cohort_not_found`, `cohort_not_active`, `production_date_in_future`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/traceability/entradaEnProduccion.test.ts`. Los datos de ejemplo copian el patrón de `tests/traceability/plantingCohorts.test.ts`: Farm Operator con scope de ubicación y cultivar sembrado por `db:seed`.

```ts
/**
 * Tablero de parcela — «entró en producción» como evento de siembra.
 *
 * Base real, datos con RUN_ID, mismo patrón de acceso que plantingCohorts.test.ts
 * (Farm Operator con scope de ubicación). Vive en su propio archivo y en el
 * grupo `base-sembrada`: plantingCohorts.test.ts está en `datos-reales` y no
 * corre en CI.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createPlantingCohort } from "../../lib/traceability/plantingCohorts";
import { recordEnteredProduction, PlantingEventValidationError } from "../../lib/traceability/plantingEvents";
import { LocationAccessError } from "../../lib/traceability/locations";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `produccion-${Date.now()}`;

let organizationId: string;
let plotId: string;
let otroPlotId: string;
let operadorId: string;
let ajenoId: string;
let caturraValueId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return account.id;
}

async function assignFarmOperator(userAccountId: string, locationRefId: string) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationRefId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationRefId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scope.id } });
}

async function plot(name: string) {
  const location = await prisma.location.create({
    data: { locationType: "plot", name: `TEST ${name} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  return location.id;
}

async function siembraActiva(locationId: string) {
  return createPlantingCohort(operadorId, {
    locationId,
    cultivarValueId: caturraValueId,
    plantedAt: new Date("2019-01-01"),
    plantedPrecision: "year",
    plantCount: 500,
    provenanceClass: "original_record",
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;
  plotId = await plot("Lote produccion");
  otroPlotId = await plot("Lote ajeno");
  operadorId = await createTestUserAccount("Operador");
  await assignFarmOperator(operadorId, plotId);
  ajenoId = await createTestUserAccount("Ajeno");
  await assignFarmOperator(ajenoId, otroPlotId);
  const caturra = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "Caturra", catalog: { key: "cultivar" } },
  });
  caturraValueId = caturra.id;
});

afterAll(async () => {
  const locationIds = [plotId, otroPlotId];
  const eventos = await prisma.plantingEvent.findMany({ where: { locationId: { in: locationIds } }, select: { id: true } });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: eventos.map((e) => e.id) } }) });
  await prisma.plantingEvent.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  const cohortes = await prisma.plantingCohort.findMany({ where: { locationId: { in: locationIds } }, select: { id: true } });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: cohortes.map((c) => c.id) } }) });
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  const userIds = [operadorId, ajenoId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: locationIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordEnteredProduction", () => {
  it("guarda el evento con la fecha y la precisión que se escribieron, leyendo la fila", async () => {
    const cohorte = await siembraActiva(plotId);
    const evento = await recordEnteredProduction(operadorId, {
      plantingCohortId: cohorte.id,
      occurredAt: new Date("2021-01-01T00:00:00Z"),
      occurredPrecision: "year",
      provenanceClass: "original_record",
      notes: "Primera cosecha contada",
    });

    const fila = await prisma.plantingEvent.findUniqueOrThrow({ where: { id: evento.id } });
    expect(fila.eventType).toBe("entered_production");
    expect(fila.plantingCohortId).toBe(cohorte.id);
    expect(fila.locationId).toBe(plotId);
    expect(fila.occurredAt.toISOString()).toBe("2021-01-01T00:00:00.000Z");
    // Sin la columna, «desde 2021» se leería como el 1 de enero exacto.
    expect(fila.occurredPrecision).toBe("year");
    expect(fila.notes).toBe("Primera cosecha contada");
  });

  it("escribe su AuditEvent", async () => {
    const cohorte = await siembraActiva(plotId);
    const evento = await recordEnteredProduction(operadorId, {
      plantingCohortId: cohorte.id,
      occurredAt: new Date("2022-06-01T00:00:00Z"),
      occurredPrecision: "month",
      provenanceClass: "direct_observation",
    });
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: evento.id } });
    expect(audit?.operation).toBe("planting_event.entered_production");
  });

  it("rechaza a un operador que no tiene esa parcela", async () => {
    const cohorte = await siembraActiva(plotId);
    await expect(
      recordEnteredProduction(ajenoId, {
        plantingCohortId: cohorte.id,
        occurredAt: new Date("2021-01-01T00:00:00Z"),
        occurredPrecision: "year",
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza una fecha futura", async () => {
    const cohorte = await siembraActiva(plotId);
    await expect(
      recordEnteredProduction(
        operadorId,
        { plantingCohortId: cohorte.id, occurredAt: new Date("2026-09-20T00:00:00Z"), occurredPrecision: "date", provenanceClass: "direct_observation" },
        new Date("2026-09-16T12:00:00Z"),
      ),
    ).rejects.toThrow(new PlantingEventValidationError("production_date_in_future"));
  });

  it("rechaza una siembra que no está activa", async () => {
    const cohorte = await siembraActiva(plotId);
    await prisma.plantingCohort.update({ where: { id: cohorte.id }, data: { status: "removed" } });
    await expect(
      recordEnteredProduction(operadorId, {
        plantingCohortId: cohorte.id,
        occurredAt: new Date("2021-01-01T00:00:00Z"),
        occurredPrecision: "year",
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(new PlantingEventValidationError("cohort_not_active"));
  });
});
```

- [ ] **Step 2: Registrar la prueba en `base-sembrada` y verla en rojo**

En `scripts/pruebas-por-compuerta.txt`, dentro del bloque `# @grupo: base-sembrada` (antes de `# @grupo: datos-reales`), añadir en orden alfabético, entre `tests/traceability/e2e.test.ts` y `tests/traceability/export.test.ts`:

```
tests/traceability/entradaEnProduccion.test.ts
```

Run: `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/entradaEnProduccion.test.ts`
Expected: FAIL. La causa tiene que ser que `recordEnteredProduction` no existe. Si falla por otra razón, como un dato de ejemplo mal armado, corregir eso antes de seguir.

- [ ] **Step 3: El esquema**

En `prisma/schema.prisma`, dentro de `enum PlantingEventType`, después de `planted`:

```prisma
  // Tablero de parcela (2026-09-16): desde cuándo una siembra da cosecha. Lo marca
  // el operador; no se deduce de la edad. Es un evento y no una columna para que
  // la historia no se sobrescriba: corregir es registrar otro, y cuenta el
  // registrado más recientemente.
  entered_production
```

En `model PlantingEvent`, justo después de la línea de `occurredAt`:

```prisma
  // Precisión de `occurredAt`. Nulo = instante exacto, como en todas las filas
  // anteriores, que no se rellenan. «En producción desde 2019» no es el 1 de enero:
  // sin esto la fecha afirma más de lo que sabe, igual que `plantedPrecision`.
  occurredPrecision HarvestWindowPrecision? @map("occurred_precision")
```

- [ ] **Step 4: La migración, escrita a mano**

El sello tiene que ser posterior a la última migración:

```bash
ls prisma/migrations | grep '^[0-9]' | tail -1
date -u +%Y%m%d%H%M%S
```

Crear `prisma/migrations/<sello>_evento_entrada_en_produccion/migration.sql`:

```sql
-- Tablero de parcela: «entró en producción» como evento de siembra.
-- Precedente de ADD VALUE en una migración: 20260915210000_marco_de_siembra_y_cohorte_planificada.
ALTER TYPE "traceability"."PlantingEventType" ADD VALUE 'entered_production';

-- HarvestWindowPrecision vive en el esquema `core`, no en `traceability`.
ALTER TABLE "traceability"."planting_event"
  ADD COLUMN "occurred_precision" "core"."HarvestWindowPrecision";
```

Aplicar y regenerar el cliente:

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx prisma migrate deploy
npx prisma generate
```

Leer la línea `Applying migration …`: tiene que nombrar esta migración.

- [ ] **Step 5: El servicio**

En `lib/traceability/plantingEvents.ts`, añadir a los imports:

```ts
import { requireLocationAttributeAccess } from "./locations";
```

Y cambiar el import de tipos por:

```ts
import type { DataQuality, HarvestWindowPrecision, PlantingEventType, ProvenanceClass } from "../../generated/prisma/client";
```

Al final del archivo:

```ts
export interface RecordEnteredProductionInput {
  plantingCohortId: string;
  /** Desde cuándo da cosecha, ya recortado a su precisión (`calcularFechaConPrecision`). */
  occurredAt: Date;
  occurredPrecision: HarvestWindowPrecision;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
  notes?: string | null;
}

/**
 * Marca desde cuándo una siembra da cosecha — tablero de parcela, spec §5.
 *
 * **No reutiliza `recordPlantingEvent`, y es a propósito.** Esa función protege
 * con `lot:manage`, mientras que la parcela y la corrección de siembras
 * (`updatePlantingCohort`) usan `location:manage_attributes`. Reutilizarla
 * haría que alguien que ve el tablero y puede corregir una siembra fuera
 * rechazado al marcarla en producción. Además no admite ni la siembra ni la
 * precisión de la fecha.
 *
 * Corregir una fecha equivocada es llamar otra vez con la buena: el evento
 * anterior no se toca, y cuenta el registrado más recientemente
 * (`estadoDeProduccion`).
 */
export async function recordEnteredProduction(
  userAccountId: string,
  input: RecordEnteredProductionInput,
  ahora: Date = new Date(),
) {
  const cohorte = await prisma.plantingCohort.findUnique({
    where: { id: input.plantingCohortId },
    select: { id: true, locationId: true, status: true },
  });
  if (!cohorte) throw new PlantingEventValidationError("cohort_not_found");
  await requireLocationAttributeAccess(userAccountId, cohorte.locationId);
  if (cohorte.status !== "active") throw new PlantingEventValidationError("cohort_not_active");
  if (input.occurredAt.getTime() > ahora.getTime()) {
    throw new PlantingEventValidationError("production_date_in_future");
  }

  return prisma.$transaction(async (tx) => {
    const evento = await tx.plantingEvent.create({
      data: {
        locationId: cohorte.locationId,
        plantingCohortId: cohorte.id,
        eventType: "entered_production",
        occurredAt: input.occurredAt,
        occurredPrecision: input.occurredPrecision,
        // `unit` tiene «plantones» por defecto; este evento no cuenta material.
        unit: null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "planting_event.entered_production",
        entityType: "planting_event",
        entityId: evento.id,
        after: evento,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return evento;
  });
}
```


- [ ] **Step 6: En verde, y el control de deriva**

```bash
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/entradaEnProduccion.test.ts; echo "salida=$?"
npx tsc --noEmit; echo "tsc=$?"
export DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test
export SHADOW_DATABASE_URL="${DATABASE_URL%%\?*}_shadow"
node scripts/crear-base-de-sombra.mjs
npx vitest run tests/derivaDeMigraciones.test.ts tests/arquitectura/audit-atomico.test.ts; echo "salida=$?"
```

Expected: las cuatro salidas en 0. `derivaDeMigraciones` confirma que el esquema y la migración escrita a mano dicen lo mismo.

- [ ] **Step 7: Commit, y después el flip-test**

```bash
git add prisma/schema.prisma prisma/migrations/<sello>_evento_entrada_en_produccion/migration.sql lib/traceability/plantingEvents.ts tests/traceability/entradaEnProduccion.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat
```

Tienen que salir **5 archivos**. Mensaje en un archivo y `git commit -F`.

Flip-test contra el commit: en `recordEnteredProduction`, quitar la línea `occurredPrecision: input.occurredPrecision,`. Imprimir el sha del archivo antes y después, confirmar que compila, y correr la prueba. **Tiene que caer por su nombre** «guarda el evento con la fecha y la precisión que se escribieron, leyendo la fila». Restaurar con `git checkout -- lib/traceability/plantingEvents.ts` y confirmar que el sha vuelve al original.

---

### Task 2: El estado de producción de cada siembra

**Files:**
- Create: `lib/traceability/estadoDeProduccion.ts`
- Create: `tests/traceability/estadoDeProduccion.test.ts`
- Modify: `lib/traceability/plantingCohorts.ts` (`getPlotDetail`)
- Modify: `tests/traceability/entradaEnProduccion.test.ts`

**Interfaces:**
- Consumes: `recordEnteredProduction` (Task 1); `PrecisionDeSiembra` de `lib/time/fechaConPrecision.ts`.
- Produces:
  - `interface EventoDeProduccion { plantingCohortId: string; occurredAt: Date; occurredPrecision: PrecisionDeSiembra | null; createdAt: Date }`
  - `type EstadoDeProduccion = { estado: "en_produccion"; desde: Date; precision: PrecisionDeSiembra | null } | { estado: "sin_marcar" }`
  - `estadoDeProduccion(eventos: readonly EventoDeProduccion[]): EstadoDeProduccion` — eventos de UNA siembra
  - `estadosPorCohorte(cohorteIds: readonly string[], eventos: readonly EventoDeProduccion[]): Map<string, EstadoDeProduccion>`
  - `getPlotDetail(...)` devuelve además `eventosDeProduccion: EventoDeProduccion[]`

- [ ] **Step 1: La prueba pura que falla**

`tests/traceability/estadoDeProduccion.test.ts`:

```ts
/**
 * Hermética: no importa lib/db. Los dos casos que tienen que poder fallar son
 * «sin evento nunca es levante» y «gana el registrado último aunque su fecha
 * sea anterior».
 */
import { describe, expect, it } from "vitest";
import { estadoDeProduccion, estadosPorCohorte, type EventoDeProduccion } from "../../lib/traceability/estadoDeProduccion";

const ev = (over: Partial<EventoDeProduccion>): EventoDeProduccion => ({
  plantingCohortId: "c1",
  occurredAt: new Date("2021-01-01T00:00:00Z"),
  occurredPrecision: "year",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("estadoDeProduccion", () => {
  it("sin eventos es «sin marcar», y no existe ningún estado «levante»", () => {
    const estado = estadoDeProduccion([]);
    expect(estado).toEqual({ estado: "sin_marcar" });
  });

  it("con un evento está en producción desde su fecha, con su precisión", () => {
    expect(estadoDeProduccion([ev({})])).toEqual({
      estado: "en_produccion",
      desde: new Date("2021-01-01T00:00:00Z"),
      precision: "year",
    });
  });

  it("gana el REGISTRADO más recientemente aunque su fecha sea ANTERIOR", () => {
    const equivocado = ev({ occurredAt: new Date("2023-01-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    const corregido = ev({ occurredAt: new Date("2020-01-01T00:00:00Z"), createdAt: new Date("2026-04-01T00:00:00Z") });
    const estado = estadoDeProduccion([equivocado, corregido]);
    expect(estado.estado === "en_produccion" && estado.desde.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });

  it("el orden en que llegan los eventos no cambia el resultado", () => {
    const a = ev({ occurredAt: new Date("2023-01-01T00:00:00Z"), createdAt: new Date("2026-03-01T00:00:00Z") });
    const b = ev({ occurredAt: new Date("2020-01-01T00:00:00Z"), createdAt: new Date("2026-04-01T00:00:00Z") });
    expect(estadoDeProduccion([b, a])).toEqual(estadoDeProduccion([a, b]));
  });
});

describe("estadosPorCohorte", () => {
  it("toda siembra pedida tiene estado, y los eventos de una no se cuelan en otra", () => {
    const mapa = estadosPorCohorte(["c1", "c2"], [ev({ plantingCohortId: "c1" })]);
    expect(mapa.get("c1")?.estado).toBe("en_produccion");
    expect(mapa.get("c2")).toEqual({ estado: "sin_marcar" });
    expect(mapa.size).toBe(2);
  });
});
```

- [ ] **Step 2: Verla en rojo**

Run: `npx vitest run tests/traceability/estadoDeProduccion.test.ts`
Expected: FAIL, por módulo inexistente.

- [ ] **Step 3: La función pura**

`lib/traceability/estadoDeProduccion.ts`:

```ts
import type { PrecisionDeSiembra } from "../time/fechaConPrecision";

/**
 * Si una siembra da cosecha — tablero de parcela, spec §5.2.
 *
 * Pura a propósito, para probarla sin base. Dos reglas, y las dos son la razón
 * de que exista:
 *
 *   * **Sin evento es «sin marcar», nunca «en levante».** Una siembra de 2016 que
 *     nadie marcó no es una plántula; decir «levante» sería afirmar algo que
 *     nadie dijo.
 *   * **Gana el evento registrado más recientemente** (`createdAt`), no el de
 *     fecha mayor. Corregir una fecha equivocada es registrar otro evento, y la
 *     fecha buena puede ser anterior a la mala.
 */
export interface EventoDeProduccion {
  plantingCohortId: string;
  occurredAt: Date;
  occurredPrecision: PrecisionDeSiembra | null;
  createdAt: Date;
}

export type EstadoDeProduccion =
  | { estado: "en_produccion"; desde: Date; precision: PrecisionDeSiembra | null }
  | { estado: "sin_marcar" };

export function estadoDeProduccion(eventos: readonly EventoDeProduccion[]): EstadoDeProduccion {
  if (eventos.length === 0) return { estado: "sin_marcar" };
  const ultimo = eventos.reduce((a, b) => (b.createdAt.getTime() > a.createdAt.getTime() ? b : a));
  return { estado: "en_produccion", desde: ultimo.occurredAt, precision: ultimo.occurredPrecision };
}

export function estadosPorCohorte(
  cohorteIds: readonly string[],
  eventos: readonly EventoDeProduccion[],
): Map<string, EstadoDeProduccion> {
  const mapa = new Map<string, EstadoDeProduccion>();
  for (const id of cohorteIds) {
    mapa.set(id, estadoDeProduccion(eventos.filter((e) => e.plantingCohortId === id)));
  }
  return mapa;
}
```

- [ ] **Step 4: En verde**

Run: `npx vitest run tests/traceability/estadoDeProduccion.test.ts; echo "salida=$?"`
Expected: PASS, salida 0.

- [ ] **Step 5: `getPlotDetail` devuelve los eventos**

En `lib/traceability/plantingCohorts.ts`, añadir a los imports:

```ts
import type { EventoDeProduccion } from "./estadoDeProduccion";
```

Dentro de `getPlotDetail`, justo antes del `return {`:

```ts
  // Los eventos «entró en producción» de las siembras de este bloque, para el
  // estado de producción del tablero. Detrás de la MISMA compuerta que el resto
  // (ver el comentario de arriba): no se reutiliza
  // `listPlantingEventsForLocation`, que protege con `lot:view`.
  const eventosDeProduccionCrudos = await prisma.plantingEvent.findMany({
    where: { locationId, eventType: "entered_production", plantingCohortId: { not: null } },
    select: { plantingCohortId: true, occurredAt: true, occurredPrecision: true, createdAt: true },
  });
  const eventosDeProduccion: EventoDeProduccion[] = eventosDeProduccionCrudos.flatMap((e) =>
    e.plantingCohortId == null
      ? []
      : [{ plantingCohortId: e.plantingCohortId, occurredAt: e.occurredAt, occurredPrecision: e.occurredPrecision, createdAt: e.createdAt }],
  );
```

Y en el objeto que devuelve, después de `cultivarOptions,`:

```ts
    eventosDeProduccion,
```

- [ ] **Step 6: La prueba con base de `getPlotDetail`**

En `tests/traceability/entradaEnProduccion.test.ts`, añadir `getPlotDetail` al import de `plantingCohorts`, y este bloque al final:

```ts
describe("getPlotDetail — eventos de producción", () => {
  it("devuelve el evento de la siembra marcada y ninguno de la que no", async () => {
    const marcada = await siembraActiva(plotId);
    const sinMarcar = await siembraActiva(plotId);
    await recordEnteredProduction(operadorId, {
      plantingCohortId: marcada.id,
      occurredAt: new Date("2021-01-01T00:00:00Z"),
      occurredPrecision: "year",
      provenanceClass: "original_record",
    });

    const detalle = await getPlotDetail(operadorId, plotId);
    const deMarcada = detalle.eventosDeProduccion.filter((e) => e.plantingCohortId === marcada.id);
    expect(deMarcada).toHaveLength(1);
    expect(deMarcada[0]!.occurredPrecision).toBe("year");
    expect(detalle.eventosDeProduccion.some((e) => e.plantingCohortId === sinMarcar.id)).toBe(false);
  });
});
```

Run: `TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/entradaEnProduccion.test.ts; echo "salida=$?"` y `npx tsc --noEmit; echo "tsc=$?"`
Expected: las dos en 0.

- [ ] **Step 7: Commit**

```bash
git add lib/traceability/estadoDeProduccion.ts tests/traceability/estadoDeProduccion.test.ts lib/traceability/plantingCohorts.ts tests/traceability/entradaEnProduccion.test.ts
git diff --cached --stat
```

Tienen que salir **4 archivos**; `git commit -F`.

---

### Task 3: Los avisos pendientes

**Files:**
- Create: `lib/time/diaDeHoy.ts`, `tests/time/diaDeHoy.test.ts`
- Create: `lib/traceability/pendienteDeLaParcela.ts`, `tests/traceability/pendienteDeLaParcela.test.ts`

**Interfaces:**
- Consumes: `PlotDensity` (tipo, de `lib/traceability/plantingCohorts.ts`); `EstadoDeProduccion` (Task 2).
- Produces:
  - `diaDeHoy(ahora: Date, zona: string | null): string` — `YYYY-MM-DD`
  - `venceElMuestreo(ultimoDia: string): string` — `YYYY-MM-DD`
  - `type Aviso` (ver Step 3)
  - `pendienteDeLaParcela(entrada: EntradaDePendiente): { tocaHacer: Aviso[]; faltaUnDato: Aviso[] }`
  - `enlaceDelAviso(aviso: Aviso, locationId: string): string`

- [ ] **Step 1: La prueba de `diaDeHoy` que falla**

`tests/time/diaDeHoy.test.ts`:

```ts
/** Hermética. «Hoy» es un día, no un instante, y sin zona se va al caso más temprano. */
import { describe, expect, it } from "vitest";
import { diaDeHoy } from "../../lib/time/diaDeHoy";

describe("diaDeHoy", () => {
  it("con zona, el día del sitio: las 03:00Z del 16 son todavía el 15 en Panamá", () => {
    expect(diaDeHoy(new Date("2026-09-16T03:00:00Z"), "America/Panama")).toBe("2026-09-15");
  });

  it("sin zona, UTC−12: a las 11:00Z del 16 todavía es 15, aunque en Panamá ya sea 16", () => {
    const ahora = new Date("2026-09-16T11:00:00Z");
    expect(diaDeHoy(ahora, "America/Panama")).toBe("2026-09-16");
    expect(diaDeHoy(ahora, null)).toBe("2026-09-15");
  });

  it("sin zona, a las 13:00Z ya es 16 en cualquier sitio del planeta", () => {
    expect(diaDeHoy(new Date("2026-09-16T13:00:00Z"), null)).toBe("2026-09-16");
  });
});
```

- [ ] **Step 2: Verla en rojo**

Run: `npx vitest run tests/time/diaDeHoy.test.ts`
Expected: FAIL, por módulo inexistente.

- [ ] **Step 3: `diaDeHoy`**

`lib/time/diaDeHoy.ts`:

```ts
/**
 * «Hoy» como día (`YYYY-MM-DD`) — tablero de parcela, spec §4.3.
 *
 * Con zona, el día del sitio. **Sin zona, el día más temprano que existe en el
 * planeta (UTC−12)**. Un aviso de vencimiento afirma algo, y sin saber la zona
 * sólo se puede afirmar cuando es cierto en cualquiera: puede llegar un día
 * tarde, nunca uno antes.
 *
 * **No usa `ZONA_POR_DEFECTO`** (`mostrarInstante.ts`). Esa zona es un respaldo
 * para MOSTRAR una hora; usarla aquí convertiría un respaldo de pintado en la
 * base de una afirmación.
 *
 * `Etc/GMT+12` es UTC−12: en la nomenclatura POSIX el signo va al revés.
 */
export function diaDeHoy(ahora: Date, zona: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona ?? "Etc/GMT+12",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}
```

Run: `npx vitest run tests/time/diaDeHoy.test.ts; echo "salida=$?"` — Expected: PASS.

- [ ] **Step 4: La prueba de los avisos que falla**

`tests/traceability/pendienteDeLaParcela.test.ts`:

```ts
/**
 * Hermética. Los casos que tienen que poder fallar: suelo y foliar son
 * independientes; el día exacto del vencimiento frente al anterior; el 29 de
 * febrero; y que las muestras sin resultado no traen plazo.
 */
import { describe, expect, it } from "vitest";
import {
  pendienteDeLaParcela,
  venceElMuestreo,
  enlaceDelAviso,
  type EntradaDePendiente,
} from "../../lib/traceability/pendienteDeLaParcela";
import type { EstadoDeProduccion } from "../../lib/traceability/estadoDeProduccion";

const base = (over: Partial<EntradaDePendiente> = {}): EntradaDePendiente => ({
  hoy: "2026-09-16",
  density: { status: "ok", plantsPerHectare: 4000, totalPlants: 4000, hectares: 1 },
  cohortesActivas: [{ id: "c1", plantCount: 4000 }],
  // Tipo explícito: sin él TypeScript ensancha "en_produccion" a string.
  estados: new Map<string, EstadoDeProduccion>([["c1", { estado: "en_produccion", desde: new Date("2020-01-01T00:00:00Z"), precision: "year" }]]),
  jornadas: [],
  muestrasDeSuelo: [{ sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 1 }],
  muestrasFoliares: [{ sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 1 }],
  ...over,
});

describe("venceElMuestreo", () => {
  it("vence el mismo día y mes del año siguiente", () => {
    expect(venceElMuestreo("2025-09-16")).toBe("2026-09-16");
  });
  it("un muestreo del 29 de febrero vence el 28 de febrero", () => {
    expect(venceElMuestreo("2024-02-29")).toBe("2025-02-28");
  });
});

describe("pendienteDeLaParcela", () => {
  it("un lote en orden no tiene nada pendiente", () => {
    expect(pendienteDeLaParcela(base())).toEqual({ tocaHacer: [], faltaUnDato: [] });
  });

  it("el día anterior al vencimiento no avisa; el día exacto sí", () => {
    const muestra = [{ sampledAt: new Date("2025-09-16T00:00:00Z"), resultados: 1 }];
    const antes = pendienteDeLaParcela(base({ hoy: "2026-09-15", muestrasDeSuelo: muestra }));
    const justo = pendienteDeLaParcela(base({ hoy: "2026-09-16", muestrasDeSuelo: muestra }));
    expect(antes.tocaHacer).toEqual([]);
    expect(justo.tocaHacer).toEqual([{ tipo: "muestreo_vencido", muestra: "suelo", ultimo: "2025-09-16" }]);
  });

  it("suelo vencido y foliar al día: sólo avisa el de suelo", () => {
    const r = pendienteDeLaParcela(base({ muestrasDeSuelo: [{ sampledAt: new Date("2024-01-01T00:00:00Z"), resultados: 1 }] }));
    expect(r.tocaHacer).toEqual([{ tipo: "muestreo_vencido", muestra: "suelo", ultimo: "2024-01-01" }]);
  });

  it("nunca muestreado: avisa con `ultimo` null, uno por tipo", () => {
    const r = pendienteDeLaParcela(base({ muestrasDeSuelo: [], muestrasFoliares: [] }));
    expect(r.tocaHacer).toEqual([
      { tipo: "muestreo_vencido", muestra: "suelo", ultimo: null },
      { tipo: "muestreo_vencido", muestra: "foliar", ultimo: null },
    ]);
  });

  it("usa la muestra MÁS RECIENTE aunque no venga primera", () => {
    const r = pendienteDeLaParcela(
      base({
        muestrasDeSuelo: [
          { sampledAt: new Date("2020-01-01T00:00:00Z"), resultados: 1 },
          { sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 1 },
        ],
      }),
    );
    expect(r.tocaHacer).toEqual([]);
  });

  it("muestras sin resultado: un aviso con el recuento de cada tipo, sin plazo", () => {
    const r = pendienteDeLaParcela(
      base({
        muestrasDeSuelo: [{ sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 0 }],
        muestrasFoliares: [
          { sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 0 },
          { sampledAt: new Date("2026-02-01T00:00:00Z"), resultados: 0 },
        ],
      }),
    );
    expect(r.tocaHacer).toEqual([{ tipo: "muestras_sin_resultado", suelo: 1, foliar: 2 }]);
  });

  it("una jornada sin cerrar avisa; una cerrada no", () => {
    const r = pendienteDeLaParcela(
      base({
        jornadas: [
          { id: "j1", startedAt: new Date("2026-09-10T12:00:00Z"), endedAt: null },
          { id: "j2", startedAt: new Date("2026-09-01T12:00:00Z"), endedAt: new Date("2026-09-01T15:00:00Z") },
        ],
      }),
    );
    expect(r.tocaHacer).toEqual([{ tipo: "jornada_sin_cerrar", fieldSessionId: "j1", startedAt: new Date("2026-09-10T12:00:00Z") }]);
  });

  it("falta un dato: sin área, área no válida, siembras sin conteo y sin marcar", () => {
    const r = pendienteDeLaParcela(
      base({
        density: { status: "sin_area" },
        cohortesActivas: [
          { id: "c1", plantCount: null },
          { id: "c2", plantCount: 300 },
        ],
        estados: new Map<string, EstadoDeProduccion>([
          ["c1", { estado: "sin_marcar" }],
          ["c2", { estado: "sin_marcar" }],
        ]),
      }),
    );
    expect(r.faltaUnDato).toEqual([
      { tipo: "sin_area" },
      { tipo: "siembras_sin_conteo", n: 1 },
      { tipo: "siembras_sin_marcar", n: 2 },
    ]);
    expect(pendienteDeLaParcela(base({ density: { status: "area_no_positiva", hectares: 0 } })).faltaUnDato).toEqual([
      { tipo: "area_no_valida" },
    ]);
  });
});

describe("enlaceDelAviso", () => {
  it("cada aviso lleva al sitio donde se arregla", () => {
    expect(enlaceDelAviso({ tipo: "jornada_sin_cerrar", fieldSessionId: "j1", startedAt: new Date() }, "L")).toBe("/field-sessions/j1");
    expect(enlaceDelAviso({ tipo: "muestreo_vencido", muestra: "foliar", ultimo: null }, "L")).toBe("/plots/L#muestras");
    expect(enlaceDelAviso({ tipo: "muestras_sin_resultado", suelo: 1, foliar: 0 }, "L")).toBe("/plots/L#muestras");
    expect(enlaceDelAviso({ tipo: "sin_area" }, "L")).toBe("/plots/L/ajustes#areaHectares");
    expect(enlaceDelAviso({ tipo: "area_no_valida" }, "L")).toBe("/plots/L/ajustes#areaHectares");
    expect(enlaceDelAviso({ tipo: "siembras_sin_conteo", n: 1 }, "L")).toBe("/plots/L/ajustes#siembras");
    expect(enlaceDelAviso({ tipo: "siembras_sin_marcar", n: 1 }, "L")).toBe("/plots/L/ajustes#siembras");
  });
});
```

**Corrección al spec:** el spec §6 nombra el ancla del área `#area`. El campo del formulario ya tiene `id="areaHectares"` (`PlotAttributesForm.tsx`), así que el enlace usa `#areaHectares` y no hace falta añadir ningún `id`.

- [ ] **Step 5: Verla en rojo**

Run: `npx vitest run tests/traceability/pendienteDeLaParcela.test.ts`
Expected: FAIL, por módulo inexistente.

- [ ] **Step 6: La función**

`lib/traceability/pendienteDeLaParcela.ts`:

```ts
import type { PlotDensity } from "./plantingCohorts";
import type { EstadoDeProduccion } from "./estadoDeProduccion";

/**
 * Lo pendiente de una parcela — tablero de parcela, spec §4.
 *
 * Toma de `lib/apiary/pendienteDeLaVisita.ts` su disciplina: no recibe usuario,
 * no autoriza, y la llama la pantalla que ya pasó la compuerta
 * (`getPlotDetail`). **A diferencia de aquélla, es pura**: no consulta la base
 * y recibe «hoy» ya calculado (`diaDeHoy`), para probarla sin base y sin reloj.
 *
 * Sólo avisa de lo que sale de datos que YA existen. Lo que queda fuera, y por
 * qué, está en el spec §4.4. Lo que más tienta añadir: un plazo para los
 * resultados de laboratorio. No hay un plazo acordado, y no se inventa.
 */
export interface EntradaDePendiente {
  /** Hoy como `YYYY-MM-DD`, de `diaDeHoy(ahora, location.timezone)`. */
  hoy: string;
  density: PlotDensity;
  cohortesActivas: readonly { id: string; plantCount: number | null }[];
  estados: ReadonlyMap<string, EstadoDeProduccion>;
  jornadas: readonly { id: string; startedAt: Date; endedAt: Date | null }[];
  /** `sampledAt` es campo de día (medianoche UTC); `resultados` = nº de Measurement. */
  muestrasDeSuelo: readonly { sampledAt: Date; resultados: number }[];
  muestrasFoliares: readonly { sampledAt: Date; resultados: number }[];
}

export type Aviso =
  | { tipo: "jornada_sin_cerrar"; fieldSessionId: string; startedAt: Date }
  | { tipo: "muestreo_vencido"; muestra: "suelo" | "foliar"; ultimo: string | null }
  | { tipo: "muestras_sin_resultado"; suelo: number; foliar: number }
  | { tipo: "sin_area" }
  | { tipo: "area_no_valida" }
  | { tipo: "siembras_sin_conteo"; n: number }
  | { tipo: "siembras_sin_marcar"; n: number };

/** Mismo día y mes del año siguiente; un 29 de febrero vence el 28. */
export function venceElMuestreo(ultimoDia: string): string {
  const anio = Number(ultimoDia.slice(0, 4)) + 1;
  const mesDia = ultimoDia.slice(5) === "02-29" ? "02-28" : ultimoDia.slice(5);
  return `${anio}-${mesDia}`;
}

function ultimoDia(muestras: readonly { sampledAt: Date }[]): string | null {
  if (muestras.length === 0) return null;
  // Campo de día: su ISO en UTC ES el día. Nunca con desfase horario.
  return muestras.map((m) => m.sampledAt.toISOString().slice(0, 10)).reduce((a, b) => (b > a ? b : a));
}

export function pendienteDeLaParcela(e: EntradaDePendiente): { tocaHacer: Aviso[]; faltaUnDato: Aviso[] } {
  const tocaHacer: Aviso[] = [];
  const faltaUnDato: Aviso[] = [];

  for (const j of e.jornadas) {
    if (j.endedAt == null) tocaHacer.push({ tipo: "jornada_sin_cerrar", fieldSessionId: j.id, startedAt: j.startedAt });
  }

  for (const [muestra, lista] of [
    ["suelo", e.muestrasDeSuelo],
    ["foliar", e.muestrasFoliares],
  ] as const) {
    const ultimo = ultimoDia(lista);
    // Comparación de cadenas `YYYY-MM-DD`: el orden léxico es el cronológico.
    if (ultimo == null || e.hoy >= venceElMuestreo(ultimo)) {
      tocaHacer.push({ tipo: "muestreo_vencido", muestra, ultimo });
    }
  }

  const sueloSinResultado = e.muestrasDeSuelo.filter((m) => m.resultados === 0).length;
  const foliarSinResultado = e.muestrasFoliares.filter((m) => m.resultados === 0).length;
  if (sueloSinResultado + foliarSinResultado > 0) {
    tocaHacer.push({ tipo: "muestras_sin_resultado", suelo: sueloSinResultado, foliar: foliarSinResultado });
  }

  if (e.density.status === "sin_area") faltaUnDato.push({ tipo: "sin_area" });
  if (e.density.status === "area_no_positiva") faltaUnDato.push({ tipo: "area_no_valida" });

  const sinConteo = e.cohortesActivas.filter((c) => c.plantCount == null).length;
  if (sinConteo > 0) faltaUnDato.push({ tipo: "siembras_sin_conteo", n: sinConteo });

  const sinMarcar = e.cohortesActivas.filter((c) => e.estados.get(c.id)?.estado !== "en_produccion").length;
  if (sinMarcar > 0) faltaUnDato.push({ tipo: "siembras_sin_marcar", n: sinMarcar });

  return { tocaHacer, faltaUnDato };
}

export function enlaceDelAviso(aviso: Aviso, locationId: string): string {
  switch (aviso.tipo) {
    case "jornada_sin_cerrar":
      return `/field-sessions/${aviso.fieldSessionId}`;
    case "muestreo_vencido":
    case "muestras_sin_resultado":
      return `/plots/${locationId}#muestras`;
    case "sin_area":
    case "area_no_valida":
      return `/plots/${locationId}/ajustes#areaHectares`;
    case "siembras_sin_conteo":
    case "siembras_sin_marcar":
      return `/plots/${locationId}/ajustes#siembras`;
  }
}
```

- [ ] **Step 7: En verde, y comprobar que no entró la base en el carril hermético**

```bash
npx vitest run tests/time/diaDeHoy.test.ts tests/traceability/pendienteDeLaParcela.test.ts tests/traceability/estadoDeProduccion.test.ts; echo "salida=$?"
npx tsc --noEmit; echo "tsc=$?"
bash scripts/ci.sh > /tmp/ci-t3.log 2>&1; echo "ci=$?"; grep -E "Test Files|Tests " /tmp/ci-t3.log | tail -2
```

Expected: las tres salidas en 0. El `ci.sh` es el control de que los `import type` funcionan: si algún módulo puro arrastrara `lib/db`, esas pruebas caerían sin base.

- [ ] **Step 8: Commit, y después el flip-test**

```bash
git add lib/time/diaDeHoy.ts tests/time/diaDeHoy.test.ts lib/traceability/pendienteDeLaParcela.ts tests/traceability/pendienteDeLaParcela.test.ts
git diff --cached --stat
```

Tienen que salir **4 archivos**; `git commit -F`.

Flip-test contra el commit, con el sha antes y después y la prueba por su nombre:
1. En `diaDeHoy`, cambiar `zona ?? "Etc/GMT+12"` por `zona ?? "America/Panama"`. **Tiene que caer** «sin zona, UTC−12: a las 11:00Z del 16 todavía es 15, aunque en Panamá ya sea 16». Restaurar.
2. En `pendienteDeLaParcela`, cambiar `e.hoy >= venceElMuestreo(ultimo)` por `e.hoy > venceElMuestreo(ultimo)`. **Tiene que caer** «el día anterior al vencimiento no avisa; el día exacto sí». Restaurar.

---

### Task 4: Las cifras del lote

**Files:**
- Create: `lib/traceability/cifrasDelLote.ts`, `tests/traceability/cifrasDelLote.test.ts`

**Interfaces:**
- Consumes: `EstadoDeProduccion` (Task 2).
- Produces:
  - `interface CohorteParaCifras { id: string; plantCount: number | null; cultivarValue: { value: string } | null }`
  - `interface CifrasDelLote { plantasConocidas: number; cohortesSinConteo: number; enProduccion: number; sinMarcar: number; variedades: { nombre: string | null; plantas: number; cohortesSinConteo: number }[] }`
  - `cifrasDelLote(cohortes: readonly CohorteParaCifras[], estados: ReadonlyMap<string, EstadoDeProduccion>): CifrasDelLote`

- [ ] **Step 1: La prueba que falla**

`tests/traceability/cifrasDelLote.test.ts`:

```ts
/** Hermética. El caso que tiene que poder fallar: un conteo ausente nunca suma como 0 sin decirlo. */
import { describe, expect, it } from "vitest";
import { cifrasDelLote, type CohorteParaCifras } from "../../lib/traceability/cifrasDelLote";
import type { EstadoDeProduccion } from "../../lib/traceability/estadoDeProduccion";

const enProd: EstadoDeProduccion = { estado: "en_produccion", desde: new Date("2020-01-01T00:00:00Z"), precision: "year" };
const sinMarcar: EstadoDeProduccion = { estado: "sin_marcar" };

describe("cifrasDelLote", () => {
  it("reparte las plantas conocidas entre en producción y sin marcar", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: 600, cultivarValue: { value: "Caturra" } },
      { id: "b", plantCount: 400, cultivarValue: { value: "Catuaí" } },
    ];
    const r = cifrasDelLote(cohortes, new Map([["a", enProd], ["b", sinMarcar]]));
    expect(r).toMatchObject({ plantasConocidas: 1000, cohortesSinConteo: 0, enProduccion: 600, sinMarcar: 400 });
  });

  it("una siembra sin conteo NO suma 0 en silencio: cuenta como siembra sin conteo", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: 600, cultivarValue: { value: "Caturra" } },
      { id: "b", plantCount: null, cultivarValue: { value: "Caturra" } },
    ];
    const r = cifrasDelLote(cohortes, new Map([["a", enProd], ["b", enProd]]));
    expect(r.plantasConocidas).toBe(600);
    expect(r.cohortesSinConteo).toBe(1);
    expect(r.variedades).toEqual([{ nombre: "Caturra", plantas: 600, cohortesSinConteo: 1 }]);
  });

  it("agrupa por variedad, de más a menos plantas, y la desconocida al final", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: 100, cultivarValue: null },
      { id: "b", plantCount: 200, cultivarValue: { value: "Catuaí" } },
      { id: "c", plantCount: 900, cultivarValue: { value: "Caturra" } },
      { id: "d", plantCount: 50, cultivarValue: { value: "Catuaí" } },
    ];
    const r = cifrasDelLote(cohortes, new Map());
    expect(r.variedades.map((v) => [v.nombre, v.plantas])).toEqual([
      ["Caturra", 900],
      ["Catuaí", 250],
      [null, 100],
    ]);
  });

  it("una siembra sin estado en el mapa cuenta como sin marcar, nunca como en producción", () => {
    const r = cifrasDelLote([{ id: "a", plantCount: 10, cultivarValue: null }], new Map());
    expect(r).toMatchObject({ enProduccion: 0, sinMarcar: 10 });
  });
});
```

- [ ] **Step 2: Verla en rojo**

Run: `npx vitest run tests/traceability/cifrasDelLote.test.ts`
Expected: FAIL, por módulo inexistente.

- [ ] **Step 3: La función**

`lib/traceability/cifrasDelLote.ts`:

```ts
import type { EstadoDeProduccion } from "./estadoDeProduccion";

/**
 * Las cifras del estado del lote — tablero de parcela, spec §3.2.
 *
 * **Un conteo ausente nunca suma 0 en silencio (ADR-080).** Se suman sólo las
 * plantas conocidas y se cuentan aparte las siembras sin conteo, para que la
 * pantalla diga «al menos N» en vez de un total que parece medido.
 *
 * Recibe SÓLO siembras activas: filtrarlas es cosa de quien llama, igual que
 * hace la página con `status === "active"`.
 */
export interface CohorteParaCifras {
  id: string;
  plantCount: number | null;
  cultivarValue: { value: string } | null;
}

export interface CifrasDelLote {
  plantasConocidas: number;
  cohortesSinConteo: number;
  /** Plantas CONOCIDAS de siembras en producción. */
  enProduccion: number;
  /** Plantas CONOCIDAS de siembras sin marcar. */
  sinMarcar: number;
  variedades: { nombre: string | null; plantas: number; cohortesSinConteo: number }[];
}

export function cifrasDelLote(
  cohortes: readonly CohorteParaCifras[],
  estados: ReadonlyMap<string, EstadoDeProduccion>,
): CifrasDelLote {
  let plantasConocidas = 0;
  let cohortesSinConteo = 0;
  let enProduccion = 0;
  let sinMarcar = 0;
  const porVariedad = new Map<string | null, { plantas: number; cohortesSinConteo: number }>();

  for (const c of cohortes) {
    const nombre = c.cultivarValue?.value ?? null;
    const grupo = porVariedad.get(nombre) ?? { plantas: 0, cohortesSinConteo: 0 };
    if (c.plantCount == null) {
      cohortesSinConteo += 1;
      grupo.cohortesSinConteo += 1;
    } else {
      plantasConocidas += c.plantCount;
      grupo.plantas += c.plantCount;
      if (estados.get(c.id)?.estado === "en_produccion") enProduccion += c.plantCount;
      else sinMarcar += c.plantCount;
    }
    porVariedad.set(nombre, grupo);
  }

  const variedades = [...porVariedad.entries()]
    .map(([nombre, g]) => ({ nombre, ...g }))
    .sort((a, b) => {
      if (a.nombre == null) return 1;
      if (b.nombre == null) return -1;
      return b.plantas - a.plantas;
    });

  return { plantasConocidas, cohortesSinConteo, enProduccion, sinMarcar, variedades };
}
```

- [ ] **Step 4: En verde**

Run: `npx vitest run tests/traceability/cifrasDelLote.test.ts; echo "salida=$?"` y `npx tsc --noEmit; echo "tsc=$?"`
Expected: las dos en 0.

- [ ] **Step 5: Commit, y después el flip-test**

```bash
git add lib/traceability/cifrasDelLote.ts tests/traceability/cifrasDelLote.test.ts
git diff --cached --stat
```

Tienen que salir **2 archivos**; `git commit -F`.

Flip-test: sustituir `if (c.plantCount == null) {` por `if (false) {` y usar `c.plantCount ?? 0` en las dos sumas. Con el sha antes y después, **tiene que caer** «una siembra sin conteo NO suma 0 en silencio». Restaurar.

---

### Task 5: La pantalla de ajustes

**Files:**
- Create: `app/components/traceability/useSinConexion.ts`
- Create: `app/components/traceability/BotonQueNecesitaConexion.tsx`
- Create: `app/components/traceability/MarcarEnProduccionForm.tsx`
- Create: `app/plots/[id]/ajustes/page.tsx`
- Modify: `app/actions/traceability.ts`
- Modify: `app/components/traceability/PlantingCohortForm.tsx`, `PlotAttributesForm.tsx`, `SoilProfileForm.tsx`
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `recordEnteredProduction`, `PlantingEventValidationError` (Task 1); `getPlotDetail(...).eventosDeProduccion` (Task 2); `estadosPorCohorte` (Task 2).
- Produces: la ruta `/plots/[id]/ajustes` con los `id` `siembras`, `condiciones` y `calicatas`; `recordEnteredProductionFormAction`.

Los Server Actions no se pueden probar en vitest, porque arrastran `next-auth`. En esta tarea la compuerta es `tsc` + `npm run build` + `tests/arquitectura/use-server-solo-async.test.ts`, y el recorrido de la Task 7.

- [ ] **Step 1: Los textos**

Antes, comprobar que ninguna clave existe:

```bash
for K in plotDashboardManageLink plotDashboardBackLink plotDashboardSettingsTitle plotDashboardCohortsHeading plotDashboardProductionSince plotDashboardProductionUnmarked plotDashboardMarkProductionSummary plotDashboardProductionDateLabel plotDashboardProductionSaveButton plotDashboardProductionDateRequired plotDashboardNeedsConnection error_production; do
  printf "%-40s es=%s en=%s\n" "$K" "$(grep -c "\"$K\"" messages/es.json)" "$(grep -c "\"$K\"" messages/en.json)"
done
```

Expected: todas en 0. Si alguna existe, parar y decirlo.

Añadir dentro de `"Traceability"` en `messages/es.json`:

```json
    "plotDashboardManageLink": "Gestionar parcela",
    "plotDashboardBackLink": "← Volver al tablero",
    "plotDashboardSettingsTitle": "Gestionar {name}",
    "plotDashboardCohortsHeading": "Siembras",
    "plotDashboardProductionSince": "En producción desde {fecha}",
    "plotDashboardProductionUnmarked": "Sin marcar",
    "plotDashboardMarkProductionSummary": "Marcar en producción",
    "plotDashboardProductionDateLabel": "Desde cuándo da cosecha",
    "plotDashboardProductionSaveButton": "Guardar",
    "plotDashboardProductionDateRequired": "Falta la fecha desde la que da cosecha.",
    "plotDashboardNeedsConnection": "Necesita conexión: esto no se puede guardar sin señal.",
    "error_production": "No se pudo marcar en producción: {detail}",
```

Y en `messages/en.json`:

```json
    "plotDashboardManageLink": "Manage plot",
    "plotDashboardBackLink": "← Back to dashboard",
    "plotDashboardSettingsTitle": "Manage {name}",
    "plotDashboardCohortsHeading": "Plantings",
    "plotDashboardProductionSince": "In production since {fecha}",
    "plotDashboardProductionUnmarked": "Unmarked",
    "plotDashboardMarkProductionSummary": "Mark as in production",
    "plotDashboardProductionDateLabel": "Bearing since",
    "plotDashboardProductionSaveButton": "Save",
    "plotDashboardProductionDateRequired": "The date it started bearing is missing.",
    "plotDashboardNeedsConnection": "Needs a connection: this cannot be saved offline.",
    "error_production": "Could not mark as in production: {detail}",
```

- [ ] **Step 2: El hook y el botón**

`app/components/traceability/useSinConexion.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

/**
 * Si el aparato dice que no hay señal. Es el mismo patrón que
 * `FieldSyncControls` y `OfflineSyncIndicator`: inicializador perezoso con
 * `navigator.onLine`, y escucha de `online`/`offline`.
 *
 * **Límite conocido y no resuelto aquí:** con señal débil `navigator.onLine`
 * puede ser `true` sin conexión real (decisión abierta, PR #345).
 */
export function useSinConexion(): boolean {
  const [sinConexion, setSinConexion] = useState(() =>
    typeof window !== "undefined" ? !navigator.onLine : false,
  );
  useEffect(() => {
    const alVolver = () => setSinConexion(false);
    const alPerder = () => setSinConexion(true);
    window.addEventListener("online", alVolver);
    window.addEventListener("offline", alPerder);
    return () => {
      window.removeEventListener("online", alVolver);
      window.removeEventListener("offline", alPerder);
    };
  }, []);
  return sinConexion;
}
```

`app/components/traceability/BotonQueNecesitaConexion.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSinConexion } from "./useSinConexion";

/**
 * El botón de enviar de lo que NO se encola sin señal: corregir y editar
 * (spec §6.1). Sin conexión se desactiva y dice por qué, en vez de dejar que el
 * envío falle. Nada se descarta en silencio.
 */
export function BotonQueNecesitaConexion({ disabled, children }: { disabled: boolean; children: ReactNode }) {
  const t = useTranslations("Traceability");
  const sinConexion = useSinConexion();
  return (
    <>
      <button type="submit" className="nn-button" disabled={disabled || sinConexion}>
        {children}
      </button>
      {sinConexion ? (
        <p className="nn-muted" role="status">
          {t("plotDashboardNeedsConnection")}
        </p>
      ) : null}
    </>
  );
}
```

- [ ] **Step 3: Los tres formularios existentes usan el botón al corregir**

En los tres archivos, añadir el import:

```tsx
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";
```

`app/components/traceability/PlantingCohortForm.tsx`: sustituir

```tsx
      <button type="submit" className="nn-button" disabled={pending || encolando}>
        {editando ? t("cohortSaveEditButton") : t("cohortCreateButton")}
      </button>
```

por

```tsx
      {/* Registrar una siembra se encola sin señal (#345); corregirla no. */}
      {editando ? (
        <BotonQueNecesitaConexion disabled={pending || encolando}>{t("cohortSaveEditButton")}</BotonQueNecesitaConexion>
      ) : (
        <button type="submit" className="nn-button" disabled={pending || encolando}>
          {t("cohortCreateButton")}
        </button>
      )}
```

`app/components/traceability/PlotAttributesForm.tsx`: sustituir

```tsx
      <button type="submit" className="nn-button" disabled={pending}>
        {t("savePlotAttributesButton")}
      </button>
```

por

```tsx
      <BotonQueNecesitaConexion disabled={pending}>{t("savePlotAttributesButton")}</BotonQueNecesitaConexion>
```

`app/components/traceability/SoilProfileForm.tsx`: sustituir

```tsx
      <button type="submit" className="nn-button" disabled={pending || encolando}>
        {corrigiendo ? t("soilSaveButton") : t("soilDescribeButton")}
      </button>
```

por

```tsx
      {/* Describir una calicata se encola sin señal (#345); corregirla no. */}
      {corrigiendo ? (
        <BotonQueNecesitaConexion disabled={pending || encolando}>{t("soilSaveButton")}</BotonQueNecesitaConexion>
      ) : (
        <button type="submit" className="nn-button" disabled={pending || encolando}>
          {t("soilDescribeButton")}
        </button>
      )}
```

- [ ] **Step 4: La acción del servidor**

En `app/actions/traceability.ts`, añadir a los imports:

```ts
import { recordEnteredProduction, PlantingEventValidationError } from "../../lib/traceability/plantingEvents";
```

En `friendlyError`, antes de `if (error instanceof PlantingCohortValidationError)`:

```ts
  if (error instanceof PlantingEventValidationError) return t("error_production", { detail: error.message });
```

Después de `updatePlantingCohortFormAction`:

```ts
/**
 * Marca una siembra en producción — tablero de parcela, spec §5.
 *
 * La fecha pasa por `calcularFechaConPrecision`, la misma aritmética de
 * `plantedAt`, porque «desde 2019» no es el 1 de enero. Revalida el tablero y
 * los ajustes: los dos pintan el estado.
 */
export async function recordEnteredProductionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  const raw = String(formData.get("occurredAt") ?? "").trim();
  if (!raw) return { error: t("plotDashboardProductionDateRequired") };
  const { fecha, precision } = calcularFechaConPrecision(raw, String(formData.get("occurredPrecision") ?? "year"));

  try {
    await recordEnteredProduction(user.userAccountId, {
      plantingCohortId: String(formData.get("cohortId") ?? ""),
      occurredAt: fecha,
      occurredPrecision: precision,
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_SIEMBRA),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}
```

Y en `createPlantingCohortFormAction`, `updatePlantingCohortFormAction`, en la acción de atributos de parcela (`updatePlotAttributesAction`) y en la de calicata, junto a su `revalidatePath(\`/plots/${locationId}\`)`, añadir:

```ts
  revalidatePath(`/plots/${locationId}/ajustes`);
```

Localizarlas así:

```bash
grep -n 'revalidatePath(`/plots/${locationId}`)' app/actions/traceability.ts
```

Añadir la línea sólo en esas funciones.

- [ ] **Step 5: El formulario nuevo**

`app/components/traceability/MarcarEnProduccionForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { recordEnteredProductionFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { PROCEDENCIA_DE_SIEMBRA } from "../../../lib/traceability/procedencia";
import { recortarPorPrecision } from "../../../lib/time/recortarPorPrecision";
import { BotonQueNecesitaConexion } from "./BotonQueNecesitaConexion";

// Misma lista local que `SampleForms.tsx`: las opciones de calidad del dato.
const DATA_QUALITIES = ["verified", "provisional", "unconfirmed", "not_tested"] as const;
const PRECISIONES = ["year", "month", "date"] as const;

const initialState: TraceabilityActionState = {};

/**
 * Marcar desde cuándo una siembra da cosecha — spec §5 y §6.
 *
 * La fecha sigue el mismo patrón que `plantedAt` en `PlantingCohortForm`:
 * precisión «año» por defecto, porque el paso a producción de una siembra
 * antigua casi nunca se sabe al día, y el tipo de campo sigue a la precisión.
 * Necesita conexión: no se encola.
 */
export function MarcarEnProduccionForm({ cohortId, locationId }: { cohortId: string; locationId: string }) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordEnteredProductionFormAction, initialState);
  const [precision, setPrecision] = useState<(typeof PRECISIONES)[number]>("year");
  const [valor, setValor] = useState("");
  const inputType = precision === "date" ? "date" : precision === "month" ? "month" : "number";

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="cohortId" value={cohortId} />
      <input type="hidden" name="locationId" value={locationId} />

      <div className="nn-field">
        <label htmlFor={`occurredPrecision-${cohortId}`}>{t("plantedPrecisionLabel")}</label>
        <select
          id={`occurredPrecision-${cohortId}`}
          name="occurredPrecision"
          value={precision}
          onChange={(e) => {
            const nueva = e.target.value as (typeof PRECISIONES)[number];
            setValor(recortarPorPrecision(valor, nueva));
            setPrecision(nueva);
          }}
        >
          {PRECISIONES.map((p) => (
            <option key={p} value={p}>
              {t(`plantedPrecision_${p}` as "plantedPrecision_year")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`occurredAt-${cohortId}`}>{t("plotDashboardProductionDateLabel")}</label>
        <input
          id={`occurredAt-${cohortId}`}
          name="occurredAt"
          type={inputType}
          required
          value={valor}
          onChange={(e) => setValor(e.target.value)}
        />
      </div>

      <div className="nn-field">
        <label htmlFor={`productionProvenance-${cohortId}`}>{t("provenanceClassLabel")}</label>
        <select id={`productionProvenance-${cohortId}`} name="provenanceClass" required defaultValue="">
          <option value="">{t("provenanceClassChoose")}</option>
          {PROCEDENCIA_DE_SIEMBRA.map((v) => (
            <option key={v} value={v}>
              {t(`provenanceClass_${v}` as "provenanceClass_original_record")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`productionDataQuality-${cohortId}`}>{t("dataQualityLabel")}</label>
        <select id={`productionDataQuality-${cohortId}`} name="dataQuality" defaultValue="">
          <option value="">{t("notRecorded")}</option>
          {DATA_QUALITIES.map((v) => (
            <option key={v} value={v}>
              {t(`dataQuality_${v}` as "dataQuality_verified")}
            </option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={`productionNotes-${cohortId}`}>{t("notesLabel")}</label>
        <input id={`productionNotes-${cohortId}`} type="text" name="notes" placeholder={t("notRecorded")} />
      </div>

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <BotonQueNecesitaConexion disabled={pending}>{t("plotDashboardProductionSaveButton")}</BotonQueNecesitaConexion>
    </form>
  );
}
```

`provenanceClassChoose` ya lo usa `SampleForms.tsx`. Si `tsc` dijera que no existe en el tipo de mensajes, parar y decirlo en vez de inventar la clave.

- [ ] **Step 6: La página de ajustes**

`app/plots/[id]/ajustes/page.tsx`:

```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getPlotDetail } from "../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../lib/traceability/locations";
import { listSoilProfilesForLocation } from "../../../../lib/traceability/soilProfiles";
import { estadosPorCohorte } from "../../../../lib/traceability/estadoDeProduccion";
import { recortarPorPrecision } from "../../../../lib/time/recortarPorPrecision";
import { PlantingCohortForm } from "../../../components/traceability/PlantingCohortForm";
import { PlotAttributesForm } from "../../../components/traceability/PlotAttributesForm";
import { SoilProfileForm } from "../../../components/traceability/SoilProfileForm";
import { MarcarEnProduccionForm } from "../../../components/traceability/MarcarEnProduccionForm";

export const dynamic = "force-dynamic";

/**
 * Gestionar una parcela — tablero de parcela, spec §6.
 *
 * Sólo formularios de gestión. Lo que se hace en campo —iniciar una jornada,
 * registrar una muestra, describir una calicata— se queda en el tablero.
 * Misma compuerta que el tablero (`getPlotDetail`), y cuelga de `/plots`, así
 * que hereda `FieldSyncControls` del layout y la carga sin red del service
 * worker.
 */
export default async function PlotSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  const { location, cohorts, cultivarOptions, eventosDeProduccion } = detail;
  const activas = cohorts.filter((c) => c.status === "active");
  const estados = estadosPorCohorte(activas.map((c) => c.id), eventosDeProduccion);
  const calicatas = await listSoilProfilesForLocation(user.userAccountId, id);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${location.id}`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("plotDashboardSettingsTitle", { name: location.name })}</h1>

      <section className="nn-section" id="siembras">
        <h2>{t("plotDashboardCohortsHeading")}</h2>
        {activas.length === 0 ? <p className="nn-muted">{t("noCohorts")}</p> : null}
        {activas.map((cohort) => {
          const estado = estados.get(cohort.id);
          return (
            <article key={cohort.id} className="nn-card">
              <h3>
                {cohort.cultivarValue?.value ?? t("cultivarUnknown")}
                {" · "}
                {cohort.plantCount ?? <span className="nn-muted">{t("notRecorded")}</span>}
                {" · "}
                {cohort.plantedAt ? (
                  recortarPorPrecision(cohort.plantedAt.toISOString(), cohort.plantedPrecision ?? "year")
                ) : (
                  <span className="nn-muted">{t("plantedUnknown")}</span>
                )}
              </h3>
              <p className="nn-detail-meta">
                {estado?.estado === "en_produccion" ? (
                  t("plotDashboardProductionSince", {
                    fecha: recortarPorPrecision(estado.desde.toISOString(), estado.precision ?? "date"),
                  })
                ) : (
                  <strong>{t("plotDashboardProductionUnmarked")}</strong>
                )}
              </p>
              <details>
                <summary>{t("plotDashboardMarkProductionSummary")}</summary>
                <MarcarEnProduccionForm cohortId={cohort.id} locationId={location.id} />
              </details>
              <details>
                <summary>
                  {t("cohortEditSummary", { cultivar: cohort.cultivarValue?.value ?? t("cultivarUnknown") })}
                </summary>
                <PlantingCohortForm
                  locationId={location.id}
                  cultivars={cultivarOptions}
                  cohort={{
                    id: cohort.id,
                    cultivarValueId: cohort.cultivarValueId,
                    plantCount: cohort.plantCount,
                    plantedAt: cohort.plantedAt ? cohort.plantedAt.toISOString() : null,
                    plantedPrecision: cohort.plantedPrecision,
                    dataQuality: cohort.dataQuality,
                    notes: cohort.notes,
                  }}
                />
              </details>
            </article>
          );
        })}
        <details>
          <summary>{t("cohortCreateSummary")}</summary>
          <PlantingCohortForm locationId={location.id} cultivars={cultivarOptions} />
        </details>
      </section>

      <section className="nn-section" id="condiciones">
        <h2>{t("groundConditionsHeading")}</h2>
        <PlotAttributesForm
          locationId={location.id}
          attributes={{
            // Decimal como cadena: `Number()` sobre Decimal(10,4) puede redondear.
            areaHectares: location.areaHectares?.toString() ?? null,
            plantSpacingMeters: location.plantSpacingMeters?.toString() ?? null,
            altitudeMinM: location.altitudeMinM,
            altitudeMaxM: location.altitudeMaxM,
            sunExposure: location.sunExposure,
            shadePercentage: location.shadePercentage,
            slopeDescription: location.slopeDescription,
            aspect: location.aspect,
            soilType: location.soilType,
          }}
        />
      </section>

      <section className="nn-section" id="calicatas">
        <h2>{t("soilProfileHeading")}</h2>
        {calicatas.length === 0 ? <p className="nn-muted">{t("soilNoProfiles")}</p> : null}
        {calicatas.map((c) => (
          <details key={c.id}>
            <summary>
              {t("soilCorrectHeading")} · {c.describedAt.toISOString().slice(0, 10)}
            </summary>
            <SoilProfileForm
              locationId={location.id}
              values={{
                id: c.id,
                describedAt: c.describedAt.toISOString().slice(0, 10),
                pitDepthCm: c.pitDepthCm,
                rootingDepthCm: c.rootingDepthCm,
                rootDistribution: c.rootDistribution,
                mottling: c.mottling,
                greyColours: c.greyColours,
                rootChannelConcretions: c.rootChannelConcretions,
                sourSmell: c.sourSmell,
                impedingLayerDepthCm: c.impedingLayerDepthCm,
                impedingLayerNote: c.impedingLayerNote,
                provenanceClass: c.provenanceClass,
                dataQuality: c.dataQuality,
                notes: c.notes,
              }}
            />
          </details>
        ))}
      </section>
    </div>
  );
}
```

- [ ] **Step 7: Compuertas**

```bash
npx tsc --noEmit; echo "tsc=$?"
npx vitest run tests/arquitectura/use-server-solo-async.test.ts; echo "use-server=$?"
npm run build > /tmp/build-t5.log 2>&1; echo "build=$?"; tail -5 /tmp/build-t5.log
bash scripts/ci.sh > /tmp/ci-t5.log 2>&1; echo "ci=$?"; grep -E "Test Files|Tests " /tmp/ci-t5.log | tail -2
```

Expected: las cuatro salidas en 0. El log del build tiene que listar `/plots/[id]/ajustes`.

- [ ] **Step 8: Commit**

```bash
git add app/components/traceability/useSinConexion.ts app/components/traceability/BotonQueNecesitaConexion.tsx app/components/traceability/MarcarEnProduccionForm.tsx 'app/plots/[id]/ajustes/page.tsx' app/actions/traceability.ts app/components/traceability/PlantingCohortForm.tsx app/components/traceability/PlotAttributesForm.tsx app/components/traceability/SoilProfileForm.tsx messages/es.json messages/en.json
git diff --cached --stat
```

Tienen que salir **10 archivos**. El hook de la casa preguntará (≥8 archivos): es lo esperado. `git commit -F`.

---

### Task 6: El tablero

**Files:**
- Modify: `app/plots/[id]/page.tsx` (sustitución completa del componente de página; `ResultadosDeLaboratorio` y `FotosDe` se quedan tal cual al final del archivo; `formatPlanted` se elimina)
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `getPlotDetail(...).eventosDeProduccion`, `estadosPorCohorte` (Task 2); `diaDeHoy`, `pendienteDeLaParcela`, `enlaceDelAviso`, `Aviso` (Task 3); `cifrasDelLote` (Task 4).
- Produces: el tablero, con `id="muestras"` en su sección de muestras.

- [ ] **Step 1: Los textos**

Comprobar que no existen:

```bash
for K in plotDashboardStatusHeading plotDashboardPlantsLabel plotDashboardPlantsTotal plotDashboardPlantsAtLeast plotDashboardPlantsInProduction plotDashboardPlantsUnmarked plotDashboardVarietiesLabel plotDashboardYieldLabel plotDashboardYieldByYear plotDashboardPendingHeading plotDashboardPendingNone plotDashboardToDo plotDashboardMissingData plotDashboardAlertOpenSession plotDashboardAlertSamplingNever plotDashboardAlertSamplingDue plotDashboardAlertAwaitingResults plotDashboardAlertNoArea plotDashboardAlertBadArea plotDashboardAlertNoCount plotDashboardAlertUnmarked plotDashboardSamplingSoil plotDashboardSamplingFoliar plotDashboardConditionsHeading plotDashboardRecentSessions; do
  printf "%-40s es=%s en=%s\n" "$K" "$(grep -c "\"$K\"" messages/es.json)" "$(grep -c "\"$K\"" messages/en.json)"
done
```

`messages/es.json`, dentro de `"Traceability"`:

```json
    "plotDashboardStatusHeading": "Estado del lote",
    "plotDashboardPlantsLabel": "Plantas",
    "plotDashboardPlantsTotal": "{n} plantas",
    "plotDashboardPlantsAtLeast": "al menos {n} plantas · {cohorts} siembras sin conteo",
    "plotDashboardPlantsInProduction": "en producción: {n}",
    "plotDashboardPlantsUnmarked": "sin marcar: {n}",
    "plotDashboardVarietiesLabel": "Variedades",
    "plotDashboardYieldLabel": "Rendimiento {year}",
    "plotDashboardYieldByYear": "Rendimiento por año",
    "plotDashboardPendingHeading": "Pendiente",
    "plotDashboardPendingNone": "Nada pendiente.",
    "plotDashboardToDo": "Toca hacer",
    "plotDashboardMissingData": "Falta un dato",
    "plotDashboardAlertOpenSession": "Jornada del {fecha} sin cerrar",
    "plotDashboardAlertSamplingNever": "Nunca se ha hecho muestreo {muestra}",
    "plotDashboardAlertSamplingDue": "Muestreo {muestra} vencido: el último fue el {fecha}",
    "plotDashboardAlertAwaitingResults": "Muestras esperando resultado: {suelo} de suelo, {foliar} foliares",
    "plotDashboardAlertNoArea": "Lote sin área: sin ella no hay densidad ni kg/ha",
    "plotDashboardAlertBadArea": "El área registrada no es válida",
    "plotDashboardAlertNoCount": "Siembras sin conteo de plantas: {n}",
    "plotDashboardAlertUnmarked": "Siembras sin marcar en producción: {n}",
    "plotDashboardSamplingSoil": "de suelo",
    "plotDashboardSamplingFoliar": "foliar",
    "plotDashboardConditionsHeading": "Condiciones",
    "plotDashboardRecentSessions": "Últimas jornadas",
```

`messages/en.json`:

```json
    "plotDashboardStatusHeading": "Plot status",
    "plotDashboardPlantsLabel": "Plants",
    "plotDashboardPlantsTotal": "{n} plants",
    "plotDashboardPlantsAtLeast": "at least {n} plants · {cohorts} plantings without a count",
    "plotDashboardPlantsInProduction": "in production: {n}",
    "plotDashboardPlantsUnmarked": "unmarked: {n}",
    "plotDashboardVarietiesLabel": "Varieties",
    "plotDashboardYieldLabel": "Yield {year}",
    "plotDashboardYieldByYear": "Yield by year",
    "plotDashboardPendingHeading": "Pending",
    "plotDashboardPendingNone": "Nothing pending.",
    "plotDashboardToDo": "To do",
    "plotDashboardMissingData": "Missing data",
    "plotDashboardAlertOpenSession": "Field session of {fecha} not closed",
    "plotDashboardAlertSamplingNever": "No {muestra} sampling has ever been done",
    "plotDashboardAlertSamplingDue": "{muestra} sampling overdue: the last one was on {fecha}",
    "plotDashboardAlertAwaitingResults": "Samples awaiting results: {suelo} soil, {foliar} foliar",
    "plotDashboardAlertNoArea": "Plot without an area: no density or kg/ha without it",
    "plotDashboardAlertBadArea": "The recorded area is not valid",
    "plotDashboardAlertNoCount": "Plantings without a plant count: {n}",
    "plotDashboardAlertUnmarked": "Plantings not marked as in production: {n}",
    "plotDashboardSamplingSoil": "soil",
    "plotDashboardSamplingFoliar": "foliar",
    "plotDashboardConditionsHeading": "Conditions",
    "plotDashboardRecentSessions": "Latest field sessions",
```

- [ ] **Step 2: Sustituir el componente de página**

En `app/plots/[id]/page.tsx`, sustituir **desde la primera línea hasta el cierre de `PlotDetailPage` y la función `formatPlanted`** (todo lo que va antes del comentario de `ResultadosDeLaboratorio`) por lo siguiente. `ResultadosDeLaboratorio` y `FotosDe` quedan intactos al final.

```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { mostrarInstante, mostrarFecha } from "../../../lib/time/mostrarInstante";
import { getCurrentUser } from "../../../lib/auth/session";
import { getPlotDetail } from "../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { SoilProfileForm } from "../../components/traceability/SoilProfileForm";
import { LandPhotoUploadForm } from "../../components/traceability/LandPhotoUploadForm";
import { listLandAssets } from "../../../lib/traceability/landMedia";
import { SoilSampleForm, FoliarSampleForm } from "../../components/traceability/SampleForms";
import { LabMeasurementForm } from "../../components/traceability/LabMeasurementForm";
import { listVariableDefinitions } from "../../../lib/traceability/units";
import { listSamplesForLocation, camposDeProtocoloQueFaltan } from "../../../lib/traceability/soilSamples";
import { listSoilProfilesForLocation, computeAnaerobicSignals } from "../../../lib/traceability/soilProfiles";
import { listFieldSessions } from "../../../lib/traceability/fieldSessions";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../components/traceability/FieldSessionForms";
import { estadosPorCohorte } from "../../../lib/traceability/estadoDeProduccion";
import { cifrasDelLote } from "../../../lib/traceability/cifrasDelLote";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";
import { pendienteDeLaParcela, enlaceDelAviso, type Aviso } from "../../../lib/traceability/pendienteDeLaParcela";

export const dynamic = "force-dynamic";

/**
 * El tablero de una parcela — spec `2026-09-16-tablero-de-parcela-design.md`.
 *
 * Arriba, cómo está el lote y qué hay pendiente. Plegado, lo que no cambia a
 * diario: condiciones y muestras. La gestión vive en `/plots/[id]/ajustes`.
 *
 * Sigue valiendo la regla de antes: la página enseña lo que FALTA tanto como lo
 * registrado. Todo bloque de Finca Rosina tiene siembras y no área, así que la
 * densidad no se puede calcular, y eso sale con su motivo, no en blanco.
 */
export default async function PlotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    // Not "forbidden": a block this user may not read is a block that, for
    // them, is not there. Distinguishing the two would confirm it exists.
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  const { location, cohorts, density, organizationName, eventosDeProduccion } = detail;
  const rendimiento = detail.yield;
  const [jornadas, { people, selfPersonId }, calicatas] = await Promise.all([
    listFieldSessions(user.userAccountId, id),
    getObserverCandidates(user.userAccountId),
    listSoilProfilesForLocation(user.userAccountId, id),
  ]);
  const muestras = await listSamplesForLocation(user.userAccountId, id);
  const fotos = await listLandAssets(user.userAccountId, id);

  const activas = cohorts.filter((c) => c.status === "active");
  const estados = estadosPorCohorte(activas.map((c) => c.id), eventosDeProduccion);
  const cifras = cifrasDelLote(activas, estados);
  const pendiente = pendienteDeLaParcela({
    hoy: diaDeHoy(new Date(), location.timezone),
    density,
    cohortesActivas: activas,
    estados,
    jornadas,
    muestrasDeSuelo: muestras.soil.map((m) => ({ sampledAt: m.sampledAt, resultados: m.measurements.length })),
    muestrasFoliares: muestras.foliar.map((m) => ({ sampledAt: m.sampledAt, resultados: m.measurements.length })),
  });
  const ultimoAnio = rendimiento.status === "ok" ? rendimiento.years[0] : undefined;

  const textoDelAviso = (aviso: Aviso): string => {
    switch (aviso.tipo) {
      case "jornada_sin_cerrar":
        return t("plotDashboardAlertOpenSession", { fecha: mostrarFecha(aviso.startedAt, location.timezone) });
      case "muestreo_vencido": {
        const muestra = t(aviso.muestra === "suelo" ? "plotDashboardSamplingSoil" : "plotDashboardSamplingFoliar");
        return aviso.ultimo == null
          ? t("plotDashboardAlertSamplingNever", { muestra })
          : t("plotDashboardAlertSamplingDue", { muestra, fecha: aviso.ultimo });
      }
      case "muestras_sin_resultado":
        return t("plotDashboardAlertAwaitingResults", { suelo: aviso.suelo, foliar: aviso.foliar });
      case "sin_area":
        return t("plotDashboardAlertNoArea");
      case "area_no_valida":
        return t("plotDashboardAlertBadArea");
      case "siembras_sin_conteo":
        return t("plotDashboardAlertNoCount", { n: aviso.n });
      case "siembras_sin_marcar":
        return t("plotDashboardAlertUnmarked", { n: aviso.n });
    }
  };

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href="/plots">{t("backToPlots")}</Link>
      </p>

      <span className="nn-badge">{t("badge")}</span>
      <h1>{location.name}</h1>
      {organizationName ? <p className="nn-detail-meta">{organizationName}</p> : null}
      {location.description ? <p className="nn-muted">{location.description}</p> : null}
      <p>
        <Link href={`/plots/${location.id}/ajustes`} className="nn-button">
          {t("plotDashboardManageLink")}
        </Link>
      </p>

      <section className="nn-section">
        <h2>{t("plotDashboardStatusHeading")}</h2>
        <div className="nn-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <article className="nn-card">
            <h3>{t("plotDashboardPlantsLabel")}</h3>
            {activas.length === 0 ? (
              <p className="nn-muted">{t("noCohorts")}</p>
            ) : (
              <>
                <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
                  {/* ADR-080: un conteo ausente no suma 0 en silencio. */}
                  {cifras.cohortesSinConteo > 0
                    ? t("plotDashboardPlantsAtLeast", { n: cifras.plantasConocidas, cohorts: cifras.cohortesSinConteo })
                    : t("plotDashboardPlantsTotal", { n: cifras.plantasConocidas })}
                </p>
                <p className="nn-detail-meta">
                  {t("plotDashboardPlantsInProduction", { n: cifras.enProduccion })}
                  {" · "}
                  {t("plotDashboardPlantsUnmarked", { n: cifras.sinMarcar })}
                </p>
              </>
            )}
          </article>

          <article className="nn-card">
            <h3>{t("plotDashboardVarietiesLabel")}</h3>
            {cifras.variedades.length === 0 ? (
              <p className="nn-muted">{t("noCohorts")}</p>
            ) : (
              <ul className="nn-detail-meta">
                {cifras.variedades.map((v) => (
                  <li key={v.nombre ?? "desconocida"}>
                    {v.nombre ?? t("cultivarUnknown")}: {t("plotDashboardPlantsTotal", { n: v.plantas })}
                    {v.cohortesSinConteo > 0 ? (
                      <span className="nn-muted"> · {t("plotDashboardAlertNoCount", { n: v.cohortesSinConteo })}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="nn-card">
            <h3>{t("densityHeading")}</h3>
            {density.status === "ok" ? (
              <>
                <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
                  {t("densityValue", { plants: density.plantsPerHectare })}
                </p>
                <p className="nn-detail-meta">
                  {t("densityBasis", { plants: density.totalPlants, hectares: density.hectares })}
                </p>
              </>
            ) : (
              <p className="nn-muted">
                {density.status === "sin_area"
                  ? t("densityMissingArea")
                  : density.status === "area_no_positiva"
                    ? t("densityBadArea")
                    : density.status === "conteo_incompleto"
                      ? t("densityMissingCount", { cohorts: density.cohortesSinConteo })
                      : t("densityNoCohorts")}
              </p>
            )}
          </article>

          <article className="nn-card">
            {ultimoAnio ? (
              <>
                <h3>{t("plotDashboardYieldLabel", { year: ultimoAnio.year })}</h3>
                <p style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.25rem" }}>
                  {ultimoAnio.weighedKg != null ? (
                    t("sourceWeightValue", { kg: ultimoAnio.weighedKg })
                  ) : (
                    <span className="nn-muted">{t("yieldNothingWeighed")}</span>
                  )}
                </p>
                <p className="nn-detail-meta">
                  {ultimoAnio.kgPerHectare != null
                    ? t("yieldPerHectareValue", { kg: ultimoAnio.kgPerHectare })
                    : t("yieldMissingArea")}
                  {ultimoAnio.unweighedContributions > 0 ? (
                    <> · {t("yieldUnweighedNote", { count: ultimoAnio.unweighedContributions })}</>
                  ) : null}
                </p>
              </>
            ) : (
              <>
                <h3>{t("yieldHeading")}</h3>
                <p className="nn-muted">{t("yieldNoHarvests")}</p>
              </>
            )}
          </article>
        </div>

        {rendimiento.status === "ok" ? (
          <details>
            <summary>{t("plotDashboardYieldByYear")}</summary>
            <div style={{ overflowX: "auto" }}>
              <table className="nn-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.75rem 0.4rem 0" }}>{t("yieldYearLabel")}</th>
                    <th style={{ textAlign: "right", padding: "0.4rem 0.75rem" }}>{t("yieldWeighedLabel")}</th>
                    <th style={{ textAlign: "right", padding: "0.4rem 0 0.4rem 0.75rem" }}>{t("yieldPerHectareLabel")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rendimiento.years.map((y) => (
                    <tr key={y.year}>
                      <td style={{ padding: "0.4rem 0.75rem 0.4rem 0" }}>{y.year}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "0.4rem 0.75rem" }}>
                        {y.weighedKg != null ? (
                          t("sourceWeightValue", { kg: y.weighedKg })
                        ) : (
                          <span className="nn-muted">{t("yieldNothingWeighed")}</span>
                        )}
                      </td>
                      <td style={{ fontVariantNumeric: "tabular-nums", textAlign: "right", padding: "0.4rem 0 0.4rem 0.75rem" }}>
                        {y.kgPerHectare != null ? (
                          <strong>{t("yieldPerHectareValue", { kg: y.kgPerHectare })}</strong>
                        ) : (
                          <span className="nn-muted">{t("yieldMissingArea")}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="nn-detail-meta">{t("yieldComputedNote")}</p>
          </details>
        ) : null}
      </section>

      <section className="nn-section">
        <h2>{t("plotDashboardPendingHeading")}</h2>
        {pendiente.tocaHacer.length + pendiente.faltaUnDato.length === 0 ? (
          <p className="nn-muted">{t("plotDashboardPendingNone")}</p>
        ) : (
          <>
            {pendiente.tocaHacer.length > 0 ? (
              <>
                <h3>{t("plotDashboardToDo")}</h3>
                <ul>
                  {pendiente.tocaHacer.map((aviso, i) => (
                    <li key={`toca-${i}`}>
                      <Link href={enlaceDelAviso(aviso, location.id)}>{textoDelAviso(aviso)}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {pendiente.faltaUnDato.length > 0 ? (
              <>
                <h3>{t("plotDashboardMissingData")}</h3>
                {/* Una línea por dato, no una alarma: hoy «sin área» sale en los 8
                    lotes de Finca Rosina y no debe gritar. */}
                <ul className="nn-detail-meta">
                  {pendiente.faltaUnDato.map((aviso, i) => (
                    <li key={`falta-${i}`}>
                      <Link href={enlaceDelAviso(aviso, location.id)}>{textoDelAviso(aviso)}</Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="nn-section">
        <h2>{t("fieldSessionsHeading")}</h2>
        {jornadas.length === 0 ? (
          <p className="nn-muted">{t("fieldSessionsNone")}</p>
        ) : (
          <ul className="nn-detail-meta">
            {jornadas.slice(0, 3).map((j) => (
              <li key={j.id}>
                <Link href={`/field-sessions/${j.id}`}>{mostrarInstante(j.startedAt, location.timezone)}</Link>
                {" · "}
                {j.operator.displayName}
                {" · "}
                {t("fieldSessionEventCount", { count: j._count.events })}
                {j.endedAt == null ? <> · <strong>{t("fieldSessionOpen")}</strong></> : null}
              </li>
            ))}
          </ul>
        )}
        <details>
          <summary>{t("fieldSessionStartSummary")}</summary>
          <FieldSessionStartForm
            locationId={location.id}
            people={people.map((p) => ({ id: p.id, displayName: p.displayName }))}
            selfPersonId={selfPersonId}
          />
        </details>
      </section>

      <details className="nn-section" id="condiciones">
        <summary>
          <h2 style={{ display: "inline" }}>{t("plotDashboardConditionsHeading")}</h2>
        </summary>

        <h3>{t("groundConditionsHeading")}</h3>
        <dl className="nn-detail-meta">
          <p>{t("areaLabel")}: {location.areaHectares?.toString() ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>{t("spacingLabel")}: {location.plantSpacingMeters?.toString() ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>{t("altitudeMinLabel")}: {location.altitudeMinM ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>{t("altitudeMaxLabel")}: {location.altitudeMaxM ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>
            {t("sunExposureLabel")}:{" "}
            {location.sunExposure ? t(`sunExposure_${location.sunExposure}` as "sunExposure_full_sun") : <span className="nn-muted">{t("notRecorded")}</span>}
          </p>
          <p>
            {t("shadePercentageLabel")}:{" "}
            {location.shadePercentage ? t(`shadePercentage_${location.shadePercentage}` as "shadePercentage_none") : <span className="nn-muted">{t("notRecorded")}</span>}
          </p>
          <p>{t("slopeLabel")}: {location.slopeDescription ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
          <p>
            {t("aspectLabel")}:{" "}
            {location.aspect ? t(`aspect_${location.aspect}` as "aspect_north") : <span className="nn-muted">{t("notRecorded")}</span>}
          </p>
          <p>{t("soilTypeLabel")}: {location.soilType ?? <span className="nn-muted">{t("notRecorded")}</span>}</p>
        </dl>

        {/* AQUÍ: el contenido de la antigua sección `soilProfileHeading`, desde
            `<h2>{t("soilProfileHeading")}</h2>` hasta el `</details>` de
            `soilDescribeHeading`, con dos cambios: el <h2> pasa a <h3>, y se
            ELIMINA de cada tarjeta de calicata el <details> de
            `soilCorrectHeading` (se mudó a ajustes). Fotos, horizontes y
            «Describir una calicata» se quedan. */}
      </details>

      <details className="nn-section" id="muestras">
        <summary>
          <h2 style={{ display: "inline" }}>{t("labSamplesHeading")}</h2>
        </summary>
        {/* AQUÍ: el contenido de la antigua sección `labSamplesHeading`, desde
            `<p className="nn-muted">{t("samplesIntro")}</p>` hasta el
            `</details>` de `samplesFoliarAdd`, SIN CAMBIOS. */}
      </details>
    </div>
  );
}
```

**Los dos bloques «AQUÍ» no son marcadores de posición: son mudanzas literales de código que ya existe**, y hay que hacerlas en este paso.
- **Condiciones:** copiar el contenido de la sección `soilProfileHeading` de la versión anterior del archivo (`git show HEAD:'app/plots/[id]/page.tsx'`), cambiar su `<h2>` a `<h3>`, y **borrar de cada tarjeta** el bloque `<details><summary>{t("soilCorrectHeading")}</summary><SoilProfileForm …/></details>`.
- **Muestras:** copiar el contenido de la sección `labSamplesHeading`, sin tocar nada.

Al terminar, **ningún comentario «AQUÍ» puede quedar en el archivo**:

```bash
grep -c 'AQUÍ' 'app/plots/[id]/page.tsx'
```

Expected: `0`.

Comprobar que las claves de enum de condiciones del casting existen. Si `shadePercentage_none` o `aspect_north` no existieran, `tsc` fallará en el `as`: usar en el `as` una clave real sacada de `grep -o '"shadePercentage_[a-z_]*"' messages/es.json | head -1`, y lo mismo para `aspect_`.

- [ ] **Step 3: Lo que ya no está en el tablero**

```bash
F='app/plots/[id]/page.tsx'
echo "PlantingCohortForm (0): $(grep -c 'PlantingCohortForm' "$F")"
echo "PlotAttributesForm (0): $(grep -c 'PlotAttributesForm' "$F")"
echo "soilCorrectHeading (0): $(grep -c 'soilCorrectHeading' "$F")"
echo "formatPlanted (0): $(grep -c 'formatPlanted' "$F")"
echo "soilDescribeHeading (1): $(grep -c 'soilDescribeHeading' "$F")"
echo "SoilSampleForm (1): $(grep -c '<SoilSampleForm' "$F")"
echo "LabMeasurementForm (2): $(grep -c '<LabMeasurementForm' "$F")"
echo "id=muestras (1): $(grep -c 'id="muestras"' "$F")"
```

Cada línea tiene que dar el número que lleva entre paréntesis. **Las líneas que deben dar 1 o 2 son el control positivo**: un 0 en ellas significa que la mudanza se perdió código.

- [ ] **Step 4: Compuertas**

```bash
npx tsc --noEmit; echo "tsc=$?"
npm run lint > /tmp/lint-t6.log 2>&1; echo "lint=$?"
npm run build > /tmp/build-t6.log 2>&1; echo "build=$?"; tail -5 /tmp/build-t6.log
bash scripts/ci.sh > /tmp/ci-t6.log 2>&1; echo "ci=$?"; grep -E "Test Files|Tests " /tmp/ci-t6.log | tail -2
```

Expected: las cuatro salidas en 0.

- [ ] **Step 5: Commit**

```bash
git add 'app/plots/[id]/page.tsx' messages/es.json messages/en.json
git diff --cached --stat
```

Tienen que salir **3 archivos**; `git commit -F`.

---

### Task 7: Recorrido en navegador

**Files:** ninguno, salvo que el recorrido encuentre algo.

Parte del plan desde el principio (spec §8). Las pruebas leen código, no pantallas, y en el #345 lo que no se recorrió fue lo que dejó la cola sin botón.

- [ ] **Step 1: Servidor local de esta rama**

Levantar el servidor desde el worktree, contra `postgresql://postgres@127.0.0.1:55433/nectar_test`, con una configuración de arranque por worktree como las de `~/.claude/launch.json`, en un puerto libre. **Daniel inicia sesión**: el agente no introduce contraseñas.

- [ ] **Step 2: El recorrido, comprobado en la base y no en la pantalla**

| # | acción | qué tiene que verse | cómo se comprueba |
|---|---|---|---|
| 1 | abrir `/plots/<id>` de un lote de Finca Rosina | Estado del lote con 4 cifras; Pendiente con «Lote sin área» y «Siembras sin marcar: N»; Condiciones y Muestras **cerradas** | leer la página; `details.open` en falso para `#condiciones` y `#muestras` |
| 2 | clic en «Lote sin área» | llega a `/plots/<id>/ajustes#areaHectares` | la URL |
| 3 | «Gestionar parcela» → marcar una siembra en producción, precisión año, 2019 | la fila dice «En producción desde 2019»; en el tablero, «sin marcar» baja | `select event_type, occurred_at, occurred_precision from traceability.planting_event where planting_cohort_id = '<id>'` |
| 4 | corregir la misma siembra con 2018 | ahora dice 2018 | **dos** filas en `planting_event`: la de 2019 no se borró |
| 5 | sin señal (`navigator.onLine = false`), en ajustes | los botones de corregir se desactivan y dicen «Necesita conexión»; «Registrar una siembra» sigue activo | leer la página |
| 6 | limpieza | borrar los eventos de prueba y su `audit_event` en una transacción, contando antes y después | recuentos |

- [ ] **Step 3: Informar**

Qué salió en cada fila, con la consulta que lo prueba. Lo que no se pudo recorrer se dice.
