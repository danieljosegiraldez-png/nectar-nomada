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
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";

const RUN_ID = `parcela-sin-senal-${Date.now()}`;

let organizationId: string;
let locationId: string;
let userAccountId: string;
let deviceId: string;
let scopeId: string;

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

  // Task 3 — `aplicarCapturaDeParcela` llama a `createSoilSample`, y ésa exige
  // `location:manage_attributes` vía `requireLocationAttributeAccess`. Sin
  // esta asignación, todas las mutaciones de este bloque volverían `rejected`
  // con `no_location_attribute_access` en vez de `applied`.
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } });
  scopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: profile.id, scopeId } });

  // `pushFieldEvents` busca el `deviceId` en la tabla `Device`, cuyo `id` es
  // `@db.Uuid`: un literal como `"dev1"` no es un UUID válido y Prisma lo
  // rechaza antes de llegar a la base. Se necesita un dispositivo real.
  const device = await prisma.device.create({
    data: { label: `TEST PWA (${RUN_ID})`, platform: "pwa", createdBy: userAccountId },
  });
  deviceId = device.id;
});

afterAll(async () => {
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ locationId }) });
  // Ronda de arreglo 1 — la prueba de `dataQuality` en siembra crea un
  // `PlantingCohort` en este mismo `locationId`.
  await prisma.plantingCohort.deleteMany({ where: assertDefinedWhere({ locationId }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ id: deviceId }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
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

/**
 * Task 3 — el replay aplica la captura de parcela contra la base, una sola
 * vez. Postgres real, contra el `locationId`/`deviceId`/`userAccountId` del
 * `beforeAll` de arriba.
 */
describe("el replay aplica la captura de parcela y no la duplica", () => {
  it("aplica una vez y la segunda dice duplicate, con UNA sola fila", async () => {
    const m = {
      kind: "soil_sample" as const,
      clientDraftId: `d-${Date.now()}`,
      locationId,
      sampleCode: `S-${Date.now()}`,
      sampledAt: new Date(),
      provenanceClass: "direct_observation",
    };
    const [primera] = await pushFieldEvents(userAccountId, deviceId, [m]);
    const [segunda] = await pushFieldEvents(userAccountId, deviceId, [m]);
    expect(primera).toMatchObject({ status: "applied" });
    expect(segunda).toMatchObject({ status: "duplicate" });
    // El control que pide CLAUDE.md: contar filas, no conformarse con que la
    // segunda llamada diga "duplicate".
    expect(await prisma.soilSample.count({ where: { clientDraftId: m.clientDraftId } })).toBe(1);
  });

  it("un código vacío vuelve como rejected, no como excepción", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "soil_sample" as const,
        clientDraftId: `d-${Date.now()}`,
        locationId,
        sampleCode: "   ",
        sampledAt: new Date(),
        provenanceClass: "direct_observation",
      },
    ]);
    expect(r).toMatchObject({ status: "rejected", reason: "sample_code_required" });
  });
});

/**
 * Ronda de arreglo 1 sobre Task 3.
 *
 * CRÍTICO: `aplicarCapturaDeParcela` no reenviaba `dataQuality` a ninguno de
 * los cuatro servicios. No es cosmético en siembra: `createPlantingCohort`
 * EXIGE `dataQuality` cuando el cultivar tiene `impliesUnknownIdentity: true`
 * (`plantingCohorts.ts` `requireDataQualityForUnknownCultivar`), así que toda
 * siembra encolada sin señal con un cultivar de identidad desconocida volvía
 * `rejected` con `data_quality_required_for_unknown_cultivar` — un rechazo
 * que se lee como dato malo del operador y era el transporte descartando el
 * campo.
 */
describe("dataQuality viaja en las cuatro ramas de captura de parcela", () => {
  it("una siembra con cultivar de identidad desconocida y su dataQuality puesto vuelve applied, no rejected", async () => {
    const cultivarDesconocido = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "desconocido", catalog: { key: "cultivar" } },
    });
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "planting_cohort" as const,
        clientDraftId: `d-${Date.now()}`,
        locationId,
        provenanceClass: "direct_observation",
        cultivarValueId: cultivarDesconocido.id,
        dataQuality: "provisional",
      },
    ]);
    // Sin el reenvío de `dataQuality`, esto cae en `rejected` con
    // `data_quality_required_for_unknown_cultivar` — confirmado en rojo antes
    // de escribir el arreglo (ver task-3-report.md).
    expect(r).toMatchObject({ status: "applied" });
  });
});

/**
 * Ronda de arreglo 2 sobre Task 3.
 *
 * IMPORTANTE: `MutacionDeSiembra` no llevaba `plantedPrecision`.
 * `createPlantingCohort` (`plantingCohorts.ts:120`) exige `plantedPrecision`
 * cuando hay `plantedAt` — «una fecha de siembra sin precisión es una fecha
 * que afirma más de lo que sabe» — así que TODA siembra encolada con fecha
 * puesta, que es el caso normal, volvía `rejected` con
 * `planted_precision_required`.
 */
describe("plantedPrecision viaja junto a plantedAt en la siembra", () => {
  it("una siembra con plantedAt y su plantedPrecision puesto vuelve applied, no rejected", async () => {
    const [r] = await pushFieldEvents(userAccountId, deviceId, [
      {
        kind: "planting_cohort" as const,
        clientDraftId: `d-${Date.now()}`,
        locationId,
        provenanceClass: "direct_observation",
        plantedAt: new Date("2026-03-01T00:00:00.000Z"),
        plantedPrecision: "date",
      },
    ]);
    // Sin el reenvío de `plantedPrecision`, esto cae en `rejected` con
    // `planted_precision_required` — confirmado en rojo antes de escribir el
    // arreglo (ver task-3-report.md, ronda 2).
    expect(r).toMatchObject({ status: "applied" });
  });
});

/**
 * IMPORTANTE: dos llamadas concurrentes con el mismo `clientDraftId` pueden
 * pasar las dos el `findUnique` antes de que la primera termine su `create`.
 * La perdedora chocaba contra el índice único con un `P2002` que ninguna de
 * las cuatro clases de error reconocía, así que subía como excepción no
 * controlada en vez de resolver a `duplicate`.
 *
 * `Promise.all` con la MISMA mutación ejerce el camino concurrente de
 * verdad — no es la llamada secuencial de la prueba de arriba. Si la
 * excepción no controlada volviera, esta prueba fallaría con ella (no con un
 * `expect` roto), que es justo la forma en que se descubrió el defecto.
 */
describe("una carrera de push con el mismo clientDraftId no lanza excepción", () => {
  it("de las dos llamadas concurrentes, una aplica y la otra dice duplicate, con UNA sola fila", async () => {
    const draft = `d-race-${Date.now()}`;
    // MISMO `clientDraftId`, `sampleCode` DISTINTO: si las dos llamadas
    // llevaran también el mismo `sampleCode`, la perdedora podría chocar
    // contra `@@unique([locationId, sampleCode])` en vez de contra
    // `client_draft_id` —medido: eso es exactamente lo que pasó al escribir
    // esta prueba, con las dos mutaciones idénticas—, y entonces la prueba no
    // ejercería la carrera que el arreglo cubre.
    const base = {
      kind: "soil_sample" as const,
      clientDraftId: draft,
      locationId,
      sampledAt: new Date(),
      provenanceClass: "direct_observation",
    };
    const [[a], [b]] = await Promise.all([
      pushFieldEvents(userAccountId, deviceId, [{ ...base, sampleCode: `S-race-a-${Date.now()}` }]),
      pushFieldEvents(userAccountId, deviceId, [{ ...base, sampleCode: `S-race-b-${Date.now()}` }]),
    ]);
    expect([a!.status, b!.status].sort()).toEqual(["applied", "duplicate"]);
    expect(await prisma.soilSample.count({ where: { clientDraftId: draft } })).toBe(1);
  });
});
