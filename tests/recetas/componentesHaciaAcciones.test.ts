/**
 * De cada componente a su acción, por el HTML que se renderiza — Parte 2a, tarea 14, ronda de arreglo (H2). Hermética: mocks y
 * `renderToStaticMarkup`, sin base.
 *
 * **Por qué existe.** `componentesDelEditor.test.ts` mockea las acciones como `async () => ({})`, y `accionesDelEditor.test.ts` arma el
 * `FormData` a mano. Entre las dos queda un hueco: `renderToStaticMarkup` serializa `action` como una función opaca, así que nada
 * comprobaba que el `name` de un campo oculto fuera el que la acción lee, que el `value` de una opción fuera el id y no el rótulo, ni a
 * cuál de las ocho acciones queda atado cada formulario. Medido en la revisión de T14C: 15 archivos y 436 pruebas en verde con
 * `recipeVersionId`→`versionId` en `PublicarVersionForm`, `desdeVersionId`→`versionId` en `NuevaVersionForm`, `plantillaVersionId`→`plantillaId`
 * en `DerivarRecetaForm`, `name="organizationId"`→`"orgId"` en `RecetaNuevaForm` y las dos acciones de `FormularioDePaso` intercambiadas.
 *
 * **Cómo.** Las acciones son las REALES (`app/actions/traceability.ts`); lo que se simula son los servicios, la sesión y la navegación, igual
 * que en `accionesDelEditor.test.ts`. Y `useActionState` se sustituye por una función que devuelve, en lugar de la acción, una URL
 * (`/__accion/N`) y recuerda a qué acción corresponde: `<form action="…">` la escribe en el HTML, y de ahí sale a cuál queda atado cada
 * formulario. Con eso cada prueba hace lo que el navegador: pinta el componente, arma el `FormData` de su HTML (`formDataDeHtml`: nombres y
 * valores tal cual salieron, sin una lista escrita a mano que pueda derivar), se lo da a la acción a la que el componente dice estar atado
 * y afirma lo que llega al servicio. Los ids son distintos entre sí (`r1`, `v7`, `org2`…), para que un campo leído del `name` de otro no
 * coincida por casualidad.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogosDelEditor } from "../../lib/recetas/catalogosDelEditor";
import { pasoEnBlanco } from "../../lib/recetas/formularioDePaso";
import { aTexto, campos, formDataDeHtml } from "../helpers/htmlDePrueba";
import { traductorDePrueba } from "../helpers/traductorDePrueba";

type Accion = (estado: unknown, datos: FormData) => Promise<unknown>;

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
  /** A qué acción corresponde cada URL `/__accion/N` que `useActionState` escribió en el último render. */
  ligadas: new Map<string, unknown>(),
  idioma: "es" as "es" | "en",
}));
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return {
    ...real,
    // Lo único que cambia: en vez de la función que React ata al formulario, una URL que dice a qué acción se ató.
    useActionState: (accion: unknown, estado: unknown) => {
      const url = `/__accion/${deps.ligadas.size}`;
      deps.ligadas.set(url, accion);
      return [estado, url, false];
    },
  };
});
vi.mock("next-intl", async () => {
  const { traductorDePrueba: traductor } = await import("../helpers/traductorDePrueba");
  return { useTranslations: (espacio: string) => traductor(espacio, deps.idioma) };
});
vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));
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
import { AccionesDelPaso } from "../../app/components/traceability/AccionesDelPaso";
import { DerivarRecetaForm } from "../../app/components/traceability/DerivarRecetaForm";
import { FormularioDePaso } from "../../app/components/traceability/FormularioDePaso";
import { NuevaVersionForm } from "../../app/components/traceability/NuevaVersionForm";
import { PublicarVersionForm } from "../../app/components/traceability/PublicarVersionForm";
import { RecetaNuevaForm } from "../../app/components/traceability/RecetaNuevaForm";

/** Un formulario del html pintado: a qué acción quedó atado, qué mandaría el navegador, y lo que dice. */
interface Enviable {
  accion: Accion;
  datos: FormData;
  texto: string;
}

/** Pinta el componente y devuelve cada uno de sus `<form>` listo para enviar; `elige` es lo que el operario toca antes (ver `formDataDeHtml`). */
function pintarYLigar(elemento: ReactElement, elige: Record<string, string> = {}): { html: string; formularios: Enviable[] } {
  deps.ligadas.clear();
  const html = renderToStaticMarkup(elemento);
  const formularios = [...html.matchAll(/<form\b[^>]*>([\s\S]*?)<\/form>/g)].map((f, i) => {
    const url = /\saction="([^"]*)"/.exec(f[0])?.[1];
    const accion = url === undefined ? undefined : deps.ligadas.get(url);
    if (typeof accion !== "function") throw new Error(`el formulario ${i} no está atado a ninguna acción de useActionState (action="${url}")`);
    return { accion: accion as Accion, datos: formDataDeHtml(html, i, elige), texto: aTexto(f[1]!) };
  });
  return { html, formularios };
}

const ORGANIZACIONES = [
  { id: "org1", name: "Finca Uno" },
  { id: "org2", name: "Finca Dos" },
];

beforeEach(() => {
  vi.clearAllMocks();
  deps.idioma = "es";
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

describe("PublicarVersionForm → publicarVersionAction", () => {
  it("queda atado a la acción de publicar y manda la receta y la versión que pinta, con los nombres que la acción lee", async () => {
    const { formularios } = pintarYLigar(createElement(PublicarVersionForm, { recipeId: "r1", recipeVersionId: "v7" }));
    expect(formularios, "control: un solo formulario").toHaveLength(1);
    const [f] = formularios as [Enviable];
    expect(f.accion).toBe(publicarVersionAction);
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r1?ok=version_publicada");
    expect(deps.publicar).toHaveBeenCalledTimes(1);
    expect(deps.publicar).toHaveBeenCalledWith("actor", "v7");
    expect([...deps.revalidate.mock.calls.map((c) => c[0])].sort()).toEqual(["/recipes", "/recipes/r1"]);
  });
});

describe("NuevaVersionForm → nuevaVersionBorradorAction", () => {
  it("queda atado a la acción de la versión nueva y manda la receta y la versión de la que parte, con los nombres que la acción lee", async () => {
    const { formularios } = pintarYLigar(createElement(NuevaVersionForm, { recipeId: "r1", desdeVersionId: "v3" }));
    expect(formularios, "control: un solo formulario").toHaveLength(1);
    const [f] = formularios as [Enviable];
    expect(f.accion).toBe(nuevaVersionBorradorAction);
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r1?ok=borrador_creado");
    expect(deps.nuevaVersion).toHaveBeenCalledTimes(1);
    expect(deps.nuevaVersion).toHaveBeenCalledWith("actor", "v3");
    expect([...deps.revalidate.mock.calls.map((c) => c[0])].sort()).toEqual(["/recipes", "/recipes/r1"]);
  });
});

describe("DerivarRecetaForm → derivarRecetaAction", () => {
  const props = { plantillaVersionId: "vp", nombreSugerido: "Copia de lavado", organizations: ORGANIZACIONES };

  it("queda atado a la acción de derivar y, enviado tal cual, manda la plantilla, el nombre sugerido y la primera organización", async () => {
    const { formularios } = pintarYLigar(createElement(DerivarRecetaForm, props));
    expect(formularios, "control: un solo formulario").toHaveLength(1);
    const [f] = formularios as [Enviable];
    expect(f.accion).toBe(derivarRecetaAction);
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r-copia?ok=receta_derivada");
    expect(deps.derivar).toHaveBeenCalledWith("actor", { plantillaVersionId: "vp", organizationId: "org1", nombre: "Copia de lavado" });
  });

  it("elegir la segunda organización por su rótulo manda su id, y lo que el operario teclea como nombre llega tal cual", async () => {
    // El rótulo es «Finca Dos» y el id «org2»: un `value` que fuera el rótulo mandaría «Finca Dos».
    const { formularios } = pintarYLigar(createElement(DerivarRecetaForm, props), { organizationId: "Finca Dos", nombre: "Mi lavado" });
    const [f] = formularios as [Enviable];
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r-copia?ok=receta_derivada");
    expect(deps.derivar).toHaveBeenCalledWith("actor", { plantillaVersionId: "vp", organizationId: "org2", nombre: "Mi lavado" });
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes");
  });
});

describe("RecetaNuevaForm → crearRecetaAction", () => {
  const props = { organizations: ORGANIZACIONES, permiteCompartida: true };
  const rotuloCompartida = traductorDePrueba("Traceability")("recipeSharedOption");

  it("queda atado a la acción de crear y manda el nombre, la descripción y la organización que se eligen, con los nombres que la acción lee", async () => {
    const { formularios } = pintarYLigar(createElement(RecetaNuevaForm, props), {
      name: "Lavado nuevo",
      description: "Con mucho cuidado",
      organizationId: "Finca Dos",
    });
    expect(formularios, "control: un solo formulario").toHaveLength(1);
    const [f] = formularios as [Enviable];
    expect(f.accion).toBe(crearRecetaAction);
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r-nueva?ok=receta_creada");
    expect(deps.crear).toHaveBeenCalledWith("actor", { name: "Lavado nuevo", description: "Con mucho cuidado", organizationId: "org2" });
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes");
  });

  it("la opción de receta compartida manda una organización vacía, que la acción vuelve nula; sin descripción, nula también", async () => {
    const { formularios } = pintarYLigar(createElement(RecetaNuevaForm, props), { name: "Plantilla común", organizationId: rotuloCompartida });
    const [f] = formularios as [Enviable];
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r-nueva?ok=receta_creada");
    expect(deps.crear).toHaveBeenCalledWith("actor", { name: "Plantilla común", description: null, organizationId: null });
  });

  it("el ejemplo del campo de nombre pasa por el traductor: en español y en inglés dice cada idioma lo suyo (no es un texto fijo)", () => {
    const ejemplo = (html: string) => /placeholder="([^"]*)"/.exec(campos(html, "name")[0]!)?.[1];
    expect(ejemplo(pintarYLigar(createElement(RecetaNuevaForm, props)).html)).toBe("Lavado tradicional");
    deps.idioma = "en";
    expect(ejemplo(pintarYLigar(createElement(RecetaNuevaForm, props)).html)).toBe("Traditional washed");
  });
});

describe("AccionesDelPaso → sus acciones", () => {
  it("subir y bajar quedan atados a mover, con el lugar al que van; quitar, a quitar; y los tres mandan el paso y la receta que pintan", async () => {
    const { formularios } = pintarYLigar(createElement(AccionesDelPaso, { recipeId: "r1", stepId: "p2", seq: 2, total: 3 }));
    expect(formularios, "control: subir, bajar y quitar").toHaveLength(3);
    const [subir, bajar, quitar] = formularios as [Enviable, Enviable, Enviable];
    expect(subir.texto).toContain("Subir paso");
    expect(bajar.texto).toContain("Bajar paso");
    expect(quitar.texto).toContain("Quitar paso");
    expect(subir.accion).toBe(moverPasoAction);
    expect(bajar.accion).toBe(moverPasoAction);
    expect(quitar.accion).toBe(quitarPasoAction);

    await expect(subir.accion({}, subir.datos)).resolves.toEqual({});
    expect(deps.mover).toHaveBeenLastCalledWith("actor", { stepId: "p2", aSeq: 1 });
    expect(deps.revalidate).toHaveBeenLastCalledWith("/recipes/r1");
    await expect(bajar.accion({}, bajar.datos)).resolves.toEqual({});
    expect(deps.mover).toHaveBeenLastCalledWith("actor", { stepId: "p2", aSeq: 3 });
    expect(deps.mover).toHaveBeenCalledTimes(2);

    deps.revalidate.mockClear();
    await expect(quitar.accion({}, quitar.datos)).resolves.toEqual({});
    expect(deps.quitar).toHaveBeenCalledTimes(1);
    expect(deps.quitar).toHaveBeenCalledWith("actor", "p2");
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes/r1");
  });
});

describe("FormularioDePaso → su acción", () => {
  const CATALOGOS: CatalogosDelEditor = {
    tipos: [],
    estadoFruto: [],
    oxigeno: [],
    temperatura: [],
    fuenteMicrobiana: [],
    medio: [],
    fisico: [],
    sustrato: [],
    levadura: [],
    capacidad: [],
  };
  const base = {
    recipeId: "r9",
    recipeVersionId: "v9",
    tipos: [{ id: "tipo-washing", tipo: "washing" as const, etiqueta: "Lavado" }],
    catalogos: CATALOGOS,
    modosDeSecado: [],
    variables: [],
    referencias: {},
    sinonimos: [],
  };
  const inicial = { ...pasoEnBlanco(), stepTypeValueId: "tipo-washing", intencion: "Lavar hasta que corra limpio", horasSugeridas: "6" };

  it("al agregar queda atado a la acción de agregar y manda la versión, el lugar y el paso; la de editar no se toca", async () => {
    const { formularios } = pintarYLigar(createElement(FormularioDePaso, { ...base, modo: "agregar", despuesDeSeq: 4, inicial }));
    expect(formularios, "control: un solo formulario").toHaveLength(1);
    const [f] = formularios as [Enviable];
    expect(f.accion).toBe(agregarPasoAction);
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r9?ok=paso_agregado");
    expect(deps.agregar).toHaveBeenCalledTimes(1);
    expect(deps.agregar).toHaveBeenCalledWith("actor", {
      recipeVersionId: "v9",
      despuesDeSeq: 4,
      paso: expect.objectContaining({ stepTypeValueId: "tipo-washing", intencion: "Lavar hasta que corra limpio", horasSugeridas: 6 }),
    });
    expect(deps.actualizar).not.toHaveBeenCalled();
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes/r9");
  });

  it("al agregar sin lugar, el paso va al principio (el campo oculto viaja vacío)", async () => {
    const { formularios } = pintarYLigar(createElement(FormularioDePaso, { ...base, modo: "agregar", despuesDeSeq: null, inicial }));
    const [f] = formularios as [Enviable];
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r9?ok=paso_agregado");
    expect(deps.agregar).toHaveBeenCalledWith("actor", expect.objectContaining({ despuesDeSeq: null }));
  });

  it("al editar queda atado a la acción de actualizar y manda qué paso es y su contenido; la de agregar no se toca", async () => {
    const { formularios } = pintarYLigar(createElement(FormularioDePaso, { ...base, modo: "editar", stepId: "paso-9", inicial }));
    expect(formularios, "control: un solo formulario").toHaveLength(1);
    const [f] = formularios as [Enviable];
    expect(f.accion).toBe(actualizarPasoAction);
    await expect(f.accion({}, f.datos)).rejects.toThrow("redirect:/recipes/r9?ok=paso_guardado");
    expect(deps.actualizar).toHaveBeenCalledTimes(1);
    expect(deps.actualizar).toHaveBeenCalledWith("actor", {
      stepId: "paso-9",
      paso: expect.objectContaining({ stepTypeValueId: "tipo-washing", intencion: "Lavar hasta que corra limpio", horasSugeridas: 6 }),
    });
    expect(deps.agregar).not.toHaveBeenCalled();
    expect(deps.revalidate).toHaveBeenCalledWith("/recipes/r9");
  });
});
