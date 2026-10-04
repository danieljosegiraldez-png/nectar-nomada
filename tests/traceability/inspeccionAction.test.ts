import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ user: vi.fn(), registrar: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/samplingEvents", () => ({ registrarInspeccion: deps.registrar }));
vi.mock("../../lib/traceability/lots", () => ({ TraceabilityAccessError: class extends Error {} }));
vi.mock("../../lib/traceability/samples", () => ({ SampleValidationError: class extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { registrarInspeccionFormAction } from "../../app/actions/inspecciones";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { SampleValidationError } from "../../lib/traceability/samples";

function form() {
  const data = new FormData();
  for (const [k, v] of Object.entries({ lotId: "lote", dryingBedLocationId: "cama", occurredAt: "2026-09-16T09:00", tzOffsetMinutes: "300", materialState_1: "CHERRY", materialState_2: "CHERRY", samplingRole_1: "REPLICATE", samplingRole_2: "REPLICATE" })) data.set(k, v);
  return data;
}
beforeEach(() => { vi.clearAllMocks(); deps.user.mockResolvedValue({ userAccountId: "actor" }); deps.registrar.mockResolvedValue({}); });
describe("la acción de inspección delega un único envío al servicio atómico", () => {
  it("llama una sola vez con las dos muestras y el actor de sesión", async () => {
    await expect(registrarInspeccionFormAction({}, form())).rejects.toThrow("redirect:/lots/lote?ok=inspeccion");
    expect(deps.registrar).toHaveBeenCalledTimes(1);
    expect(deps.registrar).toHaveBeenCalledWith("actor", expect.objectContaining({ lotId: "lote", dryingBedLocationId: "cama", occurredAt: new Date("2026-09-16T14:00:00Z"), muestras: [
      { materialState: "CHERRY", samplingRole: "REPLICATE", samplingZone: null, samplingZoneNote: null },
      { materialState: "CHERRY", samplingRole: "REPLICATE", samplingZone: null, samplingZoneNote: null },
    ] }));
    expect(deps.revalidate).toHaveBeenCalledWith("/lots/lote");
  });
  it("sin sesión redirige a login y no escribe (control positivo en el envío anterior)", async () => {
    deps.user.mockResolvedValue(null);
    await expect(registrarInspeccionFormAction({}, form())).rejects.toThrow("redirect:/login");
    expect(deps.registrar).not.toHaveBeenCalled();
  });
  it("una negativa del servicio llega como fallo legible y no redirige como éxito", async () => {
    deps.registrar.mockRejectedValueOnce(new TraceabilityAccessError("no_sample_access"));
    expect(await registrarInspeccionFormAction({}, form())).toEqual({ error: "sin_acceso" });
    expect(deps.registrar).toHaveBeenCalledTimes(1);
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
  it("un lote dividido bajo un proceso llega como su error, no como un 500 ni como «sin acceso»", async () => {
    // Parte 1, R6.6 (ronda de arreglo 1, 2026-10-01): `registrarInspeccion` rechaza el lote dividido con
    // `SampleValidationError`, una clase que esta acción no traducía.
    deps.registrar.mockRejectedValueOnce(new SampleValidationError("lote_dividido"));
    expect(await registrarInspeccionFormAction({}, form())).toEqual({ error: "lote_dividido" });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
  it("un material ajeno a secado falla antes de llamar al servicio", async () => {
    const data = form(); data.set("materialState_2", "GREEN");
    expect(await registrarInspeccionFormAction({}, data)).toEqual({ error: "datos_invalidos" });
    expect(deps.registrar).not.toHaveBeenCalled();
  });
});
