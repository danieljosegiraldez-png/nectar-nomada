/**
 * Ticket A6 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md — "A6:
 * Photo attachment"). Photo/asset attachment for Hive, Colony, Inspection,
 * ColonyEvent — mirrors lib/traceability/media.ts's request/finalize
 * round trip verbatim, against the apiary RBAC gate (requireApiaryAccess)
 * instead of requireLotAccess. A honeyBatchId is unnecessary here: a
 * HoneyBatch is a Lot (§2), so requestLotAssetUpload/finalizeLotAssetUpload
 * already cover it.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { requireApiaryAccess, ApiaryAccessError } from "./hives";
import type { ClassificationLevel, ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";

const BUCKET = "nectar-originals";
const DEFAULT_CLASSIFICATION: ClassificationLevel = "internal";

/**
 * Exactly one of these four shapes — mirrors Asset's own nullable FKs
 * (specific per parent, not a polymorphic parent_type/parent_id pair,
 * ADR-020 decision 8), same discipline as LotAssetParent.
 */
export type ApiaryAssetParent =
  | { kind: "hive"; hiveId: string }
  | { kind: "colony"; colonyId: string }
  | { kind: "inspection"; inspectionId: string }
  | { kind: "colonyEvent"; colonyEventId: string };

function parentData(parent: ApiaryAssetParent) {
  switch (parent.kind) {
    case "hive":
      return { hiveId: parent.hiveId };
    case "colony":
      return { colonyId: parent.colonyId };
    case "inspection":
      return { inspectionId: parent.inspectionId };
    case "colonyEvent":
      return { colonyEventId: parent.colonyEventId };
  }
}

async function resolveScope(parent: ApiaryAssetParent): Promise<{ projectId?: string | null; locationId?: string | null }> {
  switch (parent.kind) {
    case "hive": {
      const hive = await prisma.hive.findUnique({ where: { id: parent.hiveId } });
      if (!hive) throw new ApiaryAccessError("hive_not_found");
      return { projectId: hive.projectId, locationId: hive.locationId };
    }
    case "colony": {
      const colony = await prisma.colony.findUnique({ where: { id: parent.colonyId }, include: { hive: true } });
      if (!colony) throw new ApiaryAccessError("colony_not_found");
      return { projectId: colony.hive.projectId, locationId: colony.hive.locationId };
    }
    case "inspection": {
      const inspection = await prisma.inspection.findUnique({
        where: { id: parent.inspectionId },
        include: { colony: { include: { hive: true } } },
      });
      if (!inspection) throw new ApiaryAccessError("inspection_not_found");
      return { projectId: inspection.colony.hive.projectId, locationId: inspection.colony.hive.locationId };
    }
    case "colonyEvent": {
      const colonyEvent = await prisma.colonyEvent.findUnique({
        where: { id: parent.colonyEventId },
        include: { colony: { include: { hive: true } } },
      });
      if (!colonyEvent) throw new ApiaryAccessError("colony_event_not_found");
      return { projectId: colonyEvent.colony.hive.projectId, locationId: colonyEvent.colony.hive.locationId };
    }
  }
}

export interface RequestApiaryAssetUploadInput {
  parent: ApiaryAssetParent;
  originalFilename: string;
  contentType: string;
}

/** Step 1 of 2 — same "no Asset row until the client confirms the upload" reasoning as requestLotAssetUpload. */
export async function requestApiaryAssetUpload(userAccountId: string, input: RequestApiaryAssetUploadInput) {
  const scope = await resolveScope(input.parent);
  await requireApiaryAccess(userAccountId, "manage", [scope]);

  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `nectar-originals/apiary/${input.parent.kind}/${randomUUID()}${ext ? `.${ext}` : ""}`;

  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

export interface FinalizeApiaryAssetUploadInput {
  parent: ApiaryAssetParent;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  // Required, no default (ADR-038's own reasoning, applied to Asset by
  // T12.5 already) — chosen at the call site, never defaulted here.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  creatorPersonId?: string | null;
}

/** Step 2 of 2. */
export async function finalizeApiaryAssetUpload(userAccountId: string, input: FinalizeApiaryAssetUploadInput) {
  const scope = await resolveScope(input.parent);
  await requireApiaryAccess(userAccountId, "manage", [scope]);

  if (!input.storageKey.startsWith(`nectar-originals/apiary/${input.parent.kind}/`)) {
    throw new ApiaryAccessError("invalid_storage_key");
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  // A9.3 — hasta el 2026-09-07 este archivo no auditaba NADA: era el único
  // camino de escritura del apiario sin rastro, y las fotos de una visita son
  // justo lo que después se discute. Va con `tx` desde el principio, como todo
  // lo demás del repositorio desde la misma fecha.
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
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
        ...parentData(input.parent),
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "asset.create",
        entityType: "asset",
        entityId: asset.id,
        after: { id: asset.id, assetType: asset.assetType, parent: input.parent },
        sourceInterface: "apiary.media",
      },
      tx,
    );

    return asset;
  });
}
