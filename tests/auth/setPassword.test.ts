/**
 * Credentials sign-in, end to end at the data layer — ADR-067.
 *
 * scripts/set-password.ts is the only way an existing Person gets a working
 * login, and it cannot be exercised in CI because it deliberately requires a
 * TTY. What is testable is the thing it has to get right: an account it has
 * written must satisfy every condition `authorize()` checks, and the hash it
 * stores must verify. A password that hashes but does not verify would fail
 * only at the login form, which is the worst place to find out.
 */

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { hashPassword, verifyPassword } from "../../lib/auth/password";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `authtest-${Date.now()}`;
const PASSWORD = "correct horse battery";

// Each account needs its own address: authorize() looks an account up by
// email, so two fixtures sharing one would make findFirst return whichever
// was created first and the assertions would describe the wrong row.
let seq = 0;
const nextEmail = () => `${RUN}-${++seq}@example.test`;

const created = { personIds: [] as string[], accountIds: [] as string[] };

afterAll(async () => {
  if (created.accountIds.length) {
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: created.accountIds } }) });
  }
  if (created.personIds.length) {
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: created.personIds } }) });
  }
});

async function makeInvitedAccount() {
  const email = nextEmail();
  const person = await prisma.person.create({
    data: { givenName: "AUTH", familyName: "Test", displayName: `AUTH Test ${email}`, email },
  });
  const account = await prisma.userAccount.create({
    // The state every real person is in: invited, credentials, no password.
    data: { personId: person.id, authProvider: "credentials", status: "invited" },
  });
  created.personIds.push(person.id);
  created.accountIds.push(account.id);
  return { account, email };
}

/** Exactly what scripts/set-password.ts writes. */
async function setPassword(accountId: string, plain: string) {
  await prisma.userAccount.update({
    where: { id: accountId },
    data: { passwordHash: await hashPassword(plain), status: "active", emailVerifiedAt: new Date() },
  });
}

describe("Argon2id hashing", () => {
  it("verifies the password it hashed", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(hash, PASSWORD)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword(PASSWORD);
    expect(await verifyPassword(hash, PASSWORD + "x")).toBe(false);
  });

  it("salts — the same password twice gives different hashes", async () => {
    // If these ever matched, the stored hashes would leak which accounts share
    // a password.
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it("produces an argon2id hash, not bcrypt or scrypt (SECURITY.md §1)", async () => {
    expect(await hashPassword(PASSWORD)).toMatch(/^\$argon2id\$/);
  });
});

describe("an account the script has written satisfies authorize()", () => {
  it("is found by the exact query authorize() runs, and verifies", async () => {
    const { account, email } = await makeInvitedAccount();

    // Before: the lookup succeeds but authorize() bails on the missing hash.
    const before = await prisma.userAccount.findFirst({
      where: { authProvider: "credentials", person: { email } },
      include: { person: true },
    });
    expect(before?.passwordHash).toBeNull();
    expect(before?.status).toBe("invited");

    await setPassword(account.id, PASSWORD);

    const after = await prisma.userAccount.findFirst({
      where: { authProvider: "credentials", person: { email } },
      include: { person: true },
    });
    // Every condition authorize() checks, in the order it checks them.
    expect(after).not.toBeNull();
    expect(after!.passwordHash).not.toBeNull();
    expect(after!.status).toBe("active");
    expect(await verifyPassword(after!.passwordHash!, PASSWORD)).toBe(true);
  });

  it("stays unreachable while status is not active, even with a valid password", async () => {
    // Deactivating must be enough to lock someone out on its own — the hash
    // is still correct, so status is the only thing standing in the way.
    const { account, email } = await makeInvitedAccount();
    await setPassword(account.id, PASSWORD);
    await prisma.userAccount.update({ where: { id: account.id }, data: { status: "suspended" } });

    const found = await prisma.userAccount.findFirst({
      where: { authProvider: "credentials", person: { email } },
    });
    expect(found!.status).not.toBe("active");
    expect(await verifyPassword(found!.passwordHash!, PASSWORD)).toBe(true);
  });
});
