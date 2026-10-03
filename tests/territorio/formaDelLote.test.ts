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

let actor: string;
let personaId: string;
let fincaId: string;
let organizacionId: string;
let parcelaId: string;
let parcelaSinRejillaId: string;

beforeAll(async () => {
  const u = await crearUsuarioConAcceso();
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
