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
  { resourceType: "sensory", action: "manage_session", description: "Create/manage sessions, flights, and blind samples; compute panel results." },

  { resourceType: "blind_mapping", action: "view", description: "View the real identity behind a blind-coded sample (RBAC.md §7)." },

  { resourceType: "ai", action: "review_suggestion", description: "Review AI-generated suggestions (accept/reject/modify) — AI_GOVERNANCE.md §4." },

  { resourceType: "competition", action: "manage", description: "Create editions/categories/entries, assign judges, finalize results, and declare awards." },

  // Phase 1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md §26) —
  // deliberately not reusing research:create_measurement: an operational
  // fermentation/drying reading is not research evidence until Research OS
  // explicitly adopts it, and overloading that permission would blur the
  // boundary COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §J insists on
  // keeping sharp (Operational Measurement != Approved Research Evidence).
  { resourceType: "lot", action: "manage", description: "Create/transform lots, record measurements, fermentation/drying/storage runs." },
  { resourceType: "lot", action: "view", description: "View lot detail, lineage, and measurements." },
  { resourceType: "sample", action: "manage", description: "Create samples, including from a traceable lot." },

  // A1 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md §3) — a new
  // subject, not folded into `lot`: Hive/Colony are not Lots (§2), and the
  // apiary vertical has its own dependency chain, separate from coffee's
  // traceability schema.
  { resourceType: "apiary", action: "manage", description: "Create/manage hives and colonies, and record apiary field data." },
  { resourceType: "apiary", action: "view", description: "View hive/colony detail." },

  // A7 (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md) — a narrower
  // permission than apiary:manage, specifically so a trainee (competence-
  // gated, not permission-gated by design intent) can log ColonyEvent
  // entries without also being able to create a formal Inspection.
  // recordColonyEvent accepts apiary:manage OR colony_event:manage;
  // recordInspection accepts apiary:manage only.
  { resourceType: "colony_event", action: "manage", description: "Record ColonyEvent entries (feeding/treatment/passing observation) without full apiary:manage." },
  { resourceType: "colony_event", action: "view", description: "View ColonyEvent entries." },

  // F1 (docs/implementation/30_F1_OPERACION_FINCA_ESQUEMA.md) — editing a
  // Location's own stable terroir attributes (§1) and subdividing it into
  // a microlot (§2) is a different authority than recording a fact under
  // an existing Location: it edits the parent record itself, not a child
  // row, so it gets its own permission rather than folding into lot:manage.
  { resourceType: "location", action: "manage_attributes", description: "Edit a Location's terroir attributes (sun, shade, altitude range, slope, soil, plant spacing, description) and create microlots beneath it." },

  // F1 §3/§5 — a Specimen is a standing land asset (a tracked tree, or a
  // broca trap modeled as a Specimen per direct product-owner decision),
  // not a Lot in the processing-chain sense — same reasoning A1 used to
  // give Apiary its own permission instead of reusing lot:manage.
  { resourceType: "specimen", action: "manage", description: "Create/manage Specimens and record SpecimenObservations." },
  { resourceType: "specimen", action: "view", description: "View Specimen detail and observation history." },

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
      // Slice 7 (AI) — reviewing a data-completeness suggestion and
      // deciding whether to act on it is exactly the kind of non-developer
      // collaborator task this profile exists for (RBAC.md §5).
      ["ai", "review_suggestion"],
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
      // Slice 5 (DECISIONS.md ADR-029) — the classification level literally
      // named "partner" exists for exactly this profile to clear. Without
      // it, a Partner Field Collector could see nothing above `public` on
      // their own assigned project, which defeats the purpose of a
      // project-scoped Assignment. They still cannot clear
      // internal/confidential/trade_secret — those stay admin/research-only
      // even on a project the partner is assigned to.
      ["classification", "clear_partner"],
    ],
  },
  {
    name: "Sensory Judge",
    description:
      "Submit assessments within an assigned judging session only. Deliberately excludes " +
      "classification:clear_* and blind_mapping:view — a judge's resolved permissions cannot reach the " +
      "blind-code mapping (RBAC.md §7), regardless of what the UI shows.",
    permissions: [["sensory", "submit_assessment"]],
  },
  {
    name: "Sensory Head Judge",
    description:
      "Runs a judging session: manages sessions/flights/blind samples, reveals blind-coded sample " +
      "identity, computes panel results, and can also submit assessments. RBAC.md §7's independent " +
      "authority — distinct from Sensory Judge specifically so the blind mapping isn't reachable by " +
      "every judge on the panel.",
    permissions: [
      ["sensory", "manage_session"],
      ["sensory", "submit_assessment"],
      ["blind_mapping", "view"],
      ["classification", "clear_internal"],
    ],
  },
  {
    name: "Farm Operator",
    description:
      "Create/transform lots and record measurements, fermentation/drying/storage runs, and samples " +
      "within an assigned project or location. Also covers apiary (hives/colonies, A1) — extending " +
      "this profile rather than adding a parallel one, since the same person (e.g. Kenneth) often " +
      "works both coffee and apiary at one site (22_APIARY_V1_SCOPING_REPORT.md §6's draft ADR " +
      "amendment). Intended scope: project or location — the same Assignment mechanism already " +
      "proven for Partner Field Collector, since a real operator often works across multiple " +
      "projects at one physical site rather than one project alone " +
      "(docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md §26, decision record). No approval " +
      "permissions.",
    permissions: [
      ["lot", "manage"],
      ["lot", "view"],
      ["sample", "manage"],
      ["apiary", "manage"],
      ["apiary", "view"],
      // F1 — same reasoning as apiary:manage/view above: Bob and Sherry
      // are exactly who records Location terroir attributes, creates
      // microlots, and tracks Specimens/traps in the field.
      ["location", "manage_attributes"],
      ["specimen", "manage"],
      ["specimen", "view"],
      // Same classification grant as Partner Field Collector (DECISIONS.md
      // ADR-029 decision 2) — an operator on their own assigned project
      // still cannot clear internal/confidential/trade_secret.
      ["classification", "clear_partner"],
    ],
  },
  {
    name: "Project Viewer",
    description:
      "Read-only visibility into a project's operational and apiary data — no manage permissions at " +
      "all. Intended scope: project or location, same as Farm Operator, but for a stakeholder who " +
      "needs to see records rather than record them (A7, docs/implementation/22_APIARY_V1_SCOPING_REPORT.md).",
    permissions: [
      ["project", "view"],
      ["lot", "view"],
      ["apiary", "view"],
      ["specimen", "view"],
    ],
  },
  {
    name: "Apiary Colony Event Recorder",
    description:
      "Record ColonyEvent entries (feeding/treatment/passing observation) and view hive/colony detail — " +
      "deliberately excludes apiary:manage, so this profile cannot create an Inspection or a Hive/Colony. " +
      "A7's own case: a trainee who logs routine events but records a formal Inspection only once " +
      "accompanied enough times to be trusted with one — a competence gate documented on the Assignment, " +
      "not expressed by a different permission tier here.",
    permissions: [
      ["apiary", "view"],
      ["colony_event", "manage"],
    ],
  },
] as const;
