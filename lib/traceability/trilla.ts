/**
 * La trilla: quitar el pergamino y dejar café verde.
 *
 * **Envoltorio fino sobre `recordTransformation`, no un mecanismo paralelo** —
 * el mismo molde que `selection.ts`. Lo que aporta es el vocabulario del
 * dominio: una trilla tiene un pergamino que entra, un verde que sale, una
 * cascarilla que se composta y una merma que se declara. Traducir eso a
 * entradas y salidas genéricas en cada sitio de llamada es como se acaba
 * escribiendo mal una de las cuatro.
 *
 * **La trilla puede no ocurrir nunca** (§B.3): un lote vendido en pergamino no
 * se trilla, así que nada de lo que hay aguas abajo puede exigirla.
 *
 * Spec: docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md §B
 */
import { recordTransformation } from "./lots";
import type { ProvenanceClass } from "../../generated/prisma/client";

export interface RegistrarTrillaInput {
  readonly lotePergaminoId: string;
  readonly masaEntradaKg: number;
  readonly loteVerde: { readonly lotCode: string; readonly masaKg: number };
  /** Se composta. **No es merma** — ver §B.2 y `ByproductBatch`. */
  readonly cascarillaKg: number;
  /** La merma de verdad: lo que se perdió y nadie recuperó. */
  readonly mermaKg: number;
  readonly producedAtLocationId: string;
  readonly occurredAt: Date;
  readonly provenanceClass: ProvenanceClass;
  /** Quién la hizo, si no fue la propia organización: Cafelino, Kiva Estate. */
  readonly performedByOrganizationId?: string | null;
  readonly performedAtLocationId?: string | null;
  readonly custodyOut?: Date | null;
  readonly custodyIn?: Date | null;
  readonly operatorPersonId?: string | null;
  readonly notes?: string | null;
}

export async function registrarTrilla(userAccountId: string, input: RegistrarTrillaInput) {
  const { transformation, outputLots } = await recordTransformation(userAccountId, {
    transformationType: "hulling",
    occurredAt: input.occurredAt,
    provenanceClass: input.provenanceClass,
    operatorPersonId: input.operatorPersonId ?? null,
    notes: input.notes ?? null,
    performedByOrganizationId: input.performedByOrganizationId ?? null,
    performedAtLocationId: input.performedAtLocationId ?? null,
    custodyOut: input.custodyOut ?? null,
    custodyIn: input.custodyIn ?? null,
    inputs: [{ lotId: input.lotePergaminoId, quantity: input.masaEntradaKg, unit: "kg" }],
    outputs: [
      { lotCode: input.loteVerde.lotCode, lotType: "green", quantity: input.loteVerde.masaKg, unit: "kg" },
    ],
    // La cascarilla va aquí y no en `declaredLoss`: es un subproducto CON
    // destino, no material perdido. Su masa entra en el balance desde dentro de
    // la misma transacción.
    byproducts: [
      {
        byproductType: "CASCARILLA",
        destination: "COMPOST",
        massKg: input.cascarillaKg,
        producedAtLocationId: input.producedAtLocationId,
      },
    ],
    declaredLossQuantity: input.mermaKg,
    declaredLossUnit: "kg",
    declaredLossReason: "merma de trilla — la cascarilla va como subproducto, no aquí",
  });

  const { prisma } = await import("../db");
  const subproducto = await prisma.byproductBatch.findFirstOrThrow({
    where: { transformationId: transformation.id },
  });

  // **Se RELEE la transformación.** La que devuelve `recordTransformation` es
  // la fila tal como se creó, antes de que el balance escriba en ella la merma
  // declarada y lo inexplicado. Devolver esa versión daría cero en los dos
  // campos y quien llame lo leería como «no hubo merma» — que es exactamente
  // lo contrario de lo que pasó.
  const transformacion = await prisma.lotTransformation.findUniqueOrThrow({
    where: { id: transformation.id },
  });

  return { transformacion, loteVerde: outputLots[0]!, subproducto };
}
