/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). Inspection stays formal and structurally protected — no
 * `feeding`/`treatment` value exists anywhere on this table, so the DB
 * schema itself makes the original collapse-bug impossible.
 *
 * RBAC resolves via the parent Colony's own Hive (project/location),
 * reusing requireApiaryAccess from ./hives rather than a second helper —
 * the same "resolve via the parent" pattern lib/traceability/storage.ts
 * already uses against its parent Lot.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { ligarAVisitaAbierta } from "../traceability/visitaAbierta";
import { CATALOGO_DE_IRREGULARIDAD } from "./irregularidades";
import type { InspectionOutcome, ProvenanceClass } from "../../generated/prisma/client";

/**
 * Una entrada que el servicio rechaza. Se distingue de `ApiaryAccessError` a
 * propósito: el camino de sincronización informa los dos como `rejected`, pero
 * «no tienes permiso» y «esa bandera no existe» piden cosas distintas a quien
 * lo lee. Mismo reparto que `ColonyEventValidationError`.
 */
export class InspectionValidationError extends Error {}

async function resolveColonyScope(colonyId: string) {
  const colony = await prisma.colony.findUnique({ where: { id: colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  return { projectId: colony.hive.projectId, locationId: colony.hive.locationId };
}

export interface RecordInspectionInput {
  colonyId: string;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  outcome: InspectionOutcome;
  broodPatternNote?: string | null;
  queenSighted?: boolean | null;
  storesLevel?: string | null;
  temperamentNote?: string | null;
  /**
   * El «Otro» del Anexo B §2.3: lo que el catálogo no cubre. Ya no es el único
   * sitio donde vive el dato — ver `irregularidades`.
   */
  pestDiseaseFlags?: string | null;
  /**
   * Las banderas del catálogo `irregularidad_de_inspeccion`, por id. Varias.
   *
   * Vacío es legítimo y frecuente: una inspección «sin novedad» no tiene
   * ninguna, y **no se rellena sola**.
   */
  irregularidades?: readonly string[];
  note?: string | null;
  // A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — a client-generated id from
  // the offline draft queue. When present, a retried "Sync now" pass (the
  // same draft POSTed twice after a dropped response) is a no-op, not a
  // duplicate row: checked server-side before insert, per §0's own
  // idempotent-sync finding.
  clientDraftId?: string | null;
}

/**
 * `provenanceClass` is not a caller-supplied field — fixed to
 * `direct_observation` here, at the action layer, for every call site
 * (§1a: "a trained person opened the hive and assessed it"), the same
 * non-operator-selectable discipline T12.6 already established for its
 * own fixed-per-call-site provenanceClass values.
 */
export async function recordInspection(userAccountId: string, input: RecordInspectionInput) {
  const scope = await resolveColonyScope(input.colonyId);
  await requireApiaryAccess(userAccountId, "manage", [scope]);

  if (input.clientDraftId) {
    const existing = await prisma.inspection.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (existing) return existing;
  }

  const provenanceClass: ProvenanceClass = "direct_observation";

  const irregularidades = [...new Set(input.irregularidades ?? [])];

  // **La FK no basta.** Apunta a `variable_catalog_value` entera, no a este
  // catálogo, así que sin esta comprobación se podría colgar una levadura de una
  // inspección y la base lo aceptaría encantada. Mismo guardia que
  // `registrarFinDeColonia` con las causas, y por la misma razón.
  if (irregularidades.length > 0) {
    const validas = await prisma.variableCatalogValue.count({
      where: {
        id: { in: irregularidades },
        catalog: { key: CATALOGO_DE_IRREGULARIDAD },
        aliasOfId: null,
      },
    });
    if (validas !== irregularidades.length) throw new InspectionValidationError("irregularidad_desconocida");
  }

  const inspection = await prisma.$transaction(async (tx) => {
    const inspection = await tx.inspection.create({
      data: {
        colonyId: input.colonyId,
        occurredAt: input.occurredAt ?? new Date(),
        operatorPersonId: input.operatorPersonId ?? null,
        outcome: input.outcome,
        broodPatternNote: input.broodPatternNote ?? null,
        queenSighted: input.queenSighted ?? null,
        storesLevel: input.storesLevel ?? null,
        temperamentNote: input.temperamentNote ?? null,
        pestDiseaseFlags: input.pestDiseaseFlags ?? null,
        note: input.note ?? null,
        provenanceClass,
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
        // Dentro de la MISMA transacción y del mismo `create`: una inspección
        // con hallazgo cuyas banderas se escribieran aparte podría quedarse a
        // medias —el hecho sin lo que se vio— y nada lo diría.
        irregularities: { create: irregularidades.map((valueId) => ({ valueId })) },
      },
      include: { irregularities: { include: { value: { select: { value: true } } } } },
    });

    // C1 §3: evidentiary write. Not reached on the clientDraftId idempotent
    // no-op path above, so a retried sync never double-audits the same fact.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "inspection.create",
        entityType: "inspection",
        entityId: inspection.id,
        after: inspection,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    // A9.2 — si hay una visita abierta en este sitio por esta persona, la
    // inspección entra en ella. Dentro de la MISMA transacción: un vínculo que
    // se confirma aparte puede perderse y dejar la visita incompleta sin que
    // nada lo diga.
    await ligarAVisitaAbierta(tx, {
      userAccountId,
      locationId: scope.locationId,
      occurredAt: inspection.occurredAt,
      provenanceClass,
      sujeto: { inspectionId: inspection.id },
    });

    return inspection;
  });

  return inspection;
}

export async function listInspectionsForColony(userAccountId: string, colonyId: string) {
  const scope = await resolveColonyScope(colonyId);
  await requireApiaryAccess(userAccountId, "view", [scope]);

  return prisma.inspection.findMany({ where: { colonyId }, include: { assets: true }, orderBy: { occurredAt: "desc" } });
}
