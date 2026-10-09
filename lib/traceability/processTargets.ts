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
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { recordAuditEvent } from "../audit";
import { boundsFor } from "./units";
import { compareNames } from "../naturalOrder";
import type { ProcessTargetMoment, ProcessPhase } from "../../generated/prisma/client";
import { puedeAutoriaDeReceta } from "../recetas/autoria";
import { exigeAutoriaDeReceta } from "../recetas/autoria";
import { RecipeError } from "../recetas/errorDeReceta";
import { copiarContenidoDeVersion } from "../recetas/versiones";

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
 * Every target of the run's recipe version that hangs from no step, set against what was measured.
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
      // Parte 2a, tarea 9a (§3.2): the version's targets are the ones that hang from no step; a step's targets are the step's, not the version's.
      processRecipeVersion: { include: { targets: { where: { recipeStepId: null }, orderBy: { displayOrder: "asc" } } } },
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
    // is worse than a run with none. Parte 2a (§3.3): `abrirProceso` rechaza un
    // borrador (`version_no_publicada`), y lo que se ofrece es la versión
    // PUBLICADA más nueva de cada receta: una v2 en borrador no esconde a la v1.
    where: {
      status: "approved",
      recipe: {
        // A recipe belonging to another organization is not this batch's to use.
        // Null organizationId means a shared recipe, available to everyone.
        OR: [{ organizationId: lot.organizationId }, { organizationId: null }],
        // Parte 2a (tarea 5): ni una receta archivada —`abrirProceso` la rechaza
        // con `recipe_archived`— ni una Libre (§5.2), que es de UN proceso y se
        // escribe al abrirlo, no se elige de una lista. Esta función es el
        // selector del proceso, de `roast/new` y del perfil de tueste de la
        // ficha: ninguno ofrece Libres (decisión del controlador, 2026-10-03).
        status: { not: "archived" },
        esLibre: false,
      },
    },
    include: {
      recipe: true,
      // Parte 2a (tarea 5, I5): sólo las metas de LA VERSIÓN (las de un paso, con `recipeStepId`, las cuenta el paso), y cuántos
      // pasos tiene: el rótulo de los tres selectores dice «<n> pasos» si la versión los tiene y «<n> objetivos» si no (tarea 13).
      targets: { where: { recipeStepId: null }, orderBy: { displayOrder: "asc" } },
      _count: { select: { steps: true } },
    },
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
    /**
     * De qué fase es este objetivo. **Obligatorio en toda escritura nueva** (2026-09-27): los
     * objetivos heredados pueden no decirlo, pero nada nuevo entra sin decirlo. Sin esto, «pH cada
     * 6 h» y «voltear cada 4 h» vivirían en la misma receta sin poder distinguirse.
     */
    phase: ProcessPhase;
    unit: string;
    targetValue?: number | null;
    minValue?: number | null;
    maxValue?: number | null;
    note?: string | null;
    /** Cada cuántas horas toca medir. Sólo con `moment: "during"`. */
    everyHours?: number | null;
  }>;
  /**
   * Lo que la receta declara POR FASE: cuánto debe durar, cada cuántas horas se voltea y a qué rango
   * de humedad se quiere llegar. Opcional: una receta que sólo describe fermentación no declara la
   * fase de secado, y su ausencia significa «no se declaró», no «cero».
   */
  fases?: ReadonlyArray<{
    phase: ProcessPhase;
    expectedHours?: number | null;
    turnEveryHours?: number | null;
    targetMoistureMinPct?: number | null;
    targetMoistureMaxPct?: number | null;
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

/**
 * Las reglas de las filas de fase. Viven aquí y **no en la base** por la misma razón que la del ritmo
 * de medición: un importador o un SQL directo se las salta, y eso se dice en vez de llamarlo
 * estructural.
 */
export function validateFases(fases: CreateRecipeInput["fases"]) {
  if (!fases?.length) return;
  const vistas = new Set<ProcessPhase>();
  for (const f of fases) {
    if (vistas.has(f.phase)) throw new ProcessTargetError("duplicate_phase");
    vistas.add(f.phase);

    // Un volteo sólo existe en el secado. En fermentación no hay nada que revolver, y guardarlo
    // sería un número que nadie puede leer sin equivocarse.
    if (f.turnEveryHours != null && f.phase !== "drying") {
      throw new ProcessTargetError("turn_cadence_only_in_drying");
    }
    for (const [valor, error] of [
      [f.expectedHours, "expected_hours_must_be_positive"],
      [f.turnEveryHours, "turn_cadence_must_be_positive_hours"],
    ] as const) {
      if (valor != null && (!Number.isInteger(valor) || valor <= 0)) throw new ProcessTargetError(error);
    }

    // Los dos o ninguno: un mínimo sin máximo no es un rango, y la pantalla no podría decir «cerca
    // del objetivo» con la mitad de una banda.
    const min = f.targetMoistureMinPct ?? null;
    const max = f.targetMoistureMaxPct ?? null;
    if ((min == null) !== (max == null)) throw new ProcessTargetError("moisture_range_needs_both_ends");
    if (min != null && max != null) {
      if (min > max) throw new ProcessTargetError("moisture_range_inverted");
      for (const v of [min, max]) {
        if (!(v > 0 && v <= 100)) throw new ProcessTargetError("moisture_range_out_of_physical_range");
      }
    }
  }
}

/**
 * Las reglas de una meta: la de la versión y, desde la Parte 2a, la de un paso (tarea 3, diseño §3.2).
 *
 * Una meta de PASO lleva `recipeStepId` y no `phase`: la fase sale del tipo de su paso al escribirla (`lib/recetas/pasos.ts`),
 * o queda nula si el tipo no la tiene (un lavado). Su paso tiene que estar en `pasosDeEstaVersion`, los de la versión que se
 * escribe; si no, `paso_de_otra_version`. Sin esa lista no hay contra qué comprobar, y una meta con paso se rechaza igual.
 */
export function validateTargets(
  targets: ReadonlyArray<
    Omit<CreateRecipeInput["targets"][number], "phase"> & { phase?: ProcessPhase | null; recipeStepId?: string | null }
  >,
  pasosDeEstaVersion?: ReadonlySet<string>,
) {
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
      // Parte 2a (tarea 3, I9): `NaN` compara falso con todo, así que `v < min || v > max` lo dejaba pasar —y una meta con `NaN`
      // se compararía contra lecturas para siempre—. Un valor que no es un número finito no es posible.
      if (v != null && (!Number.isFinite(v) || v < bounds.min || v > bounds.max)) {
        throw new ProcessTargetError("target_out_of_physical_range");
      }
    }

    // **El ritmo sólo tiene sentido mientras algo dura.** Un objetivo inicial o
    // final ocurre UNA vez —«el pH empieza en 5,2», «termina en 3,9»— y pedirle
    // «cada 6 horas» es una contradicción, no una preferencia. Se rechaza en
    // vez de guardarla: una fila así haría que la pantalla prometiera lecturas
    // periódicas de un momento que no se repite.
    // Parte 2a (tarea 3, diseño §3.2): una meta de paso no declara fase, y su paso tiene que ser de esta versión. Una de la
    // versión sigue exigiendo la suya, como desde el 2026-09-27.
    if (t.recipeStepId != null) {
      if (!pasosDeEstaVersion?.has(t.recipeStepId)) throw new RecipeError("paso_de_otra_version");
    } else if (!t.phase) {
      throw new ProcessTargetError("phase_required");
    }
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
    // La fase entra en la clave: la misma variable y el mismo momento pueden repetirse en
    // fermentación y en secado sin ser un duplicado — son dos cosas distintas.
    // Parte 2a (tarea 3, diseño §3.2): una meta de paso es única en SU paso —la base lo dice con el índice parcial
    // `(recipe_step_id, variable, moment)` de la tarea 1—, así que la fiebre y la fermentación pueden pedir las dos pH inicial.
    const key =
      t.recipeStepId != null ? `paso:${t.recipeStepId}:${t.variable}:${t.moment}` : `${t.phase}:${t.variable}:${t.moment}`;
    if (seen.has(key)) throw new ProcessTargetError("duplicate_variable_and_moment");
    seen.add(key);
  }
}

export async function createRecipeWithVersion(userAccountId: string, input: CreateRecipeInput) {
  const name = input.name.trim();
  if (!name) throw new ProcessTargetError("name_required");
  validateTargets(input.targets);
  validateFases(input.fases);
  validateExpectedHours(input.expectedHours);

  // V16 (Parte 2a, tarea 3, 2026-10-04): escribir recetas es del Coffee Process Manager, y la regla es UNA sola
  // (`lib/recetas/autoria.ts`). Hasta hoy aquí se pedía `lot:manage` sobre un lote de la organización y `edit_beneficio`
  // (spec #370 §4.3); ni uno ni otro bastan ya, y la organización ya no necesita ningún lote.
  await exigeAutoriaDeReceta(userAccountId, input.organizationId);

  const recipe = await prisma.$transaction(async (tx) => {
    const recipe = await tx.processRecipe.create({
      data: {
        name,
        description: input.description?.trim() || null,
        organizationId: input.organizationId,
        // La RECETA nace activa: de su estado sólo se lee `archived` (`abrirProceso`). Lo que nace borrador es su versión.
        status: "approved",
        createdBy: userAccountId,
        versions: {
          create: {
            version: 1,
            // Parte 2a (tarea 3, diseño §3.3): la v1 nace BORRADOR. Se le escriben los pasos (`lib/recetas/pasos.ts`) y la
            // publica `publicarVersion`; hasta entonces el selector (`listRecipeVersionsForLot`) no la ofrece.
            status: "draft",
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
                phase: t.phase,
                displayOrder: i,
              })),
            },
            fases: input.fases?.length
              ? {
                  create: input.fases.map((f) => ({
                    phase: f.phase,
                    expectedHours: f.expectedHours ?? null,
                    turnEveryHours: f.turnEveryHours ?? null,
                    targetMoistureMinPct: f.targetMoistureMinPct ?? null,
                    targetMoistureMaxPct: f.targetMoistureMaxPct ?? null,
                  })),
                }
              : undefined,
          },
        },
      },
      include: { versions: { include: { targets: true, fases: true } } },
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
 * las dos pantallas: una organización propia donde alcance el permiso de autoría de recetas
 * —el del Coffee Process Manager, V16, 2026-10-04: `puedeAutoriaDeReceta`, la gemela de
 * `exigeAutoriaDeReceta`, que es la regla de los servicios—, o la receta compartida
 * (`null`). `edit_beneficio` ya no basta. Si divergieran, el enlace volvería a mentir — que
 * es el defecto que esto arregla.
 */
export async function puedeCrearRecetaEnAlguna(userAccountId: string): Promise<boolean> {
  if (await puedeAutoriaDeReceta(userAccountId, null)) return true;
  for (const org of await listRecipeOrganizations(userAccountId)) {
    if (await puedeAutoriaDeReceta(userAccountId, org.id)) return true;
  }
  return false;
}

/**
 * Los ámbitos de los lotes de una organización —o de todas, con `null`—: cada combinación distinta de proyecto, ubicación y clasificación, una
 * sola vez. Es todo lo que la guardia de acceso pide de un lote, y esa guardia aprueba en cuanto UNO de sus candidatos pasa: dársela con los
 * ámbitos de todos los lotes pregunta «¿opera esta cuenta ALGÚN lote de la organización?», sin traerlos uno a uno y sin depender de cuál devuelva
 * la base primero. R7 (2026-10-05): `listRecipes` autorizaba con «un lote cualquiera de toda la base» y `getRecipeForEditor` con el primero de la
 * organización, y un operario de una sola parcela pasaba o no según el orden en que la base respondiera.
 */
async function ambitosDeLosLotes(organizationId: string | null) {
  return prisma.lot.groupBy({
    by: ["projectId", "locationId", "classification"],
    where: organizationId === null ? {} : { organizationId },
  });
}

export async function listRecipes(userAccountId: string) {
  // R8 (2026-10-05): una Libre es lo que ocurrió en UN lote (diseño §5.2), no un catálogo: no se lista, para nadie. Es filtro del SERVICIO y no sólo
  // de la pantalla —que lo repite—: su nombre lleva el código del lote y su descripción, lo que el operario escribió, y una lista pedida por otro
  // camino no puede traerlas. Se lee por `getRecipeForEditor`, que la autoriza por el lote.
  const recetas = await prisma.processRecipe.findMany({
    where: { esLibre: false },
    include: {
      organization: { select: { name: true } },
      versions: { include: { targets: { orderBy: { displayOrder: "asc" } } }, orderBy: { version: "desc" } },
    },
    orderBy: { name: "asc" },
  });

  // R7 (2026-10-05): cada receta se decide por SU organización, para quien opera y para quien escribe. Antes, pasar la guardia contra «un lote cualquiera de
  // la base» devolvía todas las recetas de todas las organizaciones, y un Coffee Process Manager con un perfil operativo de más eludía el filtro de
  // la autoría. Ahora: la ve quien opera ALGÚN lote de la organización o quien puede escribir sus recetas (Ruling C4, V16). Una plantilla (organización
  // nula) la ve quien opera algún lote en cualquier parte o tiene la autoría de plataforma, como hasta hoy: el Process Manager de una sola finca no las ve
  // (decisión de Daniel). Una pregunta por organización, no por receta; un error que no sea de acceso a lotes se relanza.
  const opera = async (organizationId: string | null): Promise<boolean> => {
    try {
      await requireLotAccess(userAccountId, "manage", await ambitosDeLosLotes(organizationId));
      return true;
    } catch (error) {
      if (error instanceof TraceabilityAccessError) return false;
      throw error;
    }
  };
  const puede = new Map<string | null, boolean>();
  for (const { organizationId } of recetas) {
    if (puede.has(organizationId)) continue;
    puede.set(organizationId, (await opera(organizationId)) || (await puedeAutoriaDeReceta(userAccountId, organizationId)));
  }
  const visibles = recetas.filter((r) => puede.get(r.organizationId));
  if (visibles.length > 0) return visibles;

  // Sin ninguna a la vista: lista vacía si esta cuenta opera algún lote o puede escribir recetas en alguna parte (la primera visita de un Process
  // Manager cuya organización todavía no tiene recetas), y la negativa de siempre —la del acceso a lotes— si no.
  if ((await opera(null)) || (await puedeCrearRecetaEnAlguna(userAccountId))) return visibles;
  throw new TraceabilityAccessError("no_lot_access");
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
    let alcanza = false;
    try {
      await requireLotAccess(userAccountId, "manage", [sample]);
      alcanza = true;
    } catch {
      // Not an error: an organization this account cannot operate is simply
      // not offered.
    }
    // Ruling C4 (2026-10-04): quien puede ESCRIBIR las recetas de la organización también la ve, aunque no opere ninguno de sus lotes
    // (el Coffee Process Manager no lleva `lot:manage`). La organización sigue necesitando algún lote: el filtro de arriba no cambia.
    if (!alcanza && (await puedeAutoriaDeReceta(userAccountId, org.id))) alcanza = true;
    if (alcanza) reachable.push(org);
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

  // R8 (2026-10-05): una receta Libre es lo que ocurrió en un lote (diseño §5.2): su nombre lleva el código del lote y su descripción, lo que el
  // operario escribió. Se abre a quien puede VER el lote cuyo proceso la usa —cada uno, si una división la copió a varios: quien ve uno solo no la
  // lee— y NO a quien sólo puede escribir recetas de la organización (el Coffee Process Manager no lleva `lot:view`): por eso va ANTES de la rama
  // de la autoría y no la deja pasar. Se pregunta por la VERSIÓN, no por el lote («qué procesos usan esta receta»: no es «qué proceso cubre a este
  // lote», que es del resolvedor). Sin ningún proceso que la use no hay lote por el que autorizar, y no se abre a nadie.
  if (recipe.esLibre) {
    const usos = await prisma.lotProcess.findMany({
      where: { processRecipeVersionId: { in: recipe.versions.map((v) => v.id) } },
      select: { lot: { select: { id: true, projectId: true, locationId: true, classification: true } } },
    });
    const lotes = [...new Map(usos.map((u) => [u.lot.id, u.lot] as const)).values()];
    if (lotes.length === 0) throw new TraceabilityAccessError("no_lot_access");
    // Uno por uno: la guardia aprueba en cuanto UNO de los candidatos pasa, y aquí hacen falta todos.
    for (const lote of lotes) await requireLotAccess(userAccountId, "view", [lote]);
    return recipe;
  }

  // Ruling C4 (2026-10-04): quien puede ESCRIBIR esta receta puede abrirla, sin operar ningún lote ni haber registrado ninguno en la
  // organización (el Coffee Process Manager no lleva `lot:manage`). Primero, y no después del «sin lotes»: ese rechazo es de quien necesita un
  // lote por el que pasar, y la autoría no lo necesita. Una plantilla (organización nula) se abre así sólo con alcance de plataforma.
  if (await puedeAutoriaDeReceta(userAccountId, recipe.organizationId)) return recipe;

  // R7 (2026-10-05): quien opera ALGÚN lote de la organización —o de cualquiera, si es una plantilla—, el mismo criterio que `listRecipes`: lo que la lista
  // ofrece, esta lectura lo abre. Antes se miraba el primer lote que devolviera la base.
  const ambitos = await ambitosDeLosLotes(recipe.organizationId);
  if (ambitos.length === 0) throw new ProcessTargetError("organization_has_no_lots");
  await requireLotAccess(userAccountId, "manage", ambitos);

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

  // V16 (Parte 2a, tarea 3, 2026-10-04): la misma regla única de autoría que al crearla.
  await exigeAutoriaDeReceta(userAccountId, before.organizationId);

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
  /**
   * R8 (Parte 1, 2026-09-30), extendido en la Parte 2a (tarea 4, 2026-10-03): las fases de la versión. **Sin pasarlas
   * (`undefined`), la versión nueva trae las de la anterior** —la pantalla todavía no las edita, y publicar una v2 desde
   * ella las borraba en silencio, el mismo fallo que con las horas el 2026-09-13—, **pero sólo si la anterior no tiene
   * pasos**: con pasos, las fases las deriva `publicarVersion` (diseño §3.1). Un arreglo explícito, vacío incluido, las
   * sustituye. **Los pasos se copian siempre**, con sus adiciones, fines, requisitos y metas de paso remapeadas
   * (`copiarContenidoDeVersion`, `lib/recetas/versiones.ts`): esta puerta no los edita, y perderlos sería el mismo
   * borrado en silencio que R8 cerró para las fases.
   */
  fases?: CreateRecipeInput["fases"],
) {
  const recipe = await prisma.processRecipe.findUnique({ where: { id: recipeId } });
  if (!recipe) throw new ProcessTargetError("recipe_not_found");

  // V16 (Parte 2a, tarea 3, 2026-10-04): la misma regla única de autoría que al crearla.
  await exigeAutoriaDeReceta(userAccountId, recipe.organizationId);

  validateTargets(targets);
  validateExpectedHours(expectedHours);
  if (fases !== undefined) validateFases(fases);
  // Sólo las que llegan. Las de la versión anterior —si no llegan y la anterior no tiene pasos— las copia
  // `copiarContenidoDeVersion` dentro de la transacción, junto con los pasos (Parte 2a, tarea 4).
  const fasesDeLaVersion = (fases ?? []).map((f) => ({
    phase: f.phase,
    expectedHours: f.expectedHours ?? null,
    turnEveryHours: f.turnEveryHours ?? null,
    targetMoistureMinPct: f.targetMoistureMinPct ?? null,
    targetMoistureMaxPct: f.targetMoistureMaxPct ?? null,
  }));

  const version = await prisma.$transaction(async (tx) => {
    // Parte 2a (tarea 3, diseño §3.3): el número sale DENTRO de la transacción, con la receta en `FOR UPDATE`. Calculado fuera
    // y sin bloqueo, dos versiones a la vez leían el mismo máximo y la segunda chocaba con `@@unique([recipeId, version])`: un
    // P2002 que ninguna acción traduce (reconocimiento u1, S7). Con la fila bloqueada, la segunda espera y lee el número que
    // dejó la primera. `max + 1`, no `count + 1`, por lo que dice la cabecera de esta función.
    await tx.$queryRaw`SELECT id FROM traceability.process_recipe WHERE id = ${recipeId}::uuid FOR UPDATE`;
    const ultima = await tx.processRecipeVersion.findFirst({
      where: { recipeId },
      orderBy: { version: "desc" },
      select: { id: true, version: true },
    });
    const nextVersion = (ultima?.version ?? 0) + 1;

    const version = await tx.processRecipeVersion.create({
      data: {
        recipeId,
        version: nextVersion,
        notes: notes?.trim() || null,
        // Parte 2a (tarea 3, diseño §3.3): nace BORRADOR. La publica `publicarVersion` (`lib/recetas/pasos.ts`); hasta
        // entonces el selector (`listRecipeVersionsForLot`, que sólo ofrece `approved`) no la ofrece.
        status: "draft",
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
            // La SEGUNDA puerta. El guardia `campos-con-dos-puertas` existe por esto: cuando se
            // añadieron `everyHours` y `expectedHours` se cerró sólo `createRecipeWithVersion`, y
            // publicar la v2 le borraba el ritmo a la receta en silencio.
            phase: t.phase,
            note: t.note?.trim() || null,
            displayOrder: i,
          })),
        },
        fases: fasesDeLaVersion.length
          ? {
              create: fasesDeLaVersion.map((f) => ({
                phase: f.phase,
                expectedHours: f.expectedHours,
                turnEveryHours: f.turnEveryHours,
                targetMoistureMinPct: f.targetMoistureMinPct,
                targetMoistureMaxPct: f.targetMoistureMaxPct,
              })),
            }
          : undefined,
      },
      include: { targets: true, fases: true },
    });

    // R8 extendido (Parte 2a, tarea 4): lo que la versión anterior declaraba y esta puerta no edita viaja a la nueva
    // —pasos con adiciones, fines, requisitos y metas de paso remapeadas; sus fases sólo si no llegaron otras y no tiene
    // pasos—. Las metas de versión no: son las que manda el formulario (`targets`).
    if (ultima) {
      await copiarContenidoDeVersion(tx, ultima.id, version.id, { metasDeVersion: false, fases: fases === undefined });
    }
    // Releída: lo copiado entró después del `create`, y lo que se audita y se devuelve es la versión entera.
    const completa = await tx.processRecipeVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: { targets: true, fases: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "process_recipe_version.create",
        entityType: "process_recipe_version",
        entityId: version.id,
        after: completa,
        // The fact worth searching the audit log for later: which version
        // superseded which, and when.
        reason: `supersedes_version_${ultima?.version ?? "none"}`,
        sourceInterface: "traceability.processTargets",
      },
      tx,
    );

    return completa;
  });
  return version;
}
