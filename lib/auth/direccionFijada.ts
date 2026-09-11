/**
 * ¿Tiene la aplicación su dirección clavada en otro sitio del que la sirve?
 *
 * **El incidente (2026-09-11).** «Continuar con Google» terminaba en 404.
 * Google autenticaba bien y devolvía al usuario a
 * `https://www.nectarnomada.com/api/auth/callback/google` — el dominio de
 * marca, que desde el 2026-08-28 sirve el sitio editorial y no tiene esa ruta.
 * El 404 llegaba DESPUÉS de Google, que es lo que lo hace ilegible: no parece
 * un problema de configuración, parece que Google falló.
 *
 * **Por qué esto avisa en vez de corregir.** `next-auth/lib/env.js` reescribe
 * el origen de cada petición al de `AUTH_URL ?? NEXTAUTH_URL` en cuanto una de
 * las dos existe, antes de que se lea nuestra configuración:
 *
 *     if (!url) return req;
 *     return new NextRequest(href.replace(origin, envOrigin), req);
 *
 * No hay ajuste, ni `trustHost`, ni callback que lo revierta. La única cura es
 * **borrar la variable**, y entonces Auth.js deduce el origen de la petición
 * (`trustHost` ya vale `true` en Vercel por la variable `VERCEL`, y en local
 * por `NODE_ENV !== "production"`). Así que el código no puede arreglarlo — lo
 * que sí puede es que la próxima vez se vea antes de salir hacia Google, en
 * lugar de un 404 al volver.
 *
 * Devuelve el anfitrión clavado cuando discrepa del que sirve la petición, y
 * `null` cuando no hay nada que avisar — que es el estado bueno.
 */
export function direccionFijadaEnOtroSitio(
  fijada: string | undefined,
  anfitrionDeLaPeticion: string | null | undefined,
): string | null {
  const valor = fijada?.trim();
  if (!valor) return null; // nada clavado: Auth.js deduce, que es lo que se quiere

  // Sin anfitrión no hay con qué comparar. Callar es lo correcto: un aviso que
  // no puede saber si acierta enseña a ignorar avisos.
  const anfitrion = anfitrionDeLaPeticion?.trim();
  if (!anfitrion) return null;

  let anfitrionFijado: string;
  try {
    anfitrionFijado = new URL(valor).host;
  } catch {
    // `reqWithEnvURL` hace `new URL(url)` sin protección: un valor que no se
    // puede interpretar revienta en CADA petición. Se avisa con el valor crudo.
    return valor;
  }

  return anfitrionFijado.toLowerCase() === anfitrion.toLowerCase() ? null : anfitrionFijado;
}
