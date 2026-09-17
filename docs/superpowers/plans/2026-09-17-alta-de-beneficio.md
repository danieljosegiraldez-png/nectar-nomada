# Alta de beneficio — plan de implementación

> **Para quien ejecute:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans`, tarea por tarea. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** que Daniel y un Farm Manager puedan dar de alta y editar un beneficio desde pantalla, con `beneficio` como tipo propio de ubicación, en vez de depender de un script.

**Arquitectura:** una `Location` de tipo `beneficio` colgada del `site` de la finca — el mismo patrón que `drying_facility`, no una entidad nueva. Un permiso nuevo `location:create_site` que se comprueba **sobre el sitio padre**, así que un Farm Manager sólo crea beneficios dentro de lo que ya gestiona. La pantalla es `/beneficio/ajustes`, primera sección del centro de configuración; las otras cuatro secciones llegan con el tablero.

**Stack:** Next.js 16 App Router, Server Actions, Prisma 7.9 sobre Postgres (esquema `core`), next-intl, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md` (PR #370)

**Antes de la Tarea 1:** este plan se commitea solo, como primer commit de la rama. El arnés de flip-test restaura desde `HEAD`, así que **nada se muta sin haber commiteado antes** — el 2026-09-09 eso costó 126 líneas sin commitear.

## Restricciones globales

- **El capataz no configura.** `location:create_site` va a Platform Admin (que recibe todos los permisos por construcción) y a **Farm Manager**, y **NO** a Farm Operator. Decisión de Daniel del 2026-09-17: «farm manager/owner quien puede crear o editar un beneficio, no un capataz».
- **Un beneficio sólo cuelga de un `site`.** Validado en el servidor, como `crearUbicacionDeSecado` valida sus pares.
- **Las instalaciones existentes no se mueven** ni se reasignan hacia atrás.
- **Auditoría en la misma transacción** que la escritura, con `recordAuditEvent(..., tx)` — lo exige `tests/arquitectura/audit-atomico.test.ts`, que lee la fuente.
- **`npm run build` en toda tarea que toque TypeScript**: `vitest` no comprueba tipos y `npm run verify` no corre `next build`.
- **Compuerta encadenada al commit, nunca canalizada:** `npm run build; test $? -eq 0 && git commit -F msg.txt`.
- **`git add` archivo por archivo**, y `git diff --cached --stat` antes de commitear: si el stat no dice lo que crees, parar.
- **Base de pruebas compartida** en `postgresql://postgres@127.0.0.1:55433/nectar_test`: no resetearla, otras sesiones la usan. Cada prueba limpia lo suyo en `afterEach`, con nombres `TEST-BEN-<uuid>`.
- **Prueba nueva con base ⇒ va al grupo `base-sembrada`** de `scripts/pruebas-por-compuerta.txt`, o CI la correrá sin base.

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` | el valor `beneficio` en `enum LocationType` |
| `prisma/migrations/20260917120000_beneficio_tipo_de_ubicacion/migration.sql` | `ALTER TYPE ... ADD VALUE` |
| `lib/rbac/catalog.ts` | el permiso nuevo y su concesión a Farm Manager |
| `lib/traceability/beneficios.ts` | servicio: crear, actualizar, listar, y sitios donde se puede crear |
| `app/actions/beneficios.ts` | la acción de servidor del formulario |
| `app/beneficio/ajustes/FormularioBeneficio.tsx` | el formulario (cliente) |
| `app/beneficio/ajustes/page.tsx` | la pantalla de ajustes, sección «el sitio» |
| `messages/es.json`, `messages/en.json` | namespace `Beneficio` |
| `scripts/rutas-declaradas.mjs` | declara `/beneficio/ajustes` |
| `docs/arquitectura/inventario-de-acceso.md` | cifras recalculadas por script |
| `tests/traceability/beneficios.test.ts` | pruebas con base: permisos, jerarquía, auditoría |
| `scripts/pruebas-por-compuerta.txt` | la prueba nueva en `base-sembrada` |
| `docs/architecture/DECISIONS.md` | el ADR del tipo y del permiso |

---

### Tarea 1: el tipo `beneficio` y el permiso

**Archivos:**
- Modificar: `prisma/schema.prisma` (`enum LocationType`, línea 643)
- Crear: `prisma/migrations/20260917120000_beneficio_tipo_de_ubicacion/migration.sql`
- Modificar: `lib/rbac/catalog.ts` (`PERMISSIONS` tras la línea 116; `Farm Manager` en la línea 343)
- Crear: `tests/traceability/beneficios.test.ts` (sólo el primer bloque)
- Modificar: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consume: nada.
- Produce: el valor `"beneficio"` de `LocationType`, y el permiso `location:create_site`.

- [ ] **Paso 1: escribir la prueba en rojo**

En `tests/traceability/beneficios.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";

describe("el tipo de ubicación beneficio", () => {
  it("existe en el enum de Postgres, y el control positivo es meliponary", async () => {
    const filas = await prisma.$queryRaw<{ valor: string }[]>`
      SELECT e.enumlabel AS valor
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'LocationType' AND n.nspname = 'core'
    `;
    const valores = filas.map((f) => f.valor);
    // Control positivo: si la consulta no ve el enum, esto también falla y el
    // veredicto de arriba no se lee como «el tipo falta».
    expect(valores).toContain("meliponary");
    expect(valores).toContain("beneficio");
  });
});

describe("el permiso de crear un sitio", () => {
  it("está en el catálogo", () => {
    expect(PERMISSIONS.some((p) => p.resourceType === "location" && p.action === "create_site")).toBe(true);
  });

  it("lo tiene Farm Manager y NO lo tiene Farm Operator", () => {
    const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre)!;
    const tiene = (nombre: string) =>
      perfil(nombre).permissions.some(([r, a]) => r === "location" && a === "create_site");
    expect(tiene("Farm Manager")).toBe(true);
    expect(tiene("Farm Operator")).toBe(false);
    // Control positivo del mismo lector: un permiso que el operario SÍ tiene.
    expect(perfil("Farm Operator").permissions.some(([r, a]) => r === "lot" && a === "manage")).toBe(true);
  });
});
```

- [ ] **Paso 2: correr y verla fallar por su nombre**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx vitest run tests/traceability/beneficios.test.ts
```

Esperado: **3 fallos**. El primero dice que `beneficio` no está en el enum; los otros dos, que el permiso no existe. Si dice «no tests», la base o el `DATABASE_URL` faltan: **eso no es verde**.

- [ ] **Paso 3: añadir el valor al enum**

En `prisma/schema.prisma`, dentro de `enum LocationType`, justo después de `meliponary` y antes de `drying_facility`:

```prisma
  /// El beneficio: donde se despulpa, fermenta, lava, seca y trilla. **Tipo
  /// propio y no un `site` con otro nombre**, por decisión de Daniel del
  /// 2026-09-17: sin tipo, nada distingue un beneficio de una finca salvo su
  /// nombre, y deducirlo del nombre es lo que este repositorio prohíbe.
  ///
  /// Mismo patrón que `drying_facility`: una Location con su tipo y su padre,
  /// NO una familia de entidades nueva. Cuelga del `site` de la finca, y un
  /// `Equipment` colocado ahí vive «en el beneficio» y no en la finca entera.
  beneficio
```

- [ ] **Paso 4: escribir la migración**

`prisma/migrations/20260917120000_beneficio_tipo_de_ubicacion/migration.sql`:

```sql
ALTER TYPE "core"."LocationType" ADD VALUE 'beneficio';
```

- [ ] **Paso 5: añadir el permiso al catálogo**

En `lib/rbac/catalog.ts`, en `PERMISSIONS`, inmediatamente después de la entrada `location:manage_attributes`:

```ts
  // Decisión de Daniel, 2026-09-17: crear un beneficio es de Farm Manager y
  // dueño, «no de un capataz». Va aparte de `manage_attributes` porque crear
  // un lugar nuevo no es editar los atributos de uno existente, y se comprueba
  // SOBRE EL SITIO PADRE: así una asignación estrecha no ensancha el acceso
  // (RBAC.md §3), y un Farm Manager de una finca no puede crear un beneficio
  // en otra. El precedente contrario es `crearSitioDeAbejas`, que exige alcance
  // de plataforma porque parte de ninguna ubicación.
  { resourceType: "location", action: "create_site", description: "Crear una ubicación nueva bajo un sitio que ya se gestiona — hoy, un beneficio." },
```

Y en el perfil `Farm Manager`, junto a `["location", "manage_attributes"]`:

```ts
      // El jefe de beneficio da de alta su beneficio; el operario no.
      ["location", "create_site"],
```

- [ ] **Paso 6: aplicar la migración a la base compartida y regenerar el cliente**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

Leer los nombres que imprime `migrate deploy`: tiene que aparecer `20260917120000_beneficio_tipo_de_ubicacion`. El `db:seed` es lo que mete el permiso nuevo en la base.

- [ ] **Paso 7: correr la prueba y verla pasar**

```bash
npx vitest run tests/traceability/beneficios.test.ts
```

Esperado: 3 en verde.

- [ ] **Paso 8: declarar la prueba en el carril con base**

En `scripts/pruebas-por-compuerta.txt`, en el grupo `# @grupo: base-sembrada`:

```
tests/traceability/beneficios.test.ts
```

Y comprobar que el carril hermético **no** la coge:

```bash
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "salida=$?"; grep -c 'beneficios.test.ts' /tmp/ci.txt
```

Esperado: `salida=0` y **0** apariciones.

- [ ] **Paso 9: compuerta y commit**

```bash
npm run build > /tmp/build.txt 2>&1; echo "build=$?"; tail -5 /tmp/build.txt
npm run verify > /tmp/verify.txt 2>&1; echo "verify=$?"; tail -5 /tmp/verify.txt
git add prisma/schema.prisma prisma/migrations/20260917120000_beneficio_tipo_de_ubicacion/migration.sql lib/rbac/catalog.ts tests/traceability/beneficios.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat
```

Cinco archivos, ni uno más. Mensaje en archivo, y commit sólo si las dos compuertas salieron 0.

---

### Tarea 2: el servicio

**Archivos:**
- Crear: `lib/traceability/beneficios.ts`
- Modificar: `tests/traceability/beneficios.test.ts` (segundo bloque)

**Interfaces:**
- Consume: `"beneficio"` de `LocationType`; `location:create_site`; `requireLocationAttributeAccess` y `LocationAccessError` de `lib/traceability/locations.ts`; `can` de `lib/rbac/service.ts`; `recordAuditEvent` de `lib/audit.ts`.
- Produce:
  - `class BeneficioError extends Error` (mensajes: `datos_invalidos`, `padre_invalido`, `tipo_invalido`)
  - `sitiosParaBeneficio(userAccountId: string): Promise<{ id: string; name: string }[]>` — lanza `LocationAccessError("no_location_attribute_access")` si ninguno
  - `listarBeneficios(userAccountId: string): Promise<{ id: string; name: string; sitio: { id: string; name: string } | null }[]>`
  - `crearBeneficio(userAccountId: string, input: { name: string; parentLocationId: string }): Promise<Location>`
  - `actualizarBeneficio(userAccountId: string, input: { locationId: string; name: string }): Promise<Location>`

- [ ] **Paso 1: escribir las pruebas en rojo**

Añadir a `tests/traceability/beneficios.test.ts` (los ayudantes copian la forma de `tests/traceability/instalaciones.test.ts`, incluido el `Scope` compartido y la limpieza por nombre reservado):

```ts
import { randomUUID } from "node:crypto";
import { afterEach, vi } from "vitest";
import * as audit from "../../lib/audit";
import { BeneficioError, actualizarBeneficio, crearBeneficio, listarBeneficios, sitiosParaBeneficio } from "../../lib/traceability/beneficios";
import { LocationAccessError } from "../../lib/traceability/locations";

const names: string[] = [];
function nombre() { const n = `TEST-BEN-${randomUUID()}`; names.push(n); return n; }

async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function parcela(parentLocationId: string) {
  return prisma.location.create({ data: { name: nombre(), locationType: "plot", classification: "internal", parentLocationId } });
}
async function cuenta(locationId: string | null, perfil: "Farm Manager" | "Farm Operator") {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Beneficio", displayName: personId } });
  const userAccountId = randomUUID();
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  if (locationId) {
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    // `Scope` es único por (tipo, referencia): dos cuentas sobre el MISMO sitio
    // lo comparten, y crearlo a ciegas rompe la prueba que necesita dos actores
    // sobre el mismo sitio. El `id` se pasa explícito, como en instalaciones.test.ts.
    const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
    const scope = existente ?? await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: locationId } });
    await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  }
  return userAccountId;
}

afterEach(async () => {
  vi.restoreAllMocks();
  const rows = await prisma.location.findMany({ where: { name: { in: names } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: { entityType: "location", entityId: { in: ids } } });
  // Los hijos primero: parentLocationId es RESTRICT.
  await prisma.location.deleteMany({ where: { parentLocationId: { in: ids } } });
  await prisma.location.deleteMany({ where: { id: { in: ids } } });
  names.length = 0;
});

describe("crearBeneficio", () => {
  it("un Farm Manager lo crea bajo el sitio que gestiona", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    expect(ben.locationType).toBe("beneficio");
    expect(ben.parentLocationId).toBe(finca.id);
    expect(ben.organizationId).toBe(finca.organizationId);
    expect(ben.classification).toBe(finca.classification);
  });

  it("un capataz NO puede, aunque gestione el sitio", async () => {
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(crearBeneficio(capataz, { name: nombre(), parentLocationId: finca.id }))
      .rejects.toThrow(LocationAccessError);
    // Control positivo: el capataz SÍ ve los atributos del sitio, así que la
    // negativa de arriba es del permiso nuevo y no de no tener acceso a nada.
    await expect(sitiosParaBeneficio(capataz)).rejects.toThrow(LocationAccessError);
  });

  it("un Farm Manager de otra finca NO puede crear aquí", async () => {
    const mia = await sitio();
    const ajena = await sitio();
    const jefeAjeno = await cuenta(ajena.id, "Farm Manager");
    await expect(crearBeneficio(jefeAjeno, { name: nombre(), parentLocationId: mia.id }))
      .rejects.toThrow(LocationAccessError);
    // Control positivo: en SU finca sí puede.
    const suyo = await crearBeneficio(jefeAjeno, { name: nombre(), parentLocationId: ajena.id });
    expect(suyo.locationType).toBe("beneficio");
  });

  it("no cuelga de una parcela", async () => {
    const finca = await sitio();
    const lote = await parcela(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearBeneficio(jefe, { name: nombre(), parentLocationId: lote.id }))
      .rejects.toThrow(new BeneficioError("padre_invalido"));
  });

  it("rechaza un nombre vacío o de más de 120 caracteres", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearBeneficio(jefe, { name: "   ", parentLocationId: finca.id }))
      .rejects.toThrow(new BeneficioError("datos_invalidos"));
    await expect(crearBeneficio(jefe, { name: "x".repeat(121), parentLocationId: finca.id }))
      .rejects.toThrow(new BeneficioError("datos_invalidos"));
  });

  it("escribe la auditoría en la MISMA transacción: si falla, no queda beneficio", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const n = nombre();
    vi.spyOn(audit, "recordAuditEvent").mockRejectedValueOnce(new Error("auditoría caída"));
    await expect(crearBeneficio(jefe, { name: n, parentLocationId: finca.id })).rejects.toThrow("auditoría caída");
    expect(await prisma.location.findFirst({ where: { name: n } })).toBeNull();
  });
});

describe("actualizarBeneficio", () => {
  it("renombra, y no acepta una ubicación que no es beneficio", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    const nuevo = nombre();
    expect((await actualizarBeneficio(jefe, { locationId: ben.id, name: nuevo })).name).toBe(nuevo);
    await expect(actualizarBeneficio(jefe, { locationId: finca.id, name: nombre() }))
      .rejects.toThrow(new BeneficioError("tipo_invalido"));
  });
});

describe("listarBeneficios", () => {
  it("devuelve los del sitio con su sitio padre", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    const lista = await listarBeneficios(jefe);
    const fila = lista.find((b) => b.id === ben.id)!;
    expect(fila.sitio).toEqual({ id: finca.id, name: finca.name });
  });
});
```

- [ ] **Paso 2: correr y verlas fallar**

```bash
npx vitest run tests/traceability/beneficios.test.ts
```

Esperado: fallan por módulo inexistente (`lib/traceability/beneficios`). Las 3 de la Tarea 1 siguen en verde.

- [ ] **Paso 3: escribir el servicio**

`lib/traceability/beneficios.ts`:

```ts
import { prisma } from "../db";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import { LocationAccessError, puedeGestionarAtributosDeUbicacion, requireLocationAttributeAccess } from "./locations";

export class BeneficioError extends Error {}

/**
 * Crear un lugar nuevo no es editar uno existente, así que exige los DOS
 * permisos sobre el sitio padre: `manage_attributes` —que ya gobierna el árbol
 * de ubicaciones— y `location:create_site`, que es el que el capataz no tiene.
 *
 * Se comprueba sobre el PADRE a propósito: es lo que impide que un Farm Manager
 * de una finca cree un beneficio en otra, sin escribir una segunda regla de
 * visibilidad que derivaría de la que de verdad gobierna.
 */
async function exigePoderCrearBajo(userAccountId: string, parentLocationId: string) {
  await requireLocationAttributeAccess(userAccountId, parentLocationId);
  const padre = await prisma.location.findUniqueOrThrow({
    where: { id: parentLocationId },
    select: { id: true, name: true, locationType: true, organizationId: true, classification: true, timezone: true },
  });
  const target = { scopeType: "location" as const, scopeRefId: padre.id };
  if (!(await can(userAccountId, "create_site", "location", target, padre.classification))) {
    throw new LocationAccessError("no_location_create_access");
  }
  return padre;
}

function exigeNombre(name: string) {
  const limpio = name.trim();
  if (!limpio || limpio.length > 120) throw new BeneficioError("datos_invalidos");
  return limpio;
}

/** Los sitios donde quien mira puede crear un beneficio. La negativa es un fallo explícito, no una lista vacía. */
export async function sitiosParaBeneficio(userAccountId: string) {
  const sitios = await prisma.location.findMany({ where: { locationType: "site" }, orderBy: { name: "asc" } });
  const permitidos: { id: string; name: string }[] = [];
  for (const s of sitios) {
    const target = { scopeType: "location" as const, scopeRefId: s.id };
    if (await can(userAccountId, "manage_attributes", "location", target, s.classification)
      && await can(userAccountId, "create_site", "location", target, s.classification)) {
      permitidos.push({ id: s.id, name: s.name });
    }
  }
  if (!permitidos.length) throw new LocationAccessError("no_location_attribute_access");
  return permitidos;
}

export async function listarBeneficios(userAccountId: string) {
  const rows = await prisma.location.findMany({ where: { locationType: "beneficio" }, orderBy: { name: "asc" } });
  const salida: { id: string; name: string; sitio: { id: string; name: string } | null }[] = [];
  for (const row of rows) {
    const target = { scopeType: "location" as const, scopeRefId: row.id };
    if (!(await can(userAccountId, "manage_attributes", "location", target, row.classification))) continue;
    // El permiso sobre el hijo no concede el nombre del padre — misma regla y el
    // mismo ayudante que `detalleInstalacion`, que resuelve la clasificación DEL
    // PADRE en vez de reusar la del hijo (reusarla juzgaría con la etiqueta
    // equivocada en cuanto las dos difieran).
    const padre = row.parentLocationId
      && await puedeGestionarAtributosDeUbicacion(userAccountId, row.parentLocationId)
      ? await prisma.location.findUnique({ where: { id: row.parentLocationId }, select: { id: true, name: true } })
      : null;
    salida.push({ id: row.id, name: row.name, sitio: padre });
  }
  return salida;
}

export async function crearBeneficio(userAccountId: string, input: { name: string; parentLocationId: string }) {
  const padre = await exigePoderCrearBajo(userAccountId, input.parentLocationId);
  if (padre.locationType !== "site") throw new BeneficioError("padre_invalido");
  const name = exigeNombre(input.name);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.create({ data: {
      name, locationType: "beneficio", parentLocationId: padre.id,
      organizationId: padre.organizationId, classification: padre.classification,
      timezone: padre.timezone, createdBy: userAccountId,
    } });
    await recordAuditEvent({
      actorUserAccountId: userAccountId, operation: "location.create_beneficio",
      entityType: "location", entityId: after.id, after, sourceInterface: "traceability.service",
    }, tx);
    return after;
  });
}

export async function actualizarBeneficio(userAccountId: string, input: { locationId: string; name: string }) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  const before = await prisma.location.findUniqueOrThrow({ where: { id: input.locationId } });
  if (before.locationType !== "beneficio") throw new BeneficioError("tipo_invalido");
  const name = exigeNombre(input.name);
  return prisma.$transaction(async (tx) => {
    const after = await tx.location.update({ where: { id: before.id }, data: { name } });
    await recordAuditEvent({
      actorUserAccountId: userAccountId, operation: "location.update_beneficio",
      entityType: "location", entityId: after.id, before, after, sourceInterface: "traceability.service",
    }, tx);
    return after;
  });
}
```

- [ ] **Paso 4: correr las pruebas**

```bash
npx vitest run tests/traceability/beneficios.test.ts
```

Esperado: todas en verde. Si `no_location_create_access` no existe como mensaje aceptado por `LocationAccessError`, es una cadena libre: no hace falta declararla en ningún sitio.

- [ ] **Paso 5: contar la basura que dejó la corrida**

```bash
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx prisma db execute --stdin <<'SQL'
SELECT count(*) FROM core.location WHERE name LIKE 'TEST-BEN-%';
SQL
```

Esperado: **0**. Si no, el `afterEach` no cierra y hay que arreglarlo antes de seguir — la base es compartida.

- [ ] **Paso 6: compuerta y commit**

```bash
npm run build > /tmp/build.txt 2>&1; echo "build=$?"; tail -5 /tmp/build.txt
git add lib/traceability/beneficios.ts tests/traceability/beneficios.test.ts
git diff --cached --stat
```

Dos archivos. Commit con `-F` si `build=0`.

---

### Tarea 3: la pantalla de ajustes

**Archivos:**
- Crear: `app/actions/beneficios.ts`, `app/beneficio/ajustes/FormularioBeneficio.tsx`, `app/beneficio/ajustes/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`, `scripts/rutas-declaradas.mjs`, `docs/arquitectura/inventario-de-acceso.md`

**Interfaces:**
- Consume: `crearBeneficio`, `actualizarBeneficio`, `listarBeneficios`, `sitiosParaBeneficio`, `BeneficioError` de la Tarea 2; `getCurrentUser` de `lib/auth/session`; `BotonDeEnvio` de `app/components/BotonDeEnvio`.
- Produce: la ruta `/beneficio/ajustes` y `guardarBeneficioFormAction(state, form)`.

- [ ] **Paso 1: la acción de servidor**

`app/actions/beneficios.ts` — **sólo funciones `async` exportadas**; una clase exportada en un archivo `"use server"` rompe el build entero (lo vigila `tests/arquitectura/use-server-solo-async.test.ts`):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { BeneficioError, actualizarBeneficio, crearBeneficio } from "../../lib/traceability/beneficios";
import { LocationAccessError } from "../../lib/traceability/locations";

export type BeneficioFormState = { error?: string };

export async function guardarBeneficioFormAction(_state: BeneficioFormState, form: FormData): Promise<BeneficioFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const name = String(form.get("name") ?? "");
    const locationId = String(form.get("locationId") ?? "");
    if (locationId) {
      await actualizarBeneficio(user.userAccountId, { locationId, name });
    } else {
      await crearBeneficio(user.userAccountId, { name, parentLocationId: String(form.get("parentLocationId") ?? "") });
    }
  } catch (error) {
    if (error instanceof LocationAccessError) return { error: "sin_acceso" };
    if (error instanceof BeneficioError) return { error: error.message };
    throw error;
  }
  revalidatePath("/beneficio/ajustes");
  redirect("/beneficio/ajustes?ok=guardado");
}
```

- [ ] **Paso 2: el formulario**

`app/beneficio/ajustes/FormularioBeneficio.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { guardarBeneficioFormAction } from "../../actions/beneficios";
import { BotonDeEnvio } from "../../components/BotonDeEnvio";

type Props = {
  padres?: { id: string; name: string }[];
  existente?: { id: string; name: string };
};
export function FormularioBeneficio({ padres, existente }: Props) {
  const t = useTranslations("Beneficio");
  const [state, action] = useActionState(guardarBeneficioFormAction, {});
  return <form action={action}>
    {state.error && <p role="alert">{t(`error_${state.error}`)}</p>}
    {existente && <input type="hidden" name="locationId" value={existente.id} />}
    {padres && <label>{t("sitio")}<select name="parentLocationId" required defaultValue="">
      <option value="" disabled>{t("sinSeleccion")}</option>
      {padres.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select></label>}
    <label>{t("nombre")}<input name="name" required maxLength={120} defaultValue={existente?.name ?? ""} /></label>
    <BotonDeEnvio>{t(existente ? "guardar" : "crear")}</BotonDeEnvio>
  </form>;
}
```

- [ ] **Paso 3: la pantalla**

`app/beneficio/ajustes/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { listarBeneficios, sitiosParaBeneficio } from "../../../lib/traceability/beneficios";
import { LocationAccessError } from "../../../lib/traceability/locations";
import { FormularioBeneficio } from "./FormularioBeneficio";

export const dynamic = "force-dynamic";
export default async function AjustesDelBeneficioPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Beneficio");
  let sitios;
  try { sitios = await sitiosParaBeneficio(user.userAccountId); }
  catch (error) {
    if (!(error instanceof LocationAccessError)) throw error;
    // Quien no puede configurar no ve la pantalla: 404, como `/equipos/[id]`.
    // Una página vacía diría qué hay dentro. `notFound()` devuelve `never`, así
    // que TypeScript sabe que `sitios` está definido a partir de aquí.
    notFound();
  }
  const beneficios = await listarBeneficios(user.userAccountId);
  return <div>
    <h1>{t("ajustesTitulo")}</h1>
    <p className="nn-muted">{t("ajustesIntro")}</p>
    <h2>{t("misBeneficios")}</h2>
    {!beneficios.length && <p>{t("sinBeneficios")}</p>}
    {beneficios.map((b) => <section key={b.id}>
      <h3>{b.name}</h3>
      <p className="nn-muted">{b.sitio ? t("enSitio", { sitio: b.sitio.name }) : t("sitioNoVisible")}</p>
      <details><summary>{t("renombrar")}</summary>
        <FormularioBeneficio existente={{ id: b.id, name: b.name }} />
      </details>
    </section>)}
    <h2>{t("crear")}</h2>
    <FormularioBeneficio padres={sitios} />
    <p><Link href="/lots">← {t("volverALotes")}</Link></p>
  </div>;
}
```

- [ ] **Paso 4: los textos**

En `messages/es.json`, namespace nuevo `"Beneficio"`:

```json
  "Beneficio": {
    "ajustesTitulo": "Ajustes del beneficio",
    "ajustesIntro": "Configuración: el beneficio como lugar. Las capacidades, los equipos y las recetas llegan aquí cuando exista el tablero.",
    "misBeneficios": "Beneficios",
    "sinBeneficios": "Todavía no hay ninguno.",
    "enSitio": "En {sitio}",
    "sitioNoVisible": "Su sitio no está a tu alcance.",
    "crear": "Crear un beneficio",
    "renombrar": "Cambiar el nombre",
    "guardar": "Guardar",
    "sitio": "Sitio",
    "sinSeleccion": "Elige un sitio",
    "nombre": "Nombre",
    "volverALotes": "Volver a lotes",
    "error_sin_acceso": "No tienes permiso para configurar un beneficio aquí.",
    "error_datos_invalidos": "El nombre es obligatorio y no puede pasar de 120 caracteres.",
    "error_padre_invalido": "Un beneficio cuelga de un sitio, no de una parcela ni de otra instalación.",
    "error_tipo_invalido": "Esa ubicación no es un beneficio."
  },
```

En `messages/en.json`, las mismas claves traducidas:

```json
  "Beneficio": {
    "ajustesTitulo": "Mill settings",
    "ajustesIntro": "Configuration: the mill as a place. Capacities, equipment and recipes arrive here once the dashboard exists.",
    "misBeneficios": "Mills",
    "sinBeneficios": "None yet.",
    "enSitio": "At {sitio}",
    "sitioNoVisible": "Its site is outside your access.",
    "crear": "Create a mill",
    "renombrar": "Rename",
    "guardar": "Save",
    "sitio": "Site",
    "sinSeleccion": "Choose a site",
    "nombre": "Name",
    "volverALotes": "Back to lots",
    "error_sin_acceso": "You do not have permission to configure a mill here.",
    "error_datos_invalidos": "The name is required and cannot exceed 120 characters.",
    "error_padre_invalido": "A mill hangs from a site, not from a plot or another facility.",
    "error_tipo_invalido": "That location is not a mill."
  },
```

Comprobar que los dos siguen siendo JSON válido:

```bash
node -e 'for (const f of ["messages/es.json","messages/en.json"]) { const j = require("./"+f); if (!j.Beneficio) throw new Error("falta Beneficio en "+f); console.log(f, Object.keys(j.Beneficio).length, "claves"); }'
```

Esperado: **17 claves en cada uno**. Si los números no coinciden entre sí, falta una traducción.

- [ ] **Paso 5: declarar la ruta**

En `scripts/rutas-declaradas.mjs`, junto a las de `/instalaciones`:

```js
  "/beneficio/ajustes": { clase: "requiere-sesion", razon: "Configuración del beneficio, separada de la operación: exige location:manage_attributes y location:create_site sobre el sitio padre, comprobados también por el servicio; sin permiso da 404, no una página vacía." },
```

- [ ] **Paso 6: recalcular el inventario de acceso**

```bash
node scripts/inventario-de-acceso.mjs
```

Escribir en `docs/arquitectura/inventario-de-acceso.md` las cifras que imprime — **no las de antes sumadas a mano** — y correr su guardia:

```bash
npx vitest run tests/arquitectura/cifras-del-inventario.test.ts tests/inventario-de-rutas.test.ts
```

- [ ] **Paso 7: compuerta completa**

```bash
npm run build > /tmp/build.txt 2>&1; echo "build=$?"; tail -5 /tmp/build.txt
npm run verify > /tmp/verify.txt 2>&1; echo "verify=$?"; tail -5 /tmp/verify.txt
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "ci=$?"
```

Los tres en 0.

- [ ] **Paso 8: commit**

```bash
git add app/actions/beneficios.ts app/beneficio/ajustes/FormularioBeneficio.tsx app/beneficio/ajustes/page.tsx messages/es.json messages/en.json scripts/rutas-declaradas.mjs docs/arquitectura/inventario-de-acceso.md
git diff --cached --stat
```

Siete archivos. Commit con `-F` si las tres compuertas salieron 0.

---

### Tarea 4: el ADR y el flip-test del conjunto

**Archivos:**
- Modificar: `docs/architecture/DECISIONS.md`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: el ADR que deja escrito el tipo y el permiso.

- [ ] **Paso 1: flip-test 1 — el permiso al capataz**

Commitear primero (el arnés restaura desde HEAD). Editar `lib/rbac/catalog.ts` y añadir `["location", "create_site"]` al perfil **Farm Operator**. Imprimir antes del veredicto:

```bash
shasum lib/rbac/catalog.ts
npx tsc --noEmit > /tmp/tsc.txt 2>&1; echo "compila=$?"
npx vitest run tests/traceability/beneficios.test.ts 2>&1 | grep -E '✓|×|FAIL' | head -20
shasum lib/rbac/catalog.ts
git checkout -- lib/rbac/catalog.ts
```

Esperado: los dos `shasum` **distintos**, `compila=0`, y cae **por su nombre** `un capataz NO puede, aunque gestione el sitio`. Si cae otra, el guardia no cubre lo que se cree.

- [ ] **Paso 2: flip-test 2 — no comprobar el padre**

Editar `lib/traceability/beneficios.ts` y quitar la comprobación de `can(..., "create_site", ...)` dentro de `exigePoderCrearBajo`. Mismo arnés que el paso 1.

Esperado: sha distinto, `compila=0`, y caen `un capataz NO puede…` y `un Farm Manager de otra finca NO puede crear aquí`. Restaurar.

- [ ] **Paso 3: flip-test 3 — la auditoría fuera de la transacción**

Editar `crearBeneficio` para llamar a `recordAuditEvent(...)` **sin** el `tx` y después de la transacción. Mismo arnés.

Esperado: sha distinto, `compila=0`, y cae `escribe la auditoría en la MISMA transacción…`. Restaurar, y comprobar el árbol: `git status --porcelain` tiene que salir **vacío**.

- [ ] **Paso 4: escribir el ADR**

Medir el número, no suponerlo:

```bash
grep -o -E 'ADR-[0-9]{3}' docs/architecture/DECISIONS.md | sort -u | tail -1
```

Y al final de `docs/architecture/DECISIONS.md`, con `NNN` sustituido por el siguiente:

```markdown
## ADR-NNN — `beneficio` es un tipo de ubicación, y crear un sitio es del jefe

**Estado: aceptado, construido.** Decisiones de Daniel del 2026-09-17, en conversación.

**Contexto.** Hasta hoy un beneficio sólo podía ser una `Location` de tipo
`site`, así que **nada lo distinguía de una finca o una bodega salvo su
nombre** — y deducir el dominio del nombre es exactamente lo que este
repositorio prohíbe en otras cuatro secciones. Consecuencia práctica: un
`Equipment` se coloca en un sitio, así que un fermentador vivía «en Finca
Rosina» y ninguna pantalla podía decir qué hay **en el beneficio**.

**Decisión 1: tipo propio, hijo del `site`.** `LocationType.beneficio`, mismo
patrón que `drying_facility` y `drying_bed`: una `Location` con su tipo y su
padre, **no una familia de entidades nueva**. Sigue el precedente de
`meliponary`, que Daniel separó el 2026-09-16 con el mismo argumento — cuando
el manejo cambia, el tipo es propio. Una `drying_facility` puede seguir
colgando del `site` **o** del `beneficio`; **las existentes no se reasignan
hacia atrás**: donde están es donde alguien las puso.

**Decisión 2: `location:create_site`, y el capataz no lo tiene.** Crear un
lugar nuevo no es editar los atributos de uno existente, así que no se pliega
en `location:manage_attributes`. Se concede a Platform Admin —que recibe todos
los permisos por construcción— y a **Farm Manager**. Se **excluye
deliberadamente** de Farm Operator: palabras de Daniel, «farm manager/owner
quien puede crear o editar un beneficio, no un capataz». Es la misma forma de
exclusión explícita que ya usa Farm Manager con `lot:override_balance`.

**Decisión 3: se comprueba sobre el sitio padre.** `crearBeneficio` exige
`manage_attributes` **y** `create_site` sobre el padre, no sobre la plataforma.
Eso es lo que impide que un Farm Manager de una finca cree un beneficio en
otra, y lo hace con el mecanismo de asignaciones que ADR-144 ya define, sin una
segunda regla de visibilidad escrita a mano que derivaría de la primera.

**El precedente contrario, y por qué no se sigue aquí.** `crearSitioDeAbejas`
exige alcance de plataforma (`apiary_create_needs_platform_scope`) porque un
apiario puede nacer sin padre y entonces no hay de quién heredar el acceso. Un
beneficio **siempre** nace bajo un sitio, así que el padre es un sujeto real
para el permiso. Un beneficio suelto, sin finca, queda fuera de alcance.

**Consecuencia.** La pantalla es `/beneficio/ajustes`, primera sección del
centro de configuración que
`docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md` describe.
Las otras cuatro —capacidades, equipos, instalaciones y recetas— llegan con el
tablero del beneficio, porque una capacidad declarada sin dónde leerse no sirve
de nada. Sin permiso, la ruta responde **404** y no una página vacía, como ya
hace `/equipos/[id]`.
```

- [ ] **Paso 5: compuerta, commit y PR**

```bash
npm run build > /tmp/build.txt 2>&1; echo "build=$?"
npm run verify > /tmp/verify.txt 2>&1; echo "verify=$?"
git add docs/architecture/DECISIONS.md
git diff --cached --stat
```

Después del commit, **antes de abrir el PR**, contar lo que el PR lleva con tres puntos:

```bash
git diff --name-only origin/main...HEAD
git log origin/main..HEAD --oneline
```

Esperado: **15 archivos** y 4 commits. Si aparecen archivos que nadie tocó, parar: la rama nació sobre trabajo ajeno.

Abrir el PR con `gh pr create --body-file`, y después leer del servidor qué archivos lleva:

```bash
gh pr view <n> -R danieljosegiraldez-png/nectar-nomada --json files --jq '.files | map(.path)'
```

**No fusionar:** la fusión y el despliegue los decide Daniel, y falta el recorrido en navegador con él.

---

## Verificación final, antes de decir que está hecho

- [ ] `npm run build` = 0, `npm run verify` = 0, `bash scripts/ci.sh` = 0, y `npx vitest run tests/traceability/beneficios.test.ts` en verde con base.
- [ ] `SELECT count(*) FROM core.location WHERE name LIKE 'TEST-BEN-%'` = **0**.
- [ ] Los tres flip-tests con sus tres cosas: sha distinto, compila, y el test que cae **nombrado**.
- [ ] `git status --porcelain` vacío al terminar.
- [ ] El recorrido en navegador con Daniel: entra a `/beneficio/ajustes`, crea el beneficio de su finca, lo renombra, y comprueba en la base que hay **dos** filas de auditoría —`location.create_beneficio` y `location.update_beneficio`— para esa ubicación. Y que una cuenta de capataz recibe 404.
