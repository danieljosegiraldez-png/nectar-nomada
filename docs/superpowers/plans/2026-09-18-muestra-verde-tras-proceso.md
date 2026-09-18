# Muestra de café verde tras proceso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rechazar, en el servicio (no sólo en la pantalla), una muestra declarada `MaterialState.GREEN` cuando el lote de origen no ha llegado a la fase de reposo/almacenamiento; dar a la pantalla de creación de muestra el campo que hace falta para declarar ese material; añadir un servicio de retiro de muestra con su rastro de auditoría; excluir las muestras retiradas de la cata; y dejar un guion de un solo uso, sin ejecutar, para retirar la muestra `111` en producción.

**Architecture:** El guardia vive en `lib/traceability/samples.ts::createSampleFromLot`, que ya recibe `materialState` en su input pero no lo contrasta con nada. Lee la fase real del lote con una consulta nueva y pequeña (`faseActualDeLote`, privada al módulo) que reconstruye las mismas tres entradas que `faseDelLote()` (`lib/beneficio/reposo.ts`) ya espera —fermentación abierta, secado abierto, último secado terminado— para UN lote, en vez de para el listado de operaciones activas de toda la cuenta que ya existe en `lib/traceability/lots.ts::getActiveOperations`. El retiro de muestra sigue el molde exacto de `retirarPatron` en `lib/equipos/equipos.ts`: una columna `retiredAt`, nunca una edición en su sitio, con el motivo en el `AuditEvent` y no en una columna nueva. El guion de datos sigue el molde de `scripts/p0-flag-overstated-lots.ts`.

**Tech Stack:** TypeScript, Next.js (Server Actions), Prisma/PostgreSQL, Vitest contra Postgres real (sin mocks), `next-intl` para los textos en español/inglés.

**Spec:** `docs/beneficio/20_modelo_ciclo_completo.md` §2 y `docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md` (fusionado en `main` en `04ceffa`) — este plan implementa exactamente lo que ese spec aprobado fija, con las cinco decisiones de Daniel del mismo día ya incorporadas: bloquea (no avisa), sin permiso de anulación, la fase real es la de `faseDelLote`, y la muestra `111` se retira.

## Global Constraints

- Node no está en el PATH: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` antes de cualquier `npm`/`npx`.
- Un worktree nuevo no trae `node_modules`: `npm ci` antes de correr nada de este plan.
- Nunca `git add -A`; se añade archivo por archivo. `git commit -F <archivo>`, nunca `-m` con backticks o comillas dentro.
- Encadenar la compuerta al commit, nunca canalizarla: `npm test; test $? -eq 0 && git commit -F msg.txt`, jamás `npm test | grep ... && git commit`.
- Nombres de función y de test en español, siguiendo la convención ya establecida en `lib/traceability/samples.ts`, `lib/beneficio/reposo.ts` y `lib/equipos/equipos.ts` (`retirarPatron`, `faseDelLote`, `evaluarReposo`).
- Ningún nombre de estado o de error nuevo que no exista ya en el código o en `docs/beneficio/03_public_api.md`: la fase se compara contra el literal `"reposo"` que `lib/beneficio/reposo.ts`/`app/lots/[id]/page.tsx` ya usan — no se inventa un estado `"ALMACENAMIENTO"`.
- El bloqueo es absoluto: sin permiso de anulación (decisión de Daniel, 2026-09-18, pregunta 5 del spec).
- El guion de datos usa `--aplicar` (no `--apply`) y modo de ensayo por defecto — instrucción explícita del encargo, aunque el molde que sigue (`scripts/p0-flag-overstated-lots.ts`) usa `--apply` en inglés.
- El guion de datos **no se ejecuta** en este plan, ni en modo de ensayo: Daniel lo corre él mismo contra producción una vez fusionado.
- No se toca la base de datos fuera de la copia local de pruebas (`TEST_DATABASE_URL`) que cada tarea con código necesita para su propia suite.
- Toda prueba nueva que necesite base ya cae dentro de un archivo que **ya está** en el grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt` (`tests/traceability/samples.test.ts`, `tests/sensory/crearSesion.test.ts`) — ninguna tarea de este plan crea un archivo de test nuevo, así que `scripts/pruebas-por-compuerta.txt` no se toca. Si algún ejecutor decide dividir un archivo, tiene que añadir la ruta nueva a ese grupo antes de commitear.
- La última tarea corre `npm run verify` y `npm run build` sin canalizar, leyendo el código de salida.

---

## Task 1: Guardia en el servicio — rechazar la muestra verde antes de almacenamiento

**Files:**
- Modify: `lib/traceability/samples.ts:21-134` (imports, y el cuerpo de `createSampleFromLot`)
- Test: `tests/traceability/samples.test.ts` (archivo existente, ya en `base-sembrada`)

**Interfaces:**
- Consumes: `faseDelLote` y su tipo `FaseDelLote` de `lib/beneficio/reposo.ts` (ya existen, sin cambios); `prisma.lotTransformation`, `prisma.fermentationRun`, `prisma.dryingRun` (ya existen).
- Produces: una función privada nueva `faseActualDeLote(lotId: string): Promise<import("../beneficio/reposo").FaseDelLote | null>` en `lib/traceability/samples.ts`, no exportada — ninguna tarea posterior la necesita fuera de este archivo. `createSampleFromLot` sigue con la misma firma pública; lo único que cambia es que ahora puede lanzar `SampleValidationError("green_sample_before_reposo")`.

- [ ] **Step 1: Escribir las pruebas en rojo**

Añadir, dentro de `tests/traceability/samples.test.ts`, dos cambios: (a) los imports nuevos que las pruebas necesitan, y (b) una extensión del `afterAll` compartido para no dejar `DryingRun` huérfanos — hoy ese `afterAll` borra `sample`, `quantityEvent`, `lotTransformation` y `lot`, pero ninguna prueba existente crea un `DryingRun`, así que nunca hizo falta borrarlo. Las pruebas nuevas sí lo crean.

Import nuevo, junto a los que ya existen en la cabecera del archivo:

```typescript
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
```

`afterAll` actual (líneas 65-84) pasa de esto:

```typescript
afterAll(async () => {
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
  });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  // ... resto sin cambios
```

a esto — la única diferencia es la línea que captura `dryingRunIds` **antes** de borrar las transformaciones que los referencian, y la línea que los borra **después**, siguiendo la regla de la casa de nunca dejar basura huérfana entre corridas:

```typescript
afterAll(async () => {
  const testLots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const lotIds = testLots.map((l) => l.id);

  const transformacionesConSecado = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
    select: { dryingRunId: true },
  });
  const dryingRunIds = [...new Set(transformacionesConSecado.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] }),
  });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: dryingRunIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });
  // ... resto sin cambios, NO TOCAR
```

Y las cuatro pruebas nuevas, añadidas como un `describe` nuevo dentro del archivo (después del `describe("createSampleFromLot — lineage, RBAC, quantity accounting", ...)` que ya existe, al mismo nivel):

```typescript
describe("createSampleFromLot — la muestra verde exige almacenamiento (2026-09-18)", () => {
  it("rechaza una muestra verde si el lote nunca terminó de secar", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-sin-secar`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });

    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-1`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("rechaza una muestra verde si el secado está en curso", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-secando`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(),
      provenanceClass: "original_record",
    });

    await expect(
      createSampleFromLot(authorizedUserAccountId, {
        provenanceClass: "original_record",
        sampleCode: `${RUN_ID}-S-verde-2`,
        sampleType: "green_coffee",
        materialState: "GREEN",
        sourceLotId: lot.id,
        occurredAt: new Date(),
      }),
    ).rejects.toThrow(SampleValidationError);
  });

  it("acepta una muestra verde cuando el secado terminó con humedad objetivo", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-verde-reposo`,
      lotType: "drying",
      organizationId,
      projectId: projectAId,
    });
    const { run } = await startDryingRun(authorizedUserAccountId, {
      lotId: lot.id,
      startedAt: new Date(Date.now() - 86_400_000),
      provenanceClass: "original_record",
    });
    await endDryingRun(authorizedUserAccountId, {
      dryingRunId: run.id,
      endedAt: new Date(),
      endedOutcome: "target_reached",
      outputLotCode: `${RUN_ID}-verde-reposo-salida`,
      outputLotType: "green",
      provenanceClass: "original_record",
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-verde-3`,
      sampleType: "green_coffee",
      materialState: "GREEN",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    expect(sample.materialState).toBe("GREEN");
  });

  it("control: una muestra de proceso (no verde) NO exige almacenamiento", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-proceso-sin-secar`,
      lotType: "processing",
      organizationId,
      projectId: projectAId,
    });

    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-proceso-1`,
      sampleType: "ph_check",
      materialState: "MUCILAGE_HONEY",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    expect(sample.materialState).toBe("MUCILAGE_HONEY");
  });
});
```

La última prueba (`control:`) es el control positivo: si el guardia estuviera mal —bloqueando cualquier muestra, no sólo las verdes— esta prueba lo delataría, porque el lote tampoco secó y aun así debe aceptarse.

- [ ] **Step 2: Correr las pruebas y confirmar el rojo**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npx vitest run tests/traceability/samples.test.ts
```

Esperado: las dos primeras del `describe` nuevo (`rechaza una muestra verde si el lote nunca terminó de secar`, `rechaza una muestra verde si el secado está en curso`) **fallan** — `createSampleFromLot` hoy no lanza nada, así que `rejects.toThrow(SampleValidationError)` no se cumple. La tercera y la de control ya **pasan** hoy, porque hoy no hay guardia que las bloquee — no son rojas por diseño, son el control de que el guardia que se va a añadir no rompe lo que ya funciona.

- [ ] **Step 3: Implementar el guardia**

En `lib/traceability/samples.ts`, añadir el import de `faseDelLote` junto a los que ya existen (línea 24):

```typescript
import { scopeTargetsFor, TraceabilityAccessError, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import { faseDelLote } from "../beneficio/reposo";
```

Añadir la función privada, después de `requireSampleAccess` (después de la línea 41, antes de `export interface CreateSampleFromLotInput`):

```typescript
/**
 * La fase actual del lote —fermentación, secado o reposo— leída de sus
 * corridas reales, nunca de un campo que el lote no tiene: "current stage is
 * always derived by querying this lot's LotTransformation history" (comentario
 * de `prisma/schema.prisma` sobre `Lot.status`). Misma consulta que
 * `app/lots/[id]/page.tsx` ya hace para pintar la ficha del lote, resuelta
 * aquí para UN lote — no para el listado de operaciones activas de toda la
 * cuenta que ya expone `getActiveOperations`.
 */
async function faseActualDeLote(lotId: string) {
  const transformaciones = await prisma.lotTransformation.findMany({
    where: { OR: [{ inputs: { some: { lotId } } }, { outputs: { some: { lotId } } }] },
    select: { fermentationRunId: true, dryingRunId: true },
  });
  const fermentationRunIds = [...new Set(transformaciones.map((t) => t.fermentationRunId).filter((id): id is string => id != null))];
  const dryingRunIds = [...new Set(transformaciones.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  const [fermentationRuns, dryingRuns] = await Promise.all([
    fermentationRunIds.length
      ? prisma.fermentationRun.findMany({ where: { id: { in: fermentationRunIds } }, select: { startedAt: true, endedAt: true } })
      : Promise.resolve([]),
    dryingRunIds.length
      ? prisma.dryingRun.findMany({ where: { id: { in: dryingRunIds } }, select: { startedAt: true, endedAt: true, endedOutcome: true } })
      : Promise.resolve([]),
  ]);

  const fermentacionAbierta = fermentationRuns.find((r) => r.endedAt === null) ?? null;
  const secadoAbierto = dryingRuns.find((r) => r.endedAt === null) ?? null;
  const secadosTerminados = dryingRuns
    .flatMap((r) => (r.endedAt === null ? [] : [{ endedAt: r.endedAt, endedOutcome: r.endedOutcome }]))
    .sort((x, y) => y.endedAt.getTime() - x.endedAt.getTime());

  return faseDelLote({
    fermentacionAbierta,
    secadoAbierto,
    ultimoSecadoTerminado: secadosTerminados[0] ?? null,
  });
}
```

Y dentro de `createSampleFromLot`, entre `await requireSampleAccess(...)` (línea 73) y `const provenanceClass = input.provenanceClass;` (línea 75), añadir:

```typescript
  await requireSampleAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  // Decisión de Daniel, 2026-09-18 (docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md
  // §3-4): una muestra de café VERDE sólo es válida si el lote ya llegó a
  // almacenamiento — secado terminado con humedad objetivo, la fase "reposo"
  // que `faseDelLote` ya calcula. Bloquea, sin permiso de anulación: una
  // muestra tomada antes es de humedad o de proceso, no verde.
  if (input.materialState === "GREEN") {
    const fase = await faseActualDeLote(input.sourceLotId);
    if (fase?.tipo !== "reposo") {
      throw new SampleValidationError("green_sample_before_reposo");
    }
  }

  const provenanceClass = input.provenanceClass;
```

- [ ] **Step 4: Correr las pruebas y confirmar el verde**

```bash
npx vitest run tests/traceability/samples.test.ts
```

Esperado: todas pasan, incluidas las cuatro nuevas y las que ya existían antes de esta tarea.

- [ ] **Step 5: Flip-test**

Mutación exacta: en el `if` que se acaba de añadir, cambiar `fase?.tipo !== "reposo"` por `fase?.tipo === "reposo"` (invertir el operador).

```bash
npx vitest run tests/traceability/samples.test.ts -t "verde"
```

Esperado: caen, **por su nombre**, `rechaza una muestra verde si el lote nunca terminó de secar`, `rechaza una muestra verde si el secado está en curso` (ahora aceptan lo que debían rechazar) y `acepta una muestra verde cuando el secado terminó con humedad objetivo` (ahora rechaza lo que debía aceptar). Revertir la mutación antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add lib/traceability/samples.ts
git add tests/traceability/samples.test.ts
git diff --cached --stat   # exactamente 2 archivos
git commit -F <archivo-de-mensaje>
```

Mensaje sugerido (en un archivo, no en `-m`):

```
Rechazar la muestra verde antes de que el lote llegue a almacenamiento

Guardia en createSampleFromLot (lib/traceability/samples.ts): una muestra
declarada MaterialState.GREEN se rechaza si faseActualDeLote(lotId) no
devuelve "reposo" — el secado terminado con humedad objetivo que
faseDelLote (lib/beneficio/reposo.ts) ya calcula. Bloquea sin permiso de
anulación, decisión de Daniel del 2026-09-18. Cuatro pruebas nuevas en
tests/traceability/samples.test.ts, con su control positivo (una muestra
no verde de un lote sin secar sigue aceptándose).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 2: La pantalla pide el estado del material, y el rechazo se lee en español

**Files:**
- Modify: `app/components/traceability/SampleForm.tsx` (las 42 líneas completas)
- Modify: `app/actions/traceability.ts:88-93` (imports), `~584-611` (`createSampleAction`), `~118-143` (`friendlyError`)
- Modify: `messages/es.json` (junto a la línea `"error_sample":`), `messages/en.json` (la misma línea)

**Interfaces:**
- Consumes: `MATERIALES` de `lib/traceability/avisoDeModo.ts` (ya existe, sin cambios — el mismo array que `MeasurementForm.tsx` ya usa); `SampleValidationError` de `lib/traceability/samples.ts` (la de Task 1, no la de `lib/traceability/soilSamples.ts`, que es una clase DISTINTA con el mismo nombre — ver Step 3).
- Produces: el formulario manda `materialState` en el `FormData`; `createSampleAction` lo pasa a `createSampleFromLot`; `friendlyError` sabe traducir `SampleValidationError("green_sample_before_reposo")` a un texto legible.

**Nota sobre pruebas — declarado, no silenciado.** Este repositorio no tiene NINGÚN archivo `.test.tsx` ni ninguna prueba de `app/actions/*.ts` (medido: `find tests app -iname "*.test.tsx"` no devuelve nada, y `grep -rn "createSampleAction\|friendlyError" tests/` tampoco). Seguir la convención de la casa —"in existing codebases, follow established patterns"— significa NO inventar aquí un arnés de pruebas de componente que no existe en ningún otro sitio del repositorio. La verificación de esta tarea es `npm run typecheck` (que sí cubre JSX y los tipos del `FormData`) más una comprobación manual concreta en el Step 6, no un test automatizado.

- [ ] **Step 1: Añadir el campo al formulario**

`app/components/traceability/SampleForm.tsx` completo, reemplazando el archivo entero:

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { createSampleAction, type TraceabilityActionState } from "../../actions/traceability";
import { MATERIALES } from "../../../lib/traceability/avisoDeModo";

const initialState: TraceabilityActionState = {};

export function SampleForm({ lotId }: { lotId: string }) {
  const [state, formAction, pending] = useActionState(createSampleAction, initialState);
  const t = useTranslations("Traceability");

  return (
    <form action={formAction} className="nn-form" style={{ maxWidth: 480 }}>
      <input type="hidden" name="lotId" value={lotId} />
      <div className="nn-field">
        <label htmlFor="sm-sampleCode">{t("sampleCodeLabel")}</label>
        <input id="sm-sampleCode" name="sampleCode" type="text" required />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-sampleType">{t("sampleTypeLabel")}</label>
        <input id="sm-sampleType" name="sampleType" type="text" required placeholder="green_coffee" />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-materialState">{t("materialStateLabel")}</label>
        <select id="sm-materialState" name="materialState" defaultValue="">
          <option value="">{t("notDeclaredOption")}</option>
          {MATERIALES.map((m) => (
            <option key={m} value={m}>
              {t(`material_${m}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="nn-field">
        <label htmlFor="sm-quantity">{t("quantityLabel")}</label>
        <input id="sm-quantity" name="quantity" type="number" inputMode="decimal" step="0.001" />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-unit">{t("unitLabel")}</label>
        <input id="sm-unit" name="unit" type="text" placeholder="kg" />
      </div>
      <div className="nn-field">
        <label htmlFor="sm-notes">{t("notesLabel")}</label>
        <textarea id="sm-notes" name="notes" rows={2} />
      </div>
      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>
        {t("createSampleButton")}
      </button>
    </form>
  );
}
```

`MATERIALES` es `["CHERRY", "MUCILAGE_HONEY", "PARCHMENT", "GREEN"]` (`lib/traceability/avisoDeModo.ts:4`) y `materialStateLabel`/`notDeclaredOption`/`material_GREEN` etc. ya existen en `messages/{es,en}.json` dentro del namespace `Traceability` — es el mismo desplegable que `MeasurementForm.tsx` ya pinta, sin el estado ni la lógica de "otro material de otra etapa" que ese formulario necesita y éste no.

- [ ] **Step 2: Pasar el campo a `createSampleFromLot`**

`app/actions/traceability.ts`, dentro de `createSampleAction` (línea ~594):

```typescript
    await createSampleFromLot(user.userAccountId, {
      sampleCode: String(formData.get("sampleCode") ?? ""),
      sampleType: String(formData.get("sampleType") ?? ""),
      materialState: emptyToNull(formData.get("materialState")) as import("../../generated/prisma/client").MaterialState | null,
      sourceLotId: lotId,
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: "original_record",
    });
```

(La misma forma exacta de cast que ya usa `recordMeasurementAction` unas líneas más abajo en el mismo archivo, para el mismo campo.)

- [ ] **Step 3: Arreglar la colisión de nombres — sin esto, el rechazo no se lee en español, revienta**

**Hallazgo, no pedido, pero necesario para que esta tarea funcione.** `lib/traceability/samples.ts` y `lib/traceability/soilSamples.ts` declaran, cada uno, su propia `export class SampleValidationError extends Error {}` — dos clases DISTINTAS con el mismo nombre. `app/actions/traceability.ts` línea 91 importa la de `soilSamples.ts`, y `friendlyError` (línea 138) comprueba `instanceof` contra ESA. Hasta hoy eso nunca importó porque ninguna acción de este archivo llamaba a una función de `samples.ts` que lanzara su propio `SampleValidationError` — `createSampleFromLot` sólo lanzaba `TraceabilityAccessError`. La Task 1 cambia eso: ahora `createSampleFromLot` SÍ puede lanzar la `SampleValidationError` de `samples.ts`, que `instanceof SampleValidationError` (la de `soilSamples.ts`) NO reconoce — el error caería en el `throw error;` final de `friendlyError` y rompería la acción sin mensaje en español.

Cambiar la línea de import (línea 93):

```typescript
import { createSampleFromLot } from "../../lib/traceability/samples";
```

por:

```typescript
import { createSampleFromLot, SampleValidationError as SampleFromLotValidationError } from "../../lib/traceability/samples";
```

Y en `friendlyError` (línea 138), añadir DOS líneas nuevas justo antes de la que ya existe para la `SampleValidationError` de `soilSamples.ts` — se deja esa línea intacta, es de una clase distinta y sigue siendo correcta para lo que ya cubría:

```typescript
  if (error instanceof SampleFromLotValidationError && error.message === "green_sample_before_reposo") {
    return t("error_sample_green_before_reposo");
  }
  if (error instanceof SampleFromLotValidationError) return t("error_sample", { detail: error.message });
  if (error instanceof SampleValidationError) return t("error_sample", { detail: error.message });
```

- [ ] **Step 4: El texto en español (y en inglés, que el archivo ya lleva los dos)**

`messages/es.json`, en la línea que ya dice `"error_sample": "No se pudo guardar la muestra: {detail}",` (dentro del namespace `Traceability`), añadir justo después:

```json
    "error_sample": "No se pudo guardar la muestra: {detail}",
    "error_sample_green_before_reposo": "La muestra declara café verde, pero el lote todavía no llegó a almacenamiento: el secado no ha terminado con la humedad objetivo. No se puede registrar como muestra verde hasta entonces.",
```

`messages/en.json`, en la línea equivalente `"error_sample": "Could not save the sample: {detail}",`:

```json
    "error_sample": "Could not save the sample: {detail}",
    "error_sample_green_before_reposo": "The sample declares green coffee, but the lot has not yet reached storage: drying has not finished at the target moisture. It cannot be recorded as a green sample until then.",
```

- [ ] **Step 5: Verificar que compila**

```bash
npm run typecheck
```

Esperado: salida 0. Cubre el cast de `materialState`, el JSX del `<select>` nuevo y el alias de import — es lo único mecánicamente verificable sin un arnés de pruebas de componente (ver la nota al principio de esta tarea).

- [ ] **Step 6: Verificación manual — el único paso posible dado que no hay arnés para esta capa**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run dev:local
```

En el navegador: entrar a un lote que NO tenga un secado terminado, ir a "Crear Muestra", elegir "Café verde" en el desplegable nuevo, completar código y tipo, enviar. Esperado: la página no navega, y bajo el formulario aparece exactamente `No se pudo guardar la muestra: green_sample_before_reposo`... **no** — aparece el texto de `error_sample_green_before_reposo`: *"La muestra declara café verde, pero el lote todavía no llegó a almacenamiento: el secado no ha terminado con la humedad objetivo. No se puede registrar como muestra verde hasta entonces."* Repetir con "Pergamino" o sin declarar material: la muestra se crea y la página vuelve a `/lots/<id>`.

- [ ] **Step 7: Commit**

```bash
git add app/components/traceability/SampleForm.tsx
git add app/actions/traceability.ts
git add messages/es.json
git add messages/en.json
git diff --cached --stat   # exactamente 4 archivos
git commit -F <archivo-de-mensaje>
```

```
Pedir el estado del material en Crear Muestra, y traducir el rechazo

SampleForm.tsx gana un desplegable de materialState, con el mismo
MATERIALES que MeasurementForm.tsx ya usa. createSampleAction lo pasa a
createSampleFromLot. Y una colisión de nombres real: lib/traceability/
samples.ts y lib/traceability/soilSamples.ts declaran cada uno su propia
clase SampleValidationError, y friendlyError sólo conocía la de
soilSamples — el rechazo de la Task 1 habría reventado sin mensaje.
Import con alias + dos líneas nuevas en friendlyError, y el texto en
español/inglés de la nueva compuerta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 3: Retirar una muestra — servicio, columna, auditoría

**Files:**
- Create: `prisma/migrations/20260918130000_muestra_retirada/migration.sql`
- Modify: `prisma/schema.prisma` (modelo `Sample`, cerca de la línea 6031 donde vive `classification`)
- Modify: `lib/traceability/samples.ts` (nueva función, después de `createSampleFromLot`)
- Test: `tests/traceability/samples.test.ts` (mismo archivo de la Task 1)

**Interfaces:**
- Consumes: `recordAuditEvent` (`lib/audit.ts`, sin cambios), `requireSampleAccess` (privada en `samples.ts`, ya existe).
- Produces: `export async function retirarMuestra(userAccountId: string, sampleId: string, cuando: Date, motivo: string): Promise<Sample>` en `lib/traceability/samples.ts` — la usa el guion de datos de la Task 5 y los tests de exclusión de la Task 4.

- [ ] **Step 1: Esquema — añadir la columna**

En `prisma/schema.prisma`, dentro del modelo `Sample`, la línea `classification ClassificationLevel @default(internal)` pasa de:

```prisma
  status         RecordStatus        @default(draft)
  classification ClassificationLevel @default(internal)
  createdAt      DateTime            @default(now()) @map("created_at")
```

a:

```prisma
  status         RecordStatus        @default(draft)
  classification ClassificationLevel @default(internal)
  /// Con rastro, nunca editada en su sitio — mismo principio que
  /// `InstrumentCheckRequirement.retiredAt` (`lib/equipos/equipos.ts::retirarPatron`).
  /// El motivo va al `AuditEvent` de la operación `sample.retire`, no a una
  /// columna nueva aquí: es la misma decisión que ya toma `recordAuditEvent`
  /// para cualquier corrección con causa.
  retiredAt      DateTime?           @map("retired_at")
  createdAt      DateTime            @default(now()) @map("created_at")
```

- [ ] **Step 2: La migración, a mano — una sola columna nulable no necesita `prisma migrate dev`**

Crear el directorio y el archivo:

```bash
mkdir -p prisma/migrations/20260918130000_muestra_retirada
```

`prisma/migrations/20260918130000_muestra_retirada/migration.sql`:

```sql
-- Decisión de Daniel, 2026-09-18: una muestra se retira, nunca se borra ni se
-- edita en su sitio. docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md §6.

-- AlterTable
ALTER TABLE "core"."sample" ADD COLUMN "retired_at" TIMESTAMP(3);
```

- [ ] **Step 3: Aplicar la migración a la base de pruebas y regenerar el cliente**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run test:db -- up
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 4: Comprobar que no hay deriva entre el esquema y las migraciones**

```bash
npx vitest run tests/derivaDeMigraciones.test.ts
```

Esperado: pasa. Es el guardia que ya existe en el repositorio para exactamente este riesgo — que la migración a mano no diga lo mismo que `schema.prisma`.

- [ ] **Step 5: Escribir las pruebas en rojo**

Dentro de `tests/traceability/samples.test.ts`, un `describe` nuevo (después del que añadió la Task 1):

```typescript
describe("retirarMuestra", () => {
  it("marca retiredAt y escribe su AuditEvent en la misma transacción", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-para-retirar`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-retiro-1`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    const cuando = new Date();
    const retirada = await retirarMuestra(authorizedUserAccountId, sample.id, cuando, "TEST: motivo de prueba");

    expect(retirada.retiredAt?.toISOString()).toBe(cuando.toISOString());

    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "sample", entityId: sample.id, operation: "sample.retire" },
      orderBy: { createdAt: "desc" },
    });
    expect(evento?.reason).toBe("TEST: motivo de prueba");
    expect(evento?.actorUserAccountId).toBe(authorizedUserAccountId);
  });

  it("rechaza retirar dos veces la misma muestra", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-doble-retiro`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-retiro-2`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });
    await retirarMuestra(authorizedUserAccountId, sample.id, new Date(), "TEST: primer retiro");

    await expect(
      retirarMuestra(authorizedUserAccountId, sample.id, new Date(), "TEST: segundo retiro"),
    ).rejects.toThrow(SampleValidationError);
  });

  it("deniega retirar una muestra fuera del ámbito del operador", async () => {
    const lot = await createLot(authorizedUserAccountId, {
      lotCode: `${RUN_ID}-retiro-ajeno`,
      lotType: "green",
      organizationId,
      projectId: projectAId,
    });
    const { sample } = await createSampleFromLot(authorizedUserAccountId, {
      provenanceClass: "original_record",
      sampleCode: `${RUN_ID}-S-retiro-3`,
      sampleType: "green_coffee",
      sourceLotId: lot.id,
      occurredAt: new Date(),
    });

    await expect(
      retirarMuestra(wrongProjectUserAccountId, sample.id, new Date(), "TEST: intento ajeno"),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});
```

Añadir `retirarMuestra` al import ya existente de `createSampleFromLot` en la cabecera del test:

```typescript
import { createSampleFromLot, retirarMuestra } from "../../lib/traceability/samples";
```

- [ ] **Step 6: Correr y confirmar el rojo**

```bash
npx vitest run tests/traceability/samples.test.ts -t "retirarMuestra"
```

Esperado: falla al importar — `retirarMuestra` no existe todavía en `lib/traceability/samples.ts`.

- [ ] **Step 7: Implementar `retirarMuestra`**

En `lib/traceability/samples.ts`, después del cierre de `createSampleFromLot` (después de la línea 134) y antes del comentario `// --- External coffee (S1, ...) ---`:

```typescript
/**
 * Retirar una muestra. Con rastro, nunca editada en su sitio ni borrada —
 * mismo principio que `retirarPatron` en `lib/equipos/equipos.ts`: una vez
 * que algo se usó (aquí, pudo entrar en una cata o en un reporte), editarlo
 * en su sitio borra la historia. `motivo` va al `AuditEvent`, no a una
 * columna nueva de la muestra.
 */
export async function retirarMuestra(userAccountId: string, sampleId: string, cuando: Date, motivo: string) {
  const muestra = await prisma.sample.findUnique({ where: { id: sampleId } });
  if (!muestra) throw new TraceabilityAccessError("sample_not_found");

  await requireSampleAccess(userAccountId, "manage", [
    { projectId: muestra.projectId, locationId: muestra.locationId, classification: muestra.classification },
  ]);

  if (muestra.retiredAt) throw new SampleValidationError("sample_already_retired");

  return prisma.$transaction(async (tx) => {
    const retirada = await tx.sample.update({
      where: { id: sampleId },
      data: { retiredAt: cuando },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        entityType: "sample",
        entityId: sampleId,
        operation: "sample.retire",
        reason: motivo,
        before: { retiredAt: muestra.retiredAt },
        after: { retiredAt: cuando.toISOString() },
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return retirada;
  });
}
```

- [ ] **Step 8: Correr y confirmar el verde**

```bash
npx vitest run tests/traceability/samples.test.ts
```

Esperado: pasa todo el archivo, incluidas las pruebas de la Task 1.

- [ ] **Step 9: Flip-test**

Mutación exacta: quitar el `await recordAuditEvent(...)` de dentro de la transacción (dejando sólo el `update` y el `return retirada;`).

```bash
npx vitest run tests/traceability/samples.test.ts -t "retirarMuestra"
```

Esperado: cae, **por su nombre**, `marca retiredAt y escribe su AuditEvent en la misma transacción` — sigue marcando `retiredAt` pero ya no encuentra el `AuditEvent`. Revertir la mutación.

- [ ] **Step 10: Commit**

```bash
git add prisma/schema.prisma
git add prisma/migrations/20260918130000_muestra_retirada/migration.sql
git add lib/traceability/samples.ts
git add tests/traceability/samples.test.ts
git diff --cached --stat   # exactamente 4 archivos
git commit -F <archivo-de-mensaje>
```

```
Retirar una muestra, con su columna y su rastro de auditoría

Sample.retiredAt (nullable, migración a mano — una sola columna no
necesita prisma migrate dev), y retirarMuestra en lib/traceability/
samples.ts: el mismo molde que retirarPatron en lib/equipos/equipos.ts —
nunca se edita en su sitio, el motivo va al AuditEvent de la operación
sample.retire, dentro de la misma transacción. Tres pruebas: marca y
audita, rechaza el doble retiro, deniega fuera de ámbito.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 4: La cata no ofrece ni acepta una muestra retirada

**Files:**
- Modify: `lib/sensory/sessions.ts:115-186` (`muestrasVisibles`), `~248-256` (`crearSesionDeCata`)
- Test: `tests/sensory/crearSesion.test.ts` (archivo existente, ya en `base-sembrada`)

**Interfaces:**
- Consumes: `retirarMuestra` de `lib/traceability/samples.ts` (Task 3).
- Produces: sin cambio de firma pública en `muestrasVisibles`/`listarMuestrasParaCata`/`buscarMuestrasParaCata`/`crearSesionDeCata` — sólo cambia qué filas ven y qué rechazan. `SesionDeCataError` gana un código nuevo, `"sample_retired"`.

- [ ] **Step 1: Escribir las pruebas en rojo**

En `tests/traceability/../sensory/crearSesion.test.ts`, cambiar la declaración de variables (línea ~27):

```typescript
let m1: string, m2: string;
```

por:

```typescript
let m1: string, m2: string, m3: string, m3Code: string;
```

Y en `beforeAll`, después de `m2 = await muestra("M2");` (línea ~93):

```typescript
  m3Code = `M3-${RUN}`;
  m3 = (await prisma.sample.create({
    data: {
      sampleCode: m3Code,
      sampleType: "green",
      organizationId: orgId,
      locationId: plotId,
      status: "approved",
      classification: "internal",
      createdBy: gestor,
    },
  })).id;
  await retirarMuestra(gestor, m3, new Date(), "TEST: retirada para la prueba de exclusión");
```

Import nuevo en la cabecera del archivo:

```typescript
import { retirarMuestra } from "../../lib/traceability/samples";
```

Y tres pruebas nuevas, dentro del `describe("crear una sesión de cata", ...)` que ya existe:

```typescript
  it("no ofrece una muestra retirada en el listado para cata", async () => {
    const listado = await listarMuestrasParaCata(gestor);
    expect(listado.map((m) => m.id)).not.toContain(m3);
  });

  it("no la encuentra tampoco por búsqueda", async () => {
    const resultado = await buscarMuestrasParaCata(gestor, m3Code);
    expect(resultado.muestras.map((m) => m.id)).not.toContain(m3);
  });

  it("rechaza crear una sesión que incluya una muestra retirada, aunque se pida por id", async () => {
    await expect(
      crearSesionDeCata(gestor, { name: `Cata retirada ${RUN}`, protocolVersionId: versionOk, muestras: [m1, m3] }),
    ).rejects.toThrow(SesionDeCataError);
  });
```

No hace falta tocar `afterAll`: ya borra `prisma.sample.deleteMany({ createdBy: { in: ids } })` con `ids = [gestor, sinPermiso]`, y `m3` se crea con `createdBy: gestor` — el mismo filtro la alcanza.

- [ ] **Step 2: Correr y confirmar el rojo**

```bash
npx vitest run tests/sensory/crearSesion.test.ts
```

Esperado: las tres pruebas nuevas fallan — hoy `muestrasVisibles` y `crearSesionDeCata` no saben nada de `retiredAt`.

- [ ] **Step 3: Implementar el filtro**

`lib/sensory/sessions.ts`, dentro de `muestrasVisibles` (línea ~121), el `findMany` pasa de:

```typescript
    const tanda = await prisma.sample.findMany({
      where,
      select: {
```

a:

```typescript
    const tanda = await prisma.sample.findMany({
      where: { ...where, retiredAt: null },
      select: {
```

Y dentro de `crearSesionDeCata` (línea ~248), el bloque:

```typescript
  const pedidas = await prisma.sample.findMany({
    where: { id: { in: input.muestras } },
    select: { id: true, projectId: true, locationId: true, classification: true },
  });
  const alcanzables = new Set<string>();
```

pasa a:

```typescript
  const pedidas = await prisma.sample.findMany({
    where: { id: { in: input.muestras } },
    select: { id: true, projectId: true, locationId: true, classification: true, retiredAt: true },
  });
  const retiradas = pedidas.filter((m) => m.retiredAt !== null);
  if (retiradas.length > 0) throw new SesionDeCataError("sample_retired");

  const alcanzables = new Set<string>();
```

- [ ] **Step 4: Correr y confirmar el verde**

```bash
npx vitest run tests/sensory/crearSesion.test.ts
```

Esperado: pasa el archivo entero.

- [ ] **Step 5: Flip-test**

Dos mutaciones, una por cada guardia:

1. En `muestrasVisibles`, revertir `where: { ...where, retiredAt: null }` a `where`. `npx vitest run tests/sensory/crearSesion.test.ts -t "no ofrece"` y `-t "no la encuentra"` deben caer por su nombre.
2. Restaurar (1). En `crearSesionDeCata`, quitar el bloque `const retiradas = ...; if (retiradas.length > 0) throw ...`. `npx vitest run tests/sensory/crearSesion.test.ts -t "rechaza crear una sesión que incluya"` debe caer por su nombre.

Revertir las dos mutaciones antes de seguir.

- [ ] **Step 6: Commit**

```bash
git add lib/sensory/sessions.ts
git add tests/sensory/crearSesion.test.ts
git diff --cached --stat   # exactamente 2 archivos
git commit -F <archivo-de-mensaje>
```

```
Excluir las muestras retiradas de "Nueva cata"

muestrasVisibles (lib/sensory/sessions.ts) ya no lista ni encuentra una
muestra con retiredAt puesto — un único punto de filtro, alcanza a
listarMuestrasParaCata y buscarMuestrasParaCata. crearSesionDeCata
rechaza explícitamente incluir una muestra retirada por id, con su
propio SesionDeCataError("sample_retired"). Tres pruebas nuevas, dos
flip-tests.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 5: Guion de datos para retirar la muestra 111 — sin ejecutarlo

**Files:**
- Create: `scripts/retirar-muestra-111.ts`
- Modify: `package.json` (una línea nueva en `scripts`)

**Interfaces:**
- Consumes: `retirarMuestra` de `lib/traceability/samples.ts` (Task 3).
- Produces: nada que otra tarea consuma — es una herramienta operativa de un solo uso, que Daniel corre él mismo.

**Sin flip-test y sin prueba automatizada — declarado, no omitido por descuido.** Este guion no es un guardia que otra prueba tenga que cazar rompiéndolo: es una herramienta de un solo uso, en el mismo molde que `scripts/p0-flag-overstated-lots.ts`, que tampoco tiene test propio en este repositorio. Su corrección depende enteramente de `retirarMuestra`, que la Task 3 ya prueba con sus tres casos y su flip-test. Lo único que esta tarea verifica es que el archivo **compila** (Step 3) — nunca que se ejecute.

- [ ] **Step 1: Escribir el guion**

`scripts/retirar-muestra-111.ts`:

```typescript
/**
 * Retira, con rastro, la muestra 111 (lote PE-80, extraída el 2026-08-28) —
 * la única muestra de producción antes de este trabajo. Se creó cuando
 * `SampleForm.tsx` no pedía `materialState` ni `stageAtExtraction`
 * (docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md
 * §6), así que no se puede verificar contra la regla de proceso terminado:
 * ni a favor ni en contra. Decisión de Daniel, 2026-09-18: «retire it».
 *
 * Usage:
 *   npm run data:retirar-muestra-111 -- --dry-run    (por defecto; solo imprime)
 *   npm run data:retirar-muestra-111 -- --aplicar
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { retirarMuestra } from "../lib/traceability/samples";

const SAMPLE_ID = "111";
const MOTIVO =
  "Retirada por decisión de Daniel (2026-09-18): extraída antes de que el " +
  "guardia de muestra verde y sus campos (materialState, stageAtExtraction) " +
  "existieran en la pantalla de creación; no se puede verificar contra la " +
  "regla de proceso terminado. Ver " +
  "docs/superpowers/specs/2026-09-18-muestra-verde-tras-proceso-design.md §6.";

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const muestra = await prisma.sample.findUnique({ where: { id: SAMPLE_ID } });
  if (!muestra) {
    console.log(`No existe una muestra con id ${SAMPLE_ID} — nada que retirar.`);
    return;
  }
  if (muestra.retiredAt) {
    console.log(`La muestra ${SAMPLE_ID} ya está retirada desde ${muestra.retiredAt.toISOString()} — nada que hacer.`);
    return;
  }

  console.log(
    `Muestra ${SAMPLE_ID}: sampleCode=${muestra.sampleCode} sampleType=${muestra.sampleType} ` +
      `sourceLotId=${muestra.sourceLotId ?? "(ninguno)"} materialState=${muestra.materialState ?? "(sin declarar)"}`,
  );

  if (!aplicar) {
    console.log("\nEnsayo. Re-ejecutar con --aplicar para retirarla de verdad.");
    return;
  }

  // El actor de un guion de datos no es una persona con sesión: se necesita
  // una UserAccount real, tanto por la FK de AuditEvent.actorUserAccountId
  // como por requireSampleAccess. Se usa el Platform Admin, el mismo perfil
  // que ya crea scripts/grant-platform-admin.sh.
  const admin = await prisma.userAccount.findFirstOrThrow({
    where: { assignments: { some: { roleProfile: { name: "Platform Admin" } } } },
  });

  const retirada = await retirarMuestra(admin.id, SAMPLE_ID, new Date(), MOTIVO);
  console.log(`Retirada. retiredAt = ${retirada.retiredAt?.toISOString()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Registrar el comando**

`package.json`, junto a los demás `"data:*"` (después de la línea `"data:apiario-toabre": "tsx scripts/apiario-toabre.ts"`):

```json
    "data:apiario-toabre": "tsx scripts/apiario-toabre.ts",
    "data:retirar-muestra-111": "tsx scripts/retirar-muestra-111.ts"
```

(Ajustar la coma según quede la última línea del bloque `scripts` al aplicar el cambio — sin romper el JSON.)

- [ ] **Step 3: Verificar que compila — NUNCA ejecutarlo**

```bash
npm run typecheck
```

Esperado: salida 0, y **ninguna** ejecución de `npm run data:retirar-muestra-111` en ningún modo, ni siquiera `--dry-run`, dentro de este plan. Daniel lo corre él mismo contra producción una vez que la rama esté fusionada.

- [ ] **Step 4: Commit**

```bash
git add scripts/retirar-muestra-111.ts
git add package.json
git diff --cached --stat   # exactamente 2 archivos
git commit -F <archivo-de-mensaje>
```

```
Guion de un solo uso para retirar la muestra 111 (sin ejecutar)

Mismo molde que scripts/p0-flag-overstated-lots.ts: --dry-run por
defecto, --aplicar para escribir. Llama a retirarMuestra (Task 3), que
ya tiene sus propias pruebas — este guion no se ejecuta en este plan;
Daniel lo corre él mismo contra producción una vez fusionado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## Task 6: Verificación final

**Files:** ninguno — sólo lectura de resultados.

**Interfaces:** ninguna.

- [ ] **Step 1: Base de pruebas al día**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
npm run test:db -- reset
npx prisma migrate deploy
npx prisma generate
npm run db:seed
```

- [ ] **Step 2: Los archivos que este plan tocó, primero y solos**

```bash
npx vitest run tests/traceability/samples.test.ts tests/sensory/crearSesion.test.ts tests/derivaDeMigraciones.test.ts
```

Esperado: los tres archivos en verde.

- [ ] **Step 3: La suite completa — sin canalizar, leyendo el código de salida**

```bash
npm test > /tmp/muestra-verde-test.txt 2>&1; echo "salida=$?"; tail -30 /tmp/muestra-verde-test.txt
```

Esperado: `salida=0`. Si algo falla fuera de los archivos de este plan, compararlo contra `main` antes de tocar nada — puede ser deriva de otra sesión sobre la base compartida, no de este trabajo (ver `CLAUDE.md` del repositorio, sección "La base de pruebas es compartida").

- [ ] **Step 4: Compuerta completa**

```bash
npm run verify > /tmp/muestra-verde-verify.txt 2>&1; echo "salida=$?"; tail -30 /tmp/muestra-verde-verify.txt
```

Esperado: `salida=0`.

- [ ] **Step 5: Build**

```bash
npm run build > /tmp/muestra-verde-build.txt 2>&1; echo "salida=$?"; tail -30 /tmp/muestra-verde-build.txt
```

Esperado: `salida=0`. `VERCEL_ENV` no está puesto en local, así que este build no toca ninguna base (ver `scripts/vercel-build.sh`).

- [ ] **Step 6: Contar lo que lleva la rama antes del PR**

```bash
git log origin/main..HEAD --oneline        # los commits de este plan: seis
git diff --name-only origin/main...HEAD    # los archivos que toca el PR
```

Esperado: seis commits (uno por tarea) y quince archivos en total —
`lib/traceability/samples.ts`, `tests/traceability/samples.test.ts`,
`app/components/traceability/SampleForm.tsx`, `app/actions/traceability.ts`,
`messages/es.json`, `messages/en.json`, `prisma/schema.prisma`,
`prisma/migrations/20260918130000_muestra_retirada/migration.sql`,
`lib/sensory/sessions.ts`, `tests/sensory/crearSesion.test.ts`,
`scripts/retirar-muestra-111.ts`, `package.json` — doce rutas únicas
(algunas se tocan en más de una tarea, así que la cuenta de *archivos*
puede ser menor que la de líneas de `git add` a lo largo del plan; lo que
importa es que ninguna ruta ajena a esta lista aparezca).
