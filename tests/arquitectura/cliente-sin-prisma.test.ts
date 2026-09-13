/**
 * Un componente `"use client"` no importa VALORES de un módulo que llega a `prisma`.
 *
 * **El defecto, y costó producción.** El 2026-09-13,
 * `app/components/apiary/ColonyEventQuickEntry.tsx` importó
 * `OBJETIVOS_DE_TRATAMIENTO` de `lib/apiary/objetivoDelTratamiento.ts`, que además
 * del vocabulario tiene la consulta del reporte. Eso arrastró `lib/db` y con él
 * `pg` al paquete del navegador, y `next build` murió con siete errores del tipo
 * *«Module not found: Can't resolve 'dns'»*. `main` se quedó **sirviendo un build
 * viejo** hasta que se separó el módulo.
 *
 * **Por qué ninguna compuerta lo vio.** `npm run verify` corre tipos, lint y tests
 * — **no `next build`**. Para TypeScript el import era perfectamente válido. Es la
 * misma familia que `use-server-solo-async.test.ts`: un guardia de fuente no
 * sustituye al build, lo **adelanta**.
 *
 * **La distinción que hace falta es tipo contra valor.** Siete componentes más
 * importan de módulos con `prisma` detrás y están bien: lo hacen con `import type`,
 * que **se borra al compilar** y no arrastra nada. Medido el 2026-09-13: de ocho
 * pares cliente→prisma, **uno solo** importaba un valor. Un guardia que no
 * distinguiera marcaría siete archivos sanos y enseñaría a ignorarlo.
 *
 * Hermético: sólo lee archivos.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../..", import.meta.url).pathname;

function archivos(dir: string, ext: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (entrada === "node_modules" || entrada.startsWith(".")) continue;
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta, ext));
    else if (entrada.endsWith(ext)) salida.push(ruta);
  }
  return salida;
}

/** A qué archivo de `lib` apunta un import relativo, si apunta a alguno. */
function resolverLib(desde: string, especificador: string): string | null {
  if (!especificador.startsWith(".")) return null;
  const base = resolve(dirname(desde), especificador);
  for (const cand of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    try {
      if (statSync(cand).isFile()) return cand;
    } catch {
      /* no existe: se prueba el siguiente */
    }
  }
  return null;
}

/**
 * Los módulos de `lib` que llegan a `prisma`, **por cierre transitivo**. Directo no
 * basta: `a.ts` puede importar `b.ts` que importa `lib/db`, y el navegador se come
 * la cadena entera igual.
 */
function modulosQueLleganAPrisma(): Set<string> {
  const libs = archivos(join(RAIZ, "lib"), ".ts");
  const importes = new Map<string, string[]>();
  const directos = new Set<string>();
  const db = join(RAIZ, "lib/db.ts");

  for (const f of libs) {
    const fuente = readFileSync(f, "utf8");
    const destinos: string[] = [];
    for (const m of fuente.matchAll(/from\s+"(\.[^"]+)"/g)) {
      // `import type` no arrastra nada: se borra al compilar.
      const linea = fuente.slice(fuente.lastIndexOf("\n", m.index) + 1, m.index);
      if (/^\s*import\s+type\s/.test(linea)) continue;
      const destino = resolverLib(f, m[1]!);
      if (destino) destinos.push(destino);
    }
    importes.set(f, destinos);
    if (destinos.includes(db)) directos.add(f);
  }

  // Cierre: quien importa a alguien que llega, llega.
  const llegan = new Set(directos);
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const [f, destinos] of importes) {
      if (llegan.has(f)) continue;
      if (destinos.some((d) => llegan.has(d))) {
        llegan.add(f);
        cambio = true;
      }
    }
  }
  return llegan;
}

/** Un import de un componente: a dónde va, y si trae algún VALOR. */
interface Importe {
  destino: string;
  valores: string[];
}

function importesDeValor(archivo: string): Importe[] {
  const fuente = readFileSync(archivo, "utf8");
  const salida: Importe[] = [];
  const patron = /import\s+(type\s+)?(\{[\s\S]*?\}|[\w*\s,]+?)\s+from\s+"(\.[^"]+)"/g;
  for (const m of fuente.matchAll(patron)) {
    const [, soloTipo, cuerpo, especificador] = m;
    const destino = resolverLib(archivo, especificador!);
    if (!destino) continue;
    if (soloTipo) continue;
    const specs = cuerpo!
      .replace(/[{}]/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const valores = specs.filter((s) => !s.startsWith("type "));
    if (valores.length > 0) salida.push({ destino, valores });
  }
  return salida;
}

describe("un componente de cliente no arrastra prisma al navegador", () => {
  const llegan = modulosQueLleganAPrisma();
  const clientes = archivos(join(RAIZ, "app"), ".tsx").filter((f) =>
    readFileSync(f, "utf8").split("\n", 3).join("\n").includes('"use client"'),
  );

  /**
   * Control positivo. Sin esto, un regex que dejara de casar —o un `app/` que
   * cambiara de sitio— dejaría el guardia verde sobre dos listas vacías, que es la
   * comprobación negativa que `CLAUDE.md` prohíbe.
   */
  it("encuentra los dos dominios donde deben estar", () => {
    expect(llegan.size, "ningún módulo de lib llega a prisma: ¿se rompió el cierre?").toBeGreaterThan(50);
    expect([...llegan].map((f) => relative(RAIZ, f))).toContain("lib/apiary/objetivoDelTratamiento.ts");
    // Y el módulo puro NO llega: si llegara, la separación no habría servido.
    expect([...llegan].map((f) => relative(RAIZ, f))).not.toContain("lib/apiary/vocabularioDeTratamiento.ts");
    expect(clientes.length, "ningún componente de cliente: ¿se rompió el barrido?").toBeGreaterThan(10);
  });

  it("y el detector distingue un VALOR de un tipo", () => {
    // La distinción entera del guardia, sobre cadenas y no sobre el árbol: siete
    // componentes sanos importan de módulos con prisma detrás usando `import type`.
    const dir = join(RAIZ, "app/components/apiary");
    const conValor = importesDeValor(join(dir, "ColonyEventQuickEntry.tsx"));
    expect(conValor.length, "no ve ningún import de valor donde hay varios").toBeGreaterThan(0);
    const soloTipos = importesDeValor(join(dir, "OfflineSyncIndicator.tsx"));
    const rutas = soloTipos.map((i) => relative(RAIZ, i.destino));
    expect(rutas, "cuenta como valor un `import type`").not.toContain("lib/apiary/inspections.ts");
  });

  it.each(clientes.map((f) => relative(RAIZ, f)))("%s", (relativo) => {
    const archivo = join(RAIZ, relativo);
    const culpables = importesDeValor(archivo)
      .filter((i) => llegan.has(i.destino))
      .map((i) => `${relative(RAIZ, i.destino)} (${i.valores.join(", ")})`);
    expect(
      culpables,
      `este componente es "use client" y trae VALORES de un módulo que llega a prisma. ` +
        `Eso mete \`pg\` en el paquete del navegador y \`next build\` muere con ` +
        `«Module not found: Can't resolve 'dns'». Saca lo puro a su propio módulo, ` +
        `como \`lib/apiary/infestacion.ts\` o \`lib/apiary/vocabularioDeTratamiento.ts\`: ` +
        `${culpables.join("; ")}`,
    ).toEqual([]);
  });
});
