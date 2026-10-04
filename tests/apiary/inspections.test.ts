/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). Real Postgres (Neon), no mocks. Inspection stays formal and
 * structurally protected — no `feeding`/`treatment` value exists anywhere
 * on this table.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { ApiaryAccessError, createColony, createHive } from "../../lib/apiary/hives";
import { listInspectionsForColony, recordInspection } from "../../lib/apiary/inspections";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a2-insp-${Date.now()}`;

let organizationId: string;
let projectAId: string;
let projectBId: string;
let apiarySiteId: string;
let colonyId: string;

let authorizedUserAccountId: string; // Farm Operator, scope: project A
let wrongProjectUserAccountId: string; // Farm Operator, scope: project B
let unauthorizedUserAccountId: string; // no Assignment at all

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, scope: { scopeType: "project"; scopeRefId: string }) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scopeRow = await prisma.scope.create({ data: scope });
  await prisma.assignment.create({
    data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scopeRow.id },
  });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const apiarySite = await prisma.location.create({
    data: { locationType: "apiary_site", name: `TEST Apiary (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  apiarySiteId = apiarySite.id;

  const projectA = await prisma.project.create({
    data: { name: `TEST Project A (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectAId = projectA.id;

  const projectB = await prisma.project.create({
    data: { name: `TEST Project B (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectBId = projectB.id;

  authorizedUserAccountId = await createTestUserAccount("AuthorizedOperator");
  await assignFarmOperator(authorizedUserAccountId, { scopeType: "project", scopeRefId: projectAId });

  wrongProjectUserAccountId = await createTestUserAccount("WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, { scopeType: "project", scopeRefId: projectBId });

  unauthorizedUserAccountId = await createTestUserAccount("Unauthorized");

  const hive = await createHive(authorizedUserAccountId, {
    identifier: `${RUN_ID}-H-001`,
    locationId: apiarySiteId,
    projectId: projectAId,
  });
  const colony = await createColony(authorizedUserAccountId, {
    hiveId: hive.id,
    startedAt: new Date("2026-01-01"),
    originType: "purchased",
    provenanceClass: "direct_observation",
  });
  colonyId = colony.id;
});

afterAll(async () => {
  await prisma.inspection.deleteMany({ where: assertDefinedWhere({ colonyId }) });
  await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: colonyId }) });
  const testHives = await prisma.hive.findMany({ where: { identifier: { startsWith: RUN_ID } } });
  // La colocación es hija de la colmena y su FK es RESTRICT: sin esta línea el borrado
  // de abajo falla. `createHive` abre una desde el 2026-09-15 (ADR-135).
  await prisma.hivePlacement.deleteMany({ where: assertDefinedWhere({ hive: { id: { in: testHives.map((h) => h.id) } } }) });
  await prisma.hive.deleteMany({ where: assertDefinedWhere({ id: { in: testHives.map((h) => h.id) } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId, unauthorizedUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeRefId: projectAId }, { scopeRefId: projectBId }] }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: apiarySiteId }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectAId, projectBId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("recordInspection", () => {
  it("records the one-tap routine case — outcome nothing_unusual, every optional field null", async () => {
    const inspection = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
    });

    expect(inspection.outcome).toBe("nothing_unusual");
    expect(inspection.broodPattern).toBeNull();
    expect(inspection.queenSighted).toBeNull();
  });

  it("records the expanded-details case — outcome issue_observed with optional fields populated", async () => {
    const inspection = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "issue_observed",
      // **Era texto libre** —«Spotty pattern, several empty cells»— y ahora es uno de los cinco
      // valores del protocolo (`PENDING_IMPLEMENTATIONS/010`, requisito 4). «Salteado» es lo que
      // ese texto describía, y a diferencia del texto se puede agrupar.
      broodPattern: "salteado",
      queenSighted: "no_vista",
      storesLevel: "low",
      pestDiseaseFlags: "possible varroa",
    });

    expect(inspection.outcome).toBe("issue_observed");
    expect(inspection.broodPattern).toBe("salteado");
    expect(inspection.queenSighted).toBe("no_vista");
  });

  /**
   * **«No se buscó» es un hecho, y hasta hoy no se podía decir**
   * (`PENDING_IMPLEMENTATIONS/010`, requisito 4).
   *
   * El protocolo del dueño pregunta la reina con TRES respuestas —`vista`, `no_vista`,
   * `no_se_busco`— y la columna era `Boolean?`: dos estados más el nulo. Así que «miré la pregunta
   * y decidí no buscarla» aterrizaba en el mismo `null` que «nadie contestó», y nada podía
   * distinguirlas. Es la forma de `PENDING_IMPLEMENTATIONS/019` en otro sitio: una ausencia
   * presentada como un hecho.
   *
   * **Las dos filas son el caso y su control, y tienen que salir distintas.** Con la columna
   * booleana las dos daban `null`, así que una prueba que sólo afirmara la primera habría pasado
   * con el defecto puesto.
   */
  it("«no se buscó» se guarda, y NO se confunde con «no se preguntó»", async () => {
    const buscada = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
      queenSighted: "no_se_busco",
    });
    const callada = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
    });
    expect(buscada.queenSighted).toBe("no_se_busco");
    expect(callada.queenSighted).toBeNull();
    expect(buscada.queenSighted).not.toBe(callada.queenSighted);
  });

  it("y los otros dos estados de la reina se guardan como el protocolo los nombra", async () => {
    const vista = await recordInspection(authorizedUserAccountId, {
      colonyId, outcome: "nothing_unusual", queenSighted: "vista",
    });
    const noVista = await recordInspection(authorizedUserAccountId, {
      colonyId, outcome: "issue_observed", queenSighted: "no_vista",
    });
    expect([vista.queenSighted, noVista.queenSighted]).toEqual(["vista", "no_vista"]);
  });

  /**
   * **Patrón de cría y temperamento dejan de ser texto libre.** Eran `String?`, así que cualquier
   * grafía entraba —«Spotty pattern, several empty cells» era un valor legítimo— y nada las podía
   * agrupar. El protocolo ya declaraba sus cinco y sus tres valores desde A9.4; lo que faltaba era
   * que la columna los exigiera.
   */
  it("el patrón de cría y el temperamento sólo aceptan los valores del protocolo", async () => {
    const i = await recordInspection(authorizedUserAccountId, {
      colonyId, outcome: "issue_observed", broodPattern: "salteado", temperament: "defensiva",
    });
    expect([i.broodPattern, i.temperament]).toEqual(["salteado", "defensiva"]);
    // Control: sin decirlos siguen siendo nulos — «no se preguntó» sigue existiendo.
    const sinDecir = await recordInspection(authorizedUserAccountId, {
      colonyId, outcome: "nothing_unusual",
    });
    expect([sinDecir.broodPattern, sinDecir.temperament]).toEqual([null, null]);
  });

  it("fixes provenanceClass to direct_observation at the action layer, not caller-supplied", async () => {
    const inspection = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual" });
    expect(inspection.provenanceClass).toBe("direct_observation");
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(recordInspection(wrongProjectUserAccountId, { colonyId, outcome: "nothing_unusual" })).rejects.toThrow(
      ApiaryAccessError,
    );
  });

  it("denies a user with no Assignment at all", async () => {
    await expect(recordInspection(unauthorizedUserAccountId, { colonyId, outcome: "nothing_unusual" })).rejects.toThrow(
      ApiaryAccessError,
    );
  });

  it("rejects an unknown colonyId", async () => {
    await expect(
      recordInspection(authorizedUserAccountId, { colonyId: "00000000-0000-0000-0000-000000000000", outcome: "nothing_unusual" }),
    ).rejects.toThrow(ApiaryAccessError);
  });
});

describe("listInspectionsForColony", () => {
  it("returns recorded inspections, most recent first", async () => {
    await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual", occurredAt: new Date("2026-02-01") });
    await recordInspection(authorizedUserAccountId, { colonyId, outcome: "issue_observed", occurredAt: new Date("2026-02-10") });

    const rows = await listInspectionsForColony(authorizedUserAccountId, colonyId);
    const [first, second] = rows;
    if (!first || !second) throw new Error("expected at least two rows");
    expect(first.occurredAt.getTime()).toBeGreaterThanOrEqual(second.occurredAt.getTime());
  });

  it("denies a Farm Operator scoped to a different project", async () => {
    await expect(listInspectionsForColony(wrongProjectUserAccountId, colonyId)).rejects.toThrow(ApiaryAccessError);
  });
});

// A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — a retried offline-sync pass
// must be a no-op, not a duplicate row, checked server-side before insert.
describe("recordInspection — clientDraftId idempotency", () => {
  it("a retried call with the same clientDraftId returns the existing row, not a duplicate", async () => {
    const clientDraftId = `${RUN_ID}-draft-1`;

    const first = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual", clientDraftId });
    const retried = await recordInspection(authorizedUserAccountId, { colonyId, outcome: "nothing_unusual", clientDraftId });

    expect(retried.id).toBe(first.id);
    const rows = await prisma.inspection.findMany({ where: { clientDraftId } });
    expect(rows).toHaveLength(1);
  });

  it("two different clientDraftIds produce two distinct rows", async () => {
    const first = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
      clientDraftId: `${RUN_ID}-draft-2a`,
    });
    const second = await recordInspection(authorizedUserAccountId, {
      colonyId,
      outcome: "nothing_unusual",
      clientDraftId: `${RUN_ID}-draft-2b`,
    });

    expect(first.id).not.toBe(second.id);
  });
});
