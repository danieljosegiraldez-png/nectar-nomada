/**
 * Registrar y corregir una intervención fitosanitaria — Tarea 5 del plan
 * (spec 2026-09-18-aplicaciones-fitosanitarias-design.md §2). Es el servicio
 * central: las tareas 6-8 leen lo que éste escribe.
 *
 * Fixture como `tests/inventario/consumo-descuenta.test.ts`: RUN_ID,
 * organización, cuenta con rol y ámbito en la ubicación, limpieza con
 * `assertDefinedWhere`.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import {
  registrarIntervencion,
  corregirIntervencion,
  IntervencionValidationError,
  type RegistrarIntervencionInput,
} from "../../lib/traceability/intervenciones";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { existencias } from "../../lib/inventario/existencias";
import { startFieldSession } from "../../lib/traceability/fieldSessions";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `fito-${Date.now()}`;

let organizationId: string;
let parcela: string;
let otraParcela: string;
let gestor: string;
let operador: string;
let sinPermiso: string;
let campoPersonId: string;
let fito: string;
let aserrin: string;
let lote: string;
let loteVencido: string;
let plantaPropia: string;
let plantaAjena: string;
let jornada: string;

async function crearPersona(label: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  return persona.id;
}

async function crearCuenta(label: string) {
  const personId = await crearPersona(label);
  const cuenta = await prisma.userAccount.create({
    data: { personId, authProvider: "credentials", status: "active" },
  });
  return cuenta.id;
}

async function asignarRol(userAccountId: string, roleProfileName: string, locationId: string) {
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: roleProfileName } });
  // Dos roles pueden compartir el mismo ámbito de ubicación: `Scope` es único
  // por (scopeType, scopeRefId), como en `consumo-descuenta.test.ts`.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);

  const p = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Parcela (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  parcela = p.id;
  const op = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Otra Parcela (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  otraParcela = op.id;

  // Gestor: Farm Manager, para dar de alta el material y recibir el lote —
  // `crearMaterial` exige `equipment:manage`, que Farm Operator NO tiene.
  gestor = await crearCuenta("Gestor");
  await asignarRol(gestor, "Farm Manager", parcela);

  // Operador: Farm Operator con ámbito en la parcela — quien registra.
  operador = await crearCuenta("Operador");
  await asignarRol(operador, "Farm Operator", parcela);

  // Sin ninguna asignación.
  sinPermiso = await crearCuenta("SinPermiso");

  campoPersonId = await crearPersona("Campo");

  fito = (
    await crearMaterial(gestor, {
      organizationId,
      locationId: parcela,
      name: `Fito ${RUN_ID}`,
      defaultUnit: "l",
      isPlantProtection: true,
      defaultWithdrawalDays: 14,
    })
  ).id;
  aserrin = (
    await crearMaterial(gestor, { organizationId, locationId: parcela, name: `Aserrín ${RUN_ID}`, defaultUnit: "saco" })
  ).id;

  lote = (await recibirLote(gestor, { locationId: parcela, materialId: fito, batchLabel: `L-${RUN_ID}`, quantity: 10, unit: "l" })).id;
  loteVencido = (
    await recibirLote(gestor, {
      locationId: parcela,
      materialId: fito,
      batchLabel: `V-${RUN_ID}`,
      quantity: 5,
      unit: "l",
      expiresAt: new Date("2020-01-01"),
    })
  ).id;

  plantaPropia = (
    await prisma.specimen.create({
      data: { locationId: parcela, specimenType: "plant", commonName: `Cafeto ${RUN_ID}`, provenanceClass: "original_record" },
    })
  ).id;
  plantaAjena = (
    await prisma.specimen.create({
      data: { locationId: otraParcela, specimenType: "plant", commonName: `Cafeto ajeno ${RUN_ID}`, provenanceClass: "original_record" },
    })
  ).id;

  jornada = (
    await startFieldSession(operador, {
      locationId: parcela,
      operatorPersonId: campoPersonId,
      startedAt: new Date("2026-09-10T13:00:00Z"),
      provenanceClass: "direct_observation",
    })
  ).id;
}, 30000);

afterAll(async () => {
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: jornada }) });

  const originales = await prisma.plotIntervention.findMany({ where: { locationId: { in: [parcela, otraParcela] } }, select: { id: true } });
  const idsIntervenciones = originales.map((o) => o.id);
  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotInterventionArea.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones }, correctsId: { not: null } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones } }) });

  const lotes = await prisma.consumableLot.findMany({ where: { materialId: fito }, select: { id: true } });
  const idsLotes = lotes.map((l) => l.id);
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: idsLotes } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: idsLotes } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ id: { in: [fito, aserrin] } }) });

  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: [plantaPropia, plantaAjena] } }) });

  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: jornada }) });

  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const idsPersonas = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: idsPersonas } }, select: { id: true } });
  const idsCuentas = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsCuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [parcela, otraParcela] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsCuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: idsPersonas } }) });

  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [parcela, otraParcela] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const base = (over: Partial<RegistrarIntervencionInput> = {}): RegistrarIntervencionInput => ({
  locationId: parcela,
  kind: "aplicacion",
  target: "broca",
  occurredAt: new Date("2026-09-10T15:00:00Z"),
  lineas: [{ materialId: fito, withdrawalDays: 7, reentryHours: 12 }],
  ...over,
});

describe("registrar y corregir una intervención fitosanitaria", () => {
  it("guarda la intervención, sus líneas y su auditoría en una transacción", async () => {
    const r = await registrarIntervencion(operador, base());
    const lineas = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
    expect(lineas).toHaveLength(1);
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: r.id, operation: "plot_intervention.create" } });
    expect(audit).not.toBeNull();
  });

  it("el servicio NO copia la carencia del producto cuando la línea llega sin ella", async () => {
    const r = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito }] }));
    const [l] = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
    expect(l!.withdrawalDays).toBeNull(); // el producto dice 14; la línea no dijo nada
  });

  it("manejo cultural con líneas se rechaza; aplicación sin líneas se rechaza", async () => {
    await expect(registrarIntervencion(operador, base({ kind: "manejo_cultural" }))).rejects.toThrow(IntervencionValidationError);
    await expect(registrarIntervencion(operador, base({ lineas: [] }))).rejects.toThrow(IntervencionValidationError);
    const ok = await registrarIntervencion(operador, base({ kind: "manejo_cultural", target: "broca", lineas: [] }));
    expect(ok.kind).toBe("manejo_cultural"); // control: la repela sí entra
  });

  it("un material que NO es fitosanitario se rechaza", async () => {
    await expect(registrarIntervencion(operador, base({ lineas: [{ materialId: aserrin }] }))).rejects.toThrow(IntervencionValidationError);
  });

  it("una planta de OTRA parcela se rechaza; una de ésta entra", async () => {
    await expect(registrarIntervencion(operador, base({ specimenIds: [plantaAjena] }))).rejects.toThrow(IntervencionValidationError);
    const ok = await registrarIntervencion(operador, base({ specimenIds: [plantaPropia] }));
    expect(await prisma.plotInterventionArea.count({ where: { interventionId: ok.id } })).toBe(1);
  });

  // El saldo, como lo lee `tests/inventario/consumo-descuenta.test.ts`: con el ámbito.
  const saldo = async () => (await existencias(operador, lote, { locationId: parcela })).quantity.toNumber();

  it("con frasco y cantidad descuenta; sin cantidad no descuenta y se guarda igual", async () => {
    const antes = await saldo();
    await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote, quantity: 2, unit: "l" }] }));
    expect(await saldo()).toBe(antes - 2);
    await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote }] }));
    expect(await saldo()).toBe(antes - 2);
  });

  it("unidad distinta a la del frasco se rechaza, y NO queda ni intervención ni descuento", async () => {
    const n = await prisma.plotIntervention.count({ where: { locationId: parcela } });
    await expect(
      registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote, quantity: 1, unit: "kg" }] })),
    ).rejects.toThrow(/unidad distinta/);
    expect(await prisma.plotIntervention.count({ where: { locationId: parcela } })).toBe(n);
  });

  it("frasco vencido: se guarda y queda marcado", async () => {
    const r = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: loteVencido }] }));
    const [l] = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
    expect(l!.lotExpiredAtApplication).toBe(true);
  });

  it("con jornada: deja un FieldEvent `manejo_fitosanitario` apuntando a ella", async () => {
    const r = await registrarIntervencion(operador, base({ fieldSessionId: jornada }));
    const ev = await prisma.fieldEvent.findFirst({ where: { plotInterventionId: r.id }, include: { eventKindValue: true } });
    expect(ev?.eventKindValue.value).toBe("manejo_fitosanitario");
    expect(ev?.fieldSessionId).toBe(jornada);
  });

  it("corregir escribe fila NUEVA; la original queda intacta; no se corrige lo corregido", async () => {
    const o = await registrarIntervencion(operador, base());
    const c = await corregirIntervencion(operador, { interventionId: o.id, motivo: "era roya", nueva: { ...base(), target: "roya" } });
    expect(c.correctsId).toBe(o.id);
    expect((await prisma.plotIntervention.findUniqueOrThrow({ where: { id: o.id } })).target).toBe("broca");
    await expect(
      corregirIntervencion(operador, { interventionId: o.id, motivo: "otra vez", nueva: base() }),
    ).rejects.toThrow(IntervencionValidationError);
  });

  it("corregir una línea con frasco NO vuelve a descontar", async () => {
    const o = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: lote, quantity: 1, unit: "l" }] }));
    const antes = await saldo();
    await corregirIntervencion(operador, {
      interventionId: o.id,
      motivo: "hora",
      nueva: { ...base(), lineas: [{ materialId: fito, consumableLotId: lote, quantity: 1, unit: "l" }] },
    });
    expect(await saldo()).toBe(antes);
  });

  it("sin permiso de gestión sobre la parcela: acceso denegado", async () => {
    await expect(registrarIntervencion(sinPermiso, base())).rejects.toThrow();
  });
});
