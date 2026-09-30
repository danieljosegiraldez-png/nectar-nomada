/**
 * `entradaDelLote`: armar la entrada que `veredictoDelLote` consume.
 *
 * **Por qué existe, y por qué es PURA.** El plan del tablero (tarea 1) decía «mover las líneas
 * 312–345 de `app/lots/[id]/page.tsx`» a un cargador `async`. Al ejecutarlo se midió que esas
 * líneas dependen de `measurements`, `fermentationRuns` y `dryingRuns`, que salen del cargador
 * grande de la ficha —el que trae además linaje, tareas y auditoría—. Un tablero que llamara a
 * eso **por lote** pagaría todo aquello por nada.
 *
 * Así que lo que se extrae es la **regla**, no las consultas: la ficha le pasa lo que ya cargó y
 * `datosDelTablero` le pasará lo que consulte estrecho. La garantía que el plan buscaba —que la
 * ficha y el tablero **no puedan discrepar**— la da que las dos llamen a esta función, no que
 * compartan una consulta.
 *
 * **Hermética a propósito:** sin base, así que NO va a `scripts/pruebas-por-compuerta.txt` y la
 * corre `scripts/ci.sh`. El plan la mandaba al grupo `base-sembrada`; con la forma pura sobra.
 */
import { describe, expect, it } from "vitest";
import { entradaDelLote } from "../../lib/beneficio/entradaDelLote";

const HORA = 3_600_000;
const AHORA = new Date("2026-03-10T12:00:00.000Z");
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * HORA);

const INICIO = haceHoras(30);

function medicion(over: Partial<Parameters<typeof entradaDelLote>[0]["mediciones"][number]> = {}) {
  return {
    id: "m1",
    variable: "ph",
    value: 4.6,
    occurredAt: haceHoras(2),
    provenanceClass: "measured_fact",
    correctsId: null,
    instrumentId: null,
    ...over,
  };
}

describe("entradaDelLote", () => {
  it("devuelve null cuando el lote no tiene fase abierta", () => {
    expect(
      entradaDelLote({
        fermentacionAbierta: null,
        secadoAbierto: null,
        ultimoSecadoTerminado: null,
        procesos: [],
        mediciones: [],
        estadosDeInstrumento: new Map(),
        ahora: AHORA,
      }),
    ).toBeNull();
  });

  it("carga la fase abierta, el grado del proceso abierto y las mediciones", () => {
    const entrada = entradaDelLote({
      fermentacionAbierta: { startedAt: INICIO },
      secadoAbierto: null,
      ultimoSecadoTerminado: null,
      procesos: [{ endedAt: null, gradoDeProceso: "lavado" }],
      mediciones: [medicion({ id: "a" }), medicion({ id: "b", variable: "brix", value: 18 })],
      estadosDeInstrumento: new Map([["a", "VERIFICADO" as const]]),
      ahora: AHORA,
    });

    expect(entrada?.fase).toEqual({ tipo: "fermentacion", iniciadaEn: INICIO });
    expect(entrada?.gradoDeProceso).toBe("lavado");
    expect(entrada?.mediciones).toHaveLength(2);
    expect(entrada?.ahora).toBe(AHORA);
  });

  /**
   * La regla que un movimiento mecánico rompe. En reposo NO hay proceso abierto —el secado ya
   * terminó— así que el grado, y con él los umbrales, salen del ÚLTIMO proceso que corrió. Sin
   * esto el lote en reposo cae por `GRADO_SIN_PERFIL` y no enseña ningún día.
   */
  it("en reposo toma el grado del ÚLTIMO proceso, no del abierto", () => {
    const entrada = entradaDelLote({
      fermentacionAbierta: null,
      secadoAbierto: null,
      ultimoSecadoTerminado: { endedAt: haceHoras(10), endedOutcome: "target_reached" },
      procesos: [
        { endedAt: haceHoras(40), gradoDeProceso: "natural" },
        { endedAt: haceHoras(10), gradoDeProceso: "lavado" },
      ],
      mediciones: [],
      estadosDeInstrumento: new Map(),
      ahora: AHORA,
    });

    expect(entrada?.fase?.tipo).toBe("reposo");
    expect(entrada?.gradoDeProceso).toBe("lavado");
  });

  it("el estado del instrumento por medición, y SIN_INSTRUMENTO cuando no hay", () => {
    const entrada = entradaDelLote({
      fermentacionAbierta: { startedAt: INICIO },
      secadoAbierto: null,
      ultimoSecadoTerminado: null,
      procesos: [{ endedAt: null, gradoDeProceso: "lavado" }],
      mediciones: [medicion({ id: "con" }), medicion({ id: "sin" })],
      estadosDeInstrumento: new Map([["con", "REVISION_VENCIDA" as const]]),
      ahora: AHORA,
    });

    const porId = new Map(entrada!.mediciones.map((m, i) => [i === 0 ? "con" : "sin", m]));
    expect(porId.get("con")!.estadoDelInstrumento).toBe("REVISION_VENCIDA");
    expect(porId.get("sin")!.estadoDelInstrumento).toBe("SIN_INSTRUMENTO");
  });

  /**
   * Una corrección supersede a la original, y el puente la excluye del cálculo. Quien marca el
   * conjunto es esta función, con el `correctsId` de las propias mediciones: la ficha lo hacía en
   * su línea 229 y el tablero lo habría tenido que repetir.
   */
  it("marca como corregida la medición a la que otra corrige", () => {
    const entrada = entradaDelLote({
      fermentacionAbierta: { startedAt: INICIO },
      secadoAbierto: null,
      ultimoSecadoTerminado: null,
      procesos: [{ endedAt: null, gradoDeProceso: "lavado" }],
      mediciones: [
        medicion({ id: "vieja" }),
        medicion({ id: "nueva", correctsId: "vieja", value: 4.2 }),
      ],
      estadosDeInstrumento: new Map(),
      ahora: AHORA,
    });

    expect(entrada!.mediciones[0]!.fueCorregida).toBe(true);
    expect(entrada!.mediciones[1]!.fueCorregida).toBe(false);
  });
});
