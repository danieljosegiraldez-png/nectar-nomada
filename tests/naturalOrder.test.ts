/**
 * Natural ordering of names containing numbers — ADR-078.
 *
 * `/plots` listed Lote 1, Lote 10, Lote 2, Lote 3 …, because both Postgres
 * `ORDER BY name` and JavaScript's default sort compare codepoint by
 * codepoint: "1" precedes "2" and the comparison stops there.
 */

import { describe, it, expect } from "vitest";
import { compareNames, sortByName } from "../lib/naturalOrder";

describe("compareNames", () => {
  it("orders embedded numbers numerically, not as text", () => {
    // The exact case from /plots.
    expect(compareNames("Lote 2", "Lote 10")).toBeLessThan(0);
    expect(compareNames("Lote 10", "Lote 9")).toBeGreaterThan(0);
  });

  it("still orders plain names alphabetically", () => {
    expect(compareNames("Apiario", "Beneficio")).toBeLessThan(0);
  });

  it("sorts accented names where a Spanish reader expects them, not after Z", () => {
    // Codepoint order puts "Ñ" (U+00D1) after every unaccented capital, so a
    // naive sort exiles Ñ and every accented name to the end of the list.
    expect(compareNames("Ñuble", "Oaxaca")).toBeLessThan(0);
    expect(compareNames("Ángel", "Beto")).toBeLessThan(0);
  });
});

describe("sortByName", () => {
  const plots = [
    { name: "Lote 1" },
    { name: "Lote 10" },
    { name: "Lote 2" },
    { name: "Lote 3" },
    { name: "Beneficio" },
  ];

  it("produces the order a person would scan", () => {
    expect(sortByName(plots, (p) => p.name).map((p) => p.name)).toEqual([
      "Beneficio",
      "Lote 1",
      "Lote 2",
      "Lote 3",
      "Lote 10",
    ]);
  });

  it("does not mutate the caller's array", () => {
    // These lists come straight from Prisma and are often reused by the
    // caller; sorting in place would reorder something else silently.
    const input = [...plots];
    sortByName(input, (p) => p.name);
    expect(input.map((p) => p.name)).toEqual(plots.map((p) => p.name));
  });
});
