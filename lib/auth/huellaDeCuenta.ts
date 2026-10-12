import { createHash } from "node:crypto";

/**
 * La huella de una cuenta: los 16 primeros caracteres hexadecimales del SHA-256 de su id.
 *
 * **Es la ÚNICA forma en que una cuenta llega al navegador** (ADR-199). La usan dos cosas, y por eso
 * vive aquí y no escrita dentro del layout: saber si cambió la cuenta para borrar las páginas
 * guardadas (`lib/offline/paginasGuardadas.ts`, #703) y saber de quién es cada borrador offline
 * (`lib/sync/cuentaDelBorrador.ts`). Un teléfono puede ser compartido, y para comparar no hace falta
 * el id completo.
 *
 * 64 bits: dos cuentas de esta plataforma no van a coincidir. Si algún día coincidieran, el peor caso
 * es que un borrador de una saliera a nombre de la otra: el defecto que esto cierra, no uno nuevo.
 */
export function huellaDeCuenta(userAccountId: string): string {
  return createHash("sha256").update(userAccountId).digest("hex").slice(0, 16);
}

/**
 * Lo que el layout le pasa al navegador en cada carga: la huella, o `null` sin sesión, y la hora del
 * servidor a la que se generó la página.
 *
 * La hora ordena las cargas: una página vieja servida desde la caché del service worker no puede
 * pisar a una más reciente. Ver `lib/offline/cuentaDelNavegador.ts`. Se calcula aquí y no en el
 * cuerpo del layout para no llamar a `Date.now()` durante el render de un componente.
 */
export function cuentaParaElNavegador(
  userAccountId: string | null,
  ahora: () => number = Date.now,
): { cuenta: string | null; generadaEn: number } {
  return { cuenta: userAccountId ? huellaDeCuenta(userAccountId) : null, generadaEn: ahora() };
}
