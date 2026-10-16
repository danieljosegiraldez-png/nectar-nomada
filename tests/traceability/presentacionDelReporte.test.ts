import { describe, it, expect } from "vitest";
import { fechaDelReporte, detalleDelReporte, sujetoDelReporte, SUJETOS_DEL_REPORTE } from "../../lib/traceability/presentacionDelReporte";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("presentación fiel del reporte", () => {
  it("conserva el día local al cruzar medianoche UTC", () => {
    expect(fechaDelReporte("2026-09-03T01:00:00Z", "America/Panama")).toBe("2026-09-02 20:00 (America/Panama)");
  });
  it("una versión sin zona declara UTC, sin inventar zona del sitio", () => {
    expect(fechaDelReporte("2026-09-03T01:00:00Z")).toBe("2026-09-03 01:00 (UTC)");
  });
  it("traduce el resultado de una inspección antigua", () => {
    expect(detalleDelReporte({cuando:"",clase:"",operador:null,notas:null,sujeto:"inspeccion",detalle:"nothing_unusual"}, k=>k==="inspectionOutcome_nothing_unusual" ? "Nada fuera de lo normal" : k)).toBe("Nada fuera de lo normal");
  });
  it("no traduce texto libre de otros manejos", () => {
    expect(detalleDelReporte({cuando:"",clase:"",operador:null,notas:null,sujeto:"evento_de_colonia",detalle:"issue_observed"}, ()=>{throw Error("No es inspección")})).toBe("issue_observed");
  });
});

/**
 * **El sujeto de cada línea se dice con palabras, no con su código** — V-7 de la revisión del
 * Apiario. Hasta el 2026-10-10 el informe, también el que ve el cliente por su enlace, imprimía
 * `evento_de_colonia` tal cual. Con el tipo de manejo congelado, dice cuál fue.
 */
describe("el sujeto del informe", () => {
  const base = { cuando: "", clase: "", operador: null, notas: null };
  const t = (k: string) => k;

  it("un manejo congelado dice su tipo", () => {
    expect(sujetoDelReporte({ ...base, sujeto: "evento_de_colonia", manejo: "treatment" }, t)).toBe("colonyEventType_treatment");
  });

  it("uno emitido antes, sin el tipo, dice «manejo de colonia» y no el código", () => {
    expect(sujetoDelReporte({ ...base, sujeto: "evento_de_colonia" }, t)).toBe("reportSujeto_evento_de_colonia");
  });

  it("el conteo de varroa y los demás, por su etiqueta", () => {
    expect(sujetoDelReporte({ ...base, sujeto: "conteo_de_varroa" }, t)).toBe("reportSujeto_conteo_de_varroa");
    expect(sujetoDelReporte({ ...base, sujeto: "inspeccion" }, t)).toBe("reportSujeto_inspeccion");
  });

  it("un código que no conoce se deja como está: no se inventa una etiqueta", () => {
    expect(sujetoDelReporte({ ...base, sujeto: "algo_nuevo" }, t)).toBe("algo_nuevo");
  });

  it("cada sujeto tiene su etiqueta en los dos idiomas", () => {
    // Sin la clave, next-intl pinta su nombre en la pantalla del cliente, y nada falla en rojo.
    const leer = (ruta: string) => JSON.parse(readFileSync(join(new URL("../..", import.meta.url).pathname, ruta), "utf8")).Apiary as Record<string, string>;
    const es = leer("messages/es.json"), en = leer("messages/en.json");
    expect(SUJETOS_DEL_REPORTE.length).toBeGreaterThan(0);
    for (const s of SUJETOS_DEL_REPORTE) {
      expect(es[`reportSujeto_${s}`], `falta Apiary.reportSujeto_${s} en es.json`).toBeTruthy();
      expect(en[`reportSujeto_${s}`], `falta Apiary.reportSujeto_${s} en en.json`).toBeTruthy();
    }
    for (const k of ["registroVarroa", "reportVarroaInfestacion", "reportPorCiento"]) {
      expect(es[k], `falta Apiary.${k} en es.json`).toBeTruthy();
      expect(en[k], `falta Apiary.${k} en en.json`).toBeTruthy();
    }
  });
});
