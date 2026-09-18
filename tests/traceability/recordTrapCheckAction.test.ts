/**
 * F8 fix-final — la nota de "otros insectos" no se descarta en silencio.
 *
 * Hermético (mocks, sin base): mismo patrón que
 * `tests/traceability/inspeccionAction.test.ts` — mockear la sesión, el
 * servicio y `next/navigation`/`next/cache`, e importar la acción de verdad.
 * `getTranslations` también hace falta mockearlo aquí: `recordTrapCheckFormAction`
 * lo llama SIEMPRE al principio (`const t = await getTranslations(...)`), no
 * sólo en el camino de error.
 *
 * No va al grupo `base-sembrada`: no toca la base, así que corre en el
 * carril hermético de `scripts/ci.sh`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ user: vi.fn(), recordTrapCheck: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/traps", () => ({
  createTrap: vi.fn(),
  recordTrapCheck: deps.recordTrapCheck,
  TrapAccessError: class extends Error {},
  TrapValidationError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));

import { recordTrapCheckFormAction } from "../../app/actions/traceability";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const base = {
    locationId: "parcela-1",
    specimenId: "trampa-1",
    observedAt: "2026-09-15",
    brocaLevel: "pocos",
    otherInsectsNote: "hormigas",
    provenanceClass: "direct_observation",
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.recordTrapCheck.mockResolvedValue({ id: "revision-1" });
});

describe("recordTrapCheckFormAction — la nota de otros insectos", () => {
  it('guarda la nota cuando "otros insectos" es SÍ', async () => {
    await recordTrapCheckFormAction({}, form({ otherInsects: "yes" }));
    expect(deps.recordTrapCheck).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ otherInsects: true, otherInsectsNote: "hormigas" }),
    );
  });

  // El caso que F8 arregla: el selector se queda en "sin registrar" pero el
  // operario ya escribió la nota (o la dejó de un envío anterior en el DOM).
  // Antes `otros ? nota : null` la descartaba también aquí.
  it('guarda la nota cuando "otros insectos" queda SIN REGISTRAR', async () => {
    await recordTrapCheckFormAction({}, form({ otherInsects: "" }));
    expect(deps.recordTrapCheck).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ otherInsects: null, otherInsectsNote: "hormigas" }),
    );
  });

  it('descarta la nota SÓLO cuando "otros insectos" es explícitamente NO', async () => {
    await recordTrapCheckFormAction({}, form({ otherInsects: "no" }));
    expect(deps.recordTrapCheck).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ otherInsects: false, otherInsectsNote: null }),
    );
  });
});

describe("recordTrapCheckFormAction — mantenimiento y observador", () => {
  it("manda el mantenimiento como tri-estado, no como casilla", async () => {
    await recordTrapCheckFormAction({}, form({ cleaned: "yes", liquidChanged: "no" }));
    expect(deps.recordTrapCheck).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ cleaned: true, liquidChanged: false, lureRecharged: null }),
    );
  });

  it("manda quién observó", async () => {
    await recordTrapCheckFormAction({}, form({ observerPersonId: "persona-1" }));
    expect(deps.recordTrapCheck).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ observerPersonId: "persona-1" }),
    );
  });
});
