/**
 * La pesada por recipiente — spec docs/superpowers/specs/2026-09-19-cera-y-pesada-por-recipiente-design.md §3.
 *
 * Grupo `base-sembrada`: permisos del catálogo sembrado, reglas en Postgres y el libro del lote.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearApiario, createColony, createHive } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { completarCierreDeCosecha } from "../../lib/apiary/cierreDeCosecha";
import { anotarRecipiente, quitarRecipiente } from "../../lib/apiary/recipientes";
import { computeCurrentQuantity, recordQuantityEvent } from "../../lib/traceability/quantity";
import { asentarPesoDeCosecha } from "../../lib/apiary/cosechasSinSaldo";

const RUN = `rcp-${Date.now()}`;
const dia = (s: string) => new Date(`${s}T09:00:00Z`);

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

/** Una caja con colonia y una cosecha sin peso; devuelve la cosecha. */
async function cosecha() {
  const h = await createHive(adminId, { identifier: `${RUN}-${cajas.length}`, locationId: apiarioId });
  cajas.push(h.id);
  const c = await createColony(adminId, { hiveId: h.id, originType: "purchased", startedAt: dia("2026-01-01"), provenanceClass: "direct_observation" });
  const { harvestEvent } = await recordApiaryHarvest(operario, {
    colonyId: c.id, lotCode: `MIEL-${RUN}-${++n}`, occurredAt: dia("2026-08-01"), provenanceClass: "measured_fact",
  });
  return harvestEvent;
}

afterEach(async () => {
  const eventos = await prisma.apiaryHarvestEvent.findMany({ where: assertDefinedWhere({ colony: { hiveId: { in: cajas } } }), select: { id: true, resultingLotId: true } });
  const ids = eventos.map((e) => e.id);
  const lotes = eventos.map((e) => e.resultingLotId);
  const recipientes = (await prisma.harvestContainer.findMany({ where: assertDefinedWhere({ apiaryHarvestEventId: { in: ids } }), select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ids, ...recipientes] } }) });
  await prisma.harvestContainer.deleteMany({ where: assertDefinedWhere({ id: { in: recipientes } }) });
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
    return m.match(/harvest_container_[a-z_]+/)?.[0] ?? m.slice(0, 160);
  }
  return "?";
}

describe("las reglas del recipiente viven en la base", () => {
  it("cada CHECK rechaza lo suyo, y lo válido entra", async () => {
    const h = await cosecha();
    const ins = (label: string, bruto: string, tara: string) =>
      `INSERT INTO apiary.harvest_container (apiary_harvest_event_id, label, gross_kg, tare_kg) VALUES ('${h.id}', '${label}', ${bruto}, ${tara})`;
    expect(await sonda(ins("balde 1", "20.5", "1.2"))).toBe("entra");
    expect(await sonda(ins("balde 1", "1.0", "1.2"))).toBe("harvest_container_pesos_posibles");
    expect(await sonda(ins("balde 1", "1.2", "1.2"))).toBe("harvest_container_pesos_posibles");
    expect(await sonda(ins("balde 1", "5", "-0.1"))).toBe("harvest_container_pesos_posibles");
    expect(await sonda(ins("   ", "5", "1"))).toBe("harvest_container_etiqueta_dice_algo");
  });
});

/** El saldo del libro del lote, en kilos, leído como lo lee cualquiera con permiso. */
const saldo = async (lotId: string) => Number((await computeCurrentQuantity(operario, lotId)).quantity);

describe("la pesada por recipiente", () => {
  it("EL PESO DE LA COSECHA ES LA SUMA DE LOS NETOS, y el libro del lote la recibe", async () => {
    const h = await cosecha();
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "balde 1", grossKg: 21.2, tareKg: 1.2 });
    const { totalKg } = await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "balde 2", grossKg: 16.5, tareKg: 1.5 });
    expect(totalKg).toBeCloseTo(35, 3);
    const fila = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: h.id } });
    expect(Number(fila.extractedWeightKg)).toBeCloseTo(35, 3);
    expect(await saldo(h.resultingLotId)).toBeCloseTo(35, 3);
  });

  it("QUITAR MUEVE EL LIBRO POR LA DIFERENCIA, pide motivo, y el último no borra el peso", async () => {
    const h = await cosecha();
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 11, tareKg: 1 });
    const { recipiente } = await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b2", grossKg: 6, tareKg: 1 });
    await expect(quitarRecipiente(operario, { containerId: recipiente.id, reason: " " })).rejects.toThrow(/quitar_sin_motivo/);
    expect((await quitarRecipiente(operario, { containerId: recipiente.id, reason: "anotado dos veces" })).totalKg).toBeCloseTo(10, 3);
    expect(await saldo(h.resultingLotId)).toBeCloseTo(10, 3);
    const [ultimo] = await prisma.harvestContainer.findMany({ where: { apiaryHarvestEventId: h.id } });
    if (!ultimo) throw new Error("debía quedar un recipiente");
    await quitarRecipiente(operario, { containerId: ultimo.id, reason: "se vuelve a pesar a mano" });
    const fila = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: h.id } });
    expect(Number(fila.extractedWeightKg)).toBeCloseTo(10, 3);
    expect(await saldo(h.resultingLotId)).toBeCloseTo(10, 3);
  });

  it("CON RECIPIENTES NO SE ESCRIBE OTRO PESO A MANO; el tipo de miel sí", async () => {
    const h = await cosecha();
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 11, tareKg: 1 });
    await expect(completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, extractedWeightKg: 50, reason: "x" })).rejects.toThrow(
      /peso_lo_dan_los_recipientes/,
    );
    await expect(completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, honeyType: "multifloral" })).resolves.toBeTruthy();
  });

  it("SOBRE UN PESO ESCRITO A MANO, el primer recipiente lo sustituye y el libro se mueve por la diferencia", async () => {
    const h = await cosecha();
    await completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, extractedWeightKg: 30 });
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: 1 });
    expect(await saldo(h.resultingLotId)).toBeCloseTo(25, 3);
  });

  it("REGLAS: tara mayor que bruto, etiqueta repetida con su nombre, y sin permiso no", async () => {
    const h = await cosecha();
    await expect(anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 1, tareKg: 2 })).rejects.toThrow(/pesos_imposibles/);
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 5, tareKg: 1 });
    await expect(anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: " b1 ", grossKg: 5, tareKg: 1 })).rejects.toThrow(/etiqueta_repetida/);
    await expect(anotarRecipiente(extrano, { apiaryHarvestEventId: h.id, label: "b9", grossKg: 5, tareKg: 1 })).rejects.toThrow(/no_apiary_access/);
  });
});

// Revisión de Codex del PR de recipientes: la diferencia suponía que el peso escrito ya estaba en el
// libro. Ahora se mide lo que la cosecha APORTÓ de verdad (sus «recibido» y sus ajustes etiquetados).
describe("el libro cuadra con lo que la cosecha aportó, no con lo que dice su peso escrito (Codex)", () => {
  it("COSECHA ANTIGUA SIN ASIENTOS: el primer recipiente recibe su neto, no una disminución sobre un libro vacío", async () => {
    const h = await cosecha();
    await prisma.apiaryHarvestEvent.update({ where: { id: h.id }, data: { extractedWeightKg: 30 } }); // como antes de ADR-161
    expect(await saldo(h.resultingLotId)).toBeCloseTo(0, 3); // el control: de verdad no hay asientos
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: 1 });
    expect(await saldo(h.resultingLotId)).toBeCloseTo(25, 3);
  });

  it("BORRAR EL PESO Y VOLVER A PESAR no duplica el libro — ni a mano ni por recipiente", async () => {
    const a = await cosecha();
    await completarCierreDeCosecha(operario, { apiaryHarvestEventId: a.id, extractedWeightKg: 30 });
    await completarCierreDeCosecha(operario, { apiaryHarvestEventId: a.id, extractedWeightKg: null, reason: "mal pesado" });
    await anotarRecipiente(operario, { apiaryHarvestEventId: a.id, label: "b1", grossKg: 26, tareKg: 1 });
    expect(await saldo(a.resultingLotId)).toBeCloseTo(25, 3);

    const b = await cosecha();
    await completarCierreDeCosecha(operario, { apiaryHarvestEventId: b.id, extractedWeightKg: 30 });
    await completarCierreDeCosecha(operario, { apiaryHarvestEventId: b.id, extractedWeightKg: null, reason: "mal pesado" });
    await completarCierreDeCosecha(operario, { apiaryHarvestEventId: b.id, extractedWeightKg: 25 });
    expect(await saldo(b.resultingLotId)).toBeCloseTo(25, 3);
  });

  it("UNA TARA O UN BRUTO QUE FALTAN no son cero: se rechazan", async () => {
    const h = await cosecha();
    await expect(anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: "" })).rejects.toThrow(/pesos_imposibles/);
    await expect(anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: "  ", tareKg: 1 })).rejects.toThrow(/pesos_imposibles/);
    const cero = await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: "26", tareKg: "0" });
    expect(cero.totalKg).toBeCloseTo(26, 3); // el control: un cero ESCRITO sí vale
  });
});

// Revisión de Codex: el cierre a mano leía los recipientes FUERA de la transacción, y sin un orden
// entre quienes cambian el peso de la misma cosecha, dos escrituras a la vez suman sobre un total
// viejo. La invariante que se exige: peso de la cosecha = saldo del libro = suma de los netos.
describe("a la vez sobre la misma cosecha (Codex)", () => {
  async function invariante(id: string, lotId: string) {
    const fila = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id }, include: { containers: true } });
    const netos = fila.containers.reduce((t, c) => t + Number(c.grossKg) - Number(c.tareKg), 0);
    return { peso: Number(fila.extractedWeightKg), libro: await saldo(lotId), netos, recipientes: fila.containers.length };
  }

  it("SEIS RECIPIENTES A LA VEZ: el peso y el libro son la suma de los seis", async () => {
    const h = await cosecha();
    const todos = await Promise.allSettled(
      [1, 2, 3, 4, 5, 6].map((i) => anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: `b${i}`, grossKg: 10 + i, tareKg: 1 })),
    );
    expect(todos.filter((r) => r.status === "rejected")).toEqual([]);
    const v = await invariante(h.id, h.resultingLotId);
    expect(v.recipientes).toBe(6); // el control: entraron los seis
    expect(v.peso).toBeCloseTo(75, 3);
    expect(v.libro).toBeCloseTo(75, 3);
  });

  it("UN CIERRE A MANO CRUZADO CON UN RECIPIENTE: gane quien gane, peso, libro y netos coinciden", async () => {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const h = await cosecha();
      await Promise.allSettled([
        completarCierreDeCosecha(operario, { apiaryHarvestEventId: h.id, extractedWeightKg: 40 }),
        anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: 1 }),
      ]);
      const v = await invariante(h.id, h.resultingLotId);
      expect(v.recipientes).toBe(1); // el recipiente entra siempre; el cierre puede perder
      expect(v.peso).toBeCloseTo(25, 3);
      expect(v.libro).toBeCloseTo(25, 3);
    }
  });
});

// Segunda revisión de Codex: lo aportado cuenta TODOS los «recibido» del lote, así que uno genérico
// se tomaba por peso de la cosecha; y la recuperación de `cosechasSinSaldo` escribía sin el bloqueo.
describe("nadie más escribe el peso de la cosecha por su cuenta (Codex, segunda vuelta)", () => {
  it("UN «RECIBIDO» GENÉRICO SOBRE UN LOTE DE COSECHA se rechaza; un ajuste sí entra", async () => {
    const h = await cosecha();
    const base = { lotId: h.resultingLotId, quantity: 10, unit: "kg", occurredAt: dia("2026-05-04"), provenanceClass: "direct_observation" as const };
    await expect(recordQuantityEvent(adminId, { ...base, eventType: "received" })).rejects.toThrow(/recibido_de_cosecha_solo_por_su_peso/);
    // el control: el mismo usuario, el mismo lote, otro tipo — el rechazo no es de permiso
    await recordQuantityEvent(adminId, { ...base, eventType: "adjustment_increase" });
    expect(await saldo(h.resultingLotId)).toBeCloseTo(10, 3);
    // y ese ajuste sin etiqueta no se toma por peso de la cosecha
    await anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: 1 });
    expect(await saldo(h.resultingLotId)).toBeCloseTo(35, 3);
  });

  it("LA RECUPERACIÓN HISTÓRICA CRUZADA CON UN RECIPIENTE: peso y libro coinciden", async () => {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      const h = await cosecha();
      await prisma.apiaryHarvestEvent.update({ where: { id: h.id }, data: { extractedWeightKg: 30 } }); // como antes de ADR-161
      await Promise.allSettled([
        asentarPesoDeCosecha(adminId, h.id),
        anotarRecipiente(operario, { apiaryHarvestEventId: h.id, label: "b1", grossKg: 26, tareKg: 1 }),
      ]);
      const fila = await prisma.apiaryHarvestEvent.findUniqueOrThrow({ where: { id: h.id }, include: { containers: true } });
      expect(fila.containers.length).toBe(1); // el recipiente entra siempre; la recuperación puede perder
      expect(Number(fila.extractedWeightKg)).toBeCloseTo(25, 3);
      expect(await saldo(h.resultingLotId)).toBeCloseTo(25, 3);
    }
  });
});
