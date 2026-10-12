/**
 * Lo que la pantalla DICE cuando la receta que se pasa a abrir rechaza — Parte 2a, tarea 5a (ronda de arreglo del 2026-10-04: C14 y C13
 * del segundo cruce; partida el 2026-10-06).
 *
 * **Por qué existe.** `abrirProceso` lanza cuatro códigos que tienen que ver con la versión que se le pasa —`version_no_publicada` y
 * `receta_de_otra_organizacion`, que esta tarea crea, y `recipe_archived` y `recipe_version_not_found`, que lanzaba desde la
 * Parte 1— (el quinto, `sin_receta`, lo crea la 5b y lo añade a la lista de abajo), y ninguno tenía frase en `CODIGOS_DE_PROCESO_TRADUCIDOS`: una receta archivada ENTRE
 * cargar la pantalla y enviarla salía como «No se pudo registrar el proceso: recipe_archived», con el código crudo. Y el tueste
 * rechaza con `version_no_publicada` una versión que no está publicada o que es de una receta Libre, que salía por el genérico
 * `error_roast` con el código crudo. Los dos últimos sólo con un formulario fabricado; el primero, de verdad.
 *
 * Hermética (sin base), con el patrón de `accionesQueNoCapturaban.test.ts`: los servicios que escriben están simulados —se les
 * hace RECHAZAR—, pero las clases de error son las REALES: `friendlyError` compara con `instanceof`, y una clase inventada por la
 * prueba la dejaría verde sin la rama. `getTranslations` devuelve la clave, así que se afirma sobre la clave; lo que la clave
 * simulada no puede decir —que exista en `messages/es.json` y en `messages/en.json`, y que no enseñe el código crudo— se lee de
 * los JSON.
 *
 * No va a `base-sembrada`: no toca la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dep = vi.hoisted(() => ({ user: vi.fn(), abrir: vi.fn(), registrarTueste: vi.fn(), elegirPerfil: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: dep.user }));
vi.mock("../../lib/traceability/lotProcess", async (original) => ({
  ...(await original<typeof import("../../lib/traceability/lotProcess")>()),
  abrirProceso: dep.abrir,
}));
vi.mock("../../lib/traceability/roasting", async (original) => ({
  ...(await original<typeof import("../../lib/traceability/roasting")>()),
  recordRoastSession: dep.registrarTueste,
  elegirPerfilDeTueste: dep.elegirPerfil,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (ruta: string) => {
    throw new Error(`redirect:${ruta}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((clave: string, params?: { detail?: string }) => (params?.detail ? `${clave}|${params.detail}` : clave)),
}));

import { abrirProcesoAction, elegirPerfilDeTuesteAction, recordRoastSessionAction } from "../../app/actions/traceability";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { RoastSessionValidationError } from "../../lib/traceability/roasting";

const RAIZ = new URL("../..", import.meta.url).pathname;
const traceability = (idioma: string) =>
  JSON.parse(readFileSync(join(RAIZ, `messages/${idioma}.json`), "utf8")).Traceability as Record<string, string>;
const es = traceability("es");
const en = traceability("en");

/** Los códigos de la receta que `abrirProceso` lanza (cuatro en la 5a; la 5b añade `sin_receta` delante). Escritos aquí a mano, como `CODIGOS_QUE_EL_DISENO_NOMBRA`: una lista
 *  que se leyera de la fuente se encogería con ella y las pruebas de abajo recorrerían menos códigos y seguirían en verde. */
const LOS_DE_LA_RECETA = [
  "version_no_publicada",
  "receta_de_otra_organizacion",
  "recipe_archived",
  "recipe_version_not_found",
] as const;

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [clave, valor] of Object.entries(campos)) f.set(clave, valor);
  return f;
}
const abrirForm = () =>
  form({
    lotId: "lote-1",
    intent: "TEST",
    targetMoisturePct: "11",
    processRecipeVersionId: "version-1",
    processGradeValueId: "grado-1",
    cherryStateValueId: "cereza-1",
  });
const elegirForm = () => form({ lotId: "lote-1", recipeVersionId: "version-1" });
const tuesteForm = () =>
  form({
    lotId: "lote-1",
    outputLotCode: "TOST-1",
    purpose: "sample",
    recipeVersionId: "version-1",
    startedAt: "2026-03-12T07:30",
    tzOffsetMinutes: "300",
    provenanceClass: "direct_observation",
  });

beforeEach(() => {
  // `resetAllMocks`, no `clearAllMocks`: vacía también los rechazos que una prueba dejó en cola, y una que falla no arrastra a la
  // siguiente (un `mockRejectedValueOnce` sin consumir se lo comería la prueba de al lado).
  vi.resetAllMocks();
  dep.user.mockResolvedValue({ userAccountId: "actor" });
  dep.abrir.mockResolvedValue({});
  dep.registrarTueste.mockResolvedValue({});
  dep.elegirPerfil.mockResolvedValue({});
});

describe("abrirProcesoAction — cada rechazo de la receta sale con su frase, no con el código crudo", () => {
  it.each(LOS_DE_LA_RECETA)("%s sale con su frase", async (codigo) => {
    dep.abrir.mockRejectedValueOnce(new LotProcessError(codigo));
    await expect(abrirProcesoAction({}, abrirForm())).resolves.toEqual({ error: `error_proceso_${codigo}` });
    expect(dep.abrir, "el servicio no llegó a llamarse: el rechazo salió de otra parte").toHaveBeenCalledTimes(1);
  });

  it("control: un código del proceso sin frase propia sigue por el genérico, con el código de detalle", async () => {
    dep.abrir.mockRejectedValueOnce(new LotProcessError("process_not_found"));
    await expect(abrirProcesoAction({}, abrirForm())).resolves.toEqual({ error: "error_lot_process|process_not_found" });
  });

  it("control: sin rechazo la acción abre y redirige (lo de arriba no viene de un formulario mal armado)", async () => {
    await expect(abrirProcesoAction({}, abrirForm())).rejects.toThrow("redirect:/lots/lote-1/process");
    expect(dep.abrir).toHaveBeenCalledTimes(1);
  });
});

describe("el tueste — una versión que no se puede seguir sale con su frase", () => {
  it("elegir el perfil óptimo con una versión no publicada o Libre", async () => {
    dep.elegirPerfil.mockRejectedValueOnce(new RoastSessionValidationError("version_no_publicada"));
    await expect(elegirPerfilDeTuesteAction({}, elegirForm())).resolves.toEqual({ error: "error_tueste_version_no_publicada" });
    expect(dep.elegirPerfil, "el servicio no llegó a llamarse").toHaveBeenCalledTimes(1);
  });

  it("registrar un tueste con una versión no publicada o Libre", async () => {
    dep.registrarTueste.mockRejectedValueOnce(new RoastSessionValidationError("version_no_publicada"));
    await expect(recordRoastSessionAction({}, tuesteForm())).resolves.toEqual({ error: "error_tueste_version_no_publicada" });
    expect(dep.registrarTueste, "el servicio no llegó a llamarse").toHaveBeenCalledTimes(1);
  });

  it("control: otro rechazo del tueste sigue por el genérico, con su código de detalle", async () => {
    dep.elegirPerfil.mockRejectedValueOnce(new RoastSessionValidationError("recipe_belongs_to_another_organization"));
    dep.registrarTueste.mockRejectedValueOnce(new RoastSessionValidationError("recipe_belongs_to_another_organization"));
    await expect(elegirPerfilDeTuesteAction({}, elegirForm())).resolves.toEqual({
      error: "error_roast|recipe_belongs_to_another_organization",
    });
    await expect(recordRoastSessionAction({}, tuesteForm())).resolves.toEqual({
      error: "error_roast|recipe_belongs_to_another_organization",
    });
  });

  it("control: sin rechazo, elegir devuelve el estado vacío y registrar redirige a la ficha", async () => {
    await expect(elegirPerfilDeTuesteAction({}, elegirForm())).resolves.toEqual({});
    await expect(recordRoastSessionAction({}, tuesteForm())).rejects.toThrow("redirect:/lots/lote-1");
  });
});

describe("los textos, en español y en inglés, y ninguno enseña el código crudo", () => {
  it.each(LOS_DE_LA_RECETA)("error_proceso_%s", (codigo) => {
    for (const [idioma, textos] of [["es", es], ["en", en]] as const) {
      const texto = textos[`error_proceso_${codigo}`];
      expect(texto, `falta ${idioma}:error_proceso_${codigo}`).toBeTruthy();
      expect(texto, `${idioma}: la frase de ${codigo} enseña el código crudo`).not.toContain(codigo);
    }
  });

  it("error_tueste_version_no_publicada", () => {
    for (const [idioma, textos] of [["es", es], ["en", en]] as const) {
      const texto = textos.error_tueste_version_no_publicada;
      expect(texto, `falta ${idioma}:error_tueste_version_no_publicada`).toBeTruthy();
      expect(texto, `${idioma}: la frase del tueste enseña el código crudo`).not.toContain("version_no_publicada");
    }
    expect(es.error_tueste_version_no_publicada, "el texto en inglés es el del español").not.toBe(en.error_tueste_version_no_publicada);
  });

  it("control: el genérico del tueste sigue existiendo y lleva el detalle", () => {
    expect(es.error_roast).toContain("{detail}");
    expect(en.error_roast).toContain("{detail}");
  });
});
