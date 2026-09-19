# Secado por bandeja, paso 2 — bandejas y posiciones: plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para ejecutar este plan tarea a tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** que un lote en secado pueda repartirse en bandejas —cada una con su posición de nivel y fila, cargada y bajada por separado—, con las reglas en la base y no sólo en TypeScript.

**Arquitectura:** dos migraciones. La primera añade los dos ambientes y la fila (`rackRow`). La segunda crea `DryingRunTray` con sus reglas: índice único parcial, un disparador por regla que mira otra tabla y un `CHECK` para lo de una sola fila. Encima, un servicio nuevo `lib/traceability/bandejas.ts`: cargar, bajar (la última cierra el secado), listar con posición y conflicto. `endDryingRun` gana una guarda y cede su cuerpo a `cerrarCorridaEnTransaccion`, que reutiliza bajar la última. La pantalla del lote enseña las bandejas y los dos formularios. **La posición no es una columna nueva:** es el último `EquipmentTransfer` de la bandeja hacia una `drying_bed` (spec §4.2).

**Stack:** Next.js 16 App Router con Server Actions · Prisma 7.9 sobre Postgres · next-intl · vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md`, §2, §4.1–§4.3, §5 y §7. Paso 2 de su §6.

## Restricciones globales

- **Nombres aprobados por Daniel el 2026-09-18**, porque `docs/beneficio/03_public_api.md` no declara ninguno de secado (medido: el archivo sólo trae contratos de motores y estados; cero modelos de instalación, cama o bandeja):
  - ambientes: `african_bed_outdoor` (cama africana a la intemperie) y `floor_tarp` (piso con lona);
  - la fila: `rackRow` / `rack_row`;
  - la tabla: `DryingRunTray` / `traceability.drying_run_tray`, con `desde` y `hasta` como dice la tabla de §4.3.
  - **Ningún otro nombre nuevo de dominio** sin preguntar.
- **Decisiones de Daniel que este plan aplica** (spec §2):
  - un lote se reparte en varias bandejas y **cada bandeja lleva un solo lote a la vez**;
  - el secado **termina bandeja a bandeja**: el lote termina cuando baja la última, y el paso a almacenamiento sigue siendo manual. **Aplicado así:** bajar la última bandeja **cierra el secado en la misma transacción**, con `endedAt = hasta`, pidiendo los datos de cierre que ya pide `endDryingRun`. Con dos pasos habría un secado con todas las bandejas abajo que sigue «secando» (hallazgo 10 de la revisión de Codex del plan);
  - **una bandeja por posición**: dos a la vez en la misma posición se **enseñan como conflicto**, no se bloquean ni se reparte nada;
  - la bandeja se identifica por **número y QR**. **El QR no entra en este plan** (ver «Fuera»).
- **Nivel y fila, en la base:** `> 0`. La spec dice «no negativos», pero `location_rack_level_positivo` ya exige `> 0` para el nivel, y una fila 0 no existe igual que un nivel 0. Se usa la misma regla para las dos.
- **§7 de la spec, resuelto aquí y enseñado antes de construir:** al bajar una bandeja se guarda **sólo `hasta`**, sin humedad. La humedad con la que baja es una **inspección de esa bandeja**, que llega en el paso 3 (`SamplingEvent.trayEquipmentId`). Guardarla también aquí sería el mismo hecho en dos sitios. Bajar **no afirma** que la bandeja llegó a meta: `TARGET_REACHED` exige humedad **y** actividad de agua (`13_drying_moisture.md`), y eso lo juzga el motor, no un botón.
- **Reglas de la casa:**
  - una regla que mira otra tabla va por **disparador**, con la misma forma que `traceability.exigir_cama_de_secado`;
  - cada regla lleva su **sonda con control positivo**, es decir, lo válido sí entra;
  - toda prueba con base va declarada en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`;
  - `npm run build` en toda tarea que toque TypeScript;
  - `git commit -F <archivo>` y nunca `git add -A`;
  - el flip-test se hace **después** del commit, con sha antes y después, compila, y el nombre de la prueba que cae.
- **De un archivo `"use server"` sólo se exportan funciones `async`** (`tests/arquitectura/use-server-solo-async.test.ts`).
- **Variables de la base para `npm test`:**
  - `DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test`
  - `SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nn_shadow_beneficio`
  - **Nunca** `test:db -- reset` sobre la base compartida.

## Fuera de este plan

- **El QR de la bandeja.** La spec dice que sigue el diseño de los envases de insumos (#365); va con su propio plan. Aquí la bandeja se reconoce por su nombre (`Equipment.name`, «Bandeja 12»).
- **La humedad y los volteos por bandeja.** Son el paso 3.
- **Mover una bandeja de nivel o fila.** Ya existe: es `trasladarEquipo` (`lib/equipos/equipos.ts`), con su permiso de equipos. Este plan sólo **lee** esa cadena.
- **Asignar la cama a una corrida sin bandejas** (`DryingRun.dryingBedLocationId`). Hoy ningún servicio la escribe (medido: sólo las pruebas). La regla «cama **o** bandejas» se pone en la base igualmente, porque es la que protege la verdad de dónde está el lote.

## Mapa de archivos

| archivo | qué |
|---|---|
| `prisma/migrations/20260918190000_ambientes_y_fila_de_secado/migration.sql` | T1: dos valores de `DryingEnvironment`, `rack_row` y su `CHECK` |
| `prisma/migrations/20260918191000_bandejas_de_la_corrida/migration.sql` | T2: tabla `drying_run_tray` y sus reglas |
| `prisma/schema.prisma` | T1 y T2 |
| `lib/traceability/secadoForm.ts`, `lib/traceability/instalaciones.ts` | T1: `rackRow` en lectura, validación, alta, edición y detalle |
| `app/instalaciones/FormularioUbicacion.tsx`, `app/instalaciones/page.tsx` | T1: el campo y su lectura |
| `lib/traceability/bandejaError.ts` | T3: el error y sus códigos, aparte para no importar en círculo |
| `lib/traceability/bandejas.ts` | T3: servicio nuevo |
| `lib/traceability/drying.ts` | T3: la guarda de `endDryingRun` y `cerrarCorridaEnTransaccion` |
| `lib/equipos/equipos.ts` | T3: `puedeVerEquipo` exportada |
| `app/actions/bandejas.ts` | T4: dos acciones de servidor |
| `app/components/traceability/BandejasDelSecado.tsx` | T4: componente cliente |
| `app/lots/[id]/page.tsx` | T4: lo monta y oculta el cierre con bandejas abiertas |
| `messages/es.json`, `messages/en.json` | T1 y T4 |
| `tests/traceability/bandejasEnLaBase.test.ts` | T2: sondas de la base |
| `tests/traceability/bandejas.test.ts` | T3: servicio |
| `tests/traceability/secadoForm.test.ts`, `tests/traceability/instalaciones.test.ts`, `tests/traceability/topologiaDeSecado.test.ts` | T1 |
| `scripts/pruebas-por-compuerta.txt` | T2 y T3: dos rutas en `base-sembrada` |
| `docs/architecture/DECISIONS.md`, `docs/arquitectura/inventario-de-acceso.md`, spec | T5 |

---

### Tarea 1: dos ambientes nuevos y la fila del estante

**Archivos:**
- Crear: `prisma/migrations/20260918190000_ambientes_y_fila_de_secado/migration.sql`
- Modificar: `prisma/schema.prisma` (enum `DryingEnvironment` hacia la línea 722; `Location.rackLevel` hacia la 843)
- Modificar: `lib/traceability/secadoForm.ts` (`leerUbicacionDeSecado`)
- Modificar: `lib/traceability/instalaciones.ts` (`Datos`, `validar`, `crearUbicacionDeSecado`, `actualizarUbicacionDeSecado`, `detalleInstalacion`)
- Modificar: `app/instalaciones/FormularioUbicacion.tsx`, `app/instalaciones/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json` (espacio `Secado`)
- Pruebas: `tests/traceability/secadoForm.test.ts`, `tests/traceability/instalaciones.test.ts`, `tests/traceability/topologiaDeSecado.test.ts`

**Interfaces:**
- Produce `Location.rackRow: number | null` y `DryingEnvironment` con `african_bed_outdoor` y `floor_tarp`.
- `leerUbicacionDeSecado(form)` devuelve además `rackRow: number | null`, y lanza `SecadoFormError("fila_invalida")`.
- `detalleInstalacion(...).camas[]` gana `rackRow`.

- [ ] **Paso 1: las pruebas que fallan**

En `tests/traceability/secadoForm.test.ts`, al lado de la prueba del rack:

```ts
  it("una fila vacía queda nula, una positiva queda declarada y una inválida falla", () => {
    const form = new FormData(); form.set("name", "Cama A");
    expect(leerUbicacionDeSecado(form).rackRow).toBeNull();
    form.set("rackRow", "3"); expect(leerUbicacionDeSecado(form).rackRow).toBe(3);
    for (const value of ["0", "-1", "1.5", "NaN", "2147483648"]) {
      form.set("rackRow", value); expect(() => leerUbicacionDeSecado(form)).toThrow("fila_invalida");
    }
  });
  it("acepta los dos ambientes nuevos", () => {
    const form = new FormData(); form.set("name", "Patio");
    for (const a of ["african_bed_outdoor", "floor_tarp"]) {
      form.set("dryingEnvironment", a); expect(leerUbicacionDeSecado(form).dryingEnvironment).toBe(a);
    }
  });
```

Añadir `"fila_invalida"` a la lista de la prueba de claves de mensaje de ese mismo archivo (hacia la línea 74).

En `tests/traceability/instalaciones.test.ts`, dentro de «valida los tipos de padre y el nivel de rack…», después del bucle del nivel:

```ts
    for (const rackRow of [0, -1, 1.5]) {
      await expect(crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: facility.id, locationType: "drying_bed", rackRow })).rejects.toThrow("fila_invalida");
    }
    const conFila = await crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: facility.id, locationType: "drying_bed", rackLevel: 2, rackRow: 4 });
    expect(conFila).toMatchObject({ rackLevel: 2, rackRow: 4 });
    expect((await actualizarUbicacionDeSecado(actor, { locationId: conFila.id, name: conFila.name, rackLevel: 2, rackRow: 5 })).rackRow).toBe(5);
    // Una instalación no tiene fila: la fila es de la posición.
    await expect(crearUbicacionDeSecado(actor, { name: nombre(), parentLocationId: parent.id, locationType: "drying_facility", rackRow: 1 })).rejects.toThrow("tipo_invalido");
```

En `tests/traceability/topologiaDeSecado.test.ts`, una sonda nueva con su control positivo:

```ts
  it("la base rechaza una fila 0 y acepta una fila 1 (control positivo)", async () => {
    const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
    const inv = await prisma.location.create({ data: { name: "TEST Inv fila", locationType: "drying_facility", parentLocationId: sitio.id } });
    try {
      await expect(prisma.location.create({ data: { name: "TEST Cama fila 0", locationType: "drying_bed", parentLocationId: inv.id, rackRow: 0 } }))
        .rejects.toThrow(/location_rack_row_positivo/);
      const ok = await prisma.location.create({ data: { name: "TEST Cama fila 1", locationType: "drying_bed", parentLocationId: inv.id, rackRow: 1 } });
      expect(ok.rackRow).toBe(1);
      await prisma.location.delete({ where: { id: ok.id } });
    } finally {
      await prisma.location.deleteMany({ where: { parentLocationId: inv.id } });
      await prisma.location.delete({ where: { id: inv.id } });
    }
  });
```

- [ ] **Paso 2: comprobar que fallan**

Correr `npx vitest run tests/traceability/secadoForm.test.ts tests/traceability/instalaciones.test.ts tests/traceability/topologiaDeSecado.test.ts` con las variables de la base.
Esperado: FALLAN por `rackRow` desconocido y porque `leerUbicacionDeSecado` no devuelve `rackRow`.

- [ ] **Paso 3: la migración y el esquema**

`prisma/migrations/20260918190000_ambientes_y_fila_de_secado/migration.sql`:

```sql
-- Paso 2 del spec de secado por bandeja (§4.1, §4.2). Nombres aprobados por
-- Daniel el 2026-09-18: 03_public_api.md no declara ninguno de secado.
--
-- `ADD VALUE` corre dentro de la transacción mientras el valor no se USE aquí
-- (mismo comentario que 20260915220000_topologia_de_secado).
ALTER TYPE "core"."DryingEnvironment" ADD VALUE 'african_bed_outdoor';
ALTER TYPE "core"."DryingEnvironment" ADD VALUE 'floor_tarp';

-- La fila del estante, al lado del nivel. Anulable por la misma razón: una
-- cama de patio no está en ningún estante.
ALTER TABLE "core"."location" ADD COLUMN "rack_row" INTEGER;

-- Una fila 0 o negativa no existe, igual que un nivel (location_rack_level_positivo).
ALTER TABLE "core"."location"
  ADD CONSTRAINT "location_rack_row_positivo"
    CHECK ("rack_row" IS NULL OR "rack_row" > 0);
```

En `prisma/schema.prisma`, dentro de `enum DryingEnvironment`, después de `mechanical_dryer`:

```prisma
  /// Cama elevada afuera, a la intemperie. Sin bandejas: el lote está en la cama.
  african_bed_outdoor
  /// En el piso, sobre lona. Sin bandejas.
  floor_tarp
```

y debajo de `rackLevel`:

```prisma
  /// Sólo para `drying_bed`: la fila del estante, al lado del nivel. Una posición
  /// de invernadero o cuarto es nivel + fila; lleva una bandeja a la vez (spec
  /// de secado por bandeja §4.2, decisión de Daniel del 2026-09-18).
  rackRow           Int?               @map("rack_row")
```

Correr `npx prisma migrate deploy` y después `npm run prisma:generate`. Leer que imprime `20260918190000_ambientes_y_fila_de_secado`.

- [ ] **Paso 4: el código**

En `lib/traceability/secadoForm.ts`, dentro de `leerUbicacionDeSecado`, después del bloque de `rackLevel`:

```ts
  const fila = texto(form, "rackRow");
  const rackRow = fila ? Number(fila) : null;
  if (rackRow !== null && (!Number.isInteger(rackRow) || rackRow < 1 || rackRow > 2147483647)) {
    throw new SecadoFormError("fila_invalida");
  }
```

y añadir `rackRow,` al objeto devuelto.

En `lib/traceability/instalaciones.ts`:

```ts
type Datos = { name: string; dryingEnvironment?: DryingEnvironment | null; rackLevel?: number | null; rackRow?: number | null };
```

Dentro de `validar`, en la rama `drying_facility`, añadir `if (input.rackRow != null) throw new SecadoFormError("tipo_invalido");`. En la rama `drying_bed`, añadir:

```ts
    if (input.rackRow != null && (!Number.isInteger(input.rackRow) || input.rackRow < 1 || input.rackRow > 2147483647)) throw new SecadoFormError("fila_invalida");
```

Además:
- en el `data` de `crearUbicacionDeSecado` y de `actualizarUbicacionDeSecado`, añadir `rackRow: input.rackRow ?? null`;
- en `detalleInstalacion`, usar `orderBy: [{ rackLevel: "asc" }, { rackRow: "asc" }, { name: "asc" }]` y `camas.push({ id: bed.id, name: bed.name, rackLevel: bed.rackLevel, rackRow: bed.rackRow })`.

En `app/instalaciones/FormularioUbicacion.tsx`:
- el tipo `existente` gana `rackRow?: number | null`;
- la rama de cama pasa a ser un fragmento con los dos campos:

```tsx
      : <>
        <label>{t("rack")}<CampoNumerico name="rackLevel" min={1} max={2147483647} step={1} defaultValue={existente?.rackLevel ?? ""} /><span className="nn-muted">{t("rackAyuda")}</span></label>
        <label>{t("fila")}<CampoNumerico name="rackRow" min={1} max={2147483647} step={1} defaultValue={existente?.rackRow ?? ""} /><span className="nn-muted">{t("filaAyuda")}</span></label>
      </>}
```

En `app/instalaciones/page.tsx`, la línea de la cama:

```tsx
<li key={c.id}>{c.name} · {c.rackLevel == null ? t("rackNoDeclarado") : t("rackValor", { nivel: c.rackLevel })}{c.rackRow == null ? "" : ` · ${t("filaValor", { fila: c.rackRow })}`}</li>
```

En `messages/es.json`, espacio `Secado`:

```json
    "fila": "Fila del estante (opcional)",
    "filaAyuda": "Con el nivel, dice la posición de una bandeja. Vacío conserva el dato como no declarado.",
    "filaValor": "fila {fila}",
    "ambiente_african_bed_outdoor": "Cama africana a la intemperie",
    "ambiente_floor_tarp": "Piso con lona",
    "error_fila_invalida": "La fila debe ser un número entero positivo.",
```

En `messages/en.json`, las mismas claves:

```json
    "fila": "Shelf row (optional)",
    "filaAyuda": "Together with the level, it gives a tray's position. Leave empty to keep it undeclared.",
    "filaValor": "row {fila}",
    "ambiente_african_bed_outdoor": "African raised bed, outdoors",
    "ambiente_floor_tarp": "Floor on tarp",
    "error_fila_invalida": "The row must be a positive whole number.",
```

- [ ] **Paso 5: comprobar que pasan**

Correr las tres pruebas del paso 2 → PASAN. Después `npm run build` → sale 0.

- [ ] **Paso 6: commit**

```bash
git add prisma/migrations/20260918190000_ambientes_y_fila_de_secado/migration.sql
git add prisma/schema.prisma
git add lib/traceability/secadoForm.ts
git add lib/traceability/instalaciones.ts
git add app/instalaciones/FormularioUbicacion.tsx
git add app/instalaciones/page.tsx
git add messages/es.json
git add messages/en.json
git add tests/traceability/secadoForm.test.ts
git add tests/traceability/instalaciones.test.ts
git add tests/traceability/topologiaDeSecado.test.ts
git diff --cached --stat   # 11 archivos; si salen más, parar
git commit -F <archivo-con-el-mensaje>
```

Mensaje: `feat(secado): cama africana, piso con lona y la fila del estante`.

---

### Tarea 2: `DryingRunTray` y sus reglas en la base

**Archivos:**
- Crear: `prisma/migrations/20260918191000_bandejas_de_la_corrida/migration.sql`
- Modificar: `prisma/schema.prisma` (modelo nuevo; relaciones inversas en `DryingRun`, `Equipment` y `UserAccount`)
- Crear: `tests/traceability/bandejasEnLaBase.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`, junto a `tests/traceability/topologiaDeSecado.test.ts`)

**Interfaces:**
- Produce `prisma.dryingRunTray` con `{ id, dryingRunId, equipmentId, desde, hasta, provenanceClass, createdAt, createdBy }`.
- Produce los mensajes de error de la base, que T3 y las pruebas buscan por regex. Van **sin tildes**, para no depender de la codificación del cliente:

| regla | texto |
|---|---|
| no es un recipiente | `Una bandeja de secado debe ser un equipo de tipo recipiente` |
| la bandeja ya lleva otro lote | `Esta bandeja ya lleva otro lote en ese intervalo` |
| la corrida ya tiene cama | `Una corrida con cama no lleva bandejas` |
| la corrida ya tiene bandejas | `Una corrida con bandejas no lleva cama` |
| una fila abierta en una corrida cerrada (carga tardía, reapertura o mudanza) | `El secado ya esta cerrado` |
| se cierra con bandejas abiertas | `No se cierra un secado con bandejas sin bajar` |
| el equipo con bandejas deja de ser recipiente | el mismo texto de «no es un recipiente» |

- [ ] **Paso 1: las sondas que fallan**

`tests/traceability/bandejasEnLaBase.test.ts`:

```ts
// Sondas de las reglas de DryingRunTray (spec de secado por bandeja §4.3, §5).
// Cada rechazo lleva al lado su control positivo: lo válido SÍ entra. Sin él,
// «no entró» no prueba nada (CLAUDE.md, «Ocho guardias falsos en un día»).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `bdb-${Date.now()}`;
let organizationId: string;
const equipos: string[] = [];
const corridas: string[] = [];
const ubicaciones: string[] = [];

async function equipo(kind: "vessel" | "instrument", n: string) {
  const e = await prisma.equipment.create({ data: {
    name: `TEST Bandeja ${n} (${RUN_ID})`, kind, format: kind === "vessel" ? "other" : null,
    organizationId, provenanceClass: "original_record",
  } });
  equipos.push(e.id);
  return e;
}
async function corrida(dryingBedLocationId: string | null = null) {
  const r = await prisma.dryingRun.create({ data: { startedAt: new Date("2026-09-01T10:00:00Z"), dryingBedLocationId } });
  corridas.push(r.id);
  return r;
}
function cargar(dryingRunId: string, equipmentId: string, desde: string, hasta: string | null = null) {
  return prisma.dryingRunTray.create({ data: {
    dryingRunId, equipmentId, desde: new Date(desde), hasta: hasta ? new Date(hasta) : null, provenanceClass: "original_record",
  } });
}

beforeAll(async () => { organizationId = await createTestOrganization(RUN_ID); });
afterAll(async () => {
  await prisma.dryingRunTray.deleteMany({ where: { dryingRunId: { in: corridas } } });
  await prisma.dryingRun.deleteMany({ where: { id: { in: corridas } } });
  await prisma.equipment.deleteMany({ where: { id: { in: equipos } } });
  await prisma.location.deleteMany({ where: { id: { in: ubicaciones } } });
  await deleteTestOrganizations(RUN_ID);
});

describe("una bandeja lleva un solo lote a la vez", () => {
  it("rechaza dos filas abiertas de la misma bandeja; acepta la segunda cuando la primera bajó", async () => {
    const b = await equipo("vessel", "doble");
    const [r1, r2] = [await corrida(), await corrida()];
    await cargar(r1.id, b.id, "2026-09-01T10:00:00Z");
    await expect(cargar(r2.id, b.id, "2026-09-02T10:00:00Z")).rejects.toThrow(/ya lleva otro lote/);
    await prisma.dryingRunTray.updateMany({ where: { dryingRunId: r1.id }, data: { hasta: new Date("2026-09-02T09:00:00Z") } });
    expect((await cargar(r2.id, b.id, "2026-09-02T10:00:00Z")).equipmentId).toBe(b.id); // control positivo
  });

  it("rechaza un intervalo cerrado que se solapa con otro de la misma bandeja", async () => {
    const b = await equipo("vessel", "solape");
    const [r1, r2] = [await corrida(), await corrida()];
    await cargar(r1.id, b.id, "2026-09-01T10:00:00Z", "2026-09-05T10:00:00Z");
    await expect(cargar(r2.id, b.id, "2026-09-03T10:00:00Z", "2026-09-06T10:00:00Z")).rejects.toThrow(/ya lleva otro lote/);
    // Control positivo: pegado al final del anterior no se solapa.
    expect((await cargar(r2.id, b.id, "2026-09-05T10:00:00Z", "2026-09-06T10:00:00Z")).id).toBeTruthy();
  });
});

describe("la bandeja es un recipiente", () => {
  it("rechaza un instrumento y acepta un recipiente", async () => {
    const r = await corrida();
    await expect(cargar(r.id, (await equipo("instrument", "no-recipiente")).id, "2026-09-01T10:00:00Z")).rejects.toThrow(/tipo recipiente/);
    expect((await cargar(r.id, (await equipo("vessel", "recipiente")).id, "2026-09-01T10:00:00Z")).id).toBeTruthy();
  });
});

describe("una corrida dice una sola verdad sobre dónde está el lote", () => {
  it("rechaza bandejas en una corrida con cama, y cama en una corrida con bandejas", async () => {
    const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
    const inv = await prisma.location.create({ data: { name: `TEST Inv (${RUN_ID})`, locationType: "drying_facility", parentLocationId: sitio.id } });
    const cama = await prisma.location.create({ data: { name: `TEST Cama (${RUN_ID})`, locationType: "drying_bed", parentLocationId: inv.id } });
    ubicaciones.push(cama.id, inv.id);

    const conCama = await corrida(cama.id);
    await expect(cargar(conCama.id, (await equipo("vessel", "en-cama")).id, "2026-09-01T10:00:00Z")).rejects.toThrow(/con cama no lleva bandejas/);

    const conBandeja = await corrida();
    await cargar(conBandeja.id, (await equipo("vessel", "con-bandeja")).id, "2026-09-01T10:00:00Z");
    await expect(prisma.dryingRun.update({ where: { id: conBandeja.id }, data: { dryingBedLocationId: cama.id } })).rejects.toThrow(/con bandejas no lleva cama/);

    // Control positivo: una corrida sin bandejas sí acepta su cama.
    const sola = await corrida();
    expect((await prisma.dryingRun.update({ where: { id: sola.id }, data: { dryingBedLocationId: cama.id } })).dryingBedLocationId).toBe(cama.id);
  });
});

describe("el secado termina bandeja a bandeja", () => {
  it("no se cierra con una bandeja sin bajar; sí cuando bajó la última", async () => {
    const r = await corrida();
    await cargar(r.id, (await equipo("vessel", "cierre-1")).id, "2026-09-01T10:00:00Z", "2026-09-04T10:00:00Z");
    await cargar(r.id, (await equipo("vessel", "cierre-2")).id, "2026-09-01T10:00:00Z");
    await expect(prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-05T10:00:00Z") } })).rejects.toThrow(/bandejas sin bajar/);
    await prisma.dryingRunTray.updateMany({ where: { dryingRunId: r.id, hasta: null }, data: { hasta: new Date("2026-09-05T09:00:00Z") } });
    expect((await prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-05T10:00:00Z") } })).endedAt).toBeTruthy();
  });

  it("no se carga una bandeja en un secado cerrado", async () => {
    const r = await corrida();
    await prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-02T10:00:00Z") } });
    await expect(cargar(r.id, (await equipo("vessel", "tarde")).id, "2026-09-03T10:00:00Z")).rejects.toThrow(/ya esta cerrado/);
  });

  it("rechaza bajar antes de cargar —también con historial previo de la bandeja—; acepta bajar después", async () => {
    const r = await corrida();
    await expect(cargar(r.id, (await equipo("vessel", "reves")).id, "2026-09-03T10:00:00Z", "2026-09-02T10:00:00Z"))
      .rejects.toThrow(/drying_run_tray_hasta_despues_de_desde/);
    // Con historial: el disparador NO debe construir un tsrange al revés antes del CHECK.
    const conHistoria = await equipo("vessel", "con-historia");
    await cargar(r.id, conHistoria.id, "2026-09-01T10:00:00Z", "2026-09-01T12:00:00Z");
    await expect(cargar((await corrida()).id, conHistoria.id, "2026-09-05T10:00:00Z", "2026-09-04T10:00:00Z"))
      .rejects.toThrow(/drying_run_tray_hasta_despues_de_desde/);
    expect((await cargar(r.id, (await equipo("vessel", "derecho")).id, "2026-09-02T10:00:00Z", "2026-09-03T10:00:00Z")).id).toBeTruthy();
  });

  it("no se reabre una bandeja de un secado cerrado, ni se mueve una abierta a uno cerrado", async () => {
    const r = await corrida();
    const t = await cargar(r.id, (await equipo("vessel", "reabrir")).id, "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z");
    await prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-03T10:00:00Z") } });
    await expect(prisma.dryingRunTray.update({ where: { id: t.id }, data: { hasta: null } })).rejects.toThrow(/ya esta cerrado/);
    // Control positivo: corregir el `hasta` de una fila cerrada sigue permitido.
    expect((await prisma.dryingRunTray.update({ where: { id: t.id }, data: { hasta: new Date("2026-09-02T11:00:00Z") } })).hasta).toBeTruthy();

    const abierta = await cargar((await corrida()).id, (await equipo("vessel", "mudanza")).id, "2026-09-01T10:00:00Z");
    await expect(prisma.dryingRunTray.update({ where: { id: abierta.id }, data: { dryingRunId: r.id } })).rejects.toThrow(/ya esta cerrado/);
  });
});

describe("el equipo que fue bandeja sigue siendo recipiente", () => {
  it("rechaza cambiar a instrumento un recipiente con bandejas; acepta uno que nunca lo fue", async () => {
    const b = await equipo("vessel", "cambia-tipo");
    await cargar((await corrida()).id, b.id, "2026-09-01T10:00:00Z", "2026-09-02T10:00:00Z");
    await expect(prisma.equipment.update({ where: { id: b.id }, data: { kind: "instrument", format: null } })).rejects.toThrow(/tipo recipiente/);
    const nunca = await equipo("vessel", "nunca-bandeja");
    expect((await prisma.equipment.update({ where: { id: nunca.id }, data: { kind: "instrument", format: null } })).kind).toBe("instrument");
  });
});

describe("cargar y cerrar a la vez no dejan una corrida incoherente", () => {
  // Dos transacciones de verdad, en los dos órdenes. La primera retiene su
  // bloqueo 1,5 s; la segunda arranca a los 300 ms y tiene que esperar y perder.
  //
  // OJO: una consulta de Prisma es PEREZOSA —no sale hasta que alguien hace
  // `await` o `.then`—. Por eso cada operación se arranca con `resultado()`, que
  // llama a `.then` en el acto. Sin eso, la «segunda» corre después de que la
  // primera confirme, no hay carrera, y la prueba pasa sin medir nada.
  const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const resultado = (p: PromiseLike<unknown>) => Promise.resolve(p).then(() => null, (e: unknown) => e as Error);
  const inicio = () => Date.now();

  it("carga primero: el cierre espera y lo rechaza", async () => {
    const r = await corrida();
    const b = await equipo("vessel", "carrera-1");
    const t0 = inicio();
    const cargarLento = resultado(prisma.$transaction(async (tx) => {
      await tx.dryingRunTray.create({ data: { dryingRunId: r.id, equipmentId: b.id, desde: new Date("2026-09-01T10:00:00Z"), provenanceClass: "original_record" } });
      await espera(1500);
    }, { timeout: 10_000 }));
    await espera(300);
    const cerrar = resultado(prisma.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-02T10:00:00Z") } }));
    expect(await cargarLento).toBeNull();
    const error = await cerrar;
    // Control de que HUBO carrera: el cierre tardó lo que el bloqueo, no volvió al instante.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400);
    expect(String(error)).toMatch(/bandejas sin bajar/);
  });

  it("cierra primero: la carga espera y la rechaza", async () => {
    const r = await corrida();
    const b = await equipo("vessel", "carrera-2");
    const t0 = inicio();
    const cerrarLento = resultado(prisma.$transaction(async (tx) => {
      await tx.dryingRun.update({ where: { id: r.id }, data: { endedAt: new Date("2026-09-02T10:00:00Z") } });
      await espera(1500);
    }, { timeout: 10_000 }));
    await espera(300);
    const cargarTarde = resultado(cargar(r.id, b.id, "2026-09-01T10:00:00Z"));
    expect(await cerrarLento).toBeNull();
    const error = await cargarTarde;
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1400);
    expect(String(error)).toMatch(/ya esta cerrado/);
  });
});
```

Añadir `tests/traceability/bandejasEnLaBase.test.ts` a `scripts/pruebas-por-compuerta.txt`, en el grupo `base-sembrada`, en la línea siguiente a `tests/traceability/topologiaDeSecado.test.ts`.

- [ ] **Paso 2: comprobar que fallan**

`npx vitest run tests/traceability/bandejasEnLaBase.test.ts` → FALLA: `prisma.dryingRunTray` no existe.

- [ ] **Paso 3: la migración**

`prisma/migrations/20260918191000_bandejas_de_la_corrida/migration.sql`:

```sql
-- Paso 2 del spec de secado por bandeja (§4.3). Qué bandejas lleva el secado de
-- un lote, cuándo se cargó y cuándo se bajó cada una. La POSICIÓN no va aquí:
-- es el último equipment_transfer de la bandeja hacia una drying_bed (§4.2).
--
-- Reglas que miran otra tabla → disparadores, misma forma que
-- traceability.exigir_cama_de_secado. Los textos van sin tildes a propósito.

CREATE TABLE "traceability"."drying_run_tray" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "drying_run_id" UUID NOT NULL,
  "equipment_id" UUID NOT NULL,
  "desde" TIMESTAMP(3) NOT NULL,
  "hasta" TIMESTAMP(3),
  "provenance_class" "core"."ProvenanceClass" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  CONSTRAINT "drying_run_tray_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drying_run_tray_hasta_despues_de_desde" CHECK ("hasta" IS NULL OR "hasta" >= "desde")
);

ALTER TABLE "traceability"."drying_run_tray"
  ADD CONSTRAINT "drying_run_tray_drying_run_id_fkey" FOREIGN KEY ("drying_run_id")
    REFERENCES "traceability"."drying_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_run_tray_equipment_id_fkey" FOREIGN KEY ("equipment_id")
    REFERENCES "core"."equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "drying_run_tray_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "drying_run_tray_drying_run_id_idx" ON "traceability"."drying_run_tray"("drying_run_id");
CREATE INDEX "drying_run_tray_equipment_id_idx" ON "traceability"."drying_run_tray"("equipment_id");

-- Una bandeja, una fila abierta como mucho. Es la red contra dos cargas
-- simultáneas; el disparador de abajo cubre además los intervalos cerrados.
CREATE UNIQUE INDEX "drying_run_tray_una_abierta_por_bandeja"
  ON "traceability"."drying_run_tray"("equipment_id") WHERE "hasta" IS NULL;

-- Al cargar o corregir una bandeja: es un recipiente, su corrida no tiene
-- cama, una fila ABIERTA no vive en una corrida cerrada, y no se solapa con otro
-- intervalo de la misma bandeja.
--
-- Bloqueos, siempre en este orden: primero la CORRIDA, después el EQUIPO. El de
-- la corrida serializa esta fila contra `exigir_corrida_coherente_con_bandejas`
-- (un UPDATE de drying_run ya tiene la fila bloqueada cuando corre su BEFORE):
-- sin él, cargar y cerrar a la vez podían confirmar las dos (revisión de Codex
-- del plan, 2026-09-18). El del equipo serializa dos cargas de la misma bandeja
-- y un cambio de su `kind`. Las funciones son VOLATILE: en READ COMMITTED cada
-- consulta de dentro toma instantánea nueva, así que tras esperar el bloqueo se
-- ve lo que el otro confirmó.
CREATE OR REPLACE FUNCTION "traceability"."exigir_bandeja_valida"()
RETURNS TRIGGER AS $$
DECLARE tipo TEXT; cama UUID; cerrada TIMESTAMP(3);
BEGIN
  SELECT "drying_bed_location_id", "ended_at" INTO cama, cerrada
    FROM "traceability"."drying_run" WHERE "id" = NEW."drying_run_id" FOR UPDATE;
  SELECT "kind"::TEXT INTO tipo FROM "core"."equipment" WHERE "id" = NEW."equipment_id" FOR UPDATE;
  IF tipo IS DISTINCT FROM 'vessel' THEN
    RAISE EXCEPTION 'Una bandeja de secado debe ser un equipo de tipo recipiente (es %)', tipo;
  END IF;
  IF cama IS NOT NULL THEN
    RAISE EXCEPTION 'Una corrida con cama no lleva bandejas';
  END IF;
  -- INSERT o UPDATE: una fila abierta no existe en un secado cerrado. Cubre
  -- cargar tarde, reabrir con `hasta = NULL` y mover una fila abierta a otra corrida.
  IF cerrada IS NOT NULL AND NEW."hasta" IS NULL THEN
    RAISE EXCEPTION 'El secado ya esta cerrado';
  END IF;
  -- Un intervalo al revés lo rechaza el CHECK, que corre DESPUÉS de este
  -- disparador. Si se construyera aquí su tsrange, el error sería el de límites
  -- del rango y no el del CHECK: se sale y se deja que el CHECK hable.
  IF NEW."hasta" IS NOT NULL AND NEW."hasta" < NEW."desde" THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" o
     WHERE o."equipment_id" = NEW."equipment_id" AND o."id" <> NEW."id"
       AND tsrange(o."desde", o."hasta", '[)') && tsrange(NEW."desde", NEW."hasta", '[)')
  ) THEN
    RAISE EXCEPTION 'Esta bandeja ya lleva otro lote en ese intervalo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "drying_run_tray_exigir_bandeja_valida"
  BEFORE INSERT OR UPDATE OF "equipment_id", "drying_run_id", "desde", "hasta"
  ON "traceability"."drying_run_tray"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_bandeja_valida"();

-- Del lado de la corrida: cama O bandejas, y no se cierra con bandejas abiertas
-- (el secado termina bandeja a bandeja: decisión de Daniel del 2026-09-18).
CREATE OR REPLACE FUNCTION "traceability"."exigir_corrida_coherente_con_bandejas"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."drying_bed_location_id" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" WHERE "drying_run_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Una corrida con bandejas no lleva cama';
  END IF;
  IF NEW."ended_at" IS NOT NULL AND EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" WHERE "drying_run_id" = NEW."id" AND "hasta" IS NULL
  ) THEN
    RAISE EXCEPTION 'No se cierra un secado con bandejas sin bajar';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "drying_run_coherente_con_bandejas"
  BEFORE UPDATE OF "drying_bed_location_id", "ended_at" ON "traceability"."drying_run"
  FOR EACH ROW EXECUTE FUNCTION "traceability"."exigir_corrida_coherente_con_bandejas"();

-- Del lado del equipo: un recipiente que lleva o llevó una bandeja no cambia de
-- `kind`. Sin esto, `UPDATE equipment SET kind = 'instrument', format = NULL`
-- dejaba una bandeja atada a un instrumento sin disparar nada (revisión de Codex).
CREATE OR REPLACE FUNCTION "core"."exigir_bandeja_sigue_siendo_recipiente"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."kind" IS DISTINCT FROM 'vessel' AND EXISTS (
    SELECT 1 FROM "traceability"."drying_run_tray" WHERE "equipment_id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Una bandeja de secado debe ser un equipo de tipo recipiente (es %)', NEW."kind";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "equipment_bandeja_sigue_siendo_recipiente"
  BEFORE UPDATE OF "kind" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."exigir_bandeja_sigue_siendo_recipiente"();
```

- [ ] **Paso 4: el esquema**

En `prisma/schema.prisma`, después de `model DryingTurnEvent`:

```prisma
/// Qué bandejas lleva el secado de un lote (spec de secado por bandeja §4.3).
/// Un lote se reparte en varias; cada bandeja lleva un solo lote a la vez. La
/// POSICIÓN no es columna: es el último EquipmentTransfer de la bandeja hacia
/// una drying_bed. Las reglas viven en la migración `bandejas_de_la_corrida`.
model DryingRunTray {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  dryingRunId     String          @map("drying_run_id") @db.Uuid
  dryingRun       DryingRun       @relation(fields: [dryingRunId], references: [id], onDelete: Restrict)
  equipmentId     String          @map("equipment_id") @db.Uuid
  equipment       Equipment       @relation("DryingRunTrayEquipment", fields: [equipmentId], references: [id], onDelete: Restrict)
  /// Cuándo se cargó la bandeja con este lote.
  desde           DateTime
  /// Cuándo se bajó. Nulo mientras sigue cargada. Bajar NO afirma que llegó a
  /// meta: la humedad con la que baja es una inspección de la bandeja (paso 3).
  hasta           DateTime?
  provenanceClass ProvenanceClass @map("provenance_class")
  createdAt       DateTime        @default(now()) @map("created_at")
  createdBy       String?         @map("created_by") @db.Uuid
  creator         UserAccount?    @relation("DryingRunTrayCreatedBy", fields: [createdBy], references: [id])

  @@index([dryingRunId])
  @@index([equipmentId])
  @@map("drying_run_tray")
  @@schema("traceability")
}
```

Relaciones inversas:
- en `model DryingRun`, al lado de `turningEvents`: `trays DryingRunTray[]`;
- en `model Equipment`, al lado de `measurements`: `dryingRunTrays DryingRunTray[] @relation("DryingRunTrayEquipment")`;
- en `model UserAccount`: `dryingRunTraysCreated DryingRunTray[] @relation("DryingRunTrayCreatedBy")`.

**El índice parcial no va en el esquema.** Prisma no lo expresa, igual que los disparadores. Después de `npx prisma migrate deploy` hay que correr el guardia de deriva **con** `SHADOW_DATABASE_URL`: el 2026-09-16 sólo vio un índice que faltaba en el esquema cuando se le dio. Si se queja del índice parcial, se hace lo que ya hicieron las migraciones anteriores con índices parciales: localizarlas con `grep -rl "WHERE" prisma/migrations/*/migration.sql` y seguir su forma. No se inventa otra.

`npm run prisma:generate`.

- [ ] **Paso 5: comprobar que pasan**

`npx vitest run tests/traceability/bandejasEnLaBase.test.ts` → 11/11. Después `npm run build` → 0.

**Las dos pruebas de carrera tienen que fallar por la razón correcta si se quita el bloqueo.** Es el flip 1b de la Tarea 5. Si en la base compartida salen intermitentes por carga, se sube la espera a 3 s. **No** se marcan como `skip`.

- [ ] **Paso 6: commit**

```bash
git add prisma/migrations/20260918191000_bandejas_de_la_corrida/migration.sql
git add prisma/schema.prisma
git add tests/traceability/bandejasEnLaBase.test.ts
git add scripts/pruebas-por-compuerta.txt
git diff --cached --stat   # 4 archivos
git commit -F <archivo>
```

Mensaje: `feat(secado): DryingRunTray — el lote en sus bandejas, con sus reglas en la base`.

---

### Tarea 3: el servicio de bandejas, el cierre con la última y la guarda del cierre

**Archivos:**
- Crear: `lib/traceability/bandejaError.ts` (el error, aparte, para que `drying.ts` y `bandejas.ts` no se importen en círculo)
- Crear: `lib/traceability/bandejas.ts`
- Modificar: `lib/traceability/drying.ts` (`endDryingRun` y una función nueva `cerrarCorridaEnTransaccion`)
- Modificar: `lib/equipos/equipos.ts` (una función exportada nueva, `puedeVerEquipo`)
- Crear: `tests/traceability/bandejas.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`)

**Interfaces:**
- Consume `prisma.dryingRunTray` (T2), `Location.rackRow` (T1) y `requireLotAccess` (`lib/traceability/lots`).
- Produce:

```ts
// lib/traceability/bandejaError.ts
export type CodigoBandeja =
  | "corrida_no_encontrada" | "bandeja_no_encontrada" | "secado_cerrado" | "corrida_con_cama"
  | "no_es_bandeja" | "bandeja_de_otra_organizacion" | "bandeja_sin_acceso" | "bandeja_retirada"
  | "bandeja_ocupada" | "fecha_antes_del_secado" | "fecha_antes_de_cargar" | "ya_bajada"
  | "la_ultima_cierra_el_secado" | "quedan_otras_bandejas" | "bandejas_sin_bajar";
export class BandejaError extends Error { readonly codigo: CodigoBandeja }

// lib/traceability/drying.ts
export type CierreDelSecado = Omit<EndDryingRunInput, "dryingRunId" | "endedAt">;
export async function cerrarCorridaEnTransaccion(tx, userAccountId: string, dryingRunId: string, sourceLot: Lot, input: EndDryingRunInput)
  : Promise<{ run; transformation; outputLot; reconciliation }>;

// lib/equipos/equipos.ts
export async function puedeVerEquipo(userAccountId: string, equipo: { id: string; projectId: string | null; classification: ClassificationLevel }): Promise<boolean>;

// lib/traceability/bandejas.ts
export interface Posicion { camaId: string; ajena: boolean; cama: string | null; instalacion: string | null; nivel: number | null; fila: number | null }
export interface BandejaEnCorrida {
  id: string; equipmentId: string; nombre: string; desde: Date; hasta: Date | null;
  posicion: Posicion | null;   // null = nunca se trasladó a una cama
  conflicto: string[];         // OTRAS bandejas de la organización cuyo último traslado es esta misma cama
}
export async function cargarBandeja(userAccountId: string, input: { dryingRunId: string; equipmentId: string; desde: Date }): Promise<{ id: string }>;
export async function bajarBandeja(userAccountId: string, input: { dryingRunTrayId: string; hasta: Date; cierre?: CierreDelSecado | null }): Promise<{ id: string; cerro: boolean }>;
export async function bandejasDeCorrida(userAccountId: string, dryingRunId: string): Promise<BandejaEnCorrida[]>;
export async function bandejasDisponibles(userAccountId: string, dryingRunId: string): Promise<{ id: string; nombre: string }[]>;
export async function posicionDeBandeja(equipmentId: string, en: Date, organizationId: string): Promise<Posicion | null>;
```

**Tres decisiones de esta tarea**, con su porqué, para que el revisor pueda rechazarlas:

1. **Bajar la última bandeja cierra el secado, en la misma transacción.** Daniel decidió que «el lote termina cuando baja la última» (spec §2). Si fueran dos pasos, entre uno y otro habría un secado con todas las bandejas abajo que sigue «secando», admite cargas nuevas y dice algo falso en el tablero. Por eso, bajar la última **pide los datos de cierre** que ya pide `endDryingRun` (código y tipo del lote de salida, cantidad y desenlace) y ejecuta el mismo cierre con `endedAt = hasta`. Sin esos datos se rechaza con `la_ultima_cierra_el_secado`. El paso a almacenamiento sigue siendo aparte y manual.
2. **Ver la bandeja es un permiso de equipos, no del lote.** Gestionar el lote no da derecho sobre cualquier equipo de la organización. Cargar exige, además, `can(view, equipment)` sobre esa bandeja: el mismo que usan `disponibilidadDeRecipientes` e `instrumentosParaMedicion`. Una cama de **otra organización** no devuelve su nombre, sólo `ajena: true`.
3. **El conflicto es de ocupación física, no de carga.** Se compara el último traslado de cada recipiente de la organización, esté cargado o no (spec §4.2). Una bandeja ya bajada que sigue registrada en la posición **es** un conflicto: el registro dice que está ahí.

- [ ] **Paso 1: las pruebas que fallan**

`tests/traceability/bandejas.test.ts`. **El operador tiene su permiso por UBICACIÓN, en un sitio de prueba propio, y no por proyecto.** Una bandeja trasladada a una cama se autoriza por esa ubicación (`objetivoDeEquipo`), así que un operador asignado a un proyecto dejaría de verla en cuanto se moviera.

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, TraceabilityAccessError } from "../../lib/traceability/lots";
import { endDryingRun, startDryingRun } from "../../lib/traceability/drying";
import { bajarBandeja, bandejasDeCorrida, bandejasDisponibles, cargarBandeja, posicionDeBandeja } from "../../lib/traceability/bandejas";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `bdj-${Date.now()}`;
let org: string; let otraOrg: string;
let sitio: string; let otroSitio: string; let sitioDeOtraOrg: string;
let operador: string; let ajeno: string;
const equipos: string[] = []; const ubicaciones: string[] = []; // hijos antes que padres
const cierre = (codigo: string) => ({ outputLotCode: `${RUN_ID}-${codigo}-verde`, outputLotType: "green" as const, provenanceClass: "original_record" as const });

async function ubicacion(data: { name: string; locationType: "site" | "drying_facility" | "drying_bed"; organizationId: string; parentLocationId?: string; rackLevel?: number; rackRow?: number }) {
  const l = await prisma.location.create({ data: { ...data, name: `${data.name} (${RUN_ID})` } });
  ubicaciones.unshift(l.id); return l;
}
async function cuenta(label: string, siteId: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" } });
  const ua = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: siteId } });
  await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: perfil.id, scopeId: scope.id } });
  return ua.id;
}
async function trasladar(equipmentId: string, toLocationId: string, occurredAt: string) {
  await prisma.equipmentTransfer.create({ data: { equipmentId, toLocationId, occurredAt: new Date(occurredAt) } });
}
/** Un recipiente registrado en un sitio: su primer traslado es su alta, como hace `registrarEquipo`. */
async function bandeja(n: string, o: { organizationId?: string; kind?: "vessel" | "instrument"; alta?: string } = {}) {
  const e = await prisma.equipment.create({ data: {
    name: `TEST Bandeja ${n} (${RUN_ID})`, kind: o.kind ?? "vessel", format: (o.kind ?? "vessel") === "vessel" ? "other" : null,
    organizationId: o.organizationId ?? org, provenanceClass: "original_record",
  } });
  equipos.push(e.id);
  await trasladar(e.id, o.alta ?? sitio, "2026-08-01T00:00:00Z");
  return e;
}
async function posicion(nivel: number, fila: number, organizationId = org, padre = sitio) {
  const inv = await ubicacion({ name: `TEST Cuarto N${nivel}F${fila}`, locationType: "drying_facility", organizationId, parentLocationId: padre });
  return ubicacion({ name: `TEST N${nivel}F${fila}`, locationType: "drying_bed", organizationId, parentLocationId: inv.id, rackLevel: nivel, rackRow: fila });
}
async function secado(codigo: string) {
  const lot = await createLot(operador, { lotCode: `${RUN_ID}-${codigo}`, lotType: "drying", organizationId: org, locationId: sitio });
  const { run } = await startDryingRun(operador, { lotId: lot.id, startedAt: new Date("2026-09-01T10:00:00Z"), provenanceClass: "original_record" });
  return run;
}

beforeAll(async () => {
  org = await createTestOrganization(RUN_ID);
  otraOrg = await createTestOrganization(`${RUN_ID}-otra`);
  sitio = (await ubicacion({ name: "TEST Sitio", locationType: "site", organizationId: org })).id;
  otroSitio = (await ubicacion({ name: "TEST Otro sitio", locationType: "site", organizationId: org })).id;
  sitioDeOtraOrg = (await ubicacion({ name: "TEST Sitio ajeno", locationType: "site", organizationId: otraOrg })).id;
  operador = await cuenta("Operador", sitio);
  ajeno = await cuenta("Ajeno", otroSitio);
});

afterAll(async () => {
  const lots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = lots.map((l) => l.id);
  const runs = await prisma.dryingRun.findMany({ where: { transformations: { some: { inputs: { some: { lotId: { in: lotIds } } } } } } });
  const runIds = runs.map((r) => r.id);
  const trayIds = (await prisma.dryingRunTray.findMany({ where: { dryingRunId: { in: runIds } } })).map((t) => t.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...runIds, ...trayIds] } }) });
  await prisma.dryingRunTray.deleteMany({ where: assertDefinedWhere({ id: { in: trayIds } }) });
  await prisma.equipmentTransfer.deleteMany({ where: assertDefinedWhere({ equipmentId: { in: equipos } }) });
  // El lote de salida del cierre se llama `${RUN_ID}-…-verde`: ya está en `lotIds`.
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: runIds } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  await prisma.equipment.deleteMany({ where: assertDefinedWhere({ id: { in: equipos } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [operador, ajeno] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [sitio, otroSitio] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [operador, ajeno] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  for (const id of ubicaciones) await prisma.location.delete({ where: { id } }); // hijos antes que padres
  await deleteTestOrganizations(RUN_ID);
});

const T = (s: string) => new Date(s);

describe("el secado termina bandeja a bandeja", () => {
  it("bajar la última cierra el secado con su hora; sin datos de cierre no se baja; con otras cargadas no se cierra", async () => {
    const run = await secado("ciclo");
    const [a, b] = [await bandeja("A"), await bandeja("B")];
    const ta = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: a.id, desde: T("2026-09-01T11:00:00Z") });
    const tb = await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });

    await expect(bajarBandeja(operador, { dryingRunTrayId: ta.id, hasta: T("2026-09-04T11:00:00Z"), cierre: cierre("ciclo") })).rejects.toThrow("quedan_otras_bandejas");
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: ta.id } })).hasta).toBeNull(); // la transacción se deshizo
    expect(await bajarBandeja(operador, { dryingRunTrayId: ta.id, hasta: T("2026-09-04T11:00:00Z") })).toEqual({ id: ta.id, cerro: false });

    await expect(bajarBandeja(operador, { dryingRunTrayId: tb.id, hasta: T("2026-09-05T11:00:00Z") })).rejects.toThrow("la_ultima_cierra_el_secado");
    expect((await prisma.dryingRunTray.findUniqueOrThrow({ where: { id: tb.id } })).hasta).toBeNull();

    expect(await bajarBandeja(operador, { dryingRunTrayId: tb.id, hasta: T("2026-09-05T11:00:00Z"), cierre: cierre("ciclo") })).toEqual({ id: tb.id, cerro: true });
    const cerrada = await prisma.dryingRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(cerrada.endedAt).toEqual(T("2026-09-05T11:00:00Z"));
    expect(await prisma.lot.findFirst({ where: { lotCode: `${RUN_ID}-ciclo-verde`, lotType: "green" } })).not.toBeNull();
  });

  it("endDryingRun directo: con bandejas abiertas lo rechaza, pero sólo DESPUÉS del permiso", async () => {
    const run = await secado("directo");
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("directo")).id, desde: T("2026-09-01T11:00:00Z") });
    const cerrar = (quien: string) => endDryingRun(quien, { dryingRunId: run.id, endedAt: T("2026-09-06T11:00:00Z"), ...cierre("directo") });
    await expect(cerrar(ajeno)).rejects.toBeInstanceOf(TraceabilityAccessError); // no revela que hay bandejas
    await expect(cerrar(operador)).rejects.toThrow("bandejas_sin_bajar");
    // Control: un secado sin bandejas cierra por endDryingRun como siempre.
    const sin = await secado("sin-bandejas");
    expect((await endDryingRun(operador, { dryingRunId: sin.id, endedAt: T("2026-09-06T11:00:00Z"), ...cierre("sin-bandejas") })).run.endedAt).toBeTruthy();
  });
});

describe("qué se puede cargar", () => {
  it("rechaza cada caso inválido, al lado de uno que sí entra", async () => {
    const run = await secado("rechazos");
    const desde = T("2026-09-01T11:00:00Z");
    const intentar = (equipmentId: string, d = desde, dryingRunId = run.id) => cargarBandeja(operador, { dryingRunId, equipmentId, desde: d });
    await expect(intentar((await bandeja("instr", { kind: "instrument" })).id)).rejects.toThrow("no_es_bandeja");
    await expect(intentar((await bandeja("otra-org", { organizationId: otraOrg, alta: sitioDeOtraOrg })).id)).rejects.toThrow("bandeja_de_otra_organizacion");
    await expect(intentar((await bandeja("sin-ver", { alta: otroSitio })).id)).rejects.toThrow("bandeja_sin_acceso");
    const retirada = await bandeja("retirada");
    await prisma.equipment.update({ where: { id: retirada.id }, data: { lifecycleStatus: "retired" } });
    await expect(intentar(retirada.id)).rejects.toThrow("bandeja_retirada");
    await expect(intentar((await bandeja("antes")).id, T("2026-08-31T00:00:00Z"))).rejects.toThrow("fecha_antes_del_secado");

    const ok = await bandeja("ok");
    const t = await intentar(ok.id); // control positivo
    await expect(intentar(ok.id, desde, (await secado("otro")).id)).rejects.toThrow("bandeja_ocupada");
    await expect(bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-01T10:00:00Z") })).rejects.toThrow("fecha_antes_de_cargar");
    await bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-02T10:00:00Z"), cierre: cierre("rechazos") });
    await expect(bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-03T10:00:00Z") })).rejects.toThrow(/ya_bajada|secado_cerrado/);
  });

  it("una corrida con cama no lleva bandejas: el servicio lo dice con su código", async () => {
    const run = await secado("con-cama");
    await prisma.dryingRun.update({ where: { id: run.id }, data: { dryingBedLocationId: (await posicion(9, 9)).id } });
    await expect(cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("en-cama")).id, desde: T("2026-09-01T11:00:00Z") }))
      .rejects.toThrow("corrida_con_cama");
  });

  it("un rechazo de la BASE llega como código, no como error de SQL", async () => {
    // La lectura previa del servicio sólo mira filas ABIERTAS; un intervalo cerrado
    // que se solapa lo caza el disparador. Tiene que llegar como `bandeja_ocupada`.
    const b = await bandeja("solape");
    const r1 = await secado("solape-1");
    const t1 = await cargarBandeja(operador, { dryingRunId: r1.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    await bajarBandeja(operador, { dryingRunTrayId: t1.id, hasta: T("2026-09-05T11:00:00Z"), cierre: cierre("solape-1") });
    await expect(cargarBandeja(operador, { dryingRunId: (await secado("solape-2")).id, equipmentId: b.id, desde: T("2026-09-03T11:00:00Z") }))
      .rejects.toThrow("bandeja_ocupada");
  });
});

describe("permisos y auditoría", () => {
  it("quien no ve el lote no carga ni lista; quien sí, sí", async () => {
    const run = await secado("permiso");
    const b = await bandeja("permiso");
    await expect(cargarBandeja(ajeno, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") })).rejects.toBeInstanceOf(TraceabilityAccessError);
    await expect(bandejasDeCorrida(ajeno, run.id)).rejects.toBeInstanceOf(TraceabilityAccessError);
    await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: b.id, desde: T("2026-09-01T11:00:00Z") });
    expect(await bandejasDeCorrida(operador, run.id)).toHaveLength(1);
  });

  it("escribe su AuditEvent al cargar y al bajar", async () => {
    const run = await secado("audit");
    const [t, otra] = [
      await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("audit")).id, desde: T("2026-09-01T11:00:00Z") }),
      await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: (await bandeja("audit-2")).id, desde: T("2026-09-01T11:00:00Z") }),
    ];
    await bajarBandeja(operador, { dryingRunTrayId: t.id, hasta: T("2026-09-02T11:00:00Z") });
    const ops = (await prisma.auditEvent.findMany({ where: { entityType: "drying_run_tray", entityId: t.id } })).map((e) => e.operation).sort();
    expect(ops).toEqual(["drying_run_tray.bajar", "drying_run_tray.cargar"]);
    expect(otra.id).toBeTruthy();
  });
});

describe("dónde está cada bandeja", () => {
  it("una bandeja movida dos veces responde dónde estaba en cada momento", async () => {
    const [p1, p2] = [await posicion(1, 1), await posicion(3, 2)];
    const b = await bandeja("movida");
    await trasladar(b.id, p1.id, "2026-09-01T12:00:00Z");
    await trasladar(b.id, p2.id, "2026-09-03T12:00:00Z");
    expect(await posicionDeBandeja(b.id, T("2026-08-15T00:00:00Z"), org)).toBeNull(); // en el sitio, no en una cama
    expect(await posicionDeBandeja(b.id, T("2026-09-02T00:00:00Z"), org)).toMatchObject({ camaId: p1.id, ajena: false, nivel: 1, fila: 1 });
    expect(await posicionDeBandeja(b.id, T("2026-09-04T00:00:00Z"), org)).toMatchObject({ camaId: p2.id, ajena: false, nivel: 3, fila: 2 });
  });

  it("una cama de otra organización no dice su nombre", async () => {
    const ajenaCama = await posicion(4, 4, otraOrg, sitioDeOtraOrg);
    const b = await bandeja("en-cama-ajena");
    await trasladar(b.id, ajenaCama.id, "2026-09-01T12:00:00Z");
    expect(await posicionDeBandeja(b.id, T("2026-09-02T00:00:00Z"), org))
      .toEqual({ camaId: ajenaCama.id, ajena: true, cama: null, instalacion: null, nivel: null, fila: null });
  });

  it("conflicto = otro recipiente de la organización registrado en la misma cama, cargado o no", async () => {
    const run = await secado("conflicto");
    const [p, sola] = [await posicion(2, 2), await posicion(2, 3)];
    const [a, b, c] = [await bandeja("C1"), await bandeja("C2"), await bandeja("C3")];
    for (const e of [a, b, c]) await cargarBandeja(operador, { dryingRunId: run.id, equipmentId: e.id, desde: T("2026-09-01T11:00:00Z") });
    await trasladar(a.id, p.id, "2026-09-01T12:00:00Z");
    await trasladar(b.id, p.id, "2026-09-01T12:30:00Z");
    await trasladar(c.id, sola.id, "2026-09-01T12:00:00Z");
    const vacia = await bandeja("vacia-en-p");              // de la organización, SIN cargar, registrada en p
    await trasladar(vacia.id, p.id, "2026-09-01T13:00:00Z");
    const deOtra = await bandeja("de-otra-en-p", { organizationId: otraOrg, alta: sitioDeOtraOrg });
    await trasladar(deOtra.id, p.id, "2026-09-01T13:00:00Z"); // otra organización: no cuenta ni se nombra

    const filas = await bandejasDeCorrida(operador, run.id);
    const por = (id: string) => filas.find((f) => f.equipmentId === id)!;
    expect(por(a.id).conflicto.sort()).toEqual([b.name, vacia.name].sort());
    expect(por(b.id).conflicto.sort()).toEqual([a.name, vacia.name].sort());
    expect(por(c.id)).toMatchObject({ conflicto: [] });      // sola en su posición real: sin conflicto
    expect(por(c.id).posicion).toMatchObject({ camaId: sola.id, nivel: 2, fila: 3 });
    expect(filas.flatMap((f) => f.conflicto)).not.toContain(deOtra.name);
  });

  it("disponibles: recipientes activos, de la organización, visibles y libres", async () => {
    const run = await secado("disponibles");
    const libre = await bandeja("libre");
    const ocupada = await bandeja("ocupada");
    await cargarBandeja(operador, { dryingRunId: (await secado("ocupa")).id, equipmentId: ocupada.id, desde: T("2026-09-01T11:00:00Z") });
    const instr = await bandeja("instr-disp", { kind: "instrument" });
    const retirada = await bandeja("retirada-disp");
    await prisma.equipment.update({ where: { id: retirada.id }, data: { lifecycleStatus: "retired" } });
    const deOtra = await bandeja("otra-disp", { organizationId: otraOrg, alta: sitioDeOtraOrg });
    const sinVer = await bandeja("sin-ver-disp", { alta: otroSitio });

    const ids = (await bandejasDisponibles(operador, run.id)).map((d) => d.id);
    expect(ids).toContain(libre.id); // control positivo
    for (const fuera of [ocupada, instr, retirada, deOtra, sinVer]) expect(ids).not.toContain(fuera.id);
  });
});
```

Añadir `tests/traceability/bandejas.test.ts` al grupo `base-sembrada`, debajo de `bandejasEnLaBase.test.ts`.

- [ ] **Paso 2: comprobar que fallan**

`npx vitest run tests/traceability/bandejas.test.ts` → FALLA: el módulo `lib/traceability/bandejas` no existe.

- [ ] **Paso 3: el error, el permiso de equipos y el cierre reutilizable**

`lib/traceability/bandejaError.ts`:

```ts
/** Los rechazos de las bandejas de secado, con un código que la pantalla traduce. */
export type CodigoBandeja =
  | "corrida_no_encontrada" | "bandeja_no_encontrada" | "secado_cerrado" | "corrida_con_cama"
  | "no_es_bandeja" | "bandeja_de_otra_organizacion" | "bandeja_sin_acceso" | "bandeja_retirada"
  | "bandeja_ocupada" | "fecha_antes_del_secado" | "fecha_antes_de_cargar" | "ya_bajada"
  | "la_ultima_cierra_el_secado" | "quedan_otras_bandejas" | "bandejas_sin_bajar";

export class BandejaError extends Error {
  constructor(readonly codigo: CodigoBandeja) { super(codigo); this.name = "BandejaError"; }
}
```

En `lib/equipos/equipos.ts`, debajo de `puedeGestionarEquipo`:

```ts
/**
 * ¿Puede esta persona ver este equipo? El mismo `can(view)` que ya usan
 * `disponibilidadDeRecipientes` e `instrumentosParaMedicion`. Lo pide cargar una
 * bandeja de secado: gestionar el lote no da derecho sobre cualquier equipo.
 */
export async function puedeVerEquipo(
  userAccountId: string,
  equipo: { id: string; projectId: string | null; classification: ClassificationLevel },
): Promise<boolean> {
  return can(userAccountId, "view", "equipment", await objetivoDeEquipo(equipo), equipo.classification);
}
```

En `lib/traceability/drying.ts`:
- los imports: `import { BandejaError } from "./bandejaError";` y añadir `Lot` al `import type` del cliente generado;
- el cuerpo de la transacción de `endDryingRun`, **tal como está hoy**, desde `const endedRun = await tx.dryingRun.update(` hasta el `return { run: endedRun, transformation, outputLot, reconciliation };`, se mueve **sin cambios** a una función exportada:

```ts
export type CierreDelSecado = Omit<EndDryingRunInput, "dryingRunId" | "endedAt">;

/**
 * El cierre de un secado dentro de una transacción ajena: lo usan `endDryingRun`
 * y bajar la última bandeja (`lib/traceability/bandejas.ts`), que cierra en la
 * MISMA transacción en que la baja. El permiso lo exige quien llama.
 */
export async function cerrarCorridaEnTransaccion(
  tx: Parameters<typeof settleMassBalance>[0],
  userAccountId: string,
  dryingRunId: string,
  sourceLot: Lot,
  input: EndDryingRunInput,
) {
  const provenanceClass = input.provenanceClass;
  // … el cuerpo movido, con `input.dryingRunId` sustituido por `dryingRunId` …
}
```

Y `endDryingRun` queda así:

```ts
export async function endDryingRun(userAccountId: string, input: EndDryingRunInput) {
  const run = await prisma.dryingRun.findUnique({ where: { id: input.dryingRunId } });
  if (!run) throw new TraceabilityAccessError("drying_run_not_found");
  if (run.endedAt) throw new TraceabilityAccessError("drying_run_already_ended");

  const sourceLot = await resolveRunSourceLot(input.dryingRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  // DESPUÉS del permiso: a quien no gestiona el lote no se le dice si hay bandejas
  // (revisión de Codex del plan). El secado termina bandeja a bandeja (Daniel,
  // 2026-09-18); el disparador de `bandejas_de_la_corrida` cierra la carrera.
  if (await prisma.dryingRunTray.count({ where: { dryingRunId: run.id, hasta: null } }) > 0) {
    throw new BandejaError("bandejas_sin_bajar");
  }

  return prisma.$transaction((tx) => cerrarCorridaEnTransaccion(tx, userAccountId, run.id, sourceLot, input));
}
```

Comprobar con `npx vitest run tests/traceability/drying.test.ts` que el cierre de siempre sigue igual **antes** de seguir. Es el control de que el movimiento no cambió nada.

- [ ] **Paso 4: el servicio**

`lib/traceability/bandejas.ts`:

```ts
/**
 * Las bandejas de un secado (spec de secado por bandeja §4.2–§4.3; paso 2).
 *
 * Un lote se reparte en varias bandejas; cada bandeja lleva un solo lote a la
 * vez; el secado termina bandeja a bandeja, y bajar la última lo CIERRA en la
 * misma transacción (decisiones de Daniel, 2026-09-18). Las reglas duras viven
 * en la base —migración `bandejas_de_la_corrida`—; aquí se comprueban antes para
 * dar un error legible, y lo que la base rechace se traduce al mismo código.
 *
 * La POSICIÓN no se escribe aquí: es el último EquipmentTransfer de la bandeja
 * hacia una drying_bed, y se mueve con `trasladarEquipo`.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { puedeVerEquipo } from "../equipos/equipos";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { cerrarCorridaEnTransaccion, type CierreDelSecado } from "./drying";
import { BandejaError } from "./bandejaError";

export { BandejaError } from "./bandejaError";

export interface Posicion { camaId: string; ajena: boolean; cama: string | null; instalacion: string | null; nivel: number | null; fila: number | null }
export interface BandejaEnCorrida {
  id: string; equipmentId: string; nombre: string; desde: Date; hasta: Date | null;
  posicion: Posicion | null;
  conflicto: string[];
}

/**
 * El lote que se seca en esta corrida, con el permiso ya exigido: `manage` para
 * cargar y bajar, `view` para leer. Misma resolución que `recordDryingTurnEvent`.
 */
async function corridaConPermiso(userAccountId: string, dryingRunId: string, accion: "manage" | "view" = "manage") {
  const run = await prisma.dryingRun.findUnique({ where: { id: dryingRunId } });
  if (!run) throw new BandejaError("corrida_no_encontrada");
  const apertura = await prisma.lotTransformation.findFirst({
    where: { dryingRunId }, orderBy: { occurredAt: "asc" }, include: { inputs: { include: { lot: true } } },
  });
  const lot = apertura?.inputs[0]?.lot;
  if (!lot) throw new TraceabilityAccessError("drying_run_not_found");
  await requireLotAccess(userAccountId, accion, [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  return { run, lot };
}

/**
 * Lo que la base rechaza —dos cargas que ganaron la lectura previa a la vez, un
 * intervalo cerrado que se solapa— llega como el mismo código que da el servicio.
 * Los textos son los de la migración, sin tildes a propósito.
 */
function traducirRechazo(error: unknown): unknown {
  if (error instanceof BandejaError) return error;
  const texto = error instanceof Error ? error.message : String(error);
  if ((error as { code?: string })?.code === "P2002" || /ya lleva otro lote/.test(texto)) return new BandejaError("bandeja_ocupada");
  if (/con cama no lleva bandejas/.test(texto)) return new BandejaError("corrida_con_cama");
  if (/ya esta cerrado/.test(texto)) return new BandejaError("secado_cerrado");
  if (/tipo recipiente/.test(texto)) return new BandejaError("no_es_bandeja");
  if (/bandejas sin bajar/.test(texto)) return new BandejaError("bandejas_sin_bajar");
  return error;
}

export async function cargarBandeja(userAccountId: string, input: { dryingRunId: string; equipmentId: string; desde: Date }) {
  const { run, lot } = await corridaConPermiso(userAccountId, input.dryingRunId);
  if (run.endedAt) throw new BandejaError("secado_cerrado");
  if (run.dryingBedLocationId) throw new BandejaError("corrida_con_cama");
  if (input.desde < run.startedAt) throw new BandejaError("fecha_antes_del_secado");
  const equipo = await prisma.equipment.findUnique({ where: { id: input.equipmentId } });
  if (!equipo || equipo.kind !== "vessel") throw new BandejaError("no_es_bandeja");
  if (equipo.organizationId !== lot.organizationId) throw new BandejaError("bandeja_de_otra_organizacion");
  if (!(await puedeVerEquipo(userAccountId, equipo))) throw new BandejaError("bandeja_sin_acceso");
  if (equipo.lifecycleStatus !== "active") throw new BandejaError("bandeja_retirada");
  if (await prisma.dryingRunTray.findFirst({ where: { equipmentId: equipo.id, hasta: null } })) throw new BandejaError("bandeja_ocupada");

  try {
    return await prisma.$transaction(async (tx) => {
      const fila = await tx.dryingRunTray.create({ data: {
        dryingRunId: run.id, equipmentId: equipo.id, desde: input.desde,
        provenanceClass: "original_record", createdBy: userAccountId,
      } });
      await recordAuditEvent({
        actorUserAccountId: userAccountId, operation: "drying_run_tray.cargar", entityType: "drying_run_tray",
        entityId: fila.id, after: fila, sourceInterface: "traceability.service",
      }, tx);
      return { id: fila.id };
    });
  } catch (error) {
    throw traducirRechazo(error);
  }
}

export async function bajarBandeja(
  userAccountId: string,
  input: { dryingRunTrayId: string; hasta: Date; cierre?: CierreDelSecado | null },
) {
  const fila = await prisma.dryingRunTray.findUnique({ where: { id: input.dryingRunTrayId } });
  if (!fila) throw new BandejaError("bandeja_no_encontrada");
  const { run, lot } = await corridaConPermiso(userAccountId, fila.dryingRunId);
  if (run.endedAt) throw new BandejaError("secado_cerrado");
  if (fila.hasta) throw new BandejaError("ya_bajada");
  if (input.hasta < fila.desde) throw new BandejaError("fecha_antes_de_cargar");

  try {
    return await prisma.$transaction(async (tx) => {
      // La corrida quieta: «¿es la última?» se decide sin que otra pestaña cargue
      // o baje en medio. Mismo orden de bloqueo que el disparador (corrida primero).
      await tx.$queryRaw`SELECT 1 FROM "traceability"."drying_run" WHERE "id" = ${run.id}::uuid FOR UPDATE`;
      const { count } = await tx.dryingRunTray.updateMany({ where: { id: fila.id, hasta: null }, data: { hasta: input.hasta } });
      if (count !== 1) throw new BandejaError("ya_bajada");
      const quedan = await tx.dryingRunTray.count({ where: { dryingRunId: run.id, hasta: null } });
      if (quedan === 0 && !input.cierre) throw new BandejaError("la_ultima_cierra_el_secado");
      if (quedan > 0 && input.cierre) throw new BandejaError("quedan_otras_bandejas");
      await recordAuditEvent({
        actorUserAccountId: userAccountId, operation: "drying_run_tray.bajar", entityType: "drying_run_tray",
        entityId: fila.id, before: fila, after: { ...fila, hasta: input.hasta }, sourceInterface: "traceability.service",
      }, tx);
      if (quedan === 0 && input.cierre) {
        await cerrarCorridaEnTransaccion(tx, userAccountId, run.id, lot, { ...input.cierre, dryingRunId: run.id, endedAt: input.hasta });
      }
      return { id: fila.id, cerro: quedan === 0 };
    });
  } catch (error) {
    throw traducirRechazo(error);
  }
}

/**
 * Dónde estaba una bandeja en un instante: su último traslado hasta entonces, si
 * fue a una cama. **No recibe principal**: la llaman `bandejasDeCorrida`, que ya
 * exigió el permiso, y las pruebas. Una cama de OTRA organización no dice su
 * nombre (`ajena: true`), porque `trasladarEquipo` no restringe el destino.
 */
export async function posicionDeBandeja(equipmentId: string, en: Date, organizationId: string): Promise<Posicion | null> {
  const t = await prisma.equipmentTransfer.findFirst({
    where: { equipmentId, occurredAt: { lte: en } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    include: { toLocation: { include: { parentLocation: true } } },
  });
  const cama = t?.toLocation;
  if (!cama || cama.locationType !== "drying_bed") return null;
  if (cama.organizationId !== organizationId) {
    return { camaId: cama.id, ajena: true, cama: null, instalacion: null, nivel: null, fila: null };
  }
  return { camaId: cama.id, ajena: false, cama: cama.name, instalacion: cama.parentLocation?.name ?? null, nivel: cama.rackLevel, fila: cama.rackRow };
}

export async function bandejasDeCorrida(userAccountId: string, dryingRunId: string): Promise<BandejaEnCorrida[]> {
  const { lot } = await corridaConPermiso(userAccountId, dryingRunId, "view");
  const filas = await prisma.dryingRunTray.findMany({
    where: { dryingRunId }, orderBy: [{ desde: "asc" }], include: { equipment: true },
  });
  const ahora = new Date();
  const conPosicion = await Promise.all(filas.map(async (f) => ({
    f, posicion: await posicionDeBandeja(f.equipmentId, f.hasta ?? ahora, lot.organizationId),
  })));

  // Conflicto (§4.2) = ocupación FÍSICA: otro recipiente de la organización cuyo
  // último traslado también es esta cama, esté cargado o no. El registro dice que
  // está ahí, y una posición lleva una bandeja. Se enseña; no se bloquea.
  const camas = [...new Set(conPosicion
    .filter((x) => x.f.hasta === null && x.posicion && !x.posicion.ajena)
    .map((x) => x.posicion!.camaId))];
  const ocupantes = new Map<string, { equipmentId: string; nombre: string }[]>();
  if (camas.length > 0) {
    const candidatos = await prisma.equipmentTransfer.findMany({
      where: { toLocationId: { in: camas }, equipment: { organizationId: lot.organizationId, kind: "vessel" } },
      select: { equipmentId: true, equipment: { select: { name: true } } },
      distinct: ["equipmentId"],
    });
    for (const c of candidatos) {
      const p = await posicionDeBandeja(c.equipmentId, ahora, lot.organizationId);
      if (p && !p.ajena && camas.includes(p.camaId)) {
        ocupantes.set(p.camaId, [...(ocupantes.get(p.camaId) ?? []), { equipmentId: c.equipmentId, nombre: c.equipment.name }]);
      }
    }
  }
  return conPosicion.map(({ f, posicion }) => ({
    id: f.id, equipmentId: f.equipmentId, nombre: f.equipment.name, desde: f.desde, hasta: f.hasta, posicion,
    conflicto: f.hasta === null && posicion && !posicion.ajena
      ? (ocupantes.get(posicion.camaId) ?? []).filter((o) => o.equipmentId !== f.equipmentId).map((o) => o.nombre)
      : [],
  }));
}

export async function bandejasDisponibles(userAccountId: string, dryingRunId: string) {
  const { lot } = await corridaConPermiso(userAccountId, dryingRunId);
  const filas = await prisma.equipment.findMany({
    where: {
      organizationId: lot.organizationId, kind: "vessel", lifecycleStatus: "active",
      dryingRunTrays: { none: { hasta: null } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });
  const visibles = [];
  for (const e of filas) if (await puedeVerEquipo(userAccountId, e)) visibles.push({ id: e.id, nombre: e.name });
  return visibles;
}
```

**Sobre el `take: 200`:** es la forma lenta de «un admin ve la base entera» (CLAUDE.md). El filtro es la organización del lote, así que sólo corta en una organización con más de 200 recipientes libres. Al implementarlo, se cuenta cuántos hay hoy y el número se escribe en el comentario de la función.

- [ ] **Paso 5: comprobar que pasan**

- `npx vitest run tests/traceability/bandejas.test.ts tests/traceability/drying.test.ts tests/equipos/equipos.test.ts` → las tres en verde. `drying.test.ts` es el control del cierre sin bandejas; `equipos.test.ts`, el de que `equipos.ts` no cambió de comportamiento.
- `npm run build` → 0.

- [ ] **Paso 6: commit**

```bash
git add lib/traceability/bandejaError.ts
git add lib/traceability/bandejas.ts
git add lib/traceability/drying.ts
git add lib/equipos/equipos.ts
git add tests/traceability/bandejas.test.ts
git add scripts/pruebas-por-compuerta.txt
git diff --cached --stat   # 6 archivos
git commit -F <archivo>
```

Mensaje: `feat(secado): cargar y bajar bandejas; bajar la última cierra el secado`.

---

### Tarea 4: las bandejas en la ficha del lote

**Archivos:**
- Crear: `app/actions/bandejas.ts`
- Crear: `app/components/traceability/BandejasDelSecado.tsx`
- Modificar: `app/lots/[id]/page.tsx` (tarjeta `activeDrying`, hacia la línea 909)
- Modificar: `messages/es.json`, `messages/en.json` (espacio nuevo `Bandejas`)
- Probar: `tests/arquitectura/use-server-solo-async.test.ts` (ya existe; debe seguir en verde), y `npm run build`

**Interfaces:**
- Consume `cargarBandeja`, `bajarBandeja` (con su `cierre` para la última), `bandejasDeCorrida`, `bandejasDisponibles`, `BandejaError` y `BandejaEnCorrida` (T3).
- Produce:
  - `cargarBandejaAction(prev, formData): Promise<{ error?: string }>`;
  - `bajarBandejaAction(prev, formData): Promise<{ error?: string }>`;
  - `<BandejasDelSecado lotId dryingRunId filas disponibles puedeRegistrar />`.

- [ ] **Paso 1: las acciones de servidor**

`app/actions/bandejas.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { bajarBandeja, BandejaError, cargarBandeja } from "../../lib/traceability/bandejas";
import { TraceabilityAccessError } from "../../lib/traceability/lots";

type Estado = { error?: string };

// Sin `export`: de un archivo "use server" sólo salen funciones async.
function textoOVacio(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function numeroOVacio(v: FormDataEntryValue | null): number | null {
  const s = textoOVacio(v);
  return s === null ? null : Number(s);
}

function codigo(error: unknown): string {
  if (error instanceof BandejaError) return error.codigo;
  if (error instanceof TraceabilityAccessError) return "sin_acceso";
  throw error;
}

export async function cargarBandejaAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lotId = String(formData.get("lotId") ?? "");
  try {
    await cargarBandeja(user.userAccountId, {
      dryingRunId: String(formData.get("dryingRunId") ?? ""),
      equipmentId: String(formData.get("equipmentId") ?? ""),
      desde: new Date(),
    });
  } catch (error) {
    return { error: codigo(error) };
  }
  revalidatePath(`/lots/${lotId}`);
  return {};
}

export async function bajarBandejaAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lotId = String(formData.get("lotId") ?? "");
  // Bajar la última cierra el secado: su formulario trae los mismos datos que el
  // cierre de siempre (`endDryingFormAction`). En las demás no vienen.
  const esUltima = formData.get("esUltima") === "1";
  try {
    await bajarBandeja(user.userAccountId, {
      dryingRunTrayId: String(formData.get("dryingRunTrayId") ?? ""),
      hasta: new Date(),
      cierre: esUltima ? {
        outputLotCode: String(formData.get("outputLotCode") ?? ""),
        // Mismo tratamiento que `endDryingFormAction`: el valor sale de la lista LOT_TYPES del formulario.
        outputLotType: String(formData.get("outputLotType") ?? "green") as never,
        quantity: numeroOVacio(formData.get("quantity")),
        unit: textoOVacio(formData.get("unit")),
        provenanceClass: "original_record",
      } : null,
    });
  } catch (error) {
    return { error: codigo(error) };
  }
  revalidatePath(`/lots/${lotId}`);
  return {};
}
```

La ruta `../../lib/auth/session` es la que usa `app/actions/traceability.ts` (comprobado al escribir el plan). Las fechas son `new Date()` igual que `startDryingAction` y `recordDryingTurnFormAction`. Registrar una hora pasada, con su `TimezoneOffsetField`, queda para cuando haga falta: no se pidió.

- [ ] **Paso 2: el componente**

`app/components/traceability/BandejasDelSecado.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { bajarBandejaAction, cargarBandejaAction } from "../../actions/bandejas";
import { BotonDeEnvio } from "../BotonDeEnvio";

type Fila = {
  id: string; nombre: string; desde: string; hasta: string | null;
  posicion: { ajena: boolean; cama: string | null; instalacion: string | null; nivel: number | null; fila: number | null } | null;
  conflicto: string[];
};
type Props = {
  lotId: string; dryingRunId: string; filas: Fila[]; disponibles: { id: string; nombre: string }[]; puedeRegistrar: boolean;
  /** Los mismos tipos de lote que ofrece el cierre de siempre, ya traducidos por la página: una sola lista. */
  tiposDeSalida: { valor: string; etiqueta: string }[];
};

export function BandejasDelSecado({ lotId, dryingRunId, filas, disponibles, puedeRegistrar, tiposDeSalida }: Props) {
  const t = useTranslations("Bandejas");
  const [cargar, accionCargar] = useActionState(cargarBandejaAction, {});
  const [bajar, accionBajar] = useActionState(bajarBandejaAction, {});
  const abiertas = filas.filter((f) => f.hasta === null).length;
  const donde = (f: Fila) => !f.posicion
    ? t("sinPosicion")
    : f.posicion.ajena
      ? t("posicionAjena")
      : t("posicion", { instalacion: f.posicion.instalacion ?? "—", cama: f.posicion.cama ?? "—", nivel: f.posicion.nivel ?? "—", fila: f.posicion.fila ?? "—" });
  return <section>
    <h4>{t("titulo", { abiertas, total: filas.length })}</h4>
    {filas.length === 0 ? <p className="nn-muted">{t("ninguna")}</p> : <ul>
      {filas.map((f) => <li key={f.id}>
        <strong>{f.nombre}</strong> · {donde(f)} · {f.hasta ? t("bajada") : t("cargada")}
        {f.conflicto.length > 0 && <p role="alert">{t("conflicto", { otras: f.conflicto.join(", ") })}</p>}
        {puedeRegistrar && f.hasta === null && (abiertas > 1
          ? <form action={accionBajar} style={{ display: "inline" }}>
            <input type="hidden" name="lotId" value={lotId} />
            <input type="hidden" name="dryingRunTrayId" value={f.id} />
            <BotonDeEnvio className="nn-button">{t("bajar")}</BotonDeEnvio>
          </form>
          // La última: bajarla cierra el secado, así que pide lo mismo que el cierre de siempre.
          : <form action={accionBajar} className="nn-form" style={{ maxWidth: 420 }}>
            <p>{t("ultimaCierra")}</p>
            <input type="hidden" name="lotId" value={lotId} />
            <input type="hidden" name="dryingRunTrayId" value={f.id} />
            <input type="hidden" name="esUltima" value="1" />
            <label>{t("codigoSalida")}<input name="outputLotCode" type="text" required /></label>
            <label>{t("tipoSalida")}<select name="outputLotType" defaultValue="green">
              {tiposDeSalida.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
            </select></label>
            <label>{t("cantidad")}<input name="quantity" type="number" step="any" min={0} /></label>
            <label>{t("unidad")}<input name="unit" type="text" /></label>
            <BotonDeEnvio className="nn-button">{t("bajarYCerrar")}</BotonDeEnvio>
          </form>)}
      </li>)}
    </ul>}
    {bajar.error && <p role="alert">{t(`error_${bajar.error}`)}</p>}
    {puedeRegistrar && (disponibles.length === 0
      ? <p className="nn-muted">{t("sinDisponibles")}</p>
      : <form action={accionCargar} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input type="hidden" name="lotId" value={lotId} />
        <input type="hidden" name="dryingRunId" value={dryingRunId} />
        <select name="equipmentId" required defaultValue="">
          <option value="" disabled>{t("elegir")}</option>
          {disponibles.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
        </select>
        <BotonDeEnvio className="nn-button">{t("cargar")}</BotonDeEnvio>
      </form>)}
    {cargar.error && <p role="alert">{t(`error_${cargar.error}`)}</p>}
    <p className="nn-muted">{t("comoSeMueve")}</p>
  </section>;
}
```

`../BotonDeEnvio` es la ruta que usan sus vecinos de `app/components/traceability/` (comprobado al escribir el plan).

- [ ] **Paso 3: montarlo en la ficha del lote**

En `app/lots/[id]/page.tsx`:
- los imports: `bandejasDeCorrida` y `bandejasDisponibles` de `../../../lib/traceability/bandejas`, y el componente;
- junto a `inspeccionesDeMedicion`, hacia la línea 181:

```tsx
  // Ver las bandejas pide `view` del lote —el mismo que ya abrió esta página—;
  // cargar y bajar, `manage` (`puedeRegistrar`, línea 118).
  const bandejas = activeDrying ? await bandejasDeCorrida(user.userAccountId, activeDrying.id) : [];
  const bandejasLibres = activeDrying && puedeRegistrar ? await bandejasDisponibles(user.userAccountId, activeDrying.id) : [];
  const bandejasSinBajar = bandejas.filter((b) => b.hasta === null).length;
```

- dentro de la tarjeta `activeDrying`, después de la lista de volteos y antes del formulario de volteo:

```tsx
            <BandejasDelSecado
              lotId={lot.id}
              dryingRunId={activeDrying.id}
              filas={bandejas.map((b) => ({ ...b, desde: b.desde.toISOString(), hasta: b.hasta?.toISOString() ?? null }))}
              disponibles={bandejasLibres}
              puedeRegistrar={puedeRegistrar}
              tiposDeSalida={LOT_TYPES.map((type) => ({ valor: type, etiqueta: t(`lotType_${type}` as "lotType_cherry") }))}
            />
```

- el formulario `endDryingFormAction` se envuelve para que, con bandejas sin bajar, se enseñe en su lugar un párrafo: `{bandejasSinBajar > 0 ? <p className="nn-muted">{tb("cierreEspera", { n: bandejasSinBajar })}</p> : <form …>…</form>}`, con `const tb = await getTranslations("Bandejas");`.

**`puedeRegistrar`** está definida en la línea 118 (`await puedeGestionarLote(user.userAccountId, lot)`), antes de la 181, así que el cálculo de las bandejas va donde se dijo.

- [ ] **Paso 4: los mensajes**

`messages/es.json`, espacio nuevo `"Bandejas"`:

```json
  "Bandejas": {
    "titulo": "Bandejas: {abiertas} cargadas de {total}",
    "ninguna": "Este secado todavía no lleva bandejas. Un lote en cama africana o en lona no las usa.",
    "posicion": "{instalacion}, {cama} — nivel {nivel}, fila {fila}",
    "sinPosicion": "sin posición registrada",
    "cargada": "cargada",
    "bajada": "bajada",
    "conflicto": "Conflicto de datos: en esta misma posición también figura {otras}. Una posición lleva una bandeja; revisa el último traslado de cada una.",
    "bajar": "Bajar",
    "cargar": "Cargar bandeja",
    "elegir": "Elige una bandeja libre",
    "sinDisponibles": "No hay bandejas libres en esta organización. Se registran en Equipos, como recipiente.",
    "comoSeMueve": "Mover una bandeja de nivel o fila es un traslado del equipo: queda quién y cuándo.",
    "cierreEspera": "Este secado va en {n} bandejas cargadas. Termina al bajar la última: su formulario pide los datos del cierre.",
    "posicionAjena": "en una cama de otra organización",
    "ultimaCierra": "Es la última bandeja cargada: al bajarla se cierra el secado del lote. El paso a almacenamiento sigue siendo aparte.",
    "codigoSalida": "Código del lote que sale",
    "tipoSalida": "Tipo del lote que sale",
    "cantidad": "Cantidad (opcional)",
    "unidad": "Unidad (opcional)",
    "bajarYCerrar": "Bajar la última y cerrar el secado",
    "error_sin_acceso": "La cuenta no tiene permiso para gestionar este lote.",
    "error_corrida_no_encontrada": "No se encontró este secado.",
    "error_bandeja_no_encontrada": "No se encontró esa bandeja en este secado.",
    "error_corrida_con_cama": "Este secado está en una cama sin bandejas; no lleva bandejas.",
    "error_bandeja_sin_acceso": "La cuenta no puede ver esa bandeja.",
    "error_la_ultima_cierra_el_secado": "Es la última bandeja: bajarla cierra el secado y hacen falta los datos del cierre.",
    "error_quedan_otras_bandejas": "Quedan otras bandejas cargadas; el secado no se cierra todavía.",
    "error_secado_cerrado": "Este secado ya está cerrado.",
    "error_no_es_bandeja": "Ese equipo no es un recipiente; una bandeja se registra como recipiente.",
    "error_bandeja_de_otra_organizacion": "Esa bandeja es de otra organización.",
    "error_bandeja_retirada": "Esa bandeja está retirada.",
    "error_bandeja_ocupada": "Esa bandeja ya lleva otro lote. Bájala allí primero.",
    "error_fecha_antes_del_secado": "No se carga una bandeja antes de que empiece el secado.",
    "error_fecha_antes_de_cargar": "No se baja una bandeja antes de cargarla.",
    "error_ya_bajada": "Esa bandeja ya se bajó.",
    "error_bandejas_sin_bajar": "Quedan bandejas sin bajar."
  },
```

`messages/en.json`, las mismas claves:

```json
  "Bandejas": {
    "titulo": "Trays: {abiertas} loaded of {total}",
    "ninguna": "This drying run has no trays yet. A lot on an African bed or on tarp does not use them.",
    "posicion": "{instalacion}, {cama} — level {nivel}, row {fila}",
    "sinPosicion": "no position recorded",
    "cargada": "loaded",
    "bajada": "unloaded",
    "conflicto": "Data conflict: {otras} is also recorded at this same position. A position holds one tray; check each tray's last move.",
    "bajar": "Unload",
    "cargar": "Load tray",
    "elegir": "Choose a free tray",
    "sinDisponibles": "No free trays in this organization. They are registered under Equipment, as a vessel.",
    "comoSeMueve": "Moving a tray to another level or row is an equipment move: who and when are recorded.",
    "cierreEspera": "This drying run has {n} trays loaded. It ends when the last one is unloaded: that form asks for the closing data.",
    "posicionAjena": "on a bed of another organization",
    "ultimaCierra": "This is the last loaded tray: unloading it closes the lot's drying. Moving to storage is still a separate step.",
    "codigoSalida": "Code of the outgoing lot",
    "tipoSalida": "Type of the outgoing lot",
    "cantidad": "Quantity (optional)",
    "unidad": "Unit (optional)",
    "bajarYCerrar": "Unload the last tray and close drying",
    "error_sin_acceso": "This account is not allowed to manage this lot.",
    "error_corrida_no_encontrada": "This drying run was not found.",
    "error_bandeja_no_encontrada": "That tray was not found in this drying run.",
    "error_corrida_con_cama": "This drying run is on a bed without trays; it does not take trays.",
    "error_bandeja_sin_acceso": "This account cannot see that tray.",
    "error_la_ultima_cierra_el_secado": "This is the last tray: unloading it closes drying, so the closing data is needed.",
    "error_quedan_otras_bandejas": "Other trays are still loaded; drying does not close yet.",
    "error_secado_cerrado": "This drying run is already closed.",
    "error_no_es_bandeja": "That equipment is not a vessel; a tray is registered as a vessel.",
    "error_bandeja_de_otra_organizacion": "That tray belongs to another organization.",
    "error_bandeja_retirada": "That tray is retired.",
    "error_bandeja_ocupada": "That tray already holds another lot. Unload it there first.",
    "error_fecha_antes_del_secado": "A tray cannot be loaded before drying starts.",
    "error_fecha_antes_de_cargar": "A tray cannot be unloaded before it was loaded.",
    "error_ya_bajada": "That tray was already unloaded.",
    "error_bandejas_sin_bajar": "Some trays are still loaded."
  },
```

**Cada código de `CodigoBandeja` tiene su `error_…`**, más `error_sin_acceso`: 15 + 1 = **16**. Al terminar, contar las claves `error_` de `Bandejas` en los dos idiomas: 16 y 16. Si sale otro número, falta un código o sobra una clave, y la pantalla enseñaría la clave cruda.

- [ ] **Paso 5: compuertas de la tarea**

- `npx vitest run tests/arquitectura/use-server-solo-async.test.ts` → verde.
- `npm run build` → 0.
- `npm run verify` → 0.

Verificación en el navegador: servidor local contra la base de prueba, un lote en secado con dos bandejas, una movida a una cama con nivel y fila. Hay que ver:
- la lista con las dos bandejas;
- el conflicto cuando se trasladan dos a la misma cama;
- que el cierre de siempre desaparece mientras hay bandejas cargadas;
- que la primera se baja con un botón y la segunda, la última, pide los datos del cierre;
- que al bajarla la tarjeta «Secando» desaparece y el lote de salida existe.

Se verifica con `read_page`, no leyendo el código.

- [ ] **Paso 6: commit**

```bash
git add app/actions/bandejas.ts
git add app/components/traceability/BandejasDelSecado.tsx
git add 'app/lots/[id]/page.tsx'
git add messages/es.json
git add messages/en.json
git diff --cached --stat   # 5 archivos
git commit -F <archivo>
```

Mensaje: `feat(secado): las bandejas del lote en su ficha — cargar, bajar y ver dónde está cada una`.

---

### Tarea 5: ADR, inventario, compuerta completa y flip-tests

**Archivos:**
- Modificar: `docs/architecture/DECISIONS.md`
- Modificar: `docs/arquitectura/inventario-de-acceso.md`, y `docs/arquitectura/acceso-a-datos.allowlist.json` sólo si el script lo pide
- Modificar: `docs/superpowers/specs/2026-09-18-secado-por-bandeja-y-su-receta-design.md` (§7)

- [ ] **Paso 1: el ADR**

Número: el siguiente libre. Se mide con `grep -n '^## ADR-' docs/architecture/DECISIONS.md | tail -3`, **no** se supone: al escribir este plan el último era ADR-168, y otras sesiones fusionan a diario.

Contenido:
- los nombres aprobados;
- la posición como traslado y no como columna;
- las seis reglas de la base con su mensaje;
- «bajar no afirma meta», con el porqué;
- lo que queda fuera: el QR, la humedad por bandeja y la cama de una corrida sin bandejas.

- [ ] **Paso 2: el inventario**

`node scripts/inventario-de-acceso.mjs` y copiar sus cifras al documento. Las operaciones nuevas de `lib/traceability/bandejas.ts` son de «guardia directo», porque todas pasan por `corridaConPermiso` antes de tocar la base, **salvo** `posicionDeBandeja`, que no recibe principal. Esa tiene que salir en «depende del llamador», y su llamador, `bandejasDeCorrida`, sí tiene guardia. Si el script la pone en otra fila, se mira a mano y se explica en el allowlist.

- [ ] **Paso 3: la spec**

En §7, la pregunta de modelo pasa a resuelta: «se guarda sólo `hasta`; la humedad es una inspección de la bandeja (paso 3); ver ADR-NNN».

- [ ] **Paso 4: compuerta completa**

Con las variables de la base:

```bash
npx tsc --noEmit; echo "tsc=$?"
npm run verify > /tmp/v.txt 2>&1; echo "verify=$?"
npm run build > /tmp/b.txt 2>&1; echo "build=$?"
npm test > /tmp/t.txt 2>&1; echo "test=$?"
bash scripts/ci.sh > /tmp/c.txt 2>&1; echo "ci=$?"
```

Ninguna se canaliza.
- **`npm test`:** si falla algo fuera de estos archivos, comparar con `main` antes de atribuirlo, porque la base es compartida.
- **`ci.sh`:** las dos pruebas nuevas **no** deben aparecer en su salida.

Commit de la documentación, contando el stat.

- [ ] **Paso 5: flip-tests, contra el commit**

Cada uno imprime el sha del archivo antes y después (distintos, o se aborta), si compila o migra, y **qué prueba cae por su nombre**. Después se restaura con `git checkout --` y se comprueba el árbol limpio.

**Los flips de reglas de la base (1a–1d) corren en una base desechable del mismo clúster.** Editar el archivo de una migración ya aplicada no cambia la base, y la base compartida no se toca.
- Crearla: con `prisma.$executeRawUnsafe` contra la base compartida, **sólo** `CREATE DATABASE nn_flip_bandejas`, que no toca sus datos.
- Migrarla: `DATABASE_URL=…/nn_flip_bandejas npx prisma migrate deploy`.
- Si alguna prueba necesita la semilla, `DATABASE_URL=…/nn_flip_bandejas npm run db:seed`.
- Cada mutación se aplica **en esa base**, con el SQL indicado, y se revierte en ella misma volviendo a ejecutar el bloque original de la migración. **El control de cada flip**: revertida la mutación, la misma prueba vuelve a verde.
- Al final, `DROP DATABASE nn_flip_bandejas`, y comprobar con `SELECT datname FROM pg_database` que ya no está.

1. **Cada defensa de «una bandeja, un lote», por separado** (hallazgo 5 de Codex: quitar las dos juntas sólo prueba la suma):
   - **1a.** Quitar **sólo el bloque de solapamiento** del disparador (`CREATE OR REPLACE` de `exigir_bandeja_valida` sin el `IF EXISTS … tsrange`). «Rechaza dos filas abiertas…» **sigue en verde**, porque lo sostiene el índice. En cambio, **cae** «rechaza un intervalo cerrado que se solapa…», y el nombre que sale tiene que ser exactamente ése.
   - **1b.** Con el bloque de 1a todavía quitado, `DROP INDEX traceability.drying_run_tray_una_abierta_por_bandeja`: ahora **cae** «rechaza dos filas abiertas…». Así se ve que el índice, él solo, sostenía esa prueba.
   - **1c.** Restaurado todo, quitar **sólo los dos `FOR UPDATE`** de `exigir_bandeja_valida`: debe caer «carga primero: el cierre espera y lo rechaza» o «cierra primero…». La línea de control de tiempo (`>= 1400 ms`) dice si hubo carrera. Si cae la de tiempo y no la del mensaje, el flip **no** probó el bloqueo: se anota así y no se cuenta.
   - **1d.** Quitar el disparador `equipment_bandeja_sigue_siendo_recipiente`: debe caer «rechaza cambiar a instrumento un recipiente con bandejas».
2. En `lib/traceability/drying.ts`, quitar la guarda `bandejas_sin_bajar`: debe caer «endDryingRun directo…». Sin la guarda, la base lo rechaza igual, pero con el texto de SQL `bandejas sin bajar`, con espacios. El `toThrow("bandejas_sin_bajar")`, con guiones bajos, es lo que distingue.
3. En `lib/traceability/drying.ts`, **subir** la guarda por encima de `requireLotAccess`: debe caer la misma prueba, en su línea del ajeno (`toBeInstanceOf(TraceabilityAccessError)`).
4. En `bajarBandeja`, quitar la llamada a `cerrarCorridaEnTransaccion`: debe caer «bajar la última cierra el secado…», en `endedAt`.
5. En `bandejasDeCorrida`, quitar el filtro `equipment: { organizationId: … }` de los candidatos: debe caer «conflicto = otro recipiente de la organización…», en su última línea.
6. En `posicionDeBandeja`, quitar `occurredAt: { lte: en }`: debe caer «una bandeja movida dos veces…».
7. En `cargarBandeja`, quitar la comprobación `puedeVerEquipo`: debe caer «rechaza cada caso inválido…», en `bandeja_sin_acceso`.
8. En `traducirRechazo`, devolver siempre `error`: debe caer «un rechazo de la BASE llega como código…».

- [ ] **Paso 6: PR**

```bash
git push -u origin <rama>
gh pr create -R danieljosegiraldez-png/nectar-nomada --base main --head <rama> --title "feat(secado): bandejas y posiciones (paso 2 del spec de secado por bandeja)" --body-file <archivo>
gh pr view <n> -R danieljosegiraldez-png/nectar-nomada --json files --jq '.files | map(.path)'
```

- **Contar los archivos del PR** con `git diff --name-only origin/main...HEAD`, con **tres** puntos. Deben salir los de esta tabla y ninguno más.
- **La fusión es decisión de Daniel.**
