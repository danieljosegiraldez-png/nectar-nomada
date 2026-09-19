# «Editar beneficio», plan 3: concederlo desde ajustes, y no ofrecer lo que no se puede guardar — plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Farm Manager o el dueño concedan y quiten `location:edit_beneficio` a una persona desde `/beneficio/ajustes`, y que las pantallas de ajustes, recetas e instalaciones sólo ofrezcan formularios a quien puede guardarlos.

**Architecture:** Un servicio nuevo, `lib/traceability/concesiones.ts`, con una **delegación estrecha** sobre `AssignmentPermissionOverride`: sólo el permiso `location:edit_beneficio`, sólo quien lo tiene sobre ese beneficio, sólo a asignaciones cuyo ámbito alcanza ese beneficio, con razón obligatoria y `AuditEvent` en la misma transacción. Las pantallas preguntan con funciones booleanas que envuelven las mismas guardias del servidor, así que la pantalla y el servidor no pueden discrepar.

**Tech Stack:** Next.js 16 (server components, server actions), next-intl, Prisma 7.9, vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-17-ajustes-del-beneficio-design.md` §4.3 «Cómo se concede» (en `main` desde #370, ampliada en #417). Rama apilada sobre `editar-beneficio-2` (#417), que aporta `exigeEditarBeneficioEn` y `exigeEditarBeneficioEnOrganizacion`.

## Global Constraints

- Quien concede tiene `location:edit_beneficio` **sobre ese beneficio**; sólo puede conceder o quitar **ese** permiso, nunca otro. No es una puerta a `platform:manage_permissions`.
- La persona que lo recibe tiene una asignación **activa** cuyo ámbito es el beneficio o uno de sus ancestros (ámbito `location`).
- **Razón obligatoria** al conceder; `AuditEvent` en la misma transacción al conceder y al quitar.
- **Rulings del plan (decisiones del controlador, cambiables por Daniel):** (1) un `deny` puesto por administración sobre ese permiso **manda**: el Farm Manager no lo sobrescribe; (2) quitar sólo borra una concesión (`grant`) de ese permiso, nunca un permiso de serie del perfil; (3) la pantalla dice que la concesión vale para **todo el ámbito de la asignación** (spec §4.3, «Un límite, dicho ya»).
- Una pantalla **no ofrece** un formulario que su servidor vaya a rechazar; sin permiso de configurar, las lecturas siguen visibles.
- Worktree `~/Developer/nectar-worktrees/conceder-beneficio`, rama `conceder-beneficio`, nacida de `origin/editar-beneficio-2` = `4e68316`. El PR apunta a `editar-beneficio-2` hasta que #417 se fusione.
- Base de pruebas compartida `postgresql://postgres@127.0.0.1:55433/nectar_test`; nunca `reset`. `git commit -F`, archivo por archivo, contando el stat; nunca canalizar una compuerta. De un archivo `"use server"` sólo se exportan funciones `async`.

## Mapa de archivos

| archivo | qué |
|---|---|
| `lib/traceability/concesiones.ts` | **nuevo**: `personasDelBeneficio`, `concederEditarBeneficio`, `quitarEditarBeneficio`, `ConcesionError` |
| `lib/traceability/locations.ts` | booleanos `puedeEditarBeneficioEn`, `puedeEditarBeneficioEnOrganizacion` |
| `lib/traceability/beneficios.ts` | `listarBeneficios` devuelve `puedeEditar` por beneficio |
| `lib/traceability/instalaciones.ts` | `sitiosParaCrearInstalacion` |
| `app/actions/beneficios.ts` | acciones de conceder y quitar |
| `app/beneficio/ajustes/page.tsx`, `app/beneficio/ajustes/Concesiones.tsx` (nuevo) | acceso, renombrar sólo con permiso, sección de concesiones |
| `app/recipes/[id]/page.tsx`, `app/recipes/new/page.tsx` | formularios sólo con permiso |
| `app/instalaciones/nueva/page.tsx`, `app/instalaciones/[id]/page.tsx` | formularios sólo con permiso |
| `messages/es.json`, `messages/en.json` | textos nuevos |
| `tests/traceability/concesiones.test.ts` | **nuevo**, grupo `base-sembrada` |
| `scripts/pruebas-por-compuerta.txt`, `docs/architecture/DECISIONS.md`, `docs/arquitectura/inventario-de-acceso.md`, la spec | lo de siempre |

---

### Task 1: El servicio de concesiones

**Files:** Create `lib/traceability/concesiones.ts`, `tests/traceability/concesiones.test.ts`; Modify `scripts/pruebas-por-compuerta.txt`.

**Interfaces (produce):**
- `export class ConcesionError extends Error {}` — mensajes: `razon_obligatoria`, `asignacion_fuera_de_ambito`, `ya_lo_tiene`, `quitado_por_administracion`, `sin_concesion`, `no_es_beneficio`.
- `export async function personasDelBeneficio(actorId: string, beneficioId: string): Promise<PersonaDelBeneficio[]>` con `type PersonaDelBeneficio = { assignmentId: string; persona: string; perfil: string; ambito: string; estado: "de_serie" | "concedido" | "quitado_por_administracion" | "sin_permiso"; razon: string | null }`.
- `export async function concederEditarBeneficio(actorId: string, input: { beneficioId: string; assignmentId: string; reason: string })`.
- `export async function quitarEditarBeneficio(actorId: string, input: { beneficioId: string; assignmentId: string })`.

Las tres empiezan por `exigeEditarBeneficioEn(actorId, beneficioId)` (de `./locations`) y por comprobar que `beneficioId` es de tipo `beneficio` (`ConcesionError("no_es_beneficio")`).

**«Asignación que alcanza el beneficio»:** activa (`status: "active"`), con `scope.scopeType === "location"` y `scope.scopeRefId` en la cadena beneficio → padre → abuelo…, recorrida por `parentLocationId` con un `Set` de vistos. Cualquier otra → `asignacion_fuera_de_ambito`.

**Estado de una asignación:** `quitado_por_administracion` si hay override `deny` de `location:edit_beneficio`; `concedido` si hay override `grant` (con su `reason`); `de_serie` si su perfil tiene el permiso; si no, `sin_permiso`.

**Conceder:** razón recortada no vacía (`razon_obligatoria`); rechazar si `de_serie` (`ya_lo_tiene`) o `quitado_por_administracion`; si ya está `concedido`, actualizar la razón. `upsert` del override con `effect: "grant"`, `createdBy: actorId`, y `recordAuditEvent({ operation: "beneficio.conceder_edicion", entityType: "assignment_permission_override", entityId, after, reason, sourceInterface: "traceability.service" }, tx)` en la misma transacción.

**Quitar:** sólo si hay override `grant` de ese permiso en esa asignación (si no, `sin_concesion`); borrarlo y auditar `beneficio.quitar_edicion` con `before`, en la misma transacción.

- [ ] **Step 1: Pruebas que fallan** en `tests/traceability/concesiones.test.ts` (fixtures propias con el mismo estilo que `tests/traceability/editarBeneficio.test.ts`: `sitio`, `beneficio` bajo el sitio, `cuenta(locationId, perfil)`; `afterEach` que borra auditoría, overrides, asignaciones, scopes creados, cuentas, personas y ubicaciones por nombre; al final, cuentas en cero):
  1. un Farm Manager de la finca concede a un capataz de la finca **con razón** → el capataz pasa `exigeEditarBeneficioEn(capataz, beneficio)` (control: antes de conceder, no pasaba) y hay un `AuditEvent` `beneficio.conceder_edicion`;
  2. sin razón → `razon_obligatoria`, y no hay override;
  3. un capataz **no** puede conceder (a otro capataz) → `LocationAccessError("no_beneficio_edit_access")`;
  4. a una asignación de **otra** finca → `asignacion_fuera_de_ambito`;
  5. a un Farm Manager (de serie) → `ya_lo_tiene`;
  6. con un `deny` de administración ya puesto → `quitado_por_administracion`, y el `deny` sigue ahí;
  7. quitar una concesión → el capataz vuelve a ser rechazado y hay `AuditEvent` `beneficio.quitar_edicion`; quitar sin concesión → `sin_concesion`;
  8. `personasDelBeneficio` lista los estados correctos (capataz `sin_permiso` → `concedido` con su razón; Farm Manager `de_serie`); y un Farm Manager de **otra** finca no lo puede leer (`no_beneficio_edit_access`).
- [ ] **Step 2:** declarar el archivo en `scripts/pruebas-por-compuerta.txt` junto a `tests/traceability/editarBeneficio.test.ts`; verlas caer (módulo inexistente al principio: después de crear el archivo vacío con los exports, caer por aserción).
- [ ] **Step 3:** implementar según lo de arriba.
- [ ] **Step 4:** pasar; `npx tsc --noEmit` = 0.
- [ ] **Step 5:** commit `feat(beneficio): conceder y quitar editar beneficio, delegación estrecha`.

---

### Task 2: La pantalla de ajustes

**Files:** Modify `lib/traceability/locations.ts`, `lib/traceability/beneficios.ts`, `app/actions/beneficios.ts`, `app/beneficio/ajustes/page.tsx`, `messages/es.json`, `messages/en.json`; Create `app/beneficio/ajustes/Concesiones.tsx`; tests en `tests/traceability/concesiones.test.ts`.

- [ ] **Booleanos** en `locations.ts`: `export async function puedeEditarBeneficioEn(userId, locationId): Promise<boolean>` y `puedeEditarBeneficioEnOrganizacion(userId, orgId | null): Promise<boolean>` — llaman a las guardias y devuelven `false` sólo ante `LocationAccessError("no_beneficio_edit_access")`; cualquier otro error se relanza. Pruebas: `true`/`false` para Farm Manager y capataz, y capataz con concesión.
- [ ] **`listarBeneficios`** añade `puedeEditar: boolean` a cada fila (con `puedeEditarBeneficioEn`). Prueba: el capataz lo ve con `puedeEditar: false`; con concesión, `true`.
- [ ] **Acceso a la página:** hoy es 404 sin `sitiosParaBeneficio`. Pasa a: se muestra si `sitiosParaBeneficio` resuelve **o** algún beneficio de `listarBeneficios` tiene `puedeEditar`; si ninguna, 404 (se conserva el mensaje de «no hay sitios»). La sección «Crear» sólo aparece con sitios; «Renombrar» y la sección de concesiones, sólo en los beneficios con `puedeEditar`.
- [ ] **Acciones** en `app/actions/beneficios.ts` (sólo funciones `async` exportadas): `concederEdicionFormAction(state, form)` y `quitarEdicionFormAction(state, form)`, que llaman al servicio, traducen `ConcesionError`/`LocationAccessError` a `{ error: <mensaje> }`, y en éxito `revalidatePath("/beneficio/ajustes")` + `redirect("/beneficio/ajustes?ok=concesion")`.
- [ ] **`Concesiones.tsx`** (componente cliente con `useActionState`, mismo estilo que `FormularioBeneficio.tsx`): recibe la lista de `personasDelBeneficio` y el `beneficioId`; por persona muestra nombre, perfil, ámbito y estado en palabras; `sin_permiso` → formulario con campo de razón (obligatorio) y botón «Conceder»; `concedido` → razón y botón «Quitar»; `de_serie` y `quitado_por_administracion` → sólo el texto. Debajo, una línea fija: la concesión vale para todo el ámbito de la asignación de esa persona.
- [ ] **Textos** en `AjustesDelBeneficio` de `messages/es.json` y `messages/en.json`, con las mismas claves en los dos (hay una prueba de paridad; correrla): título de la sección, los cuatro estados, «Razón», «Conceder», «Quitar», la línea del alcance, y un texto por cada mensaje de error de `ConcesionError`.
- [ ] **Compuertas:** pruebas de la tarea, `tsc`, `npm run build` (una página con componente cliente: `vitest` no lo ve), y el guardia `tests/arquitectura/use-server-solo-async.test.ts`.
- [ ] Commit `feat(beneficio): conceder editar beneficio desde ajustes`.

---

### Task 3: Recetas e instalaciones no ofrecen lo que no se puede guardar

**Files:** Modify `lib/traceability/instalaciones.ts`, `app/recipes/[id]/page.tsx`, `app/recipes/new/page.tsx`, `app/instalaciones/nueva/page.tsx`, `app/instalaciones/[id]/page.tsx`, `messages/*.json`; tests.

- [ ] **`sitiosParaCrearInstalacion(userId)`** en `instalaciones.ts`: los sitios de `sitiosParaInstalaciones` en los que además `puedeEditarBeneficioEn` es `true`; lista vacía si ninguno (no lanza). `sitiosParaInstalaciones` **no cambia** (la usa `listarInstalaciones`, que es lectura). Prueba: capataz → `[]`; con concesión → su sitio; Farm Manager → su sitio.
- [ ] **`/instalaciones/nueva`**: usa `sitiosParaCrearInstalacion`; vacía → texto «Para crear una instalación hace falta el permiso de editar el beneficio», sin formulario.
- [ ] **`/instalaciones/[id]`**: los formularios de editar la instalación y de añadir cama sólo si `puedeEditarBeneficioEn(user, id)`; si no, el mismo texto. El detalle (lectura) se sigue viendo.
- [ ] **`/recipes/[id]`**: `RecipeMetadataForm` y `RecipeVersionForm` sólo si `puedeEditarBeneficioEnOrganizacion(user, recipe.organizationId)`; si no, un texto equivalente. La receta se sigue viendo.
- [ ] **`/recipes/new`**: filtrar `organizations` a las que pasan `puedeEditarBeneficioEnOrganizacion` (incluida la opción de receta compartida sólo si pasa con `null`); vacía → el texto, sin formulario.
- [ ] Textos en los dos idiomas; `tsc`, `npm run build`, pruebas; commit `fix(beneficio): recetas e instalaciones sólo ofrecen formularios a quien puede guardar`.

---

### Task 4: Spec, ADR, inventario, compuerta y flip-tests

- [ ] **Spec** §4.3: marcar «Cómo se concede» como construido, con los tres rulings de las Global Constraints (quién decide si cambian: Daniel).
- [ ] **ADR** con el siguiente número libre en ese momento: la delegación estrecha, los tres rulings, y que las pantallas usan booleanos sobre las mismas guardias.
- [ ] **Inventario**: `node scripts/inventario-de-acceso.mjs`; escribir sus cifras si cambian; si pide una entrada de allowlist para `concesiones.ts`, añadirla con su razón (módulo de dominio; escritura y auditoría en la misma transacción; delegación estrecha).
- [ ] **Compuerta:** `tsc`, `verify`, `build`, `npm test` (con `SHADOW_DATABASE_URL`), `scripts/ci.sh`; `grep -c concesiones` en la salida de CI debe ser 0.
- [ ] Commit; **flip-tests** contra el commit, con sha, `tsc` y prueba caída por su nombre:

| mutación | debe caer |
|---|---|
| quitar `exigeEditarBeneficioEn` de `concederEditarBeneficio` | «un capataz no puede conceder» |
| aceptar cualquier asignación (sin la comprobación de ámbito) | «a una asignación de otra finca» |
| dejar que conceder sobrescriba un `deny` | «con un deny de administración» |
| no exigir razón | «sin razón» |
| en `sitiosParaCrearInstalacion`, devolver `sitiosParaInstalaciones` sin filtrar | su prueba del capataz |
