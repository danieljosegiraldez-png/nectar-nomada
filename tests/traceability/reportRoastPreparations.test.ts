import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mappings: vi.fn(), roast: vi.fn() }));
vi.mock("../../lib/db", () => ({ prisma: { sensoryBlindMapping: { findMany: mocks.mappings } } }));
vi.mock("../../lib/traceability/roasting", () => ({ getRoastSessionDetail: mocks.roast }));
vi.mock("../../lib/traceability/lots", () => ({ TraceabilityAccessError: class extends Error {} }));
import { getReportRoastPreparations } from "../../lib/traceability/reports";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
beforeEach(() => { vi.resetAllMocks(); });
it("no consulta preparaciones cuando el informe no tiene muestras", async () => {
  expect(await getReportRoastPreparations("operator", [])).toEqual([]);
  expect(mocks.mappings).not.toHaveBeenCalled();
});
it("conserva dos preparaciones distintas en la misma sesión sin exponer códigos ciegos", async () => {
  mocks.mappings.mockResolvedValue(["roast-a", "roast-b"].map((id) => ({ sampleId: "sample", roastSessionId: id, blindSample: { flight: { sessionId: "session" } } })));
  mocks.roast.mockImplementation(async (_user, id) => ({ id, startedAt: new Date("2026-10-07T12:00Z"), endedAt: null, roastLevel: "claro", chargeWeightKg: { toString: () => "0.100" }, dischargeWeightKg: null, notes: "private", roaster: { name: "private" } }));
  const result = await getReportRoastPreparations("operator", ["sample"]);
  expect(mocks.mappings).toHaveBeenCalledWith(expect.objectContaining({ where: { sampleId: { in: ["sample"] }, roastSessionId: { not: null } } }));
  expect(result.map((row) => row.roastId)).toEqual(["roast-a", "roast-b"]);
  expect(mocks.roast).toHaveBeenCalledWith("operator", "roast-a");
  expect(result[0]!.chargeWeightKg).toBe("0.100");
  expect(result[0]).not.toHaveProperty("notes");
  expect(result[0]).not.toHaveProperty("blindCode");
  expect(result[0]).not.toHaveProperty("roaster");
});
it("omite toda referencia de un tueste denegado por el servicio de permisos", async () => {
  mocks.mappings.mockResolvedValue([{ sampleId: "sample", roastSessionId: "secret", blindSample: { flight: { sessionId: "session" } } }]);
  mocks.roast.mockRejectedValue(new TraceabilityAccessError("denied"));
  expect(await getReportRoastPreparations("operator", ["sample"])).toEqual([]);
});
it("no oculta fallos inesperados como si fueran denegaciones de acceso", async () => {
  mocks.mappings.mockResolvedValue([{ sampleId: "sample", roastSessionId: "roast", blindSample: { flight: { sessionId: "session" } } }]);
  mocks.roast.mockRejectedValue(new Error("database unavailable"));
  await expect(getReportRoastPreparations("operator", ["sample"])).rejects.toThrow("database unavailable");
});
