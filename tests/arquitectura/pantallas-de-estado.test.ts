import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * **Las pantallas de carga y de error existen, y lo que dicen se puede leer** — R1 del plan
 * farm-to-green (ADR-197), decidido por Daniel el 2026-10-08.
 *
 * Hasta entonces el repositorio no tenía NINGÚN `loading.tsx`, `error.tsx` ni `global-error.tsx`:
 * una página del beneficio que fallaba enseñaba la pantalla técnica de Next, sin una frase en
 * español ni una salida. Esto exige los cinco archivos y renderiza la pantalla de error con los
 * textos reales, que es lo que el operario ve.
 *
 * **Lo que NO comprueba:** que Next acepte los archivos. Eso lo dice `npm run build`, que falla si un
 * `error.tsx` no es componente de cliente; aquí sólo se adelanta esa exigencia leyendo la directiva.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;

const ARCHIVOS = {
  errorGlobal: "app/global-error.tsx",
  errorDelBeneficio: "app/beneficio/error.tsx",
  cargaDelBeneficio: "app/beneficio/loading.tsx",
  errorDeLotes: "app/lots/error.tsx",
  cargaDeLotes: "app/lots/loading.tsx",
} as const;

const fuente = (ruta: string) => readFileSync(join(RAIZ, ruta), "utf8");

vi.mock("next-intl", async () => {
  const { IntlMessageFormat } = await import("intl-messageformat");
  const mensajes = (await import("../../messages/es.json")).default.Estados as Record<string, string>;
  return {
    useTranslations: () => (clave: string, valores?: Record<string, unknown>) => {
      const m = mensajes[clave];
      if (m === undefined) throw new Error(`falta la clave «${clave}» en messages/es.json`);
      return String(new IntlMessageFormat(m, "es").format(valores as never));
    },
  };
});

describe("las pantallas de carga y de error", () => {
  it("existen las cinco", () => {
    const faltan = Object.values(ARCHIVOS).filter((ruta) => !existsSync(join(RAIZ, ruta)));
    expect(faltan, `faltan: ${faltan.join(", ")}`).toEqual([]);
  });

  it("las de error son componentes de cliente, como exige Next", () => {
    const sinDirectiva = [ARCHIVOS.errorGlobal, ARCHIVOS.errorDelBeneficio, ARCHIVOS.errorDeLotes].filter(
      (ruta) => !/^\s*["']use client["'];/.test(fuente(ruta)),
    );
    expect(sinDirectiva).toEqual([]);
  });

  it("la global pinta su propio <html>: sustituye al layout, que es el que lo pone", () => {
    expect(fuente(ARCHIVOS.errorGlobal)).toContain("<html");
  });

  it("la de error dice qué pasó en español, deja reintentar y volver al inicio, y da el código", async () => {
    const { PantallaDeError } = await import("../../app/components/PantallaDeError");
    const fallo = Object.assign(new Error("detalle interno que no se enseña"), { digest: "abc123" });
    const html = renderToStaticMarkup(createElement(PantallaDeError, { error: fallo, retry: () => {} }));
    const texto = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

    expect(texto).toContain("Algo falló al abrir esta pantalla.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Reintentar<\/button>/);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>Volver al inicio<\/a>/);
    expect(texto).toContain("abc123");
    // El mensaje interno del error no se enseña: puede llevar detalles del servidor.
    expect(texto).not.toContain("detalle interno");
  });

  it("sin código, no pinta la línea del código", async () => {
    const { PantallaDeError } = await import("../../app/components/PantallaDeError");
    const html = renderToStaticMarkup(createElement(PantallaDeError, { error: new Error("x"), retry: () => {} }));
    expect(html).not.toContain("Código del error");
    // Control: el resto sí sale, o el «no contiene» de arriba no mediría nada.
    expect(html).toContain("Reintentar");
  });
});
