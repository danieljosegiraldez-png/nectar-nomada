import { getCurrentUser } from "../auth/session";
import { interpretarAutorizacion } from "./deviceTokens";

/**
 * P4 §2 — quién hace esta petición, venga por cookie o por token de aparato.
 *
 * **Dos carriles, un solo resultado.** La PWA sigue autenticándose por la
 * cookie de sesión, sin cambios; un cliente nativo manda
 * `Authorization: Bearer <access>`. Las rutas de sincronización no tienen que
 * saber cuál fue.
 *
 * **El Bearer gana si está presente**, en vez de intentar la cookie primero:
 * si alguien manda las dos, mandar la cookie silenciosamente dejaría a un
 * aparato revocado operando con la sesión del navegador que lo registró. Que
 * gane el carril explícito hace que la revocación signifique lo que dice.
 *
 * **Esto autentica, no autoriza.** Lo que se puede escribir lo sigue decidiendo
 * `can()` sobre la Location, en el servicio — igual que antes de que existiera
 * el carril de tokens.
 */
export interface Principal {
  userAccountId: string;
  /** Presente sólo si vino por token: el aparato que lo mandó. */
  deviceId: string | null;
}

export async function resolverPrincipal(request: Request): Promise<Principal | null> {
  const { hayBearer, principal } = interpretarAutorizacion(request.headers.get("authorization"));
  // Un Bearer presente decide, bueno o malo. Sólo su ausencia deja pasar a la
  // cookie: caer a la sesión del navegador ante un token inválido dejaría a un
  // aparato revocado operando con la sesión de quien lo registró.
  if (hayBearer) return principal;

  const user = await getCurrentUser();
  return user ? { userAccountId: user.userAccountId, deviceId: null } : null;
}
