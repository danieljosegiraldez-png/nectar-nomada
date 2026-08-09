import { auth } from "../../auth";

export interface CurrentUser {
  userAccountId: string;
  email: string | null;
  name: string | null;
}

/** Thin wrapper so route/server-component code doesn't import `auth.ts` directly. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    userAccountId: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
  };
}
