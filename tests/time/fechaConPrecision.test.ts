/**
 * `calcularFechaConPrecision` — la aritmética de año/mes/día compartida entre
 * el camino CON señal (`parsePlantedAt` en `app/actions/traceability.ts`) y
 * el camino SIN señal (`construirFechaDeSiembra` en
 * `lib/sync/parcelaPayload.ts`).
 *
 * ## Por qué este archivo, y qué demuestra cada mitad
 *
 * Ronda de arreglo 1 sobre Task 5: las dos rutas calculaban la MISMA regla de
 * negocio por separado, atadas sólo por un comentario en prosa y sin ninguna
 * prueba que las comparara. Hoy hacían lo mismo; el riesgo era el día que
 * alguien cambiara un lado sin el otro.
 *
 * La primera mitad prueba la aritmética en sí, para los cuatro casos que
 * `construirPayloadDeSiembra` también ejercita en
 * `tests/sync/parcelaPayload.test.ts` (vacío, año, mes, día) — así que una
 * prueba que sólo mirara esta función ya demostraría que el camino SIN señal
 * está cubierto.
 *
 * **Pero no demostraría que el camino CON señal la usa de verdad.**
 * `app/actions/traceability.ts` es `"use server"` y arrastra `next-auth` al
 * importarlo en vitest — comprobado al escribir esta prueba: falla con
 * `Cannot find module '.../node_modules/next/server'`, el mismo problema que
 * documentan las cabeceras de `lib/sync/fieldEventPayload.ts` y
 * `lib/sync/parsearMutaciones.ts` para archivos parecidos. No se puede
 * ejecutar `parsePlantedAt` en esta suite.
 *
 * La segunda mitad cubre eso leyendo la fuente, con el mismo patrón que
 * `tests/arquitectura/campos-con-dos-puertas.test.ts`: comprueba que LOS DOS
 * sitios importan y LLAMAN a `calcularFechaConPrecision`, y que ninguno de
 * los dos reimplementa el recorte por su cuenta (`.slice(0, 4)}-01-01`, la
 * huella de la aritmética duplicada que este arreglo quita). Si alguien
 * vuelve a pegar la aritmética en un lado sin el otro, esta prueba cae.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calcularFechaConPrecision } from "../../lib/time/fechaConPrecision";

describe("calcularFechaConPrecision", () => {
  it("año suelto: 1 de enero de ese año, UTC", () => {
    const { fecha, precision } = calcularFechaConPrecision("2019", "year");
    expect(fecha.toISOString()).toBe("2019-01-01T00:00:00.000Z");
    expect(precision).toBe("year");
  });

  it("mes suelto: día 1 de ese mes, UTC", () => {
    const { fecha, precision } = calcularFechaConPrecision("2019-05", "month");
    expect(fecha.toISOString()).toBe("2019-05-01T00:00:00.000Z");
    expect(precision).toBe("month");
  });

  it("fecha completa: tal cual, a medianoche UTC", () => {
    const { fecha, precision } = calcularFechaConPrecision("2020-03-01", "date");
    expect(fecha.toISOString()).toBe("2020-03-01T00:00:00.000Z");
    expect(precision).toBe("date");
  });

  it("una precisión que no reconoce cae al recorte de fecha completa", () => {
    const { fecha, precision } = calcularFechaConPrecision("2020-03-01", "lo-que-sea");
    expect(fecha.toISOString()).toBe("2020-03-01T00:00:00.000Z");
    expect(precision).toBe("date");
  });

  it("no valida el calendario: a diferencia de fechaDeDia, no es su trabajo aquí", () => {
    // parsePlantedAt nunca validó el 31 de febrero; añadirlo aquí cambiaría
    // el comportamiento del camino CON señal, que esta ronda de arreglo no toca.
    const { fecha } = calcularFechaConPrecision("2026-02-31", "date");
    expect(fecha.getUTCMonth()).toBe(2); // febrero desborda a marzo, como Date ya hacía
  });
});

/**
 * Guardia estructural: los dos sitios que necesitan esta regla la importan
 * de verdad, en vez de reimplementarla.
 */
const RAIZ = join(__dirname, "..", "..");
const leer = (r: string) => readFileSync(join(RAIZ, r), "utf8");

const SERVIDOR = "app/actions/traceability.ts";
const CLIENTE = "lib/sync/parcelaPayload.ts";

describe("los dos caminos de plantedAt comparten la aritmética, no la duplican", () => {
  it("LOS DOS sitios importan calcularFechaConPrecision", () => {
    for (const ruta of [SERVIDOR, CLIENTE]) {
      expect(leer(ruta), `${ruta} no importa calcularFechaConPrecision`).toMatch(
        /import\s*{\s*calcularFechaConPrecision\s*}\s*from\s*["'].*fechaConPrecision["']/,
      );
    }
  });

  it("LOS DOS llaman a calcularFechaConPrecision dentro de su parseo de plantedAt, no reimplementan el recorte", () => {
    for (const ruta of [SERVIDOR, CLIENTE]) {
      const src = leer(ruta);
      const nombreFuncion = ruta === SERVIDOR ? "parsePlantedAt" : "construirFechaDeSiembra";
      const i = src.indexOf(`function ${nombreFuncion}`);
      expect(i, `no encuentro ${nombreFuncion} en ${ruta}`).toBeGreaterThan(-1);
      const cierre = src.indexOf("\n}", i);
      const cuerpo = src.slice(i, cierre);
      expect(cuerpo, `${nombreFuncion} en ${ruta} no llama a calcularFechaConPrecision`).toContain(
        "calcularFechaConPrecision(",
      );
      // La huella de la aritmética vieja, duplicada: si vuelve a aparecer DENTRO
      // de esta función, alguien la reimplementó en vez de compartirla.
      expect(cuerpo, `${nombreFuncion} en ${ruta} reimplementa el recorte de año`).not.toMatch(
        /raw\.slice\(0,\s*4\)/,
      );
    }
  });
});
