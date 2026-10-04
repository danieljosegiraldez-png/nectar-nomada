/**
 * La lista de modelos sale del esquema, no de una enumeración a mano.
 *
 * Medido el 2026-10-04: el esquema declara **205** modelos, y de los **183**
 * nombres de modelo que el inventario reporta **ninguno** falta en esta lista.
 * Control negativo: un nombre inventado no entra. Por eso esta lista puede
 * sustituir a la enumeración de clientes `prisma|aiPrisma|tx|client`, que es la
 * que produjo seis descartes silenciosos — entre ellos `ubicacionesEmparentadas`,
 * invisible sólo porque su parámetro se llama `db`.
 *
 * Prisma expone el modelo en camelCase (`model Location` -> `prisma.location`),
 * así que se baja la primera letra y nada más: `UserAccount` -> `userAccount`.
 */
export function modelosDelEsquema(texto) {
  const nombres = [...texto.matchAll(/^model ([A-Za-z]\w*)/gm)].map((m) => m[1]);
  // No es una defensa de adorno. Sin modelos, TODA operación saldría con
  // `modelos.length === 0` y el inventario entero diría «cero operaciones» — la
  // forma exacta de un verde vacío, y encima en la dirección que halaga.
  if (nombres.length === 0) {
    throw new Error("El esquema no declara ningún modelo: no se puede analizar nada.");
  }
  return new Set(nombres.map((n) => n[0].toLowerCase() + n.slice(1)));
}
