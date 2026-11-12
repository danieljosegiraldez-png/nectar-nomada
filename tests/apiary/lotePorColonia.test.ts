/**
 * El formulario del lote dice que cada cifra es POR COLONIA — ADR-200, Consecuencias («el lote
 * rotulado “por colonia”»).
 *
 * **El defecto.** El servicio del lote copia la cantidad de alimento y la dosis del tratamiento a
 * cada colonia marcada (lo prueba `eventoEnLote.test.ts`, en el carril con base). Pero el formulario
 * las rotulaba «Cantidad» y «Dosis», igual que en una colmena sola, así que quien repartió 10 L entre
 * cinco colmenas y tecleaba 10 dejaba anotados 50.
 *
 * Hermética: el formulario se pinta en el servidor con los textos reales (`traductorDePrueba`
 * revienta si falta una clave).
 *
 * **La rama del tratamiento no se pinta sola**: el tipo es estado del cliente y arranca en
 * «alimentación». Para pintarla, este archivo hace que ESE `useState` —el único que arranca en
 * `"feeding"`— empiece en `"treatment"`. Cada prueba comprueba, además, que pintó la rama que dice.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ tipo: "feeding" as "feeding" | "treatment" }));

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useState: (inicial: unknown) => real.useState(inicial === "feeding" ? estado.tipo : inicial) };
});
vi.mock("next-intl", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { useTranslations: (espacio: string) => traductorDePrueba(espacio) };
});
// La acción de servidor arrastra la sesión y la base: aquí sólo se pinta el formulario.
vi.mock("../../app/actions/apiary", () => ({ aplicarManejoEnLoteFormAction: async () => {} }));

import { ColonyEventQuickEntry } from "../../app/components/apiary/ColonyEventQuickEntry";
import { ManejoEnLoteForm } from "../../app/components/apiary/ManejoEnLoteForm";
import { traductorDePrueba } from "../helpers/traductorDePrueba";

const t = traductorDePrueba("Apiary");

/** El texto de la `<label>` del campo con ese `id`, o `null` si no está. */
function etiqueta(html: string, id: string): string | null {
  return new RegExp(`<label\\b[^>]*for="${id}"[^>]*>([^<]*)</label>`).exec(html)?.[1] ?? null;
}

function pintarLote() {
  return renderToStaticMarkup(
    createElement(ManejoEnLoteForm, {
      apiaryId: "a1",
      colmenas: [
        { hiveId: "h1", identifier: "H-01", colonyId: "c1" },
        { hiveId: "h2", identifier: "H-02", colonyId: "c2" },
      ],
      hoy: "2026-10-18",
    }),
  );
}

describe("el lote dice que cada cifra es por colonia", () => {
  beforeEach(() => {
    estado.tipo = "feeding";
  });

  it("la cantidad de alimento, con la ayuda que explica que no se reparte", () => {
    const html = pintarLote();
    // Control: se pintó la alimentación, no el tratamiento.
    expect(etiqueta(html, "lote-material-kind")).toBe(t("feedingMaterialLabel"));
    expect(etiqueta(html, "lote-dosis")).toBeNull();

    expect(etiqueta(html, "lote-cantidad")).toBe(t("loteCantidadPorColoniaLabel"));
    expect(html).toContain(t("loteCifraPorColoniaAyuda"));
  });

  it("la dosis del tratamiento, con la misma ayuda", () => {
    estado.tipo = "treatment";
    const html = pintarLote();
    // Control: el `useState` empezó en el tratamiento; sin él, esta prueba miraría la alimentación.
    expect(etiqueta(html, "lote-dosis")).not.toBeNull();
    expect(etiqueta(html, "lote-material-kind")).toBeNull();

    expect(etiqueta(html, "lote-dosis")).toBe(t("loteDosisPorColoniaLabel"));
    expect(html).toContain(t("loteCifraPorColoniaAyuda"));
  });

  it("la colmena sola sigue diciendo «Cantidad»: allí la cifra es de una sola", () => {
    const html = renderToStaticMarkup(createElement(ColonyEventQuickEntry, { colonyId: "c1", selfPersonId: null }));
    expect(etiqueta(html, "feed-qty-c1")).toBe(t("feedingQuantityLabel"));
    expect(html).not.toContain(t("loteCifraPorColoniaAyuda"));
  });

  it("los dos rótulos dicen «por colonia» en español y en inglés", () => {
    // Control de que la prueba no se conforma con una clave nueva que diga lo mismo que la vieja.
    const en = traductorDePrueba("Apiary", "en");
    expect(t("loteCantidadPorColoniaLabel")).not.toBe(t("feedingQuantityLabel"));
    expect(t("loteCantidadPorColoniaLabel")).toMatch(/por colonia/);
    expect(t("loteDosisPorColoniaLabel")).toMatch(/por colonia/);
    expect(en("loteCantidadPorColoniaLabel")).toMatch(/per colony/);
    expect(en("loteDosisPorColoniaLabel")).toMatch(/per colony/);
  });
});
