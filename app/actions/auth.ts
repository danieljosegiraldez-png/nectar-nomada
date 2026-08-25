"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AuthError } from "next-auth";
import { getTranslations } from "next-intl/server";
import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";
import { signUpSchema, loginSchema } from "../../lib/validation/auth";
import { recordAuditEvent } from "../../lib/audit";
import { signIn } from "../../auth";
import { isAppLocale, LOCALE_COOKIE } from "../../i18n/config";

export interface FormActionState {
  error?: string;
}

/**
 * Self-service registration. Creates the Person + UserAccount pair in one
 * transaction (DOMAIN_MODEL.md §1 — a UserAccount cannot exist without its
 * Person). No Role Profile is assigned here: an authenticated UserAccount
 * with zero Assignments gets only the implicit Registered Customer baseline
 * (RBAC.md §5) — anything beyond that requires an explicit Assignment made
 * by an admin later.
 */
export async function signUpAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const t = await getTranslations("Auth");

  const parsed = signUpSchema.safeParse({
    givenName: formData.get("givenName"),
    familyName: formData.get("familyName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  // Zod's own per-field messages stay in English internally (lib/validation/auth.ts) —
  // translating every possible Zod constraint message individually is out of scope
  // for this pass, so any validation failure surfaces this one translated, generic
  // message instead of Zod's raw text.
  if (!parsed.success) {
    return { error: t("errorInvalidInput") };
  }

  const { givenName, familyName, email, password } = parsed.data;

  const existing = await prisma.person.findFirst({ where: { email } });
  if (existing) {
    return { error: t("errorEmailTaken") };
  }

  const passwordHash = await hashPassword(password);

  const userAccount = await prisma.$transaction(async (tx) => {
    const person = await tx.person.create({
      data: {
        givenName,
        familyName,
        displayName: `${givenName} ${familyName}`.trim(),
        email,
      },
    });

    return tx.userAccount.create({
      data: {
        personId: person.id,
        authProvider: "credentials",
        passwordHash,
        status: "active",
      },
    });
  });

  await recordAuditEvent({
    actorUserAccountId: userAccount.id,
    operation: "user_account.create",
    entityType: "user_account",
    entityId: userAccount.id,
    after: { id: userAccount.id, authProvider: "credentials" },
    sourceInterface: "app.signup",
  });

  await signIn("credentials", { email, password, redirectTo: "/start" });
  return {};
}

/**
 * The destination a bounced request asked to return to, or null — ADR-082.
 *
 * proxy.ts sets `callbackUrl` when it turns an unauthenticated request away,
 * and nothing had ever read it: sign-in went to a hardcoded `/my-nectar`,
 * which happened to be the only proxied prefix, so the promise looked kept.
 * Sending everyone to `/start` instead would have made that coincidence
 * visible as a bug, so the parameter is now honoured for real.
 *
 * Only a same-origin absolute path is accepted. A value beginning `//` or
 * containing a scheme is an open redirect — the classic way a login form
 * becomes a phishing hop — so anything that is not a single-slash-prefixed
 * path is discarded rather than sanitised.
 */
function safeCallbackUrl(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export async function loginAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const t = await getTranslations("Auth");

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: t("errorInvalidEmailOrPassword") };
  }

  // Apply the account's persisted language preference (DOMAIN_MODEL.md §1
  // Person.locale) immediately on login, ahead of confirming the password —
  // locale isn't sensitive, and this is the simplest place to guarantee the
  // very next page load reflects it without threading locale through the
  // session/JWT. A wrong password below just means this was a no-op cookie
  // write for an unauthenticated visitor.
  const person = await prisma.person.findFirst({
    where: { email: parsed.data.email },
    select: { locale: true },
  });
  if (isAppLocale(person?.locale)) {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, person.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      // `/start` resolves the right destination from the account's permissions
      // one request later; an explicit callbackUrl outranks it, because the
      // viewer already said where they were going.
      redirectTo: safeCallbackUrl(formData.get("callbackUrl")) ?? "/start",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: t("errorIncorrectCredentials") };
    }
    throw error;
  }

  return {};
}

export async function logoutAction(): Promise<void> {
  const { signOut } = await import("../../auth");
  await signOut({ redirectTo: "/" });
  redirect("/");
}

/**
 * Start the Google flow — ADR-076.
 *
 * A server action rather than a client `signIn()` call, matching every other
 * auth path in this file. Auth.js redirects out of it, so nothing after this
 * line runs on success.
 *
 * The button that calls this is rendered only when the provider is configured
 * (see app/login/page.tsx). That is presentation, not protection: if Google is
 * unconfigured, Auth.js has no `google` provider registered and rejects the
 * request regardless.
 */
export async function signInWithGoogleAction(): Promise<void> {
  await signIn("google", { redirectTo: "/start" });
}
