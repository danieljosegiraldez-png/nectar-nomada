import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Una acción tiene que saber traducir toda clase de error que pueda recibir.
 *
 * **Por qué existe.** `friendlyError` (`app/actions/traceability.ts` y sus dos
 * copias) traduce las clases que conoce y termina en `throw error`. Una clase de
 * validación sin rama **escapa de la acción**, y el formulario recibe un 500 en
 * vez de un mensaje. Lo destapó la revisión de Codex del PR #433 con un caso
 * (`PropositoInvalido`: abrir una jornada sin marcar propósito era un 500) y
 * `PENDING_IMPLEMENTATIONS/013` midió que había nueve más. Decisión de Daniel,
 * 2026-09-19: arreglarlas y dejar este guardia para que no se repita.
 *
 * **Qué mide, dicho con precisión**, porque un guardia que no dice qué miró se
 * lee como «limpio» cuando significa «no miré»:
 *
 * 1. Toma los archivos de `app/actions/` que definen un `friendlyError`.
 * 2. Por cada **función** que el archivo importa de `lib/`, cuenta las clases
 *    que esa función lanza — las de su propio cuerpo y las de las funciones del
 *    mismo archivo a las que llama.
 * 3. Da **un salto más**: de los módulos que ese archivo de `lib/` importa,
 *    cuentan las clases que lanzan las funciones cuyo nombre importa. Así llega
 *    `MassBalanceError`, que no lanza `roasting.ts` sino el `settleMassBalance`
 *    de `balance.ts` al que llama.
 * 4. Resta las clases que el archivo ya nombra en algún `instanceof`, esté la
 *    rama en `friendlyError` o en un `catch` propio de una acción — las dos
 *    formas evitan el 500, que es lo que se vigila.
 *
 * **Un `import` que sólo trae clases de error, o que es `import type`, no
 * cuenta como llamar a ese módulo.** Es la diferencia entre usar algo y
 * nombrarlo: escribir `if (error instanceof ApiaryAccessError)` obliga a
 * importar esa clase, y sin esta regla el guardia leería ese `import` como «la
 * acción llama a `hives.ts`» y exigiría además ramas para `ColoniaInvalida` y
 * `ColonyEndError`, que ninguna acción de trazabilidad puede recibir. O sea:
 * arreglar un hallazgo fabricaría dos falsos.
 *
 * **Lo que NO mide, para que nadie lo cuente dos veces:** un tercer salto, una
 * clase lanzada por un módulo que se alcanza sólo a través de un tercero. La
 * cobertura por archivo tampoco distingue qué acción del archivo captura qué:
 * si una clase está en un `catch` de una acción, este guardia la da por sabida
 * para todo el archivo.
 *
 * Hermético: sólo lee archivos, no toca la base.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;

const archivosFuente = (dir: string): string[] => {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivosFuente(ruta));
    else if (/\.tsx?$/.test(entrada)) salida.push(ruta);
  }
  return salida;
};

/**
 * Comentarios y literales convertidos en espacios, conservando las posiciones.
 *
 * Es lo que permite contar llaves y paréntesis sin que una llave dentro de una
 * cadena o de un comentario corra el final de un cuerpo.
 */
function sinTextoLiteral(fuente: string): string {
  const salida = fuente.split("");
  const borrar = (desde: number, hasta: number) => {
    for (let k = desde; k < hasta && k < salida.length; k++) if (salida[k] !== "\n") salida[k] = " ";
  };
  let i = 0;
  while (i < fuente.length) {
    const c = fuente[i];
    const d = fuente[i + 1];
    if (c === "/" && d === "/") {
      let j = fuente.indexOf("\n", i);
      if (j < 0) j = fuente.length;
      borrar(i, j);
      i = j;
    } else if (c === "/" && d === "*") {
      let j = fuente.indexOf("*/", i + 2);
      j = j < 0 ? fuente.length : j + 2;
      borrar(i, j);
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < fuente.length) {
        if (fuente[j] === "\\") j += 2;
        else if (fuente[j] === c) {
          j++;
          break;
        } else j++;
      }
      borrar(i + 1, j - 1);
      i = j;
    } else i++;
  }
  return salida.join("");
}

const cache = new Map<string, { crudo: string; limpio: string }>();
const leer = (ruta: string) => {
  let v = cache.get(ruta);
  if (!v) {
    const crudo = readFileSync(ruta, "utf8");
    v = { crudo, limpio: sinTextoLiteral(crudo) };
    cache.set(ruta, v);
  }
  return v;
};

/** Toda clase de `lib/` que sea un `Error`, incluidas las que heredan de otra clase de error. */
function inventarioDeClases(): Map<string, string> {
  const herencia = new Map<string, { padre: string; ruta: string }>();
  for (const f of archivosFuente(join(RAIZ, "lib"))) {
    for (const m of leer(f).crudo.matchAll(/^export class (\w+) extends (\w+)/gm)) {
      herencia.set(m[1]!, { padre: m[2]!, ruta: relative(RAIZ, f) });
    }
  }
  const esError = new Map<string, string>();
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    for (const [nombre, { padre, ruta }] of herencia) {
      if (padre === "Error" || esError.has(padre)) esError.set(nombre, ruta);
    }
  }
  return esError;
}

const CLASES = inventarioDeClases();

/**
 * Los imports relativos de un archivo, con los símbolos que trae de cada uno.
 *
 * Fuera quedan los `import type` enteros, los especificadores `type X` sueltos
 * y los imports que sólo traen clases de error: nombrar una clase para poder
 * escribir su `instanceof` no es llamar a ese módulo (ver la cabecera).
 */
function importaciones(ruta: string): { modulo: string; simbolos: string[] }[] {
  const salida: { modulo: string; simbolos: string[] }[] = [];
  for (const m of leer(ruta).crudo.matchAll(/import\s+([\s\S]*?)\s+from\s+["'](\.[^"']+)["']/g)) {
    const clausula = m[1] ?? "";
    if (/^\s*type\b/.test(clausula)) continue;
    const base = resolve(dirname(ruta), m[2]!);
    const destino = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")].find((c) => existsSync(c));
    if (!destino) continue;
    const simbolos = clausula
      .replace(/[{}]/g, " ")
      .split(",")
      .map((trozo) => trozo.trim())
      .filter((trozo) => trozo && !/^type\b/.test(trozo))
      .map((trozo) => trozo.split(/\s+as\s+/)[0]!.trim())
      .filter((nombre) => /^\w+$/.test(nombre) && nombre !== "default");
    if (simbolos.length === 0 || simbolos.every((s) => CLASES.has(s))) continue;
    salida.push({ modulo: destino, simbolos });
  }
  return salida;
}

/**
 * Por cada función de nivel superior del archivo, qué clases lanza — las suyas
 * y las de las funciones del mismo archivo a las que llama.
 */
const piezasCache = new Map<string, Map<string, Set<string>>>();
function lanzaPorFuncion(ruta: string): Map<string, Set<string>> {
  const guardado = piezasCache.get(ruta);
  if (guardado) return guardado;
  const { limpio } = leer(ruta);
  const lanza = new Map<string, Set<string>>();
  const llama = new Map<string, Set<string>>();
  for (const m of limpio.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm)) {
    const nombre = m[1] ?? m[2];
    if (!nombre) continue;
    // La llave del CUERPO, no la de un tipo dentro de la lista de argumentos:
    // `requireApiaryAccess(c: ReadonlyArray<{ projectId?: string }>)` tiene una
    // llave antes del cuerpo, y la primera versión de esto midió ese tipo en vez
    // de la función. Su control positivo lo dijo: «lanza: []» sobre una función
    // que lanza. Se equilibran primero los paréntesis.
    let i = limpio.indexOf("(", m.index);
    if (i >= 0) {
      let profundidad = 0;
      for (let j = i; j < limpio.length; j++) {
        if (limpio[j] === "(") profundidad++;
        else if (limpio[j] === ")") {
          profundidad--;
          if (profundidad === 0) {
            i = j;
            break;
          }
        }
      }
    } else i = m.index;
    i = limpio.indexOf("{", i);
    if (i < 0) continue;
    let profundidad = 0;
    let fin = limpio.length;
    for (let j = i; j < limpio.length; j++) {
      if (limpio[j] === "{") profundidad++;
      else if (limpio[j] === "}") {
        profundidad--;
        if (profundidad === 0) {
          fin = j;
          break;
        }
      }
    }
    const cuerpo = limpio.slice(i, fin + 1);
    lanza.set(
      nombre,
      new Set([...cuerpo.matchAll(/throw new (\w+)\(/g)].map((x) => x[1]!).filter((n) => CLASES.has(n))),
    );
    llama.set(nombre, new Set([...cuerpo.matchAll(/(\w+)\s*\(/g)].map((x) => x[1]!)));
  }
  // Punto fijo dentro del archivo: `settleMassBalance` no lanza `MassBalanceError`
  // de su propio cuerpo, lo lanza `reconcile`, a la que llama.
  for (let vuelta = 0; vuelta < 6; vuelta++) {
    for (const [nombre, destinos] of llama) {
      for (const d of destinos) for (const c of lanza.get(d) ?? []) lanza.get(nombre)!.add(c);
    }
  }
  piezasCache.set(ruta, lanza);
  return lanza;
}

/** Clase de error alcanzable desde esta acción -> por qué camino. */
function alcanzablesDesde(accion: string): Map<string, string> {
  const salida = new Map<string, string>();
  const anotar = (clase: string, camino: string) => {
    if (!salida.has(clase)) salida.set(clase, camino);
  };
  for (const { modulo: m1, simbolos: usadas } of importaciones(accion).filter((x) => x.modulo.includes("/lib/"))) {
    const porFuncionM1 = lanzaPorFuncion(m1);
    for (const s of usadas) {
      for (const c of porFuncionM1.get(s) ?? []) anotar(c, `la lanza ${s}() de ${relative(RAIZ, m1)}`);
    }
    for (const { modulo: m2, simbolos } of importaciones(m1).filter((x) => x.modulo.includes("/lib/"))) {
      const porFuncion = lanzaPorFuncion(m2);
      for (const s of simbolos) {
        for (const c of porFuncion.get(s) ?? []) {
          anotar(c, `la lanza ${s}() de ${relative(RAIZ, m2)}, que usa ${relative(RAIZ, m1)}`);
        }
      }
    }
  }
  return salida;
}

const acciones = archivosFuente(join(RAIZ, "app/actions"))
  .filter((ruta) => /function friendlyError/.test(leer(ruta).crudo))
  .map((ruta) => relative(RAIZ, ruta))
  .sort();

describe("las acciones traducen todo error que pueden recibir", () => {
  /**
   * Control positivo del INVENTARIO. Una comprobación negativa sobre una lista
   * vacía sale verde sin mirar nada.
   */
  it("encuentra las acciones con friendlyError y las clases de error de lib/", () => {
    expect(acciones).toContain("app/actions/traceability.ts");
    expect(acciones.length).toBeGreaterThanOrEqual(3);
    expect(acciones.every((r) => r.startsWith("app/actions/"))).toBe(true);
    expect(CLASES.size).toBeGreaterThanOrEqual(100);
    expect(CLASES.get("MassBalanceError")).toBe("lib/traceability/balance.ts");
  });

  /**
   * Control positivo del ANALIZADOR, y no es decorativo: estas dos son las que
   * la primera versión daba por vacías. En las dos el `throw` está en una
   * función a la que se llega **dentro** del archivo, así que si el extractor
   * de cuerpos vuelve a romperse, esto cae antes que el resto — y sin él un
   * cero se leería como «ninguna clase se escapa».
   */
  it("el extractor lee el cuerpo de una función, no el tipo de sus argumentos", () => {
    expect([...(lanzaPorFuncion(join(RAIZ, "lib/apiary/hives.ts")).get("requireApiaryAccess") ?? [])]).toContain(
      "ApiaryAccessError",
    );
    expect([...(lanzaPorFuncion(join(RAIZ, "lib/traceability/balance.ts")).get("settleMassBalance") ?? [])]).toContain(
      "MassBalanceError",
    );
  });

  /**
   * Control positivo del ALCANCE, y el más importante de los tres.
   *
   * El test de abajo es una comprobación negativa —«no falta ninguna»— y saldría
   * verde con un analizador que no encontrara nada. Éstas son las nueve que
   * `PENDING_IMPLEMENTATIONS/013` midió a mano sobre `main`: si el analizador
   * deja de ver una, esto cae aquí, con su nombre, en vez de dejar pasar el
   * verde vacío de abajo. `TraceabilityAccessError` va además como caso que ya
   * estaba cubierto desde antes.
   */
  it("el alcance sigue viendo las nueve clases que se midieron a mano", () => {
    const alcance = [...alcanzablesDesde(join(RAIZ, "app/actions/traceability.ts")).keys()];
    for (const clase of [
      "VitalesEnSitioInvalido",
      "ClimaInvalido",
      "MassBalanceError",
      "CerezaError",
      "RoastSessionValidationError",
      "ProcessTargetError",
      "LabourValidationError",
      "MaterialConsumptionValidationError",
      "CoordenadasValidationError",
      "TraceabilityAccessError",
    ]) {
      expect(alcance).toContain(clase);
    }
  });

  it.each(acciones)("%s traduce todas las clases que le pueden llegar", (relativa) => {
    const ruta = join(RAIZ, relativa);
    const conocidas = new Set([...leer(ruta).crudo.matchAll(/instanceof (\w+)/g)].map((m) => m[1]));
    const alcance = alcanzablesDesde(ruta);
    const sinRama = [...alcance.keys()]
      .filter((c) => !conocidas.has(c))
      .sort()
      .map((c) => `${c} — ${alcance.get(c)}`);
    expect(sinRama).toEqual([]);
  });
});
