import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claveDeErrorDeSecado, ERRORES_DE_BANDEJA, numeroOpcionalDeSecado } from "../../app/beneficio/bandejas/errorDeSecado";

const RAIZ = new URL("../..", import.meta.url).pathname;
const mensajes = (idioma: string) => JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).BandejasDelSecado as Record<string, string>;

describe("errores de las bandejas del secado", () => {
  it.each(ERRORES_DE_BANDEJA)("%s tiene traducción en los dos idiomas", (codigo) => {
    const clave = claveDeErrorDeSecado(codigo);
    expect(mensajes("es")[clave]).toBeTruthy();
    expect(mensajes("en")[clave]).toBeTruthy();
  });

  it("un código inesperado usa un mensaje seguro y traducido", () => {
    const clave = claveDeErrorDeSecado("codigo_nuevo_o_corrupto");
    expect(clave).toBe("error_desconocido");
    expect(mensajes("es")[clave]).toBeTruthy();
    expect(mensajes("en")[clave]).toBeTruthy();
  });

  it("acepta cantidad vacía o finita y rechaza texto y valores no finitos", () => {
    expect(numeroOpcionalDeSecado(null)).toBeNull();
    expect(numeroOpcionalDeSecado("  ")).toBeNull();
    expect(numeroOpcionalDeSecado("12.5")).toBe(12.5);
    expect(() => numeroOpcionalDeSecado("abc")).toThrow();
    expect(() => numeroOpcionalDeSecado("Infinity")).toThrow();
  });
});
