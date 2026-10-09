/**
 * La forma canónica de un UUID, la que la aplicación pone en cada enlace.
 *
 * Existe para que un id que llega de la URL se compruebe ANTES de mandarlo a una
 * columna `@db.Uuid`: Postgres rechaza la conversión de una cadena basura y Prisma
 * lanza `P2007` («invalid input syntax for type uuid»), que una página que sólo
 * atrapa su error de «no existe» convierte en un 500. Un id mal formado es un
 * recurso que no existe, no una avería.
 *
 * Todo lo que casa aquí lo acepta Postgres —ocho-cuatro-cuatro-cuatro-doce
 * hexadecimales, sin distinguir mayúsculas—, así que la guarda no rechaza ningún
 * enlace que funcione. Al revés no es exacto: Postgres también acepta la forma sin
 * guiones o entre llaves, y ésas pasan a «no existe». La aplicación no las genera.
 *
 * `lib/beneficio/fichaDeUnidad.ts`, `lib/beneficio/curvaEnPantalla.ts` y
 * `lib/apiary/colonyEvents.ts` llevan su propia copia de esta misma expresión.
 */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
