/**
 * T12.5 (docs/implementation/21_T12.5_MEDIA_ATTACHMENT_PROMPT.md). Photo/
 * asset attachment across Traceability — Harvest, Measurement,
 * Fermentation, Drying, Sample, plus a general Lot photo (which also
 * covers Receiving, which has no dedicated Asset FK of its own).
 *
 * Not built on top of lib/partner/workspace.ts's requestAssetUpload/
 * finalizeAssetUpload — that pair hardcodes `partner:upload_media`,
 * `classification: "partner"`, and a partner-specific storage key prefix,
 * none of which apply here. Same underlying two-step round trip (a
 * presigned PUT URL, then a finalize call once the browser confirms the
 * upload succeeded — the Next.js server never holds the file bytes) and
 * the same `objectStorageProvider` (lib/integrations/storage), against a
 * Traceability-specific gate, default classification, and key prefix.
 *
 * Permission: reuses `lot:manage` — already the gate for every other write
 * in this module (starting a run, recording a measurement, moving
 * storage). No new permission, consistent with the whole T1-T9.5 pattern
 * of not inventing one when an existing permission already expresses the
 * right authority.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { recordAuditEvent } from "../audit";
import type { ClassificationLevel, ProvenanceClass } from "../../generated/prisma/client";

const BUCKET = "nectar-originals";

export interface RequestLotAssetUploadInput {
  lotId: string;
  originalFilename: string;
  contentType: string;
}

/**
 * Step 1 of 2. No Asset row is created yet — that happens in
 * finalizeLotAssetUpload once the client confirms the upload succeeded, so
 * a failed/abandoned upload never leaves a dangling Asset pointing at
 * nothing in the bucket (same reasoning as
 * lib/partner/workspace.ts's requestAssetUpload).
 */
export async function requestLotAssetUpload(userAccountId: string, input: RequestLotAssetUploadInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `nectar-originals/traceability/${input.lotId}/${randomUUID()}${ext ? `.${ext}` : ""}`;

  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

/**
 * Exactly one of these six shapes — mirrors Asset's own nullable FKs
 * (specific per parent, not a polymorphic parent_type/parent_id pair,
 * ADR-020 decision 8). "lot" also covers Receiving, which has no
 * dedicated FK of its own: a receiving-stage photo documents the lot
 * ReceivingEvent just created, same as a general "photo of this lot."
 */
export type LotAssetParent =
  | { kind: "lot" }
  | { kind: "harvestEvent"; harvestEventId: string }
  | { kind: "measurement"; measurementId: string }
  | { kind: "fermentationRun"; fermentationRunId: string }
  | { kind: "dryingRun"; dryingRunId: string }
  | { kind: "sample"; sampleId: string };

export interface FinalizeLotAssetUploadInput {
  lotId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  parent: LotAssetParent;
  // T12.5 §2: required, no default — a photograph is a fact-bearing record
  // (ADR-038's reasoning, applied to Asset). Chosen at the call site
  // (app/actions/traceability.ts), never defaulted silently here.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  // T12.5 §3: defaults to the uploader's own Person, overridable — same
  // "convenience default, real override" pattern as T9.5's operatorPersonId
  // on MeasurementForm. Who took the photo and who uploaded it can differ.
  creatorPersonId?: string | null;
}

/**
 * T12.5 §4: classification defaults to `internal`, not copied from Partner
 * Workspace's `partner` constant. Every Lot in Traceability today is Néctar
 * Nómada's own production — there is no client-site coffee engagement yet
 * for SPECIMEN_AND_MATERIAL_TRACEABILITY.md §7's `partner`/`confidential`
 * client-site rule to apply to (that rule is written for apiary consulting
 * projects, which have no Lot/HarvestEvent chain of their own). `internal`
 * (visible to staff, not the public) is therefore the correct default for
 * v1. If a client-facing coffee engagement is ever added, this default
 * needs a real per-project decision, not a silent copy of this constant —
 * not built here, since no such project exists to decide it against yet.
 */
const DEFAULT_CLASSIFICATION: ClassificationLevel = "internal";

function parentData(parent: LotAssetParent, lotId: string) {
  switch (parent.kind) {
    case "lot":
      return { lotId };
    case "harvestEvent":
      return { harvestEventId: parent.harvestEventId };
    case "measurement":
      return { measurementId: parent.measurementId };
    case "fermentationRun":
      return { fermentationRunId: parent.fermentationRunId };
    case "dryingRun":
      return { dryingRunId: parent.dryingRunId };
    case "sample":
      return { sampleId: parent.sampleId };
  }
}

/**
 * Step 2 of 2. `lotId` is required on every call (even when the parent is
 * more specific, e.g. a Measurement) purely for the RBAC check and storage
 * key validation — the same "always carry lotId for scoping" convention
 * every other Lot Detail form on this page already follows.
 *
 * T12.5 §5 (offline): attachment is always a separate call from the record
 * it documents — a fermentation intervention, a measurement, a harvest
 * event all already exist before this function is ever called. Nothing
 * here requires a photo to exist before its parent record can be saved,
 * and nothing here requires the parent record to exist "freshly" — a later
 * offline-sync path can call this once connectivity returns, against a
 * parent record that was already synced earlier, with no change to this
 * function's shape.
 */
export async function finalizeLotAssetUpload(userAccountId: string, input: FinalizeLotAssetUploadInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  if (!input.storageKey.startsWith(`nectar-originals/traceability/${input.lotId}/`)) {
    throw new TraceabilityAccessError("invalid_storage_key");
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  const asset = await prisma.asset.create({
    data: {
      assetType: input.mimeType.startsWith("image/") ? "photo" : input.mimeType.startsWith("video/") ? "video" : "document",
      storageKey: input.storageKey,
      storageBucket: BUCKET,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.originalFilename,
      creatorPersonId: input.creatorPersonId ?? userAccount.personId,
      status: "approved",
      classification: DEFAULT_CLASSIFICATION,
      createdBy: userAccountId,
      provenanceClass: input.provenanceClass,
      sourceReference: input.sourceReference ?? null,
      ...parentData(input.parent, input.lotId),
    },
  });

  // C1 §3: evidentiary write (carries provenanceClass) — a field photo is
  // original evidence the same way a measurement reading is.
  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "asset.create",
    entityType: "asset",
    entityId: asset.id,
    after: asset,
    sourceInterface: "traceability.service",
  });

  return asset;
}

/**
 * Short-expiry signed GET URL for rendering an already-fetched Asset on Lot
 * Detail. No independent RBAC check here — by the time an Asset reaches
 * this function, `getLotDetail`'s own `requireLotAccess("view", ...)` has
 * already gated the whole page it's rendered on, same reasoning as every
 * other section of that aggregation (measurements, samples, sensory
 * linkage). This function is not exposed as a standalone server action.
 */
export async function getSignedUrlForAsset(storageKey: string): Promise<string> {
  return objectStorageProvider.getSignedUrl(storageKey);
}
