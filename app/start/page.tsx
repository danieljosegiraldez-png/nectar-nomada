import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { landingDestination } from "../../lib/navigation";

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

  redirect(landingDestination(await permissionKeysAnywhere(user.userAccountId)));
}
