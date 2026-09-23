/**
 * Slice 5 (Partner Workspace). Per DOMAIN_MODEL.md §4, this is "not a
 * separate data model — it is a role-aware view over Assignment (scope =
 * Project), Task, Asset uploads... filtered to what that partner's
 * Assignments grant." There is no PartnerWorkspace table; every function
 * here composes the existing RBAC primitives (lib/rbac/service.ts) against
 * Task/FieldSubmission/Asset.
 *
 * Visibility uses the actual `partner:*` action permissions as the view
 * gate (there is no separate `partner:view` permission in the catalog,
 * RBAC.md §5) — holding submit_task/submit_data/upload_media for this
 * project's scope, AND clearing the specific record's classification, is
 * what makes a record visible. That applies to the Project itself as well as
 * to the Tasks, submissions and assets inside it: for a long time only the
 * contents were filtered, so an uncleared partner could see an internal
 * project listed and open it to read its description (ADR-079). This is a deliberate simplification: every
 * Role Profile that can act on partner data today (Partner Field Collector,
 * Platform Admin) also holds all three action permissions together, so this
 * doesn't currently under- or over-grant visibility — splitting out a
 * dedicated view permission is a small, isolated change if a
 * submit-without-view profile is ever needed.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { resolvedPermissionKeys } from "../rbac/service";
// The classification half of the gate — ADR-079 found it missing here, then
// ADR-081 found the same omission in Sensory, so the rule now lives beside
// the other classification helpers rather than in whichever module first
// needed it. A Project is a record with a classification like any other, and
// its name and description are the sensitive parts.
import { clearsClassification } from "../rbac/scopeClassification";
import { permissionKey } from "../rbac/types";
import type { ScopeTarget } from "../rbac/types";
import { objectStorageProvider } from "../integrations/storage";

export class PartnerAccessError extends Error {}

function isVisible(grantedKeys: Set<string>, actionKey: string, classification: string): boolean {
  if (!grantedKeys.has(actionKey)) return false;
  return clearsClassification(grantedKeys, classification);
}

/**
 * Projects this user has an active project-scoped Assignment for, AND
 * whose resolved permissions for that project include at least one of the
 * `partner:*` actions — the same three-way check `getProjectWorkspace`
 * gates opening on. A platform-scoped Assignment (e.g. Platform Admin) does
 * not automatically populate this list — Partner Workspace means "projects
 * I am specifically assigned to," not a god-view; RBAC.md §3's platform-
 * contains-everything rule still applies once *inside* a given project (see
 * getProjectWorkspace), it just isn't what drives this list.
 *
 * Must not diverge from getProjectWorkspace's own gate: an earlier version
 * of this function used "has a project-scoped Assignment" as the sole
 * filter, which let a project-scoped Role Profile with no `partner:*`
 * permission (e.g. Farm Operator) see its project listed here and then hit
 * a 404 the moment it tried to open it.
 */
export async function getPartnerProjects(userAccountId: string) {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      scope: { scopeType: "project" },
    },
    include: { scope: true },
  });

  const projectIds = [
    ...new Set(assignments.map((a) => a.scope.scopeRefId).filter((id): id is string => id !== null)),
  ];
  if (projectIds.length === 0) return [];

  // Loaded up front so the classification gate below has the record to gate
  // on. A project whose row cannot be found is skipped rather than listed.
  const candidates = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    orderBy: { name: "asc" },
  });

  const visible: typeof candidates = [];
  for (const project of candidates) {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: project.id };
    const grantedKeys = await resolvedPermissionKeys(userAccountId, target);

    const holdsPartnerAction =
      grantedKeys.has(permissionKey("partner", "submit_task")) ||
      grantedKeys.has(permissionKey("partner", "submit_data")) ||
      grantedKeys.has(permissionKey("partner", "upload_media"));

    // Both halves, deliberately: the action permission says what this account
    // may do in the project, the clearance says whether it may know the
    // project exists at all (ADR-079).
    if (holdsPartnerAction && clearsClassification(grantedKeys, project.classification)) {
      visible.push(project);
    }
  }

  return visible;
}

export async function getProjectWorkspace(userAccountId: string, projectId: string) {
  const target: ScopeTarget = { scopeType: "project", scopeRefId: projectId };
  const grantedKeys = await resolvedPermissionKeys(userAccountId, target);

  const canSubmitTask = grantedKeys.has(permissionKey("partner", "submit_task"));
  const canSubmitData = grantedKeys.has(permissionKey("partner", "submit_data"));
  const canUploadMedia = grantedKeys.has(permissionKey("partner", "upload_media"));

  if (!canSubmitTask && !canSubmitData && !canUploadMedia) {
    throw new PartnerAccessError("no_project_access");
  }

  const [project, tasks, submissions, assets] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.task.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { assignedTo: { include: { person: true } } },
    }),
    prisma.fieldSubmission.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { submittedBy: { include: { person: true } }, assets: { include: { asset: true } } },
    }),
    prisma.asset.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } }),
  ]);

  // The Project is a classified record too, and its name and description are
  // the sensitive parts (ADR-079). Refusing here rather than returning a
  // stripped project: a partner who cannot clear this project should be told
  // no, not shown an empty workspace that implies the project is theirs.
  if (!clearsClassification(grantedKeys, project.classification)) {
    throw new PartnerAccessError("no_project_access");
  }

  return {
    project,
    tasks: tasks.filter((t) => isVisible(grantedKeys, permissionKey("partner", "submit_task"), t.classification)),
    submissions: submissions.filter((s) =>
      isVisible(grantedKeys, permissionKey("partner", "submit_data"), s.classification),
    ),
    assets: assets.filter((a) => isVisible(grantedKeys, permissionKey("partner", "upload_media"), a.classification)),
    canSubmitTask,
    canSubmitData,
    canUploadMedia,
  };
}

const TASK_STATUSES = ["open", "in_progress", "submitted", "completed", "blocked"] as const;
export type TaskStatusInput = (typeof TASK_STATUSES)[number];

export async function updateTaskStatus(userAccountId: string, taskId: string, status: TaskStatusInput) {
  if (!TASK_STATUSES.includes(status)) {
    throw new PartnerAccessError("invalid_status");
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new PartnerAccessError("task_not_found");

  const target: ScopeTarget = { scopeType: "project", scopeRefId: task.projectId };
  const grantedKeys = await resolvedPermissionKeys(userAccountId, target);
  if (!isVisible(grantedKeys, permissionKey("partner", "submit_task"), task.classification)) {
    throw new PartnerAccessError("no_task_access");
  }

  return prisma.task.update({ where: { id: taskId }, data: { status } });
}

export interface CreateFieldSubmissionInput {
  projectId: string;
  taskId?: string | null;
  title: string;
  notes: string;
}

/**
 * Partner-authored submissions are always created at `classification:
 * 'partner'` — not user-selectable. Letting a partner pick a classification
 * level (including one they themselves can't see) would be a confusing,
 * unnecessary escalation surface; reclassifying content upward is an
 * admin/Research-Lead operation, not built in this slice.
 */
export async function createFieldSubmission(userAccountId: string, input: CreateFieldSubmissionInput) {
  if (!input.title.trim() || !input.notes.trim()) {
    throw new PartnerAccessError("invalid_submission");
  }

  const target: ScopeTarget = { scopeType: "project", scopeRefId: input.projectId };
  const grantedKeys = await resolvedPermissionKeys(userAccountId, target);
  if (!isVisible(grantedKeys, permissionKey("partner", "submit_data"), "partner")) {
    throw new PartnerAccessError("no_project_access");
  }

  return prisma.fieldSubmission.create({
    data: {
      projectId: input.projectId,
      taskId: input.taskId ?? null,
      submittedByUserAccountId: userAccountId,
      title: input.title.trim(),
      notes: input.notes.trim(),
      classification: "partner",
    },
  });
}

export interface RequestAssetUploadInput {
  projectId: string;
  originalFilename: string;
  contentType: string;
}

/**
 * Step 1 of 2 for a media upload. Returns a presigned PUT URL the browser
 * uploads directly to R2 (lib/integrations/storage) — the Next.js server
 * never holds the file bytes. `storageKey` follows DATA_ARCHITECTURE.md §5's
 * convention. No Asset row is created yet; that happens in
 * finalizeAssetUpload once the client confirms the upload succeeded, so a
 * failed/abandoned upload never leaves a dangling Asset record pointing at
 * nothing in the bucket.
 */
export async function requestAssetUpload(userAccountId: string, input: RequestAssetUploadInput) {
  const target: ScopeTarget = { scopeType: "project", scopeRefId: input.projectId };
  const grantedKeys = await resolvedPermissionKeys(userAccountId, target);
  if (!isVisible(grantedKeys, permissionKey("partner", "upload_media"), "partner")) {
    throw new PartnerAccessError("no_project_access");
  }

  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `nectar-originals/partner/${input.projectId}/${randomUUID()}${ext ? `.${ext}` : ""}`;

  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });

  return { uploadUrl, storageKey };
}

export interface FinalizeAssetUploadInput {
  projectId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  // T12.5: same bug T9.5 fixed for operatorPersonId, caught here before it
  // shipped further — the field existed (creatorPersonId is a real Person
  // FK, structurally distinct from createdBy's UserAccount FK) but no
  // caller could ever reach a value other than the uploader. Who took the
  // photograph and who uploaded it are different facts (a field technician
  // photographs a site, a partner uploads it that evening); default to the
  // uploader's own Person (the common case, no extra tap), overridable.
  creatorPersonId?: string | null;
}

const BUCKET = "nectar-originals";

export async function finalizeAssetUpload(userAccountId: string, input: FinalizeAssetUploadInput) {
  const target: ScopeTarget = { scopeType: "project", scopeRefId: input.projectId };
  const grantedKeys = await resolvedPermissionKeys(userAccountId, target);
  if (!isVisible(grantedKeys, permissionKey("partner", "upload_media"), "partner")) {
    throw new PartnerAccessError("no_project_access");
  }
  if (!input.storageKey.startsWith(`nectar-originals/partner/${input.projectId}/`)) {
    throw new PartnerAccessError("invalid_storage_key");
  }
  await exigirPersonaPermitida(userAccountId, input.creatorPersonId, [{ projectId: input.projectId }]);

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
      projectId: input.projectId,
      status: "approved",
      classification: "partner",
      createdBy: userAccountId,
      // T12.5: Partner Workspace uploads predate ADR-038's provenance
      // discipline reaching Asset — a partner-submitted photo is an
      // original record of what the partner observed at their site, not a
      // measurement, so original_record rather than measured_fact.
      provenanceClass: "original_record",
    },
  });

  return asset;
}

export async function getAssetViewUrl(userAccountId: string, assetId: string): Promise<string> {
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });

  if (asset.projectId) {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: asset.projectId };
    const grantedKeys = await resolvedPermissionKeys(userAccountId, target);
    if (!isVisible(grantedKeys, permissionKey("partner", "upload_media"), asset.classification)) {
      throw new PartnerAccessError("no_asset_access");
    }
  }

  return objectStorageProvider.getSignedUrl(asset.storageKey);
}
