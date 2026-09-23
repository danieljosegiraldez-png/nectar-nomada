/**
 * T12.6 (docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md). Labour-time
 * and batch-identified material-consumption capture — physical/temporal
 * facts that cannot be reconstructed once the 2026 harvest window closes
 * (ADR-044's capture-or-lose-it clause), unlike money, which can be
 * applied retroactively (a rate can be decided in 2027 and multiplied
 * against hours recorded now; the hours themselves cannot be recovered
 * later if nobody records them today).
 *
 * Same shape as T12.5's media.ts: a discriminated parent union per
 * table, `lotId` carried on every call purely for RBAC scoping (matching
 * every other Lot Detail form's own convention — HarvestEvent/
 * ReceivingEvent/FermentationRun/DryingRun all resolve back to a lot's
 * project/location the same way), and `lot:manage` reused rather than a
 * new permission.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { unaVezPorEnvio } from "../envios/unaVezPorEnvio";
import { requireLotAccess, TraceabilityAccessError, DEFAULT_NEW_RECORD_CLASSIFICATION } from "./lots";
import { recordAuditEvent } from "../audit";
import type { DataQuality, Prisma, ProvenanceClass } from "../../generated/prisma/client";

export class LabourValidationError extends Error {}
export class MaterialConsumptionValidationError extends Error {}

// --- Labour entry --------------------------------------------------------

/**
 * Every parent already sits on the genealogy DAG (harvest/receiving create
 * a Lot; fermentation/drying runs are referenced by the LotTransformations
 * that move a lot between stages) — deliberately no `lotId` FK on the
 * table itself, avoiding a second, potentially ambiguous attachment point
 * for the same fact.
 */
export type LabourEntryParent =
  | { kind: "harvestEvent"; harvestEventId: string }
  | { kind: "receivingEvent"; receivingEventId: string }
  | { kind: "fermentationRun"; fermentationRunId: string }
  | { kind: "dryingRun"; dryingRunId: string }
  // F1 (30_F1_OPERACION_FINCA_ESQUEMA.md §4) — a fifth parent, the one
  // genuinely new case: work with no batch yet (600 holes, apiary-site
  // clearing). `locationId` here *is* the row's real FK (unlike the other
  // four, which are RBAC-only lookups against a lotId that's never
  // stored) — see Location.locationId on the schema for why.
  | { kind: "location"; locationId: string };

export interface RecordLabourEntryInput {
  // Required for every parent kind except "location" — validated below,
  // not typed as conditionally required, since the four existing kinds
  // keep using it purely for RBAC scoping exactly as before.
  lotId?: string | null;
  parent: LabourEntryParent;
  // Clave de idempotencia del formulario web. Opcional: sin ella el servicio se
  // comporta como antes — la cola offline tiene la suya por `clientDraftId`, y
  // las llamadas internas no deben necesitar un token para escribir.
  claveDeEnvio?: string | null;
  workerCount: number;
  hours: number;
  taskNote?: string | null;
  // In-kind flag — labour provided by a third party, not Néctar Nómada's
  // own. Optional, off by default — zero cost for the dominant in-house
  // case (§3 of the source report).
  providedByOrganizationId?: string | null;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  // Required, no default — same reasoning as every provenanceClass field
  // since ADR-038. Fixed to direct_observation at the action layer for
  // this ticket's forms (app/actions/traceability.ts) — none of the four
  // attachment points has a genuinely ambiguous provenance.
  provenanceClass: ProvenanceClass;
  // The separate "how much do we trust it" axis — an operator's recalled
  // estimate of hours worked is not a measured_fact (source report §1),
  // but that distinction lives here (verified vs. provisional), not in
  // provenanceClass, which both a same-day tally and a next-morning
  // recollection can equally be direct_observation about.
  dataQuality?: DataQuality | null;
}

function labourParentData(parent: LabourEntryParent) {
  switch (parent.kind) {
    case "harvestEvent":
      return { harvestEventId: parent.harvestEventId };
    case "receivingEvent":
      return { receivingEventId: parent.receivingEventId };
    case "fermentationRun":
      return { fermentationRunId: parent.fermentationRunId };
    case "dryingRun":
      return { dryingRunId: parent.dryingRunId };
    case "location":
      return { locationId: parent.locationId };
  }
}

/**
 * `workerCount`/`hours` are required together (enforced by the NOT NULL
 * columns plus the positivity check here) — a lone number without the
 * other is meaningless (source report §3), but the whole form remains
 * optional to open at all; nothing here blocks
 * startFermentationAction/endFermentationFormAction or any other write
 * path.
 */
export async function recordLabourEntry(userAccountId: string, input: RecordLabourEntryInput) {
  if (!Number.isFinite(input.workerCount) || input.workerCount <= 0) {
    throw new LabourValidationError("worker_count_must_be_positive");
  }
  if (!Number.isFinite(input.hours) || input.hours <= 0) {
    throw new LabourValidationError("hours_must_be_positive");
  }

  if (input.parent.kind === "location") {
    const location = await prisma.location.findUnique({ where: { id: input.parent.locationId } });
    if (!location) throw new TraceabilityAccessError("location_not_found");
    await requireLotAccess(userAccountId, "manage", [{ locationId: input.parent.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);
    await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ locationId: input.parent.locationId }]);
  } else {
    if (!input.lotId) throw new LabourValidationError("lot_id_required");
    const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
    if (!lot) throw new TraceabilityAccessError("lot_not_found");
    await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
    await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lot.projectId, locationId: lot.locationId }]);
  }

  const labourEntry = await unaVezPorEnvio(userAccountId, input.claveDeEnvio, {
    tipo: "LabourEntry",
    recuperar: (id) => prisma.labourEntry.findUniqueOrThrow({ where: { id } }),
    // El audit entra en la transacción DEL AYUDANTE, no en una nueva: la
    // escritura ya vive dentro de `unaVezPorEnvio`, así que envolverla por
    // fuera no la haría atómica — sólo añadiría una transacción alrededor de
    // algo ya confirmado. Es la misma forma que `measurements.ts` ya usaba.
    crear: async (tx) => {
      const creada = await tx.labourEntry.create({
        data: {
          workerCount: input.workerCount,
          hours: input.hours,
          taskNote: input.taskNote ?? null,
          providedByOrganizationId: input.providedByOrganizationId ?? null,
          occurredAt: input.occurredAt ?? new Date(),
          operatorPersonId: input.operatorPersonId ?? null,
          provenanceClass: input.provenanceClass,
          dataQuality: input.dataQuality ?? null,
          createdBy: userAccountId,
          ...labourParentData(input.parent),
        },
      });

      // C1 §3: evidentiary write (carries provenanceClass).
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "labour_entry.create",
          entityType: "labour_entry",
          entityId: creada.id,
          after: creada,
          sourceInterface: "traceability.service",
        },
        tx,
      );

      return creada;
    },
  });

  return labourEntry;
}

// --- Material consumption entry ------------------------------------------

/**
 * Originally scoped to fermentation/drying only. F1 §4 adds `location` —
 * insumos (nutrients, biochar, lime) and material like compost/biochar
 * production applied directly to a plot, no batch involved.
 */
export type MaterialConsumptionParent =
  | { kind: "fermentationRun"; fermentationRunId: string }
  | { kind: "dryingRun"; dryingRunId: string }
  | { kind: "location"; locationId: string }
  // La JORNADA: lo gastado en una visita concreta —aserrín y hojas para el
  // ahumador, un encendedor, una lija— pertenece a la visita y no al sitio.
  // El ámbito de autorización sale de la ubicación DE la jornada: una visita
  // no lleva permisos propios.
  | { kind: "fieldSession"; fieldSessionId: string }
  // La vez que se hizo una rutina de cuidado; sólo la crea
  // `lib/rutinas/rutinas.ts`, que autoriza en el lugar o el equipo.
  | { kind: "careRoutineEvent"; careRoutineEventId: string };

export interface RecordMaterialConsumptionEntryInput {
  // Required for every parent kind except "location" — same convention as
  // RecordLabourEntryInput.lotId above.
  lotId?: string | null;
  // Clave de idempotencia del formulario web, igual que en jornales.
  claveDeEnvio?: string | null;
  parent: MaterialConsumptionParent;
  materialName: string;
  // The one irrecoverable identity fact (source report §3) — required,
  // same as materialName, even though quantity/unit stay optional below.
  batchLabel: string;
  quantity?: number | null;
  unit?: string | null;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
  notes?: string | null;
  /**
   * **De qué lote salió**, cuando se sabe. Enlazarlo DESCUENTA existencias en
   * la misma transacción que guarda el consumo.
   *
   * Opcional para siempre: obligar a elegir lote convertiría una anotación de
   * diez segundos en un trámite, y lo que no se anota no existe.
   */
  consumableLotId?: string | null;
}

function consumptionParentData(parent: MaterialConsumptionParent) {
  switch (parent.kind) {
    case "fermentationRun":
      return { fermentationRunId: parent.fermentationRunId };
    case "dryingRun":
      return { dryingRunId: parent.dryingRunId };
    case "location":
      return { locationId: parent.locationId };
    case "fieldSession":
      return { fieldSessionId: parent.fieldSessionId };
    case "careRoutineEvent":
      return { careRoutineEventId: parent.careRoutineEventId };
  }
}

function validarNombreYLote(input: RecordMaterialConsumptionEntryInput) {
  if (!input.materialName.trim()) throw new MaterialConsumptionValidationError("material_name_required");
  if (!input.batchLabel.trim()) throw new MaterialConsumptionValidationError("batch_label_required");
}

/**
 * Crear un consumo DENTRO de una transacción ajena: la fila, su descuento de
 * existencias y su AuditEvent, los tres con `tx`. **No autoriza**: la
 * autorización es de quien la llama —`recordMaterialConsumptionEntry` por el
 * lote o el lugar; `registrarRealizada` por la rutina—.
 */
export async function crearConsumoEnTx(tx: Prisma.TransactionClient, userAccountId: string, input: RecordMaterialConsumptionEntryInput) {
  validarNombreYLote(input);

  const creada = await tx.materialConsumptionEntry.create({
    data: {
      materialName: input.materialName.trim(),
      batchLabel: input.batchLabel.trim(),
      consumableLotId: input.consumableLotId ?? null,
      quantity: input.quantity ?? null,
      unit: input.unit ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      operatorPersonId: input.operatorPersonId ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      notes: input.notes ?? null,
      createdBy: userAccountId,
      ...consumptionParentData(input.parent),
    },
  });

  // **El descuento, en la MISMA transacción.** Un consumo guardado sin su
  // descuento sería material gastado que el inventario nunca vio, y el
  // saldo mentiría desde ese momento.
  //
  // Sin cantidad no se descuenta y la fila se guarda igual: «se usó aserrín
  // de este saco» sin pesar dice DE QUÉ LOTE salió aunque no cuánto, e
  // inventar un descuento sería peor que no descontar nada.
  if (input.consumableLotId && input.quantity != null) {
    const unidad = (input.unit ?? "").trim();
    if (!unidad) throw new MaterialConsumptionValidationError("unidad requerida para descontar del lote");
    const previo = await tx.consumableStockEvent.findFirst({
      where: { consumableLotId: input.consumableLotId },
      select: { unit: true },
    });
    if (previo && previo.unit !== unidad) {
      throw new MaterialConsumptionValidationError(
        `unidad distinta: el lote va en ${previo.unit} y el consumo viene en ${unidad}`,
      );
    }
    await tx.consumableStockEvent.create({
      data: {
        consumableLotId: input.consumableLotId,
        eventType: "consumed",
        quantity: input.quantity,
        unit: unidad,
        occurredAt: input.occurredAt ?? new Date(),
        provenanceClass: input.provenanceClass,
        createdBy: userAccountId,
      },
    });
  }

  // C1 §3: evidentiary write (carries provenanceClass).
  await recordAuditEvent(
    {
      actorUserAccountId: userAccountId,
      operation: "material_consumption_entry.create",
      entityType: "material_consumption_entry",
      entityId: creada.id,
      after: creada,
      sourceInterface: "traceability.service",
    },
    tx,
  );

  return creada;
}

/**
 * `quantity`/`unit` stay optional even once the form is opened — "I
 * pitched about 2 kg, no scale at the tank" is worth recording with a
 * note rather than a fabricated precise number (DATA_ARCHITECTURE.md §4's
 * "never a guessed number"). `materialName`/`batchLabel` are required.
 */
export async function recordMaterialConsumptionEntry(userAccountId: string, input: RecordMaterialConsumptionEntryInput) {
  validarNombreYLote(input);

  if (input.parent.kind === "careRoutineEvent") {
    // Ese padre sólo lo crea el servicio de rutinas, que ya sabe autorizar en
    // el lugar o el equipo de la rutina — este servicio no tiene esa lectura.
    throw new MaterialConsumptionValidationError("consumo_de_rutina_por_su_servicio");
  }

  if (input.parent.kind === "location") {
    const location = await prisma.location.findUnique({ where: { id: input.parent.locationId } });
    if (!location) throw new TraceabilityAccessError("location_not_found");
    await requireLotAccess(userAccountId, "manage", [{ locationId: input.parent.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);
    await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ locationId: input.parent.locationId }]);
  } else if (input.parent.kind === "fieldSession") {
    // El ámbito sale de DÓNDE ocurrió la jornada. Una visita no lleva permisos
    // propios, y sin esta lectura cualquiera podría declarar consumos en el
    // apiario de otro con sólo saber el id de la jornada.
    const jornada = await prisma.fieldSession.findUnique({
      where: { id: input.parent.fieldSessionId },
      select: { locationId: true },
    });
    if (!jornada) throw new TraceabilityAccessError("field_session_not_found");
    await requireLotAccess(userAccountId, "manage", [
      { locationId: jornada.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION },
    ]);
    await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ locationId: jornada.locationId }]);
  } else {
    if (!input.lotId) throw new MaterialConsumptionValidationError("lot_id_required");
    const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
    if (!lot) throw new TraceabilityAccessError("lot_not_found");
    await requireLotAccess(userAccountId, "manage", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
    await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lot.projectId, locationId: lot.locationId }]);
  }

  const materialConsumptionEntry = await unaVezPorEnvio(userAccountId, input.claveDeEnvio, {
    tipo: "MaterialConsumptionEntry",
    recuperar: (id) => prisma.materialConsumptionEntry.findUniqueOrThrow({ where: { id } }),
    // El audit entra en la transacción DEL AYUDANTE, no en una nueva: la
    // escritura ya vive dentro de `unaVezPorEnvio`, así que envolverla por
    // fuera no la haría atómica — sólo añadiría una transacción alrededor de
    // algo ya confirmado. Es la misma forma que `measurements.ts` ya usaba.
    crear: (tx) => crearConsumoEnTx(tx, userAccountId, input),
  });

  return materialConsumptionEntry;
}
