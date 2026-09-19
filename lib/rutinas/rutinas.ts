/**
 * Rutinas periódicas: qué toca, cada cuánto, cuándo se hizo (spec §3.4, D1, D8).
 *
 * **Definir** una rutina es gestión (`equipment:manage`); **apuntar** que se hizo es
 * faena (`equipment:report_condition`), igual que informar del estado; **anular**
 * un registro es gestión. Las de LUGAR juzgan en el lugar (`lib/rutinas/lugares.ts`,
 * spec 2026-09-19 §4.2).
 */
import { Prisma, type CareRoutineKind, type ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { prisma } from "../db";
import { puedeSobreEquipo } from "../equipos/equipos";
import { crearConsumoEnTx } from "../traceability/operations";
import { diaDeHoy } from "../time/diaDeHoy";
import { estadoDeRutina, type EstadoDeRutina } from "./estado";
import { lugarParaRutina, puedeSobreLugar } from "./lugares";
import { RutinaError } from "./error";

export { RutinaError } from "./error";

export interface NuevaRutina {
  equipmentId?: string | null;
  locationId?: string | null;
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
  insumos?: { consumableLotId: string; quantity?: number | null; unit?: string | null }[];
}

export async function requireRutinaAccess(
  userAccountId: string,
  cosa: { equipmentId: string | null; locationId: string | null },
  accion: "manage" | "report_condition",
): Promise<void> {
  if ((cosa.equipmentId === null) === (cosa.locationId === null)) throw new RutinaError("una_cosa");
  if (cosa.equipmentId !== null) {
    if (!(await puedeSobreEquipo(userAccountId, cosa.equipmentId, accion))) throw new RutinaError("forbidden");
    return;
  }
  // El permiso PRIMERO (arreglo de revisión final, 2026-09-19): `puedeSobreLugar`
  // devuelve `false` para un id que no existe, así que un llamador sin permiso
  // recibe `forbidden` idéntico para un uuid inexistente, un lugar que no admite
  // rutinas y un lugar que sí las admite pero no puede ver — antes, `lugarParaRutina`
  // corría primero y esos tres casos se distinguían del `forbidden` por el código
  // de error, filtrando existencia y tipo a cualquiera. Sólo un llamador YA
  // AUTORIZADO llega a la distinción de tipo (`lugar_sin_rutinas`/`rutina_en_el_estante`).
  if (!(await puedeSobreLugar(userAccountId, cosa.locationId!, accion))) throw new RutinaError("forbidden");
  await lugarParaRutina(cosa.locationId!);
}

const t = (v: string | null | undefined) => (v?.trim() ? v.trim() : null);

export async function crearRutina(userAccountId: string, r: NuevaRutina): Promise<{ id: string }> {
  const equipmentId = r.equipmentId ?? null;
  const locationId = r.locationId ?? null;
  await requireRutinaAccess(userAccountId, { equipmentId, locationId }, "manage");
  if (!Number.isInteger(r.intervalDays) || r.intervalDays <= 0) throw new RutinaError("intervalo_positivo");
  const kindNote = t(r.kindNote);
  if (r.kind === "otra" && kindNote === null) throw new RutinaError("otra_con_nota");
  try {
    return await prisma.$transaction(async (tx) => {
      const c = await tx.careRoutine.create({
        data: { equipmentId, locationId, kind: r.kind, kindNote, intervalDays: r.intervalDays, instructions: t(r.instructions), createdBy: userAccountId },
        select: { id: true },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, entityType: "care_routine", entityId: c.id, operation: "create", sourceInterface: "lib/rutinas/rutinas.ts", after: { equipmentId, locationId, kind: r.kind, kindNote, intervalDays: r.intervalDays } },
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

  const insumos = (r.insumos ?? []).filter((i) => i.consumableLotId);
  let lotes: { id: string; batchLabel: string; material: { name: string; organizationId: string } }[] = [];
  if (insumos.length) {
    const org = ru.locationId
      ? (await prisma.location.findUniqueOrThrow({ where: { id: ru.locationId }, select: { organizationId: true } })).organizationId
      : (await prisma.equipment.findUniqueOrThrow({ where: { id: ru.equipmentId! }, select: { organizationId: true } })).organizationId;
    // Hallazgo B (revisión independiente de Codex, ola de arreglos de revisión
    // final, 2026-09-19): la organización va en el WHERE, no comparada
    // DESPUÉS de leer — así un lote ajeno nunca sale de la base, no sólo del
    // resultado. Sin organización (bodega de plataforma) no hay con qué
    // filtrar: ningún lote entra, igual que antes.
    lotes = org
      ? await prisma.consumableLot.findMany({
          where: { id: { in: insumos.map((i) => i.consumableLotId) }, material: { organizationId: org } },
          select: { id: true, batchLabel: true, material: { select: { name: true, organizationId: true } } },
        })
      : [];
    for (const i of insumos) {
      const lote = lotes.find((l) => l.id === i.consumableLotId);
      if (!lote) throw new RutinaError("insumo_ajeno");
    }
  }

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
    for (const i of insumos) {
      const lote = lotes.find((l) => l.id === i.consumableLotId)!;
      await crearConsumoEnTx(tx, userAccountId, {
        parent: { kind: "careRoutineEvent", careRoutineEventId: ev.id },
        materialName: lote.material.name,
        batchLabel: lote.batchLabel,
        consumableLotId: lote.id,
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
        occurredAt: r.performedOn,
        operatorPersonId: r.performedByPersonId || null,
        provenanceClass: r.provenanceClass,
      });
    }
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
        include: {
          performedBy: { select: { displayName: true } },
          consumptions: { select: { materialName: true, batchLabel: true, quantity: true, unit: true } },
        },
      },
    },
  });
  // El estado sale del último registro VÁLIDO de toda la historia, no de la
  // ventana de 20 que se pinta: si los 20 más recientes están anulados, uno
  // válido más viejo sigue siendo la referencia.
  const ultimosValidos = await prisma.careRoutineEvent.groupBy({
    by: ["routineId"],
    where: { routineId: { in: rutinas.map((r) => r.id) }, voidedAt: null },
    _max: { performedOn: true },
  });
  const ultimoValido = new Map(ultimosValidos.map((u) => [u.routineId, u._max.performedOn]));
  return rutinas.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindNote: r.kindNote,
    intervalDays: r.intervalDays,
    instructions: r.instructions,
    estado: estadoDeRutina({
      intervalDays: r.intervalDays,
      registros: ultimoValido.get(r.id) ? [{ performedOn: ultimoValido.get(r.id)!, voidedAt: null }] : [],
      alta: equipo.acquiredAt,
      hoy,
    }) as EstadoDeRutina,
    registros: r.events.map((e) => ({
      id: e.id,
      performedOn: e.performedOn,
      note: e.note,
      voidedAt: e.voidedAt,
      voidReason: e.voidReason,
      performedBy: e.performedBy,
      productos: e.consumptions.map((c) => ({ materialName: c.materialName, batchLabel: c.batchLabel, quantity: c.quantity?.toString() ?? null, unit: c.unit })),
    })),
  }));
}

/** Para la lista: cuántas rutinas vencidas tiene cada equipo VISIBLE. */
export async function vencidasPorEquipo(userAccountId: string, equipmentIds: readonly string[], hoy: string): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  // Un equipo con varias rutinas activas no vuelve a resolver su visibilidad
  // por cada una: `puedeSobreEquipo` hace su propio `findUnique` + resolución
  // de ámbito, y esta función es justo la que alimenta la página de lista.
  const visible = new Map<string, boolean>();
  const rutinas = await prisma.careRoutine.findMany({
    where: { equipmentId: { in: [...equipmentIds] }, retiredAt: null },
    include: { events: { select: { performedOn: true, voidedAt: true } }, equipment: { select: { acquiredAt: true } } },
  });
  for (const r of rutinas) {
    if (!r.equipmentId) continue;
    if (!visible.has(r.equipmentId)) {
      visible.set(r.equipmentId, await puedeSobreEquipo(userAccountId, r.equipmentId, "view"));
    }
    if (!visible.get(r.equipmentId)) continue;
    const e = estadoDeRutina({ intervalDays: r.intervalDays, registros: r.events, alta: r.equipment?.acquiredAt ?? null, hoy });
    if (e.estado === "vencida") salida.set(r.equipmentId, (salida.get(r.equipmentId) ?? 0) + 1);
  }
  return salida;
}

export async function rutinasDeLugar(userAccountId: string, locationId: string, hoy: string): Promise<RutinaConEstado[]> {
  if (!(await puedeSobreLugar(userAccountId, locationId, "view"))) throw new RutinaError("forbidden");
  const lugar = await prisma.location.findUniqueOrThrow({ where: { id: locationId }, select: { createdAt: true } });
  const rutinas = await prisma.careRoutine.findMany({
    where: { locationId, retiredAt: null },
    orderBy: [{ kind: "asc" }, { kindNote: "asc" }],
    include: {
      events: {
        orderBy: { performedOn: "desc" },
        take: 20,
        include: {
          performedBy: { select: { displayName: true } },
          consumptions: { select: { materialName: true, batchLabel: true, quantity: true, unit: true } },
        },
      },
    },
  });
  const ultimosValidos = await prisma.careRoutineEvent.groupBy({
    by: ["routineId"],
    where: { routineId: { in: rutinas.map((r) => r.id) }, voidedAt: null },
    _max: { performedOn: true },
  });
  const ultimoValido = new Map(ultimosValidos.map((u) => [u.routineId, u._max.performedOn]));
  return rutinas.map((r) => ({
    id: r.id,
    kind: r.kind,
    kindNote: r.kindNote,
    intervalDays: r.intervalDays,
    instructions: r.instructions,
    estado: estadoDeRutina({
      intervalDays: r.intervalDays,
      registros: ultimoValido.get(r.id) ? [{ performedOn: ultimoValido.get(r.id)!, voidedAt: null }] : [],
      alta: lugar.createdAt,
      hoy,
    }) as EstadoDeRutina,
    registros: r.events.map((e) => ({
      id: e.id,
      performedOn: e.performedOn,
      note: e.note,
      voidedAt: e.voidedAt,
      voidReason: e.voidReason,
      performedBy: e.performedBy,
      productos: e.consumptions.map((c) => ({ materialName: c.materialName, batchLabel: c.batchLabel, quantity: c.quantity?.toString() ?? null, unit: c.unit })),
    })),
  }));
}

/** Para la lista: cuántas rutinas vencidas tiene cada LUGAR visible. */
export async function vencidasPorLugar(userAccountId: string, locationIds: readonly string[], hoy: string): Promise<Map<string, number>> {
  const salida = new Map<string, number>();
  // Misma memoización que `vencidasPorEquipo`: un lugar con varias rutinas
  // activas no vuelve a resolver su visibilidad por cada una.
  const visible = new Map<string, boolean>();
  const rutinas = await prisma.careRoutine.findMany({
    where: { locationId: { in: [...locationIds] }, retiredAt: null },
    include: { events: { select: { performedOn: true, voidedAt: true } }, location: { select: { createdAt: true } } },
  });
  for (const r of rutinas) {
    if (!r.locationId) continue;
    if (!visible.has(r.locationId)) {
      visible.set(r.locationId, await puedeSobreLugar(userAccountId, r.locationId, "view"));
    }
    if (!visible.get(r.locationId)) continue;
    const e = estadoDeRutina({ intervalDays: r.intervalDays, registros: r.events, alta: r.location?.createdAt ?? null, hoy });
    if (e.estado === "vencida") salida.set(r.locationId, (salida.get(r.locationId) ?? 0) + 1);
  }
  return salida;
}
