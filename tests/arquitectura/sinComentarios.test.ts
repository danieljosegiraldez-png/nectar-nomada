import { describe, expect, it } from "vitest";
import { sinComentarios } from "../helpers/sinComentarios";

/**
 * El quitado de comentarios en el que se apoyan dos guardias de fuente.
 *
 * **Tiene pruebas porque un recorrido escrito a mano es exactamente la clase de
 * pieza que se equivoca en silencio**, y porque las dos primeras versiones —una
 * expresión regular— se equivocaron de las dos maneras posibles: una marcaba
 * prosa como incumplimiento, y la siguiente dejaba de ver un incumplimiento real.
 * La segunda es peor: sigue en verde y nadie vuelve a mirar.
 *
 * Los dos casos de abajo son los que costaron eso, con su fecha.
 */
describe("sinComentarios", () => {
  /** El caso que motivó quitar comentarios: la prosa que explica la regla. */
  it("quita un comentario de línea que nombra el patrón vigilado", () => {
    const fuente = ['// gira la rueda sobre un <input type="number"> y cambia', "const a = 1;"].join("\n");
    expect(sinComentarios(fuente)).not.toContain('type="number"');
    expect(sinComentarios(fuente)).toContain("const a = 1;");
  });

  it("quita un comentario de bloque, aunque ocupe varias líneas", () => {
    const fuente = `/**\n * <input type="number">\n */\nconst a = 1;`;
    expect(sinComentarios(fuente)).not.toContain('type="number"');
    expect(sinComentarios(fuente)).toContain("const a = 1;");
  });

  /**
   * **El caso que la expresión regular rompía, y es el que importa.** Un `//`
   * dentro de una cadena NO abre un comentario. Lo encontró una revisión
   * independiente el 2026-10-02: la expresión que borraba de dos barras hasta el
   * fin de línea dejaba
   * `<input placeholder="https:` y el guardia perdía de vista el `type="number"`
   * de un campo sin proteger.
   */
  it("NO corta en un // que vive dentro de una cadena", () => {
    const fuente = '<input placeholder="https://ejemplo" type="number" />';
    const salida = sinComentarios(fuente);
    expect(salida, "el campo sin proteger tiene que seguir visible").toContain('type="number"');
    expect(salida).toBe(fuente);
  });

  it("tampoco con comilla simple ni acento grave", () => {
    for (const fuente of [
      "const u = 'https://ejemplo'; const n = 'type=\"number\"';",
      "const u = `https://ejemplo`; const n = `type=\"number\"`;",
    ]) {
      expect(sinComentarios(fuente)).toBe(fuente);
    }
  });

  /** Un `/*` dentro de una cadena tampoco abre un bloque: se comería el resto. */
  it("NO abre un bloque en un /* que vive dentro de una cadena", () => {
    const fuente = 'const g = "/*"; const n = \'type="number"\';';
    expect(sinComentarios(fuente)).toContain('type="number"');
  });

  /** Y una comilla escapada no cierra la cadena antes de tiempo. */
  it("una comilla escapada no cierra la cadena", () => {
    const fuente = 'const s = "dice \\"hola\\" // no es comentario"; const a = 1;';
    expect(sinComentarios(fuente)).toContain("// no es comentario");
    expect(sinComentarios(fuente)).toContain("const a = 1;");
  });

  /**
   * El control de que esto no es una función identidad: si lo fuera, todas las
   * pruebas de arriba que exigen «sigue estando» pasarían igual y las dos que
   * exigen «ya no está» serían las únicas que miden.
   */
  it("el control: sobre una fuente con comentario Y cadena, quita uno y conserva la otra", () => {
    const fuente = 'const u = "https://x"; // <input type="number">\nconst a = 1;';
    const salida = sinComentarios(fuente);
    expect(salida).toContain('"https://x"');
    expect(salida).not.toContain('type="number"');
    expect(salida).not.toBe(fuente);
  });
});
