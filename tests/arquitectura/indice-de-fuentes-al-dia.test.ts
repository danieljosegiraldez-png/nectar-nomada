import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El índice de fuentes dice de cada archivo de `docs/dominio/` lo mismo que su cabecera.
 *
 * **Por qué existe.** `docs/architecture/FUENTES_INDICE.md` se escribió el 2026-09-17 y no volvió a
 * tocarse, mientras `docs/dominio/` recibía doce commits. El 2026-10-18 su tabla seguía llamando
 * «borrador» a cinco archivos cuya cabecera decía otra cosa desde el 19 y el 27 de septiembre, y
 * siete entradas de la carpeta no tenían fila. Nada lo veía: `material-de-dominio-declarado` mira
 * las cabeceras, y nadie miraba el índice contra ellas. ADR-200 lo puso entre los defectos que se
 * arreglan sin preguntar.
 *
 * **Lo que manda es la cabecera.** Esta prueba no decide ningún estado: comprueba que la tabla copie
 * el que declara cada archivo, y que cada entrada de la carpeta tenga su fila. Un archivo sin
 * cabecera tiene que decir «sin cabecera propia»; una carpeta, el estado que comparten sus `.md`.
 *
 * **Qué NO comprueba:** la tercera columna, la prosa de «lo que hay que saber». Esa la escribe
 * alguien leyendo el archivo, y ningún test puede saber si es fiel.
 *
 * Hermética: sólo lee archivos. Las funciones se prueban además con entradas escritas a mano, porque
 * el árbol de hoy no contiene los casos que tienen que fallar.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const CARPETA = join(RAIZ, "docs/dominio");
const INDICE = join(RAIZ, "docs/architecture/FUENTES_INDICE.md");
const SIN_CABECERA = "sin cabecera propia";

export interface EntradaDeDominio {
  nombre: string;
  esCarpeta: boolean;
  /** El estado de la cabecera, o `null` si no declara ninguno. */
  estado: string | null;
}
export interface FilaDelIndice {
  nombres: string[];
  estado: string | null;
}

/** Los estados admitidos salen de la tabla del README, con la misma expresión que `material-de-dominio-declarado`. */
function estadosDeLaTabla(): string[] {
  const readme = readFileSync(join(CARPETA, "README.md"), "utf8");
  return [...readme.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((m) => m[1]!);
}

/** El estado que declara una cabecera: exactamente uno de `estados` en sus primeros 2000 caracteres, o `null`. */
export function estadoDeCabecera(texto: string, estados: string[]): string | null {
  const cabecera = texto.slice(0, 2000);
  const declarados = estados.filter((e) => cabecera.includes(`estado    : ${e}`));
  return declarados.length === 1 ? declarados[0]! : null;
}

/**
 * Las filas de la tabla de «## Material de dominio». Los nombres salen SÓLO de la primera columna:
 * la tercera también lleva rutas entre comillas invertidas (`fuentes-verbatim.test.ts`,
 * `docs/beneficio/10`…) que no son entradas de la carpeta.
 */
export function filasDelIndice(indice: string): FilaDelIndice[] {
  const inicio = indice.indexOf("## Material de dominio");
  if (inicio < 0) return [];
  const resto = indice.slice(inicio + 1);
  const fin = resto.indexOf("\n## ");
  const seccion = fin < 0 ? resto : resto.slice(0, fin);
  return seccion
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-/.test(l))
    .map((l) => l.split("|").map((c) => c.trim()))
    .filter((c) => c[2] !== "estado")
    .map((c) => ({
      nombres: [...(c[1] ?? "").matchAll(/`([^`]+)`/g)].map((m) => m[1]!),
      estado: /\*\*([^*]+)\*\*/.exec(c[2] ?? "")?.[1] ?? null,
    }));
}

/** Lo que el índice dice mal: una frase por discrepancia, nombrando el archivo. Vacío = al día. */
export function discrepancias(entradas: EntradaDeDominio[], filas: FilaDelIndice[]): string[] {
  const salida: string[] = [];
  const clave = (e: EntradaDeDominio) => (e.esCarpeta ? `${e.nombre}/` : e.nombre);
  const conocidas = new Set(entradas.map(clave));
  for (const e of entradas) {
    const suyas = filas.filter((f) => f.nombres.includes(clave(e)));
    if (suyas.length === 0) {
      salida.push(`${clave(e)}: no tiene fila en el índice`);
      continue;
    }
    if (suyas.length > 1) salida.push(`${clave(e)}: tiene ${suyas.length} filas`);
    const esperado = e.estado ?? SIN_CABECERA;
    for (const f of suyas) {
      if (f.estado !== esperado) salida.push(`${clave(e)}: el índice dice «${f.estado ?? "nada"}» y la cabecera «${esperado}»`);
    }
  }
  for (const f of filas) {
    for (const n of f.nombres) if (!conocidas.has(n)) salida.push(`${n}: tiene fila y no existe en docs/dominio/`);
  }
  return salida;
}

/** Las entradas de `docs/dominio/` tal como están en el disco, salvo el README. */
function entradasDelDisco(estados: string[]): EntradaDeDominio[] {
  return readdirSync(CARPETA)
    .filter((n) => n !== "README.md" && n !== ".DS_Store")
    .sort()
    .map((nombre) => {
      const ruta = join(CARPETA, nombre);
      if (statSync(ruta).isDirectory()) {
        // Una carpeta vale el estado que comparten sus `.md`. Si no comparten uno, se nombran los
        // que hay: ese texto no casa con ninguna fila, y la discrepancia lo enseña.
        const suyos = readdirSync(ruta)
          .filter((n) => n.endsWith(".md"))
          .map((n) => estadoDeCabecera(readFileSync(join(ruta, n), "utf8"), estados));
        const distintos = [...new Set(suyos)];
        const estado = distintos.length === 1 ? distintos[0]! : distintos.length === 0 ? null : `mezclado: ${distintos.join(" / ")}`;
        return { nombre, esCarpeta: true, estado };
      }
      const estado = nombre.endsWith(".md") ? estadoDeCabecera(readFileSync(ruta, "utf8"), estados) : null;
      return { nombre, esCarpeta: false, estado };
    });
}

describe("el índice de fuentes está al día con docs/dominio", () => {
  const estados = estadosDeLaTabla();
  const entradas = entradasDelDisco(estados);
  const filas = filasDelIndice(readFileSync(INDICE, "utf8"));

  it("lee lo que se sabe que está (controles del propio barrido)", () => {
    // Una carpeta renombrada o un índice que cambia de forma darían listas vacías, y «ninguna
    // discrepancia» se leería igual que «al día».
    expect(estados, `estados del README: ${estados.join(" · ")}`).toContain("referencia externa");
    expect(entradas.length, `entradas: ${entradas.map((e) => e.nombre).join(", ")}`).toBeGreaterThanOrEqual(12);
    expect(filas.length, "filas leídas del índice").toBeGreaterThanOrEqual(10);
    // El lector de cabeceras funciona: casi todo lo de la carpeta declara su estado.
    expect(entradas.filter((e) => e.estado !== null).length).toBeGreaterThanOrEqual(10);
    expect(entradas.find((e) => e.nombre === "varroa-inspeccion-desinfeccion.md")?.estado).toBe("respaldado en parte");
    expect(entradas.find((e) => e.nombre === "meliponini-seeder.js.txt")?.estado).toBeNull();
  });

  it("cada entrada tiene su fila, y la fila dice el estado de su cabecera", () => {
    expect(discrepancias(entradas, filas)).toEqual([]);
  });
});

describe("las reglas del índice, con entradas escritas a mano", () => {
  const varroa: EntradaDeDominio = { nombre: "varroa.md", esCarpeta: false, estado: "respaldado en parte" };

  it("una fila correcta no da nada", () => {
    expect(discrepancias([varroa], [{ nombres: ["varroa.md"], estado: "respaldado en parte" }])).toEqual([]);
  });

  it("una fila que dice «borrador» de un archivo respaldado en parte, sí", () => {
    expect(discrepancias([varroa], [{ nombres: ["varroa.md"], estado: "borrador · pendiente de revisión" }])).toEqual([
      "varroa.md: el índice dice «borrador · pendiente de revisión» y la cabecera «respaldado en parte»",
    ]);
  });

  it("un archivo sin fila, y una fila de un archivo que no existe", () => {
    expect(discrepancias([varroa], [{ nombres: ["otro.md"], estado: "referencia externa" }])).toEqual([
      "varroa.md: no tiene fila en el índice",
      "otro.md: tiene fila y no existe en docs/dominio/",
    ]);
  });

  it("un archivo sin cabecera tiene que decir «sin cabecera propia», y una carpeta se nombra con su barra", () => {
    const semilla: EntradaDeDominio = { nombre: "semilla.txt", esCarpeta: false, estado: null };
    const carpeta: EntradaDeDominio = { nombre: "informes", esCarpeta: true, estado: "referencia externa" };
    expect(discrepancias([semilla], [{ nombres: ["semilla.txt"], estado: "referencia externa" }])).toEqual([
      "semilla.txt: el índice dice «referencia externa» y la cabecera «sin cabecera propia»",
    ]);
    expect(discrepancias([carpeta], [{ nombres: ["informes"], estado: "referencia externa" }])).toContain("informes/: no tiene fila en el índice");
    expect(discrepancias([carpeta], [{ nombres: ["informes/"], estado: "referencia externa" }])).toEqual([]);
  });

  it("la tabla se lee de su sección, y los nombres sólo de la primera columna", () => {
    const indice = [
      "## Registros",
      "| `fuera.md` | **referencia externa** | no es de esta tabla |",
      "## Material de dominio",
      "| fuente | estado | lo que hay que saber |",
      "|---|---|---|",
      "| `a.md`, `b.md` | **reemplazado · no normativo** | los sustituye `docs/beneficio/10` |",
      "## Lo que NO está guardado",
      "| `despues.md` | **borrador** | tampoco |",
    ].join("\n");
    expect(filasDelIndice(indice)).toEqual([{ nombres: ["a.md", "b.md"], estado: "reemplazado · no normativo" }]);
  });

  it("una cabecera con dos estados no cuenta como ninguno", () => {
    const estados = ["referencia externa", "respaldado en parte"];
    expect(estadoDeCabecera("<!--\n  estado    : referencia externa · revisión compilada\n-->", estados)).toBe("referencia externa");
    expect(estadoDeCabecera("<!--\n  estado    : referencia externa\n  estado    : respaldado en parte\n-->", estados)).toBeNull();
    expect(estadoDeCabecera(`${"x".repeat(2000)}estado    : referencia externa`, estados)).toBeNull();
  });
});
