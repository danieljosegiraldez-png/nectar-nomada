import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **Una microparcela no hereda un atributo EXTENSIVO de su parcela madre.**
 *
 * `createMicrolot` copia atributos del padre al crear (D2 del diseño de la rejilla). Hasta el
 * 2026-10-02 copiaba nueve, y el noveno era `areaHectares`. Los ocho primeros son **intensivos**:
 * describen el sitio y valen igual en una parte que en el todo — la altitud de media hectárea es la de
 * la hectárea, y la separación entre plantas no cambia porque se mire un trozo. El área es
 * **extensiva**: una microparcela es una PARTE, así que copiar la superficie entera no guarda un valor
 * prestado, guarda uno que **no puede ser suyo** y que es siempre demasiado grande.
 *
 * **Y no se quedaba en la ficha.** Tres cosas dividen por esa columna: `computePlotDensity`
 * (plantas/ha), `computePlotYield` (kg/ha) y `pendienteDeLaParcela`, que **deja de pedir el área** en
 * cuanto la columna no es nula — el único aviso que llevaría a medir la de verdad. Medido ese día: una
 * microparcela de una décima de una parcela de 2 ha con 1.000 matas afirmaba «1.000 plantas en 2 ha» y
 * 500 plantas/ha cuando son 5.000. Y su formulario de alta tiene tres campos —nombre, motivo, nota—
 * así que no había forma de corregirlo desde la pantalla.
 *
 * **Qué prueba esto, y qué NO.** Lee la fuente, así que prueba la FORMA: que la lista de copia no
 * incluya el área, y que siga incluyendo los ocho. No prueba la conducta — eso lo hace
 * `tests/territorio/microparcelaConRango.test.ts`, que además afirma que el aviso `sin_area` vuelve a
 * saltar. Este guardia existe para el caso que esa prueba no cubre: que alguien añada **otro** atributo
 * extensivo a la lista. La lista de prohibidos es explícita y corta a propósito; si `Location` gana una
 * columna extensiva nueva, va aquí.
 */
const FUENTE = new URL("../../lib/traceability/locations.ts", import.meta.url).pathname;
const fuente = () => readFileSync(FUENTE, "utf8");

/**
 * El objeto `data` del `tx.location.create` de `createMicrolot`, cerrado CONTANDO LLAVES.
 *
 * **Acotarlo no es elegancia: la primera versión de este guardia buscaba en el archivo entero y marcó
 * como incumplidor código correcto.** `rowCount: parent.rowCount` aparece legítimamente unas líneas
 * antes, construyendo la rejilla del padre como los LÍMITES contra los que `validarRango` comprueba el
 * rango de la hija — eso no es copiar, es validar. Un guardia que marca lo correcto es peor que ninguno:
 * enseña a ignorar una línea roja.
 */
function datosDelCreate(src: string): string {
  const f = src.indexOf("export async function createMicrolot");
  expect(f, "ya no existe createMicrolot").toBeGreaterThan(-1);
  const c = src.indexOf("tx.location.create({", f);
  expect(c, "createMicrolot ya no crea la Location con tx.location.create").toBeGreaterThan(-1);
  const abre = src.indexOf("{", src.indexOf("data:", c));
  expect(abre, "el create ya no lleva un objeto data").toBeGreaterThan(-1);
  let nivel = 0;
  for (let k = abre; k < src.length; k += 1) {
    if (src[k] === "{") nivel += 1;
    else if (src[k] === "}") {
      nivel -= 1;
      if (nivel === 0) return src.slice(abre, k + 1);
    }
  }
  throw new Error("el objeto data no cierra");
}

/** Los que SÍ se copian: intensivos, valen igual en la parte y en el todo. */
const INTENSIVOS = [
  "altitudeMinM",
  "altitudeMaxM",
  "shadePercentage",
  "slopeDescription",
  "soilType",
  "sunExposure",
  "aspect",
  "plantSpacingMeters",
] as const;

/** Los que NO: extensivos, o la numeración de la rejilla (D3, que ya tenía su razón). */
const PROHIBIDOS = ["areaHectares", "rowCount", "plantsPerRow"] as const;

describe("createMicrolot no hereda lo extensivo", () => {
  it("sigue siendo la función que copia atributos del padre al crear", () => {
    const src = fuente();
    expect(src.length, "el archivo está vacío o no se leyó").toBeGreaterThan(2000);
    expect(src, "ya no existe createMicrolot").toMatch(/export async function createMicrolot/);
    expect(src, "ya no escribe el acto de copiar").toMatch(/location\.copy_attributes_from_parent/);
  });

  /**
   * **Control positivo del ANÁLISIS, no del código.** Si el patrón `<attr>: parent.<attr>` dejara de
   * casar —porque alguien cambia el idioma de la copia— la aserción de abajo saldría verde sobre un
   * archivo que copia el área igualmente, y «no lo hereda» se leería como «no miré».
   */
  it("el detector encuentra los ocho intensivos DENTRO del create", () => {
    const datos = datosDelCreate(fuente());
    for (const a of INTENSIVOS) {
      expect(datos, `el detector ya no ve la copia de ${a}: su patrón o su recorte dejaron de casar`).toContain(
        `${a}: parent.${a},`,
      );
    }
  });

  /** La aserción que caza la regresión, y sólo dentro del `data` del create. */
  it("y NO copia ninguno de los prohibidos", () => {
    const datos = datosDelCreate(fuente());
    for (const a of PROHIBIDOS) {
      expect(datos, `${a} se copia del padre, y no puede ser de la hija`).not.toContain(`${a}: parent.${a},`);
    }
    // Control del recorte: `rowCount: parent.rowCount` SÍ está en el archivo —validando el rango de la
    // hija contra la rejilla del padre— así que si el recorte midiera el archivo entero, esto fallaría.
    expect(fuente(), "la línea de validación desapareció: este control ya no discrimina").toContain(
      "rowCount: parent.rowCount",
    );
  });

  /**
   * Y el evento de auditoría registra lo COPIADO, así que tampoco puede nombrar el área: un nulo ahí
   * diría que se copió un nulo en vez de que no se copió nada.
   */
  it("el acto de copiar tampoco registra el área", () => {
    const src = fuente();
    const i = src.indexOf("location.copy_attributes_from_parent");
    expect(i, "no existe el evento de copia").toBeGreaterThan(-1);
    const bloque = src.slice(i, i + 900);
    expect(bloque, "el evento sigue nombrando un área que ya no se copia").not.toMatch(
      /areaHectares: microlot\.areaHectares/,
    );
    // Control del recorte: la ventana sí contiene los que de verdad se copian.
    expect(bloque, "la ventana no llega a los valores: el recorte no mide nada").toMatch(
      /plantSpacingMeters: microlot\.plantSpacingMeters/,
    );
  });
});
