/**
 * Lo que se le hace a un lote de MIEL después de extraerlo: procesarlo y envasarlo (ADR-161).
 *
 * **La miel es un `Lot`** (A3), y estos dos pasos son `LotTransformation` como cualquier otro:
 * cada uno crea un lote NUEVO y deja la genealogía entera —de qué cosecha, de qué colonia, de
 * qué caja— sin copiar nada. Por eso una muestra del frasco llega a la cata sabiendo de dónde
 * salió.
 *
 * **Los dos conservan masa** (`balance.ts`): lo que sale más la merma declarada tiene que sumar
 * lo que entró. Y los dos admiten tomar **parte** del lote: se cuelan 20 kg de un tanque de 30,
 * se envasan 12 kg y el resto se queda. Por eso piden los kilos que entran: no se deducen.
 */
import { prisma } from "../db";
import { recordTransformation, requireLotAccess, TraceabilityAccessError } from "../traceability/lots";
import { codigosDerivados } from "../traceability/codigosDerivados";
import { codigosYaDerivadosDe } from "../traceability/selection";
import { kilos, MielInvalida, normalizarActosDeMiel } from "./vocabularioDeMiel";
import type { ProvenanceClass } from "../../generated/prisma/client";

interface Comun {
  lotId: string;
  /** El DÍA (medianoche UTC, `fechaDeDia`). */
  occurredAt: Date;
  /** Los kilos que se toman del lote. Obligatorio: tomar parte es lo normal. */
  inputKg: number | string | null;
  /** Merma declarada: cera y residuos al colar, lo que queda en el tanque al envasar. */
  lossKg?: number | string | null;
  provenanceClass: ProvenanceClass;
  notes?: string | null;
}

/** Autoriza, comprueba que el lote es miel, y deriva el código del lote que sale. */
async function loteDeMiel(userAccountId: string, lotId: string) {
  const lote = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lote) throw new TraceabilityAccessError("lot_not_found");
  // Autorizar ANTES de decir nada del lote: ni siquiera si es miel.
  await requireLotAccess(userAccountId, "manage", [lote]);
  if (lote.lotType !== "honey") throw new MielInvalida("el_lote_no_es_miel");
  const [codigo] = codigosDerivados(lote.lotCode, 1, await codigosYaDerivadosDe(lote.id));
  return { lote, codigo: codigo! };
}

function entrada(input: Comun) {
  const inputKg = kilos(input.inputKg, "entrada");
  if (inputKg === null) throw new MielInvalida("faltan_kilos:entrada");
  if (inputKg === 0) throw new MielInvalida("entrada_cero");
  return { inputKg, lossKg: kilos(input.lossKg ?? null, "merma") };
}

export interface ProcesarMielInput extends Comun {
  acts: readonly unknown[];
  otherNote?: string | null;
  /** Los kilos de miel que salen. Cero es un dato: el proceso no dejó nada utilizable. */
  outputKg: number | string | null;
}

/** Colar, filtrar, decantar/madurar, homogenizar: uno o varios en el mismo paso. */
export async function procesarMiel(userAccountId: string, input: ProcesarMielInput) {
  const { lote, codigo } = await loteDeMiel(userAccountId, input.lotId);
  const { acts, otherNote } = normalizarActosDeMiel(input.acts, input.otherNote);
  const { inputKg, lossKg } = entrada(input);
  const outputKg = kilos(input.outputKg, "salida");
  if (outputKg === null) throw new MielInvalida("faltan_kilos:salida");

  const r = await recordTransformation(userAccountId, {
    transformationType: "honey_processing",
    occurredAt: input.occurredAt,
    provenanceClass: input.provenanceClass,
    notes: input.notes ?? null,
    inputs: [{ lotId: lote.id, quantity: inputKg, unit: "kg" }],
    outputs: [{ lotCode: codigo, lotType: "honey", quantity: outputKg, unit: "kg" }],
    declaredLossQuantity: lossKg,
    declaredLossUnit: lossKg === null ? null : "kg",
    declaredLossReason: lossKg === null ? null : "merma_del_proceso_de_miel",
    honeyProcessActs: acts,
    honeyProcessOtherNote: otherNote,
  });
  return { transformation: r.transformation, lote: r.outputLots[0]!, reconciliation: r.reconciliation };
}

export interface EnvasarMielInput extends Comun {
  packageCount: number | string | null;
  /** Masa neta de CADA envase, en gramos, como la declara quien envasa. */
  packageNetMassG: number | string | null;
}

/**
 * Envasar: cuántos envases y de qué masa neta.
 *
 * **La masa del lote envasado es `envases × masa neta`**, y se dice que es un cálculo: son dos
 * números declarados multiplicados, no una tercera pesada. Si el envasado pesa distinto de lo
 * que entró, la diferencia sale en el balance —que es donde tiene que salir— en vez de
 * esconderse en un número tecleado para que cuadre.
 */
export async function envasarMiel(userAccountId: string, input: EnvasarMielInput) {
  const { lote, codigo } = await loteDeMiel(userAccountId, input.lotId);
  const { inputKg, lossKg } = entrada(input);
  const cuenta = Number(input.packageCount);
  if (!Number.isInteger(cuenta) || cuenta <= 0) throw new MielInvalida("envases_invalidos");
  const netoG = kilos(input.packageNetMassG, "masa_neta");
  if (netoG === null || netoG === 0) throw new MielInvalida("masa_neta_invalida");
  const envasadoKg = Math.round(cuenta * netoG) / 1000;

  const r = await recordTransformation(userAccountId, {
    transformationType: "packaging",
    occurredAt: input.occurredAt,
    provenanceClass: input.provenanceClass,
    notes: input.notes ?? null,
    inputs: [{ lotId: lote.id, quantity: inputKg, unit: "kg" }],
    outputs: [{ lotCode: codigo, lotType: "honey", quantity: envasadoKg, unit: "kg" }],
    declaredLossQuantity: lossKg,
    declaredLossUnit: lossKg === null ? null : "kg",
    declaredLossReason: lossKg === null ? null : "merma_del_envasado",
    packageCount: cuenta,
    packageNetMassG: netoG,
  });
  return { transformation: r.transformation, lote: r.outputLots[0]!, envasadoKg, reconciliation: r.reconciliation };
}
