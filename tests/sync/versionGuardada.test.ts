import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leerGuardadaEl } from "../../lib/sync/versionGuardada";

/**
 * **Una página guardada se sirve MARCADA como vieja** — R2 del plan farm-to-green (ADR-197),
 * 2026-10-09. Sin red, el service worker enseña la última versión de cada ruta de operador; hasta
 * hoy lo hacía como si fuera la actual. Ahora le añade una marca con la hora en que se guardó, y
 * `AvisoDeVersionGuardada` la lee y lo dice.
 *
 * La función vive en `public/sw.js`, que es un script clásico y no un módulo: se extrae su texto y
 * se evalúa, así que lo que se prueba es exactamente el código que corre en el teléfono.
 */
const SW = readFileSync(join(new URL("../..", import.meta.url).pathname, "public/sw.js"), "utf8");
const fuente = SW.match(/function marcarComoGuardada\([\s\S]*?\n\}\n/)?.[0];
const marcarComoGuardada = (fuente
  ? new Function(`${fuente}\nreturn marcarComoGuardada;`)()
  : null) as ((html: string, guardadaEl: string | null) => string) | null;

const ISO = "2026-10-09T14:32:00.000Z";

describe("marcarComoGuardada (public/sw.js)", () => {
  it("control: la función existe en el service worker", () => {
    expect(marcarComoGuardada, "no encuentro `function marcarComoGuardada` en public/sw.js").not.toBeNull();
  });

  it("añade la marca con la hora justo después de <head>, y deja el resto igual", () => {
    const html = "<!DOCTYPE html><html><head><title>x</title></head><body><p>lote</p></body></html>";
    const marcado = marcarComoGuardada!(html, ISO);
    expect(marcado).toBe(
      `<!DOCTYPE html><html><head><meta name="nn-guardada-el" content="${ISO}"><title>x</title></head><body><p>lote</p></body></html>`,
    );
  });

  it("con atributos en <head> también, y sólo en el primero", () => {
    const marcado = marcarComoGuardada!('<head data-x="1"></head><template><head></head></template>', ISO);
    expect(marcado.match(/nn-guardada-el/g)).toHaveLength(1);
    expect(marcado.startsWith(`<head data-x="1"><meta name="nn-guardada-el"`)).toBe(true);
  });

  it("sin hora conocida, marca igual pero vacía: se sabe que es vieja, no de cuándo", () => {
    expect(marcarComoGuardada!("<head></head>", null)).toBe('<head><meta name="nn-guardada-el" content=""></head>');
  });

  it("un valor que no es una fecha ISO no se escribe en el HTML", () => {
    const hostil = '"><script>alert(1)</script>';
    const marcado = marcarComoGuardada!("<head></head>", hostil);
    expect(marcado).not.toContain("<script>");
    expect(marcado).toBe('<head><meta name="nn-guardada-el" content=""></head>');
  });

  it("sin <head> devuelve el HTML tal cual", () => {
    expect(marcarComoGuardada!("<p>sin cabecera</p>", ISO)).toBe("<p>sin cabecera</p>");
  });
});

describe("leerGuardadaEl", () => {
  it("una fecha ISO válida se lee como fecha", () => {
    expect(leerGuardadaEl(ISO)?.toISOString()).toBe(ISO);
  });

  it("vacío, ausente o basura no es una fecha", () => {
    expect(leerGuardadaEl("")).toBeNull();
    expect(leerGuardadaEl(null)).toBeNull();
    expect(leerGuardadaEl("ayer")).toBeNull();
  });
});
