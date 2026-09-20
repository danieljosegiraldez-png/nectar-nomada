/**
 * Los productores de fuera que traen cereza al beneficio.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.2. Daniel,
 * 2026-09-19: «hay cerezas que pueden venir de fincas no en el sistema… y se trata como otra fuente
 * de cereza: no cambia metodología o workflow».
 *
 * - Un proveedor es una `Organization` de tipo `producer`, **sin** `Location`, parcelas ni
 *   recolectores. Se da de alta una vez y después se elige de una lista.
 * - El lugar se guarda en texto si se sabe; **no se inventan coordenadas**.
 * - Nombre único entre los productores **sin distinguir mayúsculas**: «Don Pedro» no se da de
 *   alta dos veces.
 * - Un proveedor no tiene ubicación, así que el permiso se mira en cualquier ámbito
 *   (`permissionKeysAnywhere`).
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { permissionKeysAnywhere } from "../rbac/service";
import { Prisma } from "../../generated/prisma/client";

export class ProveedorError extends Error {}

export async function crearProveedorDeCereza(userAccountId: string, input: { nombre: string; lugar?: string | null }) {
  if (!(await permissionKeysAnywhere(userAccountId)).has("cherry_supplier:create")) throw new ProveedorError("sin_permiso");
  const nombre = input.nombre.trim().replace(/\s+/g, " ");
  if (!nombre || nombre.length > 120) throw new ProveedorError("nombre_invalido");
  try {
    return await crear(userAccountId, nombre, input.lugar);
  } catch (error) {
    // Dos altas a la vez del mismo nombre: la segunda choca con `organization_productor_nombre_unico`
    // (revisión de Codex, hallazgo 4).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ProveedorError("proveedor_repetido");
    throw error;
  }
}

async function crear(userAccountId: string, nombre: string, lugar: string | null | undefined) {
  return prisma.$transaction(async (tx) => {
    const repetido = await tx.organization.findFirst({
      where: { organizationType: "producer", name: { equals: nombre, mode: "insensitive" } },
      select: { id: true },
    });
    if (repetido) throw new ProveedorError("proveedor_repetido");
    const proveedor = await tx.organization.create({
      data: {
        organizationType: "producer",
        name: nombre,
        description: lugar?.trim() || null,
        status: "approved",
        classification: "internal",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "organization.create_cherry_supplier", entityType: "organization", entityId: proveedor.id, after: proveedor, sourceInterface: "traceability.service" },
      tx,
    );
    return proveedor;
  });
}

/** Los productores para elegir al recibir o al pedir. Exige ver lotes en algún ámbito. */
export async function proveedoresDeCereza(userAccountId: string) {
  const claves = await permissionKeysAnywhere(userAccountId);
  if (!claves.has("lot:view") && !claves.has("lot:manage")) throw new ProveedorError("sin_permiso");
  return prisma.organization.findMany({
    where: { organizationType: "producer", status: { not: "archived" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
