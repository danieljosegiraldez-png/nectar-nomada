import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearConsumoEnTx, MaterialConsumptionValidationError, recordMaterialConsumptionEntry } from "../../lib/traceability/operations";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let rutina: string;
let evento: string;

beforeAll(async () => {
  f = await montarFixtures("cons");
  rutina = (await prisma.careRoutine.create({ data: { locationId: f.sitioA, kind: "fumigacion", intervalDays: 30 } })).id;
  evento = (await prisma.careRoutineEvent.create({ data: { routineId: rutina, performedOn: new Date("2026-09-01T00:00:00Z"), provenanceClass: "original_record" } })).id;
});
afterAll(async () => {
  await prisma.materialConsumptionEntry.deleteMany({ where: { careRoutineEventId: evento } });
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: rutina } });
  await prisma.careRoutine.delete({ where: { id: rutina } });
  await f.limpiar();
});

describe("crearConsumoEnTx", () => {
  it("cuelga el consumo de la vez que se hizo la rutina, con su AuditEvent en la misma transacción", async () => {
    const c = await prisma.$transaction((tx) =>
      crearConsumoEnTx(tx, f.jefeA, {
        parent: { kind: "careRoutineEvent", careRoutineEventId: evento },
        materialName: "TEST cal",
        batchLabel: "TEST L1",
        provenanceClass: "original_record",
      }),
    );
    expect(c.careRoutineEventId).toBe(evento);
    expect(c.locationId).toBeNull();
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "material_consumption_entry", entityId: c.id } });
    expect(ev).not.toBeNull();
  });
  it("si la transacción de fuera falla, no queda el consumo", async () => {
    const antes = await prisma.materialConsumptionEntry.count({ where: { careRoutineEventId: evento } });
    await expect(
      prisma.$transaction(async (tx) => {
        await crearConsumoEnTx(tx, f.jefeA, { parent: { kind: "careRoutineEvent", careRoutineEventId: evento }, materialName: "TEST", batchLabel: "TEST", provenanceClass: "original_record" });
        throw new Error("falla_de_fuera");
      }),
    ).rejects.toThrow("falla_de_fuera");
    expect(await prisma.materialConsumptionEntry.count({ where: { careRoutineEventId: evento } })).toBe(antes);
  });
});

describe("recordMaterialConsumptionEntry", () => {
  it("no acepta el padre de rutina: ése lo crea el servicio de rutinas", async () => {
    await expect(
      recordMaterialConsumptionEntry(f.jefeA, { parent: { kind: "careRoutineEvent", careRoutineEventId: evento }, materialName: "TEST", batchLabel: "TEST", provenanceClass: "original_record" }),
    ).rejects.toThrow(new MaterialConsumptionValidationError("consumo_de_rutina_por_su_servicio"));
  });
});
