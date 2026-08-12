"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "../../lib/auth/session";
import { createHive, createColony, ApiaryAccessError } from "../../lib/apiary/hives";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent, ColonyEventValidationError } from "../../lib/apiary/colonyEvents";
import type { RecordInspectionInput } from "../../lib/apiary/inspections";
import type { RecordColonyEventInput } from "../../lib/apiary/colonyEvents";

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};
const emptyToNullNumber = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? Number(str) : null;
};

// --- Hive / Colony creation, online-only (§7's A0 scope note: offline is
// wired to the Inspection/ColonyEvent forms specifically, not to these) ---

export async function createHiveFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locationId = String(formData.get("locationId") ?? "");
  await createHive(user.userAccountId, {
    identifier: String(formData.get("identifier") ?? ""),
    locationId,
    projectId: emptyToNull(formData.get("projectId")),
    installedAt: emptyToNull(formData.get("installedAt")) ? new Date(String(formData.get("installedAt"))) : null,
  });

  revalidatePath(`/apiaries/${locationId}`);
}

export async function createColonyFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apiaryId = String(formData.get("apiaryId") ?? "");
  const hiveId = String(formData.get("hiveId") ?? "");
  await createColony(user.userAccountId, {
    hiveId,
    startedAt: new Date(),
    // §1: origin is a required, capture-or-lose-it fact — no default.
    originType: String(formData.get("originType") ?? "other") as never,
    originNote: emptyToNull(formData.get("originNote")),
    // §1a: a beekeeper directly observed/established this colony.
    provenanceClass: "direct_observation",
  });

  revalidatePath(`/apiaries/${apiaryId}/hives/${hiveId}`);
}

// --- Harvest/extraction -> HoneyBatch as a Lot (A3), online-only, same
// reasoning as the two actions above ---

export async function recordApiaryHarvestFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { lot } = await recordApiaryHarvest(user.userAccountId, {
    lotCode: String(formData.get("lotCode") ?? ""),
    colonyId: String(formData.get("colonyId") ?? ""),
    occurredAt: new Date(),
    extractedWeightKg: emptyToNullNumber(formData.get("extractedWeightKg")),
    framesHarvested: emptyToNullNumber(formData.get("framesHarvested")),
    notes: emptyToNull(formData.get("notes")),
    // T9.5 §3(b): an extraction weight/frame count is an instrument/
    // count value read at the time — measured_fact, matching
    // recordHarvestEvent's own choice for the coffee-side equivalent.
    provenanceClass: "measured_fact",
  });

  // Reuses the existing /lots/[id] page verbatim — §2's whole point: a
  // honey Lot is a Lot, so it already has a detail page, a report, photo
  // attachment, and everything else, with zero new UI built here.
  revalidatePath("/lots");
  redirect(`/lots/${lot.id}`);
}

// --- Inspection / ColonyEvent, called directly from client code (the
// offline sync queue, lib/apiary/offlineQueue.ts) rather than bound to a
// <form action>, since every submission is queued locally first and only
// reaches here when a sync pass actually runs (§7, A0's Option B shape:
// no service worker, explicit/opportunistic "sync now"). Auth/RBAC still
// runs on every call, exactly as it would for a form-bound action —
// nothing about calling this from a queue relaxes that. ---

export interface ApiarySyncResult {
  ok: boolean;
  errorKind?: "validation" | "access" | "unknown";
  message?: string;
}

export async function recordInspectionSyncAction(input: RecordInspectionInput): Promise<ApiarySyncResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, errorKind: "access", message: "not_authenticated" };

  try {
    const inspection = await recordInspection(user.userAccountId, input);
    revalidatePath(`/apiaries`);
    return { ok: true, message: inspection.id };
  } catch (error) {
    if (error instanceof ApiaryAccessError) return { ok: false, errorKind: "access", message: error.message };
    return { ok: false, errorKind: "unknown", message: error instanceof Error ? error.message : String(error) };
  }
}

export async function recordColonyEventSyncAction(input: RecordColonyEventInput): Promise<ApiarySyncResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, errorKind: "access", message: "not_authenticated" };

  try {
    const event = await recordColonyEvent(user.userAccountId, input);
    revalidatePath(`/apiaries`);
    return { ok: true, message: event.id };
  } catch (error) {
    if (error instanceof ColonyEventValidationError) return { ok: false, errorKind: "validation", message: error.message };
    if (error instanceof ApiaryAccessError) return { ok: false, errorKind: "access", message: error.message };
    return { ok: false, errorKind: "unknown", message: error instanceof Error ? error.message : String(error) };
  }
}
