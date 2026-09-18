/**
 * La marca de carencia en la cosecha — Tarea 6 del plan (spec
 * 2026-09-18-aplicaciones-fitosanitarias-design.md §3.3, §3.4). Prueba
 * `intervencionesVigentes` y `listarIntervenciones` (lectores nuevos) y su
 * consumo dentro de `recordHarvestEvent`.
 *
 * Árbol: finca (site) → parcela (plot) → micro (micro_plot), y hermana (plot),
 * hermana de parcela bajo la misma finca. Un ámbito de Farm Manager en la
 * finca alcanza a los tres por herencia de ubicación (`can()`,
 * `lib/rbac/service.ts`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { recordHarvestEvent, type RecordHarvestEventInput } from "../../lib/traceability/harvest";
import {
  registrarIntervencion,
  corregirIntervencion,
  listarIntervenciones,
} from "../../lib/traceability/intervenciones";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { crearMaterial } from "../../lib/inventario/materiales";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `carencia-cosecha-${Date.now()}`;

let organizationId: string;
let finca: string;
let parcela: string;
let micro: string;
let hermana: string;
let gestor: string;
let sinPermiso: string;
let fito: string;
let enMicro: string;
let desconocida: string;
let correccionDeEnMicro: string;

async function crearCuenta(label: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  return cuenta.id;
}

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);

  finca = (
    await prisma.location.create({
      data: { locationType: "site", name: `TEST Finca (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    })
  ).id;
  parcela = (
    await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST Parcela (${RUN_ID})`,
        organizationId,
        parentLocationId: finca,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;
  micro = (
    await prisma.location.create({
      data: {
        locationType: "micro_plot",
        name: `TEST Micro (${RUN_ID})`,
        organizationId,
        parentLocationId: parcela,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;
  hermana = (
    await prisma.location.create({
      data: {
        locationType: "plot",
        name: `TEST Hermana (${RUN_ID})`,
        organizationId,
        parentLocationId: finca,
        status: "approved",
        classification: "internal",
      },
    })
  ).id;

  // Ámbito en la FINCA: cubre parcela, micro y hermana por herencia de
  // ubicación — un solo Assignment para registrar, corregir y cosechar.
  gestor = await crearCuenta("Gestor");
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: finca } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: perfil.id, scopeId: scope.id } });

  sinPermiso = await crearCuenta("SinPermiso");

  fito = (
    await crearMaterial(gestor, { organizationId, locationId: parcela, name: `Fito ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true })
  ).id;

  // La aplicación en la MICRO, carencia declarada 10 días.
  enMicro = (
    await registrarIntervencion(gestor, {
      locationId: micro,
      kind: "aplicacion",
      target: "broca",
      occurredAt: new Date("2026-09-10T15:00:00Z"),
      lineas: [{ materialId: fito, withdrawalDays: 10 }],
    })
  ).id;

  // Una aplicación en la PARCELA con una línea sin declarar carencia.
  desconocida = (
    await registrarIntervencion(gestor, {
      locationId: parcela,
      kind: "aplicacion",
      target: "broca",
      occurredAt: new Date("2026-11-01T15:00:00Z"),
      lineas: [{ materialId: fito }],
    })
  ).id;
}, 30000);

afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN_ID } }, select: { id: true } });
  const idsLotes = lotes.map((l) => l.id);
  const cosechas = await prisma.harvestEvent.findMany({ where: { resultingLotId: { in: idsLotes } }, select: { id: true } });
  const idsCosechas = cosechas.map((c) => c.id);

  const ubicaciones = [parcela, micro, hermana];
  const intervenciones = await prisma.plotIntervention.findMany({ where: { locationId: { in: ubicaciones } }, select: { id: true } });
  const idsIntervenciones = intervenciones.map((i) => i.id);

  await prisma.harvestWithdrawalFlag.deleteMany({
    where: assertDefinedWhere({ OR: [{ harvestEventId: { in: idsCosechas } }, { interventionId: { in: idsIntervenciones } }] }),
  });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: idsLotes } }) });
  await prisma.harvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: idsCosechas } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: idsLotes } }) });

  await prisma.plotInterventionLine.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotInterventionArea.deleteMany({ where: assertDefinedWhere({ interventionId: { in: idsIntervenciones } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones }, correctsId: { not: null } }) });
  await prisma.plotIntervention.deleteMany({ where: assertDefinedWhere({ id: { in: idsIntervenciones } }) });

  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ id: { in: [fito] } }) });

  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const idsPersonas = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: idsPersonas } }, select: { id: true } });
  const idsCuentas = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsCuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: finca } as { scopeRefId: string }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsCuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: idsPersonas } }) });

  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [micro, parcela, hermana, finca] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

let contador = 0;
const cosecha = (over: Pick<RecordHarvestEventInput, "locationId" | "harvestedAt">): RecordHarvestEventInput => ({
  lotCode: `${RUN_ID}-${contador++}`,
  organizationId,
  provenanceClass: "measured_fact",
  ...over,
});

describe("la marca de carencia al cosechar", () => {
  it("cosechar en la parcela madre dentro de la carencia de la micro: se guarda Y se marca", async () => {
    const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: parcela, harvestedAt: new Date("2026-09-12T15:00:00Z") }));
    const marcas = await prisma.harvestWithdrawalFlag.findMany({ where: { harvestEventId: harvestEvent.id } });
    expect(marcas).toEqual([expect.objectContaining({ interventionId: enMicro, diasQueFaltaban: 8 })]);
  });

  it("en la parcela HERMANA no hay marca", async () => {
    const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: hermana, harvestedAt: new Date("2026-09-12T15:00:00Z") }));
    expect(await prisma.harvestWithdrawalFlag.count({ where: { harvestEventId: harvestEvent.id } })).toBe(0);
  });

  it("carencia desconocida: marca con NULO, no con 0", async () => {
    const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: parcela, harvestedAt: new Date("2026-12-01T15:00:00Z") }));
    const m = await prisma.harvestWithdrawalFlag.findFirst({ where: { harvestEventId: harvestEvent.id, interventionId: desconocida } });
    expect(m).not.toBeNull();
    expect(m!.diasQueFaltaban).toBeNull();
  });

  it("cumplida la carencia: sin marca de esa intervención", async () => {
    const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: micro, harvestedAt: new Date("2026-09-25T15:00:00Z") }));
    expect(await prisma.harvestWithdrawalFlag.count({ where: { harvestEventId: harvestEvent.id, interventionId: enMicro } })).toBe(0);
  });

  it("una intervención corregida no marca; marca su corrección", async () => {
    const correccion = await corregirIntervencion(gestor, {
      interventionId: enMicro,
      motivo: "la carencia real es 20 días",
      nueva: {
        kind: "aplicacion",
        target: "broca",
        occurredAt: new Date("2026-09-10T15:00:00Z"),
        lineas: [{ materialId: fito, withdrawalDays: 20 }],
      },
    });
    correccionDeEnMicro = correccion.id;

    const { harvestEvent } = await recordHarvestEvent(gestor, cosecha({ locationId: micro, harvestedAt: new Date("2026-09-25T15:00:00Z") }));
    const ids = (await prisma.harvestWithdrawalFlag.findMany({ where: { harvestEventId: harvestEvent.id } })).map((m) => m.interventionId);
    expect(ids).toContain(correccionDeEnMicro);
    expect(ids).not.toContain(enMicro);
  });
});

describe("listarIntervenciones", () => {
  it("sin permiso sobre la parcela: acceso denegado", async () => {
    await expect(listarIntervenciones(sinPermiso, parcela)).rejects.toBeInstanceOf(TraceabilityAccessError);
  });

  it("con permiso: ve las intervenciones de esa parcela (control positivo)", async () => {
    const lista = await listarIntervenciones(gestor, parcela);
    expect(lista.map((i) => i.id)).toContain(desconocida);
  });
});
