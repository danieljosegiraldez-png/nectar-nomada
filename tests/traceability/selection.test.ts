/**
 * P3 (docs/implementation/44_P3_SELECTION.md §7). Real Postgres,
 * RUN_ID-scoped fixtures.
 *
 * This is the first real consumer of ADR-094's reconciliation path, so the
 * tolerance and override cases matter as much as the material ones: selection
 * is the operation where an out-of-balance figure means someone mis-weighed,
 * not that coffee legitimately lost mass.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createLot, getLotLineage, recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { recordSelection, getSelectionOutturn, SelectionValidationError } from "../../lib/traceability/selection";
import { conservesMass } from "../../lib/traceability/balance";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { recordGreenGrading } from "../../lib/traceability/greenGrading";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p3-${Date.now()}`;

let organizationId: string;
let projectId: string;
let locationId: string;
let operatorUserAccountId: string;
let adminUserAccountId: string;
let flotacionId: string;
let flotadoresId: string;
let verdeId: string;
let cultivarValueId: string;

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return account.id;
}

async function assign(userAccountId: string, profileName: string, scope: { scopeType: "project" | "platform"; scopeRefId: string | null }) {
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: profileName } });
  const scopeRow =
    (await prisma.scope.findFirst({ where: { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId } })) ??
    (await prisma.scope.create({ data: { scopeType: scope.scopeType, scopeRefId: scope.scopeRefId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId: scopeRow.id } });
}

async function catalogValue(value: string, catalogKey: string) {
  const row = await prisma.variableCatalogValue.findFirstOrThrow({ where: { value, catalog: { key: catalogKey } } });
  return row.id;
}

/** A cherry lot with a seeded ledger — every selection needs one. */
async function cherryLot(code: string, kg: number) {
  const lot = await createLot(operatorUserAccountId, {
    lotCode: `${RUN_ID}-${code}`,
    lotType: "cherry",
    organizationId,
    projectId,
    locationId,
  });
  await recordQuantityEvent(operatorUserAccountId, {
    lotId: lot.id,
    eventType: "received",
    quantity: kg,
    unit: "kg",
    occurredAt: new Date(),
    provenanceClass: "measured_fact",
  });
  return lot;
}

async function greenLot(code: string, kg: number) {
  const lot = await createLot(operatorUserAccountId, {
    lotCode: `${RUN_ID}-${code}`, lotType: "green", organizationId, projectId, locationId,
  });
  await recordQuantityEvent(operatorUserAccountId, {
    lotId: lot.id, eventType: "received", quantity: kg, unit: "kg",
    occurredAt: new Date(), provenanceClass: "measured_fact",
  });
  return lot;
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({
    data: { name: `TEST Project (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = project.id;

  const location = await prisma.location.create({
    data: { locationType: "site", name: `TEST Beneficio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  operatorUserAccountId = await createTestUserAccount("Operator");
  await assign(operatorUserAccountId, "Farm Operator", { scopeType: "project", scopeRefId: projectId });

  adminUserAccountId = await createTestUserAccount("Admin");
  await assign(adminUserAccountId, "Platform Admin", { scopeType: "platform", scopeRefId: null });

  flotacionId = await catalogValue("flotacion", "seleccion_metodo");
  flotadoresId = await catalogValue("flotadores", "rechazo_categoria");
  verdeId = await catalogValue("cereza_verde", "rechazo_categoria");
  cultivarValueId = await catalogValue("Caturra", "cultivar");
});

afterAll(async () => {
  const lots = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } }, select: { id: true } });
  const lotIds = lots.map((l) => l.id);
  const transformationIds = (
    await prisma.lotTransformation.findMany({
      where: { OR: [{ inputs: { some: { lotId: { in: lotIds } } } }, { outputs: { some: { lotId: { in: lotIds } } } }] },
      select: { id: true },
    })
  ).map((t) => t.id);
  const deviationIds = (
    await prisma.deviation.findMany({ where: { lotTransformationId: { in: transformationIds } }, select: { id: true } })
  ).map((d) => d.id);

  await prisma.correctiveAction.deleteMany({ where: assertDefinedWhere({ deviationId: { in: deviationIds } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ id: { in: deviationIds } }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotIds } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformationIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformationIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotIds } }) });

  const userIds = [operatorUserAccountId, adminUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("selection conserves mass", () => {
  it("separa varias mallas verdes y conserva sus datos y balance", async () => {
    const source = await greenLot("green-screen", 10);
    const result = await recordGreenGrading(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantityKg: 10,
      fractions: [
        { lotCode: `${RUN_ID}-screen-17-18`, quantityKg: 6, screenMin: 17, screenMax: 18, screenSystem: "international_round_screen", screenStatus: "measured", uniformityPct: 94 },
        { lotCode: `${RUN_ID}-screen-15-16`, quantityKg: 3, screenMin: 15, screenMax: 16, screenSystem: "international_round_screen", screenStatus: "measured" },
      ],
      defectLots: [{ lotCode: `${RUN_ID}-green-defects`, quantityKg: 0.8, rejectionCategoryValueId: flotadoresId }],
      declaredLossKg: 0.2,
      occurredAt: new Date(), provenanceClass: "measured_fact",
    });

    expect(result.reconciliation?.unexplained?.toNumber()).toBe(0);
    const large = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN_ID}-screen-17-18` } });
    expect([large.greenScreenMin, large.greenScreenMax, Number(large.greenUniformityPct)]).toEqual([17, 18, 94]);
    expect(large.greenScreenStatus).toBe("measured");
  });

  it("is registered as a conserving type", () => {
    // The load-bearing line of the whole ticket.
    expect(conservesMass("selection")).toBe(true);
  });

  it("reconciles accepted + rejected + declared loss against the input", async () => {
    const source = await cherryLot("balanced", 186.4);

    const { transformation } = await recordSelection(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 186.4,
      unit: "kg",
      selectionMethodValueId: flotacionId,
      // La flotación moja la cereza, así que desde la pieza 3 hay que declarar cómo se pesó
      // (spec de la recepción a los lotes §3.4). Sin esto, `condicion_de_pesaje_obligatoria`.
      condicionDePesaje: "DRAINED",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-balanced-ok`, lotType: "cherry", quantity: 171.8 },
      rejected: [
        { lotCode: `${RUN_ID}-balanced-flot`, lotType: "cherry", quantity: 8.7, rejectionCategoryValueId: flotadoresId },
        { lotCode: `${RUN_ID}-balanced-verde`, lotType: "cherry", quantity: 3.4, rejectionCategoryValueId: verdeId },
      ],
      declaredLossQuantity: 2.5,
      declaredLossReason: "Manipulación",
    });

    const stored = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    // 186.4 − (171.8 + 8.7 + 3.4) − 2.5 = 0
    expect(Number(stored.unexplainedQuantity)).toBe(0);
    expect(await prisma.deviation.count({ where: { lotTransformationId: transformation.id } })).toBe(0);

    const inputAfter = await computeCurrentQuantity(operatorUserAccountId, source.id);
    expect(inputAfter.quantity.toNumber()).toBe(0);
    expect(inputAfter.recorded).toBe(true);
  });

  it("raises exactly one Deviation when the streams do not add up", async () => {
    const source = await cherryLot("gap", 100);

    const { transformation } = await recordSelection(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 100,
      unit: "kg",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-gap-ok`, lotType: "cherry", quantity: 75 },
      rejected: [{ lotCode: `${RUN_ID}-gap-flot`, lotType: "cherry", quantity: 5, rejectionCategoryValueId: flotadoresId }],
    });

    const stored = await prisma.lotTransformation.findUniqueOrThrow({ where: { id: transformation.id } });
    expect(Number(stored.unexplainedQuantity)).toBe(20);

    const deviations = await prisma.deviation.findMany({ where: { lotTransformationId: transformation.id } });
    expect(deviations).toHaveLength(1);
    expect(deviations[0]!.severity).toBe("mass_balance");
    // Recorded regardless — a field tool that refuses real data goes back to paper.
    expect(transformation.id).toBeTruthy();
  });
});

describe("rejected material is real material", () => {
  it("creates a queryable Lot per rejection stream, carrying its category", async () => {
    const source = await cherryLot("streams", 50);

    const { outputLots } = await recordSelection(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 50,
      unit: "kg",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-streams-ok`, lotType: "cherry", quantity: 45 },
      rejected: [{ lotCode: `${RUN_ID}-streams-flot`, lotType: "cherry", quantity: 5, rejectionCategoryValueId: flotadoresId }],
    });

    const floaters = await prisma.lot.findFirstOrThrow({
      where: { lotCode: `${RUN_ID}-streams-flot` },
      include: { rejectionCategoryValue: true },
    });
    expect(floaters.rejectionCategoryValue?.value).toBe("flotadores");
    // The stage stays physically accurate — floaters are still cherry.
    expect(floaters.lotType).toBe("cherry");

    const accepted = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN_ID}-streams-ok` } });
    expect(accepted.rejectionCategoryValueId).toBeNull();
    expect(outputLots).toHaveLength(2);
  });

  it("lets a rejected lot be stored and sold — not every rejection is waste", async () => {
    const source = await cherryLot("sellable", 100);
    await recordSelection(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 100,
      unit: "kg",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-sellable-ok`, lotType: "cherry", quantity: 90 },
      rejected: [{ lotCode: `${RUN_ID}-sellable-flot`, lotType: "cherry", quantity: 10, rejectionCategoryValueId: flotadoresId }],
    });

    const floaters = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN_ID}-sellable-flot` } });

    // Storable...
    const assignment = await moveLotToStorage(operatorUserAccountId, {
      lotId: floaters.id,
      locationId,
      startedAt: new Date(),
    });
    expect(assignment.lotId).toBe(floaters.id);

    // ...and sellable through the ordinary transformation path.
    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "sale",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: floaters.id }],
      outputs: [],
    });
    expect(transformation.transformationType).toBe("sale");
    const afterSale = await computeCurrentQuantity(operatorUserAccountId, floaters.id);
    expect(afterSale.quantity.toNumber()).toBe(0);
  });

  it("keeps a floater lot's lineage back to the original cherry", async () => {
    const source = await cherryLot("lineage", 30);
    await recordSelection(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 30,
      unit: "kg",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-lineage-ok`, lotType: "cherry", quantity: 27 },
      rejected: [{ lotCode: `${RUN_ID}-lineage-flot`, lotType: "cherry", quantity: 3, rejectionCategoryValueId: flotadoresId }],
    });

    const floaters = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN_ID}-lineage-flot` } });
    const lineage = await getLotLineage(operatorUserAccountId, floaters.id);
    expect(lineage.ancestorLotIds).toContain(source.id);
  });
});

describe("validation", () => {
  it("refuses a rejected output with no category", async () => {
    const source = await cherryLot("nocat", 20);
    await expect(
      recordSelection(operatorUserAccountId, {
        inputLotId: source.id,
        inputQuantity: 20,
        unit: "kg",
        occurredAt: new Date(),
        provenanceClass: "measured_fact",
        accepted: { lotCode: `${RUN_ID}-nocat-ok`, lotType: "cherry", quantity: 18 },
        rejected: [{ lotCode: `${RUN_ID}-nocat-r`, lotType: "cherry", quantity: 2, rejectionCategoryValueId: "" }],
      }),
    ).rejects.toThrow(SelectionValidationError);
  });

  it("refuses a category from the wrong catalog", async () => {
    const source = await cherryLot("wrongcat", 20);
    await expect(
      recordSelection(operatorUserAccountId, {
        inputLotId: source.id,
        inputQuantity: 20,
        unit: "kg",
        occurredAt: new Date(),
        provenanceClass: "measured_fact",
        accepted: { lotCode: `${RUN_ID}-wrongcat-ok`, lotType: "cherry", quantity: 18 },
        // A cultivar is not a rejection reason.
        rejected: [{ lotCode: `${RUN_ID}-wrongcat-r`, lotType: "cherry", quantity: 2, rejectionCategoryValueId: cultivarValueId }],
      }),
    ).rejects.toThrow(SelectionValidationError);
  });

  it("refuses a selection with no input quantity — the outturn is the point", async () => {
    const source = await cherryLot("noqty", 20);
    await expect(
      recordSelection(operatorUserAccountId, {
        inputLotId: source.id,
        inputQuantity: 0,
        unit: "kg",
        occurredAt: new Date(),
        provenanceClass: "measured_fact",
        accepted: { lotCode: `${RUN_ID}-noqty-ok`, lotType: "cherry", quantity: 18 },
        rejected: [],
      }),
    ).rejects.toThrow(SelectionValidationError);
  });

  it("refuses duplicate output lot codes within one selection", async () => {
    const source = await cherryLot("dup", 20);
    await expect(
      recordSelection(operatorUserAccountId, {
        inputLotId: source.id,
        inputQuantity: 20,
        unit: "kg",
        occurredAt: new Date(),
        provenanceClass: "measured_fact",
        accepted: { lotCode: `${RUN_ID}-dup-same`, lotType: "cherry", quantity: 18 },
        rejected: [{ lotCode: `${RUN_ID}-dup-same`, lotType: "cherry", quantity: 2, rejectionCategoryValueId: flotadoresId }],
      }),
    ).rejects.toThrow(SelectionValidationError);
  });
});

describe("lot:override_balance", () => {
  it("denies a Farm Operator accepting an out-of-tolerance selection", async () => {
    const source = await cherryLot("ovr-denied", 100);
    await expect(
      recordSelection(operatorUserAccountId, {
        inputLotId: source.id,
        inputQuantity: 100,
        unit: "kg",
        occurredAt: new Date(),
        provenanceClass: "measured_fact",
        accepted: { lotCode: `${RUN_ID}-ovr-denied-ok`, lotType: "cherry", quantity: 70 },
        rejected: [],
        acceptUnexplained: { reason: "Balanza descalibrada" },
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("lets a Platform Admin accept it, recording the reason", async () => {
    const source = await cherryLot("ovr-ok", 100);
    const { transformation } = await recordSelection(adminUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 100,
      unit: "kg",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-ovr-ok-ok`, lotType: "cherry", quantity: 70 },
      rejected: [],
      acceptUnexplained: { reason: "Romana verificada contra patrón" },
    });

    const deviation = await prisma.deviation.findFirstOrThrow({ where: { lotTransformationId: transformation.id } });
    const actions = await prisma.correctiveAction.findMany({ where: { deviationId: deviation.id } });
    expect(actions).toHaveLength(1);
    expect(actions[0]!.actionText).toContain("Romana verificada");
  });
});

describe("outturn", () => {
  it("reports each stream's share of the input, computed not stored", async () => {
    const source = await cherryLot("outturn", 200);
    const { transformation } = await recordSelection(operatorUserAccountId, {
      inputLotId: source.id,
      inputQuantity: 200,
      unit: "kg",
      selectionMethodValueId: flotacionId,
      // La flotación moja la cereza, así que desde la pieza 3 hay que declarar cómo se pesó
      // (spec de la recepción a los lotes §3.4). Sin esto, `condicion_de_pesaje_obligatoria`.
      condicionDePesaje: "DRAINED",
      equipmentNote: "Tanque de flotación 2",
      occurredAt: new Date(),
      provenanceClass: "measured_fact",
      accepted: { lotCode: `${RUN_ID}-outturn-ok`, lotType: "cherry", quantity: 180 },
      rejected: [{ lotCode: `${RUN_ID}-outturn-flot`, lotType: "cherry", quantity: 20, rejectionCategoryValueId: flotadoresId }],
    });

    const outturn = await getSelectionOutturn(transformation.id);
    expect(outturn.method).toBe("flotacion");
    expect(outturn.equipmentNote).toBe("Tanque de flotación 2");
    expect(outturn.inputTotal).toBe(200);
    expect(outturn.accepted[0]!.sharePct).toBe(90);
    expect(outturn.rejected[0]!.sharePct).toBe(10);
    expect(outturn.rejected[0]!.rejectionCategory).toBe("flotadores");
    expect(outturn.unexplainedQuantity).toBe(0);
  });

  it("refuses to report outturn for a transformation that is not a selection", async () => {
    const source = await cherryLot("notsel", 10);
    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "stage_change",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: source.id }],
      outputs: [{ lotCode: `${RUN_ID}-notsel-out`, lotType: "processing", quantity: 9, unit: "kg" }],
    });
    await expect(getSelectionOutturn(transformation.id)).rejects.toThrow(SelectionValidationError);
  });
});

/**
 * §B.3 del spec de reposo y trilla: **la trilla es OPCIONAL.**
 *
 * «Depende el arreglo»: el café se vende verde, en pergamino o tostado. Un lote
 * vendido en pergamino **nunca se trilla**, así que ninguna etapa posterior
 * puede exigir una trilla como precondición, y el café verde tiene UN origen
 * posible, no uno obligatorio.
 *
 * Es fácil de romper sin darse cuenta el día que alguien escriba «para vender
 * verde hace falta una trilla» — y entonces el pergamino deja de poder
 * venderse, que es la mitad del negocio.
 */
describe("la trilla nunca es precondición", () => {
  it("un lote SIN trilla se vende igual", async () => {
    const pergamino = await cherryLot("sin-trilla", 60);
    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "sale",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: pergamino.id }],
      outputs: [],
    });
    expect(transformation.transformationType).toBe("sale");
  });

  it("y un lote CON trilla también — el control positivo", async () => {
    // Sin esta mitad, una venta rota para todos haría pasar la de arriba por la
    // razón equivocada. Aquí el lote pasa por una trilla ANTES de venderse.
    const pergamino = await cherryLot("con-trilla", 100);
    const { transformation: trilla } = await recordTransformation(operatorUserAccountId, {
      transformationType: "hulling",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: pergamino.id, quantity: 100, unit: "kg" }],
      outputs: [
        {
          // Una salida hereda organización, proyecto y ubicación del lote de
          // entrada: no se repiten aquí, y el tipo no las admite.
          lotCode: `${RUN_ID}-con-trilla-verde`,
          lotType: "green",
          quantity: 80,
          unit: "kg",
        },
      ],
      declaredLossQuantity: 20,
      declaredLossUnit: "kg",
      declaredLossReason: "cascarilla y merma — sin subproducto todavía (Tarea 7)",
    });
    expect(trilla.transformationType).toBe("hulling");

    const verde = await prisma.lot.findFirstOrThrow({ where: { lotCode: `${RUN_ID}-con-trilla-verde` } });
    const { transformation: venta } = await recordTransformation(operatorUserAccountId, {
      transformationType: "sale",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: verde.id }],
      outputs: [],
    });
    expect(venta.transformationType).toBe("sale");
  });
});

/**
 * §B.1: **la trilla no es una máquina, es un arreglo.**
 *
 * Finca Rosina / beneficio Las Nubes NO tiene trilladora. Se trilla de tres
 * formas: en Cafelino, en Kiva Estate, o a mano con mazo y pilón en Las Nubes.
 * **Dos de las tres ocurren fuera del control del dueño**, así que la
 * transformación tiene que declarar quién la hizo, dónde, y cuándo salió y
 * volvió el material.
 *
 * No es una tabla nueva: son columnas sobre la transformación que ya existe,
 * igual que `dryingRunId` cuelga de ella. Un `HullingRun` paralelo duplicaría
 * lo que `LotTransformation` ya hace.
 */
describe("la custodia de una trilla que ocurre fuera", () => {
  it("una trilla en Cafelino declara quién la hizo y cuándo volvió", async () => {
    const pergamino = await cherryLot("custodia", 100);
    const salida = new Date("2026-05-01T08:00:00Z");
    const vuelta = new Date("2026-05-03T17:00:00Z");

    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "hulling",
      occurredAt: vuelta,
      provenanceClass: "original_record",
      performedByOrganizationId: organizationId,
      performedAtLocationId: locationId,
      custodyOut: salida,
      custodyIn: vuelta,
      inputs: [{ lotId: pergamino.id, quantity: 100, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-custodia-verde`, lotType: "green", quantity: 80, unit: "kg" }],
      declaredLossQuantity: 20,
      declaredLossUnit: "kg",
      declaredLossReason: "cascarilla y merma",
    });

    expect(transformation.performedByOrganizationId).toBe(organizationId);
    expect(transformation.performedAtLocationId).toBe(locationId);
    expect(transformation.custodyIn!.getTime()).toBeGreaterThan(transformation.custodyOut!.getTime());
  });

  it("una trilla a mano en la propia finca no necesita custodia, y sigue siendo válida", async () => {
    // Control del «avisa, no bloquea»: mazo y pilón en Las Nubes es UNA DE LAS
    // TRES formas reales. Si esta prueba cae, alguien hizo obligatoria la
    // custodia y acaba de prohibir la forma que se usa en la propia finca.
    const pergamino = await cherryLot("custodia-mano", 50);
    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "hulling",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      inputs: [{ lotId: pergamino.id, quantity: 50, unit: "kg" }],
      outputs: [{ lotCode: `${RUN_ID}-custodia-mano-verde`, lotType: "green", quantity: 40, unit: "kg" }],
      declaredLossQuantity: 10,
      declaredLossUnit: "kg",
      declaredLossReason: "cascarilla y merma",
    });
    expect(transformation.id).toBeTruthy();
    expect(transformation.custodyOut).toBeNull();
    expect(transformation.custodyIn).toBeNull();
    expect(transformation.performedByOrganizationId).toBeNull();
  });

  it("la custodia no es exclusiva de la trilla — cualquier transformación puede salir de la finca", async () => {
    // Las columnas van sobre `LotTransformation`, no sobre un tipo concreto.
    // Mañana un tueste puede hacerse fuera igual que una trilla, y este guardia
    // impide que alguien las ate a `hulling` por comodidad.
    const lote = await cherryLot("custodia-venta", 30);
    const { transformation } = await recordTransformation(operatorUserAccountId, {
      transformationType: "sale",
      occurredAt: new Date(),
      provenanceClass: "original_record",
      performedAtLocationId: locationId,
      inputs: [{ lotId: lote.id }],
      outputs: [],
    });
    expect(transformation.performedAtLocationId).toBe(locationId);
  });
});
