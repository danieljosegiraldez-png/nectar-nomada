/**
 * Set a Person's email address, so they can be given a login.
 *
 * Most People in the database have no address, which is why only one account
 * can sign in (ADR-067). An address is a business fact — it cannot be derived,
 * guessed, or seeded — so it arrives here, from someone who knows it.
 *
 * Since ADR-083 setting one is usually the whole job: the invited person signs
 * in with Google, the verified address matches their Person, and the account
 * activates itself. A password is only needed where Google is not an option.
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

/**
 * What this listing says had gone out of date in three ways (ADR-088), all of
 * them in the direction of telling the reader to do more work than they need:
 *
 *   1. It sent everyone to `auth:set-password`. Since ADR-083 an address is
 *      enough on its own — the invited person signs in with Google, the
 *      verified address matches their Person, and the account activates. No
 *      password has to be handled by anyone.
 *   2. It reported `can sign in` for any account holding a password hash,
 *      including a suspended one, which `authorize()` refuses outright. A hash
 *      is not permission to enter.
 *   3. It never looked at ExternalIdentity, so an account already linked to
 *      Google read as though nothing had been set up.
 */
export function describeAccess(person: {
  email: string | null;
  userAccount: { status: string; passwordHash: string | null; externalIdentities: unknown[] } | null;
}): string {
  const account = person.userAccount;

  // Ordered by which fact actually blocks the reader, not by which field is
  // checked most easily. A Person with no UserAccount cannot be given a login
  // by setting an address, so saying "no email" first would repeat this
  // listing's original sin: naming a fix that does not fix it.
  if (!account) return "no user account — an address alone will not create one";

  // No address means no login by either route: Google matches on the verified
  // address, and `authorize()` looks the account up by it too.
  if (!person.email) return "no email — cannot sign in by any route";

  // Status stands alone, ahead of everything below it. `invited` is the one
  // non-active state that is not a refusal — it is an invitation nobody has
  // accepted yet (ADR-083).
  if (account.status !== "active" && account.status !== "invited") {
    return `account ${account.status} — sign-in refused whatever else is set`;
  }

  const viaGoogle = account.externalIdentities.length > 0;
  const viaPassword = account.passwordHash !== null && account.status === "active";

  if (account.status === "invited") {
    return viaGoogle
      ? "invited, Google already linked — signing in accepts the invitation"
      : "invited — signing in with Google accepts it and activates the account";
  }
  if (viaPassword && viaGoogle) return "can sign in — password or Google";
  if (viaPassword) return "can sign in — password";
  if (viaGoogle) return "can sign in — Google";
  // Active, addressed, and nothing attached: unusual, and worth naming rather
  // than falling through to a cheerful default.
  return "active but no password and no linked provider — sign in with Google to attach one";
}

async function list() {
  const people = await prisma.person.findMany({
    include: {
      userAccount: {
        select: {
          id: true,
          status: true,
          passwordHash: true,
          externalIdentities: { select: { provider: true } },
        },
      },
    },
    orderBy: { displayName: "asc" },
  });

  console.log("\n  Who can sign in\n");
  for (const person of people) {
    console.log(`  ${person.displayName.padEnd(30)} ${person.email ?? "—"}`);
    console.log(`  ${"".padEnd(30)} ${describeAccess(person)}`);
  }
  console.log("\n  Set one with:  npm run people:set-email -- \"Display Name\" someone@example.com");
  console.log("  An address is enough: the person signs in with Google and the account activates.");
  console.log("  A password is only needed where Google is not an option:  npm run auth:set-password\n");
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
  // Las TRES escrituras en una sola transacción desde el 2026-09-06. Éste era
  // el caso más suelto de todos: el correo, la cuenta y el audit iban por
  // separado, así que un fallo a mitad podía dejar a alguien con correo puesto
  // y sin cuenta, o con las dos cosas y sin ninguna fila que lo dijera.
  const createdAccount = await prisma.$transaction(async (tx) => {
    await tx.person.update({ where: { id: person.id }, data: { email } });

    // Someone with no account cannot be given a password at all, so create the
    // credentials account here — `invited`, with no password, which is exactly
    // the state every other person is in until auth:set-password runs.
    // Person↔UserAccount is one-to-one, so there is at most one to check.
    let creada = false;
    if (!person.userAccount) {
      await tx.userAccount.create({
        data: { personId: person.id, authProvider: "credentials", status: "invited" },
      });
      creada = true;
    }

    await recordAuditEvent(
      {
        actorUserAccountId: null,
        operation: "update",
        entityType: "person",
        entityId: person.id,
        before: { email: previous },
        after: { email, accountCreated: creada },
        reason: "email set via scripts/set-person-email.ts",
        sourceInterface: "cli",
      },
      tx,
    );

    return creada;
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
