import { describe, expect, it } from "vitest";
import { compararConLaRejilla, type RejillaDeclarada } from "../../lib/traceability/plantingCohorts";

/**
 * La comparación entre lo que la rejilla **cabe** y lo que las siembras **cuentan**.
 *
 * Diseño §6 de `docs/superpowers/specs/2026-10-01-rejilla-y-bloques-design.md`.
 * Hermética: es una función pura y no toca la base, por lo mismo que
 * la densidad a su lado — un cociente guardado de dos entradas que se
 * mueven se queda viejo en silencio cada vez que alguien corrige una de las dos.
 *
 * **Devuelve un MOTIVO y no un número cuando no puede comparar**, porque las
 * maneras de no poder son hechos distintos y una pantalla tiene que poder decir
 * con cuál se topó. Un `null` las colapsa en «no hay datos», y un cero sería una
 * afirmación — ADR-080: «nunca registrado» y «registrado como cero» tienen que
 * seguir siendo distinguibles.
 */

/**
 * **Forma que cubre el tablero entero.** Desde D8 (2026-10-02) la capacidad sale de la
 * forma declarada, no de `filas × plantas`: sin forma el estado es `sin_forma` y no se
 * afirma ninguna capacidad. Las pruebas de abajo siguen midiendo lo que medían —
 * `propia` contra heredada, rango contra parcela entera— y para eso necesitan una
 * forma; la del tablero lleno es la que deja esas cifras intactas.
 */
const LLENO = [{ rowFrom: 1, rowTo: 10, plantFrom: 1, plantTo: 20 }] as const;

const REJILLA: RejillaDeclarada = { rowCount: 10, plantsPerRow: 20, rango: null, propia: true, forma: LLENO };

/** Lo que la comparación recibe de cada siembra: sólo el conteo y el estado. */
const siembra = (plantCount: number | null, status = "active" as const) => ({ plantCount, status });

describe("compararConLaRejilla", () => {
  it("sin rejilla declarada dice sin_rejilla, y no inventa capacidad", () => {
    const r = compararConLaRejilla(null, [siembra(140)]);
    expect(r.status).toBe("sin_rejilla");
    expect(r).not.toHaveProperty("capacidad");
  });

  /**
   * **El caso que ADR-080 exige, y el que más fácil se escribe mal.** Una parcela
   * numerada y sin siembras registradas cabe 200 plantas y tiene **cero
   * registradas**, que no es lo mismo que «tiene 0 plantas». Decir «0 de 200»
   * afirmaría que el suelo está vacío cuando lo que pasa es que nadie lo ha
   * contado.
   */
  it("sin siembras dice sin_cohortes con su capacidad, nunca «0 de 200»", () => {
    const r = compararConLaRejilla(REJILLA, []);
    expect(r.status).toBe("sin_cohortes");
    expect(r).toMatchObject({ capacidad: 200 });
    expect(r).not.toHaveProperty("contadas");
    expect(r).not.toHaveProperty("diferencia");
  });

  /**
   * **El defecto que una revisión independiente encontró el 2026-10-02, y el peor
   * de la tanda.** Una microparcela usa la numeración de su parcela (D3), pero su
   * suelo es **el trozo que ocupa**. Sin rango declarado, comparar sus siembras
   * contra la capacidad de la madre dice «Caben 200 y hay 70 contadas: una
   * diferencia de 130» sobre un suelo que no es suyo.
   *
   * Y le pasaría a TODAS: medido, cero archivos de `app/` pueden declarar ese
   * rango todavía. Peor aún, la primera versión de la prueba de cableado fijaba
   * esa conducta **como correcta** — una prueba que certifica un defecto hace más
   * daño que la ausencia de prueba.
   */
  it("rejilla HEREDADA y sin rango: no compara, dice sin_rango", () => {
    const heredada: RejillaDeclarada = { rowCount: 10, plantsPerRow: 20, rango: null, propia: false, forma: LLENO };
    const r = compararConLaRejilla(heredada, [siembra(70)]);
    expect(r.status).toBe("sin_rango");
    expect(r, "pasar la capacidad de la madre es el error que este estado evita").not.toHaveProperty(
      "capacidad",
    );
    expect(r).not.toHaveProperty("diferencia");
  });

  /**
   * Y el control que lo hace discriminar: la MISMA rejilla, declarada como propia,
   * sí compara. Si las dos dieran lo mismo, el campo `propia` no estaría haciendo
   * nada y la prueba de arriba no mediría.
   */
  it("el control: la misma rejilla, PROPIA, sí compara", () => {
    const propia: RejillaDeclarada = { rowCount: 10, plantsPerRow: 20, rango: null, propia: true, forma: LLENO };
    expect(compararConLaRejilla(propia, [siembra(70)])).toMatchObject({
      status: "ok",
      capacidad: 200,
      contadas: 70,
      diferencia: 130,
    });
  });

  /** Una siembra retirada no está en pie, así que no cuenta — ni como cohorte. */
  it("una siembra NO activa no cuenta: eso es sin_cohortes, no una comparación", () => {
    const r = compararConLaRejilla(REJILLA, [{ plantCount: 140, status: "renovated" }]);
    expect(r.status).toBe("sin_cohortes");
  });

  /**
   * **La fila que hace discriminar a esta prueba vive AQUÍ, no «sólo durante el
   * flip-test».** Una versión anterior del plan mandaba añadir la siembra sin
   * conteo de forma temporal, y sin ella filtrar o no filtrar daba lo mismo: el
   * flip no distinguía nada. La fila que hace discriminar a una prueba se queda en
   * ella.
   *
   * Y lo que se afirma es **que NO compara**: con una siembra sin contar, la
   * diferencia contra la capacidad sería una resta sobre un total incompleto, o
   * sea un número que parece cierto y no lo es.
   */
  it("con una siembra sin conteo dice conteo_incompleto y NO compara", () => {
    const r = compararConLaRejilla(REJILLA, [siembra(140), siembra(null)]);
    expect(r.status).toBe("conteo_incompleto");
    expect(r).toMatchObject({ capacidad: 200, contadas: 140, cohortesSinConteo: 1, cohortesTotales: 2 });
    expect(r, "una diferencia sobre un total incompleto es un número falso").not.toHaveProperty(
      "diferencia",
    );
  });

  it("con todo contado compara, y la diferencia es capacidad menos contadas", () => {
    const r = compararConLaRejilla(REJILLA, [siembra(140), siembra(20)]);
    expect(r).toMatchObject({ status: "ok", capacidad: 200, contadas: 160, diferencia: 40 });
  });

  /**
   * **La diferencia puede ser negativa, y eso no es un error que haya que ocultar.**
   * Más plantas contadas que celdas declaradas significa que la rejilla está mal
   * medida o que hay siembras fuera de ella — las dos cosas que el agrónomo
   * necesita ver. Un `Math.max(0, …)` convertiría ese aviso en un cero tranquilo.
   */
  it("más contadas que celdas da una diferencia NEGATIVA, no un cero", () => {
    const r = compararConLaRejilla(REJILLA, [siembra(250)]);
    expect(r).toMatchObject({ status: "ok", capacidad: 200, contadas: 250, diferencia: -50 });
  });

  /**
   * **D3: la capacidad de una microparcela es su RANGO, no la rejilla entera.**
   * La numeración es una sola, la de la parcela, así que una microparcela que
   * ocupa de la hilera 1 a la 4 cabe 4 × 20 = 80, no las 200 de su madre.
   * Comparar sus siembras contra las 200 diría que le faltan plantas por un suelo
   * que no es suyo.
   */
  it("con rango propio la capacidad son las celdas del rango", () => {
    const conRango: RejillaDeclarada = {
      rowCount: 10,
      plantsPerRow: 20,
      rango: { rowFrom: 1, rowTo: 4, plantFrom: 1, plantTo: 20 },
      propia: false,
      forma: LLENO,
    };
    const r = compararConLaRejilla(conRango, [siembra(70)]);
    expect(r).toMatchObject({ status: "ok", capacidad: 80, contadas: 70, diferencia: 10 });
  });

  /**
   * Y el control de que el rango no se cuela donde no debe: con el mismo número de
   * siembras, la parcela entera y la microparcela dan capacidades DISTINTAS. Si
   * dieran la misma, el rango no se estaría usando y esta prueba no mediría nada.
   */
  it("el control: la misma siembra contra la rejilla entera y contra el rango no dan lo mismo", () => {
    const entera = compararConLaRejilla(REJILLA, [siembra(70)]);
    const conRango = compararConLaRejilla(
      { rowCount: 10, plantsPerRow: 20, rango: { rowFrom: 1, rowTo: 4, plantFrom: 1, plantTo: 20 }, propia: false, forma: LLENO },
      [siembra(70)],
    );
    expect(entera).toMatchObject({ capacidad: 200 });
    expect(conRango).toMatchObject({ capacidad: 80 });
    expect(entera).not.toEqual(conRango);
  });

  /**
   * **Sin forma declarada no se afirma una capacidad** (D8, 2026-10-02).
   *
   * Antes de este cambio este caso caía en `ok` con `capacidad: 200` y
   * `diferencia: 50` — y en un lote al que le falta una esquina eso es falso: la
   * diferencia real es 20. Daniel corrigió la premisa el mismo día en que el diseño
   * que la daba por supuesta acabó de fusionarse.
   */
  it("con tablero y SIN forma dice sin_forma, y ningún número de diferencia", () => {
    const sinForma: RejillaDeclarada = {
      rowCount: 10,
      plantsPerRow: 20,
      rango: null,
      propia: true,
      forma: [],
    };
    const r = compararConLaRejilla(sinForma, [siembra(150)]);
    expect(r.status).toBe("sin_forma");
    expect(r).toMatchObject({ filas: 10, columnas: 20 });
    expect(r, "afirmar una capacidad es lo que este estado evita").not.toHaveProperty("capacidad");
    expect(r).not.toHaveProperty("diferencia");
    expect(r, "tampoco el conteo: ya está en la lista de siembras").not.toHaveProperty("contadas");
  });

  /** Con la esquina cortada la capacidad es 176, y la diferencia la de verdad. */
  it("con forma declarada vuelve a comparar, y la capacidad es la de la FORMA", () => {
    const conForma: RejillaDeclarada = {
      rowCount: 10,
      plantsPerRow: 20,
      rango: null,
      propia: true,
      forma: [
        { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 },
        { rowFrom: 8, rowTo: 10, plantFrom: 1, plantTo: 12 },
      ],
    };
    const r = compararConLaRejilla(conForma, [siembra(150)]);
    expect(r).toMatchObject({ status: "ok", capacidad: 176, contadas: 150, diferencia: 26 });
  });

  /**
   * **El control que hace que la de arriba mida.** 200 era la respuesta vieja; si la
   * forma no se estuviera usando, la capacidad seguiría siendo 200 y la prueba
   * anterior pasaría igual.
   */
  it("el control: la capacidad con forma NO es la del tablero entero", () => {
    const forma = [
      { rowFrom: 1, rowTo: 7, plantFrom: 1, plantTo: 20 },
      { rowFrom: 8, rowTo: 10, plantFrom: 1, plantTo: 12 },
    ];
    const r = compararConLaRejilla(
      { rowCount: 10, plantsPerRow: 20, rango: null, propia: true, forma },
      [siembra(1)],
    );
    expect(r).toMatchObject({ capacidad: 176 });
    expect(r).not.toMatchObject({ capacidad: 200 });
  });

  /**
   * **`sin_forma` va ANTES de `sin_cohortes`, y el orden importa:** `sin_cohortes`
   * dice «caben {capacidad} plantas», que es justo la afirmación que sin forma no se
   * puede sostener.
   */
  it("sin forma y sin siembras dice sin_forma, no sin_cohortes", () => {
    const r = compararConLaRejilla(
      { rowCount: 10, plantsPerRow: 20, rango: null, propia: true, forma: [] },
      [],
    );
    expect(r.status).toBe("sin_forma");
    expect(r).not.toHaveProperty("capacidad");
  });
});
