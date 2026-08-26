/**
 * What the `people:set-email` listing tells the reader — ADR-088.
 *
 * The listing is what a person actually reads before deciding what to do next,
 * and it had drifted into sending them to the password script for accounts
 * that only needed an address. Its states are pure given a Person row, so they
 * are worth pinning down directly rather than by eyeballing the output.
 */

import { describe, it, expect } from "vitest";
import { describeAccess } from "../../scripts/set-person-email";

const account = (
  over: Partial<{ status: string; passwordHash: string | null; externalIdentities: unknown[] }> = {},
) => ({
  status: "active",
  passwordHash: null as string | null,
  externalIdentities: [] as unknown[],
  ...over,
});

describe("describeAccess", () => {
  it("says an address is missing before anything else", () => {
    // No address means no login by either route — Google matches on the
    // verified address, and authorize() looks the account up by it too.
    expect(describeAccess({ email: null, userAccount: account() })).toContain("no email");
  });

  it("names the missing account first, because an address would not fix it", () => {
    // Three real Persons are in this state. Reporting "no email" for them
    // would repeat the very mistake this ADR corrects: naming a fix that does
    // not fix anything.
    const state = describeAccess({ email: null, userAccount: null });
    expect(state).toContain("no user account");
    expect(state).not.toContain("no email");
  });

  it("tells an invited person that Google alone will do it", () => {
    // The correction this ADR is about: it used to send them to
    // auth:set-password, which is work nobody needs to do.
    const state = describeAccess({ email: "a@b.test", userAccount: account({ status: "invited" }) });
    expect(state).toContain("Google");
    expect(state).not.toContain("set-password");
  });

  it("does NOT claim a suspended account can sign in, hash or no hash", () => {
    // It used to report `can sign in (suspended)` for exactly this row.
    // A password hash is not permission to enter — authorize() refuses on
    // status before it ever verifies one.
    for (const status of ["suspended", "deactivated"]) {
      const state = describeAccess({
        email: "a@b.test",
        userAccount: account({ status, passwordHash: "$argon2id$..." }),
      });
      expect(state).toContain(status);
      expect(state).not.toContain("can sign in");
    }
  });

  it("notices a linked provider, which it never used to look at", () => {
    const state = describeAccess({
      email: "a@b.test",
      userAccount: account({ externalIdentities: [{ provider: "google" }] }),
    });
    expect(state).toContain("can sign in");
    expect(state).toContain("Google");
  });

  it("names both routes when both are available", () => {
    const state = describeAccess({
      email: "a@b.test",
      userAccount: account({ passwordHash: "$argon2id$...", externalIdentities: [{ provider: "google" }] }),
    });
    expect(state).toContain("password");
    expect(state).toContain("Google");
  });

  it("does not report an active account with nothing attached as ready", () => {
    // Unusual, and worth naming rather than falling through to something
    // cheerful — the failure this whole file exists to avoid.
    const state = describeAccess({ email: "a@b.test", userAccount: account() });
    expect(state).not.toMatch(/^can sign in/);
    expect(state).toContain("Google");
  });
});
