/**
 * La cera de la extracción — spec docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md §4.
 *
 * Grupo `base-sembrada`: permisos del catálogo sembrado y reglas que hace cumplir Postgres.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { anotarCeraDeExtraccion, ceraDeExtraccionDelApiario } from "../../lib/apiary/ceraDeExtraccion";

const RUN = `cerax-${Date.now()}`;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

let organizationId: string;
let apiarioId: string;
let apiarioAjeno: string;
let adminId: string;
let operario: string;
let extrano: string;
const scopes: string[] = [];
const cajas: string[] = [];
const personas: string[] = [];
let n = 0;

async function cuenta(nombre: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN})`, locale: "es" } });
  personas.push(p.id);
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const s =
    (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } })) ??
    (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!scopes.includes(s.id)) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: p.id, scopeId: s.id } });
}

beforeAll(async () => {
  organizationId = (
    await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Farm (${RUN})`, status: "approved", classification: "internal" } })
  ).id;
  adminId = await cuenta("Admin");
  operario = await cuenta("Operario");
  extrano = await cuenta("Extrano");
  const admin = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const plataforma =
    (await prisma.scope.findFirst({ where: { scopeType: "platform", scopeRefId: null } })) ??
    (await prisma.scope.create({ data: { scopeType: "platform", scopeRefId: null } }));
  await prisma.assignment.create({ data: { userAccountId: adminId, roleProfileId: admin.id, scopeId: plataforma.id } });
  apiarioId = (await crearApiario(adminId, { name: `TEST Apiario (${RUN})`, organizationId })).id;
  apiarioAjeno = (await crearApiario(adminId, { name: `TEST Apiario ajeno (${RUN})`, organizationId })).id;
  await asignar(operario, "Farm Operator", apiarioId);
  await asignar(extrano, "Farm Operator", apiarioAjeno);
}, 30000);

/** Una cosecha de miel del apiario que se diga, en el día que se diga. */
async function cosechaEn(cuando: Date, apiario: string = apiarioId) {
  const h = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiario });
  cajas.push(h.id);
  const c = await createColony(adminId, { hiveId: h.id, originType: "purchased", startedAt: dia("2026-01-01"), provenanceClass: "direct_observation" });
  const { harvestEvent } = await recordApiaryHarvest(adminId, {
    colonyId: c.id,
    lotCode: `MIEL-${RUN}-${++n}`,
    occurredAt: cuando,
    provenanceClass: "measured_fact",
  });
  return harvestEvent;
}

afterEach(async () => {
  const cera = (
    await prisma.byproductBatch.findMany({ where: assertDefinedWhere({ producedAtLocationId: { in: [apiarioId, apiarioAjeno] } }), select: { id: true } })
  ).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: cera } }) });
  await prisma.byproductBatch.deleteMany({ where: assertDefinedWhere({ id: { in: cera } }) });
  const eventos = await prisma.apiaryHarvestEvent.findMany({ where: assertDefinedWhere({ colony: { hiveId: { in: cajas } } }), select: { id: true, resultingLotId: true } });
  const ids = eventos.map((e) => e.id);
  const lotes = eventos.map((e) => e.resultingLotId);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: ids } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.apiaryHarvestEvent.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
});

afterAll(async () => {
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  const colonias = (await prisma.colony.findMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }), select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: colonias } }) });
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hiveId: { in: cajas } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: cajas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [apiarioId, apiarioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

/** Inserta en crudo dentro de una transacción que se deshace; devuelve «entra» o la regla que lo impidió. */
async function sonda(sql: string): Promise<string> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("DESHACER");
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m.includes("DESHACER")) return "entra";
    return m.match(/byproduct_batch_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas de la cera viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const fila = (columnas: string, valores: string, destino = "GUARDADA") =>
      `insert into traceability.byproduct_batch (byproduct_type, destination, mass_kg, produced_at_location_id, organization_id, provenance_class${columnas})` +
      ` values ('CERA', '${destino}', 3, '${apiarioId}', '${organizationId}', 'measured_fact'${valores})`;

    // Sin ningún origen: ni transformación ni ventana.
    expect(await sonda(fila("", ""))).toBe("byproduct_batch_un_solo_origen");
    // Media ventana es media trazabilidad, y el CHECK la cuenta como ninguna.
    expect(await sonda(fila(", window_start", `, '2026-05-03'`))).toBe("byproduct_batch_un_solo_origen");
    // Una ventana al revés.
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-05', '2026-05-03'`))).toBe("byproduct_batch_ventana_en_orden");
    // «Otro uso» sin decir cuál.
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-03', '2026-05-05'`, "OTRO"))).toBe("byproduct_batch_otro_dice_por_que");

    // Los dos controles: el apiario con su ventana entra, y «otro uso» CON nota también.
    expect(await sonda(fila(", window_start, window_end", `, '2026-05-03', '2026-05-05'`))).toBe("entra");
    expect(await sonda(fila(", window_start, window_end, notes", `, '2026-05-03', '2026-05-05', 'para cambalache'`, "OTRO"))).toBe("entra");
  });
});

// Spec §4.3 — la cera del desopercular no sale de un lote: se desopercula junto. Su origen es el
// apiario y una ventana, y al leerla se dice qué cosechas de ESE apiario caen dentro, sin afirmar
// que la cera salga de ellas.
describe("la cera de la extracción", () => {
  const ventana = { windowStart: dia("2026-05-03"), windowEnd: dia("2026-05-05") };

  it("SE ANOTA CON SU VENTANA y sin transformación; y dice qué cosechas de ESE apiario caen dentro", async () => {
    const dentro = await cosechaEn(dia("2026-05-04"));
    await cosechaEn(dia("2026-05-09")); // fuera de la ventana
    await cosechaEn(dia("2026-05-04"), apiarioAjeno); // otro apiario, mismo día
    const fila = await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 7.5, destination: "GUARDADA", ...ventana });
    expect(fila.transformationId).toBeNull();

    const leidas = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(leidas).toHaveLength(1);
    expect(leidas[0]!.massKg).toBeCloseTo(7.5, 3);
    expect(leidas[0]!.cosechas.map((c) => c.id)).toEqual([dentro.id]); // ni la de otro día ni la de otro apiario
  });

  it("LA VENTANA INCLUYE SUS DOS EXTREMOS: una cosecha del primer día cuenta, y una del día anterior no", async () => {
    const primerDia = await cosechaEn(dia("2026-05-03"));
    const ultimoDia = await cosechaEn(dia("2026-05-05"));
    await cosechaEn(dia("2026-05-02"));
    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 2, destination: "SALE", ...ventana });
    const [leida] = await ceraDeExtraccionDelApiario(operario, apiarioId);
    expect(leida!.cosechas.map((c) => c.id).sort()).toEqual([primerDia.id, ultimoDia.id].sort());
  });

  it("REGLAS: masa negativa, ventana al revés, OTRO sin nota, y sin permiso no", async () => {
    const base = { apiaryLocationId: apiarioId, destination: "GUARDADA" as const, ...ventana };
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: -1 })).rejects.toThrow(/masa inválida/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: "" })).rejects.toThrow(/masa inválida/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: 3, windowStart: dia("2026-05-06") })).rejects.toThrow(/ventana_al_reves/);
    await expect(anotarCeraDeExtraccion(operario, { ...base, massKg: 3, destination: "OTRO" })).rejects.toThrow(/otro_sin_nota/);
    await expect(anotarCeraDeExtraccion(extrano, { ...base, massKg: 3 })).rejects.toThrow(/no_apiary_access/);
    expect(await prisma.byproductBatch.count({ where: { producedAtLocationId: apiarioId } })).toBe(0); // nada entró
  });

  it("CERO KILOS ES UN DATO: se desoperculó y no se recogió cera aprovechable", async () => {
    const fila = await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 0, destination: "GUARDADA", ...ventana });
    expect(Number(fila.massKg)).toBe(0);
  });

  it("QUIEN NO PUEDE VER EL APIARIO no lee su cera", async () => {
    await anotarCeraDeExtraccion(operario, { apiaryLocationId: apiarioId, massKg: 4, destination: "LAMINA_PROPIA", ...ventana });
    await expect(ceraDeExtraccionDelApiario(extrano, apiarioId)).rejects.toThrow(/no_apiary_access/);
    expect(await ceraDeExtraccionDelApiario(operario, apiarioId)).toHaveLength(1); // el control
  });
});
