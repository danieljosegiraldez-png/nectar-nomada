import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("../../lib/db", () => ({ prisma: { sample: { findMany: mocks.findMany } } }));
import { getSensoryLinkageForSamples } from "../../lib/traceability/lots";

/**
 * ADR-043 — el id del tueste que viaja en el vínculo de cata sólo sale cuando la cata dejó de ser
 * ciega. Es la mitad del vínculo; la otra, el informe, está en `reportRoastPreparations.test.ts`.
 * Hermética: simula la lectura, así que no depende de la base ni del fixture de `lots.test.ts`.
 */
beforeEach(() => { vi.resetAllMocks(); });
const muestra = (status: string, revealedAt: Date | null) => [{
  id: "sample",
  blindMappings: [{ revealedAt, roastSessionId: "roast-1",
    blindSample: { flight: { session: { id: "s1", name: "Cata", status } }, panelResults: [] } }],
}];

it("una cata en curso y sin revelar NO entrega el id del tueste", async () => {
  mocks.findMany.mockResolvedValue(muestra("in_progress", null));
  const [entry] = (await getSensoryLinkageForSamples(["sample"]))["sample"]!;
  expect(entry!.roastSessionId).toBeNull();
  expect(entry!.sessionId).toBe("s1"); // el resto del vínculo no cambia
});

it("el id sale si el mapeo se reveló, aunque la sesión siga abierta", async () => {
  mocks.findMany.mockResolvedValue(muestra("in_progress", new Date()));
  expect((await getSensoryLinkageForSamples(["sample"]))["sample"]![0]!.roastSessionId).toBe("roast-1");
});

it("el id sale si la sesión cerró", async () => {
  mocks.findMany.mockResolvedValue(muestra("completed", null));
  expect((await getSensoryLinkageForSamples(["sample"]))["sample"]![0]!.roastSessionId).toBe("roast-1");
});
