import { recordTransformation } from "./lots";
import { prisma } from "../db";
import type { ProvenanceClass } from "../../generated/prisma/client";

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

export async function recordGreenGrading(userAccountId: string, input: RecordGreenGradingInput) {
  const source = await prisma.lot.findUnique({ where: { id: input.inputLotId }, select: { lotType: true } });
  if (!source) throw new GreenGradingValidationError("lot_not_found");
  if (source.lotType !== "green") throw new GreenGradingValidationError("green_lot_required");
  if (!(input.inputQuantityKg > 0)) throw new GreenGradingValidationError("input_quantity_required");
  if (input.fractions.length === 0) throw new GreenGradingValidationError("fraction_required");
  for (const fraction of input.fractions) {
    if (!(fraction.quantityKg > 0)) throw new GreenGradingValidationError("fraction_quantity_invalid");
    if (!fraction.lotCode.trim()) throw new GreenGradingValidationError("fraction_code_required");
    if (fraction.screenMin != null && (fraction.screenMin < 1 || fraction.screenMin > 30)) throw new GreenGradingValidationError("screen_invalid");
    if (fraction.screenMax != null && (fraction.screenMax < 1 || fraction.screenMax > 30)) throw new GreenGradingValidationError("screen_invalid");
    if (fraction.screenMin != null && fraction.screenMax != null && fraction.screenMin > fraction.screenMax) throw new GreenGradingValidationError("screen_range_invalid");
    if (fraction.uniformityPct != null && (fraction.uniformityPct < 0 || fraction.uniformityPct > 100)) throw new GreenGradingValidationError("uniformity_invalid");
  }
  for (const defect of input.defectLots ?? []) {
    if (!(defect.quantityKg >= 0) || !defect.lotCode.trim()) throw new GreenGradingValidationError("defect_invalid");
    const category = await prisma.variableCatalogValue.findUnique({
      where: { id: defect.rejectionCategoryValueId }, include: { catalog: { select: { key: true } } },
    });
    if (!category || category.catalog.key !== "rechazo_categoria") {
      throw new GreenGradingValidationError("defect_category_invalid");
    }
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
        rejectionCategoryValueId: d.rejectionCategoryValueId,
      })),
    ],
    declaredLossQuantity: input.declaredLossKg ?? null,
    declaredLossUnit: input.declaredLossKg != null ? "kg" : null,
    declaredLossReason: input.declaredLossKg != null ? "merma de clasificación de café verde" : null,
  });
}
