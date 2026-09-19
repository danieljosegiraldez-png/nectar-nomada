/**
 * La cera con el color de su año — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §5.
 *
 * **La edad de la cera va escrita en el propio marco, con el color de su año.** Aquí sólo se
 * anotan dos hechos —la cera nueva que entra y los marcos que se sacan— y la leyenda los junta por
 * año. Nadie anota por dónde se mueve un marco: Daniel dijo que en el campo no se va a anotar.
 *
 * Permiso: `apiary:manage` sobre el apiario para anotar; `apiary:view` para leer. La cera es de la
 * finca del apiario, no del apiario: un marco pasa de un sitio a otro sin avisar.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { avisoDeCera, colorDelAño, type AvisoDeCera, type ColorDeAño } from "./colorDelAno";
import type { FrameRemovalReason, WaxDestination, WaxKind } from "../../generated/prisma/client";

export class CeraInvalida extends Error {}

export const TIPOS_DE_CERA: readonly WaxKind[] = ["lamina_estampada_propia", "lamina_comprada", "sin_lamina", "otro"];
export const DESTINOS_DE_CERA: readonly WaxDestination[] = ["camara_de_cria", "alza"];
export const MOTIVOS_DE_SALIDA: readonly FrameRemovalReason[] = ["cera_vieja", "danado", "enfermedad", "otro"];

/** La finca del apiario, con el permiso ya comprobado. */
async function fincaDe(userAccountId: string, locationId: string, accion: "manage" | "view") {
  const sitio = await prisma.location.findUnique({ where: { id: locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireApiaryAccess(userAccountId, accion, [{ locationId }]);
  if (!sitio.organizationId) throw new CeraInvalida("sitio_sin_finca");
  return sitio.organizationId;
}

function marcos(n: number) {
  if (!Number.isInteger(n) || n <= 0) throw new CeraInvalida("marcos_invalidos");
  return n;
}

export async function registrarCeraNueva(
  userAccountId: string,
  input: {
    locationId: string;
    enteredAt: Date;
    frameCount: number;
    waxKind: WaxKind;
    destination?: WaxDestination | null;
    hiveId?: string | null;
    notes?: string | null;
  },
) {
  const organizationId = await fincaDe(userAccountId, input.locationId, "manage");
  if (Number.isNaN(input.enteredAt.getTime())) throw new CeraInvalida("fecha_invalida");
  if (!TIPOS_DE_CERA.includes(input.waxKind)) throw new CeraInvalida("tipo_de_cera_desconocido");
  if (input.destination && !DESTINOS_DE_CERA.includes(input.destination)) throw new CeraInvalida("destino_desconocido");
  const notes = input.notes?.trim() || null;
  if (input.waxKind === "otro" && !notes) throw new CeraInvalida("otro_sin_nota");
  const frameCount = marcos(input.frameCount);
  if (input.hiveId) {
    const hive = await prisma.hive.findUnique({ where: { id: input.hiveId }, select: { location: { select: { organizationId: true } } } });
    if (!hive || hive.location.organizationId !== organizationId) throw new CeraInvalida("colmena_de_otra_finca");
  }
  return prisma.$transaction(async (tx) => {
    const fila = await tx.newWaxEntry.create({
      data: {
        organizationId,
        enteredAt: input.enteredAt,
        frameCount,
        waxKind: input.waxKind,
        destination: input.destination ?? null,
        hiveId: input.hiveId ?? null,
        notes,
        provenanceClass: "direct_observation",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "new_wax_entry.create", entityType: "new_wax_entry", entityId: fila.id, after: fila, sourceInterface: "apiary.service" },
      tx,
    );
    return fila;
  });
}

export async function registrarSalidaDeMarcos(
  userAccountId: string,
  input: { locationId: string; waxYear: number; removedAt: Date; frameCount: number; reason: FrameRemovalReason; notes?: string | null },
) {
  const organizationId = await fincaDe(userAccountId, input.locationId, "manage");
  if (Number.isNaN(input.removedAt.getTime())) throw new CeraInvalida("fecha_invalida");
  if (!Number.isInteger(input.waxYear) || input.waxYear < 1990) throw new CeraInvalida("ano_invalido");
  if (input.waxYear > input.removedAt.getUTCFullYear()) throw new CeraInvalida("ano_aun_no_llega");
  if (!MOTIVOS_DE_SALIDA.includes(input.reason)) throw new CeraInvalida("motivo_desconocido");
  const notes = input.notes?.trim() || null;
  if (input.reason === "otro" && !notes) throw new CeraInvalida("otro_sin_nota");
  const frameCount = marcos(input.frameCount);
  return prisma.$transaction(async (tx) => {
    const fila = await tx.frameRemoval.create({
      data: { organizationId, waxYear: input.waxYear, removedAt: input.removedAt, frameCount, reason: input.reason, notes, createdBy: userAccountId },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "frame_removal.create", entityType: "frame_removal", entityId: fila.id, after: fila, sourceInterface: "apiary.service" },
      tx,
    );
    return fila;
  });
}

export interface FilaDeCera {
  año: number;
  color: ColorDeAño;
  entraron: number;
  salieron: number;
  /** Años de calendario desde el de la cera, en UTC. */
  edad: number;
  aviso: AvisoDeCera;
  /** Salieron más de los que se anotaron entrando: marcos de antes del registro. Se dice, no se impide. */
  salieronDeMas: boolean;
}

/** La leyenda de la finca del apiario: un renglón por año, del más nuevo al más viejo, siempre con el año en curso. */
export async function leyendaDeCera(userAccountId: string, locationId: string, hoy: Date = new Date()): Promise<FilaDeCera[]> {
  const organizationId = await fincaDe(userAccountId, locationId, "view");
  const [entradas, salidas] = await Promise.all([
    prisma.newWaxEntry.findMany({ where: { organizationId }, select: { enteredAt: true, frameCount: true } }),
    prisma.frameRemoval.findMany({ where: { organizationId }, select: { waxYear: true, frameCount: true } }),
  ]);
  const añoDeHoy = hoy.getUTCFullYear();
  const porAño = new Map<number, { entraron: number; salieron: number }>([[añoDeHoy, { entraron: 0, salieron: 0 }]]);
  const de = (año: number) => {
    let c = porAño.get(año);
    if (!c) porAño.set(año, (c = { entraron: 0, salieron: 0 }));
    return c;
  };
  for (const e of entradas) de(e.enteredAt.getUTCFullYear()).entraron += e.frameCount;
  for (const s of salidas) de(s.waxYear).salieron += s.frameCount;
  return [...porAño.entries()]
    .sort(([a], [b]) => b - a)
    .map(([año, c]) => {
      const edad = añoDeHoy - año;
      return { año, color: colorDelAño(año), entraron: c.entraron, salieron: c.salieron, edad, aviso: avisoDeCera(edad), salieronDeMas: c.salieron > c.entraron };
    });
}

export interface MarcosNegrosDeColmena {
  hiveId: string;
  identifier: string;
  marcos: number;
  /** La inspección que los contó. Si la última no contó, manda la anterior que sí — y su fecha lo dice. */
  fecha: Date;
}

/**
 * El aviso por aspecto — spec §5.3: las colmenas de ESTE apiario cuya última inspección que contó
 * marcos negros vio alguno. Si después se contaron cero, no avisa: se renovaron. Una inspección que
 * no contó (nulo) no borra el conteo anterior, porque «no se contó» no es «no hay».
 */
export async function marcosNegrosDelApiario(userAccountId: string, locationId: string): Promise<MarcosNegrosDeColmena[]> {
  await requireApiaryAccess(userAccountId, "view", [{ locationId }]);
  const contadas = await prisma.inspection.findMany({
    where: { darkFrames: { not: null }, colony: { hive: { locationId } } },
    orderBy: { occurredAt: "desc" },
    select: { darkFrames: true, occurredAt: true, colony: { select: { hive: { select: { id: true, identifier: true } } } } },
  });
  const ultima = new Map<string, MarcosNegrosDeColmena>();
  for (const i of contadas) {
    const h = i.colony.hive;
    if (!ultima.has(h.id)) ultima.set(h.id, { hiveId: h.id, identifier: h.identifier, marcos: i.darkFrames ?? 0, fecha: i.occurredAt });
  }
  return [...ultima.values()].filter((f) => f.marcos > 0).sort((a, b) => b.marcos - a.marcos);
}

