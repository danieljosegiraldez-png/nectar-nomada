/**
 * El aviso previo del modo del instrumento, y la regla de que el café verde no
 * pertenece al secado. Dominio PURO, sin Prisma: corre en el carril hermético y
 * por eso NO se declara en `scripts/pruebas-por-compuerta.txt`.
 *
 * Por qué existe este aviso, con las palabras de Daniel (2026-09-15): *«a veces he
 * visto en campo que incorrectamente usan settings de medir café verde, o de
 * pergamino o en cereza y aplicarlo a otro por error o falta de conocimiento»*.
 * Medir pergamino con el ajuste de verde **no falla en rojo**: da un número
 * plausible y equivocado, que es la forma de error que esta casa persigue.
 */
import { describe, expect, it } from "vitest";
import { avisoDeModo, materialNoEsDeSecado, sinCamposVacios } from "../../lib/traceability/avisoDeModo";
import type { ModoDeMedicion } from "../../lib/equipos/modos";

// Los dos modos reales del AgraTronix COFFEE TESTER 08150, con sus rangos, tal
// como los nombra el catálogo del fabricante que Daniel compartió.
const MODOS: readonly ModoDeMedicion[] = [
  { id: "m-perg", label: "Parchment Coffee", materialState: "PARCHMENT", rangeMin: 8, rangeMax: 38 },
  { id: "m-verde", label: "Green Coffee", materialState: "GREEN", rangeMin: 7, rangeMax: 35 },
];

describe("el aviso sale ANTES de medir, y sólo cuando hay algo que avisar", () => {
  it("avisa con el nombre que usa el APARATO cuando el modo elegido no es el del material", () => {
    const aviso = avisoDeModo("PARCHMENT", MODOS, "m-verde");
    expect(aviso?.clave).toBe("aviso_modo_de_instrumento");
    // El nombre es del fabricante, no una paráfrasis nuestra: si la app dice
    // «usa el ajuste de pergamino» y el aparato no lo llama así, estorba.
    expect(aviso?.modo).toBe("Parchment Coffee");
  });

  it("NO avisa cuando el modo elegido es el correcto — el control positivo", () => {
    // Sin esta mitad, un `avisoDeModo` que avisara SIEMPRE pasaría la prueba de
    // arriba igual de verde.
    expect(avisoDeModo("PARCHMENT", MODOS, "m-perg")).toBeNull();
    expect(avisoDeModo("GREEN", MODOS, "m-verde")).toBeNull();
  });

  it("dice que el aparato no tiene modo para ese material, en vez de ofrecer uno al azar", () => {
    // El COFFEE TESTER no trae escala de cereza. Decirlo es más útil que dejar
    // que alguien elija una escala cualquiera y se lleve un número plausible.
    expect(avisoDeModo("CHERRY", MODOS, "m-perg")?.clave).toBe("aviso_sin_modo_para_material");
    expect(avisoDeModo("MUCILAGE_HONEY", MODOS, "m-perg")?.clave).toBe("aviso_sin_modo_para_material");
  });

  it("avisa también cuando aún no se ha elegido modo, que es el caso al abrir", () => {
    expect(avisoDeModo("PARCHMENT", MODOS, "")?.modo).toBe("Parchment Coffee");
  });

  it("sin material no afirma nada: la ignorancia no es una acusación", () => {
    expect(avisoDeModo(null, MODOS, "m-verde")).toBeNull();
  });
});

describe("el café verde no pertenece al secado", () => {
  it("lo señala en secado", () => {
    // Daniel, 2026-09-15: «en café verde nunca se ve en secado, eso es ya post
    // reposo almacenamiento».
    expect(materialNoEsDeSecado("GREEN", true)).toBe(true);
  });

  it("y NO señala lo que sí pertenece — los tres controles positivos", () => {
    for (const m of ["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"] as const) {
      expect(materialNoEsDeSecado(m, true), m).toBe(false);
    }
  });

  it("fuera del secado, el verde es normal", () => {
    expect(materialNoEsDeSecado("GREEN", false)).toBe(false);
  });
});

describe("un campo en blanco no viaja, pero el cero sí", () => {
  it("quita los vacíos y CONSERVA el cero", () => {
    // El agua da 0 °Bx. Convertir un blanco en cero fabrica un dato falso, y
    // tirar el cero borra una medición legítima: son dos errores distintos y
    // esta función tiene que evitar los dos.
    const entrada = new FormData();
    entrada.append("brix", "0");
    entrada.append("ph", "");
    entrada.append("nota", "   ");
    entrada.append("humedad", "11.5");

    const salida = sinCamposVacios(entrada);
    expect(salida.get("brix")).toBe("0");
    expect(salida.get("humedad")).toBe("11.5");
    expect(salida.has("ph")).toBe(false);
    expect(salida.has("nota")).toBe(false);
  });
});
