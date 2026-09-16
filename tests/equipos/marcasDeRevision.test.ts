import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import * as audit from "../../lib/audit";
import { declararModoDeInstrumento } from "../../lib/equipos/modosDeInstrumento";
import type { MeasurementReviewReason } from "../../generated/prisma/client";

const ids = {
  equipment: [] as string[], measurement: [] as string[], check: [] as string[],
  flag: [] as string[], person: [] as string[], user: [] as string[],
  scope: [] as string[], assignment: [] as string[],
};
function reservar(tipo: keyof typeof ids) {
  const id = randomUUID();
  ids[tipo].push(id); // Antes de cada escritura, incluso las que deben fallar.
  return id;
}

afterEach(async () => {
  vi.restoreAllMocks();
  // El servicio genera el UUID del modo: su equipo se registró ANTES de invocarlo.
  const modos = { equipmentId: { in: ids.equipment } };
  const auditorias = { actorUserAccountId: { in: ids.user } };
  await prisma.auditEvent.deleteMany({ where: auditorias });
  await prisma.measurementReviewFlag.deleteMany({ where: { id: { in: ids.flag } } });
  await prisma.measurement.deleteMany({ where: { id: { in: ids.measurement } } });
  await prisma.instrumentCheck.deleteMany({ where: { id: { in: ids.check } } });
  await prisma.instrumentMeasurementMode.deleteMany({ where: modos });
  expect(await prisma.instrumentMeasurementMode.count({ where: modos })).toBe(0);
  await prisma.equipment.deleteMany({ where: { id: { in: ids.equipment } } });
  await prisma.assignment.deleteMany({ where: { id: { in: ids.assignment } } });
  await prisma.scope.deleteMany({ where: { id: { in: ids.scope } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: ids.user } } });
  await prisma.person.deleteMany({ where: { id: { in: ids.person } } });
  expect(await prisma.auditEvent.count({ where: auditorias })).toBe(0);
  expect(await prisma.measurementReviewFlag.count({ where: { id: { in: ids.flag } } })).toBe(0);
  expect(await prisma.measurement.count({ where: { id: { in: ids.measurement } } })).toBe(0);
  expect(await prisma.instrumentCheck.count({ where: { id: { in: ids.check } } })).toBe(0);
  expect(await prisma.equipment.count({ where: { id: { in: ids.equipment } } })).toBe(0);
  expect(await prisma.assignment.count({ where: { id: { in: ids.assignment } } })).toBe(0);
  expect(await prisma.scope.count({ where: { id: { in: ids.scope } } })).toBe(0);
  expect(await prisma.userAccount.count({ where: { id: { in: ids.user } } })).toBe(0);
  expect(await prisma.person.count({ where: { id: { in: ids.person } } })).toBe(0);
  for (const lista of Object.values(ids)) lista.length = 0;
});

async function contexto(kind: "instrument" | "tool" = "instrument") {
  const organization = await prisma.organization.findFirstOrThrow();
  const lot = await prisma.lot.findFirstOrThrow();
  const equipment = await prisma.equipment.create({ data: {
    id: reservar("equipment"), name: "TEST modos", kind,
    organizationId: organization.id, provenanceClass: "original_record",
  } });
  const measurement = await prisma.measurement.create({ data: {
    id: reservar("measurement"), lotId: lot.id, instrumentId: equipment.id,
    variable: "moisture", value: 12, unit: "%", occurredAt: new Date(),
    provenanceClass: "direct_observation",
  } });
  const check = await prisma.instrumentCheck.create({ data: {
    id: reservar("check"), equipmentId: equipment.id, occurredAt: new Date(),
  } });
  return { equipment, measurement, check };
}

function marcar(measurementId: string, raisedByCheckId: string | null, reason?: MeasurementReviewReason) {
  return prisma.measurementReviewFlag.create({ data: {
    id: reservar("flag"), measurementId, raisedByCheckId, ...(reason ? { reason } : {}),
  } });
}

async function actor(conPermiso: boolean) {
  const person = await prisma.person.create({ data: {
    id: reservar("person"), givenName: "TEST", familyName: "modos", displayName: "TEST modos", locale: "es",
  } });
  const user = await prisma.userAccount.create({ data: {
    id: reservar("user"), personId: person.id, authProvider: "credentials", status: "active",
  } });
  if (conPermiso) {
    const role = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
    const scope = await prisma.scope.create({ data: { id: reservar("scope"), scopeType: "platform" } });
    await prisma.assignment.create({ data: {
      id: reservar("assignment"), userAccountId: user.id, roleProfileId: role.id, scopeId: scope.id,
    } });
  }
  return user.id;
}

const escala = { label: "Parchment Coffee", materialState: "PARCHMENT", rangeMin: 8, rangeMax: 38 } as const;

describe("las marcas conservan una causa explícita", () => {
  it("crea una marca con su check y el motivo por defecto instrument_check_failed", async () => {
    const { measurement, check } = await contexto();
    const flag = await marcar(measurement.id, check.id);
    const guardada = await prisma.measurementReviewFlag.findUniqueOrThrow({ where: { id: flag.id } });
    expect(guardada.reason).toBe("instrument_check_failed");
    expect(guardada.raisedByCheckId).toBe(check.id);
  });

  it.each(["instrument_check_failed", "instrument_check_overdue"] as const)(
    "%s exige check y acepta la combinación buena", async (reason) => {
      const { measurement, check } = await contexto();
      await expect(marcar(measurement.id, null, reason)).rejects.toThrow(/review_flag_causa_coherente/);
      expect((await marcar(measurement.id, check.id, reason)).reason).toBe(reason);
    },
  );

  it.each(["mode_material_mismatch", "material_stage_mismatch"] as const)(
    "%s admite causa sin check y rechaza atribuirla a un check", async (reason) => {
      const { measurement, check } = await contexto();
      await expect(marcar(measurement.id, check.id, reason)).rejects.toThrow(/review_flag_causa_coherente/);
      expect((await marcar(measurement.id, null, reason)).raisedByCheckId).toBeNull();
    },
  );

  it("el índice parcial rechaza repetir cada motivo nulo, permite otro motivo y otra medición", async () => {
    const { measurement } = await contexto();
    const otra = (await contexto()).measurement;
    for (const reason of ["mode_material_mismatch", "material_stage_mismatch"] as const) {
      expect((await marcar(measurement.id, null, reason)).reason).toBe(reason);
      await expect(marcar(measurement.id, null, reason)).rejects.toMatchObject({ code: "P2002" });
      expect((await marcar(otra.id, null, reason)).measurementId).toBe(otra.id);
    }
  });
});

describe("declaración y enlace del modo", () => {
  it("guarda el modo literal, calibración y audit; enlaza una lectura sin rellenar las otras", async () => {
    const { equipment, measurement } = await contexto();
    expect(measurement.instrumentModeId).toBeNull();
    const user = await actor(true);
    const modo = await declararModoDeInstrumento(user, {
      equipmentId: equipment.id, ...escala, calibrationOffset: -0.25, calibrationMode: "manual", displayOrder: 2,
    });
    expect(modo.label).toBe("Parchment Coffee");
    expect(modo.materialState).toBe("PARCHMENT");
    expect(Number(modo.rangeMin)).toBe(8);
    expect(Number(modo.rangeMax)).toBe(38);
    expect(Number(modo.calibrationOffset)).toBe(-0.25);
    expect(modo.calibrationMode).toBe("manual");
    expect(modo.displayOrder).toBe(2);
    expect(modo.createdBy).toBe(user);
    expect(await prisma.auditEvent.count({ where: { entityId: modo.id, actorUserAccountId: user } })).toBe(1);
    expect((await prisma.measurement.findUniqueOrThrow({ where: { id: measurement.id } })).instrumentModeId).toBeNull();
    const lectura = await prisma.measurement.update({ where: { id: measurement.id }, data: { instrumentModeId: modo.id } });
    expect(lectura.instrumentModeId).toBe(modo.id);
    await expect(declararModoDeInstrumento(user, { equipmentId: equipment.id, ...escala }))
      .rejects.toMatchObject({ code: "P2002" });
    const otro = (await contexto()).equipment;
    expect((await declararModoDeInstrumento(user, { equipmentId: otro.id, ...escala })).label).toBe(escala.label);
  });

  it("exige permiso y un instrumento, con control autorizado", async () => {
    const { equipment } = await contexto();
    const ajeno = await actor(false);
    await expect(declararModoDeInstrumento(ajeno, { equipmentId: equipment.id, ...escala })).rejects.toThrow("forbidden");
    const jefe = await actor(true);
    expect((await declararModoDeInstrumento(jefe, { equipmentId: equipment.id, ...escala })).equipmentId).toBe(equipment.id);
    const herramienta = (await contexto("tool")).equipment;
    await expect(declararModoDeInstrumento(jefe, { equipmentId: herramienta.id, ...escala }))
      .rejects.toThrow("solo_los_instrumentos_tienen_modos");
  });

  it("valida nombre y rango; admite límites desconocidos sin inventarlos", async () => {
    const { equipment } = await contexto();
    const jefe = await actor(true);
    for (const [cambio, error] of [
      [{ label: " " }, "label_required"],
      [{ rangeMin: 39 }, "rango_invertido"],
      [{ rangeMax: Infinity }, "valor_no_finito"],
      [{ calibrationOffset: NaN }, "valor_no_finito"],
    ] as const) {
      await expect(declararModoDeInstrumento(jefe, { equipmentId: equipment.id, ...escala, ...cambio }))
        .rejects.toThrow(error);
    }
    const modo = await declararModoDeInstrumento(jefe, {
      equipmentId: equipment.id, label: "Green Coffee", materialState: "GREEN",
    });
    expect(modo.rangeMin).toBeNull();
    expect(modo.rangeMax).toBeNull();
    expect(modo.calibrationOffset).toBeNull();
    expect(modo.calibrationMode).toBeNull();
    expect(modo.retiredAt).toBeNull();
    expect(modo.displayOrder).toBe(0);
  });

  it("revierte el modo si falla su audit y lo crea cuando el audit funciona", async () => {
    const { equipment } = await contexto();
    const jefe = await actor(true);
    vi.spyOn(audit, "recordAuditEvent").mockRejectedValueOnce(new Error("audit-no-disponible"));
    await expect(declararModoDeInstrumento(jefe, { equipmentId: equipment.id, ...escala }))
      .rejects.toThrow("audit-no-disponible");
    expect(await prisma.instrumentMeasurementMode.count({ where: { equipmentId: equipment.id } })).toBe(0);
    expect((await declararModoDeInstrumento(jefe, { equipmentId: equipment.id, ...escala })).label).toBe(escala.label);
  });
});
