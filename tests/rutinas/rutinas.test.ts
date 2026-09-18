import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { registrarEquipo } from "../../lib/equipos/equipos";
import {
  RutinaError,
  anularRegistro,
  cambiarIntervalo,
  crearRutina,
  registrarRealizada,
  requireRutinaAccess,
  retirarRutina,
  rutinasDeEquipo,
  vencidasPorEquipo,
} from "../../lib/rutinas/rutinas";
import { diaDeHoy } from "../../lib/time/diaDeHoy";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
const dia = (s: string) => new Date(`${s}T00:00:00Z`);

/** Un equipo del sitio A, adquirido el 2026-01-01: fija la referencia cuando no hay registros. */
async function equipo() {
  return registrarEquipo(f.jefeA, {
    name: `TEST eq ${f.run} ${Math.random()}`,
    kind: "instrument",
    organizationId: f.orgA,
    initialLocationId: f.sitioA,
    provenanceClass: "original_record",
    acquiredAt: dia("2026-01-01"),
  });
}

beforeAll(async () => {
  f = await montarFixtures("rut");
});

afterAll(async () => {
  const eqs = (await prisma.equipment.findMany({ where: { organizationId: f.orgA }, select: { id: true } })).map((e) => e.id);
  const rs = (await prisma.careRoutine.findMany({ where: { equipmentId: { in: eqs } }, select: { id: true } })).map((r) => r.id);
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: { in: rs } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rs } } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: eqs } } });
  await prisma.equipment.deleteMany({ where: { id: { in: eqs } } });
  await f.limpiar();
});

describe("definir es gestión", () => {
  it("el jefe crea una rutina, con su AuditEvent", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "care_routine", entityId: r.id, operation: "create" } });
    expect(ev?.actorUserAccountId).toBe(f.jefeA);
  });
  it("el operario no crea rutinas", async () => {
    const e = await equipo();
    await expect(crearRutina(f.operarioA, { equipmentId: e.id, kind: "limpieza", intervalDays: 7 })).rejects.toThrow(new RutinaError("forbidden"));
  });
  it("una segunda rutina activa del mismo tipo sale como error legible", async () => {
    const e = await equipo();
    await crearRutina(f.jefeA, { equipmentId: e.id, kind: "limpieza", intervalDays: 7 });
    await expect(crearRutina(f.jefeA, { equipmentId: e.id, kind: "limpieza", intervalDays: 14 })).rejects.toThrow(new RutinaError("rutina_duplicada"));
  });
  it("las rutinas de instalación esperan su spec", async () => {
    await expect(requireRutinaAccess(f.jefeA, { equipmentId: null, locationId: f.sitioA }, "manage")).rejects.toThrow(
      new RutinaError("instalaciones_pendiente"),
    );
  });
  it("cambiar el intervalo deja antes y después; retirar no borra", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "fumigacion", intervalDays: 90 });
    await cambiarIntervalo(f.jefeA, r.id, 60);
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "care_routine", entityId: r.id, operation: "update_interval" } });
    expect(ev.before).toEqual({ intervalDays: 90 });
    await retirarRutina(f.jefeA, r.id, new Date());
    expect((await prisma.careRoutine.findUniqueOrThrow({ where: { id: r.id } })).retiredAt).not.toBeNull();
  });
});

describe("apuntar es faena; anular es gestión", () => {
  it("el operario apunta; el ajeno no", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    await expect(registrarRealizada(f.ajeno, { routineId: r.id, performedOn: dia("2026-09-11"), provenanceClass: "original_record" })).rejects.toThrow();
  });
  it("una fecha que no ha llegado en ninguna zona del planeta se rechaza", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const manana = new Date(`${diaDeHoy(new Date(), "Etc/GMT-14")}T00:00:00Z`);
    manana.setUTCDate(manana.getUTCDate() + 1);
    await expect(registrarRealizada(f.jefeA, { routineId: r.id, performedOn: manana, provenanceClass: "original_record" })).rejects.toThrow(
      new RutinaError("fecha_futura"),
    );
    // Control positivo: hoy en la zona más adelantada SÍ entra.
    await registrarRealizada(f.jefeA, { routineId: r.id, performedOn: new Date(`${diaDeHoy(new Date(), "Etc/GMT-14")}T00:00:00Z`), provenanceClass: "original_record" });
  });
  it("anular exige motivo, lo hace el jefe y no el operario, y la fila sigue", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const ev = await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    await expect(anularRegistro(f.jefeA, ev.id, "   ")).rejects.toThrow(new RutinaError("motivo_obligatorio"));
    await expect(anularRegistro(f.operarioA, ev.id, "error")).rejects.toThrow(new RutinaError("forbidden"));
    await anularRegistro(f.jefeA, ev.id, "fecha equivocada");
    const fila = await prisma.careRoutineEvent.findUniqueOrThrow({ where: { id: ev.id } });
    expect(fila.voidReason).toBe("fecha equivocada");
  });
  it("en una rutina retirada no se apunta", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    await retirarRutina(f.jefeA, r.id, new Date());
    await expect(
      registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" }),
    ).rejects.toThrow(new RutinaError("rutina_retirada"));
  });
});

describe("el estado que ve la ficha y la lista", () => {
  it("con registro: próximo a 30 días; anulado: vuelve a la fecha de adquisición", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    const ev = await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    const [antes] = await rutinasDeEquipo(f.operarioA, e.id, "2026-09-18");
    expect(antes!.estado).toEqual({ estado: "al_dia", ultimo: "2026-09-10", proximo: "2026-10-10", faltan: 22 });
    await anularRegistro(f.jefeA, ev.id, "no se hizo");
    const [despues] = await rutinasDeEquipo(f.operarioA, e.id, "2026-09-18");
    // Referencia = adquisición (2026-01-01) + 30 = 2026-01-31: vencida.
    expect(despues!.estado).toEqual({ estado: "vencida", ultimo: null, proximo: "2026-01-31", pasaron: 230 });
  });
  it("vencidasPorEquipo cuenta las vencidas y omite lo que no se ve", async () => {
    const e = await equipo();
    await crearRutina(f.jefeA, { equipmentId: e.id, kind: "limpieza", intervalDays: 7 });
    await crearRutina(f.jefeA, { equipmentId: e.id, kind: "fumigacion", intervalDays: 7 });
    const paraElOperario = await vencidasPorEquipo(f.operarioA, [e.id], "2026-09-18");
    expect(paraElOperario.get(e.id)).toBe(2);
    const paraElAjeno = await vencidasPorEquipo(f.ajeno, [e.id], "2026-09-18");
    expect(paraElAjeno.has(e.id)).toBe(false);
  });
});
