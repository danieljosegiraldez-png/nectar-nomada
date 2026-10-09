/**
 * Los componentes del editor de recetas — Parte 2a, tarea 14 (2026-10-03). Hermética: se renderizan en el servidor con `renderToStaticMarkup`,
 * con los textos reales de `messages/es.json` (`traductorDePrueba`, que revienta ante una clave que falta) y las referencias reales del paquete;
 * sólo las acciones están simuladas.
 *
 * Lo que se afirma es lo que el operario ve y lo que el formulario manda: qué ejes aparecen según el tipo (la fila de `EJES_POR_TIPO_DE_PASO`,
 * tomada de la tabla y no supuesta), qué trae cada referencia del paquete con su marca, y que **un paso nuevo nace con los campos vacíos** aunque
 * el paquete traiga referencias (regla 3 del paquete: el lavado genérico nunca precarga; regla 7: nada de dosis ni de recomendaciones).
 * Cada afirmación lleva al lado su control, para que no pase vacía.
 *
 * **Ida y vuelta (ronda de arreglo de T14C, H1).** Los casos sueltos miran un campo cada uno y dejaban once mutaciones de «no precarga» vivas (45 pruebas en
 * verde). La última prueba pinta un paso COMPLETO de cada uno de los 24 tipos, arma el `FormData` de su HTML como lo haría un navegador (`formDataDeHtml`,
 * que tiene sus propias pruebas con entradas escritas a mano) y exige que `pasoDeFormulario` devuelva el paso de origen: un campo que el formulario no precargue,
 * lea del de otro o mande con otro nombre, cae.
 */
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CatalogosDelEditor, ValorDeCatalogo } from "../../lib/recetas/catalogosDelEditor";
import { pasoDeFormulario, pasoEnBlanco, valoresDelFormulario, type PasoInicial } from "../../lib/recetas/formularioDePaso";
import type { PasoConDetalle, PasoEditable } from "../../lib/recetas/pasos";
import { referenciasDelTipo, SINONIMOS_ENTRE_CATALOGOS } from "../../lib/recetas/referencias";
import {
  EJES_POR_TIPO_DE_PASO,
  FASE_DEL_TIPO,
  TIPOS_DE_PASO,
  TRAMOS_DE_MUCILAGO,
  type EjeDelPaso,
  type TipoDePaso,
} from "../../lib/recetas/vocabulario";
import { aTexto, campos, formDataDeHtml, opciones, tieneCampo } from "../helpers/htmlDePrueba";

vi.mock("next-intl", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { useTranslations: (espacio: string) => traductorDePrueba(espacio) };
});
vi.mock("../../app/actions/traceability", () => ({
  agregarPasoAction: async () => ({}),
  actualizarPasoAction: async () => ({}),
  moverPasoAction: async () => ({}),
  quitarPasoAction: async () => ({}),
}));

import { AccionesDelPaso } from "../../app/components/traceability/AccionesDelPaso";
import { FormularioDePaso } from "../../app/components/traceability/FormularioDePaso";

type Props = ComponentProps<typeof FormularioDePaso>;

const valor = (id: string, value: string, definition: string | null = null): ValorDeCatalogo => ({ id, value, definition });
const CATALOGOS: CatalogosDelEditor = {
  tipos: [],
  estadoFruto: [valor("ef-entera", "entera"), valor("ef-desp", "despulpada")],
  oxigeno: [valor("ox-aer", "aerobico")],
  temperatura: [valor("te-amb", "ambiente")],
  fuenteMicrobiana: [valor("fm-ninguna", "ninguna")],
  medio: [valor("me-agua", "agua_limpia")],
  fisico: [valor("fi-ninguno", "ninguno")],
  sustrato: [valor("su-mosto", "doble_mosto")],
  levadura: [valor("le-mp72", "MP72")],
  capacidad: [valor("ca-sellable", "sellable", "Cierra hermético"), valor("ca-oscuridad", "oscuridad")],
};
const TIPOS = TIPOS_DE_PASO.map((tipo) => ({ id: `tipo-${tipo}`, tipo, etiqueta: `Etiqueta ${tipo}` }));
const VARIABLES = [
  { variable: "ph", canonicalUnit: "pH", min: 0, max: 14 },
  { variable: "brix", canonicalUnit: "Bx", min: 0, max: 40 },
  { variable: "moisture", canonicalUnit: "%", min: 0, max: 100 },
  { variable: "cold_hold_plateau_duration", canonicalUnit: "h", min: 0, max: 500 },
];
const REFERENCIAS: Props["referencias"] = Object.fromEntries(TIPOS_DE_PASO.map((tipo) => [tipo, referenciasDelTipo(tipo)]));

const BASE: Props = {
  modo: "agregar",
  recipeId: "r1",
  recipeVersionId: "v1",
  despuesDeSeq: 2,
  inicial: pasoEnBlanco(),
  tipos: TIPOS,
  catalogos: CATALOGOS,
  modosDeSecado: [{ valor: "open_patio", etiqueta: "Patio abierto" }],
  variables: VARIABLES,
  referencias: REFERENCIAS,
  sinonimos: [],
};

const pintar = (sobre: Partial<Props> = {}): string => renderToStaticMarkup(createElement(FormularioDePaso, { ...BASE, ...sobre }));
const conTipo = (tipo: TipoDePaso, inicial: Partial<PasoInicial> = {}, sobre: Partial<Props> = {}): string =>
  pintar({ inicial: { ...pasoEnBlanco(), stepTypeValueId: `tipo-${tipo}`, ...inicial }, ...sobre });

/** La fila de la lista de referencias que lleva ese parámetro. */
function filaDeReferencia(html: string, parametro: string): string {
  const fila = html.split("<li").find((x) => x.includes(`<code>${parametro}</code>`));
  if (fila === undefined) throw new Error(`no hay fila de referencia para ${parametro}`);
  // Sólo hasta el cierre de SU fila: la última se extendería, si no, por el resto del formulario.
  return aTexto(fila.split("</li>")[0]!);
}

const CAMPOS_DE_EJE: Record<Exclude<EjeDelPaso, "adiciones">, string[]> = {
  estadoFruto: ["estadoFrutoValueId"],
  mucilagoObjetivo: ["mucilagoObjetivo"],
  oxigeno: ["oxigenoValueId"],
  temperatura: ["temperaturaValueId", "temperaturaMinC", "temperaturaMaxC"],
  fuenteMicrobiana: ["fuenteMicrobianaValueId"],
  medio: ["medioValueId"],
  fisico: ["fisicoValueId"],
  modoSecado: ["modoSecado"],
};

describe("FormularioDePaso — primero el tipo, y sólo aparecen los datos que le aplican", () => {
  it("para cada tipo, enseña exactamente los ejes de su fila de EJES_POR_TIPO_DE_PASO, y volteo y humedad sólo en el secado", () => {
    const ejes = [...new Set(Object.values(EJES_POR_TIPO_DE_PASO).flat())];
    expect(ejes.length, "control: la tabla usa los nueve ejes").toBe(9);
    expect(TIPOS_DE_PASO.length, "control: son 24 tipos").toBe(24);
    const mal: string[] = [];
    for (const tipo of TIPOS_DE_PASO) {
      const html = conTipo(tipo);
      for (const eje of ejes) {
        const aplica = EJES_POR_TIPO_DE_PASO[tipo].includes(eje);
        const sale = eje === "adiciones" ? aTexto(html).includes("Añadir adición") : CAMPOS_DE_EJE[eje].every((c) => tieneCampo(html, c));
        if (aplica !== sale) mal.push(`${tipo}/${eje}: ${aplica ? "aplica y no sale" : "no aplica y sale"}`);
      }
      const esSecado = FASE_DEL_TIPO[tipo] === "drying";
      for (const c of ["volteoCadaHoras", "humedadMinPct", "humedadMaxPct"]) {
        if (tieneCampo(html, c) !== esSecado) mal.push(`${tipo}/${c}: ${esSecado ? "es de secado y no sale" : "no es de secado y sale"}`);
      }
    }
    expect(mal).toEqual([]);
  });

  it("lo que todo tipo lleva sale siempre: horas, cómo termina, capacidades y plan de medición", () => {
    for (const tipo of ["reception", "fermentation", "drying"] as const) {
      const html = conTipo(tipo);
      for (const c of ["horasMin", "horasSugeridas", "horasMax", "finPorTiempo", "reglaDeFin", "capacidadesRequeridas", "intencion", "opcional"]) {
        expect(tieneCampo(html, c), `${tipo}/${c}`).toBe(true);
      }
      expect(aTexto(html)).toContain("Añadir objetivo");
    }
  });

  it("sin tipo elegido pide el tipo primero: ningún dato del paso, y no se puede enviar", () => {
    const html = pintar();
    expect(aTexto(html)).toContain("Elige el tipo de paso para ver los datos que le aplican.");
    for (const c of ["horasSugeridas", "oxigenoValueId", "estadoFrutoValueId", "capacidadesRequeridas", "finPorTiempo"]) {
      expect(tieneCampo(html, c), c).toBe(false);
    }
    const envio = [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((b) => b.includes('type="submit"'));
    expect(envio.length).toBe(1);
    expect(envio[0]).toContain("disabled");
    // Control: con un tipo elegido, el botón se puede pulsar.
    const conTipoElegido = [...conTipo("washing").matchAll(/<button\b[^>]*>/g)].map((m) => m[0]).filter((b) => b.includes('type="submit"'));
    expect(conTipoElegido[0]).not.toContain("disabled");
  });

  it("ofrece los 24 tipos con su rótulo", () => {
    expect(opciones(pintar(), "stepTypeValueId")).toEqual(["— elige el tipo —", ...TIPOS.map((t) => t.etiqueta)]);
  });
});

describe("FormularioDePaso — las referencias del paquete: se enseñan con su fuente y su confianza, y no precargan nada", () => {
  it("el volteo del secado sale tal cual lo dice el paquete: valor, fuente y confianza, sin marca", () => {
    const fila = filaDeReferencia(conTipo("drying"), "drying.turns_per_day_min");
    expect(fila).toContain("3–4 turns/day");
    expect(fila).toContain("CENICAFE AT577");
    expect(fila).toContain("Confianza: alta");
    expect(fila).not.toContain("verificar antes de usar");
  });

  it("lo de confianza baja se marca; lo añadido por la casa (NN) se marca aunque la confianza no sea baja; lo demás no", () => {
    const secado = conTipo("drying");
    expect(filaDeReferencia(secado, "drying.water_activity_target_optional")).toContain("Confianza baja: verificar antes de usar");
    const nn = filaDeReferencia(secado, "drying.interruption_rule");
    expect(nn).toContain("Confianza: media");
    expect(nn).toContain("Añadido por Néctar Nómada");
    expect(nn).not.toContain("Confianza baja");
    // Control: lo `high` y de un instituto no lleva ninguna marca.
    const alta = filaDeReferencia(secado, "drying.final_moisture_pct");
    expect(alta).not.toContain("verificar antes de usar");
    expect(alta).not.toContain("Néctar Nómada");
  });

  it("las alternativas de otra autoridad están a la vista, junto al perfil del valor (regla 2: nunca elegir una en silencio)", () => {
    const patio = filaDeReferencia(conTipo("drying"), "drying.layer_depth_cm.patio");
    expect(patio).toContain("3–5 cm");
    expect(patio).toContain("perfil CODEX_ISO_SCA");
    expect(patio).toContain("Otras autoridades: 7 cm (ANACAFE)");
  });

  it("lo del lavado genérico y las dosis de fabricante llevan su nota de «sólo referencia»; lo demás no", () => {
    const nota = "Sólo referencia";
    expect(filaDeReferencia(conTipo("fermentation"), "process.washed_fermentation_hours_generic")).toContain(nota);
    expect(filaDeReferencia(conTipo("inoculation"), "inoculum.safcoffee.dose_g_per_kg")).toContain(nota);
    // Control: una referencia de fermentación que sí se puede usar no la lleva.
    expect(filaDeReferencia(conTipo("fermentation"), "process.time_past_endpoint_warn_h")).not.toContain(nota);
  });

  it("un paso nuevo nace con todos los campos numéricos vacíos aunque el paquete traiga referencias; uno guardado enseña lo suyo", () => {
    expect(referenciasDelTipo("fermentation").length, "control: hay referencias que la pantalla podría haber precargado").toBeGreaterThan(0);
    expect(referenciasDelTipo("drying").length).toBeGreaterThan(0);
    for (const tipo of ["fermentation", "drying", "reception"] as const) {
      const conValor = campos(conTipo(tipo)).filter((e) => e.includes('type="number"') && /\svalue="[^"]+"/.test(e));
      expect(conValor, `${tipo}: campos numéricos que nacen con valor`).toEqual([]);
    }
    // Control: la misma pantalla SÍ enseña un valor cuando el paso lo trae (sin esto, «vacíos» podría ser un regex que no ve valores).
    const guardado = campos(conTipo("fermentation", { horasSugeridas: "48" }), "horasSugeridas");
    expect(guardado.some((e) => /\svalue="48"/.test(e))).toBe(true);
  });

  it("la nota del paquete sale bajo su fila (I6): es, a veces, la salvedad que impide leer la referencia como un hecho; una sin nota no lleva la etiqueta", () => {
    const secado = conTipo("drying");
    const lista = referenciasDelTipo("drying");
    const conNota = lista.find((r) => r.nota !== null);
    const sinNota = lista.find((r) => r.nota === null);
    expect(conNota, "control: el paquete trae alguna nota para el secado").toBeDefined();
    expect(sinNota, "control: y alguna referencia del secado sin nota").toBeDefined();
    // La nota va DENTRO de su fila (`filaDeReferencia` corta en el `</li>`), con su etiqueta y tal cual la copió la tarea 2.
    expect(filaDeReferencia(secado, conNota!.parametro)).toContain(`Nota del paquete: ${conNota!.nota}`);
    expect(filaDeReferencia(secado, sinNota!.parametro)).not.toContain("Nota del paquete");
    // El caso que motivó la nota: una meta «blanda» del importador, que no es un estándar.
    expect(filaDeReferencia(secado, "drying.water_activity_target_optional")).toContain("Importer soft target, not a standard.");
  });

  it("un tipo sin referencias lo dice, y uno con ellas no", () => {
    expect(aTexto(conTipo("decaf"))).toContain("El paquete no trae referencias para este tipo de paso.");
    expect(aTexto(conTipo("drying"))).not.toContain("El paquete no trae referencias para este tipo de paso.");
  });
});

describe("FormularioDePaso — lo que manda y lo que precarga", () => {
  it("al agregar manda detrás de qué paso va; al editar, qué paso es; y las dos cosas dicen a qué receta y versión pertenece", () => {
    const agregar = pintar({ modo: "agregar", despuesDeSeq: 3 });
    expect(campos(agregar, "despuesDeSeq")[0]).toMatch(/value="3"/);
    expect(tieneCampo(agregar, "stepId")).toBe(false);
    expect(campos(pintar({ modo: "agregar", despuesDeSeq: null }), "despuesDeSeq")[0]).toMatch(/value=""/);
    const editar = pintar({ modo: "editar", stepId: "paso-9", inicial: { ...pasoEnBlanco(), stepTypeValueId: "tipo-washing" } });
    expect(campos(editar, "stepId")[0]).toMatch(/value="paso-9"/);
    expect(tieneCampo(editar, "despuesDeSeq")).toBe(false);
    for (const c of ["recipeId", "recipeVersionId"]) {
      expect(tieneCampo(agregar, c), `agregar/${c}`).toBe(true);
      expect(tieneCampo(editar, c), `editar/${c}`).toBe(true);
    }
  });

  it("al editar, precarga el tipo y cada campo del paso, y reenvía la lectura de cierre de cada condición de fin", () => {
    const inicial: PasoInicial = {
      ...pasoEnBlanco(),
      stepTypeValueId: "tipo-drying",
      intencion: "Secar despacio",
      opcional: true,
      horasSugeridas: "168",
      volteoCadaHoras: "3",
      humedadMinPct: "10",
      humedadMaxPct: "12",
      modoSecado: "open_patio",
      finPorTiempo: true,
      reglaDeFin: "all",
      fines: [{ variable: "moisture", operador: "lte", valor: "11.5", unidad: "%", desdeLecturaId: "lectura-1" }],
      capacidadesRequeridas: ["ca-oscuridad"],
    };
    const html = conTipo("drying", inicial, { modo: "editar", stepId: "p1" });
    expect(campos(html, "horasSugeridas")[0]).toMatch(/value="168"/);
    expect(campos(html, "volteoCadaHoras")[0]).toMatch(/value="3"/);
    expect(campos(html, "intencion")[0]).toMatch(/value="Secar despacio"/);
    expect(campos(html, "opcional")[0]).toContain("checked");
    expect(campos(html, "finPorTiempo")[0]).toContain("checked");
    // La lectura de cierre no se enseña, pero se reenvía: sin ella, guardar sin tocar nada borraba de qué lectura salió el fin (§5.3).
    expect(campos(html, "fines[0][desdeLecturaId]")[0]).toMatch(/type="hidden"/);
    expect(campos(html, "fines[0][desdeLecturaId]")[0]).toMatch(/value="lectura-1"/);
    expect(campos(html, "fines[0][unidad]")[0]).toMatch(/value="%"/);
    // Sólo se marca la capacidad que el paso pedía.
    expect(campos(html, "capacidadesRequeridas").map((c) => c.includes("checked"))).toEqual([false, true]);
    // Control: el mismo paso sin lectura de cierre reenvía un valor vacío, no uno inventado.
    const sin = conTipo("drying", { ...inicial, fines: [{ ...inicial.fines[0]!, desdeLecturaId: "" }] }, { modo: "editar", stepId: "p1" });
    expect(campos(sin, "fines[0][desdeLecturaId]")[0]).toMatch(/value=""/);
  });

  it("una adición ofrece las categorías de sustrato, y la cepa de levadura sólo en una inoculación", () => {
    expect(EJES_POR_TIPO_DE_PASO.inoculation, "precondición (tarea 2)").toContain("adiciones");
    expect(EJES_POR_TIPO_DE_PASO.addition, "precondición (tarea 2)").toContain("adiciones");
    const fila = { categoriaValueId: "", cantidad: "", unidad: "", momento: "pre_green" as const };
    const inoculacion = opciones(conTipo("inoculation", { adiciones: [fila] }), "adiciones[0][categoriaValueId]");
    const adicion = opciones(conTipo("addition", { adiciones: [fila] }), "adiciones[0][categoriaValueId]");
    expect(inoculacion).toEqual(expect.arrayContaining(["doble_mosto", "MP72"]));
    expect(adicion).toContain("doble_mosto");
    expect(adicion).not.toContain("MP72");
  });

  it("el ritmo de una meta sólo se ofrece con «durante»", () => {
    const meta = { variable: "ph", targetValue: "3.8", minValue: "", maxValue: "", everyHours: "", note: "" };
    const durante = conTipo("fermentation", { metas: [{ ...meta, moment: "during", unit: "pH" }] });
    const final = conTipo("fermentation", { metas: [{ ...meta, moment: "final", unit: "pH" }] });
    expect(tieneCampo(durante, "metas[0][everyHours]")).toBe(true);
    expect(tieneCampo(final, "metas[0][everyHours]")).toBe(false);
    // La unidad viaja con la variable, no se teclea.
    expect(campos(durante, "metas[0][unit]")[0]).toMatch(/value="pH"/);
  });

  it("las variables se rotulan con su texto, también las del panel que hasta esta tarea no lo tenían", () => {
    const html = conTipo("cold_hold", { metas: [{ variable: "cold_hold_plateau_duration", moment: "during", unit: "h", targetValue: "", minValue: "", maxValue: "", everyHours: "", note: "" }] });
    const textos = opciones(html, "metas[0][variable]");
    // Control: una que ya tenía texto antes de esta tarea.
    expect(textos).toContain("pH (pH)");
    // La que no lo tenía: ahora sale con su texto y no con su código ni con la clave cruda (el traductor de prueba revienta si falta).
    expect(textos).toContain("Cold hold: duración del plateau (h)");
    expect(textos).not.toContain("cold_hold_plateau_duration (h)");
    expect(aTexto(html)).not.toContain("Traceability.variable_");
  });
});

/** Un tipo cuya fila de `EJES_POR_TIPO_DE_PASO` tiene el eje, y uno cuya fila no lo tiene: sacados de la tabla, no supuestos. */
function tipoCon(eje: EjeDelPaso): TipoDePaso {
  const t = TIPOS_DE_PASO.find((x) => EJES_POR_TIPO_DE_PASO[x].includes(eje));
  expect(t, `precondición (tarea 2): algún tipo admite «${eje}»`).toBeDefined();
  return t!;
}
function tipoSin(eje: EjeDelPaso): TipoDePaso {
  const t = TIPOS_DE_PASO.find((x) => !EJES_POR_TIPO_DE_PASO[x].includes(eje));
  expect(t, `precondición (tarea 2): algún tipo NO admite «${eje}»`).toBeDefined();
  return t!;
}

describe("FormularioDePaso — el mucílago es lo que QUEDA, en seis tramos (Ruling M)", () => {
  const rotulo = (pct: number) => (pct === 0 ? "0 % — Lavado" : pct === 100 ? "100 % — Honey" : `${pct} %`);
  const marcada = (html: string, valor: string) =>
    new RegExp(`<option\\b(?=[^>]*value="${valor}")(?=[^>]*\\bselected\\b)[^>]*>`).test(html);

  it("es un desplegable con los seis tramos, 0 = Lavado y 100 = Honey, con su pista; no hay campo numérico libre", () => {
    // Control: la escala es la de Daniel (2026-10-03), no la de «quitado» de ADR-181 #12.
    expect([...TRAMOS_DE_MUCILAGO]).toEqual([0, 10, 25, 50, 75, 100]);
    const html = conTipo(tipoCon("mucilagoObjetivo"));
    expect(opciones(html, "mucilagoObjetivo")).toEqual(["— sin declarar —", ...TRAMOS_DE_MUCILAGO.map(rotulo)]);
    expect(campos(html, "mucilagoObjetivo").some((c) => c.includes('type="number"'))).toBe(false);
    expect(aTexto(html)).toContain("Lo que queda: 0 % = Lavado; 100 % = Honey.");
    // Control: un tipo cuya fila no trae el eje no lo pinta.
    expect(tieneCampo(conTipo(tipoSin("mucilagoObjetivo")), "mucilagoObjetivo")).toBe(false);
  });

  it("precarga el tramo guardado, también el 0 (Lavado: un dato y no «no se declaró»), y ninguno si no se declaró", () => {
    const tipo = tipoCon("mucilagoObjetivo");
    expect(marcada(conTipo(tipo, { mucilagoObjetivo: "0" }), "0")).toBe(true);
    expect(marcada(conTipo(tipo, { mucilagoObjetivo: "75" }), "75")).toBe(true);
    // Control: sin declarar no queda marcado ningún tramo, y sí la opción de «sin declarar».
    const nada = conTipo(tipo, { mucilagoObjetivo: "" });
    for (const pct of TRAMOS_DE_MUCILAGO) expect(marcada(nada, String(pct)), `tramo ${pct}`).toBe(false);
    expect(marcada(nada, "")).toBe(true);
  });
});

describe("FormularioDePaso — los sinónimos del paquete se muestran en la ayuda del eje, sólo para mostrar (I7)", () => {
  const MOSTO = { termino: "mosto de otro fermento", catalogo: "medio_lavado", valor: "mosto_de_otro_lote" };
  const LEVADURA = { termino: "cepa de la casa", catalogo: "levadura_cultivo", valor: "MP72" };
  const frase = (s: { termino: string; valor: string }) => `«${s.termino}» → ${s.valor}`;

  it("un sinónimo sale junto al eje de su catálogo y en ningún otro", () => {
    const conMedio = aTexto(conTipo(tipoCon("medio"), {}, { sinonimos: [MOSTO] }));
    expect(conMedio).toContain(frase(MOSTO));
    expect(conMedio).toContain("En el paquete también se llama");
    // Controles: un tipo sin el eje del medio no enseña un sinónimo del medio, y sin sinónimos no hay ayuda.
    expect(aTexto(conTipo(tipoSin("medio"), {}, { sinonimos: [MOSTO] }))).not.toContain(frase(MOSTO));
    expect(aTexto(conTipo(tipoCon("medio")))).not.toContain("En el paquete también se llama");
  });

  it("los sinónimos de la cepa de levadura salen sólo en una inoculación, que es donde se ofrece esa categoría", () => {
    expect(EJES_POR_TIPO_DE_PASO.inoculation, "precondición (tarea 2)").toContain("adiciones");
    expect(EJES_POR_TIPO_DE_PASO.addition, "precondición (tarea 2)").toContain("adiciones");
    expect(aTexto(conTipo("inoculation", {}, { sinonimos: [LEVADURA] }))).toContain(frase(LEVADURA));
    // Control: en una adición simple la cepa no se ofrece, así que su sinónimo tampoco se enseña.
    expect(aTexto(conTipo("addition", {}, { sinonimos: [LEVADURA] }))).not.toContain(frase(LEVADURA));
  });

  it("cada sinónimo real del paquete cae en un eje que lo enseña (si la tarea 2 añade sinónimos de otro catálogo, esto avisa)", () => {
    expect(SINONIMOS_ENTRE_CATALOGOS.length, "control: el paquete trae sinónimos").toBeGreaterThan(0);
    const EJE_DEL_CATALOGO: Record<string, { eje: EjeDelPaso; tipo?: TipoDePaso }> = {
      medio_lavado: { eje: "medio" },
      fuente_microbiana: { eje: "fuenteMicrobiana" },
      sustrato_anadido: { eje: "adiciones" },
      levadura_cultivo: { eje: "adiciones", tipo: "inoculation" },
    };
    for (const s of SINONIMOS_ENTRE_CATALOGOS) {
      const donde = EJE_DEL_CATALOGO[s.catalogo];
      expect(donde, `el sinónimo «${s.termino}» apunta a «${s.catalogo}», que ningún eje del formulario enseña`).toBeDefined();
      const html = conTipo(donde!.tipo ?? tipoCon(donde!.eje), {}, { sinonimos: SINONIMOS_ENTRE_CATALOGOS });
      expect(aTexto(html), `«${s.termino}» no sale en su eje`).toContain(frase(s));
    }
  });
});

describe("FormularioDePaso — la recepción sólo vigila el Brix al llegar (I9)", () => {
  const fila = (variable: string, moment: "initial" | "during" | "final") => ({
    variable,
    moment,
    unit: "",
    targetValue: "20",
    minValue: "",
    maxValue: "",
    everyHours: "",
    note: "",
  });

  it("en una recepción cada meta lleva brix e «inicial» fijos, sin desplegables y con su unidad, y no se ofrece una segunda", () => {
    // Una meta que alguien dejó como pH final se pinta —y se manda— como lo único que la recepción compara.
    const html = conTipo("reception", { metas: [fila("ph", "final")] });
    expect(campos(html, "metas[0][variable]")).toHaveLength(1);
    expect(campos(html, "metas[0][variable]")[0]).toMatch(/type="hidden"/);
    expect(campos(html, "metas[0][variable]")[0]).toMatch(/value="brix"/);
    expect(campos(html, "metas[0][moment]")[0]).toMatch(/type="hidden"/);
    expect(campos(html, "metas[0][moment]")[0]).toMatch(/value="initial"/);
    expect(campos(html, "metas[0][unit]")[0]).toMatch(/value="Bx"/);
    expect(tieneCampo(html, "metas[0][everyHours]")).toBe(false);
    expect(aTexto(html)).toContain("En la recepción sólo se vigila el Brix al llegar");
    expect(aTexto(html)).not.toContain("Añadir objetivo");
    // Control: sin ninguna meta sí se ofrece añadir la del Brix.
    expect(aTexto(conTipo("reception"))).toContain("Añadir objetivo");
    // Control: otro tipo con la misma fila conserva sus desplegables y su botón, y no lleva el aviso.
    const fermentacion = conTipo("fermentation", { metas: [fila("ph", "final")] });
    expect(campos(fermentacion, "metas[0][variable]")[0]).toMatch(/^<select/);
    expect(opciones(fermentacion, "metas[0][moment]")).toHaveLength(3);
    expect(aTexto(fermentacion)).toContain("Añadir objetivo");
    expect(aTexto(fermentacion)).not.toContain("En la recepción sólo se vigila el Brix");
  });
});

describe("AccionesDelPaso", () => {
  const pintarAcciones = (seq: number, total: number): string =>
    renderToStaticMarkup(createElement(AccionesDelPaso, { recipeId: "r1", stepId: `p${seq}`, seq, total }));
  const veces = (html: string, frase: string): number => aTexto(html).split(frase).length - 1;
  const cuenta = (html: string) => [veces(html, "Subir paso"), veces(html, "Bajar paso"), veces(html, "Quitar paso")];

  it("el primero no sube, el último no baja, y todos se pueden quitar", () => {
    expect(cuenta(pintarAcciones(1, 3))).toEqual([0, 1, 1]);
    expect(cuenta(pintarAcciones(2, 3))).toEqual([1, 1, 1]);
    expect(cuenta(pintarAcciones(3, 3))).toEqual([1, 0, 1]);
    expect(cuenta(pintarAcciones(1, 1))).toEqual([0, 0, 1]);
  });

  it("cada botón manda el paso y a qué lugar va: subir al anterior, bajar al siguiente", () => {
    const html = pintarAcciones(2, 3);
    const aSeq = campos(html, "aSeq").map((c) => /value="(\d+)"/.exec(c)?.[1]);
    expect(aSeq).toEqual(["1", "3"]);
    expect(campos(html, "stepId").every((c) => /value="p2"/.test(c))).toBe(true);
    expect(campos(html, "recipeId").every((c) => /value="r1"/.test(c))).toBe(true);
  });
});

describe("formDataDeHtml — lo que un navegador mandaría de un formulario ya pintado", () => {
  // El lector que une la prueba de un componente con la de su acción es un analizador: se le dan entradas escritas a mano, no sólo el HTML real.
  const form = (cuerpo: string): string => `<div><form action="/x">${cuerpo}</form><form action="/y"><input name="otro" value="2"/></form></div>`;
  const pares = (f: FormData): [string, string][] => [...f.entries()].map(([k, v]) => [k, String(v)]);

  it("manda cada control con su name y su value, en el orden del documento, deshaciendo las entidades que React escribe", () => {
    const f = formDataDeHtml(form(`<input type="hidden" name="a" value="x &amp; &quot;y&quot; &lt;z&gt; &#x27;w&#x27;"/><input name="b" value="2"/><input name="c"/>`));
    expect(pares(f)).toEqual([
      ["a", `x & "y" <z> 'w'`],
      ["b", "2"],
      ["c", ""],
    ]);
  });

  it("una casilla sólo se manda marcada, con su value o, sin él, con «on»; varias del mismo nombre llegan en orden", () => {
    const f = formDataDeHtml(
      form(
        `<input type="checkbox" name="k" value="1"/><input type="checkbox" name="k" value="2" checked=""/><input type="checkbox" name="k" value="3" checked=""/>` +
          `<input type="checkbox" name="solo" checked=""/><input type="checkbox" name="nada"/>`,
      ),
    );
    expect(f.getAll("k")).toEqual(["2", "3"]);
    expect(f.get("solo")).toBe("on");
    expect(f.has("nada")).toBe(false);
  });

  it("no manda lo apagado, lo que no tiene nombre ni los botones", () => {
    const f = formDataDeHtml(
      form(`<input name="a" value="1" disabled=""/><input value="2"/><button type="submit" name="b" value="3">x</button><input type="submit" name="c" value="4"/><input name="ok" value="5"/>`),
    );
    expect(pares(f)).toEqual([["ok", "5"]]);
  });

  it("un desplegable manda su opción marcada; sin ninguna marcada, la primera que no esté apagada; con la apagada marcada, nada", () => {
    const f = formDataDeHtml(
      form(
        `<select name="marcada"><option value="a">A</option><option value="b" selected="">B</option><option value="c">C</option></select>` +
          `<select name="ninguna"><option value="x" disabled="">X</option><option value="y">Y</option><option value="z">Z</option></select>` +
          `<select name="apagada"><option value="" disabled="" selected="">— elige —</option><option value="q">Q</option></select>` +
          `<select name="sinValue"><option>Texto</option></select>`,
      ),
    );
    expect(pares(f)).toEqual([
      ["marcada", "b"],
      ["ninguna", "y"],
      ["sinValue", "Texto"],
    ]);
  });

  it("`elige` toca el campo como lo hace el operario: un desplegable por su rótulo, un campo de texto tecleando; lo que no existe revienta", () => {
    const html = form(`<select name="s"><option value="id1">Uno</option><option value="id2">Dos</option><option value="id3" disabled="">Tres</option></select><input name="t" value="viejo"/>`);
    expect(pares(formDataDeHtml(html, 0, { s: "Dos", t: "nuevo" }))).toEqual([
      ["s", "id2"],
      ["t", "nuevo"],
    ]);
    // Control: sin tocar nada, lo pintado.
    expect(pares(formDataDeHtml(html))).toEqual([
      ["s", "id1"],
      ["t", "viejo"],
    ]);
    expect(() => formDataDeHtml(html, 0, { s: "id2" }), "se elige por el rótulo, no por el value").toThrow("no ofrece");
    expect(() => formDataDeHtml(html, 0, { s: "Tres" })).toThrow("apagada");
    expect(() => formDataDeHtml(html, 0, { inventado: "x" })).toThrow("ningún campo");
  });

  it("pide el formulario que dice, y revienta si no hay tantos", () => {
    const html = form(`<input name="a" value="1"/>`);
    expect(pares(formDataDeHtml(html, 0))).toEqual([["a", "1"]]);
    expect(pares(formDataDeHtml(html, 1))).toEqual([["otro", "2"]]);
    expect(() => formDataDeHtml(html, 2)).toThrow("tiene 2 formularios");
  });
});

describe("FormularioDePaso — ida y vuelta: lo que se pinta es lo que un navegador manda de vuelta", () => {
  // Cada eje con TRES valores y el paso eligiendo el segundo o el tercero: con uno solo, «no precarga» y «precarga el primero» mandan lo mismo.
  const varios = (prefijo: string, nombres: string[]): ValorDeCatalogo[] => nombres.map((n, i) => valor(`${prefijo}-${i + 1}`, n));
  const CATALOGOS_VARIOS: CatalogosDelEditor = {
    tipos: [],
    estadoFruto: varios("ef", ["entera", "despulpada", "despulpada_con_mucilago"]),
    oxigeno: varios("ox", ["aerobico", "anaerobico", "microaerobico"]),
    temperatura: varios("te", ["ambiente", "controlada", "frio"]),
    fuenteMicrobiana: varios("fm", ["ninguna", "nativa", "inoculada"]),
    medio: varios("me", ["agua_limpia", "mosto_propio", "mosto_de_otro_lote"]),
    fisico: varios("fi", ["ninguno", "agitacion", "presion"]),
    sustrato: varios("su", ["doble_mosto", "pulpa", "miel"]),
    levadura: varios("le", ["MP72", "SafCafe"]),
    capacidad: varios("ca", ["sellable", "oscuridad", "frio"]),
  };
  const MODOS = [
    { valor: "open_patio", etiqueta: "Patio abierto" },
    { valor: "african_bed_outdoor", etiqueta: "Cama africana" },
    { valor: "mechanical_dryer", etiqueta: "Secadora mecánica" },
  ];

  /**
   * Un paso con TODO lo que la fila de su tipo admite, cada dato con un valor propio y distinto de los demás (los catálogos, el segundo o el tercero;
   * las cifras, todas distintas). Lo que el tipo no admite va nulo, que es lo que el servicio exige. Las tres colecciones llevan varias filas, con
   * campos llenos en una y vacíos en otra. En la recepción, la única meta es la que ese tipo compara (Brix, al llegar).
   */
  function pasoCompleto(tipo: TipoDePaso): PasoConDetalle {
    const tiene = (eje: EjeDelPaso): boolean => EJES_POR_TIPO_DE_PASO[tipo].includes(eje);
    const secado = FASE_DEL_TIPO[tipo] === "drying";
    return {
      id: "p1",
      seq: 1,
      tipo,
      stepTypeValueId: `tipo-${tipo}`,
      // Con comillas, ampersand y ángulos: React los escapa al pintar y `formDataDeHtml` los tiene que deshacer.
      intencion: `Qué busca «${tipo}» & "todo" <bien>`,
      opcional: true,
      estadoFrutoValueId: tiene("estadoFruto") ? "ef-2" : null,
      mucilagoObjetivo: tiene("mucilagoObjetivo") ? 25 : null,
      oxigenoValueId: tiene("oxigeno") ? "ox-2" : null,
      temperaturaValueId: tiene("temperatura") ? "te-3" : null,
      temperaturaMinC: tiene("temperatura") ? 12.5 : null,
      temperaturaMaxC: tiene("temperatura") ? 18 : null,
      fuenteMicrobianaValueId: tiene("fuenteMicrobiana") ? "fm-3" : null,
      medioValueId: tiene("medio") ? "me-2" : null,
      fisicoValueId: tiene("fisico") ? "fi-3" : null,
      modoSecado: tiene("modoSecado") ? "african_bed_outdoor" : null,
      horasMin: 6,
      horasSugeridas: 48,
      horasMax: 72,
      volteoCadaHoras: secado ? 3 : null,
      humedadMinPct: secado ? 10 : null,
      humedadMaxPct: secado ? 12 : null,
      finPorTiempo: true,
      reglaDeFin: "all",
      adiciones: tiene("adiciones")
        ? [
            { categoriaValueId: "su-2", cantidad: 2.5, unidad: "g/kg", momento: "post_green" },
            { categoriaValueId: tipo === "inoculation" ? "le-2" : "su-3", cantidad: null, unidad: null, momento: "pre_green" },
          ]
        : [],
      fines: [
        { variable: "moisture", operador: "lte", valor: 11.5, unidad: "%", desdeLecturaId: "lectura-1" },
        { variable: "ph", operador: "gte", valor: 3.8, unidad: "pH", desdeLecturaId: null },
      ],
      capacidadesRequeridas: ["ca-2", "ca-3"],
      metas:
        tipo === "reception"
          ? [{ variable: "brix", moment: "initial", unit: "Bx", targetValue: 20, minValue: 19, maxValue: 21, note: "al llegar", everyHours: null }]
          : [
              { variable: "ph", moment: "during", unit: "pH", targetValue: 3.8, minValue: 3.5, maxValue: 4.2, note: "cada seis horas", everyHours: 6 },
              { variable: "brix", moment: "initial", unit: "Bx", targetValue: null, minValue: 18, maxValue: null, note: null, everyHours: null },
              { variable: "moisture", moment: "final", unit: "%", targetValue: 11, minValue: null, maxValue: 12, note: null, everyHours: null },
            ],
    };
  }

  /** El paso tal como lo escribe el servicio: sin lo que sólo tiene el paso ya guardado (su id, su lugar y su tipo resuelto). */
  function sinIdentidad(paso: PasoConDetalle): PasoEditable {
    const editable: Record<string, unknown> = { ...paso };
    for (const k of ["id", "seq", "tipo"]) delete editable[k];
    return editable as unknown as PasoEditable;
  }

  /** Pinta el formulario de edición de ese paso y devuelve lo que un navegador mandaría sin tocar nada, leído por `pasoDeFormulario`. */
  const vuelta = (paso: PasoConDetalle): PasoEditable =>
    pasoDeFormulario(
      formDataDeHtml(pintar({ modo: "editar", stepId: "p1", inicial: valoresDelFormulario(paso), catalogos: CATALOGOS_VARIOS, modosDeSecado: MODOS })),
    );

  it("para cada tipo, un paso con todo lo que su fila admite se pinta y se reenvía idéntico: ningún campo se pierde ni se lee del de otro", () => {
    expect(TIPOS_DE_PASO.length, "control: son 24 tipos").toBe(24);
    const mal: string[] = [];
    for (const tipo of TIPOS_DE_PASO) {
      const esperado = sinIdentidad(pasoCompleto(tipo));
      const recibido = vuelta(pasoCompleto(tipo));
      for (const campo of Object.keys(esperado) as (keyof PasoEditable)[]) {
        if (JSON.stringify(recibido[campo]) !== JSON.stringify(esperado[campo])) {
          mal.push(`${tipo}/${campo}: ${JSON.stringify(esperado[campo])} → ${JSON.stringify(recibido[campo])}`);
        }
      }
    }
    expect(mal).toEqual([]);
  });

  it("control: entre los 24 tipos se llenan los veinticinco campos del paso y cada subcampo de adiciones, fines y metas", () => {
    const blanco = pasoEnBlanco();
    const llenos = new Set<string>();
    const subcampos = new Set<string>();
    const lleno = (x: unknown): boolean => x !== "" && x !== false && !(Array.isArray(x) && x.length === 0);
    for (const tipo of TIPOS_DE_PASO) {
      const v = valoresDelFormulario(pasoCompleto(tipo));
      // Distinto de lo que nace en blanco (`reglaDeFin` nace en «first», que no es un campo vacío pero tampoco está probado por serlo).
      for (const k of Object.keys(blanco) as (keyof PasoInicial)[]) if (JSON.stringify(v[k]) !== JSON.stringify(blanco[k])) llenos.add(k);
      for (const coleccion of ["adiciones", "fines", "metas"] as const) {
        for (const fila of v[coleccion]) for (const [k, x] of Object.entries(fila)) if (lleno(x)) subcampos.add(`${coleccion}.${k}`);
      }
    }
    expect(Object.keys(blanco).length, "control: son veinticinco").toBe(25);
    expect([...llenos].sort()).toEqual(Object.keys(blanco).sort());
    // 4 de adiciones + 5 de fines + 8 de metas.
    expect(subcampos.size).toBe(17);
  });

  it("control: la ida y vuelta se entera cuando el HTML dice otra cosa que el paso (no pasa vacía)", () => {
    const paso = pasoCompleto("fermentation");
    expect(vuelta(paso)).toEqual(sinIdentidad(paso));
    // Se pinta OTRO paso y se compara con el original: tiene que salir distinto en cada cosa que se cambió.
    const otro: PasoConDetalle = { ...paso, oxigenoValueId: "ox-3", reglaDeFin: "first", metas: [{ ...paso.metas[0]!, targetValue: 9 }, ...paso.metas.slice(1)] };
    const recibido = vuelta(otro);
    expect(recibido).not.toEqual(sinIdentidad(paso));
    expect([recibido.oxigenoValueId, recibido.reglaDeFin, recibido.metas?.[0]?.targetValue]).toEqual(["ox-3", "first", 9]);
  });
});
