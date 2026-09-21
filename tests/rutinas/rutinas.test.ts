import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
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
let sitio: string;
let bodega: string;
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
  // Un lugar que SÍ admite rutinas (a diferencia de `sitioA`, un `plot`), para
  // probar que `forbidden` manda incluso cuando el tipo permitiría seguir
  // (Hallazgo 2, ola de arreglos de revisión final). Una bodega exige un padre
  // `site` o `beneficio` (ADR-180, disparador `location_bodega_padre`): `sitioA`
  // es un `plot`, así que hace falta un `site` propio debajo.
  sitio = (
    await prisma.location.create({
      data: { locationType: "site", name: `TEST sitio ${f.run}`, parentLocationId: f.sitioA, organizationId: f.orgA, status: "approved", classification: "internal" },
    })
  ).id;
  bodega = (
    await prisma.location.create({
      data: { locationType: "storage_facility", name: `TEST bodega ${f.run}`, parentLocationId: sitio, organizationId: f.orgA, status: "approved", classification: "internal" },
    })
  ).id;
});

afterAll(async () => {
  const eqs = (await prisma.equipment.findMany({ where: { organizationId: f.orgA }, select: { id: true } })).map((e) => e.id);
  const rs = (await prisma.careRoutine.findMany({ where: { equipmentId: { in: eqs } }, select: { id: true } })).map((r) => r.id);
  await prisma.careRoutineEvent.deleteMany({ where: { routineId: { in: rs } } });
  await prisma.careRoutine.deleteMany({ where: { id: { in: rs } } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: eqs } } });
  await prisma.equipment.deleteMany({ where: { id: { in: eqs } } });
  await prisma.location.deleteMany({ where: { id: bodega } });
  await prisma.location.deleteMany({ where: { id: sitio } });
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
  it("un sitio (finca) no lleva rutinas: lugar_sin_rutinas", async () => {
    await expect(requireRutinaAccess(f.jefeA, { equipmentId: null, locationId: f.sitioA }, "manage")).rejects.toThrow(
      new RutinaError("lugar_sin_rutinas"),
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

describe("requireRutinaAccess: `forbidden` manda antes que existencia o tipo (Hallazgo 2)", () => {
  it("un uuid que no existe, para quien no tiene NINGÚN permiso: forbidden, no lugar_no_encontrado", async () => {
    await expect(requireRutinaAccess(f.ajeno, { equipmentId: null, locationId: randomUUID() }, "manage")).rejects.toThrow(
      new RutinaError("forbidden"),
    );
  });
  it("un lugar que NO admite rutinas (un sitio), para quien no puede verlo: forbidden, no lugar_sin_rutinas", async () => {
    await expect(requireRutinaAccess(f.ajeno, { equipmentId: null, locationId: f.sitioA }, "manage")).rejects.toThrow(
      new RutinaError("forbidden"),
    );
  });
  it("un lugar que SÍ admite rutinas (una bodega), para quien no puede verlo: forbidden igual", async () => {
    await expect(requireRutinaAccess(f.ajeno, { equipmentId: null, locationId: bodega }, "manage")).rejects.toThrow(
      new RutinaError("forbidden"),
    );
  });
});

describe("apuntar es faena; anular es gestión", () => {
  it("el operario apunta; el ajeno no", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-09-10"), provenanceClass: "original_record" });
    await expect(registrarRealizada(f.ajeno, { routineId: r.id, performedOn: dia("2026-09-11"), provenanceClass: "original_record" })).rejects.toThrow(
      new RutinaError("forbidden"),
    );
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
  it("el estado sale del último registro VÁLIDO aunque los 20 más recientes estén anulados", async () => {
    const e = await equipo();
    const r = await crearRutina(f.jefeA, { equipmentId: e.id, kind: "mantenimiento", intervalDays: 30 });
    await registrarRealizada(f.operarioA, { routineId: r.id, performedOn: dia("2026-08-01"), provenanceClass: "original_record" });
    // 21 registros más nuevos, todos anulados: llenan de sobra la ventana del historial.
    for (let i = 2; i <= 22; i++) {
      await prisma.careRoutineEvent.create({
        data: {
          routineId: r.id,
          performedOn: dia(`2026-08-${String(i).padStart(2, "0")}`),
          provenanceClass: "original_record",
          voidedAt: new Date(),
          voidReason: "apuntado por error",
        },
      });
    }
    const [rutina] = await rutinasDeEquipo(f.operarioA, e.id, "2026-09-18");
    // 2026-08-01 + 30 = 2026-08-31: vencida por 18 días. Sin el registro válido
    // la referencia caería a la adquisición (2026-01-01) y diría 230.
    expect(rutina!.estado).toEqual({ estado: "vencida", ultimo: "2026-08-01", proximo: "2026-08-31", pasaron: 18 });
    // El historial que se pinta sigue acotado a 20 filas.
    expect(rutina!.registros).toHaveLength(20);
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
