import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db";
import { crearRutina, registrarRealizada, RutinaError, rutinasDeLugar, vencidasPorLugar } from "../../lib/rutinas/rutinas";
import { lugarConRutinasOVacio, rutaDeLugar } from "../../lib/rutinas/lugares";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
const L: Record<string, string> = {};
let material: string;
let loteDeInsumo: string;
let loteAjeno: string;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

async function loc(nombre: string, locationType: "site" | "beneficio" | "drying_facility" | "drying_bed" | "storage_facility" | "plot", parentLocationId: string | null) {
  const l = await prisma.location.create({ data: { name: `TEST ${nombre} ${f.run}`, locationType, parentLocationId, organizationId: f.orgA, status: "approved", classification: "internal" } });
  L[nombre] = l.id;
  return l.id;
}

beforeAll(async () => {
  f = await montarFixtures("rutlug");
  await loc("finca", "site", f.sitioA);
  await loc("beneficio", "beneficio", L.finca!);
  await loc("cuarto", "drying_facility", L.finca!);
  await loc("cama", "drying_bed", L.cuarto!);
  await loc("bodega", "storage_facility", L.beneficio!);
  // Cama sin estante de secado (parte 2, drying_rack, aún no existe en el
  // esquema): cualquier padre que no sea drying_facility dispara
  // "rutina_en_el_estante", sea cual sea su tipo futuro.
  await loc("camaSuelta", "drying_bed", L.finca!);
  // Lugar sin organización (Location.organizationId es opcional; una bodega de
  // plataforma, no de una finca concreta), para probar que "insumo_ajeno" se
  // dispara igual cuando no hay organización con la que comparar.
  L.bodegaSinOrg = (
    await prisma.location.create({ data: { name: `TEST bodegaSinOrg ${f.run}`, locationType: "storage_facility", parentLocationId: L.finca!, organizationId: null, status: "approved", classification: "internal" } })
  ).id;
  const mat = await prisma.consumableMaterial.create({ data: { name: `TEST cal ${f.run}`, defaultUnit: "kg", organizationId: f.orgA } });
  material = mat.id;
  loteDeInsumo = (await prisma.consumableLot.create({ data: { materialId: material, batchLabel: `TEST L ${f.run}`, receivedAt: dia("2026-08-01") } })).id;
  await prisma.consumableStockEvent.create({ data: { consumableLotId: loteDeInsumo, eventType: "received", quantity: 10, unit: "kg", occurredAt: dia("2026-08-01"), provenanceClass: "original_record" } });
  const matB = await prisma.consumableMaterial.create({ data: { name: `TEST ajeno ${f.run}`, defaultUnit: "kg", organizationId: f.orgB } });
  loteAjeno = (await prisma.consumableLot.create({ data: { materialId: matB.id, batchLabel: `TEST LB ${f.run}`, receivedAt: dia("2026-08-01") } })).id;
});

afterAll(async () => {
  const rs = (await prisma.careRoutine.findMany({ where: { locationId: { in: Object.values(L) } }, select: { id: true } })).map((r) => r.id);
  const evs = (await prisma.careRoutineEvent.findMany({ where: { routineId: { in: rs } }, select: { id: true } })).map((e) => e.id);
  await prisma.materialConsumptionEntry.deleteMany({ where: { careRoutineEventId: { in: evs } } });
  await prisma.consumableStockEvent.deleteMany({ where: { consumableLotId: { in: [loteDeInsumo, loteAjeno] } } });
  await prisma.consumableLot.deleteMany({ where: { id: { in: [loteDeInsumo, loteAjeno] } } });
  await prisma.consumableMaterial.deleteMany({ where: { name: { contains: f.run } } });
  await prisma.careRoutineEvent.deleteMany({ where: { id: { in: evs } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rs } } });
  for (const n of ["bodega", "bodegaSinOrg", "camaSuelta", "cama", "cuarto", "beneficio", "finca"]) await prisma.location.deleteMany({ where: { id: L[n] } });
  await f.limpiar();
});

describe("qué lugares llevan rutinas", () => {
  for (const n of ["beneficio", "cuarto", "cama", "bodega"]) {
    it(`${n}: sí`, async () => {
      const r = await crearRutina(f.jefeA, { locationId: L[n]!, kind: "limpieza", intervalDays: 7 });
      expect(r.id).toBeTruthy();
    });
  }
  it("una finca: lugar_sin_rutinas", async () => {
    await expect(crearRutina(f.jefeA, { locationId: L.finca!, kind: "limpieza", intervalDays: 7 })).rejects.toThrow(new RutinaError("lugar_sin_rutinas"));
  });
  it("ni equipo ni lugar, o los dos: una_cosa", async () => {
    await expect(crearRutina(f.jefeA, { kind: "limpieza", intervalDays: 7 })).rejects.toThrow(new RutinaError("una_cosa"));
  });
});

describe("gestión define, faena apunta", () => {
  it("el operario no define", async () => {
    await expect(crearRutina(f.operarioA, { locationId: L.bodega!, kind: "fumigacion", intervalDays: 30 })).rejects.toThrow(new RutinaError("forbidden"));
  });
  it("el operario apunta", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.bodega!, kind: "fumigacion", intervalDays: 30 });
    await expect(registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-01"), provenanceClass: "original_record" })).resolves.toBeTruthy();
  });
  it("el ajeno no apunta", async () => {
    const r = await prisma.careRoutine.findFirstOrThrow({ where: { locationId: L.bodega!, kind: "fumigacion" } });
    await expect(registrarRealizada(f.ajeno, { routineId: r.id, performedOn: dia("2026-09-02"), provenanceClass: "original_record" })).rejects.toThrow(new RutinaError("forbidden"));
  });
});

describe("el producto", () => {
  it("dos insumos: dos consumos, un descuento por el que lleva cantidad, en la misma transacción", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.cuarto!, kind: "fumigacion", intervalDays: 30 });
    const ev = await registrarRealizada(f.operarioA, {
      routineId: r.id,
      performedOn: dia("2026-08-10"),
      provenanceClass: "original_record",
      insumos: [{ consumableLotId: loteDeInsumo, quantity: 2, unit: "kg" }, { consumableLotId: loteDeInsumo, quantity: null, unit: null }],
    });
    expect(await prisma.materialConsumptionEntry.count({ where: { careRoutineEventId: ev.id } })).toBe(2);
    expect(await prisma.consumableStockEvent.count({ where: { consumableLotId: loteDeInsumo, eventType: "consumed" } })).toBe(1);
  });
  it("si el segundo falla (unidad distinta), no queda NADA: ni la vez, ni el primer consumo", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.cama!, kind: "fumigacion", intervalDays: 30 });
    const antesEv = await prisma.careRoutineEvent.count({ where: { routineId: r.id } });
    const antesStock = await prisma.consumableStockEvent.count({ where: { consumableLotId: loteDeInsumo } });
    await expect(
      registrarRealizada(f.operarioA, {
        routineId: r.id,
        performedOn: dia("2026-08-11"),
        provenanceClass: "original_record",
        insumos: [{ consumableLotId: loteDeInsumo, quantity: 1, unit: "kg" }, { consumableLotId: loteDeInsumo, quantity: 1, unit: "galones" }],
      }),
    ).rejects.toThrow(/unidad distinta/);
    expect(await prisma.careRoutineEvent.count({ where: { routineId: r.id } })).toBe(antesEv);
    expect(await prisma.consumableStockEvent.count({ where: { consumableLotId: loteDeInsumo } })).toBe(antesStock);
  });
  it("un insumo de otra organización: insumo_ajeno", async () => {
    const r = await prisma.careRoutine.findFirstOrThrow({ where: { locationId: L.cuarto!, kind: "fumigacion" } });
    await expect(
      registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-08-12"), provenanceClass: "original_record", insumos: [{ consumableLotId: loteAjeno, quantity: 1, unit: "kg" }] }),
    ).rejects.toThrow(new RutinaError("insumo_ajeno"));
  });
  it("un lugar sin organización (organizationId null): cualquier insumo es insumo_ajeno", async () => {
    const r = await crearRutina(f.admin, { locationId: L.bodegaSinOrg!, kind: "limpieza", intervalDays: 7 });
    await expect(
      registrarRealizada(f.admin, {
        routineId: r.id,
        performedOn: dia("2026-08-13"),
        provenanceClass: "original_record",
        insumos: [{ consumableLotId: loteDeInsumo, quantity: 1, unit: "kg" }],
      }),
    ).rejects.toThrow(new RutinaError("insumo_ajeno"));
  });
});

describe("el aviso", () => {
  it("una fumigación cada 30 días hecha hace 40 sale vencida hace 10, y la lista la cuenta", async () => {
    const r = await crearRutina(f.jefeA, { locationId: L.beneficio!, kind: "fumigacion", intervalDays: 30 });
    await registrarRealizada(f.jefeA, { routineId: r.id, performedOn: dia("2026-08-01"), provenanceClass: "original_record" });
    const rs = await rutinasDeLugar(f.jefeA, L.beneficio!, "2026-09-10");
    const fum = rs.find((x) => x.id === r.id)!;
    expect(fum.estado).toMatchObject({ estado: "vencida", pasaron: 10 });
    const m = await vencidasPorLugar(f.jefeA, [L.beneficio!], "2026-09-10");
    expect(m.get(L.beneficio!)).toBeGreaterThanOrEqual(1);
  });
  it("los productos salen en el historial", async () => {
    const rs = await rutinasDeLugar(f.jefeA, L.cuarto!, "2026-09-10");
    const fum = rs.find((x) => x.kind === "fumigacion")!;
    expect(fum.registros[0]!.productos.map((p) => p.batchLabel)).toContain(`TEST L ${f.run}`);
  });
  it("el ajeno no ve las rutinas del lugar", async () => {
    await expect(rutinasDeLugar(f.ajeno, L.beneficio!, "2026-09-10")).rejects.toThrow(new RutinaError("forbidden"));
  });
});

describe("lugarConRutinasOVacio: no tumba la página en un lugar sin rutina", () => {
  it("una finca (site): no lanza, devuelve null en vez de lugar_sin_rutinas", async () => {
    await expect(lugarConRutinasOVacio(L.finca!)).resolves.toBeNull();
  });
  it("una cama sin estante de secado: no lanza, devuelve null en vez de rutina_en_el_estante", async () => {
    await expect(lugarConRutinasOVacio(L.camaSuelta!)).resolves.toBeNull();
  });
  it("un lugar con rutina: sí resuelve el lugar", async () => {
    const l = await lugarConRutinasOVacio(L.beneficio!);
    expect(l?.id).toBe(L.beneficio);
  });
  it("un id que no existe: relanza (no es 'sin rutinas', es un error del llamador)", async () => {
    await expect(lugarConRutinasOVacio(randomUUID())).rejects.toThrow(new RutinaError("lugar_no_encontrado"));
  });
});

describe("a dónde vuelve cada lugar", () => {
  it("bodega, instalación, cama y beneficio", () => {
    expect(rutaDeLugar({ id: "b", locationType: "storage_facility", parentLocationId: "x" })).toBe("/bodegas/b");
    expect(rutaDeLugar({ id: "i", locationType: "drying_facility", parentLocationId: "x" })).toBe("/instalaciones/i");
    expect(rutaDeLugar({ id: "c", locationType: "drying_bed", parentLocationId: "i" })).toBe("/instalaciones/i");
    expect(rutaDeLugar({ id: "z", locationType: "beneficio", parentLocationId: "x" })).toBe("/beneficio");
  });
});
