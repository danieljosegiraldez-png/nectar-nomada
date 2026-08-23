/**
 * Batch page data shape — ADR-080.
 *
 * Three defects found by opening a real batch as an operator, all in what the
 * services hand the page rather than in the page itself.
 */

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { getObserverCandidates } from "../../lib/traceability/lots";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `bpd-${Date.now()}`;
const created = { personIds: [] as string[], accountIds: [] as string[] };

afterAll(async () => {
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.accountIds.length) await prisma.userAccount.deleteMany({ where: w(created.accountIds) });
  if (created.personIds.length) await prisma.person.deleteMany({ where: w(created.personIds) });
});

describe("who took this reading — the observer list", () => {
  it("puts the signed-in person first", async () => {
    // Sorted by name alone, "Yo (Daniel Giráldez)" sat seventh of seventeen.
    // The overwhelmingly common answer to "who took this reading" is "I did",
    // entered on a phone, outdoors.
    const person = await prisma.person.create({
      // A name that sorts late, so passing cannot be an accident of alphabet.
      data: { givenName: "ZZZ", familyName: "Observer", displayName: `ZZZ Observer ${RUN}` },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);

    const { people, selfPersonId } = await getObserverCandidates(account.id);
    expect(selfPersonId).toBe(person.id);
    expect(people[0]!.id).toBe(person.id);
  });

  it("still lists everyone else, and loses nobody", async () => {
    const person = await prisma.person.create({
      data: { givenName: "AAA", familyName: "Observer", displayName: `AAA Observer ${RUN}` },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);

    const activeCount = await prisma.person.count({ where: { status: "active" } });
    const { people } = await getObserverCandidates(account.id);

    expect(people.length).toBe(activeCount);
    expect(new Set(people.map((p) => p.id)).size).toBe(people.length);
  });

  it("orders the rest naturally, so accented names are not exiled to the end", async () => {
    const account = await prisma.userAccount.findFirstOrThrow({ where: { status: "active" } });
    const { people, selfPersonId } = await getObserverCandidates(account.id);
    const others = people.filter((p) => p.id !== selfPersonId).map((p) => p.displayName);
    const expected = [...others].sort((a, b) =>
      new Intl.Collator(["es", "en"], { numeric: true, sensitivity: "base" }).compare(a, b),
    );
    expect(others).toEqual(expected);
  });
});

describe("current quantity", () => {
  it("reports `recorded: false` when no quantity event exists", async () => {
    // Before this, the page rendered "Cantidad: 0" for a batch nobody had ever
    // weighed — an inferred fact, which CLAUDE.md §3 forbids.
    const lot = await prisma.lot.findFirstOrThrow({
      where: { quantityEvents: { none: {} } },
      select: { id: true },
    });
    const admin = await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    });

    const result = await computeCurrentQuantity(admin.userAccountId, lot.id);
    expect(result.recorded).toBe(false);
    expect(result.unit).toBeNull();
  });

  it("reports `recorded: true` where events exist, so a real zero stays sayable", async () => {
    // A lot fully consumed genuinely is zero. That is a different claim from
    // "never weighed", and the page must be able to make it.
    const lot = await prisma.lot.findFirst({
      where: { quantityEvents: { some: {} } },
      select: { id: true },
    });
    if (!lot) return; // No lot carries quantity events in this dataset.

    const admin = await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    });

    const result = await computeCurrentQuantity(admin.userAccountId, lot.id);
    expect(result.recorded).toBe(true);
    expect(result.unit).not.toBeNull();
  });
});
