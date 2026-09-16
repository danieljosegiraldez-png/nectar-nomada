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

  it("rechaza una corrida cuya cama no es una cama", async () => {
    const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
    try {
      await expect(
        prisma.dryingRun.create({
          data: { startedAt: new Date(), dryingBedLocationId: sitio.id },
        }),
      ).rejects.toThrow(/cama de secado/i);
    } finally {
      // Seguro por construcción: ninguna corrida legítima apunta su cama a
      // una Location de tipo `site`. Si el disparador alguna vez dejara pasar
      // esto, esta línea es la que evita que la fila quede en la base
      // compartida — se comprobó en vivo durante el flip-test del Paso 6.
      await prisma.dryingRun.deleteMany({ where: { dryingBedLocationId: sitio.id } });
    }
  });

  it("deja pasar una corrida sin cama asignada (el legado, sin rellenar hacia atrás)", async () => {
    const corrida = await prisma.dryingRun.create({
      data: { startedAt: new Date() },
    });
    try {
      expect(corrida.dryingBedLocationId).toBeNull();
    } finally {
      await prisma.dryingRun.delete({ where: { id: corrida.id } });
    }
  });

  it("deja pasar una corrida cuya cama sí es una cama de secado", async () => {
    const sitio = await prisma.location.findFirstOrThrow({ where: { locationType: "site" } });
    const inv = await prisma.location.create({
      data: {
        name: "TEST Invernadero control positivo", locationType: "drying_facility",
        parentLocationId: sitio.id, dryingEnvironment: "solar_greenhouse",
      },
    });
    try {
      const cama = await prisma.location.create({
        data: {
          name: "TEST Cama control positivo", locationType: "drying_bed",
          parentLocationId: inv.id, rackLevel: 1,
        },
      });
      try {
        const corrida = await prisma.dryingRun.create({
          data: { startedAt: new Date(), dryingBedLocationId: cama.id },
        });
        try {
          expect(corrida.dryingBedLocationId).toBe(cama.id);
        } finally {
          await prisma.dryingRun.delete({ where: { id: corrida.id } });
        }
      } finally {
        await prisma.location.delete({ where: { id: cama.id } });
      }
    } finally {
      await prisma.location.delete({ where: { id: inv.id } });
    }
  });
});
