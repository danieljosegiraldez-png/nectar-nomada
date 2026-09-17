/**
 * La liberación de un lote para la venta — Tarea 4 del plan de reposo.
 *
 * El guardia que justifica toda la tarea está en el segundo caso: `Farm
 * Operator` YA tiene `lot:manage` (`lib/rbac/catalog.ts`), así que colgar la
 * liberación de ese permiso —que es lo natural— dejaría que cualquier operario
 * de campo autorizara una decisión comercial. Por eso `lot:release` es propio.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { createLot, liberarLote, TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `lib-${Date.now()}`;

let organizationId: string;
let projectId: string;
let gerenteId: string;
let operarioId: string;

async function cuenta(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return ua.id;
}

async function asignar(userAccountId: string, perfil: string) {
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  // `Scope` es único por (scopeType, scopeRefId): los dos perfiles comparten
  // el mismo ámbito, no crean uno cada uno.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: p.id, scopeId: scope.id } });
}

async function loteDePrueba(sufijo: string) {
  const lot = await createLot(gerenteId, {
    lotCode: `${RUN_ID}-${sufijo}`,
    lotType: "green",
    organizationId,
    projectId,
  });
  await recordQuantityEvent(gerenteId, {
    provenanceClass: "measured_fact",
    lotId: lot.id,
    eventType: "received",
    quantity: 50,
    unit: "kg",
    occurredAt: new Date("2026-03-01"),
  });
  return lot;
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Liberacion (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  gerenteId = await cuenta("Gerente");
  await asignar(gerenteId, "Farm Manager");
  operarioId = await cuenta("Operario");
  await asignar(operarioId, "Farm Operator");
}, 30000);

afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } } });
  const ids = lotes.map((l) => l.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "lot", entityId: { in: ids } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [gerenteId, operarioId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gerenteId, operarioId] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("liberar un lote", () => {
  it("Farm Manager puede liberar, y queda quién y cuándo", async () => {
    const lote = await loteDePrueba("ok");
    const liberado = await liberarLote(gerenteId, lote.id);
    expect(liberado.releasedAt).not.toBeNull();
    expect(liberado.releasedBy).toBe(gerenteId);
  }, 20000);

  it("Farm Operator NO puede liberar, AUNQUE tenga lot:manage", async () => {
    const lote = await loteDePrueba("operario");
    await expect(liberarLote(operarioId, lote.id)).rejects.toThrow(TraceabilityAccessError);

    // CONTROL POSITIVO, y sin él este «no puede» no valdría nada: el mismo
    // operario, sobre el mismo proyecto, SÍ puede hacer una operación de
    // `lot:manage`. Si esto fallara, el rechazo de arriba sería el de un
    // usuario sin permisos y no el de un permiso que falta.
    const suyo = await createLot(operarioId, {
      lotCode: `${RUN_ID}-operario-crea`,
      lotType: "green",
      organizationId,
      projectId,
    });
    expect(suyo.id).toBeTruthy();
  }, 20000);

  it("liberar dos veces no mueve la fecha ni el autor", async () => {
    // Quién autorizó primero es el hecho que interesa. Si un segundo clic
    // reescribiera la fecha, se perdería.
    const lote = await loteDePrueba("idem");
    const uno = await liberarLote(gerenteId, lote.id);
    const dos = await liberarLote(gerenteId, lote.id);
    expect(dos.releasedAt).toEqual(uno.releasedAt);
    expect(dos.releasedBy).toBe(uno.releasedBy);
  }, 20000);

  it("un lote sin liberar tiene releasedAt nulo — el control de que la columna no nace puesta", async () => {
    const lote = await loteDePrueba("virgen");
    const leido = await prisma.lot.findUniqueOrThrow({ where: { id: lote.id } });
    expect(leido.releasedAt).toBeNull();
    expect(leido.releasedBy).toBeNull();
  }, 20000);
});
