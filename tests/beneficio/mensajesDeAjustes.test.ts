import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mensajeDeConcesion } from "../../app/beneficio/ajustes/mensajes";
import { ConcesionError } from "../../lib/traceability/concesiones";
import { LocationAccessError } from "../../lib/traceability/locations";

/**
 * Fix round 1 del Task 2 (plan 3): `mensajeDeConcesion` traducía cualquier
 * `LocationAccessError` a su mensaje tal cual, y `exigeEditarBeneficioEn` —con
 * la que arrancan `concederEditarBeneficio`/`quitarEditarBeneficio`/
 * `personasDelBeneficio`— puede lanzar `"location_not_found"` (un
 * `beneficioId` viejo, o borrado entre que se pintó el formulario y que
 * alguien lo envió). No hay `AjustesDelBeneficio.error_location_not_found` en
 * ningún idioma, así que `next-intl` habría impreso la clave cruda
 * (`error_location_not_found`) en vez de un texto.
 *
 * Este guardia enumera **todos** los mensajes que las dos clases pueden traer
 * por este camino y comprueba que la clave que `mensajeDeConcesion` devuelve
 * tiene su `error_<clave>` en `messages/es.json` **y** `messages/en.json`.
 * Hermético: sólo importa un módulo puro y lee dos archivos.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const mensajes = (idioma: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).AjustesDelBeneficio as Record<string, string>;
const es = mensajes("es");
const en = mensajes("en");

// Los siete mensajes declarados en `ConcesionError` (lib/traceability/concesiones.ts).
// El séptimo, "conflicto_concurrente", lo añadió la ronda 2 de la revisión
// independiente (hallazgo A, 2026-09-18): `reintentarUnaVezAnteConflicto`
// lo lanza cuando dos intentos seguidos chocan con un conflicto de
// concurrencia (P2002/P2034) que releer el estado no resuelve.
const MENSAJES_DE_CONCESION_ERROR = [
  "razon_obligatoria",
  "asignacion_fuera_de_ambito",
  "ya_lo_tiene",
  "quitado_por_administracion",
  "sin_concesion",
  "no_es_beneficio",
  "conflicto_concurrente",
];

// Los únicos dos mensajes que `exigeEditarBeneficioEn` puede lanzar — la
// guardia con la que arrancan las tres funciones de `concesiones.ts`.
const MENSAJES_DE_LOCATION_ACCESS_ERROR = ["location_not_found", "no_beneficio_edit_access"];

describe("mensajeDeConcesion: toda clave que devuelve existe en los dos idiomas", () => {
  it("control positivo: hay claves error_ en AjustesDelBeneficio para comparar", () => {
    const claves = Object.keys(es).filter((k) => k.startsWith("error_"));
    expect(claves.length).toBeGreaterThanOrEqual(11);
  });

  for (const mensaje of MENSAJES_DE_CONCESION_ERROR) {
    it(`ConcesionError("${mensaje}")`, () => {
      const clave = mensajeDeConcesion(new ConcesionError(mensaje));
      expect(es[`error_${clave}`], `falta error_${clave} en es.json`).toBeTruthy();
      expect(en[`error_${clave}`], `falta error_${clave} en en.json`).toBeTruthy();
    });
  }

  for (const mensaje of MENSAJES_DE_LOCATION_ACCESS_ERROR) {
    it(`LocationAccessError("${mensaje}")`, () => {
      const clave = mensajeDeConcesion(new LocationAccessError(mensaje));
      expect(es[`error_${clave}`], `falta error_${clave} en es.json`).toBeTruthy();
      expect(en[`error_${clave}`], `falta error_${clave} en en.json`).toBeTruthy();
    });
  }

  it("location_not_found se colapsa a no_encontrado, no a una clave inexistente (el hallazgo del fix round 1)", () => {
    expect(mensajeDeConcesion(new LocationAccessError("location_not_found"))).toBe("no_encontrado");
    // Control: la clave mala, si alguien la reintrodujera, NO existe en ninguno de los dos idiomas.
    expect(es["error_location_not_found"]).toBeUndefined();
    expect(en["error_location_not_found"]).toBeUndefined();
  });

  it("cualquier otro tipo de error se relanza, no se traduce", () => {
    expect(() => mensajeDeConcesion(new Error("boom"))).toThrow("boom");
  });
});
