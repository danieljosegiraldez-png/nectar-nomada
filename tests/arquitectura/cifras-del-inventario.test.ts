import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Las cifras del documento contra las del script.
 *
 * Todo el trabajo del 2026-08-31 empezó por una discrepancia de **uno**: el
 * documento decía 195 operaciones y el script decía 194. Perseguirla destapó
 * cuatro defectos del detector, uno de ellos una identidad falsa que cuadraba
 * en los recuentos.
 *
 * Las cifras se arreglaron ese día; el mecanismo que las dejó divergir, no.
 * Siguen escritas a mano en prosa, y nada impide que vuelvan a separarse — con
 * la diferencia de que la próxima vez nadie tiene por qué mirarlas.
 *
 * Esto no pide escribir bien un número: pide que el documento y la medición
 * digan lo mismo, y cuando no, dice exactamente cuál cambiar.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;
const DOC = "docs/arquitectura/inventario-de-acceso.md";

/**
 * La etiqueta del documento no es la clase que emite el script: el documento
 * dice «depende del llamador» donde el script dice «depende del llamador
 * (verificar a mano)». La correspondencia se declara aquí, explícita, para que
 * renombrar una clase falle en vez de dejar de comprobarse en silencio.
 */
const ETIQUETAS: Record<string, string> = {
  "guardia directo": "guardia directo",
  "acotado por construcción": "acotado por construcción",
  "depende del llamador": "depende del llamador (verificar a mano)",
  "público por diseño": "público por diseño",
  "previo a la sesión": "previo a la sesión",
  "recibía principal sin guardia visible": "recibe principal, sin guardia visible",
};

const ops = JSON.parse(
  execFileSync("node", ["scripts/inventario-de-acceso.mjs", "--json"], {
    cwd: RAIZ,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
) as { archivo: string; clase: string }[];

const doc = readFileSync(`${RAIZ}${DOC}`, "utf8");
const porClase = new Map<string, number>();
for (const o of ops) porClase.set(o.clase, (porClase.get(o.clase) ?? 0) + 1);

describe("el documento del inventario dice lo que mide el script", () => {
  it("el total y el número de archivos", () => {
    const m = /\*\*(\d+) operaciones\*\* que tocan la base, en \*\*(\d+) archivos\*\*/.exec(doc);
    expect(m, `${DOC} ya no dice «**N operaciones** … en **N archivos**»`).not.toBeNull();
    expect(Number(m![1]), `${DOC}: el total escrito no es el medido`).toBe(ops.length);
    expect(Number(m![2]), `${DOC}: el número de archivos escrito no es el medido`).toBe(
      new Set(ops.map((o) => o.archivo)).size
    );
  });

  it("cada fila de la tabla de patrones", () => {
    const filas = [...doc.matchAll(/^\| \*\*(\d+)\*\* \| ([^|]+?) \|/gm)].map((m) => ({
      escrito: Number(m[1] ?? "0"),
      etiqueta: (m[2] ?? "").trim(),
    }));
    expect(filas.length, `${DOC}: no se encontró la tabla de patrones`).toBeGreaterThan(0);
    for (const fila of filas) {
      const clase = ETIQUETAS[fila.etiqueta];
      expect(clase, `${DOC}: etiqueta «${fila.etiqueta}» sin correspondencia declarada en el test`)
        .toBeTruthy();
      expect(porClase.get(clase ?? "") ?? 0, `${DOC}: la fila «${fila.etiqueta}» dice ${fila.escrito}`)
        .toBe(fila.escrito);
    }
  });

  /**
   * Sin esto, añadir una clase al clasificador la dejaría fuera del documento
   * sin que nada lo dijera: las filas que existen cuadrarían, y la nueva
   * sencillamente no estaría. Es la misma forma de fallo que el detector de
   * podredumbre del allowlist.
   */
  it("no hay clases medidas que el documento no nombre", () => {
    const documentadas = new Set(Object.values(ETIQUETAS));
    const ausentes = [...porClase.keys()].filter((c) => !documentadas.has(c));
    expect(ausentes, `clases que el script emite y ${DOC} no explica`).toEqual([]);
  });
});
