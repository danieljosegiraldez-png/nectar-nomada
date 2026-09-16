/**
 * Nadie vuelve a comparar `"apiary_site"` a mano.
 *
 * **El incidente que lo motiva es del mismo dia que el guardia.** Al anadir `meliponary` como
 * tipo de lugar (ADR-144) habia **diez** afirmaciones sueltas de `"apiary_site"` repartidas por
 * `lib/` y `app/`: la lista de apiarios, la ficha, el traslado, la consulta a vecinos por dos
 * sitios, la jornada de campo y la ruta de la pantalla. Repasar diez cadenas a mano es como se
 * deja una fuera, y **la que se queda fuera no falla en rojo**: rechaza un meliponario con un
 * mensaje de «no es apiario», que se lee como una regla y no como un olvido.
 *
 * Asi que la pregunta «¿aqui viven colmenas?» vive en un sitio, `esSitioDeAbejas`, y esto
 * vigila que siga siendo el unico.
 *
 * **Lo que NO prohibe:** nombrar la cadena. `TIPOS_DE_SITIO_DE_ABEJAS` la contiene por
 * definicion, `crearApiario` la usa como valor por omision, y el modulo de biochar tiene su
 * propia lista de tipos productivos que no es asunto del apiario. Lo que se prohibe es
 * **comparar** con ella.
 *
 * Hermetico: lee archivos, no toca la base.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../..", import.meta.url).pathname;
const AMBITO = ["lib", "app"];
/** El unico archivo donde la comparacion es legitima: el que define el predicado. */
const DUENO = "lib/apiary/sitioDeAbejas.ts";

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

/** Una COMPARACION con la cadena, no una mencion. */
export function comparaConLaCadena(fuente: string): string[] {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const patron = /[!=]==\s*"(apiary_site|meliponary)"|"(apiary_site|meliponary)"\s*[!=]==/g;
  return [...sinComentarios.matchAll(patron)].map((m) => m[0]);
}

describe("la familia de sitios de abejas vive en un solo predicado", () => {
  const archivos = AMBITO.flatMap((d) => fuentes(join(RAIZ, d))).map((r) => relative(RAIZ, r));

  it("el detector encuentra archivos que hablan de tipos de lugar — control positivo", () => {
    // Sin esto, «nadie compara» significaria «no mire».
    expect(archivos.length).toBeGreaterThan(100);
    const conMencion = archivos.filter((r) => readFileSync(join(RAIZ, r), "utf8").includes("apiary_site"));
    expect(conMencion.length).toBeGreaterThanOrEqual(2);
    expect(conMencion).toContain(DUENO);
  });

  it("nadie compara la cadena a mano, fuera del archivo que define el predicado", () => {
    const culpables: string[] = [];
    for (const ruta of archivos) {
      if (ruta === DUENO) continue;
      const encontrados = comparaConLaCadena(readFileSync(join(RAIZ, ruta), "utf8"));
      for (const e of encontrados) culpables.push(`${ruta}: ${e}`);
    }
    expect(culpables).toEqual([]);
  });

  it("CONTROL DEL DETECTOR: caza la comparacion y deja pasar la mencion", () => {
    expect(comparaConLaCadena('if (t !== "apiary_site") return;')).toHaveLength(1);
    expect(comparaConLaCadena('if (t === "meliponary") return;')).toHaveLength(1);
    expect(comparaConLaCadena('const TIPOS = ["apiary_site", "meliponary"];')).toEqual([]);
    expect(comparaConLaCadena('locationType: "apiary_site",')).toEqual([]);
    // Un comentario que HABLA de la comparacion no es una comparacion: es la trampa que ya me
    // costo tres mediciones esta semana.
    expect(comparaConLaCadena('// antes decia t === "apiary_site"')).toEqual([]);
  });
});
