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
import { afterEach, describe, expect, it } from "vitest";
import { getTrapRule, saveTrapRule, TrapRuleValidationError } from "../../lib/traceability/trapRules";
import { LocationAccessError } from "../../lib/traceability/locations";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.trapRule.deleteMany({ where: assertDefinedWhere({ farmLocationId: { in: locationIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  userAccountIds = [];
  personIds = [];
  scopeIds = [];
  locationIds = [];
  organizationIds = [];
});

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
