/**
 * Editing a recipe, and superseding it with a new version — ADR-102.
 *
 * The distinction under test is the one CLAUDE.md §3 exists for: a name is a
 * label and may be edited; targets are what runs were operated against and may
 * only be superseded. A test that let the two blur would let the platform
 * rewrite history quietly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  createRecipeWithVersion,
  createRecipeVersion,
  updateRecipeMetadata,
  getRecipeForEditor,
  listRecipeVersionsForLot,
  compareRunToTargets,
  ProcessTargetError,
} from "../../lib/traceability/processTargets";
import { agregarPaso, publicarVersion } from "../../lib/recetas/pasos";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { fabricaDeCuentas } from "../helpers/cuentasDeAutoria";

const RUN = `rver-${Date.now()}`;
const cuentas = fabricaDeCuentas("RecipeVersions");

let admin: string;
/** Un Coffee Process Manager de plataforma: el que escribe las recetas (V16). `admin` queda para lo que es del LOTE. */
let gestor: string;
let organizationId: string;
let lotId: string;
let recipeId: string;
let v1Id: string;
let runOnV1: string;
/** La v2 del fixture: nace borrador, y «only the newest version is offered» la publica (Parte 2a, tarea 3). */
let v2Id: string;
const created = {
  recipeIds: [] as string[], lotIds: [] as string[], organizationIds: [] as string[],
  runIds: [] as string[], transformationIds: [] as string[], measurementIds: [] as string[],
  // Las versiones que crean las pruebas de R8 (Parte 1): su auditoría cuelga del id de la VERSIÓN, no
  // del de la receta, y por eso `recipeIds` no la alcanza.
  versionIds: [] as string[],
  // Los pasos que les pone `conUnPaso`: su auditoría cuelga del id del PASO.
  stepIds: [] as string[],
};

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

  const org = await prisma.organization.create({ data: { name: `RVER Org ${RUN}`, organizationType: "farm" } });
  organizationId = org.id;
  created.organizationIds.push(org.id);

  const lot = await prisma.lot.create({
    data: { lotCode: `RVER-${RUN}`, lotType: "cherry", organizationId, classification: "internal" },
  });
  lotId = lot.id;
  created.lotIds.push(lot.id);

  const recipe = await createRecipeWithVersion(gestor, {
    name: `RVER Lavado ${RUN}`,
    organizationId,
    targets: [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 3.8 }],
  });
  recipeId = recipe.id;
  v1Id = recipe.versions[0]!.id;
  created.recipeIds.push(recipe.id);
  // Parte 2a (tarea 3, diseño §3.3): la v1 nace borrador. Una versión con una corrida encima es una versión que se
  // publicó: así se usa, y así la ofrece el selector en «only the newest version is offered». Con un paso, porque publicar
  // una versión sin pasos se rechaza (I9, `version_sin_pasos`).
  await conUnPaso(v1Id);
  await publicarVersion(gestor, v1Id);

  // A run operated against version 1, so the history has something to protect.
  const run = await prisma.fermentationRun.create({
    data: { startedAt: new Date(), vesselNote: `RVER ${RUN}`, processRecipeVersionId: v1Id },
  });
  runOnV1 = run.id;
  created.runIds.push(run.id);
  const tx = await prisma.lotTransformation.create({
    data: {
      transformationType: "stage_change", occurredAt: run.startedAt,
      provenanceClass: "direct_observation", fermentationRunId: run.id,
      inputs: { create: [{ lotId }] },
    },
  });
  created.transformationIds.push(tx.id);
  const m = await prisma.measurement.create({
    data: { variable: "ph", value: 3.785, unit: "pH", occurredAt: new Date(),
            lotId, fermentationRunId: run.id, provenanceClass: "direct_observation" },
  });
  created.measurementIds.push(m.id);
});

afterAll(async () => {
  const w = (ids: string[]) => assertDefinedWhere({ id: { in: ids } });
  if (created.measurementIds.length) await prisma.measurement.deleteMany({ where: w(created.measurementIds) });
  if (created.transformationIds.length) {
    await prisma.lotTransformationInput.deleteMany({
      where: assertDefinedWhere({ transformationId: { in: created.transformationIds } }),
    });
    await prisma.lotTransformation.deleteMany({ where: w(created.transformationIds) });
  }
  if (created.runIds.length) await prisma.fermentationRun.deleteMany({ where: w(created.runIds) });
  if (created.recipeIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: created.recipeIds } }) });
  }
  // Por el prefijo de RUN además de por id, como la receta más abajo: una prueba que deje de rechazar
  // y cree una versión no llega a anotar su id, y su auditoría —que cuelga del id de la VERSIÓN— no la
  // limpiaría nada.
  const porNombre = await prisma.processRecipeVersion.findMany({
    where: assertDefinedWhere({ recipe: { name: { contains: RUN } } }),
    select: { id: true },
  });
  const versionIds = [...new Set([...created.versionIds, ...porNombre.map((v) => v.id)])];
  if (versionIds.length) {
    await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...versionIds, ...created.stepIds] } }) });
    // En orden de FK, aunque las tres claves sean CASCADE: fases y metas antes que las versiones, y las
    // versiones antes que las recetas (que se borran más abajo, por el prefijo de RUN).
    await prisma.processRecipePhase.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
    await prisma.processTarget.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
    await prisma.processRecipeStep.deleteMany({ where: assertDefinedWhere({ recipeVersionId: { in: versionIds } }) });
    await prisma.processRecipeVersion.deleteMany({ where: w(versionIds) });
  }
  // By RUN prefix rather than tracked id alone — see ADR-104 and the same
  // change in recipeAuthoring.test.ts. A refusal case never captures an id,
  // so a mutation run that turns the refusal into a success leaves a row
  // nothing will ever clean up.
  await prisma.processRecipe.deleteMany({
    where: assertDefinedWhere({ name: { contains: RUN } }),
  });
  if (created.lotIds.length) await prisma.lot.deleteMany({ where: w(created.lotIds) });
  if (created.organizationIds.length) await prisma.organization.deleteMany({ where: w(created.organizationIds) });
  await cuentas.limpiar();

  expect(await prisma.processRecipe.count({ where: { name: { contains: RUN } } })).toBe(0);
  expect(await prisma.auditEvent.count({ where: assertDefinedWhere({ entityId: { in: [...versionIds, ...created.stepIds] } }) })).toBe(0);
});

describe("a name may be edited; targets may not", () => {
  it("renames the recipe without touching any version", async () => {
    // Correcting a typo in a label changes nothing about what any run was
    // aiming for, which is exactly why this is an edit and targets are not.
    await updateRecipeMetadata(gestor, recipeId, {
      name: `RVER Lavado tradicional ${RUN}`,
      description: "corregido",
    });

    const recipe = await getRecipeForEditor(admin, recipeId);
    expect(recipe.name).toBe(`RVER Lavado tradicional ${RUN}`);
    expect(recipe.versions.length).toBe(1);
    expect(recipe.versions[0]!.targets[0]!.targetValue?.toNumber()).toBe(3.8);
  });

  it("audits the rename with both sides", async () => {
    const event = await prisma.auditEvent.findFirst({
      where: { entityId: recipeId, operation: "process_recipe.update" },
      orderBy: { occurredAt: "desc" },
    });
    expect(event).not.toBeNull();
    expect((event!.before as Record<string, unknown>).name).toContain("RVER Lavado ");
    expect((event!.after as Record<string, unknown>).name).toContain("tradicional");
  });
});

describe("creating version 2", () => {
  it("numbers it from the highest existing version", async () => {
    const v2 = await createRecipeVersion(
      gestor, recipeId,
      [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 4.0 }],
      "subimos el objetivo",
    );
    v2Id = v2.id;
    expect(v2.version).toBe(2);
    expect(v2.targets[0]!.targetValue?.toNumber()).toBe(4);
    // Parte 2a (tarea 3, diseño §3.3): nace borrador.
    expect(v2.status).toBe("draft");
  });

  it("leaves the run on version 1 comparing against 3.8, not 4.0", async () => {
    // The whole reason versions exist. If this ever returns 4.0, the platform
    // has rewritten what a past run was aiming for.
    const rows = await compareRunToTargets(admin, runOnV1);
    expect(rows[0]!.target.value?.toNumber()).toBe(3.8);
    expect(rows[0]!.deviation?.toNumber()).toBeCloseTo(-0.015, 4);
  });

  it("records which version it supersedes", async () => {
    // Por el id de la v2 y no «el último de toda la base»: desde la Parte 2a (tarea 3), `tests/recetas/pasos.test.ts` crea
    // versiones a la vez en el mismo carril, y «el último» podía ser de otro archivo.
    const event = await prisma.auditEvent.findFirst({
      where: { operation: "process_recipe_version.create", entityId: v2Id },
      orderBy: { occurredAt: "desc" },
    });
    expect(event?.reason).toBe("supersedes_version_1");
  });

  it("shows version 1 as used by a run, so the page can refuse to treat it as scratch", async () => {
    const recipe = await getRecipeForEditor(admin, recipeId);
    const v1 = recipe.versions.find((v) => v.version === 1)!;
    const v2 = recipe.versions.find((v) => v.version === 2)!;
    expect(v1._count.fermentationRuns).toBe(1);
    expect(v2._count.fermentationRuns).toBe(0);
  });
});

describe("only the newest version is offered for a new run", () => {
  it("returns version 2 and not version 1", async () => {
    // Before versions could be created this returned everything approved,
    // which was the same thing because there was only ever one. The moment v2
    // exists, offering both asks the operator to know which is current.
    const mias = async () =>
      (await listRecipeVersionsForLot(admin, lotId)).filter((v) => v.recipeId === recipeId).map((v) => v.version);
    // Parte 2a (tarea 3): la v2 nace borrador, y un borrador no se ofrece: sigue la v1. Publicada, la v2 y sólo ella.
    expect(await mias()).toEqual([1]);
    await conUnPaso(v2Id);
    await publicarVersion(gestor, v2Id);
    expect(await mias()).toEqual([2]);
  });
});

describe("a new version is validated like a first one", () => {
  it("refuses an impossible value", async () => {
    await expect(
      createRecipeVersion(gestor, recipeId, [{ variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 15 }]),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses two targets for the same variable and moment", async () => {
    // The unique index would catch this as a P2002 the operator cannot read.
    // Catching it first names the actual mistake.
    await expect(
      createRecipeVersion(gestor, recipeId, [
        { variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 3.8 },
        { variable: "ph", moment: "final", phase: "fermentation" as const, unit: "pH", targetValue: 4.0 },
      ]),
    ).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("refuses an empty set of targets", async () => {
    await expect(createRecipeVersion(gestor, recipeId, [])).rejects.toBeInstanceOf(ProcessTargetError);
  });

  it("created no version when it refused", async () => {
    const recipe = await getRecipeForEditor(admin, recipeId);
    expect(recipe.versions.map((v) => v.version).sort()).toEqual([1, 2]);
  });
});

describe("R8 (Parte 1) — una versión nueva conserva las fases de la anterior", () => {
  // Otra receta, no la del fixture: ésa ya tiene v1 y v2, y las pruebas de arriba cuentan sus versiones.
  // Dos fases, no una: con una sola, una copia que se quedara con la primera fila pasaría igual, y la
  // de fermentación deja en `null` los tres campos de secado, que la copia tiene que dejar en `null`.
  const FASES_V1 = [
    { phase: "fermentation" as const, expectedHours: 72 },
    { phase: "drying" as const, expectedHours: 192, turnEveryHours: 1, targetMoistureMinPct: 11, targetMoistureMaxPct: 12 },
  ];
  const OBJETIVOS = (ph: number) => [
    { variable: "ph", moment: "final" as const, phase: "fermentation" as const, unit: "pH", targetValue: ph },
  ];
  /** Una fase como la ve quien la lee: números, no `Decimal`, y en orden de fase. */
  const comoSeLee = (fases: { phase: string; expectedHours: number | null; turnEveryHours: number | null; targetMoistureMinPct: { toNumber(): number } | null; targetMoistureMaxPct: { toNumber(): number } | null }[]) =>
    fases
      .map((f) => ({
        phase: f.phase,
        expectedHours: f.expectedHours,
        turnEveryHours: f.turnEveryHours,
        targetMoistureMinPct: f.targetMoistureMinPct?.toNumber() ?? null,
        targetMoistureMaxPct: f.targetMoistureMaxPct?.toNumber() ?? null,
      }))
      .sort((a, b) => a.phase.localeCompare(b.phase));

  let recetaId: string;
  let v1Fases: Awaited<ReturnType<typeof createRecipeWithVersion>>["versions"][number]["fases"];

  beforeAll(async () => {
    const r = await createRecipeWithVersion(gestor, {
      name: `RVER Natural fases ${RUN}`,
      organizationId,
      targets: OBJETIVOS(4),
      fases: FASES_V1,
    });
    recetaId = r.id;
    // Para que el `afterAll` borre también su auditoría, que limpia por `created.recipeIds`.
    created.recipeIds.push(r.id);
    created.versionIds.push(r.versions[0]!.id);
    v1Fases = r.versions[0]!.fases;
  });

  it("publicar una v2 sin fases copia las de la v1", async () => {
    const v2 = await createRecipeVersion(gestor, recetaId, OBJETIVOS(4.1));
    created.versionIds.push(v2.id);

    const secado = v2.fases.find((f) => f.phase === "drying");
    expect(secado?.turnEveryHours).toBe(1);
    expect(secado?.targetMoistureMinPct?.toNumber()).toBe(11);
    expect(secado?.targetMoistureMaxPct?.toNumber()).toBe(12);
    expect(secado?.expectedHours).toBe(192);

    // Cada campo de cada fase, y la fermentación con sus `null`: no sólo cuántas hay.
    expect(v1Fases.length).toBe(2);
    expect(comoSeLee(v2.fases)).toEqual(comoSeLee(v1Fases));
    // Son filas nuevas de la v2, no las de la v1 reasignadas: la v1 es inmutable.
    expect(v2.fases.map((f) => f.id).filter((id) => v1Fases.some((o) => o.id === id))).toEqual([]);
    const v1Despues = await prisma.processRecipePhase.count({ where: { recipeVersionId: v1Fases[0]!.recipeVersionId } });
    expect(v1Despues).toBe(2);
  });

  it("si recibe fases, reemplazan a las anteriores; un arreglo vacío significa «sin fases»", async () => {
    // Con el rango de humedad, y distinto del de la v1 (11–12) y no entero: la rama explícita de
    // `fasesDeLaVersion` tiene que escribir esos DOS campos, y un cruce (mínimo ← máximo) o un `null`
    // sólo se ve si cada extremo tiene un valor propio. Sin rango, la prueba esperaba `null` y no
    // distinguía un `null` escrito de uno que se perdió.
    const v3 = await createRecipeVersion(gestor, recetaId, OBJETIVOS(4.2), null, null, [
      { phase: "drying", expectedHours: 240, turnEveryHours: 2, targetMoistureMinPct: 10.5, targetMoistureMaxPct: 11.75 },
    ]);
    created.versionIds.push(v3.id);
    expect(comoSeLee(v3.fases)).toEqual([
      { phase: "drying", expectedHours: 240, turnEveryHours: 2, targetMoistureMinPct: 10.5, targetMoistureMaxPct: 11.75 },
    ]);

    const v4 = await createRecipeVersion(gestor, recetaId, OBJETIVOS(4.3), null, null, []);
    created.versionIds.push(v4.id);
    expect(v4.fases).toEqual([]);
  });

  it("las fases que recibe se validan como las de una receta nueva, y no crea versión si fallan", async () => {
    const versiones = () => prisma.processRecipeVersion.count({ where: { recipeId: recetaId } });
    const antes = await versiones();
    // Un rango de humedad invertido: la base no lo impide, es una regla del servicio (`validateFases`).
    await expect(
      createRecipeVersion(gestor, recetaId, OBJETIVOS(4.4), null, null, [
        { phase: "drying", targetMoistureMinPct: 12, targetMoistureMaxPct: 11 },
      ]),
    ).rejects.toBeInstanceOf(ProcessTargetError);
    expect(await versiones()).toBe(antes);
  });
});
