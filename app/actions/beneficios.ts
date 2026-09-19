"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { BeneficioError, actualizarBeneficio, crearBeneficio } from "../../lib/traceability/beneficios";
import { concederEditarBeneficio, quitarEditarBeneficio } from "../../lib/traceability/concesiones";
import { LocationAccessError } from "../../lib/traceability/locations";
import { mensajeDeConcesion } from "../beneficio/ajustes/mensajes";

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
    if (error instanceof LocationAccessError) {
      // Un id que no existe no es una negativa de permiso: decirle a quien
      // guarda que la ubicación no está, en vez de que crea que le falta acceso.
      return { error: error.message === "location_not_found" ? "no_encontrado" : "sin_acceso" };
    }
    if (error instanceof BeneficioError) return { error: error.message };
    throw error;
  }
  revalidatePath("/beneficio/ajustes");
  redirect("/beneficio/ajustes?ok=guardado");
}

export type ConcesionFormState = { error?: string };

export async function concederEdicionFormAction(_state: ConcesionFormState, form: FormData): Promise<ConcesionFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const beneficioId = String(form.get("beneficioId") ?? "");
    const assignmentId = String(form.get("assignmentId") ?? "");
    const reason = String(form.get("reason") ?? "");
    await concederEditarBeneficio(user.userAccountId, { beneficioId, assignmentId, reason });
  } catch (error) {
    return { error: mensajeDeConcesion(error) };
  }
  revalidatePath("/beneficio/ajustes");
  redirect("/beneficio/ajustes?ok=concesion");
}

export async function quitarEdicionFormAction(_state: ConcesionFormState, form: FormData): Promise<ConcesionFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    const beneficioId = String(form.get("beneficioId") ?? "");
    const assignmentId = String(form.get("assignmentId") ?? "");
    await quitarEditarBeneficio(user.userAccountId, { beneficioId, assignmentId });
  } catch (error) {
    return { error: mensajeDeConcesion(error) };
  }
  revalidatePath("/beneficio/ajustes");
  redirect("/beneficio/ajustes?ok=concesion");
}
