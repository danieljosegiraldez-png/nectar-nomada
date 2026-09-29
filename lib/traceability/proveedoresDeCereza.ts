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
 * - **El alta ocurre en el BENEFICIO, y ahí se juzga el permiso.** Decisión de Daniel, 2026-09-29:
 *   «el cosechador no tiene que definir a quién le entrega; sólo entrega y pesa lo entregado. El
 *   beneficio, en su pantalla de operador, recibe». Así que `cherry_supplier:create` se juzga con
 *   `can()` contra el sitio del beneficio donde se está recibiendo, no «en cualquier ámbito».
 *
 *   Antes usaba `permissionKeysAnywhere`, cuyo propio comentario dice **«Display only, and never an
 *   authorization decision»**: la unión de todos los ámbitos es más ancha que cualquiera de ellos,
 *   que es justo lo que `lib/rbac/resolve.ts` existe para evitar. Que el proveedor creado no tenga
 *   ubicación no obliga a juzgar sin ámbito — lo que tiene ámbito es **el acto**, y ocurre en un
 *   beneficio concreto.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { exigeVerBeneficio } from "./pedidosDeCereza";
import { Prisma } from "../../generated/prisma/client";

export class ProveedorError extends Error {}

export async function crearProveedorDeCereza(
  userAccountId: string,
  beneficioId: string,
  input: { nombre: string; lugar?: string | null },
) {
  // La clasificación que se pasa es la DEL BENEFICIO, no `CLASSIFICATION_NOT_APPLICABLE`: quien no
  // alcanza ese beneficio tampoco debería dar de alta desde él, y el productor que se crea todavía
  // no existe como fila que clasificar.
  const b = await exigeVerBeneficio(userAccountId, beneficioId);
  if (!(await can(userAccountId, "create", "cherry_supplier", { scopeType: "location", scopeRefId: b.id }, b.classification))) {
    throw new ProveedorError("sin_permiso");
  }
  const nombre = input.nombre.trim().replace(/\s+/g, " ");
  if (!nombre || nombre.length > 120) throw new ProveedorError("nombre_invalido");
  try {
    return await crear(userAccountId, b.id, nombre, input.lugar);
  } catch (error) {
    // Dos altas a la vez del mismo nombre: la segunda choca con `organization_productor_nombre_unico`
    // (revisión de Codex, hallazgo 4).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ProveedorError("proveedor_repetido");
    throw error;
  }
}

async function crear(userAccountId: string, beneficioId: string, nombre: string, lugar: string | null | undefined) {
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
      {
        actorUserAccountId: userAccountId,
        operation: "organization.create_cherry_supplier",
        entityType: "organization",
        entityId: proveedor.id,
        // `autorizadoEnBeneficio` es el beneficio que autorizó el alta. Sin él, una cuenta con
        // acceso a varios no deja ver cuál la justificó (revisión de Codex, hallazgo 1). No lo
        // convierte en dueño: el proveedor es global y no cuelga de ningún beneficio.
        after: { ...proveedor, autorizadoEnBeneficio: beneficioId },
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return proveedor;
  });
}

/**
 * Los productores para elegir al recibir o al pedir, **acotado al beneficio desde el que se pide**.
 *
 * La lista en sí es global —un productor no pertenece a un beneficio—, pero el DERECHO a verla se
 * juzga sobre el beneficio donde se está trabajando, que es el ámbito que las dos pantallas que la
 * llaman ya tienen resuelto. Antes exigía `lot:view` en cualquier ámbito, que es más ancho que el
 * sitio donde ocurre la consulta.
 */
export async function proveedoresDeCereza(userAccountId: string, beneficioId: string) {
  await exigeVerBeneficio(userAccountId, beneficioId);
  return prisma.organization.findMany({
    where: { organizationType: "producer", status: { not: "archived" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
