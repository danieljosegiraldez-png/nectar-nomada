/**
 * El alta de proveedores de equipos (ADR-188).
 *
 * **Calcada de `lib/traceability/proveedoresDeCereza.ts`**, que resuelve este mismo problema y está
 * probada: una organización de tipo `supplier`, **sin `Location`** —un proveedor es un tercero del
 * directorio, no un sitio de la operación—, `approved` al crear, nombre único sin distinguir
 * mayúsculas ni espacios de sobra, permiso propio y su `AuditEvent`.
 *
 * **Por qué el permiso es propio y no `equipment:manage`**: dar de alta una organización en el
 * directorio no es lo mismo que registrar un equipo. Lo decide ADR-188.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { permissionKeysAnywhere } from "../rbac/service";
import { Prisma } from "../../generated/prisma/client";

export class ProveedorDeEquiposError extends Error {}

export async function crearProveedorDeEquipos(
  userAccountId: string,
  input: { nombre: string },
): Promise<{ id: string }> {
  // Un proveedor no tiene ubicación, así que el permiso se mira en CUALQUIER ámbito — igual que
  // `crearProveedorDeCereza`. Pedirlo sobre un sitio no tendría a qué sitio referirse.
  if (!(await permissionKeysAnywhere(userAccountId)).has("equipment_supplier:create")) {
    throw new ProveedorDeEquiposError("sin_permiso");
  }
  const nombre = input.nombre.trim().replace(/\s+/g, " ");
  if (!nombre || nombre.length > 120) throw new ProveedorDeEquiposError("nombre_invalido");
  try {
    return await crear(userAccountId, nombre);
  } catch (error) {
    // Dos altas a la vez del mismo nombre: la segunda choca con
    // `organization_proveedor_nombre_unico`. La comprobación de abajo no basta porque las dos
    // pueden leer antes de que ninguna escriba — es el índice quien serializa.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ProveedorDeEquiposError("proveedor_repetido");
    }
    throw error;
  }
}

async function crear(userAccountId: string, nombre: string): Promise<{ id: string }> {
  return prisma.$transaction(async (tx) => {
    const repetido = await tx.organization.findFirst({
      where: { organizationType: "supplier", name: { equals: nombre, mode: "insensitive" } },
      select: { id: true },
    });
    if (repetido) throw new ProveedorDeEquiposError("proveedor_repetido");
    const proveedor = await tx.organization.create({
      data: {
        organizationType: "supplier",
        name: nombre,
        status: "approved",
        classification: "internal",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "organization.create_equipment_supplier",
        entityType: "organization",
        entityId: proveedor.id,
        after: proveedor,
        sourceInterface: "lib/equipos/proveedores.ts",
      },
      tx,
    );
    return { id: proveedor.id };
  });
}
