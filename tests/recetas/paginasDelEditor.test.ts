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
 * enseñen sin controles. Cada afirmación lleva su control, para que no pase vacía.
 */
import type { ReactElement } from "react";
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogosDelEditor, ValorDeCatalogo } from "../../lib/recetas/catalogosDelEditor";
import { TIPOS_DE_PASO } from "../../lib/recetas/vocabulario";
import { aTexto, campos, opciones } from "../helpers/htmlDePrueba";

const estado = vi.hoisted(() => ({
  receta: null as unknown,
  pasos: new Map<string, unknown[]>(),
  puede: (_organizacion: string | null): boolean => true,
  organizaciones: [] as { id: string; name: string }[],
  recetas: [] as unknown[],
  puedeCrear: true,
  catalogos: null as unknown,
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
  getRecipeForEditor: async () => estado.receta,
  listRecipes: async () => estado.recetas,
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

  it("un borrador, SIN permiso: los pasos se ven, y ningún control ni ninguna disculpa", async () => {
    BORRADOR();
    estado.puede = () => false;
    const texto = aTexto(await pintarReceta());
    expect(texto).toContain("Despulpar el mismo día");
    for (const control of [...CONTROLES, "Nombre y descripción"]) expect(texto, control).not.toContain(control);
    // Daniel, 2026-09-27: lo que no puedes hacer no se muestra, y no se explica.
    expect(texto).not.toContain("permiso");
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

  it("«Nueva receta» sólo se ofrece a quien puede crear una", async () => {
    estado.puedeCrear = true;
    expect(aTexto(await pintar(await RecipesPage()))).toContain("Nueva receta");
    estado.puedeCrear = false;
    expect(aTexto(await pintar(await RecipesPage()))).not.toContain("Nueva receta");
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

  it("editar: sin permiso es un 404, y con una versión ya publicada, de vuelta a la receta", async () => {
    estado.receta = receta([version("v2", 2, "draft")]);
    estado.pasos.set("v2", [paso("p7", 2, "fermentation")]);
    estado.puede = () => false;
    await expect(editar("p7")).rejects.toThrow("notFound");
    estado.puede = () => true;
    estado.receta = receta([version("v2", 2, "approved")]);
    await expect(editar("p7")).rejects.toThrow("redirect:/recipes/r1");
  });
});
