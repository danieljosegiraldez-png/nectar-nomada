import { describe, expect, it } from "vitest";

import { loteDeReferencia } from "../../lib/traceability/lots";

/**
 * De qué padre hereda su origen un lote fusionado — hallazgo **F2-001** de la
 * auditoría, y **V-001** cuando llega a la pantalla.
 *
 * **Por qué esta prueba existe y no una contra la base.** El defecto era que
 * `recordTransformation` tomaba `inputLots[0]`, y ese arreglo venía de un
 * `findMany` **sin `orderBy`**. Así que «el primer padre» no era el primero que
 * el operario escribió: era la fila que Postgres devolviera primero. Una prueba
 * contra la base no puede provocar ese orden — pasaría o fallaría por suerte, que
 * es justo la clase de guardia que este repositorio ya ha pagado varias veces.
 *
 * Por eso la elección se extrajo a una función pura, sin cambiarla, y **se le
 * pasa la lista deliberadamente al revés**. Con el código de antes esta prueba
 * falla siempre; con el de ahora pasa siempre. Ninguna de las dos por suerte.
 *
 * **Y lo que esto NO arregla, para que nadie lo lea de más:** el lote fusionado
 * sigue heredando el origen de UN solo padre y sin marca de mezcla. Eso depende
 * de `D-F2-01`, que sigue abierta. Esto convierte el defecto de **aleatorio** en
 * **determinista**, que no es lo mismo que corregirlo.
 *
 * Hermético: listas en memoria.
 */

const A = { id: "aaa", locationId: "parcela-alta" };
const B = { id: "bbb", locationId: "parcela-baja" };

describe("el origen de un lote fusionado no lo decide el orden de un índice", () => {
  it("toma el primero que el operario escribió, aunque la base los devuelva al revés", () => {
    const entradas = [{ lotId: "aaa" }, { lotId: "bbb" }];
    // Como los devolvería Postgres sin `orderBy`: en cualquier orden.
    expect(loteDeReferencia([B, A], entradas).id, "la base los devolvió al revés").toBe("aaa");
    expect(loteDeReferencia([A, B], entradas).id, "y en el mismo orden").toBe("aaa");
  });

  /**
   * **El control positivo del propio análisis.** Sin él, la prueba de arriba
   * pasaría igual con una función que devolviera siempre el lote `aaa`.
   */
  it("y cuando el operario escribe el otro primero, toma ese", () => {
    const entradas = [{ lotId: "bbb" }, { lotId: "aaa" }];
    expect(loteDeReferencia([A, B], entradas).id).toBe("bbb");
    expect(loteDeReferencia([B, A], entradas).id).toBe("bbb");
  });

  /**
   * Un lote de entrada que no está en la lista cargada no puede ocurrir —
   * `recordTransformation` comprueba antes que las cuentas cuadren— pero si
   * ocurriera, **fallar es mejor que caer al primero que haya**: caer sería
   * exactamente el defecto original con otra cara.
   */
  it("si el primero declarado no está cargado, falla en vez de coger otro", () => {
    expect(() => loteDeReferencia([B], [{ lotId: "aaa" }, { lotId: "bbb" }])).toThrow();
  });
});
