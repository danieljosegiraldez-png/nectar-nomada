/**
 * El formulario de la meta de polinización — paso 12 del plan del Apiario (ADR-200 §6).
 *
 * Hermético: se pinta en el servidor con los textos reales (`traductorDePrueba` revienta si falta
 * una clave) y se lee lo que mandaría, campo por campo, con `formDataDeHtml`.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { useTranslations: (espacio: string) => traductorDePrueba(espacio) };
});
// La acción de servidor arrastra la sesión y la base: aquí sólo se pinta el formulario.
vi.mock("../../app/actions/apiary", () => ({ crearCompromisoDePolinizacionAction: async () => ({}) }));

import { CompromisoDePolinizacionForm } from "../../app/components/apiary/CompromisoDePolinizacionForm";
import { aTexto, campos, formDataDeHtml } from "../helpers/htmlDePrueba";
import { traductorDePrueba } from "../helpers/traductorDePrueba";

const t = traductorDePrueba("Apiary");
const ORGANIZACIONES = [
  { id: "org-kiva", name: "Kiva Estate" },
  { id: "org-otra", name: "Otra finca" },
];

function pintar() {
  return renderToStaticMarkup(
    createElement(CompromisoDePolinizacionForm, { locationId: "sitio-1", organizaciones: ORGANIZACIONES }),
  );
}

describe("el formulario de la meta de polinización", () => {
  it("manda los campos de abrir una meta, con el desfase del dispositivo y sin nada elegido por omisión", () => {
    const datos = formDataDeHtml(pintar());
    expect([...datos.keys()].sort()).toEqual(
      [
        "locationId",
        "crop",
        "parcelReference",
        "committedHectares",
        "targetHivesPerHectareMin",
        "targetHivesPerHectareMax",
        "startsAt",
        "endsAt",
        "bloomStartsAt",
        "bloomEndsAt",
        "notes",
        // Lo rellena el navegador al montar; en el servidor sale vacío (`TimezoneOffsetField`).
        "tzOffsetMinutes",
      ].sort(),
    );
    expect(datos.get("locationId")).toBe("sitio-1");
    // Una fecha de día que nadie dio no se rellena: «Empieza» llega vacío y es obligatorio.
    expect(datos.get("startsAt")).toBe("");
    // El elemento entero: React no escribe los atributos en un orden fijo.
    const inicio = campos(pintar(), "startsAt");
    expect(inicio).toHaveLength(1);
    expect(inicio[0]).toMatch(/\srequired(=""|\s|\/|>)/);
    // El cliente no viene elegido: su primera opción está apagada y no manda nada.
    expect(datos.has("clientOrganizationId")).toBe(false);
  });

  it("el cliente sale de las organizaciones que recibe, y elegido llega su id", () => {
    const datos = formDataDeHtml(pintar(), 0, { clientOrganizationId: "Kiva Estate" });
    expect(datos.get("clientOrganizationId")).toBe("org-kiva");
  });

  it("NO ofrece colmenas comprometidas ni referencia al contrato: no hay nada pactado", () => {
    const html = pintar();
    // Control: el lector encuentra los campos que sí están.
    expect(html).toContain('name="committedHectares"');
    expect(html).not.toContain('name="committedHives"');
    expect(html).not.toContain('name="contractReference"');
  });

  it("rotula la meta como meta de trabajo, no pactada", () => {
    const texto = aTexto(pintar());
    expect(texto).toContain(t("pollinationMetaMinLabel"));
    expect(t("pollinationMetaMinLabel")).toMatch(/meta de trabajo/i);
    expect(texto).toContain(t("pollinationAreaLabel"));
    // En lo que se PINTA, no sólo en el catálogo: la ayuda de la meta sale en el formulario.
    expect(texto).toContain(t("pollinationMetaAyuda"));
    expect(t("pollinationMetaAyuda")).toMatch(/no pactada/);
  });
});
