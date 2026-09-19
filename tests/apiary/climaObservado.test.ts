/**
 * ADR-152 — el clima que alguien vio al visitar.
 *
 * **Lo que esto protege, y es una corrección antes que una construcción.** El mapa del protocolo
 * daba esta pregunta por **sin sitio** con esta nota: *«el Anexo C lo pide como vital del sitio y
 * lo deja en una capa externa sin proveedor conectado»*. Eso es cierto del **«Clima 7 días»** del
 * Anexo C —un pronóstico— y **falso de ésta**: el Anexo E pregunta lo que el apicultor vio
 * estando ahí, y sus cuatro opciones llevaban escritas en el protocolo desde el principio.
 *
 * Puras: el guardia llama a la función con la entrada hostil.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CLIMAS_OBSERVADOS,
  ClimaInvalido,
  esClimaObservado,
  exigeClimaObservado,
} from "../../lib/apiary/climaObservado";

describe("el vocabulario es el del protocolo, no uno nuestro", () => {
  it("LOS CUATRO VALORES SALEN DEL PROTOCOLO, leído del archivo", () => {
    // No se comparan contra una lista escrita aquí —eso sería compararme conmigo mismo—: se leen
    // de `protocolos/apiario-campo-v2.json`, que es el artefacto del dueño.
    const protocolo = JSON.parse(readFileSync(join(process.cwd(), "protocolos/apiario-campo-v2.json"), "utf8"));
    const items = (protocolo.activities ?? []).flatMap((a: { items?: unknown[] }) => a.items ?? []);
    const clima = items.find((i: { key: string }) => i.key === "weather_observed") as
      | { options?: string[] }
      | undefined;
    expect(clima, "el protocolo ya no declara `weather_observed`").toBeDefined();
    expect(clima!.options, "el protocolo ya no declara sus opciones").toBeDefined();
    expect([...CLIMAS_OBSERVADOS]).toEqual(clima!.options);
  });

  it("y NO hay «otro», porque el protocolo no lo declara", () => {
    // Añadirlo por nuestra cuenta sería inventar vocabulario en el sitio equivocado: el dueño
    // cambia qué se pregunta en el JSON, no aquí.
    expect(CLIMAS_OBSERVADOS).not.toContain("otro");
    expect(CLIMAS_OBSERVADOS).toHaveLength(4);
  });

  it("rechaza lo que no es del vocabulario", () => {
    expect(esClimaObservado("lluvia")).toBe(true);
    // Control positivo del detector: algo plausible que NO está. `neblina` es el caso real —el
    // marco de Las Nubes describe el sitio como cloud-forest— y hoy no es un valor válido.
    expect(esClimaObservado("neblina")).toBe(false);
    expect(esClimaObservado("Despejado")).toBe(false);
    expect(esClimaObservado(null)).toBe(false);
  });
});

describe("la frontera", () => {
  it("acepta los cuatro", () => {
    for (const c of CLIMAS_OBSERVADOS) expect(exigeClimaObservado(c)).toBe(c);
  });

  it("el vacío es `null` y NO un error: el protocolo la marca opcional", () => {
    // No mirar el cielo no invalida la visita. Y `null` no es «despejado» (ADR-080).
    expect(exigeClimaObservado("")).toBeNull();
    expect(exigeClimaObservado("   ")).toBeNull();
    expect(exigeClimaObservado(null)).toBeNull();
    expect(exigeClimaObservado(undefined)).toBeNull();
  });

  it("y un valor inventado se rechaza diciendo cuál", () => {
    expect(() => exigeClimaObservado("neblina")).toThrow(ClimaInvalido);
    expect(() => exigeClimaObservado("neblina")).toThrow(/neblina/);
  });
});
