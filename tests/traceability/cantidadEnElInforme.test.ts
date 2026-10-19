/**
 * **El informe pinta la cantidad con su unidad, en una sola fila** — paso 9 del plan del Apiario
 * (ADR-200). Hasta hoy eran dos filas, «Cantidad: 3» y «Unidad: lb», y la primera se leía sola.
 *
 * Una cantidad sin unidad se guarda (ADR-200 §5: el formulario la exige, el servicio no), así que
 * el informe la puede recibir y tiene que decirlo en vez de pintar un «3» que parece completo.
 *
 * Hermético: se llama al componente de servidor con los textos REALES (`traductorDePrueba`
 * revienta si falta una clave) y se mira el HTML.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const idioma = vi.hoisted(() => ({ actual: "es" as "es" | "en" }));
vi.mock("next-intl/server", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { getTranslations: async (espacio: string) => traductorDePrueba(espacio, idioma.actual) };
});

import { traductorDePrueba } from "../helpers/traductorDePrueba";

async function html(alimentacion: { cantidad: string | null; unidad: string | null }, paraCliente = false) {
  const { DetallesDelReporte } = await import("../../app/components/traceability/DetallesDelReporte");
  const registro = { cuando: "2026-10-18T14:00:00Z", clase: "registro", sujeto: "evento_de_colonia", alimentacion: { tipo: null, material: "jarabe 1:1", ...alimentacion } };
  const elemento = await (DetallesDelReporte as unknown as (p: unknown) => Promise<React.ReactElement | null>)({ registro, enCuadros: true, paraCliente });
  return elemento ? renderToStaticMarkup(elemento) : "";
}
/** El valor de la fila con ese rótulo, o `null` si no está. */
function valor(h: string, rotulo: string): string | null {
  return new RegExp(`<dt>${rotulo.replace(/[()]/g, "\\$&")}</dt><dd>([^<]*)</dd>`).exec(h)?.[1] ?? null;
}

describe("la cantidad del alimento en el informe", () => {
  const t = traductorDePrueba("Apiary");

  it("va con su unidad, y la unidad ya no tiene fila propia", async () => {
    const h = await html({ cantidad: "3", unidad: "lb" });
    // Control: el lector encuentra las filas (el material está).
    expect(valor(h, t("feedingMaterialLabel"))).toBe("jarabe 1:1");
    expect(valor(h, t("feedingQuantityLabel"))).toBe("3 lb");
    expect(valor(h, t("unitLabel"))).toBeNull();
  });

  it("sin unidad, lo dice en vez de pintar un número que parece completo", async () => {
    const h = await html({ cantidad: "3", unidad: null });
    expect(valor(h, t("feedingQuantityLabel"))).toBe("3 (sin unidad)");
  });

  it("una unidad sin cantidad no dice nada: «Sin registrar»", async () => {
    const h = await html({ cantidad: null, unidad: "lb" });
    expect(valor(h, t("feedingQuantityLabel"))).toBe(t("reportNotRecorded"));
    expect(h).not.toContain("lb");
  });

  it("el informe del cliente pinta lo mismo", async () => {
    const h = await html({ cantidad: "1.5", unidad: "L" }, true);
    expect(valor(h, t("feedingQuantityLabel"))).toBe("1.5 L");
  });

  it("y en inglés, el «sin unidad» es suyo, no un literal en español", async () => {
    idioma.actual = "en";
    try {
      const h = await html({ cantidad: "3", unidad: null });
      expect(valor(h, traductorDePrueba("Apiary", "en")("feedingQuantityLabel"))).toBe("3 (no unit)");
    } finally {
      idioma.actual = "es";
    }
  });
});
