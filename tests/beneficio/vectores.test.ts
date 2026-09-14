import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluarPh, type DataConfidence } from "../../lib/beneficio/ph";
import { PERFILES, type ClaveDePerfil } from "../../lib/beneficio/perfiles";
import { evaluarBrix, type SamplePoint } from "../../lib/beneficio/brix";

/**
 * Los 47 criterios de aceptación del módulo de beneficio, ejecutados de verdad.
 *
 * **De dónde salen.** `docs/beneficio/` es la especificación v3.0 que Daniel
 * encargó, y `tests/fixtures/vectores-de-beneficio.json` es su contrato
 * ejecutable: 13 vectores de pH, 12 de Brix, 13 de balance de masas y 9 de
 * secado. **Diez llevan `why: "REGRESION…"`** y describen defectos reales de la
 * versión anterior; existen para impedir que vuelvan.
 *
 * **Por qué este archivo existe antes que los motores.** El paquete manda
 * construir por pasos y no avanzar hasta que el anterior esté verde. Un tablero
 * que empieza vacío y va llenándose es la única forma de que «faltan 47
 * criterios» sea un hecho visible en cada corrida en vez de una promesa.
 *
 * **Y por eso lo que falta sale como `todo`, no como verde ni como rojo.**
 * Verde mentiría. Rojo permanente enseña a ignorar la compuerta, que es lo que
 * `CLAUDE.md` prohíbe: «un guardia que nunca puede pasar es peor que ninguno».
 * `it.todo` sale contado y aparte, que es exactamente lo que es.
 *
 * **El inventario se declara a mano, y esa es la mitad que protege.** Añadir un
 * motor obliga a tocar `MOTORES`, y eso se lee en el diff. Sin esa línea,
 * alguien podría borrar un motor y sus vectores volverían a `todo` en silencio.
 *
 * Hermético: sólo lee un JSON.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const VECTORES = JSON.parse(
  readFileSync(join(RAIZ, "tests/fixtures/vectores-de-beneficio.json"), "utf8"),
) as Record<string, unknown>;

/** Las cuatro familias del contrato, con el módulo que debe contestarlas. */
const FAMILIAS = [
  { clave: "ph", prefijo: "PH", motor: "lib/beneficio/ph.ts" },
  { clave: "brix", prefijo: "BX", motor: "lib/beneficio/brix.ts" },
  { clave: "mass_balance", prefijo: "MB", motor: "lib/beneficio/balanceDeMasas.ts" },
  { clave: "drying", prefijo: "DR", motor: "lib/beneficio/secado.ts" },
] as const;

/**
 * Los motores que YA se pueden ejercer. Se declara a mano, a propósito: es la
 * línea que hay que tocar para decir «esto ya está», y se lee en el diff.
 */
const MOTORES: ReadonlySet<string> = new Set<string>(["lib/beneficio/ph.ts", "lib/beneficio/brix.ts"]);

/**
 * El instante base de los vectores. Cualquiera sirve: los vectores hablan en
 * **horas de desfase** desde el inicio de la fermentación, nunca en fechas.
 * Se fija uno concreto para que una corrida sea reproducible.
 */
const INICIO = new Date("2026-03-14T06:00:00-05:00");
const enHoras = (h: number): Date => new Date(INICIO.getTime() + h * 3_600_000);

/**
 * Cómo se le da un vector a cada motor y qué se compara.
 *
 * **Se compara SÓLO lo que el vector declara en `expect`.** Un vector que no
 * menciona `severity` no opina sobre ella, y exigirla inventaría un criterio que
 * el contrato no puso. `raises: false` se comprueba de la única forma honesta:
 * llamando de verdad y dejando que un lanzamiento tumbe la prueba.
 */
const EJECUTORES: Record<string, (v: Vector) => Record<string, unknown>> = {
  ph: (v) => {
    const lecturas = (v.readings ?? []).map((r) => ({
      ph: r.ph as number,
      measuredAt: enHoras(r.offset_hours as number),
      confidence: (r.confidence as DataConfidence | undefined) ?? "VALIDATED",
    }));
    const r = evaluarPh({
      readings: lecturas,
      fermentationStartedAt: INICIO,
      now: enHoras(v.now_hours ?? 0),
      profile: PERFILES[(v.profile ?? "WASHED_STANDARD") as ClaveDePerfil],
    });
    // Las claves del vector son las del contrato en `snake_case`.
    return {
      status: r.status,
      severity: r.severity,
      alert_key: r.alertKey,
      awaiting_confirmation: r.awaitingConfirmation,
      readings_used: r.readingsUsed,
      dph_dt_recent: r.dphDtRecent,
      current_ph: r.currentPh,
    };
  },

  brix: (v) => {
    const lecturas = (v.readings ?? []).map((r) => ({
      brix: r.brix as number,
      measuredAt: enHoras(r.offset_hours as number),
      confidence: (r.confidence as DataConfidence | undefined) ?? "VALIDATED",
      // El punto puede venir por lectura —para el vector que los MEZCLA— o una
      // vez para toda la serie, que es como se captura de verdad.
      samplePoint: ((r.sample_point as SamplePoint | undefined) ??
        (v.sample_point as SamplePoint | undefined) ??
        "TANK_LIQUID_MID") as SamplePoint,
    }));
    const perfil = PERFILES[(v.profile ?? "WASHED_STANDARD") as ClaveDePerfil];
    const r = evaluarBrix({
      readings: lecturas,
      fermentationStartedAt: INICIO,
      now: enHoras(v.now_hours ?? 0),
      profile: perfil,
    });

    // **«Casi cero» y «saludable» no son números inventados**: salen de los
    // propios parámetros del perfil. Moverse menos que el ruido del
    // refractómetro a lo largo de su ventana de estancamiento ES estar parado.
    const umbral = perfil.brixNoiseFloor / perfil.brixStallWindowHours;
    return {
      status: r.status,
      severity: r.severity,
      alert_key: r.alertKey,
      awaiting_confirmation: r.awaitingConfirmation,
      readings_used: r.readingsUsed,
      initial_brix: r.initialBrix,
      current_brix: r.currentBrix,
      warnings: r.warnings,
      velocity_recent_near_zero: r.velocityRecentBxH !== null && Math.abs(r.velocityRecentBxH) < umbral,
      velocity_cumulative_healthy:
        r.velocityCumulativeBxH !== null && Math.abs(r.velocityCumulativeBxH) >= umbral,
      // El contrato congelado: ninguna clave puede faltar en ninguna rama.
      all_contract_fields_present: (
        [
          "status", "severity", "alertKey", "currentBrix", "initialBrix", "totalDropPct",
          "velocityRecentBxH", "velocityCumulativeBxH", "hoursElapsed", "samplePoint",
          "confidence", "readingsUsed", "awaitingConfirmation", "warnings",
        ] as const
      ).every((k) => k in r),
    };
  },
};

/**
 * `why` es **opcional**: 37 de los 47 lo traen y diez de ésos empiezan por
 * `REGRESION`. Los otros diez llevan la explicación en el propio `id`
 * —`MB-005-gross-imbalance-blocks-transition`— así que no falta nada; lo que
 * falta es no suponer que está.
 */
interface Vector {
  id: string;
  why?: string;
  profile?: string;
  now_hours?: number;
  readings?: Record<string, unknown>[];
  sample_point?: string;
  expect: Record<string, unknown>;
}

/** Qué se enseña de un vector en el tablero: su `why`, o su `id` si no lo trae. */
const rotulo = (v: Vector): string =>
  v.why ? v.why.slice(0, 70) : v.id.split("-").slice(2).join(" ").replace(/-/g, " ");

const vectoresDe = (clave: string): Vector[] => (VECTORES[clave] as Vector[]) ?? [];

describe("los criterios de aceptación del beneficio", () => {
  /**
   * **Control positivo del propio arnés.** Si el JSON se moviera de sitio o
   * cambiara de forma, las listas saldrían vacías y todo lo de abajo pasaría
   * —o quedaría en `todo`— sin haber mirado nada. Se afirma la cuenta y la
   * forma antes que ningún veredicto.
   */
  it("el contrato se lee entero y trae los 47 criterios", () => {
    const total = FAMILIAS.reduce((n, f) => n + vectoresDe(f.clave).length, 0);
    const desglose = FAMILIAS.map((f) => `${f.clave}=${vectoresDe(f.clave).length}`).join(" ");
    expect(total, `vectores leídos: ${desglose}`).toBe(47);

    for (const f of FAMILIAS) {
      const suyos = vectoresDe(f.clave);
      expect(suyos.length, `la familia ${f.clave} salió vacía`).toBeGreaterThan(0);
      for (const v of suyos) {
        expect(v.id, `un vector de ${f.clave} no tiene id`).toMatch(new RegExp(`^${f.prefijo}-\\d+`));
        expect(v.expect, `${v.id} no declara qué espera`).toBeTruthy();
      }
    }
  });

  /**
   * Los diez de regresión son la memoria del paquete: cada uno es un defecto que
   * ya ocurrió. Se cuentan aparte para que borrar uno no pase desapercibido.
   */
  it("los diez criterios de regresión siguen en el contrato", () => {
    const regresiones = FAMILIAS.flatMap((f) => vectoresDe(f.clave))
      .filter((v) => String(v.why ?? "").startsWith("REGRESION"))
      .map((v) => v.id);
    expect(regresiones, `regresiones encontradas: ${regresiones.join(", ")}`).toHaveLength(10);
  });

  /**
   * El inventario no puede mentir en la dirección peligrosa: declarar un motor
   * implementado sin que su archivo exista dejaría sus vectores fuera de `todo`
   * y fuera de las pruebas — desaparecidos, que es peor que rojos.
   */
  it("cada motor declarado como implementado existe en el disco", () => {
    const fantasmas = [...MOTORES].filter((ruta) => {
      try {
        readFileSync(join(RAIZ, ruta), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(fantasmas, `declarados implementados y ausentes: ${fantasmas.join(", ")}`).toEqual([]);
  });

  for (const familia of FAMILIAS) {
    const implementado = MOTORES.has(familia.motor);
    describe(`${familia.clave} · ${familia.motor}${implementado ? "" : " (sin construir)"}`, () => {
      for (const v of vectoresDe(familia.clave)) {
        if (!implementado) {
          it.todo(`${v.id} — ${rotulo(v)}`);
          continue;
        }
        it(`${v.id} — ${rotulo(v)}`, () => {
          const ejecutar = EJECUTORES[familia.clave];
          if (!ejecutar) throw new Error(`${familia.motor} se declara implementado y no tiene ejecutor`);

          // `raises: false` se comprueba llamando: si lanzara, la prueba cae aquí.
          const obtenido = ejecutar(v);

          for (const [campo, esperado] of Object.entries(v.expect)) {
            if (campo === "raises") {
              expect(esperado, `${v.id}: este contrato no admite que el motor lance`).toBe(false);
              continue;
            }
            // «lo que NO debe pasar» es tan contrato como lo que sí.
            if (campo === "status_not") {
              expect(obtenido["status"], `${v.id} · no debía salir ${String(esperado)}`).not.toBe(esperado);
              continue;
            }
            if (campo === "warnings_include") {
              for (const aviso of esperado as string[])
                expect(obtenido["warnings"], `${v.id} · falta el aviso ${aviso}`).toContain(aviso);
              continue;
            }
            // `affects_lot_state` es una propiedad del estado, no un campo del
            // motor: los estados dirigidos al DATO no cambian el del lote.
            if (campo === "affects_lot_state") {
              const soloDato = ["DATA_INTEGRITY_VIOLATION", "SENSOR_FAULT", "MIXED_SAMPLE_POINTS", "SUSPECT_DILUTION"];
              expect(soloDato.includes(String(obtenido["status"])), `${v.id} · ${obtenido["status"]} debería afectar al lote`).toBe(!esperado);
              continue;
            }
            expect(obtenido[campo], `${v.id} · ${campo} — ${v.why ?? v.id}`).toEqual(esperado);
          }
        });
      }
    });
  }
});
