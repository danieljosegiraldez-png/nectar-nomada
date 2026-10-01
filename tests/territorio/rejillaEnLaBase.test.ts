import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Las reglas de la rejilla **en la base**, no en el servicio.
 *
 * Diseño §5.1 de `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md`,
 * decisiones D3, D4 y D7. Están aquí y no en TypeScript porque una restricción
 * que vive en el servicio **no existe para la base**: un importador, una
 * reparación operativa o SQL directo se la saltan. El servicio da el mensaje; la
 * base da la garantía.
 *
 * **La limpieza NO borra el ámbito de plataforma.** `crearUsuarioConAcceso`
 * devuelve el ámbito COMPARTIDO (`tests/helpers/ambitoDePlataforma.ts` dice «NO
 * lo borres»), y `assignment.scope_id` es `RESTRICT`: borrarlo revienta el
 * `afterEach` y además se lo quita a los archivos que corren en paralelo. Por
 * eso el usuario y la parcela se crean una sola vez en `beforeAll` y este
 * archivo nunca toca `scope`, `userAccount` ni `person`.
 */

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;
let especimenIds: string[] = [];
let microIds: string[] = [];

const REJILLA = { gridOrigin: "noroeste" as const, rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 };

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela();
});

afterEach(async () => {
  await prisma.plotBlockRange.deleteMany({
    where: assertDefinedWhere({ createdBy: usuario.userAccountId }),
  });
  await prisma.plotBlock.deleteMany({
    where: assertDefinedWhere({ locationId: { in: [parcela.id, ...microIds] } }),
  });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ id: { in: especimenIds } }) });
  especimenIds = [];
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: microIds } }) });
  microIds = [];
  // La rejilla se desarma SIEMPRE: cada prueba la declara, y dejarla puesta
  // haría que la siguiente heredara un estado que no pidió.
  await prisma.location.update({
    where: { id: parcela.id },
    data: { gridOrigin: null, rowCount: null, plantsPerRow: null, rowSpacingMeters: null },
  });
});

const conRejilla = () =>
  prisma.location.update({ where: { id: parcela.id }, data: REJILLA });

const bloque = (name: string, blockType: "trampa" | "experimental" | null) =>
  prisma.plotBlock.create({
    data: { locationId: parcela.id, name, blockType, createdBy: usuario.userAccountId },
  });

describe("la rejilla de la parcela (D3)", () => {
  it("acepta una rejilla completa — el control positivo", async () => {
    const l = await conRejilla();
    expect(l.rowCount).toBe(10);
    expect(l.plantsPerRow).toBe(20);
  });

  it("rechaza media rejilla, y lo hace la BASE", async () => {
    await expect(
      prisma.location.update({ where: { id: parcela.id }, data: { rowCount: 10 } }),
    ).rejects.toThrow(/location_rejilla_completa/);
  });

  it("rechaza una rejilla de cero o negativa", async () => {
    await expect(
      prisma.location.update({
        where: { id: parcela.id },
        data: { ...REJILLA, rowCount: 0 },
      }),
    ).rejects.toThrow(/location_rejilla_positiva/);
  });
});

describe("el rango de la microparcela (D3)", () => {
  it("acepta un rango que cabe, y rechaza el que se sale", async () => {
    await conRejilla();
    const dentro = await prisma.location.create({
      data: {
        name: "Norte",
        locationType: "plot" as const,
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        createdBy: usuario.userAccountId,
        rangeRowFrom: 1,
        rangeRowTo: 4,
        rangePlantFrom: 1,
        rangePlantTo: 20,
      },
    });
    microIds.push(dentro.id);
    expect(dentro.rangeRowTo).toBe(4);

    await expect(
      prisma.location.create({
        data: {
          name: "Se sale",
          locationType: "plot" as const,
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          createdBy: usuario.userAccountId,
          rangeRowFrom: 1,
          rangeRowTo: 40,
          rangePlantFrom: 1,
          rangePlantTo: 20,
        },
      }),
    ).rejects.toThrow(/no cabe en la rejilla de la parcela/);
  });

  it("sin rejilla en la madre no hay rango que le quepa", async () => {
    await expect(
      prisma.location.create({
        data: {
          name: "Sin rejilla arriba",
          locationType: "plot" as const,
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          createdBy: usuario.userAccountId,
          rangeRowFrom: 1,
          rangeRowTo: 2,
          rangePlantFrom: 1,
          rangePlantTo: 2,
        },
      }),
    ).rejects.toThrow(/no tiene rejilla/);
  });

  it("medio rango lo rechaza el CHECK", async () => {
    await conRejilla();
    await expect(
      prisma.location.create({
        data: {
          name: "Medio rango",
          locationType: "plot" as const,
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          createdBy: usuario.userAccountId,
          rangeRowFrom: 1,
          rangeRowTo: 4,
        },
      }),
    ).rejects.toThrow(/location_rango_completo/);
  });
});

describe("encoger la rejilla (D4)", () => {
  /**
   * Las tres mitades de D4, y cada una con su propio `it` a propósito: si una
   * sola prueba cubriera las tres, una mutación que quitara el recorrido de las
   * plantas caería igual por el bloque y el flip-test no discriminaría.
   */
  it("CRECER es libre, con un bloque dentro", async () => {
    await conRejilla();
    const b = await bloque("Bloque Sombra", "experimental");
    await prisma.plotBlockRange.create({
      data: { plotBlockId: b.id, rowFrom: 1, rowTo: 8, plantFrom: 1, plantTo: 20, createdBy: usuario.userAccountId },
    });
    const crecida = await prisma.location.update({
      where: { id: parcela.id },
      data: { rowCount: 12, plantsPerRow: 24 },
    });
    expect(crecida.rowCount).toBe(12);
  });

  it("encoger con un BLOQUE fuera se rechaza, y el error lo nombra", async () => {
    await conRejilla();
    const b = await bloque("Bloque Sombra", "experimental");
    await prisma.plotBlockRange.create({
      data: { plotBlockId: b.id, rowFrom: 1, rowTo: 8, plantFrom: 1, plantTo: 20, createdBy: usuario.userAccountId },
    });
    await expect(
      prisma.location.update({
        where: { id: parcela.id },
        data: { rowCount: 5, plantsPerRow: 20 },
      }),
    ).rejects.toThrow(/el bloque Bloque Sombra queda fuera/);
  });

  it("encoger con una MICROPARCELA fuera se rechaza, y el error la nombra", async () => {
    await conRejilla();
    const m = await prisma.location.create({
      data: {
        name: "Microparcela Alta",
        locationType: "plot" as const,
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        createdBy: usuario.userAccountId,
        rangeRowFrom: 7,
        rangeRowTo: 9,
        rangePlantFrom: 1,
        rangePlantTo: 20,
      },
    });
    microIds.push(m.id);
    await expect(
      prisma.location.update({
        where: { id: parcela.id },
        data: { rowCount: 5, plantsPerRow: 20 },
      }),
    ).rejects.toThrow(/la microparcela Microparcela Alta queda fuera/);
  });

  /**
   * **Decisión de Daniel, 2026-10-01: las plantas cuentan.** Un `Specimen` con
   * `gridRow`/`gridPosition` fuera de la rejilla nueva es una fila real con
   * historia; dejarla apuntando a una celda que ya no existe es peor que negar
   * el encogimiento.
   */
  it("encoger con una PLANTA fuera se rechaza, y el error dice dónde estaba", async () => {
    await conRejilla();
    const s = await prisma.specimen.create({
      data: {
        locationId: parcela.id,
        specimenType: "plant",
        commonName: "Cafeto de la hilera 9",
        gridRow: 9,
        gridPosition: 3,
        createdBy: usuario.userAccountId,
        provenanceClass: "original_record",
      },
    });
    especimenIds.push(s.id);
    await expect(
      prisma.location.update({
        where: { id: parcela.id },
        data: { rowCount: 5, plantsPerRow: 20 },
      }),
    ).rejects.toThrow(/hilera 9, planta 3/);
  });
});

describe("los solapes dependen del tipo de bloque (D7)", () => {
  const RANGO = { rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 10 };

  it("dos bloques de TRAMPA no cubren las mismas celdas", async () => {
    await conRejilla();
    const t1 = await bloque("Trampas Alto", "trampa");
    const t2 = await bloque("Trampas Bajo", "trampa");
    await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: t1.id, createdBy: usuario.userAccountId },
    });
    await expect(
      prisma.plotBlockRange.create({
        data: { ...RANGO, plotBlockId: t2.id, createdBy: usuario.userAccountId },
      }),
    ).rejects.toThrow(/se solapa con Trampas Alto/);
  });

  it("dos de trampa que NO se tocan sí entran — el control de que no rechaza de más", async () => {
    await conRejilla();
    const t1 = await bloque("Trampas Alto", "trampa");
    const t2 = await bloque("Trampas Bajo", "trampa");
    await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: t1.id, createdBy: usuario.userAccountId },
    });
    // Mismas hileras, plantas disjuntas: NO es solape. Un detector de una sola
    // dimensión rechazaría esto, y rechazar lo legítimo enseña a ignorar al guardia.
    const ok = await prisma.plotBlockRange.create({
      data: { rowFrom: 1, rowTo: 5, plantFrom: 11, plantTo: 20, plotBlockId: t2.id, createdBy: usuario.userAccountId },
    });
    expect(ok.plantFrom).toBe(11);
  });

  it("un EXPERIMENTAL puede solaparse con una trampa", async () => {
    await conRejilla();
    const t = await bloque("Trampas Alto", "trampa");
    const ex = await bloque("Ensayo A", "experimental");
    await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: t.id, createdBy: usuario.userAccountId },
    });
    const ok = await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: ex.id, createdBy: usuario.userAccountId },
    });
    expect(ok.rowFrom).toBe(1);
  });

  /**
   * ADR-080: «desconocido» no es «no es de trampa». Un bloque de antes del
   * 2026-09-19 puede tener el tipo en NULL —la migración
   * `20260919150000_bloque_sin_microparcela` dejó así a los que fueron
   * «microparcela»— y no se le puede aplicar una regla que depende de saber si
   * es de trampa.
   */
  it("un bloque SIN TIPO no bloquea a nadie", async () => {
    await conRejilla();
    const t = await bloque("Trampas Alto", "trampa");
    const sin = await bloque("Viejo sin tipo", null);
    await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: t.id, createdBy: usuario.userAccountId },
    });
    const ok = await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: sin.id, createdBy: usuario.userAccountId },
    });
    expect(ok.plotBlockId).toBe(sin.id);
  });

  it("un rango invertido o de cero lo rechaza el CHECK", async () => {
    await conRejilla();
    const b = await bloque("Ensayo A", "experimental");
    await expect(
      prisma.plotBlockRange.create({
        data: { rowFrom: 5, rowTo: 1, plantFrom: 1, plantTo: 10, plotBlockId: b.id, createdBy: usuario.userAccountId },
      }),
    ).rejects.toThrow(/plot_block_range_es_celda/);
    await expect(
      prisma.plotBlockRange.create({
        data: { rowFrom: 0, rowTo: 5, plantFrom: 1, plantTo: 10, plotBlockId: b.id, createdBy: usuario.userAccountId },
      }),
    ).rejects.toThrow(/plot_block_range_es_celda/);
  });
});
