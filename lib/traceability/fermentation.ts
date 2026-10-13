/**
 * Phase 1, ticket T6 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §15, §34). First "stage-run" entity — sets the pattern T7 (Drying) and T8
 * (Storage) follow.
 *
 * FermentationRun deliberately has no lotId of its own (§15: "input/output
 * lot(s) are not FKs on FermentationRun directly, they're expressed through
 * the LotTransformation that references this run"). Lifecycle:
 *
 *   startFermentationRun — creates the run plus a stage_change
 *     LotTransformation (input: the lot entering fermentation, zero
 *     outputs — nothing changes lot-identity-wise yet, matching how T1's
 *     recordTransformation already supports zero-output transformations
 *     for sample_extraction/loss/disposal/sale).
 *   recordFermentationIntervention — a simple typed log entry against an
 *     in-progress run (agitation, addition, sample, etc.).
 *   endFermentationRun — sets endedAt once (a real one-time transition
 *     recording an actual event, not a correction — same as
 *     StorageAssignment's own endedAt, §17) and creates a second
 *     stage_change LotTransformation (same input lot, output: a new Lot at
 *     the next stage), matching §8.3's lineage diagram exactly.
 *
 * Both transformations carry fermentationRunId so "what's this run for" is
 * always a real, queryable fact (needed for RBAC checks mid-run and for
 * T10's Active Operations view), not something reconstructed only once a
 * run ends.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { settleMassBalance } from "./balance";
import { recordAuditEvent } from "../audit";
import { procesoAbiertoParaCorrida, TRANSACCION_DEL_LINAJE } from "./procesoDelLinaje";
import { LotProcessError } from "./errorDeProceso";
import { dondeCandidatoAFermentar, puedeVerEquipo } from "../equipos/equipos";
import { RecipienteError } from "./recipientes";
import type { LotType, ProvenanceClass } from "../../generated/prisma/client";

async function resolveRunSourceLot(fermentationRunId: string) {
  const transformation = await prisma.lotTransformation.findFirst({
    where: { fermentationRunId },
    include: { inputs: { include: { lot: true } } },
    orderBy: { occurredAt: "asc" },
  });
  const inputLot = transformation?.inputs[0]?.lot;
  if (!inputLot) throw new TraceabilityAccessError("fermentation_run_not_found");
  return inputLot;
}

export interface StartFermentationRunInput {
  lotId: string;
  /**
   * El recipiente REGISTRADO donde fermenta (Parte 2c, arreglos previos §4.1, 2026-10-04). Antes nadie escribía esta clave y todo
   * tanque salía libre. Tiene que ser un candidato de `dondeCandidatoAFermentar` que quien empieza pueda ver; si no,
   * `recipiente_no_disponible`. Un tanque ocupado o con condición pendiente SE ACEPTA (C1/E1: sólo se avisa).
   */
  vesselEquipmentId?: string | null;
  /**
   * El nombre ESCRITO del recipiente: la única vía para uno que no está registrado, y una nota más cuando sí lo está. Decisión D2
   * (Daniel, 2026-10-04): tiene que venir el tanque registrado, esto, o los dos —nunca los dos vacíos—
   * (`recipiente_o_nota_obligatorio`). Sólo el tanque registrado cuenta como ocupado.
   */
  vesselNote?: string | null;
  startedAt: Date;
  operatorPersonId?: string | null;
  inoculated?: boolean;
  inoculationNote?: string | null;
  quantity?: number | null;
  unit?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback. app/actions/traceability.ts passes
  // "original_record" — starting a run is an action taken, not a
  // measurement (per T9.5 §3(b)'s "lot merge or transformation" example).
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  // ADR-099, cambiado por la Parte 1 (R4, 2026-10-01): la receta ya no se elige aquí, es la del
  // proceso que cubre al lote. Si viene, tiene que ser ESA; otra se rechaza con
  // `receta_distinta_del_proceso`. Un proceso «Sin receta» da una corrida sin receta.
  processRecipeVersionId?: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El recipiente de una fermentación que empieza (Parte 2c, arreglos previos §4.1 y decisión D2 de Daniel, 2026-10-04).
 *
 * **Un tanque registrado O el nombre escrito de uno que no lo está** —pueden venir los dos—, y nunca los dos vacíos
 * (`recipiente_o_nota_obligatorio`). Con un tanque registrado se exige que sea un candidato de `dondeCandidatoAFermentar` (la misma
 * definición que usa la lista del formulario) y que quien empieza lo VEA; si no, `recipiente_no_disponible`, **un solo código**: no
 * distingue «no existe» de «es de otra organización», «es una bandeja», «está retirado» o «no lo ves», porque un código por motivo le
 * diría a quien no ve un tanque que existe (§5.5 del diseño).
 *
 * **Un tanque ocupado o con condición pendiente NO se rechaza** (C1/E1: sólo se avisa, y el aviso lo pinta el formulario).
 *
 * Devuelve el id del tanque registrado, o `null` si la corrida sólo lleva nombre. Un id que no es un UUID no puede ser de ningún
 * equipo y se dice igual que «no existe»: sin esto la base lo rechazaría con un error propio y la acción lo dejaría escapar como un 500.
 */
async function recipienteDeLaCorrida(
  userAccountId: string,
  organizationId: string,
  input: Pick<StartFermentationRunInput, "vesselEquipmentId" | "vesselNote">,
): Promise<string | null> {
  const id = input.vesselEquipmentId?.trim() || null;
  const nota = input.vesselNote?.trim() || null;
  if (!id) {
    if (!nota) throw new RecipienteError("recipiente_o_nota_obligatorio");
    return null;
  }
  if (!UUID.test(id)) throw new RecipienteError("recipiente_no_disponible");
  const equipo = await prisma.equipment.findFirst({
    where: { ...dondeCandidatoAFermentar(organizationId), id },
    select: { id: true, projectId: true, classification: true },
  });
  if (!equipo || !(await puedeVerEquipo(userAccountId, equipo))) throw new RecipienteError("recipiente_no_disponible");
  return equipo.id;
}

export async function startFermentationRun(userAccountId: string, input: StartFermentationRunInput) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lot.projectId, locationId: lot.locationId }]);
  // Parte 2c, §4.1 y D2: el recipiente se comprueba DESPUÉS del acceso al lote —quien no gestiona el lote no se entera de qué tanques
  // existen— y FUERA de la transacción: `puedeVerEquipo` usa el cliente global, no `tx`, y la transacción comparte su presupuesto
  // (`TRANSACCION_DEL_LINAJE`) con la espera por los bloqueos del linaje.
  const vesselEquipmentId = await recipienteDeLaCorrida(userAccountId, lot.organizationId, input);

  const result = await prisma.$transaction(async (tx) => {
    // Parte 1, R3/R4 (2026-10-01): la corrida se une SOLA al proceso abierto que cubre al lote —el
    // suyo o el de un ancestro—, y sin proceso no empieza. El permiso ya se pidió arriba, sobre ESTE
    // lote: nunca se exige gestionar el lote donde vive el proceso.
    const proceso = await procesoAbiertoParaCorrida(tx, input.lotId);
    // R4: la receta es la del proceso. Una distinta pedida a mano es una contradicción, no una opción.
    if (input.processRecipeVersionId && input.processRecipeVersionId !== proceso.processRecipeVersionId) {
      throw new LotProcessError("receta_distinta_del_proceso");
    }
    // Cierra la carrera con el retiro. La existencia y el permiso se comprobaron ARRIBA; aquí sólo se vuelve a exigir «activo» con
    // `FOR SHARE`: `retirarEquipo` toma `FOR UPDATE` sobre esta misma fila, así que o espera a que esta transacción termine (y
    // entonces ve la corrida nueva y se niega con `equipo_en_uso`) o termina antes (y entonces esto lee `retired`). `FOR SHARE` deja
    // que dos fermentaciones empiecen a la vez en el mismo tanque: que un tanque ocupado se acepta es la decisión C1/E1.
    if (vesselEquipmentId) {
      const [fila] = await tx.$queryRaw<{ lifecycle_status: string }[]>`
        SELECT "lifecycle_status"::text AS lifecycle_status FROM "core"."equipment" WHERE "id" = ${vesselEquipmentId}::uuid FOR SHARE`;
      if (fila?.lifecycle_status !== "active") throw new RecipienteError("recipiente_no_disponible");
    }
    const run = await tx.fermentationRun.create({
      data: {
        vesselEquipmentId,
        vesselNote: input.vesselNote ?? null,
        startedAt: input.startedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        inoculated: input.inoculated ?? false,
        processRecipeVersionId: proceso.processRecipeVersionId,
        lotProcessId: proceso.id,
        inoculationNote: input.inoculationNote ?? null,
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
        fermentationRunId: run.id,
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
        operation: "fermentation_run.start",
        entityType: "fermentation_run",
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

export interface RecordFermentationInterventionInput {
  fermentationRunId: string;
  interventionType: "inoculation" | "agitation" | "purge" | "addition" | "sample" | "transfer" | "termination" | "other";
  occurredAt: Date;
  notes?: string | null;
}

export async function recordFermentationIntervention(userAccountId: string, input: RecordFermentationInterventionInput) {
  const sourceLot = await resolveRunSourceLot(input.fermentationRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  return prisma.fermentationIntervention.create({
    data: {
      fermentationRunId: input.fermentationRunId,
      interventionType: input.interventionType,
      occurredAt: input.occurredAt,
      notes: input.notes ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface EndFermentationRunInput {
  fermentationRunId: string;
  endedAt: Date;
  outputLotCode: string;
  outputLotType: LotType;
  quantity?: number | null;
  unit?: string | null;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required — same reasoning as StartFermentationRunInput above.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function endFermentationRun(userAccountId: string, input: EndFermentationRunInput) {
  const run = await prisma.fermentationRun.findUnique({ where: { id: input.fermentationRunId } });
  if (!run) throw new TraceabilityAccessError("fermentation_run_not_found");
  if (run.endedAt) throw new TraceabilityAccessError("fermentation_run_already_ended");

  const sourceLot = await resolveRunSourceLot(input.fermentationRunId);
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const endedRun = await tx.fermentationRun.update({
      where: { id: input.fermentationRunId },
      data: { endedAt: input.endedAt },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt: input.endedAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        fermentationRunId: input.fermentationRunId,
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

    // Same fix as T1's recordTransformation: seed the output lot's own
    // quantity ledger so computeCurrentQuantity reports correctly for it.
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

    // C1 §3 pattern: an evidentiary write. Dentro de la transacción y con
    // `tx` desde el 2026-09-06: una escritura confirmada no puede quedarse
    // sin su AuditEvent. Ver la cabecera de `lib/audit.ts`.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "fermentation_run.end",
        entityType: "fermentation_run",
        entityId: endedRun.id,
        after: endedRun,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { run: endedRun, transformation, outputLot, reconciliation };
  });

  return result;
}
