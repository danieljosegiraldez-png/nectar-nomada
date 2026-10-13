/**
 * Las muestras de un lote exigen el permiso de MUESTRAS, no sólo el del lote.
 * Decisión de Daniel del 2026-10-12, `PENDING_IMPLEMENTATIONS/005` (dominio `sample`).
 *
 * Cinco operaciones leían o escribían muestras sólo con el permiso del lote. La regla:
 * - **leer** exige `sample:view` **o** `sample:manage`. Aquí `manage` no implica `view`
 *   (`lib/rbac/catalog.ts`), y Farm Manager y Farm Operator sólo tienen `sample:manage`: exigir
 *   `view` les quitaría ver las muestras que toman ellos mismos. Quien no tenga ninguno ve la
 *   ficha del lote SIN muestras.
 * - **escribir** exige `sample:manage`.
 *
 * Las cuentas, y por qué cada una:
 * - `gerente` (Farm Manager) y `operario` (Farm Operator): `sample:manage`. Lo ven y lo hacen todo.
 * - `visor` (Project Viewer): `lot:view` y ningún permiso de muestras. Es el único perfil del
 *   catálogo que pierde algo con esta regla: ve el lote, no sus muestras.
 * - `sinMuestras`: un Farm Operator con un override que le QUITA `sample:manage`. Ningún perfil del
 *   catálogo tiene `lot:manage` sin `sample:manage`, y es la única forma de probar las escrituras.
 *
 * Los controles de las escrituras no esperan éxito, esperan OTRO error: con el permiso, el tueste
 * cae más adelante (la muestra no tiene masa en kg). Así se ve que el guardia no rechaza a todos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { getLotDetail, TraceabilityAccessError } from "../../lib/traceability/lots";
import { correctMeasurement, inspeccionesParaMedicion, recordMeasurement } from "../../lib/traceability/measurements";
import { listGreenSamplesForRoast, recordRoastSession } from "../../lib/traceability/roasting";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `permmuestra-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

let projectId: string;
let gerente: string;
let operario: string;
let visor: string;
let sinMuestras: string;
let lote: string;
let muestra: string;
let medicion: string;
/** La del control de la corrección, aparte: si compartiera `medicion`, el orden de las pruebas decidiría el resultado. */
let medicionDelControl: string;
let secado: string;
let inspeccion: string;

async function cuenta(nombre: string, perfil: string, scopeId: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `${MARCA} ${nombre}`, locale: "es" },
  });
  const id = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  const rol = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const asignacion = await prisma.assignment.create({ data: { userAccountId: id, roleProfileId: rol.id, scopeId } });
  return { id, asignacion: asignacion.id };
}

const noAccesoAMuestras = async (p: Promise<unknown>) => {
  const e = await p.then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(TraceabilityAccessError);
  expect((e as Error).message).toBe("no_sample_access");
};

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  projectId = (await prisma.project.create({ data: { name: `${MARCA} proyecto`, status: "approved", classification: "internal" } })).id;
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
  gerente = (await cuenta("Gerente", "Farm Manager", scope.id)).id;
  operario = (await cuenta("Operario", "Farm Operator", scope.id)).id;
  visor = (await cuenta("Visor", "Project Viewer", scope.id)).id;
  const sin = await cuenta("SinMuestras", "Farm Operator", scope.id);
  sinMuestras = sin.id;
  const samplePermiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "sample", action: "manage" } });
  await prisma.assignmentPermissionOverride.create({ data: { assignmentId: sin.asignacion, permissionId: samplePermiso.id, effect: "deny" } });

  lote = (await prisma.lot.create({ data: { lotCode: `${RUN_ID}-L`, lotType: "green", organizationId, projectId } })).id;
  muestra = (await prisma.sample.create({
    data: { sampleCode: `${RUN_ID}-S`, sampleType: "green", sourceLotId: lote, projectId, materialState: "GREEN" },
  })).id;
  medicion = (await recordMeasurement(gerente, {
    lotId: lote, sampleId: muestra, variable: "temperature" as never, value: 21, unit: "C", occurredAt: new Date("2026-09-01T09:00:00Z"), provenanceClass: "measured_fact",
  })).id;

  medicionDelControl = (await recordMeasurement(gerente, {
    lotId: lote, sampleId: muestra, variable: "temperature" as never, value: 20, unit: "C", occurredAt: new Date("2026-09-01T08:00:00Z"), provenanceClass: "measured_fact",
  })).id;

  secado = (await prisma.dryingRun.create({ data: { startedAt: new Date("2026-09-02T09:00:00Z"), method: MARCA } })).id;
  await prisma.lotTransformation.create({
    data: { transformationType: "stage_change", occurredAt: new Date("2026-09-02T09:00:00Z"), provenanceClass: "original_record", dryingRunId: secado, inputs: { create: [{ lotId: lote }] } },
  });
  inspeccion = (await prisma.samplingEvent.create({ data: { occurredAt: new Date("2026-09-03T09:00:00Z"), dryingRunId: secado } })).id;
}, 60000);

/** Todo se descubre por la marca. La auditoría va antes que las cuentas: su actor es `SET NULL`. */
afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } }, select: { id: true } });
  const loteIds = lotes.map((l) => l.id);
  const medidas = loteIds.length ? await prisma.measurement.findMany({ where: { lotId: { in: loteIds } }, select: { id: true } }) : [];
  if (medidas.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: medidas.map((m) => m.id) } }) });
    await prisma.measurement.updateMany({ where: assertDefinedWhere({ id: { in: medidas.map((m) => m.id) } }), data: { correctsId: null } });
    await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: medidas.map((m) => m.id) } }) });
  }
  const secados = await prisma.dryingRun.findMany({ where: { method: MARCA }, select: { id: true } });
  const secadoIds = secados.map((s) => s.id);
  if (secadoIds.length) {
    await prisma.samplingEvent.deleteMany({ where: assertDefinedWhere({ dryingRunId: { in: secadoIds } }) });
    const ts = await prisma.lotTransformation.findMany({ where: { dryingRunId: { in: secadoIds } }, select: { id: true } });
    if (ts.length) {
      await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
      await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: ts.map((t) => t.id) } }) });
    }
    await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: secadoIds } }) });
  }
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  if (loteIds.length) await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: loteIds } }) });
  const personas = await prisma.person.findMany({ where: { displayName: { startsWith: MARCA } }, select: { userAccount: { select: { id: true } } } });
  const cuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  if (cuentas.length) {
    // El override cuelga de la asignación con `onDelete: Cascade`.
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

describe("leer muestras exige sample:view o sample:manage", () => {
  it("la ficha del lote enseña la muestra a quien tiene sample:manage", async () => {
    expect((await getLotDetail(gerente, lote)).samples.map((s) => s.id)).toContain(muestra);
    expect((await getLotDetail(operario, lote)).samples.map((s) => s.id)).toContain(muestra);
  });

  it("y al visor, que sólo tiene lot:view, le enseña el lote SIN muestras", async () => {
    const ficha = await getLotDetail(visor, lote);
    expect(ficha.lot.id).toBe(lote);
    expect(ficha.samples).toEqual([]);
  });

  it("las muestras verdes para tostar: sí con sample:manage, ninguna al visor", async () => {
    expect((await listGreenSamplesForRoast(gerente, lote)).map((m) => m.id)).toContain(muestra);
    expect(await listGreenSamplesForRoast(visor, lote)).toEqual([]);
  });

  it("las inspecciones de un secado: sí con sample:manage, ninguna sin permiso de muestras", async () => {
    expect((await inspeccionesParaMedicion(operario, lote, secado)).map((i) => i.id)).toContain(inspeccion);
    expect(await inspeccionesParaMedicion(sinMuestras, lote, secado)).toEqual([]);
  });
});

describe("escribir sobre una muestra exige sample:manage", () => {
  const tueste = (quien: string) =>
    recordRoastSession(quien, {
      lotId: lote, sourceSampleId: muestra, purpose: "sample", outputLotCode: `${RUN_ID}-tostado-${quien.slice(0, 6)}`,
      startedAt: new Date("2026-09-04T09:00:00Z"), chargeWeightKg: 0.2, provenanceClass: "original_record",
    });

  it("tostar desde una muestra sin sample:manage se rechaza", async () => {
    await noAccesoAMuestras(tueste(sinMuestras));
  });

  it("control: con sample:manage el tueste llega más lejos y cae por otra razón (la muestra no tiene masa en kg)", async () => {
    const e = await tueste(operario).then(() => null, (x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect((e as Error).message).not.toBe("no_sample_access");
    expect((e as Error).message).toBe("sample_mass_in_kg_required");
  });

  const correccion = { value: 22, unit: "C", occurredAt: new Date("2026-09-01T10:00:00Z"), reason: "TEST corrección", provenanceClass: "measured_fact" as const };

  it("corregir la medición de una muestra sin sample:manage se rechaza", async () => {
    await noAccesoAMuestras(correctMeasurement(sinMuestras, { measurementId: medicion, ...correccion }));
  });

  it("control: con sample:manage la corrección se guarda", async () => {
    const corregida = await correctMeasurement(gerente, { measurementId: medicionDelControl, ...correccion });
    expect(corregida.sampleId).toBe(muestra);
  });
});
