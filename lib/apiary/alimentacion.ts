/**
 * La alimentación: vocabulario del método y la regla del «alcanza hasta».
 * **Sin base de datos**, a propósito — el formulario de campo es `"use client"`.
 *
 * **Qué cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §3 marca «Alcanza hasta»
 * como **obligatorio** y subraya por qué, con el caso real: *«el campo que faltó
 * en Toabré. El alimento del 22 de julio cubría seis semanas: vencía cerca del 2
 * de septiembre, el día en que se encontró todo vacío. Con este campo, el aviso
 * llega antes y no después»*.
 *
 * **La columna ya existía** (`coverage_until`, desde
 * `20260907214500_a9_vitales_del_sitio`) y los vitales del sitio ya la leían. Lo
 * que faltaba, medido el 2026-09-13: **1 alimentación en la copia local y
 * ninguna con ese valor**, porque ninguna pantalla podía escribirlo. Una columna
 * que nada rellena es una puerta sin manija.
 */
import type { FeedingMethod } from "../../generated/prisma/client";

/** Una entrada que el servicio rechaza. */
export class AlimentacionInvalida extends Error {}

/**
 * Cómo se dejó el alimento. Vocabulario del dueño, tal cual en
 * `protocolos/apiario-campo-v1.json`: «bolsa sobre cabezales» es literalmente lo
 * que se usó en Toabré.
 */
export const METODOS_DE_ALIMENTACION = [
  "bolsa_sobre_cabezales",
  "alimentador_entrada",
  "alimentador_division",
  "otro",
] as const satisfies readonly FeedingMethod[];

export function exigeMetodoDeAlimentacion(valor: unknown): FeedingMethod {
  if (typeof valor !== "string" || !(METODOS_DE_ALIMENTACION as readonly string[]).includes(valor)) {
    throw new AlimentacionInvalida("metodo_de_alimentacion_desconocido");
  }
  return valor as FeedingMethod;
}

/**
 * En qué estado está el alimento de una colonia.
 *
 * **`sin_fecha` es el estado que importa, y por eso existe.** Una alimentación
 * registrada sin «alcanza hasta» no es una colonia tranquila: es una de la que
 * **no se puede avisar**. Meterla con las cubiertas la volvería invisible, que es
 * exactamente lo que pasó en Toabré — nadie sabía que el alimento vencía el 2 de
 * septiembre—. Se cuenta aparte y se enseña aparte.
 */
export type EstadoDelAlcance = "sin_fecha" | "vencido" | "por_vencer" | "cubierto";

/**
 * Clasifica el alcance del alimento. Pura y exportada a propósito: así se prueba
 * con la entrada hostil —sin fecha, el día exacto del vencimiento— sin construir
 * una colonia entera.
 *
 * **El día del vencimiento cuenta como cubierto, no como vencido.** `coverageUntil`
 * es un campo de DÍA guardado a medianoche UTC, así que «alcanza hasta el 2 de
 * septiembre» significa que el 2 todavía hay alimento. Compararlo con `<` a secas
 * lo daría por vencido desde la primera hora de ese día, un día antes de lo que
 * dijo quien alimentó.
 */
export function clasificarAlcance(
  coverageUntil: Date | null | undefined,
  ahora: Date,
  dentroDeDias: number,
): EstadoDelAlcance {
  if (!coverageUntil) return "sin_fecha";
  const DIA = 24 * 60 * 60 * 1000;
  // Fin del día que se declaró: hasta ahí alcanza.
  const finDelAlcance = coverageUntil.getTime() + DIA;
  if (ahora.getTime() >= finDelAlcance) return "vencido";
  if (ahora.getTime() + dentroDeDias * DIA >= finDelAlcance) return "por_vencer";
  return "cubierto";
}

/**
 * Cuántos días faltan —o sobran— para que se acabe. Negativo significa que ya
 * venció, y por cuánto: es el número que dice si esto se atiende hoy.
 *
 * Hacia arriba con `Math.ceil`, como `carenciasVigentes`: medio día que queda
 * sigue siendo un día en el que hay alimento, y un `floor` diría cero justo
 * cuando alguien va a decidir si vuelve.
 */
export function diasDeAlcance(coverageUntil: Date, ahora: Date): number {
  const DIA = 24 * 60 * 60 * 1000;
  return Math.ceil((coverageUntil.getTime() + DIA - ahora.getTime()) / DIA);
}
