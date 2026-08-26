/**
 * `is_complete_set()` from scripts/backup/pg-tools.sh — ADR-089.
 *
 * The retention pruner keeps the newest N backup directories by name. A run
 * that fails partway used to leave a directory behind, and that directory
 * carries the newest name of all — so it would take a retention slot and
 * evict a real backup. Two such directories were found: the scheduled run of
 * 2026-08-24, and a manual run whose dump died with "No route to host".
 *
 * This predicate is what stops that, so it is worth testing on its own. Run as
 * shell for the reason tests/backup/libpqUrl.test.ts gives: a TypeScript
 * restatement could agree with itself while the script did something else.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TOOLS = join(__dirname, "..", "..", "scripts", "backup", "pg-tools.sh");

let root: string;

/** Calls the real shell function, and reports its exit status as a boolean. */
function isCompleteSet(dir: string): boolean {
  const result = execFileSync(
    "bash",
    ["-c", `. "${TOOLS}" >/dev/null 2>&1; if is_complete_set "$1"; then echo yes; else echo no; fi`, "_", dir],
    { encoding: "utf8" },
  );
  return result.trim() === "yes";
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "nn-set-"));

  // A finished set: the manifest is written last, so its presence is the
  // signal.
  mkdirSync(join(root, "complete"));
  writeFileSync(join(root, "complete", "MANIFEST.txt"), "sizes:\n  1.1M neondb.dump\n");
  writeFileSync(join(root, "complete", "neondb.dump"), "x");

  // What the 2026-08-24 scheduled failure left: correctly named, entirely
  // empty.
  mkdirSync(join(root, "2026-08-24T140556Z"));

  // What the "No route to host" failure left: a directory with a zero-byte
  // dump and no manifest. The more dangerous shape, because it looks
  // populated.
  mkdirSync(join(root, "partial"));
  writeFileSync(join(root, "partial", "neondb.dump"), "");
  writeFileSync(join(root, "partial", "rowcounts.tsv"), "a\t1\n");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("is_complete_set", () => {
  it("accepts a set that carries a manifest", () => {
    expect(isCompleteSet(join(root, "complete"))).toBe(true);
  });

  it("rejects the empty directory a failed scheduled run leaves", () => {
    expect(isCompleteSet(join(root, "2026-08-24T140556Z"))).toBe(false);
  });

  it("rejects a partial set that has files but no manifest", () => {
    // The one that matters most: a 0-byte dump alongside a row census looks
    // like a backup to anything counting directories, and restores nothing.
    expect(isCompleteSet(join(root, "partial"))).toBe(false);
  });

  it("rejects a path that does not exist, rather than erroring", () => {
    // The pruner calls this on whatever `find` handed it; a directory removed
    // between the two must be a plain "no".
    expect(isCompleteSet(join(root, "nope"))).toBe(false);
  });

  it("rejects an empty argument", () => {
    // `is_complete_set ""` must not degrade into testing the current
    // directory, which on a developer's machine would answer yes at random.
    expect(isCompleteSet("")).toBe(false);
  });
});
