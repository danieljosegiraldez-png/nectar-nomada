/**
 * Las páginas que `public/sw.js` guarda para abrirlas sin red no sobreviven a
 * la sesión que las produjo.
 *
 * **El defecto, visto el 2026-10-09.** El service worker guarda cada
 * navegación a una ruta de operario —lotes, parcelas, apiarios, jornadas— y
 * nada la borraba al cerrar sesión. En un teléfono compartido y sin red, quien
 * entraba después abría esas URL y veía la última versión de la sesión
 * anterior.
 *
 * **Por qué se borra desde la página y no pidiéndoselo al service worker.**
 * La página llega a CacheStorage directamente, así que no hace falta ningún
 * protocolo con él, y funciona aunque todavía no controle la página (primera
 * carga, recarga forzada). Y no se guarda una caché por usuario porque sin red
 * no hay forma de saber quién es el usuario actual: la cookie de sesión es
 * `HttpOnly` y no hay servidor al que preguntar.
 *
 * Tres caminos, y cubren cosas distintas:
 *
 * - **El botón** (`cerrarSesionEnEsteDispositivo`) borra antes de llamar al
 *   servidor. Funciona sin red; lo que no puede hacer sin red es cerrar la
 *   sesión, y eso se le dice a quien lo pulsó.
 * - **Cada carga** (`alinearConLaCuenta`, desde `ServiceWorkerRegistration`)
 *   borra salvo que la cuenta sea la misma que en la carga anterior. Cubre la
 *   sesión que caduca sin pulsar nada —la siguiente carga con red llega sin
 *   sesión— y la que se abre encima de otra, que `/login` permite.
 * - **Sin red y sin carga del servidor**, sólo el service worker puede actuar:
 *   no sirve páginas guardadas hace más de lo que dura una sesión. Ver
 *   `public/sw.js`.
 *
 * Sólo cliente: `caches` y `localStorage` no existen en el servidor.
 */

/** El `PAGE_CACHE` de `public/sw.js`. Que coincidan lo prueba la conducta, en `tests/offline/service-worker.test.ts`. */
export const CACHE_DE_PAGINAS = "nn-pages-v2";

/** Dónde se apunta la huella de la cuenta para la que se guardaron las páginas. */
const CLAVE_DE_CUENTA = "nn-pages-cuenta";

export async function borrarPaginasGuardadas(): Promise<void> {
  try {
    localStorage.removeItem(CLAVE_DE_CUENTA);
  } catch {
    // Sin almacenamiento local (navegación privada): no hay nada que olvidar.
  }
  if (typeof caches !== "undefined") await caches.delete(CACHE_DE_PAGINAS);
}

/**
 * En cada carga, con la huella de la cuenta que vio el servidor o `null`.
 *
 * Lo guardado sólo se queda si la carga anterior apuntó **esta misma** cuenta.
 * Sin cuenta anterior apuntada también se borra: no se sabe de quién es, y lo
 * que se pierde es, como mucho, una página que se vuelve a guardar en la
 * siguiente visita.
 */
export async function alinearConLaCuenta(cuenta: string | null): Promise<void> {
  let anterior: string | null = null;
  try {
    anterior = localStorage.getItem(CLAVE_DE_CUENTA);
  } catch {
    // Sin almacenamiento local, `anterior` queda en null y se borra siempre.
  }
  if (cuenta === null || anterior !== cuenta) await borrarPaginasGuardadas();
  if (cuenta === null) return;
  try {
    localStorage.setItem(CLAVE_DE_CUENTA, cuenta);
  } catch {
    // Ídem: la próxima carga volverá a borrar, que es lo seguro.
  }
}

export interface EstadoDeCierre {
  /** El servidor no contestó: lo guardado se borró, pero la sesión sigue abierta. */
  sinRed?: true;
}

/**
 * Lo que hace el botón de cerrar sesión: borrar en este teléfono y DESPUÉS
 * pedirle al servidor que cierre la sesión.
 *
 * Sin red, la acción de servidor rechaza con el `TypeError` del `fetch`
 * (`server-action-reducer.js` de Next lo relanza tal cual). Sólo ése se traduce
 * en `sinRed`: la redirección con la que Next termina un cierre que sí llegó
 * también rechaza la promesa, con su propio error, y tiene que seguir hasta su
 * `RedirectBoundary`.
 */
export async function cerrarSesionEnEsteDispositivo(cerrarEnElServidor: () => Promise<unknown>): Promise<EstadoDeCierre> {
  await borrarPaginasGuardadas();
  try {
    await cerrarEnElServidor();
  } catch (error) {
    if (error instanceof TypeError) return { sinRed: true };
    throw error;
  }
  return {};
}
