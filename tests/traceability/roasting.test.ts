/**
 * R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §1, §4).
 * Real Postgres (Neon), no mocks. Covers §4.1 (roast profile queryable, not
 * just by lot code), §4.2 (roaster as a comparable variable across
 * equipment), §4.3 (pre-roast green measurement distinguished from
 * storage-phase), and §4.5 (A7/F1/S1 real data intact).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { getRoastSessionDetail, listRoastSessions, recordRoastSession, RoastSessionValidationError } from "../../lib/traceability/roasting";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `r1-roast-${Date.now()}`;

let organizationId: string;
let projectId: string;
let otherProjectId: string;
let greenLotId: string;
let wrongProjectLotId: string;
let greenSampleId: string;
let authorizedUserAccountId: string;
let wrongProjectUserAccountId: string;
let gabrielPersonId: string;
let mariaPersonId: string;

const outputLotIds: string[] = [];

async function createTestUserAccount(label: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "en" },
  });
  const userAccount = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  return userAccount.id;
}

async function assignFarmOperator(userAccountId: string, projectRefId: string) {
  const farmOperatorProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectRefId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperatorProfile.id, scopeId: scope.id } });
}

beforeAll(async () => {
  const organization = await prisma.organization.create({
    data: { organizationType: "roaster", name: `TEST Roastery (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = organization.id;

  const project = await prisma.project.create({ data: { name: `TEST R1 Project (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } });
  projectId = project.id;
  const otherProject = await prisma.project.create({ data: { name: `TEST R1 Other Project (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } });
  otherProjectId = otherProject.id;

  const greenLot = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-green`, lotType: "green", organizationId, projectId },
  });
  greenLotId = greenLot.id;
  const greenSample = await prisma.sample.create({
    data: {
      sampleCode: `${RUN_ID}-sample`, sampleType: "green_coffee", materialState: "GREEN",
      massAtExtraction: 0.3, massUnitAtExtraction: "kg", sourceLotId: greenLot.id,
      organizationId, projectId,
    },
  });
  greenSampleId = greenSample.id;

  // Lives here, not in the test that uses it: created inside the test body it
  // was tracked by nothing and leaked one row per run — the very defect
  // ADR-086 closed, reintroduced by the test written to prove ADR-087.
  const wrongProjectLot = await prisma.lot.create({
    data: { lotCode: `${RUN_ID}-other-green`, lotType: "green", organizationId, projectId: otherProjectId },
  });
  wrongProjectLotId = wrongProjectLot.id;

  authorizedUserAccountId = await createTestUserAccount("R1Operator");
  await assignFarmOperator(authorizedUserAccountId, projectId);
  wrongProjectUserAccountId = await createTestUserAccount("R1WrongProjectOperator");
  await assignFarmOperator(wrongProjectUserAccountId, otherProjectId);

  const gabriel = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Gabriel", displayName: `TEST Gabriel (${RUN_ID})`, locale: "es" },
  });
  gabrielPersonId = gabriel.id;
  const maria = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Maria", displayName: `TEST Maria (${RUN_ID})`, locale: "es" },
  });
  mariaPersonId = maria.id;
  await prisma.organizationMembership.createMany({
    data: [gabrielPersonId, mariaPersonId].map((personId) => ({ personId, organizationId })),
  });
});

afterAll(async () => {
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ lotId: greenLotId }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: [greenLotId, ...outputLotIds] } }) });
  await prisma.lotTransformation.deleteMany({
    where: assertDefinedWhere({
      OR: [
        { inputs: { some: { lotId: { in: [greenLotId, wrongProjectLotId] } } } },
        { outputs: { some: { lotId: { in: outputLotIds } } } },
      ],
    }),
  });
  // Every session this file creates goes through recordRoastSession, which
  // stamps `createdBy` with the acting account — so this catches all of them,
  // including §4.1's three, which name no roaster. Matching on
  // `roasterPersonId` alone was the leak: those three survived every run, 79
  // of them reached production, and `listRoastSessions`'s `take: 200` turned
  // the pile into an intermittent failure once it crossed the limit (ADR-085).
  //
  // This must run before the UserAccounts are deleted below. `createdBy` is a
  // nullable FK, so removing the account first sets it to null and the sessions
  // become unmatchable — which is precisely why every row ADR-085 removed from
  // production carried `created_by = null` despite having been created with it
  // set. The roaster clause stays as a second net for any session a future test
  // writes through Prisma directly rather than through the service.
  const roastSessionOwners = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.roastSession.deleteMany({
    where: assertDefinedWhere({
      OR: [
        { createdBy: { in: roastSessionOwners } },
        { roasterPersonId: { in: [gabrielPersonId, mariaPersonId] } },
      ],
    }),
  });
  await prisma.organizationMembership.deleteMany({
    where: assertDefinedWhere({ personId: { in: [gabrielPersonId, mariaPersonId] } }),
  });

  // The assertion that would have caught this the first time it happened.
  // A cleanup nothing checks is a cleanup that can silently stop working, and
  // this one did for long enough to reach production.
  //
  // Scoped to our own accounts rather than a global count: three other files
  // create RoastSessions and vitest runs files in parallel, so a total would be
  // measuring them too.
  expect(await prisma.roastSession.count({ where: { createdBy: { in: roastSessionOwners } } })).toBe(0);
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: greenSampleId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: [greenLotId, wrongProjectLotId, ...outputLotIds] } }) });

  const userAccountIds = [authorizedUserAccountId, wrongProjectUserAccountId];
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [projectId, otherProjectId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: { in: [projectId, otherProjectId] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });

  // Asked of Lots too, since this file creates those and a leak there is what
  // the /lots page surfaced (ADR-087).
  //
  // At the END, after every delete. Placed mid-cleanup it throws before the
  // later statements run, so the assertion itself strands the rows it is
  // complaining about — which is exactly what happened when it was first
  // written, and produced twelve orphaned lots per run rather than one.
  expect(await prisma.lot.count({ where: { lotCode: { contains: RUN_ID } } })).toBe(0);
});

describe("recordRoastSession — validation and access", () => {
  it("tuesta una muestra sin descontar por segunda vez el lote y limita su masa", async () => {
    const antes = await prisma.quantityEvent.count({ where: { lotId: greenLotId } });
    const { roastSession, transformation, outputLot, reconciliation } = await recordRoastSession(authorizedUserAccountId, {
      purpose: "sample",
      sourceSampleId: greenSampleId,
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-sample-roast`,
      chargeWeightKg: 0.2,
      dischargeWeightKg: 0.17,
      startedAt: new Date("2027-01-10T07:00:00Z"),
      provenanceClass: "direct_observation",
    });
    outputLotIds.push(outputLot.id);

    expect(roastSession.sourceSampleId).toBe(greenSampleId);
    expect(reconciliation).toBeNull();
    expect(transformation.id).toBeTruthy();
    expect(await prisma.quantityEvent.count({ where: { lotId: greenLotId } })).toBe(antes);

    await expect(recordRoastSession(authorizedUserAccountId, {
      purpose: "sample", sourceSampleId: greenSampleId, lotId: greenLotId,
      outputLotCode: `${RUN_ID}-sample-over`, chargeWeightKg: 0.11, dischargeWeightKg: 0.09,
      startedAt: new Date("2027-01-10T07:30:00Z"), provenanceClass: "direct_observation",
    })).rejects.toThrow(/sample_mass_exceeded/);
  });

  it("no consume más muestra disponible con dos tuestes simultáneos", async () => {
    const concurrentSample = await prisma.sample.create({ data: {
      sampleCode: `${RUN_ID}-concurrent`, sampleType: "green_coffee", materialState: "GREEN",
      massAtExtraction: 0.3, massUnitAtExtraction: "kg", sourceLotId: greenLotId,
      organizationId, projectId,
    } });
    try {
      const results = await Promise.allSettled(["a", "b"].map((suffix) => recordRoastSession(authorizedUserAccountId, {
        purpose: "sample", sourceSampleId: concurrentSample.id, lotId: greenLotId,
        outputLotCode: `${RUN_ID}-concurrent-${suffix}`, chargeWeightKg: 0.2, dischargeWeightKg: 0.17,
        startedAt: new Date("2027-01-10T08:00:00Z"), provenanceClass: "direct_observation",
      })));
      for (const result of results) if (result.status === "fulfilled") outputLotIds.push(result.value.outputLot.id);
      const usage = await prisma.roastSession.aggregate({where:{sourceSampleId:concurrentSample.id},_sum:{chargeWeightKg:true}});
      expect(Number(usage._sum.chargeWeightKg)).toBeLessThanOrEqual(0.3);
      expect(results.filter((result)=>result.status === "fulfilled")).toHaveLength(1);
    } finally {
      // The normal fixture cleanup owns all roast records and output lots.
      await prisma.sample.delete({where:{id:concurrentSample.id}});
    }
  });

  it("rejects a user with no access to the source lot's project", async () => {
    await expect(
      recordRoastSession(wrongProjectUserAccountId, {
              // Anterior a la distinción muestra/producción (2026-09-06): se asume
      // `production`, el mismo supuesto que hace la migración con las filas
      // que ya existieran. Ninguna de estas pruebas afirma nada sobre él.
      purpose: "production",
lotId: greenLotId,
        outputLotCode: `${RUN_ID}-reject-access`,
        startedAt: new Date("2027-01-10T08:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(TraceabilityAccessError);
  });

  it("rejects an end time before the start time", async () => {
    await expect(
      recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-reject-time`,
        startedAt: new Date("2027-01-10T08:15:00Z"),
        endedAt: new Date("2027-01-10T08:00:00Z"),
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(RoastSessionValidationError);
  });

  it("rejects a discharge weight exceeding the charge weight", async () => {
    await expect(
      recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-reject-weight`,
        startedAt: new Date("2027-01-10T08:00:00Z"),
        chargeWeightKg: 10,
        dischargeWeightKg: 12,
        provenanceClass: "direct_observation",
      }),
    ).rejects.toThrow(RoastSessionValidationError);
  });
});

describe("§4.1 — one green lot roasted three ways, queryable by profile", () => {
  it("records three separate RoastSessions from the same green lot, each independently queryable by roastLevel", async () => {
    const profiles = ["claro filtro", "medio espresso", "oscuro"];
    for (const [i, roastLevel] of profiles.entries()) {
      const { roastSession, outputLot } = await recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
        lotId: greenLotId,
        outputLotCode: `${RUN_ID}-roast-${i}`,
        roastLevel,
        chargeWeightKg: 5,
        dischargeWeightKg: 4.2,
        startedAt: new Date(`2027-01-10T${String(8 + i).padStart(2, "0")}:00:00Z`),
        endedAt: new Date(`2027-01-10T${String(8 + i).padStart(2, "0")}:12:00Z`),
        provenanceClass: "direct_observation",
      });
      outputLotIds.push(outputLot.id);
      expect(roastSession.roastLevel).toBe(roastLevel);
      expect(outputLot.lotType).toBe("roast");
    }

    const { items: claroSessions } = await listRoastSessions(authorizedUserAccountId, { roastLevel: "claro filtro" });
    expect(claroSessions.length).toBeGreaterThanOrEqual(1);
    expect(claroSessions.every((s) => s.roastLevel === "claro filtro")).toBe(true);

    // All three roasts share the same source green lot as input — the DAG
    // has three children from one parent, even though each is its own
    // stage_change transformation rather than one shared split.
    const { items: allFromThisLot } = await listRoastSessions(authorizedUserAccountId, {});
    const ourSessions = allFromThisLot.filter((s) =>
      s.purpose === "production" && s.transformations.some((t) => t.inputs.some((i) => i.lot.id === greenLotId)),
    );
    expect(ourSessions.length).toBe(3);
  });
});

describe("§4.2 — same coffee, two roasters, two machines — roaster as a queryable variable", () => {
  it("records Gabriel and Maria roasting the same green lot on different equipment, each independently queryable by roaster", async () => {
    const { roastSession: gabrielSession, outputLot: gabrielLot } = await recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-gabriel`,
      roastLevel: "medio",
      equipmentNote: "TEST Probat 5kg",
      roasterPersonId: gabrielPersonId,
      startedAt: new Date("2027-01-11T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    outputLotIds.push(gabrielLot.id);

    const { roastSession: mariaSession, outputLot: mariaLot } = await recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-maria`,
      roastLevel: "medio",
      equipmentNote: "TEST Loring S15",
      roasterPersonId: mariaPersonId,
      startedAt: new Date("2027-01-11T09:00:00Z"),
      provenanceClass: "direct_observation",
    });
    outputLotIds.push(mariaLot.id);

    expect(gabrielSession.roasterPersonId).toBe(gabrielPersonId);
    expect(mariaSession.roasterPersonId).toBe(mariaPersonId);
    expect(gabrielSession.equipmentNote).not.toBe(mariaSession.equipmentNote);

    const { items: gabrielSessions } = await listRoastSessions(authorizedUserAccountId, { roasterPersonId: gabrielPersonId });
    const { items: mariaSessions } = await listRoastSessions(authorizedUserAccountId, { roasterPersonId: mariaPersonId });
    expect(gabrielSessions.some((s) => s.id === gabrielSession.id)).toBe(true);
    expect(gabrielSessions.some((s) => s.id === mariaSession.id)).toBe(false);
    expect(mariaSessions.some((s) => s.id === mariaSession.id)).toBe(true);
  });

  it("rejects a user with no access when reading roast session detail", async () => {
    const { roastSession } = await recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-detail-access`,
      startedAt: new Date("2027-01-12T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const detail = await getRoastSessionDetail(authorizedUserAccountId, roastSession.id);
    expect(detail.id).toBe(roastSession.id);
    outputLotIds.push(detail.transformations[0]!.outputs[0]!.lot.id);

    await expect(getRoastSessionDetail(wrongProjectUserAccountId, roastSession.id)).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("§4.3 — pre-roast green measurement distinguished from a storage-phase one", () => {
  it("a measurement carrying roastSessionId is distinguishable from an ordinary Lot measurement with none", async () => {
    const { roastSession } = await recordRoastSession(authorizedUserAccountId, {
      purpose: "production",
      lotId: greenLotId,
      outputLotCode: `${RUN_ID}-moisture`,
      startedAt: new Date("2027-01-13T08:00:00Z"),
      provenanceClass: "direct_observation",
    });
    const detail = await getRoastSessionDetail(authorizedUserAccountId, roastSession.id);
    outputLotIds.push(detail.transformations[0]!.outputs[0]!.lot.id);

    const preRoastMeasurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 10.5,
      unit: "%",
      occurredAt: new Date("2027-01-13T07:55:00Z"),
      lotId: greenLotId,
      roastSessionId: roastSession.id,
      provenanceClass: "measured_fact",
    });
    const storagePhaseMeasurement = await recordMeasurement(authorizedUserAccountId, {
      variable: "moisture",
      value: 11.2,
      unit: "%",
      occurredAt: new Date("2027-01-01T08:00:00Z"),
      lotId: greenLotId,
      provenanceClass: "measured_fact",
    });

    expect(preRoastMeasurement.roastSessionId).toBe(roastSession.id);
    expect(storagePhaseMeasurement.roastSessionId).toBeNull();
    expect(preRoastMeasurement.lotId).toBe(storagePhaseMeasurement.lotId);
  });
});

describe("§4.5 — A7/F1/S1 real data left untouched", () => {
  it("Cerro Azul real data is unaffected by R1's writes", async () => {
        // Renombrado 2026-08-29 (scripts/rename-finca-rosina.ts): la finca es
    // **Finca Rosina**, Cerro Azul es la localidad donde está, y "Las Nubes" es
    // el nombre del beneficio. Los dos proyectos y los seis lotes son los
    // mismos de siempre; lo que cambió es cómo se llaman. Buscar "Nubes" o
    // "Cerro Azul" en estos nombres devolvía 0 y hacía fallar la aserción sin
    // que nada hubiera tocado los datos que promete proteger.
    const fincaRosinaProjects = await prisma.project.findMany({ where: { name: { contains: "Finca Rosina" } } });
    // Scoped to Cerro Azul, which is what this assertion is actually about.
    // It previously counted every Location named "Lote" anywhere on the
    // platform and expected exactly 6 — so any legitimate new plot broke it.
    // I1's Cafelino import creates real plots ("Lote 9 — Cafelino", "Lote 10 —
    // Cafelino"), which made this fail without anything having touched Cerro
    // Azul at all. The guarantee worth keeping is that Cerro Azul's own six
    // are untouched, not that the platform never grows a seventh plot.
    const lotes = await prisma.location.findMany({
      where: { AND: [{ name: { contains: "Lote" } }, { name: { contains: "Finca Rosina" } }] },
    });
    expect(fincaRosinaProjects.length).toBe(2);
    expect(lotes.length).toBe(6);

    const roastSessionResidue = await prisma.roastSession.findMany({ where: { roasterPersonId: { in: [gabrielPersonId, mariaPersonId] } } });
    expect(roastSessionResidue.length).toBeGreaterThan(0); // still present mid-suite, cleaned in afterAll
  });
});

describe("the row cap is spent on rows the caller can see — ADR-087", () => {
  it("returns the caller's own session even when newer invisible ones would fill the limit", async () => {
    // The defect: `listRoastSessions` took the newest N platform-wide and only
    // then dropped what the caller could not see, so the cap was consumed by
    // other people's sessions. A roaster scoped to one project could be shown
    // nothing while their own rows sat just past the limit. That is not a cap,
    // it is a wrong answer — and it is what let ADR-086's test lose its own
    // three rows behind 200 leaked ones.
    //
    // A limit of 2 reproduces at three fixtures what would otherwise need 201.
    // Three sessions the authorized caller cannot see, all NEWER than theirs.
    for (let i = 0; i < 3; i++) {
      const { outputLot } = await recordRoastSession(wrongProjectUserAccountId, {
      purpose: "production",
        lotId: wrongProjectLotId,
        outputLotCode: `${RUN_ID}-other-roast-${i}`,
        startedAt: new Date(`2027-02-0${i + 1}T08:00:00Z`),
        provenanceClass: "direct_observation",
      });
      outputLotIds.push(outputLot.id);
    }

    // With a limit of 2, the two newest rows in the whole table are now the
    // invisible ones above. The old ordering would take those, filter them
    // out, and hand back a list shorter than the cap — or empty. The fix
    // spends the cap on rows this caller can see, so it comes back full.
    const { items } = await listRoastSessions(authorizedUserAccountId, {}, 2);
    expect(items.length).toBe(2);

    // And every one of them is genuinely the caller's.
    for (const session of items) {
      const inputLots = session.transformations.flatMap((t) => t.inputs.map((i) => i.lot));
      expect(inputLots.some((lot) => lot.projectId === projectId)).toBe(true);
    }
  });

  it("never returns a session belonging to another caller's project", async () => {
    // The filter has moved into SQL; this is the property that must survive
    // the move. Asserted over every returned row rather than spot-checked.
    const { items } = await listRoastSessions(authorizedUserAccountId, {});
    for (const session of items) {
      const inputLots = session.transformations.flatMap((t) => t.inputs.map((i) => i.lot));
      expect(inputLots.some((lot) => lot.projectId === projectId)).toBe(true);
    }
  });

  it("reports truncation instead of presenting a cut-off list as the whole set", async () => {
    const capped = await listRoastSessions(authorizedUserAccountId, {}, 1);
    expect(capped.items.length).toBe(1);
    expect(capped.truncated).toBe(true);
    expect(capped.limit).toBe(1);

    // And says nothing was cut when nothing was.
    const roomy = await listRoastSessions(authorizedUserAccountId, {}, 500);
    expect(roomy.truncated).toBe(false);
  });
});

describe("serie automática por lote de origen", () => {
  it("asigna códigos diferentes a dos muestras del mismo lote registradas simultáneamente", async () => {
    const samples = [];
    for (const suffix of ["a", "b"]) samples.push(await prisma.sample.create({data:{
      sampleCode:`${RUN_ID}-series-${suffix}`,sampleType:"green_coffee",materialState:"GREEN",
      massAtExtraction:0.3,massUnitAtExtraction:"kg",sourceLotId:greenLotId,organizationId,projectId,
    }}));
    try {
      const results=await Promise.allSettled(samples.map((sample)=>recordRoastSession(authorizedUserAccountId,{
        purpose:"sample",sourceSampleId:sample.id,lotId:greenLotId,chargeWeightKg:0.2,dischargeWeightKg:0.17,
        startedAt:new Date("2027-01-10T09:00:00Z"),provenanceClass:"direct_observation",
      })));
      const successful=results.filter((result)=>result.status === "fulfilled");
      for(const result of successful) outputLotIds.push(result.value.outputLot.id);
      expect(successful).toHaveLength(2);
      const codes=successful.map((result)=>result.value.outputLot.lotCode);
      expect(new Set(codes).size).toBe(2);
      for(const code of codes) expect(code).toMatch(/-green-T[0-9]{2}$/);
      const numbers=codes.map((code)=>Number(code.slice(-2))).sort((a,b)=>a-b);
      expect(numbers[1]! - numbers[0]!).toBe(1);
    } finally {
      await prisma.sample.deleteMany({where:{id:{in:samples.map((sample)=>sample.id)}}});
    }
  });
  it("conserva el consecutivo si cambia el código del lote de origen", async () => {
    const input={purpose:"sample" as const,lotId:greenLotId,startedAt:new Date("2027-01-10T10:00:00Z"),provenanceClass:"direct_observation" as const};
    const first=await recordRoastSession(authorizedUserAccountId,input);
    outputLotIds.push(first.outputLot.id);
    await prisma.lot.update({where:{id:greenLotId},data:{lotCode:`${RUN_ID}-renamed`}});
    try {
      const second=await recordRoastSession(authorizedUserAccountId,input);
      outputLotIds.push(second.outputLot.id);
      expect(second.outputLot.lotCode).toBe(`${RUN_ID}-renamed-T${String(Number(first.outputLot.lotCode.slice(-2))+1).padStart(2,"0")}`);
      expect((await prisma.lot.findUniqueOrThrow({where:{id:first.outputLot.id}})).lotCode).toBe(first.outputLot.lotCode);
    } finally {
      await prisma.lot.update({where:{id:greenLotId},data:{lotCode:`${RUN_ID}-green`}});
    }
  });
  it("no agota la serie por un lote ajeno con un prefijo extendido", async () => {
    const unrelated=await prisma.lot.create({data:{lotCode:`${RUN_ID}-green-TOTHER-T99`,lotType:"roast",organizationId,projectId}});
    outputLotIds.push(unrelated.id);
    const result=await recordRoastSession(authorizedUserAccountId,{
      purpose:"sample",lotId:greenLotId,startedAt:new Date("2027-01-10T10:00:00Z"),provenanceClass:"direct_observation",
    });
    outputLotIds.push(result.outputLot.id);
    expect(result.outputLot.lotCode).toMatch(/-green-T[0-9]{2}$/);
    expect(result.outputLot.lotCode).not.toContain("TOTHER");
  });
  it("no reinicia ni llena huecos al llegar a T99", async () => {
    const reserved=await prisma.lot.create({data:{lotCode:`${RUN_ID}-green-T99`,lotType:"roast",organizationId,projectId}});
    outputLotIds.push(reserved.id);
    const before=await prisma.roastSession.count({where:{createdBy:authorizedUserAccountId}});
    await expect(recordRoastSession(authorizedUserAccountId,{
      purpose:"sample",lotId:greenLotId,startedAt:new Date("2027-01-10T10:00:00Z"),provenanceClass:"direct_observation",
    })).rejects.toThrow("sample_roast_series_exhausted");
    expect(await prisma.roastSession.count({where:{createdBy:authorizedUserAccountId}})).toBe(before);
  });
});
