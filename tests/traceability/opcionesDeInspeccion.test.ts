/**
 * Qué lotes ofrece el formulario de inspección: los de muestreo propio, y se filtran en la
 * consulta (Daniel, 2026-10-12; `PENDING_IMPLEMENTATIONS/005`).
 *
 * `opcionesParaInspeccion` leía la tabla entera de lotes y descartaba después, lote a lote.
 * Ahora pregunta el permiso una vez por combinación de proyecto, ubicación y clasificación, y
 * pide a la base sólo los lotes de las que pasan. Esto fija que el conjunto ofrecido sigue
 * siendo el mismo: lo propio dentro, lo ajeno fuera, y nada a quien no tiene muestreo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { opcionesParaInspeccion } from "../../lib/traceability/samplingEvents";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `opcinsp-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

let operario: string;
let sinNada: string;
let lotePropio: string;
let loteAjeno: string;

async function sitioConLote(organizationId: string, sufijo: string) {
  const sitio = await prisma.location.create({
    data: { name: `${MARCA} ${sufijo}`, locationType: "site", organizationId, status: "approved", classification: "internal" },
  });
  const lote = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-${sufijo}`, lotType: "green", organizationId, locationId: sitio.id },
  });
  return { sitio: sitio.id, lote: lote.id };
}

async function cuenta(nombre: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: nombre, displayName: `${MARCA} ${nombre}`, locale: "es" },
  });
  return (await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })).id;
}

beforeAll(async () => {
  const organizationId = await createTestOrganization(RUN_ID);
  const propio = await sitioConLote(organizationId, "propio");
  const ajeno = await sitioConLote(organizationId, "ajeno");
  lotePropio = propio.lote;
  loteAjeno = ajeno.lote;
  operario = await cuenta("Operario");
  sinNada = await cuenta("SinNada");
  const rol = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: propio.sitio } });
  await prisma.assignment.create({ data: { userAccountId: operario, roleProfileId: rol.id, scopeId: scope.id } });
}, 30000);

/** Todo se descubre por la marca. Esta lectura no escribe auditoría. */
afterAll(async () => {
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
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: { startsWith: MARCA } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("el formulario de inspección ofrece los lotes de muestreo propio", () => {
  it("el operario del sitio ve su lote y NO el del otro sitio", async () => {
    const ids = (await opcionesParaInspeccion(operario)).lotes.map((l) => l.id);
    expect(ids).toContain(lotePropio);
    expect(ids).not.toContain(loteAjeno);
  });

  it("una cuenta sin asignaciones no ve ninguno de los dos", async () => {
    const ids = (await opcionesParaInspeccion(sinNada)).lotes.map((l) => l.id);
    expect(ids).not.toContain(lotePropio);
    expect(ids).not.toContain(loteAjeno);
  });
});
