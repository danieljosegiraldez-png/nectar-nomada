/** La primera tanda puede contener sólo muestras sin tueste; eso no prueba que no haya preparaciones más adelante. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const datos = vi.hoisted(() => ({
  protocolos: [{ id: "protocolo", label: "Protocolo de prueba" }],
  resultado: {
    muestras: [{ id: "verde", sampleCode: "VERDE", sampleType: "green_coffee", description: null,
      lotCode: null, organizationName: null, processGrade: null, roastSessions: [] as Array<{
        id: string; startedAt: Date; equipment: null; recipeVersion: null;
      }> }],
    hayMas: true,
  },
}));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: async () => ({ userAccountId: "host" }) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("../../lib/sensory/sessions", () => ({
  listarProtocolosParaCata: async () => datos.protocolos,
  buscarMuestrasParaCata: async () => datos.resultado,
  SesionDeCataError: class extends Error {},
}));
// Sólo el borde cliente: comprobamos si la página permite llegar al buscador.
vi.mock("../../app/components/sensory/CrearSesionForm", () => ({
  CrearSesionForm: () => createElement("form", null, createElement("input", { type: "search", "aria-label": "Buscar muestras" })),
}));
const { default: pagina } = await import("../../app/sensory/new/page");
beforeEach(() => {
  datos.protocolos = [{ id: "protocolo", label: "Protocolo de prueba" }];
  datos.resultado.hayMas = true;
  datos.resultado.muestras[0]!.roastSessions = [];
});
it("mantiene el buscador cuando la tanda no tiene tuestes pero quedan muestras sin leer", async () => {
  const html = renderToStaticMarkup(await pagina());
  expect(html).toContain('type="search"');
  expect(html).not.toContain("noRoastedSamplesAvailable");
});
it("sin más muestras ni tuestes explica la falta y no ofrece crear una cata", async () => {
  datos.resultado.hayMas = false;
  const html = renderToStaticMarkup(await pagina());
  expect(html).toContain("noRoastedSamplesAvailable");
  expect(html).not.toContain('type="search"');
});
it("sin protocolo no ofrece el formulario aunque queden muestras", async () => {
  datos.protocolos = [];
  const html = renderToStaticMarkup(await pagina());
  expect(html).toContain("noProtocolsAvailable");
  expect(html).not.toContain('type="search"');
});
it("con un tueste ofrece el formulario aunque no haya más muestras", async () => {
  datos.resultado.hayMas = false;
  datos.resultado.muestras[0]!.roastSessions = [{ id: "tueste", startedAt: new Date("2026-10-01T12:00:00Z"), equipment: null, recipeVersion: null }];
  expect(renderToStaticMarkup(await pagina())).toContain('type="search"');
});
