import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
const creadas: string[] = [];
const loc = async (data: { locationType: "site" | "beneficio" | "plot" | "storage_facility"; parentLocationId?: string }) => {
  const l = await prisma.location.create({
    data: { ...data, name: `TEST esq ${f.run} ${Math.random()}`, organizationId: f.orgA, status: "approved", classification: "internal" },
  });
  creadas.push(l.id);
  return l;
};

beforeAll(async () => {
  f = await montarFixtures("esqbod");
});
afterAll(async () => {
  const errores: unknown[] = [];
  // Un `it` puede dejar una `CareRoutine` (RESTRICT) colgada de uno de estos
  // lugares si falla entre crearla y borrarla (p. ej. la del beneficio, en
  // «una rutina de LUGAR sólo cuelga de un tipo que la admite»); quitarla
  // primero para que el borrado de lugares de abajo no choque con ella.
  try {
    await prisma.careRoutine.deleteMany({ where: { locationId: { in: creadas } } });
  } catch (e) {
    errores.push(e);
  }
  // Uno por uno, en orden hijo-a-padre (`creadas` está en orden de
  // creación, así que invertido borra primero lo más reciente): si UNO
  // falla, no se abandona el resto.
  for (const id of [...creadas].reverse()) {
    try {
      await prisma.location.deleteMany({ where: { id } });
    } catch (e) {
      errores.push(e);
    }
  }
  try {
    await f.limpiar();
  } catch (e) {
    errores.push(e);
  }
  if (errores.length) throw errores[0];
});

describe("la bodega cuelga de un beneficio o de una finca, en la base", () => {
  it("bajo una finca entra", async () => {
    const finca = await loc({ locationType: "site" });
    await expect(loc({ locationType: "storage_facility", parentLocationId: finca.id })).resolves.toBeTruthy();
  });
  it("bajo un beneficio entra", async () => {
    const finca = await loc({ locationType: "site" });
    const ben = await loc({ locationType: "beneficio", parentLocationId: finca.id });
    await expect(loc({ locationType: "storage_facility", parentLocationId: ben.id })).resolves.toBeTruthy();
  });
  it("bajo una parcela se rechaza", async () => {
    const parcela = await loc({ locationType: "plot" });
    await expect(loc({ locationType: "storage_facility", parentLocationId: parcela.id })).rejects.toThrow(/bodega_padre_invalido/);
  });
  it("sin padre se rechaza", async () => {
    await expect(loc({ locationType: "storage_facility" })).rejects.toThrow(/bodega_padre_invalido/);
  });
});

describe("un consumo tiene a lo sumo un padre, en la base", () => {
  it("con lugar y rutina a la vez se rechaza", async () => {
    const finca = await loc({ locationType: "site" });
    // Una `site` no admite rutina propia (trigger `care_routine_lugar_valido`,
    // migración 20260919201000); un `beneficio` debajo sí.
    const beneficio = await loc({ locationType: "beneficio", parentLocationId: finca.id });
    const rutina = await prisma.careRoutine.create({ data: { locationId: beneficio.id, kind: "fumigacion", intervalDays: 30 } });
    const ev = await prisma.careRoutineEvent.create({ data: { routineId: rutina.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record" } });
    try {
      await expect(
        prisma.materialConsumptionEntry.create({
          data: { materialName: "TEST", batchLabel: "TEST", locationId: finca.id, careRoutineEventId: ev.id, provenanceClass: "original_record" },
        }),
      ).rejects.toThrow(/material_consumption_entry_un_padre/);
      // Control positivo: con UN padre sí entra.
      const ok = await prisma.materialConsumptionEntry.create({
        data: { materialName: "TEST", batchLabel: "TEST", careRoutineEventId: ev.id, provenanceClass: "original_record" },
      });
      await prisma.materialConsumptionEntry.delete({ where: { id: ok.id } });
    } finally {
      await prisma.careRoutineEvent.deleteMany({ where: { routineId: rutina.id } });
      await prisma.careRoutine.delete({ where: { id: rutina.id } });
    }
  });
});

// Los tres siguientes son de la revisión independiente de Codex sobre esta
// rama, plegados en la ola de arreglos de revisión final (2026-09-19):
// Hallazgos C, D y E, migración 20260919201000.

describe("una rutina de LUGAR sólo cuelga de un tipo que la admite, en la base", () => {
  it("una finca (site) se rechaza; un beneficio debajo entra", async () => {
    const finca = await loc({ locationType: "site" });
    await expect(
      prisma.careRoutine.create({ data: { locationId: finca.id, kind: "limpieza", intervalDays: 7 } }),
    ).rejects.toThrow(/rutina_lugar_invalido/);
    // Control positivo: un beneficio SÍ admite.
    const beneficio = await loc({ locationType: "beneficio", parentLocationId: finca.id });
    const r = await prisma.careRoutine.create({ data: { locationId: beneficio.id, kind: "limpieza", intervalDays: 7 } });
    await prisma.careRoutine.delete({ where: { id: r.id } });
  });
});

describe("un padre que deja de admitir bodegas no puede quedarse con una debajo, en la base", () => {
  it("con una bodega debajo se rechaza; la misma transición sin bodega entra", async () => {
    const finca = await loc({ locationType: "site" });
    await loc({ locationType: "storage_facility", parentLocationId: finca.id });
    await expect(prisma.location.update({ where: { id: finca.id }, data: { locationType: "plot" } })).rejects.toThrow(/bodega_padre_invalido/);
    // Control positivo: la MISMA transición, sin bodega debajo, sí entra.
    const fincaVacia = await loc({ locationType: "site" });
    await expect(prisma.location.update({ where: { id: fincaVacia.id }, data: { locationType: "plot" } })).resolves.toBeTruthy();
  });
});

describe("el insumo de una rutina es de la MISMA organización que su lugar, en la base", () => {
  it("un lote de otra organización se rechaza; uno de la misma organización entra", async () => {
    const finca = await loc({ locationType: "site" });
    const beneficio = await loc({ locationType: "beneficio", parentLocationId: finca.id });
    const rutina = await prisma.careRoutine.create({ data: { locationId: beneficio.id, kind: "limpieza", intervalDays: 7 } });
    const ev = await prisma.careRoutineEvent.create({ data: { routineId: rutina.id, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record" } });
    const orgB = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST orgB ${f.run}`, status: "approved", classification: "internal" } })).id;
    const matA = await prisma.consumableMaterial.create({ data: { name: `TEST matA ${f.run}`, defaultUnit: "kg", organizationId: f.orgA } });
    const matB = await prisma.consumableMaterial.create({ data: { name: `TEST matB ${f.run}`, defaultUnit: "kg", organizationId: orgB } });
    const loteA = await prisma.consumableLot.create({ data: { materialId: matA.id, batchLabel: "TEST LA", receivedAt: new Date("2026-08-01T00:00:00Z") } });
    const loteB = await prisma.consumableLot.create({ data: { materialId: matB.id, batchLabel: "TEST LB", receivedAt: new Date("2026-08-01T00:00:00Z") } });
    try {
      await expect(
        prisma.materialConsumptionEntry.create({
          data: { materialName: "TEST", batchLabel: "TEST", careRoutineEventId: ev.id, consumableLotId: loteB.id, provenanceClass: "original_record" },
        }),
      ).rejects.toThrow(/insumo_de_otra_organizacion/);
      // Control positivo: mismo organización sí entra.
      const ok = await prisma.materialConsumptionEntry.create({
        data: { materialName: "TEST", batchLabel: "TEST", careRoutineEventId: ev.id, consumableLotId: loteA.id, provenanceClass: "original_record" },
      });
      await prisma.materialConsumptionEntry.delete({ where: { id: ok.id } });
    } finally {
      await prisma.consumableLot.deleteMany({ where: { id: { in: [loteA.id, loteB.id] } } });
      await prisma.consumableMaterial.deleteMany({ where: { id: { in: [matA.id, matB.id] } } });
      await prisma.organization.delete({ where: { id: orgB } });
      await prisma.careRoutineEvent.deleteMany({ where: { routineId: rutina.id } });
      await prisma.careRoutine.delete({ where: { id: rutina.id } });
    }
  });
});
