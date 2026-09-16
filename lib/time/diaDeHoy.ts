/**
 * «Hoy» como día (`YYYY-MM-DD`) — tablero de parcela, spec §4.3.
 *
 * Con zona, el día del sitio. **Sin zona, el día más temprano que existe en el
 * planeta (UTC−12)**. Un aviso de vencimiento afirma algo, y sin saber la zona
 * sólo se puede afirmar cuando es cierto en cualquiera: puede llegar un día
 * tarde, nunca uno antes.
 *
 * **No usa `ZONA_POR_DEFECTO`** (`mostrarInstante.ts`). Esa zona es un respaldo
 * para MOSTRAR una hora; usarla aquí convertiría un respaldo de pintado en la
 * base de una afirmación.
 *
 * `Etc/GMT+12` es UTC−12: en la nomenclatura POSIX el signo va al revés.
 */
export function diaDeHoy(ahora: Date, zona: string | null): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zona ?? "Etc/GMT+12",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}
