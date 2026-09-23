"use server";

/**
 * Registrar y corregir una intervención fitosanitaria — Tarea 8 del plan
 * (spec 2026-09-18-aplicaciones-fitosanitarias-design.md §5). El servicio es
 * `lib/traceability/intervenciones.ts` (Tarea 5); aquí sólo se traduce el
 * `FormData` del formulario y el error a texto.
 *
 * `"use server"` sólo puede exportar funciones `async`
 * (`tests/arquitectura/use-server-solo-async.test.ts`), así que
 * `TraceabilityActionState` se importa de `app/actions/traceability.ts` (sí
 * está exportado: es un `interface`, que no cuenta como export de valor), y
 * `friendlyError`/`fechaLocal`/`emptyToNull`/`emptyToNullNumber` — que ahí son
 * privados — se duplican aquí, sin exportarlos, en vez de forzar su export
 * desde un archivo `"use server"`.
 */
import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import {
  parseLocalDateTime,
  FechaDeDiaInvalida,
  LocalDateTimeError,
  TZ_OFFSET_FIELD,
} from "../../lib/time/localDateTime";
// Sólo para nombrarlas abajo: llegan aquí por los servicios, no porque esta
// acción llame a esos módulos (`PENDING_IMPLEMENTATIONS/013`).
import { MassBalanceError } from "../../lib/traceability/balance";
import { ByproductValidationError } from "../../lib/traceability/subproductos";
import { ClaveDeEnvioAjena } from "../../lib/envios/unaVezPorEnvio";
import { FieldSessionValidationError } from "../../lib/traceability/fieldSessions";
import {
  registrarIntervencion,
  corregirIntervencion,
  IntervencionValidationError,
  type LineaInput,
} from "../../lib/traceability/intervenciones";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import type { TraceabilityActionState } from "./traceability";
import type {
  PlotInterventionKind,
  PlotInterventionMethod,
  PlotInterventionTarget,
} from "../../generated/prisma/client";

const asString = (v: FormDataEntryValue | null) => (v == null ? null : String(v));

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};

const emptyToNullNumber = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? Number(str) : null;
};

/** Copia de `fechaLocal` en `app/actions/traceability.ts` — ver la cabecera. */
const fechaLocal = (formData: FormData, campo: string) =>
  parseLocalDateTime(String(formData.get(campo) ?? ""), asString(formData.get(TZ_OFFSET_FIELD)));

/**
 * Copia mínima de `friendlyError`, acotada a lo que este servicio lanza.
 *
 * «Lo que este servicio lanza» era menos de lo que parecía: `registrarIntervencion`
 * abre la jornada, descuenta del lote y pasa por la clave de envío, así que las
 * cuatro últimas llegan aquí igual que a `app/actions/traceability.ts`. Las cuenta
 * `tests/arquitectura/acciones-traducen-sus-errores.test.ts`.
 */
function friendlyError(t: Awaited<ReturnType<typeof getTranslations>>, error: unknown): string {
  if (error instanceof PersonaNoPermitidaError) return t("error_persona_no_permitida");
  if (error instanceof TraceabilityAccessError) return t("error_access", { detail: error.message });
  if (error instanceof IntervencionValidationError) return t("error_manejo", { detail: error.message });
  if (error instanceof LocalDateTimeError) return t("error_datetime", { detail: error.message });
  if (error instanceof FechaDeDiaInvalida) return t("error_datetime", { detail: error.message });
  if (error instanceof FieldSessionValidationError) return t("error_field_session", { detail: error.message });
  if (error instanceof MassBalanceError) return t("error_mass_balance", { detail: error.message });
  if (error instanceof ByproductValidationError) return t("error_subproducto", { detail: error.message });
  if (error instanceof ClaveDeEnvioAjena) return t("error_clave_de_envio");
  throw error;
}

/**
 * Las líneas de producto, indexadas: `lineas[0].materialId`… hasta que falte
 * el `materialId` (brief, Paso 1). El formulario sólo añade filas, nunca
 * quita una del medio, así que un hueco significa «no hay más».
 */
function parseLineas(formData: FormData): LineaInput[] {
  const lineas: LineaInput[] = [];
  for (let i = 0; ; i++) {
    const materialId = emptyToNull(formData.get(`lineas[${i}].materialId`));
    if (!materialId) break;
    lineas.push({
      materialId,
      consumableLotId: emptyToNull(formData.get(`lineas[${i}].consumableLotId`)),
      quantity: emptyToNullNumber(formData.get(`lineas[${i}].quantity`)),
      unit: emptyToNull(formData.get(`lineas[${i}].unit`)),
      // Nulo = no declarada; nunca 0 por defecto (Restricciones globales del brief).
      withdrawalDays: emptyToNullNumber(formData.get(`lineas[${i}].withdrawalDays`)),
      reentryHours: emptyToNullNumber(formData.get(`lineas[${i}].reentryHours`)),
    });
  }
  return lineas;
}

/** Los campos comunes a registrar y corregir — todo salvo `locationId`/`claveDeEnvio`. */
function parseNueva(formData: FormData) {
  return {
    kind: String(formData.get("kind") ?? "") as PlotInterventionKind,
    target: String(formData.get("target") ?? "") as PlotInterventionTarget,
    targetNote: emptyToNull(formData.get("targetNote")),
    method: emptyToNull(formData.get("method")) as PlotInterventionMethod | null,
    mixVolume: emptyToNullNumber(formData.get("mixVolume")),
    mixUnit: emptyToNull(formData.get("mixUnit")),
    occurredAt: fechaLocal(formData, "occurredAt"),
    operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
    fieldSessionId: emptyToNull(formData.get("fieldSessionId")),
    motivoObservationId: emptyToNull(formData.get("motivoObservationId")),
    specimenIds: formData.getAll("specimenIds").map(String),
    plotBlockIds: formData.getAll("plotBlockIds").map(String),
    lineas: parseLineas(formData),
    notes: emptyToNull(formData.get("notes")),
  };
}

export async function registrarIntervencionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await registrarIntervencion(user.userAccountId, {
      locationId,
      ...parseNueva(formData),
      claveDeEnvio: emptyToNull(formData.get("claveDeEnvio")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  redirect(`/plots/${locationId}?ok=manejo`);
}

export async function corregirIntervencionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const interventionId = String(formData.get("interventionId") ?? "");
  let locationId: string;
  let nuevaId: string;
  try {
    const creada = await corregirIntervencion(user.userAccountId, {
      interventionId,
      motivo: String(formData.get("motivo") ?? ""),
      nueva: parseNueva(formData),
    });
    locationId = creada.locationId;
    nuevaId = creada.id;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  redirect(`/plots/${locationId}/manejo/${nuevaId}?ok=corregido`);
}
