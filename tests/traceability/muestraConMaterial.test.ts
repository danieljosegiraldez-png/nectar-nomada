import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import type { Prisma } from "../../generated/prisma/client";

const sampleCodes: string[] = [];

async function crear(data: Partial<Prisma.SampleUncheckedCreateInput> = {}) {
  const lote = await prisma.lot.findFirstOrThrow();
  const sampleCode = `TEST-MAT-${randomUUID()}`;
  // Registrar ANTES de escribir: también limpia si un CHECK roto acepta la fila.
  sampleCodes.push(sampleCode);
  return prisma.sample.create({
    data: { sampleCode, sampleType: "green_coffee", sourceLotId: lote.id, ...data },
  });
}

afterEach(async () => {
  await prisma.sample.deleteMany({ where: { sampleCode: { in: sampleCodes } } });
  expect(await prisma.sample.count({ where: { sampleCode: { in: sampleCodes } } })).toBe(0);
  sampleCodes.length = 0;
});

describe("una muestra dice de qué material es y para qué se tomó", () => {
  it("guarda material, papel y tipo sin tocar el sampleType legado: control positivo de zona", async () => {
    const m = await crear({
      sampleKind: "MOISTURE", materialState: "PARCHMENT", samplingRole: "ZONE",
      samplingZone: "NORTH", samplingZoneNote: "junto a la entrada",
    });
    expect(m.materialState).toBe("PARCHMENT");
    expect(m.sampleKind).toBe("MOISTURE");
    expect(m.samplingRole).toBe("ZONE");
    expect(m.samplingZone).toBe("NORTH");
    expect(m.samplingZoneNote).toBe("junto a la entrada");
    expect(m.sampleType).toBe("green_coffee");
  });

  it("congela la instantánea en columnas consultables: control positivo de masa con unidad", async () => {
    const m = await crear({ stageAtExtraction: "drying", massAtExtraction: 12.3456,
      massUnitAtExtraction: "kg", moisturePctAtExtraction: 18.0 });
    const guardada = await prisma.sample.findUniqueOrThrow({ where: { id: m.id } });
    expect(guardada.stageAtExtraction).toBe("drying");
    expect(Number(guardada.massAtExtraction)).toBe(12.3456);
    expect(guardada.massUnitAtExtraction).toBe("kg");
    expect(Number(guardada.moisturePctAtExtraction)).toBe(18);
  });

  it("acepta el legado sin inventar material, papel, tipo ni instantánea", async () => {
    const m = await crear();
    expect(m.sampleType).toBe("green_coffee");
    for (const valor of [m.sampleKind, m.materialState, m.samplingRole, m.samplingZone,
      m.samplingZoneNote, m.stageAtExtraction, m.massAtExtraction,
      m.massUnitAtExtraction, m.moisturePctAtExtraction]) expect(valor).toBeNull();
  });

  it("acepta una réplica sin zona", async () => {
    const m = await crear({ samplingRole: "REPLICATE" });
    expect(m.samplingRole).toBe("REPLICATE");
    expect(m.samplingZone).toBeNull();
  });

  it("rechaza una zona sobre una réplica", async () => {
    await expect(crear({ samplingRole: "REPLICATE", samplingZone: "NORTH" }))
      .rejects.toThrow(/sample_zona_exige_papel_zona/);
  });

  it("rechaza una zona sin papel declarado", async () => {
    await expect(crear({ samplingZone: "NORTH" }))
      .rejects.toThrow(/sample_zona_exige_papel_zona/);
  });

  it("rechaza masa sin unidad", async () => {
    await expect(crear({ massAtExtraction: 1 }))
      .rejects.toThrow(/sample_masa_con_unidad/);
  });

  it("rechaza unidad sin masa", async () => {
    await expect(crear({ massUnitAtExtraction: "kg" }))
      .rejects.toThrow(/sample_masa_con_unidad/);
  });
});
