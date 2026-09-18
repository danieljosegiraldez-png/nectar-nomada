/**
 * La reina de la colonia, por intervalos — «reina por colonia».
 *
 * Spec: docs/superpowers/specs/2026-09-18-faenas-division-y-reinas-design.md §4. Los nombres son de
 * SAGARPA: «crianza de reinas», «cambio de reinas», «introducción de reinas». Sin marca de reina
 * (Daniel, 2026-09-18: «no marcamos las reinas»).
 *
 * - Una tenencia es un intervalo cerrado a la izquierda y abierto a la derecha. **Cambiar** cierra la
 *   vieja y abre la nueva en el MISMO instante; la nueva no empieza antes que la vigente.
 * - Una abierta por colonia y una abierta por reina: lo garantiza la base (índices parciales únicos),
 *   no sólo este archivo.
 * - **No se infiere el pasado.** Una colonia sin ninguna reina registrada es «sin registro», nunca
 *   «huérfana» (ADR-080): huérfana es sólo la que tuvo una registrada y la perdió.
 *
 * Permiso: `apiary:manage` sobre la caja de la colonia para escribir; `view` para leer.
 */
import type { QueenOrigin, QueenTenureEnd } from "../../generated/prisma/client";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";

export class ReinaInvalida extends Error {}

/** Los orígenes, en el orden en que se ofrecen. `satisfies` hace que el compilador avise si el enum crece. */
export const ORIGENES_DE_REINA = ["criada_aqui", "comprada", "natural", "de_enjambre", "otro"] as const satisfies readonly QueenOrigin[];
export const FINES_DE_TENENCIA = ["cambiada", "muerta", "perdida", "enjambro", "otro"] as const satisfies readonly QueenTenureEnd[];

/** Lo que llega de un formulario, contra el vocabulario: un valor desconocido se rechaza, no se adivina. */
export function exigeOrigenDeReina(v: string): QueenOrigin {
  const o = ORIGENES_DE_REINA.find((x) => x === v);
  if (!o) throw new ReinaInvalida("origen_invalido");
  return o;
}
export function exigeFinDeTenencia(v: string): QueenTenureEnd {
  const f = FINES_DE_TENENCIA.find((x) => x === v);
  if (!f) throw new ReinaInvalida("fin_invalido");
  return f;
}

async function coloniaConCaja(colonyId: string) {
  const c = await prisma.colony.findUnique({
    where: { id: colonyId },
    include: { hive: { select: { id: true, projectId: true, locationId: true } } },
  });
  if (!c) throw new ApiaryAccessError("colony_not_found");
  return c;
}

function fechaValida(d: Date) {
  if (Number.isNaN(d.getTime())) throw new ReinaInvalida("fecha_invalida");
}

export interface ReinaNueva {
  readonly origen: QueenOrigin;
  /** De qué colonia salió — obligatoria si `origen = criada_aqui`, y sólo entonces. */
  readonly origenColonyId?: string | null;
  /** Obligatoria si `origen = otro`. */
  readonly notas?: string | null;
}

/** Valida el origen y, si fue criada aquí, que quien registra pueda ver la colonia de donde salió. */
async function validarOrigen(userAccountId: string, nueva: ReinaNueva) {
  const notas = nueva.notas?.trim() || null;
  if (nueva.origen === "criada_aqui" && !nueva.origenColonyId) throw new ReinaInvalida("criada_aqui_sin_colonia");
  if (nueva.origen !== "criada_aqui" && nueva.origenColonyId) throw new ReinaInvalida("colonia_de_origen_solo_si_criada_aqui");
  if (nueva.origen === "otro" && !notas) throw new ReinaInvalida("otro_sin_nota");
  if (nueva.origenColonyId) {
    const madre = await coloniaConCaja(nueva.origenColonyId);
    await requireApiaryAccess(userAccountId, "view", [madre.hive]);
  }
  return { origin: nueva.origen, originColonyId: nueva.origenColonyId ?? null, notes: notas };
}

function validarFin(fin: QueenTenureEnd, finNota?: string | null) {
  const nota = finNota?.trim() || null;
  if (fin === "otro" && !nota) throw new ReinaInvalida("fin_otro_sin_nota");
  return nota;
}

export interface IntroducirReinaInput extends ReinaNueva {
  readonly colonyId: string;
  readonly desde: Date;
}

/** Registrar la reina de una colonia que no tiene ninguna abierta. Si ya tiene una, eso es cambiar. */
export async function introducirReina(userAccountId: string, input: IntroducirReinaInput) {
  const colonia = await coloniaConCaja(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [colonia.hive]);
  fechaValida(input.desde);
  const datos = await validarOrigen(userAccountId, input);
  if (colonia.status !== "active") throw new ReinaInvalida("colonia_no_activa");
  if (input.desde < colonia.startedAt) throw new ReinaInvalida("reina_antes_de_la_colonia");

  return prisma.$transaction(async (tx) => {
    const ultima = await tx.queenTenure.findFirst({ where: { colonyId: colonia.id }, orderBy: { desde: "desc" } });
    if (ultima && ultima.hasta === null) throw new ReinaInvalida("ya_tiene_reina");
    if (ultima?.hasta && input.desde < ultima.hasta) throw new ReinaInvalida("introduccion_antes_del_fin_de_la_anterior");
    const reina = await tx.queen.create({ data: { ...datos, provenanceClass: "direct_observation", createdBy: userAccountId } });
    const tenencia = await tx.queenTenure.create({
      data: { queenId: reina.id, colonyId: colonia.id, desde: input.desde, createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "queen.introduce",
        entityType: "queen_tenure",
        entityId: tenencia.id,
        after: { reina, tenencia },
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return { reina, tenencia };
  });
}

export interface CambiarReinaInput {
  readonly colonyId: string;
  readonly nueva: ReinaNueva;
  readonly cuando: Date;
  /** Cómo terminó la vieja: `cambiada` si se sustituyó, `muerta`, `perdida`… */
  readonly finDeLaVieja: QueenTenureEnd;
  readonly finNota?: string | null;
}

/** Cierra la reina vigente y abre la nueva en el mismo instante, en una transacción. */
export async function cambiarReina(userAccountId: string, input: CambiarReinaInput) {
  const colonia = await coloniaConCaja(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [colonia.hive]);
  fechaValida(input.cuando);
  const datos = await validarOrigen(userAccountId, input.nueva);
  const finNota = validarFin(input.finDeLaVieja, input.finNota);
  if (colonia.status !== "active") throw new ReinaInvalida("colonia_no_activa");

  return prisma.$transaction(async (tx) => {
    const vigente = await tx.queenTenure.findFirst({ where: { colonyId: colonia.id, hasta: null } });
    if (!vigente) throw new ReinaInvalida("sin_reina_vigente");
    if (input.cuando <= vigente.desde) throw new ReinaInvalida("cambio_antes_de_la_vigente");
    const cerrada = await tx.queenTenure.update({
      where: { id: vigente.id },
      data: { hasta: input.cuando, fin: input.finDeLaVieja, finNota },
    });
    const reina = await tx.queen.create({ data: { ...datos, provenanceClass: "direct_observation", createdBy: userAccountId } });
    const abierta = await tx.queenTenure.create({
      data: { queenId: reina.id, colonyId: colonia.id, desde: input.cuando, createdBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "queen.change",
        entityType: "queen_tenure",
        entityId: abierta.id,
        before: vigente,
        after: { cerrada, reina, abierta },
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return { cerrada, abierta, reina };
  });
}

export interface CerrarTenenciaInput {
  readonly colonyId: string;
  readonly cuando: Date;
  readonly fin: QueenTenureEnd;
  readonly finNota?: string | null;
}

/** La reina vigente terminó y ninguna la sustituye todavía: la colonia queda huérfana. */
export async function cerrarTenencia(userAccountId: string, input: CerrarTenenciaInput) {
  const colonia = await coloniaConCaja(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [colonia.hive]);
  fechaValida(input.cuando);
  const finNota = validarFin(input.fin, input.finNota);

  return prisma.$transaction(async (tx) => {
    const vigente = await tx.queenTenure.findFirst({ where: { colonyId: colonia.id, hasta: null } });
    if (!vigente) throw new ReinaInvalida("sin_reina_vigente");
    if (input.cuando <= vigente.desde) throw new ReinaInvalida("fin_antes_de_empezar");
    const cerrada = await tx.queenTenure.update({ where: { id: vigente.id }, data: { hasta: input.cuando, fin: input.fin, finNota } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "queen.end",
        entityType: "queen_tenure",
        entityId: cerrada.id,
        before: vigente,
        after: cerrada,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return cerrada;
  });
}

/** La reina que tenía la colonia en `en` (por defecto, ahora), o `null` si no había ninguna registrada. */
export async function reinaDeColonia(userAccountId: string, colonyId: string, en: Date = new Date()) {
  const colonia = await coloniaConCaja(colonyId);
  await requireApiaryAccess(userAccountId, "view", [colonia.hive]);
  const t = await prisma.queenTenure.findFirst({
    where: { colonyId, desde: { lte: en }, OR: [{ hasta: null }, { hasta: { gt: en } }] },
    include: { queen: true },
  });
  return t?.queen ?? null;
}

/** Todas las tenencias de la colonia, la más reciente primero, con su reina. */
export async function historiaDeReinas(userAccountId: string, colonyId: string) {
  const colonia = await coloniaConCaja(colonyId);
  await requireApiaryAccess(userAccountId, "view", [colonia.hive]);
  return prisma.queenTenure.findMany({ where: { colonyId }, orderBy: { desde: "desc" }, include: { queen: true } });
}

export type EstadoDeReina =
  | { readonly estado: "CON_REINA"; readonly desde: Date }
  | { readonly estado: "HUERFANA"; readonly desde: Date }
  | { readonly estado: "SIN_REGISTRO"; readonly desde?: undefined };

/** CON_REINA si hay una abierta; HUERFANA si la última terminó; SIN_REGISTRO si nunca hubo ninguna. */
export async function estadoDeReina(userAccountId: string, colonyId: string): Promise<EstadoDeReina> {
  const colonia = await coloniaConCaja(colonyId);
  await requireApiaryAccess(userAccountId, "view", [colonia.hive]);
  const ultima = await prisma.queenTenure.findFirst({ where: { colonyId }, orderBy: { desde: "desc" } });
  if (!ultima) return { estado: "SIN_REGISTRO" };
  if (ultima.hasta === null) return { estado: "CON_REINA", desde: ultima.desde };
  return { estado: "HUERFANA", desde: ultima.hasta };
}
