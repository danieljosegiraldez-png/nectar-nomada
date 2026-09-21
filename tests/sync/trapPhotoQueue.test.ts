import { describe, expect, it, vi } from "vitest";

/**
 * `lib/sync/trapPhotoQueue.ts` importa `app/actions/traceability.ts` a nivel
 * de módulo (para `requestTrampaPhotoUploadAction`/
 * `finalizeTrampaPhotoPorBorradorAction`, que `syncTrapPhotos` sí usa), y esa
 * cadena llega a `lib/auth/session` → next-auth → `next/server`, que Vitest
 * (fuera del bundler de Next) no resuelve — mismo obstáculo que ya resuelven
 * `tests/traceability/recordRoundTrapCheckFormAction.test.ts` y hermanos, con
 * el mismo mecanismo: mockear `lib/auth/session` (y lo que la acción
 * necesita del contexto de request) ANTES de importar. Aquí no se usa nada de
 * lo mockeado — es sólo para que el módulo cargue — y no hace falta base:
 * `clasificarResultadoDeFoto` es pura.
 */
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));

import { clasificarResultadoDeFoto } from "../../lib/sync/trapPhotoQueue";

/**
 * Tarea 12 — qué hacer con la respuesta de `finalizeTrampaPhotoPorBorradorAction`.
 *
 * Hermético a propósito, la misma razón que `clasificarRespuesta.test.ts`:
 * `syncTrapPhotos` necesita IndexedDB y `fetch`, que este repositorio no tiene
 * en el entorno de prueba (no hay `jsdom`). La decisión sí se puede probar sin
 * ninguno de los dos, y es la parte que se puede equivocar en silencio —
 * `"pendiente"` es la forma nueva: no es un error, es "todavía no", y
 * confundirla con un rechazo dejaría una foto buena marcada en error para
 * siempre.
 */
describe("clasificarResultadoDeFoto", () => {
  it("ok se aplica y se descarta", () => {
    expect(clasificarResultadoDeFoto({ ok: true })).toBe("aplicar");
  });

  it("pendiente se deja en cola, no es un error", () => {
    expect(clasificarResultadoDeFoto({ pendiente: true })).toBe("reintentar");
  });

  it("error se marca error", () => {
    expect(clasificarResultadoDeFoto({ error: "algo" })).toBe("rechazar");
  });
});
