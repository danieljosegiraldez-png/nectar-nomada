/**
 * `computePlotDensity` — pure, no database. Lives in CI's hermetic set
 * (`scripts/ci.sh`) rather than the full suite, so the arithmetic that the plot
 * page shows to an operator is checked on every PR instead of only where a
 * restored local database exists.
 *
 * The cases that matter are the ones that must NOT return a number: a block
 * with an uncounted cohort, and a block with no area. Both are the state Finca
 * Rosina is actually in today, and both would silently understate density if
 * a missing count were summed as zero.
 */
import { describe, expect, it } from "vitest";
import {
  computePlotDensity,
  computePlotYield,
  type PlotDensity,
  type PlotYield,
} from "../../lib/traceability/plantingCohorts";

const activa = (plantCount: number | null) => ({ plantCount, status: "active" as const });

describe("computePlotDensity", () => {
  it("divides plants by hectares when both are known", () => {
    const r = computePlotDensity([activa(833)], 2);
    expect(r).toEqual<PlotDensity>({
      status: "ok",
      totalPlants: 833,
      hectares: 2,
      plantsPerHectare: 416.5,
    });
  });

  it("adds up every active cohort in the block", () => {
    const r = computePlotDensity([activa(200), activa(300)], 1);
    expect(r).toMatchObject({ status: "ok", totalPlants: 500, plantsPerHectare: 500 });
  });

  it("refuses to divide when a cohort has no count, instead of treating it as zero", () => {
    // ADR-080's distinction: summing the null as 0 would report 200/ha for a
    // block that may hold twice that, and the page would show a number that
    // looks measured.
    const r = computePlotDensity([activa(200), activa(null)], 1);
    expect(r).toEqual<PlotDensity>({
      status: "conteo_incompleto",
      cohortesSinConteo: 1,
      cohortesTotales: 2,
    });
  });

  it("reports the missing area rather than collapsing it into no-data", () => {
    // Every block at Finca Rosina is in this state today.
    expect(computePlotDensity([activa(833)], null)).toEqual<PlotDensity>({ status: "sin_area" });
  });

  it("treats a zero or negative area as a bad record, not an infinite density", () => {
    expect(computePlotDensity([activa(833)], 0)).toEqual<PlotDensity>({
      status: "area_no_positiva",
      hectares: 0,
    });
    expect(computePlotDensity([activa(833)], -1)).toMatchObject({ status: "area_no_positiva" });
  });

  it("says a block is empty rather than dividing zero plants by its area", () => {
    expect(computePlotDensity([], 2)).toEqual<PlotDensity>({ status: "sin_cohortes" });
  });

  it("ignores cohorts that are no longer standing", () => {
    // A renovated block's trees are not in the field; counting them would
    // overstate what is planted.
    const r = computePlotDensity(
      [activa(400), { plantCount: 1000, status: "removed" as const }],
      1,
    );
    expect(r).toMatchObject({ status: "ok", totalPlants: 400 });
  });

  it("reports no cohorts when every cohort in the block was removed", () => {
    const r = computePlotDensity([{ plantCount: 1000, status: "removed" as const }], 1);
    expect(r).toEqual<PlotDensity>({ status: "sin_cohortes" });
  });

  it("checks the count before the area, so the more specific reason wins", () => {
    // A block missing both is missing its counts first: supplying the area
    // alone would still not produce a density, and saying "falta el área"
    // would send someone to measure the wrong thing.
    const r = computePlotDensity([activa(null)], null);
    expect(r).toMatchObject({ status: "conteo_incompleto" });
  });

  it("accepts the Decimal shape Prisma returns for area_hectares", () => {
    // Location.areaHectares is Decimal(10,4); the page passes it through
    // untouched, so a string-backed Decimal must divide correctly.
    const decimalLike = { toString: () => "2.5000", valueOf: () => 2.5 } as unknown as number;
    expect(computePlotDensity([activa(1000)], decimalLike)).toMatchObject({
      status: "ok",
      plantsPerHectare: 400,
    });
  });
});

const aporte = (iso: string, kg: number | null) => ({ harvestedAt: new Date(iso), cherryWeightKg: kg });

/** El año que se espera, o un fallo que dice qué faltaba. */
const anio = (r: PlotYield, i = 0) => {
  if (r.status !== "ok") throw new Error(`esperaba ok, llegó ${r.status}`);
  const y = r.years[i];
  if (!y) throw new Error(`esperaba un año en la posición ${i}, hay ${r.years.length}`);
  return y;
};

describe("computePlotYield", () => {
  it("divide los kilos del año entre las hectáreas", () => {
    const r = computePlotYield([aporte("2026-03-15T00:00:00Z", 500)], 2);
    expect(r).toEqual<PlotYield>({
      status: "ok",
      hectares: 2,
      years: [{ year: 2026, weighedKg: 500, unweighedContributions: 0, kgPerHectare: 250 }],
    });
  });

  it("separa por año calendario, más nuevo primero", () => {
    const r = computePlotYield(
      [aporte("2025-02-01T00:00:00Z", 100), aporte("2026-02-01T00:00:00Z", 300)],
      1,
    );
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.years.map((y) => y.year)).toEqual([2026, 2025]);
    expect(anio(r).kgPerHectare).toBe(300);
    expect(anio(r, 1).kgPerHectare).toBe(100);
  });

  it("un aporte sin pesar NO cuenta como cero, y se reporta aparte", () => {
    // El caso normal en un beneficio: nadie pesa cada bloque antes de volcarlo
    // en la misma tolva. Sumarlo como 0 subestimaría el rendimiento y lo haría
    // parecer medido.
    const r = computePlotYield(
      [aporte("2026-03-01T00:00:00Z", 200), aporte("2026-03-02T00:00:00Z", null)],
      1,
    );
        expect(anio(r).weighedKg).toBe(200);
    expect(anio(r).unweighedContributions).toBe(1);
  });

  it("sin área da el peso del año pero no el rendimiento", () => {
    // El estado de los ocho lotes hoy. El año no se descarta: el peso vale.
    const r = computePlotYield([aporte("2026-03-01T00:00:00Z", 400)], null);
    if (r.status !== "ok") throw new Error("esperaba ok");
    expect(r.hectares).toBeNull();
    expect(anio(r).weighedKg).toBe(400);
    expect(anio(r).kgPerHectare).toBeNull();
  });

  it("un área cero o negativa no produce un rendimiento infinito", () => {
    const cero = computePlotYield([aporte("2026-03-01T00:00:00Z", 400)], 0);
    if (cero.status !== "ok") throw new Error("esperaba ok");
    expect(cero.hectares).toBeNull();
    expect(anio(cero).kgPerHectare).toBeNull();
  });

  it("sin ningún aporte dice que no hay cosechas, no que el rendimiento sea cero", () => {
    expect(computePlotYield([], 2)).toEqual<PlotYield>({ status: "sin_cosechas" });
  });

  it("un año entero sin pesar da 0 kg pesados y lo dice, en vez de fingir un rendimiento", () => {
    const r = computePlotYield([aporte("2026-03-01T00:00:00Z", null)], 2);
        expect(anio(r).weighedKg).toBe(0);
    expect(anio(r).unweighedContributions).toBe(1);
    // El 0/ha es aritméticamente cierto y engañoso por sí solo; el conteo de
    // aportes sin pesar al lado es lo que impide leerlo como una medición.
    expect(anio(r).kgPerHectare).toBe(0);
  });

  it("acepta el Decimal que devuelve Prisma para el peso y el área", () => {
    const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n }) as unknown as number;
    const r = computePlotYield([aporte("2026-03-01T00:00:00Z", dec(27.2))], dec(0.5));
        expect(anio(r).weighedKg).toBe(27.2);
    expect(anio(r).kgPerHectare).toBe(54.4);
  });
});
