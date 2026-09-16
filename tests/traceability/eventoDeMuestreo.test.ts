import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import * as audit from "../../lib/audit";
import { createSamplingEvent, type CreateSamplingEventInput } from "../../lib/traceability/samplingEvents";
import type { LocationType, Prisma } from "../../generated/prisma/client";

const occurredAt = new Date("2026-03-01T09:00:00Z");
const sampleCodes: string[] = [];
const eventIds: string[] = [];
const eventNotes: string[] = [];
const locationIds: string[] = [];
const runIds: string[] = [];
const transformationIds: string[] = [];
const personIds: string[] = [];
const accountIds: string[] = [];
const scopeIds: string[] = [];
let actorId: string;

beforeAll(async () => {
  // Mismo actor sembrado que processTargets.test.ts y recipeAuthoring.test.ts.
  actorId = (await prisma.assignment.findFirstOrThrow({
    where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
    select: { userAccountId: true },
  })).userAccountId;
});

function registrar(ids: string[]) {
  const id = randomUUID();
  ids.push(id); // ANTES de escribir, incluso si una restricción rota acepta la fila.
  return id;
}

function crearDirecto(data: Partial<Prisma.SamplingEventUncheckedCreateInput> = {}) {
  return prisma.samplingEvent.create({ data: { ...data, id: registrar(eventIds), occurredAt } });
}

function crear(input: Partial<CreateSamplingEventInput> = {}, userAccountId = actorId) {
  const notes = `TEST-EV-${randomUUID()}`;
  eventNotes.push(notes); // El servicio genera su ID: la nota permite limpiarlo aunque no retorne.
  return createSamplingEvent(userAccountId, { ...input, occurredAt, notes });
}

function ubicacion(locationType: LocationType) {
  return prisma.location.create({ data: {
    id: registrar(locationIds), name: `TEST-EV-${randomUUID()}`, locationType,
  } });
}

async function operador(locationId?: string) {
  const personId = registrar(personIds);
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Muestreo", displayName: `TEST-EV-${personId}` } });
  const id = registrar(accountIds);
  await prisma.userAccount.create({ data: { id, personId, authProvider: "credentials", status: "active" } });
  if (locationId) {
    const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scopeId = registrar(scopeIds);
    await prisma.scope.create({ data: { id: scopeId, scopeType: "location", scopeRefId: locationId } });
    await prisma.assignment.create({ data: { userAccountId: id, roleProfileId: profile.id, scopeId } });
  }
  return id;
}

afterEach(async () => {
  vi.restoreAllMocks();
  const eventWhere = { OR: [{ id: { in: eventIds } }, { notes: { in: eventNotes } }] };
  const events = await prisma.samplingEvent.findMany({ where: eventWhere, select: { id: true } });
  const auditWhere = { entityType: "sampling_event", entityId: { in: [...eventIds, ...events.map((e) => e.id)] } };
  const sampleWhere = { sampleCode: { in: sampleCodes } };
  await prisma.sample.deleteMany({ where: sampleWhere });
  await prisma.auditEvent.deleteMany({ where: auditWhere });
  await prisma.samplingEvent.deleteMany({ where: eventWhere });
  await prisma.lotTransformation.deleteMany({ where: { id: { in: transformationIds } } });
  await prisma.dryingRun.deleteMany({ where: { id: { in: runIds } } });
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
  expect(await prisma.sample.count({ where: sampleWhere })).toBe(0);
  expect(await prisma.auditEvent.count({ where: auditWhere })).toBe(0);
  expect(await prisma.samplingEvent.count({ where: eventWhere })).toBe(0);
  expect(await prisma.lotTransformation.count({ where: { id: { in: transformationIds } } })).toBe(0);
  expect(await prisma.dryingRun.count({ where: { id: { in: runIds } } })).toBe(0);
  expect(await prisma.assignment.count({ where: { userAccountId: { in: accountIds } } })).toBe(0);
  expect(await prisma.scope.count({ where: { id: { in: scopeIds } } })).toBe(0);
  expect(await prisma.userAccount.count({ where: { id: { in: accountIds } } })).toBe(0);
  expect(await prisma.person.count({ where: { id: { in: personIds } } })).toBe(0);
  expect(await prisma.location.count({ where: { id: { in: locationIds } } })).toBe(0);
  for (const ids of [sampleCodes, eventIds, eventNotes, locationIds, runIds, transformationIds, personIds, accountIds, scopeIds]) ids.length = 0;
});

describe("el evento de muestreo es el acto que agrupa las muestras", () => {
  it("agrupa las dos muestras de una cama en un acto, y eso es lo que las hace comparables", async () => {
    const lote = await prisma.lot.findFirstOrThrow();
    const ev = await crear();
    const ids: string[] = [];
    for (const samplingZone of ["NORTH", "SOUTH"] as const) {
      const sampleCode = `TEST-EV-${samplingZone}-${randomUUID()}`;
      sampleCodes.push(sampleCode);
      const sample = await prisma.sample.create({ data: {
        sampleCode, sampleType: "green_coffee", sourceLotId: lote.id,
        samplingEventId: ev.id, samplingRole: "ZONE", samplingZone, materialState: "PARCHMENT",
      } });
      ids.push(sample.id);
    }
    const leido = await prisma.samplingEvent.findUniqueOrThrow({ where: { id: ev.id }, include: { samples: true } });
    expect(leido.samples.map((s) => s.id).sort()).toEqual(ids.sort());
    expect(leido.occurredAt).toEqual(occurredAt);
    expect(leido.createdBy).toBe(actorId);
    expect(leido.dryingBedLocationId).toBeNull();
    expect(leido.dryingRunId).toBeNull();
    expect(leido.operatorPersonId).toBeNull();
    const audits = await prisma.auditEvent.findMany({ where: { entityId: ev.id, entityType: "sampling_event" } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ operation: "sampling_event.create", actorUserAccountId: actorId });
  });

  it("revierte el evento si falla la auditoría", async () => {
    const spy = vi.spyOn(audit, "recordAuditEvent").mockRejectedValueOnce(new Error("TEST audit falló"));
    await expect(crear()).rejects.toThrow("TEST audit falló");
    expect(spy).toHaveBeenCalledOnce();
    expect(await prisma.samplingEvent.count({ where: { notes: { in: eventNotes } } })).toBe(0);
  });

  for (const operacion of ["insertar", "actualizar"] as const) {
    for (const tipo of ["site", "drying_bed", null] as const) {
      it(`${operacion}: ${tipo === "site" ? "rechaza sitio" : `acepta ${tipo ?? "null"}`}`, async () => {
        const location = tipo ? await ubicacion(tipo) : null;
        const data = { dryingBedLocationId: location?.id ?? null };
        // Para UPDATE, null reemplaza una cama; los otros casos reemplazan null.
        const initial = operacion === "actualizar"
          ? await crearDirecto({ dryingBedLocationId: tipo === null ? (await ubicacion("drying_bed")).id : null })
          : null;
        const write = initial
          ? prisma.samplingEvent.update({ where: { id: initial.id }, data })
          : crearDirecto(data);
        if (tipo === "site") {
          await expect(write).rejects.toThrow(/cama de secado/i);
        } else {
          expect((await write).dryingBedLocationId).toBe(data.dryingBedLocationId);
        }
      });
    }
  }

  it("acepta al operador de la cama y conserva el operador declarado", async () => {
    const bed = await ubicacion("drying_bed");
    const userId = await operador(bed.id);
    const ev = await crear({ dryingBedLocationId: bed.id, operatorPersonId: personIds[0] }, userId);
    expect(ev.dryingBedLocationId).toBe(bed.id);
    expect(ev.operatorPersonId).toBe(personIds[0]);
  });

  it("rechaza al operador de otra cama y sin contexto no amplía su alcance", async () => {
    const bed = await ubicacion("drying_bed");
    const other = await ubicacion("drying_bed");
    const userId = await operador(other.id);
    await expect(crear({ dryingBedLocationId: bed.id }, userId)).rejects.toThrow("no_sample_access");
    await expect(crear({}, userId)).rejects.toThrow("no_sample_access");
  });

  it("rechaza a una cuenta sin asignación", async () => {
    await expect(crear({}, await operador())).rejects.toThrow("no_sample_access");
  });

  it("resuelve la corrida por su lote y conserva ambos vínculos declarados", async () => {
    const lot = await prisma.lot.findFirstOrThrow();
    const bed = await ubicacion("drying_bed");
    const run = await prisma.dryingRun.create({ data: { id: registrar(runIds), startedAt: occurredAt, dryingBedLocationId: bed.id } });
    await prisma.lotTransformation.create({ data: {
      id: registrar(transformationIds), transformationType: "stage_change", occurredAt,
      dryingRunId: run.id, provenanceClass: "original_record", inputs: { create: { lotId: lot.id } },
    } });
    const ev = await crear({ dryingRunId: run.id, dryingBedLocationId: bed.id });
    expect(ev.dryingRunId).toBe(run.id);
    expect(ev.dryingBedLocationId).toBe(bed.id);
    const sinCamaDeclarada = await crear({ dryingRunId: run.id });
    expect(sinCamaDeclarada.dryingRunId).toBe(run.id);
    expect(sinCamaDeclarada.dryingBedLocationId).toBeNull();
    await expect(crear({ dryingRunId: run.id }, await operador())).rejects.toThrow("no_sample_access");
    // Tener permiso sobre la cama no autoriza el lote de otra ubicación.
    await expect(crear({ dryingRunId: run.id, dryingBedLocationId: bed.id }, await operador(bed.id)))
      .rejects.toThrow("no_sample_access");
  });

  it("rechaza referencias inexistentes antes de escribir", async () => {
    await expect(crear({ dryingRunId: randomUUID() })).rejects.toThrow("drying_run_not_found");
    await expect(crear({ dryingBedLocationId: randomUUID() })).rejects.toThrow("location_not_found");
  });
});
