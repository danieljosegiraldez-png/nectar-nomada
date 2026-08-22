/**
 * Set a Person's email address, so they can be given a login.
 *
 * Most People in the database have no address, which is why only one account
 * can sign in (ADR-067). An address is a business fact — it cannot be derived,
 * guessed, or seeded — so it arrives here, from someone who knows it.
 *
 * Run with no arguments to list who is missing one.
 *
 * Usage:
 *   npm run people:set-email                                  # list
 *   npm run people:set-email -- "Bob Huerbsch" bob@example.com
 */

// Must come first: lib/db reads DATABASE_URL at import time.
import "dotenv/config";

import { prisma } from "../lib/db";
import { recordAuditEvent } from "../lib/audit";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

/** Deliberately the same normalisation signUpSchema and loginSchema apply. */
function normalise(raw: string): string {
  return raw.trim().toLowerCase();
}

// Not a validator so much as a guard against an obvious typo reaching the
// database — the real check is that the person receives mail at it.
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function list() {
  const people = await prisma.person.findMany({
    include: { userAccount: { select: { id: true, status: true, passwordHash: true } } },
    orderBy: { displayName: "asc" },
  });

  console.log("\n  Who can sign in\n");
  for (const person of people) {
    const account = person.userAccount;
    const state = !person.email
      ? "no email — cannot be given a login"
      : !account
        ? "email set, but no user account"
        : account.passwordHash
          ? `can sign in (${account.status})`
          : "email set, no password yet — run auth:set-password";
    console.log(`  ${person.displayName.padEnd(30)} ${person.email ?? "—"}`);
    console.log(`  ${"".padEnd(30)} ${state}`);
  }
  console.log("\n  Set one with:  npm run people:set-email -- \"Display Name\" someone@example.com\n");
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL is not set, and .env does not define it either.", "", "Run this from the project root.");
  }

  const [, , who, rawEmail, ...rest] = process.argv;
  if (!who) return list();
  if (!rawEmail || rest.length) {
    fail('Usage: npm run people:set-email -- "Display Name" someone@example.com');
  }

  const email = normalise(rawEmail);
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    fail(`"${rawEmail}" does not look like an email address. Nothing was changed.`);
  }

  // Match on id first, then on exact display name. Exact only: a fuzzy match
  // that picked the wrong person would attach someone else's address to them,
  // and the mistake would surface as a login that reaches the wrong records.
  // `id` is a uuid column, so comparing it against a display name is not a
  // miss — it is a database error. Only offer the id branch when the argument
  // could actually be one.
  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(who);
  const matches = await prisma.person.findMany({
    where: looksLikeId ? { OR: [{ id: who }, { displayName: who }] } : { displayName: who },
    include: { userAccount: true },
  });

  if (matches.length === 0) {
    const all = await prisma.person.findMany({ orderBy: { displayName: "asc" }, select: { displayName: true } });
    fail(`No person named exactly "${who}".`, "", "Known people:", ...all.map((p) => `  ${p.displayName}`));
  }
  if (matches.length > 1) {
    fail(
      `"${who}" matches ${matches.length} people. Pass the id instead:`,
      "",
      ...matches.map((p) => `  ${p.id}  ${p.displayName}`),
    );
  }

  const person = matches[0]!;

  // Check the collision here rather than letting the unique index raise it, so
  // the operator gets a sentence instead of a constraint error (ADR-072).
  const taken = await prisma.person.findFirst({ where: { email, NOT: { id: person.id } } });
  if (taken) {
    fail(`${email} already belongs to ${taken.displayName}. Nothing was changed.`);
  }

  if (person.email === email) {
    console.log(`\n  ${person.displayName} already has ${email}. Nothing to do.\n`);
    return;
  }

  const previous = person.email;
  await prisma.person.update({ where: { id: person.id }, data: { email } });

  // Someone with no account cannot be given a password at all, so create the
  // credentials account here — `invited`, with no password, which is exactly
  // the state every other person is in until auth:set-password runs.
  // Person↔UserAccount is one-to-one, so there is at most one to check.
  let createdAccount = false;
  if (!person.userAccount) {
    await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "invited" },
    });
    createdAccount = true;
  }

  await recordAuditEvent({
    actorUserAccountId: null,
    operation: "update",
    entityType: "person",
    entityId: person.id,
    before: { email: previous },
    after: { email, accountCreated: createdAccount },
    reason: "email set via scripts/set-person-email.ts",
    sourceInterface: "cli",
  });

  console.log(`\n  ${person.displayName}: ${previous ?? "(none)"} → ${email}`);
  if (createdAccount) console.log("  created a credentials account (invited, no password yet)");
  console.log(`\n  Next:  npm run auth:set-password -- ${email}\n`);
}

main()
  .catch((error) => {
    console.error("\n  Failed:", error instanceof Error ? error.message : error, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
