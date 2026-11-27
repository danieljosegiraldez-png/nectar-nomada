/**
 * Batch page data shape — ADR-080.
 *
 * Three defects found by opening a real batch as an operator, all in what the
 * services hand the page rather than in the page itself.
 */

import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { prisma } from "../../lib/db";
import { getObserverCandidates } from "../../lib/traceability/lots";
import { computeCurrentQuantity } from "../../lib/traceability/quantity";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearUsuarioConAcceso } from "../helpers/traceability";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

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

    const { people, selfPersonId } = await getObserverCandidates(account.id, []);
    expect(selfPersonId).toBe(person.id);
    expect(people[0]!.id).toBe(person.id);
  });

  // Since P-G (2026-09-21) the list no longer holds "everyone": it holds the people who may appear
  // on a record anchored where the page is — see tests/people/quienLoHizo.test.ts for the rule.
  // What stays true for any anchor, even none, is that reordering loses and duplicates nobody.
  it("loses nobody it may list, duplicates nobody, returns nobody inactive", async () => {
    const person = await prisma.person.create({
      data: { givenName: "AAA", familyName: "Observer", displayName: `AAA Observer ${RUN}` },
    });
    const account = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    created.personIds.push(person.id);
    created.accountIds.push(account.id);

    const { people } = await getObserverCandidates(account.id, []);

    // Deliberately NOT compared against `person.count({ status: "active" })`.
    // That is what this assertion used to do, and it is a race: the count and
    // the service call are two round trips, vitest runs files in parallel, and
    // several of them create and delete Persons throughout — so the number
    // moved underneath it and the test failed roughly one run in three
    // (ADR-086). It is the same defect as the "real data intact" counts removed
    // from the RO1 suites in that ADR: a global count is not a property of the
    // code under test.
    //
    // What "loses nobody" actually needs is that reordering is a permutation:
    // the rows this test controls are present, nothing is duplicated, and
    // nothing inactive has crept in. All three hold regardless of what another
    // file is doing to its own fixtures.
    expect(people.map((p) => p.id)).toContain(person.id);
    expect(new Set(people.map((p) => p.id)).size).toBe(people.length);

    const inactiveReturned = await prisma.person.count({
      where: { id: { in: people.map((p) => p.id) }, status: { not: "active" } },
    });
    expect(inactiveReturned).toBe(0);
  });

  it("orders the rest naturally, so accented names are not exiled to the end", async () => {
    const account = await prisma.userAccount.findFirstOrThrow({ where: { status: "active" } });
    const { people, selfPersonId } = await getObserverCandidates(account.id, []);
    const others = people.filter((p) => p.id !== selfPersonId).map((p) => p.displayName);
    const expected = [...others].sort((a, b) =>
      new Intl.Collator(["es", "en"], { numeric: true, sensitivity: "base" }).compare(a, b),
    );
    expect(others).toEqual(expected);
  });
});

/**
 * **Con sus propios lotes**, no con los de la base (ficha 006, 2026-10-12). Antes buscaban «un lote sin
 * eventos de cantidad» y «uno con eventos» entre los que hubiera, así que el archivo sólo corría sobre el
 * backup restaurado; y la segunda hacía `if (!lot) return;`: sin un lote así, pasaba en verde sin
 * comprobar nada. Ahora cada una crea el lote que necesita, y el administrador lo crea `crearUsuarioConAcceso`.
 */
describe("current quantity", () => {
  const RUN_LOTES = `${RUN}-cantidad`;
  let admin: string;
  let personaAdmin: string;
  let sinPesar: string;
  let pesado: string;

  beforeAll(async () => {
    const acceso = await crearUsuarioConAcceso();
    admin = acceso.userAccountId;
    personaAdmin = acceso.personId;
    const organizationId = await createTestOrganization(RUN_LOTES);
    sinPesar = (await prisma.lot.create({ data: { lotCode: `${RUN_LOTES}-sin`, lotType: "cherry", organizationId } })).id;
    pesado = (await prisma.lot.create({ data: { lotCode: `${RUN_LOTES}-con`, lotType: "cherry", organizationId } })).id;
    await prisma.quantityEvent.create({
      data: { lotId: pesado, eventType: "process_output", quantity: 12.5, unit: "kg", occurredAt: new Date("2026-03-02T12:00:00Z"), provenanceClass: "measured_fact" },
    });
  }, 30000);

  /** Lo que crea el `beforeAll` se descubre por su marca, así que se limpia aunque muera a mitad. El ámbito de plataforma es compartido: no se borra. */
  afterAll(async () => {
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lot: { lotCode: { startsWith: RUN_LOTES } } }) });
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_LOTES } }) });
    await deleteTestOrganizations(RUN_LOTES);
    if (admin) {
      await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: admin }) });
      await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: admin }) });
    }
    if (personaAdmin) await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personaAdmin }) });
  }, 30000);

  it("reports `recorded: false` when no quantity event exists", async () => {
    // Before this, the page rendered "Cantidad: 0" for a batch nobody had ever
    // weighed — an inferred fact, which CLAUDE.md §3 forbids.
    const result = await computeCurrentQuantity(admin, sinPesar);
    expect(result.recorded).toBe(false);
    expect(result.unit).toBeNull();
  });

  it("reports `recorded: true` where events exist, so a real zero stays sayable", async () => {
    // A lot fully consumed genuinely is zero. That is a different claim from
    // "never weighed", and the page must be able to make it.
    const result = await computeCurrentQuantity(admin, pesado);
    expect(result.recorded).toBe(true);
    expect(result.unit).not.toBeNull();
  });
});
