/**
 * Las opciones que el protocolo declara y los valores del enum del esquema dicen lo mismo.
 *
 * **El incidente es una ausencia, y por eso hay que medirla para verla.** Medido el 2026-09-17:
 * `feedingMethod` lleva **desde A9.4** con sus cuatro opciones escritas **dos veces** —en
 * `protocolos/apiario-campo-v2.json` y en `enum FeedingMethod`— y **nada comprobaba que
 * coincidieran**. Coincidían por haberlas escrito bien a mano, no porque algo lo exigiera.
 *
 * **Por qué eso es deriva esperando a ocurrir.** El protocolo es el sitio donde el dueño cambia
 * qué se pregunta **sin tocar código** —ésa es toda la idea de A9.4, y por eso sus `options` se
 * guardan como `enumValues` de una `ProtocolVariable`, en la base—. Pero cuando el mapa manda esa
 * pregunta a una **columna de enum**, Postgres sólo acepta los valores del tipo.
 *
 * ## CORREGIDO EL 2026-09-17 por la revisión de Codex, y las tres cosas que estaban mal
 *
 * La primera versión de este archivo **pasaba por razones equivocadas**, y el segundo asiento lo
 * demostró **mutando**, no afirmando:
 *
 * 1. **La lista de heredadas eximía cualquier desajuste de esa pregunta**, no sólo el declarado.
 *    Añadir un valor inventado a `honey_stores` dejaba **4/4 en verde**. Ahora se declara el **par
 *    exacto** permitido: cualquier otra diferencia en la misma pregunta vuelve a ser un desajuste.
 * 2. **Una pregunta que perdía sus `options` salía de la vigilancia en silencio**, por un
 *    `continue`. Quitárselas a `method` dejaba 4/4 en verde. Ahora, si el mapa la manda a una
 *    columna de enum, **la ausencia de `options` ES un desajuste**.
 * 3. **El «control positivo» probaba los lectores, no el detector.** Reducir el comparador a mirar
 *    sólo las dos heredadas dejaba 4/4 en verde con todo lo demás sin vigilar. La causa era
 *    estructural: **leía sus entradas del módulo y no se podía llamar con entrada hostil**. Ahora
 *    las recibe, así que el control se las inventa — la única forma de probar un detector.
 *
 * Hermético: lee dos archivos, no toca la base.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAPA_DEL_PROTOCOLO } from "../../lib/apiary/mapaDelProtocolo";

const RAIZ = process.cwd();
const ESQUEMA = readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8");
const PROTOCOLO = JSON.parse(readFileSync(join(RAIZ, "protocolos/apiario-campo-v2.json"), "utf8"));

export interface ItemDelProtocolo {
  key: string;
  valueType: string;
  options?: string[];
}

/** Todas las preguntas del protocolo, aplanadas. */
export function itemsDelProtocolo(): ItemDelProtocolo[] {
  const salida: ItemDelProtocolo[] = [];
  for (const actividad of PROTOCOLO.activities ?? []) {
    for (const item of actividad.items ?? []) salida.push(item);
  }
  return salida;
}

/** Los valores de un `enum X { ... }` del esquema, o `null` si ese enum no existe. */
export function valoresDelEnum(nombre: string): string[] | null {
  const m = new RegExp(`^enum ${nombre} \\{([^}]*)\\}`, "m").exec(ESQUEMA);
  if (!m || m[1] === undefined) return null;
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//") && !l.startsWith("///") && !l.startsWith("@@"));
}

/** El tipo declarado para `Modelo.campo` en el esquema, o `null`. */
export function tipoDelCampo(modelo: string, campo: string): string | null {
  const bloque = new RegExp(`^model ${modelo} \\{([\\s\\S]*?)^\\}`, "m").exec(ESQUEMA);
  if (!bloque || bloque[1] === undefined) return null;
  const linea = new RegExp(`^\\s*${campo}\\s+([A-Za-z_][A-Za-z0-9_]*)\\??`, "m").exec(bloque[1]);
  return linea?.[1] ?? null;
}

/**
 * Las divergencias que YA EXISTÍAN, con **el par exacto** que se permite.
 *
 * **Se declara el par y no sólo la pregunta**, y ésa es la corrección del hallazgo 1: con sólo la
 * clave, una vez exenta la pregunta quedaba sin vigilar para siempre.
 */
interface ParPermitido {
  enProtocolo: readonly string[];
  enEsquema: readonly string[];
  razon: string;
}
/**
 * **VACÍA desde el 2026-10-03, y así debería quedarse.** Tenía las dos de las reservas, y las dos
 * dejaron de ser divergencias: el protocolo ya NO declara `junto_a_cria` como cuarto nivel — es su
 * propia pregunta `honey_next_to_brood` / `pollen_next_to_brood`, apuntando a las columnas que ya
 * existían (`PENDING_IMPLEMENTATIONS/010`, Parte A).
 *
 * **Se quitan y no se dejan «por si acaso»**, porque una exención eximía la pregunta entera: con
 * ella puesta, cualquier OTRA diferencia futura en `honey_stores` se habría quedado sin vigilar.
 * Es el hallazgo 1 de la corrección del 2026-09-17, y vale igual al revés — una exención que
 * sobrevive a su motivo es una línea roja que ya no puede ponerse roja.
 */
const DIVERGENCIAS_HEREDADAS: ReadonlyMap<string, ParPermitido> = new Map<string, ParPermitido>([]);

export interface Desajuste {
  clave: string;
  enProtocolo: string[];
  enEsquema: string[];
  nota?: string;
}

/**
 * El detector. **Recibe sus entradas en vez de leerlas**, que es la corrección del hallazgo 3: un
 * detector que sólo se puede correr contra el protocolo real no se puede probar con una
 * discrepancia inventada, y entonces no hay forma de saber si detecta algo.
 */
export function compararVocabularios(
  items: readonly ItemDelProtocolo[],
  leerEnum: (nombre: string) => string[] | null = valoresDelEnum,
  leerTipo: (modelo: string, campo: string) => string | null = tipoDelCampo,
): { desajustes: Desajuste[]; comprobados: number } {
  const desajustes: Desajuste[] = [];
  let comprobados = 0;

  for (const item of items) {
    if (item.valueType !== "enum" && item.valueType !== "multi_enum") continue;
    const destino = MAPA_DEL_PROTOCOLO[item.key as keyof typeof MAPA_DEL_PROTOCOLO];
    if (!destino || destino.clase !== "campo") continue;

    const tipo = leerTipo(destino.modelo, destino.campo);
    if (!tipo) {
      desajustes.push({
        clave: item.key,
        enProtocolo: item.options ? [...item.options].sort() : [],
        enEsquema: [],
        nota: `no encuentro ${destino.modelo}.${destino.campo} en el esquema`,
      });
      continue;
    }
    const valores = leerEnum(tipo);
    // La columna no es un enum del esquema (un `String`, por ejemplo): esto no opina.
    if (valores === null) continue;

    comprobados += 1;

    // **La ausencia de `options` ES un desajuste** cuando el destino es un enum — corrección del
    // hallazgo 2. Antes un `continue` la sacaba de la vigilancia sin decir nada.
    if (!item.options) {
      desajustes.push({
        clave: item.key,
        enProtocolo: [],
        enEsquema: [...valores].sort(),
        nota: "el protocolo dejó de declarar `options` para una pregunta que va a un enum",
      });
      continue;
    }

    const enProtocolo = [...item.options].sort();
    const enEsquema = [...valores].sort();
    if (JSON.stringify(enProtocolo) !== JSON.stringify(enEsquema)) {
      desajustes.push({ clave: item.key, enProtocolo, enEsquema });
    }
  }
  return { desajustes, comprobados };
}

/**
 * Un desajuste está exento sólo si su par coincide EXACTAMENTE con el declarado.
 *
 * **El mapa entra por parámetro, con el real por omisión** (2026-10-03). Antes cerraba sobre
 * `DIVERGENCIAS_HEREDADAS`, así que la prueba que demuestra este mecanismo sólo podía demostrarlo
 * **mientras existiera alguna divergencia real** — y al quedarse el mapa vacío, esa prueba cayó
 * por no tener con qué, no por estar mal. Es la corrección 3 de este mismo archivo otra vez: un
 * detector que lee sus entradas del módulo no se puede llamar con entrada hostil.
 */
export function esHeredado(
  d: Desajuste,
  mapa: ReadonlyMap<string, ParPermitido> = DIVERGENCIAS_HEREDADAS,
): boolean {
  const permitido = mapa.get(d.clave);
  if (!permitido) return false;
  return (
    JSON.stringify(d.enProtocolo) === JSON.stringify([...permitido.enProtocolo].sort()) &&
    JSON.stringify(d.enEsquema) === JSON.stringify([...permitido.enEsquema].sort())
  );
}

describe("el protocolo y el esquema declaran el mismo vocabulario", () => {
  const items = itemsDelProtocolo();
  const { desajustes, comprobados } = compararVocabularios(items);

  it("el protocolo se leyó de verdad, y trae preguntas de tipo enum", () => {
    expect(items.length).toBeGreaterThan(30);
    expect(items.filter((i) => i.valueType === "enum").length).toBeGreaterThan(0);
  });

  it("cada pregunta enum que el mapa manda a una columna de enum coincide VALOR POR VALOR", () => {
    expect(comprobados, "no se comprobó ningún par protocolo↔enum; el detector no está mirando").toBeGreaterThan(0);
    const inesperados = desajustes.filter((d) => !esHeredado(d));
    expect(inesperados).toEqual([]);
  });

  it("y COMPRUEBA las preguntas que cree comprobar, POR SU NOMBRE", () => {
    // Corrección del hallazgo 3: sin esto, reducir el detector a mirar sólo dos preguntas dejaba
    // todo lo demás sin vigilancia y las pruebas en verde. Ahora la cobertura se declara.
    const cubiertas = new Set<string>();
    for (const item of items) {
      if (item.valueType !== "enum" && item.valueType !== "multi_enum") continue;
      const destino = MAPA_DEL_PROTOCOLO[item.key as keyof typeof MAPA_DEL_PROTOCOLO];
      if (!destino || destino.clase !== "campo") continue;
      if (valoresDelEnum(tipoDelCampo(destino.modelo, destino.campo) ?? "") !== null) cubiertas.add(item.key);
    }
    // **DOCE, y ese número es en sí un hallazgo.** El detector viejo comprobaba CINCO: su
    // `continue` sobre `!item.options` se saltaba las otras siete en silencio. Al cerrar ese
    // agujero la cobertura real subió de 5 a 12, y las doce coinciden salvo las dos heredadas.
    // **Y QUINCE desde el 2026-09-18 (ADR-165).** El detector sólo miraba `enum`; las preguntas
    // de varias respuestas (`multi_enum`) quedaban fuera aunque fueran a un enum del esquema. Al
    // incluirlas entraron tres —`brood_stages`, `purpose` y la nueva `site_condition`— y las tres
    // coinciden: ninguna divergencia escondida, pero hasta hoy nada lo comprobaba.
    expect([...cubiertas].sort()).toEqual([
      "brood_stages",
      "honey_stores",
      "honey_type",
      "material",
      "method",
      "outcome",
      "pollen_stores",
      "population",
      "purpose",
      "queen_cells",
      "route",
      "site_condition",
      "target",
      "varroa_method",
      "weather_observed",
    ]);
    expect(comprobados).toBe(cubiertas.size);
  });

  it("las heredadas siguen ahí, con SU par exacto", () => {
    for (const [clave, permitido] of DIVERGENCIAS_HEREDADAS) {
      const d = desajustes.find((x) => x.clave === clave);
      expect(d, `«${clave}» ya no diverge (${permitido.razon.slice(0, 50)}…): quítala de la lista`).toBeDefined();
      expect(esHeredado(d!), `«${clave}» diverge, pero de otra forma que la declarada`).toBe(true);
    }
  });
});

describe("el DETECTOR detecta — con entrada inventada, que es la única forma de probarlo", () => {
  const enumFalso = (n: string) => (n === "FeedingMethod" ? ["a", "b"] : null);
  const tipoFalso = () => "FeedingMethod";

  it("caza un valor que el protocolo declara y el esquema no", () => {
    const r = compararVocabularios(
      [{ key: "method", valueType: "enum", options: ["a", "b", "inventado"] }],
      enumFalso,
      tipoFalso,
    );
    expect(r.comprobados).toBe(1);
    expect(r.desajustes).toHaveLength(1);
    expect(r.desajustes[0]?.enProtocolo).toContain("inventado");
  });

  it("caza que el protocolo DEJE DE declarar sus opciones — el agujero del `continue`", () => {
    const r = compararVocabularios([{ key: "method", valueType: "enum" }], enumFalso, tipoFalso);
    expect(r.desajustes).toHaveLength(1);
    expect(r.desajustes[0]?.nota).toContain("dejó de declarar");
  });

  it("y NO se queja cuando coinciden — el control negativo del detector", () => {
    const r = compararVocabularios([{ key: "method", valueType: "enum", options: ["b", "a"] }], enumFalso, tipoFalso);
    expect(r.comprobados).toBe(1);
    expect(r.desajustes).toEqual([]);
  });

  it("una heredada con un desajuste DISTINTO del declarado ya NO está exenta", () => {
    // El hallazgo 1, hecho prueba: antes la clave sola eximía cualquier diferencia futura.
    //
    // **El mapa es sintético y no el real**, porque el real está vacío desde el 2026-10-03 y una
    // prueba del MECANISMO no puede depender de que haya datos que lo ejerciten. Con el mapa real
    // esta prueba cayó al vaciarlo — por no tener con qué, no por estar mal.
    const sintetico = new Map<string, ParPermitido>([
      ["x", { enProtocolo: ["a", "b"], enEsquema: ["a"], razon: "inventada para probar el detector" }],
    ]);
    expect(esHeredado({ clave: "x", enProtocolo: ["a", "inventado"], enEsquema: ["a"] }, sintetico)).toBe(false);
    expect(esHeredado({ clave: "x", enProtocolo: ["a", "b"], enEsquema: ["a"] }, sintetico)).toBe(true);
    // Y una clave que no está en el mapa nunca está exenta.
    expect(esHeredado({ clave: "otra", enProtocolo: ["a", "b"], enEsquema: ["a"] }, sintetico)).toBe(false);
  });

  /**
   * **Cuántas divergencias heredadas hay HOY, dicho en voz alta.** No es una aserción sobre el
   * mecanismo: es el inventario, para que añadir una exención sea un cambio visible en el diff y
   * no una línea que entra sin que nadie la cuente. Si sube, la razón de la nueva va en su
   * `razon` y esta cifra se actualiza a mano, a propósito.
   */
  it("hoy no hay ninguna divergencia heredada", () => {
    expect([...DIVERGENCIAS_HEREDADAS.keys()]).toEqual([]);
  });
});
