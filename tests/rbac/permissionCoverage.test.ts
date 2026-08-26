/**
 * Every permission in the catalog is checked somewhere — ADR-091.
 *
 * This codebase has now twice shipped a permission that was fully specified,
 * seeded, resolvable, and applied at **zero** call sites:
 *
 *   - ADR-062: the classification gate. Correct, stored on thirteen tables,
 *     and enforced nowhere. A gate that failed to restrict.
 *   - ADR-090: `content:*`. Granted to a real person whose job it names, and
 *     checked by no route. A grant that failed to enable.
 *
 * Opposite directions, one cause: nothing asserted that a permission has
 * anywhere to be used. Both were found by accident, months apart.
 *
 * UNENFORCED below is that inventory, made visible on purpose — the same trick
 * ADR-062 used with CLASSIFICATION_GATE_DEFERRED, which went from thirteen
 * entries to zero precisely because it was greppable and shrinking. A platform
 * mid-build legitimately has permissions ahead of their surfaces; what it
 * should not have is permissions ahead of their surfaces *and nobody counting*.
 *
 * The list may only shrink. Adding to it is a deliberate act with a reason
 * attached, not a way to make a red test green.
 */

import { describe, it, expect } from "vitest";
import { PERMISSIONS } from "../../lib/rbac/catalog";
import { scanPermissionUsage, isChecked } from "../helpers/permissionUsage";

/**
 * Permissions the catalog grants that no code path checks yet.
 *
 * Each needs a reason, and the reason should name what would remove it.
 */
const UNENFORCED: Record<string, string> = {
  "project:view": "/projects is public discovery with no gate. A permissioned project surface — distinct from the partner workspace — does not exist yet.",
  "project:manage_operations": "Same as project:view. Task and assignment management lives inside the Partner Workspace, gated on partner:* instead.",
  "platform:manage_users": "ADR-074 gated /admin/users on manage_permissions specifically, because granting a role IS managing permissions. The softer account operations this covers — deactivating, renaming — have no surface.",
  "colony_event:view": "A1 built recording, not a reading surface: colony_event:manage is checked, and viewing happens through the hive detail page which gates on apiary:view.",
};

const catalogKeys = PERMISSIONS.map((p) => `${p.resourceType}:${p.action}`);

describe("permission coverage", () => {
  const usage = scanPermissionUsage();

  it("finds the enforcement shapes that do not name a permission literally", () => {
    // Guards the scanner itself. Three of the four shapes build the key at
    // runtime, and a scanner blind to them would report twelve enforced
    // permissions as unenforced — an inventory with false entries teaches the
    // reader to ignore the inventory, which is how both original defects
    // survived.
    expect(usage.wildcardResources.has("research")).toBe(true); // can(user, action, "research", ...)
    expect(usage.wildcardResources.has("specimen")).toBe(true); // can(user, action, "specimen", ...)
    expect(usage.wildcardResources.has("classification")).toBe(true); // permissionKey("classification", `clear_${...}`)
    expect(usage.exact.has("sensory:submit_assessment")).toBe(true); // literal permissionKey
    expect(usage.exact.has("lot:export")).toBe(true); // combined "resource:action" literal
  });

  it("checks every permission the catalog grants, except the declared inventory", () => {
    const unchecked = catalogKeys.filter((key) => !isChecked(key, usage)).sort();
    const undeclared = unchecked.filter((key) => !(key in UNENFORCED));

    expect(
      undeclared,
      undeclared.length === 0
        ? ""
        : `\n\nThese permissions are granted by a Role Profile and checked by no code path:\n` +
          undeclared.map((k) => `  ${k}`).join("\n") +
          `\n\nEither enforce them, or add them to UNENFORCED with a reason naming\n` +
          `what would remove them. Do not add one merely to make this pass —\n` +
          `that is the state ADR-062 and ADR-090 both describe.\n`,
    ).toEqual([]);
  });

  it("keeps the inventory honest — nothing listed as unenforced is actually enforced", () => {
    // The half that makes the list shrink. Without this, an entry stays
    // forever after the surface it was waiting for gets built, and the
    // inventory slowly becomes fiction.
    const wrongly = Object.keys(UNENFORCED).filter((key) => isChecked(key, usage)).sort();
    expect(
      wrongly,
      wrongly.length === 0
        ? ""
        : `\n\nThese are listed as unenforced but ARE checked now — remove them from\n` +
          `UNENFORCED:\n` + wrongly.map((k) => `  ${k}`).join("\n") + "\n",
    ).toEqual([]);
  });

  it("lists only permissions that exist in the catalog", () => {
    // A renamed or deleted permission must not leave a ghost entry behind.
    const ghosts = Object.keys(UNENFORCED).filter((key) => !catalogKeys.includes(key));
    expect(ghosts).toEqual([]);
  });

  it("records how much of the catalog is actually reachable", () => {
    // Not a threshold to game — a number that should be read when it moves.
    // Eight of thirty-eight is not a failure, it is a platform mid-build with
    // an honest count of what it has granted ahead of building.
    const enforced = catalogKeys.filter((key) => isChecked(key, usage));
    expect(enforced.length + Object.keys(UNENFORCED).length).toBe(catalogKeys.length);
  });
});
