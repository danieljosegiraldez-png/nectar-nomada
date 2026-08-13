"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { createProtocol, createProtocolVersion, activateProtocolVersion, ProtocolValidationError } from "../../lib/research/protocols";
import { createTreatmentBatch, addProcessingStage, completeProcessingStage, TreatmentBatchValidationError, ProcessingStageValidationError } from "../../lib/research/treatments";
import { ResearchAccessError } from "../../lib/research/access";
import type { ProtocolVariableValueType, ProvenanceClass } from "../../generated/prisma/client";
import type { MeasurementVariable } from "../../lib/traceability/units";

export interface ResearchActionState {
  error?: string;
}

function friendlyError(t: Awaited<ReturnType<typeof getTranslations>>, error: unknown): string {
  if (error instanceof ResearchAccessError) return t("error_access", { detail: error.message });
  if (error instanceof ProtocolValidationError) return t("error_validation", { detail: error.message });
  if (error instanceof TreatmentBatchValidationError) return t("error_validation", { detail: error.message });
  if (error instanceof ProcessingStageValidationError) return t("error_stage", { detail: error.message });
  throw error;
}

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};

// Fixed-count repeatable rows (6 each) — matches this codebase's existing
// plain-HTML-form convention rather than a client-side dynamic array
// builder; empty rows are simply skipped server-side.
const MAX_ROWS = 6;

// §3a — parses one ProtocolVersionFields form section (shared by
// createProtocolAction and createProtocolVersionAction) into the
// variables/requiredMeasurements arrays createProtocolVersion expects,
// including the catalog/closed_enum rows the plain-HTML repeatable-row
// form carries.
function parseProtocolVersionFields(formData: FormData) {
  const variables = [];
  const requiredMeasurements = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const name = emptyToNull(formData.get(`var_name_${i}`));
    if (name) {
      const valueType = (formData.get(`var_type_${i}`) as ProtocolVariableValueType) || "text";
      const enumValuesRaw = emptyToNull(formData.get(`var_enum_values_${i}`));
      variables.push({
        name,
        valueType,
        unit: emptyToNull(formData.get(`var_unit_${i}`)),
        catalogId: valueType === "catalog" ? emptyToNull(formData.get(`var_catalog_${i}`)) : null,
        enumValues:
          valueType === "closed_enum" && enumValuesRaw
            ? enumValuesRaw.split(",").map((v) => v.trim()).filter(Boolean)
            : [],
        isControlled: formData.get(`var_controlled_${i}`) === "on",
        displayOrder: i,
      });
    }
    const rmVariable = emptyToNull(formData.get(`rm_variable_${i}`));
    const rmCatalog = emptyToNull(formData.get(`rm_catalog_${i}`));
    const rmStage = emptyToNull(formData.get(`rm_stage_${i}`));
    if ((rmVariable || rmCatalog) && rmStage) {
      requiredMeasurements.push({
        variable: rmVariable ? (rmVariable as MeasurementVariable) : null,
        catalogId: rmCatalog,
        atProcessingStage: rmStage,
        displayOrder: i,
      });
    }
  }
  return { variables, requiredMeasurements };
}

export async function createProtocolAction(_prevState: ResearchActionState, formData: FormData): Promise<ResearchActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Research");

  const { variables, requiredMeasurements } = parseProtocolVersionFields(formData);

  try {
    const protocol = await createProtocol(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      externalIdentifier: emptyToNull(formData.get("externalIdentifier")),
      identifierConvention: emptyToNull(formData.get("identifierConvention")),
      description: emptyToNull(formData.get("description")),
    });
    await createProtocolVersion(user.userAccountId, {
      protocolId: protocol.id,
      notes: emptyToNull(formData.get("notes")),
      variables,
      requiredMeasurements,
    });
    revalidatePath("/research");
    redirect(`/research/${protocol.id}`);
  } catch (error) {
    return { error: friendlyError(t, error) };
  }
}

export async function createProtocolVersionAction(_prevState: ResearchActionState, formData: FormData): Promise<ResearchActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Research");

  const protocolId = String(formData.get("protocolId") ?? "");
  const { variables, requiredMeasurements } = parseProtocolVersionFields(formData);

  try {
    await createProtocolVersion(user.userAccountId, {
      protocolId,
      notes: emptyToNull(formData.get("notes")),
      variables,
      requiredMeasurements,
    });
    revalidatePath(`/research/${protocolId}`);
  } catch (error) {
    return { error: friendlyError(t, error) };
  }
  redirect(`/research/${protocolId}`);
}

export async function activateProtocolVersionAction(_prevState: ResearchActionState, formData: FormData): Promise<ResearchActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Research");

  const protocolId = String(formData.get("protocolId") ?? "");
  const protocolVersionId = String(formData.get("protocolVersionId") ?? "");
  try {
    await activateProtocolVersion(user.userAccountId, protocolVersionId);
  } catch (error) {
    return { error: friendlyError(t, error) };
  }
  revalidatePath(`/research/${protocolId}`);
  redirect(`/research/${protocolId}`);
}

export async function createTreatmentBatchAction(_prevState: ResearchActionState, formData: FormData): Promise<ResearchActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Research");

  const protocolVersionId = String(formData.get("protocolVersionId") ?? "");
  const variableValues = [];
  for (let i = 0; i < MAX_ROWS; i++) {
    const protocolVariableId = emptyToNull(formData.get(`vv_id_${i}`));
    const value = emptyToNull(formData.get(`vv_value_${i}`));
    if (protocolVariableId && value) {
      const valueType = String(formData.get(`vv_type_${i}`) ?? "text");
      variableValues.push({
        protocolVariableId,
        textValue: valueType === "text" || valueType === "closed_enum" ? value : null,
        numericValue: valueType === "numeric" ? Number(value) : null,
        booleanValue: valueType === "boolean" ? value === "true" : null,
        // §3a — the "catalog" case: the select's option value IS the
        // VariableCatalogValue id.
        catalogValueId: valueType === "catalog" ? value : null,
        // §3a — "Spontaneous Wild" case: only meaningful (and only
        // required by treatments.ts's own validation) when the picked
        // catalog value's impliesUnknownIdentity is true.
        dataQuality: (emptyToNull(formData.get(`vv_data_quality_${i}`)) as import("../../generated/prisma/client").DataQuality | null) ?? null,
      });
    }
  }

  let treatmentBatchId: string;
  try {
    const batch = await createTreatmentBatch(user.userAccountId, {
      protocolVersionId,
      lotId: emptyToNull(formData.get("lotId")),
      batchLabel: String(formData.get("batchLabel") ?? ""),
      startedAt: new Date(String(formData.get("startedAt") ?? new Date().toISOString())),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: (formData.get("provenanceClass") as ProvenanceClass) || "measured_fact",
      variableValues,
    });
    treatmentBatchId = batch.id;
  } catch (error) {
    return { error: friendlyError(t, error) };
  }
  redirect(`/research/treatments/${treatmentBatchId}`);
}

export async function addProcessingStageAction(_prevState: ResearchActionState, formData: FormData): Promise<ResearchActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Research");

  const treatmentBatchId = String(formData.get("treatmentBatchId") ?? "");
  try {
    await addProcessingStage(user.userAccountId, {
      treatmentBatchId,
      name: String(formData.get("name") ?? ""),
      sequenceOrder: Number(formData.get("sequenceOrder") ?? 0),
      startedAt: new Date(String(formData.get("startedAt") ?? new Date().toISOString())),
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    return { error: friendlyError(t, error) };
  }
  revalidatePath(`/research/treatments/${treatmentBatchId}`);
  redirect(`/research/treatments/${treatmentBatchId}`);
}

export async function completeProcessingStageAction(_prevState: ResearchActionState, formData: FormData): Promise<ResearchActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Research");

  const treatmentBatchId = String(formData.get("treatmentBatchId") ?? "");
  const processingStageId = String(formData.get("processingStageId") ?? "");
  try {
    await completeProcessingStage(user.userAccountId, processingStageId, new Date());
  } catch (error) {
    return { error: friendlyError(t, error) };
  }
  revalidatePath(`/research/treatments/${treatmentBatchId}`);
  redirect(`/research/treatments/${treatmentBatchId}`);
}
