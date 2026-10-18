/**
 * R1 (docs/implementation/33_R1_ROASTSESSION_TAXONOMIA_SENSORIAL.md §1).
 * `RoastSession` follows FermentationRun/DryingRun's structural principle —
 * an execution record hanging off the transformation graph via a dedicated
 * FK (`LotTransformation.roastSessionId`, matching `fermentationRunId`/
 * `dryingRunId` exactly), never a parallel entity with its own lot FKs.
 *
 * One deliberate departure from Fermentation/DryingRun's own shape: those
 * two are recorded in two calls (start now, end later) because a real
 * ferment/dry genuinely spans an unknown-at-start duration. A roast is
 * short and its own real capture point — every §4 verification scenario
 * describes — is "log the whole session once it's done," the same shape
 * HarvestEvent already uses for its own short, bounded activity.
 * `recordRoastSession` is therefore one call, not a start/end pair.
 *
 * The already-verified case (§1.1) — one green Lot roasted three ways,
 * recorded as one `split` LotTransformation with three outputs — is
 * deliberately NOT reused here, because each of the three roasts is a
 * genuinely separate execution (different roaster, equipment, profile),
 * which one shared transformation row can't express (one roastSessionId
 * per transformation). Recording each roast as its own `stage_change`
 * transformation, all sharing the same green Lot as input, produces the
 * identical queryable DAG — getLotLineage's recursive CTE follows
 * lot_transformation_input/output edges generically, indifferent to
 * whether three children came from one transformation row or three —
 * without touching recordTransformation or the split mechanism at all.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { LIST_LIMIT, truncate } from "../listLimit";
import { requireLotAccess, resolveLotVisibility, lotWhereFromVisibility, TraceabilityAccessError } from "./lots";
import { settleMassBalance } from "./balance";
import { recordAuditEvent } from "../audit";
import { listarEquipos } from "../equipos/equipos";
import { Prisma, type ProvenanceClass, type RoastPurpose } from "../../generated/prisma/client";

export class RoastSessionValidationError extends Error {}

/**
 * Un tueste sólo sigue —y un lote sólo elige como óptimo— una versión PUBLICADA de una receta que no sea Libre (Parte 2a,
 * §3.3 y §5.2; tarea 5, decisión del controlador del 2026-10-04). Hasta la 2a toda versión nacía publicada y bastaba con que
 * existiera y fuera de la organización del lote; desde la tarea 3 nace en borrador y desde la 10 hay recetas Libres (una por
 * proceso, escritas al abrirlo). Los selectores ya no las ofrecen (`listRecipeVersionsForLot`): esto es la puerta, para un
 * formulario fabricado. Se llama DESPUÉS de la comprobación de organización, para que una versión ajena se rechace por ser
 * ajena y no cuente su estado a quien no es de su organización.
 */
function exigeVersionPublicada(version: { status: string; recipe: { esLibre: boolean } }): void {
  if (version.status !== "approved" || version.recipe.esLibre) throw new RoastSessionValidationError("version_no_publicada");
}

/**
 * Los códigos de tueste que tienen frase propia en `messages/*.json`, como
 * `error_roast_<código>`. El resto sale envuelto en `error_roast`, que dice «No se pudo guardar el
 * tueste: <código>» — en español con el código en inglés dentro.
 *
 * Vive aquí, al lado de los `throw`, y no en la acción: `app/actions/traceability.ts` lleva
 * `"use server"` y de ahí sólo se pueden exportar funciones `async` (ver CLAUDE.md). Y al lado de
 * los `throw` se ve: quien añada un código ve esta lista en la misma pantalla.
 *
 * Son los seis del camino de la muestra (2026-10-04). Los otros siete siguen con el envoltorio.
 * `tests/traceability/frasesDeTueste.test.ts` exige que cada uno de éstos sea un código que de
 * verdad se lanza y que tenga su frase en los DOS idiomas.
 */
export const CODIGOS_DE_TUESTE_CON_FRASE = [
  "sample_must_be_green",
  "sample_charge_weight_required",
  "sample_mass_in_kg_required",
  "sample_mass_exceeded",
  "sample_source_lot_mismatch",
  "sample_source_requires_sample_purpose",
  "sample_roast_series_exhausted",
] as const;

export async function listGreenSamplesForRoast(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [{
    projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification,
  }]);
  const muestras = await prisma.sample.findMany({
    where: { sourceLotId: lotId, materialState: "GREEN", retiredAt: null },
    include: { roastSessions: { select: { chargeWeightKg: true } } },
    orderBy: { createdAt: "desc" },
  });
  return muestras.map((m) => ({
    id: m.id,
    label: m.sampleCode,
    disponibleKg: m.massUnitAtExtraction === "kg" && m.massAtExtraction != null
      ? Math.max(0, Number(m.massAtExtraction) - m.roastSessions.reduce((s, r) => s + Number(r.chargeWeightKg ?? 0), 0))
      : null,
  })).filter((m) => m.disponibleKg == null || m.disponibleKg > 0);
}

export interface RecordRoastSessionInput {
  lotId: string;
  /** Muestra verde ya apartada. Presente sólo para tuestes de muestra. */
  sourceSampleId?: string | null;
  // Para qué se tostó. Obligatorio y sin valor por defecto, como
  // `provenanceClass`: suponer `production` convertiría cada muestra en
  // producción en silencio, y es justo la distinción que este campo existe para
  // conservar — se tuestan muestras para encontrar un perfil, se cata, se elige,
  // y sólo entonces se tuesta producción con él.
  purpose: RoastPurpose;
  // El perfil seguido, si se siguió alguno. Anulable a propósito: los primeros
  // tuestes de muestra se hacen SIN perfil, que es como se encuentra uno.
  recipeVersionId?: string | null;
  outputLotCode?: string;
  roastLevel?: string | null;
  equipmentNote?: string | null;
  equipmentId?: string | null;
  roasterPersonId?: string | null;
  chargeWeightKg?: number | null;
  dischargeWeightKg?: number | null;
  startedAt: Date;
  endedAt?: Date | null;
  firstCrackAt?: Date | null;
  secondCrackAt?: Date | null;
  notes?: string | null;
  // T9.5/ADR-038 pattern: required, no default. §3's own example — a
  // profile read straight off the roaster's software is not the same
  // reliability as one recalled that evening.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

export async function recordRoastSession(userAccountId: string, input: RecordRoastSessionInput) {
  const sourceLot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!sourceLot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);
  await exigirPersonaPermitida(userAccountId, input.roasterPersonId, [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId }]);

  const sourceSample = input.sourceSampleId
    ? await prisma.sample.findUnique({ where: { id: input.sourceSampleId } })
    : null;
  if (input.sourceSampleId && !sourceSample) throw new RoastSessionValidationError("sample_not_found");
  if (sourceSample) {
    if (input.purpose !== "sample") throw new RoastSessionValidationError("sample_source_requires_sample_purpose");
    if (sourceSample.sourceLotId !== sourceLot.id) throw new RoastSessionValidationError("sample_source_lot_mismatch");
    if (sourceSample.materialState !== "GREEN") throw new RoastSessionValidationError("sample_must_be_green");
    if (input.chargeWeightKg == null) throw new RoastSessionValidationError("sample_charge_weight_required");
    if (sourceSample.massUnitAtExtraction !== "kg" || sourceSample.massAtExtraction == null) {
      throw new RoastSessionValidationError("sample_mass_in_kg_required");
    }

  }
  if (input.equipmentId) {
    const equipos = await listarEquipos(userAccountId);
    if (!equipos.some((equipo) => equipo.id === input.equipmentId && equipo.lifecycleStatus === "active")) {
      throw new RoastSessionValidationError("equipment_not_available");
    }
  }

  if (input.endedAt && input.endedAt < input.startedAt) {
    throw new RoastSessionValidationError("ended_before_started");
  }
  if (input.chargeWeightKg != null && input.chargeWeightKg <= 0) {
    throw new RoastSessionValidationError("charge_weight_must_be_positive");
  }
  if (
    input.chargeWeightKg != null &&
    input.dischargeWeightKg != null &&
    input.dischargeWeightKg > input.chargeWeightKg
  ) {
    throw new RoastSessionValidationError("discharge_weight_exceeds_charge_weight");
  }

  // Un perfil que no existe, o que pertenece a otra organización, produciría un
  // tueste que dice seguir algo que nadie puede leer. Se comprueba aquí y no se
  // deja a la clave foránea: un error de restricción no dice cuál era el
  // problema, y esto lo elige una persona en un desplegable.
  if (input.recipeVersionId) {
    const version = await prisma.processRecipeVersion.findUnique({
      where: { id: input.recipeVersionId },
      include: { recipe: true },
    });
    if (!version) throw new RoastSessionValidationError("recipe_version_not_found");
    if (version.recipe.organizationId != null && version.recipe.organizationId !== sourceLot.organizationId) {
      throw new RoastSessionValidationError("recipe_belongs_to_another_organization");
    }
    exigeVersionPublicada(version);
  }

  const provenanceClass = input.provenanceClass;
  const occurredAt = input.endedAt ?? input.startedAt;

  const result = await prisma.$transaction(async (tx) => {
    let outputLotCode = input.outputLotCode;
    if (input.purpose === "sample") {
      // One series per origin lot, shared by all its extracted samples.
      // Hold the parent before the sample lock to keep lock ordering stable.
      const [lockedLot] = await tx.$queryRaw<{ lotCode: string }[]>`
        SELECT lot_code AS "lotCode" FROM traceability.lot WHERE id = ${sourceLot.id}::uuid FOR UPDATE`;
      if (!lockedLot) throw new TraceabilityAccessError("lot_not_found");
      const prefix = `${lockedLot.lotCode}-T`;
      const occupied = await tx.lot.findMany({
        where: { organizationId: sourceLot.organizationId, lotCode: { startsWith: prefix } },
        select: { lotCode: true },
      });
      const historical = await tx.lot.findMany({
        where: { transformationOutputs: { some: { transformation: {
          roastSession: { purpose: "sample" }, inputs: { some: { lotId: sourceLot.id } },
        } } } },
        select: { lotCode: true },
      });
      const exactNumbers = occupied.map((lot) => lot.lotCode.slice(prefix.length))
        .filter((suffix) => /^[0-9]{2}$/.test(suffix)).map(Number);
      const historicalNumbers = historical.map((lot) => /-T([0-9]{2})$/.exec(lot.lotCode)?.[1])
        .filter((suffix): suffix is string => suffix != null).map(Number);
      const numbers = [...exactNumbers, ...historicalNumbers];
      const next = Math.max(0, ...numbers) + 1;
      if (next > 99) throw new RoastSessionValidationError("sample_roast_series_exhausted");
      outputLotCode = `${prefix}${String(next).padStart(2, "0")}`;
    }
    if (!outputLotCode?.trim()) throw new RoastSessionValidationError("output_lot_code_required");
    if (sourceSample) {
      // Serialize charges against this physical sample. A transaction alone
      // does not prevent concurrent readers from observing the same balance.
      await tx.$queryRaw`SELECT id FROM core.sample WHERE id = ${sourceSample.id}::uuid FOR UPDATE`;
      const usado = await tx.roastSession.aggregate({
        where: { sourceSampleId: sourceSample.id },
        _sum: { chargeWeightKg: true },
      });
      if (new Prisma.Decimal(usado._sum.chargeWeightKg ?? 0)
        .plus(input.chargeWeightKg!)
        .greaterThan(sourceSample.massAtExtraction!)) {
        throw new RoastSessionValidationError("sample_mass_exceeded");
      }
    }
    const roastSession = await tx.roastSession.create({
      data: {
        roastLevel: input.roastLevel ?? null,
        equipmentNote: input.equipmentNote ?? null,
        roasterPersonId: input.roasterPersonId ?? null,
        chargeWeightKg: input.chargeWeightKg ?? null,
        dischargeWeightKg: input.dischargeWeightKg ?? null,
        startedAt: input.startedAt,
        endedAt: input.endedAt ?? null,
        firstCrackAt: input.firstCrackAt ?? null,
        secondCrackAt: input.secondCrackAt ?? null,
        notes: input.notes ?? null,
        purpose: input.purpose,
        sourceSampleId: sourceSample?.id ?? null,
        recipeVersionId: input.recipeVersionId ?? null,
        equipmentId: input.equipmentId ?? null,
        createdBy: userAccountId,
      },
    });

    const transformation = await tx.lotTransformation.create({
      data: {
        transformationType: "stage_change",
        occurredAt,
        operatorPersonId: input.roasterPersonId ?? null,
        notes: input.notes ?? null,
        createdBy: userAccountId,
        roastSessionId: roastSession.id,
        provenanceClass,
        sourceReference: input.sourceReference ?? null,
        inputs: {
          create: [
            {
              lotId: input.lotId,
              // La extracción ya descontó la muestra del lote. Esta arista
              // conserva genealogía, pero no vuelve a mover inventario.
              quantity: sourceSample ? null : input.chargeWeightKg ?? null,
              unit: sourceSample ? null : input.chargeWeightKg != null ? "kg" : null,
            },
          ],
        },
      },
    });

    const outputLot = await tx.lot.create({
      data: {
        lotCode: outputLotCode,
        lotType: "roast",
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
        quantity: input.dischargeWeightKg ?? null,
        unit: input.dischargeWeightKg != null ? "kg" : null,
      },
    });

    // Same fix as T1's recordTransformation/T6's endFermentationRun: seed
    // the output lot's own quantity ledger so computeCurrentQuantity
    // reports correctly for it from creation.
    if (input.dischargeWeightKg != null) {
      await tx.quantityEvent.create({
        data: {
          lotId: outputLot.id,
          eventType: "process_output",
          quantity: input.dischargeWeightKg,
          unit: "kg",
          occurredAt,
          transformationId: transformation.id,
          createdBy: userAccountId,
          provenanceClass,
          sourceReference: input.sourceReference ?? null,
        },
      });
    }

    // P0 — decrement the green lot by what was actually charged. A roast
    // always has an output, so this always settles.
    const reconciliation = sourceSample ? null : await settleMassBalance(tx, {
      transformationId: transformation.id,
      transformationType: "stage_change",
      organizationId: sourceLot.organizationId,
      inputs: [
        {
          lotId: input.lotId,
          quantity: input.chargeWeightKg ?? null,
          unit: input.chargeWeightKg != null ? "kg" : null,
        },
      ],
      outputs: [
        {
          quantity: input.dischargeWeightKg ?? null,
          unit: input.dischargeWeightKg != null ? "kg" : null,
        },
      ],
      occurredAt,
      provenanceClass,
      sourceReference: input.sourceReference ?? null,
      createdBy: userAccountId,
    });

    // C1 §3 pattern: an evidentiary write — the earlier gap where T6/T7's
    // own start/end functions were never audited is not repeated here.
    //
    // Dentro de la transacción y con `tx` desde el 2026-09-06: una escritura
    // confirmada no puede quedarse sin su AuditEvent. Ver la cabecera de
    // `lib/audit.ts`. `settleMassBalance` recibe el mismo `tx`, así que no hay
    // transacción anidada — Prisma no las admite.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "roast_session.create",
        entityType: "roast_session",
        entityId: roastSession.id,
        after: roastSession,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { roastSession, transformation, outputLot, reconciliation };
  });

  return result;
}

export interface RoastSessionFilter {
  roastLevel?: string | null;
  roasterPersonId?: string | null;
}

/**
 * §4.1/§4.2's own requirement: queryable by profile and by roaster, not
 * just by lot code. Visibility resolves through each session's own source
 * lot (via its transformation's input), the same mechanism getLotList
 * already uses — a RoastSession carries no project/location of its own.
 */
type RoastSessionListRow = Prisma.RoastSessionGetPayload<{
  include: {
    roaster: true;
    transformations: { include: { inputs: { include: { lot: true } }; outputs: { include: { lot: true } } } };
  };
}>;

export async function listRoastSessions(
  userAccountId: string,
  filter: RoastSessionFilter = {},
  // Overridable so the cap's interaction with visibility is testable at all:
  // demonstrating "the limit was spent on rows the caller cannot see" needs
  // either LIST_LIMIT+1 fixtures or a smaller limit, and the second is the one
  // that leaves a fast test behind (ADR-087).
  limit: number = LIST_LIMIT,
) {
  const visibility = await resolveLotVisibility(userAccountId, "view");
  if (visibility.mode === "none") return truncate<RoastSessionListRow>([], limit);

  const lotWhere = lotWhereFromVisibility(visibility);
  if (lotWhere === null) return truncate<RoastSessionListRow>([], limit);

  const rows = await prisma.roastSession.findMany({
    where: {
      ...(filter.roastLevel ? { roastLevel: filter.roastLevel } : {}),
      ...(filter.roasterPersonId ? { roasterPersonId: filter.roasterPersonId } : {}),
      // Visibility belongs in the query, not in a filter over the results —
      // ADR-087. This used to take the newest 200 rows platform-wide and then
      // drop the ones the caller could not see, so the cap was spent on other
      // people's sessions: a roaster scoped to one project could be shown
      // almost nothing while hundreds of their own rows existed just past the
      // limit. That is not a cap, it is a wrong answer, and it is what let a
      // test lose its own three rows behind 200 leaked ones (ADR-086).
      ...(visibility.mode === "all"
        ? {}
        : { transformations: { some: { inputs: { some: { lot: lotWhere } } } } }),
    },
    include: {
      roaster: true,
      transformations: {
        include: {
          inputs: { include: { lot: true } },
          outputs: { include: { lot: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: limit + 1,
  });

  return truncate(rows, limit);
}

export async function getRoastSessionDetail(userAccountId: string, roastSessionId: string) {
  const session = await prisma.roastSession.findUnique({
    where: { id: roastSessionId },
    include: {
      roaster: true,
      equipment: { select: { name: true } },
      measurements: { orderBy: { occurredAt: "asc" } },
      transformations: {
        include: {
          inputs: { include: { lot: true } },
          outputs: { include: { lot: true } },
        },
      },
    },
  });
  if (!session) throw new TraceabilityAccessError("roast_session_not_found");

  const sourceLot = session.transformations[0]?.inputs[0]?.lot;
  if (!sourceLot) throw new TraceabilityAccessError("roast_session_not_found");
  await requireLotAccess(userAccountId, "view", [{ projectId: sourceLot.projectId, locationId: sourceLot.locationId, classification: sourceLot.classification }]);

  return session;
}

/**
 * Marcar un perfil como **el óptimo para este lote**.
 *
 * Decisión de Daniel (2026-09-06): «óptimo» vive en la relación perfil↔lote y no
 * en el perfil. Un perfil puede ser el bueno para un café y no para otro; una
 * bandera en el perfil sólo admitiría un óptimo global, y el día que un café
 * pidiera otro no habría dónde ponerlo.
 *
 * Reemplaza el anterior en vez de acumular: hay UN óptimo vigente por lote, y la
 * historia de quién eligió qué y cuándo queda en el registro de auditoría, que
 * es donde ya vive el resto del «quién cambió qué» en este proyecto.
 */
export async function elegirPerfilDeTueste(
  userAccountId: string,
  input: { lotId: string; recipeVersionId: string; notes?: string | null },
) {
  const lot = await prisma.lot.findUnique({ where: { id: input.lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [
    { projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification },
  ]);

  const version = await prisma.processRecipeVersion.findUnique({
    where: { id: input.recipeVersionId },
    include: { recipe: true },
  });
  if (!version) throw new RoastSessionValidationError("recipe_version_not_found");
  // Misma regla que al registrar un tueste: una receta de otra organización no
  // es de este lote. Sin esto, elegir un perfil sería una forma de nombrar algo
  // ajeno desde el propio lote.
  if (version.recipe.organizationId != null && version.recipe.organizationId !== lot.organizationId) {
    throw new RoastSessionValidationError("recipe_belongs_to_another_organization");
  }
  exigeVersionPublicada(version);

  const anterior = await prisma.lotRoastProfile.findUnique({ where: { lotId: input.lotId } });

  const elegido = await prisma.$transaction(async (tx) => {
    const elegido = await tx.lotRoastProfile.upsert({
      where: { lotId: input.lotId },
      create: {
        lotId: input.lotId,
        recipeVersionId: input.recipeVersionId,
        notes: input.notes ?? null,
        chosenBy: userAccountId,
      },
      update: {
        recipeVersionId: input.recipeVersionId,
        notes: input.notes ?? null,
        chosenBy: userAccountId,
        chosenAt: new Date(),
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: anterior ? "lot_roast_profile.replace" : "lot_roast_profile.choose",
        entityType: "lot_roast_profile",
        entityId: elegido.id,
        // El `before` es lo que hace legible el cambio: sin él, reemplazar un perfil
        // por otro se lee igual que elegir el primero.
        before: anterior ?? undefined,
        after: elegido,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return elegido;
  });

  return elegido;
}

/** El perfil vigente de un lote, o `null` si nadie ha elegido todavía. */
export async function getPerfilDeTuesteElegido(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new TraceabilityAccessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [
    { projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification },
  ]);

  return prisma.lotRoastProfile.findUnique({
    where: { lotId },
    // Parte 2a, tarea 9a (§3.2, adjudicación I5): las metas de la VERSIÓN son las que no cuelgan de ningún paso; las de cada paso son de su
    // paso y no del perfil. Hoy ninguna pantalla lee estas metas (la ficha pinta el nombre, la versión y las notas): el filtro es el
    // contrato de esta función, para que el día que alguien las pinte no enseñe como del perfil las de un paso.
    include: {
      recipeVersion: {
        include: { recipe: true, targets: { where: { recipeStepId: null }, orderBy: { displayOrder: "asc" } } },
      },
    },
  });
}
