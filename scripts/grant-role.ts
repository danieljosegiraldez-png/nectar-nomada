/**
 * Grant a Role Profile to a Person, through the audited path — ADR-090.
 *
 * Calls `grantRole` from lib/rbac/admin.ts, which is the same function
 * /admin/users calls: the permission check, the last-Platform-Admin guard, the
 * Scope reuse and the AuditEvent all come along. It is deliberately not an
 * `assignment.create`, which would write the row and none of the rest.
 *
 * The UI is the intended path for this (ADR-074) and remains so. This exists
 * for the case the UI cannot serve: granting against production from a machine
 * that is not signed in as an administrator, without a password passing
 * through a terminal or a transcript.
 *
 * Run with no arguments to list the role profiles and scopes available.
 *
 * Usage:
 *   npm run rbac:grant
 *   npm run rbac:grant -- "Nathy Rubio" "Content/Ops Coordinator" platform
 *   npm run rbac:grant -- "Someone" "Farm Operator" project "Cafelino — Café"
 */

// Must come first: lib/db reads DATABASE_URL at import time.
import "dotenv/config";

import { prisma } from "../lib/db";
import { grantRole, UserAdminError } from "../lib/rbac/admin";
import type { ScopeType } from "../generated/prisma/client";

function fail(message: string, ...detail: string[]): never {
  console.error(`\n  ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  console.error("");
  process.exit(1);
}

const SCOPE_TYPES = ["platform", "project", "location", "session"] as const;

async function list() {
  const [roles, projects, locations] = await Promise.all([
    prisma.roleProfile.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.location.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  console.log("\n  Role profiles\n");
  for (const r of roles) console.log(`    ${r.name}`);
  console.log("\n  Projects (for scope 'project')\n");
  for (const p of projects) console.log(`    ${p.name}`);
  console.log(`\n  ${locations.length} locations available for scope 'location'.`);
  console.log('\n  Grant with:  npm run rbac:grant -- "Display Name" "Role Profile" platform\n');
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) fail("DATABASE_URL is not set.");

  const [, , who, roleName, rawScopeType, scopeName] = process.argv;
  if (!who) return list();

  if (!roleName || !rawScopeType) {
    fail('Usage: npm run rbac:grant -- "Display Name" "Role Profile" <platform|project|location|session> [scope name]');
  }
  if (!SCOPE_TYPES.includes(rawScopeType as never)) {
    fail(`Unknown scope type "${rawScopeType}".`, `Expected one of: ${SCOPE_TYPES.join(", ")}`);
  }
  const scopeType = rawScopeType as ScopeType;

  // An ambiguous name must stop the run rather than pick one. Granting a role
  // to the wrong person is not obviously wrong afterwards — the row looks
  // exactly like an intended grant.
  const people = await prisma.person.findMany({
    where: { displayName: who },
    include: { userAccount: true },
  });
  if (people.length === 0) fail(`No Person named "${who}".`);
  if (people.length > 1) fail(`${people.length} People are named "${who}" — refusing to guess.`);
  const person = people[0]!;
  if (!person.userAccount) {
    fail(`${who} has no UserAccount, so there is nothing to grant a role to.`);
  }

  const role = await prisma.roleProfile.findUnique({ where: { name: roleName } });
  if (!role) fail(`No Role Profile named "${roleName}".`, "Run with no arguments to list them.");

  let scopeRefId: string | null = null;
  if (scopeType !== "platform") {
    if (!scopeName) fail(`Scope type "${scopeType}" needs a name.`);
    const target =
      scopeType === "project"
        ? await prisma.project.findFirst({ where: { name: scopeName }, select: { id: true } })
        : await prisma.location.findFirst({ where: { name: scopeName }, select: { id: true } });
    if (!target) fail(`No ${scopeType} named "${scopeName}".`);
    scopeRefId = target.id;
  }

  // The actor is a real administrator, named explicitly rather than assumed:
  // the AuditEvent records who authorised this, and "a script did it" is not
  // an answer to that question.
  const actorEmail = process.env.NN_ACTOR_EMAIL?.trim() || "danieljosegiraldez@gmail.com";
  const actor = await prisma.userAccount.findFirst({
    where: { person: { email: actorEmail } },
    include: { person: true },
  });
  if (!actor) fail(`No UserAccount for actor ${actorEmail}.`, "Set NN_ACTOR_EMAIL to choose a different administrator.");

  try {
    const assignment = await grantRole(actor.id, {
      userAccountId: person.userAccount.id,
      roleProfileId: role.id,
      scopeType,
      scopeRefId,
    });
    console.log(
      `\n  Granted "${role.name}" to ${person.displayName} at ${scopeType}${scopeName ? ` (${scopeName})` : ""}.`,
    );
    console.log(`  Assignment ${assignment.id}, authorised by ${actor.person.displayName}, audited.\n`);
  } catch (error) {
    if (error instanceof UserAdminError) {
      fail(`Refused: ${error.message}`);
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
