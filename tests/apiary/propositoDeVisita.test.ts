/**
 * Los seis propositos de visita dicen lo mismo en los TRES sitios donde estan escritos.
 *
 * **El problema que vigila.** El vocabulario del dueno vive en
 * `protocolos/apiario-campo-v1.json`, y para que sirva tiene que estar tambien en el enum de
 * Postgres --que es quien lo hace cumplir-- y en un modulo puro --que es lo unico que el
 * formulario puede importar sin arrastrar `prisma` al navegador--. Tres listas separadas en
 * tres archivos que se editan por separado: la misma forma que `valoresEnumerados` vigila para
 * el resto del esquema, y la razon por la que ese guardia existe.
 *
 * El fallo que produce la deriva es silencioso en una direccion: un proposito anadido al JSON
 * y no al enum **no se puede guardar**, y el formulario ni siquiera lo ofrece.
 *
 * Hermetico: lee archivos, no toca la base.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROPOSITOS_DE_VISITA, exigePropositos, PropositoInvalido } from "../../lib/apiary/propositoDeVisita";

const protocolo = JSON.parse(readFileSync("protocolos/apiario-campo-v1.json", "utf8")) as {
  activities: { items: { key: string; options?: string[] }[] }[];
};
const DEL_PROTOCOLO = protocolo.activities
  .flatMap((a) => a.items)
  .find((i) => i.key === "purpose")?.options;

/** Los valores del enum, leidos del esquema. */
function valoresDelEnum(nombre: string): string[] {
  const fuente = readFileSync("prisma/schema.prisma", "utf8");
  const m = new RegExp(`^enum\\s+${nombre}\\s*\\{([\\s\\S]*?)^\\}`, "m").exec(fuente);
  if (!m) return [];
  return m[1]!
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[a-z_]+$/.test(l));
}

describe("el proposito de la visita dice lo mismo en los tres sitios", () => {
  it("el protocolo declara sus opciones — control positivo antes de todo", () => {
    // Si el JSON dejara de traerlas, las comparaciones de abajo pasarian comparando vacio.
    expect(DEL_PROTOCOLO, "el item `purpose` del protocolo trae `options`").toBeTruthy();
    expect(DEL_PROTOCOLO!.length).toBe(6);
  });

  it("el lector del enum encuentra valores — control del segundo instrumento", () => {
    expect(valoresDelEnum("VisitPurpose").length).toBe(6);
    // Y un enum que no existe da vacio en vez de inventar.
    expect(valoresDelEnum("EsteEnumNoExiste")).toEqual([]);
  });

  it("las tres listas son la misma", () => {
    const delEnum = valoresDelEnum("VisitPurpose").sort();
    expect([...PROPOSITOS_DE_VISITA].sort()).toEqual([...DEL_PROTOCOLO!].sort());
    expect(delEnum).toEqual([...DEL_PROTOCOLO!].sort());
  });

  it("y cada uno tiene su texto en los dos idiomas", () => {
    for (const lang of ["es", "en"]) {
      const mensajes = JSON.parse(readFileSync(`messages/${lang}.json`, "utf8")) as Record<string, Record<string, string>>;
      const faltan = PROPOSITOS_DE_VISITA.filter((p) => typeof mensajes.Traceability?.[`visitPurpose_${p}`] !== "string");
      expect(faltan, `faltan textos en ${lang}`).toEqual([]);
    }
  });
});

describe("exigePropositos — la frontera", () => {
  it("acepta lo que el protocolo declara y lo devuelve en el orden del catalogo", () => {
    // Dos visitas con los mismos propositos se leen iguales en el informe.
    expect(exigePropositos(["tratamiento", "inspeccion"])).toEqual(["inspeccion", "tratamiento"]);
  });

  it("RECHAZA EL VACIO, porque el protocolo lo marca obligatorio en el patio", () => {
    expect(() => exigePropositos([])).toThrow(PropositoInvalido);
    expect(() => exigePropositos(["", "  "])).toThrow(/proposito_requerido/);
  });

  it("rechaza lo desconocido y dice cual", () => {
    // Llega como cadena del formulario y de la cola offline: un `as never` dejaria entrar
    // cualquier cosa, que es el fallo de ADR-112.
    expect(() => exigePropositos(["inspeccion", "trasiego"])).toThrow(/trasiego/);
  });

  it("quita los repetidos en vez de rechazarlos", () => {
    // Marcar dos veces la misma casilla es un resbalon del dedo con guante, no otra respuesta.
    expect(exigePropositos(["cosecha", "cosecha"])).toEqual(["cosecha"]);
  });
});
