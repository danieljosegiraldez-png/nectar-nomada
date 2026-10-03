import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";
import { RejillaInvalida, updateLocationAttributes } from "../../lib/traceability/locations";
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

const conRejilla = () =>
  prisma.location.update({ where: { id: parcela.id }, data: REJILLA });

/**
 * Fija **la clase Y el codigo exacto**, y las dos mitades hacen falta.
 *
 * Una revision independiente las midio como mutaciones que sobrevivian a
 * `rejects.toThrow(/regexp/)`: cambiar `throw new RejillaInvalida(...)` por
 * `throw new Error(...)` dejaba la prueba en verde —y `friendlyError` relanzando,
 * o sea un 500—, y capturar `culpable[0]` en vez de `culpable[1]` tambien, porque
 * `.*` casaba con la frase entera duplicada. `toBe` del codigo completo mata las
 * dos.
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
   * **El mismo caso al revés, y no es redundante: es la ÚNICA prueba que ejerce
   * el filtro interno del disparador.** En las de arriba la trampa entra
   * primero, así que el segundo `INSERT` sale por el `RETURN NEW` de «no soy de
   * trampa» y el `WHERE b2."block_type" = 'trampa'` no se evalúa nunca. Medido
   * con el flip-test, no deducido: cambiar ese filtro por `IS NOT NULL` dejaba
   * las quince pruebas en verde. Aquí la trampa entra SEGUNDA, encima de un
   * experimental, que es lo que obliga al disparador a mirar de qué tipo es el
   * otro bloque.
   */
  it("una trampa entra encima de un EXPERIMENTAL: sólo otra trampa la bloquea", async () => {
    await conRejilla();
    const ex = await bloque("Ensayo A", "experimental");
    const t = await bloque("Trampas Alto", "trampa");
    await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: ex.id, createdBy: usuario.userAccountId },
    });
    const ok = await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: t.id, createdBy: usuario.userAccountId },
    });
    expect(ok.plotBlockId).toBe(t.id);
  });

  /**
   * Y el otro lado de ADR-080, también por el orden que lo ejerce: un bloque
   * SIN TIPO tampoco bloquea a una trampa que llegue después. «Desconocido» no
   * es «es de trampa» igual que no es «no es de trampa» — un filtro escrito
   * como `IS DISTINCT FROM 'experimental'` dejaría pasar los NULL y rechazaría
   * esta trampa por un bloque del que no se sabe nada.
   */
  it("una trampa entra encima de un bloque SIN TIPO", async () => {
    await conRejilla();
    const sin = await bloque("Viejo sin tipo", null);
    const t = await bloque("Trampas Alto", "trampa");
    await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: sin.id, createdBy: usuario.userAccountId },
    });
    const ok = await prisma.plotBlockRange.create({
      data: { ...RANGO, plotBlockId: t.id, createdBy: usuario.userAccountId },
    });
    expect(ok.plotBlockId).toBe(t.id);
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

/**
 * La rejilla a través del SERVICIO, que es por donde entra de verdad.
 *
 * Tarea 3 del plan. Lo de arriba prueba la base; esto prueba que el servicio da
 * **el mensaje** antes de que la base dé la garantía — y que lo que la base
 * rechaza llega como una clase de error traducible, no como un error de Prisma
 * crudo, que en una acción es la pantalla de error del PR #433 otra vez.
 */
describe("updateLocationAttributes y la rejilla (D3)", () => {
  it("guarda la rejilla entera — el control positivo", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.gridOrigin).toBe("noroeste");
    expect(l.rowCount).toBe(10);
    expect(l.plantsPerRow).toBe(20);
    expect(Number(l.rowSpacingMeters)).toBe(2.5);
  });

  /**
   * **Corregido tras la revisión: el comentario anterior tenía la lógica al
   * revés.** La mitad que distingue «lo paró el servicio» de «lo paró el CHECK y
   * el error subió envuelto» es la CLASE, no el `rowCount` nulo — ese pasa igual
   * si lo paró la base. La segunda aserción sigue, pero por lo que de verdad
   * dice: que nada se escribió.
   */
  it("media rejilla la rechaza el SERVICIO, antes de llegar a la base", async () => {
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, rowCount: 10 }),
      "rejilla_a_medias",
    );
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.rowCount).toBeNull();
  });

  /**
   * **El nombre del código importa y por eso no es `no_entera`:** el 0 y el −3
   * SON enteros. La propiedad es «entero y desde 1», y un código que dijera
   * «no entera» mentiría en dos de estos cinco casos. Es la misma corrección que
   * se le hizo a `no_es_celda` en la tarea 1.
   */
  it("una cuenta que no sea un entero desde 1 la rechaza el servicio", async () => {
    for (const malo of [
      { rowCount: 0 },
      { rowCount: -3 },
      { rowCount: 10.5 },
      { plantsPerRow: 0 },
      { plantsPerRow: 18.5 },
      // El techo de `int4`. Medido: sin esta cota, Prisma devolvia un `P2020`
      // crudo, que en una accion es un 500.
      { rowCount: 3e9 },
    ]) {
      await falla(
        updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA, ...malo }),
        "rejilla_no_entera_positiva",
      );
    }
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.rowCount).toBeNull();
  });

  /**
   * **Lo que la base rechaza sale del servicio como `RejillaInvalida`, y hay UNA
   * PRUEBA POR FORMA DE CULPABLE.** Son tres porque el disparador de D4 nombra
   * tres cosas distintas —microparcela, bloque y planta— con tres redacciones
   * distintas, y una sola prueba dejaba dos expresiones regulares sin ejercer.
   * Lo señaló una revisión independiente: de los tres `RAISE`, sólo el del bloque
   * pasaba por el servicio, y el de la planta es el de forma más irregular
   * porque concatena enteros.
   *
   * Nadie en el repositorio traducía un `P0001` — medido: 0 archivos, con el
   * control de que el mismo `grep` encuentra `PrismaClientKnownRequestError` en
   * 19. Sin esto, encoger la rejilla de una parcela es un 500: la clase de
   * defecto del PR #433 y del #514.
   */
  it("encoger con un BLOQUE fuera sale como RejillaInvalida con su código", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const b = await bloque("Ensayo A", "experimental");
    await prisma.plotBlockRange.create({
      data: { rowFrom: 8, rowTo: 9, plantFrom: 1, plantTo: 5, plotBlockId: b.id, createdBy: usuario.userAccountId },
    });
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA, rowCount: 5 }),
      "rejilla_con_bloque_fuera:Ensayo A",
    );
  });

  it("encoger con una MICROPARCELA fuera sale como RejillaInvalida con su código", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const m = await prisma.location.create({
      data: {
        name: "Microparcela Alta",
        locationType: "plot" as const,
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        status: "approved",
        rangeRowFrom: 8,
        rangeRowTo: 9,
        rangePlantFrom: 1,
        rangePlantTo: 5,
      },
    });
    microIds.push(m.id);
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA, rowCount: 5 }),
      "rejilla_con_microparcela_fuera:Microparcela Alta",
    );
  });

  /**
   * La forma más irregular de las tres: concatena dos enteros, y por eso su
   * código los lleva separados por una coma y `friendlyError` los pasa como dos
   * parámetros. Si entraran en un `{value}` suelto, la pantalla en inglés diría
   * «una planta en la hilera 9, planta 3» — que es justo lo que esta tanda
   * corrige.
   */
  it("encoger con una PLANTA fuera sale como RejillaInvalida con sus dos números", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
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
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA, rowCount: 5 }),
      "rejilla_con_planta_fuera:9,3",
    );
  });

  /**
   * **La separación entre hileras, que no la guardaba nadie.** Medido con una
   * sonda el 2026-10-01 y encontrado por una revisión independiente, no por la
   * suite: `0` y `-2.5` SE GUARDABAN —el `CHECK` de la tarea 2 sólo cubre las dos
   * cuentas— y `1000` y `NaN` salían como `P2020`/`P2039` crudos, o sea un 500.
   * El `CHECK` que lo garantiza está en
   * `20261002013000_separacion_de_hileras_positiva`, con la redacción de
   * `PlantingCohort` para la misma magnitud.
   */
  it("una separación de hileras que no sea positiva y quepa la rechaza el servicio", async () => {
    for (const [malo, codigo] of [
      [0, "rejilla_separacion_no_positiva"],
      [-2.5, "rejilla_separacion_no_positiva"],
      [Number.NaN, "rejilla_separacion_no_positiva"],
      [1000, "rejilla_separacion_fuera_de_rango"],
      // **Los bordes del REDONDEO**, que la primera versión dejaba pasar porque
      // comparaba el valor que llega y no el que se guarda. Medidos con una sonda:
      // `0.001` y `0.004` redondean a `0.00`, el CHECK los rechaza y salía un
      // `P2039` CRUDO —un 500 en una acción—; `999.999` redondea a `1000.00` y
      // desbordaba con `P2020`. Los encontró una revisión independiente.
      [0.001, "rejilla_separacion_no_positiva"],
      [0.004, "rejilla_separacion_no_positiva"],
      [999.999, "rejilla_separacion_fuera_de_rango"],
    ] as const) {
      await falla(
        updateLocationAttributes(usuario.userAccountId, {
          locationId: parcela.id,
          ...REJILLA,
          rowSpacingMeters: malo,
        }),
        codigo,
      );
    }
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.rowSpacingMeters).toBeNull();
  });

  /**
   * **El control de que no rechaza de más, y es el que decide si la cota es la
   * correcta.** `0.005` redondea a `0.01` y `999.99` cabe justo: los dos tienen
   * que ENTRAR. Sin esta mitad, una cota escrita de más —rechazar todo lo menor
   * que 0.01, digamos— pasaría la prueba de arriba sin que nadie note que se está
   * negando un dato legítimo.
   */
  it("lo que sí cabe tras redondear entra: 0.005 y 999.99", async () => {
    for (const bueno of [0.005, 999.99]) {
      await updateLocationAttributes(usuario.userAccountId, {
        locationId: parcela.id,
        ...REJILLA,
        rowSpacingMeters: bueno,
      });
      const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
      expect(Number(l.rowSpacingMeters)).toBe(Math.round(bueno * 100) / 100);
      await prisma.location.update({
        where: { id: parcela.id },
        data: { gridOrigin: null, rowCount: null, plantsPerRow: null, rowSpacingMeters: null },
      });
    }
  });

  /** Y la base lo garantiza aunque nadie pase por el servicio. */
  it("y el CHECK lo rechaza también por SQL directo, sin pasar por el servicio", async () => {
    await expect(
      prisma.location.update({ where: { id: parcela.id }, data: { ...REJILLA, rowSpacingMeters: -2.5 } }),
    ).rejects.toThrow(/location_separacion_de_hileras_positiva/);
  });

  /**
   * **El caso que mi propio plan rompía, y no lo vio nadie hasta tocar el código.**
   * El plan contaba los campos del INPUT, así que con una rejilla ya puesta,
   * cambiar sólo `plantsPerRow` —la edición más normal que existe— manda un campo
   * y se habría leído como «media rejilla». Se cuenta la FILA RESULTANTE, igual
   * que la altitud hace en esa misma función, y así el servicio dice lo mismo que
   * el `CHECK` de la base, que es `num_nonnulls(...) IN (0, 4)` sobre la fila.
   */
  it("con la rejilla puesta, cambiar UN campo no es media rejilla", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, plantsPerRow: 25 });
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.plantsPerRow).toBe(25);
    expect(l.rowCount).toBe(10);
  });

  /** Y borrarla entera también es legítimo: cero puestos, no «media». */
  it("borrar la rejilla entera se permite", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: parcela.id,
      gridOrigin: null,
      rowCount: null,
      plantsPerRow: null,
      rowSpacingMeters: null,
    });
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.rowCount).toBeNull();
    expect(l.gridOrigin).toBeNull();
  });

  /** Y el control de que esa traducción no se come un encogimiento legítimo. */
  it("encoger sin nada fuera sí entra — el control de que no rechaza de más", async () => {
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA, rowCount: 5 });
    const l = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(l.rowCount).toBe(5);
  });
});
