/**
 * Los artefactos de una colmena: qué lleva puesto y DESDE CUÁNDO.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §A. Daniel, el
 * 2026-09-17: «reductor de piquera instalada en cámara de cría es un artefacto, es como también
 * decir que uno va a poner excluidor de reina o un smart hive console». Y pidió historial con
 * fechas, que un booleano en `Hive` no puede dar.
 *
 * **El intervalo es la verdad.** Qué llevaba puesto esta colmena el 3 de mayo sólo lo contesta
 * un intervalo. Cerrado a la izquierda, abierto a la derecha: retirado el día 10, el día 10 ya
 * no estaba.
 *
 * Permiso: `apiary:manage`, como el resto del trabajo de la colmena (decisión §7.1 del spec).
 * El nodo de sensores, que reasigna datos al moverse, tendrá su propio permiso (Tarea 4).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import type { HiveFittingKind, ProvenanceClass } from "../../generated/prisma/client";

export class ArtefactoInvalido extends Error {}

async function colmena(hiveId: string) {
  const hive = await prisma.hive.findUnique({ where: { id: hiveId }, select: { locationId: true, projectId: true } });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  return hive;
}

export interface InstalarArtefactoInput {
  readonly hiveId: string;
  readonly kind: HiveFittingKind;
  readonly installedAt: Date;
  /** Sólo `alza`, y obligatoria ahí. */
  readonly count?: number | null;
  readonly notes?: string | null;
  /** Lo que se vio al poner el artefacto. Se puede declarar otra (p. ej. `original_record` al pasar un cuaderno). */
  readonly provenanceClass?: ProvenanceClass;
}

export async function instalarArtefacto(userAccountId: string, input: InstalarArtefactoInput) {
  const hive = await colmena(input.hiveId);
  await requireApiaryAccess(userAccountId, "manage", [hive]);

  if (Number.isNaN(input.installedAt.getTime())) throw new ArtefactoInvalido("fecha_de_instalacion_invalida");
  const count = input.count ?? null;
  if (input.kind === "alza") {
    if (count === null || !Number.isInteger(count) || count <= 0) throw new ArtefactoInvalido("cuenta_de_alzas_requerida");
  } else if (count !== null) {
    throw new ArtefactoInvalido("cuenta_sólo_para_alzas");
  }
  const notes = input.notes?.trim() || null;
  if (input.kind === "otro" && !notes) throw new ArtefactoInvalido("otro_sin_nota");

  return prisma.$transaction(async (tx) => {
    const fitting = await tx.hiveFitting.create({
      data: {
        hiveId: input.hiveId,
        kind: input.kind,
        count,
        installedAt: input.installedAt,
        notes,
        provenanceClass: input.provenanceClass ?? "direct_observation",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "hive_fitting.install",
        entityType: "hive_fitting",
        entityId: fitting.id,
        after: fitting,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return fitting;
  });
}

export async function retirarArtefacto(userAccountId: string, input: { readonly fittingId: string; readonly removedAt: Date }) {
  const antes = await prisma.hiveFitting.findUnique({ where: { id: input.fittingId } });
  if (!antes) throw new ArtefactoInvalido("artefacto_no_encontrado");
  await requireApiaryAccess(userAccountId, "manage", [await colmena(antes.hiveId)]);

  if (Number.isNaN(input.removedAt.getTime())) throw new ArtefactoInvalido("fecha_de_retiro_invalida");
  // Lo retirado ya tiene su fecha: cambiarla es CORREGIR el intervalo, otra operación.
  if (antes.removedAt) throw new ArtefactoInvalido("ya_retirado");
  if (input.removedAt <= antes.installedAt) throw new ArtefactoInvalido("retiro_anterior_a_instalacion");

  return prisma.$transaction(async (tx) => {
    const despues = await tx.hiveFitting.update({ where: { id: antes.id }, data: { removedAt: input.removedAt } });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "hive_fitting.remove",
        entityType: "hive_fitting",
        entityId: despues.id,
        before: antes,
        after: despues,
        sourceInterface: "apiary.service",
      },
      tx,
    );
    return despues;
  });
}

/** Lo que la colmena llevaba puesto EN un momento. `en` ausente es AHORA, no «todos». */
export async function artefactosDeColmena(userAccountId: string, hiveId: string, en?: Date) {
  await requireApiaryAccess(userAccountId, "view", [await colmena(hiveId)]);
  const momento = en ?? new Date();
  return prisma.hiveFitting.findMany({
    where: {
      hiveId,
      installedAt: { lte: momento },
      OR: [{ removedAt: null }, { removedAt: { gt: momento } }],
    },
    orderBy: { installedAt: "asc" },
  });
}
