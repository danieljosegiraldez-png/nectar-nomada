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
import type { ByproductDestination, ProvenanceClass } from "../../generated/prisma/client";

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

/** Autoriza, comprueba que el lote es miel, y deriva los códigos de los lotes que salen. */
async function loteDeMiel(userAccountId: string, lotId: string, cuantos = 1) {
  const lote = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lote) throw new TraceabilityAccessError("lot_not_found");
  // Autorizar ANTES de decir nada del lote: ni siquiera si es miel.
  await requireLotAccess(userAccountId, "manage", [lote]);
  if (lote.lotType !== "honey") throw new MielInvalida("el_lote_no_es_miel");
  const codigos = codigosDerivados(lote.lotCode, cuantos, await codigosYaDerivadosDe(lote.id));
  return { lote, codigo: codigos[0]!, codigos };
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
  /**
   * La cera que salió al colar, en kg — spec 2026-09-19 §4.2. **No es merma**: es un subproducto
   * con su destino, y su masa cuenta como SALIDA en el balance. Contarla como pérdida infla la
   * merma y esconde la de verdad, que es el número que dice si alguien pesó mal.
   */
  ceraKg?: number | string | null;
  ceraDestino?: ByproductDestination | null;
  ceraNota?: string | null;
}

/** Colar, filtrar, decantar/madurar, homogenizar: uno o varios en el mismo paso. */
export async function procesarMiel(userAccountId: string, input: ProcesarMielInput) {
  const { lote, codigo } = await loteDeMiel(userAccountId, input.lotId);
  const { acts, otherNote } = normalizarActosDeMiel(input.acts, input.otherNote);
  const { inputKg, lossKg } = entrada(input);
  const outputKg = kilos(input.outputKg, "salida");
  if (outputKg === null) throw new MielInvalida("faltan_kilos:salida");

  // Sin cera declarada no se escribe ninguna fila: «no se anotó» no es «no salió cera».
  const ceraKg = kilos(input.ceraKg ?? null, "cera");
  let cera: { byproductType: "CERA"; destination: ByproductDestination; massKg: number; producedAtLocationId: string; notes: string | null } | null = null;
  if (ceraKg !== null) {
    if (!input.ceraDestino) throw new MielInvalida("cera_sin_destino");
    const nota = input.ceraNota?.trim() || null;
    // La base lo exige también (CHECK `byproduct_batch_otro_dice_por_que`); aquí se dice con nombre.
    if (input.ceraDestino === "OTRO" && !nota) throw new MielInvalida("cera_otro_sin_nota");
    // El lugar es el del lote —el apiario de la cosecha—: es el ancla de RBAC de la tabla, y sin
    // él no habría a quién enseñarle esta cera.
    if (!lote.locationId) throw new MielInvalida("cera_sin_lugar");
    cera = { byproductType: "CERA", destination: input.ceraDestino, massKg: ceraKg, producedAtLocationId: lote.locationId, notes: nota };
  }

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
    byproducts: cera ? [cera] : undefined,
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

export interface DividirMielInput extends Omit<Comun, "inputKg"> {
  /** Los kilos de cada parte, en orden. Un hueco vacío no es una parte. */
  partesKg: readonly (number | string | null)[];
}

/**
 * Dividir un lote de miel en partes -- ADR-162. Cubetas, un tanque que se reparte, lo que va a
 * dos destinos distintos. Cada parte es un lote NUEVO, hermano de los otros, con la misma
 * genealogía hacia arriba.
 *
 * **Lo que entra es la suma de las partes más la merma**, y aquí sí se deduce: dividir no
 * transforma la miel, sólo la reparte, así que no hay una tercera pesada que pedir. Si esa suma
 * pasa de lo que el lote tiene, el libro lo rechaza (`input_exceeds_available`). Lo que no se
 * reparte se queda en el lote de origen.
 */
export async function dividirMiel(userAccountId: string, input: DividirMielInput) {
  const partes = input.partesKg.map((p, i) => kilos(p, `parte_${i + 1}`)).filter((p): p is number => p !== null);
  if (partes.length < 2) throw new MielInvalida("dividir_exige_dos_partes");
  if (partes.some((p) => p === 0)) throw new MielInvalida("parte_cero");
  const lossKg = kilos(input.lossKg ?? null, "merma");
  const { lote, codigos } = await loteDeMiel(userAccountId, input.lotId, partes.length);
  // En gramos enteros para que 0,1 + 0,2 no sume 0,30000000000000004 contra el libro.
  const entraKg = Math.round([...partes, lossKg ?? 0].reduce((a, b) => a + b * 1000, 0)) / 1000;

  const r = await recordTransformation(userAccountId, {
    transformationType: "split",
    occurredAt: input.occurredAt,
    provenanceClass: input.provenanceClass,
    notes: input.notes ?? null,
    inputs: [{ lotId: lote.id, quantity: entraKg, unit: "kg" }],
    outputs: partes.map((kg, i) => ({ lotCode: codigos[i]!, lotType: "honey" as const, quantity: kg, unit: "kg" })),
    declaredLossQuantity: lossKg,
    declaredLossUnit: lossKg === null ? null : "kg",
    declaredLossReason: lossKg === null ? null : "merma_al_dividir_miel",
  });
  return { transformation: r.transformation, lotes: r.outputLots, entraKg };
}
