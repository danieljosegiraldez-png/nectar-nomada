import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * El desfase horario tiene que sobrevivir a un re-render del formulario.
 *
 * ## El defecto, medido el 2026-09-29 en la pantalla del lote
 *
 * `TimezoneOffsetField` escribe el desfase **en el `.value` del nodo**, no en el estado de React
 * — y con razón: el componente también se renderiza en el servidor, donde `getTimezoneOffset()`
 * devuelve el desfase del SERVIDOR, que es el valor equivocado y el origen de todo el trabajo de
 * husos horarios de agosto.
 *
 * Pero escribir en el DOM es escribir **por detrás de React**. Cuando el formulario se vuelve a
 * renderizar —cambiar la variable de una medición, el instrumento, el material—, React reaplica el
 * `defaultValue=""` del campo y se lleva el valor. Con el efecto atado a `[]` no volvía a
 * escribirse **nunca**, así que el campo quedaba vacío para siempre y guardar moría con
 * `timezone_offset_missing`.
 *
 * Lo medido, en la ficha de un lote en secado:
 *
 * | momento | `tzOffsetMinutes` |
 * |---|---|
 * | al cargar la página | `300` |
 * | tras cambiar la variable a humedad | **`(VACÍO)`** |
 * | los otros cuatro formularios de la misma página, que no re-renderizan | `300` |
 *
 * **Esa tercera fila es lo que lo delató.** Con un solo formulario a la vista, un campo vacío se
 * lee como «esto no se rellena nunca» o como un fallo del navegador. Cuatro formularios hermanos
 * con el valor puesto dicen que el mecanismo funciona y que lo que falla es el re-render.
 *
 * ## Qué vigila esto, y qué no
 *
 * Vigila que el efecto **no tenga array de dependencias**, que es lo único que garantiza que se
 * reaplique tras cada render. No puede comprobar el comportamiento: no hay herramientas de prueba
 * de componentes en el repositorio (`@testing-library`, `jsdom` y `happy-dom` están todos
 * ausentes, comprobado el mismo día). Si algún día las hay, esto se sustituye por una prueba que
 * renderice, cambie estado y afirme sobre el valor — que sería estrictamente mejor.
 *
 * Hermético: sólo lee un archivo.
 */
const RUTA = new URL("../../app/components/TimezoneOffsetField.tsx", import.meta.url).pathname;

/**
 * El efecto entero, con su cierre y —si lo tiene— su array de dependencias.
 *
 * **La primera versión de esto recortaba por índices y no distinguía nada**: su control positivo
 * cayó a la primera, que es justo para lo que estaba. Un patrón sobre la forma completa
 * `useEffect(() => { … } , [ … ])` sí separa las dos versiones.
 */
function dependenciasDelEfecto(fuente: string): { hayEfecto: boolean; tieneArray: boolean } {
  const m = /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*(,\s*\[[^\]]*\])?\s*\)/.exec(fuente);
  return { hayEfecto: m !== null, tieneArray: m?.[1] !== undefined };
}

describe("el desfase horario sobrevive a un re-render", () => {
  const fuente = readFileSync(RUTA, "utf8");

  /**
   * Control positivo del análisis: si el archivo dejara de tener un `useEffect` —porque alguien lo
   * reescribió con otra técnica—, el detector de abajo encontraría la cadena vacía y **pasaría en
   * verde midiendo la nada**. Esto lo convierte en rojo y obliga a revisar el guardia.
   */
  it("el archivo sigue teniendo un efecto que mirar", () => {
    expect(fuente, "ya no hay useEffect: este guardia dejó de medir lo que cree").toContain("useEffect(");
    expect(dependenciasDelEfecto(fuente).hayEfecto, "el patrón no reconoce el efecto del archivo").toBe(true);
  });

  it("el efecto NO lleva array de dependencias, para que se reaplique tras cada render", () => {
    expect(
      dependenciasDelEfecto(fuente).tieneArray,
      "el efecto vuelve a tener array de dependencias: se escribirá una sola vez y el primer " +
        "re-render del formulario dejará el campo vacío, que es el defecto del 2026-09-29 — " +
        "guardar morirá con `timezone_offset_missing`",
    ).toBe(false);
  });

  /**
   * El detector tiene que distinguir de verdad, no sólo no encontrar nada: se le da el efecto
   * malo —el que tenía el archivo antes— y tiene que señalarlo.
   */
  it("y el detector distingue la versión con `[]` de la buena", () => {
    const malo = "useEffect(() => {\n    if (ref.current) ref.current.value = String(1);\n  }, []);";
    const bueno = "useEffect(() => {\n    if (ref.current) ref.current.value = String(1);\n  });";
    expect(dependenciasDelEfecto(malo), "no señala la mala").toEqual({ hayEfecto: true, tieneArray: true });
    expect(dependenciasDelEfecto(bueno), "acusa a la buena").toEqual({ hayEfecto: true, tieneArray: false });
  });
});

/**
 * **Y la misma regla para TODO formulario que precargue una fecha en un efecto.**
 *
 * Lo de arriba vigila un archivo. El 2026-09-30 eso dejó pasar el caso de
 * `app/beneficio/bandejas/Formularios.tsx`: un efecto con `[]` que rellenaba el campo `cuando`,
 * cuyo propio comentario decía «Igual que MeasurementForm» — el formulario del que el PR #564 había
 * quitado ese `[]` esa misma tarde—. El mecanismo es idéntico: React vacía el valor del DOM al
 * re-renderizar, el efecto no se reaplica, y el campo obligatorio **bloquea el envío siguiente sin
 * ningún error**.
 *
 * **Los archivos se DESCUBREN, no se enumeran.** Una lista escrita a mano deja fuera el formulario
 * que alguien añada mañana, y el guardia seguiría verde — que es exactamente cómo sobrevivió éste.
 */
describe("ningún formulario precarga una fecha en un efecto que no se reaplica", () => {
  const RAIZ = new URL("../../app", import.meta.url).pathname;

  /** Todo `.tsx` bajo `app/` que precargue «ahora» en un campo de fecha. */
  function formulariosQuePrecargan(): string[] {
    const salida = execFileSync("grep", ["-rl", "--include=*.tsx", "paraCampoLocal(new Date())", RAIZ], {
      encoding: "utf8",
    });
    return salida.split("\n").filter((l) => l.trim() !== "");
  }

  it("el escáner encuentra formularios — sin esto, un cero se leería como «ninguno incumple»", () => {
    // Control positivo del INSTRUMENTO. Si `paraCampoLocal` se renombrara, la lista saldría vacía y
    // la aserción de abajo pasaría sin haber mirado un solo archivo.
    expect(formulariosQuePrecargan().length).toBeGreaterThanOrEqual(3);
  });

  it("y ninguno de ellos tiene un efecto con array de dependencias vacío", () => {
    const culpables = formulariosQuePrecargan()
      .filter((f) => /\}\s*,\s*\[\]\s*\)\s*;/.test(readFileSync(f, "utf8")))
      .map((f) => f.replace(RAIZ, "app"));
    // El mensaje nombra los archivos: sin él el resumen dice «expected [ Array(1) ] to equal []»,
    // que obliga a abrir la salida completa para saber de qué formulario habla.
    expect(
      culpables,
      `estos formularios precargan una fecha en un efecto con \`[]\`, así que el valor se pierde al ` +
        `re-renderizar y el campo obligatorio bloquea el envío sin error: ${culpables.join(", ")}`,
    ).toEqual([]);
  });

  it("el detector reconoce un efecto con `[]` cuando lo hay", () => {
    // Control positivo del DETECTOR, aparte del escáner: son dos cosas distintas y cada una puede
    // romperse sola.
    const conDeps = "useEffect(() => {\n  ref.current.value = x;\n}, []);";
    expect(/\}\s*,\s*\[\]\s*\)\s*;/.test(conDeps)).toBe(true);
    expect(/\}\s*,\s*\[\]\s*\)\s*;/.test("useEffect(() => {\n  ref.current.value = x;\n});")).toBe(false);
  });
});
