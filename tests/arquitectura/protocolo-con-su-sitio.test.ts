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
import { MAPA_DEL_PROTOCOLO, MODELOS_POR_ACTIVIDAD, itemsSinSitio } from "../../lib/apiary/mapaDelProtocolo";

interface ItemDelJson {
  key: string;
  valueType: string;
  stage: string;
  required?: boolean;
}

const protocolo = JSON.parse(readFileSync("protocolos/apiario-campo-v2.json", "utf8")) as {
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
 * **Aqui hubo un despojado de comentarios y se quito, porque no hacia nada.** Lo dijo un
 * flip-test: anulandolo, las siete pruebas seguian en verde. La razon es que el patron de
 * campo exige una palabra pegada a la sangria, y toda linea de comentario del esquema empieza
 * por `/` -- asi que ninguna podia colarse nunca. Un filtro que ninguna entrada puede hacer
 * decidir es un adorno con forma de guardia, y en este archivo ademas mentia: sugeria que el
 * detector se defiende de algo de lo que no tiene que defenderse.
 */
function camposPorModelo(): Map<string, Set<string>> {
  const fuente = readFileSync("prisma/schema.prisma", "utf8");
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

  it("cada actividad declara a que modelos escribe, y esos modelos existen", () => {
    // **Sin esto la declaracion de arriba no es portante.** Un flip-test lo dijo: vaciando
    // `MODELOS_POR_ACTIVIDAD.inspection` las nueve pruebas seguian en verde, porque hoy
    // ningun `sin_sitio` de esa actividad tiene un campo parecido. La comprobacion del
    // `sin_sitio` solo vale si sabe donde buscar, y eso hay que exigirlo aparte.
    const actividades = [...new Set(ITEMS.map((i) => i.actividad))];
    const problemas: string[] = [];
    for (const actividad of actividades) {
      const modelos = MODELOS_POR_ACTIVIDAD[actividad];
      if (!modelos || modelos.length === 0) {
        problemas.push(`${actividad}: no declara ningun modelo`);
        continue;
      }
      for (const m of modelos) {
        if (!CAMPOS_POR_MODELO.has(m)) problemas.push(`${actividad}: el modelo ${m} no existe`);
      }
    }
    expect(problemas).toEqual([]);
  });

  it("UN «SIN SITIO» TAMBIEN SE COMPRUEBA: ningun campo de su actividad se le parece", () => {
    // **La mitad que faltaba.** El guardia comprobaba que los destinos declarados existieran,
    // y con eso parecia que el mapa no podia mentir. Podia en la otra direccion: un
    // `sin_sitio` era una afirmacion que nada verificaba. Declare `efficacy_note` sin sitio y
    // resulta que `ColonyEvent.treatmentEfficacyNote` existe **y el cierre de tratamiento lo
    // escribe**: la cuenta de huecos que publique era mas grande que la real.
    //
    // Es una heuristica sobre nombres, no una prueba: puede dar una falsa alarma. Se resuelve
    // declarando el destino, que es lo que habria que hacer igualmente.
    const porClave = new Map(ITEMS.map((i) => [i.key, i]));
    const sospechosos: string[] = [];
    for (const clave of itemsSinSitio()) {
      const item = porClave.get(clave)!;
      const camello = clave.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).toLowerCase();
      for (const modelo of MODELOS_POR_ACTIVIDAD[item.actividad] ?? []) {
        for (const campo of CAMPOS_POR_MODELO.get(modelo) ?? []) {
          if (campo.toLowerCase().includes(camello)) {
            sospechosos.push(`${clave}: ${modelo}.${campo} se le parece y el mapa dice «sin sitio»`);
          }
        }
      }
    }
    expect(sospechosos).toEqual([]);
  });

  it("CONTROL DE ESA COMPROBACION: sobre el caso real que se me escapo, habria saltado", () => {
    // Sin este control, el `[]` de arriba lo cumpliria igual una comprobacion que no mira
    // nada. `efficacy_note` -> `ColonyEvent.treatmentEfficacyNote` es el caso que ocurrio.
    const camello = "efficacy_note".replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()).toLowerCase();
    const campos = CAMPOS_POR_MODELO.get("ColonyEvent") ?? new Set<string>();
    expect([...campos].some((c) => c.toLowerCase().includes(camello))).toBe(true);
    expect([...campos].some((c) => c.toLowerCase().includes("siteconditionquenoexiste"))).toBe(false);
  });

  it("lo que NO tiene donde guardarse queda dicho, y son las que deciden el proximo trabajo", () => {
    // No es una prueba de un numero por el numero: es que la lista esté escrita y no se
    // mueva sola. Si alguien anade un destino, esta prueba cae y le obliga a contarlo.
    const sinSitio = itemsSinSitio().sort();
    expect(sinSitio).toEqual(
      [
        // `assessment` salio de esta lista el 2026-09-17 (ADR-154): ahora vive en
        // `Inspection.assessment`, y se escribe por el cierre de la VISITA, que es el unico
        // cierre que existe. La lista baja de TRES a DOS.
        //
        // `hives_present_count` salio de esta lista el 2026-09-16 (ADR-150): ahora vive en
        // `FieldSession.hivesPresentCount`. La lista baja de CINCO a CUATRO, y este guardia
        // existe precisamente para que ese numero no cambie en silencio (ADR-143).
        // `moisture_pct` salio de esta lista el 2026-09-17 (ADR-160): es la escala H% del
        // refractometro de miel, y vive como `Measurement` sobre el `Lot` de la cosecha -- no en
        // una columna, porque el lote es lo que sigue a la miel al dividirse o envasarse. La
        // lista baja de DOS a UNA.
        // `site_condition` salio de esta lista el 2026-09-18 (ADR-165): la v2 del protocolo la hace
        // una lista fija, y vive en `FieldSession.siteConditions`. La lista baja de UNA a CERO:
        // todas las preguntas del protocolo tienen donde guardarse.
        // `weather_observed` salio de esta lista el 2026-09-17 (ADR-152), y NO porque se
        // construyera un proveedor de clima: porque la nota que lo daba por hueco confundia el
        // «Clima 7 dias» del Anexo C --un pronostico externo, que sigue sin proveedor-- con la
        // pregunta del Anexo E, que es lo que el apicultor VIO. La lista baja de CUATRO a TRES.
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
    // **Era `["purpose"]` y ahora es ninguna** (ADR-141). Que esta lista este vacia es el
    // resultado del trabajo, no la ausencia de comprobacion: si manana entra al protocolo una
    // pregunta obligatoria de patio sin sitio, esta prueba la nombra.
    expect(criticas, "una pregunta obligatoria de campo sin donde guardarse").toEqual([]);
  });
});
