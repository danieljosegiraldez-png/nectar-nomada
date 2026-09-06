/**
 * Pulsar «guardar» dos veces no escribe dos filas.
 *
 * **El defecto (2026-09-06).** Probado contra la base antes de arreglarlo:
 * `recordLabourEntry` llamado dos veces con la misma entrada creaba DOS filas
 * indistinguibles —3 trabajadores, 6 horas, «Deshierbe», dos veces—. Ni
 * `LabourEntry` ni las otras cuatro entidades que la web crea tienen índice
 * único que lo rechace. `<BotonDeEnvio>` cerró el caso del dedo; esto cierra el
 * reintento de red y la pestaña duplicada, que el botón no puede ver.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { recordLabourEntry, recordMaterialConsumptionEntry } from "../../lib/traceability/operations";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { unaVezPorEnvio, ClaveDeEnvioAjena } from "../../lib/envios/unaVezPorEnvio";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `envio-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, cuenta: string, otra: string;

async function cuentaNueva(label: string) {
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" },
  });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}

const entrada = () => ({
  parent: { kind: "location" as const, locationId: plotId },
  workerCount: 3,
  hours: 6,
  taskNote: "Deshierbe",
  occurredAt: new Date("2026-09-01T08:00:00Z"),
  provenanceClass: "measured_fact" as const,
});

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  cuenta = await cuentaNueva("Envia");
  otra = await cuentaNueva("Otra");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  for (const id of [cuenta, otra]) {
    await prisma.assignment.create({ data: { userAccountId: id, roleProfileId: rp.id, scopeId } });
  }
});

afterAll(async () => {
  const ids = [cuenta, otra];
  await prisma.submissionKey.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.materialConsumptionEntry.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  await prisma.labourEntry.deleteMany({ where: assertDefinedWhere({ createdBy: { in: ids } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: ids } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
});

async function jornales(de: string) {
  return prisma.labourEntry.count({ where: assertDefinedWhere({ createdBy: de }) });
}

describe("un envío se atiende una sola vez", () => {
  it("misma clave dos veces: UNA fila, y la segunda devuelve la primera", async () => {
    const antes = await jornales(cuenta);
    const clave = `k-${RUN}-mismo`;
    const a = await recordLabourEntry(cuenta, { ...entrada(), claveDeEnvio: clave });
    const b = await recordLabourEntry(cuenta, { ...entrada(), claveDeEnvio: clave });
    expect(b.id, "el segundo envío debe devolver la fila del primero, no crear otra").toBe(a.id);
    expect((await jornales(cuenta)) - antes).toBe(1);
  });

  /**
   * Control positivo. Sin esto, «una sola fila» saldría verde también si el
   * servicio hubiera dejado de escribir del todo.
   */
  it("claves distintas: DOS filas — el servicio sigue escribiendo", async () => {
    const antes = await jornales(cuenta);
    await recordLabourEntry(cuenta, { ...entrada(), claveDeEnvio: `k-${RUN}-uno` });
    await recordLabourEntry(cuenta, { ...entrada(), claveDeEnvio: `k-${RUN}-dos` });
    expect((await jornales(cuenta)) - antes).toBe(2);
  });

  it("sin clave se comporta como antes: dos llamadas, dos filas", async () => {
    const antes = await jornales(cuenta);
    await recordLabourEntry(cuenta, entrada());
    await recordLabourEntry(cuenta, entrada());
    expect((await jornales(cuenta)) - antes, "la cola offline y las llamadas internas no llevan clave").toBe(2);
  });

  it("una clave ajena no devuelve la fila de otro", async () => {
    const clave = `k-${RUN}-ajena`;
    await recordLabourEntry(cuenta, { ...entrada(), claveDeEnvio: clave });
    await expect(recordLabourEntry(otra, { ...entrada(), claveDeEnvio: clave })).rejects.toBeInstanceOf(ClaveDeEnvioAjena);
  });

  /**
   * Si la escritura y la clave no fueran una sola transacción, aquí quedaría una
   * clave apuntando a una fila que no existe — y ese envío devolvería para
   * siempre un resultado inventado. Es peor que el duplicado original.
   */
  it("si la escritura falla, no queda clave huérfana", async () => {
    const clave = `k-${RUN}-rota`;
    await expect(
      unaVezPorEnvio(cuenta, clave, {
        tipo: "LabourEntry",
        recuperar: (id) => prisma.labourEntry.findUniqueOrThrow({ where: { id } }),
        crear: async () => {
          throw new Error("la escritura falla a propósito");
        },
      }),
    ).rejects.toThrow("la escritura falla a propósito");

    expect(await prisma.submissionKey.findUnique({ where: { key: clave } })).toBeNull();
  });
});

/**
 * Las otras tres entidades que duplicaban en silencio. `Sample` NO está aquí a
 * propósito: tiene `@@unique([organizationId, sampleCode])`, así que un segundo
 * envío choca contra el índice y falla ruidosamente en vez de duplicar —
 * medido, después de haber afirmado lo contrario.
 */
describe("las otras tres entidades sin índice único", () => {
  let loteId: string;

  beforeAll(async () => {
    loteId = (await prisma.lot.create({
      data: { lotCode: `TEST-${RUN}`, lotType: "cherry", organizationId: orgId, locationId: plotId, createdBy: cuenta },
    })).id;
  });

  it("consumo de material: misma clave, UNA fila; distintas, dos", async () => {
    const base = { parent: { kind: "location" as const, locationId: plotId }, materialName: "Cal", batchLabel: "L-1", provenanceClass: "measured_fact" as const };
    const cuantos = () => prisma.materialConsumptionEntry.count({ where: assertDefinedWhere({ createdBy: cuenta }) });
    const antes = await cuantos();
    const a1 = await recordMaterialConsumptionEntry(cuenta, { ...base, claveDeEnvio: `mc-${RUN}` });
    const a2 = await recordMaterialConsumptionEntry(cuenta, { ...base, claveDeEnvio: `mc-${RUN}` });
    expect(a2.id).toBe(a1.id);
    expect((await cuantos()) - antes).toBe(1);

    await recordMaterialConsumptionEntry(cuenta, { ...base, claveDeEnvio: `mc-${RUN}-otra` });
    expect((await cuantos()) - antes, "control positivo: con otra clave sí escribe").toBe(2);
  });

  it("medición: misma clave, UNA fila; distintas, dos", async () => {
    const base = { lotId: loteId, variable: "temperature" as never, value: 21, unit: "C", occurredAt: new Date("2026-09-01T09:00:00Z"), provenanceClass: "measured_fact" as const };
    const cuantos = () => prisma.measurement.count({ where: assertDefinedWhere({ createdBy: cuenta }) });
    const antes = await cuantos();
    const m1 = await recordMeasurement(cuenta, { ...base, claveDeEnvio: `me-${RUN}` });
    const m2 = await recordMeasurement(cuenta, { ...base, claveDeEnvio: `me-${RUN}` });
    expect(m2.id).toBe(m1.id);
    expect((await cuantos()) - antes).toBe(1);

    await recordMeasurement(cuenta, { ...base, claveDeEnvio: `me-${RUN}-otra` });
    expect((await cuantos()) - antes, "control positivo: con otra clave sí escribe").toBe(2);
  });

  it("movimiento de almacén: misma clave, UNA fila; distintas, dos", async () => {
    const base = { lotId: loteId, locationId: plotId, startedAt: new Date("2026-09-01T10:00:00Z") };
    const cuantos = () => prisma.storageAssignment.count({ where: assertDefinedWhere({ createdBy: cuenta }) });
    const antes = await cuantos();
    const s1 = await moveLotToStorage(cuenta, { ...base, claveDeEnvio: `st-${RUN}` });
    const s2 = await moveLotToStorage(cuenta, { ...base, claveDeEnvio: `st-${RUN}` });
    expect(s2.id).toBe(s1.id);
    expect((await cuantos()) - antes).toBe(1);

    await moveLotToStorage(cuenta, { ...base, claveDeEnvio: `st-${RUN}-otra` });
    expect((await cuantos()) - antes, "control positivo: con otra clave sí escribe").toBe(2);
  });
});
