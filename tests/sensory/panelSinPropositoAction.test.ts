import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ compute: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: async () => ({ userAccountId: "host" }) }));
vi.mock("../../lib/sensory/service", () => ({ computePanelResult: mocks.compute, SensoryAccessError: class extends Error {}, SensoryPurposeNotDeclaredError: class extends Error {} }));
vi.mock("../../lib/sensory/sessions", () => ({}));
vi.mock("../../lib/sensory/informeExterno", () => ({}));
const { computePanelResultFormAction } = await import("../../app/actions/sensory");
const { SensoryPurposeNotDeclaredError } = await import("../../lib/sensory/service");
const form = () => { const f = new FormData(); f.set("sessionId", "session-1"); f.set("blindSampleId", "blind-1"); return f; };
it("vuelve a la sesión ante falta de propósito sin emitir un error de servidor", async () => {
  mocks.compute.mockRejectedValueOnce(new SensoryPurposeNotDeclaredError("test"));
  await expect(computePanelResultFormAction(form())).rejects.toThrow("redirect:/sensory/session-1");
});
it("con propósito conserva el cálculo y revalida la sesión", async () => {
  mocks.compute.mockResolvedValueOnce(undefined);
  await computePanelResultFormAction(form());
  expect(mocks.compute).toHaveBeenCalledWith("host", "blind-1");
  expect(mocks.revalidate).toHaveBeenCalledWith("/sensory/session-1");
});
it("no oculta errores inesperados como si fueran falta de propósito", async () => {
  mocks.compute.mockRejectedValueOnce(new Error("database failure"));
  await expect(computePanelResultFormAction(form())).rejects.toThrow("database failure");
});
