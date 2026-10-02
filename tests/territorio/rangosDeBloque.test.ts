import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { RejillaInvalida, updateLocationAttributes } from "../../lib/traceability/locations";
import {
  anadirRangoAlBloque,
  createPlotBlock,
  quitarRangoDelBloque,
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

async function bloque(name: string, blockType: "trampa" | "experimental", locationId?: string) {
  const b = await createPlotBlock(usuario.userAccountId, {
    locationId: locationId ?? parcela.id,
    name,
    blockType,
  });
  bloqueIds.push(b.id);
  return b;
}

const RANGO = { rowFrom: 1, rowTo: 5, plantFrom: 1, plantTo: 10 };

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
    await expect(
      anadirRangoAlBloque(ajeno.userAccountId, { plotBlockId: b.id, ...RANGO }),
    ).rejects.toThrow(/access|not_authorized|classification/i);
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
    await expect(quitarRangoDelBloque(ajeno.userAccountId, rango.id)).rejects.toThrow(
      /access|not_authorized|classification/i,
    );
    const n = await prisma.plotBlockRange.count({ where: assertDefinedWhere({ plotBlockId: b.id }) });
    expect(n, "no debe haber borrado nada").toBe(1);
  });
});

describe("el hueco del disparador de D7, escrito para que no se olvide", () => {
  /**
   * **El disparador de la tarea 2 compara `b2."location_id" = mi_parcela`**, así
   * que dos trampas que viven en MICROPARCELAS DISTINTAS de la misma parcela
   * comparten rejilla (D3: la numeración es una) y **la base no las ve**.
   *
   * Esta prueba afirma el mundo como es hoy, no como debería ser: la segunda
   * trampa ENTRA, y el servicio la avisa. Está aquí porque un hueco que nadie
   * nombra se descubre en la finca; y el día que se decida cerrarlo en la base,
   * esta prueba cae y obliga a venir a cambiarla a propósito.
   *
   * El servicio **no** lo rechaza por su cuenta a propósito: una restricción que
   * viva sólo en TypeScript deja al importador y al SQL directo pasar, y además
   * haría que el servicio rechazara lo que la base acepta — de los dos lados
   * posibles, el peligroso.
   */
  it("dos trampas en microparcelas distintas de la misma parcela: la base NO las rechaza, el servicio avisa", async () => {
    const micro = async (name: string) => {
      const m = await prisma.location.create({
        data: {
          name: `${name} ${Date.now()}`,
          locationType: "plot",
          parentLocationId: parcela.id,
          organizationId: parcela.organizationId,
          status: "approved",
        },
      });
      microIds.push(m.id);
      return m;
    };
    const m1 = await micro("TEST Micro Norte");
    const m2 = await micro("TEST Micro Sur");
    const t1 = await bloque("Trampas Norte", "trampa", m1.id);
    await anadirRangoAlBloque(usuario.userAccountId, { plotBlockId: t1.id, ...RANGO });
    const t2 = await bloque("Trampas Sur", "trampa", m2.id);
    const { rango, solapesAvisados } = await anadirRangoAlBloque(usuario.userAccountId, {
      plotBlockId: t2.id,
      ...RANGO,
    });
    expect(rango.plotBlockId, "hoy la base lo permite").toBe(t2.id);
    expect(
      solapesAvisados.map((s) => s.bloque),
      "y el servicio sí lo ve, porque mira la rejilla entera",
    ).toContain("Trampas Norte");
  });
});
