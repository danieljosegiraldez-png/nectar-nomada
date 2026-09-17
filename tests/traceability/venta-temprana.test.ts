/**
 * **Una venta temprana SE REGISTRA.** Tarea 10, y es el guardia que las otras
 * nueve no dan.
 *
 * `tests/beneficio/reposo.test.ts` afirma la FORMA del resultado del evaluador
 * —sus cuatro claves, sin ninguna puerta— y eso guarda contra añadir un
 * `bloquea` AL EVALUADOR. **No guarda contra que otro sitio bloquee.** Alguien
 * puede dejar `evaluarReposo` intacto y meter el `throw` en el camino de venta,
 * y las siete pruebas de allí seguirían verdes. Una comprobación sobre la forma
 * de un objeto no dice nada sobre lo que hace el sistema.
 *
 * Por eso este guardia es de extremo a extremo y vive donde ocurre la venta.
 *
 * **Y lleva flip-test obligatorio.** El día que se escribe, todo está en verde
 * porque hoy nada bloquea — y el verde es la única respuesta que se ha visto.
 * Sin meter el `throw` a mano y verla caer, esta prueba es un adorno.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { faseDelLote } from "../../lib/beneficio/reposo";
import { veredictoDelLote, type VeredictoDeFase } from "../../lib/beneficio/desdeElLote";
import { createLot, recordTransformation } from "../../lib/traceability/lots";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { endDryingRun, startDryingRun } from "../../lib/traceability/drying";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `vt-${Date.now()}`;
const AHORA = new Date();
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

let organizationId: string;
let projectId: string;
let operarioId: string;

/**
 * Un lote que salió de secado hace `dias`, con objetivo alcanzado. Devuelve el
 * lote verde resultante, que es el que se vende.
 */
async function loteConReposoDe(dias: number, sufijo: string) {
  const pergamino = await createLot(operarioId, {
    lotCode: `${RUN_ID}-${sufijo}`,
    lotType: "drying",
    organizationId,
    projectId,
  });
  await recordQuantityEvent(operarioId, {
    lotId: pergamino.id,
    eventType: "received",
    quantity: 100,
    unit: "kg",
    occurredAt: haceDias(dias + 20),
    provenanceClass: "measured_fact",
  });
  const { run } = await startDryingRun(operarioId, {
    provenanceClass: "original_record",
    lotId: pergamino.id,
    method: "raised_bed",
    startedAt: haceDias(dias + 15),
    quantity: 100,
    unit: "kg",
  });
  const { run: cerrado, outputLot } = await endDryingRun(operarioId, {
    provenanceClass: "original_record",
    dryingRunId: run.id,
    endedAt: haceDias(dias),
    endedOutcome: "target_reached",
    outputLotCode: `${RUN_ID}-${sufijo}-verde`,
    outputLotType: "green",
    quantity: 80,
    unit: "kg",
  });
  return { verde: outputLot, secado: cerrado };
}

/** Lo que la pantalla enseñaría de ese lote, por el mismo camino que ella usa. */
function estadoDeReposo(secado: { endedAt: Date | null; endedOutcome: string | null }) {
  const fase = faseDelLote({
    fermentacionAbierta: null,
    secadoAbierto: null,
    ultimoSecadoTerminado: secado.endedAt ? { endedAt: secado.endedAt, endedOutcome: secado.endedOutcome } : null,
  });
  return veredictoDelLote({ fase, gradoDeProceso: "Washed", mediciones: [], ahora: AHORA });
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Venta temprana (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Vendedor", displayName: `TEST Vendedor (${RUN_ID})`, locale: "es" },
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
    where: { OR: [{ inputs: { some: { lotId: { in: ids } } } }, { outputs: { some: { lotId: { in: ids } } } }] },
    select: { id: true, dryingRunId: true },
  });
  const tIds = trans.map((t) => t.id);
  const runIds = [...new Set(trans.map((t) => t.dryingRunId).filter((x): x is string => x != null))];
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ids, ...runIds] } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: ids } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: runIds } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: operarioId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: operarioId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("vender temprano", () => {
  it("un lote con 10 días de reposo SE PUEDE vender", async () => {
    const { verde } = await loteConReposoDe(10, "temprana");
    const { transformation } = await recordTransformation(operarioId, {
      transformationType: "sale",
      occurredAt: AHORA,
      provenanceClass: "original_record",
      inputs: [{ lotId: verde.id }],
      outputs: [],
    });
    // Se registró. La venta temprana NO está bloqueada, y esa es la doctrina:
    // bloquear se esquiva en el patio, y entonces el sistema sabe menos.
    expect(transformation.transformationType).toBe("sale");
  }, 30000);

  it("y el aviso sale igualmente — la otra mitad, sin la cual esto no vale", async () => {
    // Sin esto, «se puede vender» pasaría también en un sistema que no avisa de
    // nada: el fallo contrario, e igual de malo. «Se puede» y «está en plazo»
    // son hechos distintos y los dos tienen que llegar a la pantalla.
    const { secado } = await loteConReposoDe(10, "aviso");
    const v = estadoDeReposo(secado) as VeredictoDeFase;
    expect(v.reposo?.venta).toBe("TEMPRANA");
    expect(v.reposo?.diasDeReposo).toBe(10);
  }, 30000);

  it("un lote con 90 días se vende y NO avisa", async () => {
    const { verde, secado } = await loteConReposoDe(90, "madura");
    const { transformation } = await recordTransformation(operarioId, {
      transformationType: "sale",
      occurredAt: AHORA,
      provenanceClass: "original_record",
      inputs: [{ lotId: verde.id }],
      outputs: [],
    });
    expect(transformation.transformationType).toBe("sale");
    const v = estadoDeReposo(secado) as VeredictoDeFase;
    expect(v.reposo?.venta).toBe("EN_PLAZO");
  }, 30000);
});
