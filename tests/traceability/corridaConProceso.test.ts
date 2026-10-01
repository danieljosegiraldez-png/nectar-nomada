/**
 * R3 y R4 de la Parte 1: una corrida se une sola al proceso que cubre a su lote; sin proceso abierto
 * no empieza; la fermentación lleva la receta del proceso y no otra.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { startFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun } from "../../lib/traceability/drying";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `corrida-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string, intruso: string;
/** Una segunda parcela con un usuario que SÓLO la gestiona a ella: R3 dice que el permiso es sobre el
 *  lote de la corrida, nunca sobre el lote donde vive el proceso. */
let plotB: string, scopeB: string, soloB: string;
let recetaVersionId: string, otraVersionId: string;
const lotes: string[] = [];
const transformaciones: string[] = [];

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function lote(codigo: string, locationId: string = plotId) {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType: "cherry", organizationId: orgId, locationId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
async function enlazar(padres: string[], hijos: string[], tipo: "stage_change" | "split" | "merge" = "stage_change") {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: tipo, occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
  return t.id;
}
const ahora = () => new Date();

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  intruso = await cuenta("Intruso");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  plotB = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot B ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  soloB = await cuenta("SoloB");
  scopeB = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotB } })).id;
  await prisma.assignment.create({ data: { userAccountId: soloB, roleProfileId: farm.id, scopeId: scopeB } });
  const receta = await prisma.processRecipe.create({ data: { name: `TEST Lavado ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
  recetaVersionId = (await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor } })).id;
  otraVersionId = (await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 2, status: "approved", createdBy: gestor } })).id;
}, 60000);

afterAll(async () => {
  const corridas = await prisma.lotTransformation.findMany({
    where: { inputs: { some: { lotId: { in: lotes } } } },
    select: { id: true, fermentationRunId: true, dryingRunId: true },
  });
  const ids = corridas.map((c) => c.id);
  // Los procesos primero: uno cerrado por división referencia a su transformación (RESTRICT), y las
  // corridas sólo lo referencian con SET NULL, así que el orden con ellas no importa.
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: [...ids, ...transformaciones] } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: [...ids, ...transformaciones] } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: [...ids, ...transformaciones] } }) });
  const ferm = corridas.map((c) => c.fermentationRunId).filter((x): x is string => x !== null);
  const sec = corridas.map((c) => c.dryingRunId).filter((x): x is string => x !== null);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ferm, ...sec] } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: ferm } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });
  // Los eventos de apertura de proceso (`lot_process.open`) cuelgan del proceso, no de la corrida: se
  // borran por quien los escribió. Cubre también los `…run.start` de arriba.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [gestor, intruso, soloB] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId: { in: [scopeId, scopeB] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [scopeId, scopeB] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gestor, intruso, soloB] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotId, plotB] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R3 — la corrida se une sola, y sin proceso no empieza", () => {
  it("quien gestiona el hijo y NO el lote del proceso puede empezar: el permiso es sobre el lote de la corrida", async () => {
    const abuelo = await lote("R3-PARCELA-A");
    const hijo = await lote("R3-PARCELA-B", plotB);
    await enlazar([abuelo], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, abuelo);
    const { run } = await startDryingRun(soloB, { lotId: hijo, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.lotProcessId).toBe(p.id);
  });

  it("sin proceso abierto, empezar una fermentación se rechaza con nombre", async () => {
    const l = await lote("R3-SIN");
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
  });

  it("un secado en el nieto queda unido al proceso del abuelo", async () => {
    const abuelo = await lote("R3-ABUELO");
    const hijo = await lote("R3-HIJO");
    const nieto = await lote("R3-NIETO");
    await enlazar([abuelo], [hijo]);
    await enlazar([hijo], [nieto]);
    const p = await abrirProcesoDePrueba(gestor, abuelo);
    const { run } = await startDryingRun(gestor, { lotId: nieto, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.lotProcessId).toBe(p.id);
    // Sin evento nuevo: el `after` del start ya lleva el proceso.
    const eventos = await prisma.auditEvent.findMany({ where: { entityType: "drying_run", entityId: run.id } });
    expect(eventos.map((e) => e.operation)).toEqual(["drying_run.start"]);
    expect(JSON.stringify(eventos[0]!.after)).toContain(p.id);
  });

  it("la fermentación queda unida al proceso, sin evento de auditoría nuevo", async () => {
    const l = await lote("R3-FERM");
    const p = await abrirProcesoDePrueba(gestor, l);
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.lotProcessId).toBe(p.id);
    const eventos = await prisma.auditEvent.findMany({ where: { entityType: "fermentation_run", entityId: run.id } });
    expect(eventos.map((e) => e.operation)).toEqual(["fermentation_run.start"]);
    expect(JSON.stringify(eventos[0]!.after)).toContain(p.id);
  });

  it("un lote dividido no empieza una corrida: sale lote_dividido y no sin_proceso_abierto", async () => {
    const x = await lote("R3-DIV");
    const x1 = await lote("R3-DIV1");
    const t = await enlazar([x], [x1], "split");
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    // Cerrado por división, insertado crudo: el cierre por división todavía no tiene servicio (tarea 6).
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: t,
    } });
    await expect(
      startDryingRun(gestor, { lotId: x, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("lote_dividido"));
  });

  it("un lote mezclado no empieza una corrida: sale lote_mezclado y no sin_proceso_abierto", async () => {
    const a1 = await lote("R3-MA");
    const a2 = await lote("R3-MB");
    await abrirProcesoDePrueba(gestor, a1);
    await abrirProcesoDePrueba(gestor, a2);
    const m = await lote("R3-MEZCLA");
    await enlazar([a1, a2], [m], "merge");
    await expect(
      startDryingRun(gestor, { lotId: m, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("lote_mezclado"));
  });

  it("empezar una corrida bloquea el linaje: espera a quien tiene la fila de un ancestro", async () => {
    const abuelo = await lote("R3-LOCK-ABUELO");
    const hijo = await lote("R3-LOCK-HIJO");
    await enlazar([abuelo], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, abuelo);

    // Otra transacción retiene la fila del ABUELO, que es un ancestro del lote de la corrida, y dice cuál
    // es su proceso de base de datos. Se libera siempre, en el `finally`: si no, el `afterAll` esperaría
    // a que ella suelte la fila y la limpieza se colgaría.
    let soltar!: () => void;
    const suelta = new Promise<void>((resolver) => { soltar = resolver; });
    let tomado!: (pid: number) => void;
    const lockTomado = new Promise<number>((resolver) => { tomado = resolver; });
    const retiene = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${abuelo}::uuid FOR UPDATE`;
      const [fila] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      tomado(fila!.pid);
      await suelta;
    }, { timeout: 30000, maxWait: 10000 });
    let corrida: ReturnType<typeof startDryingRun> | undefined;
    try {
      const pidDelQueRetiene = await lockTomado;
      corrida = startDryingRun(gestor, { lotId: hijo, startedAt: ahora(), provenanceClass: "original_record" });
      // Se OBSERVA que hay una sesión esperando a la que retiene la fila (`pg_blocking_pids`), en vez de
      // inferirlo de que la corrida tarda: sin `bloquearLinaje` la corrida termina sin esperar a nadie y
      // aquí nunca aparece nadie bloqueado.
      let esperando = 0;
      for (let intento = 0; intento < 100 && esperando === 0; intento++) {
        const [fila] = await prisma.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${pidDelQueRetiene}::int = ANY(pg_blocking_pids(pid))`;
        esperando = fila!.n;
        if (esperando === 0) await new Promise((r) => setTimeout(r, 50));
      }
      expect(esperando, "ninguna sesión quedó esperando la fila del ancestro: la corrida no bloqueó el linaje").toBeGreaterThan(0);
      soltar();
      await retiene;
      const { run } = await corrida;
      expect(run.lotProcessId).toBe(p.id);
    } finally {
      soltar();
      await retiene.catch(() => undefined);
      await corrida?.catch(() => undefined);
    }
  });

  it("en bodega no se empieza nada", async () => {
    const l = await lote("R3-BODEGA");
    await abrirProcesoDePrueba(gestor, l);
    await prisma.storageAssignment.create({ data: { lotId: l, locationId: plotId, startedAt: ahora() } });
    await expect(
      startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("lote_en_bodega"));
  });

  it("el permiso se pide sobre el lote de la corrida: sin él, error de acceso y no de proceso", async () => {
    const l = await lote("R3-INTRUSO");
    await expect(
      startDryingRun(intruso, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(TraceabilityAccessError);
  });
});

describe("R4 — la fermentación lleva la receta del proceso", () => {
  it("hereda la versión del proceso", async () => {
    const l = await lote("R4-HEREDA");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: recetaVersionId });
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.processRecipeVersionId).toBe(recetaVersionId);
  });

  it("rechaza otra versión distinta de la del proceso", async () => {
    const l = await lote("R4-OTRA");
    await abrirProcesoDePrueba(gestor, l, { processRecipeVersionId: recetaVersionId });
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", processRecipeVersionId: otraVersionId }),
    ).rejects.toThrow(new LotProcessError("receta_distinta_del_proceso"));
  });

  it("en un proceso «Sin receta» la corrida tampoco lleva receta", async () => {
    const l = await lote("R4-SIN");
    await abrirProcesoDePrueba(gestor, l);
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.processRecipeVersionId).toBeNull();
  });
});
