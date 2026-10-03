import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createMicrolot, RejillaInvalida, updateLocationAttributes } from "../../lib/traceability/locations";
import { pendienteDeLaParcela, type EntradaDePendiente } from "../../lib/traceability/pendienteDeLaParcela";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * `createMicrolot`: qué copia de la parcela, qué NO copia, y su rango.
 *
 * Diseño §4 de `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md`,
 * decisiones **D2** (se copia al crear, y desde ahí es suyo), **D3** (la
 * numeración es UNA, la de la parcela, así que la rejilla NO se copia) y **D6**
 * (el acto de copiar queda en el libro de auditoría).
 *
 * **La limpieza NO borra el ámbito de plataforma.** `crearUsuarioConAcceso`
 * devuelve el ámbito COMPARTIDO y `assignment.scope_id` es `RESTRICT`: borrarlo
 * revienta el `afterEach` y además se lo quita a los archivos que corren en
 * paralelo. Por eso el usuario y la parcela se crean una vez en `beforeAll` y
 * este archivo nunca toca `scope`, `userAccount` ni `person`.
 */

let locationIds: string[] = [];
let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;

const ATRIBUTOS = {
  altitudeMinM: 1400,
  altitudeMaxM: 1500,
  soilType: "franco",
  slopeDescription: "ladera suave al norte",
  sunExposure: "morning" as const,
  shadePercentage: "pct_50" as const,
  aspect: "north" as const,
  plantSpacingMeters: 1.5,
  areaHectares: 0.8,
};

const REJILLA = { gridOrigin: "noroeste" as const, rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 };

/**
 * Fija **la clase Y el código exacto**. Las dos mitades hacen falta: una revisión
 * independiente midió que `rejects.toThrow(/regexp/)` sobrevive a cambiar la
 * clase por `Error` —prueba verde, y `friendlyError` relanzando, o sea un 500— y
 * a capturar el grupo equivocado de la expresión.
 *
 * **Y por eso esta prueba NO dice `/no cabe en la rejilla/`, que es lo que el
 * plan escribía.** Esa frase es la del `RAISE` del disparador, así que la
 * aserción pasaría con el error CRUDO de Prisma mientras el operario ve la
 * pantalla de error. El servicio tiene que dar su propio código.
 */
async function falla(promesa: Promise<unknown>, codigo: string) {
  let caido: unknown = null;
  try {
    await promesa;
  } catch (e) {
    caido = e;
  }
  expect(caido).toBeInstanceOf(RejillaInvalida);
  expect((caido as Error).message).toBe(codigo);
}

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela();
  await updateLocationAttributes(usuario.userAccountId, {
    locationId: parcela.id,
    ...REJILLA,
    ...ATRIBUTOS,
  });
});

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: locationIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  locationIds = [];
  // La parcela vuelve a su estado declarado: una prueba que la cambie no debe
  // dejar a la siguiente heredando algo que no pidió.
  await prisma.location.update({ where: { id: parcela.id }, data: { ...REJILLA, ...ATRIBUTOS } });
});

/**
 * **Lo que la corrida crea, la corrida lo borra — menos el ámbito compartido.**
 *
 * Medido el 2026-10-01 con la ventana de la base quieta (dos lecturas iguales sin
 * correr nada en medio, porque otras sesiones escriben ahí): una corrida de este
 * archivo dejaba **6 filas** detrás —persona, cuenta, asignación, organización y
 * dos ubicaciones— con las pruebas en verde. La base compartida ya acumulaba 23
 * personas y 42 ubicaciones `TEST`, que es la misma forma que los 284 `Scope`
 * huérfanos que documenta `CLAUDE.md`. Lo encontró una revisión independiente.
 *
 * **El `Scope` de plataforma NO se borra**, y eso no es descuido: `crearUsuarioConAcceso`
 * devuelve el COMPARTIDO, y quitarlo se lo quita a los archivos que corren en
 * paralelo. Lo que sí es nuestro es todo lo demás.
 *
 * **El orden lo manda las claves ajenas**, y una que se queje tira el resto del
 * `afterAll`: los eventos y las ubicaciones antes de la cuenta —las dos la
 * referencian—, la asignación antes de la cuenta, y la organización al final.
 */
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

const microlote = (name: string, extra: Record<string, unknown> = {}) =>
  createMicrolot(usuario.userAccountId, {
    parentLocationId: parcela.id,
    name,
    subdivisionReason: "altitude",
    ...extra,
  } as never);

describe("createMicrolot copia los atributos de la parcela (D2, D6)", () => {
  /**
   * **Los OCHO, uno por uno y no por muestreo.** Comprobar dos y dar por buenos
   * los ocho es la forma de que el día que alguien añada un atributo a
   * `Location` y se olvide de copiarlo, la prueba siga verde. El `Decimal` va con
   * `Number()`, que es el idioma de la casa.
   *
   * **Eran nueve hasta el 2026-10-02, y el noveno era `areaHectares`.** Sale de la
   * lista porque es la única EXTENSIVA: los ocho describen el sitio y valen igual en
   * una parte que en el todo, mientras una microparcela es una PARTE, así que
   * copiarle la superficie entera guarda un número que no puede ser suyo. Y no se
   * queda en la ficha: `computePlotDensity` y `computePlotYield` dividen por esa
   * columna, y `pendienteDeLaParcela` deja de pedir el área en cuanto no es nula —
   * el único aviso que llevaría a medir la de verdad. La nota está en el §4.4 del
   * diseño, que la nombraba entre los nueve.
   */
  it("copia los ocho atributos intensivos, uno por uno", async () => {
    const m = await microlote("Norte");
    locationIds.push(m.id);
    expect(m.altitudeMinM).toBe(1400);
    expect(m.altitudeMaxM).toBe(1500);
    expect(m.soilType).toBe("franco");
    expect(m.slopeDescription).toBe("ladera suave al norte");
    expect(m.sunExposure).toBe("morning");
    expect(m.shadePercentage).toBe("pct_50");
    expect(m.aspect).toBe("north");
    expect(Number(m.plantSpacingMeters)).toBe(1.5);
  });

  /**
   * **Y la que NO se copia, con su consecuencia medida en la misma prueba.**
   *
   * No basta afirmar el nulo: lo que importa es que el nulo haga saltar el aviso que
   * lleva a medir el área de verdad. `pendienteDeLaParcela` es una función pura, así
   * que se le puede preguntar aquí mismo. Con el área copiada esta prueba caía por
   * las dos aserciones a la vez, que es lo que la hace un guardia y no un adorno.
   */
  it("NO copia el área, y por eso la microparcela vuelve a pedirla", async () => {
    const m = await microlote("Este");
    locationIds.push(m.id);
    expect(m.areaHectares, "el área es extensiva: copiarla guarda un número que no puede ser suyo").toBeNull();
    // **Sin `as never`, a propósito.** La primera versión lo llevaba y escondió que
    // `EntradaDePendiente` exige nueve campos más: la prueba reventó con
    // «e.jornadas is not iterable» en vez de decir que la forma estaba mal. Un casteo
    // que silencia al compilador se cobra el silencio en tiempo de ejecución.
    const entrada = (areaHectares: number | null): EntradaDePendiente => ({
      hoy: "2026-10-02",
      zona: null,
      areaHectares,
      cohortesActivas: [],
      estados: new Map(),
      jornadas: [],
      muestrasDeSuelo: [],
      muestrasFoliares: [],
      ahora: new Date("2026-10-02T12:00:00.000Z"),
      intervenciones: [],
      trampas: [],
      regla: null,
      intervencionesDeTrampas: [],
    });
    const sinArea = pendienteDeLaParcela(entrada(m.areaHectares == null ? null : Number(m.areaHectares)));
    expect(sinArea.faltaUnDato, "con el área en nulo nadie pide medirla").toContainEqual({ tipo: "sin_area" });
    // Control del control: con un área puesta NO debe pedirla. Sin esta mitad, un aviso
    // que saliera siempre pasaría la aserción de arriba sin medir nada.
    const conArea = pendienteDeLaParcela(entrada(0.8));
    expect(conArea.faltaUnDato, "pide el área incluso teniéndola: el aviso no discrimina").not.toContainEqual({
      tipo: "sin_area",
    });
  });

  /**
   * **D6: el acto de copiar queda escrito.** Sin este evento nadie distingue un
   * valor copiado de uno medido en la microparcela — y esa distinción es el
   * principio del proyecto: «la IA nunca es la fuente autoritativa» tiene como
   * hermana «un valor heredado no es un valor observado».
   *
   * Va en su propia prueba, separada de la de los valores, a propósito: el
   * flip-test del plan exige que quitar el evento y quitar la copia tumben
   * pruebas DISTINTAS. Si cayera la misma en los dos casos, las aserciones no
   * discriminarían.
   *
   * **Lo que esta prueba NO demuestra, dicho aquí para que nadie lo cuente dos
   * veces: que el evento vaya en la misma transacción.** Quitarle el `tx` la deja
   * en verde, porque ninguna prueba de aquí provoca un fallo de auditoría. Quien
   * lo vigila es `tests/arquitectura/audit-atomico.test.ts`, que lee la fuente — y
   * está comprobado por flip-test, no por su docstring: quitando ese `tx` cae
   * nombrando `lib/traceability/locations.ts:646`.
   */
  it("deja el acto de copiar en el libro de auditoría, con los valores dentro", async () => {
    const m = await microlote("Centro");
    locationIds.push(m.id);
    const ev = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: m.id, operation: "location.copy_attributes_from_parent" }),
    });
    expect(ev, "sin el AuditEvent nadie distingue un valor copiado de uno medido").not.toBeNull();
    // Y que diga DE DÓNDE y QUÉ — **los ocho, no una muestra**. Una revisión
    // independiente midió que comprobar sólo `soilType` dejaba sobrevivir la
    // mutación de quitar los otros ocho del `after`: el evento registraba que algo
    // se copió sin registrar qué, que para una auditoría es casi lo mismo que nada.
    const despues = ev?.after as Record<string, unknown> | null;
    expect(despues?.copiadoDe).toBe(parcela.id);
    expect(despues?.altitudeMinM).toBe(1400);
    expect(despues?.altitudeMaxM).toBe(1500);
    expect(despues?.soilType).toBe("franco");
    expect(despues?.slopeDescription).toBe("ladera suave al norte");
    expect(despues?.sunExposure).toBe("morning");
    expect(despues?.shadePercentage).toBe("pct_50");
    expect(despues?.aspect).toBe("north");
    expect(Number(despues?.plantSpacingMeters)).toBe(1.5);
    // Y el área **no** aparece, porque ya no se copia: este evento registra lo COPIADO,
    // y un nulo aquí diría que se copió un nulo en vez de que no se copió nada.
    expect(despues, "el evento sigue registrando un área que ya no se copia").not.toHaveProperty("areaHectares");
  });

  /** Y el evento de crear sigue estando: son dos actos, no uno. */
  it("los dos eventos conviven: crear y copiar", async () => {
    const m = await microlote("Sur");
    locationIds.push(m.id);
    const ops = (
      await prisma.auditEvent.findMany({
        where: assertDefinedWhere({ entityId: m.id }),
        select: { operation: true },
      })
    )
      .map((e) => e.operation)
      .sort();
    expect(ops).toContain("location.create_microlot");
    expect(ops).toContain("location.copy_attributes_from_parent");
  });

  /**
   * **D2, la mitad que nadie mira: desde que se crea, es suyo.** Cambiar la
   * parcela después no mueve la microparcela. No hace falta código para que esto
   * sea cierto —una copia es una copia— y precisamente por eso hace falta la
   * prueba: el día que a alguien se le ocurra «heredar en vivo» leyendo del
   * padre, esto cae.
   */
  it("cambiar la parcela DESPUÉS no mueve la microparcela", async () => {
    const m = await microlote("Independiente");
    locationIds.push(m.id);
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, altitudeMinM: 1450 });
    const tras = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(tras.altitudeMinM).toBe(1400);
  });

  /**
   * **D3: la rejilla NO se copia.** Una microparcela usa la numeración de su
   * parcela, no una propia. Si se copiara habría dos numeraciones para el mismo
   * suelo y un «hilera 7» dejaría de querer decir una sola cosa — que es
   * exactamente lo que D3 existe para impedir.
   */
  it("la rejilla NO se copia: la numeración es una sola, la de la parcela", async () => {
    const m = await microlote("Sin rejilla propia");
    locationIds.push(m.id);
    expect(m.gridOrigin).toBeNull();
    expect(m.rowCount).toBeNull();
    expect(m.plantsPerRow).toBeNull();
    expect(m.rowSpacingMeters).toBeNull();
  });
});

describe("el rango de la microparcela, al crearla (D3)", () => {
  it("acepta un rango que cabe — el control positivo", async () => {
    const m = await microlote("Con rango", {
      rangeRowFrom: 1,
      rangeRowTo: 4,
      rangePlantFrom: 1,
      rangePlantTo: 20,
    });
    locationIds.push(m.id);
    expect(m.rangeRowFrom).toBe(1);
    expect(m.rangeRowTo).toBe(4);
    expect(m.rangePlantFrom).toBe(1);
    expect(m.rangePlantTo).toBe(20);
  });

  it("sin rango es válido: el rango es opcional", async () => {
    const m = await microlote("Sin rango");
    locationIds.push(m.id);
    expect(m.rangeRowFrom).toBeNull();
  });

  /**
   * **Los cuatro estados en que un rango miente salen distinguibles**, cada uno
   * con su código, porque una pantalla tiene que poder decir con cuál se topó.
   * Son los cuatro de `validarRango` (`lib/territorio/rejilla.ts`, tarea 1), que
   * es el módulo puro que ya los prueba sin base; aquí se comprueba que el
   * servicio los USA y los convierte en un error con nombre.
   */
  it("los cuatro estados malos salen con su código propio", async () => {
    await falla(microlote("A medias", { rangeRowFrom: 1, rangeRowTo: 4 }), "rejilla_rango_a_medias");
    await falla(
      microlote("Al revés", { rangeRowFrom: 4, rangeRowTo: 1, rangePlantFrom: 1, rangePlantTo: 20 }),
      "rejilla_rango_al_reves",
    );
    await falla(
      microlote("No es celda", { rangeRowFrom: 0, rangeRowTo: 4, rangePlantFrom: 1, rangePlantTo: 20 }),
      "rejilla_rango_no_es_celda",
    );
    await falla(
      microlote("Se sale", { rangeRowFrom: 1, rangeRowTo: 40, rangePlantFrom: 1, rangePlantTo: 20 }),
      "rejilla_rango_fuera_de_rejilla",
    );
  });

  /**
   * Y el control de que `no_es_celda` no se come el caso siguiente: enteros
   * perfectamente válidos que simplemente no caben dan `fuera_de_rejilla`. Un
   * control que devolviera el mismo código que la pregunta no sería un control.
   */
  it("una parcela SIN rejilla no admite ningún rango", async () => {
    await prisma.location.update({
      where: { id: parcela.id },
      data: { gridOrigin: null, rowCount: null, plantsPerRow: null, rowSpacingMeters: null },
    });
    await falla(
      microlote("Sin rejilla madre", { rangeRowFrom: 1, rangeRowTo: 4, rangePlantFrom: 1, rangePlantTo: 20 }),
      "rejilla_rango_fuera_de_rejilla",
    );
  });

  /**
   * **Y la base lo garantiza aunque nadie pase por el servicio.** El servicio da
   * el mensaje; el disparador `core.exigir_rango_en_la_rejilla` de la tarea 2 da
   * la garantía, y un importador o un SQL directo sólo se topan con él.
   */
  it("el disparador lo rechaza también por SQL directo, sin pasar por el servicio", async () => {
    await expect(
      prisma.location.create({
        data: {
          name: `TEST Microparcela cruda ${Date.now()}`,
          locationType: "plot",
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          status: "approved",
          rangeRowFrom: 1,
          rangeRowTo: 40,
          rangePlantFrom: 1,
          rangePlantTo: 20,
        },
      }),
    ).rejects.toThrow(/no cabe en la rejilla de la parcela/);
  });
});
