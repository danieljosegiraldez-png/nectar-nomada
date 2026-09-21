/**
 * Alzas con marca — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §4.
 *
 * Daniel, 2026-09-18: las alzas «todavía no [llevan marca], pero se marcarán», y las quiere para
 * saber de qué alza salió la miel, por dónde pasó (sanidad), el inventario del equipo. La marca va
 * por fuera, donde se ve, y un alza se pone y se quita pocas veces: se puede seguir.
 *
 * **Dónde estuvo lo dicen sus intervalos** (`HiveFitting`, kind `alza`, cuenta 1, con
 * `hiveSuperId`): el patrón del nodo de sensores (`nodos.ts`), sin una tabla de colocaciones
 * aparte. Las alzas SIN marca no cambian: siguen siendo filas `alza` con su cuenta.
 *
 * Permiso: `apiary:manage` sobre el sitio o la colmena, como el resto del trabajo de la caja;
 * leer, `apiary:view`.
 */
import { resolveOrganizationForLocation } from "../traceability/locations";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { abrirIntervaloEn, ArtefactoInvalido } from "./artefactos";
import type { EquipmentLifecycle, ProvenanceClass } from "../../generated/prisma/client";

/** «a-07 » y «A-07» son la misma alza. La base exige esta forma (CHECK `hive_super_marca_normalizada`). */
export function normalizarMarca(code: string): string {
  return code.trim().toUpperCase();
}

export async function registrarAlza(
  userAccountId: string,
  input: { locationId: string; code: string; inServiceAt?: Date | null; notes?: string | null },
) {
  const code = normalizarMarca(input.code);
  if (!code) throw new ArtefactoInvalido("marca_requerida");
  const sitio = await prisma.location.findUnique({ where: { id: input.locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ locationId: input.locationId }]);
  // La finca se hereda: un apiario que cuelga de una finca no lleva organización propia (2026-09-21,
  // «Apiario 1/2 — Finca Rosina» daban 500 en producción). `resolveOrganizationForLocation` sube por padres.
  const organizationId = await resolveOrganizationForLocation(input.locationId);
  // Sin finca no hay a quién pertenezca el alza.
  if (!organizationId) throw new ArtefactoInvalido("sitio_sin_finca");
  if (input.inServiceAt && Number.isNaN(input.inServiceAt.getTime())) throw new ArtefactoInvalido("fecha_invalida");

  try {
    return await prisma.$transaction(async (tx) => {
      const alza = await tx.hiveSuper.create({
        data: { organizationId, code, inServiceAt: input.inServiceAt ?? null, notes: input.notes?.trim() || null, createdBy: userAccountId },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, operation: "hive_super.register", entityType: "hive_super", entityId: alza.id, after: alza, sourceInterface: "apiary.service" },
        tx,
      );
      return alza;
    });
  } catch (error) {
    // El choque lo decide la BASE (índice único): una comprobación previa tendría carrera.
    if (error instanceof Error && /Unique constraint/i.test(error.message)) throw new ArtefactoInvalido("marca_repetida");
    throw error;
  }
}

export async function ponerAlza(
  userAccountId: string,
  input: { hiveId: string; hiveSuperId: string; installedAt: Date; provenanceClass?: ProvenanceClass },
) {
  const hive = await prisma.hive.findUnique({
    where: { id: input.hiveId },
    select: { projectId: true, locationId: true },
  });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireApiaryAccess(userAccountId, "manage", [{ projectId: hive.projectId, locationId: hive.locationId }]);
  if (Number.isNaN(input.installedAt.getTime())) throw new ArtefactoInvalido("fecha_de_instalacion_invalida");

  const alza = await prisma.hiveSuper.findUnique({ where: { id: input.hiveSuperId } });
  if (!alza) throw new ArtefactoInvalido("alza_no_encontrada");
  if (alza.organizationId !== (await resolveOrganizationForLocation(hive.locationId))) throw new ArtefactoInvalido("alza_de_otra_finca");
  if (alza.lifecycleStatus !== "active") throw new ArtefactoInvalido("alza_dada_de_baja");

  // Se cruza con [installedAt, ∞) todo intervalo que siga abierto o se cierre DESPUÉS.
  const cruza = { OR: [{ removedAt: null }, { removedAt: { gt: input.installedAt } }] };

  return prisma.$transaction(async (tx) => {
    if (await tx.hiveFitting.count({ where: { hiveSuperId: alza.id, ...cruza } })) {
      throw new ArtefactoInvalido("alza_en_otra_colmena");
    }
    return abrirIntervaloEn(userAccountId, {
      hiveId: input.hiveId,
      kind: "alza",
      count: 1,
      notes: null,
      installedAt: input.installedAt,
      provenanceClass: input.provenanceClass ?? "direct_observation",
      hiveSuperId: alza.id,
    })(tx);
  });
}

export async function darDeBajaAlza(
  userAccountId: string,
  input: { hiveSuperId: string; retiredAt: Date; reason: string; lifecycleStatus?: "retired" | "disposed" },
) {
  const motivo = input.reason.trim();
  if (!motivo) throw new ArtefactoInvalido("baja_sin_motivo");
  if (Number.isNaN(input.retiredAt.getTime())) throw new ArtefactoInvalido("fecha_invalida");
  const antes = await prisma.hiveSuper.findUnique({ where: { id: input.hiveSuperId } });
  if (!antes) throw new ArtefactoInvalido("alza_no_encontrada");
  // El permiso se juzga donde el alza tiene sitios: cualquier apiario de su finca.
  const sitios = await prisma.location.findMany({ where: { organizationId: antes.organizationId }, select: { id: true } });
  await requireApiaryAccess(userAccountId, "manage", sitios.map((s) => ({ locationId: s.id })));
  if (antes.lifecycleStatus !== "active") throw new ArtefactoInvalido("alza_dada_de_baja");

  return prisma.$transaction(async (tx) => {
    // Puesta en una colmena no se da de baja: primero se quita, y su intervalo dice cuándo.
    if (await tx.hiveFitting.count({ where: { hiveSuperId: antes.id, removedAt: null } })) throw new ArtefactoInvalido("alza_puesta");
    const despues = await tx.hiveSuper.update({
      where: { id: antes.id },
      data: { lifecycleStatus: input.lifecycleStatus ?? "retired", retiredAt: input.retiredAt, retiredReason: motivo },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "hive_super.retire", entityType: "hive_super", entityId: antes.id, before: antes, after: despues, reason: motivo, sourceInterface: "apiary.service" },
      tx,
    );
    return despues;
  });
}

export interface AlzaDelApiario {
  id: string;
  code: string;
  lifecycleStatus: EquipmentLifecycle;
  retiredAt: Date | null;
  retiredReason: string | null;
  inServiceAt: Date | null;
  /** Dónde está HOY. `aqui` falso: en una caja de otro apiario, y entonces no se dice cuál. */
  puestaEn: { hiveId: string; identifier: string; aqui: boolean; desde: Date } | null;
  /** Por dónde pasó, lo más nuevo primero. Lo de otro apiario, sin nombre de caja. */
  historia: { hiveIdentifier: string; aqui: boolean; desde: Date; hasta: Date | null }[];
  cosechas: { occurredAt: Date; lotId: string; lotCode: string }[];
}

/**
 * Las alzas de la finca de este apiario, con dónde están, por dónde pasaron y en qué cosechas
 * salieron. **No enseña identificadores de cajas de OTRO apiario**: quien ve éste puede no ver aquél.
 */
export async function alzasDelApiario(userAccountId: string, locationId: string): Promise<AlzaDelApiario[]> {
  await requireApiaryAccess(userAccountId, "view", [{ locationId }]);
  const organizationId = await resolveOrganizationForLocation(locationId);
  if (!organizationId) return [];
  const alzas = await prisma.hiveSuper.findMany({
    where: { organizationId },
    orderBy: { code: "asc" },
    include: {
      fittings: { orderBy: { installedAt: "desc" }, include: { hive: { select: { id: true, identifier: true, locationId: true } } } },
      harvests: { include: { apiaryHarvestEvent: { select: { occurredAt: true, resultingLot: { select: { id: true, lotCode: true } } } } } },
    },
  });
  return alzas.map((a) => {
    const abierta = a.fittings.find((f) => f.removedAt === null) ?? null;
    return {
      id: a.id,
      code: a.code,
      lifecycleStatus: a.lifecycleStatus,
      retiredAt: a.retiredAt,
      retiredReason: a.retiredReason,
      inServiceAt: a.inServiceAt,
      puestaEn: abierta
        ? {
            hiveId: abierta.hive.locationId === locationId ? abierta.hive.id : "",
            identifier: abierta.hive.locationId === locationId ? abierta.hive.identifier : "",
            aqui: abierta.hive.locationId === locationId,
            desde: abierta.installedAt,
          }
        : null,
      historia: a.fittings.map((f) => ({
        hiveIdentifier: f.hive.locationId === locationId ? f.hive.identifier : "",
        aqui: f.hive.locationId === locationId,
        desde: f.installedAt,
        hasta: f.removedAt,
      })),
      cosechas: a.harvests
        .map((h) => ({ occurredAt: h.apiaryHarvestEvent.occurredAt, lotId: h.apiaryHarvestEvent.resultingLot.id, lotCode: h.apiaryHarvestEvent.resultingLot.lotCode }))
        .sort((x, y) => y.occurredAt.getTime() - x.occurredAt.getTime()),
    };
  });
}
