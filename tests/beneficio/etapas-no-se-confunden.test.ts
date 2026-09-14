import { describe, expect, it } from "vitest";

import { validarDespulpado, validarLavado } from "../../lib/beneficio/balanceDeMasas";

/**
 * Cada etapa se juzga contra **su propio** rango de rendimiento.
 *
 * ## Por qué existe, y por qué NO está en los 47 vectores
 *
 * `docs/beneficio/12` §3 lo advierte con todas las letras:
 *
 * > *«Un motor que compare la salida de despulpado contra el rango de pergamino
 * > producirá `YIELD_IMPLAUSIBLE` en lotes perfectamente normales.»*
 *
 * Y su propia §F admite que **el autor cometió esa confusión al redactar** —
 * llamó «grano desmucilaginado» a la salida de la despulpadora, que significa lo
 * contrario— y tuvo que separar la Etapa C y corregir los vectores afectados.
 *
 * **Pero el contrato no dejó un vector que lo vigile.** `MB-013` comprueba el
 * estado del balance y el porcentaje de rendimiento; **no comprueba la ausencia
 * del aviso falso**. Medido con un flip-test el 2026-09-13: cambiando el rango
 * del pergamino por el del despulpado en baba, **los 47 vectores siguen
 * pasando**. La mutación entra sin que nada caiga.
 *
 * Así que este archivo cubre el hueco desde fuera, sin tocar
 * `tests/fixtures/vectores-de-beneficio.json`, que el paquete pide no modificar.
 *
 * ## La distinción, en una línea
 *
 * | magnitud | contra qué | rango |
 * |---|---|---|
 * | despulpado **en baba** | la cereza despulpada | 55–62 % |
 * | pergamino **lavado** | la cereza | 40–46 % |
 *
 * Son etapas distintas separadas por el lavado, y **sus rangos ni siquiera se
 * solapan**: usar uno por el otro no produce un error sutil, produce un aviso en
 * cada lote sano. Que es la forma más segura de enseñar a ignorar los avisos.
 *
 * Hermético: aritmética pura.
 */

/** Un lavado normal de Toabré: 580 kg de baba dan 438 de pergamino húmedo. */
const LAVADO_NORMAL = {
  depulpedInMucilageKg: 580,
  wetParchmentKg: 438,
  mucilageWashoutKg: 138,
  washLossKg: 4,
  totalCherryKg: 1000,
};

/** Un despulpado normal: de 1.000 kg de cereza salen 580 en baba y 415 de pulpa. */
const DESPULPADO_NORMAL = {
  depulpedInputKg: 1000,
  depulpedInMucilageKg: 580,
  pulpKg: 415,
  processLossKg: 5,
  lotId: "PE-90",
  weighingCondition: "DRAINED",
  upstreamWeighingCondition: "DRAINED",
} as const;

describe("las etapas no se juzgan con el rango de la otra", () => {
  /**
   * **El control positivo**, y sin él lo de abajo no vale: estos dos números
   * caen dentro del rango de la OTRA etapa. Si alguien cambiara los datos de
   * ejemplo por unos que casaran en los dos rangos, las pruebas seguirían verdes
   * sin vigilar nada.
   */
  it("los dos ejemplos son discriminantes: cada uno cae fuera del rango ajeno", () => {
    const pergamino = (LAVADO_NORMAL.wetParchmentKg / LAVADO_NORMAL.totalCherryKg) * 100;
    const baba = (DESPULPADO_NORMAL.depulpedInMucilageKg / DESPULPADO_NORMAL.depulpedInputKg) * 100;

    expect(pergamino, "el pergamino de ejemplo debe estar en su rango 40–46 %").toBeGreaterThanOrEqual(40);
    expect(pergamino).toBeLessThanOrEqual(46);
    expect(pergamino, "…y FUERA del rango de la baba, o no discrimina").toBeLessThan(55);

    expect(baba, "la baba de ejemplo debe estar en su rango 55–62 %").toBeGreaterThanOrEqual(55);
    expect(baba).toBeLessThanOrEqual(62);
    expect(baba, "…y FUERA del rango del pergamino, o no discrimina").toBeGreaterThan(46);
  });

  it("un lavado normal NO avisa de rendimiento implausible", () => {
    const r = validarLavado(LAVADO_NORMAL);
    expect(r.status).toBe("BALANCED");
    expect(
      r.warnings,
      `43,8 % de pergamino sobre cereza es normal; avisar aquí entrena al operador a ignorar los avisos: ${r.warnings.join(", ")}`,
    ).not.toContain("YIELD_IMPLAUSIBLE_PARCHMENT");
  });

  it("un despulpado normal NO avisa de rendimiento implausible", () => {
    const r = validarDespulpado(DESPULPADO_NORMAL);
    expect(r.status).toBe("BALANCED");
    expect(r.warnings, `avisos inesperados: ${r.warnings.join(", ")}`).toEqual([]);
  });
});
