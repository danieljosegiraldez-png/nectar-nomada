import { describe, it, expect } from "vitest";
import { fechaDelReporte, detalleDelReporte } from "../../lib/traceability/presentacionDelReporte";

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
