// tests/traceability/topologiaDeSecado.test.ts
import { describe, it, expect } from "vitest";
import { prisma } from "../../lib/db";

describe("una cama de secado es una Location, no una familia de entidades nueva", () => {
  it("cuelga la cama de la instalación y la instalación del sitio de la finca", async () => {
    const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
    const inv = await prisma.location.create({
      data: {
        name: "TEST Invernadero 1", locationType: "drying_facility",
        parentLocationId: sitio.id, dryingEnvironment: "solar_greenhouse",
      },
    });
    try {
      const cama = await prisma.location.create({
        data: {
          name: "TEST Cama 3", locationType: "drying_bed",
          parentLocationId: inv.id, rackLevel: 2,
        },
      });
      try {
        expect(cama.parentLocationId).toBe(inv.id);
        expect(inv.parentLocationId).toBe(sitio.id);
        expect(cama.rackLevel).toBe(2);
        // Control positivo: el nivel de rack es de la cama, no de la instalación.
        expect(inv.rackLevel).toBeNull();
      } finally {
        await prisma.location.delete({ where: { id: cama.id } });
      }
    } finally {
      await prisma.location.delete({ where: { id: inv.id } });
    }
  });
});
