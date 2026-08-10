"use server";

import { cookies } from "next/headers";
import { prisma } from "../../lib/db";
import { getCurrentUser } from "../../lib/auth/session";
import { isAppLocale, LOCALE_COOKIE, type AppLocale } from "../../i18n/config";

/**
 * Sets the immediate-effect locale cookie and, for a signed-in user,
 * persists the choice to Person.locale (DOMAIN_MODEL.md §1) so it survives
 * across sessions/devices — applied again at next login, see loginAction.
 */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isAppLocale(locale)) return;

  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  const user = await getCurrentUser();
  if (user) {
    await prisma.userAccount.update({
      where: { id: user.userAccountId },
      data: { person: { update: { locale: locale satisfies AppLocale } } },
    });
  }
}
