import { describe, expect, it } from "vitest";
import { rutaDeColmena, urlDeColmena, svgDeQr } from "../../lib/apiary/etiquetasQr";

/**
 * A9.7 (D8) — el código que se pega en cien calcomanías.
 *
 * Se prueba a este nivel porque aquí es donde un error es caro y silencioso: un
 * QR que apunta al sitio equivocado se descubre en el campo, con las
 * calcomanías ya puestas.
 */
const APIARIO = "11111111-1111-1111-1111-111111111111";
const COLMENA = "22222222-2222-2222-2222-222222222222";

describe("A9.7 — la etiqueta de una colmena", () => {
  it("apunta a la ruta que existe", () => {
    expect(rutaDeColmena(APIARIO, COLMENA)).toBe(`/apiaries/${APIARIO}/hives/${COLMENA}`);
  });

  it("lleva el UUID, no el identificador legible", () => {
    // `Hive.identifier` es único DENTRO de su apiario: «N-01» existe en Toabré
    // y puede existir en Los Asientos. Si esto llevara el identificador, dos
    // cajas de sitios distintos compartirían código.
    const ruta = rutaDeColmena(APIARIO, COLMENA);
    expect(ruta).toContain(COLMENA);
    expect(ruta).not.toContain("N-01");
  });

  it("la URL no dobla la barra, porque alguien la va a teclear", () => {
    // Cuando la cámara falla —y falla con sol— alguien lee la URL impresa
    // debajo del código y la escribe.
    expect(urlDeColmena("https://app.ejemplo.com/", APIARIO, COLMENA)).toBe(
      `https://app.ejemplo.com/apiaries/${APIARIO}/hives/${COLMENA}`,
    );
    expect(urlDeColmena("https://app.ejemplo.com", APIARIO, COLMENA)).toBe(
      `https://app.ejemplo.com/apiaries/${APIARIO}/hives/${COLMENA}`,
    );
  });

  it("el SVG es autónomo: no pide nada a la red", () => {
    // Una hoja que pidiera una imagen a un servicio externo no se imprimiría
    // sin señal, que es justo donde se imprime.
    const svg = svgDeQr(urlDeColmena("https://app.ejemplo.com", APIARIO, COLMENA));
    expect(svg).toContain("<svg");
    expect(svg).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    expect(svg).not.toContain("<img");
  });

  it("codifica de verdad: una URL más larga produce un código más grande", () => {
    // Control positivo del codificador. Sin esto, un `svgDeQr` que devolviera
    // siempre el mismo dibujo pasaría las pruebas de arriba.
    const corto = svgDeQr("https://a.co/x");
    const largo = svgDeQr(urlDeColmena("https://app.nectarnomada.com", APIARIO, COLMENA));
    const modulosDe = (s: string) => (s.match(/<rect/g) ?? []).length + (s.match(/<path/g) ?? []).length;
    expect(modulosDe(largo)).toBeGreaterThan(0);
    expect(largo.length).toBeGreaterThan(corto.length);
  });
});
