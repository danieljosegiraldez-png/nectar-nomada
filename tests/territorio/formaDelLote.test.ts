/**
 * La forma de lo plantado: varios rectángulos cuya unión es el lote de verdad.
 *
 * **Por qué el tablero no basta** (D8/D9, 2026-10-02): el diseño del 2026-10-01
 * daba por supuesto un rectángulo perfecto, y la pantalla decía «caben 200 y hay
 * 150: una diferencia de 50» sobre un lote al que le falta una esquina, donde la
 * diferencia real es 20. Una afirmación que no se sostiene al desarmarla, que es lo
 * que `docs/beneficio/21_rubrica_veracidad.md` prohíbe.
 *
 * Aquí se prueba la GARANTÍA —los `CHECK` y el disparador—. Lo que cuenta las
 * celdas se prueba hermético en `tests/territorio/capacidadConForma.test.ts`.
 *
 * Grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { updateLocationAttributes } from "../../lib/traceability/locations";
import { crearFinca, crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";
import {
  declararTrozoDeForma,
  quitarTrozoDeForma,
} from "../../lib/traceability/formaDeLaParcela";
import { LocationAccessError, RejillaInvalida } from "../../lib/traceability/locations";
import { crearUsuarioSinAcceso } from "../helpers/traceability";

let actor: string;
let personaId: string;
let fincaId: string;
let organizacionId: string;
let parcelaId: string;
let parcelaSinRejillaId: string;
let ajeno: Awaited<ReturnType<typeof crearUsuarioSinAcceso>>;

beforeAll(async () => {
  const u = await crearUsuarioConAcceso();
  ajeno = await crearUsuarioSinAcceso();
  actor = u.userAccountId;
  personaId = u.personId;
  const finca = await crearFinca();
  fincaId = finca.id;
  organizacionId = finca.organizationId!;
  parcelaId = (await crearParcela(finca)).id;
  parcelaSinRejillaId = (await crearParcela(finca)).id;
  await updateLocationAttributes(actor, {
    locationId: parcelaId,
    gridOrigin: "noroeste",
    rowCount: 10,
    plantsPerRow: 20,
    rowSpacingMeters: 2.5,
  });
});

// En afterEach, no al final del cuerpo del `it`: una aserción que falla se salta lo
// que esté debajo y estas filas se quedarían en la base.
afterEach(async () => {
  await prisma.plotShapeRange.deleteMany({
    where: { locationId: { in: [parcelaId, parcelaSinRejillaId] } },
  });
});

afterAll(async () => {
  await prisma.plotShapeRange.deleteMany({
    where: { locationId: { in: [parcelaId, parcelaSinRejillaId] } },
  });
  await prisma.auditEvent.deleteMany({ where: { entityId: { in: [parcelaId, parcelaSinRejillaId] } } });
  await prisma.location.deleteMany({ where: { id: { in: [parcelaId, parcelaSinRejillaId] } } });
  await prisma.location.deleteMany({ where: { id: fincaId } });
  await prisma.organization.deleteMany({ where: { id: organizacionId } });
  // El `Assignment` sí; el `Scope` de plataforma NO, que es compartido.
  await prisma.assignment.deleteMany({ where: { userAccountId: actor } });
  await prisma.userAccount.deleteMany({ where: { id: actor } });
  await prisma.person.deleteMany({ where: { id: personaId } });
  // El ajeno trae su propia organización, su ubicación y un `Scope` de UBICACIÓN que
  // SÍ es suyo —a diferencia del de plataforma— y se borra después de su `Assignment`,
  // que lo referencia con `RESTRICT`. El orden lo mandan las claves ajenas.
  await prisma.auditEvent.deleteMany({ where: { actorUserAccountId: ajeno.userAccountId } });
  await prisma.location.deleteMany({ where: { id: ajeno.locationId } });
  await prisma.assignment.deleteMany({ where: { userAccountId: ajeno.userAccountId } });
  await prisma.userAccount.deleteMany({ where: { id: ajeno.userAccountId } });
  await prisma.person.deleteMany({ where: { id: ajeno.personId } });
  await prisma.scope.deleteMany({ where: { id: ajeno.scopeId } });
  await prisma.organization.deleteMany({ where: { id: ajeno.organizationId } });
});

const trozo = (
  rowFrom: number,
  rowTo: number,
  plantFrom: number,
  plantTo: number,
  locationId = parcelaId,
) =>
  prisma.plotShapeRange.create({
    data: { locationId, rowFrom, rowTo, plantFrom, plantTo, createdBy: actor },
  });

describe("la forma se declara con rectángulos que caben en el tablero", () => {
  it("un trozo dentro del tablero entra", async () => {
    const t = await trozo(1, 7, 1, 20);
    expect(t.rowTo).toBe(7);
    expect(t.createdBy).toBe(actor);
  });

  it("dos trozos describen una esquina cortada", async () => {
    await trozo(1, 7, 1, 20);
    await trozo(8, 10, 1, 12);
    const n = await prisma.plotShapeRange.count({ where: { locationId: parcelaId } });
    expect(n).toBe(2);
  });

  it("un trozo que se sale del tablero se rechaza, y el mensaje dice el tamaño", async () => {
    await expect(trozo(1, 99, 1, 20)).rejects.toThrow(/10 hileras x 20 plantas/);
  });

  it("un trozo que se sale por el ancho se rechaza", async () => {
    await expect(trozo(1, 5, 1, 21)).rejects.toThrow(/no cabe en la rejilla/);
  });

  it("un trozo al revés se rechaza", async () => {
    await expect(trozo(7, 3, 1, 20)).rejects.toThrow();
    await expect(trozo(1, 5, 15, 2)).rejects.toThrow();
  });

  it("el cero y lo negativo se rechazan: las celdas se cuentan desde 1", async () => {
    await expect(trozo(0, 5, 1, 20)).rejects.toThrow();
    await expect(trozo(1, 5, -2, 20)).rejects.toThrow();
  });

  /** El UPDATE es el otro camino, y un disparador que sólo cubre el INSERT se lee igual que uno completo. */
  it("mover un trozo fuera del tablero se rechaza también", async () => {
    const t = await trozo(1, 5, 1, 20);
    await expect(
      prisma.plotShapeRange.update({ where: { id: t.id }, data: { rowTo: 99 } }),
    ).rejects.toThrow(/no cabe en la rejilla/);
  });

  it("una parcela sin rejilla no puede declarar forma: no hay tablero que la contenga", async () => {
    await expect(trozo(1, 2, 1, 2, parcelaSinRejillaId)).rejects.toThrow(/no tiene rejilla/);
  });

  /**
   * **Que los trozos se PISEN entre sí está permitido**, y no es un descuido: la
   * unión se calcula por compresión de coordenadas, así que dos rectángulos que
   * comparten celdas no las cuentan dos veces. Prohibirlo obligaría a partir una
   * forma a mano en rectángulos disjuntos, que es trabajo de campo inventado.
   */
  it("dos trozos que se pisan entran: la unión se encarga de no contar dos veces", async () => {
    await trozo(1, 7, 1, 20);
    await trozo(5, 9, 1, 20);
    const n = await prisma.plotShapeRange.count({ where: { locationId: parcelaId } });
    expect(n).toBe(2);
  });
});

describe("declararTrozoDeForma y quitarTrozoDeForma", () => {
  /** Lo que la corrida cree haber creado, para que la limpieza lo alcance. */
  const plantados: string[] = [];

  afterEach(async () => {
    if (plantados.length) {
      await prisma.specimen.deleteMany({ where: { id: { in: plantados } } });
      plantados.length = 0;
    }
    // **Y los AuditEvent de la forma**, porque la prueba que los CUENTA depende de
    // empezar en cero. Sin esto, una prueba anterior que declare un trozo le deja uno
    // puesto y la cuenta sale 2 — me pasó al añadir la de la microparcela, cuyo evento
    // cae sobre la PARCELA (la raíz) y no sobre la microparcela que lo declaró.
    await prisma.auditEvent.deleteMany({
      where: {
        entityId: parcelaId,
        operation: { in: ["location.declare_shape_range", "location.remove_shape_range"] },
      },
    });
  });

  const plantar = async (gridRow: number, gridPosition: number) => {
    const s = await prisma.specimen.create({
      data: {
        locationId: parcelaId,
        specimenType: "plant",
        commonName: "TEST cafeto de la forma",
        provenanceClass: "direct_observation",
        gridRow,
        gridPosition,
      },
    });
    plantados.push(s.id);
    return s;
  };

  /**
   * **El trozo se cuelga de la RAÍZ de la numeración, no del sitio que lo declara.**
   *
   * D3: la numeración es una sola, la de la parcela, así que declararlo desde una
   * microparcela tiene que aterrizar en su madre. Si cayera en la microparcela, la forma
   * se partiría en dos sitios y `getPlotDetail` leería la de quien tiene rejilla propia —
   * o sea ninguna.
   *
   * **Esta prueba existe porque una mutación sobrevivió.** El flip cambió `locationId:
   * raiz` por `locationId: input.locationId` y **ninguna de las quince pruebas cayó**: la
   * decisión estaba en el mensaje del commit y en un comentario, sin guardia.
   */
  it("declarado desde una microparcela, el trozo aterriza en la PARCELA", async () => {
    const micro = await prisma.location.create({
      data: {
        name: `TEST Micro de la forma ${process.pid}`,
        locationType: "plot",
        parentLocationId: parcelaId,
        organizationId: organizacionId,
        status: "approved",
      },
    });
    const t = await declararTrozoDeForma(actor, {
      locationId: micro.id,
      rowFrom: 1,
      rowTo: 3,
      plantFrom: 1,
      plantTo: 5,
    });
    expect(t.locationId, "la forma es de quien pone la numeración").toBe(parcelaId);
    expect(t.locationId).not.toBe(micro.id);
    await prisma.plotShapeRange.deleteMany({ where: { id: t.id } });
    // El `AuditEvent` de esto cae sobre la PARCELA, no sobre la microparcela: lo limpia
    // el `afterEach` de este describe, que es donde tiene que estar.
    await prisma.location.deleteMany({ where: { id: micro.id } });
  });

  it("declara un trozo y deja su AuditEvent", async () => {
    const t = await declararTrozoDeForma(actor, {
      locationId: parcelaId,
      rowFrom: 1,
      rowTo: 7,
      plantFrom: 1,
      plantTo: 20,
    });
    expect(t.rowTo).toBe(7);
    const eventos = await prisma.auditEvent.count({
      where: { entityId: parcelaId, operation: "location.declare_shape_range" },
    });
    expect(eventos, "la auditoría va en la MISMA transacción").toBe(1);
  });

  /** La validación es la misma que la de los rangos de bloque, no una copia. */
  it("un trozo al revés vuelve con el código compartido, no con un error de Prisma", async () => {
    const caido = await declararTrozoDeForma(actor, {
      locationId: parcelaId,
      rowFrom: 7,
      rowTo: 3,
      plantFrom: 1,
      plantTo: 20,
    }).catch((e) => e);
    expect(caido).toBeInstanceOf(RejillaInvalida);
    expect(caido.message).toBe("rejilla_rango_al_reves");
  });

  it("un trozo que no cabe en el tablero vuelve traducido, no como P0001 crudo", async () => {
    const caido = await declararTrozoDeForma(actor, {
      locationId: parcelaId,
      rowFrom: 1,
      rowTo: 99,
      plantFrom: 1,
      plantTo: 20,
    }).catch((e) => e);
    expect(caido).toBeInstanceOf(RejillaInvalida);
    expect(caido.message).toBe("rejilla_rango_fuera_de_rejilla");
  });

  it("sin permiso no se declara nada", async () => {
    const caido = await declararTrozoDeForma(ajeno.userAccountId, {
      locationId: parcelaId,
      rowFrom: 1,
      rowTo: 2,
      plantFrom: 1,
      plantTo: 2,
    }).catch((e) => e);
    expect(caido).toBeInstanceOf(LocationAccessError);
  });

  /**
   * **§7.4: encoger la forma AVISA, no rechaza.** Rechazar obligaría a declarar como
   * plantado un terreno que no lo está — y el operario sabe algo que la base no.
   */
  it("quitar un trozo que deja plantas fuera lo quita y dice cuántas", async () => {
    const arriba = await declararTrozoDeForma(actor, {
      locationId: parcelaId, rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 20,
    });
    await declararTrozoDeForma(actor, {
      locationId: parcelaId, rowFrom: 6, rowTo: 10, plantFrom: 1, plantTo: 20,
    });
    await plantar(3, 3); // dentro del trozo que se va
    await plantar(8, 8); // en el que se queda
    const r = await quitarTrozoDeForma(actor, arriba.id);
    expect(r.plantasQueQuedanFuera).toBe(1);
    expect(
      await prisma.plotShapeRange.count({ where: { id: arriba.id } }),
      "se quita igual: avisa, no rechaza",
    ).toBe(0);
  });

  /** El caso negativo, sin el cual un aviso que se emite siempre pasaría por bueno. */
  it("quitar un trozo sin plantas dentro no avisa de ninguna", async () => {
    const vacio = await declararTrozoDeForma(actor, {
      locationId: parcelaId, rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 20,
    });
    await declararTrozoDeForma(actor, {
      locationId: parcelaId, rowFrom: 6, rowTo: 10, plantFrom: 1, plantTo: 20,
    });
    await plantar(8, 8); // sólo en el que se queda
    const r = await quitarTrozoDeForma(actor, vacio.id);
    expect(r.plantasQueQuedanFuera).toBe(0);
  });

  /**
   * **Quitar el ÚLTIMO trozo no deja a todas las plantas «fuera».** Sin forma declarada
   * el estado es «no se sabe», no «está vacío» (ADR-080) — y si esto devolviera el total
   * de plantas, borrar la forma entera avisaría de que ninguna planta está plantada.
   */
  it("quitar el último trozo no avisa: sin forma no se sabe, no es que estén fuera", async () => {
    const unico = await declararTrozoDeForma(actor, {
      locationId: parcelaId, rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 20,
    });
    await plantar(3, 3);
    const r = await quitarTrozoDeForma(actor, unico.id);
    expect(r.plantasQueQuedanFuera).toBe(0);
    expect(await prisma.plotShapeRange.count({ where: { locationId: parcelaId } })).toBe(0);
  });
});
