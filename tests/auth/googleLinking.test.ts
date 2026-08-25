/**
 * Google sign-in account resolution — ADR-075.
 *
 * The behaviour this replaces was reproducibly broken: the callback found a
 * Person by email and created a UserAccount for them, which fails on
 * `user_account_person_id_key` for every Person who already had one. That is
 * every account that can currently sign in, so Google would have appeared
 * simply not to work.
 *
 * These drive the real callback out of `authConfig`, not a copy of its logic.
 */

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { authConfig } from "../../lib/auth/config";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `glink-${Date.now()}`;
let seq = 0;
const nextEmail = () => `${RUN}-${++seq}@example.test`;

const created = { personIds: [] as string[], accountIds: [] as string[] };

afterAll(async () => {
  // external_identity cascades from user_account, so it needs no explicit
  // delete — the FK is ON DELETE CASCADE.
  if (created.accountIds.length) {
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: created.accountIds } }) });
  }
  if (created.personIds.length) {
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: created.personIds } }) });
  }
});

/** Calls the real signIn callback the way Auth.js does. */
async function signInWithGoogle(subject: string, email: string | null, emailVerified = true) {
  const signIn = authConfig.callbacks!.signIn!;
  return signIn({
    user: { id: "ignored", email, name: "G Tester" },
    account: { provider: "google", providerAccountId: subject, type: "oidc", providerId: "google" },
    profile: email ? { email, email_verified: emailVerified, given_name: "G", family_name: "Tester" } : undefined,
  } as unknown as Parameters<typeof signIn>[0]);
}

async function trackAccountFor(email: string) {
  const account = await prisma.userAccount.findFirst({ where: { person: { email } }, include: { person: true } });
  if (account) {
    created.accountIds.push(account.id);
    created.personIds.push(account.personId);
  }
  return account;
}

describe("a Person who already has an account", () => {
  it("links Google to the existing account instead of creating a second one", async () => {
    // The exact case that used to fail: Daniel, José and Nathy are all here.
    const email = nextEmail();
    const person = await prisma.person.create({
      data: { givenName: "GLINK", familyName: "Existing", displayName: `GLINK Existing ${email}`, email },
    });
    const original = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active", passwordHash: "x" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(original.id);

    const result = await signInWithGoogle(`sub-${RUN}-existing`, email);
    expect(result).toBe(true);

    const accounts = await prisma.userAccount.findMany({ where: { personId: person.id } });
    expect(accounts.length).toBe(1);
    expect(accounts[0]!.id).toBe(original.id);

    const identities = await prisma.externalIdentity.findMany({ where: { userAccountId: original.id } });
    expect(identities.length).toBe(1);
    expect(identities[0]!.provider).toBe("google");
  });

  it("keeps the password working — linking adds a way in, it does not replace one", async () => {
    const account = await prisma.userAccount.findFirstOrThrow({
      where: { id: { in: created.accountIds } },
      orderBy: { createdAt: "asc" },
    });
    expect(account.passwordHash).not.toBeNull();
  });
});

describe("a Google identity already seen", () => {
  it("reuses the same account rather than linking twice", async () => {
    const email = nextEmail();
    const subject = `sub-${RUN}-repeat`;

    expect(await signInWithGoogle(subject, email)).toBe(true);
    const first = await trackAccountFor(email);
    expect(first).not.toBeNull();

    expect(await signInWithGoogle(subject, email)).toBe(true);

    const identities = await prisma.externalIdentity.findMany({ where: { provider: "google", subject } });
    expect(identities.length).toBe(1);
    expect(identities[0]!.lastUsedAt).not.toBeNull();
  });
});

describe("nobody matches", () => {
  it("creates the Person, the account and the identity together", async () => {
    const email = nextEmail();
    expect(await signInWithGoogle(`sub-${RUN}-new`, email)).toBe(true);

    const account = await trackAccountFor(email);
    expect(account).not.toBeNull();
    expect(account!.authProvider).toBe("google");
    expect(account!.passwordHash).toBeNull();

    const identity = await prisma.externalIdentity.findFirst({ where: { userAccountId: account!.id } });
    expect(identity).not.toBeNull();
  });
});

describe("an unverified Google address never claims an existing Person", () => {
  it("does not link when email_verified is false", async () => {
    // Otherwise anyone able to set that address on a Google account could take
    // over the matching Person — the address is the only thing being matched.
    const email = nextEmail();
    const person = await prisma.person.create({
      data: { givenName: "GLINK", familyName: "Unverified", displayName: `GLINK Unverified ${email}`, email },
    });
    const original = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active", passwordHash: "x" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(original.id);

    await signInWithGoogle(`sub-${RUN}-unverified`, email, false);

    const identities = await prisma.externalIdentity.findMany({ where: { userAccountId: original.id } });
    expect(identities.length).toBe(0);

    // A brand-new Person was made instead, carrying no email at all.
    const stray = await prisma.externalIdentity.findFirst({
      where: { provider: "google", subject: `sub-${RUN}-unverified` },
      include: { userAccount: { include: { person: true } } },
    });
    expect(stray).not.toBeNull();
    expect(stray!.userAccount.personId).not.toBe(person.id);
    expect(stray!.userAccount.person.email).toBeNull();
    created.accountIds.push(stray!.userAccountId);
    created.personIds.push(stray!.userAccount.personId);
  });
});

describe("a disabled account stays disabled", () => {
  it("refuses sign-in through Google when the account is not active", async () => {
    // Status must be a control that stands on its own — the same property
    // tests/auth/setPassword.test.ts pins for passwords. A second provider
    // must not be a way back in.
    const email = nextEmail();
    const person = await prisma.person.create({
      data: { givenName: "GLINK", familyName: "Disabled", displayName: `GLINK Disabled ${email}`, email },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "suspended", passwordHash: "x" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);

    expect(await signInWithGoogle(`sub-${RUN}-disabled`, email)).toBe(false);
  });
});

describe("accepting an invitation — ADR-083", () => {
  async function invitedPersonWithEmail(label: string) {
    const email = nextEmail();
    const person = await prisma.person.create({
      data: { givenName: "GLINK", familyName: label, displayName: `GLINK ${label} ${email}`, email },
    });
    const account = await prisma.userAccount.create({
      // The state thirteen of fourteen real accounts are in: invited,
      // credentials, no password, holding real Assignments.
      data: { personId: person.id, authProvider: "credentials", status: "invited" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);
    return { email, person, account };
  }

  it("activates an invited account whose verified address matches, and signs it in", async () => {
    // The defect this fixes: `invited` was refused alongside the deliberate
    // revocations, so the only route out of it was the TTY password script.
    const { email, account } = await invitedPersonWithEmail("Invited");

    expect(await signInWithGoogle(`sub-${RUN}-invited`, email)).toBe(true);

    const after = await prisma.userAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe("active");
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.lastLoginAt).not.toBeNull();
  });

  it("links Google to that same account rather than creating a second one", async () => {
    // Activation must not have quietly taken the create-a-new-Person branch:
    // the whole point is that the person keeps the Assignments they were
    // invited with.
    const { email, account } = await invitedPersonWithEmail("InvitedLink");
    await signInWithGoogle(`sub-${RUN}-invited-link`, email);

    const identities = await prisma.externalIdentity.findMany({ where: { userAccountId: account.id } });
    expect(identities.length).toBe(1);
    expect(identities[0]!.subject).toBe(`sub-${RUN}-invited-link`);

    const accountsForEmail = await prisma.userAccount.count({ where: { person: { email } } });
    expect(accountsForEmail).toBe(1);
  });

  it("writes an audit row naming what happened and why", async () => {
    // CLAUDE.md §35 — a status change is exactly what an audit trail is for,
    // and "who activated this account" must not be answerable only by guess.
    const { email, account } = await invitedPersonWithEmail("InvitedAudit");
    await signInWithGoogle(`sub-${RUN}-invited-audit`, email);

    const event = await prisma.auditEvent.findFirst({
      where: { entityId: account.id, operation: "user_account.activate" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event).not.toBeNull();
    expect(event!.reason).toBe("invitation_accepted_via_google");
    expect(event!.sourceInterface).toBe("auth.google");
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ id: event!.id }) });
  });

  it("does NOT activate a suspended account — that is a decision someone made", async () => {
    // The distinction the fix turns on. `invited` is a state nobody has acted
    // on; `suspended` and `deactivated` are revocations, and a second provider
    // must not be a way back in.
    const email = nextEmail();
    const person = await prisma.person.create({
      data: { givenName: "GLINK", familyName: "Susp", displayName: `GLINK Susp ${email}`, email },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "suspended" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);

    expect(await signInWithGoogle(`sub-${RUN}-susp`, email)).toBe(false);
    const after = await prisma.userAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe("suspended");
  });

  it("does NOT activate a deactivated account either", async () => {
    const email = nextEmail();
    const person = await prisma.person.create({
      data: { givenName: "GLINK", familyName: "Deact", displayName: `GLINK Deact ${email}`, email },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "deactivated" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);

    expect(await signInWithGoogle(`sub-${RUN}-deact`, email)).toBe(false);
    const after = await prisma.userAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe("deactivated");
  });

  it("does NOT activate an invited account on an unverified address", async () => {
    // Anyone can put an address on a Google account; only a verified one
    // proves the mailbox. An unverified match must not accept an invitation
    // on the real person's behalf.
    const { account } = await invitedPersonWithEmail("InvitedUnverified");
    const { email } = { email: (await prisma.person.findUniqueOrThrow({ where: { id: account.personId } })).email! };

    await signInWithGoogle(`sub-${RUN}-invited-unverified`, email, false);

    const after = await prisma.userAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(after.status).toBe("invited");

    // The callback made a separate emailless Person instead — track it so the
    // fixture cleanup takes it with everything else.
    const stray = await prisma.externalIdentity.findFirst({
      where: { provider: "google", subject: `sub-${RUN}-invited-unverified` },
      include: { userAccount: true },
    });
    if (stray) {
      created.accountIds.push(stray.userAccountId);
      created.personIds.push(stray.userAccount.personId);
    }
  });

  it("credentials sign-in still refuses an invited account", async () => {
    // Unchanged on purpose: an invited account has no password, and
    // scripts/set-password.ts is what sets one and activates it. Accepting an
    // invitation is something the invited person does, not something a
    // password guess can do.
    const { email } = await invitedPersonWithEmail("InvitedCreds");
    const authorize = authConfig.providers.find((p) => "id" in p && p.id === "credentials") as
      | { authorize: (c: unknown) => Promise<unknown> }
      | undefined;
    expect(authorize).toBeDefined();
    expect(await authorize!.authorize({ email, password: "whatever-it-does-not-matter" })).toBeNull();
  });
});

