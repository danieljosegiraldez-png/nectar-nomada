import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { destinoDeEntrada, landingDestination } from "../../lib/navigation";
import { getApiaryList } from "../../lib/apiary/hives";
import { jornadaAbiertaDe } from "../../lib/traceability/fieldSessions";

export const dynamic = "force-dynamic";

/**
 * Where every sign-in path lands, and the only thing it does is leave — ADR-082.
 *
 * The destination depends on the account's resolved permissions, which do not
 * exist yet at the moment `signIn()` is called: for credentials the password
 * has not been checked, and for Google the Person may be about to be created
 * by the `signIn` callback. So `redirectTo` cannot name the real destination,
 * and this route resolves it one request later, when there is a session to ask.
 *
 * It renders nothing. A visitor never sees this URL for longer than a redirect,
 * and returning markup here would create a second landing page to keep
 * consistent with the first.
 */
export default async function StartPage() {
  const user = await getCurrentUser();
  // Reached without a session — someone typing the URL, or a sign-in that
  // failed after the redirect was issued. SECURITY.md §2: every server entry
  // point re-checks rather than trusting how it was reached.
  if (!user) {
    redirect("/login");
  }

  // Anexo E §1 — «Si hay una jornada abierta, la app entra directo en ella». Una consulta
  // acotada al propio principal, y sólo en el aterrizaje: no se paga en cada página.
  const [granted, jornada] = await Promise.all([
    permissionKeysAnywhere(user.userAccountId),
    jornadaAbiertaDe(user.userAccountId),
  ]);
  // Anexo E §2 — «entrada directa cuando hay uno solo». La cuenta se paga **sólo** cuando el
  // aterrizaje por permisos es la lista de apiarios y no hay jornada abierta que gane: a un
  // administrador de plataforma o a quien entra por su tablero esto no le cuesta una consulta.
  //
  // `getApiaryList` es quien autoriza —y trae las colmenas de cada sitio, que aquí no se
  // usan—. Se reutiliza en vez de escribir un lector nuevo: un `count` propio sería otra
  // puerta a la misma pregunta, y el inventario de acceso cuenta puertas.
  let apiarioUnicoId: string | null = null;
  if (!jornada && landingDestination(granted) === "/apiaries") {
    const { items } = await getApiaryList(user.userAccountId);
    apiarioUnicoId = items.length === 1 ? (items[0]?.id ?? null) : null;
  }

  redirect(destinoDeEntrada(granted, jornada?.fieldSessionId ?? null, apiarioUnicoId));
}
