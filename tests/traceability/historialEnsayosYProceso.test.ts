/**
 * El «Historial» del lote incluye sus ENSAYOS y el PROCESO QUE LO CUBRE.
 * Decisiones de Daniel del 2026-10-12, `PENDING_IMPLEMENTATIONS/023`.
 *
 * Hasta ese día `getLotDetail` dejaba fuera, con su cifra, dos familias de auditoría:
 * - `treatment_batch` (y sus etapas, `processing_stage`): la historia de un ensayo sobre el lote.
 *   Decisión: entra, **sólo para quien puede ver investigación** sobre ese ensayo. El Farm Operator
 *   no tiene `research:view`, y la ficha del lote no puede ser una puerta trasera a esos datos.
 * - `lot_process` (y `lot_process_intervention`, `lot_process_return`): el proceso se abre sobre la
 *   cereza y CUBRE a los lotes que salen de ella. Decisión: entra **toda la cadena** que devuelve
 *   `procesoQueCubre`, aunque se abriera en un lote de origen. Preguntarlo por `lotId` perdería la
 *   primera generación, que es lo que `tests/arquitectura/proceso-por-el-resolvedor.test.ts` prohíbe.
 *
 * **El montaje imita `bodegaConProceso.test.ts`:** el proceso se abre sobre la cereza A con una fecha
 * anterior a la transformación que saca B, así que lo que se pide es la ficha de B y el proceso es de A.
 *
 * **Las filas, y ninguna sobra:**
 * - el gerente (`research:view`) ve en B el proceso de A, su intervención, el ensayo y su etapa;
 * - el operario (sin `research:view`) ve el proceso y la intervención, y NO el ensayo ni su etapa;
 * - *control negativo*: un proceso de un lote ajeno, sin parentesco, no aparece en B;
 * - *control positivo*: las filas existen en la tabla, para que un «no aparece» no se lea como «no se escribió».
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createLot, getLotDetail, recordTransformation } from "../../lib/traceability/lots";
import { registrarIntervencion } from "../../lib/traceability/lotProcess";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `histep-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

let projectId: string;
let gerente: string;
let operario: string;
let loteB: string;
let procesoDeA: string;
let intervencion: string;
let ensayo: string;
let etapa: string;
let procesoAjeno: string;

async function cuenta(nombre: string, perfil: string, scopeId: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `${MARCA} ${nombre}`, locale: "es" },
  });
  const id = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  const rol = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  await prisma.assignment.create({ data: { userAccountId: id, roleProfileId: rol.id, scopeId } });
  return id;
}

const tipos = async (quien: string) => new Set((await getLotDetail(quien, loteB)).auditEvents.map((e) => `${e.entityType}:${e.entityId}`));

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  projectId = (await prisma.project.create({ data: { name: `${MARCA} proyecto`, status: "approved", classification: "internal" } })).id;
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  gerente = await cuenta("Gerente", "Farm Manager", scope.id);
  operario = await cuenta("Operario", "Farm Operator", scope.id);

  const loteA = (await createLot(gerente, { lotCode: `${RUN_ID}-A`, lotType: "cherry", organizationId, projectId })).id;
  const paso = await recordTransformation(gerente, {
    transformationType: "stage_change", occurredAt: new Date("2026-03-02T12:00:00Z"), provenanceClass: "original_record",
    inputs: [{ lotId: loteA, quantity: null, unit: null }],
    outputs: [{ lotCode: `${RUN_ID}-B`, lotType: "processing", quantity: null, unit: null }],
  });
  loteB = paso.outputLots[0]!.id;
  procesoDeA = (await abrirProcesoDePrueba(gerente, loteA, { startedAt: new Date("2026-03-01T12:00:00Z") })).id;

  const valor = await prisma.variableCatalogValue.findFirstOrThrow({ where: { catalog: { key: "condicion_oxigeno" } }, select: { id: true } });
  intervencion = (await registrarIntervencion(gerente, { lotProcessId: procesoDeA, catalogValueId: valor.id, occurredAt: new Date("2026-03-01T18:00:00Z") })).id;

  // El ensayo sobre B: protocolo, versión, ensayo y una etapa. Su auditoría se escribe aquí porque lo
  // que se prueba es la LECTURA; las escrituras de investigación tienen sus propias pruebas.
  const protocolo = await prisma.protocol.create({ data: { name: `${MARCA} protocolo` } });
  const version = await prisma.protocolVersion.create({ data: { protocolId: protocolo.id, version: 1 } });
  ensayo = (await prisma.treatmentBatch.create({
    data: { protocolVersionId: version.id, lotId: loteB, projectId, batchLabel: `${RUN_ID}-T1`, startedAt: new Date("2026-03-03"), provenanceClass: "original_record" },
  })).id;
  etapa = (await prisma.processingStage.create({ data: { treatmentBatchId: ensayo, name: "fermentación", sequenceOrder: 1, startedAt: new Date("2026-03-03") } })).id;
  await prisma.auditEvent.createMany({
    data: [
      { actorUserAccountId: gerente, operation: "treatment_batch.create", entityType: "treatment_batch", entityId: ensayo, sourceInterface: RUN_ID },
      { actorUserAccountId: gerente, operation: "processing_stage.create", entityType: "processing_stage", entityId: etapa, sourceInterface: RUN_ID },
    ],
  });

  // El control negativo: un proceso abierto en un lote SIN parentesco con B.
  const loteAjeno = (await createLot(gerente, { lotCode: `${RUN_ID}-ajeno`, lotType: "cherry", organizationId, projectId })).id;
  procesoAjeno = (await abrirProcesoDePrueba(gerente, loteAjeno)).id;
}, 60000);

/** Todo se descubre por la marca. La auditoría va antes que las cuentas: su actor es `SET NULL`. */
afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } }, select: { id: true } });
  const loteIds = lotes.map((l) => l.id);
  const procesos = loteIds.length ? await prisma.lotProcess.findMany({ where: { lotId: { in: loteIds } }, select: { id: true } }) : [];
  const intervenciones = procesos.length
    ? await prisma.lotProcessIntervention.findMany({ where: { lotProcessId: { in: procesos.map((p) => p.id) } }, select: { id: true } })
    : [];
  const ensayos = loteIds.length ? await prisma.treatmentBatch.findMany({ where: { lotId: { in: loteIds } }, select: { id: true, protocolVersionId: true } }) : [];
  const etapas = ensayos.length ? await prisma.processingStage.findMany({ where: { treatmentBatchId: { in: ensayos.map((e) => e.id) } }, select: { id: true } }) : [];
  const auditables = [...intervenciones, ...ensayos, ...etapas].map((x) => x.id);
  if (auditables.length) await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: auditables } }) });
  if (etapas.length) await prisma.processingStage.deleteMany({ where: assertDefinedWhere({ id: { in: etapas.map((e) => e.id) } }) });
  if (ensayos.length) {
    await prisma.treatmentBatch.deleteMany({ where: assertDefinedWhere({ id: { in: ensayos.map((e) => e.id) } }) });
    await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ id: { in: ensayos.map((e) => e.protocolVersionId) } }) });
  }
  await prisma.protocol.deleteMany({ where: assertDefinedWhere({ name: `${MARCA} protocolo` }) });
  if (loteIds.length) await borrarProcesosDeLotesDonde({ id: { in: loteIds } });
  const transformaciones = loteIds.length
    ? await prisma.lotTransformation.findMany({ where: { OR: [{ inputs: { some: { lotId: { in: loteIds } } } }, { outputs: { some: { lotId: { in: loteIds } } } }] }, select: { id: true } })
    : [];
  const tIds = transformaciones.map((t) => t.id);
  if (tIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot_transformation", entityId: { in: tIds } }) });
    await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
    await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
    await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
  }
  if (loteIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot", entityId: { in: loteIds } }) });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: loteIds } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: loteIds } }) });
  }
  const personas = await prisma.person.findMany({ where: { displayName: { startsWith: MARCA } }, select: { userAccount: { select: { id: true } } } });
  const cuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  if (cuentas.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { startsWith: MARCA } }) });
  if (projectId) {
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "project" as const, scopeRefId: projectId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  }
  await deleteTestOrganizations(RUN_ID);
}, 60000);

describe("el historial del lote incluye sus ensayos y el proceso que lo cubre", () => {
  it("control positivo: las filas existen en la tabla", async () => {
    const filas = await prisma.auditEvent.findMany({
      where: { entityId: { in: [procesoDeA, intervencion, ensayo, etapa, procesoAjeno] } },
      select: { entityType: true, entityId: true },
    });
    const vistas = new Set(filas.map((f) => `${f.entityType}:${f.entityId}`));
    for (const k of [`lot_process:${procesoDeA}`, `lot_process_intervention:${intervencion}`, `treatment_batch:${ensayo}`, `processing_stage:${etapa}`, `lot_process:${procesoAjeno}`]) {
      expect(vistas, k).toContain(k);
    }
  });

  it("el gerente ve en B el proceso de A, su intervención, el ensayo y su etapa", async () => {
    const vistos = await tipos(gerente);
    expect(vistos).toContain(`lot_process:${procesoDeA}`);
    expect(vistos).toContain(`lot_process_intervention:${intervencion}`);
    expect(vistos).toContain(`treatment_batch:${ensayo}`);
    expect(vistos).toContain(`processing_stage:${etapa}`);
  });

  it("el operario, sin permiso de investigación, ve el proceso y NO el ensayo", async () => {
    const vistos = await tipos(operario);
    expect(vistos).toContain(`lot_process:${procesoDeA}`);
    expect(vistos).toContain(`lot_process_intervention:${intervencion}`);
    expect(vistos).not.toContain(`treatment_batch:${ensayo}`);
    expect(vistos).not.toContain(`processing_stage:${etapa}`);
  });

  it("control negativo: el proceso de un lote sin parentesco no aparece", async () => {
    expect(await tipos(gerente)).not.toContain(`lot_process:${procesoAjeno}`);
  });
});
