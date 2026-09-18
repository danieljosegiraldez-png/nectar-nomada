# Vistas de finca y de parcela — plan de implementación

> **Para quien ejecute:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development`
> (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea.
> Los pasos usan sintaxis de casilla (`- [ ]`) para llevar la cuenta.

**Objetivo:** Reorganizar el tablero de parcela en pestañas, sacar sus formularios a rutas
propias, dar tipo a los bloques, y construir la ronda de trampas de toda la finca —en el
ordenador y en el móvil, con conexión y sin ella— dentro de la sección Finca que ya existe.

**Arquitectura:** Todo el código nuevo se apoya en lo que ya existe y no se reescribe:
`avisosDeTrampas`/`trampasParaAviso` (lectura de avisos), la cola sin conexión de eventos de
campo por `kind` (`lib/sync/offlineQueue.ts` + `parcelaPayload.ts` + `pushFieldEvents.ts`), y el
viaje en dos pasos de `landMedia.ts` para fotos. La finca gana una lectura propia
(`getFincaTrampas`) gateada por `specimen:view`/`specimen:manage` por parcela — **no** por
`location:manage_attributes`, que es el permiso de `/finca` y de `/plots`. Los bloques ganan
`blockType`, anulable y sin valor por defecto (ADR-080). La foto de una revisión de la ronda se
modela como `Asset` con `specimenObservationId` —no como `FieldEvent`—, decisión tomada leyendo
la cabecera de `lib/sync/fieldMedia.ts` (razón en la Tarea 12).

**Tech Stack:** Next.js (App Router, Server Actions), Prisma sobre PostgreSQL, next-intl,
IndexedDB para las dos colas sin conexión (eventos y, nueva, fotos de trampa), vitest.

**Spec:** `docs/superpowers/specs/2026-09-18-vistas-de-finca-y-parcela-design.md`. Este plan la
acompaña; quien ejecute lee las dos.

**Depende de (ya satisfecho en este árbol, no crear ni asumir ausente):**
- PR #413 (trampas de broca) — el código que este plan extiende vive en el worktree
  `~/Developer/nectar-worktrees/trampas-broca`, rama `trampas-broca`. Este plan asume que la
  rama de trabajo nace de un árbol que YA tiene ese código (`lib/traceability/{traps,plotBlocks,
  trapRules,pendienteDeTrampas,plantingCohorts,landMedia}.ts`, los componentes
  `RevisionDeTrampaForm`/`AltaDeTrampaForm`/`AltaDeBloqueForm`/`ReglaDeTrampasForm`/
  `TriStateField`, y las acciones de trampa en `app/actions/traceability.ts`).
- La sección Finca (`docs/superpowers/specs/2026-09-18-seccion-finca-design.md`, PR #388 y #420)
  — **ya fusionada en `main`** y ya presente en `trampas-broca` (medido: `app/finca/page.tsx`
  existe, y `lib/navigation.ts` ya tiene la entrada `finca` con
  `requiresAnyOf: ["location:manage_attributes", "lot:view", "lot:manage"]`). Este plan **no**
  crea `/finca` ni su índice, **no** mueve `/plots`, y **no** construye Cosechas, Recolectores,
  Rendimiento ni Calidad de la cosecha — esas pantallas son de otro PR y no se tocan.
- **Corrección de alcance recibida en curso (no está en la spec escrita):** no se crea
  `/farms/[id]`. La tabla de trampas de toda la finca vive en `/finca/trampas` y la ronda en
  `/finca/trampas/ronda`, colgando de la sección Finca ya existente. La pestaña «Lotes» del
  diseño original de finca (§4.1 de la spec) **no se construye**: es la pantalla «Parcelas» que
  la sección Finca ya sirve en `/plots`. La pestaña «Fotos» de la vista de finca (§4.1) **queda
  para una fase 2** y no se construye en este plan.

## Restricciones globales

- **ADR-080**: un valor faltante se muestra con su motivo y nunca se guarda como `0`/`false`;
  los `PlotBlock` que ya existan quedan con `blockType` NULL, nunca con uno supuesto.
- Toda escritura va dentro de `prisma.$transaction` con `recordAuditEvent` en la misma tx.
- Autorización del lado servidor vía `can()`; las pruebas de cada operación de escritura o
  lectura gateada incluyen un caso de denegación.
- Los campos de DÍA son medianoche UTC, parseados con `fechaDeDia` (`lib/time/localDateTime.ts`).
- Rutas de import desde `lib/traceability/*.ts`: `../db`, `../audit`,
  `../../generated/prisma/client`.
- Los archivos `"use server"` (`app/actions/traceability.ts`) sólo exportan funciones `async`.
- Las pruebas que necesitan base van bajo `# @grupo: base-sembrada` en
  `scripts/pruebas-por-compuerta.txt`.
- Si una tarea cambia o añade operaciones que tocan la base, correr
  `node scripts/inventario-de-acceso.mjs` y actualizar `docs/arquitectura/inventario-de-acceso.md`
  (la tabla de conteos y, si aplica, la sección de la allowlist) para que
  `tests/arquitectura/cifras-del-inventario.test.ts` siga en verde.
- Claves de i18n en `messages/es.json` **y** `messages/en.json`, namespace `Traceability` (y
  `SeccionFinca` donde el destino es el índice de la sección).
- El repositorio no tiene `jsdom`: la lógica de cliente (parseo de `FormData`, decisiones de
  colas) va en funciones puras probadas con Node, nunca en algo que llame a `render()`.
- Toda tarea que toque TypeScript corre `npm run typecheck` y `npm run build`, no sólo `vitest`.
- Toda prueba nueva lleva su paso de flip-test (romper a mano lo que la prueba dice cubrir, ver
  la prueba caer, restaurar).

---

## Tarea 1: Los bloques ganan tipo y descripción

**Archivos:**
- Crear: `prisma/migrations/20260918160000_bloques_con_tipo/migration.sql`
- Modificar: `prisma/schema.prisma` (modelo `PlotBlock`)
- Modificar: `lib/traceability/plotBlocks.ts`
- Modificar: `app/actions/traceability.ts` (`createPlotBlockFormAction`, nueva
  `setPlotBlockTypeFormAction`)
- Modificar: `app/components/traceability/AltaDeBloqueForm.tsx`
- Modificar: `app/plots/[id]/ajustes/page.tsx` (lista de bloques y de trampas)
- Modificar: `lib/traceability/plantingCohorts.ts` (`getPlotDetail`: el `select` de `plotBlock`
  de cada trampa, y la forma de `trampas[].bloque`)
- Modificar: `messages/es.json`, `messages/en.json`
- Test: `tests/traceability/plotBlocks.test.ts` (existe; se le añaden casos)

**Interfaces:**
- Produce: `PlotBlockType` (`"microparcela" | "trampa" | "experimental"`, del cliente de Prisma).
- Produce: `createPlotBlock(userAccountId, { locationId, name, blockType, description?, notes? })`
  — `blockType` ahora **obligatorio**.
- Produce: `setPlotBlockType(userAccountId, { plotBlockId, blockType, description? })`.
- Produce: `claveDeTituloDeBloque(blockType: PlotBlockType | null): "blockTitleMicroparcela" |
  "blockTitleTrampa" | "blockTitleExperimental" | null` — pura, sin I/O.
- Consume (sin cambiar): `requireLocationAttributeAccess`, `recordAuditEvent`,
  `PlotBlockValidationError`.
- Produce (cambia forma): `getPlotDetail(...).trampas[].bloque` pasa de `string | null` a
  `{ name: string; blockType: PlotBlockType | null } | null`. Las Tareas 3, 7 y 9 consumen esta
  forma nueva.

- [ ] **Paso 1: Escribir la migración**

```sql
-- F2 §3 extendido (spec `2026-09-18-vistas-de-finca-y-parcela-design.md` §5). «Bloque»
-- gana tipo: microparcela, trampa o experimental. ADR-080 — los bloques que ya existen
-- quedan con `block_type` NULL, nunca con uno supuesto; por eso la columna nace anulable
-- y SIN valor por defecto.
CREATE TYPE "traceability"."PlotBlockType" AS ENUM ('microparcela', 'trampa', 'experimental');

ALTER TABLE "traceability"."plot_block"
  ADD COLUMN "block_type" "traceability"."PlotBlockType",
  ADD COLUMN "description" TEXT;
```

- [ ] **Paso 2: Actualizar `prisma/schema.prisma`**

Añadir el enum junto a `TrapCaptureLevel` y las dos columnas al modelo `PlotBlock`:

```prisma
enum PlotBlockType {
  microparcela
  trampa
  experimental

  @@schema("traceability")
}
```

En `model PlotBlock`, tras `name String` y `notes String?`:

```prisma
  // F2 §5 extendido — obligatorio en los bloques NUEVOS (lo exige el servicio, no el
  // esquema: un bloque existente no puede volverse inválido el día de la migración,
  // ADR-080). `null` es «sin registrar», nunca un tipo supuesto.
  blockType   PlotBlockType? @map("block_type")
  // Texto libre para un bloque experimental: qué se compara. Distinta de `notes`, que
  // es la nota general del bloque.
  description String?
```

- [ ] **Paso 3: Regenerar el cliente y aplicar la migración**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: `20260918160000_bloques_con_tipo` en la lista de aplicadas; 0 errores de tipos en
`npm run typecheck` relacionados con `PlotBlock`.

- [ ] **Paso 4: Escribir la prueba que falla — `createPlotBlock` exige `blockType`**

```typescript
// tests/traceability/plotBlocks.test.ts — añadir dentro del describe existente
it("exige blockType al crear un bloque nuevo", async () => {
  await expect(
    createPlotBlock(userAccountId, { locationId: parcela.id, name: "Sur" } as never),
  ).rejects.toThrow(PlotBlockValidationError);
});

it("crea un bloque con su tipo y descripción", async () => {
  const bloque = await createPlotBlock(userAccountId, {
    locationId: parcela.id,
    name: "Biochar A",
    blockType: "experimental",
    description: "Biochar aplicado frente a no aplicado",
  });
  expect(bloque.blockType).toBe("experimental");
  expect(bloque.description).toBe("Biochar aplicado frente a no aplicado");
});

it("deniega crear un bloque sin acceso de atributos de la parcela", async () => {
  await expect(
    createPlotBlock(otroUserAccountId, {
      locationId: parcela.id,
      name: "Norte",
      blockType: "microparcela",
    }),
  ).rejects.toThrow(LocationAccessError);
});
```

- [ ] **Paso 5: Correr y ver caer**

Run: `npm run test:db -- up && npm test -- tests/traceability/plotBlocks.test.ts`
Expected: FAIL — `createPlotBlock` acepta hoy sin `blockType` y no valida el enum.

- [ ] **Paso 6: Implementar en `lib/traceability/plotBlocks.ts`**

```typescript
import type { PlotBlockType } from "../../generated/prisma/client";

const TIPOS_DE_BLOQUE: readonly PlotBlockType[] = ["microparcela", "trampa", "experimental"];

export interface CreatePlotBlockInput {
  locationId: string;
  name: string;
  blockType: PlotBlockType;
  description?: string | null;
  notes?: string | null;
}

/** F2 §3 extendido — un bloque es una zona con nombre y tipo dentro de una parcela. */
export async function createPlotBlock(userAccountId: string, input: CreatePlotBlockInput) {
  const name = input.name.trim();
  if (!name) throw new PlotBlockValidationError("block_name_required");
  if (!TIPOS_DE_BLOQUE.includes(input.blockType)) {
    throw new PlotBlockValidationError("block_type_required");
  }

  await requireLocationAttributeAccess(userAccountId, input.locationId);

  try {
    return await prisma.$transaction(async (tx) => {
      const bloque = await tx.plotBlock.create({
        data: {
          locationId: input.locationId,
          name,
          blockType: input.blockType,
          description: input.description ?? null,
          notes: input.notes ?? null,
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "plot_block.create",
          entityType: "plot_block",
          entityId: bloque.id,
          after: bloque,
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return bloque;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PlotBlockValidationError("block_name_taken");
    }
    throw error;
  }
}

export interface SetPlotBlockTypeInput {
  plotBlockId: string;
  blockType: PlotBlockType;
  description?: string | null;
}

/**
 * Ajustes pide elegir el tipo de un bloque que ya existía antes de esta migración
 * (ADR-080: nació NULL, no se le supuso uno). También sirve para cambiar el tipo de
 * un bloque que ya lo tenía, o para poner/quitar la descripción: no hay ninguna regla
 * que lo restrinja a "sólo una vez".
 */
export async function setPlotBlockType(userAccountId: string, input: SetPlotBlockTypeInput) {
  if (!TIPOS_DE_BLOQUE.includes(input.blockType)) {
    throw new PlotBlockValidationError("block_type_required");
  }
  const existing = await prisma.plotBlock.findUnique({ where: { id: input.plotBlockId } });
  if (!existing) throw new PlotBlockValidationError("block_not_found");
  await requireLocationAttributeAccess(userAccountId, existing.locationId);

  return prisma.$transaction(async (tx) => {
    const actualizado = await tx.plotBlock.update({
      where: { id: input.plotBlockId },
      data: {
        blockType: input.blockType,
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_block.set_type",
        entityType: "plot_block",
        entityId: actualizado.id,
        before: existing,
        after: actualizado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return actualizado;
  });
}

/**
 * El prefijo que muestra el TIPO de un bloque, no la palabra «Bloque» a secas — así
 * desaparece «Bloque Bloque Norte»: antes el prefijo se sumaba a un nombre que ya lo
 * llevaba escrito. Pura: el llamador hace `clave ? t(clave, { name }) : block.name`.
 */
export function claveDeTituloDeBloque(
  blockType: PlotBlockType | null,
): "blockTitleMicroparcela" | "blockTitleTrampa" | "blockTitleExperimental" | null {
  if (blockType === "microparcela") return "blockTitleMicroparcela";
  if (blockType === "trampa") return "blockTitleTrampa";
  if (blockType === "experimental") return "blockTitleExperimental";
  return null;
}
```

- [ ] **Paso 7: Correr y ver pasar**

Run: `npm test -- tests/traceability/plotBlocks.test.ts`
Expected: PASS, los tres casos nuevos incluidos.

- [ ] **Paso 8: Flip-test de `claveDeTituloDeBloque`**

Mutar temporalmente `blockType === "trampa"` por `blockType === "trampaX"` en el cuerpo de la
función, correr `npm test -- tests/traceability/plotBlocks.test.ts` y comprobar que el caso que
espera `"blockTitleTrampa"` cae. Restaurar y volver a correr para confirmar que pasa.

- [ ] **Paso 9: Extender `getPlotDetail` en `lib/traceability/plantingCohorts.ts`**

En el `select` de `trampasCrudas` (dentro de `getPlotDetail`), cambiar:

```typescript
          plotBlock: { select: { name: true } },
```

por:

```typescript
          plotBlock: { select: { name: true, blockType: true } },
```

Y en el `.map` que construye `trampas`, cambiar:

```typescript
      bloque: t.plotBlock?.name ?? null,
```

por:

```typescript
      bloque: t.plotBlock ? { name: t.plotBlock.name, blockType: t.plotBlock.blockType } : null,
```

- [ ] **Paso 10: Actualizar `createPlotBlockFormAction` y añadir `setPlotBlockTypeFormAction`
      en `app/actions/traceability.ts`**

```typescript
export interface PlotBlockActionState extends TraceabilityActionState {}

const TIPOS_DE_BLOQUE_FORM = ["microparcela", "trampa", "experimental"] as const;

export async function createPlotBlockFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  try {
    await createPlotBlock(user.userAccountId, {
      locationId,
      name: String(formData.get("name") ?? ""),
      blockType: String(formData.get("blockType") ?? "") as never,
      description: emptyToNull(formData.get("description")),
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    revalidarParcela(locationId);
    return { error: friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return {};
}

export async function setPlotBlockTypeFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  try {
    await setPlotBlockType(user.userAccountId, {
      plotBlockId: String(formData.get("plotBlockId") ?? ""),
      blockType: String(formData.get("blockType") ?? "") as never,
      description: emptyToNull(formData.get("description")),
    });
  } catch (error) {
    revalidarParcela(locationId);
    return { error: friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return {};
}
```

Añadir `createPlotBlock, setPlotBlockType, PlotBlockValidationError` al import ya existente de
`../../lib/traceability/plotBlocks` (línea 58).

- [ ] **Paso 11: `AltaDeBloqueForm.tsx` — añadir el selector de tipo y la descripción**

```tsx
const TIPOS = ["microparcela", "trampa", "experimental"] as const;

// dentro del <form>, tras el campo "name":
<div className="nn-field">
  <label htmlFor={`blockType-${locationId}`}>{t("blockTypeLabel")}</label>
  <select id={`blockType-${locationId}`} name="blockType" required defaultValue="">
    <option value="">{t("blockTypeChoose")}</option>
    {TIPOS.map((tipo) => (
      <option key={tipo} value={tipo}>
        {t(`blockType_${tipo}` as "blockType_microparcela")}
      </option>
    ))}
  </select>
</div>

<div className="nn-field">
  <label htmlFor={`blockDescription-${locationId}`}>{t("blockDescriptionLabel")}</label>
  <input
    id={`blockDescription-${locationId}`}
    type="text"
    name="description"
    placeholder={t("notRecorded")}
  />
</div>
```

- [ ] **Paso 12: `app/plots/[id]/ajustes/page.tsx` — prefijo tipado y alta de tipo para
      bloques existentes**

Reemplazar el `<ul>` de bloques (sección `id="bloques"`):

```tsx
<ul className="nn-detail-meta">
  {bloques.map((b) => {
    const clave = claveDeTituloDeBloque(b.blockType);
    return (
      <li key={b.id} className="nn-card">
        <strong>{clave ? t(clave, { name: b.name }) : b.name}</strong>
        {b.notes ? <span className="nn-muted"> · {b.notes}</span> : null}
        {b.description ? <p className="nn-muted">{b.description}</p> : null}
        {b.blockType == null ? (
          <details>
            <summary>{t("blockTypeAssignSummary")}</summary>
            <form action={setPlotBlockTypeFormAction.bind(null)} className="nn-form">
              {/* la ligadura de arriba no aplica: usar useActionState en un componente
                  cliente, ver Paso 13 */}
            </form>
          </details>
        ) : null}
      </li>
    );
  })}
</ul>
```

Esa `<details>` inline con `useActionState` necesita ser un componente cliente separado (los
Server Components no tienen `useActionState`). Sustituir el bloque anterior por una llamada a un
componente nuevo:

```tsx
<AsignarTipoDeBloqueForm locationId={location.id} plotBlockId={b.id} />
```

- [ ] **Paso 13: Crear `app/components/traceability/AsignarTipoDeBloqueForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { setPlotBlockTypeFormAction, type TraceabilityActionState } from "../../actions/traceability";

const TIPOS = ["microparcela", "trampa", "experimental"] as const;
const initialState: TraceabilityActionState = {};

/**
 * Elegir el tipo de un bloque que se creó antes de que `blockType` existiera
 * (ADR-080: nació NULL, no se le supone un tipo). Sólo aparece para bloques sin tipo.
 */
export function AsignarTipoDeBloqueForm({
  locationId,
  plotBlockId,
}: {
  locationId: string;
  plotBlockId: string;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(setPlotBlockTypeFormAction, initialState);

  return (
    <details>
      <summary>{t("blockTypeAssignSummary")}</summary>
      <form action={formAction} className="nn-form">
        <input type="hidden" name="locationId" value={locationId} />
        <input type="hidden" name="plotBlockId" value={plotBlockId} />
        <div className="nn-field">
          <select name="blockType" required defaultValue="">
            <option value="">{t("blockTypeChoose")}</option>
            {TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {t(`blockType_${tipo}` as "blockType_microparcela")}
              </option>
            ))}
          </select>
        </div>
        {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
        <button type="submit" className="nn-button" disabled={pending}>
          {t("blockTypeAssignSave")}
        </button>
      </form>
    </details>
  );
}
```

Y en `ajustes/page.tsx`, sustituir el bloque del Paso 12 por:

```tsx
<li key={b.id} className="nn-card">
  <strong>{claveDeTituloDeBloque(b.blockType) ? t(claveDeTituloDeBloque(b.blockType)!, { name: b.name }) : b.name}</strong>
  {b.notes ? <span className="nn-muted"> · {b.notes}</span> : null}
  {b.description ? <p className="nn-muted">{b.description}</p> : null}
  {b.blockType == null ? (
    <AsignarTipoDeBloqueForm locationId={location.id} plotBlockId={b.id} />
  ) : null}
</li>
```

Importar `claveDeTituloDeBloque` desde `../../../lib/traceability/plotBlocks` y
`AsignarTipoDeBloqueForm` desde `../../components/traceability/AsignarTipoDeBloqueForm`.

- [ ] **Paso 14: `ajustes/page.tsx` — el prefijo tipado también en la lista de trampas**

En la sección `id="trampas"`, cambiar:

```tsx
{trampa.bloque ? t("trapsBlock", { nombre: trampa.bloque }) : t("trapsNoBlock")}
```

por:

```tsx
{trampa.bloque ? (
  claveDeTituloDeBloque(trampa.bloque.blockType) != null
    ? t(claveDeTituloDeBloque(trampa.bloque.blockType)!, { name: trampa.bloque.name })
    : trampa.bloque.name
) : (
  t("trapsNoBlock")
)}
```

- [ ] **Paso 15: Añadir las claves de i18n**

En `messages/es.json`, namespace `Traceability`, junto a `trapsBlock`:

```json
"blockTypeLabel": "Tipo de bloque",
"blockTypeChoose": "— elegir —",
"blockType_microparcela": "Microparcela",
"blockType_trampa": "Bloque de trampa",
"blockType_experimental": "Bloque experimental",
"blockDescriptionLabel": "Descripción (opcional)",
"blockTypeAssignSummary": "Elegir el tipo de este bloque",
"blockTypeAssignSave": "Guardar el tipo",
"blockTitleMicroparcela": "Microparcela {name}",
"blockTitleTrampa": "Bloque de trampa {name}",
"blockTitleExperimental": "Bloque experimental {name}"
```

En `messages/en.json`, las mismas claves:

```json
"blockTypeLabel": "Block type",
"blockTypeChoose": "— choose —",
"blockType_microparcela": "Micro-plot",
"blockType_trampa": "Trap block",
"blockType_experimental": "Experimental block",
"blockDescriptionLabel": "Description (optional)",
"blockTypeAssignSummary": "Choose this block's type",
"blockTypeAssignSave": "Save the type",
"blockTitleMicroparcela": "Micro-plot {name}",
"blockTitleTrampa": "Trap block {name}",
"blockTitleExperimental": "Experimental block {name}"
```

- [ ] **Paso 16: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/traceability/plotBlocks.test.ts tests/traceability/plantingCohorts.test.ts`
Expected: PASS.

- [ ] **Paso 17: Inventario de acceso**

Run: `node scripts/inventario-de-acceso.mjs`
Leer los conteos nuevos (`setPlotBlockType` es una operación nueva con guardia directo) y
actualizar la tabla de `docs/arquitectura/inventario-de-acceso.md` con los números que imprime el
script. Run: `npm test -- tests/arquitectura/cifras-del-inventario.test.ts` para confirmar que
casan.

- [ ] **Paso 18: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260918160000_bloques_con_tipo lib/traceability/plotBlocks.ts lib/traceability/plantingCohorts.ts app/actions/traceability.ts app/components/traceability/AltaDeBloqueForm.tsx app/components/traceability/AsignarTipoDeBloqueForm.tsx app/plots/[id]/ajustes/page.tsx messages/es.json messages/en.json tests/traceability/plotBlocks.test.ts docs/arquitectura/inventario-de-acceso.md
git commit -F msg.txt
```

`msg.txt`:
```
Los PlotBlock ganan tipo (microparcela/trampa/experimental) y descripción

Los bloques existentes quedan con blockType NULL (ADR-080); ajustes pide
elegirlo. El prefijo tipado en pantalla hace desaparecer «Bloque Bloque
Norte».

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 2: Pestañas del tablero de parcela — armazón y «Resumen»

**Archivos:**
- Modificar: `app/plots/[id]/page.tsx`
- Test: `tests/traceability/plotDashboardTabs.test.ts` (nuevo, prueba la función pura de
  resolución de pestaña)

**Interfaces:**
- Produce: `PESTANAS_DE_PARCELA = ["resumen", "trampas", "condiciones", "muestras"] as const`
  y `type PestanaDeParcela = (typeof PESTANAS_DE_PARCELA)[number]`.
- Produce: `pestanaValida(valor: string | undefined): PestanaDeParcela` — pura, por defecto
  `"resumen"` ante cualquier valor que no sea una de las cuatro.
- Consume: todo lo que `getPlotDetail` ya devuelve (sin cambios de forma salvo los de la
  Tarea 1).

**Nota de diseño:** esta tarea introduce el interruptor de pestañas y mueve el contenido de
«Estado del lote», la línea de pendientes y las últimas 3 jornadas a la pestaña `resumen`. Las
secciones de trampas, condiciones y muestras **siguen exactamente como están** —sus `<details>`
sin tocar, fuera del área con pestañas— hasta que las Tareas 3–5 las muden una por una. No hay
ningún placeholder: lo que no se ha migrado sigue siendo la pantalla de hoy.

- [ ] **Paso 1: Escribir la prueba de `pestanaValida`**

```typescript
// tests/traceability/plotDashboardTabs.test.ts
import { describe, expect, it } from "vitest";
import { pestanaValida, PESTANAS_DE_PARCELA } from "../../app/plots/[id]/pestanas";

describe("pestanaValida", () => {
  it("acepta cada pestaña declarada", () => {
    for (const p of PESTANAS_DE_PARCELA) expect(pestanaValida(p)).toBe(p);
  });

  it("cae a resumen ante cualquier otra cosa", () => {
    expect(pestanaValida(undefined)).toBe("resumen");
    expect(pestanaValida("")).toBe("resumen");
    expect(pestanaValida("no-existe")).toBe("resumen");
  });
});
```

- [ ] **Paso 2: Correr y ver caer**

Run: `npm test -- tests/traceability/plotDashboardTabs.test.ts`
Expected: FAIL — `app/plots/[id]/pestanas.ts` no existe todavía.

- [ ] **Paso 3: Crear `app/plots/[id]/pestanas.ts`**

```typescript
/**
 * La pestaña del tablero de parcela va en la URL (`?pestana=trampas`), spec §3: así los
 * enlaces de los avisos llevan directo a ella y desaparecen los plegables con `id`
 * dentro que el navegador no siempre abre al navegar a un fragmento.
 */
export const PESTANAS_DE_PARCELA = ["resumen", "trampas", "condiciones", "muestras"] as const;
export type PestanaDeParcela = (typeof PESTANAS_DE_PARCELA)[number];

export function pestanaValida(valor: string | undefined): PestanaDeParcela {
  return (PESTANAS_DE_PARCELA as readonly string[]).includes(valor ?? "")
    ? (valor as PestanaDeParcela)
    : "resumen";
}
```

- [ ] **Paso 4: Correr y ver pasar**

Run: `npm test -- tests/traceability/plotDashboardTabs.test.ts`
Expected: PASS.

- [ ] **Paso 5: Flip-test**

Mutar `?? "resumen"` (dentro del `? :`) reemplazando el resultado por `"trampas"` y correr la
prueba: el segundo `it` debe caer (espera `"resumen"` y recibiría `"trampas"`). Restaurar.

- [ ] **Paso 6: Reescribir el encabezado de `app/plots/[id]/page.tsx`**

Cambiar la firma de la página para leer `searchParams` y montar la barra de pestañas:

```tsx
import { pestanaValida, PESTANAS_DE_PARCELA, type PestanaDeParcela } from "./pestanas";

export default async function PlotDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pestana?: string }>;
}) {
  const { id } = await params;
  const { pestana: pestanaCruda } = await searchParams;
  const pestana = pestanaValida(pestanaCruda);
  // ... (getCurrentUser, getPlotDetail y el resto de las lecturas, sin cambios)

  const hrefPestana = (p: PestanaDeParcela) => `/plots/${location.id}?pestana=${p}`;

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href="/plots">{t("backToPlots")}</Link>
      </p>
      <span className="nn-badge">{t("badge")}</span>
      <h1>{location.name}</h1>
      {organizationName ? <p className="nn-detail-meta">{organizationName}</p> : null}
      <p className="nn-detail-meta">
        {pendiente.tocaHacer.length + pendiente.faltaUnDato.length === 0
          ? t("plotDashboardPendingNone")
          : t("plotDashboardPendingLine", {
              tocaHacer: pendiente.tocaHacer.length,
              faltaUnDato: pendiente.faltaUnDato.length,
            })}
      </p>

      <nav className="nn-tabs" aria-label={t("plotDashboardTabsLabel")}>
        {PESTANAS_DE_PARCELA.map((p) => (
          <Link
            key={p}
            href={hrefPestana(p)}
            aria-current={p === pestana ? "page" : undefined}
            className={p === pestana ? "nn-tab nn-tab-activa" : "nn-tab"}
          >
            {t(`plotDashboardTab_${p}` as "plotDashboardTab_resumen")}
          </Link>
        ))}
      </nav>

      {pestana === "resumen" ? (
        <>
          {/* Todo el bloque "Estado del lote" (las cuatro <article> de plantas,
              variedades, densidad y rendimiento) tal cual estaba, sin cambios de
              lógica — se mueve entero aquí dentro de este condicional. */}
          {/* La sección "plotDashboardPendingHeading" con tocaHacer/faltaUnDato,
              tal cual estaba, se mueve aquí también. */}
          {/* La sección "plotDashboardRecentSessions" con las últimas 3 jornadas
              y el <details> con las demás, tal cual estaba, se mueve aquí. El
              <details> de FieldSessionStartForm SIGUE aquí sin tocar — la Tarea 6
              lo sustituye por un botón a /plots/[id]/jornada/nueva. */}
        </>
      ) : null}

      {/* Las tres secciones de trampas, condiciones y muestras SIGUEN exactamente
          donde estaban, como <details> sueltos, sin gatear por `pestana` todavía.
          Las Tareas 3, 4 y 5 las mudan una por una. */}
    </div>
  );
}
```

**Nota de implementación:** este paso es literalmente cortar-y-pegar el JSX existente dentro del
nuevo `{pestana === "resumen" ? (<>...</>) : null}`; ninguna lógica de las cuatro tarjetas, la
lista de pendientes o las jornadas cambia. `friendlyError`/`textoDelAviso`/`lineaDeJornada` y el
resto de funciones internas de la página no se tocan.

- [ ] **Paso 7: Añadir las claves de i18n de las pestañas**

En `messages/es.json`, `Traceability`:

```json
"plotDashboardTabsLabel": "Secciones de la parcela",
"plotDashboardTab_resumen": "Resumen",
"plotDashboardTab_trampas": "Trampas y bloques",
"plotDashboardTab_condiciones": "Condiciones",
"plotDashboardTab_muestras": "Muestras",
"plotDashboardPendingLine": "{tocaHacer} por hacer · {faltaUnDato} datos faltan"
```

En `messages/en.json`:

```json
"plotDashboardTabsLabel": "Plot sections",
"plotDashboardTab_resumen": "Overview",
"plotDashboardTab_trampas": "Traps and blocks",
"plotDashboardTab_condiciones": "Conditions",
"plotDashboardTab_muestras": "Samples",
"plotDashboardPendingLine": "{tocaHacer} to do · {faltaUnDato} data missing"
```

- [ ] **Paso 8: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/traceability/plotDashboardTabs.test.ts`
Expected: PASS.

- [ ] **Paso 9: Recorrido manual**

`npm run dev:local`, abrir `/plots/<id-de-una-parcela-real>` y `/plots/<id>?pestana=trampas`:
la cabecera de pendientes aparece encima de las pestañas, la pestaña Resumen cabe sin bajar
tanto como antes, y las secciones de trampas/condiciones/muestras siguen visibles debajo
(todavía no gateadas).

- [ ] **Paso 10: Commit**

```bash
git add app/plots/[id]/page.tsx app/plots/[id]/pestanas.ts tests/traceability/plotDashboardTabs.test.ts messages/es.json messages/en.json
git commit -F msg.txt
```

`msg.txt`:
```
El tablero de parcela gana pestañas: armazón y Resumen

La pestaña activa va en ?pestana=, spec §3. Trampas, condiciones y muestras
siguen como estaban; las próximas tres tareas las mudan una por una.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 3: Pestaña «Trampas y bloques», con estado por trampa

**Archivos:**
- Modificar: `lib/traceability/pendienteDeTrampas.ts`
- Modificar: `app/plots/[id]/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`
- Test: `tests/traceability/pendienteDeTrampas.test.ts` (existe; se le añaden casos de
  `estadoDeTrampa`)

**Interfaces:**
- Produce: `type EstadoDeTrampa = "sin_regla" | "al_dia" | "toca_revisar" | "lectura_alta"`.
- Produce: `estadoDeTrampa(e: { hoy: string; trampa: TrampaParaAviso; regla: ReglaParaAviso |
  null }): { estado: EstadoDeTrampa; diasDeRetraso: number | null }` — pura.
- Consume: `TrampaParaAviso`, `ReglaParaAviso`, la constante privada `ESCALA` y la función
  privada `diasEntre`, ya en el mismo archivo (no se exportan, se reutilizan dentro del módulo).
- Consume: `claveDeTituloDeBloque` (Tarea 1), `getPlotDetail(...).trampas[].bloque` en su forma
  nueva `{ name, blockType } | null`.

**Nota:** `estadoDeTrampa` NO reutiliza `avisosDeTrampas` internamente — repite en ~10 líneas la
misma rama de disparo/plazo. Es deliberado: `avisosDeTrampas` ya tiene un fix con nombre (F7) para
un borde de reinstalación, y tocarla para que sirva a un segundo llamador arriesga ese borde por
una ganancia pequeña. Las dos funciones comparten `ESCALA` y `diasEntre`, que es donde vivía la
única lógica no trivial.

- [ ] **Paso 1: Escribir las pruebas de `estadoDeTrampa`**

```typescript
// tests/traceability/pendienteDeTrampas.test.ts — añadir
describe("estadoDeTrampa", () => {
  const trampaBase: TrampaParaAviso = {
    id: "t1", trapNumber: 1, bloque: null, status: "active",
    ultimaRevision: null, instaladaEl: "2026-09-01",
  };
  const regla: ReglaParaAviso = {
    triggerLevel: "algunos", normalDays: 15, alertDays: 7, suggestedAction: "aplicar cebo",
  };

  it("sin regla, el estado es sin_regla", () => {
    expect(estadoDeTrampa({ hoy: "2026-09-18", trampa: trampaBase, regla: null }).estado).toBe(
      "sin_regla",
    );
  });

  it("dentro del plazo normal, al_dia", () => {
    expect(
      estadoDeTrampa({ hoy: "2026-09-10", trampa: trampaBase, regla }).estado,
    ).toBe("al_dia");
  });

  it("pasado el plazo normal sin revisión, toca_revisar", () => {
    const r = estadoDeTrampa({ hoy: "2026-09-20", trampa: trampaBase, regla });
    expect(r.estado).toBe("toca_revisar");
    expect(r.diasDeRetraso).toBeGreaterThan(0);
  });

  it("una lectura que dispara es lectura_alta, aunque esté dentro del plazo", () => {
    const trampa: TrampaParaAviso = {
      ...trampaBase,
      ultimaRevision: { dia: "2026-09-17", brocaLevel: "muchos" },
    };
    expect(estadoDeTrampa({ hoy: "2026-09-18", trampa, regla }).estado).toBe("lectura_alta");
  });

  it("una trampa retirada no reporta estado accionable", () => {
    expect(
      estadoDeTrampa({ hoy: "2026-09-18", trampa: { ...trampaBase, status: "removed" }, regla })
        .estado,
    ).toBe("sin_regla");
  });
});
```

- [ ] **Paso 2: Correr y ver caer**

Run: `npm test -- tests/traceability/pendienteDeTrampas.test.ts`
Expected: FAIL — `estadoDeTrampa` no existe.

- [ ] **Paso 3: Implementar en `lib/traceability/pendienteDeTrampas.ts`**

```typescript
export type EstadoDeTrampa = "sin_regla" | "al_dia" | "toca_revisar" | "lectura_alta";

/**
 * El estado de UNA trampa, para una tabla o una tarjeta — no la lista de avisos que
 * produce `avisosDeTrampas`. Repite su rama de disparo/plazo a propósito: ver la nota
 * de la Tarea 3 del plan de vistas de finca y parcela sobre por qué no se comparte.
 *
 * Una trampa retirada o muerta, o sin regla, no tiene estado accionable: `sin_regla`
 * cubre los dos casos porque ninguno tiene nada que un operario deba hacer hoy.
 */
export function estadoDeTrampa(e: {
  hoy: string;
  trampa: TrampaParaAviso;
  regla: ReglaParaAviso | null;
}): { estado: EstadoDeTrampa; diasDeRetraso: number | null } {
  if (e.trampa.status !== "active" || e.regla == null) {
    return { estado: "sin_regla", diasDeRetraso: null };
  }
  const disparador = ESCALA.indexOf(e.regla.triggerLevel);
  const revisionVigente =
    e.trampa.ultimaRevision != null &&
    (e.trampa.instaladaEl == null || e.trampa.ultimaRevision.dia >= e.trampa.instaladaEl)
      ? e.trampa.ultimaRevision
      : null;

  const lectura = revisionVigente?.brocaLevel;
  const disparo = lectura != null && ESCALA.indexOf(lectura) >= disparador;
  const desde = revisionVigente?.dia ?? e.trampa.instaladaEl;
  const plazo = disparo ? e.regla.alertDays : e.regla.normalDays;
  const diasDeRetraso = desde == null ? null : diasEntre(desde, e.hoy) - plazo;

  if (disparo) return { estado: "lectura_alta", diasDeRetraso };
  if (diasDeRetraso != null && diasDeRetraso > 0) return { estado: "toca_revisar", diasDeRetraso };
  return { estado: "al_dia", diasDeRetraso };
}
```

- [ ] **Paso 4: Correr y ver pasar**

Run: `npm test -- tests/traceability/pendienteDeTrampas.test.ts`
Expected: PASS.

- [ ] **Paso 5: Flip-test**

Mutar `disparo ? e.regla.alertDays : e.regla.normalDays` a `e.regla.normalDays` (siempre) y
correr: el test "pasado el plazo normal..." podría seguir pasando pero el de "lectura_alta"
dentro del plazo se mantiene por la rama `if (disparo)` que va primero — para forzar una caída
real, mutar en su lugar `if (disparo) return { estado: "lectura_alta", ... }` a `if (false)`.
Confirmar que el test de lectura alta cae. Restaurar.

- [ ] **Paso 6: Mover la sección de trampas a la pestaña, con tabla y estado**

En `app/plots/[id]/page.tsx`, sustituir el `<details className="nn-section">` de trampas
(el que tiene `id="trampas"` dentro) por:

```tsx
{pestana === "trampas" ? (
  <section className="nn-section">
    <h2>{t("trapsTitle")}</h2>
    <p>
      <Link href="/finca/trampas/ronda" className="nn-button">{t("trapsGoToRoundLink")}</Link>
      {" "}
      <Link href={`/plots/${location.id}/ajustes#trampas`} className="nn-button">
        {t("trapsManageLink")}
      </Link>
    </p>

    {trampas.length === 0 ? (
      <p className="nn-muted">{t("trapsNone")}</p>
    ) : (
      <table className="nn-table">
        <thead>
          <tr>
            <th>{t("trapsNumber", { n: "" })}</th>
            <th>{t("trapsColumnBlock")}</th>
            <th>{t("trapsColumnLastCheck")}</th>
            <th>{t("trapsColumnLastReading")}</th>
            <th>{t("trapsColumnStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {trampas.map((trampa) => {
            const { estado } = estadoDeTrampa({
              hoy: diaDeHoy(new Date(), location.timezone),
              trampa: trampasParaAviso([trampa])[0],
              regla: reglaDeTrampas,
            });
            const claveBloque = trampa.bloque ? claveDeTituloDeBloque(trampa.bloque.blockType) : null;
            return (
              <tr key={trampa.id}>
                <td>{trampa.trapNumber ?? t("notRecorded")}</td>
                <td>
                  {trampa.bloque
                    ? claveBloque
                      ? t(claveBloque, { name: trampa.bloque.name })
                      : trampa.bloque.name
                    : t("trapsNoBlock")}
                </td>
                <td>
                  {trampa.ultimaRevision
                    ? trampa.ultimaRevision.observedAt.toISOString().slice(0, 10)
                    : t("trapsNeverChecked")}
                </td>
                <td>
                  {trampa.ultimaRevision?.brocaLevel
                    ? t(`trapsLevel_${trampa.ultimaRevision.brocaLevel}`)
                    : t("notRecorded")}
                </td>
                <td>{t(`trapEstado_${estado}` as "trapEstado_al_dia")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    )}

    <h3>{t("blocksTitle")}</h3>
    {(["microparcela", "trampa", "experimental"] as const).map((tipo) => {
      const deEsteTipo = bloquesDeLaParcela.filter((b) => b.blockType === tipo);
      if (deEsteTipo.length === 0) return null;
      return (
        <div key={tipo}>
          <h4>{t(`blockType_${tipo}` as "blockType_microparcela")}</h4>
          <ul className="nn-detail-meta">
            {deEsteTipo.map((b) => (
              <li key={b.id}>{b.name}{b.description ? ` — ${b.description}` : ""}</li>
            ))}
          </ul>
        </div>
      );
    })}
    {bloquesDeLaParcela.some((b) => b.blockType == null) ? (
      <div>
        <h4>{t("blockTypeUnassignedHeading")}</h4>
        <ul className="nn-detail-meta">
          {bloquesDeLaParcela.filter((b) => b.blockType == null).map((b) => (
            <li key={b.id}>{b.name}</li>
          ))}
        </ul>
      </div>
    ) : null}
  </section>
) : null}
```

Esto necesita `bloquesDeLaParcela`, que la página no leía hasta ahora. Añadir al bloque de
lecturas paralelas, junto a `calicatas`:

```typescript
const [jornadas, { people, selfPersonId }, calicatas, bloquesDeLaParcela] = await Promise.all([
  listFieldSessions(user.userAccountId, id),
  getObserverCandidates(user.userAccountId),
  listSoilProfilesForLocation(user.userAccountId, id),
  listPlotBlocks(user.userAccountId, id),
]);
```

Importar `listPlotBlocks` desde `../../../lib/traceability/plotBlocks`, junto con
`claveDeTituloDeBloque`; `estadoDeTrampa` y `trampasParaAviso` desde
`../../../lib/traceability/pendienteDeTrampas`.

**Nota:** esto quita de la pestaña el `<details>` de `RevisionDeTrampaForm` y el de
`LandPhotoUploadForm` para la foto de trampa — la revisión pasa a hacerse en la ronda de la
finca (Tareas 9–10). El enlace `/finca/trampas/ronda` existe recién en la Tarea 9; hasta
entonces apunta a una ruta que aún no responde, dentro del mismo plan.

- [ ] **Paso 7: Añadir las claves de i18n**

En `messages/es.json`:

```json
"trapsGoToRoundLink": "Ir a la ronda de trampas",
"trapsColumnBlock": "Bloque",
"trapsColumnLastCheck": "Última revisión",
"trapsColumnLastReading": "Última lectura",
"trapsColumnStatus": "Estado",
"trapEstado_sin_regla": "Sin regla",
"trapEstado_al_dia": "Al día",
"trapEstado_toca_revisar": "Toca revisar",
"trapEstado_lectura_alta": "Lectura alta",
"blockTypeUnassignedHeading": "Sin tipo"
```

En `messages/en.json`:

```json
"trapsGoToRoundLink": "Go to the trap round",
"trapsColumnBlock": "Block",
"trapsColumnLastCheck": "Last check",
"trapsColumnLastReading": "Last reading",
"trapsColumnStatus": "Status",
"trapEstado_sin_regla": "No rule",
"trapEstado_al_dia": "Up to date",
"trapEstado_toca_revisar": "Due for a check",
"trapEstado_lectura_alta": "High reading",
"blockTypeUnassignedHeading": "No type"
```

- [ ] **Paso 8: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/traceability/pendienteDeTrampas.test.ts`
Expected: PASS.

- [ ] **Paso 9: Commit**

```bash
git add lib/traceability/pendienteDeTrampas.ts app/plots/[id]/page.tsx messages/es.json messages/en.json tests/traceability/pendienteDeTrampas.test.ts
git commit -F msg.txt
```

`msg.txt`:
```
Pestaña Trampas y bloques: tabla con estado por trampa, bloques por tipo

estadoDeTrampa() da un estado (al día/toca revisar/lectura alta) por
trampa. La revisión inline sale de la pestaña: se hace en la ronda de
la finca (Tareas 9-10).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 4: Pestaña «Condiciones»

**Archivos:**
- Modificar: `app/plots/[id]/page.tsx`

**Interfaces:**
- No añade funciones nuevas: mueve JSX existente (condiciones del terreno, calicatas y sus
  fotos, fotos generales del terreno) dentro de `{pestana === "condiciones" ? (...) : null}`.
  El botón «Describir suelo» sigue siendo el `<details>` con `SoilProfileForm` hasta la Tarea 6.

- [ ] **Paso 1: Mover el `<details>` de condiciones**

Sustituir `<details className="nn-section">` (el que contiene `id="condiciones"`) por
`{pestana === "condiciones" ? (<section className="nn-section">...</section>) : null}`,
con el mismo contenido interior (la `<dl>` de condiciones, las calicatas con sus fotos, las
fotos generales del terreno, y el `<details>` de `SoilProfileForm` para describir). Ningún
`<h3>`/`<dl>`/mapeo cambia.

- [ ] **Paso 2: Compuerta**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.

- [ ] **Paso 3: Recorrido manual**

`/plots/<id>?pestana=condiciones` muestra exactamente lo que mostraba antes el `<details>`
abierto; `/plots/<id>?pestana=resumen` ya no la muestra.

- [ ] **Paso 4: Commit**

```bash
git add app/plots/[id]/page.tsx
git commit -F msg.txt
```

`msg.txt`:
```
Pestaña Condiciones: se muda desde el <details> del tablero

Sin cambios de lógica ni de formularios — sólo el gateo por pestana.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 5: Pestaña «Muestras»

**Archivos:**
- Modificar: `app/plots/[id]/page.tsx`

**Interfaces:**
- No añade funciones nuevas: mueve JSX existente (muestras de suelo y foliares, con sus
  resultados y el `<details>` de «Añadir resultado» por muestra) dentro de
  `{pestana === "muestras" ? (...) : null}`. Los `<details>` de «Añadir muestra de suelo/foliar»
  siguen inline hasta la Tarea 6.

- [ ] **Paso 1: Mover el `<details>` de muestras**

Igual que la Tarea 4: sustituir el `<details className="nn-section">` que contiene
`id="muestras"` por `{pestana === "muestras" ? (<section>...</section>) : null}`, con el mismo
contenido interior. `ResultadosDeLaboratorio`, `camposDeProtocoloQueFaltan` y el resto de
funciones internas no cambian.

**Nota de ambigüedad resuelta:** la spec §3 lista sólo cuatro rutas a extraer
(`jornada/nueva`, `muestras/nueva`, `suelo/nuevo`, `fotos/nueva`) y «Añadir resultado»
(`LabMeasurementForm`) no es una de ellas. Se queda inline, colgado de la muestra existente a la
que pertenece — es una acción contextual sobre una fila ya visible en la pestaña, no un
formulario que crea un registro nuevo desde cero como los cuatro que sí se extraen.

- [ ] **Paso 2: Compuerta**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.

- [ ] **Paso 3: Commit**

```bash
git add app/plots/[id]/page.tsx
git commit -F msg.txt
```

`msg.txt`:
```
Pestaña Muestras: se muda desde el <details> del tablero

«Añadir resultado» queda inline por muestra a propósito: no es una de
las cuatro rutas que la spec §3 extrae.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 6: Los formularios de captura pasan a su propia ruta

**Archivos:**
- Crear: `app/plots/[id]/jornada/nueva/page.tsx`
- Crear: `app/plots/[id]/muestras/nueva/page.tsx`
- Crear: `app/plots/[id]/suelo/nuevo/page.tsx`
- Modificar: `app/plots/[id]/page.tsx` (pestañas Resumen, Muestras, Condiciones: sustituir los
  tres `<details>` de captura por botones)
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- No añade funciones de servicio: reutiliza `FieldSessionStartForm`, `SoilSampleForm`,
  `FoliarSampleForm` y `SoilProfileForm` tal cual —«los formularios no se reescriben, se
  mueven»—.

- [ ] **Paso 1: Crear `app/plots/[id]/jornada/nueva/page.tsx`**

```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getPlotDetail } from "../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../lib/traceability/locations";
import { getObserverCandidates } from "../../../../lib/traceability/lots";
import { FieldSessionStartForm } from "../../../components/traceability/FieldSessionForms";

export const dynamic = "force-dynamic";

/** Abrir una jornada — spec de vistas de finca y parcela §3: el formulario no cambia, se
 * muda fuera del tablero. Vuelve a la pestaña Resumen, de donde se llega. */
export default async function NuevaJornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }
  const { people, selfPersonId } = await getObserverCandidates(user.userAccountId);

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${id}?pestana=resumen`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("fieldSessionStartSummary")}</h1>
      <FieldSessionStartForm
        locationId={detail.location.id}
        people={people.map((p) => ({ id: p.id, displayName: p.displayName }))}
        selfPersonId={selfPersonId}
      />
    </div>
  );
}
```

- [ ] **Paso 2: Crear `app/plots/[id]/muestras/nueva/page.tsx`**

```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getPlotDetail } from "../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../lib/traceability/locations";
import { SoilSampleForm, FoliarSampleForm } from "../../../components/traceability/SampleForms";

export const dynamic = "force-dynamic";

/** Añadir una muestra de suelo o foliar — spec §3. Vuelve a la pestaña Muestras. */
export default async function NuevaMuestraPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${id}?pestana=muestras`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("samplesSoilAdd")}</h1>
      <SoilSampleForm locationId={detail.location.id} />
      <h1>{t("samplesFoliarAdd")}</h1>
      <FoliarSampleForm locationId={detail.location.id} />
    </div>
  );
}
```

- [ ] **Paso 3: Crear `app/plots/[id]/suelo/nuevo/page.tsx`**

```tsx
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getPlotDetail } from "../../../../lib/traceability/plantingCohorts";
import { LocationAccessError } from "../../../../lib/traceability/locations";
import { SoilProfileForm } from "../../../components/traceability/SoilProfileForm";

export const dynamic = "force-dynamic";

/** Describir una calicata nueva — spec §3. Vuelve a la pestaña Condiciones. */
export default async function NuevaCalicataPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let detail;
  try {
    detail = await getPlotDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof LocationAccessError) notFound();
    throw error;
  }

  return (
    <div>
      <p className="nn-detail-meta">
        <Link href={`/plots/${id}?pestana=condiciones`}>{t("plotDashboardBackLink")}</Link>
      </p>
      <h1>{t("soilDescribeHeading")}</h1>
      <SoilProfileForm
        locationId={detail.location.id}
        values={{
          describedAt: null, pitDepthCm: null, rootingDepthCm: null, rootDistribution: null,
          mottling: null, greyColours: null, rootChannelConcretions: null, sourSmell: null,
          impedingLayerDepthCm: null, impedingLayerNote: null, provenanceClass: "",
          dataQuality: null, notes: null,
        }}
      />
    </div>
  );
}
```

- [ ] **Paso 4: Sustituir los tres `<details>` por botones en `app/plots/[id]/page.tsx`**

En la pestaña `resumen`, donde estaba `<details><summary>{t("fieldSessionStartSummary")}
</summary><FieldSessionStartForm .../></details>`, dejar:

```tsx
<p>
  <Link href={`/plots/${location.id}/jornada/nueva`} className="nn-button">
    {t("fieldSessionStartSummary")}
  </Link>
</p>
```

En la pestaña `muestras`, donde estaban los dos `<details>` de «Añadir muestra de suelo/foliar»:

```tsx
<p>
  <Link href={`/plots/${location.id}/muestras/nueva`} className="nn-button">
    {t("samplesAddButton")}
  </Link>
</p>
```

En la pestaña `condiciones`, donde estaba `<details><summary>{t("soilDescribeHeading")}
</summary><SoilProfileForm .../></details>`:

```tsx
<p>
  <Link href={`/plots/${location.id}/suelo/nuevo`} className="nn-button">
    {t("soilDescribeHeading")}
  </Link>
</p>
```

Quitar los imports que quedan sin usar (`FieldSessionStartForm`, `SoilSampleForm`,
`FoliarSampleForm`, `SoilProfileForm`) de `app/plots/[id]/page.tsx` si ningún otro sitio de ese
archivo los sigue usando.

- [ ] **Paso 5: Añadir la clave que falta**

En `messages/es.json`: `"samplesAddButton": "Añadir muestra"`.
En `messages/en.json`: `"samplesAddButton": "Add a sample"`.

- [ ] **Paso 6: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.

- [ ] **Paso 7: Recorrido manual**

Desde `/plots/<id>?pestana=resumen`, tocar «Abrir jornada» lleva a
`/plots/<id>/jornada/nueva`; guardar (o «Volver») regresa a `?pestana=resumen`. Repetir para
muestras y suelo.

- [ ] **Paso 8: Commit**

```bash
git add app/plots/[id]/jornada app/plots/[id]/muestras app/plots/[id]/suelo app/plots/[id]/page.tsx messages/es.json messages/en.json
git commit -F msg.txt
```

`msg.txt`:
```
Los formularios de captura pasan a sus propias rutas bajo la parcela

jornada/nueva, muestras/nueva y suelo/nuevo. Los formularios no
cambian, sólo se mudan; cada uno vuelve a su pestaña.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 7: Lectura de las trampas de toda la finca

**Archivos:**
- Crear: `lib/traceability/fincaTrampas.ts`
- Test: Crear `tests/traceability/fincaTrampas.test.ts`

**Interfaces:**
- Produce: `export class FincaTrapAccessError extends Error {}`
- Produce: `getFincasConTrampas(userAccountId: string): Promise<{ id: string; name: string }[]>`
- Produce: `getFincaTrampas(userAccountId: string, farmLocationId: string): Promise<{
  farmLocationId: string; farmName: string; plots: { id: string; name: string }[];
  trampas: FincaTrampa[]; reglaDeTrampas: ReglaParaAviso | null }>` donde `FincaTrampa` es
  `{ id: string; trapNumber: number | null; plotId: string; plotName: string; bloque: {
  name: string; blockType: PlotBlockType | null } | null; status: "active" | "removed" | "dead";
  ultimaRevision: { id: string; observedAt: Date; brocaLevel: NivelDeBroca | null } | null;
  instaladaEl: Date | null }`.
- Consume (sin cambiar): `can`, `ScopeTarget`, `ReglaParaAviso`/`NivelDeBroca` de
  `pendienteDeTrampas.ts`, `PlotBlockType`.

- [ ] **Paso 1: Escribir la prueba de denegación y de filtrado por lote**

```typescript
// tests/traceability/fincaTrampas.test.ts
import { describe, expect, it, beforeEach, afterEach } from "vitest";
// ... (fixtures: crear una finca (site), dos parcelas (plot) bajo ella, una trampa
// activa en cada una, y dos cuentas: una con specimen:view sólo en la parcela A,
// otra sin ningún permiso de specimen)

it("lista sólo las trampas de los lotes que la persona puede ver", async () => {
  const resultado = await getFincaTrampas(cuentaConAccesoSoloAlLoteA, finca.id);
  expect(resultado.trampas.map((t) => t.plotId)).toEqual([parcelaA.id]);
});

it("deniega sin ningún acceso de specimen en la finca", async () => {
  await expect(getFincaTrampas(cuentaSinPermiso, finca.id)).rejects.toThrow(FincaTrapAccessError);
});

it("getFincasConTrampas sólo devuelve fincas con al menos un lote accesible", async () => {
  const fincas = await getFincasConTrampas(cuentaConAccesoSoloAlLoteA);
  expect(fincas.map((f) => f.id)).toContain(finca.id);
  const ninguna = await getFincasConTrampas(cuentaSinPermiso);
  expect(ninguna).toEqual([]);
});
```

- [ ] **Paso 2: Correr y ver caer**

Run: `npm run test:db -- up && npm test -- tests/traceability/fincaTrampas.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Paso 3: Implementar `lib/traceability/fincaTrampas.ts`**

```typescript
import { prisma } from "../db";
import { can } from "../rbac/service";
import type { ScopeTarget } from "../rbac/types";
import type { PlotBlockType } from "../../generated/prisma/client";
import type { NivelDeBroca, ReglaParaAviso } from "./pendienteDeTrampas";

export class FincaTrapAccessError extends Error {}

async function puedeVerTrampasDelLote(
  userAccountId: string,
  plot: { id: string; classification: import("../../generated/prisma/client").ClassificationLevel },
): Promise<boolean> {
  const target: ScopeTarget = { scopeType: "location", scopeRefId: plot.id };
  return (
    (await can(userAccountId, "view", "specimen", target, plot.classification)) ||
    (await can(userAccountId, "manage", "specimen", target, plot.classification))
  );
}

/**
 * Las fincas donde esta persona puede ver o gestionar trampas, spec §6: el ámbito
 * puede estar en la finca o en uno de sus lotes, y comprobarlo lote por lote cubre
 * las dos formas porque una asignación a la finca alcanza a sus descendientes
 * (`lib/rbac/service.ts`, decisión de Daniel 2026-09-16).
 */
export async function getFincasConTrampas(userAccountId: string): Promise<{ id: string; name: string }[]> {
  const sitios = await prisma.location.findMany({
    where: { locationType: "site" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const accesibles: { id: string; name: string }[] = [];
  for (const sitio of sitios) {
    const lotes = await prisma.location.findMany({
      where: { parentLocationId: sitio.id, locationType: { in: ["plot", "micro_plot"] } },
      select: { id: true, classification: true },
    });
    let puede = false;
    for (const lote of lotes) {
      if (await puedeVerTrampasDelLote(userAccountId, lote)) { puede = true; break; }
    }
    if (puede) accesibles.push(sitio);
  }
  return accesibles;
}

export interface FincaTrampa {
  id: string;
  trapNumber: number | null;
  plotId: string;
  plotName: string;
  bloque: { name: string; blockType: PlotBlockType | null } | null;
  status: "active" | "removed" | "dead";
  ultimaRevision: { id: string; observedAt: Date; brocaLevel: NivelDeBroca | null } | null;
  instaladaEl: Date | null;
}

/**
 * Todas las trampas de una finca, de los lotes que esta persona puede ver — nunca una
 * lista vacía por falta de permiso, que se leería como «no hay trampas» (spec §6): sin
 * ningún lote accesible, se lanza.
 *
 * La regla de la finca se lee directamente, sin pasar por `getTrapRule` (que exige
 * `location:manage_attributes`): igual que en `getPlotDetail`, queda detrás de la
 * compuerta de specimen que ya se comprobó arriba, sin exigir un segundo permiso.
 */
export async function getFincaTrampas(userAccountId: string, farmLocationId: string) {
  const finca = await prisma.location.findUnique({
    where: { id: farmLocationId },
    select: { id: true, name: true },
  });
  if (!finca) throw new FincaTrapAccessError("farm_not_found");

  const lotes = await prisma.location.findMany({
    where: { parentLocationId: farmLocationId, locationType: { in: ["plot", "micro_plot"] } },
    select: { id: true, name: true, classification: true },
    orderBy: { name: "asc" },
  });

  const accesibles = [] as typeof lotes;
  for (const lote of lotes) if (await puedeVerTrampasDelLote(userAccountId, lote)) accesibles.push(lote);
  if (accesibles.length === 0) throw new FincaTrapAccessError("no_specimen_access_in_farm");

  const accesibleIds = accesibles.map((l) => l.id);
  const trampasCrudas = await prisma.specimen.findMany({
    where: { locationId: { in: accesibleIds }, specimenType: "trap" },
    select: {
      id: true, trapNumber: true, status: true, locationId: true,
      plotBlock: { select: { name: true, blockType: true } },
      observations: {
        where: { observationType: "trap_check" },
        orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { id: true, observedAt: true, brocaLevel: true },
      },
    },
    orderBy: [{ locationId: "asc" }, { trapNumber: "asc" }],
  });

  const instalaciones = await prisma.specimenObservation.findMany({
    where: {
      specimenId: { in: trampasCrudas.map((t) => t.id) },
      observationType: { in: ["installed", "reinstalled"] },
    },
    orderBy: [{ observedAt: "desc" }, { createdAt: "desc" }],
    select: { specimenId: true, observedAt: true },
  });
  const instaladaEl = new Map<string, Date>();
  for (const i of instalaciones) if (!instaladaEl.has(i.specimenId)) instaladaEl.set(i.specimenId, i.observedAt);

  const nombrePorLote = new Map(accesibles.map((l) => [l.id, l.name]));
  const trampas: FincaTrampa[] = trampasCrudas.map((t) => ({
    id: t.id,
    trapNumber: t.trapNumber,
    plotId: t.locationId,
    plotName: nombrePorLote.get(t.locationId) ?? "",
    bloque: t.plotBlock ? { name: t.plotBlock.name, blockType: t.plotBlock.blockType } : null,
    status: t.status,
    instaladaEl: instaladaEl.get(t.id) ?? null,
    ultimaRevision: t.observations[0]
      ? { id: t.observations[0].id, observedAt: t.observations[0].observedAt, brocaLevel: t.observations[0].brocaLevel }
      : null,
  }));

  const reglaDeTrampas: ReglaParaAviso | null = await prisma.trapRule.findUnique({
    where: { farmLocationId },
    select: { triggerLevel: true, normalDays: true, alertDays: true, suggestedAction: true },
  });

  return {
    farmLocationId: finca.id,
    farmName: finca.name,
    plots: accesibles.map((l) => ({ id: l.id, name: l.name })),
    trampas,
    reglaDeTrampas,
  };
}
```

- [ ] **Paso 4: Correr y ver pasar**

Run: `npm test -- tests/traceability/fincaTrampas.test.ts`
Expected: PASS.

- [ ] **Paso 5: Flip-test**

Mutar `if (accesibles.length === 0) throw ...` a `if (false)` y correr: el test de denegación
debe caer (recibiría una lista vacía en vez de la excepción). Restaurar.

- [ ] **Paso 6: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.

- [ ] **Paso 7: Inventario de acceso**

Run: `node scripts/inventario-de-acceso.mjs` y actualizar
`docs/arquitectura/inventario-de-acceso.md` con los conteos nuevos (dos operaciones con guardia
directo: `getFincasConTrampas`, `getFincaTrampas`). Run:
`npm test -- tests/arquitectura/cifras-del-inventario.test.ts`.

- [ ] **Paso 8: Commit**

```bash
git add lib/traceability/fincaTrampas.ts tests/traceability/fincaTrampas.test.ts docs/arquitectura/inventario-de-acceso.md
git commit -F msg.txt
```

`msg.txt`:
```
Lectura de las trampas de toda la finca, filtrada por lo que cada persona ve

getFincaTrampas agrega las trampas de los lotes accesibles de una
finca; sin ninguno accesible, deniega en vez de devolver una lista
vacía (spec §6).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 8: Pantalla `/finca/trampas` y enlace desde el índice de Finca

**Archivos:**
- Crear: `app/finca/trampas/page.tsx`
- Modificar: `app/finca/page.tsx`
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `getFincasConTrampas`, `getFincaTrampas`, `FincaTrapAccessError` (Tarea 7),
  `estadoDeTrampa` (Tarea 3), `claveDeTituloDeBloque` (Tarea 1).

- [ ] **Paso 1: Crear `app/finca/trampas/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../lib/auth/session";
import { getFincasConTrampas, getFincaTrampas, FincaTrapAccessError } from "../../../lib/traceability/fincaTrampas";
import { estadoDeTrampa } from "../../../lib/traceability/pendienteDeTrampas";
import { claveDeTituloDeBloque } from "../../../lib/traceability/plotBlocks";
import { diaDeHoy } from "../../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";

/**
 * Todas las trampas de una finca — spec §4.1. Sin `[farmId]` en la ruta: hoy hay una
 * sola finca operativa, y esta pantalla se resuelve sola cuando sólo hay una
 * accesible (mismo patrón que `destinoDeEntrada` con un único apiario,
 * `lib/navigation.ts`). Con más de una, ofrece un selector por `?finca=`.
 */
export default async function TrampasDeLaFincaPage({
  searchParams,
}: {
  searchParams: Promise<{ finca?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fincas = await getFincasConTrampas(user.userAccountId);
  if (fincas.length === 0) notFound();

  const { finca: fincaElegida } = await searchParams;
  const farmLocationId = fincaElegida && fincas.some((f) => f.id === fincaElegida)
    ? fincaElegida
    : fincas.length === 1 ? fincas[0].id : null;

  if (farmLocationId == null) {
    return (
      <div>
        <h1>{t("fincaTrapsTitle")}</h1>
        <ul>
          {fincas.map((f) => (
            <li key={f.id}><Link href={`/finca/trampas?finca=${f.id}`}>{f.name}</Link></li>
          ))}
        </ul>
      </div>
    );
  }

  let detalle;
  try {
    detalle = await getFincaTrampas(user.userAccountId, farmLocationId);
  } catch (error) {
    if (error instanceof FincaTrapAccessError) {
      return <p className="nn-error" role="alert">{t("fincaTrapsNoAccess")}</p>;
    }
    throw error;
  }

  const hoy = diaDeHoy(new Date(), null);

  return (
    <div>
      <p className="nn-detail-meta"><Link href="/finca">{t("plotDashboardBackLink")}</Link></p>
      <h1>{t("fincaTrapsTitleNamed", { name: detalle.farmName })}</h1>
      <p>
        <Link href="/finca/trampas/ronda" className="nn-button">{t("trapsGoToRoundLink")}</Link>
      </p>

      {detalle.reglaDeTrampas ? (
        <p className="nn-detail-meta">
          {t("trapRuleCurrent", {
            lectura: t(`trapsLevel_${detalle.reglaDeTrampas.triggerLevel}`),
            normal: detalle.reglaDeTrampas.normalDays,
            alerta: detalle.reglaDeTrampas.alertDays,
            accion: detalle.reglaDeTrampas.suggestedAction,
          })}
        </p>
      ) : (
        <p className="nn-muted">{t("trapRuleNone")}</p>
      )}

      {detalle.trampas.length === 0 ? (
        <p className="nn-muted">{t("trapsNone")}</p>
      ) : (
        <table className="nn-table">
          <thead>
            <tr>
              <th>{t("trapsNumber", { n: "" })}</th>
              <th>{t("trapsColumnPlot")}</th>
              <th>{t("trapsColumnBlock")}</th>
              <th>{t("trapsColumnLastCheck")}</th>
              <th>{t("trapsColumnLastReading")}</th>
              <th>{t("trapsColumnStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {detalle.trampas.map((trampa) => {
              const { estado } = estadoDeTrampa({
                hoy,
                trampa: {
                  id: trampa.id, trapNumber: trampa.trapNumber, bloque: trampa.bloque?.name ?? null,
                  status: trampa.status,
                  ultimaRevision: trampa.ultimaRevision
                    ? { dia: trampa.ultimaRevision.observedAt.toISOString().slice(0, 10), brocaLevel: trampa.ultimaRevision.brocaLevel }
                    : null,
                  instaladaEl: trampa.instaladaEl ? trampa.instaladaEl.toISOString().slice(0, 10) : null,
                },
                regla: detalle.reglaDeTrampas,
              });
              const claveBloque = trampa.bloque ? claveDeTituloDeBloque(trampa.bloque.blockType) : null;
              return (
                <tr key={trampa.id}>
                  <td>{trampa.trapNumber ?? t("notRecorded")}</td>
                  <td><Link href={`/plots/${trampa.plotId}?pestana=trampas`}>{trampa.plotName}</Link></td>
                  <td>
                    {trampa.bloque
                      ? claveBloque ? t(claveBloque, { name: trampa.bloque.name }) : trampa.bloque.name
                      : t("trapsNoBlock")}
                  </td>
                  <td>{trampa.ultimaRevision ? trampa.ultimaRevision.observedAt.toISOString().slice(0, 10) : t("trapsNeverChecked")}</td>
                  <td>{trampa.ultimaRevision?.brocaLevel ? t(`trapsLevel_${trampa.ultimaRevision.brocaLevel}`) : t("notRecorded")}</td>
                  <td>{t(`trapEstado_${estado}` as "trapEstado_al_dia")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Paso 2: Enlazar desde `app/finca/page.tsx`**

Añadir a la lista `destinos`, tras el de cosecha:

```tsx
{
  href: "/finca/trampas",
  titulo: t("fincaTrapsLink"),
  ayuda: t("fincaTrapsLinkAyuda"),
  visible: granted.has("specimen:view") || granted.has("specimen:manage"),
},
```

- [ ] **Paso 3: Claves de i18n**

En `messages/es.json`, namespace `SeccionFinca`:

```json
"fincaTrapsLink": "Trampas",
"fincaTrapsLinkAyuda": "Cuántas hay, cómo están y cuándo tocan revisar."
```

Y en el namespace `Traceability`:

```json
"fincaTrapsTitle": "Trampas de la finca",
"fincaTrapsTitleNamed": "Trampas de {name}",
"fincaTrapsNoAccess": "No tienes acceso a las trampas de esta finca.",
"trapsColumnPlot": "Parcela"
```

En `messages/en.json`, `SeccionFinca`:

```json
"fincaTrapsLink": "Traps",
"fincaTrapsLinkAyuda": "How many there are, their status, and when they're due."
```

Y `Traceability`:

```json
"fincaTrapsTitle": "Farm traps",
"fincaTrapsTitleNamed": "{name}'s traps",
"fincaTrapsNoAccess": "You don't have access to this farm's traps.",
"trapsColumnPlot": "Plot"
```

- [ ] **Paso 4: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.

- [ ] **Paso 5: Recorrido manual**

Con una cuenta con `specimen:view`, `/finca` muestra el enlace «Trampas»; con una cuenta sin él,
no aparece. `/finca/trampas` con una sola finca accesible muestra la tabla directo; con una
cuenta sin ningún lote accesible, muestra el mensaje de «no tienes acceso», nunca una tabla
vacía.

- [ ] **Paso 6: Commit**

```bash
git add app/finca/trampas/page.tsx app/finca/page.tsx messages/es.json messages/en.json
git commit -F msg.txt
```

`msg.txt`:
```
La tabla de trampas de toda la finca, en /finca/trampas

Enlazada desde /finca sólo para quien tiene acceso de specimen. Sin
ningún lote accesible, mensaje explícito en vez de una tabla vacía.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 9: La ronda de trampas — lista de tarjetas

**Archivos:**
- Crear: `app/finca/trampas/ronda/page.tsx`
- Modificar: `app/finca/trampas/page.tsx` (el botón «Ir a la ronda» ya apunta aquí desde la
  Tarea 8; sin cambios adicionales)

**Interfaces:**
- Produce (pura, colocada en `lib/traceability/pendienteDeTrampas.ts`): `ordenDeRonda(
  trampas: readonly (FincaTrampa & { estadoActual: { estado: EstadoDeTrampa; diasDeRetraso:
  number | null } })[]): typeof trampas` — ordena: `toca_revisar`/`lectura_alta` primero
  (por `diasDeRetraso` descendente, vencidas antes que las de hoy), después el resto, y dentro
  de cada grupo por `trapNumber`.
- Consume: `getFincasConTrampas`, `getFincaTrampas` (Tarea 7), `estadoDeTrampa` (Tarea 3).

- [ ] **Paso 1: Escribir la prueba de `ordenDeRonda`**

```typescript
// tests/traceability/pendienteDeTrampas.test.ts — añadir
describe("ordenDeRonda", () => {
  const trampa = (n: number, estado: EstadoDeTrampa, dias: number | null) => ({
    id: `t${n}`, trapNumber: n, plotId: "p", plotName: "P", bloque: null,
    status: "active" as const, ultimaRevision: null, instaladaEl: null,
    estadoActual: { estado, diasDeRetraso: dias },
  });

  it("las vencidas van primero, ordenadas por más días de retraso", () => {
    const orden = ordenDeRonda([
      trampa(1, "al_dia", null),
      trampa(2, "toca_revisar", 2),
      trampa(3, "toca_revisar", 5),
      trampa(4, "lectura_alta", 0),
    ]);
    expect(orden.map((t) => t.trapNumber)).toEqual([3, 2, 4, 1]);
  });

  it("dentro de un mismo grupo, por número de trampa", () => {
    const orden = ordenDeRonda([trampa(5, "al_dia", null), trampa(2, "al_dia", null)]);
    expect(orden.map((t) => t.trapNumber)).toEqual([2, 5]);
  });
});
```

- [ ] **Paso 2: Correr y ver caer**

Run: `npm test -- tests/traceability/pendienteDeTrampas.test.ts`
Expected: FAIL — `ordenDeRonda` no existe.

- [ ] **Paso 3: Implementar en `lib/traceability/pendienteDeTrampas.ts`**

```typescript
/**
 * El orden de las tarjetas de la ronda, spec §4.2: primero las que tocan revisar
 * —vencidas y luego las de hoy—, después el resto, y dentro de cada grupo por número
 * de trampa. `lectura_alta` cuenta como «toca revisar» para este orden: las dos son
 * la misma urgencia, sólo cambia el texto.
 */
export function ordenDeRonda<
  T extends { trapNumber: number | null; estadoActual: { estado: EstadoDeTrampa; diasDeRetraso: number | null } },
>(trampas: readonly T[]): T[] {
  const urgente = (e: EstadoDeTrampa) => e === "toca_revisar" || e === "lectura_alta";
  return [...trampas].sort((a, b) => {
    const aUrgente = urgente(a.estadoActual.estado);
    const bUrgente = urgente(b.estadoActual.estado);
    if (aUrgente !== bUrgente) return aUrgente ? -1 : 1;
    if (aUrgente) {
      const diff = (b.estadoActual.diasDeRetraso ?? 0) - (a.estadoActual.diasDeRetraso ?? 0);
      if (diff !== 0) return diff;
    }
    return (a.trapNumber ?? 0) - (b.trapNumber ?? 0);
  });
}
```

- [ ] **Paso 4: Correr y ver pasar**

Run: `npm test -- tests/traceability/pendienteDeTrampas.test.ts`
Expected: PASS.

- [ ] **Paso 5: Flip-test**

Mutar `aUrgente ? -1 : 1` a `1` (siempre) y correr: el primer test cae (las urgentes ya no
quedan primero). Restaurar.

- [ ] **Paso 6: Crear `app/finca/trampas/ronda/page.tsx`**

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getFincasConTrampas, getFincaTrampas, FincaTrapAccessError } from "../../../../lib/traceability/fincaTrampas";
import { estadoDeTrampa, ordenDeRonda } from "../../../../lib/traceability/pendienteDeTrampas";
import { claveDeTituloDeBloque } from "../../../../lib/traceability/plotBlocks";
import { diaDeHoy } from "../../../../lib/time/diaDeHoy";

export const dynamic = "force-dynamic";

/**
 * La ronda de trampas — spec §4.2, pensada para el móvil. Sólo trampas activas: una
 * retirada no se revisa (mismo criterio que `recordTrapCheck`).
 */
export default async function RondaDeTrampasPage({
  searchParams,
}: {
  searchParams: Promise<{ finca?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fincas = await getFincasConTrampas(user.userAccountId);
  if (fincas.length === 0) notFound();
  const { finca: fincaElegida } = await searchParams;
  const farmLocationId = fincaElegida && fincas.some((f) => f.id === fincaElegida)
    ? fincaElegida
    : fincas.length === 1 ? fincas[0].id : null;

  if (farmLocationId == null) {
    return (
      <div>
        <h1>{t("trapsGoToRoundLink")}</h1>
        <ul>
          {fincas.map((f) => (
            <li key={f.id}><Link href={`/finca/trampas/ronda?finca=${f.id}`}>{f.name}</Link></li>
          ))}
        </ul>
      </div>
    );
  }

  let detalle;
  try {
    detalle = await getFincaTrampas(user.userAccountId, farmLocationId);
  } catch (error) {
    if (error instanceof FincaTrapAccessError) {
      return <p className="nn-error" role="alert">{t("fincaTrapsNoAccess")}</p>;
    }
    throw error;
  }

  const hoy = diaDeHoy(new Date(), null);
  const activas = detalle.trampas
    .filter((tr) => tr.status === "active")
    .map((tr) => ({
      ...tr,
      estadoActual: estadoDeTrampa({
        hoy,
        trampa: {
          id: tr.id, trapNumber: tr.trapNumber, bloque: tr.bloque?.name ?? null, status: tr.status,
          ultimaRevision: tr.ultimaRevision
            ? { dia: tr.ultimaRevision.observedAt.toISOString().slice(0, 10), brocaLevel: tr.ultimaRevision.brocaLevel }
            : null,
          instaladaEl: tr.instaladaEl ? tr.instaladaEl.toISOString().slice(0, 10) : null,
        },
        regla: detalle.reglaDeTrampas,
      }),
    }));
  const ordenadas = ordenDeRonda(activas);

  return (
    <div>
      <p className="nn-detail-meta"><Link href="/finca/trampas">{t("plotDashboardBackLink")}</Link></p>
      <h1>{t("trapsGoToRoundLink")}</h1>
      {ordenadas.length === 0 ? (
        <p className="nn-muted">{t("trapsNone")}</p>
      ) : (
        ordenadas.map((trampa) => {
          const claveBloque = trampa.bloque ? claveDeTituloDeBloque(trampa.bloque.blockType) : null;
          return (
            <article key={trampa.id} className="nn-card">
              <h2>{t("trapsNumber", { n: trampa.trapNumber ?? "?" })}</h2>
              <p className="nn-detail-meta">
                {trampa.plotName}
                {trampa.bloque ? (
                  <> · {claveBloque ? t(claveBloque, { name: trampa.bloque.name }) : trampa.bloque.name}</>
                ) : null}
              </p>
              <p>
                <strong>
                  {trampa.estadoActual.estado === "toca_revisar"
                    ? t("trapEstadoTextoRetraso", { dias: trampa.estadoActual.diasDeRetraso ?? 0 })
                    : trampa.estadoActual.estado === "lectura_alta"
                      ? t("trapEstado_lectura_alta")
                      : trampa.estadoActual.estado === "al_dia"
                        ? t("trapEstado_al_dia")
                        : t("trapEstado_sin_regla")}
                </strong>
              </p>
              <p className="nn-detail-meta">
                {trampa.ultimaRevision?.brocaLevel
                  ? t("trapsLastCheck", {
                      fecha: trampa.ultimaRevision.observedAt.toISOString().slice(0, 10),
                      lectura: t(`trapsLevel_${trampa.ultimaRevision.brocaLevel}`),
                    })
                  : t("trapsNeverChecked")}
              </p>
              {/* La Tarea 10 añade aquí el <details> con RondaDeTrampaForm. */}
            </article>
          );
        })
      )}
    </div>
  );
}
```

- [ ] **Paso 7: Añadir la clave de i18n**

En `messages/es.json`: `"trapEstadoTextoRetraso": "Atrasada {dias, plural, one {# día} other {# días}}"`.
En `messages/en.json`: `"trapEstadoTextoRetraso": "Overdue by {dias, plural, one {# day} other {# days}}"`.

- [ ] **Paso 8: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/traceability/pendienteDeTrampas.test.ts`
Expected: PASS.

- [ ] **Paso 9: Commit**

```bash
git add lib/traceability/pendienteDeTrampas.ts app/finca/trampas/ronda/page.tsx messages/es.json messages/en.json
git commit -F msg.txt
```

`msg.txt`:
```
La ronda de trampas: lista de tarjetas ordenada por urgencia

ordenDeRonda() pone primero lo vencido, luego lo de hoy y luego el
resto. Sólo trampas activas. El formulario corto llega en la próxima
tarea.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 10: El formulario corto de la ronda, con conexión

**Archivos:**
- Crear: `app/components/traceability/RondaDeTrampaForm.tsx`
- Modificar: `app/finca/trampas/ronda/page.tsx`
- Modificar: `lib/time/localDateTime.ts` (nueva `hoyLocalISO`)
- Modificar: `app/components/traceability/RevisionDeTrampaForm.tsx` → **eliminar** (huérfano
  desde la Tarea 3; su reemplazo nace en esta tarea)
- Modificar: `messages/es.json`, `messages/en.json`
- Test: `tests/time/localDateTime.test.ts` (existe; se le añade un caso)

**Interfaces:**
- Produce: `hoyLocalISO(ahora: Date = new Date()): string` en `lib/time/localDateTime.ts`,
  pura, inyectable.
- Consume: `recordTrapCheckFormAction` (ya existe en `app/actions/traceability.ts`, sin
  cambios en esta tarea — la Tarea 11 le añade `revisionClientDraftId`).
- Consume: `getObserverCandidates` (ya existe), sólo por `selfPersonId`.

- [ ] **Paso 1: Escribir la prueba de `hoyLocalISO`**

```typescript
// tests/time/localDateTime.test.ts — añadir
it("hoyLocalISO da la fecha del reloj inyectado, en su propio calendario", () => {
  expect(hoyLocalISO(new Date(2026, 8, 18, 23, 30))).toBe("2026-09-18");
  expect(hoyLocalISO(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
});
```

- [ ] **Paso 2: Correr y ver caer**

Run: `npm test -- tests/time/localDateTime.test.ts`
Expected: FAIL — `hoyLocalISO` no existe.

- [ ] **Paso 3: Implementar en `lib/time/localDateTime.ts`**

```typescript
/**
 * La fecha de HOY en el calendario del reloj que se le pase — nunca `toISOString()`,
 * que da la fecha en UTC y puede ir un día por delante o por detrás según la zona del
 * dispositivo. Para precargar un `<input type="date">` con «hoy» tal como el operario
 * lo entiende de pie en el campo.
 */
export function hoyLocalISO(ahora: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
}
```

- [ ] **Paso 4: Correr y ver pasar**

Run: `npm test -- tests/time/localDateTime.test.ts`
Expected: PASS.

- [ ] **Paso 5: Flip-test**

Mutar `ahora.getMonth() + 1` a `ahora.getMonth()` y correr: el primer caso pasa a esperar
"2026-08-18" y cae contra el mes real. Restaurar.

- [ ] **Paso 6: Crear `RondaDeTrampaForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { recordTrapCheckFormAction, type TraceabilityActionState } from "../../actions/traceability";
import { hoyLocalISO } from "../../../lib/time/localDateTime";
import { TriStateField } from "./TriStateField";

const NIVELES = ["ninguno", "pocos", "algunos", "muchos"] as const;
const initialState: TraceabilityActionState = {};

/**
 * El formulario corto de la ronda — spec §4.2: seis campos, no diez. Procedencia FIJA
 * a observación directa y SIN elegir observador (es quien tiene sesión iniciada): en
 * la ronda, quien registra es quien miró la tela. `RevisionDeTrampaForm` —con
 * procedencia, calidad del dato y observador elegibles— queda para ajustes y para
 * corregir, no para este formulario.
 */
export function RondaDeTrampaForm({
  locationId,
  specimenId,
  selfPersonId,
}: {
  locationId: string;
  specimenId: string;
  selfPersonId: string | null;
}) {
  const t = useTranslations("Traceability");
  const [state, formAction, pending] = useActionState(recordTrapCheckFormAction, initialState);
  const id = (campo: string) => `ronda-${campo}-${specimenId}`;

  return (
    <form action={formAction} className="nn-form">
      <input type="hidden" name="locationId" value={locationId} />
      <input type="hidden" name="specimenId" value={specimenId} />
      <input type="hidden" name="provenanceClass" value="direct_observation" />
      <input type="hidden" name="observerPersonId" value={selfPersonId ?? ""} />

      <div className="nn-field">
        <label htmlFor={id("observedAt")}>{t("trapCheckDate")}</label>
        <input id={id("observedAt")} type="date" name="observedAt" required defaultValue={hoyLocalISO()} />
      </div>

      <div className="nn-field">
        <label htmlFor={id("brocaLevel")}>{t("trapCheckLevel")}</label>
        <select id={id("brocaLevel")} name="brocaLevel" required defaultValue="">
          <option value="">{t("trapCheckLevelChoose")}</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>{t(`trapsLevel_${n}`)}</option>
          ))}
        </select>
      </div>

      <div className="nn-field">
        <label htmlFor={id("captureCount")}>{t("trapCheckCount")}</label>
        <input
          id={id("captureCount")} type="number" name="captureCount" min="0" step="1"
          inputMode="numeric" placeholder={t("notRecorded")}
          onWheel={(e) => e.currentTarget.blur()}
        />
      </div>

      <TriStateField id={id("otherInsects")} name="otherInsects" label={t("trapCheckOthers")} />
      <div className="nn-field">
        <label htmlFor={id("otherInsectsNote")}>{t("trapCheckOthersNote")}</label>
        <input id={id("otherInsectsNote")} type="text" name="otherInsectsNote" placeholder={t("notRecorded")} />
      </div>

      <TriStateField id={id("cleaned")} name="cleaned" label={t("trapCheckCleaned")} />
      <TriStateField id={id("liquidChanged")} name="liquidChanged" label={t("trapCheckLiquid")} />
      <TriStateField id={id("lureRecharged")} name="lureRecharged" label={t("trapCheckLure")} />

      {state.error ? <p className="nn-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="nn-button" disabled={pending}>{t("trapCheckSave")}</button>
    </form>
  );
}
```

- [ ] **Paso 7: Añadir la tarjeta con el formulario en `app/finca/trampas/ronda/page.tsx`**

Sustituir el comentario `{/* La Tarea 10 añade aquí ... */}` por:

```tsx
<details>
  <summary>{t("trapCheckTitle")}</summary>
  <RondaDeTrampaForm locationId={trampa.plotId} specimenId={trampa.id} selfPersonId={selfPersonId} />
</details>
```

Y en el componente de la página, leer `selfPersonId` (necesita `getObserverCandidates`):

```typescript
import { getObserverCandidates } from "../../../../lib/traceability/lots";
// ...
const { selfPersonId } = await getObserverCandidates(user.userAccountId);
```

- [ ] **Paso 8: Eliminar `RevisionDeTrampaForm.tsx`**

Confirmar que ningún archivo lo importa ya (`grep -rl "RevisionDeTrampaForm" app/`); si sólo
aparece su propia definición, eliminar `app/components/traceability/RevisionDeTrampaForm.tsx`.

- [ ] **Paso 9: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/time/localDateTime.test.ts`
Expected: PASS.

- [ ] **Paso 10: Recorrido manual**

En el móvil (`npm run dev:local`, viewport angosto), `/finca/trampas/ronda` muestra tarjetas
grandes; tocar «Registrar una revisión» abre el formulario corto con la fecha de hoy ya puesta,
sin selector de procedencia ni de observador.

- [ ] **Paso 11: Commit**

```bash
git add app/components/traceability/RondaDeTrampaForm.tsx app/finca/trampas/ronda/page.tsx lib/time/localDateTime.ts tests/time/localDateTime.test.ts messages/es.json messages/en.json
git rm app/components/traceability/RevisionDeTrampaForm.tsx
git commit -F msg.txt
```

`msg.txt`:
```
El formulario corto de la ronda: seis campos, procedencia y observador fijos

Sustituye a RevisionDeTrampaForm, que quedó huérfano al mudar la
revisión fuera del tablero de parcela (Tarea 3). Con conexión, por
ahora — la próxima tarea le añade el camino sin señal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 11: La revisión de la ronda viaja sin señal

**Archivos:**
- Crear: `prisma/migrations/20260918200000_revision_de_trampa_con_borrador/migration.sql`
- Modificar: `prisma/schema.prisma` (`SpecimenObservation.clientDraftId`)
- Modificar: `lib/traceability/traps.ts` (`recordTrapCheck` gana `clientDraftId`)
- Modificar: `app/actions/traceability.ts` (`recordTrapCheckFormAction` pasa
  `revisionClientDraftId`)
- Modificar: `lib/sync/parcelaPayload.ts` (nuevo `construirPayloadDeRevisionDeTrampa`)
- Modificar: `lib/sync/parsearMutaciones.ts` (nueva rama `"trap_check"`)
- Modificar: `lib/sync/pushFieldEvents.ts` (nueva rama `"trap_check"`)
- Modificar: `app/components/traceability/RondaDeTrampaForm.tsx` (rama sin señal)
- Modificar: `app/finca/trampas/ronda/page.tsx` (montar `FieldSyncControls`)
- Test: `tests/traceability/traps.test.ts` (existe), `tests/sync/parcelaPayload.test.ts` (existe)

**Interfaces:**
- Produce: `recordTrapCheck(userAccountId, input: RecordTrapCheckInput & { clientDraftId?:
  string | null })` — con `clientDraftId`, es idempotente: una segunda llamada con el mismo
  valor devuelve la fila existente en vez de crear otra.
- Produce: `construirPayloadDeRevisionDeTrampa(fd: FormData, specimenId: string, locationId:
  string, clientDraftId: string): PayloadDeRevisionDeTrampa` — pura.
- Consume: `queueFieldEvent`, `FieldSyncControls` (sin cambios).

- [ ] **Paso 1: Escribir la migración**

```sql
-- P4 §11 extendido para la ronda de trampas (spec de vistas de finca y parcela §4.3):
-- la revisión necesita una clave de idempotencia igual que PlantingCohort, SoilSample,
-- etc., para viajar por la cola sin señal y para que su foto (Tarea 12) pueda
-- engancharse a una revisión que el servidor todavía no ha visto.
ALTER TABLE "traceability"."specimen_observation" ADD COLUMN "client_draft_id" TEXT;

CREATE UNIQUE INDEX "specimen_observation_client_draft_id_key"
  ON "traceability"."specimen_observation"("client_draft_id");
```

- [ ] **Paso 2: `prisma/schema.prisma`**

En `model SpecimenObservation`, junto a las demás columnas propias de `trap_check`:

```prisma
  // P4 §11 extendido — la clave de idempotencia de la ronda sin señal. NULL en toda
  // observación que no viene de ese camino (floraciones, instalaciones, etc.).
  clientDraftId String? @unique @map("client_draft_id")
```

- [ ] **Paso 3: Aplicar y regenerar**

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migración aplicada; `npm run typecheck` sin errores nuevos de `SpecimenObservation`.

- [ ] **Paso 4: Escribir la prueba que falla — idempotencia de `recordTrapCheck`**

```typescript
// tests/traceability/traps.test.ts — añadir
it("con clientDraftId, una segunda llamada devuelve la misma fila", async () => {
  const clientDraftId = crypto.randomUUID();
  const primera = await recordTrapCheck(userAccountId, { ...inputBase, clientDraftId });
  const segunda = await recordTrapCheck(userAccountId, { ...inputBase, clientDraftId });
  expect(segunda.id).toBe(primera.id);
  const total = await prisma.specimenObservation.count({ where: { specimenId: trampa.id, observationType: "trap_check" } });
  expect(total).toBe(1);
});
```

- [ ] **Paso 5: Correr y ver caer**

Run: `npm test -- tests/traceability/traps.test.ts`
Expected: FAIL — hoy crea dos filas.

- [ ] **Paso 6: Implementar en `lib/traceability/traps.ts`**

En `RecordTrapCheckInput`, añadir `clientDraftId?: string | null;`. Al principio de
`recordTrapCheck`, antes de las validaciones de `brocaLevel`:

```typescript
  if (input.clientDraftId) {
    const yaExiste = await prisma.specimenObservation.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (yaExiste) return yaExiste;
  }
```

Y en el `tx.specimenObservation.create` dentro del `$transaction`, añadir al `data`:

```typescript
        clientDraftId: input.clientDraftId ?? null,
```

- [ ] **Paso 7: Correr y ver pasar**

Run: `npm test -- tests/traceability/traps.test.ts`
Expected: PASS.

- [ ] **Paso 8: Flip-test**

Mutar el `if (yaExiste) return yaExiste;` a `if (false)` y correr: el nuevo test cae (dos
filas). Restaurar y confirmar que vuelve a pasar.

- [ ] **Paso 9: `recordTrapCheckFormAction` — leer `revisionClientDraftId`**

En `app/actions/traceability.ts`, dentro de `recordTrapCheckFormAction`, añadir al objeto que
se pasa a `recordTrapCheck`:

```typescript
      clientDraftId: emptyToNull(formData.get("revisionClientDraftId")),
```

- [ ] **Paso 10: `construirPayloadDeRevisionDeTrampa` en `lib/sync/parcelaPayload.ts`**

```typescript
export interface PayloadDeRevisionDeTrampa {
  kind: "trap_check";
  locationId: string;
  specimenId: string;
  clientDraftId: string;
  observedAt: string;
  brocaLevel: string;
  captureCount: number | null;
  otherInsects: boolean | null;
  otherInsectsNote: string | null;
  cleaned: boolean | null;
  liquidChanged: boolean | null;
  lureRecharged: boolean | null;
  observerPersonId: string | null;
  provenanceClass: string;
}

/**
 * La revisión de la ronda de trampas, sin señal. Procedencia y observador vienen
 * FIJOS del formulario (campos ocultos) — spec §4.2 — así que se leen igual que
 * cualquier otro campo, no se hardcodean aquí: si el formulario cambiara su valor
 * oculto, este constructor no debería tener que cambiar también.
 */
export function construirPayloadDeRevisionDeTrampa(
  fd: FormData, specimenId: string, locationId: string, clientDraftId: string,
): PayloadDeRevisionDeTrampa {
  return {
    kind: "trap_check",
    locationId,
    specimenId,
    clientDraftId,
    observedAt: diaRequerido(fd, "observedAt"),
    brocaLevel: String(fd.get("brocaLevel") ?? ""),
    captureCount: numero(fd, "captureCount"),
    otherInsects: booleano(fd, "otherInsects"),
    otherInsectsNote: booleano(fd, "otherInsects") === false ? null : texto(fd, "otherInsectsNote"),
    cleaned: booleano(fd, "cleaned"),
    liquidChanged: booleano(fd, "liquidChanged"),
    lureRecharged: booleano(fd, "lureRecharged"),
    observerPersonId: texto(fd, "observerPersonId"),
    provenanceClass: String(fd.get("provenanceClass") ?? ""),
  };
}
```

- [ ] **Paso 11: Escribir la prueba de `construirPayloadDeRevisionDeTrampa`**

```typescript
// tests/sync/parcelaPayload.test.ts — añadir
it("conserva vacío = null en conteo y en los tres de mantenimiento", () => {
  const fd = new FormData();
  fd.set("observedAt", "2026-09-18");
  fd.set("brocaLevel", "pocos");
  fd.set("provenanceClass", "direct_observation");
  const payload = construirPayloadDeRevisionDeTrampa(fd, "specimen-1", "loc-1", "draft-1");
  expect(payload.captureCount).toBeNull();
  expect(payload.cleaned).toBeNull();
  expect(payload.liquidChanged).toBeNull();
  expect(payload.lureRecharged).toBeNull();
});
```

- [ ] **Paso 12: Correr y ver caer, luego pasar**

Run: `npm test -- tests/sync/parcelaPayload.test.ts`
Expected: primero FAIL (la función no existe), luego PASS tras el Paso 10.

- [ ] **Paso 13: Rama en `lib/sync/parsearMutaciones.ts`**

Añadir junto a las ramas `"soil_profile"`/`"planting_cohort"` una que reconozca
`m.kind === "trap_check"` y valide la forma del objeto (mismos campos que
`PayloadDeRevisionDeTrampa`), devolviendo el objeto tipado o marcándolo inválido con el mismo
criterio que las otras cuatro.

- [ ] **Paso 14: Rama en `lib/sync/pushFieldEvents.ts`**

Junto al bloque `if (m.kind === "soil_sample" || ...)`, añadir:

```typescript
    if (m.kind === "trap_check") {
      results.push(await aplicarRevisionDeTrampa(userAccountId, m));
      continue;
    }
```

Y la función, siguiendo el mismo patrón que `aplicarCapturaDeParcela` (comprobación previa por
`clientDraftId`, captura de `TrapValidationError`/`TrapAccessError` como `rejected`):

```typescript
async function aplicarRevisionDeTrampa(
  userAccountId: string, m: MutacionDeRevisionDeTrampa,
): Promise<PushResult> {
  const yaEstaba = await prisma.specimenObservation.findUnique({
    where: { clientDraftId: m.clientDraftId }, select: { id: true },
  });
  if (yaEstaba) return { clientDraftId: m.clientDraftId, status: "duplicate", id: yaEstaba.id };

  try {
    const fila = await recordTrapCheck(userAccountId, {
      specimenId: m.specimenId,
      observedAt: new Date(m.observedAt),
      brocaLevel: exigeValorEnumerado(m.brocaLevel, TrapCaptureLevel, "brocaLevel") ?? (() => {
        throw new ValorEnumeradoInvalido(`brocaLevel_not_valid:${m.brocaLevel}`);
      })(),
      captureCount: m.captureCount ?? null,
      otherInsects: m.otherInsects ?? null,
      otherInsectsNote: m.otherInsectsNote ?? null,
      cleaned: m.cleaned ?? null,
      liquidChanged: m.liquidChanged ?? null,
      lureRecharged: m.lureRecharged ?? null,
      observerPersonId: m.observerPersonId ?? null,
      provenanceClass: exigeProcedencia(m.provenanceClass, PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      clientDraftId: m.clientDraftId,
    });
    return { clientDraftId: m.clientDraftId, status: "applied", id: fila.id };
  } catch (error) {
    if (esCarreraDeClientDraftId(error)) {
      const ganador = await prisma.specimenObservation.findUnique({ where: { clientDraftId: m.clientDraftId }, select: { id: true } });
      if (ganador) return { clientDraftId: m.clientDraftId, status: "duplicate", id: ganador.id };
    }
    if (error instanceof TrapValidationError || error instanceof TrapAccessError || error instanceof ValorEnumeradoInvalido || error instanceof ProcedenciaInvalida) {
      return { clientDraftId: m.clientDraftId, status: "rejected", reason: error.message };
    }
    throw error;
  }
}
```

Importar `recordTrapCheck, TrapValidationError, TrapAccessError` desde
`../traceability/traps` y `TrapCaptureLevel` desde `../../generated/prisma/client`.

- [ ] **Paso 15: Rama sin señal en `RondaDeTrampaForm.tsx`**

Añadir el mismo patrón que `SoilProfileForm.alEnviar` (Tarea de referencia:
`app/components/traceability/SoilProfileForm.tsx`):

```tsx
  const revisionClientDraftId = useRef(crypto.randomUUID()).current;
  const [encolando, setEncolando] = useState(false);
  const yaEncolando = useRef(false);

  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    if (typeof navigator !== "undefined" && navigator.onLine) return;
    e.preventDefault();
    if (yaEncolando.current) return;
    yaEncolando.current = true;
    setEncolando(true);
    const form = e.currentTarget;
    try {
      await queueFieldEvent({
        ...construirPayloadDeRevisionDeTrampa(new FormData(form), specimenId, locationId, revisionClientDraftId),
      });
      form.reset();
    } finally {
      yaEncolando.current = false;
      setEncolando(false);
    }
  };
```

Y en el `<form>`: `<form action={formAction} onSubmit={alEnviar} className="nn-form">`, con
`<input type="hidden" name="revisionClientDraftId" value={revisionClientDraftId} />` añadido a
los campos ocultos existentes. Importar `queueFieldEvent` de `../../../lib/sync/offlineQueue` y
`construirPayloadDeRevisionDeTrampa` de `../../../lib/sync/parcelaPayload`.

- [ ] **Paso 16: Montar `FieldSyncControls` en la ronda**

En `app/finca/trampas/ronda/page.tsx`, importar y montar
`<FieldSyncControls />` desde `../../../../components/traceability/FieldSyncControls`, arriba
del todo del `return`, antes del `<p>` de volver — spec §4.3: «El indicador existente lo
cuenta».

- [ ] **Paso 17: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/traceability/traps.test.ts tests/sync/parcelaPayload.test.ts tests/sync/pushFieldEvents.test.ts`
Expected: PASS.

- [ ] **Paso 18: Recorrido manual en modo avión**

`npm run dev:local` con las herramientas de red del navegador en «offline»: registrar una
revisión desde `/finca/trampas/ronda` deja «Nada pendiente» en 1, el botón «Sincronizar ahora»
se habilita; al volver a «online» y sincronizar, el pendiente baja a 0 y la trampa muestra la
nueva revisión.

- [ ] **Paso 19: Inventario de acceso**

Run: `node scripts/inventario-de-acceso.mjs` y actualizar
`docs/arquitectura/inventario-de-acceso.md`.

- [ ] **Paso 20: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260918200000_revision_de_trampa_con_borrador lib/traceability/traps.ts app/actions/traceability.ts lib/sync/parcelaPayload.ts lib/sync/parsearMutaciones.ts lib/sync/pushFieldEvents.ts app/components/traceability/RondaDeTrampaForm.tsx app/finca/trampas/ronda/page.tsx tests/traceability/traps.test.ts tests/sync/parcelaPayload.test.ts docs/arquitectura/inventario-de-acceso.md
git commit -F msg.txt
```

`msg.txt`:
```
La revisión de la ronda viaja sin señal, con su propia clave de idempotencia

SpecimenObservation gana client_draft_id. recordTrapCheck es
idempotente con él; la mutación "trap_check" se suma a la cola de
kind ya existente. Esa misma clave es la que la Tarea 12 usa para
engancharle la foto.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 12: La foto de la ronda viaja sin señal

**Archivos:**
- Modificar: `lib/traceability/landMedia.ts` (nueva `finalizeTrampaPhotoPorBorrador`)
- Modificar: `app/actions/traceability.ts` (nueva `finalizeTrampaPhotoPorBorradorAction`)
- Crear: `lib/sync/trapPhotoQueue.ts`
- Crear: `app/components/traceability/SincronizarFotosDeRonda.tsx`
- Modificar: `app/components/traceability/RondaDeTrampaForm.tsx` (campo de foto)
- Modificar: `app/finca/trampas/ronda/page.tsx` (montar el nuevo indicador)
- Test: `tests/traceability/landMedia.test.ts` (existe), `tests/sync/trapPhotoQueue.test.ts`
  (nuevo, sólo la parte pura)

**Decisión de modelo (spec §4.3, resuelta con el código delante):** la foto de una revisión de
trampa se modela como **`Asset` con `specimenObservationId`**, no como `FieldEvent` de tipo
`foto`. La cabecera de `lib/sync/fieldMedia.ts` explica por qué una foto de campo ES un
`FieldEvent`: porque `FieldEvent` es *append-only* y el pull por cursor de P4 §5 depende de que
nada lo actualice — pero esa forma exige un `fieldSessionId` (`FieldEvent.fieldSessionId String`,
**no anulable**). La ronda de trampas no tiene jornada: es una ronda de **toda la finca**, no de
un lote, y `FieldSession.locationId` es una sola Location. Forzar una `FieldSession` de mentira
para poder crear el `FieldEvent` inventaría un hecho de campo que no ocurrió. `Asset` con
`specimenObservationId` es además el camino que **ya existe** —F6 fix-final,
`landMedia.ts`, parent `"trapCheck"`— para la foto de trampa con conexión; esta tarea sólo le
añade la resolución por `clientDraftId` para cuando la revisión todavía no ha llegado.

**Interfaces:**
- Produce: `finalizeTrampaPhotoPorBorrador(userAccountId, input: { locationId, storageKey,
  mimeType, sizeBytes, originalFilename, revisionClientDraftId, provenanceClass,
  creatorPersonId? })` — lanza `LandMediaValidationError("revision_not_found_yet")` cuando la
  revisión todavía no existe (a distinguir de un rechazo definitivo).
- Produce: `finalizeTrampaPhotoPorBorradorAction(...): Promise<{ ok: true } | { pendiente: true }
  | { error: string }>`.
- Produce (`lib/sync/trapPhotoQueue.ts`, sólo cliente): `queueTrapPhoto(input: { locationId,
  revisionClientDraftId, file: File }): Promise<FotoDeRondaPendiente>`,
  `listTrapPhotoDrafts(): Promise<FotoDeRondaPendiente[]>`, `discardTrapPhotoDraft(id: string):
  Promise<void>`, `syncTrapPhotos(): Promise<SyncFotosSummary>`.
- Consume: `requestLandAssetUploadAction` (ya existe, sin cambios).

- [ ] **Paso 1: Escribir la prueba que falla — `finalizeTrampaPhotoPorBorrador`**

```typescript
// tests/traceability/landMedia.test.ts — añadir
it("resuelve la revisión por clientDraftId y cuelga el Asset de ella", async () => {
  const clientDraftId = crypto.randomUUID();
  const revision = await recordTrapCheck(userAccountId, { ...inputBase, clientDraftId });
  const { storageKey } = await requestLandAssetUpload(userAccountId, {
    locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
  });
  const asset = await finalizeTrampaPhotoPorBorrador(userAccountId, {
    locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
    originalFilename: "tela.jpg", revisionClientDraftId: clientDraftId,
    provenanceClass: "direct_observation",
  });
  expect(asset.specimenObservationId).toBe(revision.id);
});

it("si la revisión no ha llegado, lanza revision_not_found_yet (no un rechazo definitivo)", async () => {
  const { storageKey } = await requestLandAssetUpload(userAccountId, {
    locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
  });
  await expect(
    finalizeTrampaPhotoPorBorrador(userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId: "no-existe-todavia",
      provenanceClass: "direct_observation",
    }),
  ).rejects.toThrow(/revision_not_found_yet/);
});

it("deniega sin acceso de specimen a la parcela", async () => {
  const clientDraftId = crypto.randomUUID();
  await recordTrapCheck(userAccountId, { ...inputBase, clientDraftId });
  const { storageKey } = await requestLandAssetUpload(userAccountId, {
    locationId: parcela.id, originalFilename: "tela.jpg", contentType: "image/jpeg",
  });
  await expect(
    finalizeTrampaPhotoPorBorrador(otroUserAccountIdSinSpecimen, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1024,
      originalFilename: "tela.jpg", revisionClientDraftId: clientDraftId,
      provenanceClass: "direct_observation",
    }),
  ).rejects.toThrow(TrapAccessError);
});
```

- [ ] **Paso 2: Correr y ver caer**

Run: `npm run test:db -- up && npm test -- tests/traceability/landMedia.test.ts`
Expected: FAIL — la función no existe.

- [ ] **Paso 3: Implementar `finalizeTrampaPhotoPorBorrador` en `lib/traceability/landMedia.ts`**

```typescript
export interface FinalizeTrampaPhotoInput {
  locationId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  revisionClientDraftId: string;
  provenanceClass: ProvenanceClass;
  creatorPersonId?: string | null;
}

/**
 * F6 fix-final extendido para la ronda sin señal (spec §4.3). La revisión puede no
 * haber llegado todavía —viaja por su propia cola, Tarea 11— así que se resuelve por
 * `clientDraftId` en vez de exigir un `specimenObservationId` real. Si no aparece,
 * `revision_not_found_yet` es una señal de REINTENTAR, no un rechazo: la foto nunca se
 * engancha a otra revisión (spec §4.3, «si la foto llega antes, se reintenta»).
 *
 * Sin deduplicar por `clientDraftId` de la foto misma —a diferencia de
 * `finalizeFieldMedia`—: hereda la misma laguna que ya tiene `finalizeLandAssetUpload`,
 * y cerrarla aquí sería una tarea distinta sobre un archivo que esta rama no reescribe.
 */
export async function finalizeTrampaPhotoPorBorrador(userAccountId: string, input: FinalizeTrampaPhotoInput) {
  await requireTrapAccess(userAccountId, input.locationId);
  if (!input.storageKey.startsWith(prefijoDe(input.locationId))) {
    throw new LandMediaValidationError("invalid_storage_key");
  }

  const revision = await prisma.specimenObservation.findUnique({
    where: { clientDraftId: input.revisionClientDraftId },
    select: { id: true, specimen: { select: { locationId: true } } },
  });
  if (!revision) throw new LandMediaValidationError("revision_not_found_yet");
  if (revision.specimen.locationId !== input.locationId) {
    throw new LandMediaValidationError("trap_check_not_in_location");
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId }, select: { personId: true },
  });

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: input.mimeType.startsWith("image/") ? "photo" : input.mimeType.startsWith("video/") ? "video" : "document",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: input.creatorPersonId ?? userAccount.personId,
        status: "approved",
        classification: DEFAULT_CLASSIFICATION,
        createdBy: userAccountId,
        provenanceClass: input.provenanceClass,
        locationId: input.locationId,
        specimenObservationId: revision.id,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId, operation: "asset.create", entityType: "asset",
        entityId: asset.id, after: asset, sourceInterface: "traceability.service",
      },
      tx,
    );
    return asset;
  });
}
```

- [ ] **Paso 4: Correr y ver pasar**

Run: `npm test -- tests/traceability/landMedia.test.ts`
Expected: PASS.

- [ ] **Paso 5: Flip-test**

Mutar `if (!revision) throw ...` a `if (false)` y correr: el test de «revision_not_found_yet»
cae (no lanza, e intenta usar `revision.id` sobre `undefined`, reventando con otro error).
Restaurar y confirmar que los tres pasan.

- [ ] **Paso 6: `finalizeTrampaPhotoPorBorradorAction` en `app/actions/traceability.ts`**

```typescript
export async function finalizeTrampaPhotoPorBorradorAction(
  locationId: string, storageKey: string, mimeType: string, sizeBytes: number,
  originalFilename: string, revisionClientDraftId: string, creatorPersonId: string | null,
): Promise<{ ok: true } | { pendiente: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  try {
    await finalizeTrampaPhotoPorBorrador(user.userAccountId, {
      locationId, storageKey, mimeType, sizeBytes, originalFilename, revisionClientDraftId,
      provenanceClass: "direct_observation", creatorPersonId,
    });
  } catch (error) {
    if (error instanceof LandMediaValidationError && error.message === "revision_not_found_yet") {
      return { pendiente: true };
    }
    return { error: friendlyError(t, error) };
  }
  revalidatePath("/finca/trampas/ronda");
  return { ok: true };
}
```

Importar `finalizeTrampaPhotoPorBorrador` en el import ya existente de `../../lib/traceability/landMedia`.

- [ ] **Paso 7: Escribir la prueba pura de la cola de fotos**

```typescript
// tests/sync/trapPhotoQueue.test.ts
import { describe, expect, it } from "vitest";
import { clasificarResultadoDeFoto } from "../../lib/sync/trapPhotoQueue";

describe("clasificarResultadoDeFoto", () => {
  it("ok se aplica y se descarta", () => {
    expect(clasificarResultadoDeFoto({ ok: true })).toBe("aplicar");
  });
  it("pendiente se deja en cola, no es un error", () => {
    expect(clasificarResultadoDeFoto({ pendiente: true })).toBe("reintentar");
  });
  it("error se marca error", () => {
    expect(clasificarResultadoDeFoto({ error: "algo" })).toBe("rechazar");
  });
});
```

- [ ] **Paso 8: Correr y ver caer**

Run: `npm test -- tests/sync/trapPhotoQueue.test.ts`
Expected: FAIL — el módulo no existe.

- [ ] **Paso 9: Implementar `lib/sync/trapPhotoQueue.ts`**

```typescript
/**
 * P4 §4.3 extendido — cola local de fotos de la ronda de trampas, en IndexedDB. Sólo
 * cliente. Distinta de `lib/sync/offlineQueue.ts`: aquélla guarda JSON, ésta guarda el
 * `Blob` de la foto, que no cabe en la cola de mutaciones. Las dos conviven: la
 * revisión viaja por una, la foto por la otra, y se enganchan por
 * `revisionClientDraftId` en el servidor (`finalizeTrampaPhotoPorBorrador`).
 */
import { requestLandAssetUploadAction, finalizeTrampaPhotoPorBorradorAction } from "../../app/actions/traceability";

const DB_NAME = "nectar-trap-photo-offline";
const DB_VERSION = 1;
const STORE = "photos";

export interface FotoDeRondaPendiente {
  id: string;
  locationId: string;
  revisionClientDraftId: string;
  blob: Blob;
  originalFilename: string;
  contentType: string;
  createdAt: number;
  status: "pending" | "error";
  errorMessage?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function write(fn: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function queueTrapPhoto(input: {
  locationId: string; revisionClientDraftId: string; file: File;
}): Promise<FotoDeRondaPendiente> {
  const draft: FotoDeRondaPendiente = {
    id: crypto.randomUUID(),
    locationId: input.locationId,
    revisionClientDraftId: input.revisionClientDraftId,
    blob: input.file,
    originalFilename: input.file.name,
    contentType: input.file.type,
    createdAt: Date.now(),
    status: "pending",
  };
  await write((s) => s.add(draft));
  return draft;
}

export async function listTrapPhotoDrafts(): Promise<FotoDeRondaPendiente[]> {
  const db = await openDb();
  const rows = await new Promise<FotoDeRondaPendiente[]>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as FotoDeRondaPendiente[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function discardTrapPhotoDraft(id: string): Promise<void> {
  await write((s) => s.delete(id));
}

/**
 * Qué hacer con la respuesta de finalizar. Pura, la misma razón que
 * `clasificarRespuesta` en `offlineQueue.ts`: lo que puede equivocarse en silencio se
 * extrae para poder probarlo sin IndexedDB, sin `fetch` y sin la Server Action real.
 *
 * `"pendiente"` es la forma nueva de este archivo: la revisión no ha llegado
 * todavía, y NO es un rechazo — se deja en cola para reintentar, nunca se engancha a
 * otra revisión (spec §4.3).
 */
export function clasificarResultadoDeFoto(
  r: { ok: true } | { pendiente: true } | { error: string },
): "aplicar" | "reintentar" | "rechazar" {
  if ("ok" in r) return "aplicar";
  if ("pendiente" in r) return "reintentar";
  return "rechazar";
}

export interface SyncFotosSummary { applied: number; rejected: number; stillPending: number; }

export async function syncTrapPhotos(): Promise<SyncFotosSummary> {
  const fotos = (await listTrapPhotoDrafts()).filter((f) => f.status === "pending" || f.status === "error");
  let applied = 0;
  let rejected = 0;
  for (const foto of fotos) {
    try {
      const paso1 = await requestLandAssetUploadAction(foto.locationId, foto.originalFilename, foto.contentType);
      if ("error" in paso1) { await write((s) => s.put({ ...foto, status: "error", errorMessage: paso1.error })); rejected++; continue; }

      const subida = await fetch(paso1.uploadUrl, { method: "PUT", headers: { "content-type": foto.contentType }, body: foto.blob });
      if (!subida.ok) continue; // la red se cayó a mitad; se reintenta, no se descarta

      const paso2 = await finalizeTrampaPhotoPorBorradorAction(
        foto.locationId, paso1.storageKey, foto.contentType, foto.blob.size,
        foto.originalFilename, foto.revisionClientDraftId, null,
      );
      const decision = clasificarResultadoDeFoto(paso2);
      if (decision === "aplicar") { await discardTrapPhotoDraft(foto.id); applied++; }
      else if (decision === "rechazar" && "error" in paso2) {
        await write((s) => s.put({ ...foto, status: "error", errorMessage: paso2.error }));
        rejected++;
      }
      // "reintentar": se deja en cola tal cual, sin marcar error.
    } catch {
      // Sin señal a mitad de camino: se deja en cola.
    }
  }
  return { applied, rejected, stillPending: (await listTrapPhotoDrafts()).length };
}
```

- [ ] **Paso 10: Correr y ver pasar**

Run: `npm test -- tests/sync/trapPhotoQueue.test.ts`
Expected: PASS.

- [ ] **Paso 11: Flip-test**

Mutar `if ("ok" in r) return "aplicar";` a `if ("ok" in r) return "reintentar";` y correr: el
primer caso cae. Restaurar.

- [ ] **Paso 12: Campo de foto en `RondaDeTrampaForm.tsx`**

```tsx
  const [foto, setFoto] = useState<File | null>(null);

  const alEnviar = async (e: React.FormEvent<HTMLFormElement>) => {
    // La foto se encola aparte SIEMPRE, tenga o no señal la revisión: viajan por colas
    // distintas (ver la cabecera de `landMedia.ts` en la Tarea 12 del plan) y
    // encolarla no depende de qué camino tome el envío de la revisión.
    if (foto) {
      void queueTrapPhoto({ locationId, revisionClientDraftId, file: foto }).then(() => syncTrapPhotos());
    }
    if (typeof navigator !== "undefined" && navigator.onLine) return;
    // ... (resto igual que la Tarea 11)
  };
```

Y en el JSX, antes del botón de guardar:

```tsx
<div className="nn-field">
  <label htmlFor={id("foto")}>{t("trapCheckPhotoLabel")}</label>
  <input
    id={id("foto")} type="file" name="foto" accept="image/*" capture="environment"
    onChange={(e) => setFoto(e.target.files?.[0] ?? null)}
  />
</div>
```

Importar `queueTrapPhoto, syncTrapPhotos` desde `../../../lib/sync/trapPhotoQueue`.

- [ ] **Paso 13: Crear `SincronizarFotosDeRonda.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { listTrapPhotoDrafts, syncTrapPhotos, type SyncFotosSummary } from "../../../lib/sync/trapPhotoQueue";

/** El contador y el botón para las fotos de la ronda, gemelo de `FieldSyncControls`
 * pero para la cola de Blobs (Tarea 12). */
export function SincronizarFotosDeRonda() {
  const t = useTranslations("Traceability");
  const [pendientes, setPendientes] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<SyncFotosSummary | null>(null);

  const recontar = useCallback(async () => {
    try { setPendientes((await listTrapPhotoDrafts()).length); }
    catch { setPendientes(null); }
  }, []);

  useEffect(() => { void recontar(); }, [recontar]);

  const sincronizar = async () => {
    setEnviando(true);
    try { setUltimo(await syncTrapPhotos()); }
    finally { setEnviando(false); await recontar(); }
  };

  if (pendientes === null || pendientes === 0) return null;

  return (
    <div className="nn-field-sync" role="group">
      <p>{t("trapPhotoSyncPending", { count: pendientes })}</p>
      <button type="button" className="nn-button" onClick={sincronizar} disabled={enviando}>
        {enviando ? t("fieldSyncWorking") : t("fieldSyncButton")}
      </button>
      {ultimo ? <p role="status">{t("fieldSyncDone", { applied: ultimo.applied })}</p> : null}
    </div>
  );
}
```

- [ ] **Paso 14: Montar el indicador en la ronda**

En `app/finca/trampas/ronda/page.tsx`, junto a `<FieldSyncControls />`, añadir
`<SincronizarFotosDeRonda />`.

- [ ] **Paso 15: Claves de i18n**

En `messages/es.json`: `"trapCheckPhotoLabel": "Foto de la tela"`,
`"trapPhotoSyncPending": "{count, plural, =0 {Ninguna foto pendiente} one {# foto pendiente} other {# fotos pendientes}}"`.
En `messages/en.json`: `"trapCheckPhotoLabel": "Photo of the trap sheet"`,
`"trapPhotoSyncPending": "{count, plural, =0 {No photos pending} one {# photo pending} other {# photos pending}}"`.

- [ ] **Paso 16: Compuerta completa**

Run: `npm run typecheck && npm run build`
Expected: 0 errores.
Run: `npm test -- tests/traceability/landMedia.test.ts tests/sync/trapPhotoQueue.test.ts`
Expected: PASS.

- [ ] **Paso 17: Recorrido manual en modo avión**

Registrar una revisión CON foto en modo avión: el contador de fotos pendientes sube a 1. Volver
a «online», sincronizar primero la revisión y luego las fotos (o al revés): en cualquier orden,
la foto termina enganchada a su revisión y el pendiente de fotos baja a 0. Repetir sincronizando
la foto ANTES que la revisión: debe quedar pendiente (no rechazada) hasta que la revisión
también sincronice.

- [ ] **Paso 18: Inventario de acceso**

Run: `node scripts/inventario-de-acceso.mjs` y actualizar
`docs/arquitectura/inventario-de-acceso.md`.

- [ ] **Paso 19: Commit**

```bash
git add lib/traceability/landMedia.ts app/actions/traceability.ts lib/sync/trapPhotoQueue.ts app/components/traceability/SincronizarFotosDeRonda.tsx app/components/traceability/RondaDeTrampaForm.tsx app/finca/trampas/ronda/page.tsx tests/traceability/landMedia.test.ts tests/sync/trapPhotoQueue.test.ts messages/es.json messages/en.json docs/arquitectura/inventario-de-acceso.md
git commit -F msg.txt
```

`msg.txt`:
```
La foto de una revisión de la ronda viaja sin señal y se engancha por su clientDraftId

Asset con specimenObservationId, no FieldEvent: la ronda no tiene
jornada y forzar una la inventaría (razón completa en la cabecera de
landMedia.ts). Si la foto llega antes que su revisión, se reintenta
y nunca se engancha a otra.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Tarea 13: Verificación final y documentación

**Archivos:**
- Modificar: `docs/arquitectura/inventario-de-acceso.md` (si algún paso anterior quedó
  pendiente de actualizar)
- Modificar: `SESSION_STATE.md` del repositorio (si existe una sección de trabajo en curso que
  nombre esta spec)

- [ ] **Paso 1: Compuerta completa, sin canalizar**

```bash
npm run verify > /tmp/verify.txt 2>&1; echo "salida=$?"; tail -40 /tmp/verify.txt
```

Expected: `salida=0`.

- [ ] **Paso 2: Carril hermético tal cual lo corre CI**

```bash
bash scripts/ci.sh; echo "salida=$?"
```

Expected: `salida=0`, y ninguna de las pruebas nuevas de este plan aparece en su salida (deben
estar todas en `scripts/pruebas-por-compuerta.txt`, grupo `base-sembrada`, si tocan base — las de
`fincaTrampas.test.ts`, `traps.test.ts` y `landMedia.test.ts` la tocan).

- [ ] **Paso 3: Suite completa con base**

```bash
npm run test:db -- reset
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm test > /tmp/test.txt 2>&1; echo "salida=$?"; tail -40 /tmp/test.txt
```

Expected: `salida=0`.

- [ ] **Paso 4: Fila patrón conocida antes de creer nada**

```bash
psql "$TEST_DATABASE_URL" -c "select count(*) from traceability.plot_block where block_type is null;"
```

Expected: un número mayor que 0 si la base de pruebas trae bloques sembrados antes de esta
rama — confirma que la migración de la Tarea 1 no les inventó un tipo.

- [ ] **Paso 5: Añadir las pruebas nuevas al grupo `base-sembrada`**

Confirmar en `scripts/pruebas-por-compuerta.txt` que `tests/traceability/fincaTrampas.test.ts`,
`tests/traceability/pendienteDeTrampas.test.ts` (si ya no estaba) y
`tests/traceability/landMedia.test.ts` están listadas bajo `# @grupo: base-sembrada`. Si falta
alguna, añadirla.

- [ ] **Paso 6: Actualizar el conteo del inventario, de una vez, al final**

```bash
node scripts/inventario-de-acceso.mjs
```

Comparar contra la tabla actual de `docs/arquitectura/inventario-de-acceso.md` y corregir los
números si algún paso anterior quedó desactualizado. Run:
`npm test -- tests/arquitectura/cifras-del-inventario.test.ts`
Expected: PASS.

- [ ] **Paso 7: Commit**

```bash
git add docs/arquitectura/inventario-de-acceso.md scripts/pruebas-por-compuerta.txt
git commit -F msg.txt
```

`msg.txt`:
```
Verificación final de vistas de finca y parcela: compuerta completa en verde

npm run verify, scripts/ci.sh y npm test contra base restaurada, los
tres en salida 0. Inventario de acceso y grupo base-sembrada al día.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

## Nota fuera de este plan

**Permisos que sólo Daniel puede conceder** (spec §6): asignar `specimen:view` o
`specimen:manage` a Sherry, a su asistente cuando tenga usuario, a Bob Huerbsch y a David.
Ninguna tarea de este plan lo hace — es una asignación de datos, no código, y David no aparece
en la copia local de personas (comprobar si existe en producción antes de asignarle nada).

---

## Autorrevisión

**1. Cobertura de la spec.** Repasada sección por sección contra las 13 tareas:
- §2 decisiones 4–6 (jerarquía, sólo finca y parcela esta fase, tablero de sólo mirar con
  pestañas) → Tareas 2–6.
- §3 (vista de parcela: cabecera, pestañas, formularios a rutas propias) → Tareas 2–6.
- §4.1 (vista de finca en el ordenador) → Tarea 8 (Trampas, con la corrección de alcance:
  Lotes = Parcelas ya existente, Fotos = fase 2).
- §4.2 (la ronda) → Tareas 9–10.
- §4.3 (sin señal, revisión y foto, y la decisión de `FieldEvent` vs `Asset`) → Tareas 11–12.
- §5 (bloques con tipo, prefijo, ADR-080, solapamiento fuera de fase) → Tarea 1; el
  solapamiento no se toca, como pide la spec.
- §6 (permisos, servidor, mensaje de sin-acceso, asignación de Daniel) → Tareas 7–9 y la nota
  final.
- §7 (fuera de esta fase: vistas de bloque/planta, solapamiento, Research OS, mapa, orden de
  ruta, rueda del ratón en otros campos) → ninguna tarea las toca; la Tarea 10 SÍ protege la
  rueda del ratón en `captureCount` porque la spec §4.2 lo pide para ese campo específico.
- §8 (pruebas): la de la ronda multi-lote está en la Tarea 7; sin regla no sale «próxima
  revisión» está cubierto porque `estadoDeTrampa`/`ordenDeRonda` devuelven `sin_regla` y la
  pantalla de la Tarea 9 no imprime una fecha en ese caso; el payload que conserva vacío=null,
  Tarea 11 Paso 11; la foto rechazada con id de revisión inexistente, Tarea 12 Paso 1.

**2. Rastreo de placeholders.** Ninguna tarea deja un `TODO`, un «añadir validación» sin código,
ni una repetición de «igual que la Tarea N» sin el código repetido. Los tres tabs que en la
Tarea 2 quedan «sin gatear todavía» (Tareas 3–5) no son placeholders: son exactamente el estado
de hoy, sin tocar, hasta que su propia tarea los mude.

**3. Consistencia de tipos.** `EstadoDeTrampa` se define una vez (Tarea 3) y las Tareas 8–9 lo
consumen sin redefinirlo. `FincaTrampa` (Tarea 7) es la forma que consumen las Tareas 8 y 9 sin
cambios. `PlotBlockType` (Tarea 1) es el mismo tipo que consumen `claveDeTituloDeBloque`,
`getFincaTrampas` y las tres pantallas. `clientDraftId` en `RecordTrapCheckInput` (Tarea 11) es
el mismo valor que `revisionClientDraftId` en `FinalizeTrampaPhotoInput` (Tarea 12) — dos nombres
distintos a propósito: uno es la clave de idempotencia de la revisión misma, el otro es «la
revisión a la que esta foto se refiere», y son la misma cadena vista desde dos lados.

## Ambigüedades de la spec resueltas al escribir este plan

1. **§4.3, FieldEvent vs Asset (la que la spec pide resolver aquí).** Se eligió **`Asset` con
   `specimenObservationId`**. La cabecera de `fieldMedia.ts` explica que `FieldEvent` es
   append-only y por eso una foto de campo se modela como evento y no como adjunto — pero esa
   forma exige un `fieldSessionId` no anulable, y la ronda de trampas no tiene jornada: es de
   toda la finca, no de un lote. Inventar una `FieldSession` de mentira habría afirmado un hecho
   de campo que no ocurrió. `Asset` con `specimenObservationId` es además el camino que ya existe
   (F6 fix-final) para la foto de trampa con conexión.
2. **«Añadir resultado» y la foto de calicata, ¿se extraen con las otras cuatro?** No. La spec
   §3 nombra explícitamente sólo cuatro rutas a extraer; ni el resultado de laboratorio de una
   muestra existente ni la foto de una calicata están en esa lista, y las dos son acciones
   contextuales sobre una fila que ya está visible en la pestaña, no formularios que crean un
   registro nuevo desde cero. Se quedan inline.
3. **La corrección de alcance recibida a mitad de la exploración** (no crear `/farms/[id]`, usar
   `/finca/trampas` y `/finca/trampas/ronda`, no duplicar «Parcelas», diferir «Fotos» a fase 2)
   se incorporó desde la Tarea 7 en adelante; las Tareas 1–6 (tablero de parcela) no la
   necesitaban porque no tocan la vista de finca.
4. **¿`/finca/trampas` necesita un `[farmId]` en la ruta?** No: se resuelve por
   `getFincasConTrampas` — si hay exactamente una finca accesible, entra directo; si hay más,
   ofrece un selector por `?finca=`; si hay ninguna, `notFound()`. Mismo patrón que el apiario
   único de `lib/navigation.ts`.
5. **El `blockType` de una trampa retirada/muerta, para el estado.** `estadoDeTrampa` devuelve
   `sin_regla` para cualquier trampa que no esté `active`, aunque haya regla: no hay nada
   accionable que reportar para una trampa que ya no se revisa, y confundir eso con «sin regla
   configurada» sería impreciso pero no falso en la pantalla (ninguna de las dos muestra una
   fecha ni un plazo).
