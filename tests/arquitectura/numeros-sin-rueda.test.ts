/**
 * La rueda del ratón no puede cambiar un campo numérico.
 *
 * **El defecto (2026-09-18).** En Chrome, girar la rueda sobre un
 * `<input type="number">` con foco cambia su valor. Medido en el recorrido de
 * trampas de broca: desde vacío, un paso abajo con `min=0` deja **0**. En un
 * formulario de campo eso convierte «no se contó» en «cero», y ADR-080 dice que
 * un dato ausente nunca se guarda como 0. Había 115 campos así en 45 archivos
 * —17 de ellos en páginas de servidor, fuera de `app/components`— y cuatro más
 * cuyo `type` se decide en tiempo de ejecución.
 *
 * Dos formas válidas de estar protegido:
 *   · `<CampoNumerico>`, que suelta el foco al primer giro — sirve también
 *     desde una página de servidor;
 *   · un `<input>` con `onWheel` que suelta el foco (`soltarFocoConLaRueda` o
 *     un `.blur()` escrito ahí), para los que no siempre son numéricos.
 *
 * Un `<input>` cuyo `type` no es un literal cuenta como numérico: no se puede
 * saber leyendo el archivo si en algún caso lo será.
 *
 * Como sus vecinos, mira **formas escritas**: reconoce un `onWheel` que suelta
 * el foco, no comprueba que se ejecute. Es un suelo, no un techo.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { soltarFocoConLaRueda } from "../../app/components/CampoNumerico";
import { sinComentarios } from "../helpers/sinComentarios";

const RAIZ = new URL("../..", import.meta.url).pathname;
const PIEZA = "app/components/CampoNumerico.tsx";

function archivosTsx(): string[] {
  return execFileSync("find", ["app", "-name", "*.tsx"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .sort();
}

/** Cada `<input …>` del archivo, entero: los `>` dentro de `{…}` no la cierran. */
function etiquetasInput(src: string): string[] {
  const etiquetas: string[] = [];
  for (let k = src.indexOf("<input"); k >= 0; k = src.indexOf("<input", k + 1)) {
    if (/[A-Za-z]/.test(src[k + 6] ?? "")) continue; // <inputMode…> no es un input
    let llaves = 0;
    let comilla: string | null = null;
    for (let j = k; j < src.length; j++) {
      const c = src[j];
      if (comilla) {
        if (c === comilla) comilla = null;
      } else if (llaves === 0 && (c === '"' || c === "'")) comilla = c;
      else if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === ">" && llaves === 0) {
        etiquetas.push(src.slice(k, j + 1));
        break;
      }
    }
  }
  return etiquetas;
}

/**
 * Fuera los comentarios antes de buscar etiquetas.
 *
 * **Medido el 2026-10-02: este guardia marcaba PROSA.** El docstring de
 * `app/components/traceability/RejillaForm.tsx` explica por qué sus campos son
 * `<CampoNumerico>` y para eso nombra el problema —«girar la rueda sobre un
 * `<input type="number">` con foco cambia su valor»—, y esa frase, dentro de un
 * comentario, salía como incumplimiento. El archivo usaba `<CampoNumerico>` en
 * sus cuatro números.
 *
 * Un guardia que marca código correcto es peor que no tener guardia: enseña a
 * ignorarlo, o —peor— a contorsionar la documentación para que el escáner calle.
 * La misma corrección se le hizo el día anterior a
 * `codigos-de-rejilla-tienen-frase`, que contaba un código escrito en un
 * comentario.
 */
function sinProteccion(etiqueta: string): boolean {
  const numerico = /\stype=(["']number["']|\{)/.test(etiqueta);
  const protegido = /\sonWheel=\{[^}]*(soltarFocoConLaRueda|\.blur\(\))/.test(etiqueta);
  return numerico && !protegido;
}

describe("la rueda no cambia un campo numérico", () => {
  it("ningún <input> numérico queda sin soltar el foco al girar la rueda", () => {
    const culpables: string[] = [];
    for (const f of archivosTsx()) {
      if (f === PIEZA) continue; // es la propia pieza
      for (const tag of etiquetasInput(sinComentarios(readFileSync(`${RAIZ}${f}`, "utf8")))) {
        if (sinProteccion(tag)) culpables.push(`${f}: ${tag.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    expect(
      culpables,
      "usa <CampoNumerico> (sirve en páginas de servidor) u onWheel={soltarFocoConLaRueda}",
    ).toEqual([]);
  });

  it("la pieza suelta el foco en un numérico, y sólo en un numérico", () => {
    const numero = { currentTarget: { type: "number", blur: vi.fn() } };
    const texto = { currentTarget: { type: "text", blur: vi.fn() } };
    soltarFocoConLaRueda(numero as never);
    soltarFocoConLaRueda(texto as never);
    expect(numero.currentTarget.blur).toHaveBeenCalledTimes(1);
    expect(texto.currentTarget.blur).not.toHaveBeenCalled();

    const pieza = readFileSync(`${RAIZ}${PIEZA}`, "utf8");
    expect(pieza, "la pieza debe ser un campo numérico").toContain('type="number"');
    expect(pieza, "y debe soltar el foco con la rueda").toMatch(/onWheel=\{[\s\S]*soltarFocoConLaRueda\(e\)/);
  });

  /**
   * Control positivo. Sin esto, un `find` roto o un lector de etiquetas que no
   * casa nada darían cero culpables de cero campos, que se lee igual que
   * «todo bien».
   */
  it("está mirando de verdad: encuentra los campos y reconoce uno suelto", () => {
    const todos = archivosTsx();
    expect(todos.length, "el descubrimiento de archivos está roto").toBeGreaterThan(50);

    const fuentes = todos.map((f) => readFileSync(`${RAIZ}${f}`, "utf8"));
    const usos = fuentes.reduce((n, s) => n + (s.match(/<CampoNumerico\b/g) ?? []).length, 0);
    expect(usos, "no encuentra los <CampoNumerico>: la búsqueda no mide").toBeGreaterThan(100);

    const dinamicos = fuentes.flatMap(etiquetasInput).filter((t) => /\stype=\{/.test(t));
    expect(dinamicos.length, "no ve los <input> con type dinámico").toBeGreaterThanOrEqual(4);

    // Las formas que el guardia debe rechazar y aceptar, incluidas varias líneas
    // y un `>` dentro de una expresión.
    const [suelto = ""] = etiquetasInput('<input\n  type="number"\n  onChange={(e) => a > b}\n  name="n"\n/>');
    expect(suelto).toContain('name="n"');
    expect(sinProteccion(suelto)).toBe(true);
    expect(sinProteccion('<input type={t} name="n" />')).toBe(true);
    expect(sinProteccion('<input type="number" onWheel={(e) => e.currentTarget.blur()} />')).toBe(false);
    expect(sinProteccion('<input type="text" name="n" />')).toBe(false);
  });
});
