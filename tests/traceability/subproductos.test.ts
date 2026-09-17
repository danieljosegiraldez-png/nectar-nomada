/**
 * El destino de los subproductos de la trilla — Tarea 7 del plan.
 *
 * **La cascarilla NO es merma.** 100 kg de pergamino salen como ~80 de verde,
 * ~18 de cascarilla y ~2 de merma declarada. Contar la cascarilla como merma
 * inflaría la pérdida un 18 % en cada trilla y escondería la merma de verdad —
 * que es el número que de verdad dice si alguien pesó mal.
 *
 * Y la cascarilla **tiene destino**: se composta. La pulpa del despulpado irá
 * por el mismo camino, sin un segundo mecanismo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createLot, recordTransformation } from "../../lib/traceability/lots";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { crearSubproducto } from "../../lib/traceability/subproductos";
import { registrarTrilla } from "../../lib/traceability/trilla";
import { computeLotBalance } from "../../lib/traceability/balance";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `sub-${Date.now()}`;

let organizationId: string;
let projectId: string;
let locationId: string;
let operarioId: string;

async function pergamino(sufijo: string, kg: number) {
  const lot = await createLot(operarioId, {
    lotCode: `${RUN_ID}-${sufijo}`,
    lotType: "drying",
    organizationId,
    projectId,
    locationId,
  });
  await recordQuantityEvent(operarioId, {
    lotId: lot.id,
    eventType: "received",
    quantity: kg,
    unit: "kg",
    occurredAt: new Date("2026-04-01"),
    provenanceClass: "measured_fact",
  });
  return lot;
}

/** Una trilla de 100 kg: 80 de verde, 18 de cascarilla, 2 de merma. */
async function trillaDe100(sufijo: string) {
  const entrada = await pergamino(sufijo, 100);
  const { transformation } = await recordTransformation(operarioId, {
    transformationType: "hulling",
    occurredAt: new Date("2026-04-02"),
    provenanceClass: "original_record",
    inputs: [{ lotId: entrada.id, quantity: 100, unit: "kg" }],
    outputs: [{ lotCode: `${RUN_ID}-${sufijo}-verde`, lotType: "green", quantity: 80, unit: "kg" }],
    declaredLossQuantity: 2,
    declaredLossUnit: "kg",
    declaredLossReason: "merma de trilla, sin contar la cascarilla",
  });
  return { entrada, transformation };
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Subproductos (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  const loc = await prisma.location.create({
    data: { name: `TEST Beneficio (${RUN_ID})`, locationType: "site", classification: "internal", organizationId },
  });
  locationId = loc.id;

  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operario", displayName: `TEST Operario (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  operarioId = ua.id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: operarioId, roleProfileId: perfil.id, scopeId: scope.id } });
}, 30000);

afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const ids = lotes.map((l) => l.id);
  const trans = await prisma.lotTransformation.findMany({
    where: { inputs: { some: { lotId: { in: ids } } } }, select: { id: true },
  });
  const tIds = trans.map((t) => t.id);
  await prisma.byproductBatch.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: ids } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: operarioId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: operarioId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("el lote de subproducto", () => {
  it("una trilla produce su lote de cascarilla con destino compost", async () => {
    const { transformation } = await trillaDe100("cascarilla");
    const lote = await crearSubproducto(operarioId, {
      transformationId: transformation.id,
      byproductType: "CASCARILLA",
      destination: "COMPOST",
      massKg: 18,
      producedAtLocationId: locationId,
    });
    expect(lote.byproductType).toBe("CASCARILLA");
    expect(lote.destination).toBe("COMPOST");
    expect(Number(lote.massKg)).toBe(18);
  }, 20000);

  it("el subproducto NO es merma: la merma declarada son los 2 kg, no los 20", async () => {
    // El guardia de §B.2. Se afirma el valor EXACTO y se exige que exista:
    // `Number(x ?? 0) < 5` pasaría con la merma NULA, o sea con una trilla que
    // no declaró merma ninguna — justo el caso que hay que distinguir.
    const { transformation } = await trillaDe100("no-merma");
    await crearSubproducto(operarioId, {
      transformationId: transformation.id,
      byproductType: "CASCARILLA",
      destination: "COMPOST",
      massKg: 18,
      producedAtLocationId: locationId,
    });
    const t = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    expect(t.declaredLossQuantity).not.toBeNull();
    expect(Number(t.declaredLossQuantity)).toBe(2);
  }, 20000);

  it("la pulpa va por el mismo camino, sin un segundo mecanismo", async () => {
    // §C cierra `F1-002` sólo a medias —ninguna tarea conecta el despulpado—
    // pero el MECANISMO tiene que admitir pulpa desde el primer día, o el día
    // que se conecte habrá que inventar una tabla paralela.
    const { transformation } = await trillaDe100("pulpa");
    const lote = await crearSubproducto(operarioId, {
      transformationId: transformation.id,
      byproductType: "PULPA",
      destination: "COMPOST",
      massKg: 5,
      producedAtLocationId: locationId,
    });
    expect(lote.byproductType).toBe("PULPA");
  }, 20000);

  it("una masa negativa se rechaza — y el control positivo: cero es válido", async () => {
    // Cero es un dato: una trilla que no produjo cascarilla aprovechable. Un
    // negativo es un error de captura. Sin el control, «rechaza negativos»
    // pasaría también si rechazara todo.
    const { transformation } = await trillaDe100("negativa");
    await expect(
      crearSubproducto(operarioId, {
        transformationId: transformation.id,
        byproductType: "CASCARILLA",
        destination: "COMPOST",
        massKg: -1,
        producedAtLocationId: locationId,
      }),
    ).rejects.toThrow(/masa/i);
    const cero = await crearSubproducto(operarioId, {
      transformationId: transformation.id,
      byproductType: "CASCARILLA",
      destination: "COMPOST",
      massKg: 0,
      producedAtLocationId: locationId,
    });
    expect(Number(cero.massKg)).toBe(0);
  }, 20000);
});

/**
 * Registrar una trilla de punta a punta — Tarea 8 del plan.
 *
 * Una entrada, tres salidas, **una sola transacción**: el lote verde, el lote
 * de cascarilla y la merma declarada. Y los 18 kg de cascarilla tienen que
 * ENTRAR EN EL BALANCE, o saldrían como inexplicados — el mismo hueco del 18 %
 * que la Tarea 5 existe para evitar, entrando por la otra puerta.
 */
describe("registrar una trilla", () => {
  it("100 kg de pergamino producen el verde, la cascarilla y la merma", async () => {
    const entrada = await pergamino("e2e", 100);
    const r = await registrarTrilla(operarioId, {
      lotePergaminoId: entrada.id,
      masaEntradaKg: 100,
      loteVerde: { lotCode: `${RUN_ID}-e2e-verde`, masaKg: 80 },
      cascarillaKg: 18,
      mermaKg: 2,
      producedAtLocationId: locationId,
      occurredAt: new Date("2026-04-10"),
      provenanceClass: "original_record",
    });
    expect(r.transformacion.transformationType).toBe("hulling");
    expect(Number(r.subproducto.massKg)).toBe(18);
    expect(Number(r.transformacion.declaredLossQuantity)).toBe(2);
  }, 20000);

  it("los 18 kg de cascarilla NO salen como inexplicados", async () => {
    const entrada = await pergamino("balance", 100);
    await registrarTrilla(operarioId, {
      lotePergaminoId: entrada.id,
      masaEntradaKg: 100,
      loteVerde: { lotCode: `${RUN_ID}-balance-verde`, masaKg: 80 },
      cascarillaKg: 18,
      mermaKg: 2,
      producedAtLocationId: locationId,
      occurredAt: new Date("2026-04-11"),
      provenanceClass: "original_record",
    });
    // Se lee de la TRANSFORMACIÓN, que es donde se persiste lo inexplicado.
    // `LotBalance` no lo lleva: sólo dice cuánto queda en el lote.
    const t = await prisma.lotTransformation.findFirstOrThrow({
      where: { transformationType: "hulling", inputs: { some: { lotId: entrada.id } } },
    });
    expect(Number(t.unexplainedQuantity ?? 0)).toBe(0);
  }, 20000);

  it("y el CONTROL: sin declarar la cascarilla, el hueco del 18 % sí aparece", async () => {
    // Sin este control, la prueba de arriba pasaría también en un sistema que
    // nunca calcula inexplicados — daría 0 por no mirar.
    //
    // Y fíjate en QUÉ hace el sistema con el hueco: **no rechaza la trilla,
    // levanta una `Deviation`**. Avisa y no bloquea, igual que todo lo demás.
    // Mi primera versión de esta prueba esperaba un `throw` y estaba mal: era
    // la prueba la equivocada, no el código.
    const entrada = await pergamino("control-hueco", 100);
    const r = await registrarTrilla(operarioId, {
      lotePergaminoId: entrada.id,
      masaEntradaKg: 100,
      loteVerde: { lotCode: `${RUN_ID}-control-hueco-verde`, masaKg: 80 },
      cascarillaKg: 0,
      mermaKg: 2,
      producedAtLocationId: locationId,
      occurredAt: new Date("2026-04-12"),
      provenanceClass: "original_record",
    });
    expect(Number(r.transformacion.unexplainedQuantity)).toBe(18);
    const desvios = await prisma.deviation.count({
      where: { lotTransformationId: r.transformacion.id, severity: "mass_balance" },
    });
    expect(desvios).toBe(1);
  }, 20000);

  it("si falla el subproducto, la trilla ENTERA se revierte", async () => {
    // Atomicidad. Una trilla a medias dejaria el pergamino descontado sin el
    // verde creado: material desaparecido del libro mayor. El error se INDUCE
    // y se NOMBRA — un `rejects.toThrow()` pelado aceptaria cualquier fallo
    // anterior a la escritura, y entonces «el lote sigue intacto» no demuestra
    // rollback, demuestra que nunca se empezó.
    const entrada = await pergamino("atomica", 100);
    await expect(
      registrarTrilla(operarioId, {
        lotePergaminoId: entrada.id,
        masaEntradaKg: 100,
        loteVerde: { lotCode: `${RUN_ID}-atomica-verde`, masaKg: 80 },
        cascarillaKg: -18,
        mermaKg: 2,
        producedAtLocationId: locationId,
        occurredAt: new Date("2026-04-13"),
        provenanceClass: "original_record",
      }),
    ).rejects.toThrow(/masa/i);

    // Y NADA parcial sobrevivió.
    const balance = await computeLotBalance(prisma, entrada.id);
    expect(balance.quantity.toNumber()).toBe(100);
    expect(await prisma.lot.count({ where: { lotCode: `${RUN_ID}-atomica-verde` } })).toBe(0);
    expect(await prisma.lotTransformation.count({
      where: { transformationType: "hulling", inputs: { some: { lotId: entrada.id } } },
    })).toBe(0);
  }, 20000);
});
