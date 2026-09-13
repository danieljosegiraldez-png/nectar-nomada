/**
 * El guardia de los tres ejes de la cereza.
 *
 * **Llama al servicio con la entrada hostil**, no a través del formulario: sin
 * este guardia, nada impediría guardar un valor de «flotadores» en la columna
 * de color, y la columna dejaría de significar lo que su nombre dice.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { recordHarvestEvent, CerezaError } from "../../lib/traceability/harvest";
import { catalogosDeCereza } from "../../lib/traceability/harvest";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `cereza-${Date.now()}`;
let orgId: string, plotId: string, cuenta: string, scopeId: string;
let colorRojo: string, defectoAjeno: string;

beforeAll(async () => {
  const cat = await catalogosDeCereza();
  colorRojo = cat.color[0]!.id;
  // Un valor de OTRO catálogo, para el caso hostil. `cereza_defectos` sirve
  // como ajeno para la columna de color.
  defectoAjeno = cat.defectos[0]!.id;

  const org = await prisma.organization.create({
    data: { name: `TEST Cereza Org (${RUN})`, organizationType: "farm", status: "approved" },
  });
  orgId = org.id;
  const plot = await prisma.location.create({
    data: { name: `TEST Parcela (${RUN})`, locationType: "plot", organizationId: org.id, status: "approved" },
  });
  plotId = plot.id;
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Cereza", displayName: `TEST Cereza (${RUN})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } });
  cuenta = ua.id;
  const admin = await prisma.roleProfile.findFirstOrThrow({ where: { name: "Platform Admin" } });
  const scope = await prisma.scope.create({ data: { scopeType: "platform" } });
  scopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: admin.id, scopeId: scope.id } });
});

afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: assertDefinedWhere({ organizationId: orgId }), select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ resultingLotId: { in: ids } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: cuenta }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: cuenta }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: cuenta }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: `TEST Cereza (${RUN})` }) });
});

const base = () => ({
  lotCode: `CZ-${RUN}-${Math.random().toString(36).slice(2, 7)}`,
  organizationId: orgId,
  locationId: plotId,
  projectId: null,
  harvestedAt: new Date(),
  provenanceClass: "measured_fact" as const,
});

describe("la cereza como dato", () => {
  it("guarda los tres ejes cuando vienen de su catálogo", async () => {
    const { lot } = await recordHarvestEvent(cuenta, { ...base(), cherryColorValueId: colorRojo });
    const he = await prisma.harvestEvent.findFirstOrThrow({ where: assertDefinedWhere({ resultingLotId: lot.id }) });
    expect(he.cherryColorValueId).toBe(colorRojo);
  });

  it("rechaza un valor del catálogo equivocado en vez de guardarlo", async () => {
    await expect(
      recordHarvestEvent(cuenta, { ...base(), cherryColorValueId: defectoAjeno }),
    ).rejects.toThrow(CerezaError);
  });

  it("rechaza un id que no existe", async () => {
    await expect(
      recordHarvestEvent(cuenta, { ...base(), cherryColorValueId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toThrow(/not_found/);
  });

  /**
   * Control positivo del control: si el guardia rechazara SIEMPRE, las dos
   * pruebas de arriba pasarían sin demostrar que discrimina. Sin ningún eje
   * declarado tiene que entrar — ausencia es «no se registró», no un error.
   */
  it("una cosecha sin ningún eje declarado entra, y los tres quedan en null", async () => {
    const { lot } = await recordHarvestEvent(cuenta, base());
    const he = await prisma.harvestEvent.findFirstOrThrow({ where: assertDefinedWhere({ resultingLotId: lot.id }) });
    expect(he.cherryColorValueId).toBeNull();
    expect(he.cherryDefectsValueId).toBeNull();
    expect(he.cherryCleanlinessValueId).toBeNull();
  });
});
