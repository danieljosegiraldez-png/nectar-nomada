import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatearNumero, leerProfundidades, medidaEnUnidad, mensajeDeBandeja } from "../../app/beneficio/bandejas/utilidades";
import { BandejaConfigError, PIE_EN_CM } from "../../lib/equipos/bandejas";
import { PesajeError } from "../../lib/traceability/capacidadDeBandeja";
import { LocationAccessError } from "../../lib/traceability/locations";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { LocalDateTimeError } from "../../lib/time/localDateTime";

/**
 * Hermético: sólo importa módulos puros y lee dos archivos. Nada de esto toca
 * la base ni una sesión (Tarea 5 del plan 2a lo pide explícitamente).
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const mensajes = (idioma: string) => JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).Bandejas as Record<string, string>;
const es = mensajes("es");
const en = mensajes("en");

// Los códigos que de verdad puede lanzar cada clase, por el camino que las
// tres acciones de `app/actions/bandejas.ts` usan de verdad — no cada `throw`
// que la clase tiene en todo el archivo, que incluye caminos ajenos a bandejas.
const CODIGOS_BANDEJA_CONFIG = ["datos_invalidos", "nombre_repetido", "sin_acceso", "tipo_de_otra_organizacion"];
const CODIGOS_PESAJE = ["estado_invalido", "datos_invalidos", "tipo_no_encontrado"];

describe("mensajeDeBandeja: toda clave que devuelve existe en los dos idiomas", () => {
  it("control positivo: hay exactamente 6 claves error_ en Bandejas", () => {
    const claves = Object.keys(es).filter((k) => k.startsWith("error_"));
    expect(claves.length).toBe(6);
    expect(Object.keys(en).filter((k) => k.startsWith("error_")).length).toBe(6);
  });

  for (const codigo of CODIGOS_BANDEJA_CONFIG) {
    it(`BandejaConfigError("${codigo}")`, () => {
      const clave = mensajeDeBandeja(new BandejaConfigError(codigo));
      expect(clave).toBe(codigo);
      expect(es[`error_${clave}`], `falta error_${clave} en es.json`).toBeTruthy();
      expect(en[`error_${clave}`], `falta error_${clave} en en.json`).toBeTruthy();
    });
  }

  for (const codigo of CODIGOS_PESAJE) {
    it(`PesajeError("${codigo}")`, () => {
      const clave = mensajeDeBandeja(new PesajeError(codigo));
      expect(clave).toBe(codigo);
      expect(es[`error_${clave}`], `falta error_${clave} en es.json`).toBeTruthy();
      expect(en[`error_${clave}`], `falta error_${clave} en en.json`).toBeTruthy();
    });
  }

  it("LocationAccessError colapsa a sin_acceso, no suma una séptima clave", () => {
    expect(mensajeDeBandeja(new LocationAccessError("no_beneficio_edit_access"))).toBe("sin_acceso");
    expect(mensajeDeBandeja(new LocationAccessError("location_not_found"))).toBe("sin_acceso");
  });

  it("TraceabilityAccessError colapsa a sin_acceso", () => {
    expect(mensajeDeBandeja(new TraceabilityAccessError("no_lot_access"))).toBe("sin_acceso");
  });

  // Fix round 1 (hallazgo del revisor): registrarPesajeAction llama a
  // parseLocalDateTime dentro de su try, y un tzOffsetMinutes ausente o
  // inválido —JS bloqueado, un POST crudo— lanza LocalDateTimeError. Sin este
  // caso se relanzaba sin traducir y salía como página de error de Next.js en
  // vez de un mensaje, en vez de colapsar a la clave que ya existe para
  // "falta algo o no es válido".
  it("LocalDateTimeError colapsa a datos_invalidos, no suma una séptima clave", () => {
    expect(mensajeDeBandeja(new LocalDateTimeError("timezone_offset_missing"))).toBe("datos_invalidos");
    expect(mensajeDeBandeja(new LocalDateTimeError("datetime_invalid"))).toBe("datos_invalidos");
  });

  it("cualquier otro tipo de error se relanza, no se traduce", () => {
    expect(() => mensajeDeBandeja(new Error("boom"))).toThrow("boom");
  });
});

describe("medidaEnUnidad: cm guardados de vuelta a la unidad tecleada", () => {
  it("un tipo tecleado en pies vuelve a pies, no se queda en cm", () => {
    // 4×2 pies es el tipo del propio guión de verificación en navegador de la
    // Tarea 5: 4 pies = 121.92 cm, 2 pies = 60.96 cm.
    const { ancho, largo, unidad } = medidaEnUnidad(4 * PIE_EN_CM, 2 * PIE_EN_CM, "ft");
    expect(ancho).toBeCloseTo(4, 5);
    expect(largo).toBeCloseTo(2, 5);
    expect(unidad).toBe("ft");
  });

  it("un tipo tecleado en cm se muestra tal cual, sin convertir", () => {
    const { ancho, largo, unidad } = medidaEnUnidad(122, 61, "cm");
    expect(ancho).toBe(122);
    expect(largo).toBe(61);
    expect(unidad).toBe("cm");
  });

  it("control: pies y cm no dan el mismo número para la misma medida guardada", () => {
    const enPies = medidaEnUnidad(PIE_EN_CM, PIE_EN_CM, "ft").ancho;
    const enCm = medidaEnUnidad(PIE_EN_CM, PIE_EN_CM, "cm").ancho;
    expect(enPies).not.toBe(enCm);
  });
});

describe("formatearNumero: separador decimal por idioma (A6)", () => {
  it("área del plan de secado a 3 decimales: coma en es, punto en en", () => {
    // Control contra la fuente independiente: el plan de secado §6 dice
    // «0,743 m²» para la 4×2; 0.74359 redondea a 0,744 con 3 decimales.
    expect(formatearNumero(0.74359, 3, "es")).toBe("0,744");
    expect(formatearNumero(0.74359, 3, "en")).toBe("0.744");
    expect(formatearNumero(0.3721, 3, "es")).toBe("0,372");
  });

  it("mantiene los decimales pedidos aunque el número sea exacto", () => {
    expect(formatearNumero(8, 1, "es")).toBe("8,0");
    expect(formatearNumero(8, 1, "en")).toBe("8.0");
  });

  it("control: el mismo número con otros decimales da otra cadena", () => {
    expect(formatearNumero(403.45, 0, "es")).not.toBe(formatearNumero(403.45, 1, "es"));
  });
});

describe("leerProfundidades: 3 o 4 profundidades del formulario", () => {
  it("lee las tres obligatorias", () => {
    const form = new FormData();
    form.set("profundidad1", "2.5");
    form.set("profundidad2", "2.8");
    form.set("profundidad3", "3.1");
    expect(leerProfundidades(form)).toEqual([2.5, 2.8, 3.1]);
  });

  it("la cuarta es opcional: vacía se OMITE, nunca se manda como cero", () => {
    const form = new FormData();
    form.set("profundidad1", "2.5");
    form.set("profundidad2", "2.8");
    form.set("profundidad3", "3.1");
    form.set("profundidad4", "");
    expect(leerProfundidades(form)).toEqual([2.5, 2.8, 3.1]);
  });

  it("la cuarta presente se incluye", () => {
    const form = new FormData();
    form.set("profundidad1", "2.5");
    form.set("profundidad2", "2.8");
    form.set("profundidad3", "3.1");
    form.set("profundidad4", "2.9");
    expect(leerProfundidades(form)).toEqual([2.5, 2.8, 3.1, 2.9]);
  });
});
