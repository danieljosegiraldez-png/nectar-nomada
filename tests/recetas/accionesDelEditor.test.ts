/**
 * Las acciones del editor de recetas — Parte 2a, tarea 14 (2026-10-03). Hermética (mocks, sin base): el patrón de `armarLoteRedirige.test.ts`.
 *
 * Lo que se mockea son los SERVICIOS (`lib/recetas/pasos`, `lib/recetas/versiones`), la sesión y la navegación; lo que NO se mockea es lo que
 * decide qué llega al servicio —`pasoDeFormulario`, `posicionDeFormulario`— ni la clase de error (`RecipeError`): si se mockeara el error, el
 * `instanceof` de `friendlyError` compararía contra una clase inventada por la propia prueba y pasaría aunque la rama no existiera
 * (`accionesQueNoCapturaban.test.ts`). `getTranslations` devuelve la clave, así que se afirma sobre la clave.
 *
 * Tres cosas se vigilan por clase: que un error del servicio vuelve como estado en vez de saltar (el segundo caso de cada acción), que lo que llega al
 * servicio es lo que el formulario dice (cada campo de `crearRecetaAction` con un valor propio, y los vacíos como nulos), y que la acción no se fía del
 * formulario para el id de la receta que sale a la URL ni para las rutas que refresca (el `revalidatePath` de cada acción está afirmado).
 *
 * **Lo que NO se vigila, dicho para que nadie lo cuente por vigilado: que el `redirect` vaya FUERA del `try`.** Es la convención de la casa (Next implementa
 * `redirect` lanzando, y dentro de un `try` lo atraparía el `catch`), pero hoy meter `revalidatePath` y `redirect` de `agregarPasoAction` dentro del `try` es
 * inocuo: `friendlyError` relanza lo que no conoce (su último `throw error`, en `app/actions/traceability.ts`), así que el `catch` devuelve al llamador lo mismo
 * que se lanzó, y ninguna prueba de este archivo lo distingue. No se escribe una prueba que no distingue; si `friendlyError` dejara de relanzar, esto cambia.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  user: vi.fn(),
  crear: vi.fn(),
  agregar: vi.fn(),
  actualizar: vi.fn(),
  quitar: vi.fn(),
  mover: vi.fn(),
  publicar: vi.fn(),
  nuevaVersion: vi.fn(),
  derivar: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/recetas/pasos", () => ({
  agregarPaso: deps.agregar,
  actualizarPaso: deps.actualizar,
  quitarPaso: deps.quitar,
  moverPaso: deps.mover,
  publicarVersion: deps.publicar,
  pasosDeLaVersion: vi.fn(),
}));
vi.mock("../../lib/recetas/versiones", () => ({
  crearRecetaEnBorrador: deps.crear,
  nuevaVersionBorrador: deps.nuevaVersion,
  derivarReceta: deps.derivar,
  copiarContenidoDeVersion: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));

import {
  actualizarPasoAction,
  agregarPasoAction,
  crearRecetaAction,
  derivarRecetaAction,
  moverPasoAction,
  nuevaVersionBorradorAction,
  publicarVersionAction,
  quitarPasoAction,
} from "../../app/actions/traceability";
import { RecipeError } from "../../lib/recetas/errorDeReceta";

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

/** Un paso de lavado con una meta, como lo escribe el formulario. */
const PASO: Record<string, string> = {
  recipeId: "r1",
  recipeVersionId: "v1",
  despuesDeSeq: "2",
  stepTypeValueId: "tipo-lavado",
  horasSugeridas: "6",
  "metas[0][variable]": "ph",
  "metas[0][moment]": "final",
  "metas[0][unit]": "pH",
  "metas[0][targetValue]": "3.8",
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.crear.mockResolvedValue({ recipeId: "r-nueva", versionId: "v-nueva" });
  deps.agregar.mockResolvedValue({ id: "p-nuevo" });
  deps.actualizar.mockResolvedValue(undefined);
  deps.quitar.mockResolvedValue(undefined);
  deps.mover.mockResolvedValue(undefined);
  deps.publicar.mockResolvedValue(undefined);
  deps.nuevaVersion.mockResolvedValue({ id: "v2", version: 2 });
  deps.derivar.mockResolvedValue({ recipeId: "r-copia", versionId: "v-copia" });
});

describe("crearRecetaAction", () => {
  it("lleva a la receta que devolvió el servicio, con su código; una organización en blanco es una plantilla", async () => {
    const f = formulario({ name: "Lavado", description: "", organizationId: "" });
    await expect(crearRecetaAction({}, f)).rejects.toThrow("redirect:/recipes/r-nueva?ok=receta_creada");
    expect(deps.crear).toHaveBeenCalledWith("actor", { name: "Lavado", description: null, organizationId: null });
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes");
  });

  it("manda cada campo con su valor: el nombre, la descripción y la organización que el formulario dice (los vacíos del caso anterior llegan nulos)", async () => {
    // Control del caso anterior: allí descripción y organización van en blanco y llegan nulas; aquí van llenas y tienen que llegar tal cual. Con
    // sólo el caso de los vacíos, un `null` fijo en cualquiera de los dos campos pasaba (medido en la revisión de T14C, H3).
    const f = formulario({ name: "Lavado", description: "x", organizationId: "org1" });
    await expect(crearRecetaAction({}, f)).rejects.toThrow("redirect:/recipes/r-nueva?ok=receta_creada");
    expect(deps.crear).toHaveBeenCalledWith("actor", { name: "Lavado", description: "x", organizationId: "org1" });
  });

  it("y un error del servicio vuelve como estado, sin saltar a ninguna parte", async () => {
    deps.crear.mockRejectedValue(new RecipeError("nombre_repetido"));
    // Control del caso anterior: si esto también lanzara `redirect:`, el primero estaría pasando por el mero hecho de que la acción lanza algo.
    await expect(crearRecetaAction({}, formulario({ name: "Lavado", organizationId: "org1" }))).resolves.toEqual({
      error: "error_receta_nombre_repetido",
    });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });
});

describe("agregarPasoAction", () => {
  it("pasa a `agregarPaso` el paso que el formulario describe, detrás del paso que dice, y vuelve a la receta", async () => {
    await expect(agregarPasoAction({}, formulario(PASO))).rejects.toThrow("redirect:/recipes/r1?ok=paso_agregado");
    expect(deps.agregar).toHaveBeenCalledTimes(1);
    expect(deps.agregar).toHaveBeenCalledWith("actor", {
      recipeVersionId: "v1",
      despuesDeSeq: 2,
      paso: expect.objectContaining({
        stepTypeValueId: "tipo-lavado",
        horasSugeridas: 6,
        metas: [{ variable: "ph", moment: "final", unit: "pH", targetValue: 3.8, minValue: null, maxValue: null, note: null, everyHours: null }],
      }),
    });
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes/r1");
  });

  it("sin posición, el paso va al principio (`despuesDeSeq: null`)", async () => {
    await expect(agregarPasoAction({}, formulario({ ...PASO, despuesDeSeq: "" }))).rejects.toThrow("redirect:/recipes/r1?ok=paso_agregado");
    expect(deps.agregar).toHaveBeenCalledWith("actor", expect.objectContaining({ despuesDeSeq: null }));
  });

  it("un error del servicio vuelve como estado; un formulario ilegible ni siquiera llega al servicio", async () => {
    deps.agregar.mockRejectedValue(new RecipeError("version_no_es_borrador"));
    await expect(agregarPasoAction({}, formulario(PASO))).resolves.toEqual({ error: "error_receta_version_no_es_borrador" });
    deps.agregar.mockClear();
    // Control: el mismo formulario con un número ilegible se rechaza ANTES del servicio, con el código de su campo.
    await expect(agregarPasoAction({}, formulario({ ...PASO, horasSugeridas: "x" }))).resolves.toEqual({ error: "error_receta_horas_invalidas" });
    expect(deps.agregar).not.toHaveBeenCalled();
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it("la negativa de la autoría (V16) vuelve con su frase como estado, y no navega", async () => {
    deps.agregar.mockRejectedValue(new RecipeError("sin_permiso_de_autoria"));
    await expect(agregarPasoAction({}, formulario(PASO))).resolves.toEqual({ error: "error_receta_sin_permiso_de_autoria" });
    expect(deps.revalidate).not.toHaveBeenCalled();
    // Control: la misma acción, con la autoría concedida, sí navega (las dos pruebas anteriores de esta acción).
    deps.agregar.mockResolvedValue({ id: "p-nuevo" });
    await expect(agregarPasoAction({}, formulario(PASO))).rejects.toThrow("redirect:/recipes/r1?ok=paso_agregado");
  });
});

describe("actualizarPasoAction", () => {
  it("pasa el paso que se edita y su contenido, y vuelve a la receta", async () => {
    await expect(actualizarPasoAction({}, formulario({ ...PASO, stepId: "p9" }))).rejects.toThrow("redirect:/recipes/r1?ok=paso_guardado");
    expect(deps.actualizar).toHaveBeenCalledWith("actor", {
      stepId: "p9",
      paso: expect.objectContaining({ stepTypeValueId: "tipo-lavado", horasSugeridas: 6 }),
    });
    expect(deps.revalidate.mock.calls.map((c) => c[0])).toEqual(["/recipes/r1"]);
  });
});

describe("quitarPasoAction y moverPasoAction", () => {
  it("quitar llama al servicio con el paso, refresca la receta y NO redirige: la lista cambiada es la confirmación", async () => {
    await expect(quitarPasoAction({}, formulario({ recipeId: "r1", stepId: "p3" }))).resolves.toEqual({});
    expect(deps.quitar).toHaveBeenCalledWith("actor", "p3");
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes/r1");
  });

  it("quitar de un paso que ya no está vuelve como estado", async () => {
    deps.quitar.mockRejectedValue(new RecipeError("paso_no_encontrado"));
    await expect(quitarPasoAction({}, formulario({ recipeId: "r1", stepId: "p3" }))).resolves.toEqual({ error: "error_receta_paso_no_encontrado" });
    expect(deps.revalidate).not.toHaveBeenCalled();
  });

  it("mover lleva el paso al lugar que dice el botón", async () => {
    // El lugar es el 2, y no el 1: con un 1, la mutación «aSeq: 1» de la tabla del paso 27 (fila 3) no la vería esta prueba (medido: sólo caía la de «sin posición»).
    await expect(moverPasoAction({}, formulario({ recipeId: "r1", stepId: "p3", aSeq: "2" }))).resolves.toEqual({});
    expect(deps.mover).toHaveBeenCalledWith("actor", { stepId: "p3", aSeq: 2 });
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes/r1");
  });

  it("mover sin posición no inventa una: el servicio recibe NaN y es quien lo rechaza", async () => {
    await moverPasoAction({}, formulario({ recipeId: "r1", stepId: "p3" }));
    expect(deps.mover).toHaveBeenCalledWith("actor", { stepId: "p3", aSeq: Number.NaN });
  });
});

describe("publicar, versión nueva y derivar", () => {
  it("publicar pasa la versión y lleva a la receta con su confirmación", async () => {
    await expect(publicarVersionAction({}, formulario({ recipeId: "r1", recipeVersionId: "v2" }))).rejects.toThrow(
      "redirect:/recipes/r1?ok=version_publicada",
    );
    expect(deps.publicar).toHaveBeenCalledWith("actor", "v2");
    // La receta y la lista (la publicada aparece en la lista): las dos, en cualquier orden.
    expect(deps.revalidate.mock.calls.map((c) => c[0]).sort()).toEqual(["/recipes", "/recipes/r1"]);
  });

  it("publicar un borrador sin pasos vuelve con su frase como estado y no navega: el servicio exige al menos un paso", async () => {
    deps.publicar.mockRejectedValue(new RecipeError("version_sin_pasos"));
    await expect(publicarVersionAction({}, formulario({ recipeId: "r1", recipeVersionId: "v1" }))).resolves.toEqual({
      error: "error_receta_version_sin_pasos",
    });
    expect(deps.revalidate).not.toHaveBeenCalled();
    // Control: la misma acción, con el servicio aceptando, sí navega (la prueba de arriba).
    deps.publicar.mockResolvedValue(undefined);
    await expect(publicarVersionAction({}, formulario({ recipeId: "r1", recipeVersionId: "v1" }))).rejects.toThrow(
      "redirect:/recipes/r1?ok=version_publicada",
    );
  });

  it("empezar una versión nueva parte de la versión que dice el formulario", async () => {
    await expect(nuevaVersionBorradorAction({}, formulario({ recipeId: "r1", desdeVersionId: "v1" }))).rejects.toThrow(
      "redirect:/recipes/r1?ok=borrador_creado",
    );
    expect(deps.nuevaVersion).toHaveBeenCalledWith("actor", "v1");
    // La receta (gana un borrador) y la lista (lo enseña): las dos, en cualquier orden.
    expect(deps.revalidate.mock.calls.map((c) => c[0]).sort()).toEqual(["/recipes", "/recipes/r1"]);
  });

  it("derivar lleva a la copia que devolvió el servicio, no a la plantilla del formulario", async () => {
    const f = formulario({ plantillaVersionId: "vp", organizationId: "org1", nombre: "Mi lavado", recipeId: "r-plantilla" });
    await expect(derivarRecetaAction({}, f)).rejects.toThrow("redirect:/recipes/r-copia?ok=receta_derivada");
    expect(deps.derivar).toHaveBeenCalledWith("actor", { plantillaVersionId: "vp", organizationId: "org1", nombre: "Mi lavado" });
    // Sólo la lista: la copia es una receta nueva, y la plantilla de la que sale no cambia (su `recipeId` del formulario no se usa).
    expect(deps.revalidate.mock.calls.map((c) => c[0])).toEqual(["/recipes"]);
  });
});

describe("sin sesión", () => {
  it("ninguna acción hace nada: todas mandan a /login", async () => {
    deps.user.mockResolvedValue(null);
    const acciones = [
      () => crearRecetaAction({}, formulario({ name: "x" })),
      () => agregarPasoAction({}, formulario(PASO)),
      () => actualizarPasoAction({}, formulario({ ...PASO, stepId: "p9" })),
      () => quitarPasoAction({}, formulario({ recipeId: "r1", stepId: "p3" })),
      () => moverPasoAction({}, formulario({ recipeId: "r1", stepId: "p3", aSeq: "1" })),
      () => publicarVersionAction({}, formulario({ recipeId: "r1", recipeVersionId: "v2" })),
      () => nuevaVersionBorradorAction({}, formulario({ recipeId: "r1", desdeVersionId: "v1" })),
      () => derivarRecetaAction({}, formulario({ plantillaVersionId: "vp", organizationId: "org1", nombre: "x" })),
    ];
    expect(acciones, "control: son las ocho").toHaveLength(8);
    for (const accion of acciones) await expect(accion()).rejects.toThrow("redirect:/login");
    for (const servicio of [deps.crear, deps.agregar, deps.actualizar, deps.quitar, deps.mover, deps.publicar, deps.nuevaVersion, deps.derivar]) {
      expect(servicio).not.toHaveBeenCalled();
    }
  });
});
