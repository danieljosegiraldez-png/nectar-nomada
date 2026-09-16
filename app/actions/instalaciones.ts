"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { crearUbicacionDeSecado, actualizarUbicacionDeSecado } from "../../lib/traceability/instalaciones";
import { LocationAccessError } from "../../lib/traceability/locations";
import { leerUbicacionDeSecado, SecadoFormError, type SecadoFormState } from "../../lib/traceability/secadoForm";

export async function guardarInstalacionFormAction(_state: SecadoFormState, form: FormData): Promise<SecadoFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let destination: string;
  try {
    const data = leerUbicacionDeSecado(form);
    const locationId = String(form.get("locationId") ?? "");
    const type = String(form.get("locationType") ?? "");
    if (type !== "drying_facility" && type !== "drying_bed") throw new SecadoFormError("tipo_invalido");
    const row = locationId
      ? await actualizarUbicacionDeSecado(user.userAccountId, { ...data, locationId })
      : await crearUbicacionDeSecado(user.userAccountId, { ...data, locationType: type, parentLocationId: String(form.get("parentLocationId") ?? "") });
    destination = row.locationType === "drying_facility" ? row.id : row.parentLocationId!;
  } catch (error) {
    if (error instanceof LocationAccessError) return { error: "sin_acceso" };
    if (error instanceof SecadoFormError) return { error: error.message };
    throw error;
  }
  revalidatePath("/instalaciones");
  revalidatePath(`/instalaciones/${destination}`);
  redirect(`/instalaciones/${destination}?ok=guardado`);
}
