/**
 * Set a credentials password on an existing account, and activate it.
 *
 * Why this exists as a script rather than a UI. Production reached a state
 * where nobody could sign in: fourteen accounts, all `invited`, none holding a
 * password hash. The only accounts that ever had credentials were the seeded
 * DEMO ones, and those were removed (ADR-066) because demo logins in a
 * production research record are worse than no login at all. There is a
 * sign-up flow, but it creates a new Person, and the people here already
 * exist with Assignments attached — a second Person record for the same human
 * is exactly what CLAUDE.md §2 says not to do.
 *
 * Why the password is prompted and never passed as an argument. An argument
 * lands in shell history and in the process list, where it outlives the
 * command. Reading it from a hidden prompt keeps it in this process only. The
 * value is never logged, never echoed, and never written anywhere but the
 * Argon2id hash.
 *
 * Usage:
 *   npm run auth:set-password -- <email>
 */

// Must come first: lib/db reads DATABASE_URL at import time, and ES module
// imports evaluate in declaration order, so loading .env here means the
// operator does not have to hand-assemble a connection string on the command
// line. The rest of the tooling (scripts/backup/*) already reads .env; this
// script asking for it separately was an inconsistency, not a safety measure.
import "dotenv/config";

import { prisma } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { recordAuditEvent } from "../lib/audit";

// Matches signUpSchema (lib/validation/auth.ts). loginSchema only requires a
// non-empty password because it validates an attempt, not a new secret —
// enforcing the sign-up rule here keeps a script-set password from being
// weaker than one a user could choose in the UI.
const MIN_LENGTH = 10;

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

/** Read a line from the TTY without echoing it. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("not a TTY — run this in an interactive terminal"));
      return;
    }
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let buffer = "";
    const done = (value: string | null) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (value === null) {
        console.error("  cancelled — nothing was changed.\n");
        process.exit(130);
      }
      resolve(value);
    };

    const onData = (chunk: string) => {
      // A single read can carry several characters (a paste, or a fast
      // keypress sequence), so step through them rather than treating the
      // chunk as one key.
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(buffer);
        if (ch === "\u0003") return done(null); // Ctrl-C
        if (ch === "\u007f" || ch === "\b") buffer = buffer.slice(0, -1);
        else if (ch >= " ") buffer += ch;
      }
    };

    stdin.on("data", onData);
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();

  if (process.argv.length > 3) {
    fail(
      "Too many arguments.",
      "The password is never taken as an argument — it would be left behind in",
      "shell history and in the process list. This prompts for it instead.",
      "",
      "  npm run auth:set-password -- <email>",
    );
  }
  if (!email) {
    fail("Usage: npm run auth:set-password -- <email>");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    fail(
      "DATABASE_URL is not set, and .env does not define it either.",
      "",
      "Run this from the project root, where .env lives.",
    );
  }

  const account = await prisma.userAccount.findFirst({
    where: { authProvider: "credentials", person: { email } },
    include: { person: true },
  });

  if (!account) {
    // Deliberately specific. This is an operator tool run against a database
    // the operator already controls, so the account-enumeration reticence that
    // belongs in the login form would only make a typo hard to diagnose.
    fail(
      `No credentials account found for ${email}.`,
      "",
      "Accounts that could be given a password:",
      ...(
        await prisma.userAccount.findMany({
          where: { authProvider: "credentials" },
          include: { person: true },
          orderBy: { person: { displayName: "asc" } },
        })
      ).map((a) => `  ${a.person.email ?? "(no email)"}  — ${a.person.displayName} [${a.status}]`),
    );
  }

  console.log(`\n  Account:  ${account.person.displayName} <${email}>`);
  console.log(`  Status:   ${account.status}${account.status !== "active" ? " → active" : ""}`);
  console.log(`  Password: ${account.passwordHash ? "REPLACING the existing password" : "none set yet"}`);
  console.log("");

  const password = await promptHidden(`  New password (min ${MIN_LENGTH} chars, not shown): `);
  if (password.length < MIN_LENGTH) {
    fail(`Password must be at least ${MIN_LENGTH} characters. Nothing was changed.`);
  }
  const again = await promptHidden("  Confirm: ");
  if (password !== again) {
    fail("Passwords did not match. Nothing was changed.");
  }

  const passwordHash = await hashPassword(password);

  await prisma.userAccount.update({
    where: { id: account.id },
    data: {
      passwordHash,
      status: "active",
      emailVerifiedAt: account.emailVerifiedAt ?? new Date(),
    },
  });

  // The audit trail records that credentials were set and by what route —
  // never the password, and never the hash.
  await recordAuditEvent({
    actorUserAccountId: account.id,
    operation: "update",
    entityType: "user_account",
    entityId: account.id,
    before: { status: account.status, hadPassword: account.passwordHash !== null },
    after: { status: "active", hadPassword: true },
    reason: "credentials set via scripts/set-password.ts",
    sourceInterface: "cli",
  });

  console.log(`\n  Done. ${email} can now sign in.\n`);
}

main()
  .catch((error) => {
    console.error("\n  Failed:", error instanceof Error ? error.message : error, "\n");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
