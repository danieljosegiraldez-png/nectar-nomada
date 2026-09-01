"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import {
  parseLocalDateTime,
  LocalDateTimeError,
  TZ_OFFSET_FIELD,
} from "../../lib/time/localDateTime";
import { recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { recordSelection, SelectionValidationError } from "../../lib/traceability/selection";
import { recordQuantityEvent, QuantityValidationError } from "../../lib/traceability/quantity";
import {
  recordMeasurement,
  correctMeasurement,
  MeasurementValidationError,
} from "../../lib/traceability/measurements";
import { UnitValidationError } from "../../lib/traceability/units";
import { recordHarvestEvent, recordReceivingEvent } from "../../lib/traceability/harvest";
import { startFermentationRun, recordFermentationIntervention, endFermentationRun } from "../../lib/traceability/fermentation";
import { createRecipeWithVersion, createRecipeVersion, updateRecipeMetadata } from "../../lib/traceability/processTargets";
import { startDryingRun, recordDryingTurnEvent, endDryingRun } from "../../lib/traceability/drying";
import { moveLotToStorage } from "../../lib/traceability/storage";
import {
  startFieldSession,
  endFieldSession,
  recordFieldEvent,
  FieldSessionValidationError,
} from "../../lib/traceability/fieldSessions";
import {
  recordHarvestSources,
  createPlantingCohort,
  updatePlantingCohort,
  PlantingCohortValidationError,
} from "../../lib/traceability/plantingCohorts";
import {
  updateLocationAttributes,
  LocationAccessError,
  LocationValidationError,
} from "../../lib/traceability/locations";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { requestLotAssetUpload, finalizeLotAssetUpload, type LotAssetParent } from "../../lib/traceability/media";
import {
  recordLabourEntry,
  recordMaterialConsumptionEntry,
  type LabourEntryParent,
  type MaterialConsumptionParent,
} from "../../lib/traceability/operations";

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
  if (error instanceof SelectionValidationError) return t("error_selection", { detail: error.message });
  if (error instanceof LocationAccessError) return t("error_access", { detail: error.message });
  if (error instanceof LocationValidationError) return t("error_location", { detail: error.message });
  if (error instanceof PlantingCohortValidationError) return t("error_harvest_sources", { detail: error.message });
  if (error instanceof FieldSessionValidationError) return t("error_field_session", { detail: error.message });
  if (error instanceof LocalDateTimeError) return t("error_datetime", { detail: error.message });
  throw error;
}

/**
 * La hora que escribió el operador, en el instante que de verdad significa.
 *
 * `new Date("2026-03-12T07:30")` la interpretaba en la zona DEL SERVIDOR — en
 * producción, UTC — así que un 07:30 de Panamá se guardaba como las 02:30. En
 * desarrollo no se veía: navegador y servidor comparten zona y el error se
 * cancela. Lo encontró una revisión independiente el 2026-08-31.
 */
const fechaLocal = (formData: FormData, campo: string) =>
  parseLocalDateTime(String(formData.get(campo) ?? ""), asString(formData.get(TZ_OFFSET_FIELD)));

const asString = (v: FormDataEntryValue | null) => (v == null ? null : String(v));

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};
/**
 * El índice más alto que trae el formulario para un prefijo dado.
 *
 * Se deriva de lo enviado en vez de fijar un tope: cualquier tope es una
 * suposición sobre cuántas filas cabe que use alguien, y equivocarse descarta
 * datos en silencio. Devuelve -1 si no hay ninguna.
 */
function maxIndiceDeFilas(formData: FormData, prefijo: string): number {
  let max = -1;
  for (const clave of formData.keys()) {
    if (!clave.startsWith(`${prefijo}.`)) continue;
    const n = Number(clave.slice(prefijo.length + 1));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return max;
}

/**
 * Un número que el formulario **debe** traer. Un campo ausente o ilegible falla
 * en vez de convertirse en 0: un 0 en una columna de medida se lee como que
 * alguien midió cero, y eso es una afirmación (ADR-080).
 */
function requiredNumber(formData: FormData, campo: string): number {
  const crudo = String(formData.get(campo) ?? "").trim();
  if (!crudo) throw new MeasurementValidationError(`${campo}_required`);
  const n = Number(crudo);
  if (!Number.isFinite(n)) throw new MeasurementValidationError(`${campo}_not_a_number`);
  return n;
}

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
      harvestedAt: fechaLocal(formData, "harvestedAt"),
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
      receivedAt: fechaLocal(formData, "receivedAt"),
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
      // `?? 0` convertía un valor ausente en una medición de CERO. El
      // `required` del formulario sólo protege la interfaz: invocando la acción
      // sin `value` se creaba una lectura de 0 con aspecto de medida. Ahora se
      // exige, y el servicio ya distingue el 0 legítimo del ausente (ADR-080).
      value: requiredNumber(formData, "value"),
      unit: String(formData.get("unit") ?? ""),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      // Pre-existing gap fix: MeasurementForm now carries these as hidden
      // fields when rendered against an active FermentationRun/DryingRun/
      // StorageAssignment (see app/lots/[id]/page.tsx's MeasurementForm
      // call) — absent otherwise, same as roastSessionId once the R1 UI
      // wires it in.
      fermentationRunId: emptyToNull(formData.get("fermentationRunId")),
      dryingRunId: emptyToNull(formData.get("dryingRunId")),
      storageAssignmentId: emptyToNull(formData.get("storageAssignmentId")),
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
      processRecipeVersionId: emptyToNull(formData.get("processRecipeVersionId")),
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

// --- P3: selección (44_P3_SELECTION.md §6) ---------------------------------

/**
 * Records a selection from the batch page.
 *
 * Rejection rows arrive as parallel indexed fields (`rejectedCategory.0`,
 * `rejectedQuantity.0`, `rejectedLotCode.0`, ...) because the operator adds and
 * removes rows client-side and FormData has no nested shape. Rows whose weight
 * is blank are dropped rather than sent as zero: an operator who added a row
 * and then did not use it has not weighed nothing, they have not weighed.
 */
export async function recordSelectionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  const unit = String(formData.get("unit") ?? "kg");

  const rejected: Array<{ lotCode: string; lotType: never; quantity: number; rejectionCategoryValueId: string }> = [];
  // Mismo fallo que el de aportes de cosecha, mismo arreglo: el formulario deja
  // añadir filas de rechazo sin límite y este bucle paraba en 20. Un lote con
  // 21 categorías de rechazo perdía la última en silencio — y aquí el balance
  // de masa lo habría marcado como faltante sin explicar, culpando al operador.
  const totalRechazos = maxIndiceDeFilas(formData, "rejectedQuantity");
  for (let i = 0; i <= totalRechazos; i++) {
    const quantity = emptyToNullNumber(formData.get(`rejectedQuantity.${i}`));
    const category = emptyToNull(formData.get(`rejectedCategory.${i}`));
    const code = emptyToNull(formData.get(`rejectedLotCode.${i}`));
    if (quantity == null || !category || !code) continue;
    rejected.push({
      lotCode: code,
      lotType: String(formData.get("acceptedLotType") ?? "cherry") as never,
      quantity,
      rejectionCategoryValueId: category,
    });
  }

  try {
    await recordSelection(user.userAccountId, {
      inputLotId: lotId,
      inputQuantity: Number(formData.get("inputQuantity") ?? 0),
      unit,
      selectionMethodValueId: emptyToNull(formData.get("selectionMethod")),
      equipmentNote: emptyToNull(formData.get("equipmentNote")),
      accepted: {
        lotCode: String(formData.get("acceptedLotCode") ?? ""),
        lotType: String(formData.get("acceptedLotType") ?? "cherry") as never,
        quantity: Number(formData.get("acceptedQuantity") ?? 0),
      },
      rejected,
      declaredLossQuantity: emptyToNullNumber(formData.get("declaredLossQuantity")),
      declaredLossReason: emptyToNull(formData.get("declaredLossReason")),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): a selection is an action taken against the material, and
      // the weights on it are read off a scale — measured_fact, not a
      // recollection.
      provenanceClass: "measured_fact",
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
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

// --- T12.6: Labour-time and material-consumption capture -----------------
// (docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md)

function labourParentFromFormData(formData: FormData): LabourEntryParent {
  const kind = String(formData.get("parentKind") ?? "");
  const parentId = String(formData.get("parentId") ?? "");
  switch (kind) {
    case "harvestEvent":
      return { kind, harvestEventId: parentId };
    case "receivingEvent":
      return { kind, receivingEventId: parentId };
    case "fermentationRun":
      return { kind, fermentationRunId: parentId };
    case "dryingRun":
      return { kind, dryingRunId: parentId };
    default:
      throw new TraceabilityAccessError("invalid_parent_kind");
  }
}

function consumptionParentFromFormData(formData: FormData): MaterialConsumptionParent {
  const kind = String(formData.get("parentKind") ?? "");
  const parentId = String(formData.get("parentId") ?? "");
  switch (kind) {
    case "fermentationRun":
      return { kind, fermentationRunId: parentId };
    case "dryingRun":
      return { kind, dryingRunId: parentId };
    default:
      throw new TraceabilityAccessError("invalid_parent_kind");
  }
}

export async function recordLabourEntryFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordLabourEntry(user.userAccountId, {
    lotId,
    parent: labourParentFromFormData(formData),
    workerCount: Number(formData.get("workerCount") ?? 0),
    hours: Number(formData.get("hours") ?? 0),
    taskNote: emptyToNull(formData.get("taskNote")),
    providedByOrganizationId: emptyToNull(formData.get("providedByOrganizationId")),
    operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
    // Source report §3: a headcount/hours tally reported at the time is a
    // direct observation — not operator-selectable, matching how T9.5
    // handled every call site without a genuinely ambiguous provenance.
    provenanceClass: "direct_observation",
  });

  revalidatePath(`/lots/${lotId}`);
}

export async function recordMaterialConsumptionEntryFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordMaterialConsumptionEntry(user.userAccountId, {
    lotId,
    parent: consumptionParentFromFormData(formData),
    materialName: String(formData.get("materialName") ?? ""),
    batchLabel: String(formData.get("batchLabel") ?? ""),
    quantity: emptyToNullNumber(formData.get("quantity")),
    unit: emptyToNull(formData.get("unit")),
    operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
    provenanceClass: "direct_observation",
  });

  revalidatePath(`/lots/${lotId}`);
}

/**
 * Create a recipe and its first version — ADR-100.
 *
 * The targets arrive as `targets[0][variable]`, `targets[0][moment]`… because
 * the count is not known in advance. Parsed by walking indices until one comes
 * up empty rather than trusting a hidden count field, which a truncated POST
 * would make wrong.
 */
export async function createRecipeAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const targets = parseTargetRows(formData);

  try {
    await createRecipeWithVersion(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      description: emptyToNull(formData.get("description")),
      organizationId: emptyToNull(formData.get("organizationId")),
      targets,
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath("/recipes");
  redirect("/recipes?ok=1");
}

/** Shared by both recipe forms — the target rows arrive the same way. */
function parseTargetRows(formData: FormData) {
  const targets: {
    variable: string;
    moment: "initial" | "during" | "final";
    unit: string;
    targetValue: number | null;
    minValue: number | null;
    maxValue: number | null;
    note: string | null;
  }[] = [];
  for (let i = 0; i < 50; i++) {
    const variable = formData.get(`targets[${i}][variable]`);
    if (typeof variable !== "string" || variable === "") break;
    targets.push({
      variable,
      moment: String(formData.get(`targets[${i}][moment]`) ?? "final") as "initial" | "during" | "final",
      unit: String(formData.get(`targets[${i}][unit]`) ?? ""),
      targetValue: emptyToNullNumber(formData.get(`targets[${i}][targetValue]`)),
      minValue: emptyToNullNumber(formData.get(`targets[${i}][minValue]`)),
      maxValue: emptyToNullNumber(formData.get(`targets[${i}][maxValue]`)),
      note: emptyToNull(formData.get(`targets[${i}][note]`)),
    });
  }
  return targets;
}

/** Rename a recipe, or reword its description — ADR-102. Never its targets. */
export async function updateRecipeAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const recipeId = String(formData.get("recipeId") ?? "");

  try {
    await updateRecipeMetadata(user.userAccountId, recipeId, {
      name: String(formData.get("name") ?? ""),
      description: emptyToNull(formData.get("description")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=renamed`);
}

/** A new version — the only way targets ever change (ADR-102). */
export async function createRecipeVersionAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const recipeId = String(formData.get("recipeId") ?? "");

  try {
    await createRecipeVersion(
      user.userAccountId,
      recipeId,
      parseTargetRows(formData),
      emptyToNull(formData.get("notes")),
    );
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=versioned`);
}

// --- Atributos de un lote de terreno (F1 §1 / P1 §3) ---------------------

/**
 * El servicio tiene forma de `PATCH`: una clave ausente se deja intacta y un
 * `null` explícito **borra** el valor. Este formulario muestra los ocho campos
 * a la vez, así que aquí se manda siempre el juego completo — lo que ves es lo
 * que se guarda, y vaciar una casilla la borra de verdad en vez de dejar un
 * valor viejo que la pantalla ya no muestra.
 *
 * `emptyToNullNumber` es lo que impide el fallo que de verdad importa: una
 * casilla de área vacía tiene que llegar como `null`, nunca como `0`. Un lote
 * de 0 ha no es un lote sin medir — es una afirmación, y encima haría que la
 * densidad se leyera como «área no positiva» en vez de «falta el área»
 * (ADR-080).
 */
export async function updatePlotAttributesAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await updateLocationAttributes(user.userAccountId, {
      locationId,
      areaHectares: emptyToNullNumber(formData.get("areaHectares")),
      plantSpacingMeters: emptyToNullNumber(formData.get("plantSpacingMeters")),
      altitudeMinM: emptyToNullNumber(formData.get("altitudeMinM")),
      altitudeMaxM: emptyToNullNumber(formData.get("altitudeMaxM")),
      sunExposure: emptyToNull(formData.get("sunExposure")) as never,
      shadePercentage: emptyToNull(formData.get("shadePercentage")) as never,
      slopeDescription: emptyToNull(formData.get("slopeDescription")),
      soilType: emptyToNull(formData.get("soilType")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath("/plots");
  return {};
}

// --- De qué bloques salió una cosecha (P1 §5) ----------------------------

/**
 * Añade aportes; **no reemplaza** los que ya hay. El servicio crea filas, así
 * que enviar dos veces suma dos veces, y la pantalla enseña siempre el total
 * acumulado para que eso se vea en lugar de sorprender.
 *
 * Una fila sin lote se salta en silencio: el formulario arranca con tres filas
 * vacías y llenar sólo una es lo normal. Lo que **no** se salta es una fila con
 * lote y sin peso — ese es el caso honesto de «este bloque aportó, y nadie lo
 * pesó por separado», que la reconciliación cuenta como desconocido y no como
 * cero (ADR-080).
 */
export async function recordHarvestSourcesFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  const harvestEventId = String(formData.get("harvestEventId") ?? "");

  const sources: Array<{
    locationId: string;
    plantingCohortId: string | null;
    cherryWeightKg: number | null;
    notes: string | null;
  }> = [];
  // Se recorren TODAS las filas que mandó el formulario, no las primeras veinte.
  // El formulario deja añadir filas sin límite y este bucle paraba en 20: una
  // cosecha de 21 bloques guardaba los primeros y decía que había ido bien.
  // Lo encontró una revisión independiente el 2026-08-31.
  const totalFilas = maxIndiceDeFilas(formData, "sourceLocation");
  for (let i = 0; i <= totalFilas; i++) {
    const locationId = emptyToNull(formData.get(`sourceLocation.${i}`));
    if (!locationId) continue;
    sources.push({
      locationId,
      plantingCohortId: emptyToNull(formData.get(`sourceCohort.${i}`)),
      cherryWeightKg: emptyToNullNumber(formData.get(`sourceWeight.${i}`)),
      notes: emptyToNull(formData.get(`sourceNotes.${i}`)),
    });
  }

  if (sources.length === 0) {
    return { error: t("error_harvest_sources", { detail: "sources_required" }) };
  }

  try {
    await recordHarvestSources(user.userAccountId, { harvestEventId, sources });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

// --- Registrar y corregir una siembra (P1 §1) ----------------------------

/**
 * La fecha llega como dos campos: el valor y su precisión. Un año suelto se
 * guarda como el 1 de enero de ese año **con `plantedPrecision: "year"`**, que
 * es lo que impide que la pantalla lo lea después como un día concreto. Sin
 * fecha, los dos van nulos: «no se sabe cuándo» es una respuesta legítima y
 * frecuente, y el servicio la acepta.
 */
function parsePlantedAt(formData: FormData): { plantedAt: Date | null; plantedPrecision: string | null } {
  const raw = String(formData.get("plantedAt") ?? "").trim();
  if (!raw) return { plantedAt: null, plantedPrecision: null };
  // <input type="date"> da YYYY-MM-DD; los otros dos modos recortan.
  const precision = String(formData.get("plantedPrecision") ?? "date");
  if (precision === "year") return { plantedAt: new Date(`${raw.slice(0, 4)}-01-01T00:00:00Z`), plantedPrecision: "year" };
  if (precision === "month") return { plantedAt: new Date(`${raw.slice(0, 7)}-01T00:00:00Z`), plantedPrecision: "month" };
  return { plantedAt: new Date(`${raw.slice(0, 10)}T00:00:00Z`), plantedPrecision: "date" };
}

export async function createPlantingCohortFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  const { plantedAt, plantedPrecision } = parsePlantedAt(formData);

  try {
    await createPlantingCohort(user.userAccountId, {
      locationId,
      cultivarValueId: emptyToNull(formData.get("cultivarValueId")),
      plantCount: emptyToNullNumber(formData.get("plantCount")),
      plantedAt,
      plantedPrecision: plantedPrecision as never,
      // ADR-038: sin valor por defecto. El formulario obliga a elegirlo porque
      // «de dónde sale este dato» no lo puede decidir una acción.
      provenanceClass: String(formData.get("provenanceClass") ?? "") as never,
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  return {};
}

export async function updatePlantingCohortFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  const { plantedAt, plantedPrecision } = parsePlantedAt(formData);

  try {
    await updatePlantingCohort(user.userAccountId, {
      cohortId: String(formData.get("cohortId") ?? ""),
      cultivarValueId: emptyToNull(formData.get("cultivarValueId")),
      plantCount: emptyToNullNumber(formData.get("plantCount")),
      plantedAt,
      plantedPrecision: plantedPrecision as never,
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
      notes: emptyToNull(formData.get("notes")),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  return {};
}

// --- Jornada de campo (P2 §3–§5) ----------------------------------------

/**
 * Las coordenadas van todas o ninguna. El servicio ya lo exige; aquí se
 * respeta no mandando un objeto a medias: media coordenada no ubica nada y
 * guardarla sugeriría que sí.
 */
function parseCoordinates(formData: FormData) {
  const latitude = emptyToNullNumber(formData.get("latitude"));
  const longitude = emptyToNullNumber(formData.get("longitude"));
  const accuracyM = emptyToNullNumber(formData.get("accuracyM"));
  if (latitude == null && longitude == null) return undefined;
  return { latitude, longitude, accuracyM };
}

export async function startFieldSessionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  let sessionId: string;
  try {
    const session = await startFieldSession(user.userAccountId, {
      locationId,
      operatorPersonId: String(formData.get("operatorPersonId") ?? ""),
      startedAt: fechaLocal(formData, "startedAt"),
      start: parseCoordinates(formData),
      notes: emptyToNull(formData.get("notes")),
      // Una jornada la abre quien está en el sitio: es observación directa de
      // que la visita ocurrió, no un registro transcrito de otra fuente.
      provenanceClass: "direct_observation",
    });
    sessionId = session.id;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  redirect(`/field-sessions/${sessionId}`);
}

export async function recordFieldEventFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  try {
    await recordFieldEvent(user.userAccountId, {
      fieldSessionId,
      eventKindValueId: String(formData.get("eventKindValueId") ?? ""),
      occurredAt: fechaLocal(formData, "occurredAt"),
      position: parseCoordinates(formData),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: "direct_observation",
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  return {};
}

export async function endFieldSessionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  try {
    await endFieldSession(user.userAccountId, {
      fieldSessionId,
      endedAt: fechaLocal(formData, "endedAt"),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  return {};
}

// --- Corregir una medición (C1 §3) --------------------------------------

/**
 * Una corrección **no borra ni edita** la lectura original: crea una medición
 * nueva que la supersede vía `correctsId`, y la vieja se queda en el registro.
 * Es lo contrario del `PATCH` con que se corrige una cohorte, y la asimetría es
 * deliberada: el valor de una medición **fue observado** y sigue siéndolo
 * aunque estuviera mal apuntado; el conteo de una cohorte es una cifra que se
 * escribió, sin más.
 *
 * El motivo es obligatorio en el servicio. Aquí no se inventa uno por defecto.
 */
export async function correctMeasurementFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await correctMeasurement(user.userAccountId, {
      measurementId: String(formData.get("measurementId") ?? ""),
      // `?? 0` convertía un valor ausente en una medición de CERO. El
      // `required` del formulario sólo protege la interfaz: invocando la acción
      // sin `value` se creaba una lectura de 0 con aspecto de medida. Ahora se
      // exige, y el servicio ya distingue el 0 legítimo del ausente (ADR-080).
      value: requiredNumber(formData, "value"),
      unit: String(formData.get("unit") ?? ""),
      // Cuándo ocurrió la lectura CORRECTA. No es «ahora»: corregir a las seis
      // de la tarde una lectura de las nueve de la mañana no la mueve a la
      // tarde, y ponerlo por defecto invitaría a dejarlo mal.
      occurredAt: fechaLocal(formData, "occurredAt"),
      reason: String(formData.get("reason") ?? ""),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: String(formData.get("provenanceClass") ?? "measured_fact") as never,
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}
