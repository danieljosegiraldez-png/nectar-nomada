/**
 * El alta de proveedores de equipos (ADR-188).
 *
 * **Calcada de `lib/traceability/proveedoresDeCereza.ts`** en su forma: una organización de tipo
 * `supplier`, **sin `Location`** —un proveedor es un tercero del directorio, no un sitio de la
 * operación—, `approved` al crear, nombre único sin distinguir mayúsculas ni espacios de sobra,
 * permiso propio y su `AuditEvent`.
 *
 * **Por qué el permiso es propio y no `equipment:manage`**: dar de alta una organización en el
 * directorio no es lo mismo que registrar un equipo. Lo decide ADR-188.
 *
 * **Y por qué se juzga en ámbito de PLATAFORMA, apartándose de la de cereza.** Ésta es la única
 * divergencia deliberada del calco, y la razón es que el efecto es global: la fila creada la ve y la
 * puede elegir cualquiera, y ocupa ese nombre en el directorio para todos. `crearProveedorDeCereza`
 * mira su permiso con `permissionKeysAnywhere`, cuyo propio comentario dice **«Display only, and
 * never an authorization decision»** — la unión de todos los ámbitos es más ancha que cualquiera de
 * ellos, que es justo lo que `resolve.ts` existe para evitar. Lo destapó la revisión de Codex del
 * 2026-09-27 y lo decidió Daniel. El precedente que se sigue es `organization:create_farm`
 * (`lib/traceability/fincas.ts`): capacidad global, `can()` contra el ámbito de plataforma, y ningún
 * perfil acotado la lista — Platform Admin la tiene por llevar el catálogo entero.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { CLASSIFICATION_NOT_APPLICABLE } from "../rbac/resolve";
import { Prisma } from "../../generated/prisma/client";

export class ProveedorDeEquiposError extends Error {}

/**
 * El ámbito de plataforma. `conAncestros` de plataforma es plataforma y nada más, así que una
 * asignación de sitio NO lo satisface — que es exactamente lo que se quiere aquí.
 */
const PLATAFORMA = { scopeType: "platform", scopeRefId: null } as const;

/**
 * ¿Puede esta cuenta meter un proveedor en el directorio? Lo usa el servicio antes de escribir y la
 * pantalla para no ofrecer un enlace que iba a acabar en `sin_permiso`. Sin clasificación aplicable:
 * la comprobación no toca ninguna fila, todavía no existe.
 */
export async function puedeCrearProveedorDeEquipos(userAccountId: string): Promise<boolean> {
  return can(userAccountId, "create", "equipment_supplier", PLATAFORMA, CLASSIFICATION_NOT_APPLICABLE);
}

export async function crearProveedorDeEquipos(
  userAccountId: string,
  input: { nombre: string },
): Promise<{ id: string }> {
  if (!(await puedeCrearProveedorDeEquipos(userAccountId))) {
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
