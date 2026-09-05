import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los pares de color que identifican o accionan algo cumplen su umbral WCAG.
 *
 * **Por qué existe.** El 2026-09-05, `--nn-border-strong` valía `#b9ab93` y
 * daba 2.26:1 sobre `--nn-surface`, por debajo del 3:1 que WCAG 1.4.11 exige
 * al borde que identifica un control — mientras el comentario justo encima del
 * token decía que ese borde "must read as an edge outdoors". La intención
 * estaba escrita y el valor no la cumplía, y nada lo medía. Peor: `.nn-field`
 * pintaba el borde con `--nn-border`, el token de DIVISOR, en 50 archivos.
 *
 * **Qué cubre y qué no.** Sólo los pares que WCAG obliga: texto sobre su
 * fondo, borde de control, y fondo de acción con el color de texto que
 * realmente lleva encima. NO cubre `--nn-border`, que es divisor y no
 * identifica ningún control.
 *
 * **Un límite conocido:** lee el CSS, no los valores computados en el
 * navegador, así que no vería un color inyectado en línea o sobrescrito por
 * otra hoja. Eso se comprueba a mano al verificar en el navegador.
 *
 * Hermético: sólo lee un archivo.
 */

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function token(nombre: string): string {
  const m = CSS.match(new RegExp(`--${nombre}:\\s*(#[0-9a-fA-F]{6})`));
  const valor = m?.[1];
  if (!valor) throw new Error(`token --${nombre} no encontrado en globals.css`);
  return valor;
}

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminancia(hex: string): number {
  // Sin `.map()` + desestructuración: con `noUncheckedIndexedAccess` eso da
  // `number | undefined` y `next build` lo rechaza. `npx vitest` no comprueba
  // tipos, así que el fallo sólo aparece en el build.
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const [la, lb] = [luminancia(a), luminancia(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("contraste de los tokens de color", () => {
  it("el borde de un control se distingue de su fondo (1.4.11, 3:1)", () => {
    expect(contraste(token("nn-border-strong"), token("nn-surface"))).toBeGreaterThanOrEqual(3);
    expect(contraste(token("nn-border-strong"), token("nn-bg"))).toBeGreaterThanOrEqual(3);
  });

  it("el texto normal cumple AA (4.5:1)", () => {
    expect(contraste(token("nn-ink"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("nn-ink"), token("nn-surface"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el texto secundario cumple AA (4.5:1)", () => {
    expect(contraste(token("nn-ink-muted"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el enlace de marca cumple AA (4.5:1)", () => {
    expect(contraste(token("nn-brand"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el texto del botón de marca cumple AA sobre su fondo", () => {
    expect(contraste(token("nn-brand-ink"), token("nn-brand"))).toBeGreaterThanOrEqual(4.5);
  });

  it("el error cumple AA sobre las dos superficies", () => {
    expect(contraste(token("nn-error"), token("nn-bg"))).toBeGreaterThanOrEqual(4.5);
    expect(contraste(token("nn-error"), token("nn-surface"))).toBeGreaterThanOrEqual(4.5);
  });
});
