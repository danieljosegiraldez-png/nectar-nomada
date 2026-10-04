/**
 * `coversExistingColumn` del JSON y el destino del mapa dicen LO MISMO.
 *
 * **El defecto que lo motiva, medido el 2026-10-03.** El JSON declaraba que `honey_stores` cubre
 * `Inspection.storesLevel` —la columna que el esquema marca como **reemplazada**
 * (`schema.prisma:8171`)— mientras `MAPA_DEL_PROTOCOLO` la mandaba a
 * `Inspection.honeyStoresLevel`. Las dos declaraciones existían, las dos parecían bien, y **nada
 * las comparaba**: `protocolo-con-su-sitio.test.ts` comprueba que el destino del mapa **exista en
 * el esquema**, no que el JSON esté de acuerdo con él.
 *
 * Y `pollen_stores` enseñaba la otra mitad del mismo hueco: el mapa le daba destino y el JSON **no
 * declaraba ninguna columna**, así que tampoco había nada que contradecir.
 *
 * Dos declaraciones de lo mismo sin un guardia entre ellas es deriva esperando a ocurrir. Aquí ya
 * había ocurrido, y lo que la mantuvo invisible fue que cada declaración tenía su propio guardia y
 * ninguno mira a la otra.
 *
 * **Nace ROJO a propósito** (`PENDING_IMPLEMENTATIONS/010`, Parte A, Tarea 1): nombra el desacuerdo
 * que ya existía, y lo pone verde la tarea que arregla las declaraciones. Un guardia que nace verde
 * no demuestra nada.
 *
 * **Su límite, dicho:** sólo compara los ítems que declaran `coversExistingColumn`. Un ítem que no
 * declara ninguna no se mira aquí — de ése se encarga `protocolo-con-su-sitio.test.ts`, que exige
 * que todo ítem tenga entrada en el mapa.
 *
 * Hermético: lee dos archivos, no toca la base. NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAPA_DEL_PROTOCOLO } from "../../lib/apiary/mapaDelProtocolo";

const RAIZ = process.cwd();

interface ProtocoloLeido {
  activities?: { items?: { key: string; coversExistingColumn?: string }[] }[];
}

const PROTOCOLO = JSON.parse(
  readFileSync(join(RAIZ, "protocolos/apiario-campo-v2.json"), "utf8"),
) as ProtocoloLeido;

/** Las parejas (clave, columna declarada) del JSON, sólo de los ítems que declaran una. */
export function columnasDeclaradas(protocolo: ProtocoloLeido): { key: string; columna: string }[] {
  const salida: { key: string; columna: string }[] = [];
  for (const actividad of protocolo.activities ?? []) {
    for (const item of actividad.items ?? []) {
      if (item.coversExistingColumn) salida.push({ key: item.key, columna: item.coversExistingColumn });
    }
  }
  return salida;
}

/** Destino del mapa como `Modelo.campo`, o `null` si esa clave no manda a una columna. */
export function columnaDelMapa(
  mapa: Record<string, { clase: string; modelo?: string; campo?: string } | undefined>,
  key: string,
): string | null {
  const destino = mapa[key];
  if (!destino || destino.clase !== "campo") return null;
  return `${destino.modelo}.${destino.campo}`;
}

/** El mapa con la forma laxa que estas dos funciones necesitan, para poder llamarlas con entrada hostil. */
const MAPA = MAPA_DEL_PROTOCOLO as unknown as Record<
  string,
  { clase: string; modelo?: string; campo?: string } | undefined
>;

describe("`coversExistingColumn` y el mapa del protocolo dicen lo mismo", () => {
  const DECLARADAS = columnasDeclaradas(PROTOCOLO);

  it("hay columnas declaradas que mirar", () => {
    // **Fila patrón, y va antes de todo.** Si esto fuera 0, las dos pruebas de abajo pasarían sin
    // medir nada y su verde se leería como «no hay desacuerdos».
    expect(DECLARADAS.length, "el JSON tiene que declarar al menos una columna").toBeGreaterThan(0);
  });

  it("ninguna declaración del JSON contradice al mapa", () => {
    const desacuerdos = DECLARADAS.filter((d) => {
      const delMapa = columnaDelMapa(MAPA, d.key);
      return delMapa !== null && delMapa !== d.columna;
    }).map((d) => `${d.key}: el JSON dice ${d.columna}, el mapa dice ${columnaDelMapa(MAPA, d.key)}`);
    expect(desacuerdos, `comparadas ${DECLARADAS.length} declaraciones`).toEqual([]);
  });

  it("y ninguna declara una columna mientras el mapa la deja sin sitio", () => {
    const sinSitio = DECLARADAS.filter((d) => MAPA[d.key]?.clase === "sin_sitio").map((d) => d.key);
    expect(sinSitio, "un ítem no puede declarar columna y estar sin sitio a la vez").toEqual([]);
  });

  // **El control que lo hace un guardia y no un adorno.** El mismo detector, contra entradas
  // hostiles inventadas aquí, tiene que señalarlas. Las funciones reciben sus entradas en vez de
  // leerlas del módulo precisamente para que se las pueda inventar: un detector que sólo puede
  // mirar los datos reales no se puede probar.
  it("CONTROL: el detector señala un desacuerdo inventado y acepta uno que coincide", () => {
    const hostil: ProtocoloLeido = { activities: [{ items: [{ key: "x", coversExistingColumn: "A.b" }] }] };
    expect(columnasDeclaradas(hostil)).toEqual([{ key: "x", columna: "A.b" }]);
    expect(columnaDelMapa({ x: { clase: "campo", modelo: "A", campo: "c" } }, "x")).toBe("A.c");
    expect(columnaDelMapa({ x: { clase: "campo", modelo: "A", campo: "b" } }, "x")).toBe("A.b");
    // Un `sin_sitio` y una clave ausente NO son desacuerdos de columna: son de otro guardia.
    expect(columnaDelMapa({ x: { clase: "sin_sitio" } }, "x")).toBeNull();
    expect(columnaDelMapa({}, "x")).toBeNull();
    // Y un protocolo sin ninguna declaración da lista vacía, que es lo que la fila patrón vigila.
    expect(columnasDeclaradas({ activities: [{ items: [{ key: "y" }] }] })).toEqual([]);
  });
});
