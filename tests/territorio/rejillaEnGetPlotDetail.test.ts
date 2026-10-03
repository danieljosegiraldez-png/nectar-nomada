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
  // La forma se borra ANTES de anular la rejilla: un trozo que referencia un tablero
  // que ya no existe no debería quedarse. (Que la base lo impida al encoger es el §7.4
  // del diseño, y está sin hacer: va en el plan de las pantallas.)
  await prisma.plotShapeRange.deleteMany({ where: assertDefinedWhere({ id: { in: formaIds } }) });
  formaIds = [];
  await prisma.location.update({
    where: { id: parcela.id },
    // `plantSpacingMeters` y `areaHectares` también: las pruebas de la densidad los
    // ponen, y dejarlos puestos cambiaría el resultado de las que corren después.
    data: {
      gridOrigin: null,
      rowCount: null,
      plantsPerRow: null,
      rowSpacingMeters: null,
      plantSpacingMeters: null,
      areaHectares: null,
    },
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

let formaIds: string[] = [];

/**
 * Declara una forma que cubre el tablero entero.
 *
 * **Hace falta desde D8 (2026-10-02):** sin forma declarada `compararConLaRejilla`
 * devuelve `sin_forma` y no afirma ninguna capacidad, porque `filas × plantas` es falso
 * en un lote irregular. Las pruebas de abajo siguen midiendo lo que medían —que el
 * cableado expone la comparación, y que una microparcela usa su rango— y para eso
 * necesitan una forma; la del tablero lleno deja sus cifras intactas.
 */
async function declararFormaLlena(locationId: string) {
  const f = await prisma.plotShapeRange.create({
    data: { locationId, rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20, createdBy: usuario.userAccountId },
  });
  formaIds.push(f.id);
  return f;
}

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

  /**
   * **Con rejilla y SIN forma, el cableado dice `sin_forma`** (D8, 2026-10-02) — y esto
   * es además el control de las cuatro pruebas de abajo: si declarar la forma no
   * estuviera haciendo nada, ellas pasarían igual y esta fallaría.
   */
  it("con rejilla y sin forma declarada dice sin_forma, sin capacidad", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await siembra(parcela.id, 140);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.rejilla).toMatchObject({ status: "sin_forma", filas: 10, columnas: 20 });
    expect(d.rejilla).not.toHaveProperty("capacidad");
    expect(d.rejilla).not.toHaveProperty("diferencia");
  });

  /** El control positivo del cableado: con rejilla y sin siembras, la capacidad. */
  it("con rejilla y sin siembras dice sin_cohortes con su capacidad", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await declararFormaLlena(parcela.id);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.rejilla).toMatchObject({ status: "sin_cohortes", capacidad: 200 });
  });

  it("con todo contado compara", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await declararFormaLlena(parcela.id);
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
    await declararFormaLlena(parcela.id);
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
    // La forma es de quien pone la numeración: la madre. La microparcela la hereda.
    await declararFormaLlena(parcela.id);
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
   * **La densidad por marco, cableada** (D10, 2026-10-02). El cableado puede escribirse
   * mal de dos maneras: pasar `areaHectares` en vez de las celdas de la forma —y entonces
   * la densidad real sale baja en un lote irregular, por la roca y el camino—, o no pasar
   * los dos metros y dejar `sin_marco` siempre.
   *
   * El fixture declara `rowSpacingMeters` pero **no** `plantSpacingMeters`, así que este
   * primer caso es el de «falta un metro» — y es además el control del siguiente.
   */
  it("con la rejilla y la forma pero sin el metro entre plantas dice sin_marco", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await declararFormaLlena(parcela.id);
    await siembra(parcela.id, 150);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.densidad.status).toBe("sin_marco");
  });

  /**
   * Con los dos metros, el marco de la Pink Bourbon —1,8 × 2,5— da **2.222 plantas/ha de
   * diseño**, y el área sale de las 200 celdas del tablero lleno: 200 × 4,5 m² = 900 m² =
   * 0,09 ha. Con 150 contadas, la real son 1.667.
   */
  it("con los dos metros da la diseñada, el área DERIVADA de la rejilla y la real", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await prisma.location.update({ where: { id: parcela.id }, data: { plantSpacingMeters: 1.8 } });
    await declararFormaLlena(parcela.id);
    await siembra(parcela.id, 150);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    expect(d.densidad).toMatchObject({ status: "ok", disenada: 2222, celdas: 200 });
    if (d.densidad.status !== "ok") throw new Error("el status cambió: lo de abajo no mediría");
    expect(d.densidad.areaHectareas).toBeCloseTo(0.09, 4);
    expect(d.densidad.real).toBeCloseTo(1667, 0);
  });

  /**
   * **El control de que el área NO sale de `areaHectares`.** `crearParcela` no le pone
   * área, así que si el cableado la usara este caso daría `sin_area` o un número distinto;
   * con las celdas de la forma da 0,09 ha pase lo que pase con la columna del polígono.
   */
  it("el control: el área derivada no depende de areaHectares", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await prisma.location.update({
      where: { id: parcela.id },
      // Un área de polígono ABSURDA a propósito: si el cableado la usara, la real se iría.
      data: { plantSpacingMeters: 1.8, areaHectares: 99 },
    });
    await declararFormaLlena(parcela.id);
    await siembra(parcela.id, 150);
    const d = await getPlotDetail(usuario.userAccountId, parcela.id);
    if (d.densidad.status !== "ok") throw new Error("el status cambió: lo de abajo no mediría");
    expect(d.densidad.areaHectareas, "0,09 ha de la rejilla, no 99 del poligono").toBeCloseTo(0.09, 4);
    expect(d.densidad.real).toBeCloseTo(1667, 0);
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
