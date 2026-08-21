/**
 * ADR-056 — the connection strings this process will actually use must
 * demand full TLS verification whenever they leave this machine.
 *
 * Why a test rather than a note in the ADR. `sslmode=require` currently means
 * full certificate *and* hostname verification in pg-connection-string v2. In
 * pg v9 it adopts libpq semantics: encrypt, verify nothing. So a routine
 * `npm update` would downgrade production from verified TLS to unauthenticated
 * TLS with no error, no failing test, and no visible change in behaviour —
 * exactly the kind of regression nobody notices. Pinning `verify-full` is only
 * half the fix; this is the half that keeps it pinned.
 *
 * It also catches the simpler mistake: someone pasting a Neon connection
 * string straight from the dashboard, which hands out `?sslmode=require`.
 *
 * Deliberately pure — it inspects environment variables and asserts on
 * strings. No database is opened, so this adds no audit rows to the real Neon
 * the rest of the suite runs against.
 */

import { describe, it, expect } from "vitest";

/** Hosts where unencrypted or unverified traffic never leaves the machine. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

interface Parsed {
  name: string;
  host: string;
  sslmode: string | null;
  isLocal: boolean;
}

function parse(name: string, raw: string | undefined): Parsed | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} is set but is not a parseable URL`);
  }
  const host = url.hostname;
  return {
    name,
    host,
    sslmode: url.searchParams.get("sslmode"),
    // A unix-socket connection string has no hostname at all.
    isLocal: host === "" || LOCAL_HOSTS.has(host),
  };
}

const CONNECTION_VARS = ["DATABASE_URL", "AI_SERVICE_DATABASE_URL"] as const;

describe("database connection strings (ADR-056)", () => {
  const parsed = CONNECTION_VARS.map((n) => parse(n, process.env[n])).filter(
    (p): p is Parsed => p !== null,
  );

  it("has at least one connection string to check", () => {
    // Guards against the test silently passing because nothing was configured
    // — a green suite that checked nothing is worse than a red one.
    expect(parsed.length).toBeGreaterThan(0);
  });

  it.each(CONNECTION_VARS)("%s does not rely on sslmode=require", (name) => {
    const conn = parsed.find((p) => p.name === name);
    if (!conn || conn.isLocal) return; // unset, or never leaves this machine

    expect(
      conn.sslmode,
      `${name} uses sslmode=require. That means full verification today and ` +
        `"encrypt, verify nothing" from pg v9 onward — a silent downgrade. Use verify-full.`,
    ).not.toBe("require");
  });

  it.each(CONNECTION_VARS)("%s demands verify-full when it leaves this machine", (name) => {
    const conn = parsed.find((p) => p.name === name);
    if (!conn || conn.isLocal) return;

    expect(
      conn.sslmode,
      `${name} points at ${conn.host} but does not set sslmode=verify-full. ` +
        `Anything reaching a remote database must verify the certificate chain and hostname.`,
    ).toBe("verify-full");
  });

  it.each(CONNECTION_VARS)("%s does not carry libpq-only sslrootcert", (name) => {
    const conn = parsed.find((p) => p.name === name);
    if (!conn) return;

    // `sslrootcert=system` is what libpq needs to use the OS trust store, and
    // scripts/backup/pg-tools.sh appends it for psql and pg_dump. It must never
    // reach the application: node-postgres treats sslrootcert as a file path
    // and dies with `ENOENT: open 'system'`.
    const raw = (process.env[name] ?? "").trim();
    expect(
      raw.includes("sslrootcert="),
      `${name} carries sslrootcert, which node-postgres reads as a file path and ` +
        `fails on. It belongs only in the libpq URL the backup scripts build.`,
    ).toBe(false);
  });
});
