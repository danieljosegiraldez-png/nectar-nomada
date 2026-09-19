/**
 * Recolectores de una finca y jornadas de cosecha.
 *
 * Spec: docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md §3.1–3.2. Daniel,
 * 2026-09-18: «en finca no se registra cosecha, se puede registrar listo para cosechar y asignar
 * personas a cosecha».
 *
 * - Una **jornada** es la fecha, la finca y qué recolector va a qué parcela o microparcela lista.
 *   La finca no crea lotes: las entregas salen de la jornada hacia el beneficio.
 * - Un **recolector** es una `Person`, con cuenta o sin ella, en la lista de la finca desde una
 *   fecha (`FincaRecolector`).
 *
 * Permiso: `lot:manage` sobre el sitio de la finca —lo que ya tienen el Farm Manager y el
 * capataz—. Leer una jornada exige `lot:view` sobre ese sitio.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess } from "./lots";
import { idsBajoLaFinca } from "./fincas";

export class JornadaError extends Error {}

async function sitioDeFinca(fincaSiteId: string) {
  const sitio = await prisma.location.findUnique({ where: { id: fincaSiteId }, select: { id: true, locationType: true, classification: true } });
  if (!sitio || sitio.locationType !== "site") throw new JornadaError("finca_no_encontrada");
  return sitio;
}

async function exigeGestionarFinca(userAccountId: string, fincaSiteId: string) {
  const sitio = await sitioDeFinca(fincaSiteId);
  await requireLotAccess(userAccountId, "manage", [{ locationId: sitio.id, classification: sitio.classification }]);
  return sitio;
}

/** Añade una persona a la lista de recolectores de la finca, desde una fecha. */
export async function agregarRecolector(userAccountId: string, input: { fincaSiteId: string; personId: string; desde: Date }) {
  await exigeGestionarFinca(userAccountId, input.fincaSiteId);
  if (!(await prisma.person.findUnique({ where: { id: input.personId }, select: { id: true } }))) throw new JornadaError("persona_no_encontrada");
  return prisma.$transaction(async (tx) => {
    const abierta = await tx.fincaRecolector.findFirst({ where: { personId: input.personId, fincaSiteId: input.fincaSiteId, hasta: null } });
    if (abierta) throw new JornadaError("ya_es_recolector");
    const fila = await tx.fincaRecolector.create({
      data: { personId: input.personId, fincaSiteId: input.fincaSiteId, desde: input.desde, createdBy: userAccountId },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_picker.add", entityType: "finca_recolector", entityId: fila.id, after: fila, sourceInterface: "traceability.service" },
      tx,
    );
    return fila;
  });
}

/** Los recolectores activos de la finca en una fecha (hoy, si no se da). */
export async function recolectoresDeFinca(userAccountId: string, fincaSiteId: string, en: Date = new Date()) {
  const sitio = await sitioDeFinca(fincaSiteId);
  await requireLotAccess(userAccountId, "view", [{ locationId: sitio.id, classification: sitio.classification }]);
  const filas = await prisma.fincaRecolector.findMany({
    where: { fincaSiteId, desde: { lte: en }, OR: [{ hasta: null }, { hasta: { gt: en } }] },
    include: { person: { select: { id: true, displayName: true } } },
    orderBy: { person: { displayName: "asc" } },
  });
  return filas.map((f) => ({ personId: f.person.id, nombre: f.person.displayName }));
}

export interface AbrirJornadaInput {
  readonly fincaSiteId: string;
  readonly fecha: Date;
  readonly nota?: string | null;
  readonly asignaciones: readonly { locationId: string; personId: string }[];
}

/**
 * Abre una jornada con al menos una asignación. Cada parcela tiene que ser un `plot` de ESTA
 * finca, y cada persona, recolector activo de esta finca en esa fecha.
 */
export async function abrirJornada(userAccountId: string, input: AbrirJornadaInput) {
  await exigeGestionarFinca(userAccountId, input.fincaSiteId);
  if (Number.isNaN(input.fecha.getTime())) throw new JornadaError("fecha_invalida");
  if (!input.asignaciones.length) throw new JornadaError("sin_asignaciones");

  const arbol = await prisma.location.findMany({ select: { id: true, parentLocationId: true, locationType: true } });
  const bajo = idsBajoLaFinca(arbol, input.fincaSiteId);
  const tipos = new Map(arbol.map((l) => [l.id, l.locationType]));
  for (const a of input.asignaciones) {
    if (!bajo.has(a.locationId) || tipos.get(a.locationId) !== "plot") throw new JornadaError("parcela_fuera_de_la_finca");
  }

  return prisma.$transaction(async (tx) => {
    const personas = [...new Set(input.asignaciones.map((a) => a.personId))];
    const activos = await tx.fincaRecolector.findMany({
      where: { fincaSiteId: input.fincaSiteId, personId: { in: personas }, desde: { lte: input.fecha }, OR: [{ hasta: null }, { hasta: { gt: input.fecha } }] },
      select: { personId: true },
    });
    const activosSet = new Set(activos.map((r) => r.personId));
    if (personas.some((p) => !activosSet.has(p))) throw new JornadaError("no_es_recolector");

    const jornada = await tx.jornadaDeCosecha.create({
      data: {
        fincaSiteId: input.fincaSiteId,
        fecha: input.fecha,
        nota: input.nota?.trim() || null,
        createdBy: userAccountId,
        asignaciones: { create: input.asignaciones.map((a) => ({ locationId: a.locationId, personId: a.personId })) },
      },
      include: { asignaciones: true },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_day.open", entityType: "jornada_de_cosecha", entityId: jornada.id, after: jornada, sourceInterface: "traceability.service" },
      tx,
    );
    return jornada;
  });
}

/** Cierra una jornada: ya no admite entregas nuevas. */
export async function cerrarJornada(userAccountId: string, jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({ where: { id: jornadaId } });
  if (!jornada) throw new JornadaError("jornada_no_encontrada");
  await exigeGestionarFinca(userAccountId, jornada.fincaSiteId);
  return prisma.$transaction(async (tx) => {
    const antes = await tx.jornadaDeCosecha.findUniqueOrThrow({ where: { id: jornadaId } });
    if (antes.estado === "cerrada") throw new JornadaError("ya_cerrada");
    const despues = await tx.jornadaDeCosecha.update({ where: { id: jornadaId }, data: { estado: "cerrada", cerradaAt: new Date() } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_day.close", entityType: "jornada_de_cosecha", entityId: jornadaId, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/** Las jornadas de una finca, la más reciente primero. */
export async function jornadasDeFinca(userAccountId: string, fincaSiteId: string) {
  const sitio = await sitioDeFinca(fincaSiteId);
  await requireLotAccess(userAccountId, "view", [{ locationId: sitio.id, classification: sitio.classification }]);
  return prisma.jornadaDeCosecha.findMany({
    where: { fincaSiteId },
    orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    include: { _count: { select: { entregas: true, asignaciones: true } } },
  });
}

/** Una jornada con sus asignaciones y sus entregas. */
export async function detalleDeJornada(userAccountId: string, jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({ where: { id: jornadaId } });
  if (!jornada) throw new JornadaError("jornada_no_encontrada");
  const sitio = await sitioDeFinca(jornada.fincaSiteId);
  await requireLotAccess(userAccountId, "view", [{ locationId: sitio.id, classification: sitio.classification }]);
  const [asignaciones, entregas] = await Promise.all([
    prisma.asignacionDeJornada.findMany({
      where: { jornadaId },
      include: { location: { select: { id: true, name: true } }, person: { select: { id: true, displayName: true } } },
    }),
    prisma.entregaDeCosecha.findMany({
      where: { jornadaId },
      orderBy: { enviadaAt: "asc" },
      include: {
        recolector: { select: { id: true, displayName: true } },
        location: { select: { id: true, name: true } },
        plotBlock: { select: { id: true, name: true } },
        specimen: { select: { id: true, commonName: true } },
      },
    }),
  ]);
  return { jornada, asignaciones, entregas };
}
