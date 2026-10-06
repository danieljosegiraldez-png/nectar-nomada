/**
 * Creating a recipe — ADR-100.
 *
 * The interesting cases are the refusals. A recipe is read by the comparison
 * table for the rest of a run's life, so a target that is wrong at creation is
 * wrong in every reading of that run afterwards — a pH target of 15 would
 * report a deviation of −11 forever, and look like a process problem rather
 * than a typo.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  createRecipeWithVersion,
  listRecipeVersionsForLot,
  ProcessTargetError,
} from "../../lib/traceability/processTargets";
import { agregarPaso, publicarVersion } from "../../lib/recetas/pasos";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `recipe-${Date.now()}`;
const cuentas = fabricaDeCuentas("RecipeAuthoring");

let admin: string;
/** Un Coffee Process Manager de plataforma: el que escribe las recetas (V16). `admin` queda para lo que es del LOTE. */
let gestor: string;
let organizationId: string;
let lotId: string;
const created = { recipeIds: [] as string[], lotIds: [] as string[], organizationIds: [] as string[], stepIds: [] as string[] };

const oneTarget = [{ variable: "ph", moment: "final" as const, phase: "fermentation" as const, unit: "pH", targetValue: 3.8 }];

/** Publicar exige al menos un paso (I9): un lavado sin ejes, lo mínimo que una receta puede decir. Guarda el id para la auditoría. */
async function conUnPaso(recipeVersionId: string) {
  const tipo = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "washing", catalog: { key: "tipo_paso" } },
    select: { id: true },
  });
  const paso = await agregarPaso(gestor, { recipeVersionId, despuesDeSeq: null, paso: { stepTypeValueId: tipo.id } });
  created.stepIds.push(paso.id);
}

beforeAll(async () => {
  admin = (
    await prisma.assignment.findFirstOrThrow({
      where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
      select: { userAccountId: true },
    })
  ).userAccountId;
  gestor = await cuentas.cuenta("Coffee Process Manager", "plataforma");

  const org = await prisma.organization.create({
    data: { name: `RECIPE Org ${RUN}`, organizationType: "farm" },
  });
  organizationId = org.id;
  created.organizationIds.push(org.id);

  const lot = await prisma.lot.create({
    data: { lotCode: `RECIPE-${RUN}`, lotType: "cherry", organizationId, classification: "internal" },
  });
  lotId = lot.id;
  created.lotIds.push(lot.id);
});

afterAll(async () => {
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.recipeIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: created.recipeIds } }) });
  }
  // Parte 2a (tarea 3): publicar una versión deja su evento con el id de la VERSIÓN, y agregar un paso, con el del PASO; ni uno ni
  // otro lo alcanza `recipeIds`. La versión, por el prefijo de RUN, como la receta de abajo.
  const versiones = await prisma.processRecipeVersion.findMany({
    where: assertDefinedWhere({ recipe: { name: { contains: RUN } } }),
    select: { id: true },
  });
  const huellas = [...versiones.map((v) => v.id), ...created.stepIds];
  if (huellas.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: huellas } }) });
  }
  // Deleted by RUN prefix, not only by tracked id — ADR-104.
  //
  // Every refusal case here names a recipe it expects never to exist, so its
  // id is never captured. Under normal conditions that is fine, because the
  // creation was refused. Under a *mutation* run it is not: disabling the
  // physical-bounds check let "RECIPE Impossible …" be created, the test
  // failed as designed, and the row survived every subsequent run because
  // nothing had recorded it.
  //
  // One was found in the local database days later. The tracked-id list stays
  // for the audit rows above, which have no name to match on.
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({ name: { contains: RUN } }),
  });
  if (created.lotIds.length) await prisma.lot.deleteMany({ where: w(created.lotIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });
  await cuentas.limpiar();

  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
});

describe("creating a recipe", () => {
  it("creates the recipe and its first version together", async () => {
    // There is no useful recipe with no version — a name with no targets
    // declares nothing — so the two are one operation.
    const recipe = await createRecipeWithVersion(gestor, {
      name: `RECIPE Lavado ${RUN}`,
      organizationId,
      targets: [
        { variable: "brix", moment: "initial", phase: "fermentation" as const, unit: "Bx", targetValue: 22 },
        { variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 3.8, note: "fin de fermentación" },
      ],
    });
    created.recipeIds.push(recipe.id);

    expect(recipe.versions.length).toBe(1);
    expect(recipe.versions[0]!.version).toBe(1);
    expect(recipe.versions[0]!.targets.length).toBe(2);
    // Parte 2a (tarea 3, diseño §3.3): nace BORRADOR. Hasta el 2026-10-03 nacía `approved` «para poder elegirla en
    // seguida»; con la receta con pasos, una versión se escribe en borrador y se PUBLICA, y sólo publicada se ofrece.
    expect(recipe.versions[0]!.status).toBe("draft");
  });

  it("does not offer the draft for a run; once published, it does", async () => {
    const ofrecidas = async () => (await listRecipeVersionsForLot(admin, lotId)).map((v) => v.recipe.name);
    expect(await ofrecidas()).not.toContain(`RECIPE Lavado ${RUN}`);
    // Control: la misma lectura, con la versión publicada, sí la ofrece: el «no» de arriba no es una lista vacía.
    const recipe = await prisma.processRecipe.findFirstOrThrow({
      where: { name: `RECIPE Lavado ${RUN}` },
      include: { versions: true },
    });
    // Sin pasos no se publica (I9, `version_sin_pasos`): se le pone uno.
    await conUnPaso(recipe.versions[0]!.id);
    await publicarVersion(gestor, recipe.versions[0]!.id);
    expect(await ofrecidas()).toContain(`RECIPE Lavado ${RUN}`);
  });

  it("writes an audit row", async () => {
    const event = await prisma.auditEvent.findFirst({
      where: { entityType: "process_recipe", entityId: created.recipeIds[0] },
    });
    expect(event?.operation).toBe("process_recipe.create");
  });
});

  /**
   * Phases on targets (2026-09-27). Without a phase, "pH every 6 h" and "turn every 4 h" live in the
   * same recipe with no way to tell them apart, and drying gets neither targets nor a rhythm.
   */
  it("stores each target's phase and the recipe's per-phase rows", async () => {
    const recipe = await createRecipeWithVersion(gestor, {
      name: `RECIPE washed with drying ${RUN}`,
      organizationId,
      expectedHours: 18,
      targets: [
        { variable: "ph", moment: "during", phase: "fermentation" as const, unit: "pH", minValue: 4.1, maxValue: 5.6, everyHours: 6 },
        // The SAME variable at the SAME moment, in another phase: not a duplicate.
        { variable: "moisture", moment: "during", phase: "drying" as const, unit: "%", minValue: 9, maxValue: 24, everyHours: 12 },
      ],
      fases: [
        { phase: "fermentation", expectedHours: 18 },
        { phase: "drying", expectedHours: 192, turnEveryHours: 4, targetMoistureMinPct: 9, targetMoistureMaxPct: 12 },
      ],
    });
    created.recipeIds.push(recipe.id);

    const version = recipe.versions[0]!;
    expect(version.targets.map((t) => t.phase).sort()).toEqual(["drying", "fermentation"]);

    const drying = version.fases.find((f) => f.phase === "drying");
    expect(drying, "the drying phase row was not stored").toBeDefined();
    expect(drying!.turnEveryHours).toBe(4);
    expect(drying!.expectedHours).toBe(192);
    expect(drying!.targetMoistureMinPct?.toNumber()).toBe(9);
    expect(drying!.targetMoistureMaxPct?.toNumber()).toBe(12);
  });

describe("what it refuses", () => {
  /** Turning does not exist during fermentation: there is nothing to turn. */
  it("refuses a turn rhythm on fermentation", async () => {
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE odd turning ${RUN}`,
        organizationId,
        targets: oneTarget,
        fases: [{ phase: "fermentation", turnEveryHours: 4 }],
      }),
    ).rejects.toThrow(new ProcessTargetError("turn_cadence_only_in_drying"));
  });

  /** Half a range is not a range: the queue cannot say "close to target" with one end. */
  it("refuses a moisture range with only one end", async () => {
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE half range ${RUN}`,
        organizationId,
        targets: oneTarget,
        fases: [{ phase: "drying", targetMoistureMinPct: 9 }],
      }),
    ).rejects.toThrow(new ProcessTargetError("moisture_range_needs_both_ends"));
  });

  /** And the inverted range, which is the mistake a finger actually makes. */
  it("refuses an inverted moisture range", async () => {
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE inverted range ${RUN}`,
        organizationId,
        targets: oneTarget,
        fases: [{ phase: "drying", targetMoistureMinPct: 12, targetMoistureMaxPct: 9 }],
      }),
    ).rejects.toThrow(new ProcessTargetError("moisture_range_inverted"));
  });

  it("refuses a recipe with no name", async () => {
    await expect(
      createRecipeWithVersion(gestor, { name: "   ", organizationId, targets: oneTarget }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a recipe with no targets — a name declares nothing", async () => {
    await expect(
      createRecipeWithVersion(gestor, { name: `RECIPE Empty ${RUN}`, organizationId, targets: [] }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a target carrying no number at all", async () => {
    // "Measure pH at the end" without a value is an instruction to measure,
    // which is what ProtocolRequiredMeasurement is for. Accepting it here
    // would put a row in the comparison table with nothing to compare.
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE NoNumber ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH" }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses an inverted range", async () => {
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE Inverted ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "during", phase: "fermentation" as const, unit: "pH", minValue: 5, maxValue: 4 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a target outside the variable's physical range", async () => {
    // The case this validation exists for. pH 15 does not exist, and a
    // comparison table would otherwise report a deviation of −11 for the rest
    // of the run's life — looking like a process problem rather than a typo.
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE Impossible ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 15 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a unit that does not belong to the variable", async () => {
    // A pH target recorded in Brix would compare against Brix readings and
    // silently misreport. The form does not let this happen; the service
    // refuses it anyway, because the form is not the boundary.
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE WrongUnit ${RUN}`,
        organizationId,
        targets: [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "Bx", targetValue: 4 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses a variable that is not in the registry", async () => {
    await expect(
      createRecipeWithVersion(gestor, {
        name: `RECIPE Unknown ${RUN}`,
        organizationId,
        targets: [{ variable: "vibes", moment: "final", phase: "fermentation" as const, unit: "x", targetValue: 1 }],
      }),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("leaves nothing behind when it refuses", async () => {
    // A recipe row created before validation failed would be an invisible
    // half-record — the same shape as ADR-089's abandoned backup directory.
    expect(await prisma.processRecipe.count({ where: { name: { contains: `RECIPE Impossible ${RUN}` } } })).toBe(0);
    expect(await prisma.processRecipe.count({ where: { name: { contains: `RECIPE Empty ${RUN}` } } })).toBe(0);
  });
});
