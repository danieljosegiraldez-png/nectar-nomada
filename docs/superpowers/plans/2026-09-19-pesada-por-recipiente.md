# La pesada por recipiente — Plan de implementación (rebanada 1 de la cadena de la miel)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una cosecha pueda pesarse por recipiente —cada balde o tambor con su bruto y su tara— y que, cuando los tiene, su peso extraído sea la suma de los netos, asentada en el libro del lote.

**Architecture:** Tabla `apiary.harvest_container` (cosecha, etiqueta, bruto, tara; el neto se calcula). Un módulo `lib/apiary/recipientes.ts` anota y quita recipientes y, en la misma transacción, fija el peso de la cosecha por **el mismo camino** que hoy corrige el libro del lote: se extrae de `completarCierreDeCosecha` un ayudante `asentarPesoDeCosecha…` que asienta la diferencia. Mientras haya recipientes, `completarCierreDeCosecha` rechaza un peso escrito a mano.

**Tech Stack:** Next.js App Router, Prisma 7 + PostgreSQL, vitest, next-intl.

**Spec:** `docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md` §3.

## Global Constraints

- Node: `export PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"`. Base local: `export DATABASE_URL="postgresql://postgres@127.0.0.1:55433/nectar_test"; export SHADOW_DATABASE_URL="${DATABASE_URL%%\?*}_shadow"`. Tras cambiar de rama: `npx prisma generate` antes de creer una prueba (el cliente viejo da `Unknown argument`, que parece un fallo del código).
- Toda escritura con su `AuditEvent` en la misma transacción; FK a cosecha y a personas `onDelete: Restrict`; cada CHECK con sonda y «lo válido entra».
- Migración con marca **posterior a la última de `origin/main`**, medida (`git ls-tree --name-only origin/main prisma/migrations/ | tail -2`), y distinta de todas.
- ADR: el siguiente libre **en `origin/main`**, medido al cerrar.
- `git add` archivo por archivo; `git commit -F`; compuertas encadenadas; commitear antes de los flip-tests.
- Números con `CampoNumerico`; mensajes en `messages/{es,en}.json`, espacio `Apiary`, uniendo claves como JSON si chocan.
- Revisión de Codex antes de fusionar, con el paquete acotado a `lib/ app/ tests/ prisma/migrations/` y el tamaño comprobado (< 1.000.000 caracteres) antes de lanzar.

## Decisiones tomadas al planear

1. **Primer recipiente sobre una cosecha que ya tenía peso escrito a mano:** se permite, y el peso pasa a ser la suma. El `AuditEvent` de la cosecha guarda el peso anterior en `before` y la operación `apiary_harvest.weigh_containers` lo nombra. No se pide motivo: pesar por recipiente no es corregir, es pesar mejor. El libro se mueve por la diferencia.
2. **Quitar el último recipiente no borra el peso**: la cosecha se queda con el último total asentado (el libro no se toca), y vuelve a poder corregirse a mano. «Ya no hay recipientes» no es «no salió miel».
3. **Serializable** en anotar y quitar: dos recipientes anotados a la vez sumarían sobre un total viejo.
4. **Quitar es borrar la fila, con motivo** y el `AuditEvent` con su `before`. Es corregir un error de anotación, y el rastro queda en la auditoría.

---

### Task 1: La tabla y sus reglas en la base

**Files:** `prisma/schema.prisma` (modelo nuevo; relación inversa en `ApiaryHarvestEvent` y `UserAccount`), `prisma/migrations/<marca>_pesada_por_recipiente/migration.sql`, `tests/apiary/recipientes.test.ts`, `scripts/pruebas-por-compuerta.txt` (grupo `base-sembrada`).

```prisma
/// Un recipiente de la extracción — spec 2026-09-19 §3. Daniel: «por recipiente». El neto NO se
/// guarda: es bruto − tara. Si la cosecha tiene recipientes, su peso ES la suma de los netos.
model HarvestContainer {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  apiaryHarvestEventId String             @map("apiary_harvest_event_id") @db.Uuid
  apiaryHarvestEvent   ApiaryHarvestEvent @relation(fields: [apiaryHarvestEventId], references: [id], onDelete: Restrict)

  /// «balde 3», «tambor A». Única dentro de la cosecha.
  label   String
  grossKg Decimal @map("gross_kg") @db.Decimal(10, 3)
  tareKg  Decimal @map("tare_kg") @db.Decimal(10, 3)

  createdAt DateTime     @default(now()) @map("created_at")
  createdBy String?      @map("created_by") @db.Uuid
  creator   UserAccount? @relation("HarvestContainerCreatedBy", fields: [createdBy], references: [id], onDelete: Restrict)

  @@unique([apiaryHarvestEventId, label])
  @@map("harvest_container")
  @@schema("apiary")
}
```

Inversas: `ApiaryHarvestEvent.containers HarvestContainer[]`; `UserAccount.harvestContainersCreated HarvestContainer[] @relation("HarvestContainerCreatedBy")`.

A mano en la migración:

```sql
ALTER TABLE "apiary"."harvest_container" ADD CONSTRAINT "harvest_container_pesos_posibles"
  CHECK ("tare_kg" >= 0 AND "gross_kg" > "tare_kg");
ALTER TABLE "apiary"."harvest_container" ADD CONSTRAINT "harvest_container_etiqueta_dice_algo"
  CHECK (btrim("label") <> '');
```

Sonda (andamiaje de `tests/apiary/marcosNegros.test.ts`: organización, apiario, admin, operario, extraño, `colmena()` con colonia; más una cosecha con `recordApiaryHarvest`):

```ts
it("LAS REGLAS VIVEN EN LA BASE: cada CHECK rechaza lo suyo, y lo válido entra", async () => {
  const h = await cosecha();
  const ins = (label: string, bruto: string, tara: string) =>
    `INSERT INTO apiary.harvest_container (apiary_harvest_event_id, label, gross_kg, tare_kg) VALUES ('${h.id}', '${label}', ${bruto}, ${tara})`;
  expect(await sonda(ins("balde 1", "20.5", "1.2"))).toBe("entra");
  expect(await sonda(ins("balde 1", "1.0", "1.2"))).toBe("harvest_container_pesos_posibles");
  expect(await sonda(ins("balde 1", "1.2", "1.2"))).toBe("harvest_container_pesos_posibles");
  expect(await sonda(ins("balde 1", "5", "-0.1"))).toBe("harvest_container_pesos_posibles");
  expect(await sonda(ins("   ", "5", "1"))).toBe("harvest_container_etiqueta_dice_algo");
});
```

Aplicar, deriva 0, control positivo; registrar en `base-sembrada` y comprobar con el cálculo de `ci.sh` que queda fuera del carril sin base. Commit.

---

### Task 2: El servicio

**Files:** `lib/apiary/cierreDeCosecha.ts` (ayudante extraído + rechazo), `lib/apiary/recipientes.ts` (nuevo), `tests/apiary/recipientes.test.ts`.

**Interfaces producidas:**
- `asentarPesoDeCosechaEn(tx, cosecha: { id; resultingLotId; occurredAt; provenanceClass; extractedWeightKg: Decimal | null }, nuevoKg: number, userAccountId): Promise<void>` — en `cierreDeCosecha.ts`, exportado, **el mismo** asiento de diferencia que hoy vive dentro de `completarCierreDeCosecha` (que pasa a llamarlo).
- `class RecipienteInvalido extends Error`
- `anotarRecipiente(userAccountId, { apiaryHarvestEventId, label, grossKg, tareKg }): Promise<{ recipiente; totalKg: number }>`
- `quitarRecipiente(userAccountId, { containerId, reason }): Promise<{ totalKg: number | null }>`
- `cosechasDeColonia` gana `recipientes: { id; label; grossKg: number; tareKg: number; netoKg: number }[]`.

Pruebas (todas en `tests/apiary/recipientes.test.ts`):

```ts
it("EL PESO DE LA COSECHA ES LA SUMA DE LOS NETOS, y el libro del lote la recibe", async () => {
  const h = await cosecha();
  await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "balde 1", grossKg: 21.2, tareKg: 1.2 });
  const { totalKg } = await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "balde 2", grossKg: 16.5, tareKg: 1.5 });
  expect(totalKg).toBeCloseTo(35, 3);
  const fila = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: h.id } });
  expect(Number(fila.extractedWeightKg)).toBeCloseTo(35, 3);
  expect(Number((await computeCurrentQuantity(h.resultingLotId)).quantity)).toBeCloseTo(35, 3);
});

it("QUITAR MUEVE EL LIBRO POR LA DIFERENCIA, pide motivo, y el último no borra el peso", async () => {
  const h = await cosecha();
  await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 11, tareKg: 1 });
  const { recipiente } = await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b2", grossKg: 6, tareKg: 1 });
  await expect(quitarRecipiente(operario, { containerId: recipiente.id, reason: " " })).rejects.toThrow(/quitar_sin_motivo/);
  expect((await quitarRecipiente(operario, { containerId: recipiente.id, reason: "anotado dos veces" })).totalKg).toBeCloseTo(10, 3);
  expect(Number((await computeCurrentQuantity(h.resultingLotId)).quantity)).toBeCloseTo(10, 3);
  const [ultimo] = await prisma.harvestContainer.findMany({ where: { apiaryHarvestEventId: h.id } });
  await quitarRecipiente(operario, { containerId: ultimo!.id, reason: "se vuelve a pesar a mano" });
  const fila = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: h.id } });
  expect(Number(fila.extractedWeightKg)).toBeCloseTo(10, 3);
});

it("CON RECIPIENTES NO SE ESCRIBE OTRO PESO A MANO; sin ellos, sí", async () => {
  const h = await cosecha();
  await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 11, tareKg: 1 });
  await expect(completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, extractedWeightKg: 50, reason: "x" })).rejects.toThrow(/peso_lo_dan_los_recipientes/);
  await expect(completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, honeyType: "multifloral" })).resolves.toBeTruthy();
});

it("SOBRE UN PESO ESCRITO A MANO, el primer recipiente lo sustituye y el libro se mueve por la diferencia", async () => {
  const h = await cosecha();
  await completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, extractedWeightKg: 30 });
  await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: 1 });
  expect(Number((await computeCurrentQuantity(h.resultingLotId)).quantity)).toBeCloseTo(25, 3);
});

it("REGLAS: tara mayor que bruto, etiqueta repetida con su nombre, y sin permiso no", async () => {
  const h = await cosecha();
  await expect(anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 1, tareKg: 2 })).rejects.toThrow(/pesos_imposibles/);
  await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 5, tareKg: 1 });
  await expect(anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: " b1 ", grossKg: 5, tareKg: 1 })).rejects.toThrow(/etiqueta_repetida/);
  await expect(anotarRecipiente(extrano, { apiaryHarvestEventId: h.id, label: "b9", grossKg: 5, tareKg: 1 })).rejects.toThrow(/no_apiary_access/);
});
```

`computeCurrentQuantity` de `lib/traceability/quantity` (su forma de retorno se comprueba en el primer uso; si devuelve número y no objeto, se ajusta la aserción). Implementación: `recipientes.ts` con `requireApiaryAccess("manage")` sobre la caja de la cosecha; `$transaction(…, { isolationLevel: "Serializable" })`; crear/borrar la fila; releer la cosecha **dentro** de la transacción; sumar netos; `asentarPesoDeCosechaEn(tx, cosecha, suma, user)` si quedan recipientes; `AuditEvent` del recipiente (`harvest_container.create` / `.delete` con `before` y `reason`) y de la cosecha (`apiary_harvest.weigh_containers` con `before`). El choque de etiqueta lo decide la base (`Unique constraint` → `etiqueta_repetida`). Commit.

---

### Task 3: La pantalla

**Files:** `app/actions/apiary.ts` (`anotarRecipienteFormAction`, `quitarRecipienteFormAction`), `app/apiaries/[id]/hives/[hiveId]/page.tsx` (en cada cosecha: lista de recipientes con bruto − tara = neto, total, «quitar» con motivo, y «añadir recipiente»; el campo de peso a mano se sustituye por el total cuando hay recipientes), `messages/{es,en}.json`.

Claves: `recipientesHeading` «Recipientes» / «Containers»; `recipienteFila` «{label}: {bruto} − {tara} = {neto} kg» / igual; `recipientesTotal` «Total: {kg} kg — es el peso de la cosecha» / «Total: {kg} kg — this is the harvest weight»; `recipienteAnadir` «Añadir un recipiente» / «Add a container»; `recipienteEtiqueta` «¿Cuál? (balde 3, tambor A…)» / «Which one? (bucket 3, drum A…)»; `recipienteBruto` «Lleno (kg)» / «Full (kg)»; `recipienteTara` «Vacío (kg)» / «Empty (kg)»; `recipienteGuardar` «Añadir» / «Add»; `recipienteQuitar` «Quitar» / «Remove»; `recipienteMotivo` «¿Por qué?» / «Why?»; `pesoLoDanLosRecipientes` «El peso lo dan los recipientes.» / «The weight comes from the containers.».

`verify` y `build` en 0. Commit.

---

### Task 4: Cierre

Inventario de acceso (cifras del script), allowlist de `lib/apiary/recipientes.ts`, ADR (número medido), entrada de estado (archivar si pasa de 400), compuertas completas, **revisión de Codex**, flip-tests:

| # | mutación | debe caer |
|---|---|---|
| 1 | la suma sin restar la tara | «EL PESO DE LA COSECHA ES LA SUMA…» |
| 2 | no asentar en el libro | «EL PESO DE LA COSECHA…» |
| 3 | asentar el total y no la diferencia | «SOBRE UN PESO ESCRITO A MANO…» |
| 4 | quitar sin motivo | «QUITAR MUEVE EL LIBRO…» |
| 5 | quitar el último borra el peso | «QUITAR MUEVE EL LIBRO…» |
| 6 | `completarCierreDeCosecha` acepta peso con recipientes | «CON RECIPIENTES NO SE ESCRIBE…» |
| 7 | anotar sin `requireApiaryAccess` | «REGLAS…» |

PR, CI sobre el sha exacto, fusión con el OK de Daniel y verificación en producción.
