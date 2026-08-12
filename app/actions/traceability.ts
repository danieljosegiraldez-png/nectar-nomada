"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordQuantityEvent, QuantityValidationError } from "../../lib/traceability/quantity";
import { recordMeasurement, MeasurementValidationError } from "../../lib/traceability/measurements";
import { UnitValidationError } from "../../lib/traceability/units";
import { recordHarvestEvent, recordReceivingEvent } from "../../lib/traceability/harvest";
import { startFermentationRun, recordFermentationIntervention, endFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun, recordDryingTurnEvent, endDryingRun } from "../../lib/traceability/drying";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { requestLotAssetUpload, finalizeLotAssetUpload, type LotAssetParent } from "../../lib/traceability/media";

export interface TraceabilityActionState {
  error?: string;
}

// Matched by class, not by exact message string — UnitValidationError's
// messages carry a dynamic suffix (e.g. "out_of_range:temperature:120")
// that can't map to a fixed i18n key. The raw code is still shown (via
// {detail}) since this is an internal operator tool, not public-facing
// copy — functional and honest beats a polished translation catalog for
// every possible internal error code.
function friendlyError(t: Awaited<ReturnType<typeof getTranslations>>, error: unknown): string {
  if (error instanceof TraceabilityAccessError) return t("error_access", { detail: error.message });
  if (error instanceof QuantityValidationError) return t("error_quantity", { detail: error.message });
  if (error instanceof MeasurementValidationError) return t("error_measurement", { detail: error.message });
  if (error instanceof UnitValidationError) return t("error_unit", { detail: error.message });
  throw error;
}

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};
const emptyToNullNumber = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? Number(str) : null;
};

// --- Create Lot (Harvest / Receiving), §30 screen 4 ---------------------

export async function recordHarvestAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let lotId: string;
  try {
    const { lot } = await recordHarvestEvent(user.userAccountId, {
      lotCode: String(formData.get("lotCode") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      projectId: emptyToNull(formData.get("projectId")),
      harvestedAt: new Date(String(formData.get("harvestedAt") ?? "")),
      cherryWeightKg: emptyToNullNumber(formData.get("cherryWeightKg")),
      brix: emptyToNullNumber(formData.get("brix")),
      condition: emptyToNull(formData.get("condition")),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): a harvest weight/brix reading is an instrument value
      // read at receiving — measured_fact, not an unqualified claim.
      provenanceClass: "measured_fact",
    });
    lotId = lot.id;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath("/lots");
  redirect(`/lots/${lotId}`);
}

export async function recordReceivingAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let lotId: string;
  try {
    const { lot } = await recordReceivingEvent(user.userAccountId, {
      lotCode: String(formData.get("lotCode") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      locationId: emptyToNull(formData.get("locationId")),
      projectId: emptyToNull(formData.get("projectId")),
      receivedAt: new Date(String(formData.get("receivedAt") ?? "")),
      deliveryNote: emptyToNull(formData.get("deliveryNote")),
      cherryWeightKg: emptyToNullNumber(formData.get("cherryWeightKg")),
      condition: emptyToNull(formData.get("condition")),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): same reasoning as recordHarvestAction — a delivery
      // weight is a scale reading, measured_fact.
      provenanceClass: "measured_fact",
    });
    lotId = lot.id;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath("/lots");
  redirect(`/lots/${lotId}`);
}

// --- Record Measurement, §30 screen 5 (contextual component) ------------

export async function recordMeasurementAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await recordMeasurement(user.userAccountId, {
      lotId,
      variable: String(formData.get("variable") ?? "") as never,
      value: Number(formData.get("value") ?? 0),
      unit: String(formData.get("unit") ?? ""),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(c): the one write path where the UI itself exposes both
      // fields (MeasurementForm) rather than the action choosing silently.
      provenanceClass: String(formData.get("provenanceClass") ?? "measured_fact") as never,
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

// --- Record Fermentation, §30 screen 6 -----------------------------------

export async function startFermentationAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await startFermentationRun(user.userAccountId, {
      lotId,
      vesselNote: emptyToNull(formData.get("vesselNote")),
      startedAt: new Date(),
      inoculated: formData.get("inoculated") === "on",
      inoculationNote: emptyToNull(formData.get("inoculationNote")),
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      // T9.5 §3(b): starting a run is an action taken, not a measurement.
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

export async function recordFermentationInterventionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordFermentationIntervention(user.userAccountId, {
    fermentationRunId: String(formData.get("fermentationRunId") ?? ""),
    interventionType: String(formData.get("interventionType") ?? "other") as never,
    occurredAt: new Date(),
    notes: emptyToNull(formData.get("notes")),
  });

  revalidatePath(`/lots/${lotId}`);
}

export async function endFermentationFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await endFermentationRun(user.userAccountId, {
    fermentationRunId: String(formData.get("fermentationRunId") ?? ""),
    endedAt: new Date(),
    outputLotCode: String(formData.get("outputLotCode") ?? ""),
    outputLotType: String(formData.get("outputLotType") ?? "drying") as never,
    quantity: emptyToNullNumber(formData.get("quantity")),
    unit: emptyToNull(formData.get("unit")),
    provenanceClass: "original_record",
  });

  revalidatePath(`/lots/${lotId}`);
}

// --- Record Drying, §30 screen 7 -----------------------------------------

export async function startDryingAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await startDryingRun(user.userAccountId, {
      lotId,
      method: emptyToNull(formData.get("method")),
      layerDepthCm: emptyToNullNumber(formData.get("layerDepthCm")),
      startedAt: new Date(),
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      // T9.5 §3(b): starting a run is an action taken, not a measurement.
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

export async function recordDryingTurnFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordDryingTurnEvent(user.userAccountId, {
    dryingRunId: String(formData.get("dryingRunId") ?? ""),
    eventType: String(formData.get("eventType") ?? "other") as never,
    occurredAt: new Date(),
  });

  revalidatePath(`/lots/${lotId}`);
}

export async function endDryingFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await endDryingRun(user.userAccountId, {
    dryingRunId: String(formData.get("dryingRunId") ?? ""),
    endedAt: new Date(),
    outputLotCode: String(formData.get("outputLotCode") ?? ""),
    outputLotType: String(formData.get("outputLotType") ?? "green") as never,
    quantity: emptyToNullNumber(formData.get("quantity")),
    unit: emptyToNull(formData.get("unit")),
    provenanceClass: "original_record",
  });

  revalidatePath(`/lots/${lotId}`);
}

// --- Record Storage Movement, §30 screen 8 -------------------------------

export async function recordStorageMoveAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await moveLotToStorage(user.userAccountId, {
      lotId,
      locationId: String(formData.get("locationId") ?? ""),
      containerNote: emptyToNull(formData.get("containerNote")),
      startedAt: new Date(),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

// --- Create Sample, §30 screen 9 -----------------------------------------

export async function createSampleAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await createSampleFromLot(user.userAccountId, {
      sampleCode: String(formData.get("sampleCode") ?? ""),
      sampleType: String(formData.get("sampleType") ?? ""),
      sourceLotId: lotId,
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): extracting a sample is an action taken against the lot.
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

// --- Split / merge / blend / stage_change, used by the Lot Detail "record processing step" mini-forms ---

export async function recordStageChangeFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  const outputLotCode = emptyToNull(formData.get("outputLotCode"));
  const outputLotType = emptyToNull(formData.get("outputLotType"));

  await recordTransformation(user.userAccountId, {
    transformationType: "stage_change",
    occurredAt: new Date(),
    // T9.5 §3(b): a stage change / split / merge / blend is an action
    // taken, not a measurement.
    provenanceClass: "original_record",
    inputs: [{ lotId, quantity: emptyToNullNumber(formData.get("quantity")), unit: emptyToNull(formData.get("unit")) }],
    outputs:
      outputLotCode && outputLotType
        ? [
            {
              lotCode: outputLotCode,
              lotType: outputLotType as never,
              quantity: emptyToNullNumber(formData.get("quantity")),
              unit: emptyToNull(formData.get("unit")),
            },
          ]
        : [],
  });

  revalidatePath(`/lots/${lotId}`);
}

// --- T12.5: Photo/asset attachment, §30's six attachment points ---------

export async function requestLotAssetUploadAction(
  lotId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    return await requestLotAssetUpload(user.userAccountId, { lotId, originalFilename, contentType });
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return { error: t("error_access", { detail: error.message }) };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

export async function finalizeLotAssetUploadAction(
  lotId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
  parent: LotAssetParent,
  creatorPersonId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    await finalizeLotAssetUpload(user.userAccountId, {
      lotId,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename,
      parent,
      // T12.5 §2: a field photo — of a lot, a harvest, a measurement in
      // progress, a fermentation vessel, a drying bed, a sample — is
      // someone photographing what is directly in front of them at the
      // moment of capture, the same reasoning HarvestEvent's weight/brix
      // readings use for measured_fact, applied to direct_observation
      // instead since a photo documents rather than measures. Not
      // operator-selectable: unlike Measurement (T9.5 §3(c)), there is no
      // genuinely ambiguous case among these six attachment points to
      // expose a picker for.
      provenanceClass: "direct_observation",
      creatorPersonId,
    });
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return { error: t("error_access", { detail: error.message }) };
    throw error;
  }

  revalidatePath(`/lots/${lotId}`);
  return { ok: true };
}
