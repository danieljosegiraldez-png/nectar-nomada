/**
 * Las copias de las fuentes siguen siendo las fuentes.
 *
 * **El problema es una palabra: «verbatim».** Cada `FUENTE_*` y cada paquete de
 * `docs/architecture/fuentes/` dice en su cabecera que es una copia literal de lo que entregó
 * Daniel. Hasta el 2026-09-17 **nada lo comprobaba**: la palabra era una promesa. Un reformateo
 * del editor, un «arreglo» de una errata o un fin de línea cambiado convierten la fuente en una
 * paráfrasis sin que nada avise — y la fuente existe precisamente para no ser paráfrasis.
 *
 * Lo que esto comprueba, por tipo de copia:
 *
 * - **Paquetes con manifiesto.** `smart-hive-v1/` trae **su propio** `MANIFEST.sha256`, hecho por
 *   quien lo produjo: es mejor juez que cualquiera que escriba yo. `paquete-q1-q49/` no traía
 *   ninguno y se le generó sobre la copia, después de comprobarla idéntica al original.
 * - **Documentos con cabecera.** El cuerpo tras la cabecera HTML tiene que hashear al `sha256`
 *   que la propia cabecera declara.
 *
 * **Una exclusión, declarada.** El manifiesto de smart-hive lista `.DS_Store`, que es basura de
 * macOS que Finder reescribe cada vez que se abre la carpeta: **fallaba ya en el original**, y no
 * se copió. Se excluye por nombre, no con un filtro que pudiera tragarse otra cosa.
 *
 * Hermético: lee archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = process.cwd();
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Las entradas de un manifiesto en formato `shasum -a 256`: «<sha>  <ruta>». */
export function leerManifiesto(texto: string): { sha: string; ruta: string }[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "")
    .map((l) => {
      const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(l);
      if (!m || m[1] === undefined || m[2] === undefined) throw new Error(`línea de manifiesto ilegible: ${l}`);
      return { sha: m[1], ruta: m[2] };
    });
}

/**
 * Qué entradas de un manifiesto no casan con los archivos que tiene al lado. Exportada para que el
 * control positivo la llame con un archivo alterado: un verificador que sólo se prueba contra
 * copias buenas no se ha probado.
 */
export function discrepancias(
  carpeta: string,
  entradas: { sha: string; ruta: string }[],
  excluir: readonly string[] = [],
): string[] {
  const malas: string[] = [];
  for (const e of entradas) {
    if (excluir.includes(e.ruta)) continue;
    const p = join(carpeta, e.ruta);
    if (!existsSync(p)) {
      malas.push(`${e.ruta}: FALTA`);
      continue;
    }
    if (sha(readFileSync(p)) !== e.sha) malas.push(`${e.ruta}: el contenido ya no es el original`);
  }
  return malas;
}

/** El cuerpo de un documento con cabecera HTML, tal cual se escribió tras ella. */
export function cuerpoTrasCabecera(b: Buffer): Buffer {
  const i = b.indexOf("-->\n\n");
  if (i < 0) throw new Error("no hay cabecera `<!-- ... -->` seguida de línea en blanco");
  return b.subarray(i + "-->\n\n".length);
}

const PAQUETES = [
  { carpeta: "docs/architecture/fuentes/smart-hive-v1", manifiesto: "MANIFEST.sha256", excluir: [".DS_Store"], minimo: 60 },
  { carpeta: "docs/architecture/fuentes/paquete-q1-q49", manifiesto: "MANIFIESTO.sha256", excluir: [], minimo: 14 },
] as const;

/** Documentos con cabecera que declaran el sha de su original. */
const CON_CABECERA = [
  { archivo: "docs/dominio/meliponini-especies.md", sha: "c11bca86f2d4938d" },
] as const;

describe("las copias de las fuentes siguen siendo las fuentes", () => {
  it.each(PAQUETES)("$carpeta verifica contra su manifiesto", ({ carpeta, manifiesto, excluir, minimo }) => {
    const dir = join(RAIZ, carpeta);
    const entradas = leerManifiesto(readFileSync(join(dir, manifiesto), "utf8"));
    // Fila patrón: un manifiesto vacío o mal leído daría CERO discrepancias sobre CERO archivos,
    // que es exactamente un verde sin haber mirado nada.
    expect(entradas.length, `${carpeta}: entradas leídas`).toBeGreaterThanOrEqual(minimo);
    expect(discrepancias(dir, entradas, excluir)).toEqual([]);
  });

  it.each(CON_CABECERA)("$archivo: el cuerpo hashea al sha que declara", ({ archivo, sha: prefijo }) => {
    const b = readFileSync(join(RAIZ, archivo));
    const cabecera = b.subarray(0, 2000).toString("utf8");
    const declarado = /sha256\s*:\s*([0-9a-f]{64})/.exec(cabecera)?.[1];
    expect(declarado, `${archivo}: la cabecera no declara un sha256`).toBeDefined();
    expect(declarado?.startsWith(prefijo), "la cabecera declara OTRO sha que el registrado aquí").toBe(true);
    expect(sha(cuerpoTrasCabecera(b))).toBe(declarado);
  });
});

describe("el verificador VERIFICA — con copias alteradas a propósito", () => {
  const dir = join(RAIZ, "docs/architecture/fuentes/paquete-q1-q49");
  const entradas = leerManifiesto(readFileSync(join(dir, "MANIFIESTO.sha256"), "utf8"));

  it("caza un archivo cuyo contenido cambió", () => {
    const primera = entradas[0];
    expect(primera).toBeDefined();
    const alterada = [{ ...primera!, sha: "0".repeat(64) }];
    expect(discrepancias(dir, alterada)).toEqual([`${primera!.ruta}: el contenido ya no es el original`]);
  });

  it("caza un archivo que desapareció", () => {
    expect(discrepancias(dir, [{ sha: "0".repeat(64), ruta: "no-existe.md" }])).toEqual(["no-existe.md: FALTA"]);
  });

  it("y la exclusión es POR NOMBRE: no se traga otra cosa", () => {
    const alterada = [{ sha: "0".repeat(64), ruta: "no-existe.md" }];
    expect(discrepancias(dir, alterada, [".DS_Store"])).toEqual(["no-existe.md: FALTA"]);
    expect(discrepancias(dir, [{ sha: "0".repeat(64), ruta: ".DS_Store" }], [".DS_Store"])).toEqual([]);
  });

  it("caza un documento con cabecera cuyo cuerpo se tocó", () => {
    const b = readFileSync(join(RAIZ, "docs/dominio/meliponini-especies.md"));
    const tocado = Buffer.concat([b, Buffer.from(" ")]);
    expect(sha(cuerpoTrasCabecera(tocado))).not.toBe(sha(cuerpoTrasCabecera(b)));
  });
});
