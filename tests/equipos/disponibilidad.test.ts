import { describe, expect, it } from "vitest";

import { clasificar, resumir, type HechosDelEquipo } from "../../lib/equipos/disponibilidad";

/**
 * «¿Qué fermentadores están libres **y** sanos?» — la pregunta que un
 * `status` de un solo campo no puede contestar.
 *
 * **Lo que más se vigila aquí es que los motivos se acumulen.** Un tanque
 * ocupado Y averiado tiene dos problemas con dos dueños distintos: el primero se
 * resuelve solo cuando la fermentación termine, el segundo necesita que alguien
 * vaya. Un refactor que devuelva «el primer motivo» —que es lo natural de
 * escribir— escondería el segundo, que es justo el accionable.
 *
 * Hermético: clasifica objetos literales.
 */

const eq = (p: Partial<HechosDelEquipo> = {}): HechosDelEquipo => ({
  id: "e1",
  lifecycleStatus: "active",
  condicion: null,
  enUso: false,
  ...p,
});

describe("libre y sano son dos cosas, y hacen falta las dos", () => {
  it("activo, sin informes y sin corrida abierta está libre y sano", () => {
    expect(clasificar(eq()).libreYSano).toBe(true);
  });

  it("en uso no está libre, aunque esté perfecto", () => {
    const c = clasificar(eq({ enUso: true }));
    expect(c.libreYSano).toBe(false);
    expect(c.motivos).toEqual(["EN_USO"]);
  });

  it("averiado no está sano, aunque esté libre", () => {
    const c = clasificar(eq({ condicion: "faulty" }));
    expect(c.libreYSano).toBe(false);
    expect(c.motivos).toEqual(["CONDICION"]);
  });

  /**
   * **La prueba que justifica los tres ejes.** Con un `status` de un solo campo
   * este caso obliga a elegir qué se pierde, y se pierde siempre lo mismo: la
   * avería, porque «en uso» es lo que se ve primero.
   */
  it("ocupado Y averiado devuelve LOS DOS motivos, no el primero", () => {
    const c = clasificar(eq({ enUso: true, condicion: "faulty" }));
    expect(c.motivos).toContain("EN_USO");
    expect(c.motivos).toContain("CONDICION");
    expect(c.motivos).toHaveLength(2);
  });

  it("retirado no está libre ni aunque nadie lo esté usando", () => {
    expect(clasificar(eq({ lifecycleStatus: "retired" })).motivos).toEqual(["RETIRADO"]);
  });

  /**
   * `operational` es un informe que dice que está bien. Tratarlo como «tiene un
   * informe, luego algo pasa» dejaría fuera a todo equipo que alguien haya
   * revisado alguna vez — al revés de lo que se busca.
   */
  it("un informe que dice «en servicio» NO lo saca de disponible", () => {
    expect(clasificar(eq({ condicion: "operational" })).libreYSano).toBe(true);
  });

  /**
   * Y «necesita limpieza» SÍ lo saca: un fermentador sucio no se puede llenar
   * sin lavarlo, así que para «¿cuántos tengo listos para la cereza del jueves?»
   * no está listo. Es barato de resolver, no ausente.
   */
  it("«necesita limpieza» cuenta como no disponible", () => {
    expect(clasificar(eq({ condicion: "needs_cleaning" })).libreYSano).toBe(false);
  });
});

describe("el recuento no se fuerza a sumar, y eso es correcto", () => {
  const casos = [
    eq({ id: "a" }),
    eq({ id: "b", enUso: true }),
    eq({ id: "c", condicion: "faulty" }),
    eq({ id: "d", enUso: true, condicion: "faulty" }),
    // Un retirado ya NO está aquí: desde la Parte 2c (§4.5) no cuenta como intervención y no suma a ninguna
    // columna, así que dejarlo en este recuento haría que 1 + 2 + 2 = 5 = total por casualidad y el control de
    // abajo —que el solape es deliberado— se quedaría vacío. Tiene su propio describe, al final del archivo.
  ].map(clasificar);

  it("cuenta cada columna por lo que es", () => {
    const r = resumir(casos);
    expect(r.total).toBe(4);
    expect(r.libresYSanos).toBe(1);
    expect(r.enUso, "b y d").toBe(2);
    expect(r.requierenIntervencion, "c y d").toBe(2);
  });

  /**
   * **El control de que el solape es deliberado.** Si alguien «arregla» el
   * resumen para que las columnas sumen el total, tendrá que elegir en qué
   * columna cae el tanque ocupado y averiado — y esta prueba dirá que eligió.
   */
  it("las columnas SE SOLAPAN: 1 + 2 + 2 no es 4", () => {
    const r = resumir(casos);
    expect(r.libresYSanos + r.enUso + r.requierenIntervencion).not.toBe(r.total);
  });

  it("una lista vacía no inventa nada", () => {
    expect(resumir([])).toEqual({ total: 0, libresYSanos: 0, enUso: 0, requierenIntervencion: 0 });
  });
});

/**
 * Parte 2c, §4.5 (decisión de Daniel, 2026-10-04): un equipo retirado **no es una intervención pendiente**. Antes de hoy
 * `resumir` lo contaba junto con las averías —«requiere intervención»—, y eso dejó de ser cierto cuando retirar pasó a
 * significar «se acabó»: nadie tiene que ir a arreglar lo que se retiró a propósito. **Sigue en el total (existe) y no
 * suma a NINGUNA columna**: ni libre y sano, ni en uso, ni requiere intervención.
 *
 * **Lo que más se vigila aquí son los motivos COMBINADOS.** `clasificar` acumula motivos, así que un retirado puede llegar
 * con `CONDICION` (un informe de avería sin resolver de antes de retirarlo) o con `EN_USO` (una fila vieja). Sacar
 * `RETIRADO` del predicado de «requiere intervención» no basta: el retirado averiado seguiría contando ahí por su
 * `CONDICION`, y el retirado ocupado contaría en «en uso» por su `EN_USO`. Cada caso combinado lleva al lado su control —el
 * mismo equipo ACTIVO sí cuenta en esa columna—, que es lo que dice que lo que lo saca es el retiro y no una columna rota.
 *
 * **`clasificar` NO cambia**: sigue emitiendo `RETIRADO`, porque otros lectores lo necesitan —`liberacionDeUnidad` para
 * no prometer la hora de una unidad retirada, y el mapa del tablero para pintarla—. Lo que cambia es sólo el RECUENTO.
 */
describe("un equipo retirado no es una intervención pendiente", () => {
  it("cuenta en el total y en NINGUNA columna: nadie tiene que ir a arreglarlo", () => {
    const sano = clasificar(eq({ id: "a" }));
    const retirado = clasificar(eq({ id: "e", lifecycleStatus: "retired" }));
    expect(resumir([sano, retirado])).toEqual({ total: 2, libresYSanos: 1, enUso: 0, requierenIntervencion: 0 });
  });

  it("retirado CON una avería sin resolver: tampoco cuenta como intervención", () => {
    const c = clasificar(eq({ id: "r1", lifecycleStatus: "retired", condicion: "faulty" }));
    expect(c.motivos, "la entrada lleva de verdad los dos motivos").toEqual(["RETIRADO", "CONDICION"]);
    expect(resumir([c])).toEqual({ total: 1, libresYSanos: 0, enUso: 0, requierenIntervencion: 0 });
  });

  it("control: el mismo equipo ACTIVO con esa avería SÍ cuenta como intervención", () => {
    const c = clasificar(eq({ id: "a1", condicion: "faulty" }));
    expect(resumir([c])).toEqual({ total: 1, libresYSanos: 0, enUso: 0, requierenIntervencion: 1 });
  });

  it("retirado CON una corrida abierta: tampoco cuenta como en uso", () => {
    const c = clasificar(eq({ id: "r2", lifecycleStatus: "retired", enUso: true }));
    expect(c.motivos, "la entrada lleva de verdad los dos motivos").toEqual(["RETIRADO", "EN_USO"]);
    expect(resumir([c])).toEqual({ total: 1, libresYSanos: 0, enUso: 0, requierenIntervencion: 0 });
  });

  it("control: el mismo equipo ACTIVO con esa corrida abierta SÍ cuenta en uso", () => {
    const c = clasificar(eq({ id: "a2", enUso: true }));
    expect(resumir([c])).toEqual({ total: 1, libresYSanos: 0, enUso: 1, requierenIntervencion: 0 });
  });

  it("clasificar SIGUE diciendo RETIRADO: la liberación de una unidad y el mapa lo leen", () => {
    expect(clasificar(eq({ lifecycleStatus: "retired", enUso: true })).motivos).toEqual(["RETIRADO", "EN_USO"]);
  });
});
