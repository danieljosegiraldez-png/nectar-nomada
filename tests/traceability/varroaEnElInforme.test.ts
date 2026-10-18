/**
 * **El informe pinta el conteo de varroa que congeló** — V-7 de la revisión del Apiario. Hasta el
 * 2026-10-10 un conteo entraba al informe como una fila sin caja, sin resultado y sin sujeto.
 *
 * La infestación se DERIVA al pintar y no se congela: es la regla de la ficha de colonia
 * («derivado, no se guarda»), y lo que el informe guarda es lo contado.
 *
 * Hermético: se llama al componente de servidor y se mira el HTML.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// La clave y sus valores: así se ve QUÉ porcentaje se pidió pintar.
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (clave: string, valores?: Record<string, unknown>) => (valores ? `${clave}${JSON.stringify(valores)}` : clave),
}));

async function html(registro: unknown) {
  const { DetallesDelReporte } = await import("../../app/components/traceability/DetallesDelReporte");
  const elemento = await (DetallesDelReporte as unknown as (p: unknown) => Promise<React.ReactElement | null>)({ registro, enCuadros: true });
  return elemento ? renderToStaticMarkup(elemento) : "";
}
const fila = (rotulo: string, valor: string | number) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;

describe("la varroa en el informe", () => {
  it("un conteo congelado pinta método, ácaros, abejas e infestación", async () => {
    const h = await html({ cuando: "2026-05-10T14:00:00Z", clase: "observacion", sujeto: "conteo_de_varroa", varroa: { metodo: "alcohol", abejas: 300, acaros: 3 } });
    expect(h).toContain(fila("varroaMethodLabel", "varroaMethod_alcohol"));
    expect(h).toContain(fila("varroaMitesLabel", 3));
    expect(h).toContain(fila("varroaSampleBeesLabel", 300));
    // El HTML escapa las comillas: los valores que se pidieron traducir llegan como `&quot;`.
    expect(h).toContain(fila("reportVarroaInfestacion", "reportPorCiento{&quot;valor&quot;:1}"));
  });

  it("un registro emitido antes, sin el conteo congelado, no gana filas", async () => {
    // Era el estado de toda fila de varroa hasta hoy: sin `varroa` ni nada que pintar.
    expect(await html({ cuando: "2026-05-10T14:00:00Z", clase: "observacion", sujeto: null })).toBe("");
  });

  it("y la alimentación sigue pintándose como antes", async () => {
    // Control: sin esto, un componente que devolviera vacío pasaría la de arriba.
    const h = await html({ cuando: "2026-05-10T14:00:00Z", clase: "observacion", sujeto: "evento_de_colonia", alimentacion: { tipo: null, material: "jarabe 1:1", cantidad: "2", unidad: "L" } });
    expect(h).toContain(fila("feedingQuantityLabel", "2"));
  });
});
