"use server";

/**
 * Anotar una floración y cerrarla — decisión de Daniel, 2026-10-16. El servicio es
 * `lib/traceability/floracion.ts`; aquí sólo se traduce el `FormData` y el error a texto.
 *
 * **Los dos días son campos de DÍA** (`type="date"` → `fechaDeDia`, medianoche UTC), no instantes:
 * lo dice el esquema de `PlotBloom` y es lo que compara `hayFloracion`. Por eso este formulario no
 * lleva el desfase de zona que llevan los de instante.
 *
 * `"use server"` sólo puede exportar funciones `async` (`tests/arquitectura/use-server-solo-async.test.ts`),
 * así que `friendlyError` y `emptyToNull` se copian aquí sin exportarlos, como en `manejo.ts`.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { fechaDeDia, FechaDeDiaInvalida } from "../../lib/time/localDateTime";
import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";
import { cerrarFloracion, FloracionValidationError, registrarFloracion } from "../../lib/traceability/floracion";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import type { TraceabilityActionState } from "./traceability";

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};

/** Lo que estos dos servicios lanzan, y nada más: lo cuenta `tests/arquitectura/acciones-traducen-sus-errores.test.ts`. */
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

  const locationId = String(formData.get("locationId") ?? "");
  try {
    const startsAt = fechaDeDia(emptyToNull(formData.get("startsAt")), "startsAt");
    if (!startsAt) throw new FloracionValidationError("falta el día en que empezó");
    await registrarFloracion(user.userAccountId, {
      locationId,
      plotBlockId: emptyToNull(formData.get("plotBlockId")),
      startsAt,
      // Vacío = sigue en floración: se cierra después desde la ficha de la parcela.
      endsAt: fechaDeDia(emptyToNull(formData.get("endsAt")), "endsAt"),
      observerPersonId: emptyToNull(formData.get("observerPersonId")),
      notes: emptyToNull(formData.get("notes")),
    });
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

  let locationId: string;
  try {
    const endsAt = fechaDeDia(emptyToNull(formData.get("endsAt")), "endsAt");
    if (!endsAt) throw new FloracionValidationError("falta el día en que terminó");
    const cerrada = await cerrarFloracion(user.userAccountId, {
      floracionId: String(formData.get("floracionId") ?? ""),
      endsAt,
    });
    locationId = cerrada.locationId;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  redirect(`/plots/${locationId}?ok=floracion_cerrada`);
}
