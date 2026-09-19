/**
 * La carencia y la reentrada de una intervención — spec fitosanitario §3.2.
 *
 * Puro: no consulta la base ni el reloj. Lo llaman la cosecha, el tablero y la
 * jornada con lo que ya leyeron.
 *
 * **Nulo = no declarada, y lo desconocido no se convierte en bueno**: una línea
 * sin declarar vuelve desconocida a toda la mezcla, y eso no caduca.
 */
import type { PlotInterventionKind } from "../../generated/prisma/client";
import { libreDesdeDe, diasQueFaltanDe, libreDeReentradaDesde } from "../time/carencia";

export interface LineaParaCarencia { readonly withdrawalDays: number | null; readonly reentryHours: number | null }
export interface IntervencionParaCarencia {
  readonly id: string;
  readonly kind: PlotInterventionKind;
  readonly occurredAt: Date;
  readonly lineas: readonly LineaParaCarencia[];
}
export type EstadoDeCarencia =
  | { estado: "no_aplica" }
  | { estado: "cumplida"; libreDesde: Date }
  | { estado: "conocida"; libreDesde: Date; diasQueFaltan: number }
  | { estado: "desconocida"; alMenosHasta: Date | null };
export type EstadoDeReentrada =
  | { estado: "no_aplica" }
  | { estado: "cumplida"; libreDesde: Date }
  | { estado: "vigente"; libreDesde: Date }
  | { estado: "desconocida"; alMenosHasta: Date | null };

/** Sin producto, o posterior a la fecha que se pregunta: no impone nada. */
function noAplica(i: IntervencionParaCarencia, enLaFecha: Date): boolean {
  return i.kind === "manejo_cultural" || i.lineas.length === 0 || i.occurredAt > enLaFecha;
}

/** El máximo de los declarados, o null si no hay ninguno. */
function maximo(valores: readonly (number | null)[]): number | null {
  const declarados = valores.filter((v): v is number => v != null);
  return declarados.length === 0 ? null : Math.max(...declarados);
}

export function carenciaDeIntervencion(i: IntervencionParaCarencia, enLaFecha: Date): EstadoDeCarencia {
  if (noAplica(i, enLaFecha)) return { estado: "no_aplica" };
  const dias = i.lineas.map((l) => l.withdrawalDays);
  const mayor = maximo(dias);
  if (dias.some((d) => d == null)) {
    return { estado: "desconocida", alMenosHasta: mayor == null ? null : libreDesdeDe(i.occurredAt, mayor) };
  }
  const libreDesde = libreDesdeDe(i.occurredAt, mayor!);
  const diasQueFaltan = diasQueFaltanDe(libreDesde, enLaFecha);
  return diasQueFaltan === 0 ? { estado: "cumplida", libreDesde } : { estado: "conocida", libreDesde, diasQueFaltan };
}

export function reentradaDeIntervencion(i: IntervencionParaCarencia, ahora: Date): EstadoDeReentrada {
  if (noAplica(i, ahora)) return { estado: "no_aplica" };
  const horas = i.lineas.map((l) => l.reentryHours);
  const mayor = maximo(horas);
  if (horas.some((h) => h == null)) {
    return { estado: "desconocida", alMenosHasta: mayor == null ? null : libreDeReentradaDesde(i.occurredAt, mayor) };
  }
  const libreDesde = libreDeReentradaDesde(i.occurredAt, mayor!);
  return ahora < libreDesde ? { estado: "vigente", libreDesde } : { estado: "cumplida", libreDesde };
}
