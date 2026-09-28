/**
 * Target versus actual — ADR-098.
 *
 * The product owner's own framing, from BeerSmith: a recipe declares what a
 * run is aiming for, the run records what happened, and the value is in the
 * difference. "We target 3.8, we get 3.785."
 *
 * Until now the platform stored only actuals. 25 pH readings, 11 temperature,
 * 2 moisture — every one of them a number with nothing to compare it to. A
 * measurement on its own says what happened; it cannot say whether that was
 * what you wanted.
 *
 * Two rules this file exists to keep:
 *
 * **A target is not a measurement.** It is a declared intention, and CLAUDE.md
 * §3 requires the system to distinguish those. `cold_hold_target_temperature_
 * min` in units.ts does the opposite — it stores an intention as if it were an
 * observed fact. That predates this and is left alone here, but it is the
 * pattern this file deliberately does not follow.
 *
 * **The mean is derived, and never replaces its inputs.** CLAUDE.md §49
 * forbids combining raw measurement with calculated value; §28 requires a
 * derived metric to carry its method. So a comparison always returns the
 * individual readings alongside the mean, and the mean is computed on read
 * rather than stored. Three readings of 3.7/3.8/3.9 and three of 3.78/3.79/
 * 3.79 have the same mean and mean different things; keeping the readings is
 * what preserves that.
 */
import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";
import { requireLotAccess } from "./lots";
import { exigeEditarBeneficioEnOrganizacion } from "./locations";
import { recordAuditEvent } from "../audit";
import { boundsFor } from "./units";
import { compareNames } from "../naturalOrder";
import type { ProcessTargetMoment } from "../../generated/prisma/client";
import { puedeEditarBeneficioEnOrganizacion } from "./locations";

export class ProcessTargetError extends Error {}

export interface Reading {
  id: string;
  value: Prisma.Decimal;
  occurredAt: Date;
}

export interface TargetComparison {
  variable: string;
  moment: ProcessTargetMoment;
  unit: string;
  note: string | null;

  /** What the recipe asked for. Any of these may be null — see ProcessTarget. */
  target: { value: Prisma.Decimal | null; min: Prisma.Decimal | null; max: Prisma.Decimal | null };

  /**
   * What happened. `readings` is the raw record and is never omitted; `mean`
   * is derived from exactly those readings and nothing else.
   */
  actual: {
    readings: Reading[];
    mean: Prisma.Decimal | null;
    /** Named so a reader never has to guess how `mean` was arrived at (§28). */
    method: "mean_of_readings" | null;
  };

  /**
   * `mean − target`, or null when either side is unknown. Null is a real
   * answer: a target with no readings yet, or a reading with no target
   * declared, has no deviation — and reporting 0 would assert agreement that
   * nobody established.
   */
  deviation: Prisma.Decimal | null;

  /**
   * Whether the actual falls inside the declared range. Null when no range was
   * declared, which is not the same as "outside".
   */
  withinRange: boolean | null;

  /**
   * True when `initial` and `final` resolved to the same single reading —
   * one measurement cannot be both the original and the final value, and
   * saying so is better than quietly reporting a deviation of zero.
   */
  ambiguousSingleReading: boolean;
}

function mean(readings: Reading[]): Prisma.Decimal | null {
  if (readings.length === 0) return null;
  const total = readings.reduce((sum, r) => sum.add(r.value), new Prisma.Decimal(0));
  return total.dividedBy(readings.length);
}

/**
 * Which readings answer a target at a given moment.
 *
 * The rule is positional and stated rather than inferred: the earliest reading
 * of a variable is its initial value, the latest is its final, and `during`
 * takes them all. That is an operational definition, not a guess about intent
 * — but it does have one honest failure, which is why `ambiguousSingleReading`
 * exists: with a single reading, earliest and latest are the same row, and it
 * cannot truthfully be both an original and a final gravity.
 */
function readingsForMoment(all: Reading[], moment: ProcessTargetMoment): { readings: Reading[]; ambiguous: boolean } {
  if (all.length === 0) return { readings: [], ambiguous: false };
  const ordered = [...all].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  if (moment === "during") return { readings: ordered, ambiguous: false };

  const single = ordered.length === 1;
  if (moment === "initial") return { readings: [ordered[0]!], ambiguous: single };
  return { readings: [ordered[ordered.length - 1]!], ambiguous: single };
}

/**
 * Every target of the run's recipe version, set against what was measured.
 *
 * Returns an empty array when the run has no recipe — a run improvised without
 * one is a legitimate state (most existing runs are), and an empty comparison
 * is the honest rendering of "nothing was declared", not an error.
 */
export async function compareRunToTargets(
  userAccountId: string,
  fermentationRunId: string,
): Promise<TargetComparison[]> {
  const run = await prisma.fermentationRun.findUnique({
    where: { id: fermentationRunId },
    include: {
      processRecipeVersion: { include: { targets: { orderBy: { displayOrder: "asc" } } } },
      measurements: { select: { id: true, variable: true, value: true, occurredAt: true } },
      transformations: { include: { inputs: { include: { lot: true } } }, take: 1 },
    },
  });
  // A run that cannot be loaded is refused rather than treated as empty — the
  // same rule the classification gate states for a stale id (ADR-081).
  if (!run) throw new ProcessTargetError("run_not_found");

  // The run itself carries no classification; the lot it belongs to does, and
  // that is what decides who may read this (ADR-068).
  const lot = run.transformations[0]?.inputs[0]?.lot;
  if (!lot) throw new ProcessTargetError("run_has_no_lot");
  await requireLotAccess(userAccountId, "view", [lot]);

  if (!run.processRecipeVersion) return [];

  const byVariable = new Map<string, Reading[]>();
  for (const m of run.measurements) {
    const list = byVariable.get(m.variable) ?? [];
    list.push({ id: m.id, value: m.value, occurredAt: m.occurredAt });
    byVariable.set(m.variable, list);
  }

  return run.processRecipeVersion.targets.map((t) => {
    const { readings, ambiguous } = readingsForMoment(byVariable.get(t.variable) ?? [], t.moment);
    const actualMean = mean(readings);

    const deviation = actualMean !== null && t.targetValue !== null ? actualMean.sub(t.targetValue) : null;

    let withinRange: boolean | null = null;
    if (actualMean !== null && (t.minValue !== null || t.maxValue !== null)) {
      const aboveMin = t.minValue === null || actualMean.greaterThanOrEqualTo(t.minValue);
      const belowMax = t.maxValue === null || actualMean.lessThanOrEqualTo(t.maxValue);
      withinRange = aboveMin && belowMax;
    }

    return {
      variable: t.variable,
      moment: t.moment,
      unit: t.unit,
      note: t.note,
      target: { value: t.targetValue, min: t.minValue, max: t.maxValue },
      actual: { readings, mean: actualMean, method: actualMean === null ? null : "mean_of_readings" },
      deviation,
      withinRange,
      ambiguousSingleReading: ambiguous,
    };
  });
}

// ---------------------------------------------------------------------------
// Recipes — authoring and selection
// ---------------------------------------------------------------------------

/**
 * Recipe versions this account may attach to a run, newest version first.
 *
 * Gated on `lot:manage` at the lot's own scope rather than on a permission of
 * its own: choosing which process a batch is run against is an operational
 * decision about that batch, made by whoever may operate it. Inventing a
 * `recipe:*` permission would add a grant nobody holds and ADR-091 would fail
 * the build for it.
 */
export async function listRecipeVersionsForLot(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new ProcessTargetError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [lot]);

  const versions = await prisma.processRecipeVersion.findMany({
    // Only approved versions are offered. A draft is someone still deciding
    // what the targets should be, and a run operated against a moving target
    // is worse than a run with none.
    where: {
      status: "approved",
      // A recipe belonging to another organization is not this batch's to use.
      // Null organizationId means a shared recipe, available to everyone.
      recipe: { OR: [{ organizationId: lot.organizationId }, { organizationId: null }] },
    },
    include: { recipe: true, targets: { orderBy: { displayOrder: "asc" } } },
    orderBy: [{ recipe: { name: "asc" } }, { version: "desc" }],
  });

  // Only the newest version of each recipe is offered for a NEW run — ADR-102.
  //
  // Before versions could be created this returned everything approved, which
  // was the same thing because there was only ever one. The moment v2 exists,
  // returning all of them puts "Lavado v1", "Lavado v2" and "Lavado v3" in one
  // picker and asks the operator to know which is current. Older versions stay
  // attached to the runs that used them and stay readable there; they are just
  // not offered again.
  const newestByRecipe = new Map<string, (typeof versions)[number]>();
  for (const v of versions) {
    if (!newestByRecipe.has(v.recipeId)) newestByRecipe.set(v.recipeId, v);
  }
  return [...newestByRecipe.values()];
}

export interface CreateRecipeInput {
  name: string;
  description?: string | null;
  organizationId: string | null;
  targets: ReadonlyArray<{
    variable: string;
    moment: ProcessTargetMoment;
    unit: string;
    targetValue?: number | null;
    minValue?: number | null;
    maxValue?: number | null;
    note?: string | null;
    /** Cada cuántas horas toca medir. Sólo con `moment: "during"`. */
    everyHours?: number | null;
  }>;
  /** Cuánto debe durar la fase que esta receta describe, en horas. */
  expectedHours?: number | null;
}

/**
 * A recipe and its first version, created together.
 *
 * There is no such thing as a useful recipe with no version — a name with no
 * targets declares nothing — so the two are one operation rather than a
 * two-step flow that can be abandoned halfway.
 */
/**
 * Every rule a set of targets must satisfy, in one place — ADR-102.
 *
 * Extracted when creating a *version* joined creating a *recipe* as a way to
 * declare targets. Two copies of these checks would eventually disagree, and
 * the one that drifted would be the one nobody was reading.
 */
export function validateExpectedHours(expectedHours: number | null | undefined) {
  if (expectedHours == null) return; // no declararlo es legitimo
  if (!Number.isInteger(expectedHours) || expectedHours <= 0) {
    throw new ProcessTargetError("expected_hours_must_be_positive");
  }
}

export function validateTargets(targets: CreateRecipeInput["targets"]) {
  if (targets.length === 0) throw new ProcessTargetError("at_least_one_target_required");

  for (const t of targets) {
    // A target that declares no number at all is an instruction to measure,
    // not a target, and belongs in ProtocolRequiredMeasurement rather than
    // here.
    if (t.targetValue == null && t.minValue == null && t.maxValue == null) {
      throw new ProcessTargetError("target_needs_a_number");
    }
    if (t.minValue != null && t.maxValue != null && t.minValue > t.maxValue) {
      throw new ProcessTargetError("range_inverted");
    }

    // A target is checked against the same physical bounds a reading is. A
    // declared pH of 15 is a typo, and the comparison table would otherwise
    // report a deviation of −11 for the rest of the run's life (ADR-100).
    const bounds = boundsFor(t.variable);
    if (!bounds) throw new ProcessTargetError("unknown_variable");
    if (t.unit !== bounds.canonicalUnit) throw new ProcessTargetError("wrong_unit_for_variable");
    for (const v of [t.targetValue, t.minValue, t.maxValue]) {
      if (v != null && (v < bounds.min || v > bounds.max)) {
        throw new ProcessTargetError("target_out_of_physical_range");
      }
    }

    // **El ritmo sólo tiene sentido mientras algo dura.** Un objetivo inicial o
    // final ocurre UNA vez —«el pH empieza en 5,2», «termina en 3,9»— y pedirle
    // «cada 6 horas» es una contradicción, no una preferencia. Se rechaza en
    // vez de guardarla: una fila así haría que la pantalla prometiera lecturas
    // periódicas de un momento que no se repite.
    if (t.everyHours != null && t.moment !== "during") {
      throw new ProcessTargetError("cadence_only_while_running");
    }
    // Cero no es «sin ritmo» —para eso está el nulo— y un negativo no es nada.
    // Sin esto, un 0 dividiría por cero al calcular cuántas lecturas se deben.
    if (t.everyHours != null && (!Number.isInteger(t.everyHours) || t.everyHours <= 0)) {
      throw new ProcessTargetError("cadence_must_be_positive_hours");
    }
  }

  // The unique index on (recipeVersionId, variable, moment) would catch this
  // at the database, as a P2002 the operator cannot read. Catching it here
  // names the actual mistake.
  const seen = new Set<string>();
  for (const t of targets) {
    const key = `${t.variable}:${t.moment}`;
    if (seen.has(key)) throw new ProcessTargetError("duplicate_variable_and_moment");
    seen.add(key);
  }
}

export async function createRecipeWithVersion(userAccountId: string, input: CreateRecipeInput) {
  const name = input.name.trim();
  if (!name) throw new ProcessTargetError("name_required");
  validateTargets(input.targets);
  validateExpectedHours(input.expectedHours);

  // Gated on the organization the recipe belongs to, through a lot of that
  // organization — the same authority that operates the batches it will be
  // applied to.
  // A shared recipe (no organization) is gated on any lot the account can
  // manage; an organization's recipe on a lot of that organization.
  const anyLot = await prisma.lot.findFirst({
    where: input.organizationId === null ? {} : { organizationId: input.organizationId },
  });
  if (!anyLot) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", [anyLot]);
  // Configurar recetas es configurar el beneficio (spec #370 §4.3): además del
  // lote, `edit_beneficio` en la organización de la receta; compartida, plataforma.
  await exigeEditarBeneficioEnOrganizacion(userAccountId, input.organizationId);

  const recipe = await prisma.$transaction(async (tx) => {
    const recipe = await tx.processRecipe.create({
      data: {
        name,
        description: input.description?.trim() || null,
        organizationId: input.organizationId,
        status: "approved",
        createdBy: userAccountId,
        versions: {
          create: {
            version: 1,
            status: "approved",
            expectedHours: input.expectedHours ?? null,
            createdBy: userAccountId,
            targets: {
              create: input.targets.map((t, i) => ({
                variable: t.variable,
                moment: t.moment,
                unit: t.unit,
                targetValue: t.targetValue ?? null,
                minValue: t.minValue ?? null,
                maxValue: t.maxValue ?? null,
                note: t.note?.trim() || null,
                everyHours: t.everyHours ?? null,
                displayOrder: i,
              })),
            },
          },
        },
      },
      include: { versions: { include: { targets: true } } },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe.create",
        entityType: "process_recipe",
        entityId: recipe.id,
        after: recipe,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );

    return recipe;
  });
  return recipe;
}

/**
 * Recipes this account can see, with their versions and target counts.
 *
 * Gated the same way creation is — through a lot the account may manage —
 * rather than on a `recipe:*` permission that does not exist (ADR-099).
 */
/**
 * ¿Puede esta cuenta crear una receta en alguna parte?
 *
 * **Para qué existe (Daniel, 2026-09-27).** Su regla: lo que no puedes hacer no se
 * muestra. `/recipes` ofrecía «nueva receta» a cualquiera y el destino contestaba con
 * una frase de disculpa. Para omitir el enlace hay que poder preguntarlo antes.
 *
 * **Es la MISMA decisión que toma `app/recipes/new/page.tsx`**, movida aquí y usada por
 * las dos pantallas: una organización propia donde `edit_beneficio` alcance, o la receta
 * compartida (`null`). Si divergieran, el enlace volvería a mentir — que es el defecto
 * que esto arregla.
 */
export async function puedeCrearRecetaEnAlguna(userAccountId: string): Promise<boolean> {
  if (await puedeEditarBeneficioEnOrganizacion(userAccountId, null)) return true;
  for (const org of await listRecipeOrganizations(userAccountId)) {
    if (await puedeEditarBeneficioEnOrganizacion(userAccountId, org.id)) return true;
  }
  return false;
}

export async function listRecipes(userAccountId: string) {
  const anyLot = await prisma.lot.findFirst({ where: {} });
  if (!anyLot) return [];
  await requireLotAccess(userAccountId, "manage", [anyLot]);

  return prisma.processRecipe.findMany({
    include: {
      organization: { select: { name: true } },
      versions: { include: { targets: { orderBy: { displayOrder: "asc" } } }, orderBy: { version: "desc" } },
    },
    orderBy: { name: "asc" },
  });
}

/** Organizations this account may create a recipe for. */
export async function listRecipeOrganizations(userAccountId: string) {
  // Every organization that actually owns batches. One with none has nothing
  // to run a recipe against, so offering it would be offering a dead end.
  const organizations = await prisma.organization.findMany({
    where: { lots: { some: {} } },
    select: { id: true, name: true },
  });

  const reachable: { id: string; name: string }[] = [];
  for (const org of organizations) {
    const sample = await prisma.lot.findFirst({ where: { organizationId: org.id } });
    if (!sample) continue;
    try {
      await requireLotAccess(userAccountId, "manage", [sample]);
      reachable.push(org);
    } catch {
      // Not an error: an organization this account cannot operate is simply
      // not offered.
    }
  }
  return reachable.sort((a, b) => compareNames(a.name, b.name));
}

/**
 * One recipe with every version it has ever had — ADR-102.
 *
 * Includes how many runs each version was used by, because that is the fact
 * that makes version preservation legible: a version with runs attached is
 * history, and the page can say so rather than offering a delete that would
 * quietly rewrite what those runs were aiming for.
 */
export async function getRecipeForEditor(userAccountId: string, recipeId: string) {
  const recipe = await prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: {
      organization: { select: { id: true, name: true } },
      versions: {
        include: {
          targets: { orderBy: { displayOrder: "asc" } },
          _count: { select: { fermentationRuns: true } },
        },
        orderBy: { version: "desc" },
      },
    },
  });
  // A recipe that cannot be loaded is refused rather than treated as empty —
  // the same rule a stale id gets everywhere else (ADR-081).
  if (!recipe) throw new ProcessTargetError("recipe_not_found");

  const anyLot = await prisma.lot.findFirst({ where: { organizationId: recipe.organizationId ?? undefined } });
  if (!anyLot) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", [anyLot]);

  return recipe;
}

/**
 * Rename a recipe, or reword its description. Never its targets.
 *
 * This is the whole distinction the two operations here turn on. A recipe's
 * *name* is a label — correcting "Lavado tradicinal" to "Lavado tradicional"
 * changes nothing about what any run was aiming for, so it is an edit. Its
 * *targets* are what runs were operated against, so changing those is a new
 * version and never an edit (CLAUDE.md §3).
 *
 * Conflating them would be the failure ADR-092 avoided for stories and
 * ADR-098 designed the version table to prevent here.
 */
export async function updateRecipeMetadata(
  userAccountId: string,
  recipeId: string,
  input: { name: string; description?: string | null },
) {
  const before = await prisma.processRecipe.findUnique({ where: { id: recipeId } });
  if (!before) throw new ProcessTargetError("recipe_not_found");

  const anyLot = await prisma.lot.findFirst({ where: { organizationId: before.organizationId ?? undefined } });
  if (!anyLot) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", [anyLot]);
  // Configurar recetas es configurar el beneficio (spec #370 §4.3): además del
  // lote, `edit_beneficio` en la organización de la receta; compartida, plataforma.
  await exigeEditarBeneficioEnOrganizacion(userAccountId, before.organizationId);

  const name = input.name.trim();
  if (!name) throw new ProcessTargetError("name_required");

  const after = await prisma.$transaction(async (tx) => {
    const after = await tx.processRecipe.update({
      where: { id: recipeId },
      data: { name, description: input.description?.trim() || null },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe.update",
        entityType: "process_recipe",
        entityId: recipeId,
        before,
        after,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );

    return after;
  });
  return after;
}

/**
 * A new version of an existing recipe — the only way targets ever change.
 *
 * The number is `max + 1` rather than `count + 1`: those differ the moment a
 * version is ever removed, and the second would silently reuse a number that
 * runs already point at.
 */
export async function createRecipeVersion(
  userAccountId: string,
  recipeId: string,
  targets: CreateRecipeInput["targets"],
  notes?: string | null,
  /**
   * **Sin esto, publicar una v2 le borraba el ritmo a la receta en silencio.**
   * Lo cazó la revisión independiente de Codex el 2026-09-13: hay DOS caminos
   * que escriben objetivos —crear receta y crear versión— y el primer intento
   * sólo cerró uno. La versión vigente quedaba sin duración esperada aunque la
   * v1 la tuviera, y nada lo decía.
   */
  expectedHours?: number | null,
) {
  const recipe = await prisma.processRecipe.findUnique({
    where: { id: recipeId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!recipe) throw new ProcessTargetError("recipe_not_found");

  const anyLot = await prisma.lot.findFirst({ where: { organizationId: recipe.organizationId ?? undefined } });
  if (!anyLot) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", [anyLot]);
  // Configurar recetas es configurar el beneficio (spec #370 §4.3): además del
  // lote, `edit_beneficio` en la organización de la receta; compartida, plataforma.
  await exigeEditarBeneficioEnOrganizacion(userAccountId, recipe.organizationId);

  validateTargets(targets);
  validateExpectedHours(expectedHours);

  const nextVersion = (recipe.versions[0]?.version ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const version = await tx.processRecipeVersion.create({
      data: {
        recipeId,
        version: nextVersion,
        notes: notes?.trim() || null,
        status: "approved",
        expectedHours: expectedHours ?? null,
        createdBy: userAccountId,
        targets: {
          create: targets.map((t, i) => ({
            variable: t.variable,
            moment: t.moment,
            unit: t.unit,
            targetValue: t.targetValue ?? null,
            minValue: t.minValue ?? null,
            maxValue: t.maxValue ?? null,
            everyHours: t.everyHours ?? null,
            note: t.note?.trim() || null,
            displayOrder: i,
          })),
        },
      },
      include: { targets: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_version.create",
        entityType: "process_recipe_version",
        entityId: version.id,
        after: version,
        // The fact worth searching the audit log for later: which version
        // superseded which, and when.
        reason: `supersedes_version_${recipe.versions[0]?.version ?? "none"}`,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );

    return version;
  });
  return version;
}
