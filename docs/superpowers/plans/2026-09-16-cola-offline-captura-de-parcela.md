# Cola offline para la captura de parcela — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las cuatro creaciones de campo de la parcela —muestra de suelo, muestra foliar, perfil de suelo y siembra— sobrevivan a la falta de cobertura, sin duplicarse al reintentar.

**Architecture:** Se extiende el protocolo por lotes que ya existe (`/api/v1/sync/field-events`): cuatro `kind` nuevos en el parseo, cuatro ramas de aplicación que delegan en los servicios de dominio ya escritos, y una columna `clientDraftId @unique` por modelo para que el replay distinga `applied` de `duplicate`. El cliente copia el patrón de `FieldSessionForms`. Ni cola nueva ni endpoint nuevo.

**Tech Stack:** Next.js (App Router, Server Actions), Prisma + PostgreSQL, vitest, IndexedDB en `lib/sync/offlineQueue.ts`.

**Spec:** `docs/superpowers/specs/2026-09-16-cola-offline-captura-de-parcela-design.md`

## Global Constraints

- **Toda duda comprueba, nunca omite.** Ante un dato que no se puede validar, el resultado es `rejected` con su razón — nunca un descarte silencioso.
- **Las validaciones de dominio no se duplican.** El parseo comprueba sólo lo que hace falta para poder llamar al servicio; el resto lo valida el servicio y su error se traduce a `rejected`.
- **`clientDraftId` es la única clave de idempotencia.** `@@unique([locationId, sampleCode])` es del operador, no del aparato: no se usa para deduplicar.
- **Fechas**: viajan como texto ISO y vuelven a `Date` con `toDate`. Los campos de día usan `fechaDeDia`, que **falla** si la cadena no es un día válido.
- **Pruebas**: `npm test` es `vitest run`. Las que tocan base necesitan `npm run test:db -- up` levantada.
- **Nombres de `kind`**: minúsculas con guión bajo, como `colony_event`.

## File Structure

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` | los cuatro modelos ganan `clientDraftId String? @unique` |
| `lib/sync/parsearMutaciones.ts` | reconocer los cuatro `kind` nuevos; rechazar por mutación el desconocido |
| `lib/sync/pushFieldEvents.ts` | cuatro ramas de aplicación que delegan en los `create*` |
| `app/api/v1/sync/field-events/route.ts` | mezclar los rechazos del parseo con los resultados del push |
| `app/components/traceability/SampleForms.tsx` | encolar suelo y foliar sin señal |
| `app/components/traceability/SoilProfileForm.tsx` | encolar el perfil |
| `app/components/traceability/PlantingCohortForm.tsx` | encolar la siembra (sólo la rama de crear) |
| `tests/sync/parcelaSinSenal.test.ts` | parseo y replay de los cuatro tipos |

---

### Task 1: La columna que impide el duplicado

**Files:**
- Modify: `prisma/schema.prisma` (modelos `SoilSample`, `FoliarSample`, `SoilProfile`, `PlantingCohort`)
- Create: `prisma/migrations/<timestamp>_client_draft_id_en_captura_de_parcela/migration.sql` (la genera Prisma)
- Test: `tests/sync/parcelaSinSenal.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: la columna `clientDraftId` en las cuatro tablas, con índice único. Las tareas 3 y 4 la consultan.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
// tests/sync/parcelaSinSenal.test.ts
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

describe("clientDraftId en la captura de parcela", () => {
  it("dos muestras de suelo con el mismo clientDraftId no pueden coexistir", async () => {
    const draft = `draft-${Date.now()}`;
    // locationId y sampleCode vienen del `beforeAll` que crea la parcela de prueba.
    await prisma.soilSample.create({
      data: { locationId, sampleCode: `A-${draft}`, sampledAt: new Date(), provenanceClass: "FIELD_RECORD", clientDraftId: draft },
    });
    await expect(
      prisma.soilSample.create({
        data: { locationId, sampleCode: `B-${draft}`, sampledAt: new Date(), provenanceClass: "FIELD_RECORD", clientDraftId: draft },
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts`
Expected: FAIL — `Unknown argument 'clientDraftId'`.

- [ ] **Step 3: Añadir la columna a los cuatro modelos**

En `prisma/schema.prisma`, dentro de `model SoilSample`, `model FoliarSample`, `model SoilProfile` y `model PlantingCohort`:

```prisma
  /// Idempotencia del replay sin señal. Mismo patrón que `Inspection`: el
  /// servidor pregunta por esta columna antes de crear, y si ya estaba responde
  /// `duplicate`. `@@unique([locationId, sampleCode])` NO sirve para esto: es una
  /// clave del operador, no del aparato.
  clientDraftId String? @unique @map("client_draft_id")
```

- [ ] **Step 4: Generar y aplicar la migración**

Run: `npx prisma migrate dev --name client_draft_id_en_captura_de_parcela`
Expected: crea la carpeta de migración y aplica sin pérdida (la columna es anulable).

- [ ] **Step 5: Correr la prueba y verla pasar**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts`
Expected: PASS.

- [ ] **Step 6: Flip-test de la columna**

Quitar `@unique` de `SoilSample.clientDraftId`, correr `npx prisma migrate dev --name flip` y la prueba: **debe caer**. Si pasa, la prueba no mide idempotencia. Deshacer con `git checkout -- prisma/schema.prisma` y borrar la migración de flip.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/sync/parcelaSinSenal.test.ts
git commit -F - <<'MSG'
clientDraftId en los cuatro modelos de captura de parcela

Sin esta columna un reintento crea la muestra dos veces, y una duplicada
envenena un promedio sin que nadie lo note. Mismo patrón que Inspection.
MSG
```

---

### Task 2: El parseo reconoce los cuatro tipos

**Files:**
- Modify: `lib/sync/parsearMutaciones.ts`
- Modify: `lib/sync/pushFieldEvents.ts` (sólo los tipos)
- Test: `tests/sync/parcelaSinSenal.test.ts`

**Interfaces:**
- Consumes: `toDate`, `fechaDeDia` de la tarea anterior (ya existían).
- Produces: `KINDS_DE_PARCELA = ["soil_sample","foliar_sample","soil_profile","planting_cohort"]`, y los tipos `MutacionDeMuestraDeSuelo`, `MutacionDeMuestraFoliar`, `MutacionDePerfilDeSuelo`, `MutacionDeSiembra`, todos exportados. La tarea 3 los consume.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
it("parsea una muestra de suelo encolada", () => {
  const r = parsearMutaciones([{
    kind: "soil_sample", clientDraftId: "d1", locationId: "loc1",
    sampleCode: "S-01", sampledAt: "2026-09-16T12:00:00.000Z", provenanceClass: "FIELD_RECORD",
  }]);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.mutations).toHaveLength(1);       // control: cuántas parseó, no sólo que no falló
  expect(r.mutations[0]).toMatchObject({ kind: "soil_sample", sampledAt: new Date("2026-09-16T12:00:00.000Z") });
});

it("una muestra sin sampleCode es malformada", () => {
  const r = parsearMutaciones([{ kind: "soil_sample", clientDraftId: "d1", locationId: "loc1", sampledAt: "2026-09-16T12:00:00.000Z" }]);
  expect(r).toEqual({ ok: false, error: "mutation_malformed" });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts -t "muestra de suelo"`
Expected: FAIL — hoy cae al camino de `field_event` y devuelve `mutation_missing_ids`.

- [ ] **Step 3: Añadir los tipos en `pushFieldEvents.ts`**

```ts
export type MutacionDeMuestraDeSuelo = {
  kind: "soil_sample";
  clientDraftId: string;
  locationId: string;
  sampleCode: string;
  sampledAt: Date;
  provenanceClass: string;
  treatmentPlotLabel?: string | null;
  samplingPointLabel?: string | null;
  depthTopCm?: number | null;
  depthBottomCm?: number | null;
  subSampleCount?: number | null;
  laboratory?: string | null;
  extractionMethod?: string | null;
  notes?: string | null;
};

export type MutacionDeMuestraFoliar = {
  kind: "foliar_sample";
  clientDraftId: string;
  locationId: string;
  sampleCode: string;
  sampledAt: Date;
  provenanceClass: string;
  treatmentPlotLabel?: string | null;
  leafPairPosition?: number | null;
  canopyPosition?: string | null;
  treeAgeYears?: number | null;
  cultivar?: string | null;
  phenologicalStage?: string | null;
  branchBearingFruit?: boolean | null;
  laboratory?: string | null;
  notes?: string | null;
};

export type MutacionDePerfilDeSuelo = {
  kind: "soil_profile";
  clientDraftId: string;
  locationId: string;
  describedAt: Date;
  provenanceClass: string;
  pitDepthCm?: number | null;
  rootingDepthCm?: number | null;
  rootDistribution?: string | null;
  impedingLayerDepthCm?: number | null;
  impedingLayerNote?: string | null;
  notes?: string | null;
};

export type MutacionDeSiembra = {
  kind: "planting_cohort";
  clientDraftId: string;
  locationId: string;
  provenanceClass: string;
  cultivarValueId?: string | null;
  plantedAt?: Date | null;
  plantCount?: number | null;
  notes?: string | null;
};
```

Y añadirlos a la unión `PushMutation`.

- [ ] **Step 4: Añadir la rama de parseo**

En `lib/sync/parsearMutaciones.ts`, **antes** del camino de `field_event`:

```ts
/**
 * Los cuatro tipos de captura de parcela. Exportada como las de apiario: la
 * prueba compara esta lista con lo que el cliente encola, en vez de leer el
 * texto de un `if`.
 */
export const KINDS_DE_PARCELA = ["soil_sample", "foliar_sample", "soil_profile", "planting_cohort"] as const;

if (typeof m.kind === "string" && (KINDS_DE_PARCELA as readonly string[]).includes(m.kind)) {
  if (typeof m.clientDraftId !== "string" || typeof m.locationId !== "string") {
    return { ok: false, error: "mutation_missing_ids" };
  }
  // Cada tipo tiene su fecha obligatoria y su campo obligatorio; lo demás lo
  // valida su servicio de dominio y vuelve como `rejected` con su razón.
  if (m.kind === "soil_profile") {
    const describedAt = toDate(m.describedAt);
    if (!describedAt) return { ok: false, error: "mutation_malformed" };
    parsed.push({ ...(m as object), describedAt } as PushMutation);
    continue;
  }
  if (m.kind === "planting_cohort") {
    parsed.push({ ...(m as object), plantedAt: toDate(m.plantedAt) } as PushMutation);
    continue;
  }
  const sampledAt = toDate(m.sampledAt);
  if (!sampledAt || typeof m.sampleCode !== "string" || m.sampleCode.trim() === "") {
    return { ok: false, error: "mutation_malformed" };
  }
  parsed.push({ ...(m as object), sampledAt } as PushMutation);
  continue;
}
```

- [ ] **Step 5: Correr las pruebas y verlas pasar**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts`
Expected: PASS las dos.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/parsearMutaciones.ts lib/sync/pushFieldEvents.ts tests/sync/parcelaSinSenal.test.ts
git commit -F - <<'MSG'
El lote entiende los cuatro tipos de captura de parcela

Antes caían al camino de field_event, que exige fieldSessionId, y devolvían
400 del lote entero — el mismo defecto que colony_end tuvo toda la A9.5.
MSG
```

---

### Task 3: El replay los aplica, y no los duplica

**Files:**
- Modify: `lib/sync/pushFieldEvents.ts`
- Test: `tests/sync/parcelaSinSenal.test.ts`

**Interfaces:**
- Consumes: los cuatro tipos de la tarea 2 y la columna de la tarea 1.
- Produces: `aplicarCapturaDeParcela(userAccountId, m): Promise<PushResult>`, despachada desde `pushFieldEvents`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
it("aplica una vez y la segunda dice duplicate, con UNA sola fila", async () => {
  const m = { kind: "soil_sample" as const, clientDraftId: `d-${Date.now()}`, locationId,
    sampleCode: `S-${Date.now()}`, sampledAt: new Date(), provenanceClass: "FIELD_RECORD" };
  const [primera] = await pushFieldEvents(userAccountId, "dev1", [m]);
  const [segunda] = await pushFieldEvents(userAccountId, "dev1", [m]);
  expect(primera.status).toBe("applied");
  expect(segunda.status).toBe("duplicate");
  expect(await prisma.soilSample.count({ where: { clientDraftId: m.clientDraftId } })).toBe(1);
});

it("un código vacío vuelve como rejected, no como excepción", async () => {
  const [r] = await pushFieldEvents(userAccountId, "dev1", [{
    kind: "soil_sample" as const, clientDraftId: `d-${Date.now()}`, locationId,
    sampleCode: "   ", sampledAt: new Date(), provenanceClass: "FIELD_RECORD" }]);
  expect(r).toMatchObject({ status: "rejected", reason: "sample_code_required" });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts -t "duplicate"`
Expected: FAIL — `pushFieldEvents` no conoce el `kind` y lo trata como evento de campo.

- [ ] **Step 3: Escribir la rama de aplicación**

```ts
import { createSoilSample, createFoliarSample, SampleValidationError } from "../traceability/soilSamples";
import { createSoilProfile, SoilProfileValidationError } from "../traceability/soilProfiles";
import { createPlantingCohort, PlantingCohortValidationError } from "../traceability/plantingCohorts";
import { LocationAccessError } from "../traceability/locations";

/**
 * Las cuatro creaciones de parcela. La comprobación previa por `clientDraftId`
 * es lo que separa `applied` de `duplicate`; sin ella un reintento crearía la
 * muestra dos veces.
 */
async function aplicarCapturaDeParcela(
  userAccountId: string,
  m: MutacionDeMuestraDeSuelo | MutacionDeMuestraFoliar | MutacionDePerfilDeSuelo | MutacionDeSiembra,
): Promise<PushResult> {
  const tabla = {
    soil_sample: prisma.soilSample,
    foliar_sample: prisma.foliarSample,
    soil_profile: prisma.soilProfile,
    planting_cohort: prisma.plantingCohort,
  }[m.kind];
  const yaEstaba = await tabla.findUnique({ where: { clientDraftId: m.clientDraftId }, select: { id: true } });
  if (yaEstaba) return { clientDraftId: m.clientDraftId, status: "duplicate", id: yaEstaba.id };

  try {
    const comun = { locationId: m.locationId, provenanceClass: m.provenanceClass as never, clientDraftId: m.clientDraftId };
    const fila =
      m.kind === "soil_sample"
        ? await createSoilSample(userAccountId, { ...comun, sampleCode: m.sampleCode, sampledAt: m.sampledAt,
            depthTopCm: m.depthTopCm ?? null, depthBottomCm: m.depthBottomCm ?? null,
            subSampleCount: m.subSampleCount ?? null, samplingPointLabel: m.samplingPointLabel ?? null,
            extractionMethod: m.extractionMethod ?? null, laboratory: m.laboratory ?? null, notes: m.notes ?? null })
      : m.kind === "foliar_sample"
        ? await createFoliarSample(userAccountId, { ...comun, sampleCode: m.sampleCode, sampledAt: m.sampledAt,
            leafPairPosition: m.leafPairPosition ?? null, canopyPosition: (m.canopyPosition ?? null) as never,
            treeAgeYears: m.treeAgeYears ?? null, cultivar: m.cultivar ?? null,
            phenologicalStage: m.phenologicalStage ?? null, branchBearingFruit: m.branchBearingFruit ?? null,
            laboratory: m.laboratory ?? null, notes: m.notes ?? null })
      : m.kind === "soil_profile"
        ? await createSoilProfile(userAccountId, { ...comun, describedAt: m.describedAt,
            pitDepthCm: m.pitDepthCm ?? null, rootingDepthCm: m.rootingDepthCm ?? null,
            rootDistribution: m.rootDistribution ?? null, impedingLayerDepthCm: m.impedingLayerDepthCm ?? null,
            impedingLayerNote: m.impedingLayerNote ?? null, notes: m.notes ?? null })
      : await createPlantingCohort(userAccountId, { ...comun, cultivarValueId: m.cultivarValueId ?? null,
            plantedAt: m.plantedAt ?? null, plantCount: m.plantCount ?? null, notes: m.notes ?? null });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    // Un dato malo es respuesta del servidor; un corte de base sube, para que no
    // borre trabajo de campo disfrazado de dato inválido.
    // Son CUATRO clases, una por servicio, y no se pueden resumir en una:
    // soilSamples.ts lanza SampleValidationError (suelo y foliar comparten),
    // soilProfiles.ts SoilProfileValidationError, plantingCohorts.ts
    // PlantingCohortValidationError, y los cuatro lanzan LocationAccessError
    // cuando la parcela no es del usuario. El precedente está en este mismo
    // archivo: la rama de field_event ya devuelve `rejected` ante uno de acceso.
    if (
      error instanceof SampleValidationError ||
      error instanceof SoilProfileValidationError ||
      error instanceof PlantingCohortValidationError ||
      error instanceof LocationAccessError
    ) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }
}
```

Y en `pushFieldEvents`, junto a los otros despachos:

```ts
    if (m.kind === "soil_sample" || m.kind === "foliar_sample" || m.kind === "soil_profile" || m.kind === "planting_cohort") {
      results.push(await aplicarCapturaDeParcela(userAccountId, m));
      continue;
    }
```

**Nota para quien implemente:** los cuatro `create*` aceptan hoy su `Create*Input` sin `clientDraftId`. Añadir el campo a las cuatro interfaces y pasarlo al `data` del `create` correspondiente, junto al resto. Es una línea por servicio.

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sync/pushFieldEvents.ts lib/traceability/soilSamples.ts lib/traceability/soilProfiles.ts lib/traceability/plantingCohorts.ts tests/sync/parcelaSinSenal.test.ts
git commit -F - <<'MSG'
El replay crea la captura de parcela una sola vez

Pregunta por clientDraftId antes de crear: la segunda vez responde duplicate
y deja UNA fila. Un dato inválido vuelve como rejected con su razón.
MSG
```

---

### Task 4: Un `kind` desconocido deja de bloquear la cola

**Files:**
- Modify: `lib/sync/parsearMutaciones.ts`
- Modify: `app/api/v1/sync/field-events/route.ts`
- Test: `tests/sync/parcelaSinSenal.test.ts`

**Interfaces:**
- Consumes: `ParseoDeLote`.
- Produces: `ParseoDeLote` gana `rechazos: { clientDraftId: string; reason: string }[]` en el caso `ok: true`. La ruta los concatena a `results`.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
it("un kind desconocido rechaza SOLO esa mutación y deja pasar el resto", () => {
  const r = parsearMutaciones([
    { kind: "lo_que_sea", clientDraftId: "d-raro", locationId: "loc1" },
    { kind: "soil_profile", clientDraftId: "d-ok", locationId: "loc1", describedAt: "2026-09-16T12:00:00.000Z", provenanceClass: "FIELD_RECORD" },
  ]);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.mutations).toHaveLength(1);
  expect(r.rechazos).toEqual([{ clientDraftId: "d-raro", reason: "unknown_kind" }]);
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts -t "kind desconocido"`
Expected: FAIL — hoy devuelve `{ ok: false, error: "mutation_malformed" }` y tumba el lote entero.

- [ ] **Step 3: Rechazar por mutación**

En `parsearMutaciones`, al final del bucle, **sustituyendo** la caída al camino de `field_event` cuando el `kind` es una cadena desconocida:

```ts
    // Un `kind` que esta versión no conoce no puede tumbar el lote de los demás:
    // el cliente trata un 4xx de lote como fallo de transporte y reintenta para
    // siempre, así que un solo borrador raro bloqueaba la cola entera. Con
    // `clientDraftId` se puede atribuir el rechazo; sin él no, y entonces sí es
    // 400 de lote.
    if (typeof m.kind === "string" && m.kind !== "field_event") {
      if (typeof m.clientDraftId !== "string") return { ok: false, error: "mutation_malformed" };
      rechazos.push({ clientDraftId: m.clientDraftId, reason: "unknown_kind" });
      continue;
    }
```

Declarar `const rechazos: { clientDraftId: string; reason: string }[] = [];` al principio y devolver `{ ok: true, mutations: parsed, rechazos }`.

- [ ] **Step 4: Que la ruta los devuelva**

En `app/api/v1/sync/field-events/route.ts`:

```ts
    const results = await pushFieldEvents(user.userAccountId, deviceId, parseo.mutations);
    const conRechazos = [
      ...results,
      ...parseo.rechazos.map((r) => ({ clientDraftId: r.clientDraftId, status: "rejected" as const, reason: r.reason })),
    ];
    return Response.json({ results: conRechazos }, { status: 200 });
```

- [ ] **Step 5: Correr las pruebas y verlas pasar**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts && npm test -- tests/sync/parseoDelLote.test.ts`
Expected: PASS las dos suites — la vieja incluida, que es el control de que no se rompió el protocolo existente.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/parsearMutaciones.ts app/api/v1/sync/field-events/route.ts tests/sync/parcelaSinSenal.test.ts
git commit -F - <<'MSG'
Un kind desconocido rechaza su mutación, no el lote

Antes devolvía 400 del lote entero y el cliente lo trataba como fallo de
transporte: un solo borrador raro dejaba la cola bloqueada para siempre.
MSG
```

---

### Task 5: Los formularios encolan sin señal

**Files:**
- Modify: `app/components/traceability/SampleForms.tsx`
- Modify: `app/components/traceability/SoilProfileForm.tsx`
- Modify: `app/components/traceability/PlantingCohortForm.tsx`
- Test: `tests/sync/parcelaSinSenal.test.ts`

**Interfaces:**
- Consumes: `queueFieldEvent` de `lib/sync/offlineQueue`, y los `kind` de la tarea 2.
- Produces: nada que otra tarea consuma.

- [ ] **Step 1: Escribir la prueba que falla**

```ts
it("sin señal encola en vez de llamar a la Server Action", async () => {
  const encolados: Record<string, unknown>[] = [];
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  vi.mock("../../lib/sync/offlineQueue", () => ({ queueFieldEvent: async (p) => { encolados.push(p); return { id: "d1" }; } }));
  // render(<SoilSampleForm locationId="loc1" />) y submit
  expect(encolados).toHaveLength(1);
  expect(encolados[0]).toMatchObject({ kind: "soil_sample", locationId: "loc1" });
});
```

- [ ] **Step 2: Correrla y ver que falla**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts -t "sin señal"`
Expected: FAIL — hoy no se llama a `queueFieldEvent` nunca.

- [ ] **Step 3: Copiar el patrón de `FieldSessionForms`**

En cada formulario, junto al `<form action={formAction}>`:

```tsx
  const [encolado, setEncolado] = useState(false);
  const [errorLocal, setErrorLocal] = useState(false);

  /**
   * Sin señal, la anotación se guarda en la cola local en vez de perderse.
   *
   * Se decide por `navigator.onLine` y no intentando la petición primero:
   * `onLine === false` es una certeza, mientras que un `fetch` que tarda es
   * indistinguible de un servidor lento y deja al operador mirando un botón
   * girar en mitad de un cafetal.
   *
   * **El `try` no es decorativo.** Tras `preventDefault()` la Server Action ya
   * está cancelada, así que un fallo al encolar dejaría la anotación en ninguna
   * parte — y ésta es la única copia que existe.
   */
  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof navigator !== "undefined" && navigator.onLine) return; // camino normal
    e.preventDefault();
    const form = e.currentTarget;
    try {
      const fd = new FormData(form);
      await queueFieldEvent({
        kind: "soil_sample",
        locationId,
        sampleCode: String(fd.get("sampleCode") ?? ""),
        sampledAt: new Date().toISOString(),
        provenanceClass: String(fd.get("provenanceClass") ?? ""),
        depthTopCm: fd.get("depthTopCm") ? Number(fd.get("depthTopCm")) : null,
        depthBottomCm: fd.get("depthBottomCm") ? Number(fd.get("depthBottomCm")) : null,
        subSampleCount: fd.get("subSampleCount") ? Number(fd.get("subSampleCount")) : null,
        samplingPointLabel: (fd.get("samplingPointLabel") as string) || null,
        extractionMethod: (fd.get("extractionMethod") as string) || null,
        notes: (fd.get("notes") as string) || null,
      });
      form.reset();
      setEncolado(true);
      setErrorLocal(false);
    } catch {
      setEncolado(false);
      setErrorLocal(true);
    }
  };
```

Y `<form action={formAction} onSubmit={alEnviar} className="nn-form">`, con el aviso de «guardado en este dispositivo» cuando `encolado`, y el de error cuando `errorLocal`.

Repetir con `kind: "foliar_sample"` (campos del protocolo foliar), `kind: "soil_profile"` (`describedAt`) y `kind: "planting_cohort"` (`plantedAt`, `plantCount`, `cultivarValueId`).

- [ ] **Step 4: Correr las pruebas y verlas pasar**

Run: `npm test -- tests/sync/parcelaSinSenal.test.ts`
Expected: PASS.

- [ ] **Step 5: La compuerta completa**

Run: `npm run verify && npm test`
Expected: exit 0 las dos.

- [ ] **Step 6: Commit**

```bash
git add app/components/traceability/SampleForms.tsx app/components/traceability/SoilProfileForm.tsx app/components/traceability/PlantingCohortForm.tsx tests/sync/parcelaSinSenal.test.ts
git commit -F - <<'MSG'
La captura de parcela sobrevive sin señal

Suelo, foliar, perfil y siembra encolan cuando no hay cobertura, con el
patrón de FieldSessionForms. El try no es decorativo: tras preventDefault la
Server Action ya está cancelada y la cola es la única copia.
MSG
```
