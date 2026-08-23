/**
 * `libpq_url()` from scripts/backup/pg-tools.sh — ADR-077.
 *
 * Every psql/pg_dump path in the repository goes through this helper: the
 * backup, the verified restore, the Platform Admin grant, the demo cleanup. It
 * broke silently when libpq tightened its rules, and the first symptom was a
 * failed query — the next would have been a failed backup.
 *
 * The function is shell, so these tests run it as shell. Testing the real
 * thing matters more than testing a TypeScript restatement of it, which could
 * agree with itself while the script did something else.
 */

import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const TOOLS = join(__dirname, "..", "..", "scripts", "backup", "pg-tools.sh");

function libpqUrl(input: string): string {
  return execFileSync("/bin/bash", ["-c", `source "${TOOLS}"; libpq_url "$1"`, "_", input], {
    encoding: "utf8",
  }).trim();
}

describe("libpq_url", () => {
  it("upgrades sslmode=require to verify-full", () => {
    // libpq refuses `sslrootcert=system` alongside a weak sslmode:
    //   weak sslmode "require" may not be used with sslrootcert=system
    // `require` encrypts but verifies nothing, so pinning a trust store with
    // it is contradictory.
    const out = libpqUrl("postgresql://u@host/db?sslmode=require");
    expect(out).toContain("sslmode=verify-full");
    expect(out).not.toContain("sslmode=require");
  });

  it("upgrades the other weak modes too", () => {
    expect(libpqUrl("postgresql://u@host/db?sslmode=prefer")).toContain("sslmode=verify-full");
    expect(libpqUrl("postgresql://u@host/db?sslmode=allow")).toContain("sslmode=verify-full");
  });

  it("always attaches the system trust store", () => {
    expect(libpqUrl("postgresql://u@host/db?sslmode=require")).toContain("sslrootcert=system");
    // No existing query string — the separator has to be `?`, not `&`.
    expect(libpqUrl("postgresql://u@host/db")).toContain("?sslrootcert=system");
  });

  it("preserves other parameters rather than rewriting the URL", () => {
    const out = libpqUrl("postgresql://u@host/db?sslmode=require&application_name=nn&connect_timeout=10");
    expect(out).toContain("application_name=nn");
    expect(out).toContain("connect_timeout=10");
  });

  it("leaves an already-pinned URL alone", () => {
    const already = "postgresql://u@host/db?sslmode=verify-full&sslrootcert=system";
    expect(libpqUrl(already)).toBe(already);
  });

  it("never downgrades verify-full", () => {
    // The failure this prevents is the tempting "fix": making the error go
    // away by weakening sslmode instead of strengthening it.
    expect(libpqUrl("postgresql://u@host/db?sslmode=verify-full")).toContain("sslmode=verify-full");
  });
});
