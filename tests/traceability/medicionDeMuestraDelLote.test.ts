/**
 * Una medición con `lotId` y `sampleId` a la vez exige que la muestra sea DE ESE lote.
 * `PENDING_IMPLEMENTATIONS/005`, dominio `sample`; Daniel decidió cerrarlo el 2026-10-12.
 *
 * **El hueco.** `requireSubjectAccess` le pasa a `requireLotAccess` los dos ámbitos, el del
 * lote y el de la muestra, y `requireLotAccess` sale bien con el PRIMERO que pase: es
 * autorización alternativa, no coherencia. Nada comprobaba que la muestra fuera del lote,
 * así que con permiso sobre tu lote se colgaba una medición de una muestra ajena y se leía
 * su `materialState`. `recordRoastSession` ya hacía la comprobación (`sample_source_lot_mismatch`).
 *
 * **Hoy no es alcanzable desde una pantalla** —ninguna acción manda `sampleId`—, así que esto
 * guarda el servicio para quien lo llame mañana.
 *
 * Las filas: lote propio + muestra ajena → se rechaza; el control de que lote propio + su
 * propia muestra SÍ se guarda (si no, un rechazo general pasaría la primera); y el de que la
 * muestra ajena sola la rechaza el permiso, como antes.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { MeasurementValidationError, recordMeasurement } from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `medmuestra-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

let operario: string;
let lotePropio: string;
let muestraPropia: string;
let muestraAjena: string;

async function sitioConLoteYMuestra(organizationId: string, sufijo: string) {
  const sitio = await prisma.location.create({
    data: { name: `${MARCA} ${sufijo}`, locationType: "site", organizationId, status: "approved", classification: "internal" },
  });
  const lote = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-${sufijo}`, lotType: "green", organizationId, locationId: sitio.id },
  });
  const muestra = await prisma.sample.create({
    data: { sampleCode: `${RUN_ID}-${sufijo}-m`, sampleType: "green", sourceLotId: lote.id, locationId: sitio.id },
  });
  return { sitio: sitio.id, lote: lote.id, muestra: muestra.id };
}

const base = { variable: "temperature" as never, value: 21, unit: "C", occurredAt: new Date("2026-09-01T09:00:00Z"), provenanceClass: "measured_fact" as const };

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  const propio = await sitioConLoteYMuestra(organizationId, "propio");
  const ajeno = await sitioConLoteYMuestra(organizationId, "ajeno");
  lotePropio = propio.lote;
  muestraPropia = propio.muestra;
  muestraAjena = ajeno.muestra;

  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operario", displayName: `${MARCA} Operario`, locale: "es" },
  });
  operario = (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
  const rol = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: propio.sitio } });
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: rol.id, scopeId: scope.id } });
}, 30000);

/** Todo se descubre por la marca, así que se limpia aunque el `beforeAll` muera a mitad. */
afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } }, select: { id: true } });
  const loteIds = lotes.map((l) => l.id);
  const medidas = loteIds.length
    ? await prisma.measurement.findMany({ where: assertDefinedWhere({ lotId: { in: loteIds } }), select: { id: true } })
    : [];
  // La auditoría va ANTES que la cuenta: su actor es `SET NULL`, y borrar la cuenta primero
  // dejaría filas huérfanas sin fallar.
  if (medidas.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: medidas.map((m) => m.id) } }) });
    await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: medidas.map((m) => m.id) } }) });
  }
  const personas = await prisma.person.findMany({ where: { displayName: { startsWith: MARCA } }, select: { userAccount: { select: { id: true } } } });
  const cuentas = personas.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  const sitios = await prisma.location.findMany({ where: { name: { startsWith: MARCA } }, select: { id: true } });
  if (cuentas.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { startsWith: MARCA } }) });
  // El `Scope` se borra DESPUÉS del `Assignment`, que lo referencia con RESTRICT.
  if (sitios.length) {
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: sitios.map((s) => s.id) } }) });
  }
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { startsWith: MARCA } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("una medición con lote y muestra exige que la muestra sea de ese lote", () => {
  it("con el lote propio y una muestra AJENA, se rechaza y no se guarda nada", async () => {
    const antes = await prisma.measurement.count({ where: { lotId: lotePropio } });
    await expect(recordMeasurement(operario, { ...base, lotId: lotePropio, sampleId: muestraAjena })).rejects.toThrow(
      new MeasurementValidationError("sample_not_of_lot"),
    );
    expect(await prisma.measurement.count({ where: { lotId: lotePropio } })).toBe(antes);
  });

  it("control: con el lote propio y SU muestra, se guarda con las dos", async () => {
    const m = await recordMeasurement(operario, { ...base, lotId: lotePropio, sampleId: muestraPropia });
    expect(m.lotId).toBe(lotePropio);
    expect(m.sampleId).toBe(muestraPropia);
  });

  it("control: la muestra ajena SOLA la rechaza el permiso, como antes", async () => {
    await expect(recordMeasurement(operario, { ...base, sampleId: muestraAjena })).rejects.toBeInstanceOf(TraceabilityAccessError);
  });
});
