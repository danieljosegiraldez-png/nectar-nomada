/**
 * Recibir un medicamento en el botiquín — botiquín, Tarea 9.
 *
 * Dos piezas para la pantalla de recepción:
 *
 * - `opcionesDeRecepcion`: los sitios donde quien mira puede recibir (`lot:manage`,
 *   como `recibirLote`) y los productos de medicamento de esas fincas, con lo que
 *   cada uno declara y lo que le FALTA.
 * - `completarProducto`: escribe los campos de medicamento que el producto aún no
 *   tiene. **Sólo rellena huecos, nunca sobrescribe**: cambiar la carencia que otro
 *   declaró es otra decisión, y no debe colarse por un formulario de recepción.
 *   Definir el producto es gestión: `equipment:manage`, como `crearMaterial`.
 *
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §B.1–B.2
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { MaterialAccessError, MaterialValidationError } from "./materiales";

/** Los campos del producto como medicamento. El orden es el de la pantalla. */
export const CAMPOS_DEL_PRODUCTO = [
  "manufacturer",
  "activeIngredient",
  "sanitaryRegistration",
  "defaultWithdrawalDays",
  "avisarDiasAntes",
  "storageConditions",
  "safetyNotes",
  "defaultReentryHours",
] as const;
export type CampoDelProducto = (typeof CAMPOS_DEL_PRODUCTO)[number];
const NUMERICOS: ReadonlySet<CampoDelProducto> = new Set(["defaultWithdrawalDays", "avisarDiasAntes", "defaultReentryHours"]);

/** Medicamento de botiquín o producto de manejo fitosanitario. */
export type ClaseDeProducto = "medicamento" | "fitosanitario";

/** Qué campos del producto se piden según su clase. La reentrada no significa
 *  nada para un medicamento de colmena. */
export function camposDe(clase: ClaseDeProducto): readonly CampoDelProducto[] {
  return clase === "fitosanitario" ? CAMPOS_DEL_PRODUCTO : CAMPOS_DEL_PRODUCTO.filter((c) => c !== "defaultReentryHours");
}

export interface ProductoParaRecibir {
  readonly id: string;
  readonly name: string;
  readonly defaultUnit: string;
  readonly organizationId: string;
  readonly campos: { readonly [K in CampoDelProducto]: string | number | null };
  /** Los que el producto aún no declara. La pantalla los ofrece. */
  readonly faltan: readonly CampoDelProducto[];
}

export interface OpcionesDeRecepcion {
  readonly sitios: readonly { id: string; name: string; organizationId: string; puedeDefinirProducto: boolean }[];
  readonly productos: readonly ProductoParaRecibir[];
}

export async function opcionesDeRecepcion(userAccountId: string, clase: ClaseDeProducto): Promise<OpcionesDeRecepcion> {
  const candidatos = await prisma.location.findMany({
    where: { organizationId: { not: null } },
    select: { id: true, name: true, organizationId: true },
    orderBy: { name: "asc" },
  });
  const sitios: { id: string; name: string; organizationId: string; puedeDefinirProducto: boolean }[] = [];
  for (const s of candidatos) {
    if (!s.organizationId) continue;
    const objetivo = { scopeType: "location", scopeRefId: s.id } as const;
    if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) continue;
    sitios.push({
      id: s.id,
      name: s.name,
      organizationId: s.organizationId,
      puedeDefinirProducto: await can(userAccountId, "manage", "equipment", objetivo, "internal"),
    });
  }

  const organizaciones = [...new Set(sitios.map((s) => s.organizationId))];
  const materiales = organizaciones.length === 0
    ? []
    : await prisma.consumableMaterial.findMany({
        where: {
          organizationId: { in: organizaciones },
          ...(clase === "fitosanitario" ? { isPlantProtection: true } : { isVeterinaryMedicine: true }),
        },
        orderBy: { name: "asc" },
      });

  const camposDeLaClase = camposDe(clase);
  const productos = materiales.map((m) => {
    const campos = Object.fromEntries(camposDeLaClase.map((c) => [c, m[c] ?? null])) as ProductoParaRecibir["campos"];
    return {
      id: m.id,
      name: m.name,
      defaultUnit: m.defaultUnit,
      organizationId: m.organizationId,
      campos,
      faltan: camposDeLaClase.filter((c) => campos[c] == null),
    };
  });
  return { sitios, productos };
}

export async function completarProducto(
  userAccountId: string,
  input: { readonly materialId: string; readonly locationId: string; readonly campos: Partial<Record<CampoDelProducto, string | number | null>> },
) {
  if (!(await can(userAccountId, "manage", "equipment", { scopeType: "location", scopeRefId: input.locationId }, "internal"))) {
    throw new MaterialAccessError("forbidden");
  }

  return prisma.$transaction(async (tx) => {
    const antes = await tx.consumableMaterial.findUnique({ where: { id: input.materialId } });
    if (!antes) throw new MaterialValidationError("material_not_found");
    // El sitio tiene que ser de la finca dueña del producto: si no, un permiso en
    // una finca serviría para completar el catálogo de otra.
    const sitio = await tx.location.findUnique({ where: { id: input.locationId }, select: { organizationId: true } });
    if (sitio?.organizationId !== antes.organizationId) throw new MaterialAccessError("forbidden");

    const data: Record<string, string | number> = {};
    for (const campo of CAMPOS_DEL_PRODUCTO) {
      const valor = input.campos[campo];
      if (valor == null || valor === "") continue;
      if (antes[campo] != null) continue; // Sólo huecos: lo declarado no se toca aquí.
      if (NUMERICOS.has(campo)) {
        const n = Number(valor);
        if (!Number.isInteger(n) || n < 0) {
          throw new MaterialValidationError(`${campo} inválido: ${valor}. Cero es válido; negativo no.`);
        }
        data[campo] = n;
      } else {
        const texto = String(valor).trim();
        if (texto) data[campo] = texto;
      }
    }
    if (Object.keys(data).length === 0) return antes;

    const despues = await tx.consumableMaterial.update({ where: { id: input.materialId }, data });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "consumable_material.complete",
        sourceInterface: "traceability.service",
        entityType: "consumable_material",
        entityId: despues.id,
        before: antes,
        after: despues,
      },
      tx,
    );
    return despues;
  });
}
