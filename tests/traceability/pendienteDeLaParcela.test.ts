/**
 * Hermética. Los casos que tienen que poder fallar: suelo y foliar son
 * independientes; el día exacto del vencimiento frente al anterior; el 29 de
 * febrero; y que las muestras sin resultado no traen plazo.
 */
import { describe, expect, it } from "vitest";
import {
  pendienteDeLaParcela,
  venceElMuestreo,
  enlaceDelAviso,
  enlaceDeRegistrarAplicacion,
  type EntradaDePendiente,
} from "../../lib/traceability/pendienteDeLaParcela";
import type { EstadoDeProduccion } from "../../lib/traceability/estadoDeProduccion";
import type { IntervencionParaAviso } from "../../lib/traceability/pendienteDeLaParcela";

const base = (over: Partial<EntradaDePendiente> = {}): EntradaDePendiente => ({
  hoy: "2026-09-16",
  zona: "UTC",
  areaHectares: 1,
  cohortesActivas: [{ id: "c1", plantCount: 4000 }],
  // Tipo explícito: sin él TypeScript ensancha "en_produccion" a string.
  estados: new Map<string, EstadoDeProduccion>([
    ["c1", { estado: "en_produccion", desde: new Date("2020-01-01T00:00:00Z"), precision: "year", provenanceClass: "original_record", dataQuality: null }],
  ]),
  jornadas: [],
  muestrasDeSuelo: [{ sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 1 }],
  muestrasFoliares: [{ sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 1 }],
  ahora: new Date("2026-09-16T15:00:00Z"),
  intervenciones: [],
  trampas: [],
  regla: null,
  intervencionesDeTrampas: [],
  ...over,
});

const aplic = (
  lineas: IntervencionParaAviso["lineas"],
  occurredAt = new Date("2026-09-16T10:00:00Z"),
  locationId = "L",
): IntervencionParaAviso => ({ id: "i1", kind: "aplicacion", occurredAt, lineas, locationId });

describe("venceElMuestreo", () => {
  it("vence el mismo día y mes del año siguiente", () => {
    expect(venceElMuestreo("2025-09-16")).toBe("2026-09-16");
  });
  it("un muestreo del 29 de febrero vence el 28 de febrero", () => {
    expect(venceElMuestreo("2024-02-29")).toBe("2025-02-28");
  });
});

describe("pendienteDeLaParcela", () => {
  it("un lote en orden no tiene nada pendiente", () => {
    expect(pendienteDeLaParcela(base())).toEqual({ tocaHacer: [], faltaUnDato: [] });
  });

  it("el día anterior al vencimiento no avisa; el día exacto sí", () => {
    const muestra = [{ sampledAt: new Date("2025-09-16T00:00:00Z"), resultados: 1 }];
    const antes = pendienteDeLaParcela(base({ hoy: "2026-09-15", muestrasDeSuelo: muestra }));
    const justo = pendienteDeLaParcela(base({ hoy: "2026-09-16", muestrasDeSuelo: muestra }));
    expect(antes.tocaHacer).toEqual([]);
    expect(justo.tocaHacer).toEqual([{ tipo: "muestreo_vencido", muestra: "suelo", ultimo: "2025-09-16" }]);
  });

  it("suelo vencido y foliar al día: sólo avisa el de suelo", () => {
    const r = pendienteDeLaParcela(base({ muestrasDeSuelo: [{ sampledAt: new Date("2024-01-01T00:00:00Z"), resultados: 1 }] }));
    expect(r.tocaHacer).toEqual([{ tipo: "muestreo_vencido", muestra: "suelo", ultimo: "2024-01-01" }]);
  });

  it("nunca muestreado: avisa con `ultimo` null, uno por tipo", () => {
    const r = pendienteDeLaParcela(base({ muestrasDeSuelo: [], muestrasFoliares: [] }));
    expect(r.tocaHacer).toEqual([
      { tipo: "muestreo_vencido", muestra: "suelo", ultimo: null },
      { tipo: "muestreo_vencido", muestra: "foliar", ultimo: null },
    ]);
  });

  it("usa la muestra MÁS RECIENTE aunque no venga primera", () => {
    const r = pendienteDeLaParcela(
      base({
        muestrasDeSuelo: [
          { sampledAt: new Date("2020-01-01T00:00:00Z"), resultados: 1 },
          { sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 1 },
        ],
      }),
    );
    expect(r.tocaHacer).toEqual([]);
  });

  it("muestras sin resultado: un aviso con el recuento de cada tipo, sin plazo", () => {
    const r = pendienteDeLaParcela(
      base({
        muestrasDeSuelo: [{ sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 0 }],
        muestrasFoliares: [
          { sampledAt: new Date("2026-03-01T00:00:00Z"), resultados: 0 },
          { sampledAt: new Date("2026-02-01T00:00:00Z"), resultados: 0 },
        ],
      }),
    );
    expect(r.tocaHacer).toEqual([{ tipo: "muestras_sin_resultado", suelo: 1, foliar: 2 }]);
  });

  it("una jornada sin cerrar avisa; una cerrada no", () => {
    const r = pendienteDeLaParcela(
      base({
        jornadas: [
          { id: "j1", startedAt: new Date("2026-09-10T12:00:00Z"), endedAt: null },
          { id: "j2", startedAt: new Date("2026-09-01T12:00:00Z"), endedAt: new Date("2026-09-01T15:00:00Z") },
        ],
      }),
    );
    expect(r.tocaHacer).toEqual([{ tipo: "jornada_sin_cerrar", fieldSessionId: "j1", startedAt: new Date("2026-09-10T12:00:00Z") }]);
  });

  // Revisión final, I2: esta prueba construía `density: sin_area` junto a una
  // siembra sin conteo, combinación que `computePlotDensity` nunca produce
  // (devuelve `conteo_incompleto` antes de mirar el área). El aviso sale ahora
  // del área de la ubicación, y el caso es el que sí ocurre: sin área Y con una
  // siembra sin conteo. Tienen que salir los dos avisos.
  it("falta un dato: sin área, área no válida, siembras sin conteo y sin marcar", () => {
    const r = pendienteDeLaParcela(
      base({
        areaHectares: null,
        cohortesActivas: [
          { id: "c1", plantCount: null },
          { id: "c2", plantCount: 300 },
        ],
        estados: new Map<string, EstadoDeProduccion>([
          ["c1", { estado: "sin_marcar" }],
          ["c2", { estado: "sin_marcar" }],
        ]),
      }),
    );
    expect(r.faltaUnDato).toEqual([
      { tipo: "sin_area" },
      { tipo: "siembras_sin_conteo", n: 1 },
      { tipo: "siembras_sin_marcar", n: 2 },
    ]);
    expect(pendienteDeLaParcela(base({ areaHectares: 0 })).faltaUnDato).toEqual([{ tipo: "area_no_valida" }]);
    expect(pendienteDeLaParcela(base({ areaHectares: -2 })).faltaUnDato).toEqual([{ tipo: "area_no_valida" }]);
    expect(pendienteDeLaParcela(base({ areaHectares: Number.NaN })).faltaUnDato).toEqual([{ tipo: "area_no_valida" }]);
  });

  it("reentrada y carencia vigentes: dos avisos en «toca hacer»", () => {
    const r = pendienteDeLaParcela(base({ intervenciones: [aplic([{ withdrawalDays: 7, reentryHours: 12 }])] }));
    expect(r.tocaHacer).toEqual([
      { tipo: "reentrada_vigente", interventionId: "i1", locationId: "L", hasta: new Date("2026-09-16T22:00:00Z") },
      { tipo: "carencia_vigente", interventionId: "i1", locationId: "L", hasta: new Date("2026-09-23T10:00:00Z"), dias: 7 },
    ]);
  });
  it("no declaradas: van a «falta un dato», NUNCA desaparecen", () => {
    const r = pendienteDeLaParcela(base({ ahora: new Date("2030-01-01T00:00:00Z"), intervenciones: [aplic([{ withdrawalDays: null, reentryHours: null }])] }));
    expect(r.faltaUnDato).toEqual(expect.arrayContaining([
      { tipo: "carencia_no_declarada", interventionId: "i1", locationId: "L", alMenosHasta: null },
      { tipo: "reentrada_no_declarada", interventionId: "i1", locationId: "L", alMenosHasta: null },
    ]));
  });
  it("cumplidas: nada", () => {
    const r = pendienteDeLaParcela(base({ ahora: new Date("2026-10-30T00:00:00Z"), intervenciones: [aplic([{ withdrawalDays: 7, reentryHours: 12 }])] }));
    expect(r.tocaHacer).toEqual([]);
  });
  it("manejo cultural: nada", () => {
    const r = pendienteDeLaParcela(base({ intervenciones: [{ id: "c", kind: "manejo_cultural", occurredAt: new Date("2026-09-16T10:00:00Z"), lineas: [], locationId: "L" }] }));
    expect(r).toEqual({ tocaHacer: [], faltaUnDato: [] });
  });

  // Ronda final, hallazgo 6: una intervención heredada de la parcela MADRE
  // lleva su PROPIO locationId, distinto del de la parcela que pide el
  // tablero — así es como llega desde `intervencionesVigentes`, que reúne las
  // de `ubicacionesEmparentadas`.
  it("una intervención heredada lleva su propio locationId, no el de la parcela que avisa", () => {
    const r = pendienteDeLaParcela(base({ intervenciones: [aplic([{ withdrawalDays: 7, reentryHours: 12 }], undefined, "MADRE")] }));
    expect(r.tocaHacer).toEqual([
      { tipo: "reentrada_vigente", interventionId: "i1", locationId: "MADRE", hasta: new Date("2026-09-16T22:00:00Z") },
      { tipo: "carencia_vigente", interventionId: "i1", locationId: "MADRE", hasta: new Date("2026-09-23T10:00:00Z"), dias: 7 },
    ]);
  });
});

describe("enlaceDelAviso", () => {
  it("cada aviso lleva al sitio donde se arregla", () => {
    expect(enlaceDelAviso({ tipo: "jornada_sin_cerrar", fieldSessionId: "j1", startedAt: new Date() }, "L")).toBe("/field-sessions/j1");
    expect(enlaceDelAviso({ tipo: "muestreo_vencido", muestra: "foliar", ultimo: null }, "L")).toBe("/plots/L#muestras");
    expect(enlaceDelAviso({ tipo: "muestras_sin_resultado", suelo: 1, foliar: 0 }, "L")).toBe("/plots/L#muestras");
    expect(enlaceDelAviso({ tipo: "sin_area" }, "L")).toBe("/plots/L/ajustes#areaHectares");
    expect(enlaceDelAviso({ tipo: "area_no_valida" }, "L")).toBe("/plots/L/ajustes#areaHectares");
    expect(enlaceDelAviso({ tipo: "siembras_sin_conteo", n: 1 }, "L")).toBe("/plots/L/ajustes#siembras");
    expect(enlaceDelAviso({ tipo: "siembras_sin_marcar", n: 1 }, "L")).toBe("/plots/L/ajustes#siembras");
    expect(
      enlaceDelAviso({ tipo: "reentrada_vigente", interventionId: "i1", locationId: "L", hasta: new Date() }, "L"),
    ).toBe("/plots/L/manejo/i1");
  });

  // Ronda final, hallazgo 6: el enlace usa la ubicación DE LA INTERVENCIÓN,
  // no el segundo argumento — que aquí es a propósito la parcela HIJA que
  // está mostrando el aviso, para demostrar que no se cuela por ahí.
  it("una intervención heredada enlaza a SU PROPIA parcela, no a la que muestra el aviso", () => {
    expect(
      enlaceDelAviso({ tipo: "carencia_vigente", interventionId: "i1", locationId: "MADRE", hasta: new Date(), dias: 3 }, "HIJA"),
    ).toBe("/plots/MADRE/manejo/i1");
    expect(
      enlaceDelAviso({ tipo: "reentrada_no_declarada", interventionId: "i1", locationId: "MADRE", alMenosHasta: null }, "HIJA"),
    ).toBe("/plots/MADRE/manejo/i1");
    expect(
      enlaceDelAviso({ tipo: "carencia_no_declarada", interventionId: "i1", locationId: "MADRE", alMenosHasta: null }, "HIJA"),
    ).toBe("/plots/MADRE/manejo/i1");
  });

  // Tarea 8 de trampas: los avisos de `avisosDeTrampas` entran en «toca hacer»
  // y enlazan a la sección de trampas del tablero.
  it("los avisos de trampas entran en «toca hacer» y enlazan a #trampas", () => {
    const r = pendienteDeLaParcela(
      base({
        hoy: "2026-09-17",
        trampas: [
          {
            id: "t1",
            trapNumber: 7,
            bloque: null,
            plotBlockId: null,
            status: "active",
            instaladaEl: "2026-08-01",
            ultimaRevision: { id: "o1", dia: "2026-09-01", observedAt: new Date("2026-09-01T00:00:00Z"), brocaLevel: "muchos" },
          },
        ],
        regla: { triggerLevel: "algunos", normalDays: 14, alertDays: 7, suggestedAction: "aplicar Bralic", suggestedMaterial: null },
      }),
    );
    expect(r.tocaHacer).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 9 },
      {
        tipo: "trampa_con_lectura_alta",
        specimenId: "t1",
        trapNumber: 7,
        lectura: "muchos",
        accion: "aplicar Bralic",
        observationId: "o1",
        plotBlockId: null,
        materialId: null,
        materialName: null,
      },
    ]);
    for (const aviso of r.tocaHacer) expect(enlaceDelAviso(aviso, "L")).toBe("/plots/L#trampas");
  });

  // Tarea 4: `intervencionesDeTrampas` llega hasta `avisosDeTrampas` — una
  // intervención posterior sobre la parcela entera apaga la lectura alta pero
  // no el aviso de revisión vencida (spec §4.2: atendido no es resuelto).
  it("una intervención posterior sobre la parcela entera atiende la lectura alta, no la revisión vencida", () => {
    const r = pendienteDeLaParcela(
      base({
        hoy: "2026-09-17",
        trampas: [
          {
            id: "t1",
            trapNumber: 7,
            bloque: null,
            plotBlockId: null,
            status: "active",
            instaladaEl: "2026-08-01",
            ultimaRevision: { id: "o1", dia: "2026-09-01", observedAt: new Date("2026-09-01T00:00:00Z"), brocaLevel: "muchos" },
          },
        ],
        regla: { triggerLevel: "algunos", normalDays: 14, alertDays: 7, suggestedAction: "aplicar Bralic", suggestedMaterial: null },
        intervencionesDeTrampas: [{ occurredAt: new Date("2026-09-02T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] }],
      }),
    );
    expect(r.tocaHacer).toEqual([{ tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 9 }]);
  });
});

// PR B tarea 5, decisión del controlador #4: el botón «Registrar aplicación»
// de un aviso de lectura alta, distinto de `enlaceDelAviso` (que sigue yendo
// a `#trampas`).
describe("enlaceDeRegistrarAplicacion", () => {
  const avisoBase = {
    tipo: "trampa_con_lectura_alta" as const,
    specimenId: "t1",
    trapNumber: 7,
    lectura: "muchos",
    accion: "aplicar Bralic",
    observationId: "o1",
  };

  // Control positivo: sin bloque ni material, sólo `motivo` — nunca un
  // parámetro vacío por un valor nulo.
  it("sin bloque ni material: sólo motivo", () => {
    expect(
      enlaceDeRegistrarAplicacion({ ...avisoBase, plotBlockId: null, materialId: null, materialName: null }, "L"),
    ).toBe("/plots/L/manejo/nuevo?motivo=o1");
  });

  it("con bloque y material: los tres parámetros", () => {
    expect(
      enlaceDeRegistrarAplicacion(
        { ...avisoBase, plotBlockId: "b1", materialId: "m1", materialName: "Bralic" },
        "L",
      ),
    ).toBe("/plots/L/manejo/nuevo?motivo=o1&bloque=b1&material=m1");
  });

  it("con bloque pero sin material: bloque sí, material no", () => {
    expect(
      enlaceDeRegistrarAplicacion({ ...avisoBase, plotBlockId: "b1", materialId: null, materialName: null }, "L"),
    ).toBe("/plots/L/manejo/nuevo?motivo=o1&bloque=b1");
  });
});
