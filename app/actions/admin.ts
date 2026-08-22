"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { grantRole, revokeRole, UserAdminError } from "../../lib/rbac/admin";
import type { ScopeType } from "../../generated/prisma/client";

/**
 * Errors are returned to the page as a query string rather than thrown
 * (ADR-074). "You cannot revoke the last Platform Admin" is a sentence the
 * operator needs to read; an unhandled throw would render a 500 and lose it.
 */
function backTo(message?: string): never {
  redirect(message ? `/admin/users?error=${encodeURIComponent(message)}` : "/admin/users?ok=1");
}

export async function grantRoleFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const scopeType = String(formData.get("scopeType") ?? "platform") as ScopeType;
  const rawRef = String(formData.get("scopeRefId") ?? "").trim();

  try {
    await grantRole(user.userAccountId, {
      userAccountId: String(formData.get("userAccountId") ?? ""),
      roleProfileId: String(formData.get("roleProfileId") ?? ""),
      scopeType,
      scopeRefId: rawRef === "" ? null : rawRef,
    });
  } catch (error) {
    if (error instanceof UserAdminError) backTo(error.message);
    throw error;
  }

  revalidatePath("/admin/users");
  backTo();
}

export async function revokeRoleFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  try {
    await revokeRole(user.userAccountId, String(formData.get("assignmentId") ?? ""), "revoked from the admin page");
  } catch (error) {
    if (error instanceof UserAdminError) backTo(error.message);
    throw error;
  }

  revalidatePath("/admin/users");
  backTo();
}
