/**
 * El catálogo de materiales consumibles.
 *
 * **Sin identidad no hay existencias**, y ésa es toda la razón de este módulo:
 * hasta el 2026-09-17 el material era texto libre en cada consumo, y «aserrín»,
 * «aserrin» y «aserrín para el ahumador» eran tres materiales para la base.
 *
 * Spec: docs/superpowers/specs/2026-09-17-inventario-con-existencias-design.md
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";

export class MaterialValidationError extends Error {}
export class MaterialAccessError extends Error {}

export interface CrearMaterialInput {
  readonly organizationId: string;
  readonly name: string;
  readonly defaultUnit: string;
  readonly category?: string | null;
  readonly notes?: string | null;
  /**
   * Dónde se juzga el permiso. Mismo criterio que `registrarEquipo`, y por la
   * misma razón que dice su comentario: si se declara el sitio, el permiso se
   * juzga AHÍ — sin esto, dar de alta «gallinaza» para tu propia finca exigiría
   * mandar en toda la plataforma.
   */
  readonly projectId?: string | null;
  readonly locationId?: string | null;
}

export async function crearMaterial(userAccountId: string, input: CrearMaterialInput) {
  const name = input.name.trim();
  const defaultUnit = input.defaultUnit.trim();

  if (!name) throw new MaterialValidationError("name_required");
  // **Sin unidad no hay existencias**: una cantidad sin unidad no se puede
  // sumar ni comparar, y guardarla invitaría a sumar sacos con galones.
  if (!defaultUnit) throw new MaterialValidationError("default_unit_required");

  // **Definir qué es «gallinaza» es un acto de GESTIÓN, no de faena.** Se usa
  // `equipment:manage` —que hoy sólo tiene `Farm Manager`— en vez de inventar un
  // permiso nuevo: el operario registra consumos, no decide el vocabulario de la
  // finca. Y se juzga donde se diga, como en `registrarEquipo`.
  const objetivo = input.locationId
    ? ({ scopeType: "location", scopeRefId: input.locationId } as const)
    : input.projectId
      ? ({ scopeType: "project", scopeRefId: input.projectId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
  if (!(await can(userAccountId, "manage", "equipment", objetivo, "internal"))) {
    throw new MaterialAccessError("forbidden");
  }

  // El choque lo decide la BASE, con su índice funcional sobre
  // `lower(btrim(name))`. Aquí sólo se traduce el error a algo legible: una
  // comprobación previa en código tendría una carrera entre el SELECT y el
  // INSERT, y dos operarios dando de alta «melaza» a la vez crearían las dos.
  try {
    const material = await prisma.$transaction(async (tx) => {
      const creado = await tx.consumableMaterial.create({
        data: {
          organizationId: input.organizationId,
          name,
          defaultUnit,
          category: input.category ?? null,
          notes: input.notes ?? null,
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "consumable_material.create",
          sourceInterface: "traceability.service",
          entityType: "consumable_material",
          entityId: creado.id,
          after: creado,
        },
        tx,
      );
      return creado;
    });
    return material;
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      throw new MaterialValidationError(`ya_existe: «${name}» en esta organización`);
    }
    throw err;
  }
}
