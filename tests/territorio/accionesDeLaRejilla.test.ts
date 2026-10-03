/**
 * Las tres acciones de la rejilla: el camino entero «servicio → pantalla».
 *
 * **Existe porque no existía.** Una revisión independiente lo midió el
 * 2026-10-02: 22 archivos de `tests/` importan `app/actions` y **ninguno** éstas,
 * así que el tramo que convierte lo que el servicio devuelve en lo que el
 * operario ve estaba sin cubrir. Las mutaciones que sobrevivían, por su nombre:
 * dejar `solapes` sin asignar, y que la acción devolviera `{}` en vez del aviso.
 *
 * Hermético, con el patrón que la casa ya usa para esto
 * (`tests/traceability/recordTrapCheckAction.test.ts`): se mockean la sesión, los
 * servicios, `next/cache`, `next/navigation` y `getTranslations`, y se importa la
 * acción **de verdad**. No toca la base, así que corre en el carril de
 * `scripts/ci.sh` y NO va al grupo `base-sembrada`.
 *
 * `getTranslations` devuelve la clave y los parámetros en vez de la frase: lo que
 * se vigila aquí es **qué clave se elige y con qué valores**, no la redacción —
 * de eso se encarga `codigos-de-rejilla-tienen-frase`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// **La clase va DENTRO de `vi.hoisted`, y no es estilo.** `vi.mock` se eleva al
// principio del archivo, así que una clase declarada arriba todavía no existe
// cuando la factoría corre: `ReferenceError: Cannot access … before
// initialization`, y vitest lo reporta como **«no tests»** — que en una salida
// filtrada se lee igual que «no falló».
const deps = vi.hoisted(() => ({
  user: vi.fn(),
  updateLocationAttributes: vi.fn(),
  anadirRangoAlBloque: vi.fn(),
  quitarRangoDelBloque: vi.fn(),
  revalidate: vi.fn(),
  RejillaInvalida: class extends Error {},
}));

vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/locations", () => ({
  updateLocationAttributes: deps.updateLocationAttributes,
  LocationAccessError: class extends Error {},
  LocationValidationError: class extends Error {},
  RejillaInvalida: deps.RejillaInvalida,
}));
vi.mock("../../lib/traceability/plotBlocks", () => ({
  anadirRangoAlBloque: deps.anadirRangoAlBloque,
  createPlotBlock: vi.fn(),
  quitarRangoDelBloque: deps.quitarRangoDelBloque,
  setPlotBlockType: vi.fn(),
  PlotBlockValidationError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
// Devuelve la clave y los parámetros, para poder afirmar sobre los DOS.
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((clave: string, params?: Record<string, unknown>) =>
      params ? `${clave}|${JSON.stringify(params)}` : clave,
    ),
}));

import {
  anadirRangoAlBloqueAction,
  guardarRejillaAction,
  quitarRangoDelBloqueAction,
} from "../../app/actions/traceability";

const form = (campos: Record<string, string>) => {
  const d = new FormData();
  for (const [k, v] of Object.entries(campos)) d.set(k, v);
  return d;
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.updateLocationAttributes.mockResolvedValue({ id: "parcela-1" });
  deps.anadirRangoAlBloque.mockResolvedValue({ rango: { id: "r1" }, solapesAvisados: [] });
  deps.quitarRangoDelBloque.mockResolvedValue(undefined);
});

describe("guardarRejillaAction", () => {
  it("pasa los cuatro campos al servicio, con los números como números", async () => {
    const r = await guardarRejillaAction(
      {},
      form({
        locationId: "parcela-1",
        gridOrigin: "noroeste",
        rowCount: "10",
        plantsPerRow: "20",
        rowSpacingMeters: "2.5",
      }),
    );
    expect(r).toEqual({});
    expect(deps.updateLocationAttributes).toHaveBeenCalledWith("actor", {
      locationId: "parcela-1",
      gridOrigin: "noroeste",
      rowCount: 10,
      plantsPerRow: 20,
      rowSpacingMeters: 2.5,
    });
  });

  /**
   * **Vacío es `null`, nunca cero** (ADR-080). Un campo en blanco llega como `""`,
   * y `Number("")` es **0** — así que si la acción no lo convirtiera a `null`,
   * borrar la rejilla guardaría una de cero hileras.
   */
  it("un campo vacío llega al servicio como null, no como cero", async () => {
    await guardarRejillaAction(
      {},
      form({ locationId: "parcela-1", gridOrigin: "", rowCount: "", plantsPerRow: "", rowSpacingMeters: "" }),
    );
    expect(deps.updateLocationAttributes).toHaveBeenCalledWith("actor", {
      locationId: "parcela-1",
      gridOrigin: null,
      rowCount: null,
      plantsPerRow: null,
      rowSpacingMeters: null,
    });
  });

  /**
   * **Lo que el servicio rechaza vuelve como `error` TRADUCIDO, no relanzado.**
   * Es la clase de defecto del PR #433: una clase que la acción no sabe traducir
   * escapa y el formulario recibe un 500 en vez de un mensaje.
   */
  it("una RejillaInvalida vuelve como error traducido, con su clave", async () => {
    deps.updateLocationAttributes.mockRejectedValue(new deps.RejillaInvalida("rejilla_a_medias"));
    const r = await guardarRejillaAction({}, form({ locationId: "parcela-1", rowCount: "10" }));
    expect(r.error).toContain("error_rejilla_a_medias");
    expect(r.avisos, "un rechazo no es un aviso").toBeUndefined();
  });

  it("revalida la ficha y los ajustes de esa parcela", async () => {
    await guardarRejillaAction({}, form({ locationId: "parcela-7" }));
    expect(deps.revalidate).toHaveBeenCalledWith("/plots/parcela-7");
    expect(deps.revalidate).toHaveBeenCalledWith("/plots/parcela-7/ajustes");
  });
});

describe("anadirRangoAlBloqueAction", () => {
  it("pasa el bloque y los cuatro números", async () => {
    await anadirRangoAlBloqueAction(
      {},
      form({
        locationId: "parcela-1",
        plotBlockId: "b1",
        rowFrom: "1",
        rowTo: "5",
        plantFrom: "1",
        plantTo: "10",
      }),
    );
    expect(deps.anadirRangoAlBloque).toHaveBeenCalledWith("actor", {
      plotBlockId: "b1",
      rowFrom: 1,
      rowTo: 5,
      plantFrom: 1,
      plantTo: 10,
    });
  });

  /**
   * **LA PRUEBA QUE FALTABA.** El servicio devuelve con quién se solapa y cuántas
   * celdas; si la acción no los devolviera, el aviso de D7 no llegaría nunca a la
   * pantalla y nadie lo notaría — «se guardó» se lee igual con aviso y sin él.
   * Las dos mutaciones que una revisión independiente midió como supervivientes
   * —dejar `solapes` sin asignar, y devolver `{}`— caen aquí.
   */
  it("el solape vuelve en avisos, con el nombre y las celdas, y NO en error", async () => {
    deps.anadirRangoAlBloque.mockResolvedValue({
      rango: { id: "r1" },
      solapesAvisados: [{ bloque: "Trampas Alto", celdas: 50 }],
    });
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r.error, "el rango SE GUARDÓ: esto no es un error").toBeUndefined();
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos?.[0]).toContain("rejillaSolapeAviso");
    expect(r.avisos?.[0], "el nombre del bloque tiene que llegar").toContain("Trampas Alto");
    expect(r.avisos?.[0], "y las celdas también").toContain("50");
  });

  /** Y el control de que no inventa avisos: sin solape, no hay ninguno. */
  it("sin solape no devuelve avisos", async () => {
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r).toEqual({});
  });

  it("varios solapes vuelven todos", async () => {
    deps.anadirRangoAlBloque.mockResolvedValue({
      rango: { id: "r1" },
      solapesAvisados: [
        { bloque: "Trampas Alto", celdas: 50 },
        { bloque: "Ensayo B", celdas: 6 },
      ],
    });
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r.avisos).toHaveLength(2);
  });

  it("un rechazo del servicio vuelve como error traducido", async () => {
    deps.anadirRangoAlBloque.mockRejectedValue(new deps.RejillaInvalida("rejilla_trampas_se_solapan"));
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r.error).toContain("error_rejilla_trampas_se_solapan");
    expect(r.avisos).toBeUndefined();
  });
});

describe("quitarRangoDelBloqueAction", () => {
  it("quita el rango que se le nombra", async () => {
    const r = await quitarRangoDelBloqueAction({}, form({ locationId: "p1", rangoId: "r9" }));
    expect(r).toEqual({});
    expect(deps.quitarRangoDelBloque).toHaveBeenCalledWith("actor", "r9");
  });

  /**
   * **El mensaje que una revisión independiente encontró equivocado.** Quitar un
   * rango que otro ya quitó —una página vieja— salía como «No se pudo crear el
   * bloque: range_not_found», porque `PlotBlockValidationError` caía en la rama
   * genérica. Ahora tiene su propia frase, y esta prueba fija cuál.
   */
  it("un rango que ya no está sale con SU frase, no con la de crear un bloque", async () => {
    const { PlotBlockValidationError } = await import("../../lib/traceability/plotBlocks");
    deps.quitarRangoDelBloque.mockRejectedValue(new PlotBlockValidationError("range_not_found"));
    const r = await quitarRangoDelBloqueAction({}, form({ locationId: "p1", rangoId: "r9" }));
    expect(r.error).toContain("error_rango_no_encontrado");
    expect(r.error, "«no se pudo crear el bloque» es falso al quitar un rango").not.toContain(
      "error_block",
    );
  });
});

describe("las tres, sin sesión", () => {
  /**
   * `redirect` está mockeado para lanzar, que es lo que Next hace de verdad. Lo
   * que se afirma es que las tres redirigen a `/login` **antes** de tocar su
   * servicio: un camino sin sesión que llamara al servicio sería una escritura sin
   * actor.
   */
  it("redirigen a /login y no llaman a su servicio", async () => {
    deps.user.mockResolvedValue(null);
    for (const [accion, servicio] of [
      [guardarRejillaAction, deps.updateLocationAttributes],
      [anadirRangoAlBloqueAction, deps.anadirRangoAlBloque],
      [quitarRangoDelBloqueAction, deps.quitarRangoDelBloque],
    ] as const) {
      await expect(accion({}, form({ locationId: "p1" }))).rejects.toThrow("redirect:/login");
      expect(servicio).not.toHaveBeenCalled();
    }
  });
});
