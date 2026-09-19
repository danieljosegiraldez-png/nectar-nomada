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
  await prisma.location.deleteMany({ where: { id: { in: [...creadas].reverse() } } });
  await f.limpiar();
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
    const rutina = await prisma.careRoutine.create({ data: { locationId: finca.id, kind: "fumigacion", intervalDays: 30 } });
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
