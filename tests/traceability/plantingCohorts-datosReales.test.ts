/**
 * La fila real de siembra de antes de las cohortes sigue sin cohorte: nunca se rellenó con una suposición.
 *
 * Vivía al final de `plantingCohorts.test.ts` y era lo único que ataba ese archivo a un backup restaurado.
 * Se separó el 2026-10-12 (ficha 006): allí queda la propiedad del esquema —el campo admite nulo—,
 * probada creando un evento; aquí, el hecho de producción, en el grupo `datos-reales` de
 * `scripts/pruebas-por-compuerta.txt`, junto a `roasting` y `s1`.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";

describe("pre-existing land records stay valid (datos reales)", () => {
  it("the one real PlantingEvent row predates cohorts and keeps a NULL cohort", async () => {
    const orphans = await prisma.plantingEvent.count({ where: { plantingCohortId: null } });
    // Never backfilled with a guess; a NULL here is correct history.
    expect(orphans).toBeGreaterThanOrEqual(1);
  });
});
