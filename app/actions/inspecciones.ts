"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { registrarInspeccion } from "../../lib/traceability/samplingEvents";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { leerInspeccion, SecadoFormError, type SecadoFormState } from "../../lib/traceability/secadoForm";
import { LocalDateTimeError } from "../../lib/time/localDateTime";

export async function registrarInspeccionFormAction(_state: SecadoFormState, form: FormData): Promise<SecadoFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  let lotId: string;
  try {
    const input = leerInspeccion(form);
    lotId = input.lotId;
    await registrarInspeccion(user.userAccountId, input);
  } catch (error) {
    if (error instanceof SecadoFormError) return { error: error.message };
    if (error instanceof LocalDateTimeError) return { error: "fecha_invalida" };
    if (error instanceof TraceabilityAccessError) return { error: "sin_acceso" };
    throw error;
  }
  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}?ok=inspeccion`);
}
