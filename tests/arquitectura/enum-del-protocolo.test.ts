/**
 * Las opciones que el protocolo declara y los valores del enum del esquema dicen lo mismo.
 *
 * **El incidente es una ausencia, y por eso hay que medirla para verla.** Medido el 2026-09-17:
 * `feedingMethod` lleva **desde A9.4** con sus cuatro opciones escritas **dos veces** —en
 * `protocolos/apiario-campo-v1.json` y en `enum FeedingMethod`— y **nada comprobaba que
 * coincidieran**. Coinciden hoy por haberlas escrito bien a mano, no porque algo lo exija.
 *
 * **Por qué eso es deriva esperando a ocurrir.** El protocolo es el sitio donde el dueño cambia
 * qué se pregunta **sin tocar código** —ésa es toda la idea de A9.4, y por eso sus `options` se
 * guardan como `enumValues` de una `ProtocolVariable`, en la base—. Pero cuando el mapa manda
 * esa pregunta a una **columna de enum**, Postgres sólo acepta los valores del tipo. El día que
 * alguien añada `"neblina"` al JSON —probable: el marco de Las Nubes describe el sitio como
 * *cloud-forest*— la captura de campo lo ofrecerá y **la escritura lo rechazará**, con un error
 * que no dice nada de protocolos.
 *
 * **Lo que esto NO exige.** Que toda pregunta de tipo `enum` tenga columna de enum: `purposes`
 * y otras viven de otra forma, y eso es correcto. Sólo mira las que **el mapa dice** que van a
 * un enum del esquema — o sea, las que ya prometieron esa correspondencia.
 *
 * Hermético: lee dos archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAPA_DEL_PROTOCOLO } from "../../lib/apiary/mapaDelProtocolo";

const RAIZ = process.cwd();
const ESQUEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");
const PROTOCOLO = JSON.parse(readFileSync(join(RAIZ, "protocolos/apiario-campo-v1.json"), "utf8"));

/** Todas las preguntas del protocolo, aplanadas, con sus opciones cuando las declaran. */
function itemsDelProtocolo(): { key: string; valueType: string; options?: string[] }[] {
  const salida: { key: string; valueType: string; options?: string[] }[] = [];
  for (const actividad of PROTOCOLO.activities ?? []) {
    for (const item of actividad.items ?? []) salida.push(item);
  }
  return salida;
}

/** Los valores de un `enum X { ... }` del esquema, o `null` si ese enum no existe. */
export function valoresDelEnum(nombre: string): string[] | null {
  const m = new RegExp(`^enum ${nombre} \\{([^}]*)\\}`, "m").exec(ESQUEMA);
  // `m[1]` puede faltar para TypeScript aunque el grupo exista: se afirma antes de leerlo, no
  // después. Comparar contra un `undefined` daría el mismo verde que comparar contra el valor.
  if (!m || m[1] === undefined) return null;
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//") && !l.startsWith("///") && !l.startsWith("@@"));
}

/** El tipo declarado para `Modelo.campo` en el esquema, o `null`. */
export function tipoDelCampo(modelo: string, campo: string): string | null {
  const bloque = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, "m").exec(ESQUEMA);
  if (!bloque) return null;
  if (bloque[1] === undefined) return null;
  const linea = new RegExp(`^\\s*${campo}\\s+([A-Za-z_][A-Za-z0-9_]*)\\??`, "m").exec(bloque[1]);
  return linea?.[1] ?? null;
}

/**
 * Las divergencias que YA EXISTÍAN cuando se escribió este guardia, cada una con su razón y su
 * dueño. **No se arreglan aquí**: tres de las cuatro son decisiones de Daniel, y una es un
 * modelado deliberado. Un guardia que no puede pasar nunca enseña a ignorar una línea roja.
 *
 * Lo que el guardia sí hace desde hoy: **impedir que aparezca una quinta**.
 */
const DIVERGENCIAS_HEREDADAS: ReadonlyMap<string, string> = new Map([
  [
    "population",
    "El protocolo dice `apiñada` (con ñ) y el enum dice `apinada`. NADIE TRADUCE: " +
      "`POBLACIONES` en `estadoDeColonia.ts` usa la del código. Hoy no rompe porque el " +
      "formulario sale de esa constante — pero el protocolo existe para que la captura salga " +
      "DE ÉL, y ese día la opción ofrecida no será un valor válido. Arreglarlo es cambiar uno " +
      "de los dos, y cuál es decisión del dueño: la ñ es su ortografía.",
  ],
  [
    "honey_stores",
    "El protocolo declara `junto_a_cria` como cuarto nivel; el esquema lo modela APARTE, como " +
      "`honeyNextToBrood` booleano. Es deliberado y mejor: «junto a cría» no es una cantidad, " +
      "es una posición, y meterlo en la misma escala obliga a elegir entre decir cuánta hay y " +
      "decir dónde está. La lista plana del protocolo no puede expresar esa separación.",
  ],
  ["pollen_stores", "Igual que `honey_stores`: `pollenNextToBrood` es una columna aparte."],
  [
    "material",
    "DIVERGENCIA CREADA EL 2026-09-16 Y ES MÍA. ADR-148 construyó `FeedingMaterial` con los " +
      "cinco valores que Daniel dictó en el apiario —azúcar morena, blanca, melaza, miel de " +
      "abeja, miel de caña— y NO se actualizó el protocolo, que sigue ofreciendo `jarabe_1_1`, " +
      "`jarabe_2_1`, `sustituto_polen` y `torta`. Son dos vocabularios para la misma pregunta. " +
      "Cuál gana es decisión del dueño: puede que quiera los suyos, o los suyos MÁS los jarabes.",
  ],
]);

/**
 * Compara TODO de una vez, fuera de las pruebas.
 *
 * **Se calcula aquí y no dentro de un `it` a propósito:** si una prueba dejara el resultado para
 * que otra lo leyera, la segunda dependería de que la primera hubiera corrido — y una prueba que
 * depende del orden de otra es exactamente la clase de guardia que pasa por razones equivocadas.
 */
function comparar(): { desajustes: string[]; comprobados: number } {
  const desajustes: string[] = [];
  let comprobados = 0;
  for (const item of itemsDelProtocolo()) {
    if (item.valueType !== "enum" || !item.options) continue;
    const destino = MAPA_DEL_PROTOCOLO[item.key as keyof typeof MAPA_DEL_PROTOCOLO];
    if (!destino || destino.clase !== "campo") continue;

    const tipo = tipoDelCampo(destino.modelo, destino.campo);
    if (!tipo) {
      desajustes.push(`${item.key}: no encuentro ${destino.modelo}.${destino.campo} en el esquema`);
      continue;
    }
    const valores = valoresDelEnum(tipo);
    // La columna no es un enum del esquema (un `String`, por ejemplo): esta prueba no opina.
    if (valores === null) continue;

    comprobados += 1;
    const enProtocolo = [...item.options].sort();
    const enEsquema = [...valores].sort();
    if (JSON.stringify(enProtocolo) !== JSON.stringify(enEsquema)) {
      desajustes.push(`${item.key} -> ${tipo}: protocolo [${enProtocolo.join(", ")}] vs esquema [${enEsquema.join(", ")}]`);
    }
  }
  return { desajustes, comprobados };
}

describe("el protocolo y el esquema declaran el mismo vocabulario", () => {
  const items = itemsDelProtocolo();
  const { desajustes, comprobados } = comparar();

  it("el protocolo se leyó de verdad, y trae preguntas de tipo enum", () => {
    // Fila patrón: sin esto, un JSON mal leído daría CERO pares que comprobar, y la prueba
    // pasaría en verde sin haber mirado nada — que es el modo de fallo que persigue.
    expect(items.length).toBeGreaterThan(30);
    expect(items.filter((i) => i.valueType === "enum").length).toBeGreaterThan(0);
  });

  it("cada pregunta enum que el mapa manda a una columna de enum coincide VALOR POR VALOR", () => {
    // **Sin esta línea el `[]` de abajo lo cumpliría igual una prueba que no compara nada.**
    expect(comprobados, "no se comprobó ningún par protocolo↔enum; el detector no está mirando").toBeGreaterThan(0);

    const inesperados = desajustes.filter((d) => !DIVERGENCIAS_HEREDADAS.has(d.split(" ")[0] ?? ""));
    expect(inesperados).toEqual([]);
  });

  it("y las heredadas SIGUEN ahí: si alguien arregla una, esta lista se queda corta", () => {
    // Control positivo de la excepción. Sin esto, borrar la comprobación entera dejaría las dos
    // pruebas en verde y la lista declarada pasaría a no vigilar nada. También avisa cuando una
    // se arregla y hay que sacarla de aquí.
    const claves = new Set(desajustes.map((d) => d.split(" ")[0] ?? ""));
    for (const [clave, razon] of DIVERGENCIAS_HEREDADAS) {
      expect(claves.has(clave), `«${clave}» ya no diverge (${razon.slice(0, 60)}…): quítala de la lista`).toBe(true);
    }
  });

  it("el detector distingue un enum que coincide de uno que no — control positivo", () => {
    // Sin esto, los dos lectores podrían devolver siempre lo mismo (o siempre nada) y la prueba
    // de arriba pasaría por vacía.
    expect(valoresDelEnum("WeatherObserved")).toEqual(["despejado", "nublado", "viento", "lluvia"]);
    expect(valoresDelEnum("EsteEnumNoExiste")).toBeNull();
    expect(tipoDelCampo("FieldSession", "weatherObserved")).toBe("WeatherObserved");
    expect(tipoDelCampo("FieldSession", "campoQueNoExiste")).toBeNull();
  });
});
