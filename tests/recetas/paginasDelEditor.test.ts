/**
 * Las pantallas del editor de recetas, renderizadas — Parte 2a, tarea 14 (2026-10-03; integrada el 2026-10-04). Hermética: el patrón de `pagina-del-tablero.test.ts`.
 *
 * Cada página es la función `async` que es, y se renderiza con `renderToReadableStream` y los textos REALES de `messages/es.json` (`traductorDePrueba`:
 * una clave que falta revienta la prueba). Sólo se simulan los bordes que exigen sesión y base: la sesión, el permiso de autoría (`puedeAutoriaDeReceta`: V16, el del
 * Coffee Process Manager), la lectura de la receta y de sus pasos, los vocabularios y las acciones. Todo lo demás —el formulario del paso, los componentes de la lista,
 * las referencias del paquete y sus sinónimos— es el código real.
 *
 * Lo que se vigila es la regla de Daniel del 2026-09-27 («si no tengo un permiso, no me muestres botones ni expliques»), que cada confirmación `?ok=` tenga su
 * rama y su texto (también la de convertir una Libre, cuya acción es de la tarea 13, en el PR-B), que una Libre no salga en la lista y se vea de sólo lectura, y que las metas de versión de antes de los pasos se
 * enseñen sin controles — también las de las versiones ANTERIORES del historial —. Y qué pasa cuando la lectura de la receta o de la lista lanza: una receta que ya no
 * existe (`ProcessTargetError`) vuelve a la lista desde la receta y desde las dos pantallas de un paso, y cualquier otro error sube tal cual, sin disfrazarse de redirección.
 * Cada afirmación lleva su control, para que no pase vacía.
 */
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogosDelEditor, ValorDeCatalogo } from "../../lib/recetas/catalogosDelEditor";
import { TIPOS_DE_PASO } from "../../lib/recetas/vocabulario";
import { pasoDeFormulario } from "../../lib/recetas/formularioDePaso";
import { aTexto, campos, controlesFueraDelFieldset, fieldsetDeshabilitado, formDataDeHtml, opciones } from "../helpers/htmlDePrueba";

const estado = vi.hoisted(() => ({
  receta: null as unknown,
  pasos: new Map<string, unknown[]>(),
  puede: (_organizacion: string | null): boolean => true,
  organizaciones: [] as { id: string; name: string }[],
  recetas: [] as unknown[],
  puedeCrear: true,
  catalogos: null as unknown,
  /** Lo que `getRecipeForEditor` lanza en vez de devolver la receta (nulo: la devuelve). */
  fallaAlLeer: null as Error | null,
  /** Lo que `listRecipes` lanza en vez de devolver la lista (nulo: la devuelve). */
  fallaAlListar: null as Error | null,
}));

vi.mock("next-intl/server", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { getTranslations: async (espacio: string) => traductorDePrueba(espacio) };
});
vi.mock("next-intl", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { useTranslations: (espacio: string) => traductorDePrueba(espacio) };
});
vi.mock("next/navigation", () => ({
  redirect: (ruta: string) => {
    throw new Error(`redirect:${ruta}`);
  },
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: async () => ({ userAccountId: "cuenta-de-prueba" }) }));
vi.mock("../../lib/recetas/autoria", () => ({
  puedeAutoriaDeReceta: async (_cuenta: string, organizacion: string | null) => estado.puede(organizacion),
}));
vi.mock("../../lib/traceability/processTargets", () => ({
  getRecipeForEditor: async () => {
    if (estado.fallaAlLeer) throw estado.fallaAlLeer;
    return estado.receta;
  },
  listRecipes: async () => {
    if (estado.fallaAlListar) throw estado.fallaAlListar;
    return estado.recetas;
  },
  listRecipeOrganizations: async () => estado.organizaciones,
  puedeCrearRecetaEnAlguna: async () => estado.puedeCrear,
  ProcessTargetError: class ProcessTargetError extends Error {},
}));
vi.mock("../../lib/recetas/pasos", () => ({
  pasosDeLaVersion: async (_cuenta: string, versionId: string) => estado.pasos.get(versionId) ?? [],
}));
vi.mock("../../lib/recetas/catalogosDelEditor", () => ({ catalogosDelEditor: async () => estado.catalogos }));
vi.mock("../../app/actions/traceability", () => {
  const accion = async () => ({});
  return {
    crearRecetaAction: accion,
    updateRecipeAction: accion,
    agregarPasoAction: accion,
    actualizarPasoAction: accion,
    quitarPasoAction: accion,
    moverPasoAction: accion,
    publicarVersionAction: accion,
    nuevaVersionBorradorAction: accion,
    derivarRecetaAction: accion,
  };
});

import RecipeDetailPage from "../../app/recipes/[id]/page";
import EditarPasoPage from "../../app/recipes/[id]/pasos/[stepId]/page";
import NuevoPasoPage from "../../app/recipes/[id]/pasos/nuevo/page";
import NewRecipePage from "../../app/recipes/new/page";
import RecipesPage from "../../app/recipes/page";
import { ProcessTargetError } from "../../lib/traceability/processTargets";

async function pintar(jsx: ReactElement): Promise<string> {
  const flujo = await renderToReadableStream(jsx);
  await flujo.allReady;
  return await new Response(flujo).text();
}

const veces = (texto: string, frase: string): number => texto.split(frase).length - 1;

const valor = (id: string, value: string): ValorDeCatalogo => ({ id, value, definition: `Definición de ${value}` });
function catalogosDePrueba(): CatalogosDelEditor {
  return {
    tipos: TIPOS_DE_PASO.map((tipo) => valor(`tipo-${tipo}`, tipo)),
    estadoFruto: [valor("ef-entera", "entera")],
    oxigeno: [valor("ox-aer", "aerobico")],
    temperatura: [valor("te-amb", "ambiente")],
    fuenteMicrobiana: [valor("fm-ninguna", "ninguna")],
    medio: [valor("me-agua", "agua_limpia")],
    fisico: [valor("fi-ninguno", "ninguno")],
    sustrato: [valor("su-mosto", "doble_mosto")],
    levadura: [valor("le-mp72", "MP72")],
    capacidad: [valor("ca-sellable", "sellable")],
  };
}

/** Un paso como lo devuelve `pasosDeLaVersion`: todo dicho, lo que no se declaró es nulo, falso o una lista vacía. */
function paso(id: string, seq: number, tipo: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    seq,
    tipo,
    stepTypeValueId: `tipo-${tipo}`,
    intencion: null,
    opcional: false,
    estadoFrutoValueId: null,
    mucilagoObjetivo: null,
    oxigenoValueId: null,
    temperaturaValueId: null,
    temperaturaMinC: null,
    temperaturaMaxC: null,
    fuenteMicrobianaValueId: null,
    medioValueId: null,
    fisicoValueId: null,
    modoSecado: null,
    horasMin: null,
    horasSugeridas: null,
    horasMax: null,
    volteoCadaHoras: null,
    humedadMinPct: null,
    humedadMaxPct: null,
    finPorTiempo: false,
    reglaDeFin: "first",
    adiciones: [],
    fines: [],
    capacidadesRequeridas: [],
    metas: [],
    ...extra,
  };
}

function version(id: string, numero: number, status: "draft" | "approved", extra: Record<string, unknown> = {}) {
  return {
    id,
    version: numero,
    status,
    notes: null,
    createdAt: new Date("2026-10-01T15:00:00Z"),
    expectedHours: null,
    targets: [],
    _count: { fermentationRuns: 0 },
    ...extra,
  };
}

function receta(versions: unknown[], extra: Record<string, unknown> = {}) {
  return {
    id: "r1",
    name: "Lavado tradicional",
    description: null,
    organizationId: "org1",
    organization: { id: "org1", name: "Finca A" },
    versions,
    ...extra,
  };
}

const CON_PASOS = [
  paso("p1", 1, "pulping", { intencion: "Despulpar el mismo día" }),
  paso("p2", 2, "fermentation", { opcional: true, horasSugeridas: 48 }),
];

function pintarReceta(ok?: string): Promise<string> {
  return RecipeDetailPage({ params: Promise.resolve({ id: "r1" }), searchParams: Promise.resolve(ok === undefined ? {} : { ok }) }).then(pintar);
}

beforeEach(() => {
  estado.receta = null;
  estado.pasos = new Map();
  estado.puede = () => true;
  estado.organizaciones = [];
  estado.recetas = [];
  estado.puedeCrear = true;
  estado.catalogos = catalogosDePrueba();
  estado.fallaAlLeer = null;
  estado.fallaAlListar = null;
});

describe("la pantalla de una receta (/recipes/[id])", () => {
  const BORRADOR = () => {
    estado.receta = receta([version("v2", 2, "draft"), version("v1", 1, "approved")]);
    estado.pasos.set("v2", CON_PASOS);
    estado.pasos.set("v1", [paso("q1", 1, "washing")]);
  };
  const CONTROLES = ["Añadir paso", "Publicar versión", "Subir paso", "Bajar paso", "Quitar paso", "Editar paso", "Empezar versión nueva", "Derivar copia"];

  it("un borrador, con permiso: sus pasos, y todo lo que se puede hacer con ellos", async () => {
    BORRADOR();
    const html = await pintarReceta();
    const texto = aTexto(html);
    expect(texto).toContain("Pasos de la versión 2");
    expect(texto).toContain("Despulpar el mismo día");
    expect(texto).toContain("48 h sugeridas");
    expect(texto).toContain("Nombre y descripción");
    // El primero no sube y el último no baja; los dos se pueden editar y quitar.
    expect([veces(texto, "Subir paso"), veces(texto, "Bajar paso"), veces(texto, "Quitar paso"), veces(texto, "Editar paso")]).toEqual([1, 1, 2, 2]);
    // Añadir va detrás del último paso, y editar lleva a ESE paso.
    expect(html).toContain('href="/recipes/r1/pasos/nuevo?despues=2"');
    expect(html).toContain('href="/recipes/r1/pasos/p1"');
    expect(veces(texto, "Añadir paso")).toBe(1);
    expect(veces(texto, "Publicar versión")).toBe(1);
    expect(texto).not.toContain("Empezar versión nueva");
  });

  it("un borrador sin pasos no ofrece publicar, y añadir va al principio", async () => {
    estado.receta = receta([version("v1", 1, "draft")]);
    const html = await pintarReceta();
    const texto = aTexto(html);
    expect(texto).toContain("Esta versión todavía no tiene pasos.");
    expect(html).toContain('href="/recipes/r1/pasos/nuevo"');
    expect(texto).not.toContain("Publicar versión");
    // Control: el mismo borrador con un paso sí lo ofrece.
    estado.pasos.set("v1", [paso("p1", 1, "washing")]);
    expect(aTexto(await pintarReceta())).toContain("Publicar versión");
  });

  it("un borrador, SIN permiso: no se pinta —se ve la versión publicada—, y ningún control ni ninguna disculpa", async () => {
    BORRADOR();
    estado.puede = () => false;
    const texto = aTexto(await pintarReceta());
    // Los pasos del borrador (v2) no se ven; la sección principal es la de la publicada (v1, con un paso de lavado).
    expect(texto).not.toContain("Despulpar el mismo día");
    expect(texto).toContain("Pasos de la versión 1");
    expect(texto).not.toContain("Pasos de la versión 2");
    for (const control of [...CONTROLES, "Nombre y descripción"]) expect(texto, control).not.toContain(control);
    // Daniel, 2026-09-27: lo que no puedes hacer no se muestra, y no se explica.
    expect(texto).not.toContain("permiso");
    // Control: con permiso, el MISMO borrador sí se ve (si no, «no se ve» podría ser un borrador que la pantalla nunca pinta).
    estado.puede = () => true;
    expect(aTexto(await pintarReceta())).toContain("Despulpar el mismo día");
  });

  describe("«versión vigente» es la publicada más alta; el borrador se pinta sólo a quien puede escribirlo (F1-6)", () => {
    it("un borrador v2 encima de una publicada v1: el lector sin autoría ve la v1 como vigente y no ve el borrador; el autor ve el borrador y la v1 como vigente", async () => {
      BORRADOR();
      estado.puede = () => false;
      const lector = aTexto(await pintarReceta());
      expect(lector).toContain("versión vigente: v1");
      expect(lector).not.toContain("versión vigente: v2");
      expect(lector).toContain("Pasos de la versión 1");
      expect(lector).not.toContain("Pasos de la versión 2");
      expect(lector, "ni el rótulo ni la tarjeta del historial ni el texto del borrador").not.toMatch(/borrador|Versión 2/i);
      expect(lector, "sólo cuenta lo que se ve").toContain("1 versión(es)");

      estado.puede = () => true;
      const autor = aTexto(await pintarReceta());
      // «Vigente» es la publicada para todos: que la v2 sea la que se está escribiendo no la vuelve vigente.
      expect(autor).toContain("versión vigente: v1");
      expect(autor).not.toContain("versión vigente: v2");
      // El autor tiene delante el borrador, y la v1 en el historial.
      expect(autor).toContain("Pasos de la versión 2");
      expect(autor).toContain("Despulpar el mismo día");
      expect(autor).toContain("Versión 1");
      expect(autor).toContain("2 versión(es)");
    });

    it("con una publicada v3, un borrador v2 que no existe a la vista y una v1, el lector ve la v3 arriba y la v1 en el historial, y el autor igual", async () => {
      estado.receta = receta([version("v3", 3, "approved"), version("v2", 2, "draft"), version("v1", 1, "approved")]);
      estado.pasos.set("v3", [paso("c1", 1, "drying")]);
      estado.pasos.set("v2", [paso("b1", 1, "pulping", { intencion: "Solo el borrador" })]);
      estado.pasos.set("v1", [paso("a1", 1, "washing")]);
      estado.puede = () => false;
      const lector = aTexto(await pintarReceta());
      expect(lector).toContain("versión vigente: v3");
      expect(lector).toContain("Pasos de la versión 3");
      expect(lector).toContain("Versión 1");
      expect(lector).not.toContain("Versión 2");
      expect(lector).not.toContain("Solo el borrador");
      expect(lector).toContain("2 versión(es)");
      // Control: el autor ve las tres, con el borrador en el historial.
      estado.puede = () => true;
      const autor = aTexto(await pintarReceta());
      expect(autor).toContain("versión vigente: v3");
      expect(autor).toContain("3 versión(es)");
      expect(autor).toContain("Versión 2");
    });

    it("sin ninguna versión publicada, el lector sin autoría ve la receta sin versión vigente y sin borrador; el autor ve el borrador", async () => {
      estado.receta = receta([version("v1", 1, "draft")]);
      estado.pasos.set("v1", [paso("b1", 1, "pulping", { intencion: "Solo el borrador" })]);
      estado.puede = () => false;
      const lector = aTexto(await pintarReceta());
      expect(lector).toContain("Lavado tradicional");
      expect(lector).not.toContain("versión vigente");
      expect(lector).not.toContain("Solo el borrador");
      expect(lector).not.toMatch(/borrador|Pasos de la versión/i);
      expect(lector).toContain("0 versión(es)");
      // Control: el autor sí lo ve (y, sin publicada, no hay «vigente»).
      estado.puede = () => true;
      const autor = aTexto(await pintarReceta());
      expect(autor).toContain("Solo el borrador");
      expect(autor).toContain("Pasos de la versión 1");
      expect(autor).not.toContain("versión vigente");
    });

    it("derivar una plantilla usa la publicada más alta, no el borrador que la encabeza", async () => {
      estado.receta = receta([version("v2", 2, "draft"), version("v1", 1, "approved")], { organizationId: null, organization: null, name: "Lavado base" });
      estado.pasos.set("v1", [paso("q1", 1, "washing")]);
      estado.organizaciones = [{ id: "orgA", name: "Finca A" }];
      estado.puede = (organizacion) => organizacion === "orgA";
      // Sin autoría sobre la plantilla (sólo sobre la organización A) el borrador no se ve, y derivar se ofrece desde la v1.
      const html = await pintarReceta();
      expect(aTexto(html)).toContain("Derivar copia");
      expect(campos(html, "plantillaVersionId")[0]).toMatch(/value="v1"/);
    });
  });

  it("una versión publicada, con permiso: «Empezar versión nueva» y ningún control de edición", async () => {
    estado.receta = receta([version("v1", 1, "approved")]);
    estado.pasos.set("v1", [paso("p1", 1, "washing")]);
    const texto = aTexto(await pintarReceta());
    expect(texto).toContain("Empezar versión nueva");
    expect(texto).toContain("Versión publicada: no se edita.");
    for (const control of ["Añadir paso", "Publicar versión", "Subir paso", "Bajar paso", "Quitar paso", "Editar paso"]) {
      expect(texto, control).not.toContain(control);
    }
    // Control: una Libre —lo que ocurrió en un lote— no tiene «versión siguiente», aunque quien mira pueda editar.
    estado.receta = receta([version("v1", 1, "approved")], { esLibre: true });
    expect(aTexto(await pintarReceta())).not.toContain("Empezar versión nueva");
  });

  it("una versión publicada, sin permiso: ni nueva versión ni nada", async () => {
    estado.receta = receta([version("v1", 1, "approved")]);
    estado.pasos.set("v1", [paso("p1", 1, "washing")]);
    estado.puede = () => false;
    const texto = aTexto(await pintarReceta());
    expect(texto).toContain("Versión publicada: no se edita.");
    for (const control of CONTROLES) expect(texto, control).not.toContain(control);
  });

  it("una plantilla publicada se deriva a las organizaciones donde se puede, y a ninguna otra", async () => {
    estado.receta = receta([version("v1", 1, "approved")], { organizationId: null, organization: null, name: "Lavado base" });
    estado.pasos.set("v1", [paso("p1", 1, "washing")]);
    estado.organizaciones = [
      { id: "orgA", name: "Finca A" },
      { id: "orgB", name: "Finca B" },
    ];
    estado.puede = (organizacion) => organizacion === "orgA";
    const html = await pintarReceta();
    const texto = aTexto(html);
    expect(texto).toContain("Plantilla (todas las organizaciones)");
    expect(texto).toContain("Copiar a mi organización");
    expect(texto).toContain("Derivar copia");
    expect(opciones(html, "organizationId")).toEqual(["Finca A"]);
    // La plantilla no se edita desde una organización: ni nueva versión ni metadatos.
    expect(texto).not.toContain("Empezar versión nueva");
    // Control: sin permiso en ninguna organización, ni el formulario.
    estado.puede = () => false;
    expect(aTexto(await pintarReceta())).not.toContain("Derivar copia");
    // Control: una receta de una organización no se deriva, aunque quien mira pueda crear en otras (derivar es de las plantillas, diseño §3.4).
    estado.puede = () => true;
    estado.receta = receta([version("v1", 1, "approved")]);
    expect(aTexto(await pintarReceta())).not.toContain("Derivar copia");
  });

  it("una receta Libre se ve de sólo lectura: sus pasos, su rótulo y ningún control, ni para quien puede escribir recetas", async () => {
    estado.receta = receta([version("v1", 1, "approved")], { esLibre: true, name: "Plan de la fermentación corta" });
    estado.pasos.set("v1", CON_PASOS);
    estado.puede = () => true;
    const html = await pintarReceta();
    const texto = aTexto(html);
    expect(texto).toContain("Despulpar el mismo día");
    expect(veces(texto, "Libre"), "el rótulo «Libre», una vez").toBe(1);
    for (const control of [...CONTROLES, "Nombre y descripción"]) expect(texto, control).not.toContain(control);
    expect(campos(html, "name")).toEqual([]);
    // Control: la MISMA receta sin ser Libre, con el mismo permiso, sí enseña lo que se puede hacer con ella.
    estado.receta = receta([version("v1", 1, "approved")], { name: "Plan de la fermentación corta" });
    const normal = aTexto(await pintarReceta());
    expect(veces(normal, "Libre")).toBe(0);
    expect(normal).toContain("Nombre y descripción");
    expect(normal).toContain("Empezar versión nueva");
  });

  const CONFIRMACIONES: [string, string][] = [
    ["renamed", "Nombre actualizado."],
    ["receta_creada", "Receta creada como borrador."],
    ["paso_agregado", "Paso añadido."],
    ["paso_guardado", "Paso guardado."],
    ["version_publicada", "Versión publicada. Ya se puede elegir"],
    ["borrador_creado", "Borrador creado con una copia"],
    ["receta_derivada", "Copia creada como borrador"],
    // La que escribirá `convertirLibreAction` (tarea 13, PR-B): el lector va aquí, con el editor, para que cuando la 13 redirija con `?ok=convertida` la confirmación se vea (sin esta rama confirmaría en silencio: guardia `confirmacion-que-se-lee`).
    ["convertida", "Receta creada desde la Libre, como borrador."],
  ];

  it.each(CONFIRMACIONES)("?ok=%s se confirma con su texto, y sólo con ese", async (ok, frase) => {
    BORRADOR();
    const texto = aTexto(await pintarReceta(ok));
    expect(texto).toContain(frase);
    for (const [otro, otraFrase] of CONFIRMACIONES) {
      if (otro !== ok) expect(texto, `con ?ok=${ok} salió el texto de ?ok=${otro}`).not.toContain(otraFrase);
    }
  });

  it("un código desconocido no confirma nada", async () => {
    BORRADOR();
    const texto = aTexto(await pintarReceta("cualquier-cosa"));
    for (const [, frase] of CONFIRMACIONES) expect(texto).not.toContain(frase);
  });

  it("una receta de antes de los pasos enseña sus metas de versión, y no las de un paso", async () => {
    const decimal = (n: string) => ({ toString: () => n });
    estado.receta = receta([
      version("v1", 1, "approved", {
        targets: [
          { id: "t1", variable: "ph", moment: "final", unit: "pH", targetValue: decimal("3.8"), minValue: null, maxValue: null, note: null, recipeStepId: null },
          { id: "t2", variable: "moisture", moment: "final", unit: "%", targetValue: decimal("11.5"), minValue: null, maxValue: null, note: null, recipeStepId: "p9" },
        ],
      }),
    ]);
    estado.pasos.set("v1", []);
    const texto = aTexto(await pintarReceta());
    expect(texto).toContain("Metas de la versión (de antes de los pasos)");
    expect(texto).toContain("3.8 pH");
    expect(texto).toContain("Esta versión todavía no tiene pasos.");
    // Control: la meta de un paso no es de la versión.
    expect(texto).not.toContain("11.5");
  });

  it("el historial enseña los pasos de cada versión anterior, sin controles", async () => {
    estado.receta = receta([version("v2", 2, "approved"), version("v1", 1, "approved", { _count: { fermentationRuns: 3 } })]);
    estado.pasos.set("v2", [paso("p1", 1, "washing")]);
    estado.pasos.set("v1", [paso("q1", 1, "pulping"), paso("q2", 2, "drying")]);
    const texto = aTexto(await pintarReceta());
    expect(texto).toContain("Versión 1");
    expect(texto).toContain("3 corrida(s)");
    expect(texto).toContain("Ver los 2 pasos");
    expect(texto).toContain("Secado");
    expect(texto).not.toContain("Editar paso");
  });

  it("el historial enseña las metas de versión de una versión anterior, y no las de un paso", async () => {
    const decimal = (n: string) => ({ toString: () => n });
    // La vigente (v2) no lleva metas de versión: todo lo que salga con cifras es del historial. La v1 lleva una meta de versión y una de un paso.
    estado.receta = receta([
      version("v2", 2, "approved"),
      version("v1", 1, "approved", {
        targets: [
          { id: "t1", variable: "ph", moment: "final", unit: "pH", targetValue: decimal("3.8"), minValue: null, maxValue: null, note: null, recipeStepId: null },
          { id: "t2", variable: "moisture", moment: "final", unit: "%", targetValue: decimal("11.5"), minValue: null, maxValue: null, note: null, recipeStepId: "p9" },
        ],
      }),
    ]);
    estado.pasos.set("v2", [paso("p1", 1, "washing")]);
    estado.pasos.set("v1", []);
    const texto = aTexto(await pintarReceta());
    expect(texto).not.toContain("Metas de la versión (de antes de los pasos)");
    expect(texto, "la tarjeta de la versión 1, del historial").toContain("Versión 1");
    expect(texto).toContain("3.8 pH");
    // Control: la meta de un paso no es de la versión, tampoco en el historial.
    expect(texto).not.toContain("11.5");
  });

  it("una receta que ya no existe vuelve a la lista, y un error de otra clase sube tal cual", async () => {
    estado.fallaAlLeer = new ProcessTargetError("recipe_not_found");
    await expect(pintarReceta()).rejects.toThrow("redirect:/recipes");
    // Control: lo que no es un `ProcessTargetError` no se disfraza de «la receta no existe».
    const otro = new Error("la base no responde");
    estado.fallaAlLeer = otro;
    await expect(pintarReceta()).rejects.toBe(otro);
    // Control: sin fallo, la misma pantalla se pinta.
    estado.fallaAlLeer = null;
    estado.receta = receta([version("v1", 1, "approved")]);
    expect(aTexto(await pintarReceta())).toContain("Lavado tradicional");
  });
});

describe("la lista de recetas (/recipes)", () => {
  it("no pinta las recetas Libres, dice qué versión está publicada y si hay borrador, y marca la plantilla", async () => {
    estado.recetas = [
      {
        id: "a",
        name: "Lavado tradicional",
        description: "Con fermentación",
        esLibre: false,
        organization: { name: "Finca A" },
        versions: [{ id: "a2", version: 2, status: "draft" }, { id: "a1", version: 1, status: "approved" }],
      },
      {
        id: "l",
        name: "Libre — probar anaeróbico — LOTE-9 2026-10-03",
        description: null,
        esLibre: true,
        organization: { name: "Finca A" },
        versions: [{ id: "l1", version: 1, status: "approved" }],
      },
      {
        id: "p",
        name: "Honey base",
        description: null,
        esLibre: false,
        organization: null,
        versions: [{ id: "p1", version: 1, status: "approved" }],
      },
    ];
    const texto = aTexto(await pintar(await RecipesPage()));
    expect(texto).toContain("Lavado tradicional");
    expect(texto).toContain("Publicada: v1");
    expect(texto).toContain("Borrador: v2");
    expect(texto).toContain("Honey base");
    expect(texto).toContain("Plantilla (todas las organizaciones)");
    // La Libre es lo que ocurrió en un lote, no un catálogo (diseño §5.2).
    expect(texto).not.toContain("Libre — probar anaeróbico");
  });

  it("lo que lance listRecipes sube tal cual: la pantalla no lo convierte en una redirección", async () => {
    // Quien no opera lotes ni escribe recetas recibe de `listRecipes` el rechazo de acceso, y la pantalla no lo atrapa (ve la página de error); un error de cualquier
    // otra clase, tampoco. La pantalla tuvo un `catch` que mandaba a `/lots` ante un `ProcessTargetError` que `listRecipes` no lanza nunca: por eso entran los dos.
    for (const error of [new Error("no_lot_access"), new ProcessTargetError("recipe_not_found")]) {
      estado.fallaAlListar = error;
      await expect(RecipesPage(), error.constructor.name).rejects.toBe(error);
    }
    // Control: sin fallo, la misma pantalla se pinta.
    estado.fallaAlListar = null;
    expect(aTexto(await pintar(await RecipesPage()))).toContain("Todavía no hay recetas.");
  });

  it("sin recetas, quien puede crear lee cómo se hace; quien no puede, sólo que no hay ninguna (F1-8)", async () => {
    estado.recetas = [];
    estado.puedeCrear = true;
    const conPermiso = aTexto(await pintar(await RecipesPage()));
    expect(conPermiso).toContain("Todavía no hay recetas. Crea una, añádele pasos y publícala");
    // Quien no puede crear no lee un acto que no puede hacer (regla de Daniel, 2026-09-27: lo que no puedes hacer no se muestra ni se explica).
    estado.puedeCrear = false;
    const sinPermiso = aTexto(await pintar(await RecipesPage()));
    expect(sinPermiso).toContain("Todavía no hay recetas.");
    expect(sinPermiso).not.toMatch(/Crea una|añádele pasos|publícala/);
    expect(sinPermiso).not.toContain("Nueva receta");
    // Control: con recetas en la lista no sale ninguno de los dos textos de «vacío».
    estado.recetas = [{ id: "a", name: "Lavado tradicional", description: null, esLibre: false, organization: { name: "Finca A" }, versions: [{ id: "a1", version: 1, status: "approved" }] }];
    expect(aTexto(await pintar(await RecipesPage()))).not.toContain("Todavía no hay recetas.");
  });

  it("«Nueva receta» sólo se ofrece a quien puede crear una", async () => {
    estado.puedeCrear = true;
    expect(aTexto(await pintar(await RecipesPage()))).toContain("Nueva receta");
    estado.puedeCrear = false;
    expect(aTexto(await pintar(await RecipesPage()))).not.toContain("Nueva receta");
  });

  describe("el borrador se pinta y se cuenta sólo a quien puede escribir esa receta, como en el detalle (F2-0)", () => {
    /** Una receta como la devuelve `listRecipes`: con su organización escalar y sus versiones, la más alta primero. */
    const recetaDeLista = (id: string, organizationId: string | null, versions: { id: string; version: number; status: string }[]) => ({
      id,
      name: `Receta ${id}`,
      description: null,
      esLibre: false,
      organizationId,
      organization: organizationId === null ? null : { name: `Finca ${organizationId}` },
      versions,
    });
    const DOS = [{ id: "a2", version: 2, status: "draft" }, { id: "a1", version: 1, status: "approved" }];

    it("v2 borrador + v1 publicada: el lector sin autoría no ve «Borrador» ni lo cuenta, y el autor sí; y la cuenta es la que da el detalle de la misma receta", async () => {
      estado.recetas = [recetaDeLista("a", "org1", DOS)];
      estado.puede = () => false;
      const lector = aTexto(await pintar(await RecipesPage()));
      expect(lector).toContain("Publicada: v1");
      expect(lector).not.toContain("Borrador");
      expect(lector).toContain("1 versión(es)");
      expect(lector).not.toContain("2 versión(es)");

      estado.puede = () => true;
      const autor = aTexto(await pintar(await RecipesPage()));
      expect(autor).toContain("Publicada: v1");
      expect(autor).toContain("Borrador: v2");
      expect(autor).toContain("2 versión(es)");

      // La misma receta en el detalle dice la misma cuenta, para el lector y para el autor: la lista y el detalle ya no se contradicen.
      estado.receta = receta([version("v2", 2, "draft"), version("v1", 1, "approved")]);
      estado.puede = () => false;
      expect(aTexto(await pintarReceta())).toContain("1 versión(es)");
      estado.puede = () => true;
      expect(aTexto(await pintarReceta())).toContain("2 versión(es)");
    });

    it("sólo un borrador: el lector lo ve «sin versión publicada», sin borrador y con 0 versiones; el autor lo ve con su borrador", async () => {
      estado.recetas = [recetaDeLista("b", "org1", [{ id: "b1", version: 1, status: "draft" }])];
      estado.puede = () => false;
      const lector = aTexto(await pintar(await RecipesPage()));
      expect(lector).toContain("Receta b");
      expect(lector).toContain("Sin versión publicada");
      expect(lector).not.toContain("Borrador");
      expect(lector).toContain("0 versión(es)");
      estado.puede = () => true;
      const autor = aTexto(await pintar(await RecipesPage()));
      expect(autor).toContain("Borrador: v1");
      expect(autor).toContain("1 versión(es)");
    });

    it("se decide por la organización de CADA receta: la que puede escribir ve su borrador y la de otra organización no (y una plantilla se pregunta con organización nula)", async () => {
      estado.recetas = [
        recetaDeLista("propia", "org1", DOS),
        recetaDeLista("ajena", "org2", DOS),
        recetaDeLista("plantilla", null, DOS),
      ];
      const preguntadas: (string | null)[] = [];
      estado.puede = (organizacion) => {
        preguntadas.push(organizacion);
        return organizacion === "org1";
      };
      const html = aTexto(await pintar(await RecipesPage()));
      // Una tarjeta por receta: se parte el texto por el nombre y se mira cada trozo.
      const trozos = html.split(/(?=Receta (?:propia|ajena|plantilla))/);
      const de = (nombre: string) => trozos.find((t) => t.startsWith(`Receta ${nombre}`)) ?? "";
      expect(de("propia")).toContain("Borrador: v2");
      expect(de("propia")).toContain("2 versión(es)");
      expect(de("ajena")).not.toContain("Borrador");
      expect(de("ajena")).toContain("1 versión(es)");
      expect(de("plantilla")).not.toContain("Borrador");
      expect(de("plantilla")).toContain("1 versión(es)");
      // Se preguntó por las tres organizaciones (la de la plantilla es nula): la decisión no sale de una sola respuesta para toda la lista.
      expect([...new Set(preguntadas)].sort()).toEqual([null, "org1", "org2"]);
    });
  });
});

describe("la receta nueva (/recipes/new)", () => {
  it("sin permiso en ninguna parte es un 404; con permiso, el formulario, sin metas", async () => {
    estado.organizaciones = [{ id: "orgA", name: "Finca A" }];
    estado.puede = () => false;
    await expect(NewRecipePage()).rejects.toThrow("notFound");
    estado.puede = (organizacion) => organizacion === "orgA";
    const html = await pintar(await NewRecipePage());
    expect(aTexto(html)).toContain("Crear receta");
    expect(campos(html, "name").length).toBe(1);
    // La receta nace sin pasos y sin metas: no se le pide ninguna (el formulario viejo pedía al menos una).
    expect(html).not.toContain("targets[");
    expect(opciones(html, "organizationId")).toEqual(["Finca A"]);
  });

  it("sin organizaciones que pueda operar, de vuelta a la lista", async () => {
    estado.organizaciones = [];
    await expect(NewRecipePage()).rejects.toThrow("redirect:/recipes");
  });

  it("la opción de plantilla sólo se ofrece a quien puede crear plantillas", async () => {
    estado.organizaciones = [{ id: "orgA", name: "Finca A" }];
    estado.puede = () => true;
    expect(opciones(await pintar(await NewRecipePage()), "organizationId")).toEqual(["— receta compartida (todas las fincas) —", "Finca A"]);
    estado.puede = (organizacion) => organizacion === "orgA";
    expect(opciones(await pintar(await NewRecipePage()), "organizationId")).toEqual(["Finca A"]);
  });
});

describe("las pantallas de un paso (/recipes/[id]/pasos/…)", () => {
  const nuevo = (despues?: string) =>
    NuevoPasoPage({ params: Promise.resolve({ id: "r1" }), searchParams: Promise.resolve(despues === undefined ? {} : { despues }) });
  const editar = (stepId: string) => EditarPasoPage({ params: Promise.resolve({ id: "r1", stepId }) });

  it("añadir: sin permiso es un 404; con la versión publicada, de vuelta a la receta; con un borrador, el formulario detrás del paso pedido", async () => {
    estado.receta = receta([version("v2", 2, "draft")]);
    estado.puede = () => false;
    await expect(nuevo()).rejects.toThrow("notFound");

    estado.puede = () => true;
    estado.receta = receta([version("v1", 1, "approved")]);
    await expect(nuevo()).rejects.toThrow("redirect:/recipes/r1");

    estado.receta = receta([version("v2", 2, "draft")]);
    const html = await pintar(await nuevo("2"));
    expect(aTexto(html)).toContain("Añadir un paso");
    expect(aTexto(html)).toContain("Lavado tradicional · versión 2 (borrador)");
    expect(campos(html, "despuesDeSeq")[0]).toMatch(/value="2"/);
    expect(campos(html, "recipeVersionId")[0]).toMatch(/value="v2"/);
    // Los 24 tipos, con su rótulo, y ningún dato del paso hasta que se elige uno.
    expect(opciones(html, "stepTypeValueId").length).toBe(25);
    expect(campos(html, "horasSugeridas")).toEqual([]);
  });

  it("añadir: una posición ilegible en la dirección es «al principio», no un error", async () => {
    estado.receta = receta([version("v2", 2, "draft")]);
    const html = await pintar(await nuevo("abc"));
    expect(campos(html, "despuesDeSeq")[0]).toMatch(/value=""/);
    // Control: una posición bien escrita sí se respeta.
    expect(campos(await pintar(await nuevo("7")), "despuesDeSeq")[0]).toMatch(/value="7"/);
  });

  it("editar: un paso que ya no está vuelve a la receta; uno que está sale con su tipo y sus datos", async () => {
    estado.receta = receta([version("v2", 2, "draft")]);
    estado.pasos.set("v2", [paso("p7", 2, "fermentation", { horasSugeridas: 48, intencion: "Fermentar sellado" })]);
    await expect(editar("no-existe")).rejects.toThrow("redirect:/recipes/r1");

    const html = await pintar(await editar("p7"));
    expect(aTexto(html)).toContain("Editar el paso 2");
    // El tipo del paso viene preseleccionado (sin depender del orden en que React escribe los atributos).
    expect(html).toMatch(/<option\b(?=[^>]*value="tipo-fermentation")(?=[^>]*\bselected\b)[^>]*>/);
    expect(campos(html, "horasSugeridas")[0]).toMatch(/value="48"/);
    expect(campos(html, "intencion")[0]).toMatch(/value="Fermentar sellado"/);
    expect(campos(html, "stepId")[0]).toMatch(/value="p7"/);
    expect(campos(html, "despuesDeSeq")).toEqual([]);
  });

  it("añadir y editar: una receta que ya no existe vuelve a la lista, y un error de otra clase sube tal cual", async () => {
    estado.fallaAlLeer = new ProcessTargetError("recipe_not_found");
    await expect(nuevo()).rejects.toThrow("redirect:/recipes");
    await expect(editar("p7")).rejects.toThrow("redirect:/recipes");
    // Control: lo que no es un `ProcessTargetError` no se disfraza de «la receta no existe».
    const otro = new Error("la base no responde");
    estado.fallaAlLeer = otro;
    await expect(nuevo()).rejects.toBe(otro);
    await expect(editar("p7")).rejects.toBe(otro);
    // Control: sin fallo, la misma pantalla se pinta.
    estado.fallaAlLeer = null;
    estado.receta = receta([version("v2", 2, "draft")]);
    expect(aTexto(await pintar(await nuevo()))).toContain("Añadir un paso");
  });

  it("editar: sin permiso es un 404, sea el paso de un borrador o de una versión publicada", async () => {
    estado.receta = receta([version("v2", 2, "draft"), version("v1", 1, "approved")]);
    estado.pasos.set("v2", [paso("p7", 2, "fermentation")]);
    estado.pasos.set("v1", [paso("q1", 1, "washing")]);
    estado.puede = () => false;
    await expect(editar("p7")).rejects.toThrow("notFound");
    // No se amplía quién puede leer: la versión publicada tampoco se abre a quien no puede escribir la receta.
    await expect(editar("q1")).rejects.toThrow("notFound");
    // Control: con permiso, las dos pantallas se pintan (el 404 de arriba es de la autorización y no de que el paso no esté).
    estado.puede = () => true;
    expect(aTexto(await pintar(await editar("p7")))).toContain("Editar el paso 2");
    expect(aTexto(await pintar(await editar("q1")))).toContain("Paso 1");
  });

  describe("el paso de una versión publicada o del historial se abre de sólo lectura (F1-2)", () => {
    // Un paso con valores de todas las clases: tipo, intención, horas, un eje de catálogo, la temperatura, una adición, una condición de fin, una capacidad y una meta con ritmo.
    const EXTRA = {
      intencion: "Fermentar sellado",
      horasMin: 24,
      horasSugeridas: 48,
      horasMax: 72,
      oxigenoValueId: "ox-aer",
      temperaturaMinC: 12.5,
      temperaturaMaxC: 18,
      adiciones: [{ categoriaValueId: "su-mosto", cantidad: 2.5, unidad: "g/kg", momento: "post_green" }],
      fines: [{ variable: "ph", operador: "lte", valor: 3.9, unidad: "pH", desdeLecturaId: null }],
      capacidadesRequeridas: ["ca-sellable"],
      metas: [{ variable: "ph", moment: "during", unit: "pH", targetValue: 3.8, minValue: 3.5, maxValue: 4.2, note: "cada seis horas", everyHours: 6 }],
    };
    const LO_QUE_DECLARO = {
      stepTypeValueId: "tipo-fermentation",
      intencion: "Fermentar sellado",
      horasMin: 24,
      horasSugeridas: 48,
      horasMax: 72,
      oxigenoValueId: "ox-aer",
      temperaturaMinC: 12.5,
      temperaturaMaxC: 18,
      adiciones: [{ categoriaValueId: "su-mosto", cantidad: 2.5, unidad: "g/kg", momento: "post_green" }],
      fines: [{ variable: "ph", operador: "lte", valor: 3.9, unidad: "pH", desdeLecturaId: null }],
      capacidadesRequeridas: ["ca-sellable"],
      metas: [{ variable: "ph", moment: "during", unit: "pH", targetValue: 3.8, minValue: 3.5, maxValue: 4.2, note: "cada seis horas", everyHours: 6 }],
    };

    it("un paso de la versión publicada se pinta con todos sus valores y deshabilitado, sin guardar", async () => {
      estado.receta = receta([version("v1", 1, "approved")]);
      estado.pasos.set("v1", [paso("q3", 3, "fermentation", EXTRA)]);
      const html = await pintar(await editar("q3"));
      const texto = aTexto(html);
      expect(texto).toContain("Paso 3");
      expect(texto).not.toContain("Editar el paso");
      expect(texto).toContain("Lavado tradicional · versión 1 (publicada)");
      expect(texto).toContain("Versión publicada: no se edita.");
      // Entero y deshabilitado: un fieldset deshabilitado que contiene todos los controles, y ningún botón (ni guardar, ni añadir, ni quitar filas).
      expect(fieldsetDeshabilitado(html)).toBe(true);
      expect(controlesFueraDelFieldset(html)).toEqual([]);
      expect(html).not.toMatch(/<button\b/);
      expect(texto).not.toContain("Guardar paso");
      // Todos los valores se ven: lo que un navegador mandaría de vuelta, leído por la acción, es lo que el paso declaró.
      expect(pasoDeFormulario(formDataDeHtml(html))).toMatchObject(LO_QUE_DECLARO);
      // Control: la lectura es de la pantalla y no de un valor por omisión (un paso en blanco saldría distinto).
      expect(pasoDeFormulario(formDataDeHtml(html)).horasSugeridas).toBe(48);
    });

    it("el mismo paso en un BORRADOR sigue editable: sin fieldset deshabilitado, con «Guardar paso» y con el título de editar (control)", async () => {
      estado.receta = receta([version("v2", 2, "draft")]);
      estado.pasos.set("v2", [paso("p3", 3, "fermentation", EXTRA)]);
      const html = await pintar(await editar("p3"));
      const texto = aTexto(html);
      expect(texto).toContain("Editar el paso 3");
      expect(texto).toContain("Lavado tradicional · versión 2 (borrador)");
      expect(texto).not.toContain("Versión publicada: no se edita.");
      expect(fieldsetDeshabilitado(html)).toBe(false);
      expect(texto).toContain("Guardar paso");
      // Los mismos valores, editables.
      expect(pasoDeFormulario(formDataDeHtml(html))).toMatchObject(LO_QUE_DECLARO);
    });

    it("con un borrador encima, el paso de una versión del historial se abre de sólo lectura con SU versión, y el del borrador, editable", async () => {
      estado.receta = receta([version("v2", 2, "draft"), version("v1", 1, "approved")]);
      estado.pasos.set("v2", [paso("p7", 1, "pulping")]);
      estado.pasos.set("v1", [paso("q1", 1, "washing"), paso("q2", 2, "fermentation", EXTRA)]);
      const historico = await pintar(await editar("q2"));
      expect(aTexto(historico)).toContain("Lavado tradicional · versión 1 (publicada)");
      expect(fieldsetDeshabilitado(historico)).toBe(true);
      expect(campos(historico, "recipeVersionId")[0]).toMatch(/value="v1"/);
      expect(pasoDeFormulario(formDataDeHtml(historico))).toMatchObject(LO_QUE_DECLARO);
      const borrador = await pintar(await editar("p7"));
      expect(aTexto(borrador)).toContain("Lavado tradicional · versión 2 (borrador)");
      expect(fieldsetDeshabilitado(borrador)).toBe(false);
      expect(campos(borrador, "recipeVersionId")[0]).toMatch(/value="v2"/);
    });

    it("un paso que ninguna versión de ESTA receta tiene vuelve a la receta, aunque exista en otra", async () => {
      estado.receta = receta([version("v1", 1, "approved")]);
      estado.pasos.set("v1", [paso("q1", 1, "washing")]);
      // El paso `ajeno` es de una versión de otra receta: `pasosDeLaVersion` lo devolvería si se le preguntara por esa versión, y nunca se le pregunta.
      estado.pasos.set("v-de-otra-receta", [paso("ajeno", 1, "drying")]);
      await expect(editar("ajeno")).rejects.toThrow("redirect:/recipes/r1");
      // Control: el de esta receta se abre.
      expect(aTexto(await pintar(await editar("q1")))).toContain("Paso 1");
    });

    it("añadir sigue pidiendo un borrador: con sólo la versión publicada, de vuelta a la receta", async () => {
      estado.receta = receta([version("v1", 1, "approved")]);
      estado.pasos.set("v1", [paso("q1", 1, "washing")]);
      await expect(nuevo()).rejects.toThrow("redirect:/recipes/r1");
    });
  });

  describe("cada paso de una versión publicada o del historial lleva su enlace «Ver el paso», a quien puede abrirlo (F1-2)", () => {
    const enlaces = (html: string): string[] => [...html.matchAll(/href="(\/recipes\/r1\/pasos\/[^"?]+)"/g)].map((m) => m[1]!).sort();

    it("la publicada y el historial: un enlace por paso hacia su pantalla; el borrador, «Editar paso»", async () => {
      estado.receta = receta([version("v3", 3, "draft"), version("v2", 2, "approved"), version("v1", 1, "approved")]);
      estado.pasos.set("v3", [paso("b1", 1, "pulping")]);
      estado.pasos.set("v2", [paso("p1", 1, "washing")]);
      estado.pasos.set("v1", [paso("q1", 1, "pulping"), paso("q2", 2, "drying")]);
      const html = await pintarReceta();
      const texto = aTexto(html);
      // Tres enlaces de ver (la v2 y las dos de la v1) y uno de editar (el borrador).
      expect(enlaces(html)).toEqual(["/recipes/r1/pasos/b1", "/recipes/r1/pasos/p1", "/recipes/r1/pasos/q1", "/recipes/r1/pasos/q2"]);
      expect(veces(texto, "Editar paso")).toBe(1);
      expect(html).toMatch(/<a [^>]*href="\/recipes\/r1\/pasos\/b1"[^>]*>Editar paso<\/a>/);
      for (const id of ["p1", "q1", "q2"]) expect(html).toMatch(new RegExp(`<a [^>]*href="/recipes/r1/pasos/${id}"[^>]*>Ver el paso</a>`));
    });

    it("quien no puede abrir la pantalla no ve el enlace (no se ofrece lo que daría un 404)", async () => {
      estado.receta = receta([version("v2", 2, "approved"), version("v1", 1, "approved")]);
      estado.pasos.set("v2", [paso("p1", 1, "washing")]);
      estado.pasos.set("v1", [paso("q1", 1, "pulping")]);
      expect(enlaces(await pintarReceta())).toEqual(["/recipes/r1/pasos/p1", "/recipes/r1/pasos/q1"]);
      estado.puede = () => false;
      const sin = await pintarReceta();
      expect(enlaces(sin)).toEqual([]);
      // Ni como enlace: «Ver el paso» también es el resumen del historial cuando una versión tiene UN paso, y ese no es un enlace.
      expect(sin).not.toMatch(/<a [^>]*>Ver el paso<\/a>/);
      // Control: la pantalla sí se pinta para quien no puede (el historial sigue ahí).
      expect(aTexto(sin)).toContain("Versión 1");
    });

    it("una receta Libre, que se ve y no se toca, deja ver el detalle de sus pasos a quien puede escribir recetas", async () => {
      estado.receta = receta([version("v1", 1, "approved")], { esLibre: true });
      estado.pasos.set("v1", [paso("q1", 1, "washing")]);
      expect(enlaces(await pintarReceta())).toEqual(["/recipes/r1/pasos/q1"]);
    });
  });
});
