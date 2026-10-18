/**
 * Del formulario del paso a `PasoEditable`, y del paso guardado a lo que el formulario precarga — Parte 2a, tarea 14
 * (2026-10-03).
 *
 * Vive en `lib/` y no en `app/actions/traceability.ts` por la razón de `claveDeErrorDeProceso`: un archivo `"use server"` sólo
 * puede exportar funciones `async` (`tests/arquitectura/use-server-solo-async.test.ts`), y lo que decide «qué campo del
 * formulario es qué dato» tiene que poder PROBARSE sin una acción de por medio.
 *
 * **Los nombres de los campos son los de `PasoEditable`, letra por letra,** y las tres colecciones llegan como
 * `adiciones[0][cantidad]`, `fines[0][valor]` y `metas[0][variable]` —el esquema que `parseTargetRows` tuvo desde ADR-100—, leídas
 * hasta la primera fila sin su campo identificador: un hueco corta, porque seguir leyendo más allá inventaría un orden.
 * `tests/arquitectura/campos-con-dos-puertas.test.ts` exige que cada campo de `PasoEditable` aparezca aquí, en el formulario
 * y en las funciones de `lib/recetas/pasos.ts`: es el defecto del 2026-09-13 (un campo que se cierra en una puerta y no en otra se
 * pierde en silencio) con los pasos por delante.
 *
 * **Un número ilegible no es «falta».** `Number("abc")` es `NaN`, y `NaN < límite` es `false`: una comprobación de rango lo deja pasar
 * y lo que llega a la base es otro error. Aquí se rechaza con el código del campo —el que ya tiene su texto en
 * `CODIGOS_DE_RECETA_TRADUCIDOS`— antes de que llegue al servicio. Y **un cero tecleado es un cero**: el Lavado es 0 % de mucílago que
 * QUEDA (Ruling M; 100 % es Honey), y vaciarlo a «no se declaró» sería borrar un dato. El parseo no comprueba los seis tramos del mucílago:
 * eso es del servicio (`mucilago_fuera_de_tramos`), y el formulario sólo ofrece esos seis.
 *
 * **Lo que el formulario precarga al editar** (`valoresDelFormulario`) devuelve cada campo, incluida la lectura de cierre de cada
 * condición de fin: el formulario no la enseña, pero la reenvía. Sin eso, guardar un paso sin tocar nada se la llevaría.
 */
import type { AdditionMoment, ProcessTargetMoment, StepEndOperator, StepEndRule } from "../../generated/prisma/client";
import { AMBIENTES_DE_SECADO } from "../traceability/secadoForm";
import { RecipeError } from "./errorDeReceta";
import type { AdicionDelPaso, FinDelPaso, MetaDelPaso, PasoConDetalle, PasoEditable } from "./pasos";

/**
 * Cuántas filas de adición, fin o meta se leen como máximo: el mismo tope que `parseTargetRows` tuvo desde ADR-100. **Lo respeta también el formulario** (revisión final de la
 * Parte 2a, F1-1): los botones de «añadir» de `FormularioDePaso` se apagan al llegar a él, porque la fila 51 se pintaba, y al guardar se descartaba sin decir nada.
 */
export const MAX_FILAS = 50;

const MOMENTOS_DE_ADICION: readonly AdditionMoment[] = ["pre_green", "post_green"];
const OPERADORES_DE_FIN: readonly StepEndOperator[] = ["gte", "lte"];
const REGLAS_DE_FIN: readonly StepEndRule[] = ["first", "all"];
const MOMENTOS_DE_META: readonly ProcessTargetMoment[] = ["initial", "during", "final"];

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function textoONulo(formData: FormData, campo: string): string | null {
  const t = texto(formData, campo);
  return t === "" ? null : t;
}

/** Un número que puede faltar. Ilegible no es «falta»: se rechaza con el código del campo. */
function numeroONulo(formData: FormData, campo: string, codigo: string): number | null {
  const crudo = texto(formData, campo);
  if (crudo === "") return null;
  const n = Number(crudo);
  if (!Number.isFinite(n)) throw new RecipeError(codigo);
  return n;
}

/** Una casilla marcada llega como «on»; sin marcar, no llega. */
function casilla(formData: FormData, campo: string): boolean {
  return formData.get(campo) === "on";
}

/** Un valor que tiene que ser uno de la lista. */
function elegir<T extends string>(formData: FormData, campo: string, validos: readonly T[], codigo: string): T {
  const crudo = texto(formData, campo);
  const valido = validos.find((v) => v === crudo);
  if (valido === undefined) throw new RecipeError(codigo);
  return valido;
}

/** Igual, pero en blanco es «no se declaró». */
function elegirONulo<T extends string>(formData: FormData, campo: string, validos: readonly T[], codigo: string): T | null {
  return texto(formData, campo) === "" ? null : elegir(formData, campo, validos, codigo);
}

export function pasoDeFormulario(formData: FormData): PasoEditable {
  const adiciones: AdicionDelPaso[] = [];
  for (let i = 0; i < MAX_FILAS; i++) {
    const categoriaValueId = texto(formData, `adiciones[${i}][categoriaValueId]`);
    if (categoriaValueId === "") break;
    adiciones.push({
      categoriaValueId,
      cantidad: numeroONulo(formData, `adiciones[${i}][cantidad]`, "adicion_invalida"),
      unidad: textoONulo(formData, `adiciones[${i}][unidad]`),
      momento: elegir(formData, `adiciones[${i}][momento]`, MOMENTOS_DE_ADICION, "adicion_invalida"),
    });
  }

  const fines: FinDelPaso[] = [];
  for (let i = 0; i < MAX_FILAS; i++) {
    const variable = texto(formData, `fines[${i}][variable]`);
    if (variable === "") break;
    const valor = numeroONulo(formData, `fines[${i}][valor]`, "fin_invalido");
    if (valor === null) throw new RecipeError("fin_invalido");
    fines.push({
      variable,
      operador: elegir(formData, `fines[${i}][operador]`, OPERADORES_DE_FIN, "fin_invalido"),
      valor,
      unidad: texto(formData, `fines[${i}][unidad]`),
      desdeLecturaId: textoONulo(formData, `fines[${i}][desdeLecturaId]`),
    });
  }

  const metas: MetaDelPaso[] = [];
  for (let i = 0; i < MAX_FILAS; i++) {
    const variable = texto(formData, `metas[${i}][variable]`);
    if (variable === "") break;
    metas.push({
      variable,
      moment: elegir(formData, `metas[${i}][moment]`, MOMENTOS_DE_META, "valor_de_otro_catalogo"),
      unit: texto(formData, `metas[${i}][unit]`),
      targetValue: numeroONulo(formData, `metas[${i}][targetValue]`, "rango_invalido"),
      minValue: numeroONulo(formData, `metas[${i}][minValue]`, "rango_invalido"),
      maxValue: numeroONulo(formData, `metas[${i}][maxValue]`, "rango_invalido"),
      note: textoONulo(formData, `metas[${i}][note]`),
      everyHours: numeroONulo(formData, `metas[${i}][everyHours]`, "horas_invalidas"),
    });
  }

  return {
    stepTypeValueId: texto(formData, "stepTypeValueId"),
    intencion: textoONulo(formData, "intencion"),
    opcional: casilla(formData, "opcional"),
    estadoFrutoValueId: textoONulo(formData, "estadoFrutoValueId"),
    mucilagoObjetivo: numeroONulo(formData, "mucilagoObjetivo", "mucilago_fuera_de_tramos"),
    oxigenoValueId: textoONulo(formData, "oxigenoValueId"),
    temperaturaValueId: textoONulo(formData, "temperaturaValueId"),
    temperaturaMinC: numeroONulo(formData, "temperaturaMinC", "rango_invalido"),
    temperaturaMaxC: numeroONulo(formData, "temperaturaMaxC", "rango_invalido"),
    fuenteMicrobianaValueId: textoONulo(formData, "fuenteMicrobianaValueId"),
    medioValueId: textoONulo(formData, "medioValueId"),
    fisicoValueId: textoONulo(formData, "fisicoValueId"),
    modoSecado: elegirONulo(formData, "modoSecado", AMBIENTES_DE_SECADO, "valor_de_otro_catalogo"),
    horasMin: numeroONulo(formData, "horasMin", "horas_invalidas"),
    horasSugeridas: numeroONulo(formData, "horasSugeridas", "horas_invalidas"),
    horasMax: numeroONulo(formData, "horasMax", "horas_invalidas"),
    volteoCadaHoras: numeroONulo(formData, "volteoCadaHoras", "horas_invalidas"),
    humedadMinPct: numeroONulo(formData, "humedadMinPct", "porcentaje_fuera_de_rango"),
    humedadMaxPct: numeroONulo(formData, "humedadMaxPct", "porcentaje_fuera_de_rango"),
    finPorTiempo: casilla(formData, "finPorTiempo"),
    reglaDeFin: elegirONulo(formData, "reglaDeFin", REGLAS_DE_FIN, "fin_invalido") ?? "first",
    adiciones,
    fines,
    capacidadesRequeridas: formData.getAll("capacidadesRequeridas").map((v) => String(v).trim()).filter((v) => v !== ""),
    metas,
  };
}

/** Una posición de la lista de pasos (`despuesDeSeq`, `aSeq`): en blanco es «sin posición», un entero es la posición, lo demás se rechaza. */
export function posicionDeFormulario(formData: FormData, campo: string): number | null {
  const crudo = texto(formData, campo);
  if (crudo === "") return null;
  const n = Number(crudo);
  if (!Number.isInteger(n)) throw new RecipeError("posicion_invalida");
  return n;
}

/** Lo que el formulario precarga de un paso: todo como texto, que es lo que un campo de formulario guarda. */
export interface PasoInicial {
  stepTypeValueId: string;
  intencion: string;
  opcional: boolean;
  estadoFrutoValueId: string;
  mucilagoObjetivo: string;
  oxigenoValueId: string;
  temperaturaValueId: string;
  temperaturaMinC: string;
  temperaturaMaxC: string;
  fuenteMicrobianaValueId: string;
  medioValueId: string;
  fisicoValueId: string;
  modoSecado: string;
  horasMin: string;
  horasSugeridas: string;
  horasMax: string;
  volteoCadaHoras: string;
  humedadMinPct: string;
  humedadMaxPct: string;
  finPorTiempo: boolean;
  reglaDeFin: StepEndRule;
  adiciones: { categoriaValueId: string; cantidad: string; unidad: string; momento: AdditionMoment }[];
  fines: { variable: string; operador: StepEndOperator; valor: string; unidad: string; desdeLecturaId: string }[];
  capacidadesRequeridas: string[];
  metas: {
    variable: string;
    moment: ProcessTargetMoment;
    unit: string;
    targetValue: string;
    minValue: string;
    maxValue: string;
    note: string;
    everyHours: string;
  }[];
}

/** Un número como campo de formulario: el cero es «0» y sólo lo que no se declaró queda vacío. */
const aTexto = (n: number | null | undefined): string => (n === null || n === undefined ? "" : String(n));

export function valoresDelFormulario(paso: PasoConDetalle): PasoInicial {
  return {
    stepTypeValueId: paso.stepTypeValueId,
    intencion: paso.intencion ?? "",
    opcional: paso.opcional,
    estadoFrutoValueId: paso.estadoFrutoValueId ?? "",
    mucilagoObjetivo: aTexto(paso.mucilagoObjetivo),
    oxigenoValueId: paso.oxigenoValueId ?? "",
    temperaturaValueId: paso.temperaturaValueId ?? "",
    temperaturaMinC: aTexto(paso.temperaturaMinC),
    temperaturaMaxC: aTexto(paso.temperaturaMaxC),
    fuenteMicrobianaValueId: paso.fuenteMicrobianaValueId ?? "",
    medioValueId: paso.medioValueId ?? "",
    fisicoValueId: paso.fisicoValueId ?? "",
    modoSecado: paso.modoSecado ?? "",
    horasMin: aTexto(paso.horasMin),
    horasSugeridas: aTexto(paso.horasSugeridas),
    horasMax: aTexto(paso.horasMax),
    volteoCadaHoras: aTexto(paso.volteoCadaHoras),
    humedadMinPct: aTexto(paso.humedadMinPct),
    humedadMaxPct: aTexto(paso.humedadMaxPct),
    finPorTiempo: paso.finPorTiempo,
    reglaDeFin: paso.reglaDeFin,
    adiciones: paso.adiciones.map((a) => ({
      categoriaValueId: a.categoriaValueId,
      cantidad: aTexto(a.cantidad),
      unidad: a.unidad ?? "",
      momento: a.momento,
    })),
    fines: paso.fines.map((f) => ({
      variable: f.variable,
      operador: f.operador,
      valor: String(f.valor),
      unidad: f.unidad,
      desdeLecturaId: f.desdeLecturaId ?? "",
    })),
    capacidadesRequeridas: [...paso.capacidadesRequeridas],
    metas: paso.metas.map((m) => ({
      variable: m.variable,
      moment: m.moment,
      unit: m.unit,
      targetValue: aTexto(m.targetValue),
      minValue: aTexto(m.minValue),
      maxValue: aTexto(m.maxValue),
      note: m.note ?? "",
      everyHours: aTexto(m.everyHours),
    })),
  };
}

/** Un paso nuevo: todo vacío. Lo que el formulario enseña de las referencias del paquete NO entra aquí: se enseña, no se precarga. */
export function pasoEnBlanco(): PasoInicial {
  return {
    stepTypeValueId: "",
    intencion: "",
    opcional: false,
    estadoFrutoValueId: "",
    mucilagoObjetivo: "",
    oxigenoValueId: "",
    temperaturaValueId: "",
    temperaturaMinC: "",
    temperaturaMaxC: "",
    fuenteMicrobianaValueId: "",
    medioValueId: "",
    fisicoValueId: "",
    modoSecado: "",
    horasMin: "",
    horasSugeridas: "",
    horasMax: "",
    volteoCadaHoras: "",
    humedadMinPct: "",
    humedadMaxPct: "",
    finPorTiempo: false,
    reglaDeFin: "first",
    adiciones: [],
    fines: [],
    capacidadesRequeridas: [],
    metas: [],
  };
}
