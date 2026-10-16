/**
 * Lo que el cliente encola, el servidor lo acepta — por el camino REAL, no por
 * dos pruebas que se dan la razón cada una a su lado.
 *
 * **El defecto que lo trajo (2026-10-11, visto en el navegador 2 de 2 veces).**
 * Toda revisión hecha desde la ronda de trampas volvía `rejected` con
 * `observed_at_not_a_day`. `construirPayloadDeRevisionDeTrampa` manda
 * `observedAt` como `dia.toISOString()` (`"2026-10-11T00:00:00.000Z"`) y el
 * parseo de A10 sólo acepta `YYYY-MM-DD` exacto. Cada mitad tenía su prueba en
 * verde: `parcelaPayload.test.ts` exigía el instante y `parsearMutaciones.test.ts`
 * exigía rechazarlo. Ninguna pasaba la salida de una por la otra.
 *
 * **Por eso no se escribe aquí ningún payload a mano**: cada caso llama al
 * constructor que usa el formulario, lo envuelve en un borrador como
 * `queueFieldEvent`, lo convierte en mutación con `construirMutacionDesdeBorrador`
 * —lo que hace `syncFieldEvents` antes del `fetch`— y lo serializa a JSON, que es
 * lo que la ruta recibe.
 *
 * Hermético: ninguna de estas funciones toca la base.
 */
import { describe, expect, it } from "vitest";
import {
  construirPayloadDeMuestraDeSuelo,
  construirPayloadDeMuestraFoliar,
  construirPayloadDePerfilDeSuelo,
  construirPayloadDeSiembra,
  construirPayloadDeRevisionDeTrampa,
} from "../../lib/sync/parcelaPayload";
import { construirMutacionDesdeBorrador, type FieldEventDraft } from "../../lib/sync/offlineQueue";
import { KINDS_DE_PARCELA, parsearMutaciones } from "../../lib/sync/parsearMutaciones";

const form = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
};

// Un día que nunca es el de la corrida: si un constructor pusiera «hoy», el
// día que sale del parseo no casaría con éste.
const DIA = "2020-03-01";
const MEDIANOCHE_DEL_DIA = "2020-03-01T00:00:00.000Z";

type KindDeParcela = (typeof KINDS_DE_PARCELA)[number];

/**
 * Un caso por `kind`, en un `Record` total: añadir un sexto tipo a
 * `KINDS_DE_PARCELA` deja de compilar hasta que alguien escriba su ida y
 * vuelta. `campoDeFecha` es el campo que el parseo convierte en `Date`.
 */
const CASOS: Record<KindDeParcela, { payload: () => Record<string, unknown>; campoDeFecha: string }> = {
  soil_sample: {
    payload: () =>
      ({ ...construirPayloadDeMuestraDeSuelo(form({ sampleCode: "S-01", sampledAt: DIA, provenanceClass: "direct_observation" }), "loc1") }),
    campoDeFecha: "sampledAt",
  },
  foliar_sample: {
    payload: () =>
      ({ ...construirPayloadDeMuestraFoliar(form({ sampleCode: "F-01", sampledAt: DIA, provenanceClass: "direct_observation" }), "loc1") }),
    campoDeFecha: "sampledAt",
  },
  soil_profile: {
    payload: () =>
      ({ ...construirPayloadDePerfilDeSuelo(form({ describedAt: DIA, provenanceClass: "direct_observation" }), "loc1") }),
    campoDeFecha: "describedAt",
  },
  planting_cohort: {
    payload: () =>
      ({
        ...construirPayloadDeSiembra(
          form({ plantedAt: DIA, plantedPrecision: "date", provenanceClass: "direct_observation" }),
          "loc1",
        ),
      }),
    campoDeFecha: "plantedAt",
  },
  trap_check: {
    payload: () =>
      ({ ...construirPayloadDeRevisionDeTrampa(form({ observedAt: DIA, brocaLevel: "pocos" }), "specimen1", "loc1", "clave-1") }),
    campoDeFecha: "observedAt",
  },
};

/** Del payload del constructor a lo que `parsearMutaciones` recibe en la ruta. */
function porElCable(payload: Record<string, unknown>): unknown[] {
  const borrador: FieldEventDraft = { id: "borrador-1", payload, createdAt: 0, status: "pending" };
  const cuerpo = JSON.stringify({ deviceId: "aparato-1", mutations: [construirMutacionDesdeBorrador(borrador)] });
  return (JSON.parse(cuerpo) as { mutations: unknown[] }).mutations;
}

describe("ida y vuelta de la cola de parcela: constructor → borrador → JSON → parseo", () => {
  // Control de la lista: si un `kind` faltara aquí, el `it.each` de abajo no lo
  // recorrería y el verde no diría nada de él.
  it("hay un caso por cada kind de KINDS_DE_PARCELA", () => {
    expect(Object.keys(CASOS).sort()).toEqual([...KINDS_DE_PARCELA].sort());
  });

  it.each(Object.keys(CASOS) as KindDeParcela[])(
    "%s: lo que el formulario encola se acepta, con el mismo día",
    (kind) => {
      const { payload, campoDeFecha } = CASOS[kind];
      const parseo = parsearMutaciones(porElCable(payload()));
      expect(parseo.ok).toBe(true);
      if (!parseo.ok) return;
      expect(parseo.rechazos).toEqual([]);
      expect(parseo.mutations).toHaveLength(1);
      const fecha = (parseo.mutations[0] as unknown as Record<string, unknown>)[campoDeFecha];
      expect(fecha).toBeInstanceOf(Date);
      expect((fecha as Date).toISOString()).toBe(MEDIANOCHE_DEL_DIA);
    },
  );

  // Control positivo del caso de la trampa: la MISMA revisión, con el día
  // escrito a mano como `YYYY-MM-DD`, sí pasa. Distingue «el parseo rechaza la
  // forma de la fecha» de «el caso está mal montado» (sin `specimenId`, sin
  // `brocaLevel`, …): si esto cayera, el rojo de arriba no diría nada.
  it("control: la misma revisión con observedAt escrito a mano como YYYY-MM-DD se acepta", () => {
    const parseo = parsearMutaciones(porElCable({ ...CASOS.trap_check.payload(), observedAt: DIA }));
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    expect(parseo.rechazos).toEqual([]);
    expect((parseo.mutations[0] as unknown as { observedAt: Date }).observedAt.toISOString()).toBe(MEDIANOCHE_DEL_DIA);
  });

  // Los borradores encolados ANTES del arreglo siguen en los teléfonos con el
  // instante de medianoche, y `syncFieldEvents` los reenvía en cada
  // sincronización. Decisión de Daniel (2026-10-11): que entren solos, con su
  // día. Si alguien quita la tolerancia del parseo, esto cae.
  it("un borrador de antes del arreglo (observedAt a medianoche UTC) se acepta con su día", () => {
    const parseo = parsearMutaciones(porElCable({ ...CASOS.trap_check.payload(), observedAt: MEDIANOCHE_DEL_DIA }));
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    expect(parseo.rechazos).toEqual([]);
    expect((parseo.mutations[0] as unknown as { observedAt: Date }).observedAt.toISOString()).toBe(MEDIANOCHE_DEL_DIA);
  });
});
