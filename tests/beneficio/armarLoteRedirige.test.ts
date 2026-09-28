import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Armar un lote en recepción lleva a la ficha de ese lote.
 *
 * **La decisión, de Daniel el 2026-09-27.** Lo que sigue a recibir es **seleccionar**
 * —flotación primero, luego manual o con máquina—, y la selección vive en la ficha del lote.
 * Antes la acción devolvía `{ ok: true }` y el formulario pintaba «Lote armado.»: el operador se
 * quedaba en recepción sin el id, y para seleccionar tenía que ir a `/lots`, encontrar el lote y
 * bajar por una ficha de 28 secciones. `armarLote` ya devolvía el lote; la acción lo tiraba.
 *
 * **El fallo concreto que esto guarda.** Next implementa `redirect()` lanzando. Si la llamada
 * queda DENTRO del `try` de la acción, la atrapa su `catch`, `traducir()` no reconoce la clase y
 * la relanza —o, con otra forma de traducir, la convierte en un mensaje de error—: en el mejor
 * caso el salto se lee como un fallo al armar el lote, que sí se armó. Por eso el `redirect` va
 * después del `try`, y por eso el segundo caso de abajo no es decoración: comprueba que la ruta
 * de error sigue devolviendo estado en vez de saltar.
 */

const deps = vi.hoisted(() => ({ user: vi.fn(), armar: vi.fn(), revalidate: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/lotesDeBeneficio", () => ({
  armarLote: deps.armar,
  LoteDeBeneficioError: class LoteDeBeneficioError extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));

import { armarLoteAction } from "../../app/actions/recepcionDeCereza";
import { LoteDeBeneficioError } from "../../lib/traceability/lotesDeBeneficio";

function form() {
  const data = new FormData();
  data.set("beneficioId", "beneficio-1");
  data.set("codigo", "PE-90");
  data.set("kg.recepcion-a", "120.5");
  data.set("kg.recepcion-b", "80");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.armar.mockResolvedValue({ id: "lote-nuevo", lotCode: "PE-90" });
});

describe("armar un lote lleva a su ficha, donde sigue la selección", () => {
  it("redirige al lote que devolvió el servicio, no a recepción", async () => {
    await expect(armarLoteAction({}, form())).rejects.toThrow("redirect:/lots/lote-nuevo");
    // Que el id venga del servicio y no de un campo del formulario: el servicio es quien crea el
    // lote, y su código puede no ser el que se escribió si otra sesión lo tomó antes.
    expect(deps.armar).toHaveBeenCalledTimes(1);
    expect(deps.armar).toHaveBeenCalledWith("actor", {
      beneficioId: "beneficio-1",
      codigo: "PE-90",
      recepciones: [
        { recepcionId: "recepcion-a", kg: 120.5 },
        { recepcionId: "recepcion-b", kg: 80 },
      ],
    });
    expect(deps.revalidate).toHaveBeenCalledWith("/beneficio/recepcion");
  });

  it("y un error de validación sigue devolviendo estado, sin saltar a ninguna parte", async () => {
    deps.armar.mockRejectedValue(new LoteDeBeneficioError("codigo_obligatorio"));
    // Control positivo del caso anterior: si esto también lanzara `redirect:`, el primer test
    // estaría pasando por el mero hecho de que la acción lanza algo.
    await expect(armarLoteAction({}, form())).resolves.toEqual({ error: "error_codigo_obligatorio" });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it("sin sesión redirige a login y no arma nada", async () => {
    deps.user.mockResolvedValue(null);
    await expect(armarLoteAction({}, form())).rejects.toThrow("redirect:/login");
    expect(deps.armar).not.toHaveBeenCalled();
  });
});
