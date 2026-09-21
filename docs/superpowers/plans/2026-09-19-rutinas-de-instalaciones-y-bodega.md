# Rutinas de instalaciones y la bodega — plan de implementación (parte 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el beneficio, las instalaciones de secado, las camas sueltas y una bodega nueva lleven rutinas de limpieza/fumigación con aviso de «vencida», y que cada vez que se hizo pueda declarar los insumos usados, descontándolos del inventario.

**Architecture:** La bodega es un `Location` de tipo nuevo `storage_facility` con su propio servicio y sus páginas (`/bodegas`). Las rutinas ya admiten `locationId` en la base (ADR-172); el servicio `lib/rutinas/rutinas.ts` deja de rechazarlas y juzga permisos en el lugar. El producto es un `MaterialConsumptionEntry` con un padre nuevo, `careRoutineEventId`, creado por el mismo camino transaccional que ya descuenta existencias.

**Tech Stack:** Next.js 16 (app router, server actions), next-intl, Prisma 7 + PostgreSQL, vitest.

**Spec:** `docs/superpowers/specs/2026-09-19-rutinas-de-instalaciones-y-bodega-design.md`

## Global Constraints

- Worktree propio creado con `git worktree add <ruta> -b <rama> origin/main`. **Nunca** `git add -A`; se añade archivo por archivo. Commits con `git commit -F <archivo>`.
- Node: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npm`/`npx`.
- **Base propia** para las pruebas con base y el navegador (p. ej. `nectar_rutinas_lugar`), **nunca** `nectar_test` ni la compartida del puerto 55433 sin `prisma migrate deploy` propio.
- Rutinas **avisan, no bloquean** (D1). Retirar, nunca borrar. AuditEvent en la misma transacción, `entityType` literal.
- **Días** (`performedOn`) con `fechaDeDia`, guardados a medianoche UTC, pintados con `toISOString().slice(0, 10)`.
- Ausencia nunca es 0: cantidad vacía = sin cantidad, **sin descuento**.
- Un archivo `"use server"` exporta sólo funciones `async`.
- Nombres nuevos (`storage_facility`, `careRoutineEventId`) se declaran en `docs/beneficio/03_public_api.md` **en el mismo commit** que los introduce (`00_reglas_del_modulo` §7.6).
- Cada guardia con **flip-test contra el commit**: sha del archivo antes y después (distintos o abortar), que compile, y **qué test cae por su nombre**. Commitear ANTES de mutar.
- Pruebas nuevas con base van al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`; `bash scripts/ci.sh` no debe verlas.
- **No tocar** lo que `secado-2a` cambia: `lib/traceability/instalaciones.ts`, `app/instalaciones/FormularioUbicacion.tsx`, `app/instalaciones/nueva/page.tsx`, `app/actions/instalaciones.ts`. En `app/instalaciones/page.tsx` y `app/instalaciones/[id]/page.tsx` sólo **añadir** al final.
- Revisión final: **un revisor Claude y Codex** (`/Applications/ChatGPT.app/Contents/Resources/codex`), por petición de Daniel.

---

## Mapa de archivos

| archivo | qué |
|---|---|
| `prisma/migrations/20260919200000_bodega_tipo_de_ubicacion/migration.sql` | crear: el valor de enum, solo |
| `prisma/migrations/20260919200500_bodega_y_rutinas_de_lugar/migration.sql` | crear: padre de la bodega, consumo con rutina, CHECK de un solo padre |
| `prisma/schema.prisma` | `LocationType.storage_facility`; `MaterialConsumptionEntry.careRoutineEventId`; relación inversa en `CareRoutineEvent` |
| `lib/traceability/locations.ts` | `storage_facility` en `TIPOS_DEL_BENEFICIO`; `createMicrolot` rechaza padre bodega |
| `lib/traceability/bodegas.ts` | crear: `crearBodega`, `padresParaBodega`, `listarBodegas`, `detalleBodega` |
| `lib/traceability/operations.ts` | extraer `crearConsumoEnTx`; variante `careRoutineEvent` |
| `lib/rutinas/lugares.ts` | crear: qué lugar admite rutina, su ruta, su «hoy», sus equipos e insumos |
| `lib/rutinas/rutinas.ts` | rutinas de lugar, permisos en el lugar, insumos al registrar, `rutinasDeLugar`, `vencidasPorLugar` |
| `app/actions/rutinas.ts` | destino por equipo o por lugar; insumos del formulario |
| `app/actions/bodegas.ts` | crear: `crearBodegaFormAction` |
| `app/components/rutinas/TarjetaDeRutina.tsx` | filas de insumo opcionales; productos en el historial |
| `app/components/rutinas/RutinasDeLugar.tsx` | crear: bloque de rutinas + alta + equipos aquí |
| `app/bodegas/page.tsx`, `app/bodegas/nueva/page.tsx`, `app/bodegas/[id]/page.tsx` | crear |
| `app/instalaciones/page.tsx`, `app/instalaciones/[id]/page.tsx`, `app/beneficio/page.tsx` | añadir al final |
| `app/components/traceability/StorageForm.tsx`, `lib/traceability/lots.ts` | bodegas primero |
| `messages/es.json`, `messages/en.json` | claves nuevas en `Equipos` y `Bodegas` |
| `tests/instalaciones/esquemaDeBodega.test.ts`, `tests/instalaciones/bodegas.test.ts`, `tests/rutinas/rutinasDeLugar.test.ts`, `tests/traceability/consumoConRutina.test.ts` | crear |
| `docs/beneficio/03_public_api.md`, `docs/architecture/DECISIONS.md`, `docs/arquitectura/inventario-de-acceso.md`, `scripts/pruebas-por-compuerta.txt` | declarar, ADR, cifras, carril |

---

### Task 1: El esquema — bodega y consumo con rutina

**Files:**
- Create: `prisma/migrations/20260919200000_bodega_tipo_de_ubicacion/migration.sql`
- Create: `prisma/migrations/20260919200500_bodega_y_rutinas_de_lugar/migration.sql`
- Modify: `prisma/schema.prisma` (enum `LocationType`, `model MaterialConsumptionEntry`, `model CareRoutineEvent`)
- Modify: `docs/beneficio/03_public_api.md`
- Test: `tests/instalaciones/esquemaDeBodega.test.ts`
- Modify: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`)

**Interfaces:**
- Produces: `LocationType.storage_facility`; `MaterialConsumptionEntry.careRoutineEventId: string | null`; `CareRoutineEvent.consumptions: MaterialConsumptionEntry[]`; errores de base `bodega_padre_invalido` y el CHECK `material_consumption_entry_un_padre`.

- [ ] **Step 1: Medir el CHECK antes de escribirlo.** Contra la copia restaurada más nueva (`NN_BACKUP_DIR` exportado, `npm run test:db -- reset` sobre la base propia, luego `npx prisma migrate deploy`):

```sql
select count(*) as con_mas_de_un_padre
from traceability.material_consumption_entry
where num_nonnulls(fermentation_run_id, drying_run_id, location_id, field_session_id) > 1;
select count(*) as total from traceability.material_consumption_entry;
```

Esperado: `con_mas_de_un_padre = 0` **y** `total > 0` (control positivo: la tabla tiene filas). Si el primero no es 0, **parar** y enseñárselo a Daniel; no escribir el CHECK.

- [ ] **Step 2: Escribir la prueba que falla** — `tests/instalaciones/esquemaDeBodega.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
const creadas: string[] = [];
const loc = async (data: { locationType: "site" | "beneficio" | "plot" | "storage_facility"; parentLocationId?: string }) => {
  const l = await prisma.location.create({
    data: { ...data, name: `TEST esq ${f.run} ${Math.random()}`, organizationId: f.orgA, status: "approved", classification: "internal" },
  });
  creadas.push(l.id);
  return l;
};

beforeAll(async () => {
  f = await montarFixtures("esqbod");
});
afterAll(async () => {
  await prisma.location.deleteMany({ where: { id: { in: [...creadas].reverse() } } });
  await f.limpiar();
});

describe("la bodega cuelga de un beneficio o de una finca, en la base", () => {
  it("bajo una finca entra", async () => {
    const finca = await loc({ locationType: "site" });
    await expect(loc({ locationType: "storage_facility", parentLocationId: finca.id })).resolves.toBeTruthy();
  });
  it("bajo un beneficio entra", async () => {
    const finca = await loc({ locationType: "site" });
    const ben = await loc({ locationType: "beneficio", parentLocationId: finca.id });
    await expect(loc({ locationType: "storage_facility", parentLocationId: ben.id })).resolves.toBeTruthy();
  });
  it("bajo una parcela se rechaza", async () => {
    const parcela = await loc({ locationType: "plot" });
    await expect(loc({ locationType: "storage_facility", parentLocationId: parcela.id })).rejects.toThrow(/bodega_padre_invalido/);
  });
  it("sin padre se rechaza", async () => {
    await expect(loc({ locationType: "storage_facility" })).rejects.toThrow(/bodega_padre_invalido/);
  });
});

describe("un consumo tiene a lo sumo un padre, en la base", () => {
  it("con lugar y rutina a la vez se rechaza", async () => {
    const finca = await loc({ locationType: "site" });
    const rutina = await prisma.careRoutine.create({ data: { locationId: finca.id, kind: "fumigacion", intervalDays: 30 } });
    const ev = await prisma.careRoutineEvent.create({ data: { routineId: rutina.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record" } });
    try {
      await expect(
        prisma.materialConsumptionEntry.create({
          data: { materialName: "TEST", batchLabel: "TEST", locationId: finca.id, careRoutineEventId: ev.id, provenanceClass: "original_record" },
        }),
      ).rejects.toThrow(/material_consumption_entry_un_padre/);
      // Control positivo: con UN padre sí entra.
      const ok = await prisma.materialConsumptionEntry.create({
        data: { materialName: "TEST", batchLabel: "TEST", careRoutineEventId: ev.id, provenanceClass: "original_record" },
      });
      await prisma.materialConsumptionEntry.delete({ where: { id: ok.id } });
    } finally {
      await prisma.careRoutineEvent.deleteMany({ where: { routineId: rutina.id } });
      await prisma.careRoutine.delete({ where: { id: rutina.id } });
    }
  });
});
```

- [ ] **Step 3: Correr y ver que falla.**
Run: `npx vitest run tests/instalaciones/esquemaDeBodega.test.ts`
Expected: FAIL — el tipo `storage_facility` no existe en el cliente (error de tipos/valor de enum). Si dice «no tests», es un fallo de carga: leer el error antes de seguir.

- [ ] **Step 4: Migración del enum, sola** (Postgres no deja usar un valor nuevo en la misma transacción que lo añade) — `prisma/migrations/20260919200000_bodega_tipo_de_ubicacion/migration.sql`:

```sql
-- La bodega: donde se guarda el café (y lo que sea) entre el secado y la venta.
-- Tipo propio, como `beneficio` (spec 2026-09-19 §4.1): sin tipo, nada distingue
-- una bodega de otro lugar salvo su nombre.
ALTER TYPE "core"."LocationType" ADD VALUE 'storage_facility';
```

- [ ] **Step 5: Migración del resto** — `prisma/migrations/20260919200500_bodega_y_rutinas_de_lugar/migration.sql`:

```sql
-- Spec 2026-09-19 §4.1 y §4.3.

-- ── La bodega cuelga de un beneficio o de una finca ──
-- En la base y no sólo en el servicio: un importador o SQL directo no pasan por
-- TypeScript.
CREATE FUNCTION "core"."location_bodega_padre"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tipo_padre text;
BEGIN
  IF NEW."location_type"::text <> 'storage_facility' THEN
    RETURN NEW;
  END IF;
  IF NEW."parent_location_id" IS NULL THEN
    RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
  END IF;
  SELECT "location_type"::text INTO tipo_padre FROM "core"."location" WHERE "id" = NEW."parent_location_id";
  IF tipo_padre IS NULL OR tipo_padre NOT IN ('beneficio', 'site') THEN
    RAISE EXCEPTION 'bodega_padre_invalido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "location_bodega_padre"
  BEFORE INSERT OR UPDATE OF "location_type", "parent_location_id" ON "core"."location"
  FOR EACH ROW EXECUTE FUNCTION "core"."location_bodega_padre"();

-- ── El insumo de cada vez que se hizo una rutina ──
ALTER TABLE "traceability"."material_consumption_entry" ADD COLUMN "care_routine_event_id" UUID;
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_care_routine_event_id_fkey"
  FOREIGN KEY ("care_routine_event_id") REFERENCES "core"."care_routine_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "material_consumption_entry_care_routine_event_id_idx"
  ON "traceability"."material_consumption_entry"("care_routine_event_id");

-- «Un consumo tiene UN padre, no dos» (migración 20260917180000) vivía sólo en
-- prosa. Medido antes de escribirlo: 0 filas con más de uno (plan, Task 1 Step 1).
ALTER TABLE "traceability"."material_consumption_entry" ADD CONSTRAINT "material_consumption_entry_un_padre"
  CHECK (num_nonnulls("fermentation_run_id", "drying_run_id", "location_id", "field_session_id", "care_routine_event_id") <= 1);
```

- [ ] **Step 6: El esquema de Prisma.** En `enum LocationType`, tras `drying_bed`:

```prisma
  /// La bodega (spec 2026-09-19 §4.1): cuelga de un `beneficio` o de un `site`
  /// —lo comprueba el disparador `location_bodega_padre`—. Donde se almacena;
  /// lleva rutinas de limpieza y fumigación.
  storage_facility
```

En `model MaterialConsumptionEntry`, tras `fieldSession`:

```prisma
  /// La vez que se hizo una rutina de cuidado (spec 2026-09-19 §4.3): el
  /// producto con que se fumigó o se limpió. Un padre más; el CHECK
  /// `material_consumption_entry_un_padre` impide dos.
  careRoutineEventId String?           @map("care_routine_event_id") @db.Uuid
  careRoutineEvent   CareRoutineEvent? @relation(fields: [careRoutineEventId], references: [id], onDelete: Restrict)
```

y `@@index([careRoutineEventId])` junto a los demás índices. En `model CareRoutineEvent`, antes de `@@index`:

```prisma
  consumptions MaterialConsumptionEntry[]
```

- [ ] **Step 7: Declarar los nombres** en `docs/beneficio/03_public_api.md`, en la sección donde están los tipos de ubicación (buscar `drying_facility`); si no hay ninguna, añadir al final una sección:

```markdown
### Lugares y rutinas (2026-09-19)

- `LocationType.storage_facility` — la bodega; su padre es `beneficio` o `site`.
- `MaterialConsumptionEntry.careRoutineEventId` — el insumo usado en una vez que se hizo una rutina de cuidado; un consumo tiene a lo sumo un padre.
```

- [ ] **Step 8: Aplicar y generar.**
Run: `npx prisma migrate deploy && npx prisma generate` contra la base propia. Leer los dos nombres de migración que imprime.

- [ ] **Step 9: Correr y ver que pasa.**
Run: `npx vitest run tests/instalaciones/esquemaDeBodega.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 10: Carril.** Añadir `tests/instalaciones/esquemaDeBodega.test.ts` al grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`. Run: `bash scripts/ci.sh` → salida 0, y el archivo **no** aparece en su salida.

- [ ] **Step 11: Commit.**

```bash
git add prisma/migrations/20260919200000_bodega_tipo_de_ubicacion/migration.sql prisma/migrations/20260919200500_bodega_y_rutinas_de_lugar/migration.sql prisma/schema.prisma docs/beneficio/03_public_api.md tests/instalaciones/esquemaDeBodega.test.ts scripts/pruebas-por-compuerta.txt
git commit -F msg.txt   # «esquema: la bodega y el insumo de una rutina»
```

- [ ] **Step 12: Flip-test contra el commit.** Dos mutaciones, una a una, cada una restaurada con `git checkout -- <archivo>`, `npx prisma migrate reset --force` sobre la base propia entre medias:
  1. En la migración B, cambiar `NOT IN ('beneficio', 'site')` por `NOT IN ('beneficio', 'site', 'plot')` → debe caer **«bajo una parcela se rechaza»**.
  2. Borrar la línea del `ADD CONSTRAINT "material_consumption_entry_un_padre"` → debe caer **«con lugar y rutina a la vez se rechaza»**.
  Anotar sha antes/después de cada archivo y el nombre del test caído.

---

### Task 2: El servicio de la bodega

**Files:**
- Create: `lib/traceability/bodegas.ts`
- Modify: `lib/traceability/locations.ts:32` (`TIPOS_DEL_BENEFICIO`) y `:385-388` (`createMicrolot`)
- Test: `tests/instalaciones/bodegas.test.ts`

**Interfaces:**
- Consumes: `exigeEditarBeneficioEn`, `puedeEditarBeneficioEn`, `LocationAccessError`, `requireLocationAttributeAccess` de `lib/traceability/locations.ts`; `can` de `lib/rbac/service`; `recordAuditEvent` de `lib/audit`.
- Produces:
  - `class BodegaError extends Error` (mensajes: `datos_invalidos`, `padre_invalido`, `nombre_repetido`, `no_es_bodega`)
  - `padresParaBodega(userAccountId: string): Promise<{ id: string; name: string; tipo: "site" | "beneficio" }[]>`
  - `crearBodega(userAccountId: string, input: { parentLocationId: string; name: string }): Promise<{ id: string }>`
  - `listarBodegas(userAccountId: string): Promise<{ id: string; name: string; padre: { id: string; name: string } | null }[]>`
  - `detalleBodega(userAccountId: string, id: string): Promise<{ id: string; name: string; timezone: string | null; padre: { id: string; name: string } | null }>`

- [ ] **Step 1: Prueba que falla** — `tests/instalaciones/bodegas.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { BodegaError, crearBodega, detalleBodega, listarBodegas, padresParaBodega } from "../../lib/traceability/bodegas";
import { createMicrolot, LocationAccessError, LocationValidationError } from "../../lib/traceability/locations";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let finca: string;
let beneficio: string;
const creadas: string[] = [];

beforeAll(async () => {
  f = await montarFixtures("bod");
  // Hijos del sitio A: el permiso de jefeA (Farm Manager en sitioA) se hereda.
  finca = (await prisma.location.create({ data: { locationType: "site", name: `TEST finca ${f.run}`, parentLocationId: f.sitioA, organizationId: f.orgA, status: "approved", classification: "internal" } })).id;
  beneficio = (await prisma.location.create({ data: { locationType: "beneficio", name: `TEST ben ${f.run}`, parentLocationId: finca, organizationId: f.orgA, status: "approved", classification: "internal" } })).id;
});
afterAll(async () => {
  const ids = (await prisma.location.findMany({ where: { name: { contains: f.run }, locationType: "storage_facility" }, select: { id: true } })).map((l) => l.id);
  await prisma.location.deleteMany({ where: { id: { in: [...ids, ...creadas] } } });
  await prisma.location.deleteMany({ where: { id: beneficio } });
  await prisma.location.deleteMany({ where: { id: finca } });
  await f.limpiar();
});

describe("crear una bodega", () => {
  it("el jefe la crea bajo el beneficio, con su AuditEvent y la organización del padre", async () => {
    const b = await crearBodega(f.jefeA, { parentLocationId: beneficio, name: `TEST bodega ${f.run}` });
    const row = await prisma.location.findUniqueOrThrow({ where: { id: b.id } });
    expect(row.locationType).toBe("storage_facility");
    expect(row.organizationId).toBe(f.orgA);
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "location", entityId: b.id, operation: "location.create_storage" } });
    expect(ev?.actorUserAccountId).toBe(f.jefeA);
  });
  it("el operario no la crea (no tiene edit_beneficio)", async () => {
    await expect(crearBodega(f.operarioA, { parentLocationId: finca, name: `TEST bodega op ${f.run}` })).rejects.toThrow(LocationAccessError);
  });
  it("bajo el sitio de pruebas (una parcela) no: padre_invalido", async () => {
    await expect(crearBodega(f.jefeA, { parentLocationId: f.sitioA, name: `TEST bodega p ${f.run}` })).rejects.toThrow(new BodegaError("padre_invalido"));
  });
  it("un nombre repetido bajo el mismo padre sale legible", async () => {
    await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST rep ${f.run}` });
    await expect(crearBodega(f.jefeA, { parentLocationId: finca, name: ` test REP ${f.run} ` })).rejects.toThrow(new BodegaError("nombre_repetido"));
  });
  it("sin nombre: datos_invalidos", async () => {
    await expect(crearBodega(f.jefeA, { parentLocationId: finca, name: "  " })).rejects.toThrow(new BodegaError("datos_invalidos"));
  });
});

describe("ver bodegas", () => {
  it("padresParaBodega ofrece la finca y el beneficio al jefe, y nada al ajeno", async () => {
    const ids = (await padresParaBodega(f.jefeA)).map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining([finca, beneficio]));
    expect(ids).not.toContain(f.sitioA);
    expect(await padresParaBodega(f.ajeno)).toEqual([]);
  });
  it("listarBodegas: el jefe las ve, el operario de B no", async () => {
    const b = await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST vis ${f.run}` });
    expect((await listarBodegas(f.jefeA)).map((x) => x.id)).toContain(b.id);
    expect((await listarBodegas(f.operarioB)).map((x) => x.id)).not.toContain(b.id);
  });
  it("detalleBodega de un lugar que no es bodega: no_es_bodega", async () => {
    await expect(detalleBodega(f.jefeA, beneficio)).rejects.toThrow(new BodegaError("no_es_bodega"));
  });
});

describe("una bodega es configuración del beneficio", () => {
  it("no se subdivide en microlotes", async () => {
    const b = await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST micro ${f.run}` });
    await expect(
      createMicrolot(f.jefeA, { parentLocationId: b.id, name: `TEST m ${f.run}`, subdivisionReason: "other", subdivisionReasonNote: "x" } as never),
    ).rejects.toThrow(new LocationValidationError("bodega_no_se_subdivide"));
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run tests/instalaciones/bodegas.test.ts` → FAIL, «Cannot find module '../../lib/traceability/bodegas'».

- [ ] **Step 3: Implementar** — `lib/traceability/bodegas.ts`:

```ts
/**
 * La bodega (spec 2026-09-19 §4.1). Archivo propio y no `instalaciones.ts`, que
 * la rama `secado-2a` está reescribiendo: el choque queda en cero líneas.
 *
 * Crearla es configurar el beneficio: `location:edit_beneficio` sobre el padre,
 * igual que una instalación de secado. El padre lo comprueba también la base
 * (disparador `location_bodega_padre`).
 */
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { prisma } from "../db";
import { exigeEditarBeneficioEn, puedeEditarBeneficioEn, requireLocationAttributeAccess } from "./locations";

export class BodegaError extends Error {}

const PADRES = ["site", "beneficio"] as const;

export async function padresParaBodega(userAccountId: string) {
  const candidatos = await prisma.location.findMany({
    where: { locationType: { in: [...PADRES] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, locationType: true },
  });
  const salida: { id: string; name: string; tipo: "site" | "beneficio" }[] = [];
  for (const c of candidatos) {
    if (await puedeEditarBeneficioEn(userAccountId, c.id)) {
      salida.push({ id: c.id, name: c.name, tipo: c.locationType as "site" | "beneficio" });
    }
  }
  return salida;
}

export async function crearBodega(userAccountId: string, input: { parentLocationId: string; name: string }) {
  const nombre = input.name.trim();
  if (!nombre || nombre.length > 120) throw new BodegaError("datos_invalidos");
  const padre = await prisma.location.findUnique({ where: { id: input.parentLocationId } });
  if (!padre) throw new BodegaError("padre_invalido");
  await exigeEditarBeneficioEn(userAccountId, padre.id);
  if (!(PADRES as readonly string[]).includes(padre.locationType)) throw new BodegaError("padre_invalido");
  return prisma.$transaction(async (tx) => {
    const hermanas = await tx.location.findMany({ where: { parentLocationId: padre.id }, select: { name: true } });
    const clave = (s: string) => s.trim().toLowerCase();
    if (hermanas.some((h) => clave(h.name) === clave(nombre))) throw new BodegaError("nombre_repetido");
    const after = await tx.location.create({
      data: {
        name: nombre,
        locationType: "storage_facility",
        parentLocationId: padre.id,
        organizationId: padre.organizationId,
        classification: padre.classification,
        timezone: padre.timezone,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "location.create_storage", entityType: "location", entityId: after.id, after, sourceInterface: "traceability.service" },
      tx,
    );
    return { id: after.id };
  });
}

async function padreVisible(userAccountId: string, parentLocationId: string | null) {
  if (!parentLocationId) return null;
  const p = await prisma.location.findUnique({ where: { id: parentLocationId }, select: { id: true, name: true, classification: true } });
  if (!p) return null;
  const ok = await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: p.id }, p.classification);
  return ok ? { id: p.id, name: p.name } : null;
}

export async function listarBodegas(userAccountId: string) {
  const filas = await prisma.location.findMany({ where: { locationType: "storage_facility" }, orderBy: { name: "asc" } });
  const salida = [];
  for (const b of filas) {
    if (await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: b.id }, b.classification)) {
      salida.push({ id: b.id, name: b.name, padre: await padreVisible(userAccountId, b.parentLocationId) });
    }
  }
  return salida;
}

export async function detalleBodega(userAccountId: string, id: string) {
  await requireLocationAttributeAccess(userAccountId, id);
  const b = await prisma.location.findUniqueOrThrow({ where: { id } });
  if (b.locationType !== "storage_facility") throw new BodegaError("no_es_bodega");
  return { id: b.id, name: b.name, timezone: b.timezone, padre: await padreVisible(userAccountId, b.parentLocationId) };
}
```

(Si `Location` no tiene `createdBy`, quitar esa línea: comprobar con `grep -n 'createdBy' prisma/schema.prisma` dentro de `model Location` antes de escribirla — `crearUbicacionDeSecado` sí la usa, así que debería existir.)

- [ ] **Step 4: `locations.ts`.** Línea 32:

```ts
const TIPOS_DEL_BENEFICIO = new Set<LocationType>(["beneficio", "drying_facility", "drying_bed", "storage_facility"]);
```

y en `createMicrolot`, tras el rechazo de `beneficio`:

```ts
  if (parent.locationType === "storage_facility") throw new LocationValidationError("bodega_no_se_subdivide");
```

- [ ] **Step 5: Correr y ver que pasa.** `npx vitest run tests/instalaciones/bodegas.test.ts` → PASS, 9 tests. `npx vitest run tests/traceability/locations*.test.ts` sigue en verde.

- [ ] **Step 6: Carril y commit.** `tests/instalaciones/bodegas.test.ts` a `base-sembrada`; `bash scripts/ci.sh` → 0.

```bash
git add lib/traceability/bodegas.ts lib/traceability/locations.ts tests/instalaciones/bodegas.test.ts scripts/pruebas-por-compuerta.txt
git commit -F msg.txt   # «bodegas: crear, listar y ver; son configuración del beneficio»
```

- [ ] **Step 7: Flip-test contra el commit.** Quitar `"storage_facility"` de `TIPOS_DEL_BENEFICIO` no lo caza esta suite (lo cubre `exigeEditarBeneficioSiLoEs`): añadir antes del commit, en `bodegas.test.ts`, este caso y comprobarlo con esa mutación:

```ts
it("editar sus atributos por el camino genérico exige edit_beneficio", async () => {
  const { exigeEditarBeneficioSiLoEs } = await import("../../lib/traceability/locations");
  const b = await crearBodega(f.jefeA, { parentLocationId: finca, name: `TEST attr ${f.run}` });
  await expect(exigeEditarBeneficioSiLoEs(f.operarioA, b.id)).rejects.toThrow(LocationAccessError);
  await expect(exigeEditarBeneficioSiLoEs(f.jefeA, b.id)).resolves.toBeUndefined();
});
```

Mutación: quitar `"storage_facility"` del `Set` → debe caer **«editar sus atributos por el camino genérico exige edit_beneficio»**.

---

### Task 3: El consumo, reutilizable dentro de otra transacción

**Files:**
- Modify: `lib/traceability/operations.ts:169-330`
- Test: `tests/traceability/consumoConRutina.test.ts`

**Interfaces:**
- Produces:
  - variante `{ kind: "careRoutineEvent"; careRoutineEventId: string }` en `MaterialConsumptionParent`
  - `crearConsumoEnTx(tx: Prisma.TransactionClient, userAccountId: string, input: RecordMaterialConsumptionEntryInput): Promise<MaterialConsumptionEntry>` — valida nombre/lote, crea la fila, descuenta si hay `consumableLotId` y `quantity`, audita. **No autoriza**: autoriza quien la llama.
- `recordMaterialConsumptionEntry` conserva su firma y su comportamiento: autoriza, y dentro de `unaVezPorEnvio` llama a `crearConsumoEnTx`. Rechaza `parent.kind === "careRoutineEvent"` con `MaterialConsumptionValidationError("consumo_de_rutina_por_su_servicio")`, porque ese padre sólo lo crea `lib/rutinas/rutinas.ts`.

- [ ] **Step 1: Prueba que falla** — `tests/traceability/consumoConRutina.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearConsumoEnTx, MaterialConsumptionValidationError, recordMaterialConsumptionEntry } from "../../lib/traceability/operations";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let rutina: string;
let evento: string;

beforeAll(async () => {
  f = await montarFixtures("cons");
  rutina = (await prisma.careRoutine.create({ data: { locationId: f.sitioA, kind: "fumigacion", intervalDays: 30 } })).id;
  evento = (await prisma.careRoutineEvent.create({ data: { routineId: rutina, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record" } })).id;
});
afterAll(async () => {
  await prisma.materialConsumptionEntry.deleteMany({ where: { careRoutineEventId: evento } });
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: rutina } });
  await prisma.careRoutine.delete({ where: { id: rutina } });
  await f.limpiar();
});

describe("crearConsumoEnTx", () => {
  it("cuelga el consumo de la vez que se hizo la rutina, con su AuditEvent en la misma transacción", async () => {
    const c = await prisma.$transaction((tx) =>
      crearConsumoEnTx(tx, f.jefeA, {
        parent: { kind: "careRoutineEvent", careRoutineEventId: evento },
        materialName: "TEST cal",
        batchLabel: "TEST L1",
        provenanceClass: "original_record",
      }),
    );
    expect(c.careRoutineEventId).toBe(evento);
    expect(c.locationId).toBeNull();
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "material_consumption_entry", entityId: c.id } });
    expect(ev).not.toBeNull();
  });
  it("si la transacción de fuera falla, no queda el consumo", async () => {
    const antes = await prisma.materialConsumptionEntry.count({ where: { careRoutineEventId: evento } });
    await expect(
      prisma.$transaction(async (tx) => {
        await crearConsumoEnTx(tx, f.jefeA, { parent: { kind: "careRoutineEvent", careRoutineEventId: evento }, materialName: "TEST", batchLabel: "TEST", provenanceClass: "original_record" });
        throw new Error("falla_de_fuera");
      }),
    ).rejects.toThrow("falla_de_fuera");
    expect(await prisma.materialConsumptionEntry.count({ where: { careRoutineEventId: evento } })).toBe(antes);
  });
});

describe("recordMaterialConsumptionEntry", () => {
  it("no acepta el padre de rutina: ése lo crea el servicio de rutinas", async () => {
    await expect(
      recordMaterialConsumptionEntry(f.jefeA, { parent: { kind: "careRoutineEvent", careRoutineEventId: evento }, materialName: "TEST", batchLabel: "TEST", provenanceClass: "original_record" }),
    ).rejects.toThrow(new MaterialConsumptionValidationError("consumo_de_rutina_por_su_servicio"));
  });
});
```

- [ ] **Step 2: Correr y ver que falla.** → FAIL, `crearConsumoEnTx` no exportada.

- [ ] **Step 3: Implementar.** En `operations.ts`:
  1. Añadir a `MaterialConsumptionParent`: `| { kind: "careRoutineEvent"; careRoutineEventId: string }` (con un comentario: «la vez que se hizo una rutina de cuidado; sólo la crea `lib/rutinas/rutinas.ts`, que autoriza en el lugar o el equipo»).
  2. Añadir a `consumptionParentData`: `case "careRoutineEvent": return { careRoutineEventId: parent.careRoutineEventId };`
  3. Mover **tal cual** el cuerpo de `crear: async (tx) => { … }` (desde `const creada = await tx.materialConsumptionEntry.create` hasta `return creada;`) a:

```ts
/**
 * Crear un consumo DENTRO de una transacción ajena: la fila, su descuento de
 * existencias y su AuditEvent, los tres con `tx`. **No autoriza**: la
 * autorización es de quien la llama —`recordMaterialConsumptionEntry` por el
 * lote o el lugar; `registrarRealizada` por la rutina—.
 */
export async function crearConsumoEnTx(tx: Prisma.TransactionClient, userAccountId: string, input: RecordMaterialConsumptionEntryInput) {
  if (!input.materialName.trim()) throw new MaterialConsumptionValidationError("material_name_required");
  if (!input.batchLabel.trim()) throw new MaterialConsumptionValidationError("batch_label_required");
  // … cuerpo movido sin cambios: create + descuento + recordAuditEvent(…, tx) …
  return creada;
}
```

  4. En `recordMaterialConsumptionEntry`, al principio: `if (input.parent.kind === "careRoutineEvent") throw new MaterialConsumptionValidationError("consumo_de_rutina_por_su_servicio");` y sustituir el cuerpo del `crear` por `crear: (tx) => crearConsumoEnTx(tx, userAccountId, input),`. Importar `Prisma` de `../../generated/prisma/client` si el archivo no lo importa ya.

- [ ] **Step 4: Correr.** `npx vitest run tests/traceability/consumoConRutina.test.ts` → PASS, 3 tests. Y las pruebas que ya usan consumos siguen igual: `git grep -l recordMaterialConsumptionEntry -- tests | xargs npx vitest run` (BSD `xargs` sin `-a`; aquí va por tubería y está bien). Leer el total: mismo número que antes del cambio.

- [ ] **Step 5: Carril, typecheck y commit.** `npm run typecheck` → 0 (el `switch` exhaustivo obliga a tratar la variante). Test a `base-sembrada`.

```bash
git add lib/traceability/operations.ts tests/traceability/consumoConRutina.test.ts scripts/pruebas-por-compuerta.txt
git commit -F msg.txt   # «consumo: crearConsumoEnTx y el padre de rutina»
```

---

### Task 4: Rutinas de lugar en el servicio

**Files:**
- Create: `lib/rutinas/lugares.ts`
- Modify: `lib/rutinas/rutinas.ts`
- Test: `tests/rutinas/rutinasDeLugar.test.ts`

**Interfaces:**
- Consumes: `crearConsumoEnTx` (Task 3); `puedeEditarBeneficioEn` de `lib/traceability/locations`; `can`.
- Produces (`lib/rutinas/lugares.ts`):
  - `type LugarConRutina = { id: string; locationType: LocationType; parentLocationId: string | null; organizationId: string | null; classification: ClassificationLevel; timezone: string | null; createdAt: Date }`
  - `lugarParaRutina(locationId: string): Promise<LugarConRutina>` — lanza `RutinaError("lugar_no_encontrado" | "lugar_sin_rutinas" | "rutina_en_el_estante")`
  - `rutaDeLugar(l: { id: string; locationType: LocationType; parentLocationId: string | null }): string`
  - `puedeSobreLugar(userAccountId: string, locationId: string, accion: "view" | "manage" | "report_condition"): Promise<boolean>`
  - `insumosDeLugar(userAccountId: string, locationId: string): Promise<{ id: string; etiqueta: string; materialName: string; batchLabel: string }[]>`
  - `equiposAqui(userAccountId: string, locationId: string): Promise<{ id: string; name: string }[]>`
- Produces (`lib/rutinas/rutinas.ts`):
  - `NuevaRutina` pasa a `{ equipmentId?: string | null; locationId?: string | null; kind; kindNote?; intervalDays; instructions? }` — exactamente uno de los dos.
  - `NuevoRegistro` gana `insumos?: { consumableLotId: string; quantity?: number | null; unit?: string | null }[]`
  - `rutinasDeLugar(userAccountId: string, locationId: string, hoy: string): Promise<RutinaConEstado[]>` — cada registro gana `productos: { materialName: string; batchLabel: string; quantity: string | null; unit: string | null }[]`
  - `vencidasPorLugar(userAccountId: string, locationIds: readonly string[], hoy: string): Promise<Map<string, number>>`

- [ ] **Step 1: Prueba que falla** — `tests/rutinas/rutinasDeLugar.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearRutina, registrarRealizada, RutinaError, rutinasDeLugar, vencidasPorLugar } from "../../lib/rutinas/rutinas";
import { rutaDeLugar } from "../../lib/rutinas/lugares";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
const L: Record<string, string> = {};
let material: string;
let loteDeInsumo: string;
let loteAjeno: string;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function loc(nombre: string, locationType: "site" | "beneficio" | "drying_facility" | "drying_bed" | "storage_facility" | "plot", parentLocationId: string | null) {
  const l = await prisma.location.create({ data: { name: `TEST ${nombre} ${f.run}`, locationType, parentLocationId, organizationId: f.orgA, status: "approved", classification: "internal" } });
  L[nombre] = l.id;
  return l.id;
}

beforeAll(async () => {
  f = await montarFixtures("rutlug");
  await loc("finca", "site", f.sitioA);
  await loc("beneficio", "beneficio", L.finca!);
  await loc("cuarto", "drying_facility", L.finca!);
  await loc("cama", "drying_bed", L.cuarto!);
  await loc("bodega", "storage_facility", L.beneficio!);
  const mat = await prisma.consumableMaterial.create({ data: { name: `TEST cal ${f.run}`, defaultUnit: "kg", organizationId: f.orgA } });
  material = mat.id;
  loteDeInsumo = (await prisma.consumableLot.create({ data: { materialId: material, batchLabel: `TEST L ${f.run}`, receivedAt: dia("2026-08-01") } })).id;
  await prisma.consumableStockEvent.create({ data: { consumableLotId: loteDeInsumo, eventType: "received", quantity: 10, unit: "kg", occurredAt: dia("2026-08-01"), provenanceClass: "original_record" } });
  const matB = await prisma.consumableMaterial.create({ data: { name: `TEST ajeno ${f.run}`, defaultUnit: "kg", organizationId: f.orgB } });
  loteAjeno = (await prisma.consumableLot.create({ data: { materialId: matB.id, batchLabel: `TEST LB ${f.run}`, receivedAt: dia("2026-08-01") } })).id;
});

afterAll(async () => {
  const rs = (await prisma.careRoutine.findMany({ where: { locationId: { in: Object.values(L) } }, select: { id: true } })).map((r) => r.id);
  const evs = (await prisma.careRoutineEvent.findMany({ where: { routineId: { in: rs } }, select: { id: true } })).map((e) => e.id);
  await prisma.materialConsumptionEntry.deleteMany({ where: { careRoutineEventId: { in: evs } } });
  await prisma.consumableStockEvent.deleteMany({ where: { consumableLotId: { in: [loteDeInsumo, loteAjeno] } } });
  await prisma.consumableLot.deleteMany({ where: { id: { in: [loteDeInsumo, loteAjeno] } } });
  await prisma.consumableMaterial.deleteMany({ where: { name: { contains: f.run } } });
  await prisma.careRoutineEvent.deleteMany({ where: { id: { in: evs } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rs } } });
  for (const n of ["bodega", "cama", "cuarto", "beneficio", "finca"]) await prisma.location.deleteMany({ where: { id: L[n] } });
  await f.limpiar();
});

describe("qué lugares llevan rutinas", () => {
  for (const n of ["beneficio", "cuarto", "cama", "bodega"]) {
    it(`${n}: sí`, async () => {
      const r = await crearRutina(f.jefeA, { locationId: L[n]!, kind: "limpieza", intervalDays: 7 });
      expect(r.id).toBeTruthy();
    });
  }
  it("una finca: lugar_sin_rutinas", async () => {
    await expect(crearRutina(f.jefeA, { locationId: L.finca!, kind: "limpieza", intervalDays: 7 })).rejects.toThrow(new RutinaError("lugar_sin_rutinas"));
  });
  it("ni equipo ni lugar, o los dos: una_cosa", async () => {
    await expect(crearRutina(f.jefeA, { kind: "limpieza", intervalDays: 7 })).rejects.toThrow(new RutinaError("una_cosa"));
  });
});

describe("gestión define, faena apunta", () => {
  it("el operario no define", async () => {
    await expect(crearRutina(f.operarioA, { locationId: L.bodega!, kind: "fumigacion", intervalDays: 30 })).rejects.toThrow(new RutinaError("forbidden"));
  });
  it("el operario apunta", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.bodega!, kind: "fumigacion", intervalDays: 30 });
    await expect(registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-01"), provenanceClass: "original_record" })).resolves.toBeTruthy();
  });
  it("el ajeno no apunta", async () => {
    const r = await prisma.careRoutine.findFirstOrThrow({ where: { locationId: L.bodega!, kind: "fumigacion" } });
    await expect(registrarRealizada(f.ajeno, { routineId: r.id, performedOn: dia("2026-09-02"), provenanceClass: "original_record" })).rejects.toThrow(new RutinaError("forbidden"));
  });
});

describe("el producto", () => {
  it("dos insumos: dos consumos, un descuento por el que lleva cantidad, en la misma transacción", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.cuarto!, kind: "fumigacion", intervalDays: 30 });
    const ev = await registrarRealizada(f.operarioA, {
      routineId: r.id,
      performedOn: dia("2026-08-10"),
      provenanceClass: "original_record",
      insumos: [{ consumableLotId: loteDeInsumo, quantity: 2, unit: "kg" }, { consumableLotId: loteDeInsumo, quantity: null, unit: null }],
    });
    expect(await prisma.materialConsumptionEntry.count({ where: { careRoutineEventId: ev.id } })).toBe(2);
    expect(await prisma.consumableStockEvent.count({ where: { consumableLotId: loteDeInsumo, eventType: "consumed" } })).toBe(1);
  });
  it("si el segundo falla (unidad distinta), no queda NADA: ni la vez, ni el primer consumo", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.cama!, kind: "fumigacion", intervalDays: 30 });
    const antesEv = await prisma.careRoutineEvent.count({ where: { routineId: r.id } });
    const antesStock = await prisma.consumableStockEvent.count({ where: { consumableLotId: loteDeInsumo } });
    await expect(
      registrarRealizada(f.operarioA, {
        routineId: r.id,
        performedOn: dia("2026-08-11"),
        provenanceClass: "original_record",
        insumos: [{ consumableLotId: loteDeInsumo, quantity: 1, unit: "kg" }, { consumableLotId: loteDeInsumo, quantity: 1, unit: "galones" }],
      }),
    ).rejects.toThrow(/unidad distinta/);
    expect(await prisma.careRoutineEvent.count({ where: { routineId: r.id } })).toBe(antesEv);
    expect(await prisma.consumableStockEvent.count({ where: { consumableLotId: loteDeInsumo } })).toBe(antesStock);
  });
  it("un insumo de otra organización: insumo_ajeno", async () => {
    const r = await prisma.careRoutine.findFirstOrThrow({ where: { locationId: L.cuarto!, kind: "fumigacion" } });
    await expect(
      registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-08-12"), provenanceClass: "original_record", insumos: [{ consumableLotId: loteAjeno, quantity: 1, unit: "kg" }] }),
    ).rejects.toThrow(new RutinaError("insumo_ajeno"));
  });
});

describe("el aviso", () => {
  it("una fumigación cada 30 días hecha hace 40 sale vencida hace 10, y la lista la cuenta", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.beneficio!, kind: "fumigacion", intervalDays: 30 });
    await registrarRealizada(f.jefeA, { routineId: r.id, performedOn: dia("2026-08-01"), provenanceClass: "original_record" });
    const rs = await rutinasDeLugar(f.jefeA, L.beneficio!, "2026-09-10");
    const fum = rs.find((x) => x.id === r.id)!;
    expect(fum.estado).toMatchObject({ estado: "vencida", pasaron: 10 });
    const m = await vencidasPorLugar(f.jefeA, [L.beneficio!], "2026-09-10");
    expect(m.get(L.beneficio!)).toBeGreaterThanOrEqual(1);
  });
  it("los productos salen en el historial", async () => {
    const rs = await rutinasDeLugar(f.jefeA, L.cuarto!, "2026-09-10");
    const fum = rs.find((x) => x.kind === "fumigacion")!;
    expect(fum.registros[0]!.productos.map((p) => p.batchLabel)).toContain(`TEST L ${f.run}`);
  });
  it("el ajeno no ve las rutinas del lugar", async () => {
    await expect(rutinasDeLugar(f.ajeno, L.beneficio!, "2026-09-10")).rejects.toThrow(new RutinaError("forbidden"));
  });
});

describe("a dónde vuelve cada lugar", () => {
  it("bodega, instalación, cama y beneficio", () => {
    expect(rutaDeLugar({ id: "b", locationType: "storage_facility", parentLocationId: "x" })).toBe("/bodegas/b");
    expect(rutaDeLugar({ id: "i", locationType: "drying_facility", parentLocationId: "x" })).toBe("/instalaciones/i");
    expect(rutaDeLugar({ id: "c", locationType: "drying_bed", parentLocationId: "i" })).toBe("/instalaciones/i");
    expect(rutaDeLugar({ id: "z", locationType: "beneficio", parentLocationId: "x" })).toBe("/beneficio");
  });
});
```

(Antes de escribirlo: comprobar con `awk '/^model ConsumableMaterial /,/^}/' prisma/schema.prisma` los campos obligatorios de `ConsumableMaterial` y los valores de `ConsumableStockEventType` —`received` y `consumed` salen de `lib/inventario/lotes.ts` y `operations.ts`—, y ajustar los `create` del `beforeAll` a lo que el esquema exige.)

- [ ] **Step 2: Correr y ver que falla.** → FAIL, `rutasDeLugar`/`rutinasDeLugar` no existen.

- [ ] **Step 3: Implementar `lib/rutinas/lugares.ts`:**

```ts
/**
 * Qué lugar admite rutinas, a dónde vuelve su pantalla y quién puede qué
 * (spec 2026-09-19 §4.2). Gestión = `location:edit_beneficio` en el lugar;
 * faena = `equipment:report_condition` en el lugar —el mismo permiso con que ya
 * se apunta la rutina de un equipo—; ver = `location:manage_attributes`.
 */
import type { ClassificationLevel, LocationType } from "../../generated/prisma/client";
import { prisma } from "../db";
import { can } from "../rbac/service";
import { RutinaError } from "./rutinas";

export type LugarConRutina = {
  id: string;
  locationType: LocationType;
  parentLocationId: string | null;
  organizationId: string | null;
  classification: ClassificationLevel;
  timezone: string | null;
  createdAt: Date;
};

const CON_RUTINA = new Set<LocationType>(["beneficio", "drying_facility", "storage_facility", "drying_bed"]);

export async function lugarParaRutina(locationId: string): Promise<LugarConRutina> {
  const l = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, locationType: true, parentLocationId: true, organizationId: true, classification: true, timezone: true, createdAt: true },
  });
  if (!l) throw new RutinaError("lugar_no_encontrado");
  if (!CON_RUTINA.has(l.locationType)) throw new RutinaError("lugar_sin_rutinas");
  if (l.locationType === "drying_bed" && l.parentLocationId) {
    const padre = await prisma.location.findUnique({ where: { id: l.parentLocationId }, select: { locationType: true } });
    // Parte 2: cuando exista `drying_rack`, una posición dentro de un estante
    // comparte la rutina del estante. Hoy toda cama cuelga de una instalación.
    if (padre && padre.locationType !== "drying_facility") throw new RutinaError("rutina_en_el_estante");
  }
  return l;
}

export function rutaDeLugar(l: { id: string; locationType: LocationType; parentLocationId: string | null }): string {
  switch (l.locationType) {
    case "storage_facility":
      return `/bodegas/${l.id}`;
    case "drying_facility":
      return `/instalaciones/${l.id}`;
    case "drying_bed":
      return `/instalaciones/${l.parentLocationId}`;
    case "beneficio":
      return "/beneficio";
    default:
      return "/instalaciones";
  }
}

export async function puedeSobreLugar(userAccountId: string, locationId: string, accion: "view" | "manage" | "report_condition"): Promise<boolean> {
  const l = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  if (!l) return false;
  const objetivo = { scopeType: "location", scopeRefId: locationId } as const;
  if (accion === "manage") return can(userAccountId, "edit_beneficio", "location", objetivo, l.classification);
  if (accion === "report_condition") return can(userAccountId, "report_condition", "equipment", objetivo, l.classification);
  return can(userAccountId, "manage_attributes", "location", objetivo, l.classification);
}

/** Los lotes de insumo de la organización del lugar, para las filas de producto. */
export async function insumosDeLugar(userAccountId: string, locationId: string) {
  if (!(await puedeSobreLugar(userAccountId, locationId, "report_condition"))) return [];
  const l = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!l?.organizationId) return [];
  const lotes = await prisma.consumableLot.findMany({
    where: { material: { organizationId: l.organizationId } },
    orderBy: [{ material: { name: "asc" } }, { receivedAt: "desc" }],
    select: { id: true, batchLabel: true, material: { select: { name: true } } },
  });
  return lotes.map((x) => ({ id: x.id, etiqueta: `${x.material.name} · ${x.batchLabel}`, materialName: x.material.name, batchLabel: x.batchLabel }));
}

/** Los equipos cuyo ÚLTIMO traslado va a este lugar (spec §4.4). */
export async function equiposAqui(userAccountId: string, locationId: string) {
  if (!(await puedeSobreLugar(userAccountId, locationId, "view"))) return [];
  const candidatos = await prisma.equipment.findMany({
    where: { transfers: { some: { toLocationId: locationId } } },
    select: { id: true, name: true, transfers: { orderBy: { occurredAt: "desc" }, take: 1, select: { toLocationId: true } } },
    orderBy: { name: "asc" },
  });
  return candidatos.filter((e) => e.transfers[0]?.toLocationId === locationId).map((e) => ({ id: e.id, name: e.name }));
}
```

(Comprobar los nombres reales de `EquipmentTransfer` —`toLocationId`, el campo de fecha— con `awk '/^model EquipmentTransfer /,/^}/' prisma/schema.prisma` y usar ésos; `listarEquipos` en `lib/equipos/equipos.ts` ordena ya por el último traslado y es la referencia. Si `equipment.transfers` ordena por otro campo allí, usar el mismo.)

- [ ] **Step 4: Modificar `lib/rutinas/rutinas.ts`.**
  1. Cabecera: sustituir «Las rutinas de INSTALACIÓN existen en la base pero no en este servicio…» por «Las de LUGAR juzgan en el lugar (`lib/rutinas/lugares.ts`, spec 2026-09-19 §4.2).»
  2. `NuevaRutina`: `equipmentId?: string | null; locationId?: string | null;`
  3. `NuevoRegistro`: `insumos?: { consumableLotId: string; quantity?: number | null; unit?: string | null }[];`
  4. `requireRutinaAccess`:

```ts
export async function requireRutinaAccess(
  userAccountId: string,
  cosa: { equipmentId: string | null; locationId: string | null },
  accion: "manage" | "report_condition",
): Promise<void> {
  if ((cosa.equipmentId === null) === (cosa.locationId === null)) throw new RutinaError("una_cosa");
  if (cosa.equipmentId !== null) {
    if (!(await puedeSobreEquipo(userAccountId, cosa.equipmentId, accion))) throw new RutinaError("forbidden");
    return;
  }
  await lugarParaRutina(cosa.locationId!);
  if (!(await puedeSobreLugar(userAccountId, cosa.locationId!, accion))) throw new RutinaError("forbidden");
}
```

  (Import circular `rutinas.ts` ↔ `lugares.ts` por `RutinaError`: moverlo a `lib/rutinas/error.ts` y reexportarlo desde `rutinas.ts` con `export { RutinaError } from "./error";` para que las importaciones existentes no cambien.)
  5. `crearRutina`: pasar `{ equipmentId: r.equipmentId ?? null, locationId: r.locationId ?? null }` a `requireRutinaAccess`, y en el `create` `equipmentId: r.equipmentId ?? null, locationId: r.locationId ?? null`; el `after` del audit lleva los dos.
  6. `registrarRealizada`: tras validar la fecha, si `r.insumos?.length`:

```ts
  const insumos = (r.insumos ?? []).filter((i) => i.consumableLotId);
  let lotes: { id: string; batchLabel: string; material: { name: string; organizationId: string } }[] = [];
  if (insumos.length) {
    const org = ru.locationId
      ? (await prisma.location.findUniqueOrThrow({ where: { id: ru.locationId }, select: { organizationId: true } })).organizationId
      : (await prisma.equipment.findUniqueOrThrow({ where: { id: ru.equipmentId! }, select: { organizationId: true } })).organizationId;
    lotes = await prisma.consumableLot.findMany({
      where: { id: { in: insumos.map((i) => i.consumableLotId) } },
      select: { id: true, batchLabel: true, material: { select: { name: true, organizationId: true } } },
    });
    for (const i of insumos) {
      const lote = lotes.find((l) => l.id === i.consumableLotId);
      if (!lote || lote.material.organizationId !== org) throw new RutinaError("insumo_ajeno");
    }
  }
```

  y dentro de la transacción, tras el `recordAuditEvent` del evento:

```ts
    for (const i of insumos) {
      const lote = lotes.find((l) => l.id === i.consumableLotId)!;
      await crearConsumoEnTx(tx, userAccountId, {
        parent: { kind: "careRoutineEvent", careRoutineEventId: ev.id },
        materialName: lote.material.name,
        batchLabel: lote.batchLabel,
        consumableLotId: lote.id,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        occurredAt: r.performedOn,
        operatorPersonId: r.performedByPersonId || null,
        provenanceClass: r.provenanceClass,
      });
    }
```

  7. `rutinasDeLugar` — misma forma que `rutinasDeEquipo`, con: permiso `puedeSobreLugar(…, "view")` o `RutinaError("forbidden")`; `where: { locationId, retiredAt: null }`; `alta: lugar.createdAt`; y en `events.include` añadir `consumptions: { select: { materialName: true, batchLabel: true, quantity: true, unit: true } }`; cada registro devuelve `productos: e.consumptions.map((c) => ({ materialName: c.materialName, batchLabel: c.batchLabel, quantity: c.quantity?.toString() ?? null, unit: c.unit }))`. **`rutinasDeEquipo` también** incluye `consumptions` y devuelve `productos`, para que `RutinaConEstado` sea un solo tipo.
  8. `vencidasPorLugar` — misma forma que `vencidasPorEquipo`, con `locationId`, `alta: createdAt` del lugar y visibilidad memoizada con `puedeSobreLugar(…, "view")`.

- [ ] **Step 5: Correr.** `npx vitest run tests/rutinas/` → PASS; las de `rutinas.test.ts` (equipos) **siguen** en verde con su mismo número. El test viejo que esperaba `instalaciones_pendiente`, si existe (`git grep -n instalaciones_pendiente -- tests`), se cambia por el caso `lugar_sin_rutinas` de arriba — decirlo en el commit.

- [ ] **Step 6: Typecheck, carril, commit.** `npm run typecheck` → 0. Test a `base-sembrada`.

```bash
git add lib/rutinas/error.ts lib/rutinas/lugares.ts lib/rutinas/rutinas.ts tests/rutinas/rutinasDeLugar.test.ts scripts/pruebas-por-compuerta.txt
git commit -F msg.txt   # «rutinas de lugar: permisos en el lugar e insumos al apuntar»
```

- [ ] **Step 7: Flip-test contra el commit** (tres, una a una, con su sha y el test caído por su nombre):
  1. En `puedeSobreLugar`, cambiar `"edit_beneficio"` por `"manage_attributes"` → cae **«el operario no define»**.
  2. En `registrarRealizada`, dentro del bucle, cambiar `crearConsumoEnTx(tx, …)` por `prisma.$transaction((t2) => crearConsumoEnTx(t2, …))` —cada consumo en su propia transacción— → cae **«si el segundo falla (unidad distinta), no queda NADA»** (el primero ya confirmado queda y la cuenta de `consumableStockEvent` sube).
  3. Quitar el `throw new RutinaError("insumo_ajeno")` → cae **«un insumo de otra organización: insumo_ajeno»**.

---

### Task 5: Acciones y la tarjeta

**Files:**
- Modify: `app/actions/rutinas.ts`
- Modify: `app/components/rutinas/TarjetaDeRutina.tsx`
- Create: `app/components/rutinas/RutinasDeLugar.tsx`
- Modify: `messages/es.json`, `messages/en.json` (namespace `Equipos`)

**Interfaces:**
- Consumes: `rutinasDeLugar`, `rutaDeLugar`, `lugarParaRutina`, `puedeSobreLugar`, `insumosDeLugar`, `equiposAqui` (Task 4); `getObserverCandidates` de `lib/traceability/lots`.
- Produces: `RutinasDeLugar({ userAccountId, locationId }: { userAccountId: string; locationId: string }): Promise<JSX.Element>` — componente de servidor asíncrono.

- [ ] **Step 1: Destino por equipo o por lugar.** En `app/actions/rutinas.ts`, añadir y usar en las cinco acciones en lugar de `/equipos/${equipmentId}`:

```ts
/** A dónde vuelve: la ficha del equipo, o la pantalla del lugar (spec 2026-09-19 §5). */
async function volverA(f: FormData): Promise<string> {
  const equipmentId = String(f.get("equipmentId") ?? "");
  if (equipmentId) return `/equipos/${equipmentId}`;
  const locationId = String(f.get("locationId") ?? "");
  const l = await prisma.location.findUnique({ where: { id: locationId }, select: { id: true, locationType: true, parentLocationId: true } });
  return l ? rutaDeLugar(l) : "/instalaciones";
}
```

  Cada acción calcula `const base = await volverA(formData);` al principio, hace `revalidatePath(base)` además de los que ya hace, y redirige a `${base}?ok=…` / `${base}?error=…`. `crearRutinaFormAction` pasa `locationId: String(formData.get("locationId") ?? "") || null` junto a `equipmentId: … || null`. **Un `?` si `base` ya lleva uno**: no ocurre con estas rutas; no añadir lógica para ello.

- [ ] **Step 2: Insumos del formulario** en `registrarRealizadaFormAction`:

```ts
/** Filas `insumo_i_lote`, `insumo_i_cantidad`, `insumo_i_unidad`; vacío = sin cantidad, nunca 0. */
function insumosDelFormulario(f: FormData) {
  const salida: { consumableLotId: string; quantity: number | null; unit: string | null }[] = [];
  for (let i = 0; i < 3; i++) {
    const lote = String(f.get(`insumo_${i}_lote`) ?? "");
    if (!lote) continue;
    const texto = String(f.get(`insumo_${i}_cantidad`) ?? "").trim();
    const quantity = texto === "" ? null : Number(texto);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) throw new RutinaError("cantidad_invalida");
    const unit = String(f.get(`insumo_${i}_unidad`) ?? "").trim() || null;
    if (quantity !== null && unit === null) throw new RutinaError("unidad_obligatoria");
    salida.push({ consumableLotId: lote, quantity, unit });
  }
  return salida;
}
```

  y `insumos: insumosDelFormulario(formData)` en la llamada. La acción atrapa además `MaterialConsumptionValidationError` (la «unidad distinta» de `operations.ts`) y la convierte en `?error=unidad_distinta`.

- [ ] **Step 3: La tarjeta.** `TarjetaDeRutina` gana la prop opcional `insumos?: { id: string; etiqueta: string }[]`. Dentro del formulario de registrar, si `insumos?.length`, tres filas:

```tsx
{insumos?.length ? (
  <fieldset>
    <legend>{t("rutinaInsumos")}</legend>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ display: "flex", gap: "0.5rem" }}>
        <select name={`insumo_${i}_lote`} defaultValue="">
          <option value="">{t("rutinaSinInsumo")}</option>
          {insumos.map((x) => (
            <option key={x.id} value={x.id}>{x.etiqueta}</option>
          ))}
        </select>
        <CampoNumerico name={`insumo_${i}_cantidad`} min={0} step="any" placeholder={t("rutinaCantidad")} />
        <input type="text" name={`insumo_${i}_unidad`} maxLength={20} placeholder={t("rutinaUnidad")} />
      </div>
    ))}
  </fieldset>
) : null}
```

  y en el historial, tras la nota de cada registro: `{r.productos.length ? ` — ${r.productos.map((p) => p.quantity ? `${p.materialName} ${p.quantity} ${p.unit ?? ""}` : p.materialName).join(", ")}` : rutina.kind === "fumigacion" ? ` — ${t("rutinaProductoSinDeclarar")}` : ""}`.

- [ ] **Step 4: `RutinasDeLugar.tsx`:**

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { crearRutinaFormAction } from "../../actions/rutinas";
import { BotonDeEnvio } from "../BotonDeEnvio";
import { CampoNumerico } from "../CampoNumerico";
import { TarjetaDeRutina } from "./TarjetaDeRutina";
import { rutinasDeLugar } from "../../../lib/rutinas/rutinas";
import { equiposAqui, insumosDeLugar, puedeSobreLugar } from "../../../lib/rutinas/lugares";
import { getObserverCandidates } from "../../../lib/traceability/lots";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";
import { prisma } from "../../../lib/db";

/**
 * Rutinas de un lugar y los equipos que hay en él (spec 2026-09-19 §5). Un solo
 * bloque para `/bodegas/[id]`, `/instalaciones/[id]` y `/beneficio`, que así
 * sólo AÑADEN una línea —lo que evita chocar con `secado-2a`—.
 */
export async function RutinasDeLugar({ userAccountId, locationId }: { userAccountId: string; locationId: string }) {
  const [t, lugar, puedeVer, puedeGestionar, puedeApuntar] = await Promise.all([
    getTranslations("Equipos"),
    prisma.location.findUniqueOrThrow({ where: { id: locationId }, select: { timezone: true } }),
    puedeSobreLugar(userAccountId, locationId, "view"),
    puedeSobreLugar(userAccountId, locationId, "manage"),
    puedeSobreLugar(userAccountId, locationId, "report_condition"),
  ]);
  if (!puedeVer) return null;
  const hoy = diaDeHoy(new Date(), lugar.timezone ?? null);
  const [rutinas, insumos, equipos, observadores] = await Promise.all([
    rutinasDeLugar(userAccountId, locationId, hoy),
    insumosDeLugar(userAccountId, locationId),
    equiposAqui(userAccountId, locationId),
    getObserverCandidates(userAccountId),
  ]);
  const personas = observadores.people.map((p) => ({ id: p.id, name: p.displayName }));
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2>{t("rutinas")}</h2>
      <p className="nn-muted">{t("rutinasDeLugarIntro")}</p>
      {rutinas.map((r) => (
        <TarjetaDeRutina
          key={r.id}
          rutina={r}
          puedeGestionar={puedeGestionar}
          puedeApuntar={puedeApuntar}
          camposOcultos={{ locationId }}
          personas={personas}
          insumos={insumos}
          t={t}
        />
      ))}
      {puedeGestionar ? (
        <details>
          <summary>{t("rutinaAnadir")}</summary>
          <form action={crearRutinaFormAction}>
            <input type="hidden" name="locationId" value={locationId} />
            <label>
              {t("rutinaTipo")}
              <select name="kind" defaultValue="limpieza">
                {(["limpieza", "fumigacion", "mantenimiento", "otra"] as const).map((k) => (
                  <option key={k} value={k}>{t(`rutina_${k}`)}</option>
                ))}
              </select>
            </label>
            <label>{t("rutinaNota")}<input type="text" name="kindNote" maxLength={120} /></label>
            <label>{t("rutinaDias")}<CampoNumerico name="intervalDays" min={1} step={1} required /></label>
            <label>{t("rutinaInstrucciones")}<textarea name="instructions" rows={2} /></label>
            <BotonDeEnvio>{t("rutinaAnadir")}</BotonDeEnvio>
          </form>
        </details>
      ) : null}
      <h2>{t("equiposAqui")}</h2>
      {equipos.length === 0 ? <p className="nn-muted">{t("sinEquiposAqui")}</p> : (
        <ul>{equipos.map((e) => <li key={e.id}><Link href={`/equipos/${e.id}`}>{e.name}</Link></li>)}</ul>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Mensajes** en `Equipos` (es / en): `rutinasDeLugarIntro` («Qué se le hace a este lugar y cada cuánto. Avisa cuando toca; no bloquea nada.» / «What gets done to this place and how often. It warns when due; it blocks nothing.»), `rutinaInsumos` («Productos usados» / «Products used»), `rutinaSinInsumo` («—»), `rutinaCantidad` («cantidad» / «quantity»), `rutinaUnidad` («unidad» / «unit»), `rutinaProductoSinDeclarar` («producto sin declarar» / «product not declared»), `equiposAqui` («Equipos aquí» / «Equipment here»), `sinEquiposAqui` («Ningún equipo está aquí ahora.» / «No equipment is here right now.»), y los errores `errorLugarSinRutinas`, `errorInsumoAjeno`, `errorUnidadDistinta`, `errorCantidadInvalida`. Las dos lenguas con las mismas claves (`tests/` ya lo vigila; si falla, añadir la que falte).

- [ ] **Step 6: La ficha de equipo no cambia de comportamiento.** `npx vitest run tests/equipos tests/rutinas` → verde; `npm run typecheck` → 0; `npm run lint` → 0.

- [ ] **Step 7: Commit.**

```bash
git add app/actions/rutinas.ts app/components/rutinas/TarjetaDeRutina.tsx app/components/rutinas/RutinasDeLugar.tsx messages/es.json messages/en.json
git commit -F msg.txt   # «rutinas de lugar: acciones, productos en la tarjeta y el bloque del lugar»
```

---

### Task 6: Las pantallas

**Files:**
- Create: `app/actions/bodegas.ts`, `app/bodegas/page.tsx`, `app/bodegas/nueva/page.tsx`, `app/bodegas/[id]/page.tsx`
- Modify (sólo añadir): `app/instalaciones/page.tsx`, `app/instalaciones/[id]/page.tsx`, `app/beneficio/page.tsx`
- Modify: `messages/es.json`, `messages/en.json` (namespace `Bodegas`)

- [ ] **Step 1: La acción** — `app/actions/bodegas.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import { BodegaError, crearBodega } from "../../lib/traceability/bodegas";
import { LocationAccessError } from "../../lib/traceability/locations";

/** Misma forma que `app/actions/rutinas.ts`: un solo `redirect`, fuera del `catch`. */
export async function crearBodegaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let destino: string;
  try {
    const b = await crearBodega(user.userAccountId, {
      parentLocationId: String(formData.get("parentLocationId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/bodegas");
    destino = `/bodegas/${b.id}?ok=creada`;
  } catch (error) {
    if (error instanceof BodegaError) destino = `/bodegas/nueva?error=${encodeURIComponent(error.message)}`;
    else if (error instanceof LocationAccessError) destino = "/bodegas/nueva?error=sin_acceso";
    else throw error;
  }
  redirect(destino);
}
```

- [ ] **Step 2: `/bodegas`** — lista con `listarBodegas` y, para cada una, `vencidasPorLugar(user, ids, diaDeHoy(new Date(), null))`; `?vencidas=1` filtra las que tienen alguna. Enlace a `/bodegas/nueva`. Mismo esqueleto que `app/instalaciones/page.tsx` (`getCurrentUser`, `redirect("/login")`, `export const dynamic = "force-dynamic"`). Cada fila: `{padre?.name ?? t("padreNoVisible")} → <Link href={`/bodegas/${b.id}`}>{b.name}</Link>` y, si `n > 0`, `<strong>{tEq("rutinasVencidas", { n })}</strong>`.

- [ ] **Step 3: `/bodegas/nueva`** — `padresParaBodega`; si vacía, `t("sinPermiso")`; si no, formulario `action={crearBodegaFormAction}` con `<select name="parentLocationId" required>` (opción `«{name} · {t(`tipo_${tipo}`)}»`) e `<input name="name" required maxLength={120} />`. Muestra `?error=` filtrado por `/^[a-z_]+$/` con `t(`error_${codigo}`)`.

- [ ] **Step 4: `/bodegas/[id]`** — `detalleBodega` (con `BodegaError` → `notFound()`, `LocationAccessError` → aviso de sin acceso), título, padre, `?ok=`/`?error=` como en `app/equipos/[id]/page.tsx`, y `<RutinasDeLugar userAccountId={user.userAccountId} locationId={id} />`.

- [ ] **Step 5: Añadir al final** — en `app/instalaciones/[id]/page.tsx`, antes del último `</div>`: `<RutinasDeLugar userAccountId={user.userAccountId} locationId={id} />` (+ su import) y, para cada cama del bucle ya existente, **no** tocar su `<section>`: las rutinas de cada cama se ven en su propia fila añadiendo tras la lista de camas `{instalacion.camas.map((c) => <RutinasDeLugar key={`r-${c.id}`} userAccountId={user.userAccountId} locationId={c.id} />)}`. En `app/instalaciones/page.tsx`, junto a `crearInstalacion`: ` · <Link href="/bodegas">{t("bodegas")}</Link>`. En `app/beneficio/page.tsx`, al final del contenido del beneficio elegido (buscar dónde se pinta su id): `<RutinasDeLugar userAccountId={user.userAccountId} locationId={<id del beneficio>} />`. Si `/beneficio` pinta varios beneficios, uno por cada uno.

- [ ] **Step 6: Mensajes** `Bodegas` (es/en): `titulo`, `intro`, `nueva`, `padre`, `nombre`, `crear`, `padreNoVisible`, `sinPermiso`, `sinBodegas`, `tipo_site` («finca»), `tipo_beneficio` («beneficio»), `error_datos_invalidos`, `error_padre_invalido`, `error_nombre_repetido`, `error_sin_acceso`, `creada`, `soloVencidas`; y `Secado.bodegas` («Bodegas» / «Storage»).

- [ ] **Step 7: Compuertas.** `npm run typecheck`, `npm run lint`, `npm run build` → 0 los tres, y la tabla de rutas del build lista `/bodegas`, `/bodegas/nueva`, `/bodegas/[id]`. `node scripts/inventario-de-rutas.mjs` (`npm run check:rutas`) → 0; si pide declarar las rutas nuevas en `scripts/rutas-declaradas.mjs`, declararlas.

- [ ] **Step 8: Commit.**

```bash
git add app/actions/bodegas.ts app/bodegas/page.tsx app/bodegas/nueva/page.tsx "app/bodegas/[id]/page.tsx" app/instalaciones/page.tsx "app/instalaciones/[id]/page.tsx" app/beneficio/page.tsx messages/es.json messages/en.json
git commit -F msg.txt   # «bodegas: pantallas; rutinas en instalaciones, camas y beneficio»
```

(Añadir `scripts/rutas-declaradas.mjs` sólo si el Step 7 lo exigió.)

---

### Task 7: Almacenar: bodegas primero

**Files:**
- Modify: `lib/traceability/lots.ts` (`getManageableContext`: cada ubicación lleva `locationType`)
- Modify: `app/components/traceability/StorageForm.tsx`
- Test: `tests/traceability/bodegasPrimero.test.ts` (hermética)

**Interfaces:**
- Produces: `ordenarParaAlmacenar<T extends { locationType: string; name: string }>(ls: T[]): { bodegas: T[]; otros: T[] }` en `lib/traceability/bodegas.ts`.

- [ ] **Step 1: Prueba que falla** — `tests/traceability/bodegasPrimero.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ordenarParaAlmacenar } from "../../lib/traceability/bodegas";

describe("almacenar: bodegas primero, nada deja de ser elegible", () => {
  it("separa bodegas del resto y no pierde ninguna", () => {
    const ls = [
      { id: "1", name: "Parcela", locationType: "plot" },
      { id: "2", name: "Bodega B", locationType: "storage_facility" },
      { id: "3", name: "Cama vieja", locationType: "drying_bed" },
      { id: "4", name: "Bodega A", locationType: "storage_facility" },
    ];
    const { bodegas, otros } = ordenarParaAlmacenar(ls);
    expect(bodegas.map((b) => b.id)).toEqual(["4", "2"]);
    expect(otros.map((o) => o.id)).toEqual(["3", "1"]);
    expect(bodegas.length + otros.length).toBe(ls.length);
  });
});
```

- [ ] **Step 2: Falla** (función no exportada). **Step 3: Implementar** en `bodegas.ts`:

```ts
/** El formulario de almacenar: bodegas arriba, lo demás debajo; ninguno se pierde (spec §4.1). */
export function ordenarParaAlmacenar<T extends { locationType: string; name: string }>(ls: T[]) {
  const porNombre = (a: T, b: T) => a.name.localeCompare(b.name, "es");
  return {
    bodegas: ls.filter((l) => l.locationType === "storage_facility").sort(porNombre),
    otros: ls.filter((l) => l.locationType !== "storage_facility").sort(porNombre),
  };
}
```

(`bodegas.ts` importa `prisma`: si la prueba hermética no puede cargarlo sin base, mover `ordenarParaAlmacenar` a `lib/traceability/ordenarParaAlmacenar.ts` sin imports y reexportarla desde `bodegas.ts`.)

- [ ] **Step 4: El formulario.** `LocationOption` gana `locationType: string`; `getManageableContext` ya lee `location.findMany` completo, así que sólo hay que dejar pasar el campo si hay un `select`/`map` que lo quite. En `StorageForm`:

```tsx
const { bodegas, otros } = ordenarParaAlmacenar(locations);
const opcion = (loc: LocationOption) => (
  <option key={loc.id} value={loc.id}>{loc.organization ? `${loc.name} (${loc.organization.name})` : loc.name}</option>
);
// …
<select id="s-locationId" name="locationId" required>
  {bodegas.length ? <optgroup label={t("storageGroupBodegas")}>{bodegas.map(opcion)}</optgroup> : null}
  <optgroup label={t("storageGroupOtros")}>{otros.map(opcion)}</optgroup>
</select>
```

(Importar `ordenarParaAlmacenar` desde el archivo sin `prisma`: `StorageForm` es `"use client"` y el guardia `cliente-sin-prisma` lo vigila.) Mensajes `Traceability.storageGroupBodegas` («Bodegas» / «Storage rooms») y `storageGroupOtros` («Otros lugares» / «Other places»).

- [ ] **Step 5: Correr.** `npx vitest run tests/traceability/bodegasPrimero.test.ts tests/arquitectura/cliente-sin-prisma.test.ts` → PASS. `npm run typecheck` → 0. `bash scripts/ci.sh` → 0 y **sí** incluye `bodegasPrimero` (es hermética).

- [ ] **Step 6: Commit.**

```bash
git add lib/traceability/bodegas.ts lib/traceability/ordenarParaAlmacenar.ts lib/traceability/lots.ts app/components/traceability/StorageForm.tsx tests/traceability/bodegasPrimero.test.ts messages/es.json messages/en.json
git commit -F msg.txt   # «almacenar: bodegas primero, el resto sigue elegible»
```

(`ordenarParaAlmacenar.ts` sólo si se creó.)

---

### Task 8: Registro, guardias de la casa, verificación y revisión

**Files:**
- Modify: `docs/architecture/DECISIONS.md`, `docs/arquitectura/inventario-de-acceso.md`, `docs/architecture/EQUIPMENT_AND_READINESS.md` (§10, una nota), `acceso-a-datos.allowlist.json` si el guardia lo pide

- [ ] **Step 1: ADR.** Número = el siguiente libre **en `origin/main` al fusionar** (`git fetch && git grep -h '^## ADR-' origin/main -- docs/architecture/DECISIONS.md | tail -3`; `numeros-de-adr-unicos` lo vigila). Título: **«Rutinas de lugar y la bodega»**. Contenido: la bodega como `storage_facility` bajo `beneficio`/`site` (disparador), qué lugares llevan rutina y por qué la posición de un estante no, los permisos (gestión `edit_beneficio`, faena `equipment:report_condition` en el lugar, y por qué no un permiso nuevo), el insumo como consumo con `careRoutineEventId` por `crearConsumoEnTx`, el CHECK de un solo padre con su medición, y que anular una vez no deshace sus consumos.

- [ ] **Step 2: Guardias de acceso.** `npx vitest run tests/arquitectura/acceso-a-datos.test.ts tests/arquitectura/cifras-del-inventario.test.ts tests/arquitectura/audit-atomico.test.ts tests/arquitectura/vocabulario-de-audit.test.ts tests/arquitectura/catalogos-con-contrato.test.ts`. Si `cifras-del-inventario` falla, regenerar con `node scripts/inventario-de-acceso.mjs` y copiar **las cifras que imprime** (total, archivos, guardia directo) al documento con una nota de dónde salen — nunca sumar a mano. Si `acceso-a-datos` pide declarar un archivo nuevo en la lista, declararlo con el motivo.

- [ ] **Step 3: Compuerta entera** sobre el árbol final, sin tubería antes de leer el código de salida:

```bash
npm run typecheck; echo "typecheck=$?"
npm run lint; echo "lint=$?"
npm run build > /tmp/build.txt 2>&1; echo "build=$?"
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci=$?"
```

y el carril con base sobre la base propia (`scripts/ci-con-base.sh` o `npx vitest run` de los archivos `base-sembrada` nuevos + `tests/rutinas tests/equipos tests/traceability/operations*`), contando filas `TEST` de las tablas tocadas **antes y después**: deben coincidir.

- [ ] **Step 4: Navegador**, app local contra la base propia (**nunca** `nectar_test`), entrando Daniel con su cuenta —no se teclean contraseñas—: crear una bodega bajo el beneficio; definir «fumigación cada 30 días»; apuntar una con fecha de hace 40 días y dos productos (uno con 2 kg, otro sin cantidad); leer «vencida hace 10 días»; ver en `/inventario` que el saldo del primero bajó 2 kg y el del segundo no; mover un lote a almacenamiento y ver «Bodegas» arriba y un lugar viejo en «Otros lugares»; abrir una instalación y ver sus rutinas y «Equipos aquí».

- [ ] **Step 5: Revisión final**, en paralelo: un revisor Claude (modelo barato) con el diff `origin/main...HEAD` y el spec, y **Codex**:

```bash
/Applications/ChatGPT.app/Contents/Resources/codex exec "Revisa este diff contra el spec docs/superpowers/specs/2026-09-19-rutinas-de-instalaciones-y-bodega-design.md: permisos por lugar, atomicidad de consumos, el CHECK de un solo padre, lecturas entre organizaciones."
```

Cada hallazgo se verifica midiendo antes de arreglarlo; lo arreglado lleva su prueba.

- [ ] **Step 6: Commit, push y PR.** `git diff --name-only origin/main...HEAD` (tres puntos) y contar los archivos contra el mapa de arriba; `git push -u origin <rama>`; `git rev-parse HEAD` = `git rev-parse @{u}`; PR con lo verificado y lo asumido, y **sin fusionar**: fusionar lo decide Daniel.
