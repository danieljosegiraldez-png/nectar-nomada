/**
 * El tablero limita dónde se puede situar un plantón.
 *
 * **Existe porque el guardia estaba en UN SOLO SENTIDO.** El disparador
 * `location_exigir_rejilla_sin_huerfanos` impide ENCOGER la rejilla por debajo de
 * una planta existente, y nombra cuál («una planta en la hilera 9, planta 12»).
 * Pero no había ningún disparador sobre `traceability.specimen`, así que un plantón
 * se podía crear en la hilera 99 de un lote de 10 hileras. Medido el 2026-10-02: 0
 * disparadores sobre esa tabla, con el control de que el mismo archivo de migración
 * nombra `plot_block` 15 veces.
 *
 * Hoy ese agujero sólo se alcanza por SQL directo —0 archivos de `app/` y 0 scripts
 * nombran `grid_row`— así que esto es la **precondición** de las pantallas que van a
 * escribir esas coordenadas, no el arreglo de un fallo vivo. Un guardia añadido
 * después hereda las filas malas.
 *
 * Necesita base: grupo `base-sembrada` de `scripts/pruebas-por-compuerta.txt`.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { updateLocationAttributes } from "../../lib/traceability/locations";
import { createSpecimen, SpecimenValidationError } from "../../lib/traceability/specimens";
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

// **La limpieza va en afterEach, no al final del cuerpo del `it`.** Una aserción que
// falla se salta lo que esté debajo, y estas filas se quedarían en la base.
afterEach(async () => {
  await prisma.specimen.deleteMany({
    where: { locationId: { in: [parcelaId, parcelaSinRejillaId] } },
  });
});

afterAll(async () => {
  await prisma.specimen.deleteMany({
    where: { locationId: { in: [parcelaId, parcelaSinRejillaId] } },
  });
  await prisma.auditEvent.deleteMany({ where: { entityId: { in: [parcelaId, parcelaSinRejillaId] } } });
  await prisma.location.deleteMany({ where: { id: { in: [parcelaId, parcelaSinRejillaId] } } });
  await prisma.location.deleteMany({ where: { id: fincaId } });
  await prisma.organization.deleteMany({ where: { id: organizacionId } });
  // El `Assignment` sí; el `Scope` de plataforma NO — es compartido y lo reusan
  // siete archivos. Borrarlo dejaría a los demás sin ámbito.
  await prisma.assignment.deleteMany({ where: { userAccountId: actor } });
  await prisma.userAccount.deleteMany({ where: { id: actor } });
  await prisma.person.deleteMany({ where: { id: personaId } });
});

const plantar = (gridRow: number | null, gridPosition: number | null, locationId = parcelaId) =>
  prisma.specimen.create({
    data: {
      locationId,
      specimenType: "plant", // el enum SpecimenType sólo tiene `plant` y `trap`
      commonName: "TEST cafeto", // requerido, no opcional
      // Tambien requerido, y no tiene defecto: lo pasa siempre quien llama.
      // Una planta etiquetada en campo es una observacion directa.
      provenanceClass: "direct_observation",
      gridRow,
      gridPosition,
    },
  });

describe("el tablero limita dónde se sitúa un plantón", () => {
  it("una celda que existe entra", async () => {
    const s = await plantar(7, 12);
    expect(s.gridRow).toBe(7);
    expect(s.gridPosition).toBe(12);
  });

  it("una hilera que el tablero no tiene se rechaza, y el mensaje dice el tamaño", async () => {
    await expect(plantar(99, 1)).rejects.toThrow(/10 hileras x 20 plantas/);
  });

  it("una planta más allá del ancho se rechaza", async () => {
    await expect(plantar(1, 21)).rejects.toThrow(/no existe en la rejilla/);
  });

  it("el cero y lo negativo se rechazan: las celdas se cuentan desde 1", async () => {
    await expect(plantar(0, 1)).rejects.toThrow(/no existe en la rejilla/);
    await expect(plantar(1, -3)).rejects.toThrow(/no existe en la rejilla/);
  });

  /**
   * **Media coordenada SÍ entra, a propósito.** `lib/traceability/jornadasDeCosecha.ts`
   * imprime `${gridRow}-${gridPosition ?? "?"}`, así que el repositorio ya tolera
   * este caso. El disparador valida cada número contra su límite, no la pareja.
   */
  it("media coordenada entra, y la que está se valida igual", async () => {
    const s = await plantar(5, null);
    expect(s.gridRow).toBe(5);
    await expect(plantar(99, null)).rejects.toThrow(/no existe en la rejilla/);
  });

  it("sin coordenadas no se comprueba nada: un plantón puede no estar situado", async () => {
    const s = await plantar(null, null);
    expect(s.gridRow).toBeNull();
  });

  /** El UPDATE es el otro camino. Un disparador que sólo cubre el INSERT se lee igual que uno completo. */
  it("mover un plantón fuera del tablero se rechaza también", async () => {
    const s = await plantar(3, 3);
    await expect(
      prisma.specimen.update({ where: { id: s.id }, data: { gridRow: 99 } }),
    ).rejects.toThrow(/no existe en la rejilla/);
  });

  it("una parcela sin rejilla no admite coordenadas: no hay tablero donde situarlas", async () => {
    await expect(plantar(1, 1, parcelaSinRejillaId)).rejects.toThrow(/no tiene rejilla/);
  });

  /**
   * **El servicio tambien valida, y esto lo prueba.** Las de arriba usan
   * `prisma.specimen.create` a proposito, para ejercer la GARANTIA de la base
   * saltandose el servicio. Pero sin estas dos, mutar la validacion de
   * `createSpecimen` no tumbaria ninguna prueba: el cableado estaria sin cubrir.
   */
  describe("y el servicio da la frase antes de llegar a la base", () => {
    const porElServicio = (gridRow: number | null, gridPosition: number | null, locationId = parcelaId) =>
      createSpecimen(actor, {
        locationId,
        specimenType: "plant",
        commonName: "TEST cafeto por el servicio",
        provenanceClass: "direct_observation",
        gridRow,
        gridPosition,
      });

    it("una celda del tablero entra por el servicio", async () => {
      const s = await porElServicio(7, 12);
      expect(s.gridRow).toBe(7);
    });

    it("una celda fuera vuelve como SpecimenValidationError, no como un error de Prisma", async () => {
      const caido = await porElServicio(99, 1).catch((e) => e);
      expect(caido).toBeInstanceOf(SpecimenValidationError);
      expect(caido.message).toBe("celda_fuera_de_la_rejilla");
    });

    it("una parcela sin rejilla vuelve con su propio codigo", async () => {
      const caido = await porElServicio(1, 1, parcelaSinRejillaId).catch((e) => e);
      expect(caido).toBeInstanceOf(SpecimenValidationError);
      expect(caido.message).toBe("celda_sin_rejilla");
    });
  });
});
