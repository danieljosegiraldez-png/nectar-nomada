import { describe, expect, it } from "vitest";

import { hayFloracion, type VentanaDeFloracion } from "../../lib/traceability/floracionVigente";

/**
 * El módulo puro que decide el aviso de floración.
 *
 * **Esta prueba llama a la función con la entrada hostil**, que es lo que un corpus real no hace.
 * Una ventana al revés, un instante inválido, una ventana de un bloque hermano: nada de eso aparece
 * recorriendo datos de la finca, así que una prueba que sólo recorriera datos reales no sería un
 * guardia de esto — sería una red para el día que lleguen.
 */
/**
 * **Los fixtures imitan cómo viven los datos de verdad, y eso es lo que los hace discriminar.** La
 * primera versión usaba MEDIODÍA UTC para las dos cosas, y con eso el fallo del día de cierre era
 * invisible: una revisión independiente lo vio cambiando sólo los fixtures. La ventana se guarda
 * como **campo de día** (medianoche UTC, `fechaDeDia`) y el instante consultado sale del
 * `datetime-local` del formulario, o sea un **reloj de pared en la zona del dispositivo**.
 */
const dia = (s: string) => new Date(`${s}T00:00:00.000Z`);
const cuando = (s: string, hora = "07:30") => new Date(`${s}T${hora}`);
const ventana = (v: Partial<VentanaDeFloracion>): VentanaDeFloracion => ({
  startsAt: dia("2026-03-01"),
  endsAt: dia("2026-03-20"),
  plotBlockId: null,
  ...v,
});

describe("hayFloracion", () => {
  it("dentro de una ventana cerrada sí, fuera no — y los dos bordes cuentan", () => {
    const vs = [ventana({})];
    expect(hayFloracion(vs, cuando("2026-03-10"), [])).toBe(true);
    expect(hayFloracion(vs, cuando("2026-03-01"), [])).toBe(true); // el día que se ven las flores
    expect(hayFloracion(vs, cuando("2026-03-20"), [])).toBe(true); // el día que se caen
    expect(hayFloracion(vs, cuando("2026-02-28"), [])).toBe(false);
    expect(hayFloracion(vs, cuando("2026-03-21"), [])).toBe(false);
  });

  it("una ventana SIN CIERRE cuenta como abierta, que es el estado mientras dura", () => {
    const vs = [ventana({ endsAt: null })];
    expect(hayFloracion(vs, cuando("2026-03-10"), [])).toBe(true);
    expect(hayFloracion(vs, cuando("2027-06-01"), [])).toBe(true);
    // Antes de empezar sigue siendo no: «abierta» no significa «siempre».
    expect(hayFloracion(vs, cuando("2026-02-28"), [])).toBe(false);
  });

  it("sin ventanas no avisa — vacío es «nadie anotó floración», no «hay»", () => {
    expect(hayFloracion([], cuando("2026-03-10"), [])).toBe(false);
  });

  /**
   * **El caso que la primera versión tenía mal**, y lo corrigió §D1 del diseño de la rejilla: la
   * herencia es por contención. Tratar la parcela entera entra todo lo de dentro, así que una
   * floración de un bloque TIENE que avisar cuando no se eligió ningún bloque. Decir que no
   * aplicaba habría callado el aviso justo cuando se asperja todo.
   */
  it("una ventana de bloque avisa cuando se trata la parcela entera (contención, §D1)", () => {
    const vs = [ventana({ plotBlockId: "bloque-A" })];
    expect(hayFloracion(vs, cuando("2026-03-10"), [])).toBe(true);
  });

  it("y avisa cuando ese bloque está entre los elegidos", () => {
    const vs = [ventana({ plotBlockId: "bloque-A" })];
    expect(hayFloracion(vs, cuando("2026-03-10"), ["bloque-A"])).toBe(true);
    expect(hayFloracion(vs, cuando("2026-03-10"), ["bloque-Z", "bloque-A"])).toBe(true);
  });

  it("pero NO por un bloque hermano que no se está tratando", () => {
    const vs = [ventana({ plotBlockId: "bloque-A" })];
    expect(hayFloracion(vs, cuando("2026-03-10"), ["bloque-B"])).toBe(false);
  });

  it("una ventana de la parcela aplica aunque se elijan bloques", () => {
    const vs = [ventana({ plotBlockId: null })];
    expect(hayFloracion(vs, cuando("2026-03-10"), ["bloque-B"])).toBe(true);
  });

  /**
   * **Un instante inválido se rechaza antes de comparar.** Hoy el resultado sería `false` igual,
   * porque toda comparación con `NaN` es falsa — y ésa es precisamente la razón de afirmarlo: un
   * `NaN` siempre halaga la hipótesis de «no hay floración», así que sin esta prueba nadie notaría
   * el día que alguien invirtiera la condición y el `NaN` empezara a decir «sí».
   */
  it("un instante inválido no avisa, y está dicho en vez de heredado del NaN", () => {
    const vs = [ventana({ endsAt: null })];
    expect(hayFloracion(vs, new Date("no es una fecha"), [])).toBe(false);
  });

  it("una ventana con fechas inválidas no avisa, y no arrastra a las buenas", () => {
    const rota = ventana({ startsAt: new Date("x"), endsAt: null });
    expect(hayFloracion([rota], cuando("2026-03-10"), [])).toBe(false);
    // Y la buena de al lado sigue avisando: una ventana rota no envenena la lista.
    expect(hayFloracion([rota, ventana({})], cuando("2026-03-10"), [])).toBe(true);
  });

  /**
   * Una ventana al revés no debería existir —la base la rechaza con un `CHECK` y el servicio con
   * una frase— pero si una llegara por SQL directo o por un importador, no puede volverse un aviso
   * permanente. `startsAt > endsAt` no cubre ningún instante.
   */
  it("una ventana al revés no cubre nada", () => {
    const alReves = ventana({ startsAt: dia("2026-03-20"), endsAt: dia("2026-03-01") });
    expect(hayFloracion([alReves], cuando("2026-03-10"), [])).toBe(false);
  });

  /**
   * **El día de CIERRE cuenta entero, y ésta es la prueba que lo fija.**
   *
   * `startsAt`/`endsAt` son campos de día —lo dice el esquema— así que valen la medianoche UTC del
   * día que nombran. Comparar `cuando <= endsAt` dejaba el último día de floración FUERA: medido el
   * 2026-10-01, ventana 1–20 de marzo y el operario a las 07:30 de Panamá, el 20 **callaba**. Lo
   * encontró una revisión independiente cambiando sólo los fixtures, no leyendo el código.
   *
   * El arreglo es el idioma que la casa ya usa en `lib/apiary/ceraDeExtraccion.ts`, puesto ahí por
   * una revisión de Codex por este mismo fallo: inicio inclusive, **día siguiente al cierre,
   * exclusivo**.
   */
  describe("el día de cierre cuenta entero", () => {
    const vs = [ventana({})]; // 1 a 20 de marzo, como campos de día

    it("el día de cierre avisa a cualquier hora, no sólo a su medianoche", () => {
      for (const hora of ["00:30", "07:30", "12:00", "23:30"]) {
        expect(hayFloracion(vs, cuando("2026-03-20", hora), []), `falla a las ${hora}`).toBe(true);
      }
    });

    it("y el día siguiente no avisa a ninguna hora — inclusive no es abierto", () => {
      for (const hora of ["00:30", "07:30", "23:30"]) {
        expect(hayFloracion(vs, cuando("2026-03-21", hora), []), `falla a las ${hora}`).toBe(false);
      }
    });

    it("el día de inicio también cuenta entero", () => {
      for (const hora of ["07:30", "23:30"]) {
        expect(hayFloracion(vs, cuando("2026-03-01", hora), []), `falla a las ${hora}`).toBe(true);
      }
    });
  });

  it("con varias ventanas basta una que aplique", () => {
    const vs = [ventana({ startsAt: dia("2025-03-01"), endsAt: dia("2025-03-20") }), ventana({})];
    expect(hayFloracion(vs, cuando("2026-03-10"), [])).toBe(true);
    expect(hayFloracion(vs, cuando("2025-03-10"), [])).toBe(true);
    expect(hayFloracion(vs, cuando("2024-03-10"), [])).toBe(false);
  });
});
