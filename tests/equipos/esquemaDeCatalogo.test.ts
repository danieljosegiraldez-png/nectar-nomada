import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

/**
 * Las restricciones de catálogos y rutinas, probadas CONTRA LA BASE y sin
 * servicio delante: si una vive sólo en TypeScript, un importador o SQL directo
 * se la salta (regla de la casa). Cada rechazo lleva al lado su control
 * positivo —lo válido SÍ entra—, porque «no entró» sobre una fila que ni se
 * construyó no prueba nada.
 */
const RUN = `cat-${Date.now()}`;
let orgA: string, orgB: string, sitioA: string;
const modelos: string[] = [];
const equipos: string[] = [];
const rutinas: string[] = [];

async function rechaza(p: Promise<unknown>) {
  await expect(p).rejects.toThrow();
}

beforeAll(async () => {
  const org = (n: string) =>
    prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${n} ${RUN}`, status: "approved", classification: "internal" } });
  orgA = (await org("A")).id;
  orgB = (await org("B")).id;
  sitioA = (
    await prisma.location.create({
      data: { locationType: "plot", name: `TEST sitio ${RUN}`, organizationId: orgA, status: "approved", classification: "internal" },
    })
  ).id;
});

afterAll(async () => {
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: { in: rutinas } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rutinas } } });
  await prisma.equipment.deleteMany({ where: { id: { in: equipos } } });
  await prisma.equipmentModelSpec.deleteMany({ where: { modelId: { in: modelos } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: modelos } } });
  await prisma.location.deleteMany({ where: { id: sitioA } });
  await prisma.organization.deleteMany({ where: { id: { in: [orgA, orgB] } } });
});

// `Record` y no el tipo de entrada de Prisma: esa entrada es una unión
// (checked/unchecked) y `organizationId` sólo existe en una de las dos. Aquí se
// prueban restricciones de la BASE, a propósito con filas que el tipo rechazaría.
async function modelo(data: Record<string, unknown> & { manufacturer: string; modelName: string }) {
  const m = await prisma.equipmentModel.create({
    data: { kind: "instrument", provenanceClass: "manufacturer_specification", ...data } as never,
  });
  modelos.push(m.id);
  return m;
}

async function equipo(org: string, kind: "instrument" | "vessel", modelId: string | null) {
  const e = await prisma.equipment.create({
    data: { name: `TEST eq ${RUN} ${equipos.length}`, kind, organizationId: org, provenanceClass: "original_record", modelId },
  });
  equipos.push(e.id);
  return e;
}

describe("catálogo de modelos: unicidad sin mayúsculas ni espacios", () => {
  it("dos modelos iguales del mismo dueño chocan; compartido y propio no", async () => {
    await modelo({ manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1", organizationId: orgA });
    await rechaza(modelo({ manufacturer: ` atago ${RUN} `, modelName: "pal-1 ", organizationId: orgA }));
    // Control positivo: el mismo nombre compartido y en otra organización SÍ entra.
    await modelo({ manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1", organizationId: null });
    await modelo({ manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1", organizationId: orgB });
    await rechaza(modelo({ manufacturer: `atago ${RUN}`, modelName: "PAL-1", organizationId: null }));
  });
});

describe("catálogo de modelos: CHECK", () => {
  it("capacidad y material sólo en vaso o máquina", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "cap-instr", kind: "instrument", capacityValue: 10, capacityUnit: "L" }));
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "mat-instr", kind: "instrument", contactMaterial: "madera" }));
    await modelo({ manufacturer: `X ${RUN}`, modelName: "barrica", kind: "vessel", capacityValue: 225, capacityUnit: "L", contactMaterial: "madera" });
  });
  it("capacidad con valor y unidad juntos, o ninguno", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "sin-unidad", kind: "vessel", capacityValue: 10 }));
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "sin-valor", kind: "vessel", capacityUnit: "L" }));
  });
  it("material «otro» exige nota", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "otro-sin-nota", kind: "vessel", contactMaterial: "otro" }));
    await modelo({ manufacturer: `X ${RUN}`, modelName: "otro-con-nota", kind: "vessel", contactMaterial: "otro", contactMaterialNote: "cobre" });
  });
  it("mantenimiento recomendado > 0", async () => {
    await rechaza(modelo({ manufacturer: `X ${RUN}`, modelName: "cero-dias", recommendedMaintenanceDays: 0 }));
  });
  it("especificación: rango no invertido, resolución > 0, precisión ≥ 0", async () => {
    const m = await modelo({ manufacturer: `X ${RUN}`, modelName: "spec" });
    const spec = (d: object) => prisma.equipmentModelSpec.create({ data: { modelId: m.id, quantity: "sólidos solubles", unit: "°Bx", ...d } });
    await rechaza(spec({ rangeMin: 32, rangeMax: 0 }));
    await rechaza(spec({ resolution: 0 }));
    await rechaza(spec({ accuracyAbs: -0.1 }));
    await spec({ rangeMin: 0, rangeMax: 32, resolution: 0.1, accuracyAbs: 0.2 });
  });
});

describe("equipo y modelo: tipo y dueño coherentes en la base", () => {
  it("la FK compuesta rechaza un instrumento con modelo de vaso", async () => {
    const vaso = await modelo({ manufacturer: `X ${RUN}`, modelName: "tanque", kind: "vessel", organizationId: orgA });
    await rechaza(equipo(orgA, "instrument", vaso.id));
    await equipo(orgA, "vessel", vaso.id);
  });
  it("el disparador rechaza un modelo propio de otra organización y acepta uno compartido", async () => {
    const deB = await modelo({ manufacturer: `X ${RUN}`, modelName: "de-B", organizationId: orgB });
    const comp = await modelo({ manufacturer: `X ${RUN}`, modelName: "compartido", organizationId: null });
    await rechaza(equipo(orgA, "instrument", deB.id));
    await equipo(orgA, "instrument", comp.id);
  });
  it("código interno único por organización, sin mayúsculas", async () => {
    const a = await equipo(orgA, "instrument", null);
    await prisma.equipment.update({ where: { id: a.id }, data: { internalCode: `REF-${RUN}` } });
    const b = await equipo(orgA, "instrument", null);
    await rechaza(prisma.equipment.update({ where: { id: b.id }, data: { internalCode: ` ref-${RUN}` } }));
    const c = await equipo(orgB, "instrument", null);
    await prisma.equipment.update({ where: { id: c.id }, data: { internalCode: `REF-${RUN}` } });
  });
});

describe("rutinas: forma en la base", () => {
  it("exactamente uno de equipo o sitio", async () => {
    const e = await equipo(orgA, "instrument", null);
    await rechaza(prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7 } }));
    await rechaza(prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7, equipmentId: e.id, locationId: sitioA } }));
    const deSitio = await prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7, locationId: sitioA } });
    rutinas.push(deSitio.id);
  });
  it("intervalo > 0 y «otra» con nota", async () => {
    const e = await equipo(orgA, "instrument", null);
    await rechaza(prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 0, equipmentId: e.id } }));
    await rechaza(prisma.careRoutine.create({ data: { kind: "otra", intervalDays: 7, equipmentId: e.id } }));
  });
  it("una rutina activa por cosa y tipo; la retirada no cuenta", async () => {
    const e = await equipo(orgA, "instrument", null);
    const r1 = await prisma.careRoutine.create({ data: { kind: "mantenimiento", intervalDays: 30, equipmentId: e.id } });
    rutinas.push(r1.id);
    await rechaza(prisma.careRoutine.create({ data: { kind: "mantenimiento", intervalDays: 60, equipmentId: e.id } }));
    await prisma.careRoutine.update({ where: { id: r1.id }, data: { retiredAt: new Date() } });
    const r2 = await prisma.careRoutine.create({ data: { kind: "mantenimiento", intervalDays: 60, equipmentId: e.id } });
    rutinas.push(r2.id);
    // Dos «otra» con notas distintas conviven; con la misma nota, no.
    const o1 = await prisma.careRoutine.create({ data: { kind: "otra", kindNote: "engrase", intervalDays: 7, equipmentId: e.id } });
    rutinas.push(o1.id);
    const o2 = await prisma.careRoutine.create({ data: { kind: "otra", kindNote: "desinfección", intervalDays: 7, equipmentId: e.id } });
    rutinas.push(o2.id);
    await rechaza(prisma.careRoutine.create({ data: { kind: "otra", kindNote: " Engrase ", intervalDays: 7, equipmentId: e.id } }));
  });
  it("un registro anulado exige motivo", async () => {
    const e = await equipo(orgA, "instrument", null);
    const r = await prisma.careRoutine.create({ data: { kind: "limpieza", intervalDays: 7, equipmentId: e.id } });
    rutinas.push(r.id);
    await rechaza(
      prisma.careRoutineEvent.create({
        data: { routineId: r.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record", voidedAt: new Date() },
      }),
    );
    await prisma.careRoutineEvent.create({
      data: { routineId: r.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record", voidedAt: new Date(), voidReason: "fecha equivocada" },
    });
  });
});
