# Alzas con marca — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un alza con marca («A-07») se registre, se ponga y se quite de colmenas conservando su historia, que la cosecha diga qué alzas marcadas se extrajeron, y que la ficha del apiario enseñe dónde está cada una.

**Architecture:** Una tabla nueva `apiary.hive_super` (la identidad). Ponerla en una colmena es una fila de `hive_fitting` de tipo `alza`, cuenta 1, que apunta a ella — el mismo patrón que el nodo de sensores (`lib/apiary/nodos.ts`). Las alzas sin marca siguen siendo filas `alza` con su cuenta. La cosecha gana una tabla de unión `apiary.apiary_harvest_super`.

**Tech Stack:** Next.js App Router (server actions), Prisma 7 + PostgreSQL, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md` §4. Sólo la rebanada 1: la cera (§5) y las reinas (§5.4) tienen su plan aparte.

## Global Constraints

- Node fuera del PATH: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npx`/`npm`.
- Base de pruebas local y compartida: `export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"; export SHADOW_DATABASE_URL="${DATABASE_URL%%\?*}_shadow"` en **cada** orden que la toque. Sin eso la suite se niega (apunta a producción por `.env`).
- Si las pruebas de permisos fallan todas a la vez con `sin_permiso…`/`no_apiary_access`: la base no está sembrada. `npm run db:seed` (idempotente) antes de sospechar del código.
- Toda escritura lleva su `AuditEvent` **en la misma transacción** (`recordAuditEvent(…, tx)`); lo vigila `tests/arquitectura/audit-atomico.test.ts`.
- Toda FK hacia personas o hacia evidencia: `onDelete: Restrict`.
- Una regla que importa vive **también en la base** (CHECK o índice), no sólo en el servicio; y cada CHECK lleva su sonda con control positivo («lo válido entra»).
- `git add` archivo por archivo, nunca `-A`; `git commit -F <archivo>`; compuerta encadenada con `&&`, nunca canalizada.
- **Commitear antes de cada flip-test**: el arnés restaura con `git checkout --`, que vuelve a HEAD.
- Nombres de UI en español en `messages/es.json` y en inglés en `messages/en.json`, espacio `Apiary`.
- Un archivo `"use server"` sólo exporta funciones `async`.
- Un campo numérico del formulario usa `CampoNumerico` (guardia `numeros-sin-rueda`).

## Decisiones tomadas al planear, y por qué

1. **La marca se normaliza**: `trim()` y mayúsculas. «a-07» y «A-07 » son la misma alza. La base lo sostiene con un CHECK (`code = upper(btrim(code))`) más el `@@unique([organizationId, code])`; un índice funcional no se usa porque Prisma no lo declara en el esquema y la comprobación de deriva lo vería.
2. **La «ficha del alza» del spec §4.4 no es una ruta nueva**: es un desplegable por alza en la ficha del apiario, con su historia y sus cosechas. Evita una ruta y su declaración, y enseña lo mismo. Se anota en el ADR como desviación menor del spec.
3. **La inspección no cierra alzas marcadas.** Hoy «quité el alza» en la inspección llama a `cerrarAbiertosEn(…, "alza", …)`, que cierra TODAS las filas `alza` abiertas. Con alzas marcadas eso cerraría A-07 sin que nadie lo haya dicho. Desde esta rebanada, ese cierre en bloque sólo toca las **sin marca**; una marcada se quita con su propio botón.
4. **Quien ve el apiario ve las alzas de su organización**, pero el enlace a la colmena donde está puesta sólo aparece si esa colmena es de este apiario; si no, dice «en otro apiario». No enseña identificadores de cajas de un sitio que quizá no puede ver.
5. **La cosecha sólo ofrece las alzas marcadas que la colmena lleva puestas AHORA**: el formulario guarda la cosecha con `new Date()`, así que el servicio exige que el alza esté puesta en esa colmena en `occurredAt`, y no hay otra fecha que ofrecer.

---

### Task 1: Esquema, migración y las reglas en la base

**Files:**
- Modify: `prisma/schema.prisma` (junto a `model HiveNode`, y las relaciones inversas en `Organization`, `UserAccount`, `HiveFitting`, `ApiaryHarvestEvent`)
- Create: `prisma/migrations/<AAAAMMDDHHMMSS>_alzas_con_marca/migration.sql` — la marca de tiempo, **posterior a la última de `origin/main`** (medirla: `ls prisma/migrations | tail -2`).
- Create: `tests/apiary/alzas.test.ts`
- Modify: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`)

**Interfaces:**
- Produces: modelo `HiveSuper` (`prisma.hiveSuper`), campo `HiveFitting.hiveSuperId`, modelo `ApiaryHarvestSuper` (`prisma.apiaryHarvestSuper`). Nombres de restricción: `hive_super_marca_normalizada`, `hive_super_baja_completa`, `hive_fitting_alza_marcada_es_una`, índice `hive_fitting_alza_abierta_en_una_colmena`.

- [ ] **Step 1: Añadir los modelos al esquema**

Debajo de `model HiveNode { … }`:

```prisma
/// Un alza con marca propia — spec 2026-09-18 «alzas y cera» §4.1. Daniel: «todavía no [llevan
/// marca], pero se marcarán». La que no tiene marca sigue siendo una CUENTA en `HiveFitting`.
/// Dónde estuvo lo dicen sus `HiveFitting` (kind `alza`, cuenta 1): el mismo intervalo que el
/// nodo de sensores, sin una segunda tabla de colocaciones.
model HiveSuper {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  /// De quién es. Sale del sitio donde se registra; un alza no se pone en otra finca.
  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])

  /// La marca, normalizada (sin espacios a los lados, en mayúsculas): «A-07». Única por
  /// organización. Nadie impone formato. CHECK `hive_super_marca_normalizada`.
  code String

  /// Desde cuándo se usa, si se sabe. Nulo = no se sabe, no «hoy».
  inServiceAt DateTime? @map("in_service_at")

  lifecycleStatus EquipmentLifecycle @default(active) @map("lifecycle_status")
  /// La baja: las dos juntas y sólo fuera de servicio (CHECK `hive_super_baja_completa`).
  retiredAt     DateTime? @map("retired_at")
  retiredReason String?   @map("retired_reason")

  notes String?

  fittings  HiveFitting[]
  harvests  ApiaryHarvestSuper[]

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("HiveSuperCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)

  @@unique([organizationId, code])
  @@index([organizationId])
  @@map("hive_super")
  @@schema("apiary")
}

/// Qué alzas marcadas se extrajeron en una cosecha — spec §4.3. Opcional: una cosecha sin alzas
/// marcadas sigue valiendo. RESTRICT a los dos lados: es evidencia de origen de la miel.
model ApiaryHarvestSuper {
  apiaryHarvestEventId String             @map("apiary_harvest_event_id") @db.Uuid
  apiaryHarvestEvent   ApiaryHarvestEvent @relation(fields: [apiaryHarvestEventId], references: [id], onDelete: Restrict)
  hiveSuperId          String             @map("hive_super_id") @db.Uuid
  hiveSuper            HiveSuper          @relation(fields: [hiveSuperId], references: [id], onDelete: Restrict)

  @@id([apiaryHarvestEventId, hiveSuperId])
  @@index([hiveSuperId])
  @@map("apiary_harvest_super")
  @@schema("apiary")
}
```

En `model HiveFitting`, debajo de `hiveNode`:

```prisma
  /// El alza, cuando `kind` es `alza` y lleva marca — spec 2026-09-18 §4.2. Con ella la cuenta es
  /// 1 (CHECK `hive_fitting_alza_marcada_es_una`). RESTRICT: un alza con historia no se borra.
  hiveSuperId String?    @map("hive_super_id") @db.Uuid
  hiveSuper   HiveSuper? @relation(fields: [hiveSuperId], references: [id], onDelete: Restrict)
```

y en su bloque de índices: `@@index([hiveSuperId])`.

Relaciones inversas: en `model Organization` → `hiveSupers HiveSuper[]`; en `model UserAccount` → `hiveSupersCreated HiveSuper[] @relation("HiveSuperCreatedBy")`; en `model ApiaryHarvestEvent` → `supers ApiaryHarvestSuper[]`.

- [ ] **Step 2: Generar la migración y añadir las reglas a mano**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"; export SHADOW_DATABASE_URL="${DATABASE_URL%%\?*}_shadow"
D=prisma/migrations/<AAAAMMDDHHMMSS>_alzas_con_marca; mkdir -p "$D"
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > "$D/migration.sql"; echo "diff=$?"
```

Al final de `migration.sql`, a mano:

```sql
-- La marca se guarda normalizada: «a-07 » y «A-07» son la misma alza, y el índice único lo
-- tiene que ver así. El servicio normaliza; esto impide que otra vía guarde la otra forma.
ALTER TABLE "apiary"."hive_super" ADD CONSTRAINT "hive_super_marca_normalizada"
  CHECK ("code" <> '' AND "code" = upper(btrim("code")));

-- Activa ⇔ sin baja. Fuera de servicio ⇒ con fecha y con motivo que diga algo.
ALTER TABLE "apiary"."hive_super" ADD CONSTRAINT "hive_super_baja_completa" CHECK (
  ("lifecycle_status" = 'active' AND "retired_at" IS NULL AND "retired_reason" IS NULL)
  OR ("lifecycle_status" <> 'active' AND "retired_at" IS NOT NULL AND btrim(coalesce("retired_reason", '')) <> '')
);

-- Una fila que apunta a un alza con marca ES un alza, y es UNA.
ALTER TABLE "apiary"."hive_fitting" ADD CONSTRAINT "hive_fitting_alza_marcada_es_una"
  CHECK ("hive_super_id" IS NULL OR ("kind" = 'alza' AND "count" = 1));

-- Un alza marcada está ABIERTA en una sola colmena. Los solapes con intervalos ya cerrados los
-- comprueba el servicio: un índice parcial no ve rangos (igual que el nodo).
CREATE UNIQUE INDEX "hive_fitting_alza_abierta_en_una_colmena" ON "apiary"."hive_fitting"("hive_super_id")
  WHERE "hive_super_id" IS NOT NULL AND "removed_at" IS NULL;
```

Leer el SQL generado: tiene que crear `hive_super` y `apiary_harvest_super`, añadir `hive_super_id` a `hive_fitting` y sus FK con `ON DELETE RESTRICT`. Nada más.

- [ ] **Step 3: Aplicar y comprobar que no hay deriva**

```bash
npx prisma migrate deploy && npx prisma generate > /dev/null && \
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > $TMPDIR/d.sql; \
echo "deriva=$(grep -v '^--' $TMPDIR/d.sql | grep -c '[A-Za-z]')"
npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script 2>/dev/null | grep -c "hive_super"
```

Expected: `deriva=0`, y el control positivo (segunda línea) **distinto de 0**.

- [ ] **Step 4: Escribir la prueba de las reglas en la base**

`tests/apiary/alzas.test.ts` — el andamiaje (mismo que `tests/apiary/nodo.test.ts`) y la sonda:

```ts
/**
 * Alzas con marca — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §4.
 *
 * Grupo `base-sembrada`: los permisos salen del catálogo sembrado y las reglas viven en Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createHive } from "../../lib/apiary/hives";

const RUN = `alz-${Date.now()}`;
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000);

let organizationId: string;
let otraOrganizationId: string;
let apiarioId: string;
let apiarioAjeno: string;
let adminId: string;
let operario: string;
let extrano: string;
const scopes: string[] = [];
const cajas: string[] = [];
const personas: string[] = [];

async function cuenta(nombre: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const s =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!scopes.includes(s.id)) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: p.id, scopeId: s.id } });
}

beforeAll(async () => {
  const org = (nombre: string) =>
    prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${nombre} (${RUN})`, status: "approved", classification: "internal" } });
  organizationId = (await org("Farm")).id;
  otraOrganizationId = (await org("Otra")).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  extrano = await cuenta("Extrano");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  apiarioAjeno = (await crearApiario(adminId, { name: `TEST Apiario ajeno (${RUN})`, organizationId: otraOrganizationId })).id;
  await asignar(operario, "Farm Operator", apiarioId);
  await asignar(extrano, "Farm Operator", apiarioAjeno);
}, 30000);

async function caja(locationId = apiarioId) {
  const c = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId });
  cajas.push(c.id);
  return c.id;
}

afterEach(async () => {
  const fits = (await prisma.hiveFitting.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((f) => f.id);
  const alzas = (await prisma.hiveSuper.findMany({ where: assertDefinedWhere({ organizationId: { in: [organizationId, otraOrganizationId] } }), select: { id: true } })).map((a) => a.id);
  await prisma.apiaryHarvestSuper.deleteMany({ where: assertDefinedWhere({ hiveSuperId: { in: alzas } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...fits, ...alzas] } }) });
  await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hiveSuper.deleteMany({ where: assertDefinedWhere({ id: { in: alzas } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [organizationId, otraOrganizationId] } }) });
});

/** Inserta en crudo dentro de una transacción que se deshace; devuelve «entra» o el nombre de la regla que lo impidió. */
async function sonda(sql: string): Promise<string> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("DESHACER");
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("DESHACER")) return "entra";
    return m.match(/hive_(super|fitting)_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas del alza viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const alza = (code: string, extra = "", vals = "") =>
      `INSERT INTO apiary.hive_super (organization_id, code${extra}) VALUES ('${organizationId}', '${code}'${vals})`;
    expect(await sonda(alza("A-07"))).toBe("entra");
    expect(await sonda(alza("a-07"))).toBe("hive_super_marca_normalizada");
    expect(await sonda(alza(" A-07"))).toBe("hive_super_marca_normalizada");
    expect(await sonda(alza(""))).toBe("hive_super_marca_normalizada");
    expect(await sonda(alza("A-08", ", lifecycle_status, retired_at, retired_reason", ", 'retired', now(), 'rota'"))).toBe("entra");
    expect(await sonda(alza("A-09", ", lifecycle_status, retired_at", ", 'retired', now()"))).toBe("hive_super_baja_completa");
    expect(await sonda(alza("A-10", ", lifecycle_status, retired_at, retired_reason", ", 'retired', now(), '  '"))).toBe("hive_super_baja_completa");
    expect(await sonda(alza("A-11", ", retired_at, retired_reason", ", now(), 'x'"))).toBe("hive_super_baja_completa");

    const hiveId = await caja();
    const s = await prisma.hiveSuper.create({ data: { organizationId, code: `S-${RUN}`.toUpperCase() } });
    const fit = (kind: string, count: string, superId = s.id) =>
      `INSERT INTO apiary.hive_fitting (hive_id, kind, count, installed_at, provenance_class, hive_super_id)
       VALUES ('${hiveId}', '${kind}', ${count}, now(), 'direct_observation', '${superId}')`;
    expect(await sonda(fit("alza", "1"))).toBe("entra");
    expect(await sonda(fit("alza", "2"))).toBe("hive_fitting_alza_marcada_es_una");
    expect(await sonda(fit("excluidor", "NULL"))).toBe("hive_fitting_alza_marcada_es_una");
  });

  it("un alza marcada no queda ABIERTA en dos colmenas", async () => {
    const [c1, c2] = [await caja(), await caja()];
    const s = await prisma.hiveSuper.create({ data: { organizationId, code: `D-${RUN}`.toUpperCase() } });
    await prisma.hiveFitting.create({ data: { hiveId: c1, kind: "alza", count: 1, installedAt: hace(5), provenanceClass: "direct_observation", hiveSuperId: s.id } });
    const r = await sonda(
      `INSERT INTO apiary.hive_fitting (hive_id, kind, count, installed_at, provenance_class, hive_super_id)
       VALUES ('${c2}', 'alza', 1, now(), 'direct_observation', '${s.id}')`,
    );
    expect(r).toMatch(/hive_fitting_alza_abierta_en_una_colmena|Unique constraint|duplicate key/);
  });
});
```

- [ ] **Step 5: Correrla**

```bash
npx vitest run tests/apiary/alzas.test.ts > $TMPDIR/t.txt 2>&1; echo "vitest=$?"; grep -E "Tests |×" $TMPDIR/t.txt
```

Expected: `vitest=0`, `Tests  2 passed (2)`.

- [ ] **Step 6: Registrarla en su carril y commitear**

En `scripts/pruebas-por-compuerta.txt`, debajo de `tests/apiary/nodo.test.ts`, añadir `tests/apiary/alzas.test.ts`. Comprobar que el carril hermético no la corre:

```bash
bash scripts/ci.sh > $TMPDIR/ci.txt 2>&1; echo "ci=$?"; grep -c "alzas.test" $TMPDIR/ci.txt
```

Expected: `ci=0` y `0`.

```bash
git add prisma/schema.prisma prisma/migrations/<AAAAMMDDHHMMSS>_alzas_con_marca/migration.sql tests/apiary/alzas.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat
git commit -F $TMPDIR/msg.txt   # «alzas: la tabla, su marca normalizada y la baja completa, en la base»
```

---

### Task 2: El servicio — registrar, poner, quitar, dar de baja, listar

**Files:**
- Create: `lib/apiary/alzas.ts`
- Modify: `lib/apiary/artefactos.ts` (`AbrirIntervalo.hiveSuperId`, `abrirIntervaloEn`, `cerrarAbiertosEn`, `historiaDeArtefactos`)
- Test: `tests/apiary/alzas.test.ts`

**Interfaces:**
- Consumes: `prisma.hiveSuper`, `HiveFitting.hiveSuperId` (Task 1); `abrirIntervaloEn`, `ArtefactoInvalido` de `lib/apiary/artefactos.ts`; `requireApiaryAccess`, `ApiaryAccessError` de `lib/apiary/hives.ts`.
- Produces (usado por Task 3 y 4):
  - `normalizarMarca(code: string): string`
  - `registrarAlza(userAccountId: string, input: { locationId: string; code: string; inServiceAt?: Date | null; notes?: string | null }): Promise<HiveSuper>`
  - `ponerAlza(userAccountId: string, input: { hiveId: string; hiveSuperId: string; installedAt: Date; provenanceClass?: ProvenanceClass }): Promise<HiveFitting>`
  - `darDeBajaAlza(userAccountId: string, input: { hiveSuperId: string; retiredAt: Date; reason: string; lifecycleStatus?: "retired" | "disposed" }): Promise<HiveSuper>`
  - `alzasDelApiario(userAccountId: string, locationId: string): Promise<AlzaDelApiario[]>` con
    `AlzaDelApiario = { id: string; code: string; lifecycleStatus: EquipmentLifecycle; retiredAt: Date | null; retiredReason: string | null; inServiceAt: Date | null; puestaEn: { hiveId: string; identifier: string; aqui: boolean; desde: Date } | null; historia: { hiveIdentifier: string; aqui: boolean; desde: Date; hasta: Date | null }[]; cosechas: { occurredAt: Date; lotId: string; lotCode: string }[] }`
  - Quitarla: `retirarArtefacto` (ya existe), sin cambios.

- [ ] **Step 1: Escribir las pruebas que fallan**

Añadir al principio de `tests/apiary/alzas.test.ts` los imports:

```ts
import { alzasDelApiario, darDeBajaAlza, ponerAlza, registrarAlza } from "../../lib/apiary/alzas";
import { cerrarAbiertosEn, instalarArtefacto, retirarArtefacto } from "../../lib/apiary/artefactos";
```

Y un `describe` nuevo:

```ts
describe("alzas con marca", () => {
  const marca = (s: string) => `${s}-${RUN}`;

  it("SE REGISTRA NORMALIZADA, y la misma marca en la misma finca se rechaza con su nombre", async () => {
    const a = await registrarAlza(operario, { locationId: apiarioId, code: `  ${marca("a7")} ` });
    expect(a.code).toBe(marca("A7").toUpperCase());
    expect(a.organizationId).toBe(organizationId);
    await expect(registrarAlza(operario, { locationId: apiarioId, code: marca("A7") })).rejects.toThrow(/marca_repetida/);
    await expect(registrarAlza(operario, { locationId: apiarioId, code: "   " })).rejects.toThrow(/marca_requerida/);
  });

  it("PONERLA abre su intervalo de cuenta 1; QUITARLA lo cierra; y queda la historia", async () => {
    const hiveId = await caja();
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("P") });
    const f = await ponerAlza(operario, { hiveId, hiveSuperId: a.id, installedAt: hace(10) });
    expect([f.kind, f.count, f.hiveSuperId]).toEqual(["alza", 1, a.id]);
    await retirarArtefacto(operario, { fittingId: f.id, removedAt: hace(2) });
    const [fila] = (await alzasDelApiario(operario, apiarioId)).filter((x) => x.id === a.id);
    expect(fila.puestaEn).toBeNull();
    expect(fila.historia.map((h) => [h.aqui, h.hasta !== null])).toEqual([[true, true]]);
  });

  it("NO SE PONE EN DOS COLMENAS: ni abierta ni solapando un intervalo ya cerrado", async () => {
    const [c1, c2] = [await caja(), await caja()];
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("D") });
    const f = await ponerAlza(operario, { hiveId: c1, hiveSuperId: a.id, installedAt: hace(10) });
    await expect(ponerAlza(operario, { hiveId: c2, hiveSuperId: a.id, installedAt: hace(5) })).rejects.toThrow(/alza_en_otra_colmena/);
    await retirarArtefacto(operario, { fittingId: f.id, removedAt: hace(3) });
    // Cerrada el día -3: ponerla el día -5 en otra caja la tendría en dos sitios esos dos días.
    await expect(ponerAlza(operario, { hiveId: c2, hiveSuperId: a.id, installedAt: hace(5) })).rejects.toThrow(/alza_en_otra_colmena/);
    await expect(ponerAlza(operario, { hiveId: c2, hiveSuperId: a.id, installedAt: hace(1) })).resolves.toBeTruthy();
  });

  it("NO SE PONE una dada de baja, ni una de otra finca, y SIN PERMISO no se toca", async () => {
    const hiveId = await caja();
    const baja = await registrarAlza(operario, { locationId: apiarioId, code: marca("B") });
    await darDeBajaAlza(operario, { hiveSuperId: baja.id, retiredAt: hace(1), reason: "madera podrida" });
    await expect(ponerAlza(operario, { hiveId, hiveSuperId: baja.id, installedAt: new Date() })).rejects.toThrow(/alza_dada_de_baja/);
    const ajena = await registrarAlza(adminId, { locationId: apiarioAjeno, code: marca("X") });
    await expect(ponerAlza(operario, { hiveId, hiveSuperId: ajena.id, installedAt: new Date() })).rejects.toThrow(/alza_de_otra_finca/);
    await expect(registrarAlza(extrano, { locationId: apiarioId, code: marca("Z") })).rejects.toThrow(/no_apiary_access/);
    const mia = await registrarAlza(operario, { locationId: apiarioId, code: marca("M") });
    await expect(ponerAlza(extrano, { hiveId, hiveSuperId: mia.id, installedAt: new Date() })).rejects.toThrow(/no_apiary_access/);
  });

  it("DAR DE BAJA pide motivo y no se hace con el alza puesta", async () => {
    const hiveId = await caja();
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("Q") });
    await expect(darDeBajaAlza(operario, { hiveSuperId: a.id, retiredAt: new Date(), reason: " " })).rejects.toThrow(/baja_sin_motivo/);
    await ponerAlza(operario, { hiveId, hiveSuperId: a.id, installedAt: hace(3) });
    await expect(darDeBajaAlza(operario, { hiveSuperId: a.id, retiredAt: new Date(), reason: "rota" })).rejects.toThrow(/alza_puesta/);
  });

  it("LA INSPECCIÓN QUE QUITA ALZAS NO SE LLEVA LAS MARCADAS: sólo cierra las de cuenta", async () => {
    const hiveId = await caja();
    const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("I") });
    await ponerAlza(operario, { hiveId, hiveSuperId: a.id, installedAt: hace(10) });
    await instalarArtefacto(operario, { hiveId, kind: "alza", count: 2, installedAt: hace(10) });
    const cerradas = await prisma.$transaction(cerrarAbiertosEn(operario, hiveId, "alza", hace(1)));
    expect(cerradas).toBe(1);
    const abiertas = await prisma.hiveFitting.findMany({ where: { hiveId, removedAt: null } });
    expect(abiertas.map((f) => f.hiveSuperId)).toEqual([a.id]);
  });

  it("EL LISTADO NO ENSEÑA la caja de otro apiario: dice que está fuera", async () => {
    const otroApiario = (await crearApiario(adminId, { name: `TEST Apiario 2 (${RUN})`, organizationId })).id;
    try {
      const fuera = await caja(otroApiario);
      const a = await registrarAlza(operario, { locationId: apiarioId, code: marca("F") });
      await ponerAlza(adminId, { hiveId: fuera, hiveSuperId: a.id, installedAt: hace(1) });
      const [fila] = (await alzasDelApiario(operario, apiarioId)).filter((x) => x.id === a.id);
      expect(fila.puestaEn?.aqui).toBe(false);
      expect(fila.puestaEn?.hiveId).toBe("");
      expect(fila.puestaEn?.identifier).toBe("");
      await expect(alzasDelApiario(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
    } finally {
      const cajasFuera = (await prisma.hive.findMany({ where: { locationId: otroApiario }, select: { id: true } })).map((h) => h.id);
      await prisma.hiveFitting.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajasFuera } }) });
      await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajasFuera } }) });
      await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajasFuera } }) });
      cajas.splice(0, cajas.length, ...cajas.filter((c) => !cajasFuera.includes(c)));
      await prisma.location.deleteMany({ where: assertDefinedWhere({ id: otroApiario }) });
    }
  });
});
```

- [ ] **Step 2: Comprobar que fallan por la razón correcta**

```bash
npx vitest run tests/apiary/alzas.test.ts > $TMPDIR/t.txt 2>&1; echo "vitest=$?"; grep -E "Tests |Cannot find|Failed to load" $TMPDIR/t.txt | head
```

Expected: fallo de carga por `lib/apiary/alzas` inexistente.

- [ ] **Step 3: Cambiar `lib/apiary/artefactos.ts`**

En `interface AbrirIntervalo`, debajo de `hiveNodeId`:

```ts
  /** Sólo `alza` con marca: CUÁL alza. Lo pone `ponerAlza`, que comprueba que no esté en otra colmena. */
  readonly hiveSuperId?: string | null;
```

En `abrirIntervaloEn`, en el `data` del `create`, debajo de `hiveNodeId: d.hiveNodeId ?? null,`:

```ts
      hiveSuperId: d.hiveSuperId ?? null,
```

En `cerrarAbiertosEn`, cambiar la consulta y el comentario:

```ts
/**
 * «Se quitó el excluidor», dicho sin señalar CUÁL intervalo: cierra los abiertos de ese tipo. Si
 * no hay ninguno —una colmena declarada con el booleano antes de que existieran los intervalos—
 * no se inventa una instalación con fecha desconocida: sólo se apaga la foto, auditada.
 *
 * **Las alzas CON MARCA no entran** (spec 2026-09-18 §4.2): «quité el alza» en la inspección no
 * dice CUÁL, y cerrar A-07 sin que nadie lo diga le escribiría una historia falsa. Una marcada
 * se quita con su propio botón (`retirarArtefacto`).
 */
export const cerrarAbiertosEn =
  (userAccountId: string, hiveId: string, kind: HiveFittingKind, removedAt: Date, removedInspectionId: string | null = null) =>
  async (tx: Tx) => {
    const abiertos = await tx.hiveFitting.findMany({ where: { hiveId, kind, removedAt: null, hiveSuperId: null } });
```

(el resto del cuerpo igual).

En `historiaDeArtefactos`, el `include`:

```ts
    include: { hiveNode: { select: { deviceId: true } }, hiveSuper: { select: { code: true } } },
```

- [ ] **Step 4: Escribir `lib/apiary/alzas.ts`**

```ts
/**
 * Alzas con marca — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §4.
 *
 * Daniel, 2026-09-18: las alzas «todavía no [llevan marca], pero se marcarán», y las quiere para
 * saber de qué alza salió la miel, por dónde pasó (sanidad), el inventario del equipo. La marca va
 * por fuera, donde se ve, y un alza se pone y se quita pocas veces: se puede seguir.
 *
 * **Dónde estuvo lo dicen sus intervalos** (`HiveFitting`, kind `alza`, cuenta 1, con
 * `hiveSuperId`): el patrón del nodo de sensores (`nodos.ts`), sin una tabla de colocaciones
 * aparte. Las alzas SIN marca no cambian: siguen siendo filas `alza` con su cuenta.
 *
 * Permiso: `apiary:manage` sobre el sitio o la colmena, como el resto del trabajo de la caja;
 * leer, `apiary:view`.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { abrirIntervaloEn, ArtefactoInvalido } from "./artefactos";
import type { EquipmentLifecycle, ProvenanceClass } from "../../generated/prisma/client";

/** «a-07 » y «A-07» son la misma alza. La base exige esta forma (CHECK `hive_super_marca_normalizada`). */
export function normalizarMarca(code: string): string {
  return code.trim().toUpperCase();
}

export async function registrarAlza(
  userAccountId: string,
  input: { locationId: string; code: string; inServiceAt?: Date | null; notes?: string | null },
) {
  const code = normalizarMarca(input.code);
  if (!code) throw new ArtefactoInvalido("marca_requerida");
  const sitio = await prisma.location.findUnique({ where: { id: input.locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ locationId: input.locationId }]);
  // Sin finca no hay a quién pertenezca el alza.
  if (!sitio.organizationId) throw new ArtefactoInvalido("sitio_sin_finca");
  const organizationId = sitio.organizationId;
  if (input.inServiceAt && Number.isNaN(input.inServiceAt.getTime())) throw new ArtefactoInvalido("fecha_invalida");

  try {
    return await prisma.$transaction(async (tx) => {
      const alza = await tx.hiveSuper.create({
        data: { organizationId, code, inServiceAt: input.inServiceAt ?? null, notes: input.notes?.trim() || null, createdBy: userAccountId },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, operation: "hive_super.register", entityType: "hive_super", entityId: alza.id, after: alza, sourceInterface: "apiary.service" },
        tx,
      );
      return alza;
    });
  } catch (error) {
    // El choque lo decide la BASE (índice único): una comprobación previa tendría carrera.
    if (error instanceof Error && /Unique constraint/i.test(error.message)) throw new ArtefactoInvalido("marca_repetida");
    throw error;
  }
}

export async function ponerAlza(
  userAccountId: string,
  input: { hiveId: string; hiveSuperId: string; installedAt: Date; provenanceClass?: ProvenanceClass },
) {
  const hive = await prisma.hive.findUnique({
    where: { id: input.hiveId },
    select: { projectId: true, locationId: true, location: { select: { organizationId: true } } },
  });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: hive.projectId, locationId: hive.locationId }]);
  if (Number.isNaN(input.installedAt.getTime())) throw new ArtefactoInvalido("fecha_de_instalacion_invalida");

  const alza = await prisma.hiveSuper.findUnique({ where: { id: input.hiveSuperId } });
  if (!alza) throw new ArtefactoInvalido("alza_no_encontrada");
  if (alza.organizationId !== hive.location.organizationId) throw new ArtefactoInvalido("alza_de_otra_finca");
  if (alza.lifecycleStatus !== "active") throw new ArtefactoInvalido("alza_dada_de_baja");

  // Se cruza con [installedAt, ∞) todo intervalo que siga abierto o se cierre DESPUÉS.
  const cruza = { OR: [{ removedAt: null }, { removedAt: { gt: input.installedAt } }] };

  return prisma.$transaction(async (tx) => {
    if (await tx.hiveFitting.count({ where: { hiveSuperId: alza.id, ...cruza } })) {
      throw new ArtefactoInvalido("alza_en_otra_colmena");
    }
    return abrirIntervaloEn(userAccountId, {
      hiveId: input.hiveId,
      kind: "alza",
      count: 1,
      notes: null,
      installedAt: input.installedAt,
      provenanceClass: input.provenanceClass ?? "direct_observation",
      hiveSuperId: alza.id,
    })(tx);
  });
}

export async function darDeBajaAlza(
  userAccountId: string,
  input: { hiveSuperId: string; retiredAt: Date; reason: string; lifecycleStatus?: "retired" | "disposed" },
) {
  const motivo = input.reason.trim();
  if (!motivo) throw new ArtefactoInvalido("baja_sin_motivo");
  if (Number.isNaN(input.retiredAt.getTime())) throw new ArtefactoInvalido("fecha_invalida");
  const antes = await prisma.hiveSuper.findUnique({ where: { id: input.hiveSuperId } });
  if (!antes) throw new ArtefactoInvalido("alza_no_encontrada");
  // El permiso se juzga donde el alza tiene sitios: cualquier apiario de su finca.
  const sitios = await prisma.location.findMany({ where: { organizationId: antes.organizationId }, select: { id: true } });
  await requireApiaryAccess(userAccountId, "manage", sitios.map((s) => ({ locationId: s.id })));
  if (antes.lifecycleStatus !== "active") throw new ArtefactoInvalido("alza_dada_de_baja");

  return prisma.$transaction(async (tx) => {
    // Puesta en una colmena no se da de baja: primero se quita, y su intervalo dice cuándo.
    if (await tx.hiveFitting.count({ where: { hiveSuperId: antes.id, removedAt: null } })) throw new ArtefactoInvalido("alza_puesta");
    const despues = await tx.hiveSuper.update({
      where: { id: antes.id },
      data: { lifecycleStatus: input.lifecycleStatus ?? "retired", retiredAt: input.retiredAt, retiredReason: motivo },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "hive_super.retire", entityType: "hive_super", entityId: antes.id, before: antes, after: despues, reason: motivo, sourceInterface: "apiary.service" },
      tx,
    );
    return despues;
  });
}

export interface AlzaDelApiario {
  id: string;
  code: string;
  lifecycleStatus: EquipmentLifecycle;
  retiredAt: Date | null;
  retiredReason: string | null;
  inServiceAt: Date | null;
  /** Dónde está HOY. `aqui` falso: en una caja de otro apiario, y entonces no se dice cuál. */
  puestaEn: { hiveId: string; identifier: string; aqui: boolean; desde: Date } | null;
  /** Por dónde pasó, lo más nuevo primero. Lo de otro apiario, sin nombre de caja. */
  historia: { hiveIdentifier: string; aqui: boolean; desde: Date; hasta: Date | null }[];
  cosechas: { occurredAt: Date; lotId: string; lotCode: string }[];
}

/**
 * Las alzas de la finca de este apiario, con dónde están, por dónde pasaron y en qué cosechas
 * salieron. **No enseña identificadores de cajas de OTRO apiario**: quien ve éste puede no ver aquél.
 */
export async function alzasDelApiario(userAccountId: string, locationId: string): Promise<AlzaDelApiario[]> {
  await requireApiaryAccess(userAccountId, "view", [{ locationId }]);
  const sitio = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!sitio?.organizationId) return [];
  const alzas = await prisma.hiveSuper.findMany({
    where: { organizationId: sitio.organizationId },
    orderBy: { code: "asc" },
    include: {
      fittings: { orderBy: { installedAt: "desc" }, include: { hive: { select: { id: true, identifier: true, locationId: true } } } },
      harvests: { include: { apiaryHarvestEvent: { select: { occurredAt: true, resultingLot: { select: { id: true, lotCode: true } } } } } },
    },
  });
  return alzas.map((a) => {
    const abierta = a.fittings.find((f) => f.removedAt === null) ?? null;
    return {
      id: a.id,
      code: a.code,
      lifecycleStatus: a.lifecycleStatus,
      retiredAt: a.retiredAt,
      retiredReason: a.retiredReason,
      inServiceAt: a.inServiceAt,
      puestaEn: abierta
        ? {
            hiveId: abierta.hive.locationId === locationId ? abierta.hive.id : "",
            identifier: abierta.hive.locationId === locationId ? abierta.hive.identifier : "",
            aqui: abierta.hive.locationId === locationId,
            desde: abierta.installedAt,
          }
        : null,
      historia: a.fittings.map((f) => ({
        hiveIdentifier: f.hive.locationId === locationId ? f.hive.identifier : "",
        aqui: f.hive.locationId === locationId,
        desde: f.installedAt,
        hasta: f.removedAt,
      })),
      cosechas: a.harvests
        .map((h) => ({ occurredAt: h.apiaryHarvestEvent.occurredAt, lotId: h.apiaryHarvestEvent.resultingLot.id, lotCode: h.apiaryHarvestEvent.resultingLot.lotCode }))
        .sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime()),
    };
  });
}
```

- [ ] **Step 5: Correr las pruebas y el typecheck**

```bash
npx vitest run tests/apiary/alzas.test.ts tests/apiary/artefactos.test.ts tests/apiary/nodo.test.ts > $TMPDIR/t.txt 2>&1; echo "vitest=$?"; grep -E "Tests |×" $TMPDIR/t.txt
npx tsc --noEmit -p . > $TMPDIR/tsc.txt 2>&1; echo "tsc=$?"; head -5 $TMPDIR/tsc.txt
```

Expected: `vitest=0` (las de artefactos y nodo siguen en verde: el cambio de `cerrarAbiertosEn` no las afecta), `tsc=0`.

- [ ] **Step 6: Commit**

```bash
git add lib/apiary/alzas.ts lib/apiary/artefactos.ts tests/apiary/alzas.test.ts
git diff --cached --stat
git commit -F $TMPDIR/msg.txt   # «alzas: registrar, poner, quitar y dar de baja; la inspección ya no se lleva las marcadas»
```

---

### Task 3: La cosecha dice qué alzas marcadas se extrajeron

**Files:**
- Modify: `lib/apiary/harvest.ts` (`RecordApiaryHarvestInput`, `recordApiaryHarvest`)
- Test: `tests/apiary/alzas.test.ts`

**Interfaces:**
- Consumes: `ponerAlza`, `registrarAlza` (Task 2); `prisma.apiaryHarvestSuper` (Task 1).
- Produces: `RecordApiaryHarvestInput.hiveSuperIds?: readonly string[]`; error `alza_no_puesta_en_la_colmena`.

- [ ] **Step 1: Escribir la prueba que falla**

Imports en `tests/apiary/alzas.test.ts`:

```ts
import { createColony } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
```

Y en `afterEach`, **antes** de borrar las alzas, añadir la limpieza de las cosechas y sus lotes:

```ts
  const eventos = await prisma.apiaryHarvestEvent.findMany({ where: { colony: { hiveId: { in: cajas } } }, select: { id: true, resultingLotId: true } });
  await prisma.apiaryHarvestSuper.deleteMany({ where: assertDefinedWhere({ apiaryHarvestEventId: { in: eventos.map((e) => e.id) } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: eventos.map((e) => e.resultingLotId) } }) });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: eventos.map((e) => e.id) } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: eventos.map((e) => e.resultingLotId) } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
```

La prueba:

```ts
describe("la cosecha y sus alzas", () => {
  it("DICE QUÉ ALZAS MARCADAS SE EXTRAJERON, sólo si estaban puestas en esa colmena ese día", async () => {
    const hiveId = await caja();
    const otraCaja = await caja();
    const colonia = await createColony(adminId, { hiveId, originType: "captured", startedAt: hace(60), provenanceClass: "direct_observation" });
    const puesta = await registrarAlza(operario, { locationId: apiarioId, code: `H1-${RUN}` });
    const fuera = await registrarAlza(operario, { locationId: apiarioId, code: `H2-${RUN}` });
    await ponerAlza(operario, { hiveId, hiveSuperId: puesta.id, installedAt: hace(20) });
    await ponerAlza(operario, { hiveId: otraCaja, hiveSuperId: fuera.id, installedAt: hace(20) });

    await expect(
      recordApiaryHarvest(operario, {
        colonyId: colonia.id, lotCode: `MIEL-${RUN}-no`, occurredAt: new Date(), provenanceClass: "measured_fact",
        hiveSuperIds: [puesta.id, fuera.id],
      }),
    ).rejects.toThrow(/alza_no_puesta_en_la_colmena/);
    // Todo o nada: el rechazo no dejó lote.
    expect(await prisma.lot.count({ where: { lotCode: `MIEL-${RUN}-no` } })).toBe(0);

    const { harvestEvent } = await recordApiaryHarvest(operario, {
      colonyId: colonia.id, lotCode: `MIEL-${RUN}-si`, occurredAt: new Date(), provenanceClass: "measured_fact",
      hiveSuperIds: [puesta.id],
    });
    const filas = await prisma.apiaryHarvestSuper.findMany({ where: { apiaryHarvestEventId: harvestEvent.id } });
    expect(filas.map((f) => f.hiveSuperId)).toEqual([puesta.id]);
    const [fila] = (await alzasDelApiario(operario, apiarioId)).filter((x) => x.id === puesta.id);
    expect(fila.cosechas.map((c) => c.lotCode)).toEqual([`MIEL-${RUN}-si`]);
  });

  it("SIN ALZAS MARCADAS la cosecha vale igual", async () => {
    const hiveId = await caja();
    const colonia = await createColony(adminId, { hiveId, originType: "captured", startedAt: hace(60), provenanceClass: "direct_observation" });
    const { harvestEvent } = await recordApiaryHarvest(operario, {
      colonyId: colonia.id, lotCode: `MIEL-${RUN}-sin`, occurredAt: new Date(), provenanceClass: "measured_fact",
    });
    expect(await prisma.apiaryHarvestSuper.count({ where: { apiaryHarvestEventId: harvestEvent.id } })).toBe(0);
  });
});
```

- [ ] **Step 2: Verla fallar**

```bash
npx vitest run tests/apiary/alzas.test.ts > $TMPDIR/t.txt 2>&1; echo "vitest=$?"; grep -E "Tests |×" $TMPDIR/t.txt
```

Expected: cae «DICE QUÉ ALZAS MARCADAS…» (la cosecha acepta la ajena sin quejarse). Si en vez de eso falla `tsc` por `hiveSuperIds` desconocido, también vale como rojo: es el campo que falta.

- [ ] **Step 3: Implementar en `lib/apiary/harvest.ts`**

En `RecordApiaryHarvestInput`, debajo de `sourceReference`:

```ts
  /**
   * Spec 2026-09-18 §4.3 — las alzas CON MARCA que se extrajeron. Cada una tiene que estar puesta
   * en la colmena de esta colonia en `occurredAt`; si no, se rechaza todo. Opcional.
   */
  hiveSuperIds?: readonly string[];
```

Dentro de la transacción, justo después de crear `harvestEvent`:

```ts
    // Las alzas marcadas, comprobadas DENTRO de la transacción que crea la cosecha: si una no
    // estaba en esta caja ese día, no se guarda nada — ni lote ni cosecha a medias.
    const alzas = [...new Set(input.hiveSuperIds ?? [])];
    for (const hiveSuperId of alzas) {
      const puesta = await tx.hiveFitting.count({
        where: {
          hiveSuperId,
          hiveId: hive.id,
          installedAt: { lte: input.occurredAt },
          OR: [{ removedAt: null }, { removedAt: { gt: input.occurredAt } }],
        },
      });
      if (!puesta) throw new ApiaryAccessError("alza_no_puesta_en_la_colmena");
    }
    if (alzas.length) {
      await tx.apiaryHarvestSuper.createMany({ data: alzas.map((hiveSuperId) => ({ apiaryHarvestEventId: harvestEvent.id, hiveSuperId })) });
    }
```

y en el `after` del `recordAuditEvent` de la cosecha, pasar `after: { ...harvestEvent, hiveSuperIds: alzas }` para que el rastro diga qué alzas se nombraron.

- [ ] **Step 4: Verla pasar**

```bash
npx vitest run tests/apiary/alzas.test.ts tests/apiary/carencia.test.ts > $TMPDIR/t.txt 2>&1; echo "vitest=$?"; grep -E "Tests |×" $TMPDIR/t.txt
npx tsc --noEmit -p . > $TMPDIR/tsc.txt 2>&1; echo "tsc=$?"
```

Expected: `vitest=0`, `tsc=0`.

- [ ] **Step 5: Commit**

```bash
git add lib/apiary/harvest.ts tests/apiary/alzas.test.ts
git commit -F $TMPDIR/msg.txt   # «alzas: la cosecha dice qué alzas marcadas se extrajeron»
```

---

### Task 4: Las pantallas

**Files:**
- Modify: `app/actions/apiary.ts` (cuatro acciones nuevas y `recordApiaryHarvestFormAction`)
- Modify: `app/apiaries/[id]/page.tsx` (sección «Alzas con marca»)
- Modify: `app/apiaries/[id]/hives/[hiveId]/page.tsx` (poner alza marcada; mostrar la marca; pasar alzas a la cosecha)
- Modify: `app/components/apiary/HarvestForm.tsx` (casillas de alzas)
- Modify: `messages/es.json`, `messages/en.json` (espacio `Apiary`)

**Interfaces:**
- Consumes: `registrarAlza`, `ponerAlza`, `darDeBajaAlza`, `alzasDelApiario`, `AlzaDelApiario` (Task 2); `hiveSuperIds` (Task 3); `historiaDeArtefactos` con `hiveSuper.code` (Task 2).
- Produces: acciones `registrarAlzaFormAction`, `ponerAlzaFormAction`, `darDeBajaAlzaFormAction` (todas `async (formData: FormData) => Promise<void>`); `HarvestForm({ colonyId, alzas })` con `alzas: { id: string; code: string }[]`.

- [ ] **Step 1: Las acciones**

En `app/actions/apiary.ts`, import:

```ts
import { darDeBajaAlza, ponerAlza, registrarAlza } from "../../lib/apiary/alzas";
```

Debajo de `retirarArtefactoFormAction`:

```ts
/** Alzas con marca (spec 2026-09-18 §4) — registrar una desde la ficha del apiario. */
export async function registrarAlzaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  const desde = emptyToNull(formData.get("inServiceAt"));
  await registrarAlza(user.userAccountId, {
    locationId: apiaryId,
    code: String(formData.get("code") ?? ""),
    inServiceAt: desde ? new Date(`${desde}T00:00:00Z`) : null,
    notes: emptyToNull(formData.get("notes")),
  });
  revalidatePath(`/apiaries/${apiaryId}`);
}

/** Poner un alza marcada en una colmena, desde la ficha de la colmena. */
export async function ponerAlzaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const hiveId = String(formData.get("hiveId") ?? "");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  await ponerAlza(user.userAccountId, {
    hiveId,
    hiveSuperId: String(formData.get("hiveSuperId") ?? ""),
    installedAt:
      parseOptionalLocalDateTime(String(formData.get("cuando") ?? ""), String(formData.get(TZ_OFFSET_FIELD) ?? "")) ?? new Date(),
  });
  revalidatePath(`/apiaries/${apiaryId}/hives/${hiveId}`);
  revalidatePath(`/apiaries/${apiaryId}`);
}

/** Dar de baja un alza marcada (rota, perdida…). Pide motivo; puesta en una colmena, no se deja. */
export async function darDeBajaAlzaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  await darDeBajaAlza(user.userAccountId, {
    hiveSuperId: String(formData.get("hiveSuperId") ?? ""),
    retiredAt: new Date(),
    reason: String(formData.get("reason") ?? ""),
  });
  revalidatePath(`/apiaries/${apiaryId}`);
}
```

En `recordApiaryHarvestFormAction`, dentro del objeto que se pasa a `recordApiaryHarvest`:

```ts
    hiveSuperIds: formData.getAll("hiveSuperIds").map(String).filter(Boolean),
```

- [ ] **Step 2: Los mensajes**

En `messages/es.json`, dentro de `"Apiary"` (claves nuevas; comprobar que ninguna existe con `grep -c`):

```json
"alzasHeading": "Alzas con marca",
"alzasIntro": "Las alzas que llevan su marca por fuera. Las que aún no la tienen se siguen contando en cada colmena.",
"alzasNinguna": "Todavía no hay alzas con marca registradas.",
"alzaEnColmena": "puesta en {colmena} desde el {fecha}",
"alzaEnOtroApiario": "puesta en otro apiario desde el {fecha}",
"alzaEnBodega": "en bodega",
"alzaDeBaja": "de baja el {fecha} — {motivo}",
"alzaHistoria": "Por dónde pasó",
"alzaHistoriaFila": "{colmena}: {desde} → {hasta}",
"alzaHistoriaOtroApiario": "otro apiario",
"alzaHistoriaAbierta": "hoy",
"alzaCosechas": "Cosechas en que salió",
"alzaRegistrar": "Registrar un alza con marca",
"alzaMarca": "Marca (lo que va escrito en el alza)",
"alzaDesde": "En uso desde (si se sabe)",
"alzaNota": "Nota",
"alzaRegistrarBoton": "Registrar alza",
"alzaDarDeBaja": "Dar de baja",
"alzaMotivoBaja": "¿Por qué?",
"alzaDarDeBajaBoton": "Dar de baja el alza",
"alzaPonerMarcada": "Poner un alza con marca",
"alzaCual": "¿Cuál?",
"alzaPonerBoton": "Poner el alza",
"alzaSinLibres": "No hay alzas con marca libres. Se registran en la ficha del apiario.",
"alzasCosechadas": "Alzas con marca que se extrajeron",
"alzasCosechadasAyuda": "Marca las que salieron de esta colmena. Las alzas sin marca no aparecen aquí."
```

En `messages/en.json`, las mismas claves:

```json
"alzasHeading": "Marked supers",
"alzasIntro": "Supers that carry their own mark on the outside. Unmarked ones are still counted per hive.",
"alzasNinguna": "No marked supers registered yet.",
"alzaEnColmena": "on {colmena} since {fecha}",
"alzaEnOtroApiario": "in another apiary since {fecha}",
"alzaEnBodega": "in storage",
"alzaDeBaja": "retired on {fecha} — {motivo}",
"alzaHistoria": "Where it has been",
"alzaHistoriaFila": "{colmena}: {desde} → {hasta}",
"alzaHistoriaOtroApiario": "another apiary",
"alzaHistoriaAbierta": "today",
"alzaCosechas": "Harvests it came out in",
"alzaRegistrar": "Register a marked super",
"alzaMarca": "Mark (what is written on the super)",
"alzaDesde": "In use since (if known)",
"alzaNota": "Note",
"alzaRegistrarBoton": "Register super",
"alzaDarDeBaja": "Retire",
"alzaMotivoBaja": "Why?",
"alzaDarDeBajaBoton": "Retire the super",
"alzaPonerMarcada": "Put on a marked super",
"alzaCual": "Which one?",
"alzaPonerBoton": "Put the super on",
"alzaSinLibres": "No free marked supers. Register them on the apiary page.",
"alzasCosechadas": "Marked supers extracted",
"alzasCosechadasAyuda": "Tick the ones that came off this hive. Unmarked supers do not appear here."
```

- [ ] **Step 3: La sección en la ficha del apiario**

En `app/apiaries/[id]/page.tsx`: imports

```ts
import { alzasDelApiario } from "../../../lib/apiary/alzas";
import { darDeBajaAlzaFormAction, registrarAlzaFormAction } from "../../actions/apiary";
```

(añadir las dos acciones al import existente de `../../actions/apiary` en vez de duplicarlo). Después del `Promise.all` que trae `apiary` (que ya autorizó):

```ts
  // Alzas con marca (spec 2026-09-18 §4.4). Con su propio `requireApiaryAccess("view")` dentro.
  const alzas = await alzasDelApiario(user.userAccountId, id);
```

Qué se PINTA lo decide el mismo criterio que la ficha de la colmena (su comentario en la línea
~74 explica por qué «en algún ámbito» basta para pintar: la acción autoriza de verdad):

```ts
import { permissionKeysAnywhere } from "../../../lib/rbac/service";
// …
  const puedeGestionarAlzas = (await permissionKeysAnywhere(user.userAccountId)).has("apiary:manage");
```

La sección, justo **antes** de `<section className="nn-section"><h2>{t("newHiveHeading")}</h2>`:

```tsx
      {/* Alzas con marca — spec 2026-09-18 §4.4. La «ficha del alza» es el desplegable de cada
          una: por dónde pasó y en qué cosechas salió. Lo de otro apiario, sin nombre de caja. */}
      <section className="nn-section" id="alzas">
        <h2>{t("alzasHeading")}</h2>
        <p className="nn-muted">{t("alzasIntro")}</p>
        {alzas.length === 0 ? (
          <p className="nn-muted">{t("alzasNinguna")}</p>
        ) : (
          <ul>
            {alzas.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.5rem" }}>
                <details>
                  <summary>
                    <strong className="nn-code">{a.code}</strong>{" — "}
                    {a.lifecycleStatus !== "active"
                      ? t("alzaDeBaja", { fecha: a.retiredAt!.toISOString().slice(0, 10), motivo: a.retiredReason ?? "" })
                      : a.puestaEn
                        ? a.puestaEn.aqui
                          ? t("alzaEnColmena", { colmena: a.puestaEn.identifier, fecha: a.puestaEn.desde.toISOString().slice(0, 10) })
                          : t("alzaEnOtroApiario", { fecha: a.puestaEn.desde.toISOString().slice(0, 10) })
                        : t("alzaEnBodega")}
                  </summary>
                  {a.historia.length > 0 ? (
                    <>
                      <h3>{t("alzaHistoria")}</h3>
                      <ul>
                        {a.historia.map((h, i) => (
                          <li key={i}>
                            {t("alzaHistoriaFila", {
                              colmena: h.aqui ? h.hiveIdentifier : t("alzaHistoriaOtroApiario"),
                              desde: h.desde.toISOString().slice(0, 10),
                              hasta: h.hasta ? h.hasta.toISOString().slice(0, 10) : t("alzaHistoriaAbierta"),
                            })}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {a.cosechas.length > 0 ? (
                    <>
                      <h3>{t("alzaCosechas")}</h3>
                      <ul>
                        {a.cosechas.map((c) => (
                          <li key={c.lotId}>
                            {c.occurredAt.toISOString().slice(0, 10)} ·{" "}
                            <Link href={`/lots/${c.lotId}`} className="nn-code">{c.lotCode}</Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {puedeGestionarAlzas && a.lifecycleStatus === "active" && !a.puestaEn ? (
                    <form action={darDeBajaAlzaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
                      <input type="hidden" name="apiaryId" value={id} />
                      <input type="hidden" name="hiveSuperId" value={a.id} />
                      <div className="nn-field">
                        <label htmlFor={`baja-${a.id}`}>{t("alzaMotivoBaja")}</label>
                        <input id={`baja-${a.id}`} name="reason" type="text" required />
                      </div>
                      <BotonDeEnvio>{t("alzaDarDeBajaBoton")}</BotonDeEnvio>
                    </form>
                  ) : null}
                </details>
              </li>
            ))}
          </ul>
        )}
        {puedeGestionarAlzas ? (
          <details>
            <summary>{t("alzaRegistrar")}</summary>
            <form action={registrarAlzaFormAction} className="nn-form" style={{ maxWidth: 420 }}>
              <input type="hidden" name="apiaryId" value={id} />
              <div className="nn-field">
                <label htmlFor="alza-code">{t("alzaMarca")}</label>
                <input id="alza-code" name="code" type="text" required />
              </div>
              <div className="nn-field">
                <label htmlFor="alza-desde">{t("alzaDesde")}</label>
                <input id="alza-desde" name="inServiceAt" type="date" />
              </div>
              <div className="nn-field">
                <label htmlFor="alza-nota">{t("alzaNota")}</label>
                <input id="alza-nota" name="notes" type="text" />
              </div>
              <BotonDeEnvio>{t("alzaRegistrarBoton")}</BotonDeEnvio>
            </form>
          </details>
        ) : null}
      </section>
```

- [ ] **Step 4: La ficha de la colmena**

En `app/apiaries/[id]/hives/[hiveId]/page.tsx`:

1. Añadir `ponerAlzaFormAction` al import de `../../../../actions/apiary`, y `import { alzasDelApiario } from "../../../../../lib/apiary/alzas";`.
2. Debajo de `const puestos = …`:

```ts
  // Alzas con marca: las libres para poner aquí (de la finca, activas, sin colmena) y las que
  // esta caja lleva HOY, que son las únicas que la cosecha puede nombrar (se guarda con «ahora»).
  const alzasDeLaFinca = puedeGestionar ? await alzasDelApiario(user.userAccountId, apiaryId) : [];
  const alzasLibres = alzasDeLaFinca.filter((a) => a.lifecycleStatus === "active" && !a.puestaEn);
  const alzasPuestasAqui = puestos.filter((f) => f.hiveSuper).map((f) => ({ id: f.hiveSuperId!, code: f.hiveSuper!.code }));
```

(`puedeGestionar` ya existe en la página; si se declara más abajo que esta línea, mover estas tres líneas a después de su declaración.)

3. En la lista de `puestos` y en la de historia, después de `{f.hiveNode ? … : ""}`:

```tsx
                    {f.hiveSuper ? ` · ${f.hiveSuper.code}` : ""}
```

4. Dentro del bloque `{puedeGestionar ? ( <details> … </details> ) : …}` de artefactos, **antes** del `<details>` existente, envolver ambos en un fragmento y añadir:

```tsx
              <details>
                <summary>{t("alzaPonerMarcada")}</summary>
                {alzasLibres.length === 0 ? (
                  <p className="nn-muted">{t("alzaSinLibres")}</p>
                ) : (
                  <form action={ponerAlzaFormAction} className="nn-form">
                    <input type="hidden" name="hiveId" value={hive.id} />
                    <input type="hidden" name="apiaryId" value={apiaryId} />
                    <TimezoneOffsetField />
                    <div className="nn-field">
                      <label htmlFor="alza-cual">{t("alzaCual")}</label>
                      <select id="alza-cual" name="hiveSuperId" required defaultValue="">
                        <option value="" disabled />
                        {alzasLibres.map((a) => (
                          <option key={a.id} value={a.id}>{a.code}</option>
                        ))}
                      </select>
                    </div>
                    <div className="nn-field">
                      <label htmlFor="alza-cuando">{t("artefactoCuando")}</label>
                      <input id="alza-cuando" name="cuando" type="datetime-local" />
                    </div>
                    <BotonDeEnvio>{t("alzaPonerBoton")}</BotonDeEnvio>
                  </form>
                )}
              </details>
```

El formulario genérico de artefactos queda como está: poner «alza» ahí es un alza **sin marca**, con su cuenta. Ésa es la pregunta «¿tiene marca?» del spec §4.2, hecha con dos formularios en vez de un campo condicional.

5. En la línea del `HarvestForm`: `<HarvestForm colonyId={colony.id} alzas={alzasPuestasAqui} />`.

- [ ] **Step 5: `HarvestForm` con casillas**

En `app/components/apiary/HarvestForm.tsx`, la firma y, antes del campo de notas:

```tsx
export function HarvestForm({ colonyId, alzas = [] }: { colonyId: string; alzas?: { id: string; code: string }[] }) {
```

```tsx
      {alzas.length > 0 ? (
        <fieldset className="nn-field">
          <legend>{t("alzasCosechadas")}</legend>
          <p className="nn-muted">{t("alzasCosechadasAyuda")}</p>
          {alzas.map((a) => (
            <label key={a.id} style={{ display: "block" }}>
              <input type="checkbox" name="hiveSuperIds" value={a.id} /> {a.code}
            </label>
          ))}
        </fieldset>
      ) : null}
```

- [ ] **Step 6: Compuertas de la tarea**

```bash
npm run verify > $TMPDIR/v.txt 2>&1; echo "verify=$?"; tail -5 $TMPDIR/v.txt
npm run build > $TMPDIR/b.txt 2>&1; echo "build=$?"; grep -iE "error|failed" $TMPDIR/b.txt | head -5
```

Expected: `verify=0`, `build=0`. (`vitest` no comprueba tipos ni el `"use server"`; el build sí.)

- [ ] **Step 7: Verlo en el navegador**

`npm run dev:local` (puerto 3017, contra la copia local). En la ficha de un apiario: registrar «A-07», ver «en bodega». En una colmena de ese apiario: «Poner un alza con marca» → A-07 → aparece en artefactos como `Alza × 1 · A-07`. En la cosecha de esa colmena aparece la casilla A-07. Volver al apiario: «puesta en <colmena> desde …». Captura de pantalla para Daniel. Borrar lo creado después (es la copia local, pero no dejar basura TEST).

- [ ] **Step 8: Commit**

```bash
git add app/actions/apiary.ts "app/apiaries/[id]/page.tsx" "app/apiaries/[id]/hives/[hiveId]/page.tsx" app/components/apiary/HarvestForm.tsx messages/es.json messages/en.json
git diff --cached --stat
git commit -F $TMPDIR/msg.txt   # «alzas: registrarlas en el apiario, ponerlas en la colmena y nombrarlas en la cosecha»
```

---

### Task 5: Inventario, ADR, estado, flip-tests y PR

**Files:**
- Modify: `docs/arquitectura/inventario-de-acceso.md`, `docs/arquitectura/acceso-a-datos.allowlist.json`
- Modify: `docs/architecture/DECISIONS.md`, `SESSION_STATE.md`

- [ ] **Step 1: Las cifras del inventario las pone el script**

```bash
node scripts/inventario-de-acceso.mjs > $TMPDIR/inv.txt 2>&1; echo "inv=$?"; head -5 $TMPDIR/inv.txt
```

Poner en `docs/arquitectura/inventario-de-acceso.md` las dos cifras que imprime (total y «guardia directo»), con una nota como la de ADR-170: qué operaciones nuevas entran y por qué son guardia directo (`registrarAlza`, `ponerAlza`, `darDeBajaAlza`, `alzasDelApiario` llaman a `requireApiaryAccess` antes de tocar nada).

En `acceso-a-datos.allowlist.json`, dentro de `importan_cliente_total`, junto a `lib/apiary/nodos.ts`:

```json
    {
      "archivo": "lib/apiary/alzas.ts",
      "razon": "Módulo de dominio: alzas con marca (spec 2026-09-18 §4). Registrar, poner y dar de baja exigen `requireApiaryAccess` manage sobre el sitio o la colmena ANTES de escribir; listar, view. El alza tiene que ser de la finca de la colmena y estar activa; los cruces de intervalos se comprueban dentro de la transacción y el abierto lo sostiene un índice parcial. Escritura y AuditEvent en la MISMA transacción. El listado no nombra cajas de otro apiario."
    },
```

```bash
npx vitest run tests/arquitectura > $TMPDIR/a.txt 2>&1; echo "arq=$?"; grep -E "Tests |×" $TMPDIR/a.txt
```

Expected: `arq=0`.

- [ ] **Step 2: El ADR**

Número: el siguiente libre **en `origin/main`**, medido:

```bash
git fetch -q origin; git show origin/main:docs/architecture/DECISIONS.md | grep -o "^## ADR-[0-9]*" | sort -t- -k2 -n | tail -1
```

Al final de `docs/architecture/DECISIONS.md`:

```markdown
## ADR-NNN -- Un alza con marca se sigue de colmena en colmena; las sin marca se siguen contando

**Contexto.** El spec de artefactos del 2026-09-17 (§4) modeló las alzas sólo como cuenta:
«nadie numera las alzas en el patio». Daniel, el 2026-09-18: *«todavía no, pero se marcarán»*,
para saber de qué alza salió la miel, por dónde pasó y el inventario del equipo. Spec
`docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md` §4. Lo leído en manuales
latinoamericanos (SENASICA, SENASA) no pide identificar alzas: esto es gestión propia, no
trazabilidad obligatoria.

**Decisión.** Tabla `hive_super` (marca normalizada, única por finca, baja con fecha y motivo).
Ponerla en una colmena es un `hive_fitting` `alza` de cuenta 1 que apunta a ella, el patrón del
nodo de sensores; un índice parcial la deja abierta en una sola colmena y el servicio rechaza
solapes con intervalos cerrados. La cosecha nombra las alzas marcadas que estaban puestas ese día
(`apiary_harvest_super`). **La inspección que declara «quité el alza» ya no cierra las
marcadas**: no dice cuál, y cerrarlas escribiría una historia falsa.

**Desviación del spec.** La «ficha del alza» es un desplegable en la ficha del apiario, no una
ruta nueva.

**Lo que NO entra.** Los marcos por color de año (spec §5) y el año de las reinas (§5.4): cada
uno en su rebanada.
```

- [ ] **Step 3: El estado**

En `SESSION_STATE.md`, primera entrada de «2. Lo que se entregó»:

```markdown
### 2026-09-18 · Alzas con marca

ADR-NNN. Daniel: las alzas «se marcarán». Se registran en la ficha del apiario, se ponen en una
colmena como artefacto con marca y la cosecha dice cuáles salieron. Las sin marca se siguen
contando. La inspección que quita alzas ya no cierra las marcadas. Siguen: la cera por color de
año y el año de las reinas.
```

```bash
node scripts/check-state-budget.mjs; echo "budget=$?"
```

- [ ] **Step 4: Compuertas completas y commit**

```bash
npm run verify > $TMPDIR/v.txt 2>&1; echo "verify=$?"
npm run build > $TMPDIR/b.txt 2>&1; echo "build=$?"
bash scripts/ci.sh > $TMPDIR/ci.txt 2>&1; echo "ci=$?"; grep -E "Tests " $TMPDIR/ci.txt
npx vitest run tests/apiary/alzas.test.ts tests/apiary/artefactos.test.ts tests/apiary/nodo.test.ts tests/apiary/carencia.test.ts tests/arquitectura > $TMPDIR/t.txt 2>&1; echo "base=$?"; grep -E "Tests |×" $TMPDIR/t.txt
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > $TMPDIR/d.sql; echo "deriva=$(grep -v '^--' $TMPDIR/d.sql | grep -c '[A-Za-z]')"
```

Todo `=0`. Entonces:

```bash
git add docs/arquitectura/inventario-de-acceso.md docs/arquitectura/acceso-a-datos.allowlist.json docs/architecture/DECISIONS.md SESSION_STATE.md
git commit -F $TMPDIR/msg.txt
```

- [ ] **Step 5: Flip-tests, contra el commit**

Cada mutación sobre el archivo commiteado, con el arnés que imprime sha antes/después (distintos o aborta), si compila (`tsc`), y **qué prueba cae por su nombre**; restaura con `git checkout --` y al final `git status --porcelain` vacío.

| # | archivo | mutación | debe caer |
|---|---|---|---|
| 1 | `lib/apiary/alzas.ts` | quitar el `if (await tx.hiveFitting.count({ where: { hiveSuperId: alza.id, ...cruza } }))` | «NO SE PONE EN DOS COLMENAS…» |
| 2 | `lib/apiary/alzas.ts` | `cruza` sólo `{ removedAt: null }` | «NO SE PONE EN DOS COLMENAS…» (el solape cerrado) |
| 3 | `lib/apiary/alzas.ts` | quitar el `alza_de_otra_finca` | «NO SE PONE una dada de baja, ni una de otra finca…» |
| 4 | `lib/apiary/alzas.ts` | quitar el `alza_dada_de_baja` de `ponerAlza` | la misma |
| 5 | `lib/apiary/alzas.ts` | quitar `requireApiaryAccess` de `ponerAlza` | la misma (el `extrano`) |
| 6 | `lib/apiary/alzas.ts` | quitar el `alza_puesta` de `darDeBajaAlza` | «DAR DE BAJA pide motivo…» |
| 7 | `lib/apiary/alzas.ts` | `normalizarMarca` devuelve `code.trim()` | «SE REGISTRA NORMALIZADA…» |
| 8 | `lib/apiary/alzas.ts` | `aqui`/`identifier` sin el filtro de `locationId` | «EL LISTADO NO ENSEÑA…» |
| 9 | `lib/apiary/artefactos.ts` | quitar `hiveSuperId: null` de `cerrarAbiertosEn` | «LA INSPECCIÓN QUE QUITA ALZAS…» |
| 10 | `lib/apiary/harvest.ts` | quitar el `throw new ApiaryAccessError("alza_no_puesta_en_la_colmena")` | «DICE QUÉ ALZAS MARCADAS…» |

Si una no cae, o cae otra prueba, **no es un éxito**: o es equivalente (decir por qué, como ADR-170 #6) o falta la prueba (escribirla, commitear, repetir).

- [ ] **Step 6: Subir y PR**

```bash
git fetch -q origin; git rev-list --count HEAD..origin/main   # si >0: rebase, repetir Step 4
git ls-remote --heads origin <rama> | wc -l                     # 0 si es la primera vez
git push -u origin <rama>; echo "HEAD=$(git rev-parse HEAD)"; echo "UP  =$(git rev-parse @{u})"
git diff --name-only origin/main...HEAD                         # contar: lo que lleva el PR
```

PR con: qué entra, la tabla de flip-tests con lo que cayó, lo que NO entra, las compuertas. Esperar las seis comprobaciones sobre el sha exacto. **No fusionar sin el OK de Daniel.**
