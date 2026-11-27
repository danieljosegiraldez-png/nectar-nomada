import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **En el beneficio se toca con guantes y manos mojadas** — R3 del plan farm-to-green (ADR-197),
 * 2026-10-09. El paquete pide `≥ 44 px` para todo blanco de toque y `≥ 56 px` para las acciones
 * principales de campo (`09` §12). Las siete páginas del beneficio llevan `.nn-mill-page`, así que
 * la regla vive en CSS y alcanza a las que se añadan.
 *
 * La casilla del volteo de la cola de secado medía **26 px** por un `style` en línea, que gana a
 * cualquier hoja: la tercera prueba impide que vuelva, en esa página o en otra del beneficio.
 *
 * Lee archivos: no comprueba los tamaños computados en el navegador (eso se mide a mano al
 * verificar), sólo que las reglas estén y que nada en línea las anule.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;
const CSS = readFileSync(join(RAIZ, "app/globals.css"), "utf8");

/** El cuerpo de la regla con ese selector exacto, o `null`. */
function regla(selector: string): string | null {
  const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = CSS.match(new RegExp(`(^|\\n)${escapado}\\s*\\{([^}]*)\\}`));
  return m?.[2] ?? null;
}

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

describe("tacto en el beneficio", () => {
  it("las acciones de campo del beneficio miden 56 px", () => {
    const cuerpo = regla(".nn-mill-page .nn-button");
    expect(cuerpo, "falta la regla .nn-mill-page .nn-button").not.toBeNull();
    expect(cuerpo).toMatch(/min-height:\s*3\.5rem/);
  });

  it("las casillas del beneficio miden lo que un toque: --nn-tap, que es 44 px", () => {
    const cuerpo = regla('.nn-mill-page input[type="checkbox"]');
    expect(cuerpo, "falta la regla de las casillas del beneficio").not.toBeNull();
    expect(cuerpo).toMatch(/width:\s*var\(--nn-tap\)/);
    expect(cuerpo).toMatch(/height:\s*var\(--nn-tap\)/);
    expect(CSS).toMatch(/--nn-tap:\s*2\.75rem/);
  });

  it("ninguna casilla del beneficio se fija el tamaño en línea, que ganaría a la regla", () => {
    const casillas: { archivo: string; etiqueta: string }[] = [];
    for (const ruta of fuentes(join(RAIZ, "app/beneficio"))) {
      const src = readFileSync(ruta, "utf8");
      for (const m of src.matchAll(/<input\b[^>]*?type="checkbox"[^>]*?\/>/gs)) {
        casillas.push({ archivo: relative(RAIZ, ruta), etiqueta: m[0] });
      }
    }
    // Control: si el recorrido no encuentra la casilla del volteo, «ninguna» no mediría nada.
    expect(casillas.length, "el recorrido no encontró ninguna casilla en app/beneficio").toBeGreaterThan(0);
    const conTamano = casillas.filter((c) => /style=\{\{[^}]*\b(width|height)\b/.test(c.etiqueta)).map((c) => c.archivo);
    expect(conTamano).toEqual([]);
  });
});
