# Catálogos de referencia, rutinas y modelos de equipo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** construir el contrato común de catálogos de referencia (compartidos y propios), el catálogo de modelos de equipo, los datos de identificación de cada equipo, las rutinas periódicas que avisan sin bloquear y los documentos adjuntos, con sus pantallas.

**Architecture:** tablas nuevas en `core` con restricciones en la base (CHECK, índices funcionales y parciales, FK compuesta, un disparador); un módulo común `lib/catalogos/` que decide dueño, visibilidad y permiso; servicios en `lib/equipos/modelos.ts`, `lib/equipos/documentos.ts` y `lib/rutinas/`; una función pura `estadoDeRutina`; pantallas de servidor en `app/equipos/`, con acciones en `app/actions/`.

**Tech Stack:** Next.js 16 (app router, server actions), React 19, TypeScript, Prisma 7 sobre PostgreSQL, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-18-catalogos-y-modelos-de-equipo-design.md` (aprobado por Daniel el 2026-09-18). Quien ejecute lee los dos.

## Global Constraints

- Worktree `~/Developer/nectar-worktrees/catalogos-equipos`, rama `catalogos-equipos`, **rebasada sobre `origin/main`** antes de empezar. Nunca `git add -A`: archivo por archivo, y `git diff --cached --stat` antes de cada commit.
- Node: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npm`/`npx`.
- Commits con `git commit -F <archivo>`, terminados en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Nunca encadenar una compuerta canalizada a un commit.
- **Todo campo nuevo es opcional** salvo los que el spec marca obligatorios (fabricante, modelo, tipo, procedencia; tipo e intervalo de una rutina).
- **Nada se borra**: catálogos y rutinas se **retiran** (`retiredAt`); registros de rutina se **anulan** (`voidedAt` + `voidReason`). Ningún `delete`/`deleteMany` sobre estas tablas en `lib/` ni en `app/`.
- **Las restricciones van en la base.** Lo que el servicio comprueba antes es sólo para devolver un error legible.
- Auditoría: `recordAuditEvent(..., tx)` **dentro de la misma transacción**, con `entityType` como **literal** (lo vigila `tests/arquitectura/vocabulario-de-audit.test.ts`).
- Todo helper que decida un permiso se llama `require…Access` o llama a `can(` en su cuerpo: es lo que reconoce `scripts/inventario-de-acceso.mjs`. Toda función exportada que toque la base recibe `userAccountId` como primer argumento.
- Campos de día (`performedOn`, `warrantyUntil`): se leen con `fechaDeDia` de `lib/time/localDateTime.ts` y se guardan a medianoche UTC. **Nunca** con `parseLocalDateTime`.
- Números en formularios: `<CampoNumerico>` de `app/components/CampoNumerico.tsx`. Envíos: `<BotonDeEnvio>`. Textos en `messages/es.json` **y** `messages/en.json`, espacio `Equipos`.
- Pruebas que necesitan base: al grupo `# @grupo: base-sembrada` de `scripts/pruebas-por-compuerta.txt`. Las herméticas, en ningún grupo.
- Lista de materiales (D4): `acero_inoxidable`, `plastico_alimentario`, `madera`, `vidrio_o_ceramica`, `otro`. Tipos de rutina (D8): `mantenimiento`, `limpieza`, `fumigacion`, `otra`.

### Una desviación del spec, decidida aquí y dicha en el PR

El spec §7 pide que «una rutina de sitio se crea y se registra por el servicio». Los **permisos** de las rutinas de instalación los fija el spec de instalaciones (spec §5), y inventarlos aquí sería justo lo que la casa prohíbe. Así que en esta entrega:

- la **base** admite rutinas de sitio, y las pruebas de esquema (Tarea 1) lo demuestran: XOR, unicidad parcial;
- el **servicio** sólo acepta rutinas de equipo. Una rutina de sitio devuelve `RutinaError("instalaciones_pendiente")`, y hay una prueba que lo afirma.

La Tarea 10 corrige esa línea del spec en el mismo PR.

---

## Tarea 0: Precondiciones y arranque

**Files:** ninguno.

- [ ] **Paso 1: #418 fusionado.** Las pantallas usan `CampoNumerico`, que llega con #418.

```bash
gh pr view 418 -R danieljosegiraldez-png/nectar-nomada --json state --jq .state
```

Esperado: `MERGED`. Si no lo está, **parar y preguntar a Daniel**: no se copia el componente.

- [ ] **Paso 2: saber si #417 está fusionado.**

```bash
gh pr view 417 -R danieljosegiraldez-png/nectar-nomada --json state --jq .state
```

Anotar el resultado. Si es `MERGED`, `lib/equipos/equipos.ts` ya tiene `puedeConfigurar` y la Tarea 5 Paso 3 lo usa. Si no, usa `can(..."manage"...)` como hoy.

- [ ] **Paso 3: rebasar y comprobar dónde se está.**

```bash
cd ~/Developer/nectar-worktrees/catalogos-equipos
git fetch origin && git rebase origin/main
git branch --show-current            # catalogos-equipos
git log origin/main..HEAD --oneline  # sólo el commit del spec (y el del plan)
grep -c 'CampoNumerico' app/components/CampoNumerico.tsx   # ≥ 1: #418 está aquí
```

- [ ] **Paso 4: dependencias y base local.**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm ci --no-audit --no-fund; echo "npm ci=$?"
npx prisma generate; echo "generate=$?"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
export SHADOW_DATABASE_URL="${DATABASE_URL%%\?*}_shadow"
node scripts/crear-base-de-sombra.mjs
npx prisma migrate deploy; echo "migrate=$?"
```

Fila patrón antes de creer nada: `select count(*) from core.equipment;` tiene que devolver un número, no un error. La base 55433 es **compartida**: no se restaura (`test:db -- reset`) sin preguntar.

---

## Tarea 1: Esquema, migración y restricciones

**Files:**
- Modify: `prisma/schema.prisma` (enums nuevos; modelos `EquipmentModel`, `EquipmentModelSpec`, `CareRoutine`, `CareRoutineEvent`; columnas nuevas en `Equipment` y `Asset`; relaciones inversas en `Organization`, `Location` y `Person`)
- Create: `prisma/migrations/20260919090000_catalogos_y_rutinas/migration.sql`
- Test: `tests/equipos/esquemaDeCatalogo.test.ts` (con base)
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produces: modelos Prisma `equipmentModel`, `equipmentModelSpec`, `careRoutine`, `careRoutineEvent`; enums `EquipmentContactMaterial`, `CareRoutineKind`; `Equipment.modelId/serialNumber/internalCode/supplierOrganizationId/warrantyUntil`; `Asset.equipmentId/equipmentModelId`.

- [ ] **Paso 1: escribir la prueba de esquema (falla porque las tablas no existen).**

`tests/equipos/esquemaDeCatalogo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

/**
 * Las restricciones de catálogos y rutinas, probadas CONTRA LA BASE y sin
 * servicio delante: si una vive sólo en TypeScript, un importador o SQL directo
 * se la salta (regla de la casa). Cada rechazo lleva al lado su control
 * positivo —lo válido SÍ entra—, porque «no entró» sobre una fila que ni se
 * construyó no prueba nada.
 */
const RUN = `cat-${Date.now()}`;
let orgA: string, orgB: string, sitioA: string;
const modelos: string[] = [];
const equipos: string[] = [];
const rutinas: string[] = [];

async function rechaza(p: Promise<unknown>) {
  await expect(p).rejects.toThrow();
}

beforeAll(async () => {
  const org = (n: string) =>
    prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${n} ${RUN}`, status: "approved", classification: "internal" } });
  orgA = (await org("A")).id;
  orgB = (await org("B")).id;
  sitioA = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST sitio ${RUN}`, organizationId: orgA, status: "approved", classification: "internal" },
    })
  ).id;
});

afterAll(async () => {
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: { in: rutinas } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rutinas } } });
  await prisma.equipment.deleteMany({ where: { id: { in: equipos } } });
  await prisma.equipmentModelSpec.deleteMany({ where: { modelId: { in: modelos } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: modelos } } });
  await prisma.location.deleteMany({ where: { id: sitioA } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
});

// `Record` y no el tipo de entrada de Prisma: esa entrada es una unión
// (checked/unchecked) y `organizationId` sólo existe en una de las dos. Aquí se
// prueban restricciones de la BASE, a propósito con filas que el tipo rechazaría.
async function modelo(data: Record<string, unknown> & { manufacturer: string; modelName: string }) {
  const m = await prisma.equipmentModel.create({
    data: { kind: "instrument", provenanceClass: "manufacturer_specification", ...data } as never,
  });
  modelos.push(m.id);
  return m;
}

async function equipo(org: string, kind: "instrument" | "vessel", modelId: string | null) {
  const e = await prisma.equipment.create({
    data: { name: `TEST eq ${RUN} ${equipos.length}`, kind, organizationId: org, provenanceClass: "original_record", modelId },
  });
  equipos.push(e.id);
  return e;
}

describe("catálogo de modelos: unicidad sin mayúsculas ni espacios", () => {
  it("dos modelos iguales del mismo dueño chocan; compartido y propio no", async () => {
    await modelo({ manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1", organizationId: orgA });
    await rechaza(modelo({ manufacturer: ` atago ${RUN} `, modelName: "pal-1 ", organizationId: orgA }));
    // Control positivo: el mismo nombre compartido y en otra organización SÍ entra.
    await modelo({ manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1", organizationId: null });
    await modelo({ manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1", organizationId: orgB });
    await rechaza(modelo({ manufacturer: `atago ${RUN}`, modelName: "PAL-1", organizationId: null }));
  });
});

describe("catálogo de modelos: CHECK", () => {
  it("capacidad y material sólo en vaso o máquina", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "cap-instr", kind: "instrument", capacityValue: 10, capacityUnit: "L" }));
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "mat-instr", kind: "instrument", contactMaterial: "madera" }));
    await modelo({ manufacturer: `X ${RUN}`, modelName: "barrica", kind: "vessel", capacityValue: 225, capacityUnit: "L", contactMaterial: "madera" });
  });
  it("capacidad con valor y unidad juntos, o ninguno", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "sin-unidad", kind: "vessel", capacityValue: 10 }));
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "sin-valor", kind: "vessel", capacityUnit: "L" }));
  });
  it("material «otro» exige nota", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "otro-sin-nota", kind: "vessel", contactMaterial: "otro" }));
    await modelo({ manufacturer: `X ${RUN}`, modelName: "otro-con-nota", kind: "vessel", contactMaterial: "otro", contactMaterialNote: "cobre" });
  });
  it("mantenimiento recomendado > 0", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "cero-dias", recommendedMaintenanceDays: 0 }));
  });
  it("especificación: rango no invertido, resolución > 0, precisión ≥ 0", async () => {
    const m = await modelo({ manufacturer: `X ${RUN}`, modelName: "spec" });
    const spec = (d: object) => prisma.equipmentModelSpec.create({ data: { modelId: m.id, quantity: "sólidos solubles", unit: "°Bx", ...d } });
    await rechaza(spec({ rangeMin: 32, rangeMax: 0 }));
    await rechaza(spec({ resolution: 0 }));
    await rechaza(spec({ accuracyAbs: -0.1 }));
    await spec({ rangeMin: 0, rangeMax: 32, resolution: 0.1, accuracyAbs: 0.2 });
  });
});

describe("equipo y modelo: tipo y dueño coherentes en la base", () => {
  it("la FK compuesta rechaza un instrumento con modelo de vaso", async () => {
    const vaso = await modelo({ manufacturer: `X ${RUN}`, modelName: "tanque", kind: "vessel", organizationId: orgA });
    await rechaza(equipo(orgA, "instrument", vaso.id));
    await equipo(orgA, "vessel", vaso.id);
  });
  it("el disparador rechaza un modelo propio de otra organización y acepta uno compartido", async () => {
    const deB = await modelo({ manufacturer: `X ${RUN}`, modelName: "de-B", organizationId: orgB });
    const comp = await modelo({ manufacturer: `X ${RUN}`, modelName: "compartido", organizationId: null });
    await rechaza(equipo(orgA, "instrument", deB.id));
    await equipo(orgA, "instrument", comp.id);
  });
  it("código interno único por organización, sin mayúsculas", async () => {
    const a = await equipo(orgA, "instrument", null);
    await prisma.equipment.update({ where: { id: a.id }, data: { internalCode: `REF-${RUN}` } });
    const b = await equipo(orgA, "instrument", null);
    await rechaza(prisma.equipment.update({ where: { id: b.id }, data: { internalCode: ` ref-${RUN}` } }));
    const c = await equipo(orgB, "instrument", null);
    await prisma.equipment.update({ where: { id: c.id }, data: { internalCode: `REF-${RUN}` } });
  });
});

describe("rutinas: forma en la base", () => {
  it("exactamente uno de equipo o sitio", async () => {
    const e = await equipo(orgA, "instrument", null);
    await rechaza(prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7 } }));
    await rechaza(prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7, equipmentId: e.id, locationId: sitioA } }));
    const deSitio = await prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7, locationId: sitioA } });
    rutinas.push(deSitio.id);
  });
  it("intervalo > 0 y «otra» con nota", async () => {
    const e = await equipo(orgA, "instrument", null);
    await rechaza(prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 0, equipmentId: e.id } }));
    await rechaza(prisma.careRoutine.create({ data: { kind: "otra", intervalDays: 7, equipmentId: e.id } }));
  });
  it("una rutina activa por cosa y tipo; la retirada no cuenta", async () => {
    const e = await equipo(orgA, "instrument", null);
    const r1 = await prisma.careRoutine.create({ data: { kind: "mantenimiento", intervalDays: 30, equipmentId: e.id } });
    rutinas.push(r1.id);
    await rechaza(prisma.careRoutine.create({ data: { kind: "mantenimiento", intervalDays: 60, equipmentId: e.id } }));
    await prisma.careRoutine.update({ where: { id: r1.id }, data: { retiredAt: new Date() } });
    const r2 = await prisma.careRoutine.create({ data: { kind: "mantenimiento", intervalDays: 60, equipmentId: e.id } });
    rutinas.push(r2.id);
    // Dos «otra» con notas distintas conviven; con la misma nota, no.
    const o1 = await prisma.careRoutine.create({ data: { kind: "otra", kindNote: "engrase", intervalDays: 7, equipmentId: e.id } });
    rutinas.push(o1.id);
    const o2 = await prisma.careRoutine.create({ data: { kind: "otra", kindNote: "desinfección", intervalDays: 7, equipmentId: e.id } });
    rutinas.push(o2.id);
    await rechaza(prisma.careRoutine.create({ data: { kind: "otra", kindNote: " Engrase ", intervalDays: 7, equipmentId: e.id } }));
  });
  it("un registro anulado exige motivo", async () => {
    const e = await equipo(orgA, "instrument", null);
    const r = await prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7, equipmentId: e.id } });
    rutinas.push(r.id);
    await rechaza(
      prisma.careRoutineEvent.create({
        data: { routineId: r.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record", voidedAt: new Date() },
      }),
    );
    await prisma.careRoutineEvent.create({
      data: { routineId: r.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record", voidedAt: new Date(), voidReason: "fecha equivocada" },
    });
  });
});
```

- [ ] **Paso 2: registrarla en el grupo con base y verla fallar.**

Añadir `tests/equipos/esquemaDeCatalogo.test.ts` bajo `# @grupo: base-sembrada`, en `scripts/pruebas-por-compuerta.txt`.

```bash
npx vitest run tests/equipos/esquemaDeCatalogo.test.ts; echo "salida=$?"
```

Esperado: falla, porque el cliente no tiene `equipmentModel`. Es un error de tipos o de «Cannot read properties of undefined», **no** «no tests».

- [ ] **Paso 3: el esquema.** En `prisma/schema.prisma`, junto a `enum EquipmentCondition`:

```prisma
/// D4 del spec de catálogos (2026-09-18). La lista la dio Daniel; «otro» obliga a nota.
enum EquipmentContactMaterial {
  acero_inoxidable
  plastico_alimentario
  madera
  vidrio_o_ceramica
  otro

  @@schema("core")
}

/// D8. «etc.» vive en `otra` con nota hasta que un tipo se repita lo bastante.
enum CareRoutineKind {
  mantenimiento
  limpieza
  fumigacion
  otra

  @@schema("core")
}

/// Catálogo de referencia (spec §2): nulo en `organizationId` = compartido.
/// Unicidad, CHECK y la exclusión de capacidad fuera de vaso/máquina viven en la
/// migración `catalogos_y_rutinas`: Prisma no sabe escribirlos.
model EquipmentModel {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  organizationId String?       @map("organization_id") @db.Uuid
  organization   Organization? @relation("EquipmentModelOwner", fields: [organizationId], references: [id], onDelete: Restrict)

  kind                       EquipmentKind
  manufacturer               String
  modelName                  String                    @map("model_name")
  recommendedMaintenanceDays Int?                      @map("recommended_maintenance_days")
  capacityValue              Decimal?                  @map("capacity_value") @db.Decimal(12, 3)
  capacityUnit               String?                   @map("capacity_unit")
  contactMaterial            EquipmentContactMaterial? @map("contact_material")
  contactMaterialNote        String?                   @map("contact_material_note")

  provenanceClass ProvenanceClass @map("provenance_class")
  sourceReference String?         @map("source_reference")
  notes           String?

  retiredAt DateTime? @map("retired_at")
  createdAt DateTime  @default(now()) @map("created_at")
  createdBy String?   @map("created_by") @db.Uuid

  specs     EquipmentModelSpec[]
  equipment Equipment[]          @relation("EquipmentOfModel")
  assets    Asset[]              @relation("AssetEquipmentModel")

  @@unique([id, kind])
  @@index([organizationId])
  @@map("equipment_model")
  @@schema("core")
}

/// Lo que el fabricante DECLARA que mide, una fila por magnitud. No es medición:
/// los contrastes contra patrón dicen lo que el aparato hace de verdad.
/// Se retira y se crea otra; no se edita en su sitio.
model EquipmentModelSpec {
  id      String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  modelId String         @map("model_id") @db.Uuid
  model   EquipmentModel @relation(fields: [modelId], references: [id], onDelete: Restrict)

  quantity    String
  unit        String
  rangeMin    Decimal? @map("range_min") @db.Decimal(12, 4)
  rangeMax    Decimal? @map("range_max") @db.Decimal(12, 4)
  resolution  Decimal? @db.Decimal(12, 4)
  accuracyAbs Decimal? @map("accuracy_abs") @db.Decimal(12, 4)

  displayOrder Int       @default(0) @map("display_order")
  retiredAt    DateTime? @map("retired_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  createdBy    String?   @map("created_by") @db.Uuid

  @@index([modelId])
  @@map("equipment_model_spec")
  @@schema("core")
}

/// Qué toca y cada cuánto, sobre UNA cosa: un equipo o un sitio (CHECK en la
/// migración). Avisa, nunca bloquea (D1). Una activa por (cosa, tipo): índice
/// parcial en la migración.
model CareRoutine {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  equipmentId String?    @map("equipment_id") @db.Uuid
  equipment   Equipment? @relation(fields: [equipmentId], references: [id], onDelete: Restrict)
  locationId  String?    @map("location_id") @db.Uuid
  location    Location?  @relation("CareRoutineLocation", fields: [locationId], references: [id], onDelete: Restrict)

  kind         CareRoutineKind
  kindNote     String?         @map("kind_note")
  intervalDays Int             @map("interval_days")
  instructions String?

  retiredAt DateTime? @map("retired_at")
  createdAt DateTime  @default(now()) @map("created_at")
  createdBy String?   @map("created_by") @db.Uuid

  events CareRoutineEvent[]

  @@index([equipmentId])
  @@index([locationId])
  @@map("care_routine")
  @@schema("core")
}

/// Cada vez que se hizo. Sólo se añade; lo apuntado por error se ANULA con motivo.
model CareRoutineEvent {
  id        String      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  routineId String      @map("routine_id") @db.Uuid
  routine   CareRoutine @relation(fields: [routineId], references: [id], onDelete: Restrict)

  /// Campo de DÍA: medianoche UTC, leído con `fechaDeDia`.
  performedOn         DateTime @map("performed_on")
  performedByPersonId String?  @map("performed_by_person_id") @db.Uuid
  performedBy         Person?  @relation("CareRoutineEventPerformedBy", fields: [performedByPersonId], references: [id], onDelete: Restrict)
  note                String?

  provenanceClass ProvenanceClass @map("provenance_class")
  sourceReference String?         @map("source_reference")

  voidedAt   DateTime? @map("voided_at")
  voidReason String?   @map("void_reason")

  createdAt DateTime @default(now()) @map("created_at")
  createdBy String?  @map("created_by") @db.Uuid

  @@index([routineId])
  @@map("care_routine_event")
  @@schema("core")
}
```

En `model Equipment`, después de `sourceReference`:

```prisma
  /// Catálogo (spec §3.3). FK COMPUESTA con `kind`: un instrumento no puede
  /// apuntar a un modelo de vaso, y lo impide la base. Un disparador impide
  /// además un modelo propio de otra organización.
  modelId String?         @map("model_id") @db.Uuid
  model   EquipmentModel? @relation("EquipmentOfModel", fields: [modelId, kind], references: [id, kind], onDelete: Restrict)

  serialNumber String? @map("serial_number")
  /// El que se pega en el aparato. Único por organización, sin mayúsculas (migración).
  internalCode String? @map("internal_code")

  supplierOrganizationId String?       @map("supplier_organization_id") @db.Uuid
  supplier               Organization? @relation("EquipmentSupplier", fields: [supplierOrganizationId], references: [id], onDelete: Restrict)

  /// Campo de DÍA.
  warrantyUntil DateTime? @map("warranty_until")
```

y en su lista de relaciones:

```prisma
  careRoutines CareRoutine[]
  assets       Asset[]       @relation("AssetEquipment")
```

y `@@index([modelId])` junto a los otros índices.

En `model Asset`, junto a las demás FKs de padre:

```prisma
  equipmentId      String?         @map("equipment_id") @db.Uuid
  equipment        Equipment?      @relation("AssetEquipment", fields: [equipmentId], references: [id], onDelete: Restrict)
  equipmentModelId String?         @map("equipment_model_id") @db.Uuid
  equipmentModel   EquipmentModel? @relation("AssetEquipmentModel", fields: [equipmentModelId], references: [id], onDelete: Restrict)
```

Relaciones inversas:
- en `model Organization`: `equipmentModels EquipmentModel[] @relation("EquipmentModelOwner")` y `suppliedEquipment Equipment[] @relation("EquipmentSupplier")`;
- en `model Location`: `careRoutines CareRoutine[] @relation("CareRoutineLocation")`;
- en `model Person`: `careRoutineEvents CareRoutineEvent[] @relation("CareRoutineEventPerformedBy")`.

```bash
npx prisma validate; echo "validate=$?"
```

**Si `validate` rechaza la FK compuesta** porque `kind` es obligatorio y `modelId` no: quitar `kind` de `fields`/`references` (queda `fields: [modelId], references: [id]`) y mover la comprobación de tipo al disparador del Paso 4 (`IF v.kind <> NEW.kind THEN RAISE`). La prueba de la FK compuesta sigue valiendo tal cual, porque mide el rechazo, no el mecanismo. Decirlo en el PR.

- [ ] **Paso 4: la migración.** Generar el esqueleto y **leerlo entero** antes de añadir nada:

```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script > /tmp/catalogos.sql; echo "diff=$?"
wc -l /tmp/catalogos.sql
```

Comprobar que **sólo** contiene lo de esta tarea (enums, 4 tablas, columnas de `equipment` y `asset`, índices y FKs de ellas). Si trae sentencias sobre otras tablas, es deriva ajena: parar y preguntar, no incluirlas.

Crear `prisma/migrations/20260919090000_catalogos_y_rutinas/migration.sql` con el contenido de `/tmp/catalogos.sql` y, **al final**, esto:

```sql
-- ── Catálogo: unicidad sin mayúsculas ni espacios, compartido con clave propia ──
-- `coalesce` con el uuid nulo hace que dos compartidas choquen entre sí y no con
-- una propia del mismo nombre (spec §2.4).
CREATE UNIQUE INDEX "equipment_model_dueno_nombre_normalizado_key"
  ON "core"."equipment_model" (
    coalesce("organization_id", '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim("manufacturer")),
    lower(btrim("model_name"))
  );

ALTER TABLE "core"."equipment_model"
  ADD CONSTRAINT "equipment_model_mantenimiento_positivo" CHECK ("recommended_maintenance_days" IS NULL OR "recommended_maintenance_days" > 0),
  ADD CONSTRAINT "equipment_model_capacidad_positiva" CHECK ("capacity_value" IS NULL OR "capacity_value" > 0),
  ADD CONSTRAINT "equipment_model_capacidad_con_unidad" CHECK (("capacity_value" IS NULL) = ("capacity_unit" IS NULL)),
  ADD CONSTRAINT "equipment_model_otro_con_nota" CHECK ("contact_material" IS DISTINCT FROM 'otro' OR "contact_material_note" IS NOT NULL),
  ADD CONSTRAINT "equipment_model_capacidad_y_material_solo_en_vaso_o_maquina" CHECK (
    "kind" IN ('vessel', 'machine') OR ("capacity_value" IS NULL AND "contact_material" IS NULL)
  );

ALTER TABLE "core"."equipment_model_spec"
  ADD CONSTRAINT "equipment_model_spec_rango_ordenado" CHECK ("range_min" IS NULL OR "range_max" IS NULL OR "range_min" <= "range_max"),
  ADD CONSTRAINT "equipment_model_spec_resolucion_positiva" CHECK ("resolution" IS NULL OR "resolution" > 0),
  ADD CONSTRAINT "equipment_model_spec_precision_no_negativa" CHECK ("accuracy_abs" IS NULL OR "accuracy_abs" >= 0);

-- ── Equipo: código interno único por organización ──
CREATE UNIQUE INDEX "equipment_org_codigo_interno_key"
  ON "core"."equipment" ("organization_id", lower(btrim("internal_code")))
  WHERE "internal_code" IS NOT NULL;

-- ── Equipo: un modelo propio de OTRA organización no se puede elegir ──
-- En la base y no sólo en el servicio: un importador o SQL directo no pasan
-- por TypeScript.
CREATE FUNCTION "core"."equipment_modelo_visible"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  dueno uuid;
BEGIN
  IF NEW."model_id" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "organization_id" INTO dueno FROM "core"."equipment_model" WHERE "id" = NEW."model_id";
  IF dueno IS NOT NULL AND dueno <> NEW."organization_id" THEN
    RAISE EXCEPTION 'modelo_de_otra_organizacion' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "equipment_modelo_visible"
  BEFORE INSERT OR UPDATE OF "model_id", "organization_id" ON "core"."equipment"
  FOR EACH ROW EXECUTE FUNCTION "core"."equipment_modelo_visible"();

-- ── Rutinas ──
ALTER TABLE "core"."care_routine"
  ADD CONSTRAINT "care_routine_una_cosa" CHECK (("equipment_id" IS NULL) <> ("location_id" IS NULL)),
  ADD CONSTRAINT "care_routine_intervalo_positivo" CHECK ("interval_days" > 0),
  ADD CONSTRAINT "care_routine_otra_con_nota" CHECK ("kind" <> 'otra' OR "kind_note" IS NOT NULL);

-- Una rutina ACTIVA por (cosa, tipo). Con `otra`, la nota normalizada entra en la clave.
CREATE UNIQUE INDEX "care_routine_equipo_tipo_activa_key"
  ON "core"."care_routine" ("equipment_id", "kind", lower(btrim(coalesce("kind_note", ''))))
  WHERE "retired_at" IS NULL AND "equipment_id" IS NOT NULL;
CREATE UNIQUE INDEX "care_routine_sitio_tipo_activa_key"
  ON "core"."care_routine" ("location_id", "kind", lower(btrim(coalesce("kind_note", ''))))
  WHERE "retired_at" IS NULL AND "location_id" IS NOT NULL;

ALTER TABLE "core"."care_routine_event"
  ADD CONSTRAINT "care_routine_event_anulado_con_motivo" CHECK ("voided_at" IS NULL OR "void_reason" IS NOT NULL);
```

**Si el Paso 3 cayó a la alternativa del disparador**, añadir dentro de la función, antes del `IF dueno`:

```sql
  IF (SELECT "kind" FROM "core"."equipment_model" WHERE "id" = NEW."model_id") <> NEW."kind" THEN
    RAISE EXCEPTION 'modelo_de_otro_tipo' USING ERRCODE = 'check_violation';
  END IF;
```

y el `OF` del disparador pasa a `OF "model_id", "organization_id", "kind"`.

- [ ] **Paso 5: aplicar y generar.**

```bash
npx prisma migrate deploy; echo "migrate=$?"     # leer el nombre que imprime
npx prisma generate; echo "generate=$?"
```

- [ ] **Paso 6: la prueba pasa, y el guardia de deriva sigue verde.**

```bash
npx vitest run tests/equipos/esquemaDeCatalogo.test.ts tests/derivaDeMigraciones.test.ts; echo "salida=$?"
```

Esperado: todo en verde. **Contar** los tests pasados en la salida (`esquemaDeCatalogo`: 13). Si `derivaDeMigraciones` propone sentencias, leerlas: si son de esta tarea, declarar en el esquema lo que falta (ADR-120); si no son de esta tarea, parar.

- [ ] **Paso 7: flip-test de una restricción** (commit antes de mutar, porque el arnés restaura desde HEAD):

Primero el commit del Paso 8. Luego crear una migración temporal **sin commitear** que haga `ALTER TABLE "core"."care_routine" DROP CONSTRAINT "care_routine_una_cosa";`, aplicarla, correr la prueba y ver caer **«exactamente uno de equipo o sitio»** por su nombre. Deshacer: `ALTER TABLE ... ADD CONSTRAINT` igual que en la migración, y borrar la carpeta temporal. `git status --porcelain` tiene que quedar vacío.

- [ ] **Paso 8: commit.**

```bash
git add prisma/schema.prisma prisma/migrations/20260919090000_catalogos_y_rutinas/migration.sql tests/equipos/esquemaDeCatalogo.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat     # 4 archivos
git commit -F /tmp/msg-t1.txt
```

`/tmp/msg-t1.txt`: `catálogos T1: modelos de equipo, rutinas y sus restricciones en la base` + línea en blanco + `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## Tarea 2: `estadoDeRutina`, la función pura del aviso

**Files:**
- Create: `lib/rutinas/estado.ts`
- Test: `tests/rutinas/estado.test.ts` (hermética: sin base)

**Interfaces:**
- Produces:

```ts
export type EstadoDeRutina =
  | { estado: "sin_referencia"; ultimo: null }
  | { estado: "al_dia"; ultimo: string | null; proximo: string; faltan: number }
  | { estado: "vencida"; ultimo: string | null; proximo: string; pasaron: number };

export function estadoDeRutina(e: {
  intervalDays: number;
  registros: ReadonlyArray<{ performedOn: Date; voidedAt: Date | null }>;
  alta: Date | null;          // fecha de alta de la cosa; se usa sólo si no hay registros
  hoy: string;                // YYYY-MM-DD, de `diaDeHoy`
}): EstadoDeRutina;
```

- [ ] **Paso 1: la prueba, con entradas hostiles.**

```ts
import { describe, expect, it } from "vitest";
import { estadoDeRutina } from "../../lib/rutinas/estado";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const reg = (s: string, anulado = false) => ({ performedOn: d(s), voidedAt: anulado ? d(s) : null });

/**
 * Se llama a la función con las entradas que la romperían, no a través de datos
 * reales que no la ejercitan (regla de la casa, 2026-09-07).
 */
describe("estadoDeRutina", () => {
  it("sin registros ni fecha de alta: sin referencia, nunca «al día»", () => {
    expect(estadoDeRutina({ intervalDays: 7, registros: [], alta: null, hoy: "2026-09-18" })).toEqual({
      estado: "sin_referencia",
      ultimo: null,
    });
  });

  it("sólo registros anulados cuentan como ninguno", () => {
    const r = estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-15", true)], alta: null, hoy: "2026-09-18" });
    expect(r.estado).toBe("sin_referencia");
  });

  it("sin registros usa la fecha de alta", () => {
    expect(estadoDeRutina({ intervalDays: 10, registros: [], alta: d("2026-09-01"), hoy: "2026-09-18" })).toEqual({
      estado: "vencida",
      ultimo: null,
      proximo: "2026-09-11",
      pasaron: 7,
    });
  });

  it("el día exacto del vencimiento todavía está al día, con 0 días", () => {
    expect(estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-11")], alta: null, hoy: "2026-09-18" })).toEqual({
      estado: "al_dia",
      ultimo: "2026-09-11",
      proximo: "2026-09-18",
      faltan: 0,
    });
  });

  it("un día después, vencida por 1", () => {
    const r = estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-10")], alta: null, hoy: "2026-09-18" });
    expect(r).toEqual({ estado: "vencida", ultimo: "2026-09-10", proximo: "2026-09-17", pasaron: 1 });
  });

  it("manda el registro válido más reciente, no el primero de la lista", () => {
    const r = estadoDeRutina({
      intervalDays: 30,
      registros: [reg("2026-09-17", true), reg("2026-08-01"), reg("2026-09-01")],
      alta: d("2026-01-01"),
      hoy: "2026-09-18",
    });
    expect(r).toEqual({ estado: "al_dia", ultimo: "2026-09-01", proximo: "2026-10-01", faltan: 13 });
  });

  it("cruza cambios de mes y años bisiestos por calendario, no por milisegundos", () => {
    const r = estadoDeRutina({ intervalDays: 1, registros: [reg("2028-02-28")], alta: null, hoy: "2028-02-29" });
    expect(r).toEqual({ estado: "al_dia", ultimo: "2028-02-28", proximo: "2028-02-29", faltan: 0 });
  });

  it("ningún camino devuelve NaN", () => {
    const casos = [
      estadoDeRutina({ intervalDays: 7, registros: [], alta: null, hoy: "2026-09-18" }),
      estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-10")], alta: null, hoy: "2026-09-18" }),
      estadoDeRutina({ intervalDays: 7, registros: [reg("2026-09-17")], alta: null, hoy: "2026-09-18" }),
    ];
    for (const c of casos) {
      for (const v of Object.values(c)) if (typeof v === "number") expect(Number.isNaN(v)).toBe(false);
    }
  });

  it("un `hoy` mal formado lanza en vez de comparar mal en silencio", () => {
    expect(() => estadoDeRutina({ intervalDays: 7, registros: [], alta: d("2026-09-01"), hoy: "18/09/2026" })).toThrow();
  });

  it("un intervalo no positivo lanza (la base ya lo impide; aquí no se inventa)", () => {
    expect(() => estadoDeRutina({ intervalDays: 0, registros: [], alta: d("2026-09-01"), hoy: "2026-09-18" })).toThrow();
  });
});
```

- [ ] **Paso 2: verla fallar.**

```bash
npx vitest run tests/rutinas/estado.test.ts; echo "salida=$?"
```

Esperado: falla al resolver `../../lib/rutinas/estado`.

- [ ] **Paso 3: la implementación.** `lib/rutinas/estado.ts`:

```ts
/**
 * El aviso de una rutina, derivado y sin base (spec §4). No sabe si la rutina es
 * de un equipo o de una instalación.
 *
 * **Avisa, no bloquea** (D1), como `checkAdvisoryHours`. Todo se calcula en DÍAS
 * de calendario como cadenas `YYYY-MM-DD`, no en milisegundos: un intervalo de
 * «cada 7 días» no debe moverse una hora por un cambio de horario.
 */
export type EstadoDeRutina =
  | { estado: "sin_referencia"; ultimo: null }
  | { estado: "al_dia"; ultimo: string | null; proximo: string; faltan: number }
  | { estado: "vencida"; ultimo: string | null; proximo: string; pasaron: number };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function aDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function mas(dia: string, dias: number): string {
  const f = new Date(`${dia}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return aDia(f);
}

function entre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export function estadoDeRutina(e: {
  intervalDays: number;
  registros: ReadonlyArray<{ performedOn: Date; voidedAt: Date | null }>;
  alta: Date | null;
  hoy: string;
}): EstadoDeRutina {
  if (!DIA.test(e.hoy)) throw new Error(`hoy_mal_formado:${e.hoy}`);
  if (!Number.isInteger(e.intervalDays) || e.intervalDays <= 0) throw new Error(`intervalo_invalido:${e.intervalDays}`);

  const validos = e.registros.filter((r) => r.voidedAt === null).map((r) => aDia(r.performedOn)).sort();
  const ultimo = validos.length > 0 ? validos[validos.length - 1]! : null;
  const referencia = ultimo ?? (e.alta ? aDia(e.alta) : null);
  if (referencia === null) return { estado: "sin_referencia", ultimo: null };

  const proximo = mas(referencia, e.intervalDays);
  const diferencia = entre(e.hoy, proximo);
  return diferencia >= 0
    ? { estado: "al_dia", ultimo, proximo, faltan: diferencia }
    : { estado: "vencida", ultimo, proximo, pasaron: -diferencia };
}
```

- [ ] **Paso 4: pasa.**

```bash
npx vitest run tests/rutinas/estado.test.ts; echo "salida=$?"
```

Esperado: 10 pasados.

- [ ] **Paso 5: flip-test.** Commit primero (Paso 6). Luego, con el sha del archivo antes y después (`shasum lib/rutinas/estado.ts`), cambiar `diferencia >= 0` por `diferencia > 0`: tiene que caer **«el día exacto del vencimiento todavía está al día, con 0 días»**. Y cambiar `r.voidedAt === null` por `true`: tiene que caer **«sólo registros anulados cuentan como ninguno»**. Restaurar con `git checkout -- lib/rutinas/estado.ts` después de cada una.

- [ ] **Paso 6: commit** de `lib/rutinas/estado.ts` y `tests/rutinas/estado.test.ts` (2 archivos). Mensaje: `catálogos T2: el aviso de una rutina, puro y probado con entradas hostiles`.

---

## Tarea 3: el contrato común — registro, propiedad y su guardia

**Files:**
- Create: `lib/catalogos/registro.ts`
- Create: `lib/catalogos/propiedad.ts`
- Test: `tests/arquitectura/catalogos-con-contrato.test.ts` (hermética)
- Test: `tests/catalogos/propiedad.test.ts` (con base)
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produces (`lib/catalogos/registro.ts`):

```ts
export interface EntradaDelRegistro {
  modelo: string;        // nombre del modelo en schema.prisma
  delegado: string;      // nombre del delegado de Prisma (prisma.<delegado>)
}
export const CATALOGOS: readonly EntradaDelRegistro[];
```

- Produces (`lib/catalogos/propiedad.ts`):

```ts
export class CatalogoError extends Error {}
export type Dueno = { tipo: "compartido" } | { tipo: "propio"; locationId: string };
export interface PermisoDeCatalogo { resourceType: string; action: string }
export async function requireCatalogoAccess(userAccountId: string, dueno: Dueno, permiso: PermisoDeCatalogo): Promise<string | null>;
export async function requireEntradaDeCatalogoAccess(userAccountId: string, entrada: { organizationId: string | null }, permiso: PermisoDeCatalogo): Promise<void>;
export async function organizacionesVisibles(userAccountId: string, permiso: PermisoDeCatalogo): Promise<string[]>;
export function filtroVisible(organizaciones: readonly string[]): { OR: [{ organizationId: null }, { organizationId: { in: string[] } }] };
```

- [ ] **Paso 1: la guardia de arquitectura (falla: no hay registro).**

`tests/arquitectura/catalogos-con-contrato.test.ts`:

```ts
/**
 * Toda tabla de catálogo de referencia cumple el contrato del spec de catálogos
 * (§2): dueño anulable, procedencia, retiro — y nadie la borra desde el código.
 *
 * Lee `lib/catalogos/registro.ts`: una tabla que no se registra no queda
 * protegida, y el comentario del registro lo dice.
 *
 * Mira formas escritas, como sus vecinos: un suelo, no un techo.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CATALOGOS } from "../../lib/catalogos/registro";

const RAIZ = new URL("../..", import.meta.url).pathname;
const ESQUEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");

export function cuerpoDelModelo(esquema: string, modelo: string): string | null {
  const m = esquema.match(new RegExp(`\\nmodel ${modelo} \\{([\\s\\S]*?)\\n\\}`));
  return m ? m[1]! : null;
}

export function faltasDelContrato(cuerpo: string): string[] {
  const faltas: string[] = [];
  if (!/\n\s*organizationId\s+String\?/.test(cuerpo)) faltas.push("organizationId anulable");
  if (!/\n\s*provenanceClass\s+ProvenanceClass\b/.test(cuerpo)) faltas.push("provenanceClass");
  if (!/\n\s*retiredAt\s+DateTime\?/.test(cuerpo)) faltas.push("retiredAt");
  return faltas;
}

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir)) {
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (/\.(ts|tsx)$/.test(e)) salida.push(ruta);
  }
  return salida;
}

export function borrados(src: string, delegado: string): number {
  return (src.match(new RegExp(`\\.${delegado}\\s*\\.\\s*delete(Many)?\\s*\\(`, "g")) ?? []).length;
}

describe("catálogos de referencia: el contrato común", () => {
  it("cada tabla registrada tiene dueño anulable, procedencia y retiro", () => {
    const culpables: string[] = [];
    for (const c of CATALOGOS) {
      const cuerpo = cuerpoDelModelo(ESQUEMA, c.modelo);
      if (cuerpo === null) culpables.push(`${c.modelo}: no existe en schema.prisma`);
      else for (const f of faltasDelContrato(cuerpo)) culpables.push(`${c.modelo}: falta ${f}`);
    }
    expect(culpables).toEqual([]);
  });

  it("ningún archivo de lib/ ni app/ borra una tabla de catálogo", () => {
    const culpables: string[] = [];
    for (const f of [...fuentes(join(RAIZ, "lib")), ...fuentes(join(RAIZ, "app"))]) {
      const src = readFileSync(f, "utf8");
      for (const c of CATALOGOS) if (borrados(src, c.delegado) > 0) culpables.push(`${relative(RAIZ, f)}: ${c.delegado}`);
    }
    expect(culpables, "se retira (retiredAt), no se borra").toEqual([]);
  });

  /** Control positivo: sin esto, un registro vacío o un lector roto dan cero culpables. */
  it("está mirando de verdad", () => {
    expect(CATALOGOS.length).toBeGreaterThan(0);
    expect(cuerpoDelModelo(ESQUEMA, "EquipmentModel")).not.toBeNull();
    expect(faltasDelContrato("\n  name String\n")).toEqual(["organizationId anulable", "provenanceClass", "retiredAt"]);
    expect(borrados("await prisma.equipmentModel.deleteMany({})", "equipmentModel")).toBe(1);
    expect(borrados("await prisma.equipmentModel.update({})", "equipmentModel")).toBe(0);
  });
});
```

(Los `export` de funciones dentro del archivo de prueba son sólo para que el lector los encuentre; si el lint del repositorio los rechaza en un test, quitarlos.)

- [ ] **Paso 2: verla fallar** (`npx vitest run tests/arquitectura/catalogos-con-contrato.test.ts`): no resuelve `lib/catalogos/registro`.

- [ ] **Paso 3: el registro.** `lib/catalogos/registro.ts`:

```ts
/**
 * Las tablas que son catálogo de referencia (spec de catálogos, §2.8).
 *
 * **Una tabla de catálogo que no se registra aquí NO queda protegida** por
 * `tests/arquitectura/catalogos-con-contrato.test.ts`: el guardia lee esta lista.
 * Cada clase nueva (levaduras, especies, varietales…) se añade en su propio PR.
 */
export interface EntradaDelRegistro {
  modelo: string;
  delegado: string;
}

export const CATALOGOS: readonly EntradaDelRegistro[] = [{ modelo: "EquipmentModel", delegado: "equipmentModel" }];
```

- [ ] **Paso 4: pasa, y flip-test.** Commit del registro y la guardia. Luego, cada vez con el sha antes y después:
  - borrar `retiredAt` de `model EquipmentModel` en `schema.prisma` → cae **«cada tabla registrada tiene dueño anulable, procedencia y retiro»**;
  - añadir `void prisma.equipmentModel.deleteMany({});` en cualquier archivo de `lib/` → cae **«ningún archivo de lib/ ni app/ borra una tabla de catálogo»**.

  Restaurar con `git checkout --` tras cada una; `git status --porcelain` vacío.

- [ ] **Paso 5: el arranque compartido de las pruebas con base.** Lo usan las Tareas 3-7, así que se escribe una vez. `tests/helpers/fixturesDeCatalogo.ts`:

```ts
import { prisma } from "../../lib/db";

/**
 * Dos organizaciones con un sitio cada una, y cuatro cuentas:
 * - `admin`: Platform Admin en plataforma — SÓLO para lo compartido;
 * - `jefeA`: Farm Manager del sitio A (tiene equipment:manage);
 * - `operarioA`: Farm Operator del sitio A (view + report_condition, sin manage);
 * - `ajeno`: sin ninguna asignación.
 *
 * **Las pruebas de «propio» usan `jefeA`, nunca `admin`**: un admin ve la base
 * compartida entera (trampa escrita en CLAUDE.md, 2026-09-17), y una prueba de
 * «propio» hecha con admin pasaría aunque la regla estuviera rota.
 *
 * `limpiar()` borra lo que el arranque creó, en orden de FKs, y va en `afterAll`
 * DESPUÉS de que cada prueba borre lo suyo.
 */
export interface Fixtures {
  run: string;
  orgA: string;
  orgB: string;
  sitioA: string;
  sitioB: string;
  admin: string;
  jefeA: string;
  operarioA: string;
  ajeno: string;
  personaJefeA: string;
  cuentas: string[];
  limpiar(): Promise<void>;
}

export async function montarFixtures(prefijo: string): Promise<Fixtures> {
  const run = `${prefijo}-${Date.now()}`;
  const personas: string[] = [];
  const scopes: string[] = [];

  const org = (n: string) =>
    prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${n} ${run}`, status: "approved", classification: "internal" } });
  const orgA = (await org("A")).id;
  const orgB = (await org("B")).id;
  const sitio = (o: string, n: string) =>
    prisma.location.create({ data: { locationType: "plot", name: `TEST ${n} ${run}`, organizationId: o, status: "approved", classification: "internal" } });
  const sitioA = (await sitio(orgA, "sitio A")).id;
  const sitioB = (await sitio(orgB, "sitio B")).id;

  async function cuenta(label: string) {
    const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${run})`, locale: "es" } });
    personas.push(p.id);
    const u = await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } });
    return { userId: u.id, personId: p.id };
  }
  async function asignar(userAccountId: string, perfil: string, scopeType: "platform" | "location", scopeRefId: string | null) {
    const s = await prisma.scope.create({ data: { scopeType, scopeRefId } });
    scopes.push(s.id);
    const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: rp.id, scopeId: s.id } });
  }

  const admin = (await cuenta("Admin")).userId;
  const jefe = await cuenta("JefeA");
  const operarioA = (await cuenta("OperarioA")).userId;
  const ajeno = (await cuenta("Ajeno")).userId;
  await asignar(admin, "Platform Admin", "platform", null);
  await asignar(jefe.userId, "Farm Manager", "location", sitioA);
  await asignar(operarioA, "Farm Operator", "location", sitioA);
  const cuentas = [admin, jefe.userId, operarioA, ajeno];

  return {
    run, orgA, orgB, sitioA, sitioB, admin, jefeA: jefe.userId, operarioA, ajeno, personaJefeA: jefe.personId, cuentas,
    async limpiar() {
      await prisma.auditEvent.deleteMany({ where: { actorUserAccountId: { in: cuentas } } });
      await prisma.assignment.deleteMany({ where: { userAccountId: { in: cuentas } } });
      await prisma.scope.deleteMany({ where: { id: { in: scopes } } });
      await prisma.userAccount.deleteMany({ where: { id: { in: cuentas } } });
      await prisma.person.deleteMany({ where: { id: { in: personas } } });
      await prisma.location.deleteMany({ where: { id: { in: [sitioA, sitioB] } } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
    },
  };
}
```

Antes de dar el helper por bueno, comprobar que los nombres de perfil existen en la base sembrada: `select name from core.role_profile where name in ('Platform Admin','Farm Manager','Farm Operator');` debe devolver 3 filas.

- [ ] **Paso 6: la prueba de propiedad (con base).** `tests/catalogos/propiedad.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CatalogoError,
  filtroVisible,
  organizacionesVisibles,
  requireCatalogoAccess,
  requireEntradaDeCatalogoAccess,
} from "../../lib/catalogos/propiedad";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

const PERMISO = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;
let f: Fixtures;
let admin: string, jefeA: string, operarioA: string, orgA: string, orgB: string, sitioA: string, sitioB: string;

beforeAll(async () => {
  f = await montarFixtures("prop");
  ({ admin, jefeA, operarioA, orgA, orgB, sitioA, sitioB } = f);
});
afterAll(async () => {
  await f.limpiar();
});

describe("requireCatalogoAccess", () => {
  it("compartido: sólo con el permiso en ámbito de plataforma", async () => {
    await expect(requireCatalogoAccess(admin, { tipo: "compartido" }, PERMISO)).resolves.toBeNull();
    await expect(requireCatalogoAccess(jefeA, { tipo: "compartido" }, PERMISO)).rejects.toThrow(CatalogoError);
  });
  it("propio: el permiso se juzga en el sitio, y la organización sale del sitio", async () => {
    await expect(requireCatalogoAccess(jefeA, { tipo: "propio", locationId: sitioA }, PERMISO)).resolves.toBe(orgA);
    await expect(requireCatalogoAccess(jefeA, { tipo: "propio", locationId: sitioB }, PERMISO)).rejects.toThrow(CatalogoError);
    await expect(requireCatalogoAccess(operarioA, { tipo: "propio", locationId: sitioA }, PERMISO)).rejects.toThrow(CatalogoError);
  });
});

describe("requireEntradaDeCatalogoAccess", () => {
  it("una entrada propia se edita con el permiso en ALGÚN sitio de su organización", async () => {
    await expect(requireEntradaDeCatalogoAccess(jefeA, { organizationId: orgA }, PERMISO)).resolves.toBeUndefined();
    await expect(requireEntradaDeCatalogoAccess(jefeA, { organizationId: orgB }, PERMISO)).rejects.toThrow(CatalogoError);
  });
  it("una compartida, sólo con plataforma", async () => {
    await expect(requireEntradaDeCatalogoAccess(jefeA, { organizationId: null }, PERMISO)).rejects.toThrow(CatalogoError);
    await expect(requireEntradaDeCatalogoAccess(admin, { organizationId: null }, PERMISO)).resolves.toBeUndefined();
  });
});

describe("visibilidad", () => {
  it("el operario ve su organización y no la ajena", async () => {
    const orgs = await organizacionesVisibles(operarioA, VER);
    expect(orgs).toContain(orgA);
    expect(orgs).not.toContain(orgB);
  });
  it("el filtro deja pasar siempre lo compartido", () => {
    expect(filtroVisible([orgA])).toEqual({ OR: [{ organizationId: null }, { organizationId: { in: [orgA] } }] });
  });
});
```

Añadirla a `base-sembrada`. Verla fallar.

- [ ] **Paso 7: la implementación.** `lib/catalogos/propiedad.ts`:

```ts
/**
 * Quién ve y quién edita un catálogo de referencia (spec §2.5). UNA función para
 * todas las clases, como `un-solo-predicado-de-sitio` para los sitios.
 *
 * `ScopeType` no tiene `organization`, así que la pertenencia de una entrada
 * propia se juzga en un SITIO de esa organización — el precedente exacto de
 * `crearMaterial` y `registrarEquipo`. La organización se DERIVA del sitio; no se
 * acepta del formulario.
 */
import { prisma } from "../db";
import { can } from "../rbac/resolve";

export class CatalogoError extends Error {}

export type Dueno = { tipo: "compartido" } | { tipo: "propio"; locationId: string };

export interface PermisoDeCatalogo {
  resourceType: string;
  action: string;
}

const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

/** Crear: devuelve la organización dueña (`null` = compartida) o lanza. */
export async function requireCatalogoAccess(
  userAccountId: string,
  dueno: Dueno,
  permiso: PermisoDeCatalogo,
): Promise<string | null> {
  if (dueno.tipo === "compartido") {
    if (!(await can(userAccountId, permiso.action, permiso.resourceType, PLATAFORMA, "internal"))) {
      throw new CatalogoError("forbidden");
    }
    return null;
  }
  const sitio = await prisma.location.findUnique({ where: { id: dueno.locationId }, select: { organizationId: true } });
  if (!sitio?.organizationId) throw new CatalogoError("sitio_sin_organizacion");
  const objetivo = { scopeType: "location", scopeRefId: dueno.locationId } as const;
  if (!(await can(userAccountId, permiso.action, permiso.resourceType, objetivo, "internal"))) {
    throw new CatalogoError("forbidden");
  }
  return sitio.organizationId;
}

/** Editar o retirar una entrada que ya existe. */
export async function requireEntradaDeCatalogoAccess(
  userAccountId: string,
  entrada: { organizationId: string | null },
  permiso: PermisoDeCatalogo,
): Promise<void> {
  if (entrada.organizationId === null) {
    if (!(await can(userAccountId, permiso.action, permiso.resourceType, PLATAFORMA, "internal"))) {
      throw new CatalogoError("forbidden");
    }
    return;
  }
  const sitios = await prisma.location.findMany({ where: { organizationId: entrada.organizationId }, select: { id: true } });
  for (const s of sitios) {
    if (await can(userAccountId, permiso.action, permiso.resourceType, { scopeType: "location", scopeRefId: s.id }, "internal")) return;
  }
  throw new CatalogoError("forbidden");
}

/** Las organizaciones con al menos un sitio donde el usuario tiene el permiso. */
export async function organizacionesVisibles(userAccountId: string, permiso: PermisoDeCatalogo): Promise<string[]> {
  const sitios = await prisma.location.findMany({
    where: { organizationId: { not: null } },
    select: { id: true, organizationId: true },
  });
  const orgs = new Set<string>();
  for (const s of sitios) {
    if (orgs.has(s.organizationId!)) continue;
    if (await can(userAccountId, permiso.action, permiso.resourceType, { scopeType: "location", scopeRefId: s.id }, "internal")) {
      orgs.add(s.organizationId!);
    }
  }
  return [...orgs];
}

/** Lo compartido, más lo de estas organizaciones. */
export function filtroVisible(organizaciones: readonly string[]) {
  return { OR: [{ organizationId: null }, { organizationId: { in: [...organizaciones] } }] as [
    { organizationId: null },
    { organizationId: { in: string[] } },
  ] };
}
```

Comprobar que `can` se importa de ese camino (`grep -n "export async function can" lib/rbac/*.ts`); si vive en otro archivo, importarlo de ahí.

- [ ] **Paso 8: pasa** (`npx vitest run tests/catalogos/propiedad.test.ts`; esperado 7 pasados). **Flip-test:** en `requireCatalogoAccess`, sustituir `objetivo` por `PLATAFORMA` en la rama propia → tiene que caer **«propio: el permiso se juzga en el sitio…»** (el jefe deja de poder). Restaurar.

- [ ] **Paso 9: el inventario de acceso sigue verde.**

```bash
npx vitest run tests/arquitectura/acceso-a-datos.test.ts; echo "salida=$?"
```

Si nombra una operación de `lib/catalogos/propiedad.ts` como «sin patrón», es que el guardia no reconoce el nombre: revisar que llama a `can(`. No añadirla a la lista blanca sin decir por qué.

- [ ] **Paso 10: commit** de los 6 archivos (`registro.ts`, `propiedad.ts`, `tests/helpers/fixturesDeCatalogo.ts`, las dos pruebas, `pruebas-por-compuerta.txt`). Mensaje: `catálogos T3: el contrato común — quién ve, quién edita, y su guardia`.

---

## Tarea 4: el servicio del catálogo de modelos

**Files:**
- Create: `lib/equipos/modelos.ts`
- Test: `tests/equipos/modelos.test.ts` (con base)
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consumes: `requireCatalogoAccess`, `requireEntradaDeCatalogoAccess`, `organizacionesVisibles`, `filtroVisible`, `Dueno` (Tarea 3).
- Produces:

```ts
export class ModeloError extends Error {}
export interface DatosDeModelo {
  manufacturer: string;
  modelName: string;
  recommendedMaintenanceDays?: number | null;
  capacityValue?: string | null;          // decimal como texto, tal cual llega del formulario
  capacityUnit?: string | null;
  contactMaterial?: EquipmentContactMaterial | null;
  contactMaterialNote?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  notes?: string | null;
}
export interface CrearModeloInput extends DatosDeModelo { dueno: Dueno; kind: EquipmentKind }
export interface EspecificacionInput {
  quantity: string; unit: string;
  rangeMin?: string | null; rangeMax?: string | null; resolution?: string | null; accuracyAbs?: string | null;
}
export async function crearModelo(userAccountId: string, input: CrearModeloInput): Promise<{ id: string }>;
export async function editarModelo(userAccountId: string, modelId: string, datos: DatosDeModelo): Promise<void>;
export async function retirarModelo(userAccountId: string, modelId: string, cuando: Date): Promise<void>;
export async function declararEspecificacion(userAccountId: string, modelId: string, e: EspecificacionInput): Promise<{ id: string }>;
export async function retirarEspecificacion(userAccountId: string, specId: string, cuando: Date): Promise<void>;
export async function listarModelos(userAccountId: string, filtro?: { kind?: EquipmentKind; incluirRetirados?: boolean }): Promise<{ compartidos: ModeloEnLista[]; propios: ModeloEnLista[] }>;
export async function modeloParaFicha(userAccountId: string, modelId: string): Promise<FichaDeModelo>;
export async function modelosParaElegir(userAccountId: string, organizationId: string, kind: EquipmentKind): Promise<{ compartidos: ModeloEnLista[]; propios: ModeloEnLista[] }>;
export async function puedeEditarModelo(userAccountId: string, modelId: string): Promise<boolean>;
export async function puedeCrearCompartido(userAccountId: string): Promise<boolean>;
export interface ModeloEnLista { id: string; manufacturer: string; modelName: string; kind: EquipmentKind; organizationId: string | null; recommendedMaintenanceDays: number | null; retiredAt: Date | null; equipos: number }
```

`FichaDeModelo` = el modelo con `specs` vigentes (`retiredAt: null`, orden `displayOrder`, `quantity`), `organization { name }` y `equipment` visibles `{ id, name }`.

- [ ] **Paso 1: la prueba.** `tests/equipos/modelos.test.ts`. Cada caso lleva su control positivo:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  ModeloError,
  crearModelo,
  declararEspecificacion,
  editarModelo,
  listarModelos,
  modeloParaFicha,
  modelosParaElegir,
  puedeCrearCompartido,
  retirarEspecificacion,
  retirarModelo,
} from "../../lib/equipos/modelos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let admin: string, jefeA: string, operarioA: string, orgA: string, orgB: string, sitioA: string, sitioB: string, RUN: string;

beforeAll(async () => {
  f = await montarFixtures("mod");
  ({ admin, jefeA, operarioA, orgA, orgB, sitioA, sitioB } = f);
  RUN = f.run;
});
afterAll(async () => {
  const modelos = await prisma.equipmentModel.findMany({ where: { manufacturer: { contains: RUN } }, select: { id: true } });
  const ids = modelos.map((m) => m.id);
  await prisma.equipmentModelSpec.deleteMany({ where: { modelId: { in: ids } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: ids } } });
  await f.limpiar();
});

describe("puedeCrearCompartido", () => {
  it("sólo con plataforma", async () => {
    expect(await puedeCrearCompartido(admin)).toBe(true);
    expect(await puedeCrearCompartido(jefeA)).toBe(false);
  });
});

describe("crearModelo", () => {
  it("el jefe crea un modelo propio; la organización sale del sitio", async () => {
    const m = await crearModelo(jefeA, {
      dueno: { tipo: "propio", locationId: sitioA },
      kind: "instrument", manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1",
      recommendedMaintenanceDays: 180, provenanceClass: "manufacturer_specification",
    });
    const fila = await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } });
    expect(fila.organizationId).toBe(orgA);
    expect(fila.createdBy).toBe(jefeA);
  });

  it("el operario no crea modelos (definir el catálogo es gestión)", async () => {
    await expect(
      crearModelo(operarioA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "op", provenanceClass: "original_record" }),
    ).rejects.toThrow();
  });

  it("un compartido exige plataforma", async () => {
    await expect(
      crearModelo(jefeA, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "comp", provenanceClass: "original_record" }),
    ).rejects.toThrow();
    const m = await crearModelo(admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "comp", provenanceClass: "original_record" });
    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } })).organizationId).toBeNull();
  });

  it("el duplicado sin mayúsculas sale como ModeloError legible, no como error de Prisma", async () => {
    await expect(
      crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: ` atago ${RUN}`, modelName: "pal-1", provenanceClass: "original_record" }),
    ).rejects.toThrow(new ModeloError("modelo_duplicado"));
  });

  it("escribe un AuditEvent en la misma transacción", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "vessel", manufacturer: `X ${RUN}`, modelName: "tanque 500", capacityValue: "500", capacityUnit: "L", contactMaterial: "acero_inoxidable", provenanceClass: "manufacturer_specification" });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "equipment_model", entityId: m.id, operation: "create" } });
    expect(ev?.actorUserAccountId).toBe(jefeA);
  });
});

describe("editar y retirar", () => {
  it("editar deja el valor anterior en la auditoría", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `E ${RUN}`, modelName: "e1", recommendedMaintenanceDays: 90, provenanceClass: "original_record" });
    await editarModelo(jefeA, m.id, { manufacturer: `E ${RUN}`, modelName: "e1", recommendedMaintenanceDays: 120, provenanceClass: "original_record" });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment_model", entityId: m.id, operation: "update" } });
    expect((ev.before as { recommendedMaintenanceDays: number }).recommendedMaintenanceDays).toBe(90);
    expect((ev.after as { recommendedMaintenanceDays: number }).recommendedMaintenanceDays).toBe(120);
  });

  it("el jefe de A no edita un modelo de B ni uno compartido", async () => {
    const deB = await crearModelo(admin, { dueno: { tipo: "propio", locationId: sitioB }, kind: "instrument", manufacturer: `B ${RUN}`, modelName: "b1", provenanceClass: "original_record" });
    await expect(editarModelo(jefeA, deB.id, { manufacturer: `B ${RUN}`, modelName: "b1", provenanceClass: "original_record" })).rejects.toThrow();
  });

  it("retirar no borra: la fila sigue y deja de ofrecerse", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `R ${RUN}`, modelName: "r1", provenanceClass: "original_record" });
    await retirarModelo(jefeA, m.id, new Date());
    expect(await prisma.equipmentModel.findUnique({ where: { id: m.id } })).not.toBeNull();
    const elegibles = await modelosParaElegir(jefeA, orgA, "instrument");
    expect(elegibles.propios.map((x) => x.id)).not.toContain(m.id);
  });
});

describe("especificaciones", () => {
  it("se declaran, se retiran, y la ficha sólo muestra las vigentes", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `S ${RUN}`, modelName: "s1", provenanceClass: "manufacturer_specification" });
    const bx = await declararEspecificacion(jefeA, m.id, { quantity: "sólidos solubles", unit: "°Bx", rangeMin: "0", rangeMax: "32", resolution: "0.1", accuracyAbs: "0.2" });
    await declararEspecificacion(jefeA, m.id, { quantity: "temperatura", unit: "°C", rangeMin: "10", rangeMax: "40" });
    await retirarEspecificacion(jefeA, bx.id, new Date());
    const ficha = await modeloParaFicha(jefeA, m.id);
    expect(ficha.specs.map((s) => s.quantity)).toEqual(["temperatura"]);
  });

  it("una especificación en un modelo de vaso se rechaza", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "vessel", manufacturer: `V ${RUN}`, modelName: "v1", provenanceClass: "original_record" });
    await expect(declararEspecificacion(jefeA, m.id, { quantity: "x", unit: "y" })).rejects.toThrow(new ModeloError("especificacion_solo_en_instrumentos"));
  });
});

describe("listarModelos", () => {
  it("el operario ve los compartidos y los de su organización, no los de B", async () => {
    const lista = await listarModelos(operarioA);
    const todos = [...lista.compartidos, ...lista.propios];
    expect(todos.some((m) => m.organizationId === orgB)).toBe(false);
    expect(lista.propios.some((m) => m.organizationId === orgA)).toBe(true);
    expect(lista.compartidos.every((m) => m.organizationId === null)).toBe(true);
  });
});
```

Registrar en `base-sembrada`. Verla fallar.

- [ ] **Paso 2: la implementación.** `lib/equipos/modelos.ts`:

```ts
/**
 * El catálogo de modelos de equipo (spec de catálogos §3.1-3.2). Primer consumidor
 * del contrato común de `lib/catalogos/`.
 *
 * Definir qué es un «ATAGO PAL-1» es GESTIÓN, no faena: `equipment:manage`, como
 * `crearMaterial`. Las especificaciones son del FABRICANTE y no se mezclan con los
 * contrastes contra patrón, que dicen lo que el aparato hace de verdad.
 */
import { Prisma, type EquipmentContactMaterial, type EquipmentKind, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import {
  filtroVisible,
  organizacionesVisibles,
  requireCatalogoAccess,
  requireEntradaDeCatalogoAccess,
  type Dueno,
} from "../catalogos/propiedad";
import { prisma } from "../db";

export class ModeloError extends Error {}

const GESTIONAR = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;

export interface DatosDeModelo {
  manufacturer: string;
  modelName: string;
  recommendedMaintenanceDays?: number | null;
  capacityValue?: string | null;
  capacityUnit?: string | null;
  contactMaterial?: EquipmentContactMaterial | null;
  contactMaterialNote?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  notes?: string | null;
}

export interface CrearModeloInput extends DatosDeModelo {
  dueno: Dueno;
  kind: EquipmentKind;
}

export interface EspecificacionInput {
  quantity: string;
  unit: string;
  rangeMin?: string | null;
  rangeMax?: string | null;
  resolution?: string | null;
  accuracyAbs?: string | null;
}

export interface ModeloEnLista {
  id: string;
  manufacturer: string;
  modelName: string;
  kind: EquipmentKind;
  organizationId: string | null;
  recommendedMaintenanceDays: number | null;
  retiredAt: Date | null;
  equipos: number;
}

const texto = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

/** Normaliza y valida lo que la base también rechazaría, para devolver una frase legible. */
function datosLimpios(kind: EquipmentKind, d: DatosDeModelo) {
  const manufacturer = d.manufacturer.trim();
  const modelName = d.modelName.trim();
  if (!manufacturer) throw new ModeloError("fabricante_obligatorio");
  if (!modelName) throw new ModeloError("modelo_obligatorio");
  const dias = d.recommendedMaintenanceDays ?? null;
  if (dias !== null && (!Number.isInteger(dias) || dias <= 0)) throw new ModeloError("mantenimiento_positivo");
  const capacityValue = texto(d.capacityValue);
  const capacityUnit = texto(d.capacityUnit);
  if ((capacityValue === null) !== (capacityUnit === null)) throw new ModeloError("capacidad_con_unidad");
  const material = d.contactMaterial ?? null;
  const conCapacidad = kind === "vessel" || kind === "machine";
  if (!conCapacidad && (capacityValue !== null || material !== null)) throw new ModeloError("capacidad_solo_en_vaso_o_maquina");
  const nota = texto(d.contactMaterialNote);
  if (material === "otro" && nota === null) throw new ModeloError("material_otro_con_nota");
  return {
    manufacturer,
    modelName,
    recommendedMaintenanceDays: dias,
    capacityValue: capacityValue === null ? null : new Prisma.Decimal(capacityValue),
    capacityUnit,
    contactMaterial: material,
    contactMaterialNote: nota,
    provenanceClass: d.provenanceClass,
    sourceReference: texto(d.sourceReference),
    notes: texto(d.notes),
  };
}

function esDuplicado(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function crearModelo(userAccountId: string, input: CrearModeloInput): Promise<{ id: string }> {
  const organizationId = await requireCatalogoAccess(userAccountId, input.dueno, GESTIONAR);
  const datos = datosLimpios(input.kind, input);
  try {
    return await prisma.$transaction(async (tx) => {
      const m = await tx.equipmentModel.create({
        data: { ...datos, kind: input.kind, organizationId, createdBy: userAccountId },
        select: { id: true },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment_model",
          entityId: m.id,
          operation: "create",
          sourceInterface: "lib/equipos/modelos.ts",
          after: { ...datos, kind: input.kind, organizationId },
        },
        tx,
      );
      return m;
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ModeloError("modelo_duplicado");
    throw e;
  }
}

export async function editarModelo(userAccountId: string, modelId: string, d: DatosDeModelo): Promise<void> {
  const antes = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!antes) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, antes, GESTIONAR);
  const datos = datosLimpios(antes.kind, d);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.equipmentModel.update({ where: { id: modelId }, data: datos });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment_model",
          entityId: modelId,
          operation: "update",
          sourceInterface: "lib/equipos/modelos.ts",
          before: {
            manufacturer: antes.manufacturer,
            modelName: antes.modelName,
            recommendedMaintenanceDays: antes.recommendedMaintenanceDays,
            capacityValue: antes.capacityValue?.toString() ?? null,
            capacityUnit: antes.capacityUnit,
            contactMaterial: antes.contactMaterial,
            contactMaterialNote: antes.contactMaterialNote,
            provenanceClass: antes.provenanceClass,
            sourceReference: antes.sourceReference,
            notes: antes.notes,
          },
          after: { ...datos, capacityValue: datos.capacityValue?.toString() ?? null },
        },
        tx,
      );
    });
  } catch (e) {
    if (esDuplicado(e)) throw new ModeloError("modelo_duplicado");
    throw e;
  }
}

export async function retirarModelo(userAccountId: string, modelId: string, cuando: Date): Promise<void> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  if (m.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.equipmentModel.update({ where: { id: modelId }, data: { retiredAt: cuando } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model", entityId: modelId, operation: "retire", sourceInterface: "lib/equipos/modelos.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

export async function declararEspecificacion(userAccountId: string, modelId: string, e: EspecificacionInput): Promise<{ id: string }> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId } });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
  if (m.kind !== "instrument") throw new ModeloError("especificacion_solo_en_instrumentos");
  const quantity = e.quantity.trim();
  const unit = e.unit.trim();
  if (!quantity || !unit) throw new ModeloError("magnitud_y_unidad_obligatorias");
  const dec = (v: string | null | undefined) => (texto(v) === null ? null : new Prisma.Decimal(texto(v)!));
  const data = { quantity, unit, rangeMin: dec(e.rangeMin), rangeMax: dec(e.rangeMax), resolution: dec(e.resolution), accuracyAbs: dec(e.accuracyAbs) };
  return prisma.$transaction(async (tx) => {
    const s = await tx.equipmentModelSpec.create({ data: { ...data, modelId, createdBy: userAccountId }, select: { id: true } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "equipment_model_spec",
        entityId: s.id,
        operation: "create",
        sourceInterface: "lib/equipos/modelos.ts",
        after: { modelId, quantity, unit, rangeMin: e.rangeMin ?? null, rangeMax: e.rangeMax ?? null, resolution: e.resolution ?? null, accuracyAbs: e.accuracyAbs ?? null },
      },
      tx,
    );
    return s;
  });
}

export async function retirarEspecificacion(userAccountId: string, specId: string, cuando: Date): Promise<void> {
  const s = await prisma.equipmentModelSpec.findUnique({ where: { id: specId }, include: { model: true } });
  if (!s) throw new ModeloError("especificacion_no_encontrada");
  await requireEntradaDeCatalogoAccess(userAccountId, s.model, GESTIONAR);
  if (s.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.equipmentModelSpec.update({ where: { id: specId }, data: { retiredAt: cuando } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "equipment_model_spec", entityId: specId, operation: "retire", sourceInterface: "lib/equipos/modelos.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

async function enLista(where: Prisma.EquipmentModelWhereInput): Promise<ModeloEnLista[]> {
  const filas = await prisma.equipmentModel.findMany({
    where,
    select: { id: true, manufacturer: true, modelName: true, kind: true, organizationId: true, recommendedMaintenanceDays: true, retiredAt: true, _count: { select: { equipment: true } } },
    orderBy: [{ manufacturer: "asc" }, { modelName: "asc" }],
  });
  return filas.map(({ _count, ...f }) => ({ ...f, equipos: _count.equipment }));
}

export async function listarModelos(
  userAccountId: string,
  filtro: { kind?: EquipmentKind; incluirRetirados?: boolean } = {},
): Promise<{ compartidos: ModeloEnLista[]; propios: ModeloEnLista[] }> {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const base: Prisma.EquipmentModelWhereInput = {
    ...(filtro.kind ? { kind: filtro.kind } : {}),
    ...(filtro.incluirRetirados ? {} : { retiredAt: null }),
  };
  const [compartidos, propios] = await Promise.all([
    enLista({ ...base, organizationId: null }),
    orgs.length > 0 ? enLista({ ...base, organizationId: { in: orgs } }) : Promise.resolve([]),
  ]);
  return { compartidos, propios };
}

/** Para el desplegable del alta: sólo vigentes, del tipo dado, compartidos + los de ESA organización. */
export async function modelosParaElegir(userAccountId: string, organizationId: string, kind: EquipmentKind) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const propios = orgs.includes(organizationId)
    ? await enLista({ kind, retiredAt: null, organizationId })
    : [];
  const compartidos = await enLista({ kind, retiredAt: null, organizationId: null });
  return { compartidos, propios };
}

export async function modeloParaFicha(userAccountId: string, modelId: string) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const m = await prisma.equipmentModel.findFirst({
    where: { id: modelId, ...filtroVisible(orgs) },
    include: {
      organization: { select: { name: true } },
      specs: { where: { retiredAt: null }, orderBy: [{ displayOrder: "asc" }, { quantity: "asc" }] },
      equipment: { where: { organizationId: { in: orgs } }, select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!m) throw new ModeloError("modelo_no_encontrado");
  return m;
}
export type FichaDeModelo = Awaited<ReturnType<typeof modeloParaFicha>>;

export async function puedeEditarModelo(userAccountId: string, modelId: string): Promise<boolean> {
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId }, select: { organizationId: true } });
  if (!m) return false;
  try {
    await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
    return true;
  } catch {
    return false;
  }
}

export async function puedeCrearCompartido(userAccountId: string): Promise<boolean> {
  try {
    await requireCatalogoAccess(userAccountId, { tipo: "compartido" }, GESTIONAR);
    return true;
  } catch {
    return false;
  }
}
```

Nota: `modeloParaFicha` filtra los equipos por las organizaciones visibles. Un modelo compartido no enseña a una finca los equipos de otra.

- [ ] **Paso 3: pasa** (`npx vitest run tests/equipos/modelos.test.ts`; contar 12 pasados), y siguen verdes `tests/arquitectura/acceso-a-datos.test.ts`, `vocabulario-de-audit.test.ts`, `audit-atomico.test.ts` y `catalogos-con-contrato.test.ts`.

- [ ] **Paso 4: flip-test** (commit antes): quitar `, tx` del `recordAuditEvent` de `crearModelo` → tiene que caer `tests/arquitectura/audit-atomico.test.ts`, **nombrando `lib/equipos/modelos.ts`**. Si no cae, el guardia no cubre este archivo: decirlo en el PR y añadir el caso a esa prueba. Restaurar.

- [ ] **Paso 5: commit** (3 archivos). Mensaje: `catálogos T4: el catálogo de modelos de equipo`.

---

## Tarea 5: los datos nuevos de cada equipo

**Files:**
- Modify: `lib/equipos/equipos.ts` (`RegistrarEquipoInput`, `registrarEquipo`, nuevas `editarDatosDeEquipo`, `puedeSobreEquipo`, `proveedoresPosibles`)
- Test: `tests/equipos/datosDeEquipo.test.ts` (con base)
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produces:

```ts
export interface DatosDeEquipo {
  modelId?: string | null;
  serialNumber?: string | null;
  internalCode?: string | null;
  supplierOrganizationId?: string | null;
  warrantyUntil?: Date | null;       // ya convertido con fechaDeDia
}
// RegistrarEquipoInput gana: extends DatosDeEquipo
export async function editarDatosDeEquipo(userAccountId: string, equipmentId: string, datos: DatosDeEquipo): Promise<void>;
export async function puedeSobreEquipo(userAccountId: string, equipmentId: string, accion: "view" | "manage" | "report_condition"): Promise<boolean>;
export async function proveedoresPosibles(userAccountId: string): Promise<Array<{ id: string; name: string }>>;
```

- [ ] **Paso 1: la prueba.** `tests/equipos/datosDeEquipo.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { EquipoError, editarDatosDeEquipo, puedeSobreEquipo, registrarEquipo } from "../../lib/equipos/equipos";
import { crearModelo, retirarModelo } from "../../lib/equipos/modelos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let modeloComp: string, modeloDeB: string, modeloVaso: string, modeloRetirado: string;

const alta = (extra: Record<string, unknown> = {}) =>
  registrarEquipo(f.jefeA, {
    name: `TEST eq ${f.run} ${Math.random()}`,
    kind: "instrument",
    organizationId: f.orgA,
    initialLocationId: f.sitioA,
    provenanceClass: "original_record",
    ...extra,
  });

beforeAll(async () => {
  f = await montarFixtures("dat");
  const m = (dueno: object, kind: "instrument" | "vessel", nombre: string) =>
    crearModelo(f.admin, { dueno: dueno as never, kind, manufacturer: `D ${f.run}`, modelName: nombre, provenanceClass: "manufacturer_specification" });
  modeloComp = (await m({ tipo: "compartido" }, "instrument", "comp")).id;
  modeloDeB = (await m({ tipo: "propio", locationId: f.sitioB }, "instrument", "deB")).id;
  modeloVaso = (await m({ tipo: "propio", locationId: f.sitioA }, "vessel", "vaso")).id;
  modeloRetirado = (await m({ tipo: "propio", locationId: f.sitioA }, "instrument", "retirado")).id;
  await retirarModelo(f.admin, modeloRetirado, new Date());
});

afterAll(async () => {
  const eqs = await prisma.equipment.findMany({ where: { organizationId: f.orgA }, select: { id: true } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: eqs.map((e) => e.id) } } });
  await prisma.equipment.deleteMany({ where: { organizationId: f.orgA } });
  await prisma.equipmentModel.deleteMany({ where: { manufacturer: `D ${f.run}` } });
  await f.limpiar();
});

describe("registrarEquipo con los datos nuevos", () => {
  it("guarda modelo compartido, serie, código y garantía como día", async () => {
    const e = await alta({ modelId: modeloComp, serialNumber: " SN-1 ", internalCode: `REF-${f.run}`, warrantyUntil: new Date("2027-03-01T00:00:00Z") });
    const fila = await prisma.equipment.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila.modelId).toBe(modeloComp);
    expect(fila.serialNumber).toBe("SN-1");
    expect(fila.warrantyUntil?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
  it("rechaza, con frase legible, un modelo de otra organización, de otro tipo o retirado", async () => {
    await expect(alta({ modelId: modeloDeB })).rejects.toThrow(new EquipoError("modelo_no_elegible"));
    await expect(alta({ modelId: modeloVaso })).rejects.toThrow(new EquipoError("modelo_de_otro_tipo"));
    await expect(alta({ modelId: modeloRetirado })).rejects.toThrow(new EquipoError("modelo_retirado"));
  });
  it("código interno repetido en la organización, con otras mayúsculas", async () => {
    await alta({ internalCode: `DUP-${f.run}` });
    await expect(alta({ internalCode: ` dup-${f.run}` })).rejects.toThrow(new EquipoError("codigo_interno_duplicado"));
  });
});

describe("editarDatosDeEquipo", () => {
  it("deja el antes y el después en la auditoría", async () => {
    const e = await alta({ serialNumber: "A" });
    await editarDatosDeEquipo(f.jefeA, e.id, { serialNumber: "B" });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment", entityId: e.id, operation: "update_datos" } });
    expect((ev.before as { serialNumber: string }).serialNumber).toBe("A");
    expect((ev.after as { serialNumber: string }).serialNumber).toBe("B");
  });
  it("el operario no edita los datos (gestión)", async () => {
    const e = await alta();
    await expect(editarDatosDeEquipo(f.operarioA, e.id, { serialNumber: "X" })).rejects.toThrow();
  });
});

describe("puedeSobreEquipo", () => {
  it("el operario informa pero no gestiona; el ajeno, nada", async () => {
    const e = await alta();
    expect(await puedeSobreEquipo(f.operarioA, e.id, "report_condition")).toBe(true);
    expect(await puedeSobreEquipo(f.operarioA, e.id, "manage")).toBe(false);
    expect(await puedeSobreEquipo(f.ajeno, e.id, "view")).toBe(false);
  });
});
```

Esperado al pasar: 6 pruebas.

- [ ] **Paso 2: verla fallar.** Después, la implementación en `lib/equipos/equipos.ts`:

```ts
export interface DatosDeEquipo {
  modelId?: string | null;
  serialNumber?: string | null;
  internalCode?: string | null;
  supplierOrganizationId?: string | null;
  warrantyUntil?: Date | null;
}
```

`RegistrarEquipoInput` pasa a `export interface RegistrarEquipoInput extends DatosDeEquipo { … }`, con los campos de hoy sin cambios.

Una función privada que usan el alta y la edición:

```ts
/**
 * El modelo elegido tiene que ser compartido o de la MISMA organización, del
 * mismo tipo, y vigente. La base lo impide también (FK compuesta + disparador);
 * esto sólo lo dice con una frase legible.
 */
async function comprobarModelo(modelId: string | null | undefined, organizationId: string, kind: EquipmentKind) {
  if (!modelId) return;
  const m = await prisma.equipmentModel.findUnique({ where: { id: modelId }, select: { organizationId: true, kind: true, retiredAt: true } });
  if (!m) throw new EquipoError("modelo_no_encontrado");
  if (m.organizationId !== null && m.organizationId !== organizationId) throw new EquipoError("modelo_no_elegible");
  if (m.kind !== kind) throw new EquipoError("modelo_de_otro_tipo");
  if (m.retiredAt) throw new EquipoError("modelo_retirado");
}

function datosDeEquipoLimpios(d: DatosDeEquipo) {
  const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);
  return {
    modelId: d.modelId || null,
    serialNumber: t(d.serialNumber),
    internalCode: t(d.internalCode),
    supplierOrganizationId: d.supplierOrganizationId || null,
    warrantyUntil: d.warrantyUntil ?? null,
  };
}

function esCodigoDuplicado(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
```

(Importar `Prisma` como valor si el archivo sólo lo importaba como tipo.)

En `registrarEquipo`: tras las validaciones de hoy, `await comprobarModelo(input.modelId, input.organizationId, input.kind);`. En el `create`, añadir `...datosDeEquipoLimpios(input)`. Envolver el `$transaction` en `try/catch` que traduzca `esCodigoDuplicado` a `EquipoError("codigo_interno_duplicado")`. El `after` del `AuditEvent` gana `modelId`, `serialNumber`, `internalCode`, `supplierOrganizationId` y `warrantyUntil` (este último como ISO o `null`).

```ts
export async function editarDatosDeEquipo(userAccountId: string, equipmentId: string, datos: DatosDeEquipo): Promise<void> {
  const antes = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!antes) throw new EquipoError("equipment_not_found");
  await exigePermiso(userAccountId, "manage", antes);
  await comprobarModelo(datos.modelId, antes.organizationId, antes.kind);
  const limpios = datosDeEquipoLimpios(datos);
  try {
    await prisma.$transaction(async (tx) => {
      await tx.equipment.update({ where: { id: equipmentId }, data: limpios });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          entityType: "equipment",
          entityId: equipmentId,
          operation: "update_datos",
          sourceInterface: "lib/equipos/equipos.ts",
          before: {
            modelId: antes.modelId,
            serialNumber: antes.serialNumber,
            internalCode: antes.internalCode,
            supplierOrganizationId: antes.supplierOrganizationId,
            warrantyUntil: antes.warrantyUntil?.toISOString() ?? null,
          },
          after: { ...limpios, warrantyUntil: limpios.warrantyUntil?.toISOString() ?? null },
        },
        tx,
      );
    });
  } catch (e) {
    if (esCodigoDuplicado(e)) throw new EquipoError("codigo_interno_duplicado");
    throw e;
  }
}

/** Un permiso sobre un equipo, para otros módulos (rutinas, documentos). */
export async function puedeSobreEquipo(
  userAccountId: string,
  equipmentId: string,
  accion: "view" | "manage" | "report_condition",
): Promise<boolean> {
  const equipo = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true, projectId: true, classification: true } });
  if (!equipo) return false;
  const objetivo = await objetivoDeEquipo(equipo);
  return can(userAccountId, accion, "equipment", objetivo, equipo.classification);
}

/**
 * Proveedores para el desplegable: organizaciones de tipo `supplier` aprobadas.
 * Un proveedor es una entidad canónica (CLAUDE.md §9), no texto. Si no existe,
 * se da de alta por la vía de organizaciones de siempre: aquí no se crea.
 */
export async function proveedoresPosibles(userAccountId: string) {
  const orgs = await organizacionesVisibles(userAccountId, { resourceType: "equipment", action: "view" });
  if (orgs.length === 0) return [];
  return prisma.organization.findMany({
    where: { organizationType: "supplier", status: "approved" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
```

Importar `organizacionesVisibles` de `../catalogos/propiedad` en `lib/equipos/equipos.ts`. Sin organizaciones visibles, la lista de proveedores sale vacía: quien no ve ningún equipo no necesita elegir proveedor.

**Con #417 fusionado** (Tarea 0 Paso 2): en `puedeSobreEquipo`, para `accion === "manage"`, devolver `puedeConfigurar(userAccountId, objetivo, equipo.classification)` en vez de `can(...)`. Así la concesión de `edit_beneficio` vale también aquí, como en el resto de equipos.

- [ ] **Paso 3: pasa** (`npx vitest run tests/equipos/datosDeEquipo.test.ts tests/equipos/equipos.test.ts`). **`equipos.test.ts` tiene que seguir verde**: el alta de siempre no puede romperse.

- [ ] **Paso 4: flip-test** (commit antes): comentar la línea `if (m.organizationId !== null && m.organizationId !== organizationId)` → la prueba del modelo de otra organización **sigue fallando, pero con otro error**, el del disparador (`modelo_de_otra_organizacion` en el mensaje de Prisma). Ése es el punto: la base es la red. Comprobar el texto del error y anotarlo en el PR. Restaurar.

- [ ] **Paso 5: commit** (3 archivos). Mensaje: `catálogos T5: modelo, serie, código, proveedor y garantía de cada equipo`.

---

## Tarea 6: el servicio de rutinas

**Files:**
- Create: `lib/rutinas/rutinas.ts`
- Test: `tests/rutinas/rutinas.test.ts` (con base)
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consumes: `estadoDeRutina` (Tarea 2), `puedeSobreEquipo` (Tarea 5), `diaDeHoy` de `lib/time/diaDeHoy.ts`.
- Produces:

```ts
export class RutinaError extends Error {}
export interface NuevaRutina { equipmentId: string; kind: CareRoutineKind; kindNote?: string | null; intervalDays: number; instructions?: string | null }
export interface NuevoRegistro { routineId: string; performedOn: Date; performedByPersonId?: string | null; note?: string | null; provenanceClass: ProvenanceClass; sourceReference?: string | null }
export async function requireRutinaAccess(userAccountId: string, cosa: { equipmentId: string | null; locationId: string | null }, accion: "manage" | "report_condition"): Promise<void>;
export async function crearRutina(userAccountId: string, r: NuevaRutina): Promise<{ id: string }>;
export async function cambiarIntervalo(userAccountId: string, routineId: string, intervalDays: number): Promise<void>;
export async function retirarRutina(userAccountId: string, routineId: string, cuando: Date): Promise<void>;
export async function registrarRealizada(userAccountId: string, r: NuevoRegistro): Promise<{ id: string }>;
export async function anularRegistro(userAccountId: string, eventId: string, motivo: string): Promise<void>;
export async function rutinasDeEquipo(userAccountId: string, equipmentId: string, hoy: string): Promise<RutinaConEstado[]>;
export async function vencidasPorEquipo(userAccountId: string, equipmentIds: readonly string[], hoy: string): Promise<Map<string, number>>;
export type RutinaConEstado = { id: string; kind: CareRoutineKind; kindNote: string | null; intervalDays: number; instructions: string | null; estado: EstadoDeRutina; registros: Array<{ id: string; performedOn: Date; note: string | null; voidedAt: Date | null; voidReason: string | null; performedBy: { displayName: string } | null }> };
```

- [ ] **Paso 1: la prueba.** `tests/rutinas/rutinas.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { registrarEquipo } from "../../lib/equipos/equipos";
import {
  RutinaError,
  anularRegistro,
  cambiarIntervalo,
  crearRutina,
  registrarRealizada,
  requireRutinaAccess,
  retirarRutina,
  rutinasDeEquipo,
  vencidasPorEquipo,
} from "../../lib/rutinas/rutinas";
import { diaDeHoy } from "../../lib/time/diaDeHoy";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

/** Un equipo del sitio A, adquirido el 2026-01-01: fija la referencia cuando no hay registros. */
async function equipo() {
  return registrarEquipo(f.jefeA, {
    name: `TEST eq ${f.run} ${Math.random()}`,
    kind: "instrument",
    organizationId: f.orgA,
    initialLocationId: f.sitioA,
    provenanceClass: "original_record",
    acquiredAt: dia("2026-01-01"),
  });
}

beforeAll(async () => {
  f = await montarFixtures("rut");
});

afterAll(async () => {
  const eqs = (await prisma.equipment.findMany({ where: { organizationId: f.orgA }, select: { id: true } })).map((e) => e.id);
  const rs = (await prisma.careRoutine.findMany({ where: { equipmentId: { in: eqs } }, select: { id: true } })).map((r) => r.id);
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: { in: rs } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rs } } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: eqs } } });
  await prisma.equipment.deleteMany({ where: { id: { in: eqs } } });
  await f.limpiar();
});

describe("definir es gestión", () => {
  it("el jefe crea una rutina, con su AuditEvent", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "care_routine", entityId: r.id, operation: "create" } });
    expect(ev?.actorUserAccountId).toBe(f.jefeA);
  });
  it("el operario no crea rutinas", async () => {
    const e = await equipo();
    await expect(crearRutina(f.operarioA, { equipmentId: e.id, kind: "limpieza", intervalDays: 7 })).rejects.toThrow(new RutinaError("forbidden"));
  });
  it("una segunda rutina activa del mismo tipo sale como error legible", async () => {
    const e = await equipo();
    await crearRutina(f.jefeA, { equipmentId: e.id, kind: "limpieza", intervalDays: 7 });
    await expect(crearRutina(f.jefeA, { equipmentId: e.id, kind: "limpieza", intervalDays: 14 })).rejects.toThrow(new RutinaError("rutina_duplicada"));
  });
  it("las rutinas de instalación esperan su spec", async () => {
    await expect(requireRutinaAccess(f.jefeA, { equipmentId: null, locationId: f.sitioA }, "manage")).rejects.toThrow(
      new RutinaError("instalaciones_pendiente"),
    );
  });
  it("cambiar el intervalo deja antes y después; retirar no borra", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "fumigacion", intervalDays: 90 });
    await cambiarIntervalo(f.jefeA, r.id, 60);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "care_routine", entityId: r.id, operation: "update_interval" } });
    expect(ev.before).toEqual({ intervalDays: 90 });
    await retirarRutina(f.jefeA, r.id, new Date());
    expect((await prisma.careRoutine.findUniqueOrThrow({ where: { id: r.id } })).retiredAt).not.toBeNull();
  });
});

describe("apuntar es faena; anular es gestión", () => {
  it("el operario apunta; el ajeno no", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    await expect(registrarRealizada(f.ajeno, { routineId: r.id, performedOn: dia("2026-09-11"), provenanceClass: "original_record" })).rejects.toThrow();
  });
  it("una fecha que no ha llegado en ninguna zona del planeta se rechaza", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const manana = new Date(`${diaDeHoy(new Date(), "Etc/GMT-14")}T00:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    await expect(registrarRealizada(f.jefeA, { routineId: r.id, performedOn: manana, provenanceClass: "original_record" })).rejects.toThrow(
      new RutinaError("fecha_futura"),
    );
    // Control positivo: hoy en la zona más adelantada SÍ entra.
    await registrarRealizada(f.jefeA, { routineId: r.id, performedOn: new Date(`${diaDeHoy(new Date(), "Etc/GMT-14")}T00:00:00Z`), provenanceClass: "original_record" });
  });
  it("anular exige motivo, lo hace el jefe y no el operario, y la fila sigue", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const ev = await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    await expect(anularRegistro(f.jefeA, ev.id, "   ")).rejects.toThrow(new RutinaError("motivo_obligatorio"));
    await expect(anularRegistro(f.operarioA, ev.id, "error")).rejects.toThrow(new RutinaError("forbidden"));
    await anularRegistro(f.jefeA, ev.id, "fecha equivocada");
    const fila = await prisma.careRoutineEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(fila.voidReason).toBe("fecha equivocada");
  });
});

describe("el estado que ve la ficha y la lista", () => {
  it("con registro: próximo a 30 días; anulado: vuelve a la fecha de adquisición", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const ev = await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    const [antes] = await rutinasDeEquipo(f.operarioA, e.id, "2026-09-18");
    expect(antes!.estado).toEqual({ estado: "al_dia", ultimo: "2026-09-10", proximo: "2026-10-10", faltan: 22 });
    await anularRegistro(f.jefeA, ev.id, "no se hizo");
    const [despues] = await rutinasDeEquipo(f.operarioA, e.id, "2026-09-18");
    // Referencia = adquisición (2026-01-01) + 30 = 2026-01-31: vencida.
    expect(despues!.estado).toEqual({ estado: "vencida", ultimo: null, proximo: "2026-01-31", pasaron: 230 });
  });
  it("vencidasPorEquipo cuenta las vencidas y omite lo que no se ve", async () => {
    const e = await equipo();
    await crearRutina(f.jefeA, { equipmentId: e.id, kind: "limpieza", intervalDays: 7 });
    const paraElOperario = await vencidasPorEquipo(f.operarioA, [e.id], "2026-09-18");
    expect(paraElOperario.get(e.id)).toBe(1);
    const paraElAjeno = await vencidasPorEquipo(f.ajeno, [e.id], "2026-09-18");
    expect(paraElAjeno.has(e.id)).toBe(false);
  });
});
```

Esperado al pasar: 10 pruebas.

- [ ] **Paso 2: verla fallar; la implementación.** `lib/rutinas/rutinas.ts`:

```ts
/**
 * Rutinas periódicas: qué toca, cada cuánto, cuándo se hizo (spec §3.4, D1, D8).
 *
 * **Definir** una rutina es gestión (`equipment:manage`); **apuntar** que se hizo es
 * faena (`equipment:report_condition`), igual que informar del estado; **anular**
 * un registro es gestión. Las rutinas de INSTALACIÓN existen en la base pero no en
 * este servicio: sus permisos los fija el spec de instalaciones.
 */
import { Prisma, type CareRoutineKind, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { prisma } from "../db";
import { puedeSobreEquipo } from "../equipos/equipos";
import { diaDeHoy } from "../time/diaDeHoy";
import { estadoDeRutina, type EstadoDeRutina } from "./estado";

export class RutinaError extends Error {}

export interface NuevaRutina {
  equipmentId: string;
  kind: CareRoutineKind;
  kindNote?: string | null;
  intervalDays: number;
  instructions?: string | null;
}

export interface NuevoRegistro {
  routineId: string;
  performedOn: Date;
  performedByPersonId?: string | null;
  note?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function requireRutinaAccess(
  userAccountId: string,
  cosa: { equipmentId: string | null; locationId: string | null },
  accion: "manage" | "report_condition",
): Promise<void> {
  if (cosa.equipmentId === null) throw new RutinaError("instalaciones_pendiente");
  if (!(await puedeSobreEquipo(userAccountId, cosa.equipmentId, accion))) throw new RutinaError("forbidden");
}

const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function crearRutina(userAccountId: string, r: NuevaRutina): Promise<{ id: string }> {
  await requireRutinaAccess(userAccountId, { equipmentId: r.equipmentId, locationId: null }, "manage");
  if (!Number.isInteger(r.intervalDays) || r.intervalDays <= 0) throw new RutinaError("intervalo_positivo");
  const kindNote = t(r.kindNote);
  if (r.kind === "otra" && kindNote === null) throw new RutinaError("otra_con_nota");
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.careRoutine.create({
        data: { equipmentId: r.equipmentId, kind: r.kind, kindNote, intervalDays: r.intervalDays, instructions: t(r.instructions), createdBy: userAccountId },
        select: { id: true },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: c.id, operation: "create", sourceInterface: "lib/rutinas/rutinas.ts", after: { equipmentId: r.equipmentId, kind: r.kind, kindNote, intervalDays: r.intervalDays } },
        tx,
      );
      return c;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new RutinaError("rutina_duplicada");
    throw e;
  }
}

async function rutina(routineId: string) {
  const r = await prisma.careRoutine.findUnique({ where: { id: routineId } });
  if (!r) throw new RutinaError("rutina_no_encontrada");
  return r;
}

export async function cambiarIntervalo(userAccountId: string, routineId: string, intervalDays: number): Promise<void> {
  const r = await rutina(routineId);
  await requireRutinaAccess(userAccountId, r, "manage");
  if (!Number.isInteger(intervalDays) || intervalDays <= 0) throw new RutinaError("intervalo_positivo");
  await prisma.$transaction(async (tx) => {
    await tx.careRoutine.update({ where: { id: routineId }, data: { intervalDays } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: routineId, operation: "update_interval", sourceInterface: "lib/rutinas/rutinas.ts", before: { intervalDays: r.intervalDays }, after: { intervalDays } },
      tx,
    );
  });
}

export async function retirarRutina(userAccountId: string, routineId: string, cuando: Date): Promise<void> {
  const r = await rutina(routineId);
  await requireRutinaAccess(userAccountId, r, "manage");
  if (r.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.careRoutine.update({ where: { id: routineId }, data: { retiredAt: cuando } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: routineId, operation: "retire", sourceInterface: "lib/rutinas/rutinas.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

export async function registrarRealizada(userAccountId: string, r: NuevoRegistro): Promise<{ id: string }> {
  const ru = await rutina(r.routineId);
  await requireRutinaAccess(userAccountId, ru, "report_condition");
  if (ru.retiredAt) throw new RutinaError("rutina_retirada");
  // Ningún lugar del planeta ha llegado todavía a un día posterior al de la zona
  // más adelantada: eso es una fecha futura, se mire desde donde se mire.
  const hoyEnLaZonaMasAdelantada = diaDeHoy(new Date(), "Etc/GMT-14");
  if (r.performedOn.toISOString().slice(0, 10) > hoyEnLaZonaMasAdelantada) throw new RutinaError("fecha_futura");
  return prisma.$transaction(async (tx) => {
    const ev = await tx.careRoutineEvent.create({
      data: {
        routineId: r.routineId,
        performedOn: r.performedOn,
        performedByPersonId: r.performedByPersonId || null,
        note: t(r.note),
        provenanceClass: r.provenanceClass,
        sourceReference: t(r.sourceReference),
        createdBy: userAccountId,
      },
      select: { id: true },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine_event", entityId: ev.id, operation: "create", sourceInterface: "lib/rutinas/rutinas.ts", after: { routineId: r.routineId, performedOn: r.performedOn.toISOString(), performedByPersonId: r.performedByPersonId ?? null } },
      tx,
    );
    return ev;
  });
}

export async function anularRegistro(userAccountId: string, eventId: string, motivo: string): Promise<void> {
  const ev = await prisma.careRoutineEvent.findUnique({ where: { id: eventId }, include: { routine: true } });
  if (!ev) throw new RutinaError("registro_no_encontrado");
  await requireRutinaAccess(userAccountId, ev.routine, "manage");
  const razon = motivo.trim();
  if (!razon) throw new RutinaError("motivo_obligatorio");
  if (ev.voidedAt) return;
  const cuando = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.careRoutineEvent.update({ where: { id: eventId }, data: { voidedAt: cuando, voidReason: razon } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine_event", entityId: eventId, operation: "void", sourceInterface: "lib/rutinas/rutinas.ts", reason: razon, after: { voidedAt: cuando.toISOString() } },
      tx,
    );
  });
}

export type RutinaConEstado = Awaited<ReturnType<typeof rutinasDeEquipo>>[number];

export async function rutinasDeEquipo(userAccountId: string, equipmentId: string, hoy: string) {
  if (!(await puedeSobreEquipo(userAccountId, equipmentId, "view"))) throw new RutinaError("forbidden");
  const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId }, select: { acquiredAt: true } });
  const rutinas = await prisma.careRoutine.findMany({
    where: { equipmentId, retiredAt: null },
    orderBy: [{ kind: "asc" }, { kindNote: "asc" }],
    include: {
      events: {
        orderBy: { performedOn: "desc" },
        take: 20,
        include: { performedBy: { select: { displayName: true } } },
      },
    },
  });
  return rutinas.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindNote: r.kindNote,
    intervalDays: r.intervalDays,
    instructions: r.instructions,
    estado: estadoDeRutina({ intervalDays: r.intervalDays, registros: r.events, alta: equipo.acquiredAt, hoy }) as EstadoDeRutina,
    registros: r.events.map((e) => ({ id: e.id, performedOn: e.performedOn, note: e.note, voidedAt: e.voidedAt, voidReason: e.voidReason, performedBy: e.performedBy })),
  }));
}

/** Para la lista: cuántas rutinas vencidas tiene cada equipo VISIBLE. */
export async function vencidasPorEquipo(userAccountId: string, equipmentIds: readonly string[], hoy: string): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  const rutinas = await prisma.careRoutine.findMany({
    where: { equipmentId: { in: [...equipmentIds] }, retiredAt: null },
    include: { events: { select: { performedOn: true, voidedAt: true } }, equipment: { select: { acquiredAt: true } } },
  });
  for (const r of rutinas) {
    if (!r.equipmentId || !(await puedeSobreEquipo(userAccountId, r.equipmentId, "view"))) continue;
    const e = estadoDeRutina({ intervalDays: r.intervalDays, registros: r.events, alta: r.equipment?.acquiredAt ?? null, hoy });
    if (e.estado === "vencida") salida.set(r.equipmentId, (salida.get(r.equipmentId) ?? 0) + 1);
  }
  return salida;
}
```

**Por qué `alta` es `acquiredAt` y no `createdAt`:** un equipo registrado hoy que lleva tres años en el beneficio no está «al día» por haberse dado de alta hoy. Sin `acquiredAt`, la rutina queda `sin_referencia` hasta el primer registro, y eso es honesto.

- [ ] **Paso 3: pasa**, y siguen verdes `acceso-a-datos`, `vocabulario-de-audit`, `audit-atomico` y `booleanos-de-tres-estados`.

- [ ] **Paso 4: flip-test** (commit antes): en `registrarRealizada`, cambiar `"report_condition"` por `"manage"` → tiene que caer el caso del **operario que apunta**, por su nombre. Restaurar.

- [ ] **Paso 5: commit** (3 archivos). Mensaje: `catálogos T6: rutinas de equipo — definir es gestión, apuntar es faena`.

---

## Tarea 7: documentos de modelo y de equipo

**Files:**
- Create: `lib/equipos/documentos.ts`
- Create: `app/components/equipos/DocumentoUploadForm.tsx`
- Modify: `app/actions/equipos.ts` (dos acciones nuevas)
- Test: `tests/equipos/documentos.test.ts` (con base)
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produces:

```ts
export type DestinoDeDocumento = { tipo: "modelo"; modelId: string } | { tipo: "equipo"; equipmentId: string };
export async function pedirSubidaDeDocumento(userAccountId: string, destino: DestinoDeDocumento, originalFilename: string, contentType: string): Promise<{ uploadUrl: string; storageKey: string }>;
export async function confirmarSubidaDeDocumento(userAccountId: string, input: { destino: DestinoDeDocumento; storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string; provenanceClass: ProvenanceClass }): Promise<{ id: string }>;
export async function documentosDeEquipo(userAccountId: string, equipmentId: string): Promise<{ propios: DocumentoVisible[]; delModelo: DocumentoVisible[] }>;
export async function documentosDeModelo(userAccountId: string, modelId: string): Promise<DocumentoVisible[]>;
export interface DocumentoVisible { id: string; originalFilename: string | null; mimeType: string; url: string; createdAt: Date }
// app/actions/equipos.ts
export async function pedirSubidaDeDocumentoAction(destino: DestinoDeDocumento, nombre: string, tipo: string): Promise<{ uploadUrl: string; storageKey: string } | { error: string }>;
export async function confirmarSubidaDeDocumentoAction(destino: DestinoDeDocumento, storageKey: string, mimeType: string, sizeBytes: number, nombre: string): Promise<{ ok: true } | { error: string }>;
```

- [ ] **Paso 1: la prueba.** Sólo `confirmarSubidaDeDocumento` y las lecturas: `pedirSubida…` llama a `putObject`, y eso no se prueba contra la red. `tests/equipos/documentos.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Sin red: la URL firmada se sustituye por la clave. Va ANTES de importar el servicio.
vi.mock("../../lib/traceability/media", () => ({ getSignedUrlForAsset: async (k: string) => `url:${k}` }));

import { prisma } from "../../lib/db";
import { DocumentoError, confirmarSubidaDeDocumento, documentosDeEquipo } from "../../lib/equipos/documentos";
import { registrarEquipo } from "../../lib/equipos/equipos";
import { crearModelo } from "../../lib/equipos/modelos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let equipoA: string, otroEquipo: string, modeloComp: string, modeloPropio: string;

const subir = (usuario: string, destino: object, clave: string) =>
  confirmarSubidaDeDocumento(usuario, {
    destino: destino as never,
    storageKey: clave,
    mimeType: "application/pdf",
    sizeBytes: 1234,
    originalFilename: "manual.pdf",
    provenanceClass: "manufacturer_specification",
  });

beforeAll(async () => {
  f = await montarFixtures("doc");
  modeloComp = (await crearModelo(f.admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `Doc ${f.run}`, modelName: "comp", provenanceClass: "manufacturer_specification" })).id;
  modeloPropio = (await crearModelo(f.jefeA, { dueno: { tipo: "propio", locationId: f.sitioA }, kind: "instrument", manufacturer: `Doc ${f.run}`, modelName: "propio", provenanceClass: "manufacturer_specification" })).id;
  const alta = (modelId: string | null) =>
    registrarEquipo(f.jefeA, { name: `TEST eq ${f.run} ${Math.random()}`, kind: "instrument", organizationId: f.orgA, initialLocationId: f.sitioA, provenanceClass: "original_record", modelId });
  equipoA = (await alta(modeloComp)).id;
  otroEquipo = (await alta(null)).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { OR: [{ equipmentId: { in: [equipoA, otroEquipo] } }, { equipmentModelId: { in: [modeloComp, modeloPropio] } }] } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: [equipoA, otroEquipo] } } });
  await prisma.equipment.deleteMany({ where: { id: { in: [equipoA, otroEquipo] } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: [modeloComp, modeloPropio] } } });
  await f.limpiar();
});

describe("confirmarSubidaDeDocumento", () => {
  it("el jefe adjunta al equipo: Asset con su FK y su procedencia, y AuditEvent", async () => {
    const a = await subir(f.jefeA, { tipo: "equipo", equipmentId: equipoA }, `nectar-originals/equipos/${equipoA}/cert.pdf`);
    const fila = await prisma.asset.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila.equipmentId).toBe(equipoA);
    expect(fila.provenanceClass).toBe("manufacturer_specification");
    expect(await prisma.auditEvent.count({ where: { entityType: "asset", entityId: a.id } })).toBe(1);
  });
  it("una clave de otro equipo se rechaza", async () => {
    await expect(subir(f.jefeA, { tipo: "equipo", equipmentId: equipoA }, `nectar-originals/equipos/${otroEquipo}/x.pdf`)).rejects.toThrow(
      new DocumentoError("clave_invalida"),
    );
  });
  it("el operario no adjunta (gestión)", async () => {
    await expect(subir(f.operarioA, { tipo: "equipo", equipmentId: equipoA }, `nectar-originals/equipos/${equipoA}/y.pdf`)).rejects.toThrow();
  });
  it("al modelo compartido sólo con plataforma; al propio, el jefe de su organización", async () => {
    await expect(subir(f.jefeA, { tipo: "modelo", modelId: modeloComp }, `nectar-originals/equipos/modelos/${modeloComp}/m.pdf`)).rejects.toThrow();
    await subir(f.admin, { tipo: "modelo", modelId: modeloComp }, `nectar-originals/equipos/modelos/${modeloComp}/m.pdf`);
    await subir(f.jefeA, { tipo: "modelo", modelId: modeloPropio }, `nectar-originals/equipos/modelos/${modeloPropio}/p.pdf`);
  });
});

describe("documentosDeEquipo", () => {
  it("separa los del equipo de los heredados del modelo", async () => {
    const docs = await documentosDeEquipo(f.operarioA, equipoA);
    expect(docs.propios.map((d) => d.url)).toContain(`url:nectar-originals/equipos/${equipoA}/cert.pdf`);
    expect(docs.delModelo.map((d) => d.url)).toContain(`url:nectar-originals/equipos/modelos/${modeloComp}/m.pdf`);
    expect(docs.propios.some((d) => d.url.includes("/modelos/"))).toBe(false);
  });
});
```

Esperado al pasar: 5 pruebas. Los casos dependen del orden (la lectura usa lo que subieron los anteriores); vitest ejecuta en orden dentro de un archivo. No añadir `.concurrent`.

- [ ] **Paso 2: la implementación.** `lib/equipos/documentos.ts`, siguiendo `lib/traceability/media.ts` línea por línea en su forma: dos pasos, clave con prefijo por destino, `Asset` creado sólo al confirmar, auditoría en la misma transacción.

```ts
/**
 * Manuales, fichas técnicas, certificados y fotos de modelos y equipos (spec §3.5).
 * Misma forma que `lib/traceability/media.ts`: el navegador sube directo a R2 con
 * una URL firmada, y el `Asset` se crea sólo cuando la subida se confirma — una
 * subida abandonada no deja un `Asset` apuntando a nada.
 *
 * Subir es gestión: `equipment:manage` en el equipo, o el permiso de catálogo en el
 * modelo.
 */
import { randomUUID } from "node:crypto";
import type { ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { filtroVisible, organizacionesVisibles, requireEntradaDeCatalogoAccess } from "../catalogos/propiedad";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { getSignedUrlForAsset } from "../traceability/media";
import { puedeSobreEquipo } from "./equipos";

export class DocumentoError extends Error {}

export type DestinoDeDocumento = { tipo: "modelo"; modelId: string } | { tipo: "equipo"; equipmentId: string };

export interface DocumentoVisible {
  id: string;
  originalFilename: string | null;
  mimeType: string;
  url: string;
  createdAt: Date;
}

const BUCKET = "nectar-originals";
const GESTIONAR = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;

function prefijo(d: DestinoDeDocumento) {
  return d.tipo === "modelo" ? `nectar-originals/equipos/modelos/${d.modelId}/` : `nectar-originals/equipos/${d.equipmentId}/`;
}

async function requireDocumentoAccess(userAccountId: string, d: DestinoDeDocumento) {
  if (d.tipo === "equipo") {
    if (!(await puedeSobreEquipo(userAccountId, d.equipmentId, "manage"))) throw new DocumentoError("forbidden");
    return;
  }
  const m = await prisma.equipmentModel.findUnique({ where: { id: d.modelId }, select: { organizationId: true } });
  if (!m) throw new DocumentoError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
}

export async function pedirSubidaDeDocumento(userAccountId: string, destino: DestinoDeDocumento, originalFilename: string, contentType: string) {
  await requireDocumentoAccess(userAccountId, destino);
  const ext = originalFilename.includes(".") ? originalFilename.split(".").pop() : undefined;
  const storageKey = `${prefijo(destino)}${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType });
  return { uploadUrl, storageKey };
}

export async function confirmarSubidaDeDocumento(
  userAccountId: string,
  input: { destino: DestinoDeDocumento; storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string; provenanceClass: ProvenanceClass },
) {
  await requireDocumentoAccess(userAccountId, input.destino);
  if (!input.storageKey.startsWith(prefijo(input.destino))) throw new DocumentoError("clave_invalida");
  const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { id: userAccountId }, select: { personId: true } });
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: input.mimeType.startsWith("image/") ? "photo" : "document",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: cuenta.personId,
        status: "approved",
        classification: "internal",
        createdBy: userAccountId,
        provenanceClass: input.provenanceClass,
        ...(input.destino.tipo === "equipo" ? { equipmentId: input.destino.equipmentId } : { equipmentModelId: input.destino.modelId }),
      },
      select: { id: true },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "asset.create", entityType: "asset", entityId: asset.id, sourceInterface: "lib/equipos/documentos.ts", after: { destino: input.destino, storageKey: input.storageKey } },
      tx,
    );
    return asset;
  });
}

async function visibles(where: object): Promise<DocumentoVisible[]> {
  const filas = await prisma.asset.findMany({
    where: { ...where, status: "approved" },
    select: { id: true, originalFilename: true, mimeType: true, storageKey: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(filas.map(async ({ storageKey, ...f }) => ({ ...f, url: await getSignedUrlForAsset(storageKey) })));
}

export async function documentosDeEquipo(userAccountId: string, equipmentId: string) {
  if (!(await puedeSobreEquipo(userAccountId, equipmentId, "view"))) throw new DocumentoError("forbidden");
  const e = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId }, select: { modelId: true } });
  const [propios, delModelo] = await Promise.all([
    visibles({ equipmentId }),
    e.modelId ? visibles({ equipmentModelId: e.modelId }) : Promise.resolve([]),
  ]);
  return { propios, delModelo };
}

export async function documentosDeModelo(userAccountId: string, modelId: string) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const m = await prisma.equipmentModel.findFirst({ where: { id: modelId, ...filtroVisible(orgs) }, select: { id: true } });
  if (!m) throw new DocumentoError("modelo_no_encontrado");
  return visibles({ equipmentModelId: modelId });
}
```

`app/components/equipos/DocumentoUploadForm.tsx`: copia de la forma de `app/components/traceability/PhotoUploadForm.tsx`. Recibe `destino: DestinoDeDocumento`, usa las dos acciones nuevas, acepta `accept=".pdf,image/*"` y un selector de procedencia (`manufacturer_specification` / `original_record`), y hace `router.refresh()` al terminar. Textos: `Equipos.documentoSubir`, `Equipos.documentoSubiendo`, `Equipos.documentoError`.

Acciones en `app/actions/equipos.ts`, con la forma exacta de `requestLotAssetUploadAction`: `getCurrentUser`, `redirect("/login")` sin sesión, `try/catch` que convierte `DocumentoError` y `CatalogoError` en `{ error: t("documentoError", { detalle: error.message }) }`. **Sólo exportan funciones `async`** (`"use server"`, trampa escrita en CLAUDE.md).

- [ ] **Paso 3: pasa**, y siguen verdes `acceso-a-datos` y `use-server-solo-async`.

- [ ] **Paso 4: flip-test** (commit antes): quitar el `if (!input.storageKey.startsWith(...))` → cae **el caso de la clave de otro equipo**. Restaurar.

- [ ] **Paso 5: commit** (5 archivos más los textos, si ya se añadieron). Mensaje: `catálogos T7: manuales y documentos de modelos y equipos`.

---

## Tarea 8: pantallas del catálogo de modelos

**Files:**
- Create: `app/equipos/modelos/page.tsx`, `app/equipos/modelos/nuevo/page.tsx`, `app/equipos/modelos/[id]/page.tsx`
- Create: `app/components/equipos/FilasDeEspecificacion.tsx` (cliente: «añadir otra fila»)
- Create: `app/actions/modelos.ts`
- Modify: `messages/es.json`, `messages/en.json` (espacio `Equipos`)
- Modify: `scripts/rutas-declaradas.mjs` (3 rutas), `tests/inventario-de-rutas.test.ts` (`86 entradas` → el número nuevo)
- Modify: `app/equipos/page.tsx` (enlace «Catálogo de modelos»)

**Interfaces:**
- Consumes: todo `lib/equipos/modelos.ts` (Tarea 4), `DocumentoUploadForm` y `documentosDeModelo` (Tarea 7), `sitiosParaRegistrar` (existente).
- Produces: `crearModeloFormAction`, `editarModeloFormAction`, `retirarModeloFormAction`, `declararEspecificacionFormAction`, `retirarEspecificacionFormAction`, todas `(formData: FormData) => Promise<void>`.

- [ ] **Paso 1: declarar las rutas primero** y ver caer el inventario de rutas **por la ruta, no por el número**: añadir las tres páginas vacías (`export default function P() { return null; }`) y correr `npx vitest run tests/inventario-de-rutas.test.ts`. Esperado: falla nombrando `/equipos/modelos`. Añadir a `scripts/rutas-declaradas.mjs`, junto a `/equipos/[id]`:

```js
  "/equipos/modelos": { clase: "requiere-sesion", razon: "Catálogo de modelos de equipo: compartidos y los de las organizaciones cuyos sitios quien mira puede ver (lib/catalogos/propiedad.ts)." },
  "/equipos/modelos/nuevo": { clase: "requiere-sesion", razon: "Dar de alta un modelo. Compartido sólo con equipment:manage en plataforma; propio, en un sitio de esa organización, que el servidor vuelve a resolver." },
  "/equipos/modelos/[id]": { clase: "requiere-sesion", razon: "Un modelo, sus especificaciones y documentos. Fuera de lo visible da 404; editar y retirar exigen el permiso de catálogo." },
```

y actualizar el recuento esperado en `tests/inventario-de-rutas.test.ts` al número que imprima el script (`node scripts/inventario-de-rutas.mjs | tail -3`). **Contarlo**: tiene que ser el anterior + 3.

- [ ] **Paso 2: acciones** en `app/actions/modelos.ts` (`"use server"`, sólo funciones `async`). `crearModeloFormAction`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import {
  crearModelo,
  declararEspecificacion,
  editarModelo,
  retirarEspecificacion,
  retirarModelo,
  type DatosDeModelo,
} from "../../lib/equipos/modelos";
import type { EquipmentContactMaterial, EquipmentKind, ProvenanceClass } from "../../generated/prisma/client";

function datosDelFormulario(f: FormData): DatosDeModelo {
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const dias = s("recommendedMaintenanceDays");
  const material = s("contactMaterial");
  return {
    manufacturer: s("manufacturer"),
    modelName: s("modelName"),
    // Vacío es «el fabricante no lo dice», nunca 0 (ADR-080).
    recommendedMaintenanceDays: dias === "" ? null : Number(dias),
    capacityValue: s("capacityValue") || null,
    capacityUnit: s("capacityUnit") || null,
    contactMaterial: (material || null) as EquipmentContactMaterial | null,
    contactMaterialNote: s("contactMaterialNote") || null,
    provenanceClass: (s("provenanceClass") || "manufacturer_specification") as ProvenanceClass,
    sourceReference: s("sourceReference") || null,
    notes: s("notes") || null,
  };
}

/**
 * Alta de un modelo. El dueño llega como `compartido` o como el id de un SITIO; la
 * organización la deriva el servicio del sitio (spec §2.5), no el formulario.
 */
export async function crearModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dueno = String(formData.get("dueno") ?? "");
  const kind = String(formData.get("kind") ?? "instrument") as EquipmentKind;
  const modelo = await crearModelo(user.userAccountId, {
    ...datosDelFormulario(formData),
    kind,
    dueno: dueno === "compartido" ? { tipo: "compartido" } : { tipo: "propio", locationId: dueno },
  });
  // Filas de especificación del mismo formulario: `spec_quantity_0`, `spec_unit_0`…
  if (kind === "instrument") {
    for (let i = 0; formData.has(`spec_quantity_${i}`); i++) {
      const q = String(formData.get(`spec_quantity_${i}`) ?? "").trim();
      const u = String(formData.get(`spec_unit_${i}`) ?? "").trim();
      if (!q && !u) continue;
      await declararEspecificacion(user.userAccountId, modelo.id, {
        quantity: q,
        unit: u,
        rangeMin: String(formData.get(`spec_rangeMin_${i}`) ?? "") || null,
        rangeMax: String(formData.get(`spec_rangeMax_${i}`) ?? "") || null,
        resolution: String(formData.get(`spec_resolution_${i}`) ?? "") || null,
        accuracyAbs: String(formData.get(`spec_accuracyAbs_${i}`) ?? "") || null,
      });
    }
  }
  revalidatePath("/equipos/modelos");
  const volverA = String(formData.get("volverA") ?? "");
  redirect(volverA.startsWith("/equipos/nuevo") ? `${volverA}${volverA.includes("?") ? "&" : "?"}modelo=${modelo.id}` : `/equipos/modelos/${modelo.id}?ok=creado`);
}
```

`editarModeloFormAction` (lee `modelId`, llama `editarModelo(user, modelId, datosDelFormulario(f))` y redirige a `?ok=editado`), `retirarModeloFormAction` (`retirarModelo(user, modelId, new Date())`, `?ok=retirado`), `declararEspecificacionFormAction` y `retirarEspecificacionFormAction`, con la misma forma. `volverA` sólo se acepta si empieza por `/equipos/nuevo`: **nada de redirecciones abiertas**.

- [ ] **Paso 3: `app/equipos/modelos/page.tsx`**: servidor, `force-dynamic`. `listarModelos(user, { kind, incluirRetirados })` con `kind` y `retirados=1` de `searchParams`. Dos secciones, **Compartidos** y **De tu organización**, cada una con una tabla: fabricante y modelo (enlace a la ficha), tipo (`t(\`tipo_${kind}\`)`), equipos que lo usan, y «retirado» si lo está. El filtro por tipo son enlaces `?kind=…`. El interruptor de retirados, un enlace `?retirados=1`. «Nuevo modelo» enlaza a `/equipos/modelos/nuevo`. Si la lista está vacía, `t("modelosVacio")`.

- [ ] **Paso 4: `app/equipos/modelos/nuevo/page.tsx`**: servidor. Ofrece como dueño:
  - `compartido`, **sólo si** `await puedeCrearCompartido(user)` (Tarea 4);
  - cada sitio de `sitiosParaRegistrar(user)`, etiquetado «De {organización} — {sitio}». Si hacen falta los nombres de organización, ampliar `sitiosParaRegistrar` con `organization: { select: { name: true } }`.

  Si no hay ninguna opción, `t("modeloNuevoSinPermiso")` y volver.

  Campos: tipo (`select` con los cuatro), fabricante, modelo, mantenimiento recomendado (`<CampoNumerico name="recommendedMaintenanceDays" min={1} step={1} />`), procedencia, referencia, notas.

  Luego un `<details>` «Capacidad y material (vasos y máquinas)»: capacidad `<CampoNumerico name="capacityValue" min={0} step="any" />`, unidad (texto), material (`select` con los cinco valores de D4, más uno vacío) y la nota del material.

  Luego un `<details>` «Especificaciones (instrumentos)» con `<FilasDeEspecificacion />`. Es un componente de cliente que pinta N filas con `spec_quantity_i`, `spec_unit_i` y cuatro `CampoNumerico`, con un botón «añadir otra» que suma una fila. Estado local sólo del número de filas.

  Si llega `?volverA=/equipos/nuevo…`, un `<input type="hidden" name="volverA">`.

  El servicio rechaza igual la capacidad en un instrumento. Los `<details>` sólo ordenan la pantalla, no sustituyen esa regla.

- [ ] **Paso 5: `app/equipos/modelos/[id]/page.tsx`**: `modeloParaFicha` dentro de `try/catch`, y `notFound()` ante `ModeloError`. Muestra:
  - la cabecera: fabricante y modelo, tipo, «Compartido» o el nombre de la organización, y el mantenimiento recomendado («cada N días» o «el fabricante no lo indica»);
  - capacidad y material, si hay;
  - una tabla de especificaciones vigentes, con «retirar» por fila si `puedeEditarModelo`;
  - la sección **Documentos**: `documentosDeModelo` como lista de enlaces, y `DocumentoUploadForm` con `destino={{ tipo: "modelo", modelId }}` si puede editar;
  - **Equipos que usan este modelo**, con enlaces;
  - si puede editar, un `<details>` «Editar» con el mismo formulario que el alta, precargado, sin tipo ni dueño (no se cambian), y un formulario «Retirar» con confirmación en el texto del botón.
  Los mensajes `?ok=` van con el mismo patrón `nn-ok` que la ficha de equipo.

- [ ] **Paso 6: textos.** Añadir a `messages/es.json` y `messages/en.json`, dentro de `Equipos`, **las mismas claves en los dos**: `modelosTitulo`, `modelosIntro`, `modelosCompartidos`, `modelosPropios`, `modelosVacio`, `modeloNuevo`, `modeloNuevoSinPermiso`, `campoFabricante`, `campoModelo`, `campoDueno`, `duenoCompartido`, `duenoDe`, `campoMantenimientoRecomendado`, `campoMantenimientoAyuda`, `capacidadYMaterial`, `campoCapacidad`, `campoUnidadCapacidad`, `campoMaterial`, `material_acero_inoxidable`, `material_plastico_alimentario`, `material_madera`, `material_vidrio_o_ceramica`, `material_otro`, `campoMaterialNota`, `especificaciones`, `specMagnitud`, `specUnidad`, `specMin`, `specMax`, `specResolucion`, `specPrecision`, `specAnadir`, `specRetirar`, `modeloEquipos`, `modeloRetirado`, `botonCrearModelo`, `botonEditarModelo`, `botonRetirarModelo`, `okCreado`, `okEditado`, `okRetirado`, `mantenimientoCada`, `mantenimientoSinDato`, `documentos`, `documentoSubir`, `documentoSubiendo`, `documentoError`, `documentosDelModelo`, `verCatalogo`, `referencia`, `notas`, `mostrarRetirados`, `ocultarRetirados`, `filtroTodos`. Español: el texto de la pantalla. Inglés: su traducción. Nada de copiar el español en `en.json`.

- [ ] **Paso 7: enlace** en `app/equipos/page.tsx`, junto a «Nuevo equipo»: `<Link href="/equipos/modelos">{t("verCatalogo")}</Link>`.

- [ ] **Paso 8: compuertas de la tarea.**

```bash
npm run typecheck > /tmp/tc.txt 2>&1; echo "typecheck=$?"; grep -c 'error TS' /tmp/tc.txt
npx vitest run tests/inventario-de-rutas.test.ts tests/arquitectura/numeros-sin-rueda.test.ts tests/arquitectura/use-server-solo-async.test.ts tests/arquitectura/envio-sin-doble-toque.test.ts tests/ui/valoresEnumerados.test.ts; echo "salida=$?"
```

Si `valoresEnumerados` pide etiquetas para `EquipmentContactMaterial`, añadir el enum a esa prueba igual que los demás: la pantalla lo muestra.

- [ ] **Paso 9: commit.** Contar el stat: 3 páginas, 1 componente, 1 acción, 2 textos, 2 de rutas y la lista. Mensaje: `catálogos T8: pantallas del catálogo de modelos`.

---

## Tarea 9: alta, ficha y lista de equipos

**Files:**
- Modify: `app/equipos/nuevo/page.tsx`, `app/equipos/[id]/page.tsx`, `app/equipos/page.tsx`
- Modify: `app/actions/equipos.ts` (`registrarEquipoFormAction` + acciones nuevas)
- Create: `app/actions/rutinas.ts`
- Create: `app/components/rutinas/TarjetaDeRutina.tsx` (servidor; no sabe de equipos)
- Create: `app/components/equipos/SelectorDeModelo.tsx` (cliente: filtra por el tipo elegido)
- Modify: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consumes: Tareas 4-7.
- Produces:
  - `editarDatosDeEquipoFormAction(formData)`;
  - `crearRutinaFormAction(formData)`, `registrarRealizadaFormAction(formData)`, `anularRegistroFormAction(formData)`, `cambiarIntervaloFormAction(formData)`, `retirarRutinaFormAction(formData)`. Todas leen `equipmentId` para revalidar y redirigir a `/equipos/<id>?ok=…`.

- [ ] **Paso 1: el alta.** En `app/equipos/nuevo/page.tsx`, debajo de los campos de hoy, que no cambian:

```tsx
<details>
  <summary>{t("masDatos")}</summary>
  <SelectorDeModelo
    modelos={modelosPorOrganizacionYTipo}
    etiquetas={{ campo: t("campoModeloDeEquipo"), ninguno: t("modeloNinguno"), compartidos: t("modelosCompartidos"), propios: t("modelosPropios"), crear: t("modeloCrear") }}
  />
  <label>{t("campoSerie")}<input type="text" name="serialNumber" maxLength={120} /></label>
  <label>{t("campoCodigoInterno")}<input type="text" name="internalCode" maxLength={60} /></label>
  <label>
    {t("campoProveedor")}
    <select name="supplierOrganizationId" defaultValue="">
      <option value="">{t("sinProveedor")}</option>
      {proveedores.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
    </select>
  </label>
  <label>{t("campoGarantia")}<input type="date" name="warrantyUntil" /></label>
</details>
```

`modelosPorOrganizacionYTipo` se calcula en el servidor para cada organización de `sitiosParaRegistrar` y cada tipo, con `modelosParaElegir(user, org, kind)`. Para evitar N×4 consultas, **una** llamada a `listarModelos(user)` y un filtro en memoria por `organizationId` (null o la del sitio) y `kind`.

`SelectorDeModelo` es de cliente:
- lee el `kind` y el `locationId` elegidos, escuchando `change` del formulario con un `ref` al `form` padre, y enseña sólo los modelos que encajan;
- si el modelo elegido trae `recommendedMaintenanceDays`, pinta una casilla **marcada** `crearRutinaMantenimiento` y un `<CampoNumerico name="rutinaMantenimientoDias">` con esos días. Se puede desmarcar o cambiar;
- el enlace «¿No está? Crea el modelo» va a `/equipos/modelos/nuevo?volverA=/equipos/nuevo`.

Si llega `?modelo=<id>` (vuelta desde el alta del modelo), queda preseleccionado.

- [ ] **Paso 2: la acción del alta.** En `registrarEquipoFormAction`, añadir a la llamada:

```ts
    modelId: String(formData.get("modelId") ?? "") || null,
    serialNumber: String(formData.get("serialNumber") ?? "") || null,
    internalCode: String(formData.get("internalCode") ?? "") || null,
    supplierOrganizationId: String(formData.get("supplierOrganizationId") ?? "") || null,
    warrantyUntil: fechaDeDia(formData.get("warrantyUntil") as string | null, "warrantyUntil"),
```

y, tras crear el equipo:

```ts
  // La recomendación del modelo se convierte en rutina SÓLO si quien da de alta lo
  // deja marcado (spec §3.3): es el ajuste local, no el modelo, el que manda.
  const dias = String(formData.get("rutinaMantenimientoDias") ?? "").trim();
  if (formData.get("crearRutinaMantenimiento") === "on" && dias !== "") {
    await crearRutina(user.userAccountId, { equipmentId: equipo.id, kind: "mantenimiento", intervalDays: Number(dias) });
  }
```

Importar `fechaDeDia` de `../../lib/time/localDateTime` y `crearRutina` de `../../lib/rutinas/rutinas`.

- [ ] **Paso 3: la ficha.** En `app/equipos/[id]/page.tsx`, después de la cabecera y antes de la verificación, tres secciones:

1. **Identificación.** Modelo (enlace a `/equipos/modelos/<id>`, o `t("sinModelo")`), serie, código, proveedor y garantía (`mostrarFecha` del día; «vencida» si `warrantyUntil < hoy`). Si `puedeGestionar`, un `<details>` «Editar datos» con los mismos campos que el alta, precargados. La garantía, con `defaultValue={warrantyUntil?.toISOString().slice(0, 10)}`: es un **campo de día** y su ida y vuelta ya cierra así (CLAUDE.md). Va a `editarDatosDeEquipoFormAction`.

2. **Rutinas.** `rutinasDeEquipo(user, id, hoy)`, con `hoy = diaDeHoy(new Date(), ubicacion?.timezone ?? null)`; la ubicación sale del último traslado, incluyendo `toLocation.timezone`. Una `TarjetaDeRutina` por rutina, más un formulario «Añadir rutina» si `puedeGestionar`: tipo, nota si es `otra`, días con `CampoNumerico` e instrucciones.

`app/components/rutinas/TarjetaDeRutina.tsx` (servidor) recibe `rutina: RutinaConEstado`, `puedeGestionar`, `puedeApuntar`, `camposOcultos: Record<string, string>` (aquí `{ equipmentId }`) y `t`. Pinta:
- el título, `t(\`rutina_${kind}\`)` o la nota;
- `cada N días`;
- el estado **con palabras**: `al_dia` → «al día, próxima el {proximo}»; `vencida` → «**vencida hace {pasaron} días**» (`<strong>`); `sin_referencia` → «sin registros todavía»;
- el formulario «Registrar que se hizo» si `puedeApuntar`: fecha `type="date"` obligatoria, quién (personas del sitio, con la misma fuente que ya usa la ficha para condición, o vacío), nota y procedencia;
- el historial (últimos 20), con los anulados tachados (`<s>`) y su motivo;
- «anular» por fila con un campo de motivo obligatorio, si `puedeGestionar`;
- «cambiar intervalo» y «retirar rutina», si `puedeGestionar`.

`puedeApuntar` = `puedeSobreEquipo(user, id, "report_condition")`.

3. **Documentos.** `documentosDeEquipo(user, id)`: dos listas, «De este equipo» y «Del modelo (heredados)». El `DocumentoUploadForm` del equipo va sólo si `puedeGestionar`.

- [ ] **Paso 4: acciones de rutinas** en `app/actions/rutinas.ts` (`"use server"`, sólo `async`). `registrarRealizadaFormAction`:

```ts
export async function registrarRealizadaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const performedOn = fechaDeDia(formData.get("performedOn") as string | null, "performedOn");
  if (!performedOn) throw new RutinaError("fecha_obligatoria");
  await registrarRealizada(user.userAccountId, {
    routineId: String(formData.get("routineId") ?? ""),
    performedOn,
    performedByPersonId: String(formData.get("performedByPersonId") ?? "") || null,
    note: String(formData.get("note") ?? "") || null,
    provenanceClass: (String(formData.get("provenanceClass") ?? "") || "original_record") as ProvenanceClass,
  });
  revalidatePath(`/equipos/${equipmentId}`);
  revalidatePath("/equipos");
  redirect(`/equipos/${equipmentId}?ok=rutina_registrada`);
}
```

El resto sigue la misma forma. `crearRutinaFormAction` lee `intervalDays` con `Number(...)` sólo si no está vacío; si está vacío, lanza `RutinaError("intervalo_positivo")`. Un vacío nunca es 0.

- [ ] **Paso 5: la lista.** En `app/equipos/page.tsx`:
- `listarEquipos` gana `model: { manufacturer, modelName } | null`: añadirlo al `include` y al `EquipoEnLista`;
- la página llama a `vencidasPorEquipo(user, equipos.map((e) => e.id), diaDeHoy(new Date(), null))`;
- cada fila enseña «Fabricante Modelo» bajo el nombre, en `nn-muted`, y la etiqueta «{n} rutina(s) vencida(s)» si n > 0;
- un enlace de filtro `?vencidas=1` deja sólo los que tienen alguna;
- «Atención» incluye también los equipos con rutinas vencidas.

`diaDeHoy(…, null)` usa la zona más atrasada: un aviso llega como mucho un día tarde, nunca antes de tiempo. Dejarlo dicho en un comentario.

- [ ] **Paso 6: textos** en los dos idiomas: `masDatos`, `campoModeloDeEquipo`, `modeloNinguno`, `modeloCrear`, `campoSerie`, `campoCodigoInterno`, `campoProveedor`, `sinProveedor`, `campoGarantia`, `garantiaVencida`, `identificacion`, `editarDatos`, `sinModelo`, `rutinas`, `rutinasIntro`, `rutina_mantenimiento`, `rutina_limpieza`, `rutina_fumigacion`, `rutina_otra`, `rutinaCada`, `rutinaAlDia`, `rutinaVencida`, `rutinaSinReferencia`, `rutinaRegistrar`, `rutinaFecha`, `rutinaQuien`, `rutinaNota`, `rutinaHistorial`, `rutinaAnular`, `rutinaMotivo`, `rutinaAnulada`, `rutinaCambiarIntervalo`, `rutinaRetirar`, `rutinaAnadir`, `rutinaTipo`, `rutinaDias`, `rutinaInstrucciones`, `crearRutinaMantenimiento`, `rutinasVencidas`, `soloVencidas`, `documentosDelEquipo`, `documentosHeredados`, `okRutinaRegistrada`, `okRutinaCreada`, `okRutinaAnulada`, `okDatos`.

- [ ] **Paso 7: compuertas de la tarea** (las del Paso 8 de la Tarea 8, más `tests/equipos`, `tests/rutinas` y `tests/arquitectura/booleanos-de-tres-estados.test.ts`).

- [ ] **Paso 8: commit.** Contar el stat antes. Mensaje: `catálogos T9: alta con modelo, ficha con identificación, rutinas y documentos, y avisos en la lista`.

---

## Tarea 10: decisión escrita, verificación y PR

**Files:**
- Modify: `docs/architecture/DECISIONS.md` (ADR nuevo)
- Modify: `docs/architecture/EQUIPMENT_AND_READINESS.md` (§10, una nota)
- Modify: `docs/superpowers/specs/2026-09-18-catalogos-y-modelos-de-equipo-design.md` (§7, la desviación)
- Modify: `SESSION_STATE.md`, si su §5 lo pide al cerrar

- [ ] **Paso 1: el ADR.** Número: el siguiente libre **en `origin/main` en ese momento** (`git fetch && git show origin/main:docs/architecture/DECISIONS.md | grep -o '^## ADR-[0-9]*' | tail -1`). Lo vigila `tests/arquitectura/numeros-de-adr-unicos.test.ts`.

```markdown
## ADR-NNN — Catálogos de referencia con atributos: compartidos y propios, un contrato común

**Fecha:** 2026-09-19 · **Estado:** aceptado · **Spec:** `docs/superpowers/specs/2026-09-18-catalogos-y-modelos-de-equipo-design.md`

**Contexto.** ADR-095 §1 declinó por tercera vez tablas de especies y cultivares: bastaban
valores controlados con alias y definiciones (`VariableCatalog`). Daniel pidió el
2026-09-18 otra cosa: **atributos con tipo por clase** —mantenimiento y rango de medida
de un equipo; tasa de inoculación, atenuación y tolerancia al alcohol de una levadura—,
que `VariableCatalog` sólo podría llevar como JSON libre (CLAUDE.md §49).

**Decisión.** Cada clase de catálogo es su propia tabla con sus columnas, y todas cumplen
un contrato: dueño anulable (nulo = compartido, lo edita la autoridad de plataforma;
con valor = propio de esa organización), procedencia (ADR-038), retiro en vez de
borrado, unicidad sin mayúsculas en la base, auditoría en la misma transacción. Lo
vigila `tests/arquitectura/catalogos-con-contrato.test.ts` sobre el registro
`lib/catalogos/registro.ts`. Reemplaza ADR-095 §1 **como regla general**; los
cultivares y levaduras que hoy viven en `VariableCatalog` se mueven, cada uno en su
spec, con su migración de datos.

**Y las rutinas.** Amplía `EQUIPMENT_AND_READINESS.md` §10: una rutina por calendario
(mantenimiento, limpieza, fumigación) **avisa y no bloquea** (D1), sobre un equipo o
una instalación. Siguen fuera órdenes de trabajo, técnicos, piezas y contadores de uso.

**Consecuencias.** Cada clase nueva cuesta una tabla y un spec, no un campo en una
tabla genérica. Las rutinas de instalación existen en la base y esperan su spec para
tener pantalla y permisos.
```

- [ ] **Paso 2: notas cortas.** En `EQUIPMENT_AND_READINESS.md` §10, después de la lista de lo que no se construye: «**Ampliado el 2026-09-19 (ADR-NNN):** rutinas por calendario que avisan, sobre equipos e instalaciones; lo demás de esta lista sigue fuera.» En el spec §7, cambiar la línea de «una rutina de sitio se crea y se registra por el servicio» por lo que se hizo: la base la admite y lo prueban las pruebas de esquema; el servicio la rechaza con `instalaciones_pendiente` hasta el spec de instalaciones.

- [ ] **Paso 3: compuertas completas**, cada una leyendo su código de salida y sin canalizar:

```bash
npm run typecheck > /tmp/tc.txt 2>&1; echo "typecheck=$?"
env -u VERCEL_ENV npm run build > /tmp/build.txt 2>&1; echo "build=$?"; grep -c '^[├└┌]' /tmp/build.txt
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci=$?"; grep -E 'Test Files|Tests  ' /tmp/ci.txt
npx vitest run $(grep -A200 '@grupo: base-sembrada' scripts/pruebas-por-compuerta.txt | grep '^tests/' | grep -E 'equipos|rutinas|catalogos') > /tmp/base.txt 2>&1; echo "con base=$?"; grep -E 'Test Files|Tests  ' /tmp/base.txt
```

`build` tiene que listar las tres rutas nuevas de `/equipos/modelos`. Las pruebas con base: **contar** los archivos, que son 6 (`esquemaDeCatalogo`, `propiedad`, `modelos`, `datosDeEquipo`, `rutinas`, `documentos`), y que ninguno diga «no tests».

- [ ] **Paso 4: navegador**, con la app local contra la base local. Hace falta una entrada en `~/.claude/launch.json` que apunte al worktree, como `nectar-rueda`, y **pedir permiso** para añadirla. Daniel inicia sesión. Recorrido, con captura de cada paso:
  1. `/equipos/modelos/nuevo` → crear un modelo propio de instrumento con dos especificaciones y mantenimiento de 180 días;
  2. `/equipos/nuevo` → «Más datos» → el selector enseña ese modelo **sólo** con tipo instrumento; la casilla de rutina aparece marcada con 180; guardar;
  3. la ficha enseña identificación, la rutina «al día» (o «sin registros» si no hay fecha de adquisición) y los documentos vacíos;
  4. registrar un mantenimiento con fecha de hace 200 días → la rutina pasa a **«vencida hace 20 días»**;
  5. anular ese registro con motivo → aparece tachado y el aviso vuelve al estado anterior;
  6. `/equipos` enseña «1 rutina vencida» en la fila (antes de anular) y el filtro funciona.

  Leer `viewport` en la misma llamada que cualquier medición: un panel oculto da `0x0` (CLAUDE.md).

- [ ] **Paso 5: commit de documentación**, push, y comprobar que llegó:

```bash
git push -u origin catalogos-equipos
git rev-parse --short HEAD; git rev-parse --short @{u}      # iguales
git diff --name-only origin/main...HEAD | wc -l            # contar; comparar con los stats de cada tarea
```

- [ ] **Paso 6: el PR**, con `gh pr create -R danieljosegiraldez-png/nectar-nomada --body-file …`. Lleva:
  - qué construye;
  - las decisiones D1-D8;
  - la desviación de la cabecera;
  - la tabla de flip-tests con el test que cayó en cada uno;
  - las compuertas con sus números;
  - el recorrido del navegador;
  - lo que queda fuera: §8 del spec, las otras clases y las instalaciones;
  - la limitación de proveedores: un proveedor que no exista se da de alta por la vía de organizaciones;
  - y la relación con #417 (qué rama se tomó en la Tarea 0).

  Termina con `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Después, `gh pr view <n> --json files --jq '.files | length'` tiene que coincidir con la cuenta del Paso 5.

- [ ] **Paso 7: no fusionar.** Fusionar lo decide Daniel.
