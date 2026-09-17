# Monitoreo de trampas de broca — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans`, tarea por tarea. Los pasos usan
> casillas (`- [ ]`) para ir marcando.

**Meta:** que la revisión de una trampa de broca se registre en el sistema —con su
lectura, sus fotos y su mantenimiento— y que el tablero de la parcela avise cuándo
toca revisar, según las reglas que fije el encargado.

**Arquitectura:** la trampa ya existe como `Specimen` de tipo `trap` y la revisión
como `SpecimenObservation` de tipo `trap_check`; esto añade lo que falta —bloques,
numeración por finca, la escala de lectura, el mantenimiento, las fotos por revisión
y las reglas— sin crear entidades paralelas. Los avisos siguen el patrón de la pieza
1: una función **pura** que recibe datos ya leídos y devuelve avisos, y una pantalla
que los muestra.

**Stack:** Next.js 16 (App Router, Server Actions), Prisma + PostgreSQL, next-intl,
vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-trampas-de-broca-design.md` (PR #369).

## Restricciones globales

- **ADR-080:** un dato que falta se dice con su razón; **nunca un 0** en su lugar.
- **La escala manda, el número es opcional.** `brocaLevel` es obligatorio en toda
  revisión; `captureCount` sólo si alguien contó. **Las reglas nunca miran el número.**
- **Sin reglas configuradas no hay avisos ni plazos.** No se inventa el quincenal de
  la guía de Anacafé ni ningún otro valor por defecto.
- **Términos, aprobados por el dueño:** «bloque» (nunca «sector», que ya existe como
  `Specimen.sectorSimple` alto/medio/bajo), «revisión», «lectura».
- **Una regla sugiere, no actúa:** no aplica tratamientos, no cambia el estado de la
  trampa, no crea tareas.
- **Permisos:** todo lo de trampas y revisiones va con `specimen:manage` /
  `specimen:view`, que ya existen en `lib/rbac/catalog.ts`. Los bloques y las reglas
  usan `location:manage_attributes` (`requireLocationAttributeAccess`), que es la
  compuerta de «configurar la parcela» que usa la pieza 1.
- **Toda escritura va en `$transaction` con su `recordAuditEvent` dentro**
  (`tests/arquitectura/audit-atomico.test.ts` lo vigila leyendo la fuente).
- **`"use server"` sólo exporta funciones `async`** (`tests/arquitectura/use-server-solo-async.test.ts`).
- **Botones de envío:** `disabled={pending || sinConexion}` con
  `BotonQueNecesitaConexion`; lo vigila `tests/arquitectura/envio-sin-doble-toque.test.ts`.
- **Pruebas con base** van al grupo `# @grupo: base-sembrada` de
  `scripts/pruebas-por-compuerta.txt`, o CI las corre **sin base** y fallan.
- **Cualquier tarea que toque TypeScript corre `npm run build`**, no sólo `vitest`:
  vitest no comprueba tipos y `next build` sí (lección del 2026-09-05).
- **Al añadir archivos con consultas a la base**, recalcular las cifras de
  `docs/arquitectura/inventario-de-acceso.md` con `node scripts/inventario-de-acceso.mjs`
  — `tests/arquitectura/cifras-del-inventario.test.ts` compara el documento con el script.
- Node no está en el PATH: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`.
- Base de pruebas: `DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test`.
  **Es compartida con otras sesiones: nunca `prisma migrate dev`, nunca `reset`.**
  Para aplicar la migración nueva: `npx prisma migrate deploy`.

## Las dos entregas

| entrega | tareas | qué deja funcionando |
|---|---|---|
| **1 · Registrar** | 1 a 6 | bloques, trampas numeradas, revisión con lectura, mantenimiento y fotos. **Ya sustituye al WhatsApp.** |
| **2 · Avisar** | 7 a 9 | reglas del encargado y avisos en el tablero, con su recorrido en navegador |

## Estructura de archivos

| archivo | responsabilidad |
|---|---|
| `prisma/schema.prisma` | enum `TrapCaptureLevel`, modelo `PlotBlock`, campos nuevos en `Specimen`, `SpecimenObservation` y `Asset`, modelo `TrapRule` |
| `lib/traceability/plotBlocks.ts` | crear y listar bloques de una parcela |
| `lib/traceability/traps.ts` | alta de trampa con número correlativo por finca; registro de revisión |
| `lib/traceability/landMedia.ts` | se extiende: una foto puede colgar de una revisión |
| `lib/traceability/pendienteDeTrampas.ts` | **puro**: de trampas + reglas + hoy → avisos |
| `lib/traceability/trapRules.ts` | regla de la finca: leer y guardar |
| `app/plots/[id]/page.tsx` | sección «Trampas de broca» en el tablero |
| `app/plots/[id]/ajustes/page.tsx` | alta de bloques, alta de trampas, regla de la finca |
| `app/components/traceability/RevisionDeTrampaForm.tsx` | el formulario de una visita |
| `app/actions/traceability.ts` | acciones de servidor de todo lo anterior |
| `messages/es.json`, `messages/en.json` | textos, namespace `Traceability` |

---

# ENTREGA 1 — REGISTRAR

### Tarea 1: Esquema y migración

**Archivos:**
- Modificar: `prisma/schema.prisma`
- Crear: `prisma/migrations/20260917210000_bloques_y_revision_de_trampas/migration.sql`

**Interfaces:**
- Consume: nada.
- Produce: `TrapCaptureLevel` (`ninguno` | `pocos` | `algunos` | `muchos`), modelo
  `PlotBlock`, `Specimen.plotBlockId`, `Specimen.farmLocationId`, `Specimen.trapNumber`,
  los seis campos de revisión en `SpecimenObservation`, y `Asset.specimenObservationId`.

**Decisión que este plan toma, y por qué** (§9 del spec la dejaba abierta): el
correlativo del número de trampa se ancla en **`farmLocationId`**, una columna nueva y
denormalizada en `Specimen` que al crear se rellena con `location.parentLocationId ?? location.id`.
Razón medida: los lotes de Finca Rosina tienen `organization_id` **NULL** y su finca es
el `parentLocation`; anclar en la organización habría dejado el número sin ancla real.
El `@@unique([farmLocationId, trapNumber])` es la red que impide dos trampas con el
mismo número aunque dos operadores creen a la vez.

- [ ] **Paso 1: escribir el esquema**

En `prisma/schema.prisma`, junto a `SpecimenObservationType`:

```prisma
/// Lo que el operador ve en la tela, F2 §4: la escala manda y el número es opcional.
/// No se convierte a número por debajo — una escala no es un conteo.
enum TrapCaptureLevel {
  ninguno
  pocos
  algunos
  muchos

  @@schema("traceability")
}

/// Subdivisión con nombre de una parcela — «bloque», término aprobado por el dueño
/// (F2 §3). Es una ZONA, no una lista de plantas: sirve para saber en qué parte del
/// lote está cada trampa y comparar bloques a lo largo del tiempo. Opcional en los
/// dos sentidos: una parcela puede no tener bloques y una trampa puede no tener bloque.
model PlotBlock {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  locationId String   @map("location_id") @db.Uuid
  location   Location @relation(fields: [locationId], references: [id])
  name       String
  notes      String?

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("PlotBlockCreatedBy", fields: [createdBy], references: [id])

  specimens Specimen[]

  @@unique([locationId, name])
  @@index([locationId])
  @@map("plot_block")
  @@schema("traceability")
}
```

En `model Specimen`, después de `sectorSimple`:

```prisma
  // F2 §3 — el bloque donde está la trampa. Nullable: `sectorSimple` sigue valiendo
  // y una trampa puede no pertenecer a ningún bloque.
  plotBlockId String?    @map("plot_block_id") @db.Uuid
  plotBlock   PlotBlock? @relation(fields: [plotBlockId], references: [id])

  // F2 §4 — el número que va rotulado en la botella. Lo genera el sistema,
  // correlativo por finca. `farmLocationId` se rellena al crear con
  // `location.parentLocationId ?? location.id`: los lotes de Finca Rosina tienen
  // `organization_id` NULL, así que la finca es el padre en la jerarquía.
  farmLocationId String?   @map("farm_location_id") @db.Uuid
  farmLocation   Location? @relation("SpecimenFarm", fields: [farmLocationId], references: [id])
  trapNumber     Int?      @map("trap_number")
```

y al final del modelo, junto a los otros `@@`:

```prisma
  @@unique([farmLocationId, trapNumber])
```

En `model SpecimenObservation`, después de `captureCount`:

```prisma
  // F2 §4 — la lectura tal como se hace en campo. Obligatoria en un `trap_check`
  // (lo valida el servicio, no el esquema: la misma tabla guarda floraciones y
  // material cosechado, que no tienen lectura).
  brocaLevel TrapCaptureLevel? @map("broca_level")

  // «si es broca u otro». Sin catálogo de especies: nadie lo mantendría hoy, y la
  // nota con la foto conservan el hecho (F2 §8).
  otherInsects     Boolean? @map("other_insects")
  otherInsectsNote String?  @map("other_insects_note")

  // El mantenimiento va DENTRO de la revisión: en campo es una sola visita.
  cleaned        Boolean @default(false)
  liquidChanged  Boolean @default(false) @map("liquid_changed")
  lureRecharged  Boolean @default(false) @map("lure_recharged")
```

En `model Asset`, junto a los demás padres (`soilProfileId`, `specimenId`):

```prisma
  // F2 §4 — la foto de la tela pertenece a ESA revisión, no a la trampa entera.
  specimenObservationId String?              @map("specimen_observation_id") @db.Uuid
  specimenObservation   SpecimenObservation? @relation(fields: [specimenObservationId], references: [id])
```

y su índice junto a los otros: `@@index([specimenObservationId])`.

En `model Location`, añadir el lado inverso de la relación nueva:

```prisma
  specimensDeLaFinca Specimen[] @relation("SpecimenFarm")
  plotBlocks         PlotBlock[]
```

En `model UserAccount`, el inverso de `PlotBlock.creator`:

```prisma
  plotBlocksCreados PlotBlock[] @relation("PlotBlockCreatedBy")
```

En `model SpecimenObservation`, el inverso de `Asset`:

```prisma
  assets Asset[]
```

- [ ] **Paso 2: escribir la migración a mano**

`prisma/migrations/20260917210000_bloques_y_revision_de_trampas/migration.sql`:

```sql
CREATE TYPE "traceability"."TrapCaptureLevel" AS ENUM ('ninguno', 'pocos', 'algunos', 'muchos');

CREATE TABLE "traceability"."plot_block" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "plot_block_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "plot_block_location_id_name_key" ON "traceability"."plot_block"("location_id", "name");
CREATE INDEX "plot_block_location_id_idx" ON "traceability"."plot_block"("location_id");

ALTER TABLE "traceability"."plot_block"
  ADD CONSTRAINT "plot_block_location_id_fkey" FOREIGN KEY ("location_id")
  REFERENCES "core"."location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "plot_block_created_by_fkey" FOREIGN KEY ("created_by")
  REFERENCES "core"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."specimen"
  ADD COLUMN "plot_block_id" UUID,
  ADD COLUMN "farm_location_id" UUID,
  ADD COLUMN "trap_number" INTEGER;

CREATE UNIQUE INDEX "specimen_farm_location_id_trap_number_key"
  ON "traceability"."specimen"("farm_location_id", "trap_number");

ALTER TABLE "traceability"."specimen"
  ADD CONSTRAINT "specimen_plot_block_id_fkey" FOREIGN KEY ("plot_block_id")
  REFERENCES "traceability"."plot_block"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "specimen_farm_location_id_fkey" FOREIGN KEY ("farm_location_id")
  REFERENCES "core"."location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "traceability"."specimen_observation"
  ADD COLUMN "broca_level" "traceability"."TrapCaptureLevel",
  ADD COLUMN "other_insects" BOOLEAN,
  ADD COLUMN "other_insects_note" TEXT,
  ADD COLUMN "cleaned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "liquid_changed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lure_recharged" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "core"."asset" ADD COLUMN "specimen_observation_id" UUID;
CREATE INDEX "asset_specimen_observation_id_idx" ON "core"."asset"("specimen_observation_id");
ALTER TABLE "core"."asset"
  ADD CONSTRAINT "asset_specimen_observation_id_fkey" FOREIGN KEY ("specimen_observation_id")
  REFERENCES "traceability"."specimen_observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Paso 3: aplicar y generar**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx prisma migrate deploy
npx prisma generate
```

Esperado: `Applying migration '20260917210000_bloques_y_revision_de_trampas'` y
`All migrations have been successfully applied.`

- [ ] **Paso 4: comprobar contra la base, no contra el informe**

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql \
  postgresql://postgres@127.0.0.1:55433/nectar_test -At -c \
  "select column_name from information_schema.columns where table_schema='traceability' and table_name='specimen_observation' and column_name in ('broca_level','cleaned','liquid_changed','lure_recharged') order by 1;"
```

Esperado: las cuatro columnas. **Si salen menos, parar**: la migración no entró.

- [ ] **Paso 5: tipos**

```bash
npm run build
```

Esperado: salida 0. (Un `@relation` sin su lado inverso rompe aquí, no en vitest.)

- [ ] **Paso 6: commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260917210000_bloques_y_revision_de_trampas/migration.sql
git diff --cached --stat   # deben ser DOS archivos
git commit -F <(printf 'Bloques, numeración de trampas y campos de revisión\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n')
```

---

### Tarea 2: Servicio de bloques

**Archivos:**
- Crear: `lib/traceability/plotBlocks.ts`
- Crear: `tests/traceability/plotBlocks.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`)

**Interfaces:**
- Consume: `requireLocationAttributeAccess` de `lib/traceability/locations.ts`,
  `recordAuditEvent` de `lib/audit/record.ts`.
- Produce: `createPlotBlock(userAccountId: string, input: { locationId: string; name: string; notes?: string | null })`
  → `PlotBlock`; `listPlotBlocks(userAccountId: string, locationId: string)` → `PlotBlock[]`
  ordenados por `name`; `PlotBlockValidationError`.

- [ ] **Paso 1: la prueba en rojo**

`tests/traceability/plotBlocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPlotBlock, listPlotBlocks, PlotBlockValidationError } from "@/lib/traceability/plotBlocks";
import { prisma } from "@/lib/prisma";
import { crearUsuarioConAcceso, crearParcela } from "../helpers/traceability";

describe("bloques de una parcela", () => {
  it("crea un bloque con su nombre y lo lista", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const bloque = await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Norte" });
    expect(bloque.name).toBe("Norte");
    const lista = await listPlotBlocks(userAccountId, parcela.id);
    expect(lista.map((b) => b.name)).toEqual(["Norte"]);
  });

  it("escribe la auditoría en la misma transacción", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const bloque = await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Alto" });
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "plot_block", entityId: bloque.id, operation: "plot_block.create" },
    });
    expect(evento).not.toBeNull();
  });

  it("rechaza un nombre vacío", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    await expect(createPlotBlock(userAccountId, { locationId: parcela.id, name: "   " }))
      .rejects.toThrow(PlotBlockValidationError);
  });

  it("rechaza dos bloques con el mismo nombre en la misma parcela", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Bajo" });
    await expect(createPlotBlock(userAccountId, { locationId: parcela.id, name: "Bajo" }))
      .rejects.toThrow(PlotBlockValidationError);
  });
});
```

Si `tests/helpers/traceability.ts` no tiene `crearUsuarioConAcceso` o `crearParcela`,
copiar el patrón del helper que use `tests/traceability/entradaEnProduccion.test.ts`
y **reutilizarlo**, no duplicarlo.

- [ ] **Paso 2: verla fallar**

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/plotBlocks.test.ts
```

Esperado: FAIL, `Cannot find module '@/lib/traceability/plotBlocks'`.
**Si dice «no tests», parar:** `tests/setup.ts` se niega sin `DATABASE_URL` local y
ese mensaje se lee igual que un verde.

- [ ] **Paso 3: el servicio**

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { requireLocationAttributeAccess } from "@/lib/traceability/locations";

export class PlotBlockValidationError extends Error {}

export interface CreatePlotBlockInput {
  locationId: string;
  name: string;
  notes?: string | null;
}

/** F2 §3 — un bloque es una zona con nombre dentro de una parcela. */
export async function createPlotBlock(userAccountId: string, input: CreatePlotBlockInput) {
  const name = input.name.trim();
  if (!name) throw new PlotBlockValidationError("block_name_required");

  await requireLocationAttributeAccess(userAccountId, input.locationId);

  try {
    return await prisma.$transaction(async (tx) => {
      const bloque = await tx.plotBlock.create({
        data: { locationId: input.locationId, name, notes: input.notes ?? null, createdBy: userAccountId },
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
    // El unique de la base es la red: dos operadores a la vez no crean el mismo bloque.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PlotBlockValidationError("block_name_taken");
    }
    throw error;
  }
}

export async function listPlotBlocks(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.plotBlock.findMany({ where: { locationId }, orderBy: { name: "asc" } });
}
```

- [ ] **Paso 4: verde**

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/plotBlocks.test.ts
```

Esperado: 4 pruebas en verde.

- [ ] **Paso 5: que CI la corra con base**

Añadir en `scripts/pruebas-por-compuerta.txt`, dentro del grupo `# @grupo: base-sembrada`:

```
tests/traceability/plotBlocks.test.ts
```

y comprobar que **no** aparece en el carril hermético:

```bash
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "salida=$?"
grep -c 'plotBlocks' /tmp/ci.txt    # debe ser 0
```

- [ ] **Paso 6: flip-test**

Quitar la línea `if (!name) throw ...` y volver a correr: **debe caer «rechaza un
nombre vacío»**, por su nombre. Restaurar.

- [ ] **Paso 7: cifras del inventario de acceso**

```bash
node scripts/inventario-de-acceso.mjs | head -3
```

Actualizar `docs/arquitectura/inventario-de-acceso.md` con las cifras que imprima —
operaciones, archivos y «guardia directo»— y correr
`npx vitest run tests/arquitectura/cifras-del-inventario.test.ts`.

- [ ] **Paso 8: commit**

```bash
git add lib/traceability/plotBlocks.ts tests/traceability/plotBlocks.test.ts \
        scripts/pruebas-por-compuerta.txt docs/arquitectura/inventario-de-acceso.md
git diff --cached --stat   # CUATRO archivos
git commit -F <(printf 'Bloques de parcela: servicio y pruebas\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n')
```

---

### Tarea 3: Alta de trampa con número correlativo

**Archivos:**
- Crear: `lib/traceability/traps.ts`
- Crear: `tests/traceability/traps.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Consume: `createSpecimen` **no** se reutiliza (necesita el número y la finca); se
  escribe el alta aquí, con `requireSpecimenAccess` propio del archivo, igual que
  `lib/traceability/specimens.ts`.
- Produce:
  `createTrap(userAccountId, input: { locationId: string; plotBlockId?: string | null; installedAt: Date; notes?: string | null; provenanceClass: ProvenanceClass; dataQuality?: DataQuality | null })`
  → `Specimen` con `trapNumber` ya asignado; `TrapValidationError`.

- [ ] **Paso 1: la prueba en rojo**

`tests/traceability/traps.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTrap, TrapValidationError } from "@/lib/traceability/traps";
import { prisma } from "@/lib/prisma";
import { crearUsuarioConAcceso, crearParcela } from "../helpers/traceability";

describe("alta de trampa", () => {
  it("numera correlativo por finca, empezando en 1", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();          // crearParcela cuelga de una finca
    const a = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const b = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    expect(a.trapNumber).toBe(1);
    expect(b.trapNumber).toBe(2);
    expect(a.farmLocationId).toBe(parcela.parentLocationId);
  });

  it("sigue la numeración de la finca aunque la parcela sea otra", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const uno = await crearParcela();
    const otra = await crearParcela({ parentLocationId: uno.parentLocationId });
    await createTrap(userAccountId, { locationId: uno.id, installedAt: new Date(), provenanceClass: "direct_observation" });
    const segunda = await createTrap(userAccountId, { locationId: otra.id, installedAt: new Date(), provenanceClass: "direct_observation" });
    expect(segunda.trapNumber).toBe(2);
  });

  it("deja la trampa activa y con su observación de instalación", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-02"), provenanceClass: "direct_observation",
    });
    expect(trampa.status).toBe("active");
    const instalacion = await prisma.specimenObservation.findFirst({
      where: { specimenId: trampa.id, observationType: "installed" },
    });
    expect(instalacion).not.toBeNull();
  });

  it("rechaza una fecha de instalación en el futuro", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const manana = new Date(Date.now() + 86_400_000);
    await expect(createTrap(userAccountId, {
      locationId: parcela.id, installedAt: manana, provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  it("rechaza un bloque de otra parcela", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const otra = await crearParcela();
    const { createPlotBlock } = await import("@/lib/traceability/plotBlocks");
    const ajeno = await createPlotBlock(userAccountId, { locationId: otra.id, name: "Norte" });
    await expect(createTrap(userAccountId, {
      locationId: parcela.id, plotBlockId: ajeno.id, installedAt: new Date(), provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });
});
```

- [ ] **Paso 2: verla fallar**

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/traps.test.ts
```

Esperado: FAIL por módulo inexistente.

- [ ] **Paso 3: el servicio**

```ts
import { Prisma, type DataQuality, type ProvenanceClass } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditEvent } from "@/lib/audit/record";
import { can, type ScopeTarget } from "@/lib/rbac/can";

export class TrapAccessError extends Error {}
export class TrapValidationError extends Error {}

async function requireTrapAccess(userAccountId: string, locationId: string) {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { classification: true, parentLocationId: true },
  });
  if (!location) throw new TrapAccessError("location_not_found");
  const target: ScopeTarget = { scopeType: "location", scopeRefId: locationId };
  if (!(await can(userAccountId, "manage", "specimen", target, location.classification))) {
    throw new TrapAccessError("no_specimen_access");
  }
  return location;
}

export interface CreateTrapInput {
  locationId: string;
  plotBlockId?: string | null;
  installedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/**
 * F2 §4 — alta de una trampa, una por una. El número lo pone el sistema,
 * correlativo por finca, y el operador lo rotula en la botella.
 *
 * La finca es `parentLocationId` y no la organización: los lotes reales tienen
 * `organization_id` NULL (medido el 2026-09-17).
 */
export async function createTrap(userAccountId: string, input: CreateTrapInput) {
  if (Number.isNaN(input.installedAt.getTime())) throw new TrapValidationError("installed_at_invalid");
  if (input.installedAt.getTime() > Date.now()) throw new TrapValidationError("installed_at_in_future");

  const location = await requireTrapAccess(userAccountId, input.locationId);
  const farmLocationId = location.parentLocationId ?? input.locationId;

  if (input.plotBlockId) {
    const bloque = await prisma.plotBlock.findUnique({
      where: { id: input.plotBlockId },
      select: { locationId: true },
    });
    if (!bloque || bloque.locationId !== input.locationId) {
      throw new TrapValidationError("block_not_in_plot");
    }
  }

  for (let intento = 0; intento < 5; intento++) {
    const ultimo = await prisma.specimen.aggregate({
      where: { farmLocationId, specimenType: "trap" },
      _max: { trapNumber: true },
    });
    const numero = (ultimo._max.trapNumber ?? 0) + 1;
    try {
      return await prisma.$transaction(async (tx) => {
        const trampa = await tx.specimen.create({
          data: {
            locationId: input.locationId,
            specimenType: "trap",
            commonName: `Trampa ${numero}`,
            plotBlockId: input.plotBlockId ?? null,
            farmLocationId,
            trapNumber: numero,
            notes: input.notes ?? null,
            provenanceClass: input.provenanceClass,
            dataQuality: input.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        const instalacion = await tx.specimenObservation.create({
          data: {
            specimenId: trampa.id,
            observationType: "installed",
            observedAt: input.installedAt,
            provenanceClass: input.provenanceClass,
            dataQuality: input.dataQuality ?? null,
            createdBy: userAccountId,
          },
        });
        await recordAuditEvent(
          {
            actorUserAccountId: userAccountId,
            operation: "specimen.create_trap",
            entityType: "specimen",
            entityId: trampa.id,
            after: { trampa, instalacion },
            sourceInterface: "traceability.service",
          },
          tx,
        );
        return trampa;
      });
    } catch (error) {
      // Dos altas a la vez chocan contra @@unique([farmLocationId, trapNumber]):
      // se vuelve a leer el máximo y se reintenta. El unique es la verdad, no la lectura.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
  throw new TrapValidationError("trap_number_race");
}
```

- [ ] **Paso 4: verde**

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/traps.test.ts
```

Esperado: 5 en verde.

- [ ] **Paso 5: flip-test del número**

Cambiar `(ultimo._max.trapNumber ?? 0) + 1` por `1` y correr: **debe caer «numera
correlativo por finca, empezando en 1»** con `expected 2, received 1`. Restaurar.

- [ ] **Paso 6: carril con base y commit**

Añadir `tests/traceability/traps.test.ts` al grupo `base-sembrada`, recalcular las
cifras del inventario de acceso como en la Tarea 2, y:

```bash
git add lib/traceability/traps.ts tests/traceability/traps.test.ts \
        scripts/pruebas-por-compuerta.txt docs/arquitectura/inventario-de-acceso.md
git diff --cached --stat
git commit -F <(printf 'Alta de trampa con número correlativo por finca\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n')
```

---

### Tarea 4: La revisión — escala obligatoria, número opcional

**Archivos:**
- Modificar: `lib/traceability/traps.ts` (añadir `recordTrapCheck`)
- Modificar: `lib/traceability/specimens.ts:138-145` (la validación vieja)
- Modificar: `tests/traceability/specimens.test.ts` (la prueba de esa validación)
- Modificar: `tests/traceability/traps.test.ts`

**Interfaces:**
- Consume: `createTrap` de la Tarea 3.
- Produce:
  `recordTrapCheck(userAccountId, input: { specimenId: string; observedAt: Date; brocaLevel: TrapCaptureLevel; captureCount?: number | null; otherInsects?: boolean | null; otherInsectsNote?: string | null; cleaned?: boolean; liquidChanged?: boolean; lureRecharged?: boolean; notes?: string | null; provenanceClass: ProvenanceClass; dataQuality?: DataQuality | null })`
  → `SpecimenObservation`.

**Conflicto con el código existente, y cómo se resuelve.** Hoy
`recordSpecimenObservation` exige `captureCount` en todo `trap_check`
(`capture_count_required_for_trap_check`). El diseño aprobado invierte eso: **la
escala es obligatoria y el número opcional.** Esta tarea cambia esa validación y
**su prueba**, que hoy afirma lo contrario. No es un daño colateral: es la decisión
del dueño, y el plan la nombra para que el revisor no la lea como una regresión.

- [ ] **Paso 1: pruebas en rojo**

Añadir a `tests/traceability/traps.test.ts`:

```ts
import { recordTrapCheck } from "@/lib/traceability/traps";

describe("revisión de trampa", () => {
  it("guarda la lectura, el mantenimiento y los otros insectos", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "algunos",
      otherInsects: true,
      otherInsectsNote: "avispas",
      cleaned: true,
      liquidChanged: true,
      provenanceClass: "direct_observation",
    });
    expect(revision.brocaLevel).toBe("algunos");
    expect(revision.captureCount).toBeNull();      // nadie contó: NO se inventa un 0
    expect(revision.otherInsectsNote).toBe("avispas");
    expect(revision.cleaned).toBe(true);
    expect(revision.lureRecharged).toBe(false);
  });

  it("acepta el número exacto cuando alguien contó", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "muchos", captureCount: 47, provenanceClass: "direct_observation",
    });
    expect(revision.captureCount).toBe(47);
  });

  it("exige la lectura de la escala", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    await expect(recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: undefined as never, provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  it("no deja la revisión sin su fila de auditoría", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "ninguno", provenanceClass: "direct_observation",
    });
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "specimen_observation", entityId: revision.id },
    });
    expect(evento).not.toBeNull();
  });
});
```

- [ ] **Paso 2: verlas fallar**

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run tests/traceability/traps.test.ts
```

Esperado: las cuatro nuevas en rojo por `recordTrapCheck` inexistente.

- [ ] **Paso 3: implementar**

En `lib/traceability/traps.ts`:

```ts
import type { TrapCaptureLevel } from "@prisma/client";

export interface RecordTrapCheckInput {
  specimenId: string;
  observedAt: Date;
  brocaLevel: TrapCaptureLevel;
  captureCount?: number | null;
  otherInsects?: boolean | null;
  otherInsectsNote?: string | null;
  cleaned?: boolean;
  liquidChanged?: boolean;
  lureRecharged?: boolean;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

const NIVELES: readonly string[] = ["ninguno", "pocos", "algunos", "muchos"];

/** F2 §4 — una visita, un registro: lectura + otros insectos + mantenimiento. */
export async function recordTrapCheck(userAccountId: string, input: RecordTrapCheckInput) {
  if (!input.brocaLevel || !NIVELES.includes(input.brocaLevel)) {
    throw new TrapValidationError("broca_level_required");
  }
  if (Number.isNaN(input.observedAt.getTime())) throw new TrapValidationError("observed_at_invalid");
  if (input.observedAt.getTime() > Date.now()) throw new TrapValidationError("observed_at_in_future");
  if (input.captureCount != null && (!Number.isInteger(input.captureCount) || input.captureCount < 0)) {
    throw new TrapValidationError("capture_count_invalid");
  }

  const trampa = await prisma.specimen.findUnique({
    where: { id: input.specimenId },
    select: { id: true, locationId: true, specimenType: true },
  });
  if (!trampa) throw new TrapAccessError("trap_not_found");
  if (trampa.specimenType !== "trap") throw new TrapValidationError("not_a_trap");
  await requireTrapAccess(userAccountId, trampa.locationId);

  return prisma.$transaction(async (tx) => {
    const revision = await tx.specimenObservation.create({
      data: {
        specimenId: trampa.id,
        observationType: "trap_check",
        observedAt: input.observedAt,
        brocaLevel: input.brocaLevel,
        captureCount: input.captureCount ?? null,
        otherInsects: input.otherInsects ?? null,
        otherInsectsNote: input.otherInsectsNote ?? null,
        cleaned: input.cleaned ?? false,
        liquidChanged: input.liquidChanged ?? false,
        lureRecharged: input.lureRecharged ?? false,
        notes: input.notes ?? null,
        provenanceClass: input.provenanceClass,
        dataQuality: input.dataQuality ?? null,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "specimen_observation.trap_check",
        entityType: "specimen_observation",
        entityId: revision.id,
        after: revision,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return revision;
  });
}
```

En `lib/traceability/specimens.ts`, sustituir la validación vieja:

```ts
  // F2 §4 invierte la regla anterior: la ESCALA es obligatoria y el número
  // opcional. La vía completa de una revisión es `recordTrapCheck`
  // (lib/traceability/traps.ts); aquí sólo queda el mínimo para que una
  // observación suelta no entre sin lectura.
  if (input.observationType === "trap_check" && input.brocaLevel == null) {
    throw new SpecimenValidationError("broca_level_required_for_trap_check");
  }
```

y añadir `brocaLevel?: TrapCaptureLevel | null` a `RecordSpecimenObservationInput`,
pasándolo en el `create`.

- [ ] **Paso 4: arreglar la prueba vieja que afirmaba lo contrario**

En `tests/traceability/specimens.test.ts`, la prueba que hoy exige
`capture_count_required_for_trap_check` pasa a exigir la escala:

```ts
  it("una revisión de trampa sin lectura de escala se rechaza", async () => {
    await expect(recordSpecimenObservation(userAccountId, {
      specimenId: trampa.id, observationType: "trap_check",
      observedAt: new Date(), provenanceClass: "direct_observation",
    })).rejects.toThrow(SpecimenValidationError);
  });
```

- [ ] **Paso 5: verde en las dos**

```bash
DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test npx vitest run \
  tests/traceability/traps.test.ts tests/traceability/specimens.test.ts
```

- [ ] **Paso 6: flip-test de la escala**

Quitar el `throw new TrapValidationError("broca_level_required")` y correr: **debe
caer «exige la lectura de la escala»**. Restaurar.

- [ ] **Paso 7: tipos y commit**

```bash
npm run build      # el enum nuevo atraviesa tipos: esto es lo que lo comprueba
git add lib/traceability/traps.ts lib/traceability/specimens.ts \
        tests/traceability/traps.test.ts tests/traceability/specimens.test.ts
git diff --cached --stat
git commit -F <(printf 'Revisión de trampa: escala obligatoria, número opcional\n\nLa validación anterior exigía el conteo; el diseño aprobado la invierte.\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n')
```

---

### Tarea 5: Fotos de la revisión

**Archivos:**
- Modificar: `lib/traceability/landMedia.ts:36-39` (`LandAssetParent`) y `:81-105`
- Modificar: `tests/traceability/landMedia.test.ts`

**Interfaces:**
- Consume: `recordTrapCheck` de la Tarea 4.
- Produce: `LandAssetParent` gana `{ kind: "trapCheck"; specimenObservationId: string }`.

- [ ] **Paso 1: la prueba en rojo**

```ts
  it("cuelga la foto de la revisión, no de la trampa", async () => {
    const { userAccountId } = await crearUsuarioConAcceso();
    const parcela = await crearParcela();
    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const revision = await recordTrapCheck(userAccountId, {
      specimenId: trampa.id, observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos", provenanceClass: "direct_observation",
    });
    const { storageKey } = await requestLandAssetUpload(userAccountId, {
      locationId: parcela.id, originalFilename: "tela.jpg", mimeType: "image/jpeg", sizeBytes: 1234,
    });
    const asset = await finalizeLandAssetUpload(userAccountId, {
      locationId: parcela.id, storageKey, mimeType: "image/jpeg", sizeBytes: 1234,
      parent: { kind: "trapCheck", specimenObservationId: revision.id },
    });
    expect(asset.specimenObservationId).toBe(revision.id);
  });

  it("rechaza colgar la foto de una revisión de otra parcela", async () => {
    // …misma forma que las demás de este archivo: crea dos parcelas y cruza los ids,
    // esperando LandMediaValidationError.
  });
```

- [ ] **Paso 2: verla fallar** — `npx vitest run tests/traceability/landMedia.test.ts`
  con `DATABASE_URL`; esperado: error de tipo/validación por `kind: "trapCheck"` desconocido.

- [ ] **Paso 3: implementar**

```ts
export type LandAssetParent =
  | { kind: "lot"; lotId: string }
  | { kind: "location" }
  | { kind: "soilProfile"; soilProfileId: string }
  | { kind: "trapCheck"; specimenObservationId: string };
```

y dentro de `exigirPadreDeEsaLocation`:

```ts
  if (parent.kind === "trapCheck") {
    const revision = await prisma.specimenObservation.findUnique({
      where: { id: parent.specimenObservationId },
      select: { specimen: { select: { locationId: true } } },
    });
    if (!revision || revision.specimen.locationId !== locationId) {
      throw new LandMediaValidationError("trap_check_not_in_location");
    }
    return { specimenObservationId: parent.specimenObservationId };
  }
```

- [ ] **Paso 4: verde** — las dos nuevas y las que ya había en ese archivo.
- [ ] **Paso 5: flip-test** — cambiar la comparación `!==` por `===` y ver caer
  «rechaza colgar la foto de una revisión de otra parcela». Restaurar.
- [ ] **Paso 6: commit**

```bash
git add lib/traceability/landMedia.ts tests/traceability/landMedia.test.ts
git commit -F <(printf 'Una foto puede colgar de una revisión de trampa\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n')
```

---

### Tarea 6: Pantallas de registro (cierra la entrega 1)

**Archivos:**
- Crear: `app/components/traceability/RevisionDeTrampaForm.tsx`
- Crear: `app/components/traceability/AltaDeTrampaForm.tsx`
- Crear: `app/components/traceability/AltaDeBloqueForm.tsx`
- Modificar: `app/plots/[id]/page.tsx` (sección «Trampas de broca», plegable)
- Modificar: `app/plots/[id]/ajustes/page.tsx` (secciones `id="bloques"` y `id="trampas"`)
- Modificar: `app/actions/traceability.ts`
- Modificar: `lib/traceability/plantingCohorts.ts` (`getPlotDetail` devuelve trampas)
- Modificar: `messages/es.json`, `messages/en.json`

**Interfaces:**
- Consume: `createPlotBlock`, `listPlotBlocks`, `createTrap`, `recordTrapCheck`.
- Produce: `getPlotDetail` devuelve además
  `trampas: { id: string; trapNumber: number | null; bloque: string | null; status: SpecimenStatus; ultimaRevision: { observedAt: Date; brocaLevel: TrapCaptureLevel | null } | null }[]`.

- [ ] **Paso 1: los textos**

En `messages/es.json`, namespace `Traceability`:

```json
"trapsTitle": "Trampas de broca",
"trapsNone": "No hay trampas registradas en esta parcela.",
"trapsNumber": "Trampa {n}",
"trapsBlock": "Bloque {nombre}",
"trapsNoBlock": "Sin bloque",
"trapsLastCheck": "Última revisión: {fecha} · {lectura}",
"trapsNeverChecked": "Sin revisar desde que se instaló",
"trapsLevel_ninguno": "Ninguno",
"trapsLevel_pocos": "Pocos",
"trapsLevel_algunos": "Algunos",
"trapsLevel_muchos": "Muchos",
"trapCheckTitle": "Registrar una revisión",
"trapCheckLevel": "¿Cuánta broca hay en la tela?",
"trapCheckCount": "Número exacto (sólo si lo contaron)",
"trapCheckOthers": "Había otros insectos",
"trapCheckOthersNote": "¿Cuáles?",
"trapCheckCleaned": "Se limpió la trampa",
"trapCheckLiquid": "Se cambió el líquido",
"trapCheckLure": "Se recargó el atrayente",
"trapNewTitle": "Registrar una trampa",
"trapInstalledAt": "Fecha de instalación",
"trapNumberAssigned": "Quedó como la trampa {n}: rotúlala en la botella.",
"blockNewTitle": "Crear un bloque",
"blockName": "Nombre del bloque",
"blocksNone": "Esta parcela no tiene bloques. Son opcionales.",
"error_trap": "No se pudo guardar. Revisa la lectura y la fecha."
```

Y los mismos en `messages/en.json`. **Comprobar que los dos archivos son JSON
válido** antes de seguir:

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/es.json','utf8'))" && echo ok-es
node -e "JSON.parse(require('fs').readFileSync('messages/en.json','utf8'))" && echo ok-en
```

- [ ] **Paso 2: `getPlotDetail` devuelve las trampas**

En `lib/traceability/plantingCohorts.ts`, dentro de la misma función, añadir:

```ts
  const trampas = await prisma.specimen.findMany({
    where: { locationId, specimenType: "trap" },
    select: {
      id: true, trapNumber: true, status: true,
      plotBlock: { select: { name: true } },
      observations: {
        where: { observationType: "trap_check" },
        orderBy: { observedAt: "desc" },
        take: 1,
        select: { observedAt: true, brocaLevel: true },
      },
    },
    orderBy: { trapNumber: "asc" },
  });
```

y devolverlas mapeadas a la forma del bloque **Produce** de esta tarea.

- [ ] **Paso 3: la sección del tablero**

En `app/plots/[id]/page.tsx`, **plegada** como Condiciones y Muestras, con
`id="trampas"` dentro del `<details>` para que un enlace la abra:

- si no hay trampas → `trapsNone`;
- por cada trampa: «Trampa 7 · Bloque norte» y debajo `trapsLastCheck` con fecha y
  lectura traducida, o `trapsNeverChecked` si nunca se revisó. **Nunca un 0** donde
  falte la lectura.

- [ ] **Paso 4: los formularios**

`RevisionDeTrampaForm.tsx`: select de escala (obligatorio, sin valor por defecto),
número opcional (`type="number"`, `min="0"`), casilla de otros insectos + nota, tres
casillas de mantenimiento, notas, procedencia y calidad. El botón usa
`BotonQueNecesitaConexion` con `pending`.

`AltaDeTrampaForm.tsx`: bloque (select con los bloques de la parcela, opcional),
fecha de instalación (`type="date"`), notas, procedencia. Tras guardar, la pantalla
muestra `trapNumberAssigned` con el número asignado.

`AltaDeBloqueForm.tsx`: nombre y nota.

- [ ] **Paso 5: las acciones de servidor**

En `app/actions/traceability.ts`, tres acciones `async` que llaman a los servicios,
con `revalidatePath` de `/plots/${locationId}` **y** `/plots/${locationId}/ajustes`
en los dos caminos (éxito y error), y una rama nueva en `friendlyError` que traduzca
`TrapValidationError` y `PlotBlockValidationError` a `error_trap`.

- [ ] **Paso 6: compuertas**

```bash
npm run verify && npm run build
bash scripts/ci.sh > /tmp/ci.txt 2>&1; echo "salida=$?"; grep -E 'Test Files|Tests ' /tmp/ci.txt | tail -2
```

Esperado: las tres en 0. **Leer el código de salida, no la cola.**

- [ ] **Paso 7: commit**

```bash
git add app/components/traceability/RevisionDeTrampaForm.tsx \
        app/components/traceability/AltaDeTrampaForm.tsx \
        app/components/traceability/AltaDeBloqueForm.tsx \
        app/plots/\[id\]/page.tsx app/plots/\[id\]/ajustes/page.tsx \
        app/actions/traceability.ts lib/traceability/plantingCohorts.ts \
        messages/es.json messages/en.json
git diff --cached --stat   # NUEVE archivos
git commit -F <(printf 'Pantallas de trampas: alta, revisión y bloques\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\n')
```

**Aquí termina la entrega 1: el WhatsApp ya se puede dejar de usar.**

---

# ENTREGA 2 — AVISAR

### Tarea 7: La regla del encargado

**Archivos:**
- Modificar: `prisma/schema.prisma` (modelo `TrapRule`)
- Crear: `prisma/migrations/20260918090000_regla_de_trampas/migration.sql`
- Crear: `lib/traceability/trapRules.ts`
- Crear: `tests/traceability/trapRules.test.ts`
- Modificar: `scripts/pruebas-por-compuerta.txt`

**Interfaces:**
- Produce: `saveTrapRule(userAccountId, input: { farmLocationId: string; triggerLevel: TrapCaptureLevel; normalDays: number; alertDays: number; suggestedAction: string })`
  → `TrapRule`; `getTrapRule(userAccountId, farmLocationId)` → `TrapRule | null`.

**Decisión:** una regla por finca, no una lista. El spec pide «reglas», pero una sola
cubre lo que el dueño describió (una lectura que dispara, dos plazos, una acción) y
evita inventar un motor. Coste si me equivoco: añadir más reglas obliga a una tabla
hija y a decidir cuál gana.

```prisma
/// F2 §5 — lo que el encargado de finca fija para sus trampas. **Sin regla no hay
/// avisos ni plazos**: el sistema no trae ningún valor por defecto, ni siquiera el
/// quincenal de la guía de Anacafé.
model TrapRule {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  farmLocationId String           @unique @map("farm_location_id") @db.Uuid
  farmLocation   Location         @relation("TrapRuleFarm", fields: [farmLocationId], references: [id])
  /// La lectura a partir de la cual se dispara el aviso (ese nivel o peor).
  triggerLevel   TrapCaptureLevel @map("trigger_level")
  /// Días entre revisiones en situación normal y cuando la lectura disparó.
  normalDays     Int              @map("normal_days")
  alertDays      Int              @map("alert_days")
  /// Texto libre: «aplicar repelente Bralic». Los productos son de la finca y el
  /// catálogo fitosanitario es la pieza 3.
  suggestedAction String          @map("suggested_action")

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("TrapRuleCreatedBy", fields: [createdBy], references: [id])

  @@map("trap_rule")
  @@schema("traceability")
}
```

- [ ] **Paso 1** la prueba en rojo: guarda una regla, la relee, rechaza `normalDays <= 0`,
  rechaza `alertDays > normalDays` (un aviso que tarda más cuando hay broca no es un aviso),
  y comprueba la fila de auditoría.
- [ ] **Paso 2** verla fallar con `DATABASE_URL`.
- [ ] **Paso 3** migración a mano + `migrate deploy` + `prisma generate`, con la
  comprobación por `psql` de que la tabla existe.
- [ ] **Paso 4** el servicio, con `requireLocationAttributeAccess` sobre `farmLocationId`,
  `upsert` dentro de `$transaction` y `recordAuditEvent` con
  `operation: "trap_rule.save"`.
- [ ] **Paso 5** verde, y flip-test: quitar la validación `alertDays > normalDays` y ver
  caer esa prueba por su nombre.
- [ ] **Paso 6** carril `base-sembrada`, cifras del inventario, `npm run build`, commit.

---

### Tarea 8: Los avisos, como función pura

**Archivos:**
- Crear: `lib/traceability/pendienteDeTrampas.ts`
- Crear: `tests/traceability/pendienteDeTrampas.test.ts` (**hermética**, sin base)
- Modificar: `lib/traceability/pendienteDeLaParcela.ts`
- Modificar: `tests/traceability/pendienteDeLaParcela.test.ts`

**Interfaces:**
- Consume: `diaDeHoy` de `lib/time/diaDeHoy.ts`.
- Produce:

```ts
export interface TrampaParaAviso {
  id: string;
  trapNumber: number | null;
  bloque: string | null;
  status: "active" | "removed" | "dead";
  ultimaRevision: { dia: string; brocaLevel: "ninguno" | "pocos" | "algunos" | "muchos" } | null;
  instaladaEl: string;              // día YYYY-MM-DD
}
export interface ReglaParaAviso {
  triggerLevel: "ninguno" | "pocos" | "algunos" | "muchos";
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
}
export function avisosDeTrampas(e: {
  hoy: string;
  trampas: readonly TrampaParaAviso[];
  regla: ReglaParaAviso | null;
}): Aviso[];
```

y dos `Aviso` nuevos en `lib/traceability/pendienteDeLaParcela.ts`:

```ts
  | { tipo: "trampa_por_revisar"; specimenId: string; trapNumber: number | null; diasDeRetraso: number }
  | { tipo: "trampa_con_lectura_alta"; specimenId: string; trapNumber: number | null; lectura: string; accion: string }
```

- [ ] **Paso 1: la prueba en rojo** (hermética, sin base ni reloj)

```ts
import { describe, expect, it } from "vitest";
import { avisosDeTrampas } from "@/lib/traceability/pendienteDeTrampas";

const REGLA = { triggerLevel: "algunos" as const, normalDays: 14, alertDays: 7, suggestedAction: "aplicar Bralic" };
const activa = (extra: Partial<Parameters<typeof avisosDeTrampas>[0]["trampas"][number]> = {}) => ({
  id: "t1", trapNumber: 7, bloque: "Norte", status: "active" as const,
  ultimaRevision: null, instaladaEl: "2026-09-01", ...extra,
});

describe("avisos de trampas", () => {
  it("sin regla no avisa de nada, por vencida que esté", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-12-31", trampas: [activa()], regla: null });
    expect(avisos).toEqual([]);
  });

  it("cuenta el plazo normal desde la instalación cuando nunca se revisó", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-16", trampas: [activa()], regla: REGLA });
    expect(avisos).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("el día exacto del vencimiento todavía no avisa", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-15", trampas: [activa()], regla: REGLA });
    expect(avisos).toEqual([]);
  });

  it("usa el plazo de alerta cuando la última lectura disparó", () => {
    const t = activa({ ultimaRevision: { dia: "2026-09-10", brocaLevel: "muchos" } });
    const avisos = avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA });
    expect(avisos.map((a) => a.tipo)).toContain("trampa_por_revisar");
  });

  it("propone la acción de la regla cuando la lectura disparó", () => {
    const t = activa({ ultimaRevision: { dia: "2026-09-16", brocaLevel: "algunos" } });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA });
    expect(avisos).toContainEqual({
      tipo: "trampa_con_lectura_alta", specimenId: "t1", trapNumber: 7,
      lectura: "algunos", accion: "aplicar Bralic",
    });
  });

  it("una lectura por debajo del disparador no propone nada", () => {
    const t = activa({ ultimaRevision: { dia: "2026-09-16", brocaLevel: "pocos" } });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA });
    expect(avisos.map((a) => a.tipo)).not.toContain("trampa_con_lectura_alta");
  });

  it("una trampa retirada no genera avisos", () => {
    const t = activa({ status: "removed", ultimaRevision: { dia: "2026-01-01", brocaLevel: "muchos" } });
    expect(avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA })).toEqual([]);
  });
});
```

- [ ] **Paso 2** correrla y verla fallar: `npx vitest run tests/traceability/pendienteDeTrampas.test.ts`
  (hermética: **no** lleva `DATABASE_URL` y **no** va al grupo `base-sembrada`).
- [ ] **Paso 3** implementar. El orden de la escala es
  `["ninguno","pocos","algunos","muchos"]` y «disparó» significa índice ≥ índice del
  `triggerLevel`. Los días se cuentan entre cadenas `YYYY-MM-DD` con `Date.UTC`, sin
  zonas horarias, igual que `venceElMuestreo`.
- [ ] **Paso 4** verde: 7 pruebas.
- [ ] **Paso 5** integrar en `pendienteDeLaParcela`: la entrada gana
  `trampas` y `regla`, y `tocaHacer` concatena `avisosDeTrampas(...)`. Añadir a
  `enlaceDelAviso` los dos tipos nuevos, apuntando a `/plots/<id>#trampas`.
- [ ] **Paso 6** flip-test: cambiar `>=` por `>` en la comparación de la escala y ver
  caer «propone la acción de la regla cuando la lectura disparó». Restaurar.
- [ ] **Paso 7** `npm run build` y commit.

---

### Tarea 9: Pantalla de reglas, avisos en el tablero y recorrido

**Archivos:**
- Crear: `app/components/traceability/ReglaDeTrampasForm.tsx`
- Modificar: `app/plots/[id]/ajustes/page.tsx` (sección `id="regla-trampas"`)
- Modificar: `app/plots/[id]/page.tsx` (los dos avisos nuevos en «Toca hacer»)
- Modificar: `app/actions/traceability.ts`, `messages/es.json`, `messages/en.json`
- Modificar: `lib/traceability/plantingCohorts.ts` (`getPlotDetail` devuelve la regla)

- [ ] **Paso 1** textos: `trapRuleTitle`, `trapRuleTrigger`, `trapRuleNormalDays`,
  `trapRuleAlertDays`, `trapRuleAction`, `trapRuleNone` («Sin regla, el tablero no
  avisa de las trampas»), `trapsDueAlert` («Trampa {n}: toca revisar, {d} días de
  retraso»), `trapsHighAlert` («Trampa {n}: lectura {lectura} — sugerido: {accion}»).
  Validar los dos JSON con `node -e`.
- [ ] **Paso 2** el formulario de la regla en ajustes, con `BotonQueNecesitaConexion`.
- [ ] **Paso 3** los dos avisos en el tablero, en «Toca hacer», con enlace a `#trampas`.
- [ ] **Paso 4** compuertas: `npm run verify`, `npm run build`, `bash scripts/ci.sh`,
  y las pruebas con base de trampas y reglas. Leer los códigos de salida.
- [ ] **Paso 5: recorrido en navegador** (tarea propia, como en la pieza 1)

Levantar el servidor del worktree y comprobar **en pantalla**, con el dueño:

1. crear un bloque «Norte» y ver que aparece en el select de alta de trampa;
2. dar de alta dos trampas y ver que salen numeradas **1 y 2**, con su aviso de rotular;
3. registrar una revisión con lectura «muchos», foto y las tres casillas de
   mantenimiento; comprobar en la base que la fila trae `broca_level='muchos'`,
   `capture_count` **NULL** y los tres booleanos en `true`;
4. sin regla configurada: el tablero **no** dice nada de trampas;
5. guardar la regla (dispara con «algunos», 14 días normal, 7 de alerta, acción
   «aplicar Bralic») y ver aparecer los dos avisos con su enlace a `#trampas`;
6. en modo avión, los botones de guardar quedan desactivados con «Necesita conexión»;
7. borrar lo creado en la prueba —trampas, bloques, revisiones y sus filas de
   auditoría— en **una transacción**, y comprobar los conteos antes y después.

- [ ] **Paso 6** commit y PR.

---

## Autorrevisión del plan

**Cobertura del spec, sección por sección:**

| spec | tarea |
|---|---|
| §3 bloques | 2, y su pantalla en 6 |
| §4 alta una por una, número por el sistema | 3 |
| §4 revisión: escala, número opcional, otros insectos, mantenimiento | 4 |
| §4 fotos de la tela por revisión | 5 |
| §4 ciclo instalada/retirada/reinstalada | ya existía; 3 crea la instalación |
| §5 reglas del encargado, sin valores por defecto | 7 |
| §6 avisos en el tablero | 8 y 9 |
| §7 dos entregas | tareas 1-6 y 7-9 |
| §8 lo que queda fuera | ninguna tarea, a propósito |
| §9 ancla del correlativo | resuelto en la Tarea 1 con `farmLocationId` |
| §9 permiso de bloques y reglas | resuelto: `location:manage_attributes` |

**Huecos que dejo a la vista:** el spec no pide pantalla propia por trampa y este plan
no la hace; la serie histórica de una trampa se ve por `getTrapCheckSeries`, que ya
existe y no tiene pantalla. Si el dueño la quiere, es otra tarea.

**Consistencia de tipos:** `TrapCaptureLevel` se usa igual en esquema, servicios y
función pura; `farmLocationId` es el mismo campo en Tareas 1, 3 y 7; `recordTrapCheck`
se llama igual en 4, 5 y 6; `avisosDeTrampas` devuelve el `Aviso` de
`pendienteDeLaParcela`, no un tipo paralelo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
