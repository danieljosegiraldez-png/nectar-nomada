/**
 * Aplicar un tratamiento descuenta del frasco — botiquín, Tarea 7.
 *
 * Cierra el patrón de dos libros que el spec cita del SAG: lo que ENTRA al
 * botiquín (la recepción) y lo que se USA (el tratamiento), atados por el frasco.
 * El enlace es opcional para siempre; cuando está, el descuento va en la MISMA
 * transacción que el tratamiento.
 *
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §B
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createHive, createColony } from "../../lib/apiary/hives";
import { recordColonyEvent } from "../../lib/apiary/colonyEvents";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { existencias } from "../../lib/inventario/existencias";
import { frascosParaTratar } from "../../lib/inventario/frascosParaTratar";
import { ApiaryAccessError } from "../../lib/apiary/hives";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `trd-${Date.now()}`;

describe("aplicar un tratamiento descuenta del frasco", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  /** Sólo la colmena (ámbito de proyecto); nada sobre el sitio del frasco. */
  let soloColmenaId: string;
  let soloColmenaPersonId: string;
  const scopeIds: string[] = [];
  let personId: string;
  let materialId: string;
  let colonyId: string;
  let n = 0;

  const tratamiento = () => ({
    colonyId,
    eventType: "treatment" as const,
    treatmentTarget: "varroa",
    treatmentProduct: "Apivar",
    treatmentBatchLabel: `L-${RUN_ID.slice(-4)}`,
    treatmentWithdrawalDays: 14,
  });

  async function frasco(opciones: { expiresAt?: Date | null } = {}) {
    return recibirLote(userAccountId, {
      locationId, materialId, batchLabel: `F${++n}-${RUN_ID}`, quantity: 10, unit: "tira",
      expiresAt: opciones.expiresAt ?? null,
    });
  }
  const saldo = async (loteId: string) => (await existencias(userAccountId, loteId, { locationId })).quantity.toNumber();

  beforeAll(async () => {
    const org = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = org.id;
    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Tratamiento", displayName: `TEST Trd (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    userAccountId = (await prisma.userAccount.create({ data: { personId, authProvider: "credentials", status: "active" } })).id;
    projectId = (await prisma.project.create({ data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" } })).id;
    locationId = (await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    })).id;
    // Dos ámbitos: la colmena se juzga por proyecto y el frasco por su sitio.
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
    for (const [scopeType, scopeRefId] of [["project", projectId], ["location", locationId]] as const) {
      const s = await prisma.scope.create({ data: { scopeType, scopeRefId } });
      scopeIds.push(s.id);
      await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: s.id } });
    }
    const p2 = await prisma.person.create({
      data: { givenName: "TEST", familyName: "SoloColmena", displayName: `TEST SoloColmena (${RUN_ID})`, locale: "es" },
    });
    soloColmenaPersonId = p2.id;
    soloColmenaId = (await prisma.userAccount.create({ data: { personId: p2.id, authProvider: "credentials", status: "active" } })).id;
    await prisma.assignment.create({ data: { userAccountId: soloColmenaId, roleProfileId: perfil.id, scopeId: scopeIds[0]! } });
    materialId = (await crearMaterial(userAccountId, {
      locationId, organizationId, name: `Apivar ${RUN_ID}`, defaultUnit: "tira",
      isVeterinaryMedicine: true, defaultWithdrawalDays: 42,
    })).id;
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `T-${RUN_ID.slice(-4)}` });
    colonyId = (await createColony(userAccountId, {
      hiveId: hive.id, originType: "captured", startedAt: new Date("2026-01-01"), provenanceClass: "direct_observation",
    })).id;
  }, 30000);

  afterEach(async () => {
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  });

  afterAll(async () => {
    const lotes = (await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } })).map((l) => l.id);
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: userAccountId }) });
    await prisma.colonyEvent.deleteMany({ where: assertDefinedWhere({ colonyId }) });
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
    await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { locationId } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: lotes } }) });
    await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
    await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ id: materialId }) });
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: soloColmenaId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [userAccountId, soloColmenaId] } }) });
    await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [userAccountId, soloColmenaId] } }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: [personId, soloColmenaPersonId] } }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  }, 30000);

  it("un tratamiento con lote descuenta del frasco", async () => {
    const l = await frasco();
    const e = await recordColonyEvent(userAccountId, { ...tratamiento(), consumableLotId: l.id, treatmentDose: 2, treatmentDoseUnit: "tira" });
    expect(e.consumableLotId).toBe(l.id);
    expect(await saldo(l.id)).toBe(8);
  }, 20000);

  it("sin lote se registra igual y no mueve nada", async () => {
    // Opcional para siempre: un tratamiento es un registro legalmente exigido, y
    // obligar a elegir frasco lo convertiría en un trámite que se esquiva.
    const l = await frasco();
    const e = await recordColonyEvent(userAccountId, { ...tratamiento(), treatmentDose: 2, treatmentDoseUnit: "tira" });
    expect(e.consumableLotId).toBeNull();
    expect(e.treatmentLotExpiredAtApplication).toBeNull();
    expect(await saldo(l.id)).toBe(10);
  }, 20000);

  it("un lote VENCIDO se puede aplicar, y el evento queda marcado — y uno vigente queda en falso", async () => {
    // Avisa, no bloquea: alguien puede estar registrando hoy lo de la semana pasada.
    const vencido = await frasco({ expiresAt: new Date("2026-01-31T00:00:00Z") });
    const e = await recordColonyEvent(userAccountId, {
      ...tratamiento(), occurredAt: new Date("2026-03-01T12:00:00Z"),
      consumableLotId: vencido.id, treatmentDose: 1, treatmentDoseUnit: "tira",
    });
    expect(e.treatmentLotExpiredAtApplication).toBe(true);
    // Control: el MISMO frasco aplicado antes de su fecha queda en false, no en true.
    const antes = await recordColonyEvent(userAccountId, {
      ...tratamiento(), occurredAt: new Date("2026-01-15T12:00:00Z"),
      consumableLotId: vencido.id, treatmentDose: 1, treatmentDoseUnit: "tira",
    });
    expect(antes.treatmentLotExpiredAtApplication).toBe(false);
  }, 20000);

  it("un frasco SIN fecha deja la marca en nulo — lo desconocido no es vigente", async () => {
    const l = await frasco();
    const e = await recordColonyEvent(userAccountId, { ...tratamiento(), consumableLotId: l.id, treatmentDose: 1, treatmentDoseUnit: "tira" });
    expect(e.treatmentLotExpiredAtApplication).toBeNull();
  }, 20000);

  it("si el descuento falla, el tratamiento NO se guarda", async () => {
    // Atomicidad: un tratamiento sin su descuento sería medicamento aplicado que
    // el inventario no vio. La unidad del frasco es «tira»; se aplica en «ml».
    const l = await frasco();
    const antes = await prisma.colonyEvent.count({ where: { colonyId } });
    await expect(recordColonyEvent(userAccountId, { ...tratamiento(), consumableLotId: l.id, treatmentDose: 1, treatmentDoseUnit: "ml" }))
      .rejects.toThrow(/unidad/i);
    expect(await prisma.colonyEvent.count({ where: { colonyId } })).toBe(antes);
    expect(await saldo(l.id)).toBe(10);
  }, 20000);

  it("el servicio guarda la carencia del OPERARIO, no la del producto", async () => {
    // El producto declara 42; el operario escribió 14. Precargar la del producto
    // es trabajo del FORMULARIO, donde se ve y se puede cambiar.
    const l = await frasco();
    const e = await recordColonyEvent(userAccountId, { ...tratamiento(), consumableLotId: l.id, treatmentDose: 1, treatmentDoseUnit: "tira" });
    expect(e.treatmentWithdrawalDays).toBe(14);
  }, 20000);

  it("quien sólo atiende la colmena no descuenta un frasco de otro sitio — y el control positivo", async () => {
    // Registrar en la colmena no da permiso sobre el botiquín: descontar es
    // escribir en el libro del frasco.
    const l = await frasco();
    await expect(recordColonyEvent(soloColmenaId, { ...tratamiento(), consumableLotId: l.id, treatmentDose: 1, treatmentDoseUnit: "tira" }))
      .rejects.toThrow(ApiaryAccessError);
    expect(await saldo(l.id)).toBe(10);
    // La misma persona registra el tratamiento sin frasco.
    const e = await recordColonyEvent(soloColmenaId, { ...tratamiento(), treatmentDose: 1, treatmentDoseUnit: "tira" });
    expect(e.consumableLotId).toBeNull();
  }, 20000);

  it("el selector lista los frascos que quien mira puede descontar, con la carencia del producto", async () => {
    const l = await frasco({ expiresAt: new Date("2027-05-31T00:00:00Z") });
    const mios = await frascosParaTratar(userAccountId);
    const este = mios.find((f) => f.id === l.id);
    expect(este).toMatchObject({ producto: `Apivar ${RUN_ID}`, unidad: "tira", carenciaDelProducto: 42, vence: "2027-05-31" });
    expect((await frascosParaTratar(soloColmenaId)).map((f) => f.id)).not.toContain(l.id);
  }, 20000);
});
