/**
 * La página del proceso de un lote pinta una intervención que no lleva valor de catálogo — Parte 2a, F2-6 de la revisión final del PR-A.
 *
 * Desde la Parte 2a `lot_process_intervention.catalog_value_id` es anulable: el acto es el tipo de paso (`step_type_value_id`) y la base exige UNO de los dos
 * (`lot_process_intervention_catalogo_o_tipo`). La página (`app/lots/[id]/process/page.tsx`) se adaptó —nombra el «cómo» si se declaró y, si no, el acto—, y esa línea no tenía
 * ninguna prueba en el PR-A: nada escribe todavía una intervención sólo con tipo de paso, así que el día que el PR-B lo haga, volver a leer `i.catalogValue.value` sin guarda revienta
 * la pantalla del proceso de todo lote que tenga una. Esta prueba la pinta con las dos formas y con las dos a la vez.
 *
 * Hermética: la página es la función `async` que es, y se renderiza con `renderToReadableStream` y los textos REALES de `messages/es.json`; sólo se simulan los bordes que exigen
 * sesión y base (la sesión, el lote, la cobertura del proceso, los predicados y los formularios, que son componentes de cliente y aquí no se pintan). El patrón de
 * `tests/recetas/paginasDelEditor.test.ts`. Las otras dos mitades —lo que carga la cobertura y lo que cuenta el reporte— se prueban con base, en `bodegaConProceso.test.ts` y
 * `reporteDeProceso.test.ts`.
 */
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aTexto } from "../helpers/htmlDePrueba";

const estado = vi.hoisted(() => ({ cobertura: null as unknown }));

vi.mock("next-intl/server", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { getTranslations: async (espacio: string) => traductorDePrueba(espacio) };
});
vi.mock("next/navigation", () => ({
  redirect: (ruta: string) => {
    throw new Error(`redirect:${ruta}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: async () => ({ userAccountId: "cuenta-de-prueba" }) }));
vi.mock("../../lib/traceability/lots", () => {
  class TraceabilityAccessError extends Error {}
  return { TraceabilityAccessError, getLotSummary: async () => ({ id: "lote-1", lotCode: "LOTE-1" }), puedeGestionarLote: async () => false };
});
vi.mock("../../lib/traceability/lotProcess", () => {
  class LotProcessError extends Error {}
  return {
    LotProcessError,
    coberturaDelLote: async () => estado.cobertura,
    fraseDeNoAbrir: () => "",
    opcionesParaProceso: async () => ({ intervenciones: [], mediciones: [], grados: [], estadosDeCereza: [], motivosDeDevolucion: [] }),
    puedeAbrirProceso: async () => null,
    puedeDevolverASecado: async () => null,
    puedeGestionarProceso: async () => false,
  };
});
vi.mock("../../lib/traceability/processTargets", () => ({ listRecipeVersionsForLot: async () => [] }));
vi.mock("../../lib/traceability/storage", () => ({ getCurrentStorageAssignment: async () => null }));
vi.mock("../../app/components/traceability/ProcesoDelLote", () => {
  const nada = () => null;
  return { AbrirProcesoForm: nada, CambiarIntencionForm: nada, CambiarObjetivoForm: nada, CerrarProcesoForm: nada, DevolverASecadoForm: nada, IntervencionForm: nada };
});

import ProcesoDeLotePage from "../../app/lots/[id]/process/page";

async function pintar(jsx: ReactElement): Promise<string> {
  const flujo = await renderToReadableStream(jsx);
  await flujo.allReady;
  return await new Response(flujo).text();
}

type Intervencion = { id: string; occurredAt: Date; notes: string | null; catalogValue: { value: string } | null; stepTypeValue: { value: string } | null };
const intervencion = (id: string, dia: string, catalogValue: string | null, stepTypeValue: string | null, notes: string | null = null): Intervencion => ({
  id,
  occurredAt: new Date(`2026-03-${dia}T10:00:00Z`),
  notes,
  catalogValue: catalogValue === null ? null : { value: catalogValue },
  stepTypeValue: stepTypeValue === null ? null : { value: stepTypeValue },
});

/** La cobertura de un lote con UN proceso abierto, con esas intervenciones, como la devuelve `coberturaDelLote`. */
function coberturaCon(intervenciones: Intervencion[]) {
  const proceso = {
    oculto: false,
    id: "p1",
    sequenceOrder: 1,
    processRecipeVersion: null,
    lot: { id: "lote-1", lotCode: "LOTE-1" },
    origen: "original",
    endedAt: null,
    targetMoisturePct: { toNumber: () => 11 },
    processGradeValue: { value: "Washed" },
    cherryStateValue: { value: "despulpada" },
    startedAt: new Date("2026-03-02T12:00:00Z"),
    intent: "Probar el lavado",
    humedadDeCierre: null,
    diferenciaContraObjetivo: null,
    interventions: intervenciones,
    fermentationRuns: [],
    dryingRuns: [],
  };
  return { estado: "abierto", composicion: null, vigente: proceso, cadena: [proceso] };
}

const pintarProceso = async (intervenciones: Intervencion[]): Promise<string> => {
  estado.cobertura = coberturaCon(intervenciones);
  return aTexto(await pintar(await ProcesoDeLotePage({ params: Promise.resolve({ id: "lote-1" }) })));
};

beforeEach(() => {
  estado.cobertura = null;
});

describe("la página del proceso nombra cada intervención, lleve o no valor de catálogo (F2-6)", () => {
  it("una intervención que sólo lleva tipo de paso se pinta con el acto, sin reventar; la que lleva valor de catálogo, con su «cómo»", async () => {
    const texto = await pintarProceso([intervencion("i1", "06", null, "washing", "con agua limpia"), intervencion("i2", "07", "anaerobico", null)]);
    expect(texto).toContain("2026-03-06 · washing · con agua limpia");
    expect(texto).toContain("2026-03-07 · anaerobico");
    // Control: el proceso se pintó entero (no es una página en blanco que no contiene nada de lo anterior).
    expect(texto).toContain("Probar el lavado");
    expect(texto, "con intervenciones no sale el aviso de que no hay ninguna").not.toContain("Todavía no se registró ningún manejo.");
  });

  it("si lleva las dos, manda el «cómo» y el acto no se pinta", async () => {
    const texto = await pintarProceso([intervencion("i1", "06", "anaerobico", "washing")]);
    expect(texto).toContain("2026-03-06 · anaerobico");
    expect(texto).not.toContain("washing");
  });

  it("control: sin intervenciones, la página dice que no hay ninguna (la prueba sabe cuándo la lista se pinta y cuándo no)", async () => {
    const texto = await pintarProceso([]);
    expect(texto).toContain("Todavía no se registró ningún manejo.");
  });
});
