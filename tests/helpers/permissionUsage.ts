/**
 * Which permissions the application actually checks — ADR-091.
 *
 * Finding out is harder than grepping for a string, because three of the four
 * enforcement shapes in this codebase do not name the permission literally:
 *
 *   1. `permissionKey("sensory", "submit_assessment")` — both parts literal.
 *   2. `can(user, action, "specimen", target, cls)` — the resource is literal,
 *      the *action* is a variable (`requireSpecimenAccess` passes "manage" or
 *      "view" through). Enforced, but no `specimen:manage` string exists.
 *   3. `permissionKey("classification", `clear_${level}`)` — the action is
 *      built at runtime from the record's classification.
 *   4. `"lot:export"` — a combined literal, used by navigation and by pages
 *      deciding what to offer.
 *
 * A scanner that only saw shape 1 and 4 would report twelve enforced
 * permissions as unenforced. That is worse than no scanner: an inventory with
 * false entries in it teaches the reader to ignore the inventory, which is
 * exactly how the two defects this exists to catch survived.
 *
 * So shapes 2 and 3 contribute a *wildcard* for their resource type: the
 * resource is provably gated, and which action is decided at runtime. That is
 * the honest reading, and it is deliberately generous — this scanner is meant
 * to catch a permission with no enforcement anywhere, not to police precision.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const SCANNED = ["lib", "app", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "generated", ".git"]);
// The catalog declares permissions; it does not check them. Counting it would
// make every permission look enforced by virtue of existing.
const SKIP_FILES = [join("lib", "rbac", "catalog.ts")];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

export interface PermissionUsage {
  /** Exact `resource:action` keys found as literals. */
  exact: Set<string>;
  /** Resource types gated with a runtime-decided action. */
  wildcardResources: Set<string>;
}

export function scanPermissionUsage(): PermissionUsage {
  const exact = new Set<string>();
  const wildcardResources = new Set<string>();

  const files = SCANNED.flatMap((d) => walk(join(ROOT, d))).filter(
    (f) => !SKIP_FILES.some((skip) => f.endsWith(skip)),
  );

  for (const file of files) {
    // Collapsed so a call split across lines reads the same as one on a single
    // line. Formatting is not a security property, and a scanner that depends
    // on it fails silently the next time someone runs a formatter.
    const src = readFileSync(file, "utf8").replace(/\s+/g, " ");

    // Shape 1: permissionKey("resource", "action")
    for (const m of src.matchAll(/permissionKey\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g)) {
      exact.add(`${m[1]}:${m[2]}`);
    }

    // Shape 3: permissionKey("resource", `...${...}`) — action built at runtime.
    for (const m of src.matchAll(/permissionKey\(\s*"([^"]+)"\s*,\s*`[^`]*\$\{/g)) {
      wildcardResources.add(m[1]!);
    }

    // Shape 2a: can(actor, "action", "resource", ...) — both literal.
    for (const m of src.matchAll(/\bcan\(\s*[^,]+,\s*"([^"]+)"\s*,\s*"([^"]+)"/g)) {
      exact.add(`${m[2]}:${m[1]}`);
    }

    // Shape 2b: can(actor, action, "resource", ...) — action is an identifier.
    for (const m of src.matchAll(/\bcan\(\s*[^,]+,\s*([A-Za-z_$][\w$]*)\s*,\s*"([^"]+)"/g)) {
      wildcardResources.add(m[2]!);
    }

    // Shape 4: a combined "resource:action" literal.
    for (const m of src.matchAll(/"([a-z_]+):([a-z_]+)"/g)) {
      exact.add(`${m[1]}:${m[2]}`);
    }
  }

  return { exact, wildcardResources };
}

/** True when this permission is enforced somewhere, by any of the four shapes. */
export function isChecked(key: string, usage: PermissionUsage): boolean {
  if (usage.exact.has(key)) return true;
  const resource = key.split(":")[0]!;
  return usage.wildcardResources.has(resource);
}
