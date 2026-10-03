import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";
import { updateLocationAttributes } from "../../lib/traceability/locations";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Que `getPlotDetail` **exponga** la comparación, que es la otra mitad de la
 * tarea 6.
 *
 * La aritmética ya la prueba `comparacionDeLaRejilla.test.ts`, que es hermética.
 * Lo que aquí se mide es el cableado, y en particular **el caso que más fácil se
 * escribe mal: una microparcela no tiene rejilla propia** (D3: la numeración es
 * una, la de la parcela), así que hay que resolverla en la madre. Leer sólo la
 * columna propia diría `sin_rejilla` de una microparcela que sí está numerada.
 *
 * El ámbito de PLATAFORMA no se borra: `crearUsuarioConAcceso` devuelve el
 * compartido y quitarlo se lo quita a los archivos que corren en paralelo.
 */

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;
let microIds: string[] = [];
let cohorteIds: string[] = [];

const REJILLA = { gridOrigin: "noroeste" as const, rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 };

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela();
});

afterEach(async () => {
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ id: { in: cohorteIds } }) });
  cohorteIds = [];
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: microIds } }) });
  microIds = [];
  await prisma.location.update({
    where: { id: parcela.id },
    data: { gridOrigin: null, rowCount: null, plantsPerRow: null, rowSpacingMeters: null },
  });
});

afterAll(async () => {
  await prisma.auditEvent.deleteMany({
    where: assertDefinedWhere({ actorUserAccountId: usuario.userAccountId }),
  });
  await prisma.location.deleteMany({
    where: assertDefinedWhere({ id: { in: [parcela.id, parcela.parentLocationId ?? parcela.id] } }),
  });
  await prisma.assignment.deleteMany({
    where: assertDefinedWhere({ userAccountId: usuario.userAccountId }),
  });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  await prisma.organization.deleteMany({
    where: assertDefinedWhere({ id: parcela.organizationId ?? "" }),
  });
});

async function siembra(locationId: string, plantCount: number | null) {
  const c = await prisma.plantingCohort.create({
    data: {
      locationId,
      plantCount,
      status: "active",
      plantedAt: new Date("2024-05-01T00:00:00Z"),
      provenanceClass: "original_record",
      createdBy: usuario.userAccountId,
    },
  });
  cohorteIds.push(c.id);
  return c;
}

describe("getPlotDetail expone la comparación con la rejilla", () => {
  it("sin rejilla declarada dice sin_rejilla", async () => {
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.rejilla.status).toBe("sin_rejilla");
  });

  /** El control positivo del cableado: con rejilla y sin siembras, la capacidad. */
  it("con rejilla y sin siembras dice sin_cohortes con su capacidad", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.rejilla).toMatchObject({ status: "sin_cohortes", capacidad: 200 });
  });

  it("con todo contado compara", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await siembra(parcela.id, 140);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.rejilla).toMatchObject({ status: "ok", capacidad: 200, contadas: 140, diferencia: 60 });
  });

  /**
   * **El caso del cableado, y el que el plan llama «140 contadas, y 1 siembra sin
   * contar»** (decisión de Daniel, 2026-10-01): con una siembra sin conteo NO se
   * compara, y se dice cuántas faltan por contar.
   */
  it("con una siembra sin conteo dice conteo_incompleto y no compara", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await siembra(parcela.id, 140);
    await siembra(parcela.id, null);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.rejilla).toMatchObject({
      status: "conteo_incompleto",
      capacidad: 200,
      contadas: 140,
      cohortesSinConteo: 1,
      cohortesTotales: 2,
    });
    expect(d.rejilla).not.toHaveProperty("diferencia");
  });

  /**
   * **La microparcela resuelve su rejilla en la MADRE, y su capacidad es su
   * rango.** Es el caso que el cableado puede escribir mal de dos maneras: leer
   * sólo la columna propia —y decir `sin_rejilla` de algo numerado— o usar la
   * capacidad de la madre entera, y entonces decirle que le faltan 130 plantas
   * por un suelo que no es suyo.
   */
  it("una microparcela con rango: la rejilla sale de la madre y la capacidad es su rango", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const m = await prisma.location.create({
      data: {
        name: `TEST Micro Alta ${Date.now()}`,
        locationType: "plot",
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        status: "approved",
        rangeRowFrom: 1,
        rangeRowTo: 4,
        rangePlantFrom: 1,
        rangePlantTo: 20,
      },
    });
    microIds.push(m.id);
    await siembra(m.id, 70);
    const d = await getPlotDetail(usuario.userAccountId, m.id);
    expect(d.rejilla).toMatchObject({ status: "ok", capacidad: 80, contadas: 70, diferencia: 10 });
  });

  /**
   * **ESTA PRUEBA CERTIFICABA UN DEFECTO, y es la corrección más importante de la
   * revisión del 2026-10-02.** Decía que una microparcela sin rango «toma la
   * capacidad de la madre», y lo daba por bueno. No lo es: su suelo es el trozo
   * que ocupa, así que compararla contra las 200 de la madre pinta «una diferencia
   * de 130» sobre un suelo que no es suyo.
   *
   * Y le pasaría a todas: medido el mismo día, **cero** archivos de `app/` pueden
   * declarar ese rango. Una prueba que certifica un defecto hace más daño que la
   * ausencia de prueba: convierte el defecto en la conducta esperada.
   *
   * Ahora afirma lo correcto — `sin_rango`, sin ningún número — y sigue sirviendo
   * de control de la de arriba: con rango compara, sin rango no.
   */
  it("una microparcela SIN rango no se compara: dice sin_rango, sin números", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const m = await prisma.location.create({
      data: {
        name: `TEST Micro Sin Rango ${Date.now()}`,
        locationType: "plot",
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        status: "approved",
      },
    });
    microIds.push(m.id);
    await siembra(m.id, 70);
    const d = await getPlotDetail(usuario.userAccountId, m.id);
    expect(d.rejilla.status).toBe("sin_rango");
    expect(d.rejilla, "la capacidad de la madre no es la suya").not.toHaveProperty("capacidad");
    expect(d.rejilla).not.toHaveProperty("diferencia");
  });
});
