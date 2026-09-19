/**
 * El aviso de una rutina, derivado y sin base (spec §4). No sabe si la rutina es
 * de un equipo o de una instalación.
 *
 * **Avisa, no bloquea** (D1), como `checkAdvisoryHours`. Todo se calcula en DÍAS
 * de calendario como cadenas `YYYY-MM-DD`, no en milisegundos: un intervalo de
 * «cada 7 días» no debe moverse una hora por un cambio de horario.
 */
export type EstadoDeRutina =
  | { estado: "sin_referencia"; ultimo: null }
  | { estado: "al_dia"; ultimo: string | null; proximo: string; faltan: number }
  | { estado: "vencida"; ultimo: string | null; proximo: string; pasaron: number };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function aDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function mas(dia: string, dias: number): string {
  const f = new Date(`${dia}T00:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return aDia(f);
}

function entre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

export function estadoDeRutina(e: {
  intervalDays: number;
  registros: ReadonlyArray<{ performedOn: Date; voidedAt: Date | null }>;
  alta: Date | null;
  hoy: string;
}): EstadoDeRutina {
  if (!DIA.test(e.hoy)) throw new Error(`hoy_mal_formado:${e.hoy}`);
  const fechaHoy = new Date(`${e.hoy}T00:00:00Z`);
  if (isNaN(fechaHoy.getTime()) || aDia(fechaHoy) !== e.hoy) throw new Error(`hoy_mal_formado:${e.hoy}`);
  if (!Number.isInteger(e.intervalDays) || e.intervalDays <= 0) throw new Error(`intervalo_invalido:${e.intervalDays}`);

  const validos = e.registros.filter((r) => r.voidedAt === null).map((r) => aDia(r.performedOn)).sort();
  const ultimo = validos.length > 0 ? validos[validos.length - 1]! : null;
  const referencia = ultimo ?? (e.alta ? aDia(e.alta) : null);
  if (referencia === null) return { estado: "sin_referencia", ultimo: null };

  const proximo = mas(referencia, e.intervalDays);
  const diferencia = entre(e.hoy, proximo);
  return diferencia >= 0
    ? { estado: "al_dia", ultimo, proximo, faltan: diferencia }
    : { estado: "vencida", ultimo, proximo, pasaron: -diferencia };
}
