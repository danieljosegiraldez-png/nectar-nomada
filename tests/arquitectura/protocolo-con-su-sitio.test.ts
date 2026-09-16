/**
 * Las 44 preguntas del protocolo tienen todas un destino declarado, y ningun destino es
 * inventado.
 *
 * **Por que existe.** El protocolo del dueno y el esquema son dos vocabularios sin traduccion:
 * `frames_covered` contra `beeCoveredFrames`. Sin mapa, "cuantas de las 44 puede capturar el
 * sistema" no lo puede contestar nadie, y medirlo a ojo da una cifra inventada -- el primer
 * intento dio "29 sin campo" y la mitad existian con otro nombre. El instrumento medía mi
 * suposicion sobre los nombres.
 *
 * **Las dos mitades del guardia, y la segunda es la que lo hace imposible de falsear:**
 *
 *   1. Ningun item del JSON se queda sin entrada -- anadir una pregunta obliga a decidir donde
 *      aterriza, o CI se pone en rojo diciendo cual.
 *   2. **Todo destino declarado existe en el esquema de verdad**, comprobado contra el modelo
 *      de datos que genera Prisma. Sin esto, el mapa seria prosa: se podria declarar que
 *      `moisture_pct` va a `ApiaryHarvestEvent.humedad` y nadie lo notaria.
 *
 * Hermetico: lee el JSON y el modelo de datos, sin tocar la base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAPA_DEL_PROTOCOLO, itemsSinSitio } from "../../lib/apiary/mapaDelProtocolo";

interface ItemDelJson {
  key: string;
  valueType: string;
  stage: string;
  required?: boolean;
}

const protocolo = JSON.parse(readFileSync("protocolos/apiario-campo-v1.json", "utf8")) as {
  activities: { activityType: string; items: ItemDelJson[] }[];
};
const ITEMS = protocolo.activities.flatMap((a) => a.items.map((i) => ({ ...i, actividad: a.activityType })));

/**
 * Los modelos y campos que el esquema declara de verdad, leidos de `prisma/schema.prisma`.
 *
 * **No se usa `Prisma.dmmf`**: en esta version del cliente no viaja con el paquete y el
 * `import` revienta al cargar, lo que deja el archivo entero en "no tests" -- que en una
 * salida filtrada se lee igual que "no fallo nada". El esquema es la declaracion, asi que se
 * lee el esquema.
 *
 * **Los comentarios se quitan antes de buscar**, y no es cosmetica: este esquema tiene mas
 * lineas de `///` que de campos, y varias nombran campos de otras tablas. Sin quitarlos, el
 * detector encontraria campos donde solo se habla de ellos -- la trampa que ya me costo tres
 * mediciones este mes.
 */
function camposPorModelo(): Map<string, Set<string>> {
  const bruto = readFileSync("prisma/schema.prisma", "utf8");
  const fuente = bruto
    .split("\n")
    .filter((l) => !l.trim().startsWith("///") && !l.trim().startsWith("//"))
    .join("\n");
  const salida = new Map<string, Set<string>>();
  const bloques = fuente.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm);
  for (const b of bloques) {
    const campos = new Set<string>();
    for (const linea of b[2]!.split("\n")) {
      const m = /^\s+(\w+)\s+\S/.exec(linea);
      if (m) campos.add(m[1]!);
    }
    salida.set(b[1]!, campos);
  }
  return salida;
}

const CAMPOS_POR_MODELO = camposPorModelo();

describe("el protocolo de campo y el esquema hablan el mismo idioma", () => {
  it("el JSON trae las 44 preguntas en cinco actividades — control positivo antes de todo", () => {
    // Si esto baja, el resto pasa sin mirar nada.
    expect(ITEMS.length).toBe(44);
    expect(new Set(ITEMS.map((i) => i.actividad))).toEqual(
      new Set(["visit", "inspection", "feeding", "treatment", "harvest"]),
    );
  });

  it("el modelo de datos se lee de verdad — control del segundo instrumento", () => {
    // Sin esto, "todos los destinos existen" lo cumpliria igual un mapa vacio de modelos.
    expect(CAMPOS_POR_MODELO.size).toBeGreaterThan(50);
    expect(CAMPOS_POR_MODELO.get("Inspection")?.has("beeCoveredFrames")).toBe(true);
    // Y un campo que NO existe se ve como tal.
    expect(CAMPOS_POR_MODELO.get("Inspection")?.has("cuadrosCubiertos")).toBe(false);
  });

  it("ninguna pregunta se queda sin destino declarado", () => {
    const sinEntrada = ITEMS.filter((i) => !(i.key in MAPA_DEL_PROTOCOLO)).map((i) => `${i.actividad}.${i.key}`);
    expect(sinEntrada).toEqual([]);
  });

  it("y el mapa no declara preguntas que el protocolo no tiene", () => {
    const claves = new Set(ITEMS.map((i) => i.key));
    expect(Object.keys(MAPA_DEL_PROTOCOLO).filter((k) => !claves.has(k))).toEqual([]);
  });

  it("NINGUN DESTINO ES INVENTADO: el modelo y el campo existen en el esquema", () => {
    const malos: string[] = [];
    for (const [clave, destino] of Object.entries(MAPA_DEL_PROTOCOLO)) {
      if (destino.clase === "sin_sitio") continue;
      const campos = CAMPOS_POR_MODELO.get(destino.modelo);
      if (!campos) {
        malos.push(`${clave}: el modelo ${destino.modelo} no existe`);
        continue;
      }
      if (destino.clase === "campo" && !campos.has(destino.campo)) {
        malos.push(`${clave}: ${destino.modelo}.${destino.campo} no existe`);
      }
    }
    expect(malos).toEqual([]);
  });

  it("lo que NO tiene donde guardarse queda dicho, y son las que deciden el proximo trabajo", () => {
    // No es una prueba de un numero por el numero: es que la lista esté escrita y no se
    // mueva sola. Si alguien anade un destino, esta prueba cae y le obliga a contarlo.
    const sinSitio = itemsSinSitio().sort();
    expect(sinSitio).toEqual(
      [
        "assessment",
        "efficacy_note",
        "hives_present_count",
        "moisture_pct",
        "probable_cause",
        "purpose",
        "recommendation",
        "site_condition",
        "travel_cost_usd",
        "weather_observed",
      ].sort(),
    );
  });

  it("de las que NO tienen sitio, las obligatorias en el patio se cuentan aparte", () => {
    // El §7 pide que el patio no pida lo que puede esperar. Lo que se mide aqui es lo
    // contrario y es peor: una pregunta OBLIGATORIA de campo que no se puede guardar.
    const porClave = new Map(ITEMS.map((i) => [i.key, i]));
    const criticas = itemsSinSitio()
      .map((k) => porClave.get(k)!)
      .filter((i) => i.required && i.stage === "field")
      .map((i) => i.key);
    expect(criticas, "una pregunta obligatoria de campo sin donde guardarse").toEqual(["purpose"]);
  });
});
