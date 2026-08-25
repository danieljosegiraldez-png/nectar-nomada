/**
 * What counts as a local database — ADR-084.
 *
 * Two guards depend on this answer: `tests/setup.ts`, which refuses to run the
 * suite against production, and `scripts/dev-guard.ts`, which refuses to start
 * the dev server there. Both refusals are only as good as this predicate, and
 * neither can be exercised in-process without tearing down the environment the
 * suite is running in — so the rule itself is tested here.
 */

import { describe, it, expect } from "vitest";
import { hostOf, isLocalDatabaseUrl } from "../lib/databaseHost";

const NEON = "postgresql://user:pw@ep-winter-queen-axks64j1-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require";
const LOCAL = "postgresql://postgres@127.0.0.1:55433/nectar_test";

describe("isLocalDatabaseUrl", () => {
  it("accepts the loopback forms a local cluster is reached by", () => {
    expect(isLocalDatabaseUrl(LOCAL)).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://postgres@localhost:5432/dev")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://postgres@[::1]:5432/dev")).toBe(true);
    expect(isLocalDatabaseUrl("postgresql://postgres@0.0.0.0:5432/dev")).toBe(true);
  });

  it("rejects the production endpoint", () => {
    expect(isLocalDatabaseUrl(NEON)).toBe(false);
  });

  it("refuses what it cannot read, rather than assuming it is safe", () => {
    // The direction a guard has to fail in. "I could not parse this" is not
    // evidence of locality, and treating it as such would open the exact hole
    // the guard exists to close.
    expect(isLocalDatabaseUrl(undefined)).toBe(false);
    expect(isLocalDatabaseUrl("")).toBe(false);
    expect(isLocalDatabaseUrl("   ")).toBe(false);
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
  });

  it("is not fooled by a remote host that merely contains a local name", () => {
    // Substring matching is the obvious wrong implementation, and it would
    // pass every case above.
    expect(isLocalDatabaseUrl("postgresql://u@localhost.evil.example.com/db")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://u@127.0.0.1.evil.example.com/db")).toBe(false);
    expect(isLocalDatabaseUrl("postgresql://u@notlocalhost/db")).toBe(false);
  });

  it("treats a unix-socket URL as local, since it cannot be anything else", () => {
    expect(isLocalDatabaseUrl("postgresql:///nectar_test?host=/tmp/nn-testdb")).toBe(true);
  });
});

describe("hostOf", () => {
  it("names the host so a refusal can say what it refused", () => {
    // The message is the point: "refusing to run against a remote database"
    // without naming which one leaves the reader guessing.
    expect(hostOf(NEON)).toBe("ep-winter-queen-axks64j1-pooler.c-4.us-east-2.aws.neon.tech");
    expect(hostOf(LOCAL)).toBe("127.0.0.1");
    // Unbracketed, because `URL` hands back "[::1]" and the rule is written in
    // the form a person would type.
    expect(hostOf("postgresql://postgres@[::1]:5432/dev")).toBe("::1");
  });

  it("returns null rather than throwing on nonsense", () => {
    expect(hostOf(undefined)).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});
