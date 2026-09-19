/** Milisegundos en un día. La carencia se cuenta en días enteros. */
const MS_POR_DIA = 86_400_000;

/**
 * Cuándo deja de haber carencia. **Un solo sitio decide esta aritmética.**
 *
 * Puro y exportado porque lo usan dos lectores: `carenciasVigentes`, que responde por una
 * colonia, y `destinosCandidatos` en `traslado.ts`, que responde por una lista de apiarios
 * con tres consultas en vez de un N+1. Cuando la misma cuenta vive en dos funciones,
 * derivan — y entonces la pantalla y el registro dicen cosas distintas del mismo apiario.
 */
export function libreDesdeDe(aplicadoEl: Date, diasDeCarencia: number): Date {
  return new Date(aplicadoEl.getTime() + diasDeCarencia * MS_POR_DIA);
}

/**
 * Días que faltan, **redondeados hacia arriba**, o `0` si ya se cumplió.
 *
 * Medio día de carencia sigue siendo carencia: un `Math.floor` daría cero en las últimas
 * horas, que es justo cuando alguien va a cosechar creyendo que ya puede.
 */
export function diasQueFaltanDe(libreDesde: Date, enLaFecha: Date): number {
  if (libreDesde <= enLaFecha) return 0;
  return Math.ceil((libreDesde.getTime() - enLaFecha.getTime()) / MS_POR_DIA);
}

const MS_POR_HORA = 3_600_000;

/** Cuándo deja de haber reentrada. Instante, no día: se cuenta en horas. */
export function libreDeReentradaDesde(aplicadoEl: Date, horas: number): Date {
  return new Date(aplicadoEl.getTime() + horas * MS_POR_HORA);
}
