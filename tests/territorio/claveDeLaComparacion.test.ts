import { describe, expect, it } from "vitest";
import { claveDeLaComparacion } from "../../lib/traceability/plantingCohorts";

/**
 * Qué frase pinta la ficha para cada estado de la comparación.
 *
 * **Pura y sin renderizar, que es como esta casa prueba pantallas.** El
 * precedente es `claveDeTituloDeBloque`: devuelve la clave y los números, y el
 * llamador hace `t(clave, params)`. No hay infraestructura para renderizar
 * componentes en este repositorio —cero `.test.tsx`, ni `jsdom`, ni
 * `testing-library`, frente a 381 pruebas `.test.ts`— y los cuatro guardias de
 * pantalla leen la FUENTE. Añadir un stack de renderizado para esta tarea sería
 * un cambio del andamio de pruebas, no un detalle, y es decisión de Daniel.
 *
 * Lo que sí se puede probar aquí, y es lo que importa: que **cada estado tenga su
 * frase propia** y que **ninguno caiga en la del vecino**. Una pantalla que
 * dijera «faltan 60» cuando el estado es `conteo_incompleto` afirmaría un número
 * que no se puede calcular.
 */

describe("claveDeLaComparacion", () => {
  it("cada estado tiene SU clave, y las cuatro son distintas", () => {
    const claves = [
      claveDeLaComparacion({ status: "sin_rejilla" }).clave,
      claveDeLaComparacion({ status: "sin_rango" }).clave,
      claveDeLaComparacion({ status: "sin_cohortes", capacidad: 200 }).clave,
      claveDeLaComparacion({
        status: "conteo_incompleto",
        capacidad: 200,
        contadas: 140,
        cohortesSinConteo: 1,
        cohortesTotales: 2,
      }).clave,
      claveDeLaComparacion({ status: "ok", capacidad: 200, contadas: 140, diferencia: 60 }).clave,
    ];
    expect(new Set(claves).size, "dos estados con la misma frase son un estado perdido").toBe(5);
  });

  /**
   * **Sin siembras NO lleva un conteo**, ni un cero. Si la frase recibiera
   * `contadas: 0` diría «0 de 200», que es la afirmación que ADR-080 prohíbe: el
   * suelo no está vacío, es que nadie lo contó.
   */
  it("sin siembras pasa la capacidad y NADA más", () => {
    const r = claveDeLaComparacion({ status: "sin_cohortes", capacidad: 200 });
    expect(r.params).toEqual({ capacidad: 200 });
    expect(r.params).not.toHaveProperty("contadas");
    expect(r.params).not.toHaveProperty("diferencia");
  });

  /**
   * **`sin_rango` no pasa NINGÚN número, y eso es el arreglo.** Pasar la capacidad
   * de la madre a la frase de una microparcela sin rango es exactamente el defecto
   * que ese estado existe para no cometer.
   */
  it("sin_rango no pasa ningún número", () => {
    expect(claveDeLaComparacion({ status: "sin_rango" }).params).toEqual({});
  });

  /** Sin rejilla no hay ningún número que pasar. */
  it("sin rejilla no pasa ningún número", () => {
    expect(claveDeLaComparacion({ status: "sin_rejilla" }).params).toEqual({});
  });

  /**
   * **`conteo_incompleto` no pasa `diferencia`, y es la mitad que importa.** La
   * resta sobre un total incompleto es un número que parece cierto; si llegara a
   * la plantilla, un descuido de redacción lo pintaría.
   */
  it("conteo_incompleto dice cuántas faltan por contar y NO pasa diferencia", () => {
    const r = claveDeLaComparacion({
      status: "conteo_incompleto",
      capacidad: 200,
      contadas: 140,
      cohortesSinConteo: 1,
      cohortesTotales: 2,
    });
    expect(r.params).toMatchObject({ capacidad: 200, contadas: 140, sinContar: 1 });
    expect(r.params).not.toHaveProperty("diferencia");
  });

  it("ok pasa los tres números, diferencia incluida y con su signo", () => {
    expect(claveDeLaComparacion({ status: "ok", capacidad: 200, contadas: 250, diferencia: -50 }).params)
      .toEqual({ capacidad: 200, contadas: 250, diferencia: -50 });
  });
});
