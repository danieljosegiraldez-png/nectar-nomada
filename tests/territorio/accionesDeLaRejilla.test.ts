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
  declararTrozoDeForma: vi.fn(),
  quitarTrozoDeForma: vi.fn(),
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
vi.mock("../../lib/traceability/formaDeLaParcela", () => ({
  declararTrozoDeForma: deps.declararTrozoDeForma,
  quitarTrozoDeForma: deps.quitarTrozoDeForma,
  // La mitad pura la importan otros módulos del árbol: un mock incompleto rompe la
  // CARGA, y vitest lo reporta como «no tests» — que se lee igual que «no falló».
  celdasDeLaForma: () => 0,
  celdasSinPlantar: () => 0,
  tableroDe: (r: { rowCount: number; plantsPerRow: number }) => ({
    rowFrom: 1, rowTo: r.rowCount, plantFrom: 1, plantTo: r.plantsPerRow,
  }),
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
  guardarRangoDeMicroparcelaAction,
  declararTrozoDeFormaAction,
  quitarTrozoDeFormaAction,
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
  deps.anadirRangoAlBloque.mockResolvedValue({ rango: { id: "r1" }, solapesAvisados: [], celdasSinPlantar: 0 });
  deps.quitarRangoDelBloque.mockResolvedValue(undefined);
  deps.declararTrozoDeForma.mockResolvedValue({ id: "t1" });
  deps.quitarTrozoDeForma.mockResolvedValue({ plantasQueQuedanFuera: 0 });
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

  /**
   * **D11: marcar sobre celdas que la forma dice que NO están plantadas se GUARDA y
   * se avisa.** El límite duro sigue siendo el tablero; la forma sirve para contar y
   * para avisar. Una trampa en el claro de una roca es su sitio natural, y declarar
   * ese claro como plantado para poder ponerla sería mentir.
   */
  it("un rango sobre celdas sin plantar se guarda y vuelve en avisos", async () => {
    deps.anadirRangoAlBloque.mockResolvedValue({
      rango: { id: "r1" },
      solapesAvisados: [],
      celdasSinPlantar: 12,
    });
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r.error, "el rango SE GUARDÓ: esto no es un error").toBeUndefined();
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos?.[0]).toContain("rejillaFueraDeLaFormaAviso");
    expect(r.avisos?.[0], "cuántas celdas tiene que llegar").toContain("12");
  });

  /**
   * **El caso negativo, sin el cual un aviso que se emite SIEMPRE pasaría por bueno.**
   * Es la misma exigencia que el control positivo: una comprobación que no puede salir
   * del otro modo no mide.
   */
  it("un rango enteramente dentro de la forma NO avisa de celdas sin plantar", async () => {
    deps.anadirRangoAlBloque.mockResolvedValue({
      rango: { id: "r1" },
      solapesAvisados: [],
      celdasSinPlantar: 0,
    });
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r).toEqual({});
  });

  /** Los dos avisos a la vez: solape de D7 y celdas sin plantar de D11, sin pisarse. */
  it("un solape y celdas sin plantar vuelven los DOS avisos", async () => {
    deps.anadirRangoAlBloque.mockResolvedValue({
      rango: { id: "r1" },
      solapesAvisados: [{ bloque: "Ensayo B", celdas: 6 }],
      celdasSinPlantar: 12,
    });
    const r = await anadirRangoAlBloqueAction({}, form({ locationId: "p1", plotBlockId: "b1" }));
    expect(r.avisos).toHaveLength(2);
    expect(r.avisos?.join(" ")).toContain("rejillaSolapeAviso");
    expect(r.avisos?.join(" ")).toContain("rejillaFueraDeLaFormaAviso");
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

describe("las dos acciones de la forma del lote", () => {
  it("declarar pasa los cuatro números y el sitio", async () => {
    const r = await declararTrozoDeFormaAction(
      {},
      form({ locationId: "p1", rowFrom: "1", rowTo: "7", plantFrom: "1", plantTo: "20" }),
    );
    expect(r).toEqual({});
    expect(deps.declararTrozoDeForma).toHaveBeenCalledWith("actor", {
      locationId: "p1",
      rowFrom: 1,
      rowTo: 7,
      plantFrom: 1,
      plantTo: 20,
    });
  });

  it("un rechazo del servicio vuelve como error traducido", async () => {
    deps.declararTrozoDeForma.mockRejectedValue(new deps.RejillaInvalida("rejilla_rango_al_reves"));
    const r = await declararTrozoDeFormaAction({}, form({ locationId: "p1" }));
    expect(r.error).toContain("error_rejilla_rango_al_reves");
    expect(r.avisos).toBeUndefined();
  });

  it("quitar pasa el trozo que se le nombra", async () => {
    const r = await quitarTrozoDeFormaAction({}, form({ locationId: "p1", trozoId: "t9" }));
    expect(r).toEqual({});
    expect(deps.quitarTrozoDeForma).toHaveBeenCalledWith("actor", "t9");
  });

  /**
   * **§7.4: el aviso va al QUITAR, no al declarar.** Quitar un trozo puede dejar plantas
   * fuera de lo que resta, y eso se dice — el trozo SE QUITÓ, así que no es un error.
   */
  it("quitar un trozo que deja plantas fuera vuelve en avisos, no en error", async () => {
    deps.quitarTrozoDeForma.mockResolvedValue({ plantasQueQuedanFuera: 12 });
    const r = await quitarTrozoDeFormaAction({}, form({ locationId: "p1", trozoId: "t9" }));
    expect(r.error, "el trozo SE QUITÓ: esto no es un error").toBeUndefined();
    expect(r.avisos).toHaveLength(1);
    expect(r.avisos?.[0]).toContain("rejillaFormaPlantasFueraAviso");
    expect(r.avisos?.[0], "cuántas plantas tiene que llegar").toContain("12");
  });

  /** El caso negativo, sin el cual un aviso que se emite siempre pasaría por bueno. */
  it("quitar un trozo sin plantas fuera NO avisa", async () => {
    deps.quitarTrozoDeForma.mockResolvedValue({ plantasQueQuedanFuera: 0 });
    const r = await quitarTrozoDeFormaAction({}, form({ locationId: "p1", trozoId: "t9" }));
    expect(r).toEqual({});
  });

  it("un trozo que ya no está vuelve con su propia frase", async () => {
    deps.quitarTrozoDeForma.mockRejectedValue(new deps.RejillaInvalida("rejilla_trozo_no_encontrado"));
    const r = await quitarTrozoDeFormaAction({}, form({ locationId: "p1", trozoId: "t9" }));
    expect(r.error).toContain("error_rejilla_trozo_no_encontrado");
  });

  it("las dos redirigen a /login y no llaman a su servicio", async () => {
    deps.user.mockResolvedValue(null);
    for (const [accion, servicio] of [
      [declararTrozoDeFormaAction, deps.declararTrozoDeForma],
      [quitarTrozoDeFormaAction, deps.quitarTrozoDeForma],
    ] as const) {
      await expect(accion({}, form({ locationId: "p1" }))).rejects.toThrow("redirect:/login");
      expect(servicio).not.toHaveBeenCalled();
    }
  });
});

describe("guardarRangoDeMicroparcelaAction", () => {
  it("pasa los cuatro números al servicio, como números", async () => {
    const r = await guardarRangoDeMicroparcelaAction(
      {},
      form({
        locationId: "micro-1",
        rangeRowFrom: "1",
        rangeRowTo: "4",
        rangePlantFrom: "1",
        rangePlantTo: "20",
      }),
    );
    expect(r).toEqual({});
    expect(deps.updateLocationAttributes).toHaveBeenCalledWith("actor", {
      locationId: "micro-1",
      rangeRowFrom: 1,
      rangeRowTo: 4,
      rangePlantFrom: 1,
      rangePlantTo: 20,
    });
  });

  /**
   * **Vaciar los cuatro quita el rango; no lo pone en cero.** `Number("")` es 0, y una
   * microparcela de la hilera 0 a la 0 no existe (ADR-080). Y los cuatro van explícitos,
   * no ausentes: el servicio trata `undefined` como «no tocar», así que mandar nada no
   * borraría nada.
   */
  it("vaciar los cuatro los manda como null, no como cero", async () => {
    await guardarRangoDeMicroparcelaAction(
      {},
      form({
        locationId: "micro-1",
        rangeRowFrom: "",
        rangeRowTo: "",
        rangePlantFrom: "",
        rangePlantTo: "",
      }),
    );
    expect(deps.updateLocationAttributes).toHaveBeenCalledWith("actor", {
      locationId: "micro-1",
      rangeRowFrom: null,
      rangeRowTo: null,
      rangePlantFrom: null,
      rangePlantTo: null,
    });
  });

  /**
   * **No manda NINGÚN campo de la rejilla**, y eso es la mitad que protege el dato: el
   * servicio trata `undefined` como «no tocar», así que guardar el rango de una
   * microparcela no puede borrar la numeración de su madre.
   */
  it("no manda ningún campo de la rejilla", async () => {
    await guardarRangoDeMicroparcelaAction({}, form({ locationId: "micro-1", rangeRowFrom: "1" }));
    const pasado = deps.updateLocationAttributes.mock.calls[0]?.[1] ?? {};
    for (const campo of ["gridOrigin", "rowCount", "plantsPerRow", "rowSpacingMeters"]) {
      expect(pasado, `${campo} no debe viajar en esta acción`).not.toHaveProperty(campo);
    }
  });

  it("un rechazo del servicio vuelve como error traducido", async () => {
    deps.updateLocationAttributes.mockRejectedValue(new deps.RejillaInvalida("rejilla_rango_fuera_de_rejilla"));
    const r = await guardarRangoDeMicroparcelaAction({}, form({ locationId: "micro-1" }));
    expect(r.error).toContain("error_rejilla_rango_fuera_de_rejilla");
  });

  it("sin sesión redirige a /login y no llama al servicio", async () => {
    deps.user.mockResolvedValue(null);
    await expect(
      guardarRangoDeMicroparcelaAction({}, form({ locationId: "micro-1" })),
    ).rejects.toThrow("redirect:/login");
    expect(deps.updateLocationAttributes).not.toHaveBeenCalled();
  });
});
