"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { clearPermissionOverride, grantRole, revokeRole, setPermissionOverride, UserAdminError } from "../../lib/rbac/admin";
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

/**
 * Los errores vuelven a la pantalla DE ESA asignación, no a la lista general: quien
 * acaba de escribir una razón no debería perderla ni tener que buscar dónde estaba.
 */
function volverAPermisos(assignmentId: string, message?: string): never {
  const base = `/admin/users/${assignmentId}/permisos`;
  redirect(message ? `${base}?error=${encodeURIComponent(message)}` : `${base}?ok=1`);
}

export async function setPermissionOverrideFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const permissionId = String(formData.get("permissionId") ?? "");
  const effect = String(formData.get("effect") ?? "") === "grant" ? "grant" : "deny";
  // Un campo en blanco NO se convierte en cadena vacía con significado: se manda
  // nulo y que el servicio decida si sobra o falta.
  const reasonRaw = String(formData.get("reason") ?? "").trim();

  try {
    await setPermissionOverride(user.userAccountId, {
      assignmentId, permissionId, effect,
      reason: reasonRaw === "" ? null : reasonRaw,
    });
  } catch (error) {
    if (error instanceof UserAdminError) volverAPermisos(assignmentId, error.message);
    throw error;
  }
  revalidatePath(`/admin/users/${assignmentId}/permisos`);
  revalidatePath("/admin/users");
  volverAPermisos(assignmentId);
}

export async function clearPermissionOverrideFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const assignmentId = String(formData.get("assignmentId") ?? "");
  const overrideId = String(formData.get("overrideId") ?? "");

  try {
    await clearPermissionOverride(user.userAccountId, overrideId);
  } catch (error) {
    if (error instanceof UserAdminError) volverAPermisos(assignmentId, error.message);
    throw error;
  }
  revalidatePath(`/admin/users/${assignmentId}/permisos`);
  revalidatePath("/admin/users");
  volverAPermisos(assignmentId);
}
