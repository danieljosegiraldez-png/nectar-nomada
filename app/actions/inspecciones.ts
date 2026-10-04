"use server";

import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { registrarInspeccion } from "../../lib/traceability/samplingEvents";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { SampleValidationError } from "../../lib/traceability/samples";
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
    // La lista junta las personas de todas las fincas ofrecidas: elegir a alguien de una y un lote
    // de otra es un error de quien rellena, no un 500.
    if (error instanceof PersonaNoPermitidaError) return { error: "persona_no_permitida" };
    // Parte 1, R6.6 (2026-10-01): el servicio rechaza un lote dividido bajo un proceso (`lote_dividido`), con su
    // clave `Secado.error_lote_dividido`. Sin esta rama, un 500.
    if (error instanceof SampleValidationError) return { error: error.message };
    throw error;
  }
  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}?ok=inspeccion`);
}
