/**
 * "Is this connection string pointing at a database on this machine?" — the
 * one question two different guards need to answer the same way (ADR-084).
 *
 * `tests/setup.ts` has refused to run the suite against a remote database
 * since it was found writing ~244 audit rows per run into the live research
 * record. `npm run dev` had no such guard and needed the identical rule, so it
 * lives here rather than being copied — a second hand-written copy of a
 * safety check is how the two drift into disagreeing about what "local" means.
 *
 * Pure: no I/O, no environment reads, no imports.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

/** The hostname a connection string names, or null if it cannot be parsed. */
export function hostOf(raw: string | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    // A unix-socket URL has an empty hostname, which is local by definition.
    const hostname = new URL(value).hostname;
    // `URL` returns an IPv6 host in its bracketed literal form — "[::1]", not
    // "::1". The set below is written in the plain form a person would type,
    // so the brackets come off here. Without this, the loopback address the
    // rule most obviously means to accept was compared against a value it
    // could never equal, and a local IPv6 cluster was reported as remote.
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  } catch {
    return null;
  }
}

/**
 * False for an unparseable or absent URL, deliberately. A guard that cannot
 * tell where it is pointing must refuse rather than assume the safe answer —
 * "I could not read this" is not evidence of locality.
 */
export function isLocalDatabaseUrl(raw: string | undefined): boolean {
  const host = hostOf(raw);
  return host !== null && (host === "" || LOCAL_HOSTS.has(host));
}
