import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearTipoDeBandeja } from "../../lib/equipos/bandejas";
import { createLot } from "../../lib/traceability/lots";
import { puedeEditarBeneficioEnOrganizacion } from "../../lib/traceability/locations";
import { vistaDeBandejas } from "../../lib/beneficio/vistaDeBandejas";

/**
 * `vistaDeBandejas` (revisión final del plan 2a): A1 (el selector de lotes no
 * enseña uno que esta cuenta no gestiona) y A5 (sólo entran organizaciones con
 * al menos un `site`). El montaje sigue la forma de
 * `tests/traceability/capacidadDeBandeja.test.ts`.
 */

function nombre(etiqueta: string) {
  return `TEST ${etiqueta}-${randomUUID().slice(0, 8)}`;
}

const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
const orgIds: string[] = [];
const locationIds: string[] = [];
const lotIds: string[] = [];
const tipoIds: string[] = [];

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) } });
  personIds.push(person.id);
  const account = await prisma.userAccount.create({ data: { personId: person.id, authProvider: "credentials", status: "active" } });
  accountIds.push(account.id);
  return account.id;
}

async function asignar(userAccountId: string, perfil: "Farm Manager" | "Farm Operator", locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopeIds.push(scope.id);
  await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
}

afterAll(async () => {
  await prisma.lot.deleteMany({ where: { id: { in: lotIds } } });
  await prisma.dryingTrayType.deleteMany({ where: { id: { in: tipoIds } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.auditEvent.deleteMany({ where: { actorUserAccountId: { in: accountIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
});

describe("A1: el selector de lotes filtra por lo que la cuenta gestiona, no sólo por ámbito", () => {
  it("un lote trade_secret en el ámbito propio no sale; el interno sí (control)", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-a1"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-a1"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    const gerente = await cuenta("gerente-a1");
    await asignar(gerente, "Farm Manager", sitio.id);
    const operario = await cuenta("operario-a1");
    await asignar(operario, "Farm Operator", sitio.id);
    const tipo = await crearTipoDeBandeja(gerente, { organizationId: org.id, nombre: nombre("Tipo"), ancho: 1, largo: 1, unidad: "ft" });
    tipoIds.push(tipo.id);

    const loteInterno = await createLot(operario, { lotCode: nombre("interno"), lotType: "drying", organizationId: org.id, locationId: sitio.id });
    lotIds.push(loteInterno.id);
    // Un Farm Operator no tiene `classification:clear_trade_secret` (catálogo
    // RBAC) — el mismo ámbito, otra clasificación, y ya no puede gestionarlo.
    const loteSecreto = await prisma.lot.create({ data: { lotCode: nombre("secreto"), lotType: "drying", organizationId: org.id, locationId: sitio.id, classification: "trade_secret", createdBy: gerente } });
    lotIds.push(loteSecreto.id);

    const secciones = await vistaDeBandejas(operario);
    const seccion = secciones.find((s) => s.org.id === org.id)!;
    expect(seccion).toBeDefined();
    const ids = seccion.lotesGestionables.map((l) => l.id);
    expect(ids).toContain(loteInterno.id);
    expect(ids).not.toContain(loteSecreto.id);
    expect(seccion.lotesRecortados).toBe(false);
  });
});

describe("A5: sólo organizaciones con al menos un `site`", () => {
  it("una organización sin ningún `site` no aparece, aunque alguien pueda editar su beneficio", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-a5"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    // Un `beneficio` sin ningún `site` en la organización: no debería pasar en
    // la práctica (el beneficio cuelga de un sitio), pero es exactamente el
    // caso que separa "tiene edit_beneficio en algún lugar" de "tiene un site".
    const beneficio = await prisma.location.create({ data: { locationType: "beneficio", name: nombre("beneficio-a5"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(beneficio.id);
    const gerente = await cuenta("gerente-a5");
    await asignar(gerente, "Farm Manager", beneficio.id);

    // Control: SIN el filtro de A5 esta organización pasaría (edit_beneficio sí lo da).
    expect(await puedeEditarBeneficioEnOrganizacion(gerente, org.id)).toBe(true);

    const secciones = await vistaDeBandejas(gerente);
    expect(secciones.find((s) => s.org.id === org.id)).toBeUndefined();
  });

  it("control positivo: la misma organización, con un site además del beneficio, sí aparece", async () => {
    const org = await prisma.organization.create({ data: { organizationType: "farm", name: nombre("org-a5-con-sitio"), status: "approved", classification: "internal" } });
    orgIds.push(org.id);
    const sitio = await prisma.location.create({ data: { locationType: "site", name: nombre("sitio-a5"), organizationId: org.id, status: "approved", classification: "internal" } });
    locationIds.push(sitio.id);
    const gerente = await cuenta("gerente-a5-control");
    await asignar(gerente, "Farm Manager", sitio.id);

    const secciones = await vistaDeBandejas(gerente);
    expect(secciones.find((s) => s.org.id === org.id)).toBeDefined();
  });
});
