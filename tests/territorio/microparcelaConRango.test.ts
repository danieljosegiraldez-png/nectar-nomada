import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createMicrolot, RejillaInvalida, updateLocationAttributes } from "../../lib/traceability/locations";
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

/**
 * Deja una microparcela con rejilla propia **saltándose los disparadores**, que es la
 * única forma de fabricar ese estado desde que existe
 * `20261003190000_rejilla_solo_en_la_parcela`.
 *
 * **No es una trampa para que la prueba pase: es el escenario.** Lo que se está
 * probando son las filas que ya tenían rejilla ANTES de esa migración — nada lo
 * impedía hasta entonces—, y una migración con disparadores no valida ni arregla lo
 * existente. Producción tenía 0 de esas filas el 2026-10-03, así que estas dos pruebas
 * son una red para el día que aparezca una, no el guardia de un camino vivo, y eso hay
 * que leerlo así en vez de contarlas dos veces.
 *
 * `SET LOCAL` lo deja dentro de la transacción: medido con una sonda el 2026-10-03, el
 * mismo `update` sin el truco **sí** se rechaza, y el disparador sigue vivo al salir.
 */
const conRejillaHeredada = (locationId: string) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'");
    await tx.$executeRaw`update core.location
       set grid_origin = 'noreste', row_count = 2, plants_per_row = 3, row_spacing_meters = 1.1
     where id = ${locationId}::uuid`;
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
   * **La que NO se copia.**
   *
   * **Recortada el 2026-10-04 al poner este PR al día, y es un recorte honesto, no una
   * prueba debilitada por comodidad.** La versión anterior medía además la consecuencia
   * —que el nulo hiciera saltar el aviso `sin_area`, el que llevaba a medir el área de
   * verdad—, y eso era lo que la hacía un guardia y no un adorno. Ese aviso **ya no
   * existe**: Daniel decidió el 2026-10-03 que la aplicación deja de pedir el área,
   * porque el espacio de un lote sale de las plantas y la densidad y no del metraje, y
   * `areaHectares` salió de `EntradaDePendiente` (su comentario lo explica, en
   * `lib/traceability/pendienteDeLaParcela.ts`).
   *
   * O sea que la segunda columna no se quitó por pesar: desapareció el comportamiento
   * que medía. Afirmar el nulo sigue cazando la regresión —volver a copiar el área hace
   * caer esta prueba— y la procedencia la vigila la del libro de auditoría, aquí abajo.
   * Lo que ya no hay es consecuencia que preguntar, y queda escrito para que nadie
   * cuente esta prueba por dos.
   */
  it("NO copia el área: es extensiva, y una microparcela es una parte", async () => {
    const m = await microlote("Este");
    locationIds.push(m.id);
    expect(m.areaHectares, "el área es extensiva: copiarla guarda un número que no puede ser suyo").toBeNull();
    // El control de que esto mide algo: los intensivos SÍ llegaron en la misma creación.
    // Sin esta línea, una `createMicrolot` que no copiara NADA pasaría igual de verde.
    expect(m.soilType, "y los intensivos sí se copiaron, o esto no mediría nada").toBe(ATRIBUTOS.soilType);
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

/**
 * **Una microparcela no puede declarar rejilla propia (D3).**
 *
 * No basta con que `createMicrolot` no la copie —eso es lo de arriba—: hasta el
 * 2026-10-03 nada impedía ponérsela DESPUÉS, y la pantalla de ajustes ofrecía el
 * formulario. Medido en vivo ese día contra `nectar_ci_area`, como operaria de
 * finca: se guardó `sureste`, 3×5, 1,20 m en una microparcela, y a partir de ahí
 * `core.raiz_de_la_numeracion` devolvía **la microparcela misma** —esa función
 * corona raíz a cualquier sitio con `row_count` propio— en vez de su madre. Dos
 * numeraciones dentro de una parcela es exactamente lo que D3 prohíbe.
 *
 * El guardia es el que llama al SERVICIO con la entrada hostil, no la pantalla:
 * la frontera es el servicio (SECURITY.md §2), y una pantalla condicionada se
 * salta con una petición.
 */
describe("una microparcela no puede declarar rejilla propia (D3)", () => {
  it("el servicio rechaza ponerle las cuatro, con su código propio", async () => {
    const m = await microlote("Rejilla prohibida");
    locationIds.push(m.id);
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: m.id, ...REJILLA }),
      "rejilla_en_microparcela",
    );
    const despues = await prisma.location.findUnique({ where: { id: m.id } });
    expect(despues?.rowCount).toBeNull();
  });

  /**
   * **El control positivo, y discrimina.** Si el guardia estuviera rechazando
   * cualquier rejilla, este caso caería: es la MISMA llamada, con los mismos
   * cuatro campos, sobre una parcela de primer nivel. Y se comprueba un valor
   * DISTINTO del que `beforeAll` dejó puesto, para que «no cambió nada» no pueda
   * leerse como «se guardó».
   */
  it("la misma llamada sobre la parcela madre SÍ guarda", async () => {
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: parcela.id,
      gridOrigin: "sureste",
      rowCount: 7,
      plantsPerRow: 11,
      rowSpacingMeters: 1.2,
    });
    const despues = await prisma.location.findUnique({ where: { id: parcela.id } });
    expect(despues?.gridOrigin).toBe("sureste");
    expect(despues?.rowCount).toBe(7);
    expect(despues?.plantsPerRow).toBe(11);
  });

  /**
   * **Vaciarla sí se puede, y hace falta.** Nada lo impedía hasta hoy, así que
   * puede haber microparcelas con rejilla puesta; si el guardia bloqueara también
   * el camino de vuelta, quedarían atrapadas. Se le pone por SQL directo —el
   * servicio ya no deja— y se comprueba que el servicio la deja quitar.
   */
  it("una microparcela que YA tiene rejilla puede quedarse sin ella", async () => {
    const m = await microlote("Rejilla heredada de antes");
    locationIds.push(m.id);
    await conRejillaHeredada(m.id);
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: m.id,
      gridOrigin: null,
      rowCount: null,
      plantsPerRow: null,
      rowSpacingMeters: null,
    });
    const despues = await prisma.location.findUnique({ where: { id: m.id } });
    expect(despues?.gridOrigin).toBeNull();
    expect(despues?.rowCount).toBeNull();
  });

  /**
   * **Y el guardia no puede atrapar a quien no toca la rejilla.** Lo encontró una
   * revisión independiente el 2026-10-03, sobre el commit anterior: `puestos` se
   * cuenta sobre la FILA RESULTANTE —así tiene que ser para la regla «cuatro o
   * ninguna»—, de modo que una microparcela con rejilla heredada daba 4 aunque el
   * input no trajera ni una de las cuatro, y editarle la ALTITUD moría con
   * `rejilla_en_microparcela`. O sea: el arreglo dejaba esas filas sin poder
   * tocarse para nada.
   */
  it("con rejilla heredada, editarle OTRO atributo sigue funcionando", async () => {
    const m = await microlote("Heredada, y le cambio la altitud");
    locationIds.push(m.id);
    await conRejillaHeredada(m.id);
    await updateLocationAttributes(usuario.userAccountId, { locationId: m.id, altitudeMinM: 1234 });
    const despues = await prisma.location.findUnique({ where: { id: m.id } });
    expect(despues?.altitudeMinM).toBe(1234);
    // Y la rejilla heredada sigue donde estaba: esto no la limpia por la puerta de atrás.
    expect(despues?.rowCount).toBe(2);
  });

  /**
   * **La consecuencia, preguntada a la función que la decide.** Lo que importa no
   * es que la columna quede nula sino que la numeración siga siendo una: con el
   * guardia puesto, la raíz de una microparcela es su madre. Y el control está
   * dentro del mismo caso — la raíz de la madre es ella misma —, porque una
   * función que devolviera siempre lo mismo pasaría la primera mitad sola.
   */
  it("la raíz de la numeración de una microparcela es su madre", async () => {
    const m = await microlote("Raíz de la numeración");
    locationIds.push(m.id);
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: m.id, ...REJILLA }),
      "rejilla_en_microparcela",
    );
    const filas = await prisma.$queryRaw<{ raiz: string | null }[]>`
      select core.raiz_de_la_numeracion(${m.id}::uuid) as raiz`;
    const filasDeLaMadre = await prisma.$queryRaw<{ raiz: string | null }[]>`
      select core.raiz_de_la_numeracion(${parcela.id}::uuid) as raiz`;
    // Que la consulta devolviera UNA fila se afirma antes de leerla: con cero
    // filas, `filas[0]?.raiz` sería `undefined` y `expect(undefined).not.toBe(m.id)`
    // pasaría — un verde sobre nada medido.
    expect(filas).toHaveLength(1);
    expect(filasDeLaMadre).toHaveLength(1);
    expect(filas[0]?.raiz).toBe(parcela.id);
    expect(filasDeLaMadre[0]?.raiz).toBe(parcela.id);
    expect(filas[0]?.raiz).not.toBe(m.id);
  });
});

/**
 * **Los dos disparadores de D3, ejercidos por SQL directo.**
 *
 * El servicio es la puerta de la aplicación, pero mira el padre EN EL MOMENTO de
 * escribir la rejilla, así que hay un hueco que no puede ver: re-colgar una parcela
 * ya numerada bajo otra parcela no toca ninguna de las cuatro columnas. La migración
 * `20261003190000_rejilla_solo_en_la_parcela` lo cierra con dos disparadores, uno en
 * el hijo y otro en el padre, el mismo patrón que `exigir_arbol_de_estante`.
 *
 * **Estas pruebas NO pasan por el servicio a propósito.** Un disparador que sólo se
 * ejerciera a través de TypeScript no estaría probado: lo que vigila es justo lo que
 * no pasa por ahí.
 */
describe("los disparadores de D3, por SQL directo (sin pasar por el servicio)", () => {
  /** Una parcela hermana bajo el MISMO sitio: `crearParcela()` levantaría otra finca
      entera y el `afterEach` no la limpia, que es la fuga que describe la cabecera. */
  const hermana = async (nombre: string) => {
    const p = await prisma.location.create({
      data: {
        name: `TEST Hermana ${nombre}`,
        locationType: "plot",
        parentLocationId: parcela.parentLocationId,
        organizationId: parcela.organizationId,
        status: "approved",
      },
    });
    locationIds.push(p.id);
    return p;
  };

  it("la base rechaza ponerle rejilla a una microparcela", async () => {
    const m = await microlote("Rejilla por la puerta de atrás");
    locationIds.push(m.id);
    await expect(
      prisma.$executeRaw`update core.location
         set grid_origin = 'noroeste', row_count = 4, plants_per_row = 5, row_spacing_meters = 1.5
       where id = ${m.id}::uuid`,
    ).rejects.toThrow(/no se numera aparte/i);
    const despues = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(despues.rowCount, "y no se quedó a medias").toBeNull();
  });

  /**
   * **El control positivo, y discrimina.** Si el disparador estuviera rechazando
   * cualquier rejilla, este caso caería: es el MISMO `update`, con los mismos cuatro
   * valores, sobre una parcela de primer nivel.
   */
  it("y la deja poner en una parcela de primer nivel — el control positivo", async () => {
    const otra = await hermana("control positivo");
    await prisma.$executeRaw`update core.location
       set grid_origin = 'noroeste', row_count = 4, plants_per_row = 5, row_spacing_meters = 1.5
     where id = ${otra.id}::uuid`;
    const despues = await prisma.location.findUniqueOrThrow({ where: { id: otra.id } });
    expect(despues.rowCount).toBe(4);
  });

  /**
   * **El hueco que el servicio no puede ver.** La rejilla se pone siendo parcela
   * legítima y DESPUÉS la fila cambia de padre: ninguna de las cuatro columnas se
   * toca, así que `updateLocationAttributes` no se entera nunca.
   */
  it("la base rechaza re-colgar una parcela ya numerada bajo otra parcela", async () => {
    const otra = await hermana("re-colgada");
    await prisma.$executeRaw`update core.location
       set grid_origin = 'noroeste', row_count = 4, plants_per_row = 5, row_spacing_meters = 1.5
     where id = ${otra.id}::uuid`;
    await expect(
      prisma.$executeRaw`update core.location set parent_location_id = ${parcela.id}::uuid where id = ${otra.id}::uuid`,
    ).rejects.toThrow(/no se numera aparte/i);
    const despues = await prisma.location.findUniqueOrThrow({ where: { id: otra.id } });
    expect(despues.parentLocationId, "sigue colgando de donde estaba").not.toBe(parcela.id);
  });

  /**
   * **La otra mitad, la del padre.** Un `site` con una parcela numerada debajo no
   * puede convertirse en parcela: eso haría microparcela a su hija sin tocarla.
   */
  /**
   * **Con sitio propio, no con el compartido.** Si este caso retipara el sitio del que
   * cuelga `parcela` y el disparador no estuviera, `parcela` pasaría a ser microparcela
   * para todo lo que corra después y el `afterEach` no lo deshace — se vio al hacer el
   * flip-test: tumbó una prueba del §6 que no tenía nada que ver. Una prueba no deja
   * al fixture compartido en un estado que ella misma no pueda revertir.
   */
  it("la base rechaza volver parcela a un sitio que ya tiene hijas numeradas", async () => {
    const sitio = await prisma.location.create({
      data: { name: "TEST Sitio propio del retipado", locationType: "site", organizationId: parcela.organizationId, status: "approved" },
    });
    locationIds.push(sitio.id);
    const hija = await prisma.location.create({
      data: {
        name: "TEST Hija numerada",
        locationType: "plot",
        parentLocationId: sitio.id,
        organizationId: parcela.organizationId,
        status: "approved",
        gridOrigin: "noroeste",
        rowCount: 4,
        plantsPerRow: 5,
        rowSpacingMeters: 1.5,
      },
    });
    locationIds.push(hija.id);
    expect(hija.rowCount, "la fila patrón: la hija está numerada, o esto no mediría nada").toBe(4);
    await expect(
      prisma.$executeRaw`update core.location set location_type = 'plot' where id = ${sitio.id}::uuid`,
    ).rejects.toThrow(/ya tiene rejilla propia/i);
    const despues = await prisma.location.findUniqueOrThrow({ where: { id: sitio.id } });
    expect(despues.locationType, "y el sitio sigue siendo sitio").toBe("site");
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

/**
 * **Cambiar el rango de una microparcela que YA existe** — el §6 del diseño del
 * 2026-10-01, que lo pedía y nunca se construyó. Hasta hoy el rango sólo se podía dar al
 * crearla: medido el 2026-10-02, cero archivos de `app/` escribían `rangeRowFrom`, así que
 * el estado `sin_rango` de la comparación no tenía salida.
 */
describe("updateLocationAttributes cambia el rango de una microparcela (§6)", () => {
  const micro = async (extra: Record<string, unknown> = {}) => {
    const m = await microlote(`TEST Micro rango ${Date.now()}`, extra);
    locationIds.push(m.id);
    return m;
  };

  it("pone el rango de una microparcela que no lo tenía", async () => {
    const m = await micro();
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: m.id,
      rangeRowFrom: 1,
      rangeRowTo: 4,
      rangePlantFrom: 1,
      rangePlantTo: 20,
    });
    const leido = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(leido.rangeRowTo).toBe(4);
    expect(leido.rangePlantTo).toBe(20);
  });

  /**
   * **LA PRUEBA QUE IMPORTA.** `RejillaForm` manda sólo los cuatro campos de la rejilla.
   * Si el servicio tratara «ausente» como `null`, guardar la rejilla **borraría** lo que
   * no viene en el formulario sin decir nada — y nadie lo notaría hasta que la pantalla
   * empezara a decir que falta algo que sí estaba.
   *
   * **Reescrita el 2026-10-03 al fusionar D3, y el montaje viejo era el que ya no vale,
   * no la propiedad.** La versión anterior ponía la rejilla sobre la MICROPARCELA que
   * tenía el rango, y eso es justo lo que D3 prohíbe desde este cambio
   * (`rejilla_en_microparcela`): ninguna fila puede tener las dos cosas a la vez. Pero el
   * escenario que su propio comentario describía son DOS filas — «guardar la rejilla de la
   * parcela borraría el rango de sus microparcelas» —, así que eso es lo que se mide ahora,
   * que además es el caso real. La propiedad «ausente no es null» se conserva entera, y se
   * comprueba sobre la parcela con un atributo suyo que el formulario tampoco manda.
   */
  it("guardar la REJILLA no borra lo que el formulario no manda, porque ausente no es null", async () => {
    const m = await micro({ rangeRowFrom: 1, rangeRowTo: 4, rangePlantFrom: 1, rangePlantTo: 20 });
    // La parcela madre guarda SU rejilla, que es lo que hace `RejillaForm`.
    await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
    const madre = await prisma.location.findUniqueOrThrow({ where: { id: parcela.id } });
    expect(madre.rowCount, "la rejilla sí se guardó: el control de que la prueba mide").toBe(10);
    expect(madre.soilType, "y lo que el formulario no manda sobrevive").toBe(ATRIBUTOS.soilType);
    // Y el rango de su microparcela, que vive en otra fila, no se ha movido.
    const leido = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(leido.rangeRowFrom, "el rango de la microparcela sobrevive").toBe(1);
    expect(leido.rangeRowTo).toBe(4);
  });

  /**
   * Y el reverso: guardar el RANGO no borra lo que el formulario del rango no manda.
   * Mismo motivo que arriba para no usar la rejilla como lo-que-sobrevive: una
   * microparcela no puede tenerla. Se usa un atributo del terreno, que sí es suyo (D2).
   */
  it("guardar el rango no borra los atributos del terreno", async () => {
    const m = await micro();
    expect(m.soilType, "la microparcela nació con el suelo copiado de su madre (D2)").toBe(ATRIBUTOS.soilType);
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: m.id,
      rangeRowFrom: 1,
      rangeRowTo: 2,
      rangePlantFrom: 1,
      rangePlantTo: 2,
    });
    const leido = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(leido.rangeRowTo, "el rango sí se guardó: el control de que la prueba mide").toBe(2);
    expect(leido.soilType, "y el suelo sobrevive").toBe(ATRIBUTOS.soilType);
  });

  it("vaciar los cuatro quita el rango", async () => {
    const m = await micro({ rangeRowFrom: 1, rangeRowTo: 4, rangePlantFrom: 1, rangePlantTo: 20 });
    await updateLocationAttributes(usuario.userAccountId, {
      locationId: m.id,
      rangeRowFrom: null,
      rangeRowTo: null,
      rangePlantFrom: null,
      rangePlantTo: null,
    });
    const leido = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(leido.rangeRowFrom).toBeNull();
  });

  /**
   * **Se valida la fila RESULTANTE, no el input.** Cambiar sólo «hasta la hilera» sobre
   * una microparcela que ya tiene rango manda UN campo y sigue siendo un rango completo:
   * contar el input llamaría «medio rango» a la edición más normal que existe.
   */
  it("cambiar UN solo campo de un rango completo es válido", async () => {
    const m = await micro({ rangeRowFrom: 1, rangeRowTo: 4, rangePlantFrom: 1, rangePlantTo: 20 });
    await updateLocationAttributes(usuario.userAccountId, { locationId: m.id, rangeRowTo: 6 });
    const leido = await prisma.location.findUniqueOrThrow({ where: { id: m.id } });
    expect(leido.rangeRowTo).toBe(6);
  });

  /** Y el control: UN solo campo sobre una SIN rango sí es medio rango. */
  it("el control: un solo campo sobre una microparcela sin rango es medio rango", async () => {
    const m = await micro();
    await falla(
      updateLocationAttributes(usuario.userAccountId, { locationId: m.id, rangeRowTo: 6 }),
      "rejilla_rango_a_medias",
    );
  });

  it("un rango que no cabe en la rejilla de la madre vuelve con su código, no con un P0001", async () => {
    const m = await micro();
    await falla(
      updateLocationAttributes(usuario.userAccountId, {
        locationId: m.id,
        rangeRowFrom: 1,
        rangeRowTo: 99,
        rangePlantFrom: 1,
        rangePlantTo: 20,
      }),
      "rejilla_rango_fuera_de_rejilla",
    );
  });

  it("un rango al revés vuelve con su código", async () => {
    const m = await micro();
    await falla(
      updateLocationAttributes(usuario.userAccountId, {
        locationId: m.id,
        rangeRowFrom: 7,
        rangeRowTo: 3,
        rangePlantFrom: 1,
        rangePlantTo: 20,
      }),
      "rejilla_rango_al_reves",
    );
  });
});

