import { recordTransformation } from "./lots";
import { SISTEMAS_DE_MALLA } from "./vocabularioDeMalla";
import { requireLotAccess } from "./lots";
import { prisma } from "../db";
import type { ProvenanceClass } from "../../generated/prisma/client";
import { exigirPersonaPermitida } from "../people/quienLoHizo";

export class GreenGradingValidationError extends Error {}

export interface GreenFractionInput {
  lotCode: string;
  quantityKg: number;
  screenMin?: number | null;
  screenMax?: number | null;
  screenSystem?: string | null;
  screenStatus: "measured" | "supplier_declared" | "qualitative" | "unknown";
  gradeNote?: string | null;
  uniformityPct?: number | null;
}

export interface RecordGreenGradingInput {
  inputLotId: string;
  inputQuantityKg: number;
  fractions: readonly GreenFractionInput[];
  defectLots?: ReadonlyArray<{ lotCode: string; quantityKg: number; rejectionCategoryValueId: string }>;
  declaredLossKg?: number | null;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export { SISTEMAS_DE_MALLA, type SistemaDeMalla } from "./vocabularioDeMalla";

export async function recordGreenGrading(userAccountId: string, input: RecordGreenGradingInput) {
  const source = await prisma.lot.findUnique({
    where: { id: input.inputLotId },
    select: { lotType: true, projectId: true, locationId: true, classification: true },
  });
  if (!source) throw new GreenGradingValidationError("lot_not_found");
  // El permiso ANTES de decir de qué tipo es el lote (revisión de Codex, hallazgo 5). Antes, quien
  // no tenía acceso distinguía tres respuestas —no existe / existe y no es verde / existe, es verde
  // y no te toca—, un oráculo sobre los lotes de otra organización. `recordTransformation` autoriza
  // igual más abajo, pero para entonces ya se había contestado.
  await requireLotAccess(userAccountId, "manage", [
    { projectId: source.projectId, locationId: source.locationId, classification: source.classification },
  ]);
  if (source.lotType !== "green") throw new GreenGradingValidationError("green_lot_required");
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [
    { projectId: source.projectId, locationId: source.locationId },
  ]);
  if (!(input.inputQuantityKg > 0)) throw new GreenGradingValidationError("input_quantity_required");
  if (input.fractions.length === 0) throw new GreenGradingValidationError("fraction_required");
  for (const fraction of input.fractions) {
    if (!(fraction.quantityKg > 0)) throw new GreenGradingValidationError("fraction_quantity_invalid");
    if (!fraction.lotCode.trim()) throw new GreenGradingValidationError("fraction_code_required");
    if (fraction.screenMin != null && (fraction.screenMin < 1 || fraction.screenMin > 30)) throw new GreenGradingValidationError("screen_invalid");
    if (fraction.screenMax != null && (fraction.screenMax < 1 || fraction.screenMax > 30)) throw new GreenGradingValidationError("screen_invalid");
    if (fraction.screenMin != null && fraction.screenMax != null && fraction.screenMin > fraction.screenMax) throw new GreenGradingValidationError("screen_range_invalid");
    if (fraction.uniformityPct != null && (fraction.uniformityPct < 0 || fraction.uniformityPct > 100)) throw new GreenGradingValidationError("uniformity_invalid");
    if (fraction.screenSystem != null) {
      if (!(SISTEMAS_DE_MALLA as readonly string[]).includes(fraction.screenSystem)) {
        throw new GreenGradingValidationError("screen_system_invalid");
      }
      // «Otro» sin decir cuál es texto libre por la puerta de atrás.
      if (fraction.screenSystem === "otro" && !fraction.gradeNote?.trim()) {
        throw new GreenGradingValidationError("screen_system_other_needs_note");
      }
    }
  }
  // La categoría de rechazo, canonizada: un alias se guarda como su fila canónica, la regla que
  // ADR-095 fijó para los cultivares. Sin esto el mismo defecto se reparte entre dos escrituras y
  // ningún informe los suma (revisión de Codex, hallazgo 4; `requireCatalogValue` en selection.ts
  // ya lo hacía y esta copia no).
  const categoriaCanonica = new Map<string, string>();
  for (const defect of input.defectLots ?? []) {
    if (!(defect.quantityKg >= 0) || !defect.lotCode.trim()) throw new GreenGradingValidationError("defect_invalid");
    const category = await prisma.variableCatalogValue.findUnique({
      where: { id: defect.rejectionCategoryValueId }, include: { catalog: { select: { key: true } } },
    });
    if (!category || category.catalog.key !== "rechazo_categoria") {
      throw new GreenGradingValidationError("defect_category_invalid");
    }
    categoriaCanonica.set(defect.rejectionCategoryValueId, category.aliasOfId ?? category.id);
  }
  const codes = [...input.fractions.map((f) => f.lotCode), ...(input.defectLots ?? []).map((d) => d.lotCode)];
  if (new Set(codes).size !== codes.length) throw new GreenGradingValidationError("duplicate_output_lot_codes");

  return recordTransformation(userAccountId, {
    transformationType: "selection",
    occurredAt: input.occurredAt,
    operatorPersonId: input.operatorPersonId ?? null,
    notes: input.notes ?? null,
    provenanceClass: input.provenanceClass,
    sourceReference: input.sourceReference ?? null,
    inputs: [{ lotId: input.inputLotId, quantity: input.inputQuantityKg, unit: "kg" }],
    outputs: [
      ...input.fractions.map((f) => ({
        lotCode: f.lotCode.trim(), lotType: "green" as const, quantity: f.quantityKg, unit: "kg",
        greenScreenMin: f.screenMin ?? null, greenScreenMax: f.screenMax ?? null,
        greenScreenSystem: f.screenSystem ?? null, greenScreenStatus: f.screenStatus,
        greenGradeNote: f.gradeNote ?? null, greenUniformityPct: f.uniformityPct ?? null,
      })),
      ...(input.defectLots ?? []).map((d) => ({
        lotCode: d.lotCode.trim(), lotType: "green" as const, quantity: d.quantityKg, unit: "kg",
        rejectionCategoryValueId: categoriaCanonica.get(d.rejectionCategoryValueId) ?? d.rejectionCategoryValueId,
      })),
    ],
    declaredLossQuantity: input.declaredLossKg ?? null,
    declaredLossUnit: input.declaredLossKg != null ? "kg" : null,
    declaredLossReason: input.declaredLossKg != null ? "merma de clasificación de café verde" : null,
  });
}
