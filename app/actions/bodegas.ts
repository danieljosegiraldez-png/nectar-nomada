"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import { BodegaError, crearBodega } from "../../lib/traceability/bodegas";
import { LocationAccessError } from "../../lib/traceability/locations";

/** Misma forma que `app/actions/rutinas.ts`: un solo `redirect`, fuera del `catch`. */
export async function crearBodegaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let destino: string;
  try {
    const b = await crearBodega(user.userAccountId, {
      parentLocationId: String(formData.get("parentLocationId") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    revalidatePath("/bodegas");
    destino = `/bodegas/${b.id}?ok=creada`;
  } catch (error) {
    if (error instanceof BodegaError) destino = `/bodegas/nueva?error=${encodeURIComponent(error.message)}`;
    else if (error instanceof LocationAccessError) destino = "/bodegas/nueva?error=sin_acceso";
    else throw error;
  }
  redirect(destino);
}
