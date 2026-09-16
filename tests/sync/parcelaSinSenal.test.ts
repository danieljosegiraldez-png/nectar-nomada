/**
 * Cola offline para captura de parcela — Tarea 1. Ver
 * `.superpowers/sdd/2026-09-16-cola-offline-captura-de-parcela/task-1-brief.md`.
 *
 * Postgres real, fixtures acotadas por RUN_ID, sin mocks — mismo estilo que
 * `tests/sync/pushFieldEvents.test.ts`.
 *
 * Lo que este test defiende: que reintentar una muestra de suelo cuya
 * respuesta se perdió no cree una segunda fila. Se comprueba por rechazo del
 * índice único, no porque la segunda llamada devuelva algo con buena pinta.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";

const RUN_ID = `parcela-sin-senal-${Date.now()}`;

let organizationId: string;
let locationId: string;
let userAccountId: string;

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const location = await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  });
  locationId = location.id;

  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operador", displayName: `TEST Operador (${RUN_ID})`, locale: "es" },
  });
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  userAccountId = account.id;
});

afterAll(async () => {
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ locationId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("clientDraftId en la captura de parcela", () => {
  it("dos muestras de suelo con el mismo clientDraftId no pueden coexistir", async () => {
    const draft = `draft-${Date.now()}`;
    await prisma.soilSample.create({
      data: {
        locationId,
        sampleCode: `A-${draft}`,
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
        clientDraftId: draft,
        createdBy: userAccountId,
      },
    });
    await expect(
      prisma.soilSample.create({
        data: {
          locationId,
          sampleCode: `B-${draft}`,
          sampledAt: new Date(),
          provenanceClass: "direct_observation",
          clientDraftId: draft,
          createdBy: userAccountId,
        },
      }),
    ).rejects.toThrow();
  });
});

/**
 * Task 2 — el parseo reconoce los cuatro tipos de captura de parcela. Puras:
 * sin base ni fixtures, a diferencia del describe de arriba.
 */
describe("el lote reconoce los cuatro tipos de captura de parcela", () => {
  it("parsea una muestra de suelo encolada", () => {
    const r = parsearMutaciones([
      {
        kind: "soil_sample",
        clientDraftId: "d1",
        locationId: "loc1",
        sampleCode: "S-01",
        sampledAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1); // control: cuántas parseó, no sólo que no falló
    expect(r.mutations[0]).toMatchObject({ kind: "soil_sample", sampledAt: new Date("2026-09-16T12:00:00.000Z") });
  });

  it("una muestra sin sampleCode es malformada", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", clientDraftId: "d1", locationId: "loc1", sampledAt: "2026-09-16T12:00:00.000Z" },
    ]);
    expect(r).toEqual({ ok: false, error: "mutation_malformed" });
  });

  it("parsea una muestra foliar encolada", () => {
    const r = parsearMutaciones([
      {
        kind: "foliar_sample",
        clientDraftId: "d2",
        locationId: "loc1",
        sampleCode: "F-01",
        sampledAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "foliar_sample", sampledAt: new Date("2026-09-16T12:00:00.000Z") });
  });

  it("parsea un perfil de suelo encolado", () => {
    const r = parsearMutaciones([
      {
        kind: "soil_profile",
        clientDraftId: "d3",
        locationId: "loc1",
        describedAt: "2026-09-16T12:00:00.000Z",
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "soil_profile", describedAt: new Date("2026-09-16T12:00:00.000Z") });
  });

  it("un perfil de suelo sin describedAt es malformado", () => {
    const r = parsearMutaciones([
      { kind: "soil_profile", clientDraftId: "d3", locationId: "loc1", provenanceClass: "direct_observation" },
    ]);
    expect(r).toEqual({ ok: false, error: "mutation_malformed" });
  });

  it("parsea una siembra encolada, con plantedAt ausente", () => {
    const r = parsearMutaciones([
      { kind: "planting_cohort", clientDraftId: "d4", locationId: "loc1", provenanceClass: "direct_observation" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "planting_cohort", plantedAt: null });
  });

  it("una mutación de parcela sin locationId no tiene ids", () => {
    const r = parsearMutaciones([
      { kind: "soil_sample", clientDraftId: "d1", sampleCode: "S-01", sampledAt: "2026-09-16T12:00:00.000Z" },
    ]);
    expect(r).toEqual({ ok: false, error: "mutation_missing_ids" });
  });
});
