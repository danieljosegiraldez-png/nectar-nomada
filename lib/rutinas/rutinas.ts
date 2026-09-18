/**
 * Rutinas periódicas: qué toca, cada cuánto, cuándo se hizo (spec §3.4, D1, D8).
 *
 * **Definir** una rutina es gestión (`equipment:manage`); **apuntar** que se hizo es
 * faena (`equipment:report_condition`), igual que informar del estado; **anular**
 * un registro es gestión. Las rutinas de INSTALACIÓN existen en la base pero no en
 * este servicio: sus permisos los fija el spec de instalaciones.
 */
import { Prisma, type CareRoutineKind, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { prisma } from "../db";
import { puedeSobreEquipo } from "../equipos/equipos";
import { diaDeHoy } from "../time/diaDeHoy";
import { estadoDeRutina, type EstadoDeRutina } from "./estado";

export class RutinaError extends Error {}

export interface NuevaRutina {
  equipmentId: string;
  kind: CareRoutineKind;
  kindNote?: string | null;
  intervalDays: number;
  instructions?: string | null;
}

export interface NuevoRegistro {
  routineId: string;
  performedOn: Date;
  performedByPersonId?: string | null;
  note?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function requireRutinaAccess(
  userAccountId: string,
  cosa: { equipmentId: string | null; locationId: string | null },
  accion: "manage" | "report_condition",
): Promise<void> {
  if (cosa.equipmentId === null) throw new RutinaError("instalaciones_pendiente");
  if (!(await puedeSobreEquipo(userAccountId, cosa.equipmentId, accion))) throw new RutinaError("forbidden");
}

const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function crearRutina(userAccountId: string, r: NuevaRutina): Promise<{ id: string }> {
  await requireRutinaAccess(userAccountId, { equipmentId: r.equipmentId, locationId: null }, "manage");
  if (!Number.isInteger(r.intervalDays) || r.intervalDays <= 0) throw new RutinaError("intervalo_positivo");
  const kindNote = t(r.kindNote);
  if (r.kind === "otra" && kindNote === null) throw new RutinaError("otra_con_nota");
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.careRoutine.create({
        data: { equipmentId: r.equipmentId, kind: r.kind, kindNote, intervalDays: r.intervalDays, instructions: t(r.instructions), createdBy: userAccountId },
        select: { id: true },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: c.id, operation: "create", sourceInterface: "lib/rutinas/rutinas.ts", after: { equipmentId: r.equipmentId, kind: r.kind, kindNote, intervalDays: r.intervalDays } },
        tx,
      );
      return c;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new RutinaError("rutina_duplicada");
    throw e;
  }
}

async function rutina(routineId: string) {
  const r = await prisma.careRoutine.findUnique({ where: { id: routineId } });
  if (!r) throw new RutinaError("rutina_no_encontrada");
  return r;
}

export async function cambiarIntervalo(userAccountId: string, routineId: string, intervalDays: number): Promise<void> {
  const r = await rutina(routineId);
  await requireRutinaAccess(userAccountId, r, "manage");
  if (!Number.isInteger(intervalDays) || intervalDays <= 0) throw new RutinaError("intervalo_positivo");
  await prisma.$transaction(async (tx) => {
    await tx.careRoutine.update({ where: { id: routineId }, data: { intervalDays } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: routineId, operation: "update_interval", sourceInterface: "lib/rutinas/rutinas.ts", before: { intervalDays: r.intervalDays }, after: { intervalDays } },
      tx,
    );
  });
}

export async function retirarRutina(userAccountId: string, routineId: string, cuando: Date): Promise<void> {
  const r = await rutina(routineId);
  await requireRutinaAccess(userAccountId, r, "manage");
  if (r.retiredAt) return;
  await prisma.$transaction(async (tx) => {
    await tx.careRoutine.update({ where: { id: routineId }, data: { retiredAt: cuando } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: routineId, operation: "retire", sourceInterface: "lib/rutinas/rutinas.ts", after: { retiredAt: cuando.toISOString() } },
      tx,
    );
  });
}

export async function registrarRealizada(userAccountId: string, r: NuevoRegistro): Promise<{ id: string }> {
  const ru = await rutina(r.routineId);
  await requireRutinaAccess(userAccountId, ru, "report_condition");
  if (ru.retiredAt) throw new RutinaError("rutina_retirada");
  // Ningún lugar del planeta ha llegado todavía a un día posterior al de la zona
  // más adelantada: eso es una fecha futura, se mire desde donde se mire.
  const hoyEnLaZonaMasAdelantada = diaDeHoy(new Date(), "Etc/GMT-14");
  if (r.performedOn.toISOString().slice(0, 10) > hoyEnLaZonaMasAdelantada) throw new RutinaError("fecha_futura");
  return prisma.$transaction(async (tx) => {
    const ev = await tx.careRoutineEvent.create({
      data: {
        routineId: r.routineId,
        performedOn: r.performedOn,
        performedByPersonId: r.performedByPersonId || null,
        note: t(r.note),
        provenanceClass: r.provenanceClass,
        sourceReference: t(r.sourceReference),
        createdBy: userAccountId,
      },
      select: { id: true },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine_event", entityId: ev.id, operation: "create", sourceInterface: "lib/rutinas/rutinas.ts", after: { routineId: r.routineId, performedOn: r.performedOn.toISOString(), performedByPersonId: r.performedByPersonId ?? null } },
      tx,
    );
    return ev;
  });
}

export async function anularRegistro(userAccountId: string, eventId: string, motivo: string): Promise<void> {
  const ev = await prisma.careRoutineEvent.findUnique({ where: { id: eventId }, include: { routine: true } });
  if (!ev) throw new RutinaError("registro_no_encontrado");
  await requireRutinaAccess(userAccountId, ev.routine, "manage");
  const razon = motivo.trim();
  if (!razon) throw new RutinaError("motivo_obligatorio");
  if (ev.voidedAt) return;
  const cuando = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.careRoutineEvent.update({ where: { id: eventId }, data: { voidedAt: cuando, voidReason: razon } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, entityType: "care_routine_event", entityId: eventId, operation: "void", sourceInterface: "lib/rutinas/rutinas.ts", reason: razon, after: { voidedAt: cuando.toISOString() } },
      tx,
    );
  });
}

export type RutinaConEstado = Awaited<ReturnType<typeof rutinasDeEquipo>>[number];

export async function rutinasDeEquipo(userAccountId: string, equipmentId: string, hoy: string) {
  if (!(await puedeSobreEquipo(userAccountId, equipmentId, "view"))) throw new RutinaError("forbidden");
  const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId }, select: { acquiredAt: true } });
  const rutinas = await prisma.careRoutine.findMany({
    where: { equipmentId, retiredAt: null },
    orderBy: [{ kind: "asc" }, { kindNote: "asc" }],
    include: {
      events: {
        orderBy: { performedOn: "desc" },
        take: 20,
        include: { performedBy: { select: { displayName: true } } },
      },
    },
  });
  return rutinas.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindNote: r.kindNote,
    intervalDays: r.intervalDays,
    instructions: r.instructions,
    estado: estadoDeRutina({ intervalDays: r.intervalDays, registros: r.events, alta: equipo.acquiredAt, hoy }) as EstadoDeRutina,
    registros: r.events.map((e) => ({ id: e.id, performedOn: e.performedOn, note: e.note, voidedAt: e.voidedAt, voidReason: e.voidReason, performedBy: e.performedBy })),
  }));
}

/** Para la lista: cuántas rutinas vencidas tiene cada equipo VISIBLE. */
export async function vencidasPorEquipo(userAccountId: string, equipmentIds: readonly string[], hoy: string): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  const rutinas = await prisma.careRoutine.findMany({
    where: { equipmentId: { in: [...equipmentIds] }, retiredAt: null },
    include: { events: { select: { performedOn: true, voidedAt: true } }, equipment: { select: { acquiredAt: true } } },
  });
  for (const r of rutinas) {
    if (!r.equipmentId || !(await puedeSobreEquipo(userAccountId, r.equipmentId, "view"))) continue;
    const e = estadoDeRutina({ intervalDays: r.intervalDays, registros: r.events, alta: r.equipment?.acquiredAt ?? null, hoy });
    if (e.estado === "vencida") salida.set(r.equipmentId, (salida.get(r.equipmentId) ?? 0) + 1);
  }
  return salida;
}
