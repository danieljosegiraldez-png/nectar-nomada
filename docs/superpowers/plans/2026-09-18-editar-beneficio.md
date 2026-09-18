# «Editar beneficio»: el permiso y los caminos de la ficha — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un capataz (Farm Operator) no pueda editar un beneficio salvo que se le conceda `location:edit_beneficio`, cerrando los cuatro caminos de la ficha por los que hoy lo edita.

**Architecture:** Un permiso nuevo en el catálogo, de serie para Farm Manager y Platform Admin y excluido de Farm Operator. Una sola función, `exigeEditarBeneficioSiLoEs`, en `lib/traceability/locations.ts`, que no hace nada si la ubicación no es un beneficio y exige el permiso si lo es; se llama desde cada escritura. La concesión por persona ya funciona vía `AssignmentPermissionOverride` (lo resuelve `can()`), así que este plan la prueba escribiendo el override directamente; la pantalla para concederla es el plan 3.

**Tech Stack:** Next.js 16, Prisma 7.9 sobre Postgres, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md` (rama `spec/ajustes-del-beneficio`, PR #370), §2 (decisiones del 2026-09-18), §4.2 (tabla de caminos), §4.3 (permisos), §6, §7 paso 3.

## Global Constraints

- El capataz edita un beneficio **sólo si se le concede**; por defecto **no** (Daniel, 2026-09-18).
- `location:edit_beneficio` va **aparte** de `location:create_site`: conceder editar no da crear.
- La regla es sobre **escrituras**, comprobada en el servicio, no en la pantalla.
- **Operar sigue abierto** al capataz: nada de este plan toca lecturas, mediciones, lotes ni jornadas.
- Parcelas y sitios **no cambian**: el capataz sigue editando los atributos de una parcela.
- Worktree `~/Developer/nectar-worktrees/editar-beneficio`, rama `editar-beneficio`, nacida de `origin/main` = `1192af6`.
- Base de pruebas compartida: `postgresql://postgres@127.0.0.1:55433/nectar_test`. **Nunca `reset`.** El seed sí: son upserts.
- Cada commit con `git commit -F <archivo>`, escenificando archivo por archivo y contando `git diff --cached --stat`.
- Nunca canalizar una compuerta: `cmd > /tmp/x.txt 2>&1; echo "salida=$?"`.

## Fuera de este plan

- **Plan 2:** instalaciones, camas, equipos y recetas detrás del mismo permiso (§4.2 filas 1 y 2).
- **Plan 3:** la delegación estrecha desde `/beneficio/ajustes` (§4.3, «Cómo se concede»).
- El enlace a Recetas del índice `/beneficio` visible a quien sólo lee lotes: arreglo aparte, su propio PR.

## Mapa de archivos

| archivo | qué cambia |
|---|---|
| `lib/rbac/catalog.ts` | el permiso y su asignación a Farm Manager |
| `lib/traceability/locations.ts` | `exigeEditarBeneficioSiLoEs` (nueva, exportada); llamada en `updateLocationAttributes`; `createMicrolot` rechaza un padre beneficio |
| `lib/traceability/coordenadasDelSitio.ts` | llamada en `confirmarCoordenadasDelSitio` |
| `lib/traceability/beneficios.ts` | `actualizarBeneficio` exige el permiso nuevo en vez de `create_site` |
| `tests/traceability/editarBeneficio.test.ts` | **nuevo**, con base |
| `scripts/pruebas-por-compuerta.txt` | la prueba nueva en `base-sembrada` |
| `docs/architecture/DECISIONS.md` | ADR nuevo |
| `docs/arquitectura/inventario-de-acceso.md` | cifras regeneradas si cambian |

---

### Task 1: El permiso en el catálogo

**Files:**
- Modify: `lib/rbac/catalog.ts` (tras la entrada de `create_site`, ~línea 125; y en el perfil Farm Manager, ~línea 354)
- Create: `tests/traceability/editarBeneficio.test.ts`
- Modify: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produces: la clave de permiso `location:edit_beneficio` (resourceType `"location"`, action `"edit_beneficio"`), presente en la base tras `npm run db:seed`.

- [ ] **Step 1: Escribir la prueba que falla**

Crear `tests/traceability/editarBeneficio.test.ts` con este contenido completo (las tareas siguientes le añaden `describe`s al final):

```ts
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";

/**
 * «Editar beneficio» — spec #370 §4.3. Por defecto el capataz NO edita un
 * beneficio; lo hace sólo si el Farm Manager o el dueño se lo conceden
 * (Daniel, 2026-09-18). La regla es sobre escrituras: cada camino de la ficha
 * se prueba por su cuenta, con su control positivo.
 */

describe("el permiso de editar un beneficio", () => {
  it("está en el catálogo, aparte de create_site", () => {
    const acciones = PERMISSIONS.filter((p) => p.resourceType === "location").map((p) => p.action);
    expect(acciones).toContain("edit_beneficio");
    // Control positivo del mismo lector: el permiso hermano sí está.
    expect(acciones).toContain("create_site");
  });

  it("lo tiene Farm Manager y NO lo tiene Farm Operator", () => {
    const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre)!;
    const tiene = (nombre: string, accion: string) =>
      perfil(nombre).permissions.some(([r, a]) => r === "location" && a === accion);
    expect(tiene("Farm Manager", "edit_beneficio")).toBe(true);
    expect(tiene("Farm Operator", "edit_beneficio")).toBe(false);
    // Control positivo: el operario SÍ tiene manage_attributes, que es
    // justo lo que hoy le deja editar el beneficio.
    expect(tiene("Farm Operator", "manage_attributes")).toBe(true);
  });

  it("está sembrado en la base", async () => {
    const fila = await prisma.permission.findFirst({ where: { resourceType: "location", action: "edit_beneficio" } });
    expect(fila).not.toBeNull();
  });
});
```

- [ ] **Step 2: Declarar la prueba en el carril con base**

En `scripts/pruebas-por-compuerta.txt`, justo debajo de la línea `tests/traceability/beneficios.test.ts`, añadir:

```
tests/traceability/editarBeneficio.test.ts
```

- [ ] **Step 3: Correrla y verla fallar por la razón correcta**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx vitest run tests/traceability/editarBeneficio.test.ts > /tmp/eb1.txt 2>&1; echo "salida=$?"; grep -E 'Tests |×|✓' /tmp/eb1.txt
```

Expected: salida 1; **caen las tres** — las dos primeras con `expected [...] to contain 'edit_beneficio'` / `expected false to be true`, la tercera con `expected null not to be null`. Si dice «no tests», falta `DATABASE_URL`: no es un rojo válido.

- [ ] **Step 4: Añadir el permiso**

En `lib/rbac/catalog.ts`, justo después de la entrada de `create_site`:

```ts
  // Decisión de Daniel, 2026-09-18 (spec #370 §4.3): el capataz edita un
  // beneficio SÓLO si se le concede; por defecto no. Va aparte de
  // `create_site` porque son dos autoridades: conceder a un capataz que edite
  // no le da crear beneficios nuevos. Y aparte de `manage_attributes`, que el
  // operario sí tiene y que es justo lo que hasta hoy le dejaba editar el
  // beneficio por la acción de atributos y la de coordenadas.
  { resourceType: "location", action: "edit_beneficio", description: "Editar un beneficio: su ficha, atributos y coordenadas. De serie para Farm Manager; a un Farm Operator sólo por concesión." },
```

Y en el perfil `Farm Manager`, justo después de `["location", "create_site"],`:

```ts
      // …y lo edita. El operario no, salvo concesión por persona.
      ["location", "edit_beneficio"],
```

Platform Admin no se toca: su lista es `PERMISSIONS.map(...)` y lo recibe solo.

- [ ] **Step 5: Sembrar la base de pruebas**

```bash
npm run db:seed > /tmp/eb-seed.txt 2>&1; echo "seed=$?"; tail -3 /tmp/eb-seed.txt
```

Expected: `seed=0`. Son upserts por clave natural; no borra nada de nadie.

- [ ] **Step 6: Correr la prueba y verla pasar**

```bash
npx vitest run tests/traceability/editarBeneficio.test.ts > /tmp/eb1.txt 2>&1; echo "salida=$?"; grep -E 'Tests ' /tmp/eb1.txt
```

Expected: salida 0, `Tests  3 passed (3)`.

- [ ] **Step 7: Commit**

```bash
git add lib/rbac/catalog.ts tests/traceability/editarBeneficio.test.ts scripts/pruebas-por-compuerta.txt
git diff --cached --stat   # tres archivos; si salen más, parar
git commit -F /tmp/msg-eb1.txt
```

con `/tmp/msg-eb1.txt`:

```
feat(rbac): location:edit_beneficio — Farm Manager sí, Farm Operator no

Spec #370 §4.3, decisión de Daniel del 2026-09-18.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 2: La guardia, y los atributos y la subdivisión

**Files:**
- Modify: `lib/traceability/locations.ts` — nueva función tras `requireLocationAttributeAccess` (~línea 102); `updateLocationAttributes` (~línea 134); `createMicrolot` (~línea 204)
- Test: `tests/traceability/editarBeneficio.test.ts` (añadir al final)

**Interfaces:**
- Consumes: la clave `location:edit_beneficio` de la Task 1.
- Produces: `export async function exigeEditarBeneficioSiLoEs(userAccountId: string, locationId: string): Promise<void>` en `lib/traceability/locations.ts`. Lanza `LocationAccessError("location_not_found")` si la ubicación no existe y `LocationAccessError("no_beneficio_edit_access")` si es un beneficio y falta el permiso. No hace nada si no es un beneficio.
- Produces: `createMicrolot` lanza `LocationValidationError("beneficio_no_se_subdivide")` si el padre es un beneficio.

- [ ] **Step 1: Añadir los fixtures y las pruebas que fallan**

Al final de `tests/traceability/editarBeneficio.test.ts`, añadir primero estos imports **arriba del archivo**, junto a los existentes:

```ts
import { LocationAccessError, LocationValidationError, createMicrolot, updateLocationAttributes } from "../../lib/traceability/locations";
```

y al final del archivo:

```ts
const names: string[] = [];
const accountIds: string[] = [];
const personIds: string[] = [];
const scopeIds: string[] = [];
function nombre() { const n = `TEST-EDB-${randomUUID()}`; names.push(n); return n; }

async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function hijo(parentLocationId: string, locationType: "beneficio" | "plot") {
  return prisma.location.create({ data: { name: nombre(), locationType, classification: "internal", parentLocationId } });
}
async function cuenta(locationId: string, perfil: "Farm Manager" | "Farm Operator") {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "EditarBeneficio", displayName: personId } });
  personIds.push(personId);
  const userAccountId = randomUUID();
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  accountIds.push(userAccountId);
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // `Scope` es único por (tipo, referencia): se reutiliza si otra cuenta de
  // esta prueba ya lo creó, y sólo se borra el que creó esta corrida.
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: locationId } });
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  return userAccountId;
}
/** La concesión por persona que el plan 3 hará desde pantalla. Se cae con el
 *  Assignment: `onDelete: Cascade` en `AssignmentPermissionOverride`. */
async function conceder(userAccountId: string) {
  const asignacion = await prisma.assignment.findFirstOrThrow({ where: { userAccountId } });
  const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "location", action: "edit_beneficio" } });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId: asignacion.id, permissionId: permiso.id, effect: "grant", reason: "TEST concesión de editar beneficio" },
  });
}

afterEach(async () => {
  const rows = await prisma.location.findMany({ where: { name: { in: names } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: { entityType: "location", entityId: { in: ids } } });
  // Hijos primero, para que ninguno quede con el padre en null (SET NULL).
  await prisma.location.deleteMany({ where: { parentLocationId: { in: ids } } });
  await prisma.location.deleteMany({ where: { id: { in: ids } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  names.length = 0; accountIds.length = 0; personIds.length = 0; scopeIds.length = 0;
});

describe("atributos de un beneficio (updateLocationAttributes)", () => {
  it("un capataz asignado en el sitio NO los edita", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(updateLocationAttributes(capataz, { locationId: ben.id, description: "cambio" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo capataz SÍ edita una parcela del mismo sitio.
    // Sin esto, la negativa se cumpliría con un capataz sin acceso a nada.
    const parc = await hijo(finca.id, "plot");
    await expect(updateLocationAttributes(capataz, { locationId: parc.id, description: "cambio" })).resolves.toBeDefined();
  });

  it("un Farm Manager sí", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(updateLocationAttributes(jefe, { locationId: ben.id, description: "cambio" })).resolves.toBeDefined();
  });

  it("un capataz con la concesión sí", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await conceder(capataz);
    await expect(updateLocationAttributes(capataz, { locationId: ben.id, description: "cambio" })).resolves.toBeDefined();
  });
});

describe("subdividir un beneficio (createMicrolot)", () => {
  it("se rechaza para todos: un beneficio no se parte en beneficios", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(createMicrolot(jefe, { parentLocationId: ben.id, name: nombre(), subdivisionReason: "other" }))
      .rejects.toThrow(new LocationValidationError("beneficio_no_se_subdivide"));
    // Control positivo: el mismo Farm Manager subdivide una parcela.
    const parc = await hijo(finca.id, "plot");
    const micro = await createMicrolot(jefe, { parentLocationId: parc.id, name: nombre(), subdivisionReason: "other" });
    expect(micro.locationType).toBe("plot");
  });
});
```

- [ ] **Step 2: Ver caer las nuevas, por la razón correcta**

```bash
npx vitest run tests/traceability/editarBeneficio.test.ts > /tmp/eb2.txt 2>&1; echo "salida=$?"; grep -E 'Tests |×' /tmp/eb2.txt
```

Expected: salida 1. Caen **dos**: «un capataz asignado en el sitio NO los edita» (la promesa se resuelve en vez de rechazar) y «se rechaza para todos» (crea el microlote). Las demás pasan: el jefe y el capataz con concesión ya editan hoy, porque hoy no hay guardia.

**Nota de flip:** que «un Farm Manager sí» y «con la concesión sí» pasen ya es esperado — no son la guardia, son su control. La guardia es la negativa.

- [ ] **Step 3: Escribir la guardia**

En `lib/traceability/locations.ts`, justo después de `requireLocationAttributeAccess`:

```ts
/**
 * «Editar beneficio» (spec #370 §4.3). No hace nada si la ubicación no es un
 * beneficio: parcelas y sitios siguen como estaban. Si lo es, exige
 * `location:edit_beneficio` sobre el propio beneficio.
 *
 * Existe porque la auditoría de Codex del 2026-09-18 encontró que el capataz
 * —que tiene `manage_attributes` por perfil y lo hereda del sitio— editaba
 * atributos y coordenadas de un beneficio por la acción de parcela, que no
 * miraba el tipo. La regla de Daniel es sobre escrituras, así que vive aquí,
 * en el servicio, y cada camino la llama.
 */
export async function exigeEditarBeneficioSiLoEs(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { locationType: true, classification: true },
  });
  if (!location) throw new LocationAccessError("location_not_found");
  if (location.locationType !== "beneficio") return;
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "edit_beneficio", "location", target, location.classification)) return;
  throw new LocationAccessError("no_beneficio_edit_access");
}
```

En `updateLocationAttributes`, justo después de `await requireLocationAttributeAccess(userAccountId, input.locationId);`:

```ts
  await exigeEditarBeneficioSiLoEs(userAccountId, input.locationId);
```

En `createMicrolot`, justo después de `await requireLocationAttributeAccess(userAccountId, input.parentLocationId);`:

```ts
  // Un microlote copia el tipo del padre, así que sobre un beneficio crearía
  // OTRO beneficio, saltándose `create_site` y la regla de que un beneficio
  // cuelga de un sitio. Hoy ninguna pantalla lo llama; se cierra igual.
  if (parent.locationType === "beneficio") throw new LocationValidationError("beneficio_no_se_subdivide");
```

`LocationValidationError` ya está declarada en este archivo (línea 62, antes de `createMicrolot` en la 204): no hace falta importarla.

- [ ] **Step 4: Ver pasar la prueba, y las vecinas**

```bash
npx vitest run tests/traceability/editarBeneficio.test.ts tests/traceability/beneficios.test.ts > /tmp/eb2.txt 2>&1; echo "salida=$?"; grep -E 'Tests ' /tmp/eb2.txt
grep -rln 'updateLocationAttributes\|createMicrolot' tests | tr '\n' ' '
```

Expected: salida 0. Después correr también cada archivo de prueba que devuelve el `grep` (las pruebas de parcelas y microlotes existentes), con el mismo patrón sin tubería, y exigir salida 0: el cambio no puede romper parcelas.

- [ ] **Step 5: Compuerta de tipos**

```bash
npx tsc --noEmit > /tmp/eb-tsc.txt 2>&1; echo "tsc=$?"
```

Expected: `tsc=0`. Si falla por `generated/prisma/client`, correr antes `npm run prisma:generate`: es el cliente sin generar del worktree, no el cambio.

- [ ] **Step 6: Commit**

```bash
git add lib/traceability/locations.ts tests/traceability/editarBeneficio.test.ts
git diff --cached --stat   # dos archivos
git commit -F /tmp/msg-eb2.txt
```

con `/tmp/msg-eb2.txt`:

```
fix(beneficio): el capataz no edita atributos de un beneficio ni lo subdivide

exigeEditarBeneficioSiLoEs en updateLocationAttributes; createMicrolot rechaza
un padre beneficio. Hallazgo de la auditoría de Codex del 2026-09-18.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 3: Coordenadas y renombrar

**Files:**
- Modify: `lib/traceability/coordenadasDelSitio.ts` — import (~línea 3) y `confirmarCoordenadasDelSitio` (~línea 174)
- Modify: `lib/traceability/beneficios.ts:106-128`
- Test: `tests/traceability/editarBeneficio.test.ts` (añadir al final)

**Interfaces:**
- Consumes: `exigeEditarBeneficioSiLoEs` de la Task 2.
- Produces: `actualizarBeneficio` lanza `LocationAccessError("no_beneficio_edit_access")` al capataz sin concesión (antes, `no_location_create_access`).

- [ ] **Step 1: Pruebas que fallan**

Arriba del archivo de prueba, añadir:

```ts
import { confirmarCoordenadasDelSitio } from "../../lib/traceability/coordenadasDelSitio";
import { actualizarBeneficio } from "../../lib/traceability/beneficios";
```

Al final:

```ts
describe("coordenadas de un beneficio (confirmarCoordenadasDelSitio)", () => {
  it("un capataz NO las mueve; un Farm Manager sí", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: ben.id, latitude: 8.7, longitude: -82.4 }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo, el mismo camino con quien sí puede.
    await expect(confirmarCoordenadasDelSitio(jefe, { locationId: ben.id, latitude: 8.7, longitude: -82.4 })).resolves.toBeDefined();
  });

  it("el capataz sigue declarando coordenadas de una parcela", async () => {
    const finca = await sitio();
    const parc = await hijo(finca.id, "plot");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(confirmarCoordenadasDelSitio(capataz, { locationId: parc.id, latitude: 8.7, longitude: -82.4 })).resolves.toBeDefined();
  });
});

describe("renombrar un beneficio (actualizarBeneficio)", () => {
  it("exige edit_beneficio: el capataz con concesión renombra, sin ella no", async () => {
    const finca = await sitio();
    const ben = await hijo(finca.id, "beneficio");
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(actualizarBeneficio(capataz, { locationId: ben.id, name: nombre() }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    const nuevo = nombre();
    expect((await actualizarBeneficio(capataz, { locationId: ben.id, name: nuevo })).name).toBe(nuevo);
  });
});
```

- [ ] **Step 2: Ver caer las nuevas**

```bash
npx vitest run tests/traceability/editarBeneficio.test.ts > /tmp/eb3.txt 2>&1; echo "salida=$?"; grep -E 'Tests |×' /tmp/eb3.txt
```

Expected: salida 1. Caen «un capataz NO las mueve…» (resuelve en vez de rechazar) y «exige edit_beneficio…» (el mensaje es `no_location_create_access`, no `no_beneficio_edit_access`). «Sigue declarando coordenadas de una parcela» pasa ya: es control.

- [ ] **Step 3: Implementar**

En `lib/traceability/coordenadasDelSitio.ts`, añadir el import:

```ts
import { exigeEditarBeneficioSiLoEs } from "./locations";
```

y en `confirmarCoordenadasDelSitio`, justo después de `await requireFieldSessionAccess(userAccountId, input.locationId);`:

```ts
  // Mover un beneficio es editarlo (spec #370 §4.3): `requireFieldSessionAccess`
  // sólo exige `manage_attributes`, que el capataz tiene.
  await exigeEditarBeneficioSiLoEs(userAccountId, input.locationId);
```

En `lib/traceability/beneficios.ts`, cambiar el import de la línea 4 a:

```ts
import { LocationAccessError, exigeEditarBeneficioSiLoEs, puedeGestionarAtributosDeUbicacion, requireLocationAttributeAccess } from "./locations";
```

y en `actualizarBeneficio` sustituir el bloque de comentario y comprobación de `create_site` (desde `// \`manage_attributes\` sola no basta` hasta el `}` del `if` que lanza `no_location_create_access`) por:

```ts
  // `manage_attributes` sola no basta: Farm Operator la tiene, y `can()` sube
  // por los ancestros. Editar un beneficio exige `edit_beneficio` (spec #370
  // §4.3): de serie para Farm Manager, a un capataz sólo por concesión. Hasta
  // el 2026-09-18 exigía `create_site`, que no se puede conceder a un capataz
  // sin darle también crear beneficios. Se comprueba sobre el beneficio mismo:
  // su padre puede ser null (`parent_location_id` es ON DELETE SET NULL).
  await exigeEditarBeneficioSiLoEs(userAccountId, before.id);
```

`LocationAccessError` y `can` siguen usándose en el archivo (en `exigePoderCrearBajo` y `sitiosParaBeneficio`), así que sus imports se quedan.

- [ ] **Step 4: Pasar**

```bash
npx vitest run tests/traceability/editarBeneficio.test.ts tests/traceability/beneficios.test.ts > /tmp/eb3.txt 2>&1; echo "salida=$?"; grep -E 'Tests ' /tmp/eb3.txt
grep -rln 'confirmarCoordenadasDelSitio' tests | tr '\n' ' '
npx tsc --noEmit > /tmp/eb-tsc.txt 2>&1; echo "tsc=$?"
```

Expected: salida 0 y `tsc=0`. Correr también los archivos que devuelve el `grep` y exigir salida 0.

- [ ] **Step 5: Commit**

```bash
git add lib/traceability/coordenadasDelSitio.ts lib/traceability/beneficios.ts tests/traceability/editarBeneficio.test.ts
git diff --cached --stat   # tres archivos
git commit -F /tmp/msg-eb3.txt
```

con `/tmp/msg-eb3.txt`:

```
fix(beneficio): coordenadas y renombrar exigen edit_beneficio

El capataz ya no mueve un beneficio; renombrar pasa de create_site a
edit_beneficio, que sí se puede conceder sin dar crear.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

### Task 4: ADR, inventario, compuerta completa y flip-tests

**Files:**
- Modify: `docs/architecture/DECISIONS.md` (ADR nuevo al final)
- Modify: `docs/arquitectura/inventario-de-acceso.md` (sólo si las cifras cambian)

- [ ] **Step 1: Número de ADR**

```bash
grep -oE '^## ADR-[0-9]+' docs/architecture/DECISIONS.md | tail -1
```

El nuevo es ese número + 1. **Se toma ahora, no antes**: ya se movió dos veces esta semana.

- [ ] **Step 2: Escribir el ADR**

Al final de `docs/architecture/DECISIONS.md` (sustituyendo `NNN` por el número del Step 1):

```markdown
## ADR-NNN — «Editar beneficio»: un permiso que se concede, no uno que se hereda

**Fecha:** 2026-09-18 · **Estado:** aceptado · **Spec:** #370 §4.3

**Contexto.** La auditoría de Codex del 2026-09-18 sobre #377 encontró que el capataz (Farm Operator) editaba un beneficio por caminos que no pasaban por `beneficios.ts`: la acción de atributos de parcela (`updateLocationAttributes`, que no miraba el tipo), la de coordenadas (`confirmarCoordenadasDelSitio`) y, latente, `createMicrolot`, que sobre un beneficio crearía otro. Todos exigían sólo `manage_attributes`, que el capataz tiene y hereda del sitio.

**Decisión de Daniel.** *«El capataz puede editar un beneficio si en configuración el Farm Manager/owner le da ese permiso; por defecto NO.»*

**Decisión.** `location:edit_beneficio`, de serie para Farm Manager y Platform Admin, excluido de Farm Operator. Una sola guardia, `exigeEditarBeneficioSiLoEs` en `lib/traceability/locations.ts`, llamada desde cada escritura; no hace nada si la ubicación no es un beneficio. `actualizarBeneficio` pasa de `create_site` a este permiso, porque `create_site` no se puede conceder a un capataz sin darle también crear. `createMicrolot` rechaza un padre beneficio para todos.

**La concesión** es un `AssignmentPermissionOverride` de efecto `grant`, que `can()` ya resuelve. La pantalla para que el Farm Manager la dé es el plan 3 de la spec.

**Consecuencias.** Instalaciones, camas, equipos y recetas siguen abiertos al capataz hasta el plan 2 de la misma spec; está dicho en su §4.2.
```

- [ ] **Step 3: Inventario de acceso**

```bash
node scripts/inventario-de-acceso.mjs > /tmp/eb-inv.txt 2>&1; echo "inv=$?"; head -20 /tmp/eb-inv.txt
grep -nE '[0-9]+ operaciones|[0-9]+ archivos|guardia directo' docs/arquitectura/inventario-de-acceso.md | head
```

Si las cifras del script difieren de las del documento, actualizar **esas líneas** del documento con lo que dice el script —no con una suma a mano— y correr `npx vitest run tests/` del guardia del inventario (el archivo que el `grep -rl 'inventario-de-acceso' tests` devuelva) con salida 0.

- [ ] **Step 4: Compuerta completa**

```bash
export SHADOW_DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nn_shadow_beneficio"
npm run verify > /tmp/eb-verify.txt 2>&1; echo "verify=$?"
npm run build > /tmp/eb-build.txt 2>&1; echo "build=$?"
npm test > /tmp/eb-test.txt 2>&1; echo "test=$?"; grep -E '^ *(Test Files|Tests) ' /tmp/eb-test.txt
bash scripts/ci.sh > /tmp/eb-ci.txt 2>&1; echo "ci=$?"; grep -c 'editarBeneficio' /tmp/eb-ci.txt
```

Expected: las cuatro en 0, y el último `grep` en **0**: la prueba nueva necesita base y no puede estar en el carril hermético.

- [ ] **Step 5: Commit del ADR y el inventario**

```bash
git add docs/architecture/DECISIONS.md docs/arquitectura/inventario-de-acceso.md
git diff --cached --stat
git commit -F /tmp/msg-eb4.txt
```

con `/tmp/msg-eb4.txt` (con el número real del ADR):

```
docs: ADR-NNN — editar beneficio, un permiso que se concede

Y las cifras del inventario de acceso, regeneradas con su script.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

- [ ] **Step 6: Flip-tests, contra el commit**

Uno por camino, porque un guardia compartido que cae en uno no prueba los demás. Para cada fila: guardar el sha del archivo, aplicar la mutación con un script que **aborta si el ancla no casa**, comprobar `tsc`, correr la prueba y anotar **qué prueba cae por su nombre**, restaurar con `git checkout -- <archivo>`, y comprobar que vuelve el sha.

| mutación | archivo | debe caer |
|---|---|---|
| quitar la línea `await exigeEditarBeneficioSiLoEs(userAccountId, input.locationId);` de `updateLocationAttributes` | `locations.ts` | «un capataz asignado en el sitio NO los edita» |
| quitar la línea equivalente de `confirmarCoordenadasDelSitio` | `coordenadasDelSitio.ts` | «un capataz NO las mueve; un Farm Manager sí» |
| quitar el `if (parent.locationType === "beneficio")` de `createMicrolot` | `locations.ts` | «se rechaza para todos» |
| en la guardia, cambiar `"edit_beneficio"` por `"manage_attributes"` | `locations.ts` | las tres anteriores **y** «exige edit_beneficio» |
| añadir `["location", "edit_beneficio"],` al perfil Farm Operator | `catalog.ts` | «lo tiene Farm Manager y NO lo tiene Farm Operator» |

La última no necesita reseed: la prueba lee el catálogo, no la base.

- [ ] **Step 7: Push y PR**

```bash
git push -u origin editar-beneficio
git rev-parse HEAD; git rev-parse @{u}   # iguales, o no se ha empujado
```

PR contra `main`, con la tabla de flip-tests y las cifras de la compuerta. Fusionar es decisión de Daniel.
