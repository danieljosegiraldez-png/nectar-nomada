import { describe, expect, it } from "vitest";
import { can, resolvePermissions, scopeContains } from "../../lib/rbac/resolve";
import { ROLE_PROFILES } from "../../lib/rbac/catalog";
import type { ResolvedAssignment, ScopeTarget } from "../../lib/rbac/types";

const PROJECT_A = "11111111-1111-1111-1111-111111111111";
const PROJECT_B = "22222222-2222-2222-2222-222222222222";
const PROGRAM_X = "33333333-3333-3333-3333-333333333333";
const PROGRAM_Y = "44444444-4444-4444-4444-444444444444";
const SESSION_1 = "55555555-5555-5555-5555-555555555555";
const SESSION_2 = "66666666-6666-6666-6666-666666666666";

function roleProfile(name: string) {
  const profile = ROLE_PROFILES.find((p) => p.name === name);
  if (!profile) throw new Error(`Unknown seeded Role Profile: ${name}`);
  return profile;
}

/** Builds a ResolvedAssignment straight from the seeded catalog, exactly what the Prisma-backed loader would produce. */
function assignmentFor(roleProfileName: string, scope: ResolvedAssignment["scope"]): ResolvedAssignment {
  return {
    id: `test-assignment-${roleProfileName}-${scope.scopeType}-${scope.scopeRefId}`,
    scope,
    permissions: roleProfile(roleProfileName).permissions,
  };
}

// ---------------------------------------------------------------------------
// Scope containment — RBAC.md §3. The "narrow, never broaden" guarantee.
// ---------------------------------------------------------------------------

describe("scopeContains", () => {
  it("platform scope contains every target", () => {
    const platform = { scopeType: "platform" as const, scopeRefId: null };
    expect(scopeContains(platform, { scopeType: "project", scopeRefId: PROJECT_A })).toBe(true);
    expect(scopeContains(platform, { scopeType: "session", scopeRefId: SESSION_1 })).toBe(true);
  });

  it("program scope contains its child project", () => {
    const program = { scopeType: "program" as const, scopeRefId: PROGRAM_X };
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A, parentProgramId: PROGRAM_X };
    expect(scopeContains(program, target)).toBe(true);
  });

  it("program scope does NOT contain a project under a different program", () => {
    const program = { scopeType: "program" as const, scopeRefId: PROGRAM_X };
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_B, parentProgramId: PROGRAM_Y };
    expect(scopeContains(program, target)).toBe(false);
  });

  it("program scope does NOT contain a leaf scope even if it belongs to a project under that program", () => {
    const program = { scopeType: "program" as const, scopeRefId: PROGRAM_X };
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1, parentProgramId: PROGRAM_X };
    expect(scopeContains(program, target)).toBe(false);
  });

  it("project scope does NOT broaden to its parent program", () => {
    const project = { scopeType: "project" as const, scopeRefId: PROJECT_A };
    const target: ScopeTarget = { scopeType: "program", scopeRefId: PROGRAM_X };
    expect(scopeContains(project, target)).toBe(false);
  });

  it("project scope does NOT contain a sibling project", () => {
    const project = { scopeType: "project" as const, scopeRefId: PROJECT_A };
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_B };
    expect(scopeContains(project, target)).toBe(false);
  });

  it("leaf scopes (e.g. session) match only on exact identity", () => {
    const session = { scopeType: "session" as const, scopeRefId: SESSION_1 };
    expect(scopeContains(session, { scopeType: "session", scopeRefId: SESSION_1 })).toBe(true);
    expect(scopeContains(session, { scopeType: "session", scopeRefId: SESSION_2 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Absence of a matching Assignment is a deny, never a fallback.
// ---------------------------------------------------------------------------

describe("can — default deny", () => {
  it("denies when there are no assignments at all", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can([], "view", "research", target, "public")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Per-Role-Profile positive and negative cases — RBAC.md §9 (mandatory).
// ---------------------------------------------------------------------------

describe("Platform Admin", () => {
  const assignments = [assignmentFor("Platform Admin", { scopeType: "platform", scopeRefId: null })];

  it("positive: can manage users anywhere, including an arbitrary project", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "manage_users", "platform", target, "public")).toBe(true);
  });

  it("positive: clears trade_secret classification everywhere", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "view", "research", target, "trade_secret")).toBe(true);
  });
});

describe("Research Lead — scoped to Project A", () => {
  const assignments = [assignmentFor("Research Lead", { scopeType: "project", scopeRefId: PROJECT_A })];

  it("positive: can approve a protocol within Project A", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "approve_protocol", "research", target, "public")).toBe(true);
  });

  it("positive: clears internal and confidential classification within Project A", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "view", "research", target, "internal")).toBe(true);
    expect(can(assignments, "view", "research", target, "confidential")).toBe(true);
  });

  it("negative: cannot approve a protocol in a different project (scope does not broaden)", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_B };
    expect(can(assignments, "approve_protocol", "research", target, "public")).toBe(false);
  });

  it("negative: cannot manage platform users — the profile never granted that permission", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "manage_users", "platform", target, "public")).toBe(false);
  });

  it("negative: does not clear trade_secret classification (not in this profile's grant)", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "view", "research", target, "trade_secret")).toBe(false);
  });
});

describe("Research Contributor — scoped to Project A", () => {
  const assignments = [assignmentFor("Research Contributor", { scopeType: "project", scopeRefId: PROJECT_A })];

  it("positive: can create a measurement within Project A", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "create_measurement", "research", target, "public")).toBe(true);
  });

  it("negative: cannot approve a protocol (not granted to Contributor, unlike Lead)", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "approve_protocol", "research", target, "public")).toBe(false);
  });

  it("negative: cannot create a measurement outside Project A", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_B };
    expect(can(assignments, "create_measurement", "research", target, "public")).toBe(false);
  });
});

describe("Partner Field Collector — scoped to Project A", () => {
  const assignments = [assignmentFor("Partner Field Collector", { scopeType: "project", scopeRefId: PROJECT_A })];

  it("positive: can submit field data within Project A", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "submit_data", "partner", target, "public")).toBe(true);
  });

  it("negative: has no research permissions at all", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "create_measurement", "research", target, "public")).toBe(false);
    expect(can(assignments, "approve_protocol", "research", target, "public")).toBe(false);
  });

  it("negative: cannot submit data outside Project A", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_B };
    expect(can(assignments, "submit_data", "partner", target, "public")).toBe(false);
  });

  it("positive: clears 'partner'-classified records within Project A (DECISIONS.md ADR-029 — the classification level named 'partner' exists for this profile to clear)", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "submit_data", "partner", target, "partner")).toBe(true);
  });

  it("negative: still cannot clear 'internal' or 'confidential' records, even on their own assigned project", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "submit_data", "partner", target, "internal")).toBe(false);
    expect(can(assignments, "submit_data", "partner", target, "confidential")).toBe(false);
  });
});

describe("Sensory Judge — scoped to Session 1 (blind-evaluation special case, RBAC.md §7)", () => {
  const assignments = [assignmentFor("Sensory Judge", { scopeType: "session", scopeRefId: SESSION_1 })];

  it("positive: can submit an assessment in Session 1", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(assignments, "submit_assessment", "sensory", target, "public")).toBe(true);
  });

  it("negative: cannot submit an assessment in a different session", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_2 };
    expect(can(assignments, "submit_assessment", "sensory", target, "public")).toBe(false);
  });

  it("negative: cannot view the blind-code mapping — a Judge holds no classification clearance at all, so any non-public resource (e.g. a confidential blind mapping) is denied even inside their own session", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(assignments, "submit_assessment", "sensory", target, "confidential")).toBe(false);
  });

  it("negative: cannot view the blind mapping at all — the action permission itself is absent, not merely a classification gap (RBAC.md §7 — structurally unreachable, not just hidden by the UI)", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(assignments, "view", "blind_mapping", target, "public")).toBe(false);
  });
});

describe("Sensory Head Judge — scoped to Session 1 (RBAC.md §7's independent authority)", () => {
  const assignments = [assignmentFor("Sensory Head Judge", { scopeType: "session", scopeRefId: SESSION_1 })];

  it("positive: can view the blind-code mapping within Session 1", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(assignments, "view", "blind_mapping", target, "public")).toBe(true);
  });

  it("positive: can manage the session and submit assessments within Session 1", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(assignments, "manage_session", "sensory", target, "public")).toBe(true);
    expect(can(assignments, "submit_assessment", "sensory", target, "public")).toBe(true);
  });

  it("negative: cannot view the blind-code mapping for a different session", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_2 };
    expect(can(assignments, "view", "blind_mapping", target, "public")).toBe(false);
  });

  it("positive: clears 'internal'-classified session data, unlike a plain Sensory Judge", () => {
    const target: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(assignments, "submit_assessment", "sensory", target, "internal")).toBe(true);
  });
});

describe("Content/Ops Coordinator — non-developer collaborator role, DOMAIN_MODEL.md §6", () => {
  const assignments = [assignmentFor("Content/Ops Coordinator", { scopeType: "platform", scopeRefId: null })];

  it("positive: can publish content platform-wide", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "publish", "content", target, "public")).toBe(true);
  });

  it("negative: cannot approve research protocols — explicitly excluded from this profile", () => {
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "approve_protocol", "research", target, "public")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Classification is an independent AND-gate — RBAC.md §4 step 4 / §6.
// ---------------------------------------------------------------------------

describe("classification gate", () => {
  it("a public-classification resource needs no clearance permission at all", () => {
    const assignments = [assignmentFor("Research Contributor", { scopeType: "project", scopeRefId: PROJECT_A })];
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "view", "research", target, "public")).toBe(true);
  });

  it("holding the action permission is not sufficient without the matching clearance", () => {
    // Partner Field Collector clears 'partner' (ADR-029) but not 'confidential' —
    // included here mainly to document that both gates are independently necessary.
    const assignments = [assignmentFor("Partner Field Collector", { scopeType: "project", scopeRefId: PROJECT_A })];
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    expect(can(assignments, "submit_data", "partner", target, "confidential")).toBe(false);
  });
});

describe("resolvePermissions", () => {
  it("unions permissions across multiple simultaneous assignments in different scopes (CLAUDE.md §10 worked example: Producer / Research Contributor / Judge at once)", () => {
    const assignments = [
      assignmentFor("Research Contributor", { scopeType: "project", scopeRefId: PROJECT_A }),
      assignmentFor("Sensory Judge", { scopeType: "session", scopeRefId: SESSION_1 }),
    ];

    const projectTarget: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
    const sessionTarget: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };

    expect(can(assignments, "create_measurement", "research", projectTarget, "public")).toBe(true);
    expect(can(assignments, "submit_assessment", "sensory", sessionTarget, "public")).toBe(true);
    // Neither assignment leaks into the other's scope.
    expect(can(assignments, "submit_assessment", "sensory", projectTarget, "public")).toBe(false);
    expect(can(assignments, "create_measurement", "research", sessionTarget, "public")).toBe(false);
  });

  it("returns an empty set for a target no assignment covers", () => {
    const assignments = [assignmentFor("Research Lead", { scopeType: "project", scopeRefId: PROJECT_A })];
    const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_B };
    expect(resolvePermissions(assignments, target).size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Classification AND-gate — RBAC.md §4 step 4, CLAUDE.md §10.
//
// Added by ADR-062. Until then the gate had no tests at all, which is the
// other half of why it went unenforced at every call site for so long: nothing
// failed when it was skipped, and nothing proved it worked when it wasn't.
//
// These test the mechanism, not the policy. Policy — which clearance a Farm
// Operator should hold, and what classification an operator-created Lot should
// default to — is ADR-062's open decision.
// ---------------------------------------------------------------------------

describe("classification is an independent AND-gate", () => {
  const target: ScopeTarget = { scopeType: "project", scopeRefId: PROJECT_A };
  const farmOperator = [assignmentFor("Farm Operator", { scopeType: "project", scopeRefId: PROJECT_A })];
  const platformAdmin = [assignmentFor("Platform Admin", { scopeType: "platform", scopeRefId: null })];

  it("public needs no clearance at all", () => {
    expect(can(farmOperator, "view", "lot", target, "public")).toBe(true);
  });

  it("grants at exactly the level the profile clears", () => {
    // Farm Operator holds classification:clear_partner and nothing above it.
    expect(can(farmOperator, "view", "lot", target, "partner")).toBe(true);
  });

  it("denies above the cleared level even though the action permission is held", () => {
    // The point of an AND-gate: holding lot:view is not sufficient on its own.
    // Farm Operator clears partner and internal (ADR-063) and nothing above.
    for (const level of ["confidential", "trade_secret"] as const) {
      expect(can(farmOperator, "view", "lot", target, level)).toBe(false);
    }
  });

  it("denies when the action permission is missing, whatever the clearance", () => {
    // The gate narrows; it never grants. Farm Operator holds no competition
    // permission, so no classification makes this true.
    expect(can(farmOperator, "manage", "competition", target, "public")).toBe(false);
  });

  it("Platform Admin clears every level", () => {
    const platformTarget: ScopeTarget = { scopeType: "platform", scopeRefId: null };
    for (const level of ["public", "registered", "partner", "internal", "confidential", "trade_secret"] as const) {
      expect(can(platformAdmin, "view", "lot", platformTarget, level)).toBe(true);
    }
  });

  it("an operator can reach the internal lots they create — ADR-063", () => {
    // The inconsistency this test used to pin is resolved. Every Lot defaults
    // to `internal`, and an operator who could not clear `internal` would be
    // denied the records they just wrote.
    expect(can(farmOperator, "view", "lot", target, "internal")).toBe(true);
    expect(can(farmOperator, "manage", "lot", target, "internal")).toBe(true);
  });

  it("a partner still cannot clear internal — ADR-029 decision 1 stands", () => {
    // The grant was corrected for internal roles only. Partner Field Collector
    // is an external party, and `partner.task` still holds one `internal` row
    // a partner must not see — the property ADR-029 verified live.
    const partner = [assignmentFor("Partner Field Collector", { scopeType: "project", scopeRefId: PROJECT_A })];
    expect(can(partner, "submit_data", "partner", target, "partner")).toBe(true);
    expect(can(partner, "submit_data", "partner", target, "internal")).toBe(false);
  });

  it("a colony event recorder can reach the internal sites the hives stand at — ADR-069", () => {
    // Sixteen of twenty-eight Locations are `internal`. Without the clearance
    // this profile held apiary:view and colony_event:manage and could reach
    // neither, which is the same defect ADR-063 corrected for Farm Operator.
    const recorder = [assignmentFor("Apiary Colony Event Recorder", { scopeType: "project", scopeRefId: PROJECT_A })];
    expect(can(recorder, "view", "apiary", target, "internal")).toBe(true);
    expect(can(recorder, "manage", "colony_event", target, "internal")).toBe(true);
  });

  it("the clearance did not widen what a colony event recorder may do — ADR-069", () => {
    // The real boundary for this profile is the absence of apiary:manage: no
    // Inspections, no Hives. Clearance to see internal sites must not become
    // authority to act at them, so this fails if the grant were ever widened
    // into the permission list above it.
    const recorder = [assignmentFor("Apiary Colony Event Recorder", { scopeType: "project", scopeRefId: PROJECT_A })];
    expect(can(recorder, "manage", "apiary", target, "internal")).toBe(false);
    expect(can(recorder, "manage", "apiary", target, "public")).toBe(false);
  });

  it("a judge can reach the internal sessions they are assigned to — ADR-081", () => {
    // Every SensorySession defaults to `internal`. This profile previously
    // held no clearance at all, which was invisible while lib/sensory/service
    // .ts never applied the gate; enforcing it without this grant would have
    // denied a judge every session they were assigned to, exactly as ADR-063
    // found for Farm Operator and Project Viewer.
    const judge = [assignmentFor("Sensory Judge", { scopeType: "session", scopeRefId: SESSION_1 })];
    const sessionTarget: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(judge, "submit_assessment", "sensory", sessionTarget, "public")).toBe(true);
    expect(can(judge, "submit_assessment", "sensory", sessionTarget, "internal")).toBe(true);
  });

  it("the clearance stops at internal, and never reaches the blind mapping — RBAC.md §7", () => {
    // The two halves of what ADR-081 must not have broken. §7's mechanism is
    // the mapping's own table behind blind_mapping:view — "a Judge's resolved
    // permission set genuinely cannot query the mapping" — and that is
    // untouched by any clearance grant, at any classification. The second
    // half is the narrowing the grant bought: a session restricted above
    // internal is now closed to the panel, where before the gate went
    // unapplied and every level was reachable.
    const judge = [assignmentFor("Sensory Judge", { scopeType: "session", scopeRefId: SESSION_1 })];
    const sessionTarget: ScopeTarget = { scopeType: "session", scopeRefId: SESSION_1 };
    expect(can(judge, "view", "blind_mapping", sessionTarget, "public")).toBe(false);
    expect(can(judge, "view", "blind_mapping", sessionTarget, "internal")).toBe(false);
    expect(can(judge, "submit_assessment", "sensory", sessionTarget, "confidential")).toBe(false);
    expect(can(judge, "submit_assessment", "sensory", sessionTarget, "trade_secret")).toBe(false);
  });
});
