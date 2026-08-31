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
import { computePlotDensity, type PlotDensity } from "../../lib/traceability/plantingCohorts";

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
