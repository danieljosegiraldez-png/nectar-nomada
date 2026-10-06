/**
 * Cerrar un secado desde la app guarda CÓMO terminó (`DryingRun.endedOutcome`).
 *
 * **El fallo, medido el 2026-10-04** (auditoría farm-to-green, riesgo R10): ninguna de las dos
 * puertas de cierre —el formulario de la ficha (`endDryingFormAction`) y bajar la última bandeja
 * (`bajarBandejaAction`)— pasaba el desenlace al servicio, y no había ningún otro escritor. Como
 * `faseDelLote` sólo da «reposo» con `target_reached` (`lib/beneficio/reposo.ts`), el reloj del
 * reposo no arrancaba nunca y la muestra VERDE de un lote de pergamino fallaba SIEMPRE con
 * `green_sample_before_reposo` (`lib/traceability/samples.ts`).
 *
 * **Decisión de Daniel, 2026-10-04:** las dos pantallas lo piden, obligatorio y sin valor por
 * omisión; el servicio lo sigue aceptando vacío (lo anterior y las importaciones). Un desenlace
 * supuesto sería inventar un dato: «llegó al objetivo» es justo lo que abre el reposo.
 *
 * Hermético (sin base), como `accionesQueNoCapturaban.test.ts`. Sólo se mockean las dos llamadas
 * al servicio; las clases de error siguen siendo las reales, para que el `instanceof` de las
 * acciones compare contra la clase de verdad.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DryingOutcome } from "../../generated/prisma/enums";

const deps = vi.hoisted(() => ({ user: vi.fn(), endDryingRun: vi.fn(), bajarBandeja: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/drying", async (original) => ({
  ...(await original<typeof import("../../lib/traceability/drying")>()),
  endDryingRun: deps.endDryingRun,
}));
vi.mock("../../lib/traceability/bandejasDelSecado", async (original) => ({
  ...(await original<typeof import("../../lib/traceability/bandejasDelSecado")>()),
  bajarBandeja: deps.bajarBandeja,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((clave: string) => clave) }));

import { bajarBandejaAction } from "../../app/actions/bandejasDelSecado";
import { endDryingFormAction } from "../../app/actions/traceability";
import {
  DESENLACES_DEL_SECADO,
  DesenlaceDeSecadoRequerido,
  desenlaceDelSecado,
} from "../../app/beneficio/bandejas/errorDeSecado";

function cierreDeLaFicha(desenlace?: string) {
  const datos = new FormData();
  datos.set("lotId", "lote-1");
  datos.set("dryingRunId", "corrida-1");
  datos.set("outputLotCode", "PE-90-A");
  datos.set("outputLotType", "parchment");
  if (desenlace !== undefined) datos.set("endedOutcome", desenlace);
  return datos;
}

function bajada({ ultima, desenlace }: { ultima: boolean; desenlace?: string }) {
  const datos = new FormData();
  datos.set("lotId", "lote-1");
  datos.set("dryingRunTrayId", "bandeja-1");
  if (ultima) {
    datos.set("esUltima", "1");
    datos.set("outputLotCode", "PE-90-A");
    datos.set("outputLotType", "parchment");
  }
  if (desenlace !== undefined) datos.set("endedOutcome", desenlace);
  return datos;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.endDryingRun.mockResolvedValue({});
  deps.bajarBandeja.mockResolvedValue({});
});

describe("el desenlace que ofrece la pantalla", () => {
  it("es exactamente la lista del esquema (enum DryingOutcome)", () => {
    expect([...DESENLACES_DEL_SECADO].sort()).toEqual(Object.values(DryingOutcome).sort());
  });

  it("acepta los tres desenlaces y rechaza el vacío y cualquier otro texto, sin suponer ninguno", () => {
    for (const desenlace of DESENLACES_DEL_SECADO) expect(desenlaceDelSecado(desenlace)).toBe(desenlace);
    for (const malo of [null, "", "   ", "terminado", "TARGET_REACHED"]) {
      expect(() => desenlaceDelSecado(malo)).toThrow(DesenlaceDeSecadoRequerido);
    }
  });
});

describe("cerrar el secado desde la ficha del lote", () => {
  it.each(DESENLACES_DEL_SECADO)("entrega «%s» al servicio tal cual", async (desenlace) => {
    await endDryingFormAction(cierreDeLaFicha(desenlace));
    expect(deps.endDryingRun).toHaveBeenCalledTimes(1);
    expect(deps.endDryingRun).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ dryingRunId: "corrida-1", endedOutcome: desenlace }),
    );
  });

  it("sin desenlace vuelve a la ficha con su error y no cierra nada", async () => {
    await expect(endDryingFormAction(cierreDeLaFicha())).rejects.toThrow("redirect:/lots/lote-1?error=desenlace_requerido");
    expect(deps.endDryingRun).not.toHaveBeenCalled();
  });
});

describe("bajar la última bandeja cierra el secado", () => {
  it("entrega el desenlace dentro del cierre", async () => {
    await expect(bajarBandejaAction({}, bajada({ ultima: true, desenlace: "interrupted" }))).resolves.toEqual({});
    expect(deps.bajarBandeja).toHaveBeenCalledTimes(1);
    expect(deps.bajarBandeja).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ cierre: expect.objectContaining({ endedOutcome: "interrupted" }) }),
    );
  });

  it("sin desenlace devuelve su error y no baja la bandeja", async () => {
    await expect(bajarBandejaAction({}, bajada({ ultima: true }))).resolves.toEqual({ error: "desenlace_requerido" });
    expect(deps.bajarBandeja).not.toHaveBeenCalled();
  });

  it("control: una bandeja que no es la última no pide desenlace", async () => {
    await expect(bajarBandejaAction({}, bajada({ ultima: false }))).resolves.toEqual({});
    expect(deps.bajarBandeja).toHaveBeenCalledWith("actor", expect.objectContaining({ cierre: null }));
  });
});
