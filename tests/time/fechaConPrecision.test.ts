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

/** El grupo `{…}` que empieza en `abre`, contando llaves. `null` si no cierra. */
function grupoDeLlaves(src: string, abre: number): { fin: number } | null {
  let profundidad = 0;
  for (let j = abre; j < src.length; j++) {
    if (src[j] === "{") profundidad++;
    else if (src[j] === "}") {
      profundidad--;
      if (profundidad === 0) return { fin: j };
    }
  }
  return null;
}

/** El primer carácter que no es espacio a partir de `desde`, o -1. */
function siguienteVisible(src: string, desde: number): number {
  for (let j = desde; j < src.length; j++) {
    if (!/\s/.test(src[j]!)) return j;
  }
  return -1;
}

/**
 * El cuerpo de una función, **contando llaves**, no buscando un `}` a columna
 * cero.
 *
 * **Por qué cambió.** Cortaba con `src.indexOf("\n}", i)`, que es literalmente
 * el defecto que el `CLAUDE.md` de este repositorio documenta —«un guardia que
 * lee la fuente no puede fiarse de la indentación»— y que ya costó marcar como
 * incorrectos tres archivos que estaban bien. Funcionaba **por casualidad**:
 * estas dos funciones no tienen hoy ningún bloque anidado. Un `if` multilínea
 * dentro de cualquiera de las dos habría cortado el cuerpo en su primer `}` a
 * columna cero y el `toContain` de abajo habría fallado sobre código correcto.
 * Precedente que sí cuenta: `textoDeLaLlamada` en
 * `tests/arquitectura/audit-atomico.test.ts`.
 *
 * **Y la trampa que contar llaves NO resuelve sola, encontrada al escribir
 * esto:** la primera `{` tras la firma puede ser la del **tipo de retorno**.
 * `parsePlantedAt` declara `): { plantedAt: Date | null; plantedPrecision:
 * string | null }`, así que quedarse con el primer grupo devolvía la anotación
 * de tipo como si fuera el cuerpo — y el `toContain` fallaba sobre código
 * correcto, igual que antes, por otra razón. Se distingue por lo que viene
 * DESPUÉS: si al grupo le sigue otra `{`, el grupo era el tipo y el cuerpo es
 * el siguiente.
 *
 * Devuelve `null` si las llaves no cierran, para que la prueba anule la corrida
 * en vez de afirmar sobre un trozo.
 */
function cuerpoDeFuncion(src: string, desdeLaFirma: number): string | null {
  let abre = src.indexOf("{", desdeLaFirma);
  while (abre !== -1) {
    const grupo = grupoDeLlaves(src, abre);
    if (!grupo) return null;
    const siguiente = siguienteVisible(src, grupo.fin + 1);
    if (siguiente === -1 || src[siguiente] !== "{") return src.slice(desdeLaFirma, grupo.fin + 1);
    abre = siguiente; // el grupo anterior era el tipo de retorno
  }
  return null;
}

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
      const cuerpo = cuerpoDeFuncion(src, i);
      // Control del ANÁLISIS, no del código: si las llaves no cierran, el
      // recorte no midió nada y la corrida se anula aquí en vez de afirmar
      // sobre un trozo. Sin esta línea, un `null` se leería como cuerpo vacío.
      expect(cuerpo, `no pude delimitar el cuerpo de ${nombreFuncion} en ${ruta}`).not.toBeNull();
      // Segunda mitad del control: que lo recortado sea el CUERPO y no la
      // anotación de tipo de retorno, que también va entre llaves. Un tipo no
      // tiene `return`; el cuerpo de estas dos sí, y termina en su llave.
      expect(cuerpo, `lo recortado de ${nombreFuncion} no parece un cuerpo`).toContain("return");
      expect(cuerpo!.endsWith("}"), `el cuerpo de ${nombreFuncion} no cierra`).toBe(true);
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
