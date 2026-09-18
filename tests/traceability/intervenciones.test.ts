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
  productosFitosanitarios,
  IntervencionValidationError,
  type RegistrarIntervencionInput,
} from "../../lib/traceability/intervenciones";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
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
// Ronda 1: referencias cruzadas — una segunda organización, un segundo
// material fitosanitario de la organización principal, y una jornada en una
// parcela SIN relación (parcela/otraParcela son hermanas, sin padre común).
let organizacionOtra: string;
let parcelaOtraOrg: string;
let fitoOtraOrg: string;
let fito2: string;
let loteDeFito2: string;
let jornadaOtraParcela: string;

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

  // Ronda 1, punto 3: una segunda organización, para «material de otra
  // organización». `-otra` sigue conteniendo RUN_ID, así que la limpia el
  // mismo `deleteTestOrganizations(RUN_ID)` de abajo.
  organizacionOtra = await createTestOrganization(`${RUN_ID}-otra`);
  const pOtraOrg = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Parcela Otra Org (${RUN_ID})`,
      organizationId: organizacionOtra,
      status: "approved",
      classification: "internal",
    },
  });
  parcelaOtraOrg = pOtraOrg.id;
  await asignarRol(gestor, "Farm Manager", parcelaOtraOrg);
  fitoOtraOrg = (
    await crearMaterial(gestor, {
      organizationId: organizacionOtra,
      locationId: parcelaOtraOrg,
      name: `FitoOtraOrg ${RUN_ID}`,
      defaultUnit: "l",
      isPlantProtection: true,
    })
  ).id;

  // Un segundo material fitosanitario de la MISMA organización, con su
  // propio lote, para «frasco de otro material».
  fito2 = (
    await crearMaterial(gestor, {
      organizationId,
      locationId: parcela,
      name: `Fito2 ${RUN_ID}`,
      defaultUnit: "l",
      isPlantProtection: true,
    })
  ).id;
  loteDeFito2 = (
    await recibirLote(gestor, { locationId: parcela, materialId: fito2, batchLabel: `F2-${RUN_ID}`, quantity: 5, unit: "l" })
  ).id;

  // Una jornada en `otraParcela` — hermana de `parcela`, sin padre común, así
  // que fuera de `ubicacionesEmparentadas(parcela)`.
  await asignarRol(gestor, "Farm Manager", otraParcela);
  jornadaOtraParcela = (
    await startFieldSession(gestor, {
      locationId: otraParcela,
      operatorPersonId: campoPersonId,
      startedAt: new Date("2026-09-10T13:00:00Z"),
      provenanceClass: "direct_observation",
    })
  ).id;
}, 30000);

afterAll(async () => {
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: [jornada, jornadaOtraParcela] } }) });

  const ubicaciones = [parcela, otraParcela, parcelaOtraOrg];
  const originales = await prisma.plotIntervention.findMany({ where: { locationId: { in: ubicaciones } }, select: { id: true } });
  const idsIntervenciones = originales.map((o) => o.id);
  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotInterventionArea.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones }, correctsId: { not: null } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones } }) });

  const materiales = [fito, fito2, fitoOtraOrg];
  const lotes = await prisma.consumableLot.findMany({ where: { materialId: { in: materiales } }, select: { id: true } });
  const idsLotes = lotes.map((l) => l.id);
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: idsLotes } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: idsLotes } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ id: { in: [fito, aserrin, fito2, fitoOtraOrg] } }) });

  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: [plantaPropia, plantaAjena] } }) });

  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: [jornada, jornadaOtraParcela] } }) });

  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const idsPersonas = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: idsPersonas } }, select: { id: true } });
  const idsCuentas = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsCuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: ubicaciones } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsCuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: idsPersonas } }) });

  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
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
    // Control positivo: lo declarado (7, 12) se guarda tal cual, no se pierde.
    expect(lineas[0]!.withdrawalDays).toBe(7);
    expect(lineas[0]!.reentryHours).toBe(12);
    const audit = await prisma.auditEvent.findFirst({ where: { entityId: r.id, operation: "plot_intervention.create" } });
    expect(audit).not.toBeNull();
  });

  it("carencia 0 y reentrada declaradas se guardan tal cual: 0 no es nulo", async () => {
    const r = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, withdrawalDays: 0, reentryHours: 12 }] }));
    const [l] = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
    expect(l!.withdrawalDays).toBe(0);
    expect(l!.reentryHours).toBe(12);
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

  it("un material de OTRA organización se rechaza; uno de la misma entra (control positivo ya cubierto arriba)", async () => {
    await expect(registrarIntervencion(operador, base({ lineas: [{ materialId: fitoOtraOrg }] }))).rejects.toThrow(
      IntervencionValidationError,
    );
  });

  it("un frasco de OTRO material se rechaza; uno del mismo material entra", async () => {
    await expect(
      registrarIntervencion(operador, base({ lineas: [{ materialId: fito, consumableLotId: loteDeFito2 }] })),
    ).rejects.toThrow(IntervencionValidationError);
    const ok = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito2, consumableLotId: loteDeFito2 }] }));
    expect(ok.kind).toBe("aplicacion");
  });

  it("una jornada de una parcela sin relación se rechaza; una de ésta entra (control ya cubierto abajo)", async () => {
    await expect(registrarIntervencion(operador, base({ fieldSessionId: jornadaOtraParcela }))).rejects.toThrow(
      IntervencionValidationError,
    );
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

  it("dos líneas sobre el mismo frasco: si la segunda falla la unidad, la primera TAMPOCO descuenta (atomicidad)", async () => {
    const nAntes = await prisma.plotIntervention.count({ where: { locationId: parcela } });
    const eventosAntes = await prisma.consumableStockEvent.count({ where: { consumableLotId: lote } });
    const saldoAntes = await saldo();
    await expect(
      registrarIntervencion(
        operador,
        base({
          lineas: [
            { materialId: fito, consumableLotId: lote, quantity: 1, unit: "l" }, // ésta descontaría bien...
            { materialId: fito, consumableLotId: lote, quantity: 1, unit: "kg" }, // ...pero ésta falla la unidad
          ],
        }),
      ),
    ).rejects.toThrow(IntervencionValidationError);
    expect(await prisma.plotIntervention.count({ where: { locationId: parcela } })).toBe(nAntes);
    expect(await prisma.consumableStockEvent.count({ where: { consumableLotId: lote } })).toBe(eventosAntes);
    expect(await saldo()).toBe(saldoAntes);
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
    await expect(registrarIntervencion(sinPermiso, base())).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("corregir sin permiso de gestión sobre la parcela: acceso denegado", async () => {
    const o = await registrarIntervencion(operador, base());
    await expect(
      corregirIntervencion(sinPermiso, { interventionId: o.id, motivo: "intento sin permiso", nueva: base() }),
    ).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("corregir un id inexistente con la cuenta sin permiso: el mismo acceso denegado, no revela si existe", async () => {
    await expect(
      corregirIntervencion(sinPermiso, {
        interventionId: "00000000-0000-0000-0000-000000000000",
        motivo: "intento",
        nueva: base(),
      }),
    ).rejects.toBeInstanceOf(TraceabilityAccessError);
  });
});

describe("productosFitosanitarios — Tarea 8, spec §5", () => {
  it("sin permiso sobre la parcela: acceso denegado", async () => {
    await expect(productosFitosanitarios(sinPermiso, parcela)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("con permiso: sólo los materiales isPlantProtection de la misma organización, con sus lotes", async () => {
    const productos = await productosFitosanitarios(operador, parcela);
    const ids = productos.map((p) => p.id);

    // Control positivo: `fito` y `fito2` SÍ son isPlantProtection de esta organización.
    expect(ids).toContain(fito);
    expect(ids).toContain(fito2);
    // `aserrin` es de la misma organización pero NO es fitosanitario.
    expect(ids).not.toContain(aserrin);
    // `fitoOtraOrg` es fitosanitario pero de OTRA organización.
    expect(ids).not.toContain(fitoOtraOrg);

    const fitoEntry = productos.find((p) => p.id === fito)!;
    expect(fitoEntry.defaultWithdrawalDays).toBe(14);
    const loteIds = fitoEntry.lotes.map((l) => l.id);
    expect(loteIds).toContain(lote);
    expect(loteIds).toContain(loteVencido);
  });
});
