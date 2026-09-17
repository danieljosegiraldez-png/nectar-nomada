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
  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona ?? "Etc/GMT+12",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
  // Los avisos comparan este día como CADENA. Que `en-CA` dé `YYYY-MM-DD`
  // depende de los datos de ICU del runtime; si no lo da, se lanza en vez de
  // comparar mal en silencio.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    throw new Error(`diaDeHoy: se esperaba YYYY-MM-DD y el formateador devolvió «${dia}»`);
  }
  return dia;
}
