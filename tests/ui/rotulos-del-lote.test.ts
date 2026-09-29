import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";

/**
 * Los rótulos del menú de acciones de la ficha del lote siguen una sola regla de mayúsculas.
 *
 * **El fallo que esto guarda, medido el 2026-09-28 recorriendo la interfaz con Daniel.** De los
 * doce rótulos, ocho estaban en minúscula normal —«Registrar selección», «Clasificar café verde»—
 * y **cuatro llevaban mayúscula suelta a mitad de frase**: «Iniciar Fermentación», «Iniciar
 * Secado», «Mover Almacenamiento» y «Crear Muestra». Los mismos cuatro en los dos idiomas. No era
 * un criterio distinto sino traducción palabra por palabra del inglés, y en «Mover Almacenamiento»
 * se llevó también la gramática: en castellano no se mueve el almacenamiento, se mueve el lote a
 * él. Quedó «Mover a almacenamiento» —con la palabra que ya usa su propio vecindario, «En
 * almacenamiento» y «Ubicación de almacenamiento», y no «bodega», que existe en la casa pero no en
 * este namespace—.
 *
 * **Por qué un guardia y no sólo el arreglo.** Un rótulo nuevo se añade copiando el de al lado, y
 * si el de al lado está mal la regla se pierde otra vez sin que nada lo diga. Esto lo dice.
 *
 * **Si algún día un rótulo necesita una mayúscula interna de verdad** —un nombre propio, «Brix»—,
 * la excepción va en `PERMITIDAS` con su motivo escrito, no ensanchando la regla.
 */

const PAGINA = "app/lots/[id]/page.tsx";

/** Palabras que SÍ van en mayúscula dentro de un rótulo, con su motivo. Hoy ninguna. */
const PERMITIDAS = new Set<string>();

/**
 * Las claves que la ficha usa como rótulo de una acción, sacadas de la fuente y no de una lista a
 * mano: una lista a mano se queda corta el día que alguien añade una acción, y entonces el guardia
 * pasa sin mirar lo nuevo — que es justo cuando hace falta.
 */
function clavesDeRotulo(): string[] {
  const src = readFileSync(PAGINA, "utf8");
  const claves = new Set<string>();
  for (const linea of src.split("\n")) {
    if (!linea.includes("label:")) continue;
    for (const m of linea.matchAll(/\bt\("([A-Za-z0-9_]+)"\)/g)) claves.add(m[1]!);
  }
  return [...claves].sort();
}

/** ¿Lleva mayúscula alguna palabra que no sea la primera? */
function mayusculaSuelta(texto: string): string[] {
  return texto
    .split(/\s+/)
    .slice(1)
    .filter((p) => /^[A-ZÁÉÍÓÚÜÑ]/.test(p) && !PERMITIDAS.has(p.replace(/[^\wÁÉÍÓÚÜÑáéíóúüñ]/g, "")));
}

/** El valor de una clave, mire en el namespace que mire: los rótulos viven en `Traceability`. */
function valor(mensajes: Record<string, unknown>, clave: string): string | null {
  for (const ns of Object.keys(mensajes)) {
    const bloque = mensajes[ns];
    if (bloque && typeof bloque === "object" && typeof (bloque as Record<string, unknown>)[clave] === "string") {
      return (bloque as Record<string, string>)[clave]!;
    }
  }
  return null;
}

describe("los rótulos del menú de acciones del lote", () => {
  const claves = clavesDeRotulo();

  /**
   * **Control positivo del extractor, y va primero a propósito.** Si el regex deja de casar —porque
   * alguien reformatea la lista, o `label:` pasa a otra línea— `claves` sale vacía y los dos tests
   * de abajo pasarían sobre nada, que es la forma exacta de un cero que significa «no miré».
   */
  it("el extractor encuentra los rótulos en la fuente", () => {
    expect(claves.length, `Ningún \`label: t("…")\` en ${PAGINA}: el extractor está ciego`).toBeGreaterThanOrEqual(10);
    expect(claves).toContain("recordSelectionButton");
    expect(claves).toContain("startFermentationButton");
  });

  it("ninguno lleva mayúscula suelta a mitad de frase, en castellano", () => {
    const malos = claves
      .map((k) => ({ k, texto: valor(es as Record<string, unknown>, k) }))
      .filter((x) => x.texto && mayusculaSuelta(x.texto).length > 0)
      .map((x) => `${x.k} = «${x.texto}»`);
    expect(malos, "Minúscula salvo la inicial. Si es un nombre propio, va en PERMITIDAS con su motivo").toEqual([]);
  });

  it("ni en inglés", () => {
    const malos = claves
      .map((k) => ({ k, texto: valor(en as Record<string, unknown>, k) }))
      .filter((x) => x.texto && mayusculaSuelta(x.texto).length > 0)
      .map((x) => `${x.k} = «${x.texto}»`);
    expect(malos, "Minúscula salvo la inicial. Si es un nombre propio, va en PERMITIDAS con su motivo").toEqual([]);
  });

  it("y cada rótulo que la ficha usa existe en los dos idiomas", () => {
    for (const k of claves) {
      expect(valor(es as Record<string, unknown>, k), `${k} falta en es.json`).toBeTruthy();
      expect(valor(en as Record<string, unknown>, k), `${k} falta en en.json`).toBeTruthy();
    }
  });
});
