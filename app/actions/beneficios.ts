"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { BeneficioError, actualizarBeneficio, crearBeneficio } from "../../lib/traceability/beneficios";
import { LocationAccessError } from "../../lib/traceability/locations";

export type BeneficioFormState = { error?: string };

export async function guardarBeneficioFormAction(_state: BeneficioFormState, form: FormData): Promise<BeneficioFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const name = String(form.get("name") ?? "");
    const locationId = String(form.get("locationId") ?? "");
    if (locationId) {
      await actualizarBeneficio(user.userAccountId, { locationId, name });
    } else {
      await crearBeneficio(user.userAccountId, { name, parentLocationId: String(form.get("parentLocationId") ?? "") });
    }
  } catch (error) {
    if (error instanceof LocationAccessError) return { error: "sin_acceso" };
    if (error instanceof BeneficioError) return { error: error.message };
    throw error;
  }
  revalidatePath("/beneficio/ajustes");
  redirect("/beneficio/ajustes?ok=guardado");
}
