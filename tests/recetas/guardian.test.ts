/**
 * El guardián de pasos en las corridas y en los manejos de fermentación — Parte 2a, diseño §4.2 y §4.4 (tarea 7, 2026-10-03; anclada al
 * árbol de 2026-10-12, con #717 «tanques» y el PR-A dentro).
 * docs/superpowers/specs/2026-10-02-parte-2a-la-receta-con-pasos-design.md
 *
 * **Cada rechazo lleva su control al lado**: el mismo registro —sobre el mismo lote cuando se puede— con lo que sí vale. Sin
 * él, un rechazo por otra causa (un lote mal armado, un proceso cerrado, un catálogo sin sembrar) se leería como el guardián.
 *
 * **Las recetas se arman crudas**: la versión en borrador, sus pasos, y después publicada, que es el orden que la tarea 3 hace
 * cumplir; no con `agregarPaso`/`publicarVersion`, que piden `exigeAutoriaDeReceta` (el permiso del Coffee Process Manager,
 * Ruling A) y no cambian nada de lo que el guardián decide. Son de la organización del archivo, como exige `abrirProceso`
 * desde la tarea 5. Los tipos de paso son los del catálogo `tipo_paso` sembrado por la tarea 2.
 *
 * **Toda fermentación lleva `vesselNote`**: desde #717 (2c, «tanques», decisión D2 de Daniel) una fermentación nace con un tanque
 * registrado o con el nombre escrito de uno, y nunca con los dos vacíos. Aquí es siempre el nombre, con el RUN: así el `afterAll` las
 * encuentra aunque la prueba caiga antes de apuntarlas.
 *
 * **Usuario con ámbito acotado** (Farm Operator de su parcela), no Platform Admin: el guardián no pide más permiso que la
 * puerta, y nada aquí cuenta filas de toda la base. Y **quien NO debe** (una cuenta sin ninguna asignación) tiene su prueba en las
 * tres puertas (Ruling INV: `exigePasoCoherente` recibe sólo la transacción, así que su autorización está en quien la llama, y es
 * ahí donde se demuestra): el acceso al lote se pide ANTES que el guardián, y por eso quien no gestiona el lote recibe el rechazo
 * de acceso y no uno que le cuente qué hay en la receta.
 *
 * **La trilla es un control de no regresión, sin flip-test**: no pasa por el guardián (no es un registro de §4.1), así que
 * ninguna mutación del guardián la hace caer. Está porque el diseño la nombra (§4.4 y §8): si alguien conectara el
 * guardián a la trilla, caería.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { recordFermentationIntervention, startFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun } from "../../lib/traceability/drying";
import { registrarTrilla } from "../../lib/traceability/trilla";
import { recordQuantityEvent } from "../../lib/traceability/quantity";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import type { LotType, Prisma } from "../../generated/prisma/client";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `guardian-${Date.now()}`;
type Tipo = "prefermentacion" | "fermentation" | "inoculation" | "addition" | "washing" | "drying";
/** Los pasos de la receta con pasos, en este orden de `seq`. */
const ORDEN: readonly Tipo[] = ["prefermentacion", "fermentation", "inoculation", "addition", "washing", "drying"];
/** El nombre escrito del tanque de toda fermentación de este archivo (D2 de #717): lleva el RUN. */
const TANQUE = `TEST tanque ${RUN}`;

let orgId: string, plotId: string, scopeId: string, gestor: string, intruso: string;
/** La versión con pasos (la de los procesos), y una sin pasos. */
let conPasos: string, sinPasos: string;
/** El `drying` de OTRA receta con pasos de la misma organización. */
let pasoAjeno: string;
/** El id sembrado de `tipo_paso` de cada tipo que usa el archivo. */
const tipo = {} as Record<Tipo, string>;
/** Los pasos de `conPasos`, por tipo. */
const pasos = {} as Record<Tipo, string>;
/** Un valor que SE LLAMA `prefermentacion` y no es un tipo de paso (de un catálogo de prueba, con el RUN en su clave). */
let prefermentacionDeOtroCatalogo: string;
/** Las mediciones de cierre de los procesos crudos: se borran DESPUÉS de los procesos (RESTRICT). */
const mediciones: string[] = [];

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
/** Un lote de la parcela del archivo. Todo lote de la prueba lleva `RUN` en su código: el `afterAll` los encuentra por él. */
async function lote(codigo: string, lotType: LotType = "cherry") {
  return (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
}
async function enlazar(padres: string[], hijos: string[]) {
  await prisma.lotTransformation.create({ data: {
    transformationType: "stage_change", occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
}
const ahora = () => new Date();
async function valor(catalogo: string, v: string) {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } }, select: { id: true } })).id;
}
/** Un proceso de ANTES de la receta obligatoria (§5.1, transición R9): abierto y sin receta. Crudo, porque `abrirProceso`
 *  ya no lo deja abrir. */
async function procesoViejoSinReceta(lotId: string) {
  await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST viejo ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: await valor("grado_proceso", "Washed"),
    cherryStateValueId: await valor("estado_cereza", "despulpada"),
  } });
}
/** Un proceso CERRADO por humedad con la receta con pasos, crudo: la trilla ocurre con el proceso cerrado (§4.4). */
async function cerradoConPasos(lotId: string) {
  const m = (await prisma.measurement.create({ data: {
    variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor,
  } })).id;
  mediciones.push(m);
  await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST cerrado ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: await valor("grado_proceso", "Washed"),
    cherryStateValueId: await valor("estado_cereza", "despulpada"), processRecipeVersionId: conPasos,
    endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: m,
  } });
}
/** Cuántas fermentaciones o secados se llegaron a empezar con alguno de estos lotes de entrada. */
const corridasEmpezadasEn = (ids: string[]) =>
  prisma.lotTransformation.count({
    where: { inputs: { some: { lotId: { in: ids } } }, OR: [{ dryingRunId: { not: null } }, { fermentationRunId: { not: null } }] },
  });
/** Una fermentación abierta que cumple el paso `fermentation` de la receta con pasos, sobre un lote nuevo. */
async function fermentacionConPaso(codigo: string) {
  const l = await lote(codigo);
  await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
  return (await startFermentationRun(gestor, {
    lotId: l, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, recipeStepId: pasos.fermentation,
  })).run;
}

/**
 * El resultado de una promesa sin que llegue a rechazarse nunca (copiado de `corridaConProceso.test.ts`): mientras la prueba
 * espera a otra cosa, un registro que falla no deja un rechazo sin atender.
 */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: unknown };
const resultadoDe = <T>(p: Promise<T>): Promise<Resultado<T>> =>
  p.then((v) => ({ ok: true as const, valor: v }), (error: unknown) => ({ ok: false as const, error }));

/**
 * Una transacción AJENA que hace `trabajo` y se queda abierta hasta que se la suelte (copiado de `corridaConProceso.test.ts`).
 * `pid` es su proceso en la base, para preguntarle a `pg_blocking_pids` quién la espera. **Hay que llamar siempre a
 * `soltar()`, también si la prueba falla (en un `finally`)**: si no, el `afterAll` esperaría a lo que retiene.
 */
function retener(trabajo: (tx: Prisma.TransactionClient) => Promise<unknown>) {
  let soltar!: () => void;
  const suelta = new Promise<void>((resolver) => { soltar = resolver; });
  let tomado!: (pid: number) => void;
  let fallo!: (error: unknown) => void;
  const pid = new Promise<number>((resolver, rechazar) => { tomado = resolver; fallo = rechazar; });
  const hecho = prisma.$transaction(async (tx) => {
    try {
      await trabajo(tx);
      const [fila] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      tomado(fila!.pid);
    } catch (error) {
      fallo(error);
      throw error;
    }
    await suelta;
  }, { timeout: 30000, maxWait: 10000 });
  hecho.catch(() => undefined); // quien la espera la ve rechazarse al `await hecho`; esto sólo evita el rechazo sin atender
  return { pid, soltar, hecho };
}

/** Se OBSERVA en la base que alguien espera a la sesión `pid`, en vez de inferirlo de que algo tarda. */
async function esperarQueAlguienEspere(pid: number, mensaje: string) {
  let esperando = 0;
  for (let intento = 0; intento < 100 && esperando === 0; intento++) {
    const [fila] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pid}::int = ANY(pg_blocking_pids(pid))`;
    esperando = fila!.n;
    if (esperando === 0) await new Promise((r) => setTimeout(r, 50));
  }
  expect(esperando, mensaje).toBeGreaterThan(0);
}

/** Las dos puertas que empiezan una corrida, con la misma firma para probar las dos con el mismo cuerpo. */
type Extra = { recipeStepId?: string | null; motivoDesviacion?: string | null };
type Corrida = { id: string; recipeStepId: string | null; stepTypeValueId: string | null; motivoDesviacion: string | null };
const EMPEZAR: { nombre: string; clave: string; suPaso: () => string; empezar: (lotId: string, extra?: Extra) => Promise<{ run: Corrida }> }[] = [
  {
    nombre: "el secado", clave: "SEC", suPaso: () => pasos.drying,
    empezar: (lotId, extra = {}) => startDryingRun(gestor, { lotId, startedAt: ahora(), provenanceClass: "original_record", method: `TEST secado ${RUN}`, ...extra }),
  },
  {
    nombre: "la fermentación", clave: "FER", suPaso: () => pasos.fermentation,
    empezar: (lotId, extra = {}) => startFermentationRun(gestor, { lotId, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, ...extra }),
  },
];

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  // Sin ninguna asignación: quien NO debe poder gestionar el lote.
  intruso = await cuenta("Intruso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });

  for (const t of ORDEN) tipo[t] = await valor("tipo_paso", t);

  /** Una receta de la organización con su versión: en borrador, sus pasos en orden, y publicada. */
  const receta = async (nombre: string, tipos: readonly Tipo[]) => {
    const r = await prisma.processRecipe.create({ data: { name: `TEST ${nombre} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
    const v = await prisma.processRecipeVersion.create({ data: { recipeId: r.id, version: 1, status: "draft", createdBy: gestor } });
    const ids: string[] = [];
    for (const [i, t] of tipos.entries()) {
      ids.push((await prisma.processRecipeStep.create({ data: { recipeVersionId: v.id, seq: i + 1, stepTypeValueId: tipo[t] } })).id);
    }
    await prisma.processRecipeVersion.update({ where: { id: v.id }, data: { status: "approved" } });
    return { versionId: v.id, pasoIds: ids };
  };
  const a = await receta("Con pasos", ORDEN);
  conPasos = a.versionId;
  for (const [i, t] of ORDEN.entries()) pasos[t] = a.pasoIds[i]!;
  pasoAjeno = (await receta("Otra con pasos", ["drying"])).pasoIds[0]!;
  sinPasos = (await receta("Sin pasos", [])).versionId;

  const otroCatalogo = (await prisma.variableCatalog.create({ data: { key: `test_otro_${RUN}`, name: `TEST otro ${RUN}` } })).id;
  prefermentacionDeOtroCatalogo = (await prisma.variableCatalogValue.create({ data: { catalogId: otroCatalogo, value: "prefermentacion" } })).id;
}, 60000);

afterAll(async () => {
  // La limpieza DESCUBRE lo que borra, no lo hereda del `beforeAll`: si éste muere antes de asignar `orgId`, `plotId`, `gestor`…
  // esas variables siguen `undefined`, `assertDefinedWhere` lanza y abandona las filas que quedan. Todo sale de la marca del RUN: la
  // organización por su nombre, de ella sus ubicaciones y sus lotes; las personas por su `displayName` y de ellas las cuentas; de las
  // ubicaciones, los ámbitos; las corridas, por el nombre del tanque o el método con el RUN y por las transformaciones de los lotes; el
  // catálogo de prueba, por su clave. (CLAUDE.md del repositorio, «Una limpieza que se apoya en una variable del fixture no corre si el
  // `beforeAll` muere antes».)
  const ids = <T extends { id: string }>(filas: T[]) => filas.map((f) => f.id);
  const organizaciones = ids(await prisma.organization.findMany({ where: assertDefinedWhere({ name: { startsWith: `TEST ${RUN}` } }), select: { id: true } }));
  const ubicaciones = ids(await prisma.location.findMany({
    where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }), select: { id: true },
  }));
  const personas = ids(await prisma.person.findMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }), select: { id: true } }));
  const cuentas = ids(await prisma.userAccount.findMany({ where: assertDefinedWhere({ personId: { in: personas } }), select: { id: true } }));
  const ambitos = ids(await prisma.scope.findMany({
    where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: ubicaciones } }), select: { id: true },
  }));
  // Todos los lotes de la organización, también los que crean las puertas (el verde de la trilla): por organización y por su código.
  const todos = ids(await prisma.lot.findMany({
    where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { lotCode: { contains: RUN } }] }), select: { id: true },
  }));
  const trans = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: todos } } } }, { outputs: { some: { lotId: { in: todos } } } }] }),
    select: { id: true, fermentationRunId: true, dryingRunId: true },
  });
  const tIds = trans.map((t) => t.id);
  const ferm = [...new Set([
    ...trans.map((t) => t.fermentationRunId).filter((x): x is string => x !== null),
    ...ids(await prisma.fermentationRun.findMany({ where: assertDefinedWhere({ vesselNote: { contains: RUN } }), select: { id: true } })),
  ])];
  const sec = [...new Set([
    ...trans.map((t) => t.dryingRunId).filter((x): x is string => x !== null),
    ...ids(await prisma.dryingRun.findMany({ where: assertDefinedWhere({ method: { contains: RUN } }), select: { id: true } })),
  ])];
  const idsDeProcesos = ids(await prisma.lotProcess.findMany({ where: assertDefinedWhere({ lotId: { in: todos } }), select: { id: true } }));
  const catalogos = ids(await prisma.variableCatalog.findMany({ where: assertDefinedWhere({ key: { contains: RUN } }), select: { id: true } }));
  // 1. Los manejos, ANTES que sus corridas (RESTRICT) y que la receta (su `recipe_step_id` es RESTRICT).
  await prisma.fermentationIntervention.deleteMany({ where: assertDefinedWhere({ fermentationRunId: { in: ferm } }) });
  // 2. Los procesos, antes que sus mediciones de cierre (RESTRICT) y que sus lotes; las corridas los referencian con SET NULL.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: mediciones } }, { lotId: { in: todos } }] }) });
  // 3. La trilla: el subproducto y los movimientos de cantidad cuelgan de la transformación y de los lotes.
  await prisma.byproductBatch.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
  // 4. Las corridas, ANTES que la receta: su `recipe_step_id` es RESTRICT.
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: ferm } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  // 5. Las recetas de la organización (las versiones caen en cascada con la receta, y los pasos con la versión). Por organización y
  //    no sólo por nombre: con `process_recipe.organization_id` en RESTRICT, una receta viva haría FALLAR el borrado de la organización.
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] }) });
  await prisma.variableCatalogValue.deleteMany({ where: assertDefinedWhere({ catalogId: { in: catalogos } }) });
  await prisma.variableCatalog.deleteMany({ where: assertDefinedWhere({ id: { in: catalogos } }) });
  // 6. Lo que firmaron las cuentas y nada de arriba borró (`…_run.start`, `lot_transformation.create`, `fermentation_intervention.record`,
  //    cantidades…). Antes de borrar las cuentas: el actor es SET NULL y después no se encontrarían. Luego, en el orden de las claves
  //    ajenas: asignaciones y ámbitos, cuentas y personas, ubicaciones y, la última, la organización.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  // 7. Contar lo que queda del RUN: «limpió» y «pasó» no son lo mismo. Si algo sobra, el archivo FALLA aquí, con la tabla y la cuenta.
  const restos: [string, number][] = [
    ["organization", await prisma.organization.count({ where: { OR: [{ id: { in: organizaciones } }, { name: { startsWith: `TEST ${RUN}` } }] } })],
    ["location", await prisma.location.count({ where: { OR: [{ id: { in: ubicaciones } }, { name: { contains: RUN } }] } })],
    ["scope", await prisma.scope.count({ where: { id: { in: ambitos } } })],
    ["person", await prisma.person.count({ where: { OR: [{ id: { in: personas } }, { displayName: { contains: RUN } }] } })],
    ["userAccount", await prisma.userAccount.count({ where: { id: { in: cuentas } } })],
    ["assignment", await prisma.assignment.count({ where: { OR: [{ userAccountId: { in: cuentas } }, { scopeId: { in: ambitos } }] } })],
    ["lot", await prisma.lot.count({ where: { OR: [{ id: { in: todos } }, { lotCode: { contains: RUN } }] } })],
    ["lotProcess", await prisma.lotProcess.count({ where: { lotId: { in: todos } } })],
    ["fermentationRun", await prisma.fermentationRun.count({ where: { OR: [{ id: { in: ferm } }, { vesselNote: { contains: RUN } }] } })],
    ["fermentationIntervention", await prisma.fermentationIntervention.count({ where: { fermentationRunId: { in: ferm } } })],
    ["dryingRun", await prisma.dryingRun.count({ where: { OR: [{ id: { in: sec } }, { method: { contains: RUN } }] } })],
    ["measurement", await prisma.measurement.count({ where: { OR: [{ id: { in: mediciones } }, { lotId: { in: todos } }] } })],
    ["quantityEvent", await prisma.quantityEvent.count({ where: { lotId: { in: todos } } })],
    ["byproductBatch", await prisma.byproductBatch.count({ where: { transformationId: { in: tIds } } })],
    ["lotTransformation", await prisma.lotTransformation.count({ where: { id: { in: tIds } } })],
    ["processRecipe", await prisma.processRecipe.count({ where: { OR: [{ organizationId: { in: organizaciones } }, { name: { contains: RUN } }] } })],
    ["variableCatalog", await prisma.variableCatalog.count({ where: { OR: [{ id: { in: catalogos } }, { key: { contains: RUN } }] } })],
    ["auditEvent (de las cuentas)", await prisma.auditEvent.count({ where: { actorUserAccountId: { in: cuentas } } })],
    ["auditEvent (procesos)", await prisma.auditEvent.count({ where: { entityType: "lot_process", entityId: { in: idsDeProcesos } } })],
  ];
  const sobran = restos.filter(([, n]) => n > 0);
  if (sobran.length > 0) throw new Error(`guardian.test: la limpieza dejó filas del RUN ${RUN}: ${sobran.map(([tabla, n]) => `${tabla}=${n}`).join(", ")}`);
}, 60000);

describe("§4.2 — el paso es de la receta del proceso, y de un tipo que el registro cumple", () => {
  it("un secado con un paso de OTRA receta se rechaza «paso_de_otra_receta» sin escribir nada; con el «drying» de la suya empieza unido a él, con su tipo y sin motivo", async () => {
    const l = await lote("G1");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    // El paso ajeno es un `drying`: el tipo cuadra, así que sólo la regla de la receta puede rechazarlo.
    await expect(
      startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", method: `TEST secado ${RUN}`, recipeStepId: pasoAjeno }),
    ).rejects.toThrow(new LotProcessError("paso_de_otra_receta"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    // Control: el mismo lote, el mismo proceso, el paso de SU receta.
    const { run } = await startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", method: `TEST secado ${RUN}`, recipeStepId: pasos.drying });
    expect(run.recipeStepId).toBe(pasos.drying);
    expect(run.stepTypeValueId).toBe(tipo.drying);
    expect(run.motivoDesviacion).toBeNull();
  });

  it("un secado con un paso «washing» de su MISMA receta se rechaza «paso_no_corresponde» (no lo tapa la regla de la receta); con el «drying», empieza", async () => {
    const l = await lote("G2");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    await expect(
      startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", method: `TEST secado ${RUN}`, recipeStepId: pasos.washing }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    const { run } = await startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", method: `TEST secado ${RUN}`, recipeStepId: pasos.drying });
    expect(run.recipeStepId).toBe(pasos.drying);
  });

  it("una fermentación que declara «fermentation» sobre un paso «prefermentacion» se rechaza «paso_no_corresponde»; sin declarar, toma «prefermentacion» del paso", async () => {
    const l = await lote("G3");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    await expect(
      startFermentationRun(gestor, {
        lotId: l, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, recipeStepId: pasos.prefermentacion, stepTypeValueId: tipo.fermentation,
      }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    const { run } = await startFermentationRun(gestor, {
      lotId: l, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, recipeStepId: pasos.prefermentacion,
    });
    expect(run.recipeStepId).toBe(pasos.prefermentacion);
    expect(run.stepTypeValueId).toBe(tipo.prefermentacion);
  });

  /**
   * El tipo que declara la corrida se compara con el de su paso SIN distinguir mayúsculas (un uuid no las distingue: `UUID` lleva
   * `/i`, y la base devuelve el id en minúsculas). Sin esa comparación en minúsculas, quien declara —con el uuid en mayúsculas— el
   * tipo de su PROPIO paso se rechazaría «paso_no_corresponde». La única prueba de mayúsculas de arriba pasa el `recipeStepId` en
   * mayúsculas, no el `stepTypeValueId`: no ve esta comparación (mutación: quitar el `.toLowerCase()` del guardián).
   *
   * El control es el mismo caso con un tipo DISTINTO, también en mayúsculas: sigue rechazándose, así que «se acepta» no es «se
   * acepta todo lo que venga en mayúsculas».
   */
  it("el tipo declarado se compara con el de su paso sin distinguir mayúsculas: el uuid del tipo del PROPIO paso, en mayúsculas, empieza y se guarda en minúsculas; el de otro tipo, también en mayúsculas, sigue «paso_no_corresponde»", async () => {
    const l = await lote("G3B");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    const delPaso = tipo.prefermentacion.toUpperCase();
    const deOtroTipo = tipo.fermentation.toUpperCase();
    // Sin esto, «en mayúsculas» podría ser el mismo texto que en minúsculas y la prueba no distinguiría nada.
    expect(delPaso, "el uuid del tipo no tiene ninguna letra: la prueba no distinguiría mayúsculas").not.toBe(tipo.prefermentacion);
    expect(deOtroTipo, "el uuid del otro tipo no tiene ninguna letra: el control no distinguiría mayúsculas").not.toBe(tipo.fermentation);
    const base = { lotId: l, startedAt: ahora(), provenanceClass: "original_record" as const, vesselNote: TANQUE, recipeStepId: pasos.prefermentacion };
    // Control: un tipo que NO es el de su paso, en mayúsculas, se rechaza por ser otro tipo y no por venir en mayúsculas.
    await expect(startFermentationRun(gestor, { ...base, stepTypeValueId: deOtroTipo })).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    // El caso: el tipo de su propio paso, en mayúsculas, empieza unido al paso...
    const { run } = await startFermentationRun(gestor, { ...base, stepTypeValueId: delPaso });
    expect(run.recipeStepId).toBe(pasos.prefermentacion);
    // ...y lo guardado es el id en minúsculas: se lee la FILA, no sólo lo que devolvió el `create`.
    const fila = await prisma.fermentationRun.findUniqueOrThrow({ where: { id: run.id }, select: { recipeStepId: true, stepTypeValueId: true, motivoDesviacion: true } });
    expect(fila.stepTypeValueId).toBe(tipo.prefermentacion);
    expect(fila.stepTypeValueId).not.toBe(delPaso);
    expect(fila.recipeStepId).toBe(pasos.prefermentacion);
    expect(fila.motivoDesviacion).toBeNull();
  });

  it("sin paso, una fermentación no puede declarar un tipo que no cumple («drying») ni un valor de otro catálogo que se llame como un tipo («paso_no_corresponde»); declarando «prefermentacion» y con motivo, empieza con ese tipo", async () => {
    const l = await lote("G4");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    const motivoDesviacion = `TEST: la fiebre no estaba en la receta ${RUN}`;
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, stepTypeValueId: tipo.drying, motivoDesviacion }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, stepTypeValueId: prefermentacionDeOtroCatalogo, motivoDesviacion }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    const { run } = await startFermentationRun(gestor, {
      lotId: l, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, stepTypeValueId: tipo.prefermentacion, motivoDesviacion,
    });
    expect(run.recipeStepId).toBeNull();
    expect(run.stepTypeValueId).toBe(tipo.prefermentacion);
    expect(run.motivoDesviacion).toBe(motivoDesviacion);
  });

  it("un id que no es un uuid se dice igual que «no existe» y no es un error de la base: un paso así es «paso_de_otra_receta» y un tipo así «paso_no_corresponde»; el paso de verdad, también en mayúsculas, empieza", async () => {
    const l = await lote("G4B");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    const base = { lotId: l, startedAt: ahora(), provenanceClass: "original_record" as const, vesselNote: TANQUE };
    await expect(startFermentationRun(gestor, { ...base, recipeStepId: "no-es-un-uuid" })).rejects.toThrow(new LotProcessError("paso_de_otra_receta"));
    await expect(
      startFermentationRun(gestor, { ...base, stepTypeValueId: "no-es-un-uuid", motivoDesviacion: `TEST: un tipo que no existe ${RUN}` }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    // Control: el mismo lote y el mismo proceso, con el paso de verdad. En mayúsculas apunta a la misma fila (un uuid no distingue
    // mayúsculas), así que no se rechaza como si no fuera uno.
    const { run } = await startFermentationRun(gestor, { ...base, recipeStepId: pasos.fermentation.toUpperCase() });
    expect(run.recipeStepId).toBe(pasos.fermentation);
  });

  it("dentro de una fermentación, una adición no cumple un paso de inoculación («paso_no_corresponde»); la inoculación sí, y lleva el tipo del paso", async () => {
    const run = await fermentacionConPaso("G5");
    await expect(
      recordFermentationIntervention(gestor, { fermentationRunId: run.id, interventionType: "addition", occurredAt: ahora(), recipeStepId: pasos.inoculation }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    expect(await prisma.fermentationIntervention.count({ where: { fermentationRunId: run.id } })).toBe(0);
    const manejo = await recordFermentationIntervention(gestor, {
      fermentationRunId: run.id, interventionType: "inoculation", occurredAt: ahora(), recipeStepId: pasos.inoculation,
    });
    expect(manejo.recipeStepId).toBe(pasos.inoculation);
    expect(manejo.stepTypeValueId).toBe(tipo.inoculation);
    expect(manejo.motivoDesviacion).toBeNull();
  });
});

describe("§4.4 — sin paso bajo una receta con pasos es una desviación: exige motivo y no bloquea", () => {
  for (const { nombre, clave, suPaso, empezar } of EMPEZAR) {
    it(`sin paso y sin motivo —o con uno en blanco— ${nombre} se rechaza «desviacion_sin_motivo»; con motivo empieza, sin paso y con el motivo`, async () => {
      const l = await lote(`D1-${clave}`);
      await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
      await expect(empezar(l)).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
      await expect(empezar(l, { motivoDesviacion: "   " })).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
      expect(await corridasEmpezadasEn([l])).toBe(0);
      const motivo = `TEST: el patio de la receta estaba ocupado ${RUN}`;
      const { run } = await empezar(l, { motivoDesviacion: `  ${motivo}  ` });
      expect(run.recipeStepId).toBeNull();
      expect(run.motivoDesviacion).toBe(motivo);
    });

    it(`bajo una receta SIN pasos ${nombre} empieza sin paso ni motivo, y un motivo que llegue no se guarda`, async () => {
      const l = await lote(`D2-${clave}`);
      await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: sinPasos });
      const { run } = await empezar(l);
      expect(run.recipeStepId).toBeNull();
      expect(run.motivoDesviacion).toBeNull();
      const otro = await lote(`D2B-${clave}`);
      await abrirProcesoDePrueba(gestor, otro, { processRecipeVersionId: sinPasos });
      const conMotivo = await empezar(otro, { motivoDesviacion: `TEST: no hacía falta ${RUN}` });
      expect(conMotivo.run.motivoDesviacion).toBeNull();
    });

    it(`bajo un proceso viejo SIN receta (R9) ${nombre} empieza sin paso ni motivo; un paso pedido a mano no es de su receta`, async () => {
      const l = await lote(`D3-${clave}`);
      await procesoViejoSinReceta(l);
      await expect(empezar(l, { recipeStepId: suPaso() })).rejects.toThrow(new LotProcessError("paso_de_otra_receta"));
      expect(await corridasEmpezadasEn([l])).toBe(0);
      const { run } = await empezar(l);
      expect(run.recipeStepId).toBeNull();
      expect(run.motivoDesviacion).toBeNull();
    });
  }

  /**
   * La transición R9 (§5.1, decisión D6 del cruce, 2026-10-04): los procesos de ANTES de la receta obligatoria no tienen
   * receta, así que nada que cumplir ni que desviar; pero una corrida SÍ puede declarar de qué tipo de paso es, y ese tipo
   * se guarda —la pantalla lo ofrece también ahí (tarea 13)—. Sólo se declara en la fermentación: un secado cumple un único
   * tipo y no lo declara. El control es la misma corrida sin declarar, que queda sin tipo: sin él, «lo guarda» no se
   * distinguiría de «lo inventa».
   */
  it("el tipo declarado se guarda bajo un proceso viejo SIN receta (R9), sin paso ni motivo; sin declararlo, la corrida queda sin tipo", async () => {
    const declarada = await lote("R9-DECLARA");
    await procesoViejoSinReceta(declarada);
    const { run } = await startFermentationRun(gestor, {
      lotId: declarada, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, stepTypeValueId: tipo.prefermentacion,
    });
    expect([run.recipeStepId, run.stepTypeValueId, run.motivoDesviacion]).toEqual([null, tipo.prefermentacion, null]);
    const sinDeclarar = await lote("R9-NODECLARA");
    await procesoViejoSinReceta(sinDeclarar);
    const control = await startFermentationRun(gestor, { lotId: sinDeclarar, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE });
    expect([control.run.recipeStepId, control.run.stepTypeValueId, control.run.motivoDesviacion]).toEqual([null, null, null]);
  });

  it("una inoculación sin paso exige motivo; con motivo se registra marcada y con su tipo de paso", async () => {
    const run = await fermentacionConPaso("D4");
    await expect(
      recordFermentationIntervention(gestor, { fermentationRunId: run.id, interventionType: "inoculation", occurredAt: ahora() }),
    ).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
    expect(await prisma.fermentationIntervention.count({ where: { fermentationRunId: run.id } })).toBe(0);
    const motivo = `TEST: se inoculó con una cepa que la receta no pedía ${RUN}`;
    const manejo = await recordFermentationIntervention(gestor, {
      fermentationRunId: run.id, interventionType: "inoculation", occurredAt: ahora(), motivoDesviacion: motivo,
    });
    expect(manejo.recipeStepId).toBeNull();
    expect(manejo.stepTypeValueId).toBe(tipo.inoculation);
    expect(manejo.motivoDesviacion).toBe(motivo);
  });

  it("un manejo que no cumple pasos (agitar) no es desviación: sin paso ni motivo se registra; con un paso, «paso_no_corresponde»", async () => {
    const run = await fermentacionConPaso("D5");
    await expect(
      recordFermentationIntervention(gestor, { fermentationRunId: run.id, interventionType: "agitation", occurredAt: ahora(), recipeStepId: pasos.fermentation }),
    ).rejects.toThrow(new LotProcessError("paso_no_corresponde"));
    const manejo = await recordFermentationIntervention(gestor, { fermentationRunId: run.id, interventionType: "agitation", occurredAt: ahora() });
    expect(manejo.recipeStepId).toBeNull();
    expect(manejo.stepTypeValueId).toBeNull();
    expect(manejo.motivoDesviacion).toBeNull();
  });

  it("una trilla bajo un proceso cuya receta tiene pasos no pide motivo: no es un registro de §4.1 (control de no regresión, sin flip)", async () => {
    const pergamino = await lote("D6", "parchment");
    await cerradoConPasos(pergamino);
    await recordQuantityEvent(gestor, {
      lotId: pergamino, eventType: "received", quantity: 100, unit: "kg", occurredAt: new Date("2026-03-22T12:00:00Z"), provenanceClass: "measured_fact",
    });
    const r = await registrarTrilla(gestor, {
      lotePergaminoId: pergamino, masaEntradaKg: 100, loteVerde: { lotCode: `D6-VERDE-${RUN}`, masaKg: 80 }, cascarillaKg: 18, mermaKg: 2,
      producedAtLocationId: plotId, occurredAt: new Date("2026-03-23T12:00:00Z"), provenanceClass: "original_record",
    });
    expect(r.transformacion.transformationType).toBe("hulling");
  }, 20000);
});

/**
 * Ruling INV (2026-10-12): `exigePasoCoherente` toca datos de lote y de receta y recibe SÓLO la transacción, como el resto de la
 * familia «reciben transacción»: su autorización está en las tres puertas que la llaman. Aquí se demuestra, puerta por puerta, que
 * (1) quien NO gestiona el lote recibe el rechazo de ACCESO —no uno del guardián, que le contaría qué pasos tiene la receta ni si hay
 * desviación—, sin que se escriba nada; y (2) el control: quien SÍ lo gestiona, con exactamente lo mismo, llega al guardián. Si alguien
 * moviera el guardián antes del acceso, o quitara el acceso, la primera mitad caería por su nombre.
 */
describe("el acceso al lote se pide ANTES que el guardián (quien no debe no llega a él)", () => {
  it("el secado: una cuenta sin ningún ámbito recibe «no_lot_access» aunque el paso sea de otra receta; el gestor, con lo mismo, llega al guardián", async () => {
    const l = await lote("A1");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    const pedido = { lotId: l, startedAt: ahora(), provenanceClass: "original_record" as const, method: `TEST secado ${RUN}`, recipeStepId: pasoAjeno };
    await expect(startDryingRun(intruso, pedido)).rejects.toThrow(new TraceabilityAccessError("no_lot_access"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    await expect(startDryingRun(gestor, pedido)).rejects.toThrow(new LotProcessError("paso_de_otra_receta"));
  });

  it("la fermentación: una cuenta sin ningún ámbito recibe «no_lot_access» aunque falte el motivo de la desviación; el gestor, con lo mismo, llega al guardián", async () => {
    const l = await lote("A2");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: conPasos });
    const pedido = { lotId: l, startedAt: ahora(), provenanceClass: "original_record" as const, vesselNote: TANQUE };
    await expect(startFermentationRun(intruso, pedido)).rejects.toThrow(new TraceabilityAccessError("no_lot_access"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
    await expect(startFermentationRun(gestor, pedido)).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
  });

  it("el manejo: una cuenta sin ningún ámbito recibe «no_lot_access» aunque falte el motivo de la desviación; el gestor, con lo mismo, llega al guardián", async () => {
    const run = await fermentacionConPaso("A3");
    const pedido = { fermentationRunId: run.id, interventionType: "inoculation" as const, occurredAt: ahora() };
    await expect(recordFermentationIntervention(intruso, pedido)).rejects.toThrow(new TraceabilityAccessError("no_lot_access"));
    expect(await prisma.fermentationIntervention.count({ where: { fermentationRunId: run.id } })).toBe(0);
    await expect(recordFermentationIntervention(gestor, pedido)).rejects.toThrow(new LotProcessError("desviacion_sin_motivo"));
  });
});

describe("recordFermentationIntervention decide dentro de una transacción, con el linaje bloqueado, y deja su evento", () => {
  it("escribe su evento «fermentation_intervention.record» con la fila entera; sobre una corrida terminada se rechaza sin escribir nada", async () => {
    const run = await fermentacionConPaso("T1");
    const manejo = await recordFermentationIntervention(gestor, {
      fermentationRunId: run.id, interventionType: "inoculation", occurredAt: ahora(), recipeStepId: pasos.inoculation,
    });
    const eventos = await prisma.auditEvent.findMany({ where: { entityType: "fermentation_intervention", entityId: manejo.id } });
    expect(eventos.map((e) => e.operation)).toEqual(["fermentation_intervention.record"]);
    expect(eventos[0]!.actorUserAccountId).toBe(gestor);
    expect(JSON.stringify(eventos[0]!.after)).toContain(pasos.inoculation);

    // Terminada en crudo: aquí sólo importa que la corrida ya no esté abierta.
    await prisma.fermentationRun.update({ where: { id: run.id }, data: { endedAt: ahora() } });
    await expect(
      recordFermentationIntervention(gestor, { fermentationRunId: run.id, interventionType: "agitation", occurredAt: ahora() }),
    ).rejects.toThrow(new TraceabilityAccessError("fermentation_run_already_ended"));
    expect(await prisma.fermentationIntervention.count({ where: { fermentationRunId: run.id } })).toBe(1);
  });

  it("decide DESPUÉS de tener el linaje: si otra transacción termina la corrida mientras espera, se rechaza «fermentation_run_already_ended» y no escribe nada", async () => {
    const abuelo = await lote("T2-ABUELO");
    const hijo = await lote("T2-HIJO");
    await enlazar([abuelo], [hijo]);
    await abrirProcesoDePrueba(gestor, abuelo, { processRecipeVersionId: conPasos });
    const { run } = await startFermentationRun(gestor, {
      lotId: hijo, startedAt: ahora(), provenanceClass: "original_record", vesselNote: TANQUE, recipeStepId: pasos.fermentation,
    });

    // Otra transacción toma la fila del ABUELO (la que `bloquearLinaje` del manejo necesita) y, dentro de ella, TERMINA la
    // corrida en crudo. Todavía no confirma: quien lea ahora la ve abierta. Sin el bloqueo, el manejo no espera a nadie —su
    // clave foránea a la corrida (`FOR KEY SHARE`) no choca con la actualización de `ended_at` (`FOR NO KEY UPDATE`)—.
    const termina = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${abuelo}::uuid FOR UPDATE`;
      await tx.fermentationRun.update({ where: { id: run.id }, data: { endedAt: new Date() } });
    });
    let manejo: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await termina.pid;
      manejo = resultadoDe(recordFermentationIntervention(gestor, {
        fermentationRunId: run.id, interventionType: "inoculation", occurredAt: ahora(), recipeStepId: pasos.inoculation,
      }));
      await esperarQueAlguienEspere(pid, "el manejo no esperó la fila del ancestro: no bloqueó el linaje");
      termina.soltar();
      await termina.hecho; // COMMIT: la corrida queda terminada
      const v = await manejo;
      expect(v.ok, "el manejo se registró sobre una corrida que otra transacción terminó mientras él esperaba").toBe(false);
      if (!v.ok) {
        expect(v.error).toBeInstanceOf(TraceabilityAccessError);
        expect((v.error as Error).message).toBe("fermentation_run_already_ended");
      }
      // Control: la otra transacción sí terminó la corrida; sin esto, «rechazó» podría ser cualquier otra razón.
      expect((await prisma.fermentationRun.findUniqueOrThrow({ where: { id: run.id } })).endedAt).not.toBeNull();
      expect(await prisma.fermentationIntervention.count({ where: { fermentationRunId: run.id } })).toBe(0);
    } finally {
      termina.soltar();
      await termina.hecho.catch(() => undefined);
      await manejo;
    }
  });
});
