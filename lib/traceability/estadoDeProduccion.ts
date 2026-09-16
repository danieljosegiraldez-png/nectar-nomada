import type { PrecisionDeSiembra } from "../time/fechaConPrecision";

/**
 * Si una siembra da cosecha — tablero de parcela, spec §5.2.
 *
 * Pura a propósito, para probarla sin base. Dos reglas, y las dos son la razón
 * de que exista:
 *
 *   * **Sin evento es «sin marcar», nunca «en levante».** Una siembra de 2016 que
 *     nadie marcó no es una plántula; decir «levante» sería afirmar algo que
 *     nadie dijo.
 *   * **Gana el evento registrado más recientemente** (`createdAt`), no el de
 *     fecha mayor. Corregir una fecha equivocada es registrar otro evento, y la
 *     fecha buena puede ser anterior a la mala.
 *
 * **Desempate por `id` cuando dos eventos comparten `createdAt`.** Ronda de
 * arreglo 1, revisión sobre Task 2: `recordEnteredProduction` pone `createdAt`
 * con `@default(now())`, y dos correcciones seguidas pueden caer en el mismo
 * milisegundo. Sin desempate, `reduce` se queda con el que llega primero en el
 * array — y ese orden es el de la fila que trae Postgres, que no está
 * garantizado sin `orderBy`. El tablero mostraría una fecha distinta en cada
 * carga sobre el mismo par de eventos. No se desempata por `occurredAt`:
 * haría trampa contra la regla de arriba, que es justamente que la fecha
 * buena puede ser ANTERIOR a la mala. `id` no tiene ese problema — es un
 * `uuid` sin relación con cuándo ocurrió ni con cuándo se registró — así que
 * no es «la respuesta correcta» para nada del dominio: es sólo estable entre
 * cargas, que es todo lo que hace falta cuando de verdad no hay forma de saber
 * cuál de los dos se registró después.
 */
export interface EventoDeProduccion {
  id: string;
  plantingCohortId: string;
  occurredAt: Date;
  occurredPrecision: PrecisionDeSiembra | null;
  createdAt: Date;
}

export type EstadoDeProduccion =
  | { estado: "en_produccion"; desde: Date; precision: PrecisionDeSiembra | null }
  | { estado: "sin_marcar" };

export function estadoDeProduccion(eventos: readonly EventoDeProduccion[]): EstadoDeProduccion {
  if (eventos.length === 0) return { estado: "sin_marcar" };
  const ultimo = eventos.reduce((a, b) => {
    const diferencia = b.createdAt.getTime() - a.createdAt.getTime();
    if (diferencia !== 0) return diferencia > 0 ? b : a;
    return b.id > a.id ? b : a;
  });
  return { estado: "en_produccion", desde: ultimo.occurredAt, precision: ultimo.occurredPrecision };
}

export function estadosPorCohorte(
  cohorteIds: readonly string[],
  eventos: readonly EventoDeProduccion[],
): Map<string, EstadoDeProduccion> {
  const mapa = new Map<string, EstadoDeProduccion>();
  for (const id of cohorteIds) {
    mapa.set(id, estadoDeProduccion(eventos.filter((e) => e.plantingCohortId === id)));
  }
  return mapa;
}
