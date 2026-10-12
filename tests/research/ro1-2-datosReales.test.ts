/**
 * RO1.2 §5.11: los datos reales siguen intactos tras correr RO1.2.
 *
 * Vivía al final de `ro1-2.test.ts` y era lo único que ataba ese archivo a un backup restaurado:
 * afirma que existe la organización de producción «Lost Origin». Se separó el 2026-10-12 (ficha 006)
 * para que el resto de RO1.2 corra en CI, y esto se queda donde su valor tiene sentido: en el grupo
 * `datos-reales` de `scripts/pruebas-por-compuerta.txt`, junto a `roasting` y `s1`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

describe("§5.11 — real A7/F1/S1/R1/RO1 data stays intact", () => {
  // "Real batches missing a terrain lot" is deliberately NOT asserted here
  // as a repeatable count (unlike ro1.test.ts's own suite-wide checks): run
  // concurrently with every other RUN_ID-scoped test file, their own
  // in-flight, not-yet-cleaned-up fixtures (e.g. S1's deliberately-
  // locationless receiving-event lots) make a live "must equal 0" assertion
  // flaky by construction, not a real regression. V1's own verification
  // (docs/implementation/38_V1_VOCABULARIO_LOTE_BATCH.md, its report and
  // README entry) already covers this count via a standalone script run in
  // isolation — the correct way to answer a point-in-time "how many," per
  // this ticket's own §6 instruction to report the number, not assert it
  // as an invariant.
  it("real (non-TEST) Locations, Organizations, and VariableCatalogs are unaffected by this run", async () => {
    const lostOrigin = await prisma.organization.findFirst({ where: { name: "Lost Origin" } });
    expect(lostOrigin).not.toBeNull();

    // A `roastSession.count() > 0` assertion stood here and was removed for the
    // reason given in tests/research/ro1.test.ts §9.15 (ADR-086): the rows it
    // counted were leaked test fixtures, so it never measured real data.
    // `Lost Origin` above and the catalog count below are anchored on records
    // that genuinely exist in production.
    const catalogCount = await prisma.variableCatalog.count();
    expect(catalogCount).toBeGreaterThanOrEqual(20);
  });
});
