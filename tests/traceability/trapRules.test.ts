/**
 * La regla del encargado — una por finca, sin valores por defecto.
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 * Cada `it` crea su propio usuario y parcela con los helpers de
 * `tests/helpers/traceability.ts`, y encola sus ids en los arreglos de este
 * archivo; la limpieza corre en `afterEach` — nunca al final del cuerpo del
 * `it` — para que una aserción fallida no salte el borrado y deje basura en
 * la base compartida.
 *
 * La regla se guarda sobre la FINCA, no sobre la parcela: `crearParcela()`
 * crea dos `Location` y la finca es `parcela.parentLocationId`. Las dos van a
 * `locationIds`, y `trap_rule` se borra antes que `location` porque la
 * referencia.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { getTrapRule, saveTrapRule, TrapRuleValidationError } from "../../lib/traceability/trapRules";
import { LocationAccessError } from "../../lib/traceability/locations";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];
let materialIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.trapRule.deleteMany({ where: assertDefinedWhere({ farmLocationId: { in: locationIds } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ id: { in: materialIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds }, scopeType: { not: "platform" as const } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  userAccountIds = [];
  personIds = [];
  scopeIds = [];
  locationIds = [];
  organizationIds = [];
  materialIds = [];
});

/**
 * Farm Operator con ámbito exactamente en `farmLocationId` — mismo target de
 * ámbito que `requireLotAccess`/`requireLocationAttributeAccess` comprueban,
 * así que el perfil le da `location:manage_attributes` y `lot:view` a la vez.
 * El caso del Hueco 1 exige separarlos, y el perfil no trae ninguno que los
 * separe (`lib/rbac/catalog.ts`: los dos únicos con `manage_attributes` —Farm
 * Manager y Farm Operator— también traen `lot:view`), así que se quita el
 * segundo con un `AssignmentPermissionOverride` de `effect: "deny"` — el
 * mismo mecanismo que usa `tests/traceability/editarBeneficio.test.ts`. El
 * `deny` no exige `reason` y `onDelete: Cascade` en la migración lo borra
 * solo cuando se borra el `Assignment` en el `afterEach` de este archivo.
 */
async function crearOperarioDeFinca(farmLocationId: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operario", displayName: `TEST Operario (${randomUUID()})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: farmLocationId } });
  const asignacion = await prisma.assignment.create({
    data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id },
  });
  return { userAccountId: cuenta.id, personId: persona.id, scopeId: scope.id, assignmentId: asignacion.id };
}

async function negarVerLotes(assignmentId: string) {
  const permiso = await prisma.permission.findFirstOrThrow({ where: { resourceType: "lot", action: "view" } });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId, permissionId: permiso.id, effect: "deny" },
  });
}

const reglaValida = {
  triggerLevel: "algunos" as const,
  normalDays: 15,
  alertDays: 7,
  suggestedAction: "aplicar repelente Bralic",
};

describe("regla de trampas de la finca", () => {
  it("sin regla guardada devuelve null: no hay valor por defecto", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    expect(await getTrapRule(usuario.userAccountId, parcela.parentLocationId!)).toBeNull();
  });

  it("guarda la regla sobre la finca y la relee", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    await saveTrapRule(userAccountId, { farmLocationId, ...reglaValida });
    const leida = await getTrapRule(userAccountId, farmLocationId);
    expect(leida).toMatchObject({ farmLocationId, ...reglaValida });
  });

  it("guardar otra vez reemplaza la regla: una sola por finca", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    await saveTrapRule(userAccountId, { farmLocationId, ...reglaValida });
    await saveTrapRule(userAccountId, { farmLocationId, ...reglaValida, triggerLevel: "muchos", alertDays: 3 });

    const filas = await prisma.trapRule.findMany({ where: { farmLocationId } });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ triggerLevel: "muchos", alertDays: 3 });

    // La tabla no guarda updatedBy: quién cambió la regla y desde qué valor lo
    // dicen los dos eventos de auditoría, el segundo con el `before` anterior.
    const eventos = await prisma.auditEvent.findMany({
      where: { entityType: "trap_rule", entityId: filas[0]!.id, operation: "trap_rule.save" },
    });
    expect(eventos).toHaveLength(2);
    const primero = eventos.find((e) => e.before === null);
    const segundo = eventos.find((e) => e.before !== null);
    expect(primero?.after).toMatchObject({ alertDays: 7 });
    expect(segundo?.before).toMatchObject({ alertDays: 7, triggerLevel: "algunos" });
    expect(segundo?.after).toMatchObject({ alertDays: 3, triggerLevel: "muchos" });
    expect(segundo?.actorUserAccountId).toBe(userAccountId);
  });

  it("escribe la auditoría en la misma transacción", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const regla = await saveTrapRule(userAccountId, { farmLocationId: parcela.parentLocationId!, ...reglaValida });
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "trap_rule", entityId: regla.id, operation: "trap_rule.save" },
    });
    expect(evento).not.toBeNull();
  });

  it("rechaza normalDays <= 0", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId: parcela.parentLocationId!, ...reglaValida, normalDays: 0, alertDays: 1,
      }),
    ).rejects.toThrow(new TrapRuleValidationError("normal_days_must_be_positive"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("rechaza alertDays > normalDays: un aviso que tarda más con broca no es un aviso", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId: parcela.parentLocationId!, ...reglaValida, normalDays: 7, alertDays: 15,
      }),
    ).rejects.toThrow(new TrapRuleValidationError("alert_days_exceed_normal_days"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("rechaza alertDays <= 0", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId: parcela.parentLocationId!, ...reglaValida, normalDays: 15, alertDays: 0,
      }),
    ).rejects.toThrow(new TrapRuleValidationError("alert_days_must_be_positive"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("rechaza una lectura fuera de la escala con su código, no con un error de Prisma", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId: parcela.parentLocationId!, ...reglaValida, triggerLevel: "" as never,
      }),
    ).rejects.toThrow(new TrapRuleValidationError("trigger_level_invalid"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("rechaza días que no son enteros", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId: parcela.parentLocationId!, ...reglaValida, normalDays: 7.5, alertDays: 7,
      }),
    ).rejects.toThrow(new TrapRuleValidationError("days_must_be_whole_numbers"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("rechaza una acción sugerida vacía tras quitar espacios", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId: parcela.parentLocationId!, ...reglaValida, suggestedAction: "   ",
      }),
    ).rejects.toThrow(new TrapRuleValidationError("suggested_action_required"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("saveTrapRule rechaza a un usuario sin acceso a esa finca", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(
      saveTrapRule(ajeno.userAccountId, { farmLocationId: parcela.parentLocationId!, ...reglaValida }),
    ).rejects.toThrow(new LocationAccessError("no_location_attribute_access"));
    expect(await prisma.trapRule.count({ where: { farmLocationId: parcela.parentLocationId! } })).toBe(0);
  });

  it("getTrapRule rechaza a un usuario sin acceso a esa finca", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(getTrapRule(ajeno.userAccountId, parcela.parentLocationId!)).rejects.toThrow(
      new LocationAccessError("no_location_attribute_access"),
    );
  });
});

describe("la regla apunta a un producto (Tarea 3)", () => {
  it("guarda con un producto fitosanitario de la organización de la finca", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    const material = await prisma.consumableMaterial.create({
      data: {
        organizationId: parcela.organizationId!,
        name: `TEST Fito (${randomUUID()})`,
        defaultUnit: "l",
        isPlantProtection: true,
      },
    });
    materialIds.push(material.id);

    await saveTrapRule(usuario.userAccountId, {
      farmLocationId,
      ...reglaValida,
      suggestedMaterialId: material.id,
    });
    const leida = await getTrapRule(usuario.userAccountId, farmLocationId);
    expect(leida?.suggestedMaterialId).toBe(material.id);
  });

  it("rechaza un producto que no es de manejo fitosanitario", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    const aserrin = await prisma.consumableMaterial.create({
      data: {
        organizationId: parcela.organizationId!,
        name: `TEST Aserrín (${randomUUID()})`,
        defaultUnit: "saco",
        isPlantProtection: false,
      },
    });
    materialIds.push(aserrin.id);

    await expect(
      saveTrapRule(usuario.userAccountId, { farmLocationId, ...reglaValida, suggestedMaterialId: aserrin.id }),
    ).rejects.toThrow(new TrapRuleValidationError("suggested_material_not_plant_protection"));
    expect(await prisma.trapRule.count({ where: { farmLocationId } })).toBe(0);
  });

  it("rechaza un producto fitosanitario de otra organización", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    const otraOrganizacion = await prisma.organization.create({
      data: { name: `TEST Finca Ajena (${randomUUID()})`, organizationType: "farm", status: "approved" },
    });
    organizationIds.push(otraOrganizacion.id);
    const fitoDeOtraOrg = await prisma.consumableMaterial.create({
      data: {
        organizationId: otraOrganizacion.id,
        name: `TEST FitoAjeno (${randomUUID()})`,
        defaultUnit: "l",
        isPlantProtection: true,
      },
    });
    materialIds.push(fitoDeOtraOrg.id);

    await expect(
      saveTrapRule(usuario.userAccountId, {
        farmLocationId,
        ...reglaValida,
        suggestedMaterialId: fitoDeOtraOrg.id,
      }),
    ).rejects.toThrow(new TrapRuleValidationError("suggested_material_other_organization"));
    expect(await prisma.trapRule.count({ where: { farmLocationId } })).toBe(0);
  });

  it("sin producto guarda null: un selector vacío nunca es un id inventado (control)", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    await saveTrapRule(usuario.userAccountId, { farmLocationId, ...reglaValida, suggestedMaterialId: null });
    const leida = await getTrapRule(usuario.userAccountId, farmLocationId);
    expect(leida?.suggestedMaterialId).toBeNull();
  });

  it("Hueco 1: con manage_attributes pero SIN lot:view, guardar CON producto se rechaza", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    const material = await prisma.consumableMaterial.create({
      data: {
        organizationId: parcela.organizationId!,
        name: `TEST Fito (${randomUUID()})`,
        defaultUnit: "l",
        isPlantProtection: true,
      },
    });
    materialIds.push(material.id);

    const operario = await crearOperarioDeFinca(farmLocationId);
    userAccountIds.push(operario.userAccountId);
    personIds.push(operario.personId);
    scopeIds.push(operario.scopeId);
    await negarVerLotes(operario.assignmentId);

    await expect(
      saveTrapRule(operario.userAccountId, { farmLocationId, ...reglaValida, suggestedMaterialId: material.id }),
    ).rejects.toThrow(new TraceabilityAccessError("no_lot_access"));
    expect(await prisma.trapRule.count({ where: { farmLocationId } })).toBe(0);
  });

  it("Hueco 1: la misma cuenta SIN lot:view, guardar SIN producto entra (control positivo)", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const farmLocationId = parcela.parentLocationId!;

    const operario = await crearOperarioDeFinca(farmLocationId);
    userAccountIds.push(operario.userAccountId);
    personIds.push(operario.personId);
    scopeIds.push(operario.scopeId);
    await negarVerLotes(operario.assignmentId);

    await saveTrapRule(operario.userAccountId, { farmLocationId, ...reglaValida });
    const leida = await getTrapRule(operario.userAccountId, farmLocationId);
    expect(leida?.suggestedMaterialId).toBeNull();
  });
});
