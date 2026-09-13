/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). feeding/treatment/passing_observation share one
 * type-discriminated table — none of the three carries Inspection's
 * evidentiary claim, so mixing them here (but never with Inspection
 * itself) is safe. Same shape as FermentationIntervention/DryingTurnEvent/
 * QuantityEvent elsewhere in this schema.
 *
 * RBAC resolves via the parent Colony's own Hive, same as ./inspections.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess, requireColonyEventWriteAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { exigeMetodoDeAlimentacion } from "./alimentacion";
import { exigeObjetivo, exigeVia } from "./objetivoDelTratamiento";
import { ligarAVisitaAbierta } from "../traceability/visitaAbierta";
import type { ColonyEventType, ProvenanceClass } from "../../generated/prisma/client";

export class ColonyEventValidationError extends Error {}

async function resolveColonyScope(colonyId: string) {
  const colony = await prisma.colony.findUnique({ where: { id: colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  return { projectId: colony.hive.projectId, locationId: colony.hive.locationId };
}

export interface RecordColonyEventInput {
  colonyId: string;
  eventType: ColonyEventType;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  feedingMaterial?: string | null;
  feedingQuantity?: number | null;
  feedingUnit?: string | null;
  /**
   * Sólo tiene sentido en `feeding`: hasta cuándo alcanza lo dejado, estimado por
   * quien alimenta. **Campo de DÍA**, medianoche UTC.
   *
   * **Sigue sin ser obligatoria aquí, y la razón original se mantiene:** las
   * alimentaciones de urgencia se registran sin saberlo, y la obligatoriedad vive
   * en el protocolo A9.4 (`coverage_until`, `"required": true`), donde el dueño la
   * cambia sin tocar código. El formulario la exige para guardar, que es donde esa
   * exigencia no cuesta un dato perdido.
   *
   * **Lo que se añadió el 2026-09-13 es la otra mitad:** que su ausencia se VEA.
   * `alcanceDelAlimento` devuelve esa colonia como `sin_fecha` en vez de contarla
   * entre las tranquilas. Es el mismo trato que el dueño eligió para la carencia
   * en ADR-115 —«avisa y registra igual»—: impedir el registro no devuelve la miel
   * al panal, y esconder el hueco es cómo se repite Toabré.
   */
  coverageUntil?: Date | null;
  /**
   * Cómo se dejó el alimento. Anexo B §3, opcional. Llega como CADENA del
   * formulario y de la cola, y se valida abajo: un `as never` dejaría entrar
   * cualquier valor del enum (ADR-112).
   */
  feedingMethod?: string | null;
  treatmentProduct?: string | null;
  // Required whenever eventType = treatment (§1a) — enforced below, not by
  // the DB column, same shape as recordMaterialConsumptionEntry's own
  // batchLabel requiredness (T12.6).
  treatmentBatchLabel?: string | null;
  /**
   * Días de carencia del producto. **Obligatorio cuando `eventType =
   * treatment`**, como el lote: el Anexo B §4 lo marca así y dice por qué —sin
   * él una cosecha puede violar la carencia sin que el sistema lo sepa—.
   */
  treatmentWithdrawalDays?: number | null;
  treatmentDose?: number | null;
  treatmentDoseUnit?: string | null;
  /**
   * Contra qué. **Obligatorio cuando `eventType = treatment`**, como el lote y la
   * carencia: el Anexo B §4 lo marca así y dice por qué —*«eficacia por objetivo;
   * hoy no se puede agrupar»*—. Llega como CADENA y se valida abajo.
   */
  treatmentTarget?: string | null;
  /** Cómo se aplicó. Opcional. Cadena, validada abajo. */
  treatmentRoute?: string | null;
  note?: string | null;
  // A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — same idempotent-sync
  // purpose as RecordInspectionInput.clientDraftId.
  clientDraftId?: string | null;
}

/**
 * §1a's own framing, mapped onto ProvenanceClass values that already
 * exist: feeding/treatment are a record of an action taken
 * (`original_record`); passing_observation is a state fact, witnessed
 * (`direct_observation`). Not caller-supplied — fixed here, at the action
 * layer, per eventType, same non-operator-selectable discipline every
 * other fixed provenanceClass in this codebase already follows.
 */
function provenanceClassFor(eventType: ColonyEventType): ProvenanceClass {
  switch (eventType) {
    case "feeding":
    case "treatment":
      return "original_record";
    case "passing_observation":
    case "other":
      return "direct_observation";
  }
}

export async function recordColonyEvent(userAccountId: string, input: RecordColonyEventInput) {
  if (input.eventType === "treatment" && !input.treatmentBatchLabel?.trim()) {
    throw new ColonyEventValidationError("treatment_batch_label_required");
  }

  // La carencia, con la misma fuerza que el lote. Se comprueba `== null` y no
  // la verdad del número: **cero es un valor legítimo** —hay productos sin
  // carencia— y un `!input.treatmentWithdrawalDays` lo habría rechazado,
  // obligando a mentir poniendo un 1.
  if (input.eventType === "treatment" && input.treatmentWithdrawalDays == null) {
    throw new ColonyEventValidationError("treatment_withdrawal_days_required");
  }
  if (input.treatmentWithdrawalDays != null && (!Number.isInteger(input.treatmentWithdrawalDays) || input.treatmentWithdrawalDays < 0)) {
    throw new ColonyEventValidationError("treatment_withdrawal_days_invalid");
  }

  // El objetivo, con la misma fuerza que el lote y la carencia. Sin él, la
  // pregunta que el Anexo pide contestar —qué se trató contra varroa esta
  // temporada— no tiene respuesta, y una fila sin objetivo la deja sin responder
  // para siempre: nadie va a volver a preguntarle al que aplicó.
  if (input.eventType === "treatment" && (input.treatmentTarget == null || input.treatmentTarget === "")) {
    throw new ColonyEventValidationError("treatment_target_required");
  }
  const treatmentTarget =
    input.treatmentTarget == null || input.treatmentTarget === "" ? null : exigeObjetivo(input.treatmentTarget);
  const treatmentRoute =
    input.treatmentRoute == null || input.treatmentRoute === "" ? null : exigeVia(input.treatmentRoute);
  // Y ninguno de los dos tiene sentido fuera de un tratamiento: una alimentación
  // «contra varroa» sería un dato que nadie podría leer.
  if ((treatmentTarget !== null || treatmentRoute !== null) && input.eventType !== "treatment") {
    throw new ColonyEventValidationError("objetivo_o_via_solo_en_tratamiento");
  }

  // El método, validado en la frontera. Y sólo tiene sentido alimentando: un
  // tratamiento con «bolsa sobre cabezales» es un dato que nadie podría leer.
  const feedingMethod =
    input.feedingMethod == null || input.feedingMethod === ""
      ? null
      : exigeMetodoDeAlimentacion(input.feedingMethod);
  if (feedingMethod !== null && input.eventType !== "feeding") {
    throw new ColonyEventValidationError("feeding_method_solo_en_alimentacion");
  }

  const scope = await resolveColonyScope(input.colonyId);
  await requireColonyEventWriteAccess(userAccountId, [scope]);

  if (input.clientDraftId) {
    const existing = await prisma.colonyEvent.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (existing) return existing;
  }

  const colonyEvent = await prisma.$transaction(async (tx) => {
    const colonyEvent = await tx.colonyEvent.create({
      data: {
        colonyId: input.colonyId,
        eventType: input.eventType,
        occurredAt: input.occurredAt ?? new Date(),
        operatorPersonId: input.operatorPersonId ?? null,
        feedingMaterial: input.feedingMaterial ?? null,
        feedingQuantity: input.feedingQuantity ?? null,
        feedingUnit: input.feedingUnit ?? null,
        coverageUntil: input.eventType === "feeding" ? (input.coverageUntil ?? null) : null,
        feedingMethod,
        treatmentTarget,
        treatmentRoute,
        treatmentProduct: input.treatmentProduct ?? null,
        treatmentBatchLabel: input.treatmentBatchLabel?.trim() ?? null,
        treatmentWithdrawalDays: input.treatmentWithdrawalDays ?? null,
        treatmentDose: input.treatmentDose ?? null,
        treatmentDoseUnit: input.treatmentDoseUnit ?? null,
        note: input.note ?? null,
        provenanceClass: provenanceClassFor(input.eventType),
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
      },
    });

    // C1 §3: evidentiary write. Not reached on the clientDraftId idempotent
    // no-op path above, same reasoning as recordInspection.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "colony_event.create",
        entityType: "colony_event",
        entityId: colonyEvent.id,
        after: colonyEvent,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    // A9.2 — ver la cabecera de `visitaAbierta.ts`.
    await ligarAVisitaAbierta(tx, {
      userAccountId,
      locationId: scope.locationId,
      occurredAt: colonyEvent.occurredAt,
      provenanceClass: colonyEvent.provenanceClass,
      sujeto: { colonyEventId: colonyEvent.id },
    });

    return colonyEvent;
  });

  return colonyEvent;
}

export async function listColonyEventsForColony(userAccountId: string, colonyId: string) {
  const scope = await resolveColonyScope(colonyId);
  await requireApiaryAccess(userAccountId, "view", [scope]);

  return prisma.colonyEvent.findMany({ where: { colonyId }, include: { assets: true }, orderBy: { occurredAt: "desc" } });
}
