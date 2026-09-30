/**
 * El catálogo de materiales consumibles.
 *
 * **Sin identidad no hay existencias**, y ésa es toda la razón de este módulo:
 * hasta el 2026-09-17 el material era texto libre en cada consumo, y «aserrín»,
 * «aserrin» y «aserrín para el ahumador» eran tres materiales para la base.
 *
 * Spec: docs/superpowers/specs/2026-09-17-inventario-con-existencias-design.md
 */
import type { PlantProtectionUse, PlotInterventionTarget } from "../../generated/prisma/client";
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
   * **Los campos del producto como medicamento** — botiquín, Tarea 1. Todos
   * opcionales: la gallinaza no los tiene, y exigirlos convertiría el alta de un
   * saco en un formulario de farmacia.
   */
  readonly isVeterinaryMedicine?: boolean;
  readonly manufacturer?: string | null;
  readonly activeIngredient?: string | null;
  readonly sanitaryRegistration?: string | null;
  /** «Aunque sea cero». Nulo = sin declarar. */
  readonly defaultWithdrawalDays?: number | null;
  readonly storageConditions?: string | null;
  readonly safetyNotes?: string | null;
  readonly avisarDiasAntes?: number | null;
  /**
   * **Los campos del producto como manejo fitosanitario** — aplicaciones
   * fitosanitarias, Tarea 1. Gemelos de los de arriba: separan lo que se
   * ofrece al registrar una intervención del aserrín y la gallinaza.
   */
  readonly isPlantProtection?: boolean;
  /**
   * **Los datos que hacen consistente el registro de una aplicación** — decisión de Daniel,
   * 2026-09-30. Todos opcionales, como los de arriba: un saco de gallinaza no tiene dosis, y
   * exigirlos convertiría el alta de cualquier material en una ficha de agroquímico.
   *
   * `plantProtectionUse` es `preventivo` o `control`, y es del PRODUCTO y no de cada aplicación.
   * La dosis va en rango y **por litro de agua**, que es como viene en la etiqueta y lo que deja
   * multiplicar por el `mixVolume` que la intervención ya guarda. Y las plagas reusan el enum del
   * objetivo, para que producto e intervención hablen de lo mismo.
   */
  readonly plantProtectionUse?: PlantProtectionUse | null;
  readonly doseMin?: number | null;
  readonly doseMax?: number | null;
  readonly doseUnit?: string | null;
  readonly plantProtectionTargets?: readonly PlotInterventionTarget[];
  /** Horas de reentrada por defecto. Nulo = no declarada; 0 = declarada cero. */
  readonly defaultReentryHours?: number | null;
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

  // Los dos días, no negativos. La base lo rechaza igual con su CHECK; aquí
  // sale una frase legible. Cero SÍ vale: es la carencia «aunque sea cero».
  for (const [campo, valor] of [
    ["defaultWithdrawalDays", input.defaultWithdrawalDays],
    ["avisarDiasAntes", input.avisarDiasAntes],
    ["defaultReentryHours", input.defaultReentryHours],
  ] as const) {
    if (valor != null && (!Number.isInteger(valor) || valor < 0)) {
      throw new MaterialValidationError(`${campo} inválido: ${valor}. Cero es válido; negativo no.`);
    }
  }

  // Las dosis, que NO son enteros —«1,5 L/ha» es la forma típica— y no admiten el cero: una dosis
  // de cero no es una dosis, y lo que falta se queda en nulo.
  //
  // **El CHECK de la base es más flojo a propósito: rechaza negativos, no el cero.** No son la
  // misma comprobación y conviene no leerlas como si lo fueran — la base es el suelo que un
  // importador o un SQL directo tampoco pueden atravesar; esto es la puerta, y puede apretar más.
  for (const [campo, valor] of [
    ["doseMin", input.doseMin],
    ["doseMax", input.doseMax],
  ] as const) {
    if (valor != null && (!Number.isFinite(valor) || valor <= 0)) {
      throw new MaterialValidationError(`${campo} inválido: ${valor}. Una dosis es un número positivo.`);
    }
  }
  if (input.doseMin != null && input.doseMax != null && input.doseMin > input.doseMax) {
    throw new MaterialValidationError(`rango de dosis inválido: ${input.doseMin} > ${input.doseMax}.`);
  }

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
          // `?? null` y NUNCA `|| null`: con `||`, la carencia CERO declarada se
          // volvería «sin declarar». Hay una prueba y un flip-test para eso.
          isVeterinaryMedicine: input.isVeterinaryMedicine ?? false,
          manufacturer: input.manufacturer?.trim() || null,
          activeIngredient: input.activeIngredient?.trim() || null,
          sanitaryRegistration: input.sanitaryRegistration?.trim() || null,
          defaultWithdrawalDays: input.defaultWithdrawalDays ?? null,
          storageConditions: input.storageConditions?.trim() || null,
          safetyNotes: input.safetyNotes?.trim() || null,
          avisarDiasAntes: input.avisarDiasAntes ?? null,
          isPlantProtection: input.isPlantProtection ?? false,
          defaultReentryHours: input.defaultReentryHours ?? null,
          plantProtectionUse: input.plantProtectionUse ?? null,
          doseMin: input.doseMin ?? null,
          doseMax: input.doseMax ?? null,
          doseUnit: input.doseUnit?.trim() || null,
          plantProtectionTargets: [...(input.plantProtectionTargets ?? [])],
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
