/**
 * El estado de vencimiento de un frasco. **Puro**: sin base, sin permisos, sin
 * reloj propio. Botiquín, Tarea 3.
 *
 * **`hoy` es un DÍA (`YYYY-MM-DD`), no un instante.** A las 19:00 del 16 en
 * Panamá ya es día 17 en UTC, y comparar instantes haría que un frasco que vence
 * el 17 saliera «vencido» cinco horas antes. El día lo calcula quien llama, con
 * `diaDeHoy(ahora, zona)` y la zona del sitio donde está el frasco — sin zona,
 * `diaDeHoy` usa el día más temprano del planeta: el aviso puede llegar un día
 * tarde, nunca uno antes.
 *
 * `expiresAt` es un campo de DÍA —viene de un `type="date"` y se guarda como
 * medianoche UTC—, así que su día es `toISOString().slice(0, 10)`. Convertirlo a
 * la zona del sitio lo movería un día atrás: ver la trampa de `CLAUDE.md` sobre
 * precargar un `datetime-local`.
 */

export type EstadoDeVencimiento =
  | { readonly estado: "SIN_FECHA" }
  | { readonly estado: "VIGENTE" }
  /** `dias`: los que FALTAN. */
  | { readonly estado: "POR_VENCER"; readonly dias: number }
  /** `dias`: los que PASARON desde que venció. Cero es el día exacto. */
  | { readonly estado: "VENCIDO"; readonly dias: number };

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MS_POR_DIA = 86_400_000;

/** Días entre dos fechas de calendario, contando en UTC para no perder ninguno al cruzar meses. */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_POR_DIA);
}

export function estadoDeVencimiento(e: {
  readonly expiresAt: Date | null;
  /** Nulo = no avisar de que VA a vencer. Lo VENCIDO avisa siempre. */
  readonly avisarDiasAntes: number | null;
  /** El día de hoy en la zona del sitio: `diaDeHoy(ahora, zona)`. */
  readonly hoy: string;
}): EstadoDeVencimiento {
  // Un día mal escrito no puede producir un estado: se inventaría.
  if (!DIA.test(e.hoy) || Number.isNaN(Date.parse(`${e.hoy}T00:00:00Z`))) {
    throw new Error(`«hoy» no es un día YYYY-MM-DD: ${e.hoy}`);
  }

  // Lo desconocido no se convierte en bueno.
  if (e.expiresAt === null) return { estado: "SIN_FECHA" };

  const vence = e.expiresAt.toISOString().slice(0, 10);
  const faltan = diasEntre(e.hoy, vence);

  // El día exacto ya es vencido: un medicamento que «vence el 17» no se usa el 17.
  // `Math.abs` y no `-faltan`: el día exacto da `faltan = 0` y `-0` es un cero
  // NEGATIVO, distinto del cero para `Object.is`. Lo cazó la prueba del borde.
  if (faltan <= 0) return { estado: "VENCIDO", dias: Math.abs(faltan) };

  // Nulo calla el aviso PREVIO; cero significa «avisar el día que vence», que
  // ya cae en la rama de arriba.
  if (e.avisarDiasAntes !== null && faltan <= e.avisarDiasAntes) {
    return { estado: "POR_VENCER", dias: faltan };
  }
  return { estado: "VIGENTE" };
}
