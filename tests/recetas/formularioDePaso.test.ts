/**
 * Del formulario del paso a `PasoEditable`, y de vuelta — Parte 2a, tarea 14 (2026-10-03). Hermética: `FormData` en memoria, sin base.
 *
 * Esto es lo que decide «qué campo del formulario es qué dato», y por eso vive en `lib/` y se prueba sin una acción de por medio
 * (`app/actions/traceability.ts` es `"use server"` y sólo puede exportar funciones `async`). Cada rechazo lleva al lado el caso válido que
 * pasa, para que no pase vacío. Los casos que más importan son los que **pierden un dato sin avisar**: un cero que se vuelve «falta»,
 * una fila que se lee a medias, la lectura de cierre de una condición de fin que el formulario no devuelve.
 */
import { describe, expect, it } from "vitest";
import { RecipeError } from "../../lib/recetas/errorDeReceta";
import {
  pasoDeFormulario,
  pasoEnBlanco,
  posicionDeFormulario,
  valoresDelFormulario,
  type PasoInicial,
} from "../../lib/recetas/formularioDePaso";
import type { PasoConDetalle, PasoEditable } from "../../lib/recetas/pasos";

/** Un `FormData` con los campos dados; una lista repite el campo (las casillas de capacidades llegan así). */
function formulario(campos: Record<string, string | readonly string[]>): FormData {
  const f = new FormData();
  for (const [campo, valor] of Object.entries(campos)) {
    for (const v of typeof valor === "string" ? [valor] : valor) f.append(campo, v);
  }
  return f;
}

/** El código de `RecipeError` con que rechaza el formulario, o `null` si lo acepta. Cualquier otro error se relanza. */
function codigoDe(f: FormData): string | null {
  try {
    pasoDeFormulario(f);
    return null;
  } catch (error) {
    if (error instanceof RecipeError) return error.message;
    throw error;
  }
}

/**
 * Lo que manda un secado con todo lleno, tal como lo escribe el formulario.
 *
 * «Todo lleno» incluye los cuatro ejes de catálogo que un secado no usa (oxígeno, fuente microbiana, medio, físico), cada uno con un
 * valor DISTINTO: el parseo no comprueba a qué tipo de paso aplica cada eje (eso es del servicio), y sólo con valores propios se ve un
 * eje leído del campo de otro o descartado en silencio. Con esos cuatro en blanco, nueve mutaciones de `formularioDePaso.ts` sobrevivían
 * a los 26 casos (ronda de arreglo de T14B, H1).
 */
const SECADO: Record<string, string | readonly string[]> = {
  stepTypeValueId: "tipo-secado",
  intencion: "  Secar en cama africana  ",
  opcional: "on",
  estadoFrutoValueId: "ef-1",
  mucilagoObjetivo: "0",
  oxigenoValueId: "ox-1",
  temperaturaValueId: "te-1",
  temperaturaMinC: "18.5",
  temperaturaMaxC: "30",
  fuenteMicrobianaValueId: "fm-1",
  medioValueId: "me-1",
  fisicoValueId: "fi-1",
  modoSecado: "african_bed_outdoor",
  horasMin: "120",
  horasSugeridas: "168",
  horasMax: "240",
  volteoCadaHoras: "3",
  humedadMinPct: "10",
  humedadMaxPct: "12",
  finPorTiempo: "on",
  reglaDeFin: "all",
  "adiciones[0][categoriaValueId]": "su-1",
  "adiciones[0][cantidad]": "2.5",
  "adiciones[0][unidad]": "g/kg",
  "adiciones[0][momento]": "post_green",
  "fines[0][variable]": "moisture",
  "fines[0][operador]": "lte",
  "fines[0][valor]": "11.5",
  "fines[0][unidad]": "%",
  "fines[0][desdeLecturaId]": "lectura-1",
  capacidadesRequeridas: ["ca-1", "ca-2"],
  "metas[0][variable]": "moisture",
  "metas[0][moment]": "during",
  "metas[0][unit]": "%",
  "metas[0][targetValue]": "",
  "metas[0][minValue]": "10",
  "metas[0][maxValue]": "12",
  "metas[0][everyHours]": "12",
  "metas[0][note]": "  en la cama  ",
};

/** Lo que el servicio tiene que recibir de ese formulario. */
const SECADO_PARSEADO: PasoEditable = {
  stepTypeValueId: "tipo-secado",
  intencion: "Secar en cama africana",
  opcional: true,
  estadoFrutoValueId: "ef-1",
  mucilagoObjetivo: 0,
  oxigenoValueId: "ox-1",
  temperaturaValueId: "te-1",
  temperaturaMinC: 18.5,
  temperaturaMaxC: 30,
  fuenteMicrobianaValueId: "fm-1",
  medioValueId: "me-1",
  fisicoValueId: "fi-1",
  modoSecado: "african_bed_outdoor",
  horasMin: 120,
  horasSugeridas: 168,
  horasMax: 240,
  volteoCadaHoras: 3,
  humedadMinPct: 10,
  humedadMaxPct: 12,
  finPorTiempo: true,
  reglaDeFin: "all",
  adiciones: [{ categoriaValueId: "su-1", cantidad: 2.5, unidad: "g/kg", momento: "post_green" }],
  fines: [{ variable: "moisture", operador: "lte", valor: 11.5, unidad: "%", desdeLecturaId: "lectura-1" }],
  capacidadesRequeridas: ["ca-1", "ca-2"],
  metas: [
    { variable: "moisture", moment: "during", unit: "%", targetValue: null, minValue: 10, maxValue: 12, note: "en la cama", everyHours: 12 },
  ],
};

describe("pasoDeFormulario — lo que el formulario manda llega entero", () => {
  it("un secado con todo lleno llega con cada campo en su sitio, los blancos en nulo y el texto recortado", () => {
    expect(pasoDeFormulario(formulario(SECADO))).toEqual(SECADO_PARSEADO);
  });

  it("lo que el formulario deja en blanco es nulo o falso, nunca cero ni cadena vacía; y un cero tecleado sigue siendo cero", () => {
    expect(pasoDeFormulario(formulario({ stepTypeValueId: "t" }))).toEqual({
      stepTypeValueId: "t",
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
    });
    // Control: Lavado = 0 % de mucílago que QUEDA es un dato (Ruling M: 0 = Lavado, 100 = Honey), y no «no se declaró».
    const lavado = pasoDeFormulario(formulario({ stepTypeValueId: "t", mucilagoObjetivo: "0", humedadMinPct: "0" }));
    expect(lavado.mucilagoObjetivo).toBe(0);
    expect(lavado.humedadMinPct).toBe(0);
  });

  it("las tres colecciones se leen por índice y se paran en la primera fila sin su campo identificador", () => {
    const adiciones = pasoDeFormulario(
      formulario({
        stepTypeValueId: "t",
        "adiciones[0][categoriaValueId]": "a",
        "adiciones[0][momento]": "pre_green",
        "adiciones[1][categoriaValueId]": "b",
        "adiciones[1][momento]": "post_green",
        // La fila 2 no trae su categoría (un envío cortado); la 3 sí. Leer más allá del hueco sería inventar un orden.
        "adiciones[2][momento]": "pre_green",
        "adiciones[3][categoriaValueId]": "d",
        "adiciones[3][momento]": "pre_green",
      }),
    ).adiciones ?? [];
    expect(adiciones.map((a) => a.categoriaValueId)).toEqual(["a", "b"]);

    const fines = pasoDeFormulario(
      formulario({
        stepTypeValueId: "t",
        "fines[0][variable]": "ph",
        "fines[0][operador]": "lte",
        "fines[0][valor]": "3.9",
        "fines[1][variable]": "moisture",
        "fines[1][operador]": "lte",
        "fines[1][valor]": "11.5",
        "fines[2][operador]": "lte",
        "fines[2][valor]": "1",
        "fines[3][variable]": "brix",
        "fines[3][operador]": "gte",
        "fines[3][valor]": "5",
      }),
    ).fines ?? [];
    expect(fines.map((f) => f.variable)).toEqual(["ph", "moisture"]);

    const metas = pasoDeFormulario(
      formulario({
        stepTypeValueId: "t",
        "metas[0][variable]": "ph",
        "metas[0][moment]": "final",
        "metas[0][targetValue]": "3.8",
        "metas[1][variable]": "moisture",
        "metas[1][moment]": "final",
        "metas[1][targetValue]": "11",
        "metas[2][moment]": "final",
        "metas[2][targetValue]": "1",
        "metas[3][variable]": "brix",
        "metas[3][moment]": "initial",
        "metas[3][targetValue]": "20",
      }),
    ).metas ?? [];
    expect(metas.map((m) => m.variable)).toEqual(["ph", "moisture"]);
  });

  it("el vínculo de una condición de fin con su lectura de cierre sobrevive al formulario", () => {
    // Sin esto, guardar un paso sin tocar nada borraba, en silencio, de qué lectura marcada había salido el fin (diseño §5.3).
    const base = { stepTypeValueId: "t", "fines[0][variable]": "moisture", "fines[0][operador]": "lte", "fines[0][valor]": "11.5" };
    expect(pasoDeFormulario(formulario({ ...base, "fines[0][desdeLecturaId]": "lectura-1" })).fines?.[0]?.desdeLecturaId).toBe("lectura-1");
    // Control: una condición escrita a mano no trae vínculo, y sale en nulo.
    expect(pasoDeFormulario(formulario(base)).fines?.[0]?.desdeLecturaId).toBeNull();
  });

  it("las capacidades que pide el paso llegan como lista, sin blancos", () => {
    expect(pasoDeFormulario(formulario({ stepTypeValueId: "t", capacidadesRequeridas: ["ca-1", " ", "ca-2"] })).capacidadesRequeridas).toEqual([
      "ca-1",
      "ca-2",
    ]);
    expect(pasoDeFormulario(formulario({ stepTypeValueId: "t" })).capacidadesRequeridas).toEqual([]);
  });
});

describe("pasoDeFormulario — lo que no se puede leer se rechaza con el código de su campo", () => {
  /** Un formulario válido con una fila de cada colección, para que sólo falle el campo que cada caso estropea. */
  const BASE: Record<string, string> = {
    stepTypeValueId: "t",
    "adiciones[0][categoriaValueId]": "a",
    "adiciones[0][momento]": "pre_green",
    "fines[0][variable]": "ph",
    "fines[0][operador]": "lte",
    "fines[0][valor]": "3.9",
    "metas[0][variable]": "ph",
    "metas[0][moment]": "final",
    "metas[0][targetValue]": "3.8",
  };

  it("el formulario base es válido (control de los casos de abajo)", () => {
    expect(codigoDe(formulario(BASE))).toBeNull();
  });

  const ILEGIBLES: [string, string, string, string][] = [
    ["horasSugeridas", "abc", "horas_invalidas", "12"],
    ["volteoCadaHoras", "Infinity", "horas_invalidas", "12"],
    // Ruling M: el mucílago es de seis tramos, y el parseo no los comprueba (eso es del servicio); lo ilegible sí se rechaza aquí, con su propio código.
    ["mucilagoObjetivo", "x", "mucilago_fuera_de_tramos", "25"],
    ["humedadMaxPct", "NaN", "porcentaje_fuera_de_rango", "12"],
    ["temperaturaMinC", "frío", "rango_invalido", "12"],
    ["adiciones[0][cantidad]", "poco", "adicion_invalida", "12"],
    ["fines[0][valor]", "x", "fin_invalido", "12"],
    ["metas[0][targetValue]", "x", "rango_invalido", "12"],
    ["metas[0][everyHours]", "1.x", "horas_invalidas", "12"],
    // Los seis campos numéricos restantes (ronda de arreglo de T14B, H2): cada uno con SU código, que no es el de su vecino de al lado
    // (horasMin/horasMax/horasSugeridas/volteo → horas; temperaturas y rangos de meta → rango; humedades → porcentaje). Sin su fila,
    // cambiar el código de uno de ellos al de otro campo no lo veía ninguna prueba.
    ["horasMin", "dos", "horas_invalidas", "12"],
    // «1e999» es un numeral bien escrito que no es finito (`Number("1e999")` es `Infinity`): tampoco pasa.
    ["horasMax", "1e999", "horas_invalidas", "12"],
    ["temperaturaMaxC", "caliente", "rango_invalido", "12"],
    ["humedadMinPct", "poca", "porcentaje_fuera_de_rango", "12"],
    ["metas[0][minValue]", "bajo", "rango_invalido", "12"],
    ["metas[0][maxValue]", "alto", "rango_invalido", "12"],
  ];
  it.each(ILEGIBLES)("un número ilegible en %s («%s») se rechaza con %s; uno bien escrito («%s») pasa", (campo, ilegible, codigo, bueno) => {
    // Control: el MISMO campo con un número pasa el parseo (un `NaN` no es un caso que `Number.isFinite` deje pasar).
    expect(codigoDe(formulario({ ...BASE, [campo]: bueno })), `con «${bueno}» en ${campo}`).toBeNull();
    expect(codigoDe(formulario({ ...BASE, [campo]: ilegible }))).toBe(codigo);
  });

  const FUERA_DE_SU_LISTA: [string, string, string, string][] = [
    ["adiciones[0][momento]", "tarde", "adicion_invalida", "post_green"],
    ["fines[0][operador]", "eq", "fin_invalido", "gte"],
    ["metas[0][moment]", "siempre", "valor_de_otro_catalogo", "during"],
    ["modoSecado", "volando", "valor_de_otro_catalogo", "open_patio"],
    ["reglaDeFin", "ninguna", "fin_invalido", "all"],
  ];
  it.each(FUERA_DE_SU_LISTA)("un valor fuera de su lista en %s («%s») se rechaza con %s; uno de la lista («%s») pasa", (campo, malo, codigo, bueno) => {
    expect(codigoDe(formulario({ ...BASE, [campo]: bueno })), `con «${bueno}» en ${campo}`).toBeNull();
    expect(codigoDe(formulario({ ...BASE, [campo]: malo }))).toBe(codigo);
  });

  it("una condición de fin sin valor se rechaza: no se vuelve un cero", () => {
    expect(codigoDe(formulario({ ...BASE, "fines[0][valor]": "" }))).toBe("fin_invalido");
    expect(codigoDe(formulario({ ...BASE, "fines[0][valor]": "3.9" }))).toBeNull();
  });
});

describe("pasoDeFormulario — el tope de filas de cada colección", () => {
  // Ronda de arreglo de T14B, H3. Esto FIJA lo que hay, no lo defiende: el tope de 50 filas es el que `parseTargetRows` tuvo desde ADR-100 y
  // el formulario heredó, y de la fila 51 en adelante se descarta SIN aviso (el servicio no se entera de que hubo más). Cambiar el tope, o hacer
  // que avise, pide una decisión de Daniel: si alguien lo toca, estas pruebas caen por su nombre y lo dicen, que es lo que se busca.
  const TOPE = 50;

  /** [colección, prefijo del identificador de cada fila, los campos de la fila `i` con ese identificador, lo que el paso leyó]. */
  const COLECCIONES: [string, string, (i: number, id: string) => Record<string, string>, (p: PasoEditable) => string[]][] = [
    [
      "adiciones",
      "a",
      (i, id) => ({ [`adiciones[${i}][categoriaValueId]`]: id, [`adiciones[${i}][momento]`]: "pre_green" }),
      (p) => (p.adiciones ?? []).map((a) => a.categoriaValueId),
    ],
    [
      "fines",
      "v",
      (i, id) => ({ [`fines[${i}][variable]`]: id, [`fines[${i}][operador]`]: "lte", [`fines[${i}][valor]`]: "1" }),
      (p) => (p.fines ?? []).map((f) => f.variable),
    ],
    [
      "metas",
      "m",
      (i, id) => ({ [`metas[${i}][variable]`]: id, [`metas[${i}][moment]`]: "final" }),
      (p) => (p.metas ?? []).map((m) => m.variable),
    ],
  ];

  /** Un formulario con `n` filas válidas de una colección, cada una con su identificador `<prefijo><i>`. */
  function conFilas(n: number, prefijo: string, fila: (i: number, id: string) => Record<string, string>): FormData {
    const campos: Record<string, string> = { stepTypeValueId: "t" };
    for (let i = 0; i < n; i++) Object.assign(campos, fila(i, `${prefijo}${i}`));
    return formulario(campos);
  }

  it.each(COLECCIONES)("con 50 filas de %s se leen las 50, en orden", (_coleccion, prefijo, fila, leer) => {
    const esperadas = Array.from({ length: TOPE }, (_, i) => `${prefijo}${i}`);
    expect(leer(pasoDeFormulario(conFilas(TOPE, prefijo, fila)))).toEqual(esperadas);
  });

  it.each(COLECCIONES)("la fila 51 de %s se descarta sin aviso: se leen exactamente 50 (el tope heredado de parseTargetRows)", (_coleccion, prefijo, fila, leer) => {
    // Control: la fila 51 es VÁLIDA (si no, el rechazo sería suyo y no del tope), y la lectura no lanza: descarta, no avisa.
    const leidas = leer(pasoDeFormulario(conFilas(TOPE + 1, prefijo, fila)));
    expect(leidas).toHaveLength(TOPE);
    expect(leidas).toEqual(Array.from({ length: TOPE }, (_, i) => `${prefijo}${i}`));
  });
});

describe("posicionDeFormulario", () => {
  it("un campo en blanco o ausente es «sin posición»; un entero es la posición; lo demás se rechaza", () => {
    expect(posicionDeFormulario(formulario({ despuesDeSeq: "" }), "despuesDeSeq")).toBeNull();
    expect(posicionDeFormulario(formulario({}), "despuesDeSeq")).toBeNull();
    expect(posicionDeFormulario(formulario({ despuesDeSeq: "3" }), "despuesDeSeq")).toBe(3);
    for (const malo of ["x", "2.5"]) {
      expect(() => posicionDeFormulario(formulario({ despuesDeSeq: malo }), "despuesDeSeq"), malo).toThrow(new RecipeError("posicion_invalida"));
    }
  });
});

describe("valoresDelFormulario — lo que el formulario de edición precarga", () => {
  /** Un paso guardado, con todo dicho: lo que no llegó es nulo, falso o una lista vacía (como `leerPasos`). */
  function pasoGuardado(extra: Partial<PasoConDetalle> = {}): PasoConDetalle {
    return {
      id: "p1",
      seq: 2,
      tipo: "drying",
      stepTypeValueId: "tipo-secado",
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

  it("un cero guardado se precarga como «0», no como un campo vacío; los nulos, como vacíos", () => {
    const v = valoresDelFormulario(pasoGuardado({ mucilagoObjetivo: 0, horasSugeridas: 48 }));
    expect(v.mucilagoObjetivo).toBe("0");
    expect(v.horasSugeridas).toBe("48");
    // Control: lo que no se declaró queda vacío, para que guardar sin tocar no lo convierta en un cero.
    expect(v.horasMax).toBe("");
    expect(v.intencion).toBe("");
    expect(v.modoSecado).toBe("");
  });

  it("precarga cada eje de catálogo con su propio valor: ninguno se lee del campo de otro ni se pierde", () => {
    // Ronda de arreglo de T14B, H1: oxígeno, fuente microbiana, medio y físico, cada uno con un valor distinto (con los cuatro vacíos, leer
    // uno del campo de otro o dejarlo en blanco daba el mismo resultado).
    const v = valoresDelFormulario(
      pasoGuardado({ oxigenoValueId: "ox-1", fuenteMicrobianaValueId: "fm-1", medioValueId: "me-1", fisicoValueId: "fi-1" }),
    );
    expect({ oxigeno: v.oxigenoValueId, fuenteMicrobiana: v.fuenteMicrobianaValueId, medio: v.medioValueId, fisico: v.fisicoValueId }).toEqual({
      oxigeno: "ox-1",
      fuenteMicrobiana: "fm-1",
      medio: "me-1",
      fisico: "fi-1",
    });
    // Control: sin valor guardado los cuatro quedan vacíos, para que guardar sin tocar no invente uno.
    const vacio = valoresDelFormulario(pasoGuardado());
    expect([vacio.oxigenoValueId, vacio.fuenteMicrobianaValueId, vacio.medioValueId, vacio.fisicoValueId]).toEqual(["", "", "", ""]);
  });

  it("precarga la lectura de cierre de cada condición de fin y no comparte las listas con el paso", () => {
    const paso = pasoGuardado({ fines: [{ variable: "moisture", operador: "lte", valor: 11.5, unidad: "%", desdeLecturaId: "lectura-1" }] });
    const v = valoresDelFormulario(paso);
    expect(v.fines).toEqual([{ variable: "moisture", operador: "lte", valor: "11.5", unidad: "%", desdeLecturaId: "lectura-1" }]);
    expect(v.capacidadesRequeridas).not.toBe(paso.capacidadesRequeridas);
  });

  it("pasoEnBlanco tiene exactamente los campos de lo que se precarga", () => {
    const de = Object.keys(valoresDelFormulario(pasoGuardado())).sort();
    expect(de.length, "control: son los veinticinco campos del paso").toBe(25);
    expect(Object.keys(pasoEnBlanco()).sort()).toEqual(de);
  });

  it("ida y vuelta: precargar un paso y reenviarlo sin tocarlo da el mismo paso (nada se pierde al guardar)", () => {
    const guardado = { id: "p1", seq: 1, tipo: "drying", ...SECADO_PARSEADO } as PasoConDetalle;
    const v = valoresDelFormulario(guardado);
    expect(pasoDeFormulario(formularioDe(v))).toEqual(SECADO_PARSEADO);
  });

  /** Lo que escribe el formulario con esos valores precargados, sin tocarlos. */
  function formularioDe(v: PasoInicial): FormData {
    const f = new FormData();
    const escalares: [string, string][] = [
      ["stepTypeValueId", v.stepTypeValueId],
      ["intencion", v.intencion],
      ["estadoFrutoValueId", v.estadoFrutoValueId],
      ["mucilagoObjetivo", v.mucilagoObjetivo],
      ["oxigenoValueId", v.oxigenoValueId],
      ["temperaturaValueId", v.temperaturaValueId],
      ["temperaturaMinC", v.temperaturaMinC],
      ["temperaturaMaxC", v.temperaturaMaxC],
      ["fuenteMicrobianaValueId", v.fuenteMicrobianaValueId],
      ["medioValueId", v.medioValueId],
      ["fisicoValueId", v.fisicoValueId],
      ["modoSecado", v.modoSecado],
      ["horasMin", v.horasMin],
      ["horasSugeridas", v.horasSugeridas],
      ["horasMax", v.horasMax],
      ["volteoCadaHoras", v.volteoCadaHoras],
      ["humedadMinPct", v.humedadMinPct],
      ["humedadMaxPct", v.humedadMaxPct],
      ["reglaDeFin", v.reglaDeFin],
    ];
    for (const [campo, valor] of escalares) f.append(campo, valor);
    if (v.opcional) f.append("opcional", "on");
    if (v.finPorTiempo) f.append("finPorTiempo", "on");
    v.adiciones.forEach((a, i) => {
      f.append(`adiciones[${i}][categoriaValueId]`, a.categoriaValueId);
      f.append(`adiciones[${i}][cantidad]`, a.cantidad);
      f.append(`adiciones[${i}][unidad]`, a.unidad);
      f.append(`adiciones[${i}][momento]`, a.momento);
    });
    v.fines.forEach((x, i) => {
      f.append(`fines[${i}][variable]`, x.variable);
      f.append(`fines[${i}][operador]`, x.operador);
      f.append(`fines[${i}][valor]`, x.valor);
      f.append(`fines[${i}][unidad]`, x.unidad);
      f.append(`fines[${i}][desdeLecturaId]`, x.desdeLecturaId);
    });
    for (const c of v.capacidadesRequeridas) f.append("capacidadesRequeridas", c);
    v.metas.forEach((m, i) => {
      f.append(`metas[${i}][variable]`, m.variable);
      f.append(`metas[${i}][moment]`, m.moment);
      f.append(`metas[${i}][unit]`, m.unit);
      f.append(`metas[${i}][targetValue]`, m.targetValue);
      f.append(`metas[${i}][minValue]`, m.minValue);
      f.append(`metas[${i}][maxValue]`, m.maxValue);
      f.append(`metas[${i}][everyHours]`, m.everyHours);
      f.append(`metas[${i}][note]`, m.note);
    });
    return f;
  }
});
