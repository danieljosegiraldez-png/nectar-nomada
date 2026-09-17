# Inventario con existencias — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA:
> `superpowers:subagent-driven-development` o `superpowers:executing-plans`.

**Objetivo:** que el sistema pueda decir **cuánto queda** de un material, y
distinguirlo de **«nadie lo ha contado nunca»**.

**Arquitectura:** tres piezas —identidad, lote y libro mayor— y **ningún saldo
guardado**. El saldo se deriva al leer, copiando la forma de `QuantityEvent` +
`computeLotBalance`, incluido su `recorded`.

**Spec:** `docs/superpowers/specs/2026-09-17-inventario-con-existencias-design.md`

## Restricciones globales

- **El saldo NUNCA se guarda.** Un saldo guardado y un libro mayor dejan de
  cuadrar en silencio. Si una tarea añade una columna `stock`, está mal.
- **«Nunca contado» no es «cero».** Se copia `recorded` de `LotBalance`, que es
  ADR-080. Un inventario que los confunda miente sobre la finca.
- **Lo negativo avisa, no bloquea.** Gastar más de lo que el sistema cree que hay
  es legítimo. Ninguna tarea puede impedir registrar un consumo.
- **La captura de campo no se complica.** Elegir lote es opcional. Si una tarea
  lo hace obligatorio, el resultado es que no se anota.
- **`npm run build` en toda tarea que toque TypeScript.**
- **Toda prueba de base se declara en `scripts/pruebas-por-compuerta.txt`.**
- **Commitear ANTES de mutar.**

---

## Tarea 1: La identidad del material

**Archivos:** `prisma/schema.prisma`, migración, `lib/inventario/materiales.ts`
**Probar:** `tests/inventario/materiales.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("dos consumos del mismo material apuntan a la MISMA identidad", async () => {
  // La razón entera de esta tarea. Con texto libre, «aserrín» y «Aserrín para
  // el ahumador» son dos materiales y no se pueden sumar.
  const m = await crearMaterial(gestor, { nombre: "Aserrín", categoria: "combustible", unidadPorDefecto: "saco" });
  expect(m.id).toBeTruthy();
  await expect(crearMaterial(gestor, { nombre: "Aserrín", categoria: "combustible", unidadPorDefecto: "saco" }))
    .rejects.toThrow(/ya_existe/);
});

it("el nombre es único POR ORGANIZACIÓN, no globalmente", async () => {
  // Dos fincas pueden llamar «melaza» a lo suyo. Mismo criterio que
  // `ProcessRecipe`, cuyo comentario lo dice con esas palabras.
  await crearMaterial(gestor, { nombre: "Melaza", organizationId: orgA, unidadPorDefecto: "gal" });
  await expect(crearMaterial(gestorB, { nombre: "Melaza", organizationId: orgB, unidadPorDefecto: "gal" }))
    .resolves.toBeTruthy();
});
```

- [ ] **Paso 2: verla fallar. Paso 3: el modelo**

```prisma
/// Qué es la cosa. Sin esto no hay existencias: no se puede sumar lo que se
/// escribe distinto cada vez, y hasta hoy el material vivía como TEXTO LIBRE en
/// `MaterialConsumptionEntry.materialName`.
model ConsumableMaterial {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  name     String
  category String?
  /// La unidad en la que la finca lo compra y lo gasta. No se normaliza a kilos
  /// al guardar: el operario teclea la unidad en la que trabaja.
  defaultUnit String @map("default_unit")

  organizationId String       @map("organization_id") @db.Uuid
  organization   Organization @relation(fields: [organizationId], references: [id])

  lots ConsumableLot[]

  /// Por organización, no global: dos fincas pueden llamar «melaza» a lo suyo.
  /// Mismo criterio que `ProcessRecipe`.
  @@unique([organizationId, name])
  @@map("consumable_material")
  @@schema("traceability")
}
```

- [ ] **Paso 4: migración, verde, build, declarar, commit, flip-test.**

---

## Tarea 2: El lote que entró

**Probar:** `tests/inventario/lotes.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("recibir un lote crea su evento de entrada, no un saldo", async () => {
  const l = await recibirLote(gestor, { materialId, batchLabel: "GAL-2026-07", quantity: 28, unit: "quintal", occurredAt: hoy });
  // El saldo NO es una columna. Si alguien la añade, esta prueba lo dice.
  expect(l).not.toHaveProperty("stock");
  const eventos = await prisma.consumableStockEvent.findMany({ where: { consumableLotId: l.id } });
  expect(eventos).toHaveLength(1);
  expect(eventos[0]!.eventType).toBe("received");
});

it("dos lotes del mismo material no se mezclan", async () => {
  // Dos sacos de gallinaza de proveedores distintos no son intercambiables
  // cuando algo sale mal.
  const a = await recibirLote(gestor, { materialId, batchLabel: "A", quantity: 10, unit: "quintal" });
  const b = await recibirLote(gestor, { materialId, batchLabel: "B", quantity: 5, unit: "quintal" });
  expect((await existencias(gestor, a.id)).quantity.toNumber()).toBe(10);
  expect((await existencias(gestor, b.id)).quantity.toNumber()).toBe(5);
});
```

- [ ] **Paso 2-4: verla fallar, el modelo, migración, verde, build, declarar,
      commit, flip-test.**

---

## Tarea 3: El libro mayor y el saldo derivado

**El corazón.** Copia la forma de `QuantityEvent` y `computeLotBalance`.

**Probar:** `tests/inventario/existencias.test.ts`

- [ ] **Paso 1: la prueba en rojo, con la distinción que lo justifica todo**

```ts
it("28 recibidos menos 3 gastados son 25", async () => {
  const l = await recibirLote(gestor, { materialId, batchLabel: "X", quantity: 28, unit: "quintal" });
  await registrarConsumo(operario, { consumableLotId: l.id, quantity: 3, unit: "quintal" });
  const e = await existencias(gestor, l.id);
  expect(e.quantity.toNumber()).toBe(25);
  expect(e.recorded).toBe(true);
});

it("un lote SIN ningún evento dice «nunca contado», NO cero", async () => {
  // ADR-080, copiado entero. «Nadie ha contado nunca» y «se contó y es cero»
  // son dos afirmaciones distintas sobre la finca, y confundirlas hace que el
  // sistema diga «no queda gallinaza» cuando nadie ha mirado el galpón.
  const l = await loteSinEventos();
  const e = await existencias(gestor, l.id);
  expect(e.recorded).toBe(false);
  expect(e.quantity.toNumber()).toBe(0);   // el número es cero…
  // …pero `recorded` es lo que la pantalla tiene que leer, no el número.
});

it("y un lote gastado ENTERO dice cero CONTADO", async () => {
  // El control positivo del anterior: sin él, «recorded false» pasaría también
  // en un sistema que nunca lo pone en true.
  const l = await recibirLote(gestor, { materialId, batchLabel: "Y", quantity: 5, unit: "quintal" });
  await registrarConsumo(operario, { consumableLotId: l.id, quantity: 5, unit: "quintal" });
  const e = await existencias(gestor, l.id);
  expect(e.recorded).toBe(true);
  expect(e.quantity.toNumber()).toBe(0);
});

it("mezclar unidades se rechaza", async () => {
  const l = await recibirLote(gestor, { materialId, batchLabel: "Z", quantity: 10, unit: "quintal" });
  await expect(registrarConsumo(operario, { consumableLotId: l.id, quantity: 1, unit: "gal" }))
    .rejects.toThrow(/unidad/);
});
```

- [ ] **Paso 2: verla fallar. Paso 3: el modelo y la derivación**

```prisma
/// El libro mayor: SÓLO SE AÑADE. Nada actualiza una fila; corregir es otro
/// evento. Misma forma que `QuantityEvent`, que lleva el café.
model ConsumableStockEvent {
  id String @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid

  consumableLotId String        @map("consumable_lot_id") @db.Uuid
  consumableLot   ConsumableLot @relation(fields: [consumableLotId], references: [id])

  eventType ConsumableStockEventType @map("event_type")
  quantity  Decimal                  @db.Decimal(10, 3)
  unit      String
  occurredAt DateTime                @map("occurred_at")

  /// Obligatoria en las reconciliaciones: cuadrar un negativo es una
  /// afirmación sobre lo que pasó, y una afirmación sin razón no se puede
  /// auditar. Lo impone un CHECK, no la interfaz.
  reason String?

  provenanceClass ProvenanceClass @map("provenance_class")

  @@index([consumableLotId, occurredAt])
  @@map("consumable_stock_event")
  @@schema("traceability")
}

enum ConsumableStockEventType {
  received
  consumed
  waste
  adjustment_increase
  adjustment_decrease

  @@schema("traceability")
}
```

```ts
export async function existencias(userAccountId: string, consumableLotId: string) {
  // …autorización…
  const eventos = await prisma.consumableStockEvent.findMany({ where: { consumableLotId } });

  // **`recorded` antes que el número**, igual que `computeLotBalance`: sin
  // ningún evento, «cero» sería una afirmación que nadie hizo.
  if (eventos.length === 0) return { quantity: new Prisma.Decimal(0), unit: null, recorded: false };

  const unidades = new Set(eventos.map((e) => e.unit));
  if (unidades.size > 1) throw new InventarioError("unidades_mezcladas");

  const suma = eventos.reduce((acc, e) => {
    const signo = e.eventType === "received" || e.eventType === "adjustment_increase" ? 1 : -1;
    return acc.add(e.quantity.mul(signo));
  }, new Prisma.Decimal(0));

  return { quantity: suma, unit: eventos[0]!.unit, recorded: true };
}
```

- [ ] **Paso 4: migración, verde, build, declarar, commit.**

- [ ] **Paso 5: flip-test doble.** Devolver `recorded: true` siempre y confirmar
      que cae «un lote SIN ningún evento dice nunca contado» por su nombre.
      Después, guardar el saldo en una columna y confirmar que cae la prueba de
      la Tarea 2 que lo prohíbe.

---

## Tarea 4: Lo negativo avisa y se cuadra, nunca se bloquea

**Probar:** `tests/inventario/negativo.test.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("gastar más de lo que hay SE REGISTRA — no se bloquea", async () => {
  // El guardia de la doctrina. Bloquearlo obligaría al operario a mentir en la
  // cantidad para poder seguir, y entonces el sistema sabría menos.
  const l = await recibirLote(gestor, { materialId, batchLabel: "N", quantity: 5, unit: "quintal" });
  const c = await registrarConsumo(operario, { consumableLotId: l.id, quantity: 8, unit: "quintal" });
  expect(c.id).toBeTruthy();
});

it("y el saldo queda NEGATIVO y visible, que es la pregunta", async () => {
  // Sin esta mitad, «se puede gastar de más» pasaría también en un sistema que
  // no lleva la cuenta.
  const e = await existencias(gestor, loteConsumidoDeMas);
  expect(e.quantity.toNumber()).toBe(-3);
  expect(e.requiereReconciliacion).toBe(true);
});

it("cuadrarlo es OTRO evento con su razón, no una edición", async () => {
  await reconciliar(gestor, { consumableLotId, quantity: 3, unit: "quintal", reason: "apareció un saco sin registrar" });
  const e = await existencias(gestor, consumableLotId);
  expect(e.quantity.toNumber()).toBe(0);
  expect(e.requiereReconciliacion).toBe(false);
  // Y el negativo SIGUE en la historia: nada se borró.
  expect(await prisma.consumableStockEvent.count({ where: { consumableLotId } })).toBe(3);
});

it("una reconciliación SIN razón se rechaza — lo impone la base", async () => {
  await expect(prisma.consumableStockEvent.create({ data: { ...ajusteSinRazon } }))
    .rejects.toThrow();
});
```

- [ ] **Paso 2-5: verla fallar, implementar con el CHECK en la migración, verde,
      build, declarar, commit, flip-test** — quitar el CHECK y confirmar que cae
      la última por su nombre.

---

## Tarea 5: Enganchar el consumo que ya se registra

**Archivos:** `prisma/schema.prisma`, `lib/traceability/operations.ts`

- [ ] **Paso 1: la prueba en rojo**

```ts
it("un consumo CON lote descuenta existencias", async () => {
  const l = await recibirLote(gestor, { materialId, batchLabel: "E", quantity: 10, unit: "quintal" });
  await recordMaterialConsumptionEntry(operario, {
    parent: { kind: "fieldSession", fieldSessionId },
    materialName: "Gallinaza", batchLabel: "E",
    consumableLotId: l.id, quantity: 2, unit: "quintal",
    provenanceClass: "direct_observation",
  });
  expect((await existencias(gestor, l.id)).quantity.toNumber()).toBe(8);
});

it("un consumo SIN lote sigue siendo válido y NO mueve existencias", async () => {
  // Anulable para siempre: las filas de hoy tienen texto libre y no se pueden
  // reasignar sin adivinar. Y obligar a elegir lote convertiría una anotación
  // de diez segundos en un trámite.
  const e = await recordMaterialConsumptionEntry(operario, {
    parent: { kind: "fieldSession", fieldSessionId },
    materialName: "Aserrín", batchLabel: "sin lote",
    provenanceClass: "direct_observation",
  });
  expect(e.id).toBeTruthy();
  expect(e.consumableLotId).toBeNull();
});

it("el descuento y el consumo van en la MISMA transacción", async () => {
  // Un consumo guardado sin su descuento seria material gastado que el
  // inventario no vio.
  await expect(consumoConLoteInvalido()).rejects.toThrow();
  expect((await existencias(gestor, loteIntacto)).quantity.toNumber()).toBe(10);
});
```

- [ ] **Paso 2-5: verla fallar, implementar, verde, build, commit, flip-test.**

---

## Tarea 6: Verlo

**Archivos:** una pantalla de inventario, `messages/{es,en}.json`

Qué materiales hay, qué lotes abiertos, cuánto queda **y cuáles dicen «nunca
contado»** — que es el estado que hay que poder ver de un vistazo. Y los que
piden reconciliación, arriba.

Respetando el permiso, con el molde del 2026-09-17: quien no puede, **lo ve y se
le dice por qué** no puede tocarlo.

- [ ] Prueba, implementación, paridad de claves, verde, build, commit.

---

## Compuerta final

```bash
npx tsc --noEmit && npm run build && bash scripts/ci.sh && bash scripts/ci-con-base.sh
```

Y los dos controles de siempre: correr los archivos de prueba nuevos **juntos** y
contar —`ci.sh` no nombra los que pasan—, y comprobar que ninguna prueba de base
se quedó sin declarar, con el control de que una hermética NO está en la lista.
