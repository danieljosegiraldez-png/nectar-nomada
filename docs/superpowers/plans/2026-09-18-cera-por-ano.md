# La cera con el color de su año — Plan de implementación (rebanada 2a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la ficha del apiario diga, para cada año de cera, su color, cuántos marcos entraron y salieron, su edad y si toca revisarla (2 años) o renovarla (4), y que se pueda anotar la cera nueva que entra y los marcos que se sacan.

**Architecture:** El color no se guarda: lo calcula `colorDelAño(año)`, una función pura con el código internacional de las reinas. Se guardan dos hechos: cada entrada de cera nueva (`apiary.new_wax_entry`, su día decide el año) y cada salida de marcos (`apiary.frame_removal`, de un año de color). La leyenda los agrega por año.

**Tech Stack:** Next.js App Router (server actions), Prisma 7 + PostgreSQL, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md` §5.1–§5.3, y §7.1 (umbrales contestados: 2 y 4 años, iguales para cámara y alza).

## Global Constraints

- Node fuera del PATH: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- Base local: `export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"; export SHADOW_DATABASE_URL="${DATABASE_URL%%\?*}_shadow"` en cada orden que la toque. Si todas las de permisos fallan a la vez: `npm run db:seed`.
- Toda escritura con su `AuditEvent` en la misma transacción. FK a personas y a colmenas: `onDelete: Restrict`.
- Cada regla que importa, también en la base (CHECK), con sonda y control «lo válido entra».
- `git add` archivo por archivo; `git commit -F`; compuertas encadenadas, nunca canalizadas; commitear antes de los flip-tests.
- Un campo de día (`type="date"`) se lee con `fechaDeDia` (`lib/time/localDateTime.ts`), nunca con `new Date(...)` a mano.
- Números del formulario con `CampoNumerico`. Mensajes en `messages/es.json` y `messages/en.json`, espacio `Apiary`.

## Decisiones tomadas al planear

1. **Fuera de esta rebanada: «marcos negros: N» en la inspección (spec §5.3, segundo punto).** La inspección se guarda también sin conexión (`lib/sync/pushFieldEvents.ts`), así que un campo nuevo toca el formulario, la cola, la sincronización y el servicio. Va en la rebanada 2b.
2. **Los umbrales viven en una sola constante** (`UMBRALES_DE_CERA = { revisar: 2, renovar: 4 }`), para cambiarlos en un sitio. Daniel dijo «2-4 years»; leerlo como dos avisos es interpretación anotada en el spec §7.1.
3. **La edad es por año de calendario**, `añoDeHoy - añoDeLaCera`, en UTC. Una cera de diciembre de 2025 tiene «1 año» en enero de 2026. Es lo que el color puede decir: el color es del año, no del día.
4. **No se impide sacar más marcos de un año de los que se anotaron entrando** (spec §5.2): los marcos anteriores a este registro no tienen entrada. La leyenda lo dice en vez de negarlo.
5. **La base sí impide sacar marcos de un año que todavía no ha llegado**: `wax_year <= año de removed_at`. Un marco de 2027 no se saca en 2026.
6. **La leyenda enseña siempre el año en curso**, aunque no tenga entradas: es el color que toca poner hoy.

---

### Task 1: El color del año y los avisos — módulo puro

**Files:**
- Create: `lib/apiary/colorDelAno.ts`
- Test: `tests/apiary/colorDelAno.test.ts` (hermética: sin base; entra sola en el carril sin base)

**Interfaces:**
- Produces:
  - `type ColorDeAño = "blanco" | "amarillo" | "rojo" | "verde" | "azul"`
  - `colorDelAño(año: number): ColorDeAño` — lanza `RangeError("año_invalido")` si no es un entero.
  - `UMBRALES_DE_CERA: { readonly revisar: 2; readonly renovar: 4 }`
  - `type AvisoDeCera = "revisar" | "renovar" | null`
  - `avisoDeCera(edad: number): AvisoDeCera`

- [ ] **Step 1: La prueba**

```ts
/**
 * El color del año — spec 2026-09-18 §5.1. Hermética: función pura, sin base.
 *
 * El caso que la hace guardia de verdad es el de los DIEZ finales: un error de un lugar en el
 * módulo (año % 5 sin el desplazamiento) da blanco para 2025 y pasa en la mitad de los casos.
 */
import { describe, expect, it } from "vitest";
import { avisoDeCera, colorDelAño, UMBRALES_DE_CERA } from "../../lib/apiary/colorDelAno";

describe("el color del año, el código de las reinas", () => {
  it("cada final de año tiene su color, y se repite cada cinco", () => {
    const esperados: Record<number, string> = {
      2021: "blanco", 2026: "blanco",
      2022: "amarillo", 2027: "amarillo",
      2023: "rojo", 2028: "rojo",
      2024: "verde", 2029: "verde",
      2025: "azul", 2030: "azul",
    };
    for (const [año, color] of Object.entries(esperados)) expect([año, colorDelAño(Number(año))]).toEqual([año, color]);
    expect(colorDelAño(1996)).toBe("blanco");
    expect(colorDelAño(2000)).toBe("azul");
  });

  it("un año que no es un entero no tiene color", () => {
    expect(() => colorDelAño(2026.5)).toThrow(/año_invalido/);
    expect(() => colorDelAño(Number.NaN)).toThrow(/año_invalido/);
  });

  it("LOS AVISOS: nada antes de 2 años, revisar desde 2, renovar desde 4", () => {
    expect(UMBRALES_DE_CERA).toEqual({ revisar: 2, renovar: 4 });
    expect([0, 1, 2, 3, 4, 7].map(avisoDeCera)).toEqual([null, null, "revisar", "revisar", "renovar", "renovar"]);
  });
});
```

- [ ] **Step 2: Verla fallar** — `npx vitest run tests/apiary/colorDelAno.test.ts` → no carga (`Cannot find module`).

- [ ] **Step 3: El módulo**

```ts
/**
 * El color del año — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §5.1.
 *
 * Daniel, 2026-09-18: «todas las abejas reinas nacidas ese año reciben ese apodo y color y toda la
 * cera nueva de ese año que entra como marco en alza o cámara de cría recibe esa marca color». Es
 * el código internacional de las reinas, y se repite cada cinco años. **Nadie elige el color: se
 * calcula del año.** Módulo puro, sin base: lo usan el servicio y la pantalla.
 */

export type ColorDeAño = "blanco" | "amarillo" | "rojo" | "verde" | "azul";

/** Por el último dígito del año: 1 y 6 blanco, 2 y 7 amarillo, 3 y 8 rojo, 4 y 9 verde, 5 y 0 azul. */
const POR_RESTO: readonly ColorDeAño[] = ["azul", "blanco", "amarillo", "rojo", "verde"];

export function colorDelAño(año: number): ColorDeAño {
  if (!Number.isInteger(año)) throw new RangeError("año_invalido");
  return POR_RESTO[((año % 5) + 5) % 5];
}

/**
 * Cuándo avisar — spec §7.1, contestada por Daniel («2-4 years»): a los 2 años, revisar esa cera;
 * a los 4, ya debería estar renovada. Igual para cámara de cría y alza. Una sola constante para
 * cambiarlo en un sitio.
 */
export const UMBRALES_DE_CERA = { revisar: 2, renovar: 4 } as const;

export type AvisoDeCera = "revisar" | "renovar" | null;

export function avisoDeCera(edad: number): AvisoDeCera {
  if (edad >= UMBRALES_DE_CERA.renovar) return "renovar";
  if (edad >= UMBRALES_DE_CERA.revisar) return "revisar";
  return null;
}
```

- [ ] **Step 4: Verla pasar** — `npx vitest run tests/apiary/colorDelAno.test.ts` → 3 passed.

- [ ] **Step 5: Commit** — `git add lib/apiary/colorDelAno.ts tests/apiary/colorDelAno.test.ts` · «cera: el color del año y los dos avisos, en un módulo puro».

---

### Task 2: Esquema, migración y las reglas en la base

**Files:**
- Modify: `prisma/schema.prisma` (dos modelos y tres enums debajo de `model ApiaryHarvestSuper`; relaciones inversas en `Organization`, `UserAccount`, `Hive`)
- Create: `prisma/migrations/<marca posterior a la última de origin/main>_cera_por_ano/migration.sql`
- Create: `tests/apiary/cera.test.ts`
- Modify: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`, debajo de `tests/apiary/alzas.test.ts`)

**Interfaces:**
- Produces: `prisma.newWaxEntry`, `prisma.frameRemoval`; enums `WaxKind`, `WaxDestination`, `FrameRemovalReason`. Restricciones: `new_wax_entry_marcos_positivos`, `new_wax_entry_otro_con_nota`, `frame_removal_marcos_positivos`, `frame_removal_otro_con_nota`, `frame_removal_ano_ya_llegado`.

- [ ] **Step 1: El esquema**

```prisma
/// Cera nueva que entra — spec 2026-09-18 §5.2. El DÍA decide el año, y el año el color
/// (`colorDelAño`): el color no se guarda. Una fila por entrada, no por marco.
model NewWaxEntry {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])

  /// El día (medianoche UTC, de un `type="date"`). Su año es el color.
  enteredAt DateTime @map("entered_at")
  /// Cuántos marcos. Positivo (CHECK).
  frameCount Int @map("frame_count")
  /// A dónde fueron, si se dice.
  destination WaxDestination?
  waxKind     WaxKind         @map("wax_kind")
  /// La colmena, si entró directo a una. RESTRICT.
  hiveId String? @map("hive_id") @db.Uuid
  hive   Hive?   @relation(fields: [hiveId], references: [id], onDelete: Restrict)
  /// Procedencia y lo que no cabe; obligatoria con `otro` (CHECK).
  notes String?

  provenanceClass ProvenanceClass @map("provenance_class")
  createdAt       DateTime        @default(now()) @map("created_at")
  createdBy       String?         @map("created_by") @db.Uuid
  creator         UserAccount?    @relation("NewWaxEntryCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([organizationId, enteredAt])
  @@map("new_wax_entry")
  @@schema("apiary")
}

/// Marcos que se sacan, de un año de color — spec §5.2. Opcional: si nadie lo anota, el marco
/// sigue diciendo su año con su color. **No** se limita a lo que se anotó entrando: los marcos de
/// antes de este registro no tienen entrada.
model FrameRemoval {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])

  /// El año del color de los marcos sacados. No posterior al año de `removedAt` (CHECK).
  waxYear    Int                @map("wax_year")
  removedAt  DateTime           @map("removed_at")
  frameCount Int                @map("frame_count")
  reason     FrameRemovalReason
  notes      String?

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("FrameRemovalCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)

  @@index([organizationId, waxYear])
  @@map("frame_removal")
  @@schema("apiary")
}

/// Vocabulario cerrado con escape, como el de alimentación: «que no sea campo libre».
enum WaxKind {
  lamina_estampada_propia
  lamina_comprada
  sin_lamina
  otro

  @@schema("apiary")
}

enum WaxDestination {
  camara_de_cria
  alza

  @@schema("apiary")
}

enum FrameRemovalReason {
  cera_vieja
  danado
  enfermedad
  otro

  @@schema("apiary")
}
```

Relaciones inversas: `Organization` → `newWaxEntries NewWaxEntry[]` y `frameRemovals FrameRemoval[]`; `UserAccount` → `newWaxEntriesCreated NewWaxEntry[] @relation("NewWaxEntryCreatedBy")` y `frameRemovalsCreated FrameRemoval[] @relation("FrameRemovalCreatedBy")`; `Hive` → `newWaxEntries NewWaxEntry[]`.

- [ ] **Step 2: Migración generada + reglas a mano**, con el mismo procedimiento que la de alzas (`migrate diff --from-migrations … --to-schema … --script`), y al final:

```sql
-- Una entrada o una salida de cero marcos no dice nada.
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_marcos_positivos" CHECK ("frame_count" > 0);
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_marcos_positivos" CHECK ("frame_count" > 0);

-- «Otro» sin nota no dice qué fue.
ALTER TABLE "apiary"."new_wax_entry" ADD CONSTRAINT "new_wax_entry_otro_con_nota"
  CHECK ("wax_kind" <> 'otro' OR btrim(coalesce("notes", '')) <> '');
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_otro_con_nota"
  CHECK ("reason" <> 'otro' OR btrim(coalesce("notes", '')) <> '');

-- Un marco de un año que no ha llegado no se saca. Y un año razonable: no hay cera de antes de 1990.
ALTER TABLE "apiary"."frame_removal" ADD CONSTRAINT "frame_removal_ano_ya_llegado"
  CHECK ("wax_year" >= 1990 AND "wax_year" <= extract(year FROM "removed_at")::int);
```

Aplicar (`migrate deploy`, `generate`), deriva 0, control positivo (`migrate diff --from-empty … | grep -c new_wax_entry` distinto de 0).

- [ ] **Step 3: La prueba de las reglas** — `tests/apiary/cera.test.ts`, con el mismo andamiaje que `tests/apiary/alzas.test.ts` (organización, `crearApiario`, admin de plataforma, un `Farm Operator` del apiario y otro de un apiario ajeno; `afterEach` borra `newWaxEntry`, `frameRemoval` y sus `AuditEvent` de las dos organizaciones; `afterAll` como allí) y la sonda:

```ts
describe("las reglas de la cera viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const entrada = (cuantos: number, tipo: string, nota: string | null) =>
      `INSERT INTO apiary.new_wax_entry (organization_id, entered_at, frame_count, wax_kind, notes, provenance_class)
       VALUES ('${organizationId}', now(), ${cuantos}, '${tipo}', ${nota === null ? "NULL" : `'${nota}'`}, 'direct_observation')`;
    expect(await sonda(entrada(10, "lamina_comprada", null))).toBe("entra");
    expect(await sonda(entrada(0, "lamina_comprada", null))).toBe("new_wax_entry_marcos_positivos");
    expect(await sonda(entrada(5, "otro", null))).toBe("new_wax_entry_otro_con_nota");
    expect(await sonda(entrada(5, "otro", "  "))).toBe("new_wax_entry_otro_con_nota");
    expect(await sonda(entrada(5, "otro", "de un vecino"))).toBe("entra");

    const salida = (año: string, cuando: string, cuantos: number, motivo: string, nota: string | null) =>
      `INSERT INTO apiary.frame_removal (organization_id, wax_year, removed_at, frame_count, reason, notes)
       VALUES ('${organizationId}', ${año}, ${cuando}, ${cuantos}, '${motivo}', ${nota === null ? "NULL" : `'${nota}'`})`;
    expect(await sonda(salida("2024", "'2026-05-01'", 3, "cera_vieja", null))).toBe("entra");
    expect(await sonda(salida("2026", "'2026-05-01'", 3, "cera_vieja", null))).toBe("entra");
    expect(await sonda(salida("2027", "'2026-05-01'", 3, "cera_vieja", null))).toBe("frame_removal_ano_ya_llegado");
    expect(await sonda(salida("1980", "'2026-05-01'", 3, "cera_vieja", null))).toBe("frame_removal_ano_ya_llegado");
    expect(await sonda(salida("2024", "'2026-05-01'", 0, "cera_vieja", null))).toBe("frame_removal_marcos_positivos");
    expect(await sonda(salida("2024", "'2026-05-01'", 3, "otro", null))).toBe("frame_removal_otro_con_nota");
  });
});
```

con `sonda` como en alzas, cambiando la expresión que reconoce la regla a `/(new_wax_entry|frame_removal)_[a-z_]+/`.

- [ ] **Step 4:** correrla (1 passed), añadirla a `scripts/pruebas-por-compuerta.txt`, `bash scripts/ci.sh` → 0 y la prueba ausente de su salida. **Commit:** esquema, migración, prueba, lista · «cera: entradas y salidas de marcos, con sus reglas en la base».

---

### Task 3: El servicio

**Files:**
- Create: `lib/apiary/cera.ts`
- Test: `tests/apiary/cera.test.ts`

**Interfaces:**
- Consumes: `colorDelAño`, `avisoDeCera`, `ColorDeAño`, `AvisoDeCera` (Task 1); `requireApiaryAccess`, `ApiaryAccessError` (`lib/apiary/hives.ts`); `recordAuditEvent` (`lib/audit.ts`).
- Produces:
  - `class CeraInvalida extends Error`
  - `TIPOS_DE_CERA`, `DESTINOS_DE_CERA`, `MOTIVOS_DE_SALIDA` (listas `readonly` de los enums, para el formulario)
  - `registrarCeraNueva(userAccountId: string, input: { locationId: string; enteredAt: Date; frameCount: number; waxKind: WaxKind; destination?: WaxDestination | null; hiveId?: string | null; notes?: string | null }): Promise<NewWaxEntry>`
  - `registrarSalidaDeMarcos(userAccountId: string, input: { locationId: string; waxYear: number; removedAt: Date; frameCount: number; reason: FrameRemovalReason; notes?: string | null }): Promise<FrameRemoval>`
  - `leyendaDeCera(userAccountId: string, locationId: string, hoy?: Date): Promise<FilaDeCera[]>` con `FilaDeCera = { año: number; color: ColorDeAño; entraron: number; salieron: number; edad: number; aviso: AvisoDeCera; salieronDeMas: boolean }`, del más nuevo al más viejo, siempre con el año en curso.

- [ ] **Step 1: Las pruebas**

```ts
import { colorDelAño } from "../../lib/apiary/colorDelAno";
import { leyendaDeCera, registrarCeraNueva, registrarSalidaDeMarcos } from "../../lib/apiary/cera";

const dia = (s: string) => new Date(`${s}T00:00:00Z`);

describe("la leyenda de la cera", () => {
  it("AGRUPA POR AÑO con su color, cuenta lo que entró y salió, y avisa por edad", async () => {
    await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2022-03-01"), frameCount: 20, waxKind: "lamina_comprada" });
    await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2024-06-10"), frameCount: 10, waxKind: "lamina_estampada_propia", destination: "alza" });
    await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2024-09-01"), frameCount: 5, waxKind: "sin_lamina" });
    await registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2022, removedAt: dia("2026-02-01"), frameCount: 8, reason: "cera_vieja" });
    const filas = await leyendaDeCera(operario, apiarioId, dia("2026-09-18"));
    expect(filas.map((f) => [f.año, f.color, f.entraron, f.salieron, f.edad, f.aviso])).toEqual([
      [2026, "blanco", 0, 0, 0, null],
      [2024, "verde", 15, 0, 2, "revisar"],
      [2022, "amarillo", 20, 8, 4, "renovar"],
    ]);
  });

  it("SALIERON MÁS DE LOS ANOTADOS se dice, no se impide", async () => {
    await registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2021, removedAt: dia("2026-01-10"), frameCount: 6, reason: "danado" });
    const [fila] = (await leyendaDeCera(operario, apiarioId, dia("2026-09-18"))).filter((f) => f.año === 2021);
    expect([fila.entraron, fila.salieron, fila.salieronDeMas, fila.color]).toEqual([0, 6, true, colorDelAño(2021)]);
  });

  it("CADA FINCA VE SU CERA: lo de otra organización no entra en la leyenda", async () => {
    await registrarCeraNueva(adminId, { locationId: apiarioAjeno, enteredAt: dia("2023-01-01"), frameCount: 99, waxKind: "lamina_comprada" });
    const filas = await leyendaDeCera(operario, apiarioId, dia("2026-09-18"));
    expect(filas.some((f) => f.año === 2023)).toBe(false);
  });

  it("LAS REGLAS DEL SERVICIO: otro con nota, colmena de la misma finca, permiso, y el año de la salida", async () => {
    await expect(registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 3, waxKind: "otro" })).rejects.toThrow(/otro_sin_nota/);
    await expect(registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 0, waxKind: "lamina_comprada" })).rejects.toThrow(/marcos_invalidos/);
    const ajena = await caja(apiarioAjeno);
    await expect(registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 3, waxKind: "lamina_comprada", hiveId: ajena })).rejects.toThrow(/colmena_de_otra_finca/);
    await expect(registrarCeraNueva(extrano, { locationId: apiarioId, enteredAt: dia("2026-01-01"), frameCount: 3, waxKind: "lamina_comprada" })).rejects.toThrow(/no_apiary_access/);
    await expect(registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2027, removedAt: dia("2026-05-01"), frameCount: 2, reason: "cera_vieja" })).rejects.toThrow(/ano_aun_no_llega/);
    await expect(leyendaDeCera(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
  });

  it("DEJA RASTRO: cada entrada y cada salida con su AuditEvent", async () => {
    const e = await registrarCeraNueva(operario, { locationId: apiarioId, enteredAt: dia("2026-04-01"), frameCount: 4, waxKind: "lamina_comprada" });
    const s = await registrarSalidaDeMarcos(operario, { locationId: apiarioId, waxYear: 2026, removedAt: dia("2026-05-01"), frameCount: 1, reason: "enfermedad" });
    const ops = await prisma.auditEvent.findMany({ where: { entityId: { in: [e.id, s.id] } }, select: { operation: true } });
    expect(ops.map((o) => o.operation).sort()).toEqual(["frame_removal.create", "new_wax_entry.create"]);
  });
});
```

(`caja(locationId)` como en `alzas.test.ts`, con su limpieza de `hivePlacement` y `hive` en `afterAll`.)

- [ ] **Step 2:** verlas fallar (no carga `lib/apiary/cera`).

- [ ] **Step 3: `lib/apiary/cera.ts`**

```ts
/**
 * La cera con el color de su año — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §5.
 *
 * **La edad de la cera va escrita en el propio marco, con el color de su año.** Aquí sólo se
 * anotan dos hechos —la cera nueva que entra y los marcos que se sacan— y la leyenda los junta por
 * año. Nadie anota por dónde se mueve un marco: Daniel dijo que en el campo no se va a anotar.
 *
 * Permiso: `apiary:manage` sobre el apiario para anotar; `apiary:view` para leer. La cera es de la
 * finca del apiario, no del apiario: un marco pasa de un sitio a otro sin avisar.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { avisoDeCera, colorDelAño, type AvisoDeCera, type ColorDeAño } from "./colorDelAno";
import type { FrameRemovalReason, WaxDestination, WaxKind } from "../../generated/prisma/client";

export class CeraInvalida extends Error {}

export const TIPOS_DE_CERA: readonly WaxKind[] = ["lamina_estampada_propia", "lamina_comprada", "sin_lamina", "otro"];
export const DESTINOS_DE_CERA: readonly WaxDestination[] = ["camara_de_cria", "alza"];
export const MOTIVOS_DE_SALIDA: readonly FrameRemovalReason[] = ["cera_vieja", "danado", "enfermedad", "otro"];

/** La finca del apiario, con el permiso ya comprobado. */
async function fincaDe(userAccountId: string, locationId: string, accion: "manage" | "view") {
  const sitio = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireApiaryAccess(userAccountId, accion, [{ locationId }]);
  if (!sitio.organizationId) throw new CeraInvalida("sitio_sin_finca");
  return sitio.organizationId;
}

function marcos(n: number) {
  if (!Number.isInteger(n) || n <= 0) throw new CeraInvalida("marcos_invalidos");
  return n;
}

export async function registrarCeraNueva(
  userAccountId: string,
  input: { locationId: string; enteredAt: Date; frameCount: number; waxKind: WaxKind; destination?: WaxDestination | null; hiveId?: string | null; notes?: string | null },
) {
  const organizationId = await fincaDe(userAccountId, input.locationId, "manage");
  if (Number.isNaN(input.enteredAt.getTime())) throw new CeraInvalida("fecha_invalida");
  if (!TIPOS_DE_CERA.includes(input.waxKind)) throw new CeraInvalida("tipo_de_cera_desconocido");
  if (input.destination && !DESTINOS_DE_CERA.includes(input.destination)) throw new CeraInvalida("destino_desconocido");
  const notes = input.notes?.trim() || null;
  if (input.waxKind === "otro" && !notes) throw new CeraInvalida("otro_sin_nota");
  const frameCount = marcos(input.frameCount);
  if (input.hiveId) {
    const hive = await prisma.hive.findUnique({ where: { id: input.hiveId }, select: { location: { select: { organizationId: true } } } });
    if (!hive || hive.location.organizationId !== organizationId) throw new CeraInvalida("colmena_de_otra_finca");
  }
  return prisma.$transaction(async (tx) => {
    const fila = await tx.newWaxEntry.create({
      data: {
        organizationId, enteredAt: input.enteredAt, frameCount, waxKind: input.waxKind,
        destination: input.destination ?? null, hiveId: input.hiveId ?? null, notes,
        provenanceClass: "direct_observation", createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "new_wax_entry.create", entityType: "new_wax_entry", entityId: fila.id, after: fila, sourceInterface: "apiary.service" },
      tx,
    );
    return fila;
  });
}

export async function registrarSalidaDeMarcos(
  userAccountId: string,
  input: { locationId: string; waxYear: number; removedAt: Date; frameCount: number; reason: FrameRemovalReason; notes?: string | null },
) {
  const organizationId = await fincaDe(userAccountId, input.locationId, "manage");
  if (Number.isNaN(input.removedAt.getTime())) throw new CeraInvalida("fecha_invalida");
  if (!Number.isInteger(input.waxYear) || input.waxYear < 1990) throw new CeraInvalida("ano_invalido");
  if (input.waxYear > input.removedAt.getUTCFullYear()) throw new CeraInvalida("ano_aun_no_llega");
  if (!MOTIVOS_DE_SALIDA.includes(input.reason)) throw new CeraInvalida("motivo_desconocido");
  const notes = input.notes?.trim() || null;
  if (input.reason === "otro" && !notes) throw new CeraInvalida("otro_sin_nota");
  const frameCount = marcos(input.frameCount);
  return prisma.$transaction(async (tx) => {
    const fila = await tx.frameRemoval.create({
      data: { organizationId, waxYear: input.waxYear, removedAt: input.removedAt, frameCount, reason: input.reason, notes, createdBy: userAccountId },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "frame_removal.create", entityType: "frame_removal", entityId: fila.id, after: fila, sourceInterface: "apiary.service" },
      tx,
    );
    return fila;
  });
}

export interface FilaDeCera {
  año: number;
  color: ColorDeAño;
  entraron: number;
  salieron: number;
  /** Años de calendario desde el de la cera, en UTC. */
  edad: number;
  aviso: AvisoDeCera;
  /** Salieron más de los que se anotaron entrando: marcos de antes del registro. Se dice, no se impide. */
  salieronDeMas: boolean;
}

/** La leyenda de la finca del apiario: un renglón por año, del más nuevo al más viejo, siempre con el año en curso. */
export async function leyendaDeCera(userAccountId: string, locationId: string, hoy: Date = new Date()): Promise<FilaDeCera[]> {
  const organizationId = await fincaDe(userAccountId, locationId, "view");
  const [entradas, salidas] = await Promise.all([
    prisma.newWaxEntry.findMany({ where: { organizationId }, select: { enteredAt: true, frameCount: true } }),
    prisma.frameRemoval.findMany({ where: { organizationId }, select: { waxYear: true, frameCount: true } }),
  ]);
  const añoDeHoy = hoy.getUTCFullYear();
  const porAño = new Map<number, { entraron: number; salieron: number }>([[añoDeHoy, { entraron: 0, salieron: 0 }]]);
  const de = (año: number) => porAño.get(año) ?? porAño.set(año, { entraron: 0, salieron: 0 }).get(año)!;
  for (const e of entradas) de(e.enteredAt.getUTCFullYear()).entraron += e.frameCount;
  for (const s of salidas) de(s.waxYear).salieron += s.frameCount;
  return [...porAño.entries()]
    .sort(([a], [b]) => b - a)
    .map(([año, c]) => {
      const edad = añoDeHoy - año;
      return { año, color: colorDelAño(año), entraron: c.entraron, salieron: c.salieron, edad, aviso: avisoDeCera(edad), salieronDeMas: c.salieron > c.entraron };
    });
}
```

- [ ] **Step 4:** pruebas y `tsc` en 0. **Commit:** «cera: anotar la cera nueva y los marcos que salen, y la leyenda por año».

---

### Task 4: La pantalla

**Files:**
- Modify: `app/actions/apiary.ts` (dos acciones), `app/apiaries/[id]/page.tsx` (sección «Cera por año»), `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: `registrarCeraNueva`, `registrarSalidaDeMarcos`, `leyendaDeCera`, `TIPOS_DE_CERA`, `DESTINOS_DE_CERA`, `MOTIVOS_DE_SALIDA` (Task 3).
- Produces: `registrarCeraNuevaFormAction(formData)`, `registrarSalidaDeMarcosFormAction(formData)`.

- [ ] **Step 1: Acciones** (debajo de `darDeBajaAlzaFormAction`), leyendo el día con `fechaDeDia`, que lanza con una fecha que no existe; vacío es «hoy»:

```ts
/** Cera con el color de su año (spec 2026-09-18 §5.2) — anotar cera nueva que entra. */
export async function registrarCeraNuevaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  await registrarCeraNueva(user.userAccountId, {
    locationId: apiaryId,
    enteredAt: fechaDeDia(String(formData.get("enteredAt") ?? ""), "enteredAt") ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
    frameCount: Number(formData.get("frameCount") ?? ""),
    waxKind: String(formData.get("waxKind") ?? "") as WaxKind,
    destination: (emptyToNull(formData.get("destination")) as WaxDestination | null) ?? null,
    notes: emptyToNull(formData.get("notes")),
  });
  revalidatePath(`/apiaries/${apiaryId}`);
}

/** Anotar marcos sacados, de un año de color. */
export async function registrarSalidaDeMarcosFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  await registrarSalidaDeMarcos(user.userAccountId, {
    locationId: apiaryId,
    waxYear: Number(formData.get("waxYear") ?? ""),
    removedAt: fechaDeDia(String(formData.get("removedAt") ?? ""), "removedAt") ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z"),
    frameCount: Number(formData.get("frameCount") ?? ""),
    reason: String(formData.get("reason") ?? "") as FrameRemovalReason,
    notes: emptyToNull(formData.get("notes")),
  });
  revalidatePath(`/apiaries/${apiaryId}`);
}
```

Los tipos `WaxKind`, `WaxDestination`, `FrameRemovalReason` con `import type` de `../../generated/prisma/client`. El servicio valida los valores contra sus listas: el `as` sólo tipa, no confía.

- [ ] **Step 2: Mensajes** (`Apiary`), comprobando con el mismo script de alzas que ninguna clave existe:

| clave | es | en |
|---|---|---|
| `ceraHeading` | Cera por año | Wax by year |
| `ceraIntro` | Toda la cera nueva de un año lleva el color de ese año, el mismo que las reinas nacidas ese año. El color dice la edad del marco, esté donde esté. | All new wax of a year carries that year's colour, the same as queens born that year. The colour tells the frame's age wherever it is. |
| `ceraColumnaAno` | Año | Year |
| `ceraColumnaColor` | Color | Colour |
| `ceraColumnaEntraron` | Entraron | In |
| `ceraColumnaSalieron` | Salieron | Out |
| `ceraColumnaEdad` | Edad | Age |
| `ceraEdad` | {edad, plural, =0 {este año} one {# año} other {# años}} | {edad, plural, =0 {this year} one {# year} other {# years}} |
| `ceraAvisoRevisar` | revisar esta cera | check this wax |
| `ceraAvisoRenovar` | ya debería estar renovada | should already be renewed |
| `ceraSalieronDeMas` | salieron más de los anotados: marcos de antes del registro | more out than recorded in: frames from before the record |
| `ceraEsteAno` | Este año se marca en {color} | This year is marked {color} |
| `color_blanco` | blanco | white |
| `color_amarillo` | amarillo | yellow |
| `color_rojo` | rojo | red |
| `color_verde` | verde | green |
| `color_azul` | azul | blue |
| `ceraAnotarEntrada` | Anotar cera nueva | Record new wax |
| `ceraAnotarSalida` | Anotar marcos sacados | Record frames taken out |
| `ceraDia` | Día (vacío: hoy) | Day (empty: today) |
| `ceraCuantosMarcos` | ¿Cuántos marcos? | How many frames? |
| `ceraTipo` | Tipo de cera | Wax type |
| `cera_lamina_estampada_propia` | lámina estampada propia | own embossed foundation |
| `cera_lamina_comprada` | lámina comprada | bought foundation |
| `cera_sin_lamina` | sin lámina (cera natural) | no foundation (natural comb) |
| `cera_otro` | otro (dilo en la nota) | other (say in the note) |
| `ceraDestino` | ¿A dónde? | Where to? |
| `ceraDestinoSinDecir` | sin decir | not said |
| `ceraDestino_camara_de_cria` | cámara de cría | brood chamber |
| `ceraDestino_alza` | alza | super |
| `ceraAnoDelColor` | Año del color de los marcos | Year of the frames' colour |
| `ceraMotivo` | ¿Por qué? | Why? |
| `ceraMotivo_cera_vieja` | cera vieja o negra | old or dark wax |
| `ceraMotivo_danado` | dañado | damaged |
| `ceraMotivo_enfermedad` | enfermedad | disease |
| `ceraMotivo_otro` | otro (dilo en la nota) | other (say in the note) |
| `ceraNota` | Nota | Note |
| `ceraGuardar` | Anotar | Record |

- [ ] **Step 3: La sección**, en `app/apiaries/[id]/page.tsx` justo después de la de alzas (`id="alzas"`), con `const cera = await leyendaDeCera(user.userAccountId, id);` junto a `alzasDelApiario`:

```tsx
      {/* Cera con el color de su año — spec 2026-09-18 §5.3. */}
      <section className="nn-section" id="cera">
        <h2>{t("ceraHeading")}</h2>
        <p className="nn-muted">{t("ceraIntro")}</p>
        <p>
          <strong>{t("ceraEsteAno", { color: t(`color_${cera[0].color}`) })}</strong>
        </p>
        <table className="nn-table">
          <thead>
            <tr>
              <th>{t("ceraColumnaAno")}</th>
              <th>{t("ceraColumnaColor")}</th>
              <th>{t("ceraColumnaEntraron")}</th>
              <th>{t("ceraColumnaSalieron")}</th>
              <th>{t("ceraColumnaEdad")}</th>
            </tr>
          </thead>
          <tbody>
            {cera.map((f) => (
              <tr key={f.año}>
                <td>{f.año}</td>
                <td>{t(`color_${f.color}`)}</td>
                <td>{f.entraron}</td>
                <td>
                  {f.salieron}
                  {f.salieronDeMas ? <span className="nn-muted"> · {t("ceraSalieronDeMas")}</span> : null}
                </td>
                <td>
                  {t("ceraEdad", { edad: f.edad })}
                  {f.aviso === "renovar" ? <strong> · {t("ceraAvisoRenovar")}</strong> : f.aviso === "revisar" ? <span> · {t("ceraAvisoRevisar")}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {puedeGestionarAlzas ? (
          <>
            <details>
              <summary>{t("ceraAnotarEntrada")}</summary>
              <form action={registrarCeraNuevaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
                <input type="hidden" name="apiaryId" value={id} />
                <div className="nn-field">
                  <label htmlFor="cera-dia">{t("ceraDia")}</label>
                  <input id="cera-dia" name="enteredAt" type="date" />
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-cuantos">{t("ceraCuantosMarcos")}</label>
                  <CampoNumerico id="cera-cuantos" name="frameCount" min={1} step={1} inputMode="numeric" required />
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-tipo">{t("ceraTipo")}</label>
                  <select id="cera-tipo" name="waxKind" required defaultValue="">
                    <option value="" disabled />
                    {TIPOS_DE_CERA.map((k) => (
                      <option key={k} value={k}>{t(`cera_${k}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-destino">{t("ceraDestino")}</label>
                  <select id="cera-destino" name="destination" defaultValue="">
                    <option value="">{t("ceraDestinoSinDecir")}</option>
                    {DESTINOS_DE_CERA.map((d) => (
                      <option key={d} value={d}>{t(`ceraDestino_${d}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="cera-nota">{t("ceraNota")}</label>
                  <input id="cera-nota" name="notes" type="text" />
                </div>
                <BotonDeEnvio>{t("ceraGuardar")}</BotonDeEnvio>
              </form>
            </details>
            <details>
              <summary>{t("ceraAnotarSalida")}</summary>
              <form action={registrarSalidaDeMarcosFormAction} className="nn-form" style={{ maxWidth: 420 }}>
                <input type="hidden" name="apiaryId" value={id} />
                <div className="nn-field">
                  <label htmlFor="salida-ano">{t("ceraAnoDelColor")}</label>
                  <select id="salida-ano" name="waxYear" required defaultValue="">
                    <option value="" disabled />
                    {Array.from({ length: 8 }, (_, i) => cera[0].año - i).map((a) => (
                      <option key={a} value={a}>{a} · {t(`color_${colorDelAño(a)}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-cuantos">{t("ceraCuantosMarcos")}</label>
                  <CampoNumerico id="salida-cuantos" name="frameCount" min={1} step={1} inputMode="numeric" required />
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-motivo">{t("ceraMotivo")}</label>
                  <select id="salida-motivo" name="reason" required defaultValue="">
                    <option value="" disabled />
                    {MOTIVOS_DE_SALIDA.map((m) => (
                      <option key={m} value={m}>{t(`ceraMotivo_${m}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-dia">{t("ceraDia")}</label>
                  <input id="salida-dia" name="removedAt" type="date" />
                </div>
                <div className="nn-field">
                  <label htmlFor="salida-nota">{t("ceraNota")}</label>
                  <input id="salida-nota" name="notes" type="text" />
                </div>
                <BotonDeEnvio>{t("ceraGuardar")}</BotonDeEnvio>
              </form>
            </details>
          </>
        ) : null}
      </section>
```

`cera[0]` es siempre el año en curso: `leyendaDeCera` lo garantiza y ordena del más nuevo. Imports: `leyendaDeCera`, `TIPOS_DE_CERA`, `DESTINOS_DE_CERA`, `MOTIVOS_DE_SALIDA` de `lib/apiary/cera`; `colorDelAño` de `lib/apiary/colorDelAno`; las dos acciones; `CampoNumerico` de `../../components/CampoNumerico` si la página no lo importa ya (comprobarlo con `grep`).

- [ ] **Step 4:** `npm run verify` y `npm run build` en 0. **Commit:** «cera: la leyenda por año y los dos formularios en la ficha del apiario». Verlo en el navegador **no** está al alcance de la sesión (hace falta entrar con una cuenta): se dice en el PR.

---

### Task 5: Inventario, ADR, estado, flip-tests y PR

Igual que el Task 5 del plan de alzas (`docs/superpowers/plans/2026-09-18-alzas-con-marca.md`), con estos datos propios:

- Allowlist, en `importan_cliente_total`:
  `lib/apiary/cera.ts` — «Módulo de dominio: la cera con el color de su año (spec 2026-09-18 §5). Anotar exige `requireApiaryAccess` manage sobre el apiario ANTES de escribir; la leyenda, view. La colmena de una entrada tiene que ser de la misma finca. Escritura y AuditEvent en la MISMA transacción. El color no se guarda: lo calcula `colorDelAño`.»
- ADR: el siguiente libre en `origin/main`, medido. Contexto: la cita de Daniel del §5.1; decisión: el color se calcula, dos hechos se guardan, avisos a 2 y 4 años; fuera: «marcos negros» en la inspección (rebanada 2b) y el año de las reinas.
- Flip-tests (todos contra el commit, con el arnés de tres cosas):

| # | archivo | mutación | debe caer |
|---|---|---|---|
| 1 | `lib/apiary/colorDelAno.ts` | `POR_RESTO` empezando en `"blanco"` | «cada final de año tiene su color…» |
| 2 | `lib/apiary/colorDelAno.ts` | `renovar` con `>` en vez de `>=` | «LOS AVISOS…» |
| 3 | `lib/apiary/cera.ts` | la leyenda sin el año en curso | «AGRUPA POR AÑO…» |
| 4 | `lib/apiary/cera.ts` | `salieronDeMas` siempre `false` | «SALIERON MÁS DE LOS ANOTADOS…» |
| 5 | `lib/apiary/cera.ts` | la leyenda sin filtrar por `organizationId` | «CADA FINCA VE SU CERA…» |
| 6 | `lib/apiary/cera.ts` | quitar `colmena_de_otra_finca` | «LAS REGLAS DEL SERVICIO…» |
| 7 | `lib/apiary/cera.ts` | quitar `ano_aun_no_llega` | «LAS REGLAS DEL SERVICIO…» (y si lo para el CHECK, decir que la base es la segunda capa) |
| 8 | `lib/apiary/cera.ts` | `requireApiaryAccess` de `fincaDe` quitado | «LAS REGLAS DEL SERVICIO…» |
