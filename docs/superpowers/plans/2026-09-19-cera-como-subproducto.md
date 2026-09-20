# La cera como subproducto — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development` o
> `superpowers:executing-plans`, tarea por tarea. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** que la cera que sale al colar la miel y la que sale al desopercular dejen de ser
merma y pasen a ser subproducto con su peso, su destino y su trazabilidad.

**Arquitectura:** `ByproductBatch` ya existe (la cascarilla del café) y cuenta su masa como salida
en el balance. Se le añade el tipo `CERA`, tres destinos, y un **segundo origen posible**: un
apiario con una ventana de fechas, sin transformación, para la cera del desopercular — que no sale
de un lote concreto porque se desopercula junto. La del colado sí cuelga de la transformación, como
la cascarilla.

**Stack:** Next.js server actions, Prisma 7, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md` §4

## Restricciones globales

- **Cero es un dato, negativo es un error** (`validarMasaDeSubproducto`, ya escrita).
- **`OTRO` obliga a nota**, y lo exige un CHECK de la base, no sólo el servicio.
- **Dos orígenes posibles, exactamente uno** (CHECK): transformación, **o** apiario con ventana.
- **Los valores nuevos de un enum se comparan en los CHECK como texto** (`destination::text`): un
  valor añadido no se puede usar en la misma transacción que lo añade.
- La ventana va con `windowStart <= windowEnd`, **las dos o ninguna**.
- **No se eligen colmenas ni alzas** para la cera de extracción: no se sabe, y no se inventa.
- Un `<option value="">` **no lleva texto** (Anexo E §6).
- Nunca `git add -A`: archivo por archivo, y contar el stat antes de empujar.
- La migración lleva una marca de tiempo **posterior a la última de `origin/main`** y única.

## Estructura de archivos

| archivo | de qué responde |
|---|---|
| `prisma/schema.prisma` | los dos enums, `transformationId` opcional, la ventana |
| `prisma/migrations/<marca>_cera_subproducto/migration.sql` | el DDL y los tres CHECK |
| `lib/apiary/ceraDeExtraccion.ts` | **nuevo**: anotar la cera del desopercular y leerla con las cosechas de su ventana |
| `lib/apiary/mielDelLote.ts` | `procesarMiel` acepta la cera del colado y la pasa como subproducto |
| `app/actions/apiary.ts` | la acción del formulario de cera de extracción |
| `app/apiaries/[id]/page.tsx` | la sección «Cera de la extracción» |
| `app/components/apiary/PasosDeMielForm.tsx` | el campo «cera que salió» junto a la merma |
| `messages/es.json`, `messages/en.json` | los rótulos |
| `tests/apiary/ceraDeExtraccion.test.ts` | **nuevo**: los CHECK con su sonda, la ventana, el balance |

---

### Tarea 1: El esquema, la migración y sus tres CHECK

**Archivos:**
- Modificar: `prisma/schema.prisma` (enums `ByproductType`/`ByproductDestination`, modelo `ByproductBatch`)
- Crear: `prisma/migrations/<marca>_cera_subproducto/migration.sql`
- Probar: `tests/apiary/ceraDeExtraccion.test.ts`

**Interfaces:**
- Produce: `ByproductType.CERA`; `ByproductDestination.LAMINA_PROPIA | GUARDADA | OTRO`;
  `ByproductBatch.transformationId: string | null`, `windowStart: Date | null`, `windowEnd: Date | null`.

- [ ] **Paso 1: el esquema**

En `enum ByproductType` añadir `CERA`. En `enum ByproductDestination` añadir `LAMINA_PROPIA`,
`GUARDADA`, `OTRO`. En `model ByproductBatch`, `transformationId` pasa a opcional y entra la ventana:

```prisma
  /// De qué transformación salió: la cera **al colar**, como la cascarilla. Opcional desde la
  /// rebanada 2 de la spec de cera: la cera **al desopercular** no sale de un lote concreto
  /// —se desopercula junto— y en su lugar lleva apiario y ventana. Exactamente uno de los dos,
  /// y lo exige un CHECK.
  transformationId String?            @map("transformation_id") @db.Uuid
  transformation   LotTransformation? @relation(fields: [transformationId], references: [id])

  /// La ventana de la actividad, cuando el origen es el apiario: del día en que empezó la
  /// extracción al día en que terminó. Es la trazabilidad a lugar y tiempo que pidió Daniel el
  /// 2026-09-19: «aunque no sepa cuál alza o colmena».
  windowStart DateTime? @map("window_start")
  windowEnd   DateTime? @map("window_end")
```

- [ ] **Paso 2: generar la migración y añadirle los CHECK a mano**

```bash
export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"
D=prisma/migrations/$(date -u +%Y%m%d)163500_cera_subproducto   # marca posterior a la última de main; comprobarlo
mkdir -p "$D"
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script > "$D/migration.sql"
```

Y al final del archivo, a mano (los valores nuevos del enum se comparan como texto):

```sql
-- Un subproducto sale de una transformación, O de un apiario con su ventana. Nunca de los dos,
-- nunca de ninguno: sin origen no es trazable, y la trazabilidad es la razón de esta tabla.
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_un_solo_origen"
  CHECK (
    ("transformation_id" IS NOT NULL AND "window_start" IS NULL AND "window_end" IS NULL)
    OR ("transformation_id" IS NULL AND "window_start" IS NOT NULL AND "window_end" IS NOT NULL)
  );
-- Una ventana que termina antes de empezar no es una ventana.
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_ventana_en_orden"
  CHECK ("window_start" IS NULL OR "window_start" <= "window_end");
-- «Otro uso» sin decir cuál no dice nada.
ALTER TABLE "traceability"."byproduct_batch" ADD CONSTRAINT "byproduct_batch_otro_dice_por_que"
  CHECK ("destination"::text <> 'OTRO' OR btrim(coalesce("notes", '')) <> '');
```

- [ ] **Paso 3: aplicar y comprobar deriva con control positivo**

```bash
export DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_test
export SHADOW_DATABASE_URL=postgresql://postgres@127.0.0.1:55433/nectar_shadow
npx prisma migrate deploy; npx prisma generate
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script | grep -cvE '^\s*(--|$)'   # 0
mv "$D" /tmp/aparte && npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script | grep -c window_start && mv /tmp/aparte "$D"   # >0: el control
```

- [ ] **Paso 4: la sonda de los tres CHECK, y «lo válido entra»**

En `tests/apiary/ceraDeExtraccion.test.ts`, con el patrón de `tests/apiary/recipientes.test.ts`
(`sonda(sql)` dentro de un `SAVEPOINT`, devolviendo el nombre de la restricción que salta):

```ts
describe("las reglas de la cera viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const fila = (cols: string, vals: string) =>
      `insert into traceability.byproduct_batch (byproduct_type, destination, mass_kg, produced_at_location_id, organization_id, provenance_class${cols}) values ('CERA', 'GUARDADA', 3, '${sitioId}', '${organizationId}', 'measured_fact'${vals})`;
    expect(await sonda(fila("", ""))).toMatch(/un_solo_origen/); // sin origen
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-05', '2026-05-03'`))).toMatch(/ventana_en_orden/);
    expect(await sonda(fila(", window_start, window_end, destination", `, '2026-05-03', '2026-05-05', 'OTRO'`).replace("'GUARDADA'", "'OTRO'"))).toMatch(/otro_dice_por_que/);
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-03', '2026-05-05'`))).toBe("entró"); // el control
  });
});
```

- [ ] **Paso 5: correrla y verla pasar**

```bash
npx vitest run tests/apiary/ceraDeExtraccion.test.ts
```

- [ ] **Paso 6: commit**

```bash
git add prisma/schema.prisma prisma/migrations/*_cera_subproducto/migration.sql tests/apiary/ceraDeExtraccion.test.ts
git commit -F <archivo con el mensaje>
```

---

### Tarea 2: La cera al colar deja de ser merma

**Archivos:**
- Modificar: `lib/apiary/mielDelLote.ts` (`ProcesarMielInput`, `procesarMiel`)
- Probar: `tests/apiary/mielDelLote.test.ts`

**Interfaces:**
- Consume: `ByproductDestination` de la Tarea 1; `recordTransformation({ byproducts })`, que ya
  cuenta la masa de cada subproducto como salida del balance.
- Produce: `ProcesarMielInput.ceraKg: number | string | null`, `ceraDestino?: ByproductDestination | null`,
  `ceraNota?: string | null`.

- [ ] **Paso 1: la prueba que falla**

```ts
it("LA CERA DEL COLADO ES SUBPRODUCTO, no merma: cuenta como salida del balance", async () => {
  const r = await procesarMiel(operario, {
    lotId, occurredAt: dia("2026-05-10"), inputKg: 30, outputKg: 26, ceraKg: 4,
    ceraDestino: "LAMINA_PROPIA", provenanceClass: "measured_fact",
  });
  const cera = await prisma.byproductBatch.findMany({ where: { transformationId: r.transformation.id } });
  expect(cera).toHaveLength(1);
  expect(Number(cera[0]!.massKg)).toBeCloseTo(4, 3);
  expect(cera[0]!.byproductType).toBe("CERA");
  expect(cera[0]!.windowStart).toBeNull(); // su origen es la transformación
  expect(Number(r.reconciliation.unexplainedQuantity ?? 0)).toBeCloseTo(0, 3); // 26 + 4 = 30
  const t = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: r.transformation.id } });
  expect(t.declaredLossQuantity).toBeNull(); // la cera NO fue a la merma
});

it("LA CERA CON «OTRO» EXIGE NOTA", async () => {
  await expect(procesarMiel(operario, {
    lotId, occurredAt: dia("2026-05-10"), inputKg: 30, outputKg: 26, ceraKg: 4,
    ceraDestino: "OTRO", provenanceClass: "measured_fact",
  })).rejects.toThrow(/cera_otro_sin_nota/);
});
```

- [ ] **Paso 2: correrla y leer POR QUÉ falla**

```bash
npx vitest run tests/apiary/mielDelLote.test.ts -t "CERA DEL COLADO"
```
Esperado: falla porque `ceraKg` no existe en el tipo (error de tipos) — no por otra razón.

- [ ] **Paso 3: el código**

En `ProcesarMielInput`:

```ts
  /** La cera que salió al colar, en kg. **No es merma** (spec §4.2): es subproducto con destino. */
  ceraKg?: number | string | null;
  ceraDestino?: ByproductDestination | null;
  ceraNota?: string | null;
```

En `procesarMiel`, después de `const outputKg = ...`:

```ts
  // Spec §4.2 — la cera del colado cuenta como SALIDA, no como merma. Contarla como pérdida
  // infla la merma y esconde la de verdad, que es el número que dice si alguien pesó mal.
  const ceraKg = kilos(input.ceraKg ?? null, "cera");
  let cera: { byproductType: "CERA"; destination: ByproductDestination; massKg: number; producedAtLocationId: string; notes: string | null } | null = null;
  if (ceraKg !== null) {
    if (!input.ceraDestino) throw new MielInvalida("cera_sin_destino");
    const nota = input.ceraNota?.trim() || null;
    if (input.ceraDestino === "OTRO" && !nota) throw new MielInvalida("cera_otro_sin_nota");
    // El lugar es el del lote: es el ancla de RBAC de la tabla, y sin él no hay a quién enseñar la cera.
    if (!lote.locationId) throw new MielInvalida("cera_sin_lugar");
    cera = { byproductType: "CERA", destination: input.ceraDestino, massKg: ceraKg, producedAtLocationId: lote.locationId, notes: nota };
  }
```

y en la llamada a `recordTransformation`, añadir `byproducts: cera ? [cera] : undefined`.

- [ ] **Paso 4: verlas pasar, y el balance con ellas**

```bash
npx vitest run tests/apiary/mielDelLote.test.ts
npx tsc --noEmit
```

- [ ] **Paso 5: commit**

---

### Tarea 3: La cera al desopercular, con su ventana

**Archivos:**
- Crear: `lib/apiary/ceraDeExtraccion.ts`
- Probar: `tests/apiary/ceraDeExtraccion.test.ts`
- Modificar: `docs/arquitectura/acceso-a-datos.allowlist.json` (el archivo nuevo en `importan_cliente_total`)

**Interfaces:**
- Consume: `requireApiaryAccess(userAccountId, "manage"|"view", [{ locationId }])`;
  `ByproductDestination` de la Tarea 1.
- Produce:
  - `DESTINOS_DE_CERA_DE_EXTRACCION: readonly ByproductDestination[]` = `["LAMINA_PROPIA","SALE","GUARDADA","OTRO"]`
  - `class CeraDeExtraccionInvalida extends Error`
  - `anotarCeraDeExtraccion(userAccountId, { apiaryLocationId, massKg, destination, windowStart, windowEnd, notes? }): Promise<ByproductBatch>`
  - `ceraDeExtraccionDelApiario(userAccountId, apiaryLocationId): Promise<FilaDeCeraDeExtraccion[]>`,
    con `FilaDeCeraDeExtraccion = { id, massKg: number, destination, windowStart, windowEnd, notes, cosechas: { id, lotCode, occurredAt, hiveIdentifier }[] }`

- [ ] **Paso 1: las pruebas que fallan**

```ts
describe("la cera de la extracción", () => {
  it("SE ANOTA CON SU VENTANA y sin transformación; y dice qué cosechas de ESE apiario caen dentro", async () => {
    await cosechaEn(dia("2026-05-04")); // dentro
    await cosechaEn(dia("2026-05-09")); // fuera
    const otra = await apiarioAparte(); await cosechaEn(dia("2026-05-04"), otra); // otro apiario
    const fila = await anotarCeraDeExtraccion(operario, {
      apiaryLocationId: sitioId, massKg: 7.5, destination: "GUARDADA",
      windowStart: dia("2026-05-03"), windowEnd: dia("2026-05-05"),
    });
    expect(fila.transformationId).toBeNull();
    const leidas = await ceraDeExtraccionDelApiario(operario, sitioId);
    expect(leidas).toHaveLength(1);
    expect(leidas[0]!.massKg).toBeCloseTo(7.5, 3);
    expect(leidas[0]!.cosechas.map((c) => c.occurredAt.toISOString().slice(0, 10))).toEqual(["2026-05-04"]);
  });

  it("REGLAS: masa negativa, ventana al revés, OTRO sin nota, y sin permiso no", async () => {
    const base = { apiaryLocationId: sitioId, destination: "GUARDADA" as const, windowStart: dia("2026-05-03"), windowEnd: dia("2026-05-05") };
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: -1 })).rejects.toThrow(/masa inválida/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: 3, windowStart: dia("2026-05-06") })).rejects.toThrow(/ventana_al_reves/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: 3, destination: "OTRO" })).rejects.toThrow(/otro_sin_nota/);
    await expect(anotarCeraDeExtraccion(extrano, { ...base, massKg: 3 })).rejects.toThrow(/no_apiary_access/);
  });

  it("CERO KILOS ES UN DATO: se desoperculó y no se recogió cera aprovechable", async () => {
    const fila = await anotarCeraDeExtraccion(operario, {
      apiaryLocationId: sitioId, massKg: 0, destination: "GUARDADA",
      windowStart: dia("2026-05-03"), windowEnd: dia("2026-05-05"),
    });
    expect(Number(fila.massKg)).toBe(0);
  });
});
```

- [ ] **Paso 2: correrlas y leer por qué fallan** (`npx vitest run tests/apiary/ceraDeExtraccion.test.ts`); esperado: el módulo no existe.

- [ ] **Paso 3: el servicio**

```ts
/**
 * La cera que sale al DESOPERCULAR — spec §4.3. No sale de un lote: se desopercula junto, así que
 * su origen es el apiario y una VENTANA de fechas. Al leerla se dice qué cosechas de ese apiario
 * caen dentro, y se dice como lo que es —«cosechas de este apiario entre el 3 y el 5»—, no «esta
 * cera es de estas colmenas». Es la trazabilidad a lugar y tiempo que pidió Daniel el 2026-09-19.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { validarMasaDeSubproducto } from "../traceability/subproductos";
import type { ByproductDestination } from "../../generated/prisma/client";

export class CeraDeExtraccionInvalida extends Error {}

export const DESTINOS_DE_CERA_DE_EXTRACCION: readonly ByproductDestination[] = ["LAMINA_PROPIA", "SALE", "GUARDADA", "OTRO"];

async function fincaDelApiario(userAccountId: string, locationId: string, accion: "manage" | "view") {
  const sitio = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireApiaryAccess(userAccountId, accion, [{ locationId }]);
  if (!sitio.organizationId) throw new CeraDeExtraccionInvalida("sitio_sin_finca");
  return sitio.organizationId;
}

export async function anotarCeraDeExtraccion(
  userAccountId: string,
  input: { apiaryLocationId: string; massKg: number | string; destination: ByproductDestination; windowStart: Date; windowEnd: Date; notes?: string | null },
) {
  const organizationId = await fincaDelApiario(userAccountId, input.apiaryLocationId, "manage");
  const massKg = typeof input.massKg === "number" ? input.massKg : Number(String(input.massKg).trim() === "" ? NaN : input.massKg);
  validarMasaDeSubproducto(massKg);
  if (!(input.windowStart <= input.windowEnd)) throw new CeraDeExtraccionInvalida("ventana_al_reves");
  const notes = input.notes?.trim() || null;
  if (input.destination === "OTRO" && !notes) throw new CeraDeExtraccionInvalida("otro_sin_nota");

  return prisma.$transaction(async (tx) => {
    const fila = await tx.byproductBatch.create({
      data: {
        byproductType: "CERA",
        destination: input.destination,
        massKg,
        transformationId: null,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        producedAtLocationId: input.apiaryLocationId,
        organizationId,
        notes,
        provenanceClass: "measured_fact",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "byproduct_batch.create",
        entityType: "byproduct_batch",
        entityId: fila.id,
        after: fila,
        sourceInterface: "apiary.ceraDeExtraccion",
      },
      tx,
    );
    return fila;
  });
}

export interface FilaDeCeraDeExtraccion {
  id: string;
  massKg: number;
  destination: ByproductDestination;
  windowStart: Date;
  windowEnd: Date;
  notes: string | null;
  cosechas: { id: string; lotCode: string; occurredAt: Date; hiveIdentifier: string }[];
}

export async function ceraDeExtraccionDelApiario(userAccountId: string, apiaryLocationId: string): Promise<FilaDeCeraDeExtraccion[]> {
  await fincaDelApiario(userAccountId, apiaryLocationId, "view");
  const filas = await prisma.byproductBatch.findMany({
    where: { byproductType: "CERA", transformationId: null, producedAtLocationId: apiaryLocationId },
    orderBy: { windowStart: "desc" },
  });
  return Promise.all(
    filas.map(async (f) => ({
      id: f.id,
      massKg: Number(f.massKg),
      destination: f.destination,
      windowStart: f.windowStart!,
      windowEnd: f.windowEnd!,
      notes: f.notes,
      // Las cosechas de ESTE apiario y de ESTAS fechas. No se afirma que la cera salga de ellas.
      cosechas: (
        await prisma.apiaryHarvestEvent.findMany({
          where: {
            occurredAt: { gte: f.windowStart!, lte: f.windowEnd! },
            colony: { hive: { locationId: apiaryLocationId } },
          },
          select: { id: true, occurredAt: true, resultingLot: { select: { lotCode: true } }, colony: { select: { hive: { select: { identifier: true } } } } },
          orderBy: { occurredAt: "asc" },
        })
      ).map((c) => ({ id: c.id, lotCode: c.resultingLot.lotCode, occurredAt: c.occurredAt, hiveIdentifier: c.colony.hive.identifier })),
    })),
  );
}
```

- [ ] **Paso 4: verlas pasar y correr las guardias de arquitectura**

```bash
npx vitest run tests/apiary/ceraDeExtraccion.test.ts tests/arquitectura
```
Si `acceso-a-datos` se queja, el archivo nuevo va a `importan_cliente_total` con su razón, y las
cifras de `docs/arquitectura/inventario-de-acceso.md` se ponen con `node scripts/inventario-de-acceso.mjs`.

- [ ] **Paso 5: commit**

---

### Tarea 4: Lo que se ve, y el ADR

**Archivos:**
- Modificar: `app/actions/apiary.ts`, `app/apiaries/[id]/page.tsx`,
  `app/components/apiary/PasosDeMielForm.tsx`, `messages/es.json`, `messages/en.json`
- Modificar: `docs/architecture/DECISIONS.md` (ADR nuevo), `SESSION_STATE.md`

**Interfaces:**
- Consume: `anotarCeraDeExtraccion`, `ceraDeExtraccionDelApiario`,
  `DESTINOS_DE_CERA_DE_EXTRACCION` (Tarea 3); `ceraKg`/`ceraDestino`/`ceraNota` (Tarea 2).

- [ ] **Paso 1: la acción del formulario**

En `app/actions/apiary.ts`, junto a `registrarCeraNuevaFormAction`:

```ts
export async function anotarCeraDeExtraccionFormAction(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const apiaryLocationId = String(formData.get("apiaryLocationId") ?? "");
  await anotarCeraDeExtraccion(user.userAccountId, {
    apiaryLocationId,
    massKg: String(formData.get("massKg") ?? ""),
    destination: String(formData.get("destination") ?? "") as ByproductDestination,
    windowStart: fechaDeDia(formData.get("windowStart") as string | null, "windowStart"),
    windowEnd: fechaDeDia(formData.get("windowEnd") as string | null, "windowEnd"),
    notes: String(formData.get("notes") ?? ""),
  });
  revalidatePath(`/apiaries/${apiaryLocationId}`);
}
```

(`fechaDeDia(valor, campo)` es el helper de día de `lib/time/localDateTime.ts` que ya usan las otras
acciones de apiario, y toma DOS argumentos: el valor y el nombre del campo.)

- [ ] **Paso 2: la sección en la ficha del apiario**

Bajo la sección de cera por año, una `<section>` con la tabla de lo anotado —kilos, destino,
ventana, y las cosechas de esa ventana como texto «cosechas de este apiario entre X e Y: …»— y el
formulario de alta con `CampoNumerico` para los kilos, dos `type="date"` para la ventana, un
`<select>` de destinos (su `<option value="">` **sin texto**) y un campo de nota.

- [ ] **Paso 3: el campo de cera en el proceso de miel**

En `PasosDeMielForm.tsx`, junto a la merma: `ceraKg` (`CampoNumerico`), `ceraDestino` (`<select>`)
y `ceraNota`. La acción `procesarMielAction` los pasa tal cual, como cadenas.

- [ ] **Paso 4: los rótulos en los dos idiomas**

`ceraExtraccionHeading`, `ceraExtraccionKilos`, `ceraExtraccionVentana`, `ceraExtraccionDestino`,
`ceraExtraccionNota`, `ceraExtraccionGuardar`, `ceraExtraccionCosechas`, `ceraDelColado`,
`ceraDestino`, `ceraNota`, y un rótulo por destino. En `es.json` y en `en.json`.

- [ ] **Paso 5: las compuertas completas**

```bash
npm run verify; npm run build; bash scripts/ci.sh
npx vitest run tests/apiary tests/traceability/subproductos.test.ts
```

- [ ] **Paso 6: el ADR y el estado**

ADR nuevo en `docs/architecture/DECISIONS.md` (número libre; comprobarlo con un control positivo
sobre el anterior), diciendo: la cera es subproducto y **deja de ir en la merma**; dos orígenes con
su CHECK; la ventana es trazabilidad a lugar y tiempo, no a colmena. Y una entrada en
`SESSION_STATE.md` con «**Sin ver en navegador**», archivando la más vieja si el presupuesto lo pide.

- [ ] **Paso 7: commit, contar el stat, y flip-tests**

Mutaciones mínimas, cada una con su prueba nombrada: la cera del colado a la merma; `byproducts`
sin pasar; el CHECK de un solo origen quitado; la ventana sin comprobar; `OTRO` sin exigir nota; el
filtro de apiario quitado en la lectura de cosechas; el filtro de fechas quitado.

---

## Autorrevisión

**Cobertura de la spec §4:** §4.1 los enums y los dos orígenes → Tarea 1. §4.2 la cera al colar,
que cuenta como salida y no como merma → Tarea 2. §4.3 la cera al desopercular con su ventana y las
cosechas que caen dentro → Tarea 3. §4.4 lo que se ve en la ficha del apiario y en el proceso del
lote → Tarea 4. §6 pruebas: los CHECK con sonda (T1), el balance (T2), la ventana y el apiario (T3).

**Lo que la spec deja fuera y este plan tampoco hace:** enlazar la cera fundida con la «cera nueva»
de su año (ADR-173), que la cera sea un lote, y asignar la cera de extracción a colmenas concretas.

**Consistencia de nombres:** `ceraKg`/`ceraDestino`/`ceraNota` en las Tareas 2 y 4;
`anotarCeraDeExtraccion`/`ceraDeExtraccionDelApiario`/`DESTINOS_DE_CERA_DE_EXTRACCION` en 3 y 4.
Nada choca con `lib/apiary/cera.ts`, que es la cera **en marcos** (`TIPOS_DE_CERA`,
`DESTINOS_DE_CERA`) y no se toca.
