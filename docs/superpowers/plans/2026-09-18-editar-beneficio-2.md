# «Editar beneficio», plan 2: instalaciones, recetas y equipos — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que configurar instalaciones y camas, recetas y equipos exija `location:edit_beneficio` (o, para equipos, también `equipment:manage`), de modo que el capataz no configure nada del beneficio salvo concesión.

**Architecture:** Dos guardias nuevas en `lib/traceability/locations.ts` —`exigeEditarBeneficioEn` (sobre una ubicación, sea del tipo que sea) y `exigeEditarBeneficioEnOrganizacion` (en algún lugar de una organización, o en plataforma si no hay organización)— llamadas desde `instalaciones.ts` y `processTargets.ts`. En `lib/equipos/equipos.ts`, una función `puedeConfigurar` que acepta `equipment:manage` **o** `location:edit_beneficio` en el lugar del equipo, y que sustituye a la comprobación de `manage` en todas las escrituras de configuración. Operar —informar condición, verificar un instrumento, usar una receta— no cambia.

**Tech Stack:** Next.js 16, Prisma 7.9 sobre Postgres, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md` (en `main` desde #370) §2, §4.2, §4.3. Decisiones de Daniel del 2026-09-18 que esta rama añade a la spec (Task 4): **todas** las instalaciones y camas quedan detrás del permiso, cuelguen de donde cuelguen; recetas: `edit_beneficio` en algún lugar de su organización, las compartidas sólo plataforma; la concesión abre también configurar equipos.

## Global Constraints

- El capataz configura el beneficio **sólo si se le concede**; por defecto **no** (Daniel, 2026-09-18).
- **Operar sigue abierto**: informar la condición de un equipo, verificar un instrumento y usar una receta en un lote no cambian.
- **Todas** las instalaciones de secado y sus camas: crear o editar exige `location:edit_beneficio`; lo existente **no se mueve** de padre.
- Recetas: crear, editar metadatos y publicar versión exigen `location:edit_beneficio` en algún lugar de la organización de la receta; **una receta compartida (sin organización) sólo en ámbito de plataforma**. La comprobación de `lot:manage` que ya tienen **se queda**.
- Equipos: registrar, trasladar, declarar/retirar patrón y declarar modo aceptan `equipment:manage` **o** `location:edit_beneficio` en el lugar del equipo. Sin lugar (proyecto o plataforma), sólo `equipment:manage`.
- La regla vive en el servicio, no en la pantalla.
- Worktree `~/Developer/nectar-worktrees/editar-beneficio-2`, rama `editar-beneficio-2`, nacida de `origin/main` = `68b622d`.
- Base de pruebas compartida `postgresql://postgres@127.0.0.1:55433/nectar_test`. Nunca `reset`; el seed sí.
- `git commit -F <archivo>`, escenificando archivo por archivo y contando `git diff --cached --stat`. Nunca canalizar una compuerta.

## Mapa de archivos

| archivo | qué cambia |
|---|---|
| `lib/traceability/locations.ts` | `exigeEditarBeneficioEn`, `exigeEditarBeneficioEnOrganizacion` (nuevas, exportadas) |
| `lib/traceability/instalaciones.ts` | crear exige el permiso sobre el padre; editar, sobre la propia ubicación |
| `lib/traceability/processTargets.ts` | las tres escrituras de receta llaman a la guardia de organización |
| `lib/equipos/equipos.ts` | `puedeConfigurar`; `registrarEquipo`, `exigePermiso("manage")` y `puedeGestionarEquipo` la usan |
| `tests/traceability/instalaciones.test.ts` | el actor positivo pasa a Farm Manager |
| `tests/traceability/editarBeneficio.test.ts` | casos nuevos de instalaciones, recetas y equipos |
| `docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md` | las decisiones de este plan |
| `docs/architecture/DECISIONS.md`, `docs/arquitectura/inventario-de-acceso.md` | ADR y cifras |

---

### Task 1: Guardias y instalaciones

**Files:** Modify `lib/traceability/locations.ts` (después de `exigeEditarBeneficioSiLoEs`), `lib/traceability/instalaciones.ts:64,81`, `tests/traceability/instalaciones.test.ts:17-34`, `tests/traceability/editarBeneficio.test.ts` (añadir al final).

**Interfaces:**
- Produces: `export async function exigeEditarBeneficioEn(userAccountId: string, locationId: string): Promise<void>` — lanza `LocationAccessError("location_not_found")` o `LocationAccessError("no_beneficio_edit_access")`.
- Produces: `export async function exigeEditarBeneficioEnOrganizacion(userAccountId: string, organizationId: string | null): Promise<void>` — lanza `LocationAccessError("no_beneficio_edit_access")`.

- [ ] **Step 1: Adaptar el fixture de `instalaciones.test.ts`**

El capataz dejará de crear instalaciones, así que el actor con permiso de esa prueba pasa a ser Farm Manager. En `cuenta`, cambiar la firma y el perfil:

```ts
async function cuenta(locationId?: string, perfil: "Farm Manager" | "Farm Operator" = "Farm Manager") {
```

y la línea `const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });` por:

```ts
    const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
```

La prueba «tener los demás permisos de Farm Operator sin location:manage_attributes no permite crear» clona el perfil **Farm Operator por nombre**, así que sigue probando lo mismo. Correr el archivo y exigir salida 0 **antes** de tocar el servicio (es un cambio de fixture, no de conducta):

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"; export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"
npx vitest run tests/traceability/instalaciones.test.ts > /tmp/eb2-1a.txt 2>&1; echo "salida=$?"; grep -E 'Tests ' /tmp/eb2-1a.txt
```

- [ ] **Step 2: Pruebas que fallan**

Arriba de `tests/traceability/editarBeneficio.test.ts`, añadir:

```ts
import { actualizarUbicacionDeSecado, crearUbicacionDeSecado } from "../../lib/traceability/instalaciones";
```

Al final:

```ts
describe("instalaciones y camas (crearUbicacionDeSecado, actualizarUbicacionDeSecado)", () => {
  it("un capataz NO crea una instalación en su sitio; un Farm Manager sí", async () => {
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearUbicacionDeSecado(capataz, { name: nombre(), parentLocationId: finca.id, locationType: "drying_facility" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    // Control positivo: el mismo camino con quien sí puede.
    const inst = await crearUbicacionDeSecado(jefe, { name: nombre(), parentLocationId: finca.id, locationType: "drying_facility" });
    expect(inst.locationType).toBe("drying_facility");
  });

  it("un capataz NO edita ni crea camas; con la concesión, sí", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const inst = await crearUbicacionDeSecado(jefe, { name: nombre(), parentLocationId: finca.id, locationType: "drying_facility" });
    await expect(actualizarUbicacionDeSecado(capataz, { locationId: inst.id, name: nombre() }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await expect(crearUbicacionDeSecado(capataz, { name: nombre(), parentLocationId: inst.id, locationType: "drying_bed" }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    await expect(actualizarUbicacionDeSecado(capataz, { locationId: inst.id, name: nombre() })).resolves.toBeDefined();
    const cama = await crearUbicacionDeSecado(capataz, { name: nombre(), parentLocationId: inst.id, locationType: "drying_bed" });
    expect(cama.locationType).toBe("drying_bed");
  });
});
```

El `afterEach` del archivo borra por nombre las ubicaciones y sus hijos directos; una cama es nieta del sitio. Para que no quede huérfana, en ese `afterEach`, **antes** de la línea que borra los hijos (`parentLocationId: { in: ids }`), añadir:

```ts
  // Nietos (camas bajo instalación): primero, para que ninguno quede con el padre en null.
  const hijos = await prisma.location.findMany({ where: { parentLocationId: { in: ids } }, select: { id: true } });
  await prisma.location.deleteMany({ where: { parentLocationId: { in: hijos.map((h) => h.id) } } });
```

- [ ] **Step 3: Verlas caer** — `npx vitest run tests/traceability/editarBeneficio.test.ts > /tmp/eb2-1b.txt 2>&1; echo "salida=$?"; grep -E 'Tests |×' /tmp/eb2-1b.txt`. Expected: salida 1; caen las dos nuevas (el capataz crea/edita en vez de ser rechazado).

- [ ] **Step 4: Escribir las guardias** en `lib/traceability/locations.ts`, justo después de `exigeEditarBeneficioSiLoEs`:

```ts
/**
 * `location:edit_beneficio` sobre una ubicación, sea del tipo que sea. Para lo
 * que es configuración del beneficio aunque no cuelgue de él: las
 * instalaciones de secado y sus camas cuelgan del sitio (decisión de Daniel
 * del 2026-09-18: «todas», cuelguen de donde cuelguen). `can()` sube por los
 * ancestros, así que un Farm Manager asignado en la finca pasa sobre sus hijos.
 */
export async function exigeEditarBeneficioEn(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId }, select: { classification: true } });
  if (!location) throw new LocationAccessError("location_not_found");
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (await can(userAccountId, "edit_beneficio", "location", target, location.classification)) return;
  throw new LocationAccessError("no_beneficio_edit_access");
}

/**
 * `location:edit_beneficio` en ALGÚN lugar de una organización — para lo que es
 * de la organización y no de un lugar, como las recetas. Una receta compartida
 * (`organizationId` nulo) sólo se configura con alcance de plataforma.
 */
export async function exigeEditarBeneficioEnOrganizacion(userAccountId: string, organizationId: string | null) {
  if (organizationId === null) {
    if (await can(userAccountId, "edit_beneficio", "location", { scopeType: "platform", scopeRefId: null }, "internal")) return;
    throw new LocationAccessError("no_beneficio_edit_access");
  }
  const lugares = await prisma.location.findMany({ where: { organizationId }, select: { id: true, classification: true } });
  for (const l of lugares) {
    if (await can(userAccountId, "edit_beneficio", "location", { scopeType: "location", scopeRefId: l.id }, l.classification)) return;
  }
  throw new LocationAccessError("no_beneficio_edit_access");
}
```

Comprobar el tipo real del objetivo de plataforma que acepta `can()` (`lib/rbac/types.ts`, `ScopeTarget`): si `scopeRefId: null` no casa con el tipo, usar exactamente la forma que usa `PLATFORM_TARGET` en `lib/rbac/admin.ts:22`.

En `lib/traceability/instalaciones.ts`: importar `exigeEditarBeneficioEn` desde `./locations`; en `crearUbicacionDeSecado`, justo después de `await requireLocationAttributeAccess(userAccountId, input.parentLocationId);`:

```ts
  // Configurar el secado es configurar el beneficio (spec #370 §4.3).
  await exigeEditarBeneficioEn(userAccountId, input.parentLocationId);
```

y en `actualizarUbicacionDeSecado`, justo después de `await requireLocationAttributeAccess(userAccountId, input.locationId);`:

```ts
  await exigeEditarBeneficioEn(userAccountId, input.locationId);
```

- [ ] **Step 5: Pasar** — correr `tests/traceability/editarBeneficio.test.ts` y `tests/traceability/instalaciones.test.ts` (salida 0) y `npx tsc --noEmit` (0).

- [ ] **Step 6: Commit** — los cuatro archivos; mensaje `fix(beneficio): instalaciones y camas exigen edit_beneficio` + línea `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

### Task 2: Recetas

**Files:** Modify `lib/traceability/processTargets.ts` (import y líneas ~333, ~484, ~542), `tests/traceability/editarBeneficio.test.ts`.

**Interfaces:** Consumes `exigeEditarBeneficioEnOrganizacion` (Task 1).

- [ ] **Step 1: Pruebas que fallan.** Arriba del archivo de prueba:

```ts
import { createRecipeVersion, createRecipeWithVersion, updateRecipeMetadata } from "../../lib/traceability/processTargets";
```

Al final (el `afterEach` general no conoce organizaciones, lotes ni recetas: este `describe` lleva su propia limpieza):

```ts
describe("recetas (crear, editar, publicar)", () => {
  const orgIds: string[] = [];
  const lotIds: string[] = [];
  const recetaNombres: string[] = [];
  afterEach(async () => {
    const recetas = await prisma.processRecipe.findMany({ where: { name: { in: recetaNombres } }, select: { id: true } });
    await prisma.auditEvent.deleteMany({ where: { entityId: { in: recetas.map((r) => r.id) } } });
    await prisma.processRecipe.deleteMany({ where: { name: { in: recetaNombres } } });
    await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
    // La finca de la organización la borra el afterEach general (por nombre); aquí se suelta antes su organización.
    await prisma.location.updateMany({ where: { organizationId: { in: orgIds } }, data: { organizationId: null } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    orgIds.length = 0; lotIds.length = 0; recetaNombres.length = 0;
  });

  /** Una organización con su finca y un lote en ella: el capataz de la finca gestiona ese lote. */
  async function fincaConLote() {
    const org = await prisma.organization.create({ data: { name: nombre(), organizationType: "farm" } });
    orgIds.push(org.id);
    const finca = await prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal", organizationId: org.id } });
    const lot = await prisma.lot.create({ data: { lotCode: nombre(), lotType: "cherry", organizationId: org.id, locationId: finca.id, classification: "internal" } });
    lotIds.push(lot.id);
    return { org, finca };
  }
  const receta = (organizationId: string) => {
    const name = nombre(); recetaNombres.push(name);
    return { name, organizationId, targets: [] };
  };

  it("un capataz NO crea una receta de su organización; un Farm Manager sí", async () => {
    const { org, finca } = await fincaConLote();
    const capataz = await cuenta(finca.id, "Farm Operator");
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(createRecipeWithVersion(capataz, receta(org.id))).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await expect(createRecipeWithVersion(jefe, receta(org.id))).resolves.toBeDefined();
  });

  it("un capataz NO edita ni publica; con la concesión, sí", async () => {
    const { org, finca } = await fincaConLote();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const capataz = await cuenta(finca.id, "Farm Operator");
    const creada = await createRecipeWithVersion(jefe, receta(org.id));
    const recipeId = "recipe" in creada ? creada.recipe.id : (creada as { id: string }).id;
    await expect(updateRecipeMetadata(capataz, recipeId, { name: nombre() })).rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
    await conceder(capataz);
    await expect(updateRecipeMetadata(capataz, recipeId, { name: recetaNombres[0] })).resolves.toBeDefined();
  });

  it("una receta compartida (sin organización) no la crea un Farm Manager de finca", async () => {
    const { finca } = await fincaConLote();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const name = nombre(); recetaNombres.push(name);
    await expect(createRecipeWithVersion(jefe, { name, organizationId: null, targets: [] }))
      .rejects.toThrow(new LocationAccessError("no_beneficio_edit_access"));
  });
});
```

**Antes de escribir estas pruebas, leer** las firmas reales de `createRecipeWithVersion` (qué devuelve), `updateRecipeMetadata` y `createRecipeVersion` en `processTargets.ts:318-593`, y ajustar la forma de obtener el `recipeId` y los argumentos de `updateRecipeMetadata` a lo que el código declara. Añadir un caso para `createRecipeVersion` con la misma forma que el de `updateRecipeMetadata` (capataz rechazado; con concesión, aceptado), con los argumentos que su firma pide. Si `targets: []` es inválido para `validateTargets`, usar el mínimo válido que acepten las pruebas de `tests/traceability/recipeAuthoring.test.ts`.

- [ ] **Step 2: Verlas caer** (salida 1; las del capataz no rechazado y la compartida, que hoy el Farm Manager sí crea si gestiona algún lote).

- [ ] **Step 3: Implementar.** En `processTargets.ts` importar `exigeEditarBeneficioEnOrganizacion` desde `./locations`, y justo después de **cada** `await requireLotAccess(userAccountId, "manage", [anyLot]);` de `createRecipeWithVersion`, `updateRecipeMetadata` y `createRecipeVersion`:

```ts
  // Configurar recetas es configurar el beneficio (spec #370 §4.3): además del
  // lote, `edit_beneficio` en la organización de la receta; compartida, plataforma.
  await exigeEditarBeneficioEnOrganizacion(userAccountId, <organizationId de la receta>);
```

con `input.organizationId` en la creación y `before.organizationId` / `recipe.organizationId` en las otras dos, según el nombre local que use cada función. **No** tocar las lecturas (`listRecipes`, `listRecipeVersionsForLot`, `compareRunToTargets`, `getRecipeForEditor`) ni la ~línea 457.

- [ ] **Step 4: Pasar** — `editarBeneficio.test.ts`, y los tres archivos de recetas existentes (`recipeAuthoring`, `recipeVersions`, `processTargets`: su actor es Platform Admin, deben seguir en 0), y `tsc`.

- [ ] **Step 5: Commit** — `fix(beneficio): crear, editar y publicar recetas exige edit_beneficio`.

---

### Task 3: Equipos

**Files:** Modify `lib/equipos/equipos.ts` (función nueva junto a `exigePermiso` ~línea 78; `exigePermiso`; `registrarEquipo` ~línea 129; `puedeGestionarEquipo` ~línea 741), `tests/traceability/editarBeneficio.test.ts`.

- [ ] **Step 1: Pruebas que fallan.** Leer `RegistrarEquipoInput` y `informarCondicion` en `equipos.ts` para los argumentos exactos. Arriba del archivo de prueba importar `registrarEquipo, informarCondicion` desde `../../lib/equipos/equipos` y `EquipoError` si se exporta. Casos, con su propia limpieza de `equipment`, `equipmentTransfer`, `equipmentConditionReport` y la organización que creen:

  1. un capataz **sin** concesión no registra un equipo con `initialLocationId` en su finca (rechazo: `EquipoError("forbidden")`); **control:** un Farm Manager sí;
  2. el mismo capataz **con** concesión sí lo registra;
  3. **operar sigue abierto:** el capataz sin concesión informa la condición de ese equipo (lo registra el Farm Manager) y se acepta.

- [ ] **Step 2: Verlas caer** — sólo debe caer el caso 2 (hoy la concesión no abre equipos); 1 y 3 pasan ya.

- [ ] **Step 3: Implementar** en `equipos.ts` (importar `can` ya está):

```ts
/**
 * Configurar un equipo: `equipment:manage`, o —si el equipo está en un lugar—
 * `location:edit_beneficio` ahí (spec #370 §4.3: la concesión abre todo el
 * beneficio, equipos incluidos). Sin lugar, sólo `equipment:manage`.
 */
async function puedeConfigurar(
  userAccountId: string,
  objetivo: { scopeType: "location" | "project" | "platform"; scopeRefId: string | null },
  clasificacion: ClassificationLevel,
) {
  if (await can(userAccountId, "manage", "equipment", objetivo as never, clasificacion)) return true;
  return objetivo.scopeType === "location"
    && (await can(userAccountId, "edit_beneficio", "location", objetivo as never, clasificacion));
}
```

(Tipar `objetivo` con el tipo real que devuelve `objetivoDeEquipo` en vez de `as never` si compila; los `as never` son el último recurso.)

- `exigePermiso`: si `accion === "manage"`, usar `puedeConfigurar`; si no, lo de hoy.
- `registrarEquipo`: sustituir `can(userAccountId, "manage", "equipment", objetivo, clasificacion)` por `puedeConfigurar(userAccountId, objetivo, clasificacion)`.
- `puedeGestionarEquipo`: devolver `puedeConfigurar(userAccountId, objetivo, equipo.classification)`.

- [ ] **Step 4: Pasar** — `editarBeneficio.test.ts`, `tests/equipos/*.test.ts`, `tests/equipos/marcasDeRevision.test.ts`, `tests/apiary/refractometroDeMiel.test.ts` (usa modos) y `tsc`.

- [ ] **Step 5: Commit** — `fix(beneficio): la concesión de editar beneficio abre configurar equipos`.

---

### Task 4: Spec, ADR, inventario, compuerta y flip-tests

- [ ] **Step 1: Spec.** En `docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md`: en §2, tabla del 2026-09-18, añadir tres filas con las decisiones de la cabecera de este plan (instalaciones «todas»; recetas «en la organización, compartidas sólo plataforma»; equipos «la concesión abre configurarlos»). En §3, donde dice que `drying_facility` puede colgar «del `site` **o del `beneficio`**», añadir: **corregido el 2026-09-18: el código (#377) sólo acepta `site`, y por eso la regla de permisos no depende del padre** (§4.2). En la tabla de §4.2, marcar las filas de instalaciones y recetas como **cerradas por el plan 2**, y la de equipos como «ya cerrada por `equipment:manage`; la concesión la abre».
- [ ] **Step 2: ADR** — número = `grep -oE '^## ADR-[0-9]+' docs/architecture/DECISIONS.md | tail -1` + 1, tomado en ese momento. Título: «“Editar beneficio”, plan 2: instalaciones, recetas y equipos». Contexto, las tres decisiones, qué sigue abierto (la pantalla de concesión, plan 3).
- [ ] **Step 3: Inventario** — `node scripts/inventario-de-acceso.mjs`; escribir en `docs/arquitectura/inventario-de-acceso.md` exactamente lo que imprime si cambia, con la fecha; correr sus guardias.
- [ ] **Step 4: Compuerta** — `tsc`, `npm run verify`, `npm run build`, `npm test` (con `SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nn_shadow_beneficio`) y `bash scripts/ci.sh`, cada una redirigida con su código. Fallos en archivos que esta rama no toca: listarlos con su salida como observación, no arreglarlos.
- [ ] **Step 5: Commit** del Step 1-3.
- [ ] **Step 6: Flip-tests contra el commit**, uno por camino, con sha antes/después, `tsc` 0 y la prueba caída por su nombre:

| mutación | debe caer |
|---|---|
| quitar la guardia de `crearUbicacionDeSecado` | «un capataz NO crea una instalación…» |
| quitar la guardia de `actualizarUbicacionDeSecado` | «un capataz NO edita ni crea camas…» |
| quitar la guardia de `createRecipeWithVersion` | «un capataz NO crea una receta…» |
| en `exigeEditarBeneficioEnOrganizacion`, aceptar `organizationId === null` sin mirar | «una receta compartida…» |
| en `puedeConfigurar`, devolver sólo el `can(manage)` | el caso 2 de equipos |
