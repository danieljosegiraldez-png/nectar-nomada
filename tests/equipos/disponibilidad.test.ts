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
    eq({ id: "e", lifecycleStatus: "retired" }),
  ].map(clasificar);

  it("cuenta cada columna por lo que es", () => {
    const r = resumir(casos);
    expect(r.total).toBe(5);
    expect(r.libresYSanos).toBe(1);
    expect(r.enUso, "b y d").toBe(2);
    expect(r.requierenIntervencion, "c, d y e").toBe(3);
  });

  /**
   * **El control de que el solape es deliberado.** Si alguien «arregla» el
   * resumen para que las columnas sumen el total, tendrá que elegir en qué
   * columna cae el tanque ocupado y averiado — y esta prueba dirá que eligió.
   */
  it("las columnas SE SOLAPAN: 1 + 2 + 3 no es 5", () => {
    const r = resumir(casos);
    expect(r.libresYSanos + r.enUso + r.requierenIntervencion).not.toBe(r.total);
  });

  it("una lista vacía no inventa nada", () => {
    expect(resumir([])).toEqual({ total: 0, libresYSanos: 0, enUso: 0, requierenIntervencion: 0 });
  });
});
