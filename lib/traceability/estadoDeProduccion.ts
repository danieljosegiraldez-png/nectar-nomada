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
 */
export interface EventoDeProduccion {
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
  const ultimo = eventos.reduce((a, b) => (b.createdAt.getTime() > a.createdAt.getTime() ? b : a));
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
