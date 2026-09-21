import type { ClassificationLevel } from "../rbac/types";
/**
 * Phase 1, ticket T1 (docs/implementation/PHASE_1_TECHNICAL_EXECUTION_PLAN.md
 * §8, §34). Canonical Lot + LotTransformation — the mechanism underneath
 * DOMAIN_MODEL.md §4's Agricultural Traceability chain, reconciling it with
 * COMMERCE_OPERATIONS_TOOLS_ARCHITECTURE.md §F's already-approved design.
 *
 * Append-only by construction: there is deliberately no `updateLot` or
 * `updateLotTransformation` function in this file. A correction is always a
 * new LotTransformation, never an edit to an existing one — the same
 * principle already proven for sensory.Assessment and
 * SensoryProtocolVersion elsewhere in this codebase (execution plan §8.2).
 *
 * RBAC: Farm Operator Assignments may be scoped to `project` or `location`
 * (execution plan §26 decision record) — a *location*-scoped Assignment only
 * authorizes an action against a Lot if the Lot itself resolves to that
 * location (RBAC.md §3's leaf-scope containment rule), so every check here
 * tries every scope target a Lot actually carries (project, location),
 * never just one.
 */
import { prisma } from "../db";
import { LIST_LIMIT, truncate } from "../listLimit";
import { sortByName } from "../naturalOrder";
import { can } from "../rbac/service";
import { recordAuditEvent } from "../audit";
import type { ScopeTarget } from "../rbac/types";
import type { Prisma, ProvenanceClass } from "../../generated/prisma/client";
import { settleMassBalance } from "./balance";
import { validarMasaDeSubproducto } from "./subproductos";
import type { ByproductDestination, ByproductType, HoneyProcessAct } from "../../generated/prisma/client";
import { leerEnmiendas } from "./enmiendas";

export class TraceabilityAccessError extends Error {}

/**
 * P0 §6 — `lot:override_balance`, held by Platform Admin and deliberately not
 * by Farm Operator. Separate from `lot:manage` for the same reason A7 kept
 * `apiary:manage` away from the Colony Event Recorder: recording what
 * happened and accepting that it does not add up are different acts, and the
 * second one is the one worth restricting.
 */
export async function requireBalanceOverride(
  userAccountId: string,
  lots: ReadonlyArray<{ projectId: string | null; locationId: string | null; classification: ClassificationLevel }>,
) {
  for (const lot of lots) {
    for (const target of scopeTargetsFor(lot)) {
      if (await can(userAccountId, "override_balance", "lot", target, lot.classification)) return;
    }
  }
  throw new TraceabilityAccessError("no_balance_override");
}

/** Every concrete scope target a Lot (or a to-be-created Lot's parent context) resolves against — never just one. */
export function scopeTargetsFor(input: { projectId?: string | null; locationId?: string | null }): ScopeTarget[] {
  const targets: ScopeTarget[] = [];
  if (input.projectId) targets.push({ scopeType: "project", scopeRefId: input.projectId });
  if (input.locationId) targets.push({ scopeType: "location", scopeRefId: input.locationId });
  // A Lot with neither is only manageable platform-wide — `can()` already
  // resolves a Platform Admin's assignment against any concrete target, but
  // with no project/location to point at, the only target left to check is
  // platform scope itself.
  if (targets.length === 0) targets.push({ scopeType: "platform", scopeRefId: null });
  return targets;
}

/**
 * ADR-062/063 — `classification` is required on every candidate, deliberately.
 *
 * The gate was skipped here for as long as it was optional. A caller that has
 * the Lot loaded passes `lot.classification`; a caller creating a record
 * passes the classification the record will carry, which for a new Lot is the
 * schema default `internal`. "May this user create an internal lot" is a real
 * question and now gets asked.
 */
export async function requireLotAccess(
  userAccountId: string,
  // `release` se añadió el 2026-09-16 y NO es un escalón más de `manage`: es un
  // permiso distinto porque todo `Farm Operator` tiene `manage`, y autorizar una
  // venta no es trabajo de campo (§A.4 del spec de reposo).
  action: "manage" | "view" | "release",
  candidates: ReadonlyArray<{
    projectId?: string | null;
    locationId?: string | null;
    classification: ClassificationLevel;
  }>,
) {
  for (const candidate of candidates) {
    for (const target of scopeTargetsFor(candidate)) {
      if (await can(userAccountId, action, "lot", target, candidate.classification)) return;
    }
  }
  throw new TraceabilityAccessError("no_lot_access");
}

/**
 * The classification a not-yet-created record will carry. Matches the schema
 * default on Lot/Sample/SensorySession; kept as a named constant so a caller
 * asking "can this user create one" is visibly asking about `internal`.
 */
export const DEFAULT_NEW_RECORD_CLASSIFICATION: ClassificationLevel = "internal";

export interface CreateLotInput {
  lotCode: string;
  // A3 (22_APIARY_V1_SCOPING_REPORT.md §2) added "honey" to the DB enum;
  // kept in sync here rather than left stale — a caller creating or
  // filtering a honey Lot through the generic createLot()/getLotList()
  // path needs this widened, same as every prior lotType addition.
  lotType: "cherry" | "processing" | "drying" | "green" | "roast" | "sample" | "other" | "honey";
  // P0 §7 — required, matching Lot.organizationId. A batch belongs to whoever
  // owns it, and the per-organization lotCode uniqueness has nothing to scope
  // against without it.
  organizationId: string;
  projectId?: string | null;
  locationId?: string | null;
}

export async function createLot(userAccountId: string, input: CreateLotInput) {
  await requireLotAccess(userAccountId, "manage", [{ ...input, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

  return prisma.lot.create({
    data: {
      lotCode: input.lotCode,
      lotType: input.lotType,
      organizationId: input.organizationId,
      projectId: input.projectId ?? null,
      locationId: input.locationId ?? null,
      createdBy: userAccountId,
    },
  });
}

export interface RecordTransformationInput {
  transformationType:
    | "split"
    | "merge"
    | "blend"
    | "stage_change"
    | "sample_extraction"
    | "loss"
    | "disposal"
    | "sale"
    // P3 — kept in sync with the DB enum by hand, same as CreateLotInput.lotType.
    | "selection"
    // La trilla. Va aquí Y en el enum de Prisma: esta unión se mantiene a mano,
    // así que añadir el valor al esquema NO la actualiza, y sin esta línea
    // ninguna llamada podría registrar una trilla aunque la base la aceptara.
    | "hulling"
    // ADR-161 — procesar y envasar miel. Misma regla: el enum de Prisma NO actualiza esta unión.
    | "honey_processing"
    | "packaging";
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
  // T9.5: required, no fallback — the caller (app/actions/traceability.ts)
  // must state a real class for every transformation type; there is no
  // single correct default across split/merge/blend/stage_change/etc.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  inputs: ReadonlyArray<{ lotId: string; quantity?: number | null; unit?: string | null }>;
  // New Lot(s) this transformation produces — every LotTransformation output
  // is a freshly created Lot row (execution plan §8.1's lineage diagram: a
  // stage change, a split, a merge all produce a *new* node, never mutate an
  // existing one), never a reference to a pre-existing Lot. Empty for
  // loss/disposal/sale, and for sample_extraction in this ticket (Sample
  // creation is T5, not T1 — the transformation record itself is still
  // valid with zero Lot outputs).
  outputs: ReadonlyArray<{
    lotCode: string;
    lotType: CreateLotInput["lotType"];
    quantity?: number | null;
    unit?: string | null;
    // P3 §3 — set on a rejection stream. Its presence is what marks the
    // resulting Lot as a reject; `lotType` still states the material's stage.
    rejectionCategoryValueId?: string | null;
  }>;
  // P0 (§4) — material that leaves without becoming an output lot: mucilage,
  // water, handling. Declaring it is what turns an unexplained difference
  // into an explained one.
  declaredLossQuantity?: number | null;
  declaredLossUnit?: string | null;
  declaredLossReason?: string | null;
  // P3 §1 — only meaningful for transformationType `selection`.
  selectionMethodValueId?: string | null;
  equipmentNote?: string | null;
  /** ADR-161 — sólo en `honey_processing`; la base lo exige con un CHECK. */
  honeyProcessActs?: HoneyProcessAct[];
  honeyProcessOtherNote?: string | null;
  /** ADR-161 — sólo en `packaging`; la base lo exige con un CHECK. */
  packageCount?: number | null;
  packageNetMassG?: number | null;
  /**
   * P0 (§4, §6) — accept a transformation that does not reconcile within the
   * organization's tolerance. Requires `lot:override_balance`, which Farm
   * Operator deliberately does not hold: the operator records what the scale
   * says; accepting a discrepancy is someone else's call.
   *
   * Never suppresses the Deviation — the discrepancy happened either way.
   * What this records is that someone with the authority to do so
   * acknowledged it at write time, with a reason, rather than leaving it open
   * for review.
   */
  acceptUnexplained?: { reason: string } | null;
  /**
   * **Custodia — §B.1.** Quién ejecutó la transformación cuando NO fue la
   * organización dueña (Cafelino, Kiva Estate), dónde ocurrió, y cuándo salió y
   * volvió el material. Todos opcionales: mazo y pilón en la propia finca es
   * una de las tres formas reales, y exigirlos la prohibiría.
   */
  performedByOrganizationId?: string | null;
  performedAtLocationId?: string | null;
  custodyOut?: Date | null;
  custodyIn?: Date | null;
  /**
   * **Subproductos que salen de esta transformación** — la cascarilla de una
   * trilla, la pulpa de un despulpado.
   *
   * Van aquí y no en una llamada aparte por dos razones. La primera es
   * atomicidad: una trilla que descuenta el pergamino y falla al crear la
   * cascarilla dejaría material desaparecido del libro mayor. La segunda es el
   * BALANCE: su masa cuenta como salida, y sin eso los 18 kg de cascarilla de
   * una trilla de 100 saldrían como **inexplicados** — el mismo hueco del 18 %
   * que clasificar `hulling` como conservadora existe para evitar, entrando por
   * la otra puerta.
   */
  byproducts?: ReadonlyArray<{
    byproductType: ByproductType;
    destination: ByproductDestination;
    massKg: number;
    producedAtLocationId: string;
    notes?: string | null;
  }>;
}

/**
 * Creates a LotTransformation plus its input rows (referencing existing
 * Lots) and output rows (each backed by a brand-new Lot), atomically. RBAC
 * is checked against every *input* Lot's own project/location scope — an
 * operator must have manage access to at least one of the lots actually
 * being transformed; newly-created outputs inherit no independent scope
 * requirement of their own since they don't exist until this call succeeds.
 */
/**
 * De qué lote de entrada hereda su contexto —organización, proyecto, sitio— el
 * lote que sale de una transformación.
 *
 * **Extraída sin cambiar su comportamiento** para poder probarla de forma
 * determinista: el defecto que tiene depende del orden en que Postgres devuelva
 * las filas, y eso no se puede provocar desde una prueba contra la base.
 */
export function loteDeReferencia<T extends { id: string }>(
  lotesCargados: readonly T[],
  entradas: readonly { lotId: string }[],
): T {
  // **El primero que el operario ESCRIBIÓ**, no el primero que la base devuelva.
  // `findMany` sin `orderBy` no promete ningún orden, así que antes de esto el
  // origen de un lote fusionado lo decidía el recorrido de un índice — y con él
  // la altitud, la parcela y el huso horario que la pantalla imprime (V-001).
  const primero = entradas[0];
  if (!primero) throw new TraceabilityAccessError("inputs_required");
  const elegido = lotesCargados.find((l) => l.id === primero.lotId);
  // **Falla en vez de caer al primero que haya.** Caer sería el defecto original
  // con otra cara: un origen elegido por algo que no es la intención de nadie.
  if (!elegido) throw new TraceabilityAccessError("lot_not_found");
  return elegido;
}

export async function recordTransformation(userAccountId: string, input: RecordTransformationInput) {
  if (input.inputs.length === 0) {
    throw new TraceabilityAccessError("inputs_required");
  }

  const inputLots = await prisma.lot.findMany({
    where: { id: { in: input.inputs.map((i) => i.lotId) } },
  });
  if (inputLots.length !== new Set(input.inputs.map((i) => i.lotId)).size) {
    throw new TraceabilityAccessError("lot_not_found");
  }

  await requireLotAccess(
    userAccountId,
    "manage",
    inputLots.map((lot) => ({ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification })),
  );

  // P0 §6 — the override is authorized before the transaction opens, not
  // discovered halfway through it. Checked against the same scope targets as
  // the write itself, so holding the permission platform-wide or on the
  // relevant project/location both work.
  if (input.acceptUnexplained) {
    await requireBalanceOverride(userAccountId, inputLots);
  }

  const provenanceClass = input.provenanceClass;

  const result = await prisma.$transaction(async (tx) => {
    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: input.transformationType,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        selectionMethodValueId: input.selectionMethodValueId ?? null,
        equipmentNote: input.equipmentNote ?? null,
        honeyProcessActs: input.honeyProcessActs ?? [],
        honeyProcessOtherNote: input.honeyProcessOtherNote ?? null,
        packageCount: input.packageCount ?? null,
        packageNetMassG: input.packageNetMassG ?? null,
        // Custodia: quién la hizo, dónde, y cuándo salió y volvió el material.
        // Nulos cuando la hizo la propia organización en su propio patio, que
        // es una de las tres formas reales de trillar (§B.1).
        performedByOrganizationId: input.performedByOrganizationId ?? null,
        performedAtLocationId: input.performedAtLocationId ?? null,
        custodyOut: input.custodyOut ?? null,
        custodyIn: input.custodyIn ?? null,
        inputs: {
          create: input.inputs.map((i) => ({
            lotId: i.lotId,
            quantity: i.quantity ?? null,
            unit: i.unit ?? null,
          })),
        },
      },
    });

    // Inherit the first input lot's project/location/organization context —
    // the same farm/plot a material came from, unless a future ticket needs
    // to model a genuine cross-project transfer explicitly. Guaranteed to
    // exist: input.inputs.length was checked non-zero above, and inputLots
    // was verified to match that count.
    const sourceLot = loteDeReferencia(inputLots, input.inputs);

    const outputLots = [];
    for (const output of input.outputs) {
      const outputLot = await tx.lot.create({
        data: {
          lotCode: output.lotCode,
          lotType: output.lotType,
          organizationId: sourceLot.organizationId,
          projectId: sourceLot.projectId,
          locationId: sourceLot.locationId,
          rejectionCategoryValueId: output.rejectionCategoryValueId ?? null,
          createdBy: userAccountId,
        },
      });
      await tx.lotTransformationOutput.create({
        data: {
          transformationId: transformation.id,
          lotId: outputLot.id,
          quantity: output.quantity ?? null,
          unit: output.unit ?? null,
        },
      });
      // Seed the new lot's own quantity ledger so computeCurrentQuantity
      // (lib/traceability/quantity.ts) reports correctly for it from
      // creation, not just for lots created by HarvestEvent/ReceivingEvent
      // — LotTransformationOutput.quantity was previously only a snapshot
      // on the join row, disconnected from SUM(QuantityEvent). Skipped
      // when quantity isn't given, same "missing stays missing" rule as
      // everywhere else.
      if (output.quantity != null && output.unit) {
        await tx.quantityEvent.create({
          data: {
            lotId: outputLot.id,
            eventType: "process_output",
            quantity: output.quantity,
            unit: output.unit,
            occurredAt: input.occurredAt,
            transformationId: transformation.id,
            createdBy: userAccountId,
            // Same reliability as the transformation that produced it.
            provenanceClass,
            sourceReference: input.sourceReference ?? null,
          },
        });
      }
      outputLots.push(outputLot);
    }

    // Los subproductos, DENTRO de la misma transacción: si uno falla, la
    // transformación entera se revierte y el lote de entrada queda intacto.
    for (const sub of input.byproducts ?? []) {
      validarMasaDeSubproducto(sub.massKg);
      await tx.byproductBatch.create({
        data: {
          transformationId: transformation.id,
          byproductType: sub.byproductType,
          destination: sub.destination,
          massKg: sub.massKg,
          producedAtLocationId: sub.producedAtLocationId,
          organizationId: sourceLot.organizationId,
          notes: sub.notes ?? null,
          provenanceClass,
          createdBy: userAccountId,
        },
      });
    }

    // P0 — the half of the ledger that was missing. Guarded by
    // movesMaterial() so a run-opening stage_change (one input, zero outputs)
    // records its marker without consuming anything; see balance.ts.
    const reconciliation = await settleMassBalance(tx, {
      transformationId: transformation.id,
      transformationType: input.transformationType,
      organizationId: sourceLot.organizationId,
      inputs: input.inputs,
      // La masa de cada subproducto cuenta como salida. No crea lote de café
      // —la cascarilla no es café— pero sí es masa que salió del pergamino, y
      // el balance tiene que verla o la declarará inexplicada.
      outputs: [
        ...input.outputs,
        ...(input.byproducts ?? []).map((b) => ({ quantity: b.massKg, unit: "kg" })),
      ],
      occurredAt: input.occurredAt,
      provenanceClass,
      sourceReference: input.sourceReference ?? null,
      createdBy: userAccountId,
      declaredLossQuantity: input.declaredLossQuantity ?? null,
      declaredLossUnit: input.declaredLossUnit ?? null,
      declaredLossReason: input.declaredLossReason ?? null,
      acceptUnexplained: input.acceptUnexplained ?? null,
    });

    // C1 §3: evidentiary write (LotTransformation carries provenanceClass).
    //
    // Va DENTRO de la transacción y con `tx`. Antes iba fuera, y su comentario
    // lo justificaba así: «an audit row for a transaction that later rolled
    // back would misrepresent what actually happened». Esa razón no se
    // sostiene — si el audit va dentro y la transacción revierte, el audit
    // revierte con ella, que es exactamente lo que da la atomicidad. Lo que sí
    // ocurría era el fallo contrario: una escritura confirmada podía quedarse
    // SIN su AuditEvent si esta llamada fallaba después del commit. Lo señaló
    // una revisión independiente el 2026-08-31 y es la razón de que
    // `recordAuditEvent` acepte `tx` (ver la cabecera de `lib/audit.ts`).
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_transformation.create",
        entityType: "lot_transformation",
        entityId: transformation.id,
        after: transformation,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { transformation, outputLots, reconciliation };
  });

  return result;
}

/**
 * Both directions of lineage, via recursive CTEs — "where did this come
 * from" (ancestors, walking output → input backward) and "what did this
 * become" (descendants, walking input → output forward). Execution plan
 * §8.3: no graph database needed, ordinary recursive SQL over the
 * input/output join tables.
 */
export async function getLotLineage(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  const ancestors = await prisma.$queryRaw<Array<{ lot_id: string; depth: number }>>`
    WITH RECURSIVE ancestry AS (
      SELECT lto.lot_id AS output_lot_id, lti.lot_id AS input_lot_id, 0 AS depth
      FROM traceability.lot_transformation_output lto
      JOIN traceability.lot_transformation_input lti ON lti.transformation_id = lto.transformation_id
      WHERE lto.lot_id = ${lotId}::uuid
      UNION ALL
      SELECT lto.lot_id, lti.lot_id, ancestry.depth + 1
      FROM ancestry
      JOIN traceability.lot_transformation_output lto ON lto.lot_id = ancestry.input_lot_id
      JOIN traceability.lot_transformation_input lti ON lti.transformation_id = lto.transformation_id
    )
    SELECT DISTINCT input_lot_id AS lot_id, depth FROM ancestry ORDER BY depth ASC;
  `;

  const descendants = await prisma.$queryRaw<Array<{ lot_id: string; depth: number }>>`
    WITH RECURSIVE descent AS (
      SELECT lti.lot_id AS input_lot_id, lto.lot_id AS output_lot_id, 0 AS depth
      FROM traceability.lot_transformation_input lti
      JOIN traceability.lot_transformation_output lto ON lto.transformation_id = lti.transformation_id
      WHERE lti.lot_id = ${lotId}::uuid
      UNION ALL
      SELECT lti.lot_id, lto.lot_id, descent.depth + 1
      FROM descent
      JOIN traceability.lot_transformation_input lti ON lti.lot_id = descent.output_lot_id
      JOIN traceability.lot_transformation_output lto ON lto.transformation_id = lti.transformation_id
    )
    SELECT DISTINCT output_lot_id AS lot_id, depth FROM descent ORDER BY depth ASC;
  `;

  const ancestorLotIds = ancestors.map((r) => r.lot_id);
  const descendantLotIds = descendants.map((r) => r.lot_id);

  // Resolve the ids to lot codes here rather than leaving the page to render
  // "32311e6d" (ADR-080). A batch's parent means something as "PE-98" and
  // nothing as a uuid prefix — the same defect /my-nectar had with scope
  // references. One query covers both directions.
  const related =
    ancestorLotIds.length + descendantLotIds.length > 0
      ? await prisma.lot.findMany({
          where: { id: { in: [...ancestorLotIds, ...descendantLotIds] } },
          select: { id: true, lotCode: true },
        })
      : [];

  return {
    lot,
    ancestorLotIds,
    descendantLotIds,
    /** id → lotCode for everything in `ancestorLotIds` and `descendantLotIds`. */
    lotCodesById: new Map(related.map((l) => [l.id, l.lotCode])),
  };
}

/**
 * T10 (§29, §34): what Lots (and, by extension, Samples) a user can see for
 * list/dashboard purposes — distinct from `requireLotAccess`'s per-resource
 * check, since "list everything I can see" needs the actual set of
 * project/location scope refs a user's Assignments grant `lot:view`
 * against, not just a yes/no answer for one already-known Lot. A
 * platform-scoped Assignment (RBAC.md §3: "platform always contains")
 * sees everything; a project/location-scoped one sees only Lots resolving
 * to those scopes; a user with no qualifying Assignment sees nothing.
 */
// Exported for R1's listRoastSessions (lib/traceability/roasting.ts) — a
// RoastSession has no projectId/locationId of its own (same as
// FermentationRun/DryingRun), so "which roast sessions can this user see"
// resolves through the same lot-visibility mechanism as everything else,
// applied to the source lot each session's transformation references.
export interface LotVisibility {
  mode: "all" | "none" | "scoped";
  projectIds: string[];
  locationIds: string[];
}

export async function resolveLotVisibility(
  userAccountId: string,
  // "export" reuses this resolver rather than growing a second one: the
  // question "which lots may this person export" is the same scope question
  // as "which may they view", asked of a different permission.
  action: "view" | "manage" | "export" = "view",
): Promise<LotVisibility> {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      userAccountId,
      status: "active",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
    },
    include: { scope: true, roleProfile: { include: { permissions: { include: { permission: true } } } } },
  });

  const viewGranting = assignments.filter((a) =>
    a.roleProfile.permissions.some((rp) => rp.permission.resourceType === "lot" && rp.permission.action === action),
  );

  if (viewGranting.some((a) => a.scope.scopeType === "platform")) {
    return { mode: "all", projectIds: [], locationIds: [] };
  }

  const projectIds = [
    ...new Set(
      viewGranting
        .filter((a) => a.scope.scopeType === "project")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];
  const locationIds = [
    ...new Set(
      viewGranting
        .filter((a) => a.scope.scopeType === "location")
        .map((a) => a.scope.scopeRefId)
        .filter((id): id is string => id != null),
    ),
  ];

  if (projectIds.length === 0 && locationIds.length === 0) {
    return { mode: "none", projectIds: [], locationIds: [] };
  }
  return { mode: "scoped", projectIds, locationIds };
}

function scopeOrClauses(visibility: LotVisibility): Array<{ projectId: { in: string[] } } | { locationId: { in: string[] } }> {
  const clauses: Array<{ projectId: { in: string[] } } | { locationId: { in: string[] } }> = [];
  if (visibility.projectIds.length) clauses.push({ projectId: { in: visibility.projectIds } });
  if (visibility.locationIds.length) clauses.push({ locationId: { in: visibility.locationIds } });
  return clauses;
}

/** Null return means "matches nothing" — the caller should short-circuit rather than query with an empty OR (which Prisma/Postgres would read as "matches everything"). */
export function lotWhereFromVisibility(visibility: LotVisibility): Prisma.LotWhereInput | null {
  if (visibility.mode === "all") return {};
  if (visibility.mode === "none") return null;
  return { OR: scopeOrClauses(visibility) };
}

export function sampleWhereFromVisibility(visibility: LotVisibility): Prisma.SampleWhereInput | null {
  if (visibility.mode === "all") return {};
  if (visibility.mode === "none") return null;
  return { OR: scopeOrClauses(visibility) };
}

/**
 * ¿Puede esta cuenta **registrar** en este lote?
 *
 * Pregunta al mismo guardia que usa la escritura en vez de reimplementar la
 * regla, que es justo lo que hacía que la pantalla y el servicio pudieran
 * discrepar: `/lots/[id]` ofrecía seis botones y 16 formularios sin consultar
 * ningún permiso, y los 15 que exigen `lot:manage` los negaba el servicio
 * después. Reimplementar aquí «proyecto o ubicación en el alcance» habría
 * dejado fuera la clasificación, que `requireLotAccess` sí comprueba.
 *
 * Sólo se traga `TraceabilityAccessError` —la negativa—; cualquier otro error
 * sube, porque un fallo de base leído como «no puedes» es un permiso denegado
 * en silencio.
 */
export async function puedeGestionarLote(
  userAccountId: string,
  lot: { projectId?: string | null; locationId?: string | null; classification: ClassificationLevel },
): Promise<boolean> {
  try {
    await requireLotAccess(userAccountId, "manage", [lot]);
    return true;
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return false;
    throw error;
  }
}

export function lotMatchesVisibility(lot: { projectId: string | null; locationId: string | null }, visibility: LotVisibility): boolean {
  if (visibility.mode === "all") return true;
  if (visibility.mode === "none") return false;
  return (
    (lot.projectId != null && visibility.projectIds.includes(lot.projectId)) ||
    (lot.locationId != null && visibility.locationIds.includes(lot.locationId))
  );
}

export interface LotListFilters {
  lotType?: CreateLotInput["lotType"];
}

// La organización se trae ACOTADA a lo que se pinta, y no entera.
//
// El gate de estas consultas es la clasificación del LOTE: `requireLotAccess`
// recibe `classification: lot.classification`. (Sin paréntesis a propósito —
// `scripts/inventario-de-acceso.mjs` reconoce formas escritas: el nombre de un
// guardia seguido de un paréntesis de apertura, aunque esté en un comentario,
// asciende a guardia la declaración que lo contenga.
// Pasó el 2026-09-05: promovió `lotMatchesVisibility` y con ella
// `getActiveOperations`, que no se había tocado.) La organización
// tiene la suya propia y no se comprueba aquí, así que `organization: true`
// cargaba `contactEmail`, `contactPhone`, `websiteUrl` y `attributes` de una
// organización que puede estar clasificada por encima del lote.
//
// **Medido el 2026-09-05: hoy no expone nada.** Ningún consumidor usa más que
// `name` —comprobado en todo el código—, los componentes cliente reciben
// `{ id, name }`, y en producción no hay ni un lote menos restringido que su
// organización (0 de 43). Lo que se arregla es que eso lo garantizaban los
// datos y el hábito, no el código: el día que alguien pinte un teléfono o pase
// `lot.organization` a un cliente, se envía, y nada avisa.
//
// No se inventa política de clasificación: se deja de traer lo que nadie pinta.
const ORGANIZACION_VISIBLE = { select: { id: true, name: true } } as const;

/**
 * Filterable list for the `/lots` screen (§30 screen 2) — newest first, capped
 * at LIST_LIMIT and reporting when the cap was reached (ADR-087). Still not
 * pagination; the page can now at least say it is not showing everything,
 * where before it silently presented the newest 200 as the whole set.
 *
 * Visibility is in the `where`, so the cap is spent on rows this caller can
 * actually see.
 */
export async function getLotList(userAccountId: string, filters: LotListFilters = {}) {
  const visibility = await resolveLotVisibility(userAccountId);
  const where = lotWhereFromVisibility(visibility);
  // `sinAmbito` distingue «no hay lotes» de «no puedes ver ninguno», que hasta
  // hoy llegaban a la pantalla como el mismo array vacío. La quinta revisión
  // (2026-09-05) lo encontró: `/lots` decía «Nada en curso ahora mismo» a una
  // cuenta sin asignaciones — una afirmación sobre la finca, cuando puede haber
  // fermentaciones corriendo. Y es lo primero que ve alguien recién dado de
  // alta: 13 de 14 cuentas siguen sin poder entrar (P-C).
  if (where === null)
    return {
      ...truncate<
        Prisma.LotGetPayload<{
          include: { project: true; organization: { select: { id: true; name: true } }; location: true; rejectionCategoryValue: { select: { value: true } } };
        }>
      >([]),
      sinAmbito: true,
    };

  const rows = await prisma.lot.findMany({
    where: { ...where, ...(filters.lotType ? { lotType: filters.lotType } : {}) },
    // P3 §3 — a rejection stream is still `cherry` by lotType, deliberately,
    // so without this the batch list shows floaters and accepted coffee as
    // indistinguishable rows. The category is what tells them apart.
    include: { project: true, organization: ORGANIZACION_VISIBLE, location: true, rejectionCategoryValue: { select: { value: true } } },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT + 1,
  });
  return { ...truncate(rows), sinAmbito: false };
}

// Placeholder threshold for the "requiring attention" card (§23: "past a
// configurable threshold") — Phase 1 has no settings UI to make this
// actually configurable yet, so it's a named constant, not a magic number.
const ATTENTION_MEASUREMENT_STALENESS_HOURS = 24;

/**
 * The four Active Operations cards (§23) — concrete, actionable queries,
 * not a decorative dashboard. Every card is scoped to what this user's
 * Assignments actually let them see.
 */
export async function getActiveOperations(userAccountId: string) {
  const visibility = await resolveLotVisibility(userAccountId);
  if (visibility.mode === "none") {
    // Ver el comentario de `getLotList`: un vacío por falta de ámbito no es un
    // vacío, y la pantalla necesita poder decirlo.
    return { activeFermentationRuns: [], activeDryingRuns: [], lotsNeedingMeasurement: [], samplesAwaitingSensory: [], sinAmbito: true };
  }

  const runInclude = {
    transformations: {
      where: { transformationType: "stage_change" as const },
      orderBy: { occurredAt: "asc" as const },
      take: 1,
      include: { inputs: { include: { lot: { include: { project: true } } } } },
    },
  };

  const [fermentationRunRows, dryingRunRows] = await Promise.all([
    prisma.fermentationRun.findMany({ where: { endedAt: null }, include: runInclude }),
    prisma.dryingRun.findMany({ where: { endedAt: null }, include: runInclude }),
  ]);

  const withSourceLot = <T extends { transformations: Array<{ inputs: Array<{ lot: NonNullable<unknown> }> }> }>(rows: T[]) =>
    rows
      .map((run) => ({ run, lot: run.transformations[0]?.inputs[0]?.lot ?? null }))
      .filter((entry): entry is { run: T; lot: NonNullable<(typeof entry)["lot"]> } => entry.lot != null);

  const activeFermentationRuns = withSourceLot(fermentationRunRows).filter((e) => lotMatchesVisibility(e.lot as { projectId: string | null; locationId: string | null }, visibility));
  const activeDryingRuns = withSourceLot(dryingRunRows).filter((e) => lotMatchesVisibility(e.lot as { projectId: string | null; locationId: string | null }, visibility));

  const staleThreshold = new Date(Date.now() - ATTENTION_MEASUREMENT_STALENESS_HOURS * 60 * 60 * 1000);
  const activeLotIds = [
    ...activeFermentationRuns.map((e) => (e.lot as { id: string }).id),
    ...activeDryingRuns.map((e) => (e.lot as { id: string }).id),
  ];
  const recentlyMeasuredLotIds =
    activeLotIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.measurement.findMany({
              where: { lotId: { in: activeLotIds }, occurredAt: { gte: staleThreshold } },
              select: { lotId: true },
            })
          ).map((m) => m.lotId),
        );
  const lotsNeedingMeasurement = [...activeFermentationRuns, ...activeDryingRuns]
    .map((e) => e.lot as { id: string; lotCode: string })
    .filter((lot) => !recentlyMeasuredLotIds.has(lot.id));

  const sampleWhere = sampleWhereFromVisibility(visibility);
  const samplesAwaitingSensory =
    sampleWhere === null
      ? []
      : await prisma.sample.findMany({
          where: { ...sampleWhere, sourceLotId: { not: null }, blindMappings: { none: {} } },
          orderBy: { createdAt: "desc" },
          take: 50,
        });

  return { activeFermentationRuns, activeDryingRuns, lotsNeedingMeasurement, samplesAwaitingSensory, sinAmbito: false };
}

/**
 * Full Lot Detail aggregation (§23) — everything the page needs in one
 * call except current quantity (lib/traceability/quantity.ts's
 * computeCurrentQuantity, called separately by the page to avoid a
 * lots.ts → quantity.ts → lots.ts import cycle).
 *
 * **`auditEvents` estuvo roto meses, y este párrafo lo certificaba.** Decía que
 * la sección renderizaba vacía «honestamente» porque ninguna ruta de la Fase 1
 * escribía para una entidad de trazabilidad. Era cierto cuando se escribió y
 * dejó de serlo: hoy se auditan las transformaciones, los perfiles de tueste,
 * las mediciones, las cosechas y los eventos de cantidad. La consulta se quedó
 * atrás preguntando por un tipo que **nadie escribe nunca**, así que el panel
 * afirmaba «sin historial» con una pregunta que no podía acertar
 * (`PENDING_IMPLEMENTATIONS/009`).
 *
 * Ahora lee por `leerEnmiendas` sobre los CINCO tipos bajo los que se auditan
 * los hechos de un lote. Preguntar por uno solo enseñaría un quinto de su
 * historia pareciendo completo, que es peor que enseñar cero.
 * `tests/arquitectura/vocabulario-de-audit.test.ts` impide que vuelva a pasar.
 */
export async function getLotDetail(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    // P3 §3 — the batch header marks a rejection stream; without the category
    // a floater batch reads as ordinary cherry, which is precisely the
    // confusion keeping lotType physical was meant to avoid creating.
    include: { project: true, organization: ORGANIZACION_VISIBLE, location: true, rejectionCategoryValue: { select: { value: true } } },
  });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");

  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);

  const [
    lineage,
    transformations,
    quantityEvents,
    measurements,
    samples,
    storageAssignments,
    tasks,
    auditEvents,
    harvestEvent,
    receivingEvent,
    apiaryHarvestEvent,
  ] = await Promise.all([
    getLotLineage(userAccountId, lotId),
    prisma.lotTransformation.findMany({
      where: { OR: [{ inputs: { some: { lotId } } }, { outputs: { some: { lotId } } }] },
      include: { inputs: true, outputs: true },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.quantityEvent.findMany({ where: { lotId }, orderBy: { occurredAt: "asc" } }),
    prisma.measurement.findMany({ where: { lotId }, orderBy: { occurredAt: "asc" } }),
    prisma.sample.findMany({ where: { sourceLotId: lotId }, orderBy: { createdAt: "asc" } }),
    prisma.storageAssignment.findMany({ where: { lotId }, include: { location: true }, orderBy: { startedAt: "asc" } }),
    lot.projectId
      ? prisma.task.findMany({ where: { projectId: lot.projectId }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
    leerEnmiendas([
      { entityType: "lot_transformation", entityId: lotId },
      { entityType: "lot_roast_profile", entityId: lotId },
      { entityType: "quantity_event", entityId: lotId },
      { entityType: "measurement", entityId: lotId },
      { entityType: "harvest_event", entityId: lotId },
    ]),
    // T12.5: the originating HarvestEvent, if this lot came from one.
    // Tarea 8 fitosanitaria (spec §3.4) añade `marcasDeCarencia`: la foto de
    // qué intervenciones seguían en carencia al cosechar, con lo mínimo de
    // cada una para enlazarla y rotularla — nunca se recalcula desde aquí.
    prisma.harvestEvent.findUnique({
      where: { resultingLotId: lotId },
      include: {
        marcasDeCarencia: {
          include: { intervention: { select: { id: true, occurredAt: true, target: true, locationId: true } } },
        },
      },
    }),
    // T12.6: the originating ReceivingEvent, if this lot came from one
    // instead — needed so labour can attach to Receiving specifically
    // (unlike T12.5's photos, which attach receiving-stage media via
    // lotId directly since Asset has no receivingEventId FK; labour_entry
    // does have one, per the source report's own field spec).
    prisma.receivingEvent.findUnique({ where: { resultingLotId: lotId } }),
    // A5 (22_APIARY_V1_SCOPING_REPORT.md) — the originating
    // ApiaryHarvestEvent, if this lot is a honey batch. Mutually exclusive
    // with harvestEvent/receivingEvent in practice (a Lot originates from
    // at most one of the three), fetched unconditionally the same way —
    // cheap for a lot that isn't honey (a single indexed unique lookup
    // that just returns null), no lotType branching needed to decide
    // whether to ask.
    prisma.apiaryHarvestEvent.findUnique({ where: { resultingLotId: lotId } }),
  ]);

  const fermentationRunIds = [...new Set(transformations.map((t) => t.fermentationRunId).filter((id): id is string => id != null))];
  const dryingRunIds = [...new Set(transformations.map((t) => t.dryingRunId).filter((id): id is string => id != null))];

  const [fermentationRuns, dryingRuns, sensoryLinkage, assets, labourEntries, materialConsumptionEntries] = await Promise.all([
    fermentationRunIds.length
      ? prisma.fermentationRun.findMany({ where: { id: { in: fermentationRunIds } }, include: { interventions: { orderBy: { occurredAt: "asc" } } } })
      : Promise.resolve([]),
    dryingRunIds.length
      ? prisma.dryingRun.findMany({ where: { id: { in: dryingRunIds } }, include: { turningEvents: { orderBy: { occurredAt: "asc" } } } })
      : Promise.resolve([]),
    getSensoryLinkageForSamples(samples.map((s) => s.id)),
    // T12.5: every Asset attached anywhere in this lot's chain, one query —
    // grouped by attachment point in the page component, not here, since
    // "how to render six kinds of attachment" is a UI concern, not a
    // service-layer one. No independent RBAC check inside this query: the
    // requireLotAccess("view", ...) call above already gates the whole
    // aggregation this belongs to, same as sensoryLinkage.
    prisma.asset.findMany({
      where: {
        OR: [
          { lotId },
          harvestEvent ? { harvestEventId: harvestEvent.id } : undefined,
          { measurementId: { in: measurements.map((m) => m.id) } },
          { fermentationRunId: { in: fermentationRunIds } },
          { dryingRunId: { in: dryingRunIds } },
          { sampleId: { in: samples.map((s) => s.id) } },
        ].filter((clause): clause is NonNullable<typeof clause> => clause != null),
      },
      orderBy: { createdAt: "desc" },
    }),
    // T12.6: every LabourEntry across this lot's four possible attachment
    // points — same "grouping is a UI concern" reasoning as assets above.
    prisma.labourEntry.findMany({
      where: {
        OR: [
          harvestEvent ? { harvestEventId: harvestEvent.id } : undefined,
          receivingEvent ? { receivingEventId: receivingEvent.id } : undefined,
          { fermentationRunId: { in: fermentationRunIds } },
          { dryingRunId: { in: dryingRunIds } },
        ].filter((clause): clause is NonNullable<typeof clause> => clause != null),
      },
      orderBy: { occurredAt: "desc" },
    }),
    // T12.6: every MaterialConsumptionEntry, scoped to fermentation/drying only.
    prisma.materialConsumptionEntry.findMany({
      where: { OR: [{ fermentationRunId: { in: fermentationRunIds } }, { dryingRunId: { in: dryingRunIds } }] },
      orderBy: { occurredAt: "desc" },
    }),
  ]);

  // ADR-161 — de qué cosechas viene una MIEL, subiendo por la genealogía. Un frasco envasado
  // no es el lote de la cosecha: es su nieto, y sin esto su ficha no diría de qué colonia ni de
  // qué apiario salió. Varias si hubo fusión. Ya autorizado arriba: es la genealogía de ESTE lote.
  const origenApicola =
    lot.lotType === "honey"
      ? await prisma.apiaryHarvestEvent.findMany({
          where: { resultingLotId: { in: [lotId, ...lineage.ancestorLotIds] } },
          orderBy: { occurredAt: "asc" },
          select: {
            id: true,
            occurredAt: true,
            resultingLotId: true,
            colony: {
              select: {
                id: true,
                hive: { select: { id: true, identifier: true, location: { select: { id: true, name: true } } } },
              },
            },
          },
        })
      : [];

  return {
    lot,
    lineage,
    origenApicola,
    transformations,
    quantityEvents,
    measurements,
    samples,
    fermentationRuns,
    dryingRuns,
    storageAssignments,
    tasks,
    auditEvents,
    sensoryLinkage,
    harvestEvent,
    receivingEvent,
    apiaryHarvestEvent,
    assets,
    labourEntries,
    materialConsumptionEntries,
  };
}

export interface SensoryLinkageEntry {
  sessionId: string;
  sessionName: string;
  sessionStatus: string;
  revealed: boolean;
  overallResult: { meanValue: string; minValue: string; maxValue: string; responseCount: number } | null;
}

/**
 * T12 (§34): read-only join from Sample → SensoryBlindMapping →
 * SensoryBlindSample → (SensoryFlight → SensorySession) + PanelResult, so
 * Lot Detail can show "this lot's cupped sample scored X" without an
 * empty/error state for a Sample that was never cupped (§30 screen 10's
 * "renders when present, absent gracefully otherwise").
 *
 * Deliberately gated by `lot:view` alone (already enforced by the caller,
 * getLotDetail), not `blind_mapping:view`. RBAC.md §7's restriction exists
 * to keep a *judge* from learning which real sample a blind code maps to
 * before/while scoring — it is not a rule that final, computed results
 * must stay hidden from the operator of the lot that produced them
 * forever. This function only ever returns an aggregate `PanelResult`
 * (mean/min/max/responseCount) and the session's own name/status; it never
 * returns `blindCode`, the mapping row itself, or any individual
 * Assessment/evaluator identity — Farm Operator (the actual caller here)
 * holds neither `blind_mapping:view` nor any `sensory:*` permission, and
 * none is needed for this specific, narrow exposure.
 *
 * Also deliberately does not apply a `classification:clear_*` check
 * against SensorySession (which defaults to `internal`) — the ticket's own
 * "shows its PanelResult; one without shows nothing" framing gates on
 * whether a result has been *computed*, not on the session's own
 * classification. If that turns out to be the wrong call, it is a
 * one-line fix (a `can()` check against `session.classification`), not a
 * schema change.
 */
export async function getSensoryLinkageForSamples(sampleIds: string[]): Promise<Record<string, SensoryLinkageEntry[]>> {
  if (sampleIds.length === 0) return {};

  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds } },
    select: {
      id: true,
      blindMappings: {
        select: {
          revealedAt: true,
          blindSample: {
            select: {
              flight: { select: { session: { select: { id: true, name: true, status: true } } } },
              panelResults: {
                where: { attributeId: null },
                select: { meanValue: true, minValue: true, maxValue: true, responseCount: true },
              },
            },
          },
        },
      },
    },
  });

  const result: Record<string, SensoryLinkageEntry[]> = {};
  for (const sample of samples) {
    if (sample.blindMappings.length === 0) continue;
    result[sample.id] = sample.blindMappings.map((mapping) => {
      const overall = mapping.blindSample.panelResults[0] ?? null;
      return {
        sessionId: mapping.blindSample.flight.session.id,
        sessionName: mapping.blindSample.flight.session.name,
        sessionStatus: mapping.blindSample.flight.session.status,
        revealed: mapping.revealedAt != null,
        overallResult: overall
          ? {
              meanValue: overall.meanValue.toString(),
              minValue: overall.minValue.toString(),
              maxValue: overall.maxValue.toString(),
              responseCount: overall.responseCount,
            }
          : null,
      };
    });
  }
  return result;
}

/**
 * What a user can actually pick from when creating a lot or moving one to
 * storage (§30 screens 4/8) — enough detail (organization, location
 * hierarchy) to render real dropdowns instead of asking an operator to
 * paste in a raw UUID.
 *
 * Both `projects` and `locations` are scoped to the user's actual
 * `lot:manage` Assignments — offering an option the write path will then
 * reject (`recordHarvestEvent`/`recordReceivingEvent`'s `requireLotAccess`
 * failing with "no_lot_access") is the same bug class already fixed once
 * in lib/partner/workspace.ts's `getPartnerProjects`: a list's own filter
 * and the write path's authorization check must agree, not just both
 * exist independently.
 *
 * Location has no direct Project FK (`Project.primaryLocationId` is one
 * nullable pointer, not the set of locations a project's work happens at),
 * so "which locations belong to project X" is computed via Organization
 * instead: a plot Location (e.g. "Lote 1") typically has `organizationId`
 * null and inherits it from its parent site Location ("Finca Las Nubes
 * Cerro Azul", which does carry `organizationId`) via `parentLocationId` —
 * confirmed against real data, every existing Lot tying a project to a
 * location does so through exactly this chain. A Location is reachable if
 * its own or an ancestor's `organizationId` matches one of the user's
 * accessible projects' `organizationId`, OR the Location itself is granted
 * directly via a location-scoped Assignment (`visibility.locationIds`).
 */
export async function getManageableContext(userAccountId: string) {
  const visibility = await resolveLotVisibility(userAccountId, "manage");

  const [projects, allLocations] = await Promise.all([
    visibility.mode === "none"
      ? Promise.resolve([])
      : visibility.mode === "all"
        ? prisma.project.findMany({ orderBy: { name: "asc" } })
        : prisma.project.findMany({ where: { id: { in: visibility.projectIds } }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ include: { organization: true }, orderBy: { name: "asc" } }),
  ]);

  const locationsById = new Map(allLocations.map((l) => [l.id, l]));
  const effectiveOrgCache = new Map<string, string | null>();
  function effectiveOrganizationId(location: (typeof allLocations)[number]): string | null {
    if (effectiveOrgCache.has(location.id)) return effectiveOrgCache.get(location.id)!;
    let result: string | null = null;
    let current: typeof location | undefined = location;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.organizationId) {
        result = current.organizationId;
        break;
      }
      visited.add(current.id);
      current = current.parentLocationId ? locationsById.get(current.parentLocationId) : undefined;
    }
    effectiveOrgCache.set(location.id, result);
    return result;
  }

  const locations =
    visibility.mode === "all"
      ? allLocations
      : visibility.mode === "none"
        ? []
        : (() => {
            const accessibleOrgIds = new Set(
              projects.map((p) => p.organizationId).filter((id): id is string => id != null),
            );
            return allLocations.filter((l) => {
              if (visibility.locationIds.includes(l.id)) return true;
              const orgId = effectiveOrganizationId(l);
              return orgId != null && accessibleOrgIds.has(orgId);
            });
          })();

  const organizations = [
    ...new Map(
      locations.filter((l) => l.organization != null).map((l) => [l.organization!.id, l.organization!]),
    ).values(),
  ];

  // A4 (revisión final del plan 2a): un estante de secado o una de sus
  // posiciones no es un destino de traslado — se excluyen de `locations` para
  // que el formulario de traslado de almacenamiento (`storage/new`) no los
  // ofrezca. `locations` sigue sin filtrar por TIPO más allá de esto: un
  // sitio o un beneficio siguen siendo un destino legítimo.
  const locationsSinPosicionesDeEstante = locations.filter(
    (l) => l.locationType !== "drying_rack" && !(l.locationType === "drying_bed" && l.rackSlot != null),
  );

  // Harvest/Receiving's own "which plot" dropdown must not offer
  // administrative geography (country/province/district/locality) or
  // processing-stage sites (Beneficio, Cuarto de secado) alongside actual
  // plots — those aren't valid harvest/receiving locations and picking one
  // by mistake is what produced the confusing "no lot access" reports.
  // Natural order, not the query's string order: `ORDER BY name` puts
  // "Lote 10" before "Lote 2" (ADR-078).
  const plotLocations = sortByName(
    locations.filter((l) => l.locationType === "plot"),
    (l) => l.name,
  );

  // `sinAmbito` distingue —igual que en `getLotList`— «no hay dónde registrar»
  // de «tu cuenta no puede registrar en ningún sitio». Las dos llegaban a la
  // pantalla como tres listas vacías, y un `<select required>` sin opciones no
  // se puede enviar ni dice por qué: el formulario ofrecía lo que el servicio
  // iba a negar. `mode === "none"` es la segunda, y es la única que la página
  // puede explicar.
  return { projects, locations: locationsSinPosicionesDeEstante, plotLocations, organizations, sinAmbito: visibility.mode === "none" };
}

/**
 * Candidate observers for the measurement-entry "who actually took this
 * reading" override (T9.5 §3(c)) — every active Person, system-wide, plus
 * which one is this user's own. Same reasoning as getManageableContext's
 * Location dropdown above: a convenience for a two-tap override, not a
 * security boundary — operatorPersonId carries no RBAC weight of its own.
 */
export async function getObserverCandidates(userAccountId: string) {
  const [account, people] = await Promise.all([
    prisma.userAccount.findUnique({ where: { id: userAccountId }, select: { personId: true } }),
    prisma.person.findMany({ where: { status: "active" } }),
  ]);
  const selfPersonId = account?.personId ?? null;

  // Self first, then everyone else in natural order (ADR-080).
  //
  // Every consumer renders `observers` in array order, so the ordering decided
  // here is the ordering a person scrolls. Sorted purely by name, "Yo (Daniel
  // Giráldez)" sat seventh of seventeen — and the overwhelmingly common answer
  // to "who took this reading" is "I did", entered on a phone, outdoors, often
  // with wet hands.
  //
  // The remainder uses the locale-aware comparator rather than the query's
  // `ORDER BY displayName`, so "Chayanne López" and "Kenis Abdiel Rodríguez
  // Núñez" sort where a Spanish reader expects (ADR-078).
  const self = selfPersonId ? people.find((person) => person.id === selfPersonId) : undefined;
  const others = sortByName(
    people.filter((person) => person.id !== selfPersonId),
    (person) => person.displayName,
  );

  return { people: self ? [self, ...others] : others, selfPersonId };
}

/** Lightweight lot fetch + view-access check for the simpler "record X" form pages, which don't need getLotDetail's full aggregation. */
export async function getLotSummary(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  return lot;
}

/**
 * Marca un lote como liberado para la venta.
 *
 * **No comprueba la edad de reposo, y es deliberado.** Liberar es una decisión
 * de quien negocia —«depende el arreglo»: un comprador puede aceptar menos
 * reposo, o el precio puede reflejarlo— y no una consecuencia del calendario.
 * El aviso de venta temprana sigue saliendo después de liberar: si el estado
 * callara la advertencia, liberar sería la manera de esquivar el sistema, que
 * es justo lo que la doctrina de avisar-y-no-bloquear existe para evitar.
 *
 * Idempotente: liberar un lote ya liberado no mueve la fecha ni el autor. Quién
 * y cuándo lo autorizó primero es el hecho que interesa.
 */
export async function liberarLote(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({
    where: { id: lotId },
    select: { id: true, projectId: true, locationId: true, classification: true, releasedAt: true },
  });
  if (!lot) throw new TraceabilityAccessError("no_lot_access");
  await requireLotAccess(userAccountId, "release", [lot]);
  if (lot.releasedAt) return prisma.lot.findUniqueOrThrow({ where: { id: lotId } });

  // La escritura y su auditoría van en la MISMA transacción: un lote liberado
  // sin su AuditEvent seria una autorizacion comercial sin rastro de quien la
  // dio. Ver la cabecera de `lib/audit.ts`.
  return prisma.$transaction(async (tx) => {
    const liberado = await tx.lot.update({
      where: { id: lotId },
      data: { releasedAt: new Date(), releasedBy: userAccountId },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot.release",
        sourceInterface: "traceability.service",
        entityType: "lot",
        entityId: lotId,
        after: liberado,
      },
      tx,
    );
    return liberado;
  });
}
