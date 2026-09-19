# Fincas y parcelas — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elegir la finca al navegar y crear fincas, parcelas y microparcelas desde la app, y
que la cosecha se vincule a una parcela o microparcela de la finca elegida.

**Architecture:**
- Sin tablas nuevas. Una finca es una `Organization` (`farm` o `estate`) con su `Location site`;
  una parcela es un `plot` que cuelga de ese sitio; una microparcela es un `plot` hijo de otro
  `plot`, que ya crea `createMicrolot`.
- Un módulo nuevo, `lib/traceability/fincas.ts`, lista las fincas visibles, crea fincas y
  parcelas, y resuelve la finca elegida.
- La elección vive en una cookie que **sólo acota** lo ya autorizado.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 7 (`generated/prisma/client`),
Postgres, vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-fincas-y-parcelas-design.md` (aprobado 2026-09-18).

## Global Constraints

- Crear finca: **sólo** con el permiso nuevo `organization:create_farm`, en ámbito de
  plataforma. Por construcción del catálogo, sólo lo tiene Platform Admin.
- Crear parcela: `location:manage_attributes` **y** `location:create_site` sobre el `site` de la
  finca, igual que el beneficio. El Farm Operator no tiene `create_site`.
- Microparcela: `createMicrolot`, sin tocar su permiso.
- Nombres de 1 a 120 caracteres tras `trim`. **No se repiten dentro del mismo padre**, sin
  distinguir mayúsculas ni espacios. En otra finca sí.
- Toda escritura, con su `AuditEvent` **en la misma transacción** (`recordAuditEvent(…, tx)`).
- La cookie `finca` sólo acota. Un valor que no sea una finca visible se ignora.
- La cosecha sólo sobre `locationType = "plot"`, y lo comprueba el servicio.
- Las pruebas con base van declaradas en `scripts/pruebas-por-compuerta.txt`, grupo
  `base-sembrada`.
- El permiso nuevo necesita `npm run db:seed` en la base de pruebas; en producción lo aplica
  `vercel-build`.
- Compuerta por tarea:
  - `npx tsc --noEmit && npx eslint . --quiet && bash scripts/ci.sh && TEST_DATABASE_URL=<base propia> bash scripts/ci-con-base.sh && npm run build`;
  - commit **antes** de mutar;
  - flip-test que compile y tumbe su prueba **por nombre**.
- `Kiva Estate`: el comentario de `prisma/seed.ts:168` **no se toca** (spec §4).

---

### Task 1: el módulo de fincas — listar, elegir y filtrar

**Files:**
- Create: `lib/traceability/fincas.ts`
- Test: `tests/traceability/fincas.test.ts` (base)
- Modify: `scripts/pruebas-por-compuerta.txt`, `docs/arquitectura/acceso-a-datos.allowlist.json`

**Interfaces — produce:**
```ts
export const COOKIE_FINCA = "finca";
export const TODAS = "todas";
export interface Finca { siteId: string; nombre: string; organizationId: string; tipo: "farm" | "estate" }
export async function listarFincas(userAccountId: string): Promise<Finca[]>;
export function resolverFinca(fincas: readonly Finca[], cookie: string | undefined):
  { elegida: Finca | null; todas: boolean; debeElegir: boolean };
export function idsBajoLaFinca(ubicaciones: readonly { id: string; parentLocationId: string | null }[], siteId: string): Set<string>;
```

- `listarFincas` parte de `getManageableContext(user).locations`, que ya viene autorizado. Una
  finca es:
  - un `site` visible cuya organización es `farm` o `estate`, **o**
  - el `site` antepasado de un `plot` visible (quien sólo tiene ámbito sobre una parcela también
    ve su finca).

  Para subir por los padres se hace UNA consulta de `{id, parentLocationId, locationType, name,
  organizationId}` de todas las ubicaciones. El resultado va ordenado por nombre
  (`sortByName`).
- `resolverFinca`:
  - una sola finca → esa;
  - cookie `todas` → `{todas: true}`;
  - cookie igual al `siteId` de una finca de la lista → esa;
  - cualquier otro caso → `debeElegir = fincas.length > 1`.
- `idsBajoLaFinca` devuelve el sitio y todos sus descendientes. Es una función pura, sin base.

- [ ] **Paso 1 — pruebas en rojo** (`tests/traceability/fincas.test.ts`). Fixture:
  - dos organizaciones `farm` («TEST Finca A/B (RUN)»), cada una con su `site`;
  - en A, una parcela `P1` y su microparcela `M1` (`plot` hija, `subdivisionReason: "shade"`);
  - en B, una parcela `Q1`;
  - un usuario `managerA`: Farm Manager con Scope `location` = site A;
  - un `admin`: Platform Admin en ámbito de plataforma.

  Casos:
  - `listarFincas(managerA)` contiene A y **no** B; `listarFincas(admin)` contiene A y B
    (control positivo);
  - `resolverFinca([A], undefined)` elige A; `resolverFinca([A,B], undefined)` da
    `debeElegir: true`; `resolverFinca([A,B], B.siteId)` elige B;
    `resolverFinca([A,B], "otra-cosa")` da `debeElegir: true`, y `"todas"` da `todas: true`;
  - **una cookie de una finca ajena no se acepta:** `resolverFinca(listarFincas(managerA),
    B.siteId)` no devuelve B;
  - `idsBajoLaFinca(ubicaciones, A.site)` contiene `A.site`, `P1` y `M1`, y no `Q1`.
- [ ] **Paso 2** — correrlas: fallan porque el módulo no existe.
- [ ] **Paso 3** — implementar `lib/traceability/fincas.ts` con las firmas de arriba.
- [ ] **Paso 4** — verde; declarar la prueba en `base-sembrada`; entrada del allowlist:
  «lee sobre `getManageableContext`, que ya autoriza».
- [ ] **Paso 5** — compuerta y commit. Flip: hacer que `resolverFinca` acepte cualquier cookie
  → cae «una cookie de una finca ajena no se acepta».

### Task 2: crear una finca (sólo el administrador)

**Files:**
- Modify: `lib/rbac/catalog.ts` (permiso nuevo), `lib/traceability/fincas.ts`
- Test: `tests/traceability/fincas.test.ts`

**Interfaces — produce:**
```ts
export class FincaError extends Error {}
export async function crearFinca(userAccountId: string, input:
  { nombre: string; tipo: "farm" | "estate"; descripcion?: string | null } | { organizationId: string }):
  Promise<{ organization: Organization; site: Location }>;
export async function organizacionesSinTerreno(userAccountId: string): Promise<{ id: string; name: string }[]>;
```

- Catálogo:
  `{ resourceType: "organization", action: "create_farm", description: "Dar de alta una finca: la organización y su terreno. Sólo plataforma." }`.
  Platform Admin lo recibe solo; ningún otro perfil lo lista.
- `crearFinca`:
  - comprueba `can(user, "create_farm", "organization", { scopeType: "platform", scopeRefId: null }, CLASSIFICATION_NOT_APPLICABLE)`;
    si no, `FincaError("sin_permiso")`;
  - nombre de 1 a 120 caracteres;
  - con `organizationId`, la organización debe ser `farm`/`estate` y no tener `site`
    (`FincaError("ya_tiene_terreno")`);
  - en una transacción: crea la `Organization` si hace falta (`status: "approved"`,
    `classification: "internal"`), después el `Location` `site` con el mismo nombre y
    `organizationId`, después `recordAuditEvent` (`operation: "location.create_farm"`,
    `entityType: "location"`), todo con `tx`.
- `organizacionesSinTerreno`: la lista vacía si no tiene `create_farm`; si lo tiene,
  organizaciones `farm`/`estate` sin ninguna `Location` `site`.

- [ ] **Paso 1 — pruebas en rojo:**
  - el admin crea «TEST Finca Nueva (RUN)» → existen la organización, el site y el
    `AuditEvent` `location.create_farm`;
  - `managerA` no puede (`sin_permiso`);
  - para una organización `farm` sin site (creada en el fixture), `crearFinca(admin,
    {organizationId})` crea sólo el site; una segunda vez, `ya_tiene_terreno`;
  - `organizacionesSinTerreno(admin)` la lista antes y no después;
    `organizacionesSinTerreno(managerA)` es `[]`;
  - **atomicidad:** con un nombre de 121 caracteres no queda organización con ese prefijo.
- [ ] **Paso 2** — rojo. **Paso 3** — implementar. **Paso 4** — `npm run db:seed` en la base de
  pruebas propia (el permiso nuevo), y verde.
- [ ] **Paso 5** — compuerta y commit. Flip: quitar el `can(...)` → cae «managerA no puede».

### Task 3: crear parcelas, y nombres que no se repiten

**Files:**
- Modify: `lib/traceability/fincas.ts`, `lib/traceability/locations.ts` (`createMicrolot`),
  `lib/rbac/catalog.ts` (descripción de `create_site`)
- Test: `tests/traceability/fincas.test.ts`

**Interfaces — produce:**
```ts
export async function crearParcela(userAccountId: string, input:
  { siteId: string; nombre: string; areaHectareas?: number | null }): Promise<Location>;
export async function nombreLibreBajo(db: Db, parentLocationId: string, nombre: string): Promise<boolean>;
```

- `crearParcela`:
  - `requireLocationAttributeAccess(user, siteId)`;
  - `can(user, "create_site", "location", {location: siteId}, site.classification)`, si no,
    `LocationAccessError("no_location_create_access")`;
  - el padre tiene que ser `site`;
  - nombre de 1 a 120 caracteres;
  - área `null` o mayor que 0.

  Dentro de la transacción: `nombreLibreBajo` compara `lower(trim(name))` con los hijos del
  padre y, si choca, `FincaError("nombre_repetido")`. Después crea el `plot` (`organizationId`,
  `classification` y `timezone` del padre) y su `AuditEvent` `location.create_plot`.
- `createMicrolot` llama a `nombreLibreBajo` dentro de su transacción; si choca,
  `LocationValidationError("nombre_repetido")`.
- La descripción de `create_site` dice «Crear una ubicación nueva bajo un sitio que ya se
  gestiona: un beneficio, una instalación o una parcela.»

- [ ] **Paso 1 — pruebas en rojo:**
  - `managerA` crea «Lote 7» en A → `plot` hijo de A.site, con su `AuditEvent`;
  - «  lote 7 » otra vez en A → `nombre_repetido`; «Lote 7» en B, creado por el admin, sí se
    crea;
  - `managerA` en B → `no_location_create_access`;
  - un Farm Operator de A (Scope location A) → rechazado, porque no tiene `create_site`;
  - una microparcela «Sombra» en P1 dos veces → la segunda, `nombre_repetido`.
- [ ] **Paso 2** — rojo. **Paso 3** — implementar. **Paso 4** — verde.
- [ ] **Paso 5** — compuerta y commit. Flip: quitar `nombreLibreBajo` de `crearParcela` → cae
  el caso del nombre repetido.

### Task 4: la cosecha sólo sobre una parcela

**Files:**
- Modify: `lib/traceability/harvest.ts` (`recordHarvestEvent`)
- Test: el archivo de pruebas de cosecha que ya existe (`tests/traceability/harvest*.test.ts`),
  o `tests/traceability/fincas.test.ts` si no tiene fixture de proyecto.

- Antes de la transacción: `location.locationType !== "plot"` →
  `HarvestValidationError("la_cosecha_va_sobre_una_parcela")`. Se usa la clase de error que ya
  exista en `harvest.ts`; si no hay, se crea `CosechaError`.
- [ ] **Paso 1 — pruebas en rojo:** una cosecha sobre `M1` (microparcela) se registra; sobre
  `A.site` y sobre un `beneficio`, se rechaza con ese código.
- [ ] **Paso 2–4** — rojo, implementar, verde.
- [ ] **Paso 5** — compuerta y commit. Flip: quitar la comprobación → cae «sobre el sitio de la
  finca».

### Task 5: el selector de finca en Finca, Parcelas y Cosecha

**Files:**
- Create: `app/fincas/page.tsx`, `app/actions/fincas.ts`,
  `app/components/traceability/FincaElegida.tsx`
- Modify: `app/finca/page.tsx`, `app/plots/page.tsx`, `app/lots/new/page.tsx`,
  `scripts/rutas-declaradas.mjs`, `tests/inventario-de-rutas.test.ts`, `messages/es.json`,
  `messages/en.json`

- **`app/actions/fincas.ts`** (`"use server"`, sólo funciones `async` exportadas):
  - `elegirFincaAction(formData)` guarda `COOKIE_FINCA` = `siteId` o `todas` (`path: "/"`,
    `sameSite: "lax"`, `httpOnly: true`, sin `maxAge`: dura la sesión del navegador);
  - después `redirect(String(formData.get("volver") || "/finca"))`, **sólo si empieza por
    `/`** (nunca una URL absoluta).
- **`/fincas`:**
  - lista `listarFincas(user)` como botones que envían `elegirFincaAction`;
  - un botón «Ver todas»;
  - si `organizacionesSinTerreno(user)` no está vacío, la sección «Sin terreno» con enlace a
    `/fincas/nueva?organizacion=<id>`;
  - si el usuario tiene `create_farm`, el enlace «Nueva finca».
- **`FincaElegida`** (servidor): «Finca: *nombre* · cambiar», o «Todas las fincas · elegir», con
  enlace a `/fincas?volver=<ruta>`.
- **`/finca`, `/plots`, `/lots/new`:**
  - leen `(await cookies()).get(COOKIE_FINCA)?.value` y llaman a
    `resolverFinca(await listarFincas(user), valor)`;
  - con `debeElegir`, `redirect("/fincas?volver=<ruta>")`;
  - con `elegida`, filtran `plotLocations` con
    `idsBajoLaFinca(context.locations, elegida.siteId)`.
- **`/lots/new`:** ordena las parcelas con cada microparcela justo debajo de su parcela, con el
  nombre de la microparcela sangrado (`«— Sombra»`).
- **Rutas:** `/fincas` y `/fincas/nueva` se declaran `requiere-sesion`, y la cifra del
  inventario se **mide** (`node scripts/inventario-de-rutas.mjs`), no se suma.
- [ ] **Paso 1** — `npx tsc --noEmit`, `npm run build` y
  `bash scripts/ci.sh` (rutas y mensajes).
- [ ] **Paso 2** — commit. Sin pantalla probada en navegador: hace falta sesión, y se dice.

### Task 6: los formularios de crear

**Files:**
- Create: `app/fincas/nueva/page.tsx`, `app/components/traceability/NuevaParcelaForm.tsx`,
  `app/components/traceability/NuevaMicroparcelaForm.tsx`
- Modify: `app/actions/fincas.ts`, `app/finca/page.tsx`, `app/plots/[id]/page.tsx`, mensajes

- **Acciones:**
  - `crearFincaAction`: nombre, tipo, descripción, u `organizationId` si viene de «sin
    terreno»;
  - `crearParcelaAction`: siteId de la finca elegida, nombre, área;
  - `crearMicroparcelaAction`: parentLocationId, nombre, motivo, nota.

  Las tres devuelven `{ error?: string; ok?: boolean }` para `useActionState` y traducen
  `FincaError`, `LocationAccessError` y `LocationValidationError` a un mensaje
  `fincasError_<código>`.
- **`/fincas/nueva`:** `notFound()` sin `create_farm`. Con `?organizacion=`, el formulario sólo
  confirma el nombre de esa organización y crea su terreno.
- **`/finca`:**
  - con una finca elegida y `create_site` sobre su sitio (se pregunta con `can`), muestra
    `NuevaParcelaForm`;
  - sin permiso, una línea que dice que crear parcelas es del Farm Manager.
- **`/plots/[id]`:** `NuevaMicroparcelaForm` si quien mira tiene `manage_attributes` sobre la
  parcela, con los motivos del enum `SubdivisionReason`.
- [ ] **Paso 1** — `tsc`, `build` y `ci.sh`. **Paso 2** — commit.

### Task 7: el cierre

- [ ] Cifras del inventario de acceso, medidas.
- [ ] Guardias de arquitectura en verde: `audit-atomico`, acceso a datos, `use-server-solo-async`,
  cobertura de permisos (el `can(..., "organization", ...)` va con el recurso literal).
- [ ] Compuerta final completa, con las pruebas nuevas contadas por nombre.
- [ ] `SESSION_STATE.md`: la entrada nueva.
  - **Para Daniel:** crear el terreno de Kiva Estate desde `/fincas`, «sin terreno».
  - El comentario de `seed.ts` sobre Kiva queda señalado.
- [ ] PR con título y descripción, y fusión cuando Daniel lo diga.
