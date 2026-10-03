import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  LocationAccessError,
  RejillaInvalida,
  updateLocationAttributes,
} from "../../lib/traceability/locations";
import {
  anadirRangoAlBloque,
  createPlotBlock,
  quitarRangoDelBloque,
  setPlotBlockType,
} from "../../lib/traceability/plotBlocks";
import { crearParcela, crearUsuarioConAcceso, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * Los rangos de un bloque: dónde está dentro de la rejilla de su parcela.
 *
 * Diseño §4/§5 de `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md`,
 * decisiones **D5** (un bloque tiene uno o varios rangos: en L, o en dos trozos de
 * hileras, sigue siendo UNA unidad de observación) y **D7** (sólo las TRAMPAS no
 * pueden cubrir la misma celda; lo demás se avisa y se guarda).
 *
 * **Lo que se avisa no se rechaza, y eso es deliberado.** «Señalarlo, no
 * corregirlo en silencio» es la regla de la casa para los datos de terceros, y un
 * ensayo que se solape con una trampa es una decisión del agrónomo, no un error de
 * captura. Lo que el sistema debe hacer es decirle CUÁNTAS celdas comparte y con
 * quién.
 */

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let ajeno: Awaited<ReturnType<typeof crearUsuarioSinAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;
let bloqueIds: string[] = [];
let microIds: string[] = [];
let formaIds: string[] = [];

const REJILLA = { gridOrigin: "noroeste" as const, rowCount: 10, plantsPerRow: 20, rowSpacingMeters: 2.5 };

/** Fija la clase Y el código exacto: una expresión regular sobrevive a cambiar la clase. */
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
  ajeno = await crearUsuarioSinAcceso();
  parcela = await crearParcela();
  await updateLocationAttributes(usuario.userAccountId, { locationId: parcela.id, ...REJILLA });
});

afterEach(async () => {
  await prisma.plotBlockRange.deleteMany({
    where: assertDefinedWhere({ plotBlockId: { in: bloqueIds } }),
  });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: bloqueIds } }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ id: { in: bloqueIds } }) });
  bloqueIds = [];
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: microIds } }) });
  microIds = [];
  await prisma.plotShapeRange.deleteMany({ where: assertDefinedWhere({ id: { in: formaIds } }) });
  formaIds = [];
});

/**
 * **Lo que la corrida crea, la corrida lo borra — menos el ámbito de PLATAFORMA.**
 *
 * `crearUsuarioConAcceso` devuelve el ámbito compartido y quitarlo se lo quita a
 * los archivos que corren en paralelo. El de `crearUsuarioSinAcceso`, en cambio,
 * es un `scope` de ubicación propio y sí se borra — después de su `assignment`,
 * que lo referencia con `RESTRICT`.
 *
 * El orden lo mandan las claves ajenas, y la primera que se queje tira el resto.
 */
afterAll(async () => {
  for (const u of [usuario, ajeno]) {
    await prisma.auditEvent.deleteMany({
      where: assertDefinedWhere({ actorUserAccountId: u.userAccountId }),
    });
  }
  await prisma.location.deleteMany({
    where: assertDefinedWhere({
      id: { in: [parcela.id, parcela.parentLocationId ?? parcela.id, ajeno.locationId] },
    }),
  });
  for (const u of [usuario, ajeno]) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: u.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: u.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: u.personId }) });
  }
  // El de `ajeno` es un scope de UBICACIÓN y es suyo; el de plataforma no se toca.
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: ajeno.scopeId }) });
  await prisma.organization.deleteMany({
    where: assertDefinedWhere({ id: { in: [parcela.organizationId ?? "", ajeno.organizationId] } }),
  });
});

async function bloque(name: string, blockType: "trampa" | "experimental" | null, locationId?: string) {
  // **Un bloque SIN TIPO se crea con Prisma, no con el servicio, y es correcto.**
  // `createPlotBlock` lo rechaza a propósito: ADR-080 dice que un bloque de antes
  // de la migración NACIÓ `NULL`, no que se puedan crear así. Para probar esa
  // fila heredada hay que escribirla como existiría.
  const b =
    blockType === null
      ? await prisma.plotBlock.create({
          data: { locationId: locationId ?? parcela.id, name, blockType: null, createdBy: usuario.userAccountId },
        })
      : await createPlotBlock(usuario.userAccountId, {
          locationId: locationId ?? parcela.id,
          name,
          blockType,
        });
  bloqueIds.push(b.id);
  return b;
}

const RANGO = { rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 10 };

/** Declara un trozo de forma en la parcela. Devuelve el creado. */
async function forma(rowFrom: number, rowTo: number, plantFrom: number, plantTo: number) {
  const f = await prisma.plotShapeRange.create({
    data: { locationId: parcela.id, rowFrom, rowTo, plantFrom, plantTo, createdBy: usuario.userAccountId },
  });
  formaIds.push(f.id);
  return f;
}

describe("anadirRangoAlBloque", () => {
  it("guarda un rango que cabe, y no avisa de nada — el control positivo", async () => {
    const b = await bloque("Ensayo A", "experimental");
    const { rango, solapesAvisados } = await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: b.id,
      ...RANGO,
    });
    expect(rango.rowFrom).toBe(1);
    expect(rango.rowTo).toBe(5);
    expect(solapesAvisados).toEqual([]);
  });

  /**
   * **D5: varios rangos en el mismo bloque.** Un bloque en L son dos rangos, y
   * sigue siendo una sola unidad de observación. Si esto fallara, un agrónomo
   * tendría que partir el bloque en dos y perdería la unidad que mide.
   */
  it("un bloque admite VARIOS rangos", async () => {
    const b = await bloque("En L", "experimental");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: b.id,
      rowFrom: 6,
      rowTo: 8,
      plantFrom: 1,
      plantTo: 3,
    });
    const n = await prisma.plotBlockRange.count({ where: assertDefinedWhere({ plotBlockId: b.id }) });
    expect(n).toBe(2);
  });

  it("los cuatro estados malos del rango salen con su código", async () => {
    const b = await bloque("Ensayo A", "experimental");
    await falla(
      anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO, rowTo: 40 }),
      "rejilla_rango_fuera_de_rejilla",
    );
    await falla(
      anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO, rowFrom: 5, rowTo: 1 }),
      "rejilla_rango_al_reves",
    );
    await falla(
      anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO, rowFrom: 0 }),
      "rejilla_rango_no_es_celda",
    );
  });

  /**
   * **El informe de solape, que es lo que D7 pide para todo lo que NO es trampa.**
   * Un experimental encima de una trampa **se guarda**, y el servicio devuelve con
   * quién se solapa y cuántas celdas comparten — 5 hileras × 10 plantas = 50 si es
   * el mismo rango.
   */
  it("avisa del solape con su nombre y sus celdas, y guarda igual", async () => {
    const t = await bloque("Trampas Alto", "trampa");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t.id, ...RANGO });
    const ex = await bloque("Ensayo A", "experimental");
    const { rango, solapesAvisados } = await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: ex.id,
      ...RANGO,
    });
    expect(rango.plotBlockId).toBe(ex.id);
    expect(solapesAvisados).toHaveLength(1);
    expect(solapesAvisados[0]?.bloque).toBe("Trampas Alto");
    expect(solapesAvisados[0]?.celdas).toBe(5 * 10);
  });

  /**
   * Y el control de que no avisa de más: dos rangos que comparten hileras pero NO
   * plantas no se solapan. Un detector que mirara una sola dimensión rechazaría
   * bloques legítimos, que es peor que no tener detector.
   */
  it("no avisa cuando sólo coincide UNA dimensión", async () => {
    const t = await bloque("Trampas Alto", "trampa");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t.id, ...RANGO });
    const ex = await bloque("Ensayo A", "experimental");
    const { solapesAvisados } = await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: ex.id,
      rowFrom: 1,
      rowTo: 5,
      plantFrom: 11,
      plantTo: 20,
    });
    expect(solapesAvisados).toEqual([]);
  });

  /**
   * **El aviso cuenta la UNIÓN de celdas, no la suma de intersecciones.**
   * Encontrado por una revisión independiente el 2026-10-02: con un vecino cuyos
   * dos rangos se pisan entre sí, el servicio informaba **70 celdas donde hay
   * 50**. Un número inflado en un aviso es peor que ningún aviso: el agrónomo
   * decide sobre él.
   *
   * No se vio porque **con un vecino de un solo rango suma y unión coinciden**, y
   * eso es lo que tenían todas las pruebas de arriba. Nada impide hoy que los
   * rangos de un mismo bloque se solapen entre sí, así que el caso es alcanzable.
   */
  it("el aviso cuenta la unión: un vecino con dos rangos que se pisan no infla la cifra", async () => {
    const ex = await bloque("Ensayo A", "experimental");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: ex.id, ...RANGO });
    await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: ex.id,
      rowFrom: 4,
      rowTo: 8,
      plantFrom: 1,
      plantTo: 10,
    });
    const otro = await bloque("Ensayo B", "experimental");
    const { solapesAvisados } = await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: otro.id,
      ...RANGO,
    });
    expect(solapesAvisados).toHaveLength(1);
    expect(solapesAvisados[0]?.celdas, "la suma daría 70; la unión es 50").toBe(50);
  });

  /** **D7: dos trampas sobre el mismo sitio NO entran**, y sale con su código. */
  it("dos trampas en la misma parcela se rechazan", async () => {
    const t1 = await bloque("Trampas Alto", "trampa");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t1.id, ...RANGO });
    const t2 = await bloque("Trampas Bajo", "trampa");
    await falla(
      anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t2.id, ...RANGO }),
      "rejilla_trampas_se_solapan",
    );
  });

  /**
   * **AUTORIZACIÓN, y es el caso que el plan manda escribir por su nombre.**
   * `requireLocationAttributeAccess` y sus hermanas son un **OR** sobre los
   * candidatos, no un AND, así que un guardia de autorización sin su prueba
   * negativa no es un guardia: pasa igual quitándolo.
   *
   * `ajeno` es Farm Operator de OTRA parcela, así que tiene el permiso pero no
   * sobre este suelo — que es el caso que de verdad ocurre, no un usuario sin
   * ningún permiso.
   */
  it("un usuario sin acceso a ESTA parcela no puede añadir un rango", async () => {
    const b = await bloque("Ensayo A", "experimental");
    // **Fija la CLASE, no una expresión regular.** Lo señaló una revisión
    // independiente: con `toThrow(/access/i)`, sustituir el guardia por un
    // `throw new Error("access")` dejaba la prueba en verde — y un guardia de
    // autorización sin su prueba negativa no es un guardia.
    let caido: unknown = null;
    try {
      await anadirRangoAlBloque(ajeno.userAccountId, { plotBlockId: b.id, ...RANGO });
    } catch (e) {
      caido = e;
    }
    expect(caido, "tiene que ser la clase de acceso del dominio").toBeInstanceOf(LocationAccessError);
    const n = await prisma.plotBlockRange.count({ where: assertDefinedWhere({ plotBlockId: b.id }) });
    expect(n, "no debe haber escrito nada").toBe(0);
  });

  it("deja su acto en el libro de auditoría", async () => {
    const b = await bloque("Ensayo A", "experimental");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    const ev = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: b.id, operation: "plot_block.add_range" }),
    });
    expect(ev).not.toBeNull();
    const despues = ev?.after as Record<string, unknown> | null;
    expect(despues?.rowFrom).toBe(1);
    expect(despues?.plantTo).toBe(10);
  });
});

describe("quitarRangoDelBloque", () => {
  it("lo quita, y lo deja escrito", async () => {
    const b = await bloque("Ensayo A", "experimental");
    const { rango } = await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    await quitarRangoDelBloque(usuario.userAccountId, rango.id);
    const n = await prisma.plotBlockRange.count({ where: assertDefinedWhere({ plotBlockId: b.id }) });
    expect(n).toBe(0);
    const ev = await prisma.auditEvent.findFirst({
      where: assertDefinedWhere({ entityId: b.id, operation: "plot_block.remove_range" }),
    });
    expect(ev, "quitar un rango es un acto y se registra").not.toBeNull();
  });

  it("un usuario sin acceso a ESTA parcela no puede quitarlo", async () => {
    const b = await bloque("Ensayo A", "experimental");
    const { rango } = await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    let caido: unknown = null;
    try {
      await quitarRangoDelBloque(ajeno.userAccountId, rango.id);
    } catch (e) {
      caido = e;
    }
    expect(caido).toBeInstanceOf(LocationAccessError);
    const n = await prisma.plotBlockRange.count({ where: assertDefinedWhere({ plotBlockId: b.id }) });
    expect(n, "no debe haber borrado nada").toBe(1);
  });
});

describe("las tres reglas que la base NO garantizaba (tarea 8)", () => {
  const micro = async (name: string, rango?: { rowFrom: number; rowTo: number; plantFrom: number; plantTo: number }) => {
    const m = await prisma.location.create({
      data: {
        name: `${name} ${Date.now()}-${Math.round(performance.now())}`,
        locationType: "plot",
        parentLocationId: parcela.id,
        organizationId: parcela.organizationId,
        status: "approved",
        ...(rango
          ? {
              rangeRowFrom: rango.rowFrom,
              rangeRowTo: rango.rowTo,
              rangePlantFrom: rango.plantFrom,
              rangePlantTo: rango.plantTo,
            }
          : {}),
      },
    });
    microIds.push(m.id);
    return m;
  };

  /**
   * **ESTA PRUEBA DECÍA LO CONTRARIO, y era un hueco documentado.** Afirmaba que
   * dos trampas en microparcelas hermanas ENTRAN porque el disparador comparaba
   * `location_id`. Una revisión independiente demostró que eso no era una decisión
   * sino un defecto: la variable del disparador se llamaba `mi_parcela` y guardaba
   * el sitio del BLOQUE, que para un bloque en microparcela es la microparcela. El
   * nombre delataba la intención.
   *
   * D7 no lleva calificativo de sitio, y D3 dice que la numeración es UNA. Dos
   * trampas que comparten celdas de la misma rejilla están prohibidas, cuelguen de
   * donde cuelguen. `20261002040000_las_tres_reglas_que_faltaban` lo corrige, y el
   * servicio se igualó.
   */
  it("dos trampas en microparcelas HERMANAS ahora se rechazan", async () => {
    const m1 = await micro("TEST Micro Norte");
    const m2 = await micro("TEST Micro Sur");
    const t1 = await bloque("Trampas Norte", "trampa", m1.id);
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t1.id, ...RANGO });
    const t2 = await bloque("Trampas Sur", "trampa", m2.id);
    await falla(
      anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t2.id, ...RANGO }),
      "rejilla_trampas_se_solapan",
    );
  });

  /** Y la base lo garantiza aunque nadie pase por el servicio. */
  it("y el disparador las rechaza también por SQL directo", async () => {
    const m1 = await micro("TEST Micro Norte");
    const m2 = await micro("TEST Micro Sur");
    const t1 = await bloque("Trampas Norte", "trampa", m1.id);
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t1.id, ...RANGO });
    const t2 = await bloque("Trampas Sur", "trampa", m2.id);
    await expect(
      prisma.plotBlockRange.create({
        data: { ...RANGO, plotBlockId: t2.id, createdBy: usuario.userAccountId },
      }),
    ).rejects.toThrow(/no cubren las mismas celdas/);
  });

  /**
   * **El rango de un bloque cabe en la rejilla, y ahora lo dice la BASE.** Hasta
   * la tarea 8 sólo lo validaba el servicio: un `INSERT` directo con 99×99 entraba,
   * y el §5.1 del diseño afirmaba una garantía que no existía.
   */
  it("un rango de bloque fuera de la rejilla lo rechaza el disparador, no sólo el servicio", async () => {
    const b = await bloque("Ensayo A", "experimental");
    await expect(
      prisma.plotBlockRange.create({
        data: {
          rowFrom: 1,
          rowTo: 99,
          plantFrom: 1,
          plantTo: 99,
          plotBlockId: b.id,
          createdBy: usuario.userAccountId,
        },
      }),
    ).rejects.toThrow(/no cabe en la rejilla de la parcela/);
  });

  /**
   * **Y no se sale de su microparcela.** Esto no lo impedía NADA —ni la base ni el
   * servicio—: un bloque pertenecía administrativamente a un suelo y ocupaba otro.
   * Ahora lo dicen los dos, y aquí se comprueban los dos caminos.
   */
  it("un bloque no puede ocupar suelo fuera de su microparcela", async () => {
    const m = await micro("TEST Micro Alta", { rowFrom: 1, rowTo: 4, plantFrom: 1, plantTo: 20 });
    const b = await bloque("Ensayo en la micro", "experimental", m.id);
    await falla(
      anadirRangoAlBloque(usuario.userAccountId, {
        plotBlockId: b.id,
        rowFrom: 8,
        rowTo: 10,
        plantFrom: 1,
        plantTo: 20,
      }),
      `rejilla_fuera_de_la_microparcela:${m.name}`,
    );
    await expect(
      prisma.plotBlockRange.create({
        data: {
          rowFrom: 8,
          rowTo: 10,
          plantFrom: 1,
          plantTo: 20,
          plotBlockId: b.id,
          createdBy: usuario.userAccountId,
        },
      }),
    ).rejects.toThrow(/se sale de la microparcela/);
  });

  /** El control de que no rechaza de más: dentro de su rango, sí entra. */
  it("el control: dentro del rango de su microparcela sí entra", async () => {
    const m = await micro("TEST Micro Alta", { rowFrom: 1, rowTo: 4, plantFrom: 1, plantTo: 20 });
    const b = await bloque("Ensayo en la micro", "experimental", m.id);
    const { rango } = await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: b.id,
      rowFrom: 2,
      rowTo: 3,
      plantFrom: 1,
      plantTo: 10,
    });
    expect(rango.rowFrom).toBe(2);
  });

  /**
   * **Marcar como trampa un bloque que ya se solapa con una trampa.** El disparador
   * de solapes vive en `plot_block_range`, así que cambiar el TIPO después no
   * volvía a comprobar nada — y `AsignarTipoDeBloqueForm` ofrece justo los bloques
   * sin tipo. Era el camino por el que un solape de trampas entraba sin que nadie
   * lo viera.
   */
  it("un bloque SIN TIPO que se solapa con una trampa no puede pasar a trampa", async () => {
    const t1 = await bloque("Trampas Alto", "trampa");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t1.id, ...RANGO });
    const sin = await bloque("Viejo sin tipo", null);
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: sin.id, ...RANGO });
    await falla(
      setPlotBlockType(usuario.userAccountId, { plotBlockId: sin.id, blockType: "trampa" }),
      `rejilla_trampas_se_solapan_al_marcar:Trampas Alto`,
    );
    await expect(
      prisma.plotBlock.update({ where: { id: sin.id }, data: { blockType: "trampa" } }),
    ).rejects.toThrow(/No se puede marcar como trampa/);
  });

  /** Y el control: sin solape, marcarlo como trampa sí se puede. */
  it("el control: sin solape, pasar a trampa sí se puede", async () => {
    const t1 = await bloque("Trampas Alto", "trampa");
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t1.id, ...RANGO });
    const sin = await bloque("Viejo sin tipo", null);
    await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: sin.id,
      rowFrom: 6,
      rowTo: 8,
      plantFrom: 1,
      plantTo: 10,
    });
    const r = await setPlotBlockType(usuario.userAccountId, {
      plotBlockId: sin.id,
      blockType: "trampa",
    });
    expect(r.blockType).toBe("trampa");
  });
});

describe("D11: cuántas celdas del trozo NO están plantadas", () => {
  /**
   * **Sin forma declarada da 0, no 50.** Es la mitad que importa: si devolviera el
   * trozo entero, cada parcela sin forma avisaría de que todo está sin plantar, y eso
   * convertiría un «no medido» en una afirmación (ADR-080).
   */
  it("sin forma declarada da 0, no el trozo entero", async () => {
    const b = await bloque("Sin forma", "experimental");
    const r = await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    expect(r.celdasSinPlantar).toBe(0);
  });

  it("con el trozo enteramente dentro de la forma da 0", async () => {
    await forma(1, 7, 1, 20);
    const b = await bloque("Dentro", "experimental");
    const r = await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    expect(r.celdasSinPlantar).toBe(0);
  });

  /**
   * **El caso que discrimina.** El trozo son las hileras 1-5 × plantas 1-10 = 50
   * celdas; la forma sólo llega a la hilera 3, así que las hileras 4 y 5 quedan fuera:
   * 2 × 10 = 20. Si los dos casos dieran lo mismo, la cuenta no estaría usando la
   * forma.
   */
  it("con el trozo a medias cuenta sólo la parte de fuera", async () => {
    await forma(1, 3, 1, 20);
    const b = await bloque("A medias", "experimental");
    const r = await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    expect(r.celdasSinPlantar).toBe(20);
  });

  /** Y en el claro entero: las 50 celdas del trozo. */
  it("con el trozo enteramente fuera de la forma cuenta todas sus celdas", async () => {
    await forma(8, 10, 1, 20);
    const b = await bloque("En el claro", "experimental");
    const r = await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: b.id, ...RANGO });
    expect(r.celdasSinPlantar).toBe(50);
  });
});
