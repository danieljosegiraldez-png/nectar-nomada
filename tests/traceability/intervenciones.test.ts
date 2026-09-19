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
  productosFitosanitariosSiPuede,
  intervencionesVigentes,
  listarIntervenciones,
  bloquesDeLaParcela,
  motivoValidoParaParcela,
  IntervencionValidationError,
  type RegistrarIntervencionInput,
} from "../../lib/traceability/intervenciones";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { LocationAccessError } from "../../lib/traceability/locations";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { existencias } from "../../lib/inventario/existencias";
import { startFieldSession, endFieldSession } from "../../lib/traceability/fieldSessions";
import { recordSpecimenObservation } from "../../lib/traceability/specimens";
import { createPlotBlock, listPlotBlocks } from "../../lib/traceability/plotBlocks";
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
// Ronda de arreglos 2 (bug real medido en la base): una parcela con la FORMA
// REAL de Finca Rosina / Lote 1 — la organización vive en el sitio padre, y
// la parcela hija tiene `organizationId` NULO.
let finca: string;
let parcelaHija: string;
// Ronda final de revisión (hallazgos 2, 3, 4): una jornada CERRADA; una
// jornada en `finca` —ámbito que `operador` NO tiene, aunque sí tiene
// `parcelaHija`, su hija—; y una lectura de trampa propia, una ajena y una
// que no es de trampa.
let jornadaCerrada: string;
let jornadaEnFinca: string;
let trampaPropia: string;
let trampaAjena: string;
let lecturaPropia: string;
let lecturaAjena: string;
let observacionNoTrampa: string;
// Tarea 2: un bloque de `parcela` y uno de `otraParcela`, para «el bloque
// tiene que tener locationId IGUAL a la parcela de la intervención».
let bloque: string;
let bloqueAjeno: string;
// Ronda de arreglos 1 (hallazgo crítico): `bloquesDeLaParcela` se lee con
// `lot:view`/`manage`, nunca `location:manage_attributes`. `soloVista` tiene
// el primero y no el segundo (perfil `Project Viewer`); `operadorSinAtributos`
// es un `Farm Operator` (lot:manage) con ese permiso QUITADO por un `deny` de
// asignación — el mismo patrón de «grant más estrecho» que describe el
// catálogo de roles y que dispara el defecto real.
let soloVista: string;
let operadorSinAtributos: string;
let assignmentOperadorSinAtributos: string;

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

async function asignarRol(userAccountId: string, roleProfileName: string, locationId: string): Promise<string> {
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: roleProfileName } });
  // Dos roles pueden compartir el mismo ámbito de ubicación: `Scope` es único
  // por (scopeType, scopeRefId), como en `consumo-descuenta.test.ts`.
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  const a = await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });
  return a.id;
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

  // Ronda de arreglos 2: sitio con organización + parcela hija SIN
  // organización propia — la forma real que escondía el bug. `fito` (de
  // `organizationId`) y `fitoOtraOrg` (de `organizacionOtra`) ya existen; no
  // hace falta un material nuevo.
  finca = (
    await prisma.location.create({
      data: { locationType: "site", name: `TEST Finca (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    })
  ).id;
  parcelaHija = (
    await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST Lote Hijo (${RUN_ID})`,
        organizationId: null,
        parentLocationId: finca,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;
  await asignarRol(operador, "Farm Operator", parcelaHija);

  // Ronda final, hallazgo 3: una jornada cerrada, y una en `finca` —el padre
  // de `parcelaHija`, emparentada con ella, pero donde `operador` NO tiene
  // ningún `Assignment` propio (sólo lo tiene en `parcelaHija`, y un ámbito de
  // ubicación no sube: `conAncestros` en `lib/rbac/service.ts`). `gestor` SÍ
  // recibe rol en `finca`, y por la cadena de ascendientes eso también le
  // autoriza `parcelaHija` (control positivo del hallazgo).
  jornadaCerrada = (
    await startFieldSession(operador, {
      locationId: parcela,
      operatorPersonId: campoPersonId,
      startedAt: new Date("2026-09-05T13:00:00Z"),
      provenanceClass: "direct_observation",
    })
  ).id;
  await endFieldSession(operador, { fieldSessionId: jornadaCerrada, endedAt: new Date("2026-09-05T14:00:00Z") });

  await asignarRol(gestor, "Farm Manager", finca);
  jornadaEnFinca = (
    await startFieldSession(gestor, {
      locationId: finca,
      operatorPersonId: campoPersonId,
      startedAt: new Date("2026-09-10T13:00:00Z"),
      provenanceClass: "direct_observation",
    })
  ).id;

  // Ronda final, hallazgo 4: dos trampas (una propia, una ajena) con su
  // lectura, y una observación de la trampa propia que NO es lectura de
  // trampa (`installed`), para «no es una lectura de trampa».
  trampaPropia = (
    await prisma.specimen.create({
      data: { locationId: parcela, specimenType: "trap", commonName: `Trampa ${RUN_ID}`, provenanceClass: "original_record" },
    })
  ).id;
  trampaAjena = (
    await prisma.specimen.create({
      data: { locationId: otraParcela, specimenType: "trap", commonName: `Trampa ajena ${RUN_ID}`, provenanceClass: "original_record" },
    })
  ).id;
  lecturaPropia = (
    await recordSpecimenObservation(operador, {
      specimenId: trampaPropia,
      observationType: "trap_check",
      observedAt: new Date("2026-09-09T12:00:00Z"),
      captureCount: 5,
      brocaLevel: "algunos",
      provenanceClass: "direct_observation",
    })
  ).id;
  lecturaAjena = (
    await recordSpecimenObservation(gestor, {
      specimenId: trampaAjena,
      observationType: "trap_check",
      observedAt: new Date("2026-09-09T12:00:00Z"),
      captureCount: 3,
      brocaLevel: "pocos",
      provenanceClass: "direct_observation",
    })
  ).id;
  observacionNoTrampa = (
    await recordSpecimenObservation(operador, {
      specimenId: trampaPropia,
      observationType: "installed",
      observedAt: new Date("2026-09-08T12:00:00Z"),
      provenanceClass: "direct_observation",
    })
  ).id;

  // Tarea 2: un bloque de `parcela` y uno de `otraParcela`.
  bloque = (await createPlotBlock(gestor, { locationId: parcela, name: `Bloque ${RUN_ID}` })).id;
  bloqueAjeno = (await createPlotBlock(gestor, { locationId: otraParcela, name: `Bloque ajeno ${RUN_ID}` })).id;

  // Ronda de arreglos 1 (hallazgo crítico): `soloVista` tiene `lot:view` (perfil
  // `Project Viewer`) y NINGÚN `location:manage_attributes`.
  soloVista = await crearCuenta("SoloVista");
  await asignarRol(soloVista, "Project Viewer", parcela);

  // `operadorSinAtributos`: `Farm Operator` (que trae `lot:manage` Y
  // `location:manage_attributes` de perfil) con ese segundo permiso QUITADO
  // por un `deny` de asignación — el «grant más estrecho que el perfil» que
  // el propio catálogo describe como patrón válido (comentario de «Farm
  // Manager» en `lib/rbac/catalog.ts`) y que dispara el defecto real.
  operadorSinAtributos = await crearCuenta("OperadorSinAtributos");
  assignmentOperadorSinAtributos = await asignarRol(operadorSinAtributos, "Farm Operator", parcela);
  const permisoManageAttributes = await prisma.permission.findFirstOrThrow({
    where: { resourceType: "location", action: "manage_attributes" },
  });
  await prisma.assignmentPermissionOverride.create({
    data: { assignmentId: assignmentOperadorSinAtributos, permissionId: permisoManageAttributes.id, effect: "deny" },
  });
}, 30000);

afterAll(async () => {
  await prisma.fieldEvent.deleteMany({
    where: assertDefinedWhere({ fieldSessionId: { in: [jornada, jornadaOtraParcela, jornadaCerrada, jornadaEnFinca] } }),
  });
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimenId: { in: [trampaPropia, trampaAjena] } }) });

  const ubicaciones = [parcela, otraParcela, parcelaOtraOrg, finca, parcelaHija];
  const originales = await prisma.plotIntervention.findMany({ where: { locationId: { in: ubicaciones } }, select: { id: true } });
  const idsIntervenciones = originales.map((o) => o.id);
  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  // Las áreas ANTES que los bloques: `plotBlock` tiene `onDelete: Restrict`
  // desde `plotInterventionArea` (brief, Limpieza completa).
  await prisma.plotInterventionArea.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones }, correctsId: { not: null } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones } }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ id: { in: [bloque, bloqueAjeno] } }) });

  const materiales = [fito, fito2, fitoOtraOrg];
  const lotes = await prisma.consumableLot.findMany({ where: { materialId: { in: materiales } }, select: { id: true } });
  const idsLotes = lotes.map((l) => l.id);
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: idsLotes } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: idsLotes } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ id: { in: [fito, aserrin, fito2, fitoOtraOrg] } }) });

  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: [plantaPropia, plantaAjena, trampaPropia, trampaAjena] } }) });

  await prisma.fieldSession.deleteMany({
    where: assertDefinedWhere({ id: { in: [jornada, jornadaOtraParcela, jornadaCerrada, jornadaEnFinca] } }),
  });

  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const idsPersonas = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: idsPersonas } }, select: { id: true } });
  const idsCuentas = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsCuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: ubicaciones } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsCuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: idsPersonas } }) });

  // `parcelaHija` referencia a `finca` por `parentLocationId`: se borra ANTES,
  // en su propia sentencia, para no depender de que un solo `deleteMany` con
  // varios ids resuelva el orden de una FK que apunta dentro del mismo lote.
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: parcelaHija }) });
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

/**
 * Ronda de arreglos 2 — bug real, medido en la base contra la copia local:
 * en `/plots/<Lote 1>/manejo/nuevo` el selector de productos salía VACÍO.
 * Las parcelas reales («Lote 1 — Finca Rosina») tienen `organizationId`
 * NULO; la organización vive en su sitio padre («Finca Rosina»). Ninguna de
 * las pruebas de arriba lo veía porque sus fixtures ponen `organizationId`
 * directo en la parcela — `parcelaHija` (hija de `finca`) reproduce la
 * forma real.
 */
describe("la organización se resuelve subiendo por parentLocationId (ronda de arreglos 2)", () => {
  it("productosFitosanitarios sobre la parcela hija trae el material de la organización del sitio padre, no el de otra", async () => {
    const productos = await productosFitosanitarios(operador, parcelaHija);
    const ids = productos.map((p) => p.id);
    // Control positivo: `fito` es de `organizationId`, la del sitio `finca`.
    expect(ids).toContain(fito);
    // `fitoOtraOrg` es de OTRA organización.
    expect(ids).not.toContain(fitoOtraOrg);
  });

  it("registrarIntervencion sobre la parcela hija con un material de la organización del sitio padre ENTRA", async () => {
    const r = await registrarIntervencion(operador, {
      locationId: parcelaHija,
      kind: "aplicacion",
      target: "broca",
      occurredAt: new Date("2026-09-10T15:00:00Z"),
      lineas: [{ materialId: fito, withdrawalDays: 7 }],
    });
    expect(r.locationId).toBe(parcelaHija);
  });

  it("registrarIntervencion sobre la parcela hija con un material de OTRA organización se rechaza", async () => {
    await expect(
      registrarIntervencion(operador, {
        locationId: parcelaHija,
        kind: "aplicacion",
        target: "broca",
        occurredAt: new Date("2026-09-10T15:00:00Z"),
        lineas: [{ materialId: fitoOtraOrg, withdrawalDays: 7 }],
      }),
    ).rejects.toThrow(IntervencionValidationError);
  });
});

/**
 * Tarea 3, ronda de arreglos 1 — la regla de trampas ofrece este selector
 * como algo OPCIONAL (`app/plots/[id]/ajustes/page.tsx`), y `operador` es el
 * fixture que ya reproduce el hueco: `Farm Operator` en `parcelaHija`, hija
 * de `finca`, y NINGÚN `Assignment` en `finca` misma. Un ámbito de ubicación
 * alcanza sus descendientes, nunca sus ancestros, así que pedir
 * `lot:view` sobre `finca` con la asignación de `operador` falla — y antes de
 * esta ronda esa falla llegaba sin capturar hasta la página.
 */
describe("productosFitosanitariosSiPuede — ronda de arreglos 1", () => {
  it("sin lot:view en la finca (ámbito sólo en la parcela hija): lista vacía, no lanza", async () => {
    await expect(productosFitosanitariosSiPuede(operador, finca)).resolves.toEqual([]);
  });

  it("control: con lot:view en la finca, trae los mismos productos que productosFitosanitarios", async () => {
    const esperado = await productosFitosanitarios(gestor, finca);
    const obtenido = await productosFitosanitariosSiPuede(gestor, finca);
    expect(obtenido).toEqual(esperado);
    expect(obtenido.map((p) => p.id)).toContain(fito);
  });
});

/**
 * Revisión final, hallazgo 2: como mucho UNA corrección vigente por
 * intervención, garantizado en la BASE (índice único parcial, migración
 * `20260918170000_correccion_unica_y_cantidad_no_negativa`), no sólo por la
 * comprobación previa del servicio — que lee y escribe en pasos separados.
 */
describe("revisión final — hallazgo 2: como mucho una corrección vigente", () => {
  it("la BASE rechaza una segunda corrección de la misma intervención, incluso saltándose el servicio", async () => {
    const o = await registrarIntervencion(operador, base());
    const datos = {
      locationId: o.locationId,
      kind: o.kind,
      target: o.target,
      occurredAt: o.occurredAt,
      provenanceClass: "original_record" as const,
      correctsId: o.id,
      correctionReason: "ronda final",
      createdBy: operador,
    };
    await prisma.plotIntervention.create({ data: datos });
    await expect(prisma.plotIntervention.create({ data: datos })).rejects.toMatchObject({ code: "P2002" });
  });

  it("control positivo: corregir DOS intervenciones DISTINTAS entra sin chocar (la unicidad es por corrects_id, no global)", async () => {
    const o1 = await registrarIntervencion(operador, base());
    const o2 = await registrarIntervencion(operador, base());
    const c1 = await corregirIntervencion(operador, { interventionId: o1.id, motivo: "una", nueva: base() });
    const c2 = await corregirIntervencion(operador, { interventionId: o2.id, motivo: "otra", nueva: base() });
    expect(c1.correctsId).toBe(o1.id);
    expect(c2.correctsId).toBe(o2.id);
  });

  /**
   * `Promise.all` con la MISMA llamada ejerce el camino concurrente de
   * verdad, mismo patrón que `tests/sync/parcelaSinSenal.test.ts` para su
   * propia carrera de `clientDraftId`. Cuál de las dos gana no se controla
   * desde el test —puede ganarla la comprobación previa del servicio («ya
   * tiene una corrección») o el índice único de la base, según cómo se
   * intercalen las dos llamadas—, y las DOS son «un resultado comprensible»:
   * lo único que este test fija es que NUNCA quedan dos vigentes ni las dos
   * fallan. Que el índice único es el que de verdad decide, sin depender de
   * la comprobación previa, ya lo prueba el test de arriba con SQL directo.
   */
  it("dos correcciones concurrentes de la misma intervención: una entra, la otra falla, nunca las dos", async () => {
    const o = await registrarIntervencion(operador, base());
    const intentar = () => corregirIntervencion(operador, { interventionId: o.id, motivo: "carrera", nueva: base() });

    const resultados = await Promise.allSettled([intentar(), intentar()]);

    const cumplidos = resultados.filter((r) => r.status === "fulfilled");
    const rechazados = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(cumplidos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);
    expect(rechazados[0]!.reason).toBeInstanceOf(IntervencionValidationError);

    // Nunca dos versiones vigentes del mismo hecho — el punto entero del hallazgo.
    const correcciones = await prisma.plotIntervention.count({ where: { correctsId: o.id } });
    expect(correcciones).toBe(1);
  });
});

/**
 * Revisión final, hallazgo 3: escribir un `FieldEvent` desde
 * `registrarIntervencion` exige las mismas reglas que `recordFieldEvent`
 * —acceso sobre la ubicación DE LA JORNADA y jornada abierta—, no sólo el
 * parentesco de ubicación que ya comprobaba `validarReferencias`.
 */
describe("revisión final — hallazgo 3: la jornada necesita autorización propia, no sólo parentesco", () => {
  it("jornada cerrada: se rechaza", async () => {
    await expect(registrarIntervencion(operador, base({ fieldSessionId: jornadaCerrada }))).rejects.toThrow(
      IntervencionValidationError,
    );
  });

  it("cuenta sin acceso a la ubicación de la jornada, aunque sí a la parcela: se rechaza", async () => {
    // `operador` tiene `Farm Operator` en `parcelaHija` y por eso pasa
    // `requireLotAccess` sobre ella; la jornada vive en `finca`, su padre, y
    // ahí no tiene ningún `Assignment` propio — un ámbito de ubicación no
    // sube (`conAncestros`, `lib/rbac/service.ts`). El parentesco
    // (`ubicacionesEmparentadas(parcelaHija)` incluye `finca`) SÍ pasa, que es
    // justo lo que hacía que el hallazgo se colara antes del arreglo.
    await expect(
      registrarIntervencion(operador, {
        locationId: parcelaHija,
        kind: "aplicacion",
        target: "broca",
        occurredAt: new Date("2026-09-10T15:00:00Z"),
        lineas: [{ materialId: fito, withdrawalDays: 7 }],
        fieldSessionId: jornadaEnFinca,
      }),
    ).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("control positivo: con acceso a la jornada y jornada abierta, entra y el FieldEvent apunta a ella", async () => {
    // `gestor` tiene `Farm Manager` en `finca` —la ubicación de la jornada— y
    // esa misma asignación, por ascendencia, le autoriza `parcelaHija`.
    const r = await registrarIntervencion(gestor, {
      locationId: parcelaHija,
      kind: "aplicacion",
      target: "broca",
      occurredAt: new Date("2026-09-10T15:00:00Z"),
      lineas: [{ materialId: fito, withdrawalDays: 7 }],
      fieldSessionId: jornadaEnFinca,
    });
    const ev = await prisma.fieldEvent.findFirst({ where: { plotInterventionId: r.id } });
    expect(ev?.fieldSessionId).toBe(jornadaEnFinca);
  });
});

/**
 * Revisión final, hallazgo 4: `motivoObservationId` tiene que existir, ser
 * una lectura de trampa (`trap_check`) y pertenecer a una ubicación
 * emparentada con la parcela — antes se escribía directo, sin comprobar
 * ninguna de las tres.
 */
describe("revisión final — hallazgo 4: motivoObservationId se valida", () => {
  it("observación de OTRA parcela (sin relación): se rechaza", async () => {
    await expect(registrarIntervencion(operador, base({ motivoObservationId: lecturaAjena }))).rejects.toThrow(
      IntervencionValidationError,
    );
  });

  it("observación que NO es lectura de trampa: se rechaza", async () => {
    await expect(registrarIntervencion(operador, base({ motivoObservationId: observacionNoTrampa }))).rejects.toThrow(
      IntervencionValidationError,
    );
  });

  it("observación inexistente: se rechaza", async () => {
    await expect(
      registrarIntervencion(operador, base({ motivoObservationId: "00000000-0000-0000-0000-000000000000" })),
    ).rejects.toThrow(IntervencionValidationError);
  });

  it("control positivo: una lectura de trampa de esta parcela entra", async () => {
    const r = await registrarIntervencion(operador, base({ motivoObservationId: lecturaPropia }));
    expect(r.motivoObservationId).toBe(lecturaPropia);
  });

  it("corregir también valida motivoObservationId: rechaza la de otra parcela, acepta la propia", async () => {
    const o = await registrarIntervencion(operador, base());
    await expect(
      corregirIntervencion(operador, { interventionId: o.id, motivo: "motivo malo", nueva: base({ motivoObservationId: lecturaAjena }) }),
    ).rejects.toThrow(IntervencionValidationError);
    const c = await corregirIntervencion(operador, {
      interventionId: o.id,
      motivo: "con motivo",
      nueva: base({ motivoObservationId: lecturaPropia }),
    });
    expect(c.motivoObservationId).toBe(lecturaPropia);
  });
});

/**
 * Revisión final, hallazgo 5: `quantity` admitía negativos por el camino SIN
 * frasco (el `CHECK` del libro mayor sólo se ejerce al descontar). El
 * servicio los rechaza en `validarPura`, y ahora también la BASE
 * (`plot_intervention_line_cantidad_no_negativa`, misma migración que el
 * hallazgo 2) para quien escriba sin pasar por el servicio.
 */
describe("revisión final — hallazgo 5: cantidad negativa se rechaza en servicio y en base", () => {
  it("negativa SIN frasco: el servicio la rechaza (antes sólo el camino CON frasco la veía)", async () => {
    await expect(registrarIntervencion(operador, base({ lineas: [{ materialId: fito, quantity: -1 }] }))).rejects.toThrow(
      IntervencionValidationError,
    );
  });

  it("no finita (NaN o Infinity): el servicio la rechaza", async () => {
    await expect(
      registrarIntervencion(operador, base({ lineas: [{ materialId: fito, quantity: Number.NaN }] })),
    ).rejects.toThrow(IntervencionValidationError);
    await expect(
      registrarIntervencion(operador, base({ lineas: [{ materialId: fito, quantity: Number.POSITIVE_INFINITY }] })),
    ).rejects.toThrow(IntervencionValidationError);
  });

  it("control positivo: cantidad 0 entra y sigue 0 — no es lo mismo que nulo", async () => {
    const r = await registrarIntervencion(operador, base({ lineas: [{ materialId: fito, quantity: 0 }] }));
    const [l] = await prisma.plotInterventionLine.findMany({ where: { interventionId: r.id } });
    expect(l!.quantity?.toNumber()).toBe(0);
  });

  it("la BASE rechaza una cantidad negativa, incluso saltándose el servicio", async () => {
    const o = await registrarIntervencion(operador, base());
    await expect(
      prisma.plotInterventionLine.create({ data: { interventionId: o.id, materialId: fito, quantity: -1 } }),
    ).rejects.toThrow();
    // Control positivo del propio CHECK: 0 sí entra por este mismo camino directo.
    const linea0 = await prisma.plotInterventionLine.create({ data: { interventionId: o.id, materialId: fito, quantity: 0 } });
    expect(linea0.quantity?.toNumber()).toBe(0);
  });
});

/**
 * PR B, Tarea 2 — intervenciones sobre bloques (`task-2-brief.md`). El bloque
 * tiene que tener `locationId` IGUAL a la parcela de la intervención: no
 * basta con estar emparentado (a diferencia de la jornada o la observación
 * que motiva, arriba, que sí aceptan parentesco).
 */
describe("intervenciones sobre bloques — Tarea 2", () => {
  it("un bloque de OTRA parcela se rechaza; uno de ésta entra con su propia área", async () => {
    await expect(registrarIntervencion(operador, base({ plotBlockIds: [bloqueAjeno] }))).rejects.toThrow(
      IntervencionValidationError,
    );
    const ok = await registrarIntervencion(operador, base({ plotBlockIds: [bloque] }));
    const areas = await prisma.plotInterventionArea.findMany({ where: { interventionId: ok.id } });
    expect(areas).toEqual([expect.objectContaining({ plotBlockId: bloque, specimenId: null })]);
  });

  it("corregir con bloques: la fila nueva lleva sus propias áreas de bloque, la original ninguna", async () => {
    const o = await registrarIntervencion(operador, base());
    const c = await corregirIntervencion(operador, {
      interventionId: o.id,
      motivo: "era sobre un bloque",
      nueva: base({ plotBlockIds: [bloque] }),
    });
    expect(await prisma.plotInterventionArea.count({ where: { interventionId: o.id } })).toBe(0);
    const areasCorreccion = await prisma.plotInterventionArea.findMany({ where: { interventionId: c.id } });
    expect(areasCorreccion).toEqual([expect.objectContaining({ plotBlockId: bloque, specimenId: null })]);
  });

  it("intervencionesVigentes: sin áreas → parcelaEntera true y plotBlockIds vacío", async () => {
    const o = await registrarIntervencion(operador, base());
    const vigentes = await intervencionesVigentes([parcela]);
    expect(vigentes.find((v) => v.id === o.id)).toMatchObject({ parcelaEntera: true, plotBlockIds: [] });
  });

  it("intervencionesVigentes: con un bloque → parcelaEntera false y plotBlockIds con su id", async () => {
    const o = await registrarIntervencion(operador, base({ plotBlockIds: [bloque] }));
    const vigentes = await intervencionesVigentes([parcela]);
    expect(vigentes.find((v) => v.id === o.id)).toMatchObject({ parcelaEntera: false, plotBlockIds: [bloque] });
  });

  it("intervencionesVigentes: sólo plantas → parcelaEntera false y plotBlockIds vacío (no se confunde con bloque)", async () => {
    const o = await registrarIntervencion(operador, base({ specimenIds: [plantaPropia] }));
    const vigentes = await intervencionesVigentes([parcela]);
    expect(vigentes.find((v) => v.id === o.id)).toMatchObject({ parcelaEntera: false, plotBlockIds: [] });
  });

  // Tarea 5 PR B: la ficha (`/plots/<id>/manejo/<id>`) enseña el bloque por su
  // nombre, no un «—». `listarIntervenciones` es lo que se lo trae.
  it("listarIntervenciones: el área de un bloque trae el NOMBRE del bloque", async () => {
    const bloqueDeLaBase = await prisma.plotBlock.findUniqueOrThrow({ where: { id: bloque } });
    const o = await registrarIntervencion(operador, base({ plotBlockIds: [bloque] }));
    const lista = await listarIntervenciones(operador, parcela);
    const encontrada = lista.find((i) => i.id === o.id)!;
    expect(encontrada.areas).toEqual([
      expect.objectContaining({ plotBlockId: bloque, specimenId: null, plotBlock: { name: bloqueDeLaBase.name } }),
    ]);
  });
});

/**
 * Ronda de arreglos 1, hallazgo CRÍTICO: corregir una intervención de bloque
 * sin `location:manage_attributes` la borraba en silencio, porque los
 * bloques de manejo se pedían con `listPlotBlocks` (ese permiso) en vez del
 * mismo permiso que ya exige leer/escribir la intervención (`lot:view`/
 * `manage`). `bloquesDeLaParcela` es el arreglo de raíz.
 */
describe("bloquesDeLaParcela — ronda de arreglos 1 (hallazgo crítico)", () => {
  it("sin lot:view: acceso denegado", async () => {
    await expect(bloquesDeLaParcela(sinPermiso, parcela)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("con lot:view (Project Viewer) pero SIN location:manage_attributes: ve los bloques (control positivo)", async () => {
    const bloques = await bloquesDeLaParcela(soloVista, parcela);
    expect(bloques.map((b) => b.id)).toContain(bloque);
    // Ordenados por nombre, como pide la firma.
    expect(bloques).toEqual([...bloques].sort((a, b) => a.name.localeCompare(b.name)));
  });

  it("control: listPlotBlocks SÍ exige location:manage_attributes, y por eso Project Viewer no puede usarlo", async () => {
    // Demuestra que el arreglo no fue «aflojar `listPlotBlocks`»: esa función
    // y su permiso quedan intactos para su propia pantalla (`ajustes`).
    await expect(listPlotBlocks(soloVista, parcela)).rejects.toBeInstanceOf(LocationAccessError);
  });

  it("corregir con bloque, desde una cuenta con lot:manage pero SIN location:manage_attributes: el bloque que bloquesDeLaParcela le mostró se conserva al guardar", async () => {
    const o = await registrarIntervencion(operador, base({ plotBlockIds: [bloque] }));

    // Lo que la pantalla de corregir hace ahora: pedir los bloques con el
    // MISMO permiso que ya tiene para corregir, no con `listPlotBlocks`.
    const bloquesQueVe = await bloquesDeLaParcela(operadorSinAtributos, parcela);
    expect(bloquesQueVe.map((b) => b.id)).toContain(bloque);

    const c = await corregirIntervencion(operadorSinAtributos, {
      interventionId: o.id,
      motivo: "conserva el bloque sin location:manage_attributes",
      nueva: base({ plotBlockIds: [bloque] }),
    });
    const areas = await prisma.plotInterventionArea.findMany({ where: { interventionId: c.id } });
    expect(areas).toEqual([expect.objectContaining({ plotBlockId: bloque, specimenId: null })]);
  });
});

/**
 * Ronda de arreglos 1, importante #2: `?motivo=` de `/manejo/nuevo` no se
 * ignoraba en silencio cuando era inválido — el servicio lo rechazaba con un
 * error al guardar. `motivoValidoParaParcela` repite las mismas tres
 * condiciones que `validarReferencias` exige (existe, es `trap_check`, su
 * trampa está emparentada con la parcela) pero devuelve `null` en vez de
 * lanzar.
 */
describe("motivoValidoParaParcela — ronda de arreglos 1 (importante #2)", () => {
  it("una lectura de trampa de esta parcela: se devuelve tal cual (control positivo)", async () => {
    await expect(motivoValidoParaParcela(lecturaPropia, parcela)).resolves.toBe(lecturaPropia);
  });

  it("de otra parcela sin relación: null", async () => {
    await expect(motivoValidoParaParcela(lecturaAjena, parcela)).resolves.toBeNull();
  });

  it("una observación que no es lectura de trampa: null", async () => {
    await expect(motivoValidoParaParcela(observacionNoTrampa, parcela)).resolves.toBeNull();
  });

  it("inexistente: null", async () => {
    await expect(motivoValidoParaParcela("00000000-0000-0000-0000-000000000000", parcela)).resolves.toBeNull();
  });

  it("sin parámetro (null o undefined): null, sin tocar la base", async () => {
    await expect(motivoValidoParaParcela(null, parcela)).resolves.toBeNull();
    await expect(motivoValidoParaParcela(undefined, parcela)).resolves.toBeNull();
  });
});
