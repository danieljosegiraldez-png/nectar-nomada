/**
 * El guardia del ritmo. Llama a la función con la entrada hostil directamente:
 * montar un batch entero para probar aritmética de horas sería un corpus que no
 * ejercita los casos que importan.
 */
import { describe, it, expect } from "vitest";
import { estadoDeRitmo, puntajeDeUrgencia, RitmoError } from "../../lib/traceability/ritmo";

const T = (iso: string) => new Date(iso);
const AHORA = T("2026-09-13T18:00:00Z");

describe("estadoDeRitmo — la demora", () => {
  it("va tarde cuando lleva más horas de las que la receta dice", () => {
    const e = estadoDeRitmo({ ahora: AHORA, faseIniciada: T("2026-09-13T04:00:00Z"), expectedHours: 12, metas: [] });
    expect(e.horasEnFase).toBe(14);
    expect(e.demora).toBe(true);
    expect(e.horasDeMas).toBe(2);
  });

  /** Control positivo: si `demora` fuera siempre true, la prueba de arriba no
   *  demostraría nada. En hora TIENE que salir distinta. */
  it("va en hora cuando no ha llegado a lo esperado", () => {
    const e = estadoDeRitmo({ ahora: AHORA, faseIniciada: T("2026-09-13T10:00:00Z"), expectedHours: 12, metas: [] });
    expect(e.demora).toBe(false);
    expect(e.horasDeMas).toBe(0);
  });

  /** El caso que da nombre al diseño: «no se sabe» NO es «va bien». */
  it("sin receta que lo declare, la demora es null y no false", () => {
    const e = estadoDeRitmo({ ahora: AHORA, faseIniciada: T("2026-09-11T00:00:00Z"), expectedHours: null, metas: [] });
    expect(e.demora).toBeNull();
    expect(e.horasDeMas).toBeNull();
    expect(e.horasEnFase).toBe(66);
  });

  it("media hora tarde sigue siendo tarde: no se redondea a favor", () => {
    const e = estadoDeRitmo({ ahora: AHORA, faseIniciada: T("2026-09-13T05:30:00Z"), expectedHours: 12, metas: [] });
    expect(e.horasEnFase).toBe(12.5);
    expect(e.demora).toBe(true);
  });
});

describe("estadoDeRitmo — las lecturas debidas", () => {
  it("sin ninguna lectura, el reloj corre desde que empezó la fase", () => {
    const e = estadoDeRitmo({
      ahora: AHORA,
      faseIniciada: T("2026-09-13T04:00:00Z"),
      expectedHours: null,
      metas: [{ variable: "ph", everyHours: 6, ultimaLectura: null }],
    });
    expect(e.debidas).toHaveLength(1);
    expect(e.debidas[0]).toMatchObject({ variable: "ph", cada: 6, debidas: 2 });
  });

  it("con lectura reciente no debe nada", () => {
    const e = estadoDeRitmo({
      ahora: AHORA,
      faseIniciada: T("2026-09-13T04:00:00Z"),
      expectedHours: null,
      metas: [{ variable: "ph", everyHours: 6, ultimaLectura: T("2026-09-13T15:00:00Z") }],
    });
    expect(e.debidas).toEqual([]);
  });

  it("una meta sin ritmo declarado no debe nada, por vieja que sea", () => {
    const e = estadoDeRitmo({
      ahora: AHORA,
      faseIniciada: T("2026-09-01T00:00:00Z"),
      expectedHours: null,
      metas: [{ variable: "brix", everyHours: null, ultimaLectura: null }],
    });
    expect(e.debidas).toEqual([]);
  });

  it("ordena peor primero, para que la pantalla no tenga que decidir", () => {
    const e = estadoDeRitmo({
      ahora: AHORA,
      faseIniciada: T("2026-09-13T00:00:00Z"),
      expectedHours: null,
      metas: [
        { variable: "ph", everyHours: 6, ultimaLectura: T("2026-09-13T12:00:00Z") },   // 1 debida
        { variable: "brix", everyHours: 2, ultimaLectura: T("2026-09-13T06:00:00Z") }, // 6 debidas
      ],
    });
    expect(e.debidas.map((d) => d.variable)).toEqual(["brix", "ph"]);
  });
});

describe("estadoDeRitmo — entrada hostil", () => {
  it("una fase que empieza en el futuro se rechaza, no se ordena", () => {
    // Devolver horas negativas la colaría en la lista como «lo más reciente».
    expect(() =>
      estadoDeRitmo({ ahora: AHORA, faseIniciada: T("2026-09-14T00:00:00Z"), expectedHours: 12, metas: [] }),
    ).toThrow(RitmoError);
  });

  it("una lectura en el futuro también", () => {
    expect(() =>
      estadoDeRitmo({
        ahora: AHORA,
        faseIniciada: T("2026-09-13T00:00:00Z"),
        expectedHours: null,
        metas: [{ variable: "ph", everyHours: 6, ultimaLectura: T("2026-09-14T00:00:00Z") }],
      }),
    ).toThrow(RitmoError);
  });
});

describe("puntajeDeUrgencia", () => {
  it("las lecturas debidas pesan más que la demora: son accionables ahora", () => {
    const conLectura = estadoDeRitmo({
      ahora: AHORA, faseIniciada: T("2026-09-13T12:00:00Z"), expectedHours: null,
      metas: [{ variable: "ph", everyHours: 2, ultimaLectura: null }],
    });
    const soloTarde = estadoDeRitmo({
      ahora: AHORA, faseIniciada: T("2026-09-13T13:00:00Z"), expectedHours: 1, metas: [],
    });
    expect(puntajeDeUrgencia(conLectura)).toBeGreaterThan(puntajeDeUrgencia(soloTarde));
  });

  it("sin ritmo declarado puntúa 0: no se le inventa urgencia", () => {
    const e = estadoDeRitmo({ ahora: AHORA, faseIniciada: T("2026-09-01T00:00:00Z"), expectedHours: null, metas: [] });
    expect(puntajeDeUrgencia(e)).toBe(0);
  });
});
