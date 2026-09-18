/**
 * El nodo de sensores: un artefacto con identidad — artefactos de colmena, Tarea 4.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §B. El paquete Smart
 * Hive lo dice con sus palabras: «la reasignación del UID de un aparato exige autorización del
 * dueño y un cambio de intervalo auditable». Por eso:
 *
 * - el aparato vive en `HiveNode`, con su `deviceId` único — la identidad del REGISTRO;
 * - su asignación a una colmena es un `HiveFitting` (`nodo_de_sensores`) que apunta aquí: el
 *   mismo intervalo que un excluidor, sin una segunda tabla;
 * - registrarlo, instalarlo, moverlo o retirarlo exige `hive_node:manage` (spec §7.1).
 *
 * **Los intervalos de un nodo no se cruzan**, ni en la colmena (dos aparatos midiendo la misma
 * caja no se reconcilian después) ni en el aparato (un nodo en dos cajas a la vez atribuiría la
 * misma observación a dos colmenas). La base guarda los ABIERTOS con índices parciales; los
 * cruces con intervalos ya cerrados los comprueba este servicio, porque un índice no ve rangos.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { ApiaryAccessError, requireHiveNodeAccess } from "./hives";
import { abrirIntervaloEn, ArtefactoInvalido } from "./artefactos";
import type { ProvenanceClass } from "../../generated/prisma/client";

export interface RegistrarNodoInput {
  /** Lo que el aparato manda como `device_id`: «rp2040-0011223344556677». */
  readonly deviceId: string;
  /** Dónde se registra. De aquí sale la finca dueña y aquí se juzga el permiso. */
  readonly locationId: string;
  readonly hardware?: string | null;
  readonly firmware?: string | null;
  readonly configurationId?: string | null;
}

export async function registrarNodo(userAccountId: string, input: RegistrarNodoInput) {
  const deviceId = input.deviceId.trim();
  if (!deviceId) throw new ArtefactoInvalido("device_id_requerido");
  const sitio = await prisma.location.findUnique({ where: { id: input.locationId }, select: { organizationId: true } });
  if (!sitio) throw new ApiaryAccessError("location_not_found");
  await requireHiveNodeAccess(userAccountId, [{ locationId: input.locationId }]);
  // Sin finca no hay a quién pertenezca el aparato, y sus datos no tendrían dueño.
  if (!sitio.organizationId) throw new ArtefactoInvalido("sitio_sin_finca");
  const organizationId = sitio.organizationId;

  try {
    return await prisma.$transaction(async (tx) => {
      const nodo = await tx.hiveNode.create({
        data: {
          deviceId,
          organizationId,
          hardware: input.hardware?.trim() || null,
          firmware: input.firmware?.trim() || null,
          configurationId: input.configurationId?.trim() || null,
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "hive_node.register",
          entityType: "hive_node",
          entityId: nodo.id,
          after: nodo,
          sourceInterface: "apiary.service",
        },
        tx,
      );
      return nodo;
    });
  } catch (error) {
    // El choque lo decide la BASE (índice único): una comprobación previa tendría carrera.
    if (error instanceof Error && /device_id/.test(error.message) && /Unique constraint/i.test(error.message)) {
      throw new ArtefactoInvalido("device_id_ya_registrado");
    }
    throw error;
  }
}

export interface InstalarNodoInput {
  readonly hiveId: string;
  readonly hiveNodeId: string;
  readonly installedAt: Date;
  readonly notes?: string | null;
  readonly provenanceClass?: ProvenanceClass;
}

export async function instalarNodo(userAccountId: string, input: InstalarNodoInput) {
  const hive = await prisma.hive.findUnique({
    where: { id: input.hiveId },
    select: { projectId: true, locationId: true, location: { select: { organizationId: true } } },
  });
  if (!hive) throw new ApiaryAccessError("hive_not_found");
  await requireHiveNodeAccess(userAccountId, [{ projectId: hive.projectId, locationId: hive.locationId }]);
  if (Number.isNaN(input.installedAt.getTime())) throw new ArtefactoInvalido("fecha_de_instalacion_invalida");

  const nodo = await prisma.hiveNode.findUnique({ where: { id: input.hiveNodeId } });
  if (!nodo) throw new ArtefactoInvalido("nodo_no_encontrado");
  if (nodo.organizationId !== hive.location.organizationId) throw new ArtefactoInvalido("nodo_de_otra_finca");
  if (nodo.lifecycleStatus !== "active") throw new ArtefactoInvalido("nodo_retirado_de_servicio");

  // Se cruza con [installedAt, ∞) todo intervalo que siga abierto o se cierre DESPUÉS.
  const cruza = { OR: [{ removedAt: null }, { removedAt: { gt: input.installedAt } }] };

  return prisma.$transaction(async (tx) => {
    if (await tx.hiveFitting.count({ where: { hiveNodeId: nodo.id, ...cruza } })) {
      throw new ArtefactoInvalido("nodo_en_otra_colmena");
    }
    if (await tx.hiveFitting.count({ where: { hiveId: input.hiveId, kind: "nodo_de_sensores", ...cruza } })) {
      throw new ArtefactoInvalido("nodo_ya_instalado");
    }
    return abrirIntervaloEn(userAccountId, {
      hiveId: input.hiveId,
      kind: "nodo_de_sensores",
      count: null,
      notes: input.notes?.trim() || null,
      installedAt: input.installedAt,
      provenanceClass: input.provenanceClass ?? "direct_observation",
      hiveNodeId: nodo.id,
    })(tx);
  });
}
