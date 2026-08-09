"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";
import { signUpSchema, loginSchema } from "../../lib/validation/auth";
import { recordAuditEvent } from "../../lib/audit";
import { signIn } from "../../auth";

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
  const parsed = signUpSchema.safeParse({
    givenName: formData.get("givenName"),
    familyName: formData.get("familyName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const { givenName, familyName, email, password } = parsed.data;

  const existing = await prisma.person.findFirst({ where: { email } });
  if (existing) {
    return { error: "An account with this email already exists." };
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

  await signIn("credentials", { email, password, redirectTo: "/my-nectar" });
  return {};
}

export async function loginAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/my-nectar",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Incorrect email or password." };
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
