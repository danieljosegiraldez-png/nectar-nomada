/**
 * Los identificadores de un alta en lote — ADR-149.
 *
 * **El incidente:** el dueño abrió la aplicación en el apiario el 2026-09-16 y lo que faltaba era
 * registrar cinco colmenas en cada sitio. El único camino creaba UNA: diez envíos para dos
 * apiarios, tecleando el identificador cada vez.
 *
 * Puras y sin base: el guardia llama a la función con la entrada hostil, que es lo único que
 * prueba una validación. Lo que cruza a Postgres —que el lote es atómico y que un identificador
 * repetido lo rechaza entero— va en `tests/apiary/altaEnLote.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  identificadoresDelLote,
  MAXIMO_POR_LOTE,
  AltaEnLoteInvalida,
} from "../../lib/apiary/identificadoresDeLote";

describe("los identificadores que saldrían", () => {
  it("LO QUE EL DUEÑO PIDIÓ: cinco colmenas con su prefijo", () => {
    expect(identificadoresDelLote("LN-", 1, 5)).toEqual(["LN-01", "LN-02", "LN-03", "LN-04", "LN-05"]);
  });

  it("el separador sale del prefijo, no lo añade nadie por su cuenta", () => {
    // Adivinarle un guion es cómo se parte una numeración en dos familias que no ordenan juntas.
    expect(identificadoresDelLote("LN", 1, 2)).toEqual(["LN01", "LN02"]);
    expect(identificadoresDelLote("H-", 1, 2)).toEqual(["H-01", "H-02"]);
  });

  it("rellena al ancho del número MÁS GRANDE del lote, para que ordenen como texto", () => {
    // Con ancho fijo de 2 esto daría «LN-8, LN-9, LN-10, LN-11», que ordena 10, 11, 8, 9.
    expect(identificadoresDelLote("LN-", 8, 4)).toEqual(["LN-08", "LN-09", "LN-10", "LN-11"]);
    expect(identificadoresDelLote("LN-", 98, 5)).toEqual(["LN-098", "LN-099", "LN-100", "LN-101", "LN-102"]);
  });

  it("con un mínimo de dos cifras aunque el lote sea de una", () => {
    expect(identificadoresDelLote("LN-", 3, 1)).toEqual(["LN-03"]);
  });

  it("empieza donde se le dice, no siempre en 1", () => {
    // El caso real: ya hay cinco y se añaden cinco más.
    expect(identificadoresDelLote("LN-", 6, 5)).toEqual(["LN-06", "LN-07", "LN-08", "LN-09", "LN-10"]);
  });
});

describe("lo que rechaza, y por qué", () => {
  it("un prefijo vacío o de sólo espacios", () => {
    expect(() => identificadoresDelLote("", 1, 5)).toThrow(/prefijo_vacio/);
    expect(() => identificadoresDelLote("   ", 1, 5)).toThrow(AltaEnLoteInvalida);
  });

  it("un «desde» que no es un entero de 1 o más", () => {
    expect(() => identificadoresDelLote("LN-", 0, 5)).toThrow(/desde_invalido/);
    expect(() => identificadoresDelLote("LN-", -1, 5)).toThrow(/desde_invalido/);
    expect(() => identificadoresDelLote("LN-", 1.5, 5)).toThrow(/desde_invalido/);
    // El caso que importa: el campo vacío llega como NaN desde la acción, NO como 0.
    expect(() => identificadoresDelLote("LN-", Number.NaN, 5)).toThrow(/desde_invalido/);
  });

  it("un «cuántas» que no es un entero de 1 o más", () => {
    expect(() => identificadoresDelLote("LN-", 1, 0)).toThrow(/cuantas_invalido/);
    expect(() => identificadoresDelLote("LN-", 1, Number.NaN)).toThrow(/cuantas_invalido/);
  });

  it("Y EL TECHO: un cero de más al teclear se ve, en vez de crear quinientas filas", () => {
    expect(() => identificadoresDelLote("LN-", 1, MAXIMO_POR_LOTE + 1)).toThrow(/cuantas_sobre_el_techo/);
    // Control positivo del techo: el máximo exacto SÍ pasa, o el guardia estaría una de menos.
    expect(identificadoresDelLote("LN-", 1, MAXIMO_POR_LOTE)).toHaveLength(MAXIMO_POR_LOTE);
  });

  it("el techo deja sitio de sobra para lo que el dueño instala", () => {
    // Cinco por apiario hoy; diez es el plan más grande de sus minutas. Si alguien baja el techo
    // por debajo de eso, esta prueba lo dice antes de que un alta real se rechace.
    expect(MAXIMO_POR_LOTE).toBeGreaterThanOrEqual(10);
  });
});
