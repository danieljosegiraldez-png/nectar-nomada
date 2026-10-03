import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sinComentarios } from "../helpers/sinComentarios";

/**
 * Cada código que lanza `RejillaInvalida` tiene su frase en los DOS idiomas, con
 * los mismos parámetros.
 *
 * **Por qué existe, y lo midió una revisión independiente del 2026-10-01.** La
 * rama de `friendlyError` construye la clave con una plantilla —
 * `t(\`error_${clave}\`)` — y de eso se siguen dos agujeros que ningún guardia
 * existente tapa:
 *
 * 1. `tests/arquitectura/claves-de-traduccion-existen.test.ts` **excluye las
 *    claves con plantilla por construcción** (lo dice su propia cabecera: son
 *    190, y «para ésas el guardia es el tipo de la unión»).
 * 2. Y el tipo de la unión tampoco sirve aquí, porque el `as
 *    "error_rejilla_a_medias"` del sitio de la llamada **colapsa la unión a un
 *    solo literal**: `tsc` revisa una de las claves, no las seis.
 *
 * Resultado medido: renombrar una clave en `es.json` dejaba todo en verde, y la
 * pantalla habría mostrado la clave cruda en vez de una frase.
 *
 * `acciones-traducen-sus-errores.test.ts` tampoco lo cubre: ése comprueba que la
 * CLASE tenga rama, no que la rama encuentre una frase.
 *
 * Hermético: sólo lee archivos.
 */

const RAIZ = join(__dirname, "..", "..");

/**
 * Todos los `.ts` de `lib/`, DESCUBIERTOS y no enumerados.
 *
 * **La versión anterior leía una sola ruta —`lib/traceability/locations.ts`— y por
 * eso quedó ciega al día siguiente.** Medido el 2026-10-01: la tarea 5 añadió
 * `rejilla_trampas_se_solapan` en `lib/traceability/plotBlocks.ts` SIN frase, y
 * este guardia pasó 4/4. Es la trampa que `CLAUDE.md` describe como «un guardia
 * puede vigilar UN ARCHIVO creyendo vigilar una clase»: una lista escrita a mano
 * deja fuera el archivo que alguien añada mañana, y sigue verde.
 */
function fuentesDeLib(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentesDeLib(ruta));
    else if (entrada.endsWith(".ts")) salida.push(ruta);
  }
  return salida;
}

/** Los códigos, sacados de la FUENTE y no copiados a mano, para que no deriven. */
function codigosDelServicio(): string[] {
  const fuente = fuentesDeLib(join(RAIZ, "lib"))
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
  // **Toda cadena literal que empiece por `rejilla_`, no sólo las que están dentro
  // de un `new RejillaInvalida(...)`.** La primera versión buscaba exactamente eso
  // y por tanto NO encontraba los cuatro códigos del mapa `CODIGO_DEL_RANGO`, que
  // se lanzan por índice. Habrían quedado sin frase con el guardia en verde — el
  // agujero que este archivo existe para tapar, dentro del propio archivo.
  // **Sin comentarios, y las tres formas de comilla.** Una revisión independiente
  // midió los dos errores del extractor anterior: contaba de MÁS —un
  // `// ejemplo: "rejilla_lo_que_sea"` en un comentario exigía traducción de algo
  // que nunca se lanza— y de MENOS —comilla simple, acento grave o un dígito en el
  // nombre se le escapaban, y el mínimo lo seguían satisfaciendo los demás, así que
  // un código nuevo sin frase pasaba con el guardia en verde.
  const limpia = sinComentarios(fuente);
  const literales = [...limpia.matchAll(/["'`](rejilla_[a-z0-9_]+)["'`]/g)].map((m) => m[1] ?? "");
  const conValor = [...limpia.matchAll(/`(rejilla_[a-z0-9_]+):\$\{/g)].map((m) => m[1] ?? "");
  return [...new Set([...literales, ...conValor])].sort();
}

const parametros = (frase: string) => [...frase.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? "").sort();

describe("los códigos de RejillaInvalida tienen frase en los dos idiomas", () => {
  /**
   * El control positivo del extractor, y va primero: si las expresiones dejan de
   * casar, la lista sale vacía y «todas tienen frase» se leería igual que «no
   * miré». Seis es lo que hay hoy; el número se sube a propósito al añadir uno.
   */
  it("el extractor encuentra los códigos — el control positivo", () => {
    const codigos = codigosDelServicio();
    // Diez hoy: seis de la rejilla y cuatro del rango. El número se sube a
    // propósito al añadir uno, que es lo que obliga a mirar si tiene frase.
    expect(codigos.length).toBeGreaterThanOrEqual(11);
    expect(codigos).toContain("rejilla_a_medias");
    expect(codigos).toContain("rejilla_con_planta_fuera");
    expect(codigos).toContain("rejilla_rango_no_es_celda");
    // De OTRO archivo, que es lo que demuestra que el descubrimiento sirve.
    expect(codigos).toContain("rejilla_trampas_se_solapan");
  });

  it("cada código tiene su frase en es y en en", () => {
    const es = JSON.parse(readFileSync(join(RAIZ, "messages", "es.json"), "utf8")).Traceability;
    const en = JSON.parse(readFileSync(join(RAIZ, "messages", "en.json"), "utf8")).Traceability;
    const faltan: string[] = [];
    for (const c of codigosDelServicio()) {
      if (typeof es[`error_${c}`] !== "string") faltan.push(`es.json: error_${c}`);
      if (typeof en[`error_${c}`] !== "string") faltan.push(`en.json: error_${c}`);
    }
    expect(faltan).toEqual([]);
  });

  /**
   * Los mismos parámetros en los dos idiomas. Una frase inglesa a la que le falte
   * el `{hilera}` no falla: imprime una frase que **no dice dónde**, que es peor
   * que un error porque parece correcta.
   */
  it("los parámetros casan entre los dos idiomas", () => {
    const es = JSON.parse(readFileSync(join(RAIZ, "messages", "es.json"), "utf8")).Traceability;
    const en = JSON.parse(readFileSync(join(RAIZ, "messages", "en.json"), "utf8")).Traceability;
    const desiguales: string[] = [];
    for (const c of codigosDelServicio()) {
      const k = `error_${c}`;
      if (typeof es[k] === "string" && typeof en[k] === "string") {
        const pes = parametros(es[k]);
        const pen = parametros(en[k]);
        if (JSON.stringify(pes) !== JSON.stringify(pen)) desiguales.push(`${k}: es=[${pes}] en=[${pen}]`);
      }
    }
    expect(desiguales).toEqual([]);
  });

  /**
   * Y el código que lleva valor tiene que tener DÓNDE ponerlo. `rejilla_a_medias`
   * no lleva ninguno a propósito, así que la exigencia es sólo para los que sí.
   */
  it("los códigos que llevan un valor tienen un parámetro donde ponerlo", () => {
    const fuente = fuentesDeLib(join(RAIZ, "lib"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
    const conValor = [...sinComentarios(fuente).matchAll(/`(rejilla_[a-z0-9_]+):\$\{/g)].map(
      (m) => m[1] ?? "",
    );
    expect(conValor.length).toBeGreaterThanOrEqual(3);
    const es = JSON.parse(readFileSync(join(RAIZ, "messages", "es.json"), "utf8")).Traceability;
    for (const c of conValor) {
      expect(parametros(es[`error_${c}`] ?? ""), `error_${c} no tiene parámetro`).not.toEqual([]);
    }
  });
});
