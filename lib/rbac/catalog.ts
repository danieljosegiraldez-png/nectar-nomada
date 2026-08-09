/**
 * Seed-managed Permission and Role Profile catalog — RBAC.md §5.
 * Single source of truth shared by prisma/seed.ts (writes these to the
 * database) and the RBAC unit tests (build fixtures from the same data so
 * tests can't silently drift from what's actually seeded).
 */

export interface PermissionDef {
  resourceType: string;
  action: string;
  description: string;
}

export const PERMISSIONS: readonly PermissionDef[] = [
  { resourceType: "platform", action: "manage_users", description: "Invite, suspend, and deactivate user accounts." },
  { resourceType: "platform", action: "manage_permissions", description: "Create Assignments and manage Role Profiles." },

  { resourceType: "content", action: "view", description: "View non-public story/content drafts." },
  { resourceType: "content", action: "create", description: "Create story/content drafts." },
  { resourceType: "content", action: "edit", description: "Edit story/content drafts." },
  { resourceType: "content", action: "publish", description: "Publish story/content to the public site." },

  { resourceType: "project", action: "view", description: "View non-public project details." },
  { resourceType: "project", action: "manage_operations", description: "Manage project tasks, assignments, and operational data." },

  { resourceType: "research", action: "view", description: "View research protocols, evidence, and measurements." },
  { resourceType: "research", action: "create_measurement", description: "Record a new measurement or observation." },
  { resourceType: "research", action: "create_evidence", description: "Attach evidence to a research record." },
  { resourceType: "research", action: "approve_protocol", description: "Approve a protocol version." },

  { resourceType: "partner", action: "submit_task", description: "Submit or update an assigned task." },
  { resourceType: "partner", action: "submit_data", description: "Submit field data for a project." },
  { resourceType: "partner", action: "upload_media", description: "Upload media assets for a project." },

  { resourceType: "sensory", action: "submit_assessment", description: "Submit a sensory assessment within a judging session." },

  { resourceType: "classification", action: "clear_registered", description: "Access records classified Registered." },
  { resourceType: "classification", action: "clear_partner", description: "Access records classified Partner." },
  { resourceType: "classification", action: "clear_internal", description: "Access records classified Internal." },
  { resourceType: "classification", action: "clear_confidential", description: "Access records classified Confidential." },
  { resourceType: "classification", action: "clear_trade_secret", description: "Access records classified Trade Secret." },
] as const;

export interface RoleProfileDef {
  name: string;
  description: string;
  permissions: ReadonlyArray<readonly [resourceType: string, action: string]>;
}

export const ROLE_PROFILES: readonly RoleProfileDef[] = [
  {
    name: "Platform Admin",
    description: "Full platform access. Intended scope: platform.",
    permissions: PERMISSIONS.map((p) => [p.resourceType, p.action] as const),
  },
  {
    name: "Content/Ops Coordinator",
    description:
      "Story/content and project-operations permissions, explicitly excluding research-approval and " +
      "competition-result permissions. Satisfies the non-developer collaborator requirement from day one.",
    permissions: [
      ["content", "view"],
      ["content", "create"],
      ["content", "edit"],
      ["content", "publish"],
      ["project", "view"],
      ["project", "manage_operations"],
    ],
  },
  {
    name: "Research Lead",
    description: "Full research module permissions within an assigned project, including protocol approval.",
    permissions: [
      ["research", "view"],
      ["research", "create_measurement"],
      ["research", "create_evidence"],
      ["research", "approve_protocol"],
      ["classification", "clear_internal"],
      ["classification", "clear_confidential"],
    ],
  },
  {
    name: "Research Contributor",
    description: "Create/edit measurements and evidence within an assigned project. No approve/publish.",
    permissions: [
      ["research", "view"],
      ["research", "create_measurement"],
      ["research", "create_evidence"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Partner Field Collector",
    description: "Task/data submission and media upload within an assigned project or location. No approval permissions.",
    permissions: [
      ["partner", "submit_task"],
      ["partner", "submit_data"],
      ["partner", "upload_media"],
    ],
  },
  {
    name: "Sensory Judge",
    description:
      "Submit assessments within an assigned judging session only. Deliberately excludes " +
      "classification:clear_* — a judge's resolved permissions cannot reach the blind-code mapping " +
      "(RBAC.md §7), regardless of what the UI shows.",
    permissions: [["sensory", "submit_assessment"]],
  },
] as const;
