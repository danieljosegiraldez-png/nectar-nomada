"use server";

/**
 * Registrar y cerrar una floración — F1 (decisión de Daniel, 2026-10-08: «dos momentos»). El
 * servicio es `lib/traceability/floracion.ts`; aquí sólo se lee el formulario y se traduce el error.
 *
 * Las fechas son campos de DÍA y los lee `lib/traceability/floracionForm.ts`, fuera de este archivo
 * porque de un `"use server"` sólo se exportan funciones `async`. `friendlyError` es una copia
 * acotada a lo que estos dos servicios lanzan, igual que la de `app/actions/manejo.ts`; las cuenta
 * `tests/arquitectura/acciones-traducen-sus-errores.test.ts`.
 *
 * El `redirect` va FUERA del `try`: Next lo implementa lanzando, y dentro lo atraparía el `catch`
 * y la pantalla diría que falló lo que salió bien (PR #514).
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { FechaDeDiaInvalida } from "../../lib/time/localDateTime";
import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";
import { cerrarFloracion, registrarFloracion, FloracionValidationError } from "../../lib/traceability/floracion";
import { leerCierreDeFloracion, leerFloracion } from "../../lib/traceability/floracionForm";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import type { TraceabilityActionState } from "./traceability";

function friendlyError(t: Awaited<ReturnType<typeof getTranslations>>, error: unknown): string {
  if (error instanceof PersonaNoPermitidaError) return t("error_persona_no_permitida");
  if (error instanceof TraceabilityAccessError) return t("error_access", { detail: error.message });
  if (error instanceof FloracionValidationError) return t("error_floracion", { detail: error.message });
  if (error instanceof FechaDeDiaInvalida) return t("error_datetime", { detail: error.message });
  throw error;
}

export async function registrarFloracionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let locationId: string;
  try {
    const { startsAt, ...resto } = leerFloracion(formData);
    if (!startsAt) return { error: t("floracionErrorSinInicio") };
    const creada = await registrarFloracion(user.userAccountId, { ...resto, startsAt });
    locationId = creada.locationId;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  redirect(`/plots/${locationId}?ok=floracion`);
}

export async function cerrarFloracionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let destino: string;
  let propia: string;
  try {
    const { plotBloomId, endsAt, portadaId } = leerCierreDeFloracion(formData);
    if (!endsAt) return { error: t("floracionErrorSinFin") };
    const cerrada = await cerrarFloracion(user.userAccountId, { plotBloomId, endsAt });
    propia = cerrada.locationId;
    destino = portadaId ?? propia;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${propia}`);
  if (destino !== propia) revalidatePath(`/plots/${destino}`);
  redirect(`/plots/${destino}?ok=floracion_cerrada`);
}
