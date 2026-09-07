/**
 * S2 §8 verification points 4–5 — what each role is offered.
 *
 * Pure, like the comparability tests: `buildNavigation` is a function of a
 * permission set, so the interesting cases are cheap to assert exhaustively
 * and need no database.
 *
 * These assert what is *offered*, never what is *allowed*. Authorization is
 * tested where it is enforced — in the RBAC and service tests — because
 * SECURITY.md §2 is explicit that the frontend is not the boundary. A test
 * that treated a hidden link as a security guarantee would be asserting the
 * opposite of the architecture.
 */

import { describe, it, expect } from "vitest";
import { buildNavigation, buildSensoryTools, landingDestination, DEFAULT_LANDING } from "../lib/navigation";

const hrefs = (granted: string[]) => buildNavigation(new Set(granted)).map((e) => e.href);
const toolHrefs = (granted: string[]) => buildSensoryTools(new Set(granted)).map((e) => e.href);

// Approximate real profiles from lib/rbac/catalog.ts.
const FARM_OPERATOR = ["lot:view", "lot:manage", "sample:manage", "location:manage_attributes", "apiary:manage"];
const JUDGE = ["sensory:submit_assessment"];
const HEAD_JUDGE = ["sensory:submit_assessment", "sensory:manage_session", "competition:manage"];
const PLATFORM_ADMIN = [
  "lot:view", "lot:manage", "apiary:manage", "research:view",
  "sensory:manage_session", "sensory:submit_assessment", "competition:manage",
  "ai:review_suggestion", "partner:submit_data", "location:manage_attributes",
];

describe("buildNavigation", () => {
  it("§8.4 — a farm operator is not offered competition or calibration tools", () => {
    expect(toolHrefs(FARM_OPERATOR)).toEqual([]);
    // The consolidated Sensory entry is not offered either: holding no sensory
    // permission at all, there is nothing inside it for them.
    expect(hrefs(FARM_OPERATOR)).not.toContain("/sensory");
  });

  it("§8.4 — a farm operator is offered the field work they actually do", () => {
    const nav = hrefs(FARM_OPERATOR);
    expect(nav).toContain("/lots");
    expect(nav).toContain("/plots");
    expect(nav).toContain("/apiaries");
  });

  it("§8.5 — a judge sees sensory and not the farm workbench", () => {
    const nav = hrefs(JUDGE);
    expect(nav).toContain("/sensory");
    expect(nav).not.toContain("/lots");
    expect(nav).not.toContain("/apiaries");
    expect(nav).not.toContain("/research");
  });

  it("a plain judge gets the section but neither tool inside it", () => {
    // Submitting assessments is not managing sessions or competitions.
    expect(toolHrefs(JUDGE)).toEqual([]);
    // 2026-09-06: se añade "/sensory/new". Hasta entonces NADIE podía crear una
    // sesión de cata —`sensorySession.create` sólo existía en la semilla—, así
    // que el head judge tenía herramientas para dirigir una cata y ninguna para
    // empezarla.
    expect(toolHrefs(HEAD_JUDGE)).toEqual(["/competitions", "/calibration", "/sensory/new"]);
  });

  it("AI Suggestions is hidden from everyone without ai:review_suggestion", () => {
    // The failure this rule exists for: /ai was previously offered to every
    // signed-in user and answered "no access" to almost all of them.
    expect(hrefs(FARM_OPERATOR)).not.toContain("/ai");
    expect(hrefs(JUDGE)).not.toContain("/ai");
    expect(hrefs(PLATFORM_ADMIN)).toContain("/ai");
  });

  it("My Néctar is always offered — it is the viewer's own account, not a grant", () => {
    expect(hrefs([])).toEqual(["/my-nectar"]);
  });

  it("consolidates three former entries into one, and stays short on a phone", () => {
    const nav = hrefs(PLATFORM_ADMIN);
    // Competitions and Calibration are no longer top-level anywhere.
    expect(nav).not.toContain("/competitions");
    expect(nav).not.toContain("/calibration");
    // Even the most privileged viewer sees fewer entries than the fixed
    // ten-item bar this replaced.
    expect(nav.length).toBeLessThanOrEqual(8);
  });

  it("offers no destination whose permissions the viewer lacks", () => {
    // The general form of §4's rule, asserted over every entry rather than
    // spot-checked: nothing appears for an empty permission set except the
    // viewer's own account.
    expect(hrefs([])).not.toContain("/partner");
    expect(hrefs([])).not.toContain("/sensory");
    expect(hrefs(["partner:upload_media"])).toContain("/partner");
  });
});

describe("landingDestination — ADR-082", () => {
  const landing = (granted: string[]) => landingDestination(new Set(granted));

  const PARTNER = ["partner:submit_task", "partner:submit_data", "partner:upload_media"];
  const RESEARCHER = ["research:view", "research:create_measurement"];
  const APIARY_RECORDER = ["apiary:view", "colony_event:manage"];

  it("puts an operator in front of the work, not in front of their own permissions", () => {
    // The defect this replaces: every sign-in path sent everyone to
    // /my-nectar, whose first two sections are the viewer's Assignments and
    // resolved permission keys.
    expect(landing(FARM_OPERATOR)).toBe("/lots");
  });

  it("sends each role somewhere it can actually work", () => {
    expect(landing(PARTNER)).toBe("/partner");
    expect(landing(RESEARCHER)).toBe("/research");
    expect(landing(JUDGE)).toBe("/sensory");
    expect(landing(HEAD_JUDGE)).toBe("/sensory");
    expect(landing(APIARY_RECORDER)).toBe("/apiaries");
  });

  it("does not simply take the first matching nav entry", () => {
    // The distinction that makes this its own list rather than a reuse of NAV:
    // /partner precedes /lots in the menu, so a viewer holding both would land
    // in the partner workspace if landing order were menu order. A Platform
    // Admin holds every key here and belongs on operations.
    expect(buildNavigation(new Set(PLATFORM_ADMIN)).map((e) => e.href).indexOf("/partner"))
      .toBeLessThan(buildNavigation(new Set(PLATFORM_ADMIN)).map((e) => e.href).indexOf("/lots"));
    expect(landing(PLATFORM_ADMIN)).toBe("/lots");
  });

  it("never lands anyone on administration", () => {
    // NAV places /admin/users last because it is administration rather than a
    // place work happens. Arriving there would contradict that outright.
    expect(landing(PLATFORM_ADMIN)).not.toBe("/admin/users");
    expect(landing(["platform:manage_permissions", "platform:manage_users"])).toBe(DEFAULT_LANDING);
  });

  it("falls back to the account page for a viewer with no operational grant", () => {
    // A registered customer: orders and bookings live there and nowhere else.
    expect(landing([])).toBe(DEFAULT_LANDING);
    expect(landing(["classification:clear_internal"])).toBe(DEFAULT_LANDING);
  });

  it("only ever returns a destination the same viewer is offered in the nav", () => {
    // The invariant that keeps the two lists from drifting: landing somewhere
    // absent from your own menu is how a page becomes unreachable again after
    // the first navigation.
    for (const granted of [FARM_OPERATOR, PARTNER, RESEARCHER, JUDGE, HEAD_JUDGE, APIARY_RECORDER, PLATFORM_ADMIN, []]) {
      const nav = buildNavigation(new Set(granted)).map((e) => e.href);
      expect(nav).toContain(landing(granted));
    }
  });
});
