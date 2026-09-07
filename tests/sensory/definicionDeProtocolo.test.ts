/**
 * Lo que decide qué protocolo acaba en producción.
 *
 * **Por qué importa (2026-09-06).** Hasta hoy no había forma de crear un
 * protocolo salvo `prisma/seed.ts` con `SEED_DEMO_CONTENT=true`, así que en
 * producción no había ninguno y no se podía registrar ni un puntaje de taza.
 * El script que lo arregla escribe en producción; esta validación es lo único
 * que hay entre un archivo mal escrito y una base con un protocolo inservible.
 *
 * La última prueba es la que da sentido a todas las demás: **el archivo real
 * pasa**. Sin ella, un validador que rechazara todo saldría igual de verde.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validarDefinicion, DefinicionInvalida } from "../../lib/sensory/definicionDeProtocolo";
import { ATRIBUTOS_CVA_AFECTIVO } from "../../lib/sensory/puntajeCva";

const RAIZ = new URL("../..", import.meta.url).pathname;

/** Una definición válida mínima, que cada prueba estropea de una sola forma. */
function base() {
  return {
    domain: "coffee",
    name: "Prueba",
    description: "Una descripción.",
    standardSourceReference: "De dónde viene.",
    standardLicenseStatus: "pending_license" as const,
    version: 1,
    scoreMin: 0,
    scoreMax: 10,
    attributes: [{ name: "Aroma", section: "descriptive" as const, scaleMin: 0, scaleMax: 10 }],
  };
}

describe("la definición de un protocolo se comprueba antes de tocar producción", () => {
  it("acepta una definición correcta", () => {
    expect(validarDefinicion(base()).name).toBe("Prueba");
  });

  it("rechaza una procedencia ausente — un protocolo sin ella se publica como oficial", () => {
    expect(() => validarDefinicion({ ...base(), standardSourceReference: "  " })).toThrow(DefinicionInvalida);
  });

  it("rechaza un estado de licencia inventado", () => {
    expect(() => validarDefinicion({ ...base(), standardLicenseStatus: "gratis" })).toThrow(/standardLicenseStatus/);
  });

  it("rechaza un rango invertido", () => {
    expect(() => validarDefinicion({ ...base(), scoreMin: 10, scoreMax: 0 })).toThrow(/menor/);
  });

  it("rechaza un protocolo sin atributos: no podría puntuar nada", () => {
    expect(() => validarDefinicion({ ...base(), attributes: [] })).toThrow(/sin atributos/);
  });

  it("rechaza dos atributos con el mismo nombre", () => {
    const d = base();
    d.attributes = [d.attributes[0]!, { ...d.attributes[0]! }];
    expect(() => validarDefinicion(d)).toThrow(/Dos atributos/);
  });

  /**
   * Un atributo que puntúa fuera del rango del protocolo produce totales que
   * nadie puede interpretar, y no lo impide ninguna restricción de la base.
   */
  it("rechaza un atributo cuya escala se sale del rango del protocolo", () => {
    const d = base();
    d.attributes = [{ name: "Aroma", section: "descriptive", scaleMin: 0, scaleMax: 15 }];
    expect(() => validarDefinicion(d)).toThrow(/se sale del rango/);
  });

  it("rechaza una sección que no es descriptiva ni afectiva", () => {
    const d = base();
    d.attributes = [{ name: "Aroma", section: "otra" as never, scaleMin: 0, scaleMax: 10 }];
    expect(() => validarDefinicion(d)).toThrow(/section/);
  });

  /**
   * **El control positivo.** Sin esto, un validador que rechazara absolutamente
   * todo pasaría las ocho pruebas de arriba: son todas negativas.
   */
  it("el archivo real de café pasa, y es el que se va a aplicar", () => {
    const crudo = JSON.parse(readFileSync(`${RAIZ}protocolos/cafe-cva-adaptado.json`, "utf8"));
    const d = validarDefinicion(crudo);
    expect(d.domain).toBe("coffee");
    expect(d.attributes).toHaveLength(7);
    expect(d.attributes.filter((a) => a.section === "affective")).toHaveLength(1);
    // La licencia está en trámite (Daniel, 2026-09-06). Si algún día pasa a
    // `licensed`, esta línea es el sitio donde alguien lo verá.
    expect(d.standardLicenseStatus).toBe("pending_license");
  });
  /**
   * **El segundo control positivo**, y el que importa desde el 2026-09-06: el
   * archivo del CVA afectivo, que es el que se va a aplicar en producción.
   * Las cuatro pruebas de `scoreFormula` de debajo son todas negativas.
   */
  it("el archivo del CVA afectivo pasa, y trae los ocho atributos en 1–9", () => {
    const crudo = JSON.parse(readFileSync(`${RAIZ}protocolos/cafe-cva-afectivo-v2.json`, "utf8"));
    const d = validarDefinicion(crudo);
    expect(d.scoreFormula).toBe("cva_affective_v1");
    expect(d.attributes.map((a) => a.name)).toEqual([...ATRIBUTOS_CVA_AFECTIVO]);
    expect(d.attributes.every((a) => a.section === "affective")).toBe(true);
    expect(d.attributes.every((a) => a.scaleMin === 1 && a.scaleMax === 9)).toBe(true);
    expect(d.scoreMin).toBe(0);
    expect(d.scoreMax).toBe(100);
    expect(d.standardLicenseStatus).toBe("pending_license");
  });

  /** Una definición del CVA afectivo bien formada, que cada prueba estropea. */
  function cva() {
    return {
      ...base(),
      scoreMin: 0,
      scoreMax: 100,
      scoreFormula: "cva_affective_v1",
      attributes: ATRIBUTOS_CVA_AFECTIVO.map((name) => ({
        name,
        section: "affective" as const,
        scaleMin: 1,
        scaleMax: 9,
      })),
    };
  }

  it("acepta la definición del CVA afectivo bien formada", () => {
    expect(() => validarDefinicion(cva())).not.toThrow();
  });

  it("rechaza una fórmula que nadie calcula", () => {
    const d = { ...cva(), scoreFormula: "cva_afectivo_v9" };
    expect(() => validarDefinicion(d)).toThrow(/scoreFormula/);
  });

  it("rechaza el CVA afectivo al que le falta un atributo", () => {
    const d = cva();
    d.attributes = d.attributes.slice(0, 7);
    expect(() => validarDefinicion(d)).toThrow(/exactamente, y en este orden/);
  });

  it("rechaza el CVA afectivo con los atributos en otro orden", () => {
    const d = cva();
    [d.attributes[0], d.attributes[1]] = [d.attributes[1]!, d.attributes[0]!];
    expect(() => validarDefinicion(d)).toThrow(/exactamente, y en este orden/);
  });

  it("rechaza el CVA afectivo en escala 0–10", () => {
    const d = cva();
    d.attributes = d.attributes.map((a) => ({ ...a, scaleMin: 0, scaleMax: 10 }));
    expect(() => validarDefinicion(d)).toThrow(/puntúa de 1 a 9/);
  });

  it("rechaza el CVA afectivo con un atributo marcado como descriptivo", () => {
    const d = cva();
    d.attributes = d.attributes.map((a, i) =>
      i === 0 ? { ...a, section: "descriptive" as unknown as "affective" } : a,
    );
    expect(() => validarDefinicion(d)).toThrow(/marcado\(s\) como descriptivo/);
  });

  /**
   * Sin `scoreFormula` nada de lo anterior aplica: los protocolos que ya
   * existen no tienen que parecerse al CVA para seguir siendo válidos.
   */
  it("sin scoreFormula, un protocolo cualquiera sigue pasando", () => {
    expect(() => validarDefinicion(base())).not.toThrow();
  });
});
