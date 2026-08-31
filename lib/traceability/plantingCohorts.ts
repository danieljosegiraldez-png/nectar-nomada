/**
 * P1 (docs/implementation/42_P1_LAND_FOUNDATION.md §1, §5). The standing
 * population in a block, and multi-block harvest contributions.
 *
 * RBAC reuses `location:manage_attributes` via
 * `requireLocationAttributeAccess` (locations.ts) rather than introducing a
 * `planting_cohort:*` pair. A cohort describes what stands on a Location —
 * the same authority as editing that Location's altitude or soil — and
 * ADR-091 makes a permission with nowhere to be used a build failure, so
 * inventing one for symmetry would be a regression, not tidiness.
 *
 * That is a deliberate divergence from Specimen (F1), which *did* get its own
 * permission: a Specimen is an individually tracked object with its own
 * lifecycle and observations, whereas a cohort is an aggregate description of
 * the block itself.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import type {
  DataQuality,
  HarvestWindowPrecision,
  PlantingCohortStatus,
  Prisma,
  ProvenanceClass,
} from "../../generated/prisma/client";

export class PlantingCohortValidationError extends Error {}

export interface CreatePlantingCohortInput {
  locationId: string;
  /** A `VariableCatalogValue` from the `cultivar` catalog. Null is legitimate. */
  cultivarValueId?: string | null;
  plantedAt?: Date | null;
  plantedPrecision?: HarvestWindowPrecision | null;
  plantCount?: number | null;
  densityPerHectare?: number | null;
  spacingMeters?: number | null;
  notes?: string | null;
  // ADR-038 — required, no default. A cohort transcribed from a planting
  // record is an original_record; one reconstructed from memory years later
  // is not, and pretending otherwise is the failure this column exists for.
  provenanceClass: ProvenanceClass;
  dataQuality?: DataQuality | null;
}

/**
 * Resolves a cultivar catalog value, following one alias hop to its canonical
 * row — "Catuai" is stored as an alias of "Catuaí" and a cohort should end up
 * pointing at the canonical row, or grouping by cultivar silently splits the
 * same plant across spellings.
 *
 * One hop only, matching `resolveCatalogValue`'s own contract: an alias points
 * directly at a canonical row and never chains through another alias.
 */
async function resolveCultivarValueId(cultivarValueId: string): Promise<string> {
  const value = await prisma.variableCatalogValue.findUnique({
    where: { id: cultivarValueId },
    include: { catalog: { select: { key: true } } },
  });
  if (!value) throw new PlantingCohortValidationError("cultivar_value_not_found");
  if (value.catalog.key !== "cultivar") {
    throw new PlantingCohortValidationError("cultivar_value_wrong_catalog");
  }
  return value.aliasOfId ?? value.id;
}

/**
 * `impliesUnknownIdentity` values require a `dataQuality`, matching the rule
 * `lib/research/treatments.ts` already applies to "Spontaneous Wild": saying
 * the cultivar is unknown is a real claim about the state of knowledge, and it
 * should carry how confident that claim is.
 */
async function requireDataQualityForUnknownCultivar(
  resolvedCultivarValueId: string | null,
  dataQuality: DataQuality | null | undefined,
) {
  if (!resolvedCultivarValueId || dataQuality) return;
  const value = await prisma.variableCatalogValue.findUnique({
    where: { id: resolvedCultivarValueId },
    select: { impliesUnknownIdentity: true },
  });
  if (value?.impliesUnknownIdentity) {
    throw new PlantingCohortValidationError("data_quality_required_for_unknown_cultivar");
  }
}

export async function createPlantingCohort(userAccountId: string, input: CreatePlantingCohortInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);

  // A planted date with no precision is a date claiming more than it knows.
  if (input.plantedAt && !input.plantedPrecision) {
    throw new PlantingCohortValidationError("planted_precision_required");
  }
  if (input.plantCount != null && input.plantCount < 0) {
    throw new PlantingCohortValidationError("negative_plant_count");
  }

  const resolvedCultivarValueId = input.cultivarValueId
    ? await resolveCultivarValueId(input.cultivarValueId)
    : null;
  await requireDataQualityForUnknownCultivar(resolvedCultivarValueId, input.dataQuality);

  const cohort = await prisma.plantingCohort.create({
    data: {
      locationId: input.locationId,
      cultivarValueId: resolvedCultivarValueId,
      plantedAt: input.plantedAt ?? null,
      plantedPrecision: input.plantedPrecision ?? null,
      plantCount: input.plantCount ?? null,
      densityPerHectare: input.densityPerHectare ?? null,
      spacingMeters: input.spacingMeters ?? null,
      notes: input.notes ?? null,
      provenanceClass: input.provenanceClass,
      dataQuality: input.dataQuality ?? null,
      createdBy: userAccountId,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "planting_cohort.create",
    entityType: "planting_cohort",
    entityId: cohort.id,
    after: cohort,
    sourceInterface: "traceability.service",
  });

  return cohort;
}

export interface RenovateCohortInput {
  cohortId: string;
  removedAt: Date;
  /** The population replacing it. Omit when the block is simply cleared. */
  replacement?: Omit<CreatePlantingCohortInput, "locationId"> | null;
  reason?: string | null;
}

/**
 * Renovation is a **new cohort**, never an edit to the old one.
 *
 * The outgoing cohort is closed with a `removedAt` — a one-time transition
 * recording an actual event, the same shape as `StorageAssignment.endedAt` and
 * `FermentationRun.endedAt` — and its cultivar, planting date and plant count
 * stay exactly as recorded. What stood on that block remains true, which is
 * the whole point: a block stumped in 2027 was still Caturra in 2019, and a
 * yield figure from 2019 is only interpretable against the population that
 * actually produced it.
 */
export async function renovatePlantingCohort(userAccountId: string, input: RenovateCohortInput) {
  const existing = await prisma.plantingCohort.findUnique({ where: { id: input.cohortId } });
  if (!existing) throw new PlantingCohortValidationError("cohort_not_found");
  if (existing.status !== "active") throw new PlantingCohortValidationError("cohort_not_active");

  await requireLocationAttributeAccess(userAccountId, existing.locationId);

  const closed = await prisma.plantingCohort.update({
    where: { id: input.cohortId },
    data: {
      status: input.replacement ? "renovated" : "removed",
      removedAt: input.removedAt,
      notes: input.reason ? [existing.notes, input.reason].filter(Boolean).join(" — ") : existing.notes,
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "planting_cohort.renovate",
    entityType: "planting_cohort",
    entityId: closed.id,
    before: existing,
    after: closed,
    reason: input.reason ?? undefined,
    sourceInterface: "traceability.service",
  });

  const replacement = input.replacement
    ? await createPlantingCohort(userAccountId, { ...input.replacement, locationId: existing.locationId })
    : null;

  return { closed, replacement };
}

/** Every cohort on a plot, newest planting first. Includes closed ones. */
export async function listPlantingCohorts(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.plantingCohort.findMany({
    where: { locationId },
    include: { cultivarValue: { select: { id: true, value: true, definition: true } } },
    orderBy: [{ status: "asc" }, { plantedAt: "desc" }],
  });
}

export interface RecordHarvestSourcesInput {
  harvestEventId: string;
  sources: ReadonlyArray<{
    locationId: string;
    plantingCohortId?: string | null;
    cherryWeightKg?: number | null;
    notes?: string | null;
  }>;
}

export interface HarvestSourceReconciliation {
  declaredTotalKg: number | null;
  sourceTotalKg: number | null;
  /** declared − sources. Null when either side is unknown. Reported, never enforced. */
  differenceKg: number | null;
}

/**
 * Records which blocks contributed to a harvest.
 *
 * The sum of source weights is **reported against** `HarvestEvent.cherryWeightKg`,
 * not enforced. This is intake, not a conserving transformation: nobody weighs
 * each block's contribution on a calibrated scale before tipping it into the
 * same hopper. ADR-094 Decision 4 is the precedent, and the reasoning is
 * identical — an alarm that fires on ordinary practice is an alarm someone
 * switches off.
 */
export async function recordHarvestSources(
  userAccountId: string,
  input: RecordHarvestSourcesInput,
): Promise<HarvestSourceReconciliation> {
  if (input.sources.length === 0) throw new PlantingCohortValidationError("sources_required");

  const harvestEvent = await prisma.harvestEvent.findUnique({ where: { id: input.harvestEventId } });
  if (!harvestEvent) throw new LocationAccessError("harvest_event_not_found");

  // Authority comes from the harvest's own primary plot, plus every plot being
  // named as a contributor — a caller must be able to manage all of them, not
  // just the one the harvest already points at.
  await requireLocationAttributeAccess(userAccountId, harvestEvent.locationId);
  for (const source of new Set(input.sources.map((s) => s.locationId))) {
    await requireLocationAttributeAccess(userAccountId, source);
  }

  // Una cohorte nombrada junto a un lote que no es el suyo produciría una fila
  // que afirma que ese bloque aportó cereza cuando sus árboles están en otro
  // sitio — y de ahí sale el rendimiento por bloque. Impedirlo sólo en el
  // formulario no sirve: la frontera es el servicio (SECURITY.md §2), y esta
  // pareja llega como dos campos independientes que nada obligaba a casar.
  const cohortIds = [...new Set(input.sources.map((s) => s.plantingCohortId).filter((id): id is string => !!id))];
  if (cohortIds.length > 0) {
    const cohorts = await prisma.plantingCohort.findMany({
      where: { id: { in: cohortIds } },
      select: { id: true, locationId: true },
    });
    const locationByCohort = new Map(cohorts.map((c) => [c.id, c.locationId]));
    for (const source of input.sources) {
      if (!source.plantingCohortId) continue;
      const cohortLocation = locationByCohort.get(source.plantingCohortId);
      // Una cohorte inexistente se rechaza en vez de guardarse como referencia
      // rota: la FK lo atraparía igual, pero con un error de base de datos en
      // vez de uno que diga qué pasó.
      if (cohortLocation === undefined) {
        throw new PlantingCohortValidationError("planting_cohort_not_found");
      }
      if (cohortLocation !== source.locationId) {
        throw new PlantingCohortValidationError("cohort_not_in_location");
      }
    }
  }

  // Un aporte negativo no es un aporte: descuadraría la reconciliación hacia
  // arriba y haría que el total de fuentes pareciera menor que la suma real.
  for (const source of input.sources) {
    if (source.cherryWeightKg != null && source.cherryWeightKg < 0) {
      throw new PlantingCohortValidationError("negative_cherry_weight");
    }
  }

  const created = await prisma.$transaction(async (tx) =>
    Promise.all(
      input.sources.map((source) =>
        tx.harvestEventSource.create({
          data: {
            harvestEventId: input.harvestEventId,
            locationId: source.locationId,
            plantingCohortId: source.plantingCohortId ?? null,
            cherryWeightKg: source.cherryWeightKg ?? null,
            notes: source.notes ?? null,
            createdBy: userAccountId,
          },
        }),
      ),
    ),
  );

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "harvest_event.record_sources",
    entityType: "harvest_event",
    entityId: input.harvestEventId,
    after: { sourceIds: created.map((c) => c.id) },
    sourceInterface: "traceability.service",
  });

  const allSources = await prisma.harvestEventSource.findMany({
    where: { harvestEventId: input.harvestEventId },
    select: { cherryWeightKg: true },
  });

  const declaredTotalKg = harvestEvent.cherryWeightKg != null ? Number(harvestEvent.cherryWeightKg) : null;
  // Unknown, not zero: if no contribution was weighed there is nothing to
  // compare, and reporting 0 would be a claim (ADR-080's distinction).
  const weighed = allSources.filter((s) => s.cherryWeightKg != null);
  const sourceTotalKg = weighed.length > 0 ? weighed.reduce((sum, s) => sum + Number(s.cherryWeightKg), 0) : null;

  return {
    declaredTotalKg,
    sourceTotalKg,
    differenceKg:
      declaredTotalKg != null && sourceTotalKg != null ? Number((declaredTotalKg - sourceTotalKg).toFixed(3)) : null,
  };
}

/**
 * Plants per hectare for a block, **computed and never stored.**
 *
 * `PlantingCohort.densityPerHectare` exists as a column and stays null here on
 * purpose. Density is a quotient of two numbers that are still moving — the
 * owner has said the per-block counts will be revised, and no block has an
 * area yet — and a stored quotient of moving inputs is a derived value that
 * goes stale in silence every time either input is corrected. Storing it would
 * be the same failure the platform already avoids by keeping raw measurements
 * and calculated values apart (CLAUDE.md §49).
 *
 * Returns a reason rather than a number when it cannot divide, because the
 * three ways this fails are different facts and a page should say which one it
 * hit. `null` collapses them into "no data", and zero would be a claim
 * (ADR-080: never recorded and recorded-as-zero must stay distinguishable).
 */
export type PlotDensity =
  | { status: "ok"; plantsPerHectare: number; totalPlants: number; hectares: number }
  | { status: "sin_area" }
  | { status: "area_no_positiva"; hectares: number }
  | { status: "sin_cohortes" }
  | { status: "conteo_incompleto"; cohortesSinConteo: number; cohortesTotales: number };

export function computePlotDensity(
  cohorts: ReadonlyArray<{ plantCount: number | null; status: PlantingCohortStatus }>,
  areaHectares: Prisma.Decimal | number | null,
): PlotDensity {
  // A removed block's trees are not standing in the field, so counting them
  // would overstate what is planted. `renovatePlantingCohort` is what puts a
  // cohort into a non-active status, and this is the read side of that.
  const vivas = cohorts.filter((c) => c.status === "active");
  if (vivas.length === 0) return { status: "sin_cohortes" };

  const sinConteo = vivas.filter((c) => c.plantCount == null).length;
  if (sinConteo > 0) {
    return { status: "conteo_incompleto", cohortesSinConteo: sinConteo, cohortesTotales: vivas.length };
  }

  if (areaHectares == null) return { status: "sin_area" };
  const hectares = Number(areaHectares);
  // Guards the division and a nonsense area alike. An area recorded as 0 is a
  // bad record, not an infinite density.
  if (!Number.isFinite(hectares) || hectares <= 0) return { status: "area_no_positiva", hectares };

  const totalPlants = vivas.reduce((sum, c) => sum + (c.plantCount ?? 0), 0);
  return {
    status: "ok",
    totalPlants,
    hectares,
    plantsPerHectare: Number((totalPlants / hectares).toFixed(1)),
  };
}

/**
 * Everything the plot page shows, behind **one** gate.
 *
 * Deliberately not assembled in the page from two different reads:
 * `getManageableContext` resolves *lot* visibility, while a cohort is gated by
 * `location:manage_attributes`. Mixing them would mean a page whose title bar
 * answers to one authority and whose contents answer to another — and the one
 * that governs the data here is the location gate, so it is the only one used.
 *
 * Lives here rather than in `locations.ts` because that module is imported by
 * this one; the reverse direction would close a cycle.
 */
export async function getPlotDetail(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: {
      id: true,
      name: true,
      locationType: true,
      areaHectares: true,
      plantSpacingMeters: true,
      altitudeMinM: true,
      altitudeMaxM: true,
      sunExposure: true,
      shadePercentage: true,
      slopeDescription: true,
      soilType: true,
      description: true,
      organization: { select: { name: true } },
      parentLocation: { select: { id: true, name: true, organization: { select: { name: true } } } },
    },
  });
  // `requireLocationAttributeAccess` already refuses a missing id, so reaching
  // here with nothing means the row vanished between the two queries.
  if (!location) throw new LocationAccessError("location_not_found");

  const cohorts = await prisma.plantingCohort.findMany({
    where: { locationId },
    include: { cultivarValue: { select: { id: true, value: true } } },
    orderBy: [{ status: "asc" }, { plantedAt: "desc" }],
  });

  // Lo que este bloque aportó a cosechas, para el rendimiento. Se lee por
  // `HarvestEventSource` y NO por `HarvestEvent.locationId`: el segundo es el
  // lote principal de la cosecha, y una cosecha de varios bloques sólo nombra
  // uno ahí. Contar por el principal atribuiría todo el peso a un bloque y cero
  // a los demás.
  const harvestContributions = await prisma.harvestEventSource.findMany({
    where: { locationId },
    select: { cherryWeightKg: true, harvestEvent: { select: { harvestedAt: true } } },
  });

  // Las variedades que el formulario puede ofrecer. Del catálogo, no de una
  // lista escrita a mano: el vocabulario crece sembrando una fila, no editando
  // código, y los alias («Catuai» sin tilde) resuelven al valor canónico.
  const cultivarOptions = await prisma.variableCatalogValue.findMany({
    where: { catalog: { name: "Cultivar" }, aliasOfId: null },
    select: { id: true, value: true, impliesUnknownIdentity: true },
    orderBy: { value: "asc" },
  });

  return {
    location,
    cohorts,
    cultivarOptions,
    density: computePlotDensity(cohorts, location.areaHectares),
    yield: computePlotYield(
      harvestContributions.map((c) => ({
        harvestedAt: c.harvestEvent.harvestedAt,
        cherryWeightKg: c.cherryWeightKg,
      })),
      location.areaHectares,
    ),
    // The farm's own name is usually on the parent site, not the plot: eleven
    // of Finca Rosina's locations carry a null `organizationId` and inherit it
    // through the hierarchy. Reading only the plot's own column would show a
    // farm block with no farm.
    organizationName: location.organization?.name ?? location.parentLocation?.organization?.name ?? null,
  };
}

/**
 * Todo lo que necesita la pantalla de «¿de qué bloques salió esta cosecha?»,
 * detrás de la misma compuerta que la escritura.
 *
 * Devuelve los aportes ya guardados —para que se vea que el formulario **suma**
 * y no reemplaza— y los lotes candidatos con sus cohortes vivas. Las cohortes
 * van agrupadas por lote a propósito: la pareja lote/cohorte tiene que casar, y
 * darlas en una lista plana invitaría a cruzarlas.
 */
export async function getHarvestSourceContext(userAccountId: string, harvestEventId: string) {
  const harvestEvent = await prisma.harvestEvent.findUnique({
    where: { id: harvestEventId },
    select: { id: true, locationId: true, cherryWeightKg: true },
  });
  if (!harvestEvent) throw new LocationAccessError("harvest_event_not_found");
  await requireLocationAttributeAccess(userAccountId, harvestEvent.locationId);

  const existing = await prisma.harvestEventSource.findMany({
    where: { harvestEventId },
    select: {
      id: true,
      cherryWeightKg: true,
      notes: true,
      location: { select: { name: true } },
      plantingCohort: { select: { plantCount: true, cultivarValue: { select: { value: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const pesados = existing.filter((s) => s.cherryWeightKg != null);
  // Desconocido, no cero: si ningún aporte se pesó no hay nada que comparar, y
  // decir 0 sería una afirmación (ADR-080).
  const alreadyRecordedKg =
    pesados.length > 0 ? Number(pesados.reduce((sum, s) => sum + Number(s.cherryWeightKg), 0).toFixed(3)) : null;

  const todosLosPlots = await prisma.location.findMany({
    where: { locationType: "plot" },
    select: {
      id: true,
      name: true,
      plantingCohorts: {
        where: { status: "active" },
        select: { id: true, plantCount: true, cultivarValue: { select: { value: true } } },
      },
    },
    orderBy: { name: "asc" },
  });

  // Se ofrecen sólo los bloques que este usuario podría nombrar de verdad. La
  // escritura ya exige `manage_attributes` sobre cada uno, así que sin este
  // filtro el desplegable listaría fincas ajenas para luego rechazarlas: el
  // nombre de un bloque de otro productor ya es información, y una lista que
  // enseña lo que no se puede usar enseña de más y confunde.
  const permitidos = await Promise.all(
    todosLosPlots.map(async (plot) => {
      try {
        await requireLocationAttributeAccess(userAccountId, plot.id);
        return plot;
      } catch (error) {
        if (error instanceof LocationAccessError) return null;
        throw error;
      }
    }),
  );
  const plotLocations = permitidos.filter((plot): plot is (typeof todosLosPlots)[number] => plot !== null);

  return {
    harvestEventId: harvestEvent.id,
    declaredTotalKg: harvestEvent.cherryWeightKg != null ? Number(harvestEvent.cherryWeightKg) : null,
    alreadyRecordedKg,
    existing,
    plotLocations,
  };
}

export interface UpdatePlantingCohortInput {
  cohortId: string;
  cultivarValueId?: string | null;
  plantedAt?: Date | null;
  plantedPrecision?: HarvestWindowPrecision | null;
  plantCount?: number | null;
  dataQuality?: DataQuality | null;
  notes?: string | null;
  /** Obligatorio: sin él, el audit registra un cambio sin decir por qué. */
  reason: string;
}

/**
 * Corregir lo que dice una cohorte, sin afirmar que el bloque cambió.
 *
 * **No es `renovatePlantingCohort`.** Renovar declara que esos árboles salieron
 * del suelo y otros entraron; usarlo para arreglar un conteo mal apuntado
 * inventaría un arranque y una siembra que no ocurrieron. Y no es un supersede:
 * `PlantingCohort` no tiene `correctsId` mientras `Measurement` sí, y esa
 * asimetría del esquema es deliberada — el valor de una medición **fue
 * observado** y sigue siéndolo, mientras que el conteo de una cohorte es una
 * cifra que se escribió y puede haberse escrito mal. Es la regla de ADR-102: un
 * nombre se edita, un objetivo se supersede.
 *
 * El `reason` es obligatorio porque estas dos cosas se ven idénticas en la
 * columna y son hechos distintos: «conté mal» y «se murieron cuarenta matas».
 * El before/after va a `AuditEvent`, que es append-only y guarda las dos.
 *
 * Forma de `PATCH`: una clave ausente se deja intacta, un `null` explícito
 * borra. Un conteo que se vacía vuelve a «sin registrar», que no es cero.
 */
export async function updatePlantingCohort(userAccountId: string, input: UpdatePlantingCohortInput) {
  const existing = await prisma.plantingCohort.findUnique({ where: { id: input.cohortId } });
  if (!existing) throw new PlantingCohortValidationError("cohort_not_found");
  await requireLocationAttributeAccess(userAccountId, existing.locationId);

  if (!input.reason.trim()) throw new PlantingCohortValidationError("reason_required");
  if (input.plantCount != null && input.plantCount < 0) {
    throw new PlantingCohortValidationError("negative_plant_count");
  }

  const nextPlantedAt = input.plantedAt !== undefined ? input.plantedAt : existing.plantedAt;
  const nextPrecision =
    input.plantedPrecision !== undefined ? input.plantedPrecision : existing.plantedPrecision;
  // La misma regla que en la creación: una fecha sin precisión afirma más de lo
  // que sabe.
  if (nextPlantedAt && !nextPrecision) throw new PlantingCohortValidationError("planted_precision_required");

  const resolvedCultivarValueId =
    input.cultivarValueId !== undefined
      ? input.cultivarValueId
        ? await resolveCultivarValueId(input.cultivarValueId)
        : null
      : undefined;
  await requireDataQualityForUnknownCultivar(
    resolvedCultivarValueId !== undefined ? resolvedCultivarValueId : existing.cultivarValueId,
    input.dataQuality !== undefined ? input.dataQuality : existing.dataQuality,
  );

  const after = await prisma.plantingCohort.update({
    where: { id: input.cohortId },
    data: {
      ...(resolvedCultivarValueId !== undefined ? { cultivarValueId: resolvedCultivarValueId } : {}),
      ...(input.plantedAt !== undefined ? { plantedAt: input.plantedAt } : {}),
      ...(input.plantedPrecision !== undefined ? { plantedPrecision: input.plantedPrecision } : {}),
      ...(input.plantCount !== undefined ? { plantCount: input.plantCount } : {}),
      ...(input.dataQuality !== undefined ? { dataQuality: input.dataQuality } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });

  await recordAuditEvent({
    actorUserAccountId: userAccountId,
    operation: "planting_cohort.update",
    entityType: "planting_cohort",
    entityId: after.id,
    before: existing,
    after,
    reason: input.reason,
    sourceInterface: "traceability.service",
  });

  return after;
}

/**
 * Rendimiento de un bloque: kilos de cereza por hectárea, **por año
 * calendario de cosecha** (decisión del dueño, 2026-08-31).
 *
 * Es la cifra que hace comparables dos lotes y dos años, y la razón por la que
 * las hectáreas tienen fecha límite: sin área no hay rendimiento, sólo un peso
 * suelto.
 *
 * **Calculado al leer, nunca almacenado**, por lo mismo que la densidad: los
 * dos insumos se siguen corrigiendo —el área se acaba de poder capturar y los
 * aportes por bloque se registran después de la cosecha— y un cociente guardado
 * de entradas móviles envejece en silencio.
 *
 * **El total es un mínimo, no un total.** Un aporte sin pesar es normal: nadie
 * pesa cada bloque antes de volcarlo en la misma tolva. Contarlo como cero
 * subestimaría el rendimiento y lo haría parecer medido, así que el resultado
 * dice cuántos aportes quedaron sin pesar y quien lo lea decide si le sirve
 * (ADR-080: sin registrar y cero son hechos distintos).
 */
export interface PlotYearYield {
  year: number;
  /** Suma de los aportes **pesados** de ese año. */
  weighedKg: number;
  /** Aportes de ese año sin peso: el `weighedKg` los excluye. */
  unweighedContributions: number;
  /** Null cuando falta el área o no es positiva; el peso sigue siendo útil. */
  kgPerHectare: number | null;
}

export type PlotYield =
  | { status: "ok"; hectares: number | null; years: PlotYearYield[] }
  | { status: "sin_cosechas" };

export function computePlotYield(
  contributions: ReadonlyArray<{ harvestedAt: Date; cherryWeightKg: Prisma.Decimal | number | null }>,
  areaHectares: Prisma.Decimal | number | null,
): PlotYield {
  if (contributions.length === 0) return { status: "sin_cosechas" };

  const hectaresRaw = areaHectares == null ? null : Number(areaHectares);
  const hectares =
    hectaresRaw != null && Number.isFinite(hectaresRaw) && hectaresRaw > 0 ? hectaresRaw : null;

  const porAnio = new Map<number, { weighedKg: number; unweighed: number }>();
  for (const c of contributions) {
    // Año calendario en UTC, igual que el resto de las fechas del sistema.
    const year = c.harvestedAt.getUTCFullYear();
    const acc = porAnio.get(year) ?? { weighedKg: 0, unweighed: 0 };
    if (c.cherryWeightKg == null) acc.unweighed += 1;
    else acc.weighedKg += Number(c.cherryWeightKg);
    porAnio.set(year, acc);
  }

  const years = [...porAnio.entries()]
    .map(([year, acc]) => ({
      year,
      weighedKg: Number(acc.weighedKg.toFixed(3)),
      unweighedContributions: acc.unweighed,
      // Sin área no hay rendimiento, pero el peso del año sigue siendo un dato
      // que vale la pena enseñar — por eso esto es null y no se descarta el año.
      kgPerHectare: hectares != null ? Number((acc.weighedKg / hectares).toFixed(1)) : null,
    }))
    .sort((a, b) => b.year - a.year);

  return { status: "ok", hectares, years };
}
