"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { crearUbicacionDeSecado, actualizarUbicacionDeSecado, instalacionDe } from "../../lib/traceability/instalaciones";
import { LocationAccessError } from "../../lib/traceability/locations";
import { leerLecturaDeAmbiente, leerUbicacionDeSecado, SecadoFormError, type SecadoFormState } from "../../lib/traceability/secadoForm";
import { AmbienteError, registrarLecturaDeAmbiente } from "../../lib/traceability/ambiente";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { LocalDateTimeError } from "../../lib/time/localDateTime";
import { crearEstante, ampliarEstante, EstanteError } from "../../lib/traceability/estantes";

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
    // El padre de una POSICIÓN es el estante, y `/instalaciones/<estante>` da
    // 404 porque `detalleInstalacion` sólo acepta `drying_facility` (segunda
    // pasada de Codex del plan 2a). `instalacionDe` sube hasta encontrarla.
    destination = row.locationType === "drying_facility" ? row.id : await instalacionDe(row.id);
  } catch (error) {
    if (error instanceof LocationAccessError) return { error: "sin_acceso" };
    if (error instanceof SecadoFormError) return { error: error.message };
    throw error;
  }
  revalidatePath("/instalaciones");
  revalidatePath(`/instalaciones/${destination}`);
  redirect(`/instalaciones/${destination}?ok=guardado`);
}

export async function guardarEstanteFormAction(_state: SecadoFormState, form: FormData): Promise<SecadoFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let facilityId: string;
  try {
    const rackId = String(form.get("rackId") ?? "");
    const nombre = String(form.get("nombre") ?? "");
    const niveles = Number(form.get("niveles"));
    const puestos = Number(form.get("puestos"));
    if (rackId) {
      await ampliarEstante(user.userAccountId, { rackId, niveles, puestos });
      facilityId = await instalacionDe(rackId);
    } else {
      facilityId = String(form.get("facilityId") ?? "");
      await crearEstante(user.userAccountId, { facilityId, nombre, niveles, puestos });
    }
  } catch (error) {
    if (error instanceof LocationAccessError) return { error: "sin_acceso" };
    if (error instanceof EstanteError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/instalaciones/${facilityId}`);
  redirect(`/instalaciones/${facilityId}?ok=guardado`);
}

export async function registrarAmbienteFormAction(_state: SecadoFormState, form: FormData): Promise<SecadoFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let facilityId: string;
  try {
    const input = leerLecturaDeAmbiente(form);
    facilityId = input.facilityLocationId;
    await registrarLecturaDeAmbiente(user.userAccountId, input);
  } catch (error) {
    // Cada clase de error de validación tiene su rama AQUÍ, en el mismo cambio:
    // una que falte es un 500 (CLAUDE.md, «Una clase de validación nueva…»).
    if (error instanceof AmbienteError || error instanceof SecadoFormError) return { error: error.message };
    if (error instanceof LocalDateTimeError) return { error: "fecha_invalida" };
    if (error instanceof TraceabilityAccessError) return { error: "sin_acceso" };
    throw error;
  }
  revalidatePath(`/instalaciones/${facilityId}`);
  redirect(`/instalaciones/${facilityId}?ok=ambiente`);
}
