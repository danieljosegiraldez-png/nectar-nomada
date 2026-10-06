/**
 * Phase 1, ticket T7 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §16, §34). Same pattern as T6's FermentationRun — the second "stage-run"
 * entity, deliberately no lotId of its own; which Lot is drying is
 * expressed via the stage_change LotTransformation(s) that reference this
 * run (dryingRunId). `locationId` on DryingRun is the drying site/bed —
 * descriptive context only, not a second RBAC gate; access is always
 * resolved against the source lot's own project/location.
 *
 *   startDryingRun — creates the run plus a stage_change LotTransformation
 *     (input: the lot entering drying, zero outputs).
 *   recordDryingTurnEvent — a simple typed log entry against an
 *     in-progress run (turned/covered/uncovered).
 *   endDryingRun — sets endedAt once and creates a second stage_change
 *     LotTransformation (same input lot, output: a new Lot at the next
 *     stage — green, per §8.3's lineage diagram).
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { settleMassBalance } from "./balance";
import { recordAuditEvent } from "../audit";
import { BandejaError } from "./bandejaError";
import { procesoAbiertoParaCorrida, TRANSACCION_DEL_LINAJE } from "./procesoDelLinaje";
import type { DryingOutcome, Lot, ProvenanceClass } from "../../generated/prisma/client";

async function resolveRunSourceLot(dryingRunId: string) {
  const transformation = await prisma.lotTransformation.findFirst({
    where: { dryingRunId },
    include: { inputs: { include: { lot: true } } },
    orderBy: { occurredAt: "asc" },
  });
  const inputLot = transformation?.inputs[0]?.lot;
  if (!inputLot) throw new TraceabilityAccessError("drying_run_not_found");
  return inputLot;
}

export interface StartDryingRunInput {
  lotId: string;
  method?: string | null;
  locationId?: string | null; // the drying site/bed
  layerDepthCm?: number | null;
  startedAt: Date;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback — same reasoning as fermentation.ts's
  // StartFermentationRunInput (starting a run is an action taken).
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function startDryingRun(userAccountId: string, input: StartDryingRunInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lot.projectId, locationId: lot.locationId }]);

  const result = await prisma.$transaction(async (tx) => {
    // Parte 1, R3 (2026-10-01): ver `startFermentationRun`.
    const proceso = await procesoAbiertoParaCorrida(tx, input.lotId);
    const run = await tx.dryingRun.create({
      data: {
        method: input.method ?? null,
        locationId: input.locationId ?? null,
        layerDepthCm: input.layerDepthCm ?? null,
        startedAt: input.startedAt,
        lotProcessId: proceso.id,
        createdBy: userAccountId,
      },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: input.startedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        dryingRunId: run.id,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [{ lotId: input.lotId, quantity: input.quantity ?? null, unit: input.unit ?? null }],
        },
      },
    });

    // C1 §3 pattern: an evidentiary write. Dentro de la transacción y con
    // `tx` desde el 2026-09-06: una escritura confirmada no puede quedarse
    // sin su AuditEvent. Ver la cabecera de `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "drying_run.start",
        entityType: "drying_run",
        entityId: run.id,
        after: run,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { run, transformation };
  }, TRANSACCION_DEL_LINAJE);

  return result;
}

export interface RecordDryingTurnEventInput {
  dryingRunId: string;
  eventType: "turned" | "covered" | "uncovered" | "other";
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}

export async function recordDryingTurnEvent(userAccountId: string, input: RecordDryingTurnEventInput) {
  const sourceLot = await resolveRunSourceLot(input.dryingRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  return prisma.dryingTurnEvent.create({
    data: {
      dryingRunId: input.dryingRunId,
      eventType: input.eventType,
      occurredAt: input.occurredAt,
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface TandaDeVolteoInput {
  /** Las corridas que se voltearon de una pasada. Sin repetidas y no vacía. */
  dryingRunIds: readonly string[];
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

/**
 * «Revolví éstas»: UN acto sobre varias unidades (diseño §A.5).
 *
 * Antes, revolver seis zarandas eran seis filas que nada agrupaba: no se podía decir que fue una
 * sola pasada, ni auditar el acto como uno. La tanda es la entidad que faltaba; el apiario ya tenía
 * la forma con sus tandas de marcos.
 *
 * **La autorización se pide una vez POR unidad, y eso no es redundante.** `requireLotAccess` es un
 * O: vuelve en cuanto UNO de los candidatos pasa. Pasarle las seis de golpe autorizaría la tanda
 * entera a quien sólo puede tocar una. Aquí se exige poder gestionar **todas** antes de escribir
 * nada, y como la comprobación va fuera de la transacción, una sola que falle deja la base intacta.
 *
 * **Un volteo suelto sigue existiendo** (`recordDryingTurnEvent`) y no crea tanda. Por eso
 * `turnBatchId` es anulable: nulo significa «no hubo tanda», no «falta el dato».
 *
 * La tanda escribe **un** evento de auditoría con la lista de unidades; cada volteo conserva su
 * propia fila, con su operario y su nota.
 */
export async function registrarTandaDeVolteo(userAccountId: string, input: TandaDeVolteoInput) {
  // Una tanda vacía no es un acto: sería una fila que afirma que se volteó algo sin decir qué.
  if (input.dryingRunIds.length === 0) throw new TraceabilityAccessError("tanda_vacia");

  const unicas = new Set(input.dryingRunIds);
  if (unicas.size !== input.dryingRunIds.length) {
    // Dos veces la misma unidad escribiría dos volteos del mismo acto, y el ritmo contaría de más.
    throw new TraceabilityAccessError("tanda_con_unidad_repetida");
  }

  const idsEnOrden = [...input.dryingRunIds];
  const lotesDeOrigen: Lot[] = [];
  for (const dryingRunId of idsEnOrden) {
    const sourceLot = await resolveRunSourceLot(dryingRunId);
    await requireLotAccess(userAccountId, "manage", [
      { projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification },
    ]);
    lotesDeOrigen.push(sourceLot);
  }

  await exigirPersonaPermitida(
    userAccountId,
    input.operatorPersonId,
    lotesDeOrigen.map((l) => ({ projectId: l.projectId, locationId: l.locationId })),
  );

  return prisma.$transaction(async (tx) => {
    const tanda = await tx.dryingTurnBatch.create({
      data: {
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        createdBy: userAccountId,
        turns: {
          create: idsEnOrden.map((dryingRunId) => ({
            dryingRunId,
            eventType: "turned" as const,
            occurredAt: input.occurredAt,
            operatorPersonId: input.operatorPersonId ?? null,
            createdBy: userAccountId,
          })),
        },
      },
      include: { turns: true },
    });

    // C1 §3: escritura probatoria, dentro de la transacción y con `tx`. Ver `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "drying_turn_batch.record",
        entityType: "drying_turn_batch",
        entityId: tanda.id,
        after: { ...tanda, dryingRunIds: idsEnOrden },
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return tanda;
  });
}

export interface EndDryingRunInput {
  dryingRunId: string;
  endedAt: Date;
  outputLotCode: string;
  outputLotType: DryingOutputLotType;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — same reasoning as StartDryingRunInput above.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  /**
   * Cómo terminó. Opcional a propósito: cerrar un secado sin declararlo sigue
   * siendo válido, porque obligarlo invalidaría todo lo anterior al 2026-09-16
   * y porque bloquear se esquiva en el patio. Sin esto, el lote no reposa — y
   * el motor lo dice con `SECADO_SIN_OBJETIVO_ALCANZADO` en vez de callarlo.
   *
   * **Desde el 2026-10-04 las dos pantallas de cierre lo PIDEN** (la ficha y la última bandeja;
   * decisión de Daniel tras la auditoría farm-to-green R10): hasta ese día ninguna lo pasaba, así
   * que el reposo no arrancaba nunca desde la app. El servicio lo sigue aceptando vacío por lo de
   * arriba —lo anterior y las importaciones—; la regla de la pantalla vive en
   * `desenlaceDelSecado` (`app/beneficio/bandejas/errorDeSecado.ts`).
   */
  endedOutcome?: DryingOutcome | null;
}

export const DRYING_OUTPUT_LOT_TYPES = ["parchment", "dry_cherry"] as const;
export type DryingOutputLotType = (typeof DRYING_OUTPUT_LOT_TYPES)[number];

export class DryingValidationError extends Error {
  constructor(readonly code: "invalid_output_lot_type") {
    super(code);
  }
}

function requireDryingOutputLotType(value: string): asserts value is DryingOutputLotType {
  if (!(DRYING_OUTPUT_LOT_TYPES as readonly string[]).includes(value)) {
    throw new DryingValidationError("invalid_output_lot_type");
  }
}

export type CierreDelSecado = Omit<EndDryingRunInput, "dryingRunId" | "endedAt">;

/**
 * El cierre de un secado dentro de una transacción ajena: lo usan `endDryingRun`
 * y bajar la última bandeja (`lib/traceability/bandejasDelSecado.ts`), que cierra en la
 * MISMA transacción en que la baja. El permiso lo exige quien llama.
 */
export async function cerrarCorridaEnTransaccion(
  tx: Parameters<typeof settleMassBalance>[0],
  userAccountId: string,
  dryingRunId: string,
  sourceLot: Lot,
  input: EndDryingRunInput,
) {
  // Secar cambia la condición del material, pero no retira el pergamino ni la
  // cáscara. El verde sólo puede nacer después en una transformación de trilla.
  requireDryingOutputLotType(input.outputLotType);
  const provenanceClass = input.provenanceClass;

  const endedRun = await tx.dryingRun.update({
    where: { id: dryingRunId },
    data: { endedAt: input.endedAt, endedOutcome: input.endedOutcome ?? null },
  });

  const transformation = await tx.lotTransformation.create({
    data: {
      transformationType: "stage_change",
      occurredAt: input.endedAt,
      operatorPersonId: input.operatorPersonId ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
      dryingRunId: dryingRunId,
      provenanceClass,
      sourceReference: input.sourceReference ?? null,
      inputs: {
        create: [{ lotId: sourceLot.id, quantity: input.quantity ?? null, unit: input.unit ?? null }],
      },
    },
  });

  const outputLot = await tx.lot.create({
    data: {
      lotCode: input.outputLotCode,
      lotType: input.outputLotType,
      organizationId: sourceLot.organizationId,
      projectId: sourceLot.projectId,
      locationId: sourceLot.locationId,
      createdBy: userAccountId,
    },
  });

  await tx.lotTransformationOutput.create({
    data: {
      transformationId: transformation.id,
      lotId: outputLot.id,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
    },
  });

  if (input.quantity != null && input.unit) {
    await tx.quantityEvent.create({
      data: {
        lotId: outputLot.id,
        eventType: "process_output",
        quantity: input.quantity,
        unit: input.unit,
        occurredAt: input.endedAt,
        transformationId: transformation.id,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
      },
    });
  }

  // P0 — decrement the source lot. Only reached from the *closing*
  // transformation: the run-opening one has zero outputs, so movesMaterial()
  // inside settleMassBalance() correctly declines to consume anything then.
  const reconciliation = await settleMassBalance(tx, {
    transformationId: transformation.id,
    transformationType: "stage_change",
    organizationId: sourceLot.organizationId,
    inputs: [{ lotId: sourceLot.id, quantity: input.quantity ?? null, unit: input.unit ?? null }],
    outputs: [{ quantity: input.quantity ?? null, unit: input.unit ?? null }],
    occurredAt: input.endedAt,
    provenanceClass,
    sourceReference: input.sourceReference ?? null,
    createdBy: userAccountId,
  });

  // C1 §3 pattern: an evidentiary write. The audit call for this same write
  // is left to EACH CALLER's own transaction closure (`endDryingRun` below,
  // and `bajarBandeja` in bandejasDelSecado.ts), not here:
  // `tests/arquitectura/audit-atomico.test.ts` recognises "inside a
  // transaction" only by a `(tx) => { … }` closure literal in the SAME file,
  // and this helper's multi-parameter signature (`tx` plus four more) can
  // never match that shape no matter where it is called from. Keeping the
  // audit call textually inside each caller's own closure is what makes the
  // guard's per-file, no-list-to-maintain analysis see it correctly, while the
  // actual atomicity — same `tx`, same commit/rollback — is identical either
  // way and is what the behavioural tests in bandejasDelSecado.test.ts and
  // drying.test.ts verify.
  return { run: endedRun, transformation, outputLot, reconciliation };
}

export async function endDryingRun(userAccountId: string, input: EndDryingRunInput) {
  const run = await prisma.dryingRun.findUnique({ where: { id: input.dryingRunId } });
  if (!run) throw new TraceabilityAccessError("drying_run_not_found");
  if (run.endedAt) throw new TraceabilityAccessError("drying_run_already_ended");

  const sourceLot = await resolveRunSourceLot(input.dryingRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  // DESPUÉS del permiso: a quien no gestiona el lote no se le dice si hay bandejas
  // (revisión de Codex del plan). El secado termina bandeja a bandeja (Daniel,
  // 2026-09-18); el disparador de `bandejas_de_la_corrida` cierra la carrera.
  if (await prisma.dryingRunTray.count({ where: { dryingRunId: run.id, hasta: null } }) > 0) {
    throw new BandejaError("bandejas_sin_bajar");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const resultado = await cerrarCorridaEnTransaccion(tx, userAccountId, run.id, sourceLot, input);
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "drying_run.end",
          entityType: "drying_run",
          entityId: resultado.run.id,
          after: resultado.run,
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return resultado;
    });
  } catch (error) {
    // Si una bandeja se cargó entre la cuenta de arriba y el cierre, la base lo
    // rechaza: llega como el mismo código, no como SQL (segunda pasada de Codex).
    if (error instanceof Error && /bandejas sin bajar/.test(error.message)) throw new BandejaError("bandejas_sin_bajar");
    throw error;
  }
}
