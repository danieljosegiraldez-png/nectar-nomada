/**
 * Abrir una jornada sin marcar ningún propósito daba un 500 (2026-09-18).
 *
 * La cadena: el formulario manda `formData.getAll("purposes")`, que es `[]` y no `null`;
 * el servicio pasa todo lo que no es `null` por `exigePropositos`, que rechaza el vacío con
 * `PropositoInvalido("proposito_requerido")`; y `friendlyError` no conocía esa clase, así
 * que la relanzaba y la acción reventaba en vez de devolver `{ error }`.
 *
 * Hermético (mocks, sin base), mismo patrón que `recordTrapCheckAction.test.ts`. El servicio
 * está mockeado, pero **llama al `exigePropositos` de verdad** con lo que la acción le pasa:
 * la clase que llega a `friendlyError` es la real, y la entrada es la que el formulario
 * produce. `getTranslations` devuelve la clave, así que la prueba afirma sobre la clave.
 *
 * No va al grupo `base-sembrada`: no toca la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { exigePropositos } from "../../lib/apiary/propositoDeVisita";

const deps = vi.hoisted(() => ({ user: vi.fn(), start: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/fieldSessions", () => ({
  startFieldSession: deps.start,
  endFieldSession: vi.fn(),
  completarVisita: vi.fn(),
  recordFieldEvent: vi.fn(),
  FieldSessionValidationError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
// La clave, y el valor interpolado detrás de `|` cuando lo hay: así se ve también qué dato llega al mensaje.
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string, params?: { value?: string }) => (params?.value ? `${key}|${params.value}` : key)),
}));

import { startFieldSessionFormAction } from "../../app/actions/traceability";

function form(purposes: string[]) {
  const data = new FormData();
  data.set("locationId", "parcela-1");
  data.set("operatorPersonId", "persona-1");
  data.set("startedAt", "2026-09-18T07:30");
  data.set("tzOffsetMinutes", "300");
  for (const p of purposes) data.append("purposes", p);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.start.mockImplementation(async (_actor: string, input: { purposes?: string[] | null }) => {
    if (input.purposes != null) exigePropositos(input.purposes);
    return { id: "jornada-1" };
  });
});

describe("startFieldSessionFormAction — propósito de la visita", () => {
  it("sin ninguna casilla marcada devuelve un error legible, no un 500", async () => {
    await expect(startFieldSessionFormAction({}, form([]))).resolves.toEqual({
      error: "error_proposito_requerido",
    });
  });

  it("un propósito que no está en el catálogo devuelve su error legible", async () => {
    await expect(startFieldSessionFormAction({}, form(["trasiego"]))).resolves.toEqual({
      error: "error_proposito_desconocido|trasiego",
    });
  });

  // Control positivo: con un propósito válido la jornada se abre y redirige, así que las dos
  // pruebas de arriba no pasan porque la acción falle antes por otra razón.
  it("con un propósito válido abre la jornada", async () => {
    await expect(startFieldSessionFormAction({}, form(["inspeccion"]))).rejects.toThrow(
      "redirect:/field-sessions/jornada-1",
    );
    expect(deps.start).toHaveBeenCalledWith("actor", expect.objectContaining({ purposes: ["inspeccion"] }));
  });
});
