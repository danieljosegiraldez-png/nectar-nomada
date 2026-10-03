/**
 * R3 y R4 de la Parte 1: una corrida se une sola al proceso que cubre a su lote; sin proceso abierto
 * no empieza; la fermentación lleva la receta del proceso y no otra.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { startFermentationRun, endFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { cambiarIntencion, cerrarProceso, puedeGestionarProceso, puedeEmpezarCorrida, MOTIVOS_PARA_NO_EMPEZAR } from "../../lib/traceability/lotProcess";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { puedeGestionarLote, TraceabilityAccessError } from "../../lib/traceability/lots";
import { procesoQueCubre, idsDeAscendencia, bloquearLinajes } from "../../lib/traceability/procesoDelLinaje";
import type { Prisma } from "../../generated/prisma/client";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { datosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { colaDeAtencion, LINAJE_DEMASIADO_HONDO } from "../../lib/beneficio/tablero";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `corrida-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string, intruso: string;
/** Una segunda parcela con un usuario que SÓLO la gestiona a ella: R3 dice que el permiso es sobre el
 *  lote de la corrida, nunca sobre el lote donde vive el proceso. */
let plotB: string, scopeB: string, soloB: string;
let recetaVersionId: string, otraVersionId: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
const mediciones: string[] = [];
/** Secados insertados crudos SIN transformación (R5): el `afterAll` no los encuentra por un lote de entrada. */
const sueltas: string[] = [];

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

/** Una medición de humedad del lote. Se borra DESPUÉS de los procesos: `closing_moisture_measurement_id` es RESTRICT. */
async function medicionDeHumedad(lotId: string) {
  const id = (await prisma.measurement.create({ data: {
    variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor,
  } })).id;
  mediciones.push(id);
  return id;
}
/** Un proceso CERRADO por humedad, insertado crudo, sin pasar por `cerrarProceso` (que desde R5 mira las corridas
 *  abiertas): aquí sólo importa que el lote quede cubierto por un proceso que ya no está abierto. */
async function cerradoPorHumedad(lotId: string) {
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  const m = await medicionDeHumedad(lotId);
  return (await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
    endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: m,
  } })).id;
}
/** Cuántas fermentaciones o secados se llegaron a empezar con alguno de estos lotes de entrada. */
const corridasEmpezadasEn = (ids: string[]) =>
  prisma.lotTransformation.count({
    where: { inputs: { some: { lotId: { in: ids } } }, OR: [{ dryingRunId: { not: null } }, { fermentationRunId: { not: null } }] },
  });

/**
 * El resultado de una promesa sin que llegue a rechazarse nunca: mientras la prueba espera a otra cosa, una
 * corrida que falla no deja un rechazo sin atender (vitest lo contaría como error aparte).
 */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: unknown };
const resultadoDe = <T>(p: Promise<T>): Promise<Resultado<T>> =>
  p.then((valor) => ({ ok: true as const, valor }), (error: unknown) => ({ ok: false as const, error }));

/**
 * Una transacción AJENA que hace `trabajo` y se queda abierta hasta que se la suelte. Es lo que pone a una
 * corrida a esperar sin temporizadores: `pid` es el proceso de esa transacción en la base de datos, para
 * preguntarle a `pg_blocking_pids` quién la espera. **Hay que llamar siempre a `soltar()`, también si la
 * prueba falla (en un `finally`)**: si no, el `afterAll` esperaría a lo que retiene y la limpieza se colgaría.
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

/** Las filas de `lot` que se pueden bloquear AHORA: `SKIP LOCKED` se salta las que alguien retiene, así que lo que
 *  devuelve son las libres. Bloquea y suelta en el acto, sin transacción. */
async function lotesLibres(ids: string[]): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM traceability.lot WHERE id = ANY(${ids}::uuid[]) FOR UPDATE SKIP LOCKED`;
  return filas.map((f) => f.id).sort();
}

/** Las dos puertas que empiezan una corrida, con la misma firma para probar las dos con el mismo cuerpo. */
const EMPEZAR: { nombre: string; clave: string; empezar: (usuario: string, lotId: string) => Promise<{ run: { lotProcessId: string | null } }> }[] = [
  { nombre: "secado", clave: "SEC", empezar: (u, lotId) => startDryingRun(u, { lotId, startedAt: ahora(), provenanceClass: "original_record" }) },
  { nombre: "fermentación", clave: "FER", empezar: (u, lotId) => startFermentationRun(u, { lotId, startedAt: ahora(), provenanceClass: "original_record" }) },
];

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
  // Las mediciones de cierre, DESPUÉS de los procesos que las referencian (RESTRICT) y antes de los lotes.
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: [...ids, ...transformaciones] } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: [...ids, ...transformaciones] } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: [...ids, ...transformaciones] } }) });
  const ferm = corridas.map((c) => c.fermentationRunId).filter((x): x is string => x !== null);
  const sec = corridas.map((c) => c.dryingRunId).filter((x): x is string => x !== null);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ferm, ...sec] } }) });
  await prisma.fermentationRun.deleteMany({ where: assertDefinedWhere({ id: { in: ferm } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: [...sec, ...sueltas] } }) });
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

  it("quien gestiona el hijo y NO el lote del proceso puede empezar una fermentación: el permiso es sobre el lote de la corrida", async () => {
    const abuelo = await lote("R3-FERM-PARCELA-A");
    const hijo = await lote("R3-FERM-PARCELA-B", plotB);
    await enlazar([abuelo], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, abuelo);
    // Control: `soloB` de verdad NO gestiona el lote donde vive el proceso; sin esto, que pueda empezar en el hijo
    // no diría nada del permiso.
    await expect(
      startFermentationRun(soloB, { lotId: abuelo, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(TraceabilityAccessError);
    const { run } = await startFermentationRun(soloB, { lotId: hijo, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.lotProcessId).toBe(p.id);
  });

  it("sin proceso abierto, empezar una fermentación se rechaza con nombre", async () => {
    const l = await lote("R3-SIN");
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
  });

  it("cubierto por un proceso CERRADO por humedad, no empieza: sin_proceso_abierto, en el propio lote y en un hijo", async () => {
    // Revisión final (ronda de arreglo 1, 2026-10-03): el «propio lote» es uno SIN hijos. El padre de abajo pasó entero al hijo
    // por un `stage_change` con salida, y desde R7 eso lo rechaza antes `lote_consumido`: la corrida sigue en el hijo.
    const propio = await lote("R3-CERRADO-PROPIO");
    await cerradoPorHumedad(propio);
    const padre = await lote("R3-CERRADO");
    const hijo = await lote("R3-CERRADO-HIJO");
    await enlazar([padre], [hijo]);
    await cerradoPorHumedad(padre);
    // Control: los dos lotes SÍ están cubiertos por un proceso —cerrado—, así que el rechazo de abajo no es el de
    // «no hay ninguno» (estado `sin_proceso`) sino el de «el que hay ya no está abierto».
    expect((await procesoQueCubre(prisma, propio)).estado).toBe("cerrado");
    expect((await procesoQueCubre(prisma, hijo)).estado).toBe("cerrado");
    await expect(
      startDryingRun(gestor, { lotId: propio, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
    await expect(
      startDryingRun(gestor, { lotId: hijo, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
    // Y no empezó nada: el rechazo es de la transacción entera.
    expect(await corridasEmpezadasEn([propio, padre, hijo])).toBe(0);
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

  it("empezar una corrida no escribe ningún evento de auditoría nuevo: sólo el `…_run.start` que ya escribía antes de la Parte 1", async () => {
    // Lo que escribía antes: `startFermentationRun` y `startDryingRun` tienen UNA llamada a `recordAuditEvent` cada una
    // —el `fermentation_run.start` y el `drying_run.start`—, y el cambio de la Parte 1 no toca ninguna (git diff
    // 0990f722 6b288f40 -- lib/traceability/{fermentation,drying}.ts). Se mira por QUIEN escribe, y además por el lote y
    // el proceso que la corrida lee, y no sólo por los eventos de la entidad corrida: un evento nuevo de OTRA entidad
    // —el proceso, por ejemplo— pasaría por la mirada de «los eventos de la corrida».
    const lFerm = await lote("R3-AUDITORIA-FER");
    const lSec = await lote("R3-AUDITORIA-SEC");
    const pFerm = await abrirProcesoDePrueba(gestor, lFerm);
    const pSec = await abrirProcesoDePrueba(gestor, lSec);
    const vistos = [lFerm, pFerm.id, lSec, pSec.id];
    const foto = async () =>
      new Map(
        (await prisma.auditEvent.findMany({
          where: { OR: [{ actorUserAccountId: gestor }, { entityId: { in: vistos } }] },
          select: { id: true, operation: true, entityType: true, entityId: true },
        })).map((e) => [e.id, `${e.entityType} ${e.operation} ${e.entityId}`] as const),
      );
    const antes = await foto();
    // Control: la foto de «antes» sí ve las aperturas de los dos procesos (las escribió `gestor`); si no las viera, la
    // diferencia de abajo no mediría nada.
    expect([...antes.values()]).toEqual(expect.arrayContaining([`lot_process lot_process.open ${pFerm.id}`, `lot_process lot_process.open ${pSec.id}`]));

    const { run: ferm } = await startFermentationRun(gestor, { lotId: lFerm, startedAt: ahora(), provenanceClass: "original_record" });
    const { run: sec } = await startDryingRun(gestor, { lotId: lSec, startedAt: ahora(), provenanceClass: "original_record" });

    const despues = await foto();
    const nuevos = [...despues].filter(([id]) => !antes.has(id)).map(([, v]) => v).sort();
    expect(nuevos).toEqual([`drying_run drying_run.start ${sec.id}`, `fermentation_run fermentation_run.start ${ferm.id}`]);
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

    // Otra transacción retiene la fila del ABUELO, que es un ancestro del lote de la corrida.
    const retiene = retener((tx) => tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${abuelo}::uuid FOR UPDATE`);
    let corrida: Promise<Resultado<{ run: { lotProcessId: string | null } }>> | undefined;
    try {
      const pid = await retiene.pid;
      corrida = resultadoDe(startDryingRun(gestor, { lotId: hijo, startedAt: ahora(), provenanceClass: "original_record" }));
      // Sin `bloquearLinaje` la corrida termina sin esperar a nadie y aquí nunca aparece nadie bloqueado.
      await esperarQueAlguienEspere(pid, "ninguna sesión quedó esperando la fila del ancestro: la corrida no bloqueó el linaje");
      retiene.soltar();
      await retiene.hecho;
      const v = await corrida;
      expect(v.ok, "la corrida no terminó bien tras soltar la fila").toBe(true);
      if (v.ok) expect(v.valor.run.lotProcessId).toBe(p.id);
    } finally {
      retiene.soltar();
      await retiene.hecho.catch(() => undefined);
      await corrida;
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

// R2/R3: el bloqueo del linaje no sólo hace ESPERAR a la corrida (prueba de arriba): la corrida DECIDE después de
// tenerlo, y lo CONSERVA hasta que escribe. Son dos cosas distintas, y las dos puertas la comparten, así que el mismo
// cuerpo corre con las dos.
for (const { nombre, clave, empezar } of EMPEZAR) {
  describe(`R2/R3 — el bloqueo del linaje (${nombre})`, () => {
    it(`decide DESPUÉS de tener el linaje: si otra transacción cierra el proceso mientras espera, el ${nombre} se rechaza con sin_proceso_abierto`, async () => {
      const abuelo = await lote(`R3-DECIDE-${clave}-ABUELO`);
      const hijo = await lote(`R3-DECIDE-${clave}-HIJO`);
      await enlazar([abuelo], [hijo]);
      const p = await abrirProcesoDePrueba(gestor, abuelo);
      const humedad = await medicionDeHumedad(abuelo); // creada ANTES, fuera de la transacción que cierra

      // Otra transacción toma la fila del ABUELO (la que `bloquearLinaje` necesita) y, dentro de ella, CIERRA el
      // proceso que cubre al hijo, en crudo. Todavía no confirma: quien lea ahora ve el proceso abierto.
      const cierra = retener(async (tx) => {
        await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${abuelo}::uuid FOR UPDATE`;
        await tx.lotProcess.update({
          where: { id: p.id },
          data: { endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: humedad },
        });
      });
      let corrida: Promise<Resultado<{ run: { lotProcessId: string | null } }>> | undefined;
      try {
        const pid = await cierra.pid;
        corrida = resultadoDe(empezar(gestor, hijo));
        await esperarQueAlguienEspere(pid, "la corrida no esperó la fila del ancestro: no bloqueó el linaje");
        cierra.soltar();
        await cierra.hecho; // COMMIT: el proceso queda cerrado
        const v = await corrida;
        expect(v.ok, "la corrida empezó unida a un proceso que otra transacción cerró mientras ella esperaba").toBe(false);
        if (!v.ok) {
          expect(v.error).toBeInstanceOf(LotProcessError);
          expect((v.error as LotProcessError).message).toBe("sin_proceso_abierto");
        }
        // Control: el cierre sí quedó confirmado. Sin esto, «rechazó» podría ser cualquier otra razón.
        expect((await procesoQueCubre(prisma, hijo)).estado).toBe("cerrado");
        expect(await corridasEmpezadasEn([abuelo, hijo])).toBe(0);
      } finally {
        cierra.soltar();
        await cierra.hecho.catch(() => undefined);
        await corrida;
      }
    });

    it(`conserva el bloqueo del linaje hasta que escribe la corrida: no lo suelta tras decidir`, async () => {
      const abuelo = await lote(`R2-RETIENE-${clave}-ABUELO`);
      const hijo = await lote(`R2-RETIENE-${clave}-HIJO`);
      await enlazar([abuelo], [hijo]);
      const p = await abrirProcesoDePrueba(gestor, abuelo);

      // Otra transacción retiene el PROCESO, no el lote: no estorba al bloqueo del linaje ni a la lectura, pero la
      // corrida, al escribirse unida a él, espera en su clave foránea (`FOR KEY SHARE` contra `FOR UPDATE`). Eso la
      // deja PARADA justo entre decidir y escribir, que es donde hay que mirar si sigue reteniendo el linaje.
      const retieneElProceso = retener((tx) => tx.$queryRaw`SELECT id FROM traceability.lot_process WHERE id = ${p.id}::uuid FOR UPDATE`);
      let corrida: Promise<Resultado<{ run: { lotProcessId: string | null } }>> | undefined;
      try {
        const pid = await retieneElProceso.pid;
        corrida = resultadoDe(empezar(gestor, hijo));
        await esperarQueAlguienEspere(pid, "la corrida no llegó a escribirse unida al proceso: no se pudo pararla entre decidir y escribir");
        // Con las filas bien retenidas no hay ninguna libre. Si la corrida soltó el linaje al decidir —lo tomó con el
        // cliente global, fuera de su transacción—, aquí salen las dos.
        expect(await lotesLibres([abuelo, hijo]), "la corrida ya no retiene el linaje mientras escribe").toEqual([]);
        retieneElProceso.soltar();
        await retieneElProceso.hecho;
        const v = await corrida;
        expect(v.ok, "la corrida no terminó bien tras soltar el proceso").toBe(true);
        if (v.ok) expect(v.valor.run.lotProcessId).toBe(p.id);
        // Control: con la corrida terminada, las filas SÍ se pueden bloquear. El `[]` de antes no era que la consulta
        // no sirve para ver nada.
        expect(await lotesLibres([abuelo, hijo])).toEqual([abuelo, hijo].sort());
      } finally {
        retieneElProceso.soltar();
        await retieneElProceso.hecho.catch(() => undefined);
        await corrida;
      }
    });
  });
}

/**
 * R7, «bajo un proceso abierto hay una sola línea de café viva» (revisión final, ronda de arreglo 1, 2026-10-03). El diseño la
 * apoyaba en que una corrida consume su lote entero, y nada lo hacía cumplir: una segunda corrida sobre el mismo lote, o una
 * nueva sobre la cereza que su fermentación ya consumió, hacían nacer el mismo café dos veces.
 */
describe("R7 — una corrida consume su lote entero: no empieza otra sobre él", () => {
  it("con una corrida abierta sobre el lote, no empieza otra: corrida_ya_abierta, por las dos puertas", async () => {
    const l = await lote("R7-ABIERTA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const { run } = await startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    // Control: la primera SÍ empezó, unida al proceso; sin esto, el rechazo de abajo podría ser el de cualquier otra cosa.
    expect(run.lotProcessId).toBe(p.id);
    for (const { empezar } of EMPEZAR) {
      await expect(empezar(gestor, l)).rejects.toThrow(new LotProcessError("corrida_ya_abierta"));
    }
    expect(await prisma.dryingRun.count({ where: { transformations: { some: { inputs: { some: { lotId: l } } } } } })).toBe(1);
    expect(await prisma.fermentationRun.count({ where: { transformations: { some: { inputs: { some: { lotId: l } } } } } })).toBe(0);
  });

  it("sobre la cereza que su fermentación ya consumió no empieza nada: lote_consumido; sobre el lote que salió, sí", async () => {
    // El flujo normal —fermentar C, nace F1, secar F1— sigue pasando: es el control. Lo que se rechaza es volver a la cereza.
    const c = await lote("R7-CONS-C");
    const p = await abrirProcesoDePrueba(gestor, c);
    const { run } = await startFermentationRun(gestor, { lotId: c, startedAt: ahora(), provenanceClass: "original_record" });
    const { outputLot: f1 } = await endFermentationRun(gestor, {
      fermentationRunId: run.id, endedAt: ahora(), outputLotCode: `R7-CONS-F1-${RUN}`, outputLotType: "processing", provenanceClass: "original_record",
    });
    lotes.push(f1.id);
    for (const { empezar } of EMPEZAR) {
      await expect(empezar(gestor, c)).rejects.toThrow(new LotProcessError("lote_consumido"));
    }
    // El proceso sigue abierto y cubre a la cereza: lo que la rechaza es que ya pasó a F1, no que falte un proceso.
    expect((await procesoQueCubre(prisma, c)).estado).toBe("abierto");
    expect(await prisma.dryingRun.count({ where: { transformations: { some: { inputs: { some: { lotId: c } } } } } })).toBe(0);
    expect(await prisma.fermentationRun.count({ where: { transformations: { some: { inputs: { some: { lotId: c } } } } } })).toBe(1);
    // Control: la corrida sobre el lote que salió empieza, unida al mismo proceso.
    const { run: secado } = await startDryingRun(gestor, { lotId: f1.id, startedAt: ahora(), provenanceClass: "original_record" });
    expect(secado.lotProcessId).toBe(p.id);
  });

  /** El predicado de la pantalla y el servicio, sobre el mismo lote: tienen que decir lo mismo. */
  async function empezarDiceLoMismo(lotId: string) {
    const veredicto = await puedeEmpezarCorrida(gestor, lotId);
    const servicio = startDryingRun(gestor, { lotId, startedAt: ahora(), provenanceClass: "original_record" });
    if (veredicto.puede) await expect(servicio, "el predicado dijo «se puede» y el servicio lo rechazó").resolves.toBeDefined();
    else await expect(servicio, `el predicado dijo «${veredicto.motivo}» y el servicio no rechazó con ese código`).rejects.toThrow(new LotProcessError(veredicto.motivo));
    return veredicto;
  }

  it("la pantalla pregunta lo mismo que el servicio: corrida abierta, lote consumido, lote dividido bajo un reproceso, sin proceso, y el que sí", async () => {
    // Corrida abierta.
    const abierta = await lote("R7-PE-ABI");
    await abrirProcesoDePrueba(gestor, abierta);
    await startFermentationRun(gestor, { lotId: abierta, startedAt: ahora(), provenanceClass: "original_record" });
    expect(await empezarDiceLoMismo(abierta)).toEqual({ puede: false, motivo: "corrida_ya_abierta" });

    // Consumido: la cereza cuya fermentación terminó. Y el lote que salió, que sí empieza (por el mismo camino del predicado).
    const c = await lote("R7-PE-CONS");
    await abrirProcesoDePrueba(gestor, c);
    const { run } = await startFermentationRun(gestor, { lotId: c, startedAt: ahora(), provenanceClass: "original_record" });
    const { outputLot: f1 } = await endFermentationRun(gestor, {
      fermentationRunId: run.id, endedAt: ahora(), outputLotCode: `R7-PE-F1-${RUN}`, outputLotType: "processing", provenanceClass: "original_record",
    });
    lotes.push(f1.id);
    expect(await empezarDiceLoMismo(c)).toEqual({ puede: false, motivo: "lote_consumido" });
    expect(await empezarDiceLoMismo(f1.id)).toEqual({ puede: true });

    // M8: un lote DIVIDIDO cubierto por el reproceso ABIERTO de su ancestro. La ficha lo ofrecía —proceso abierto y fuera de
    // bodega— y el servicio lo rechaza con `lote_dividido`. C2 → L (y L se dividió bajo P1, que vivía en C2); P2, el reproceso,
    // abierto sobre C2.
    const c2 = await lote("R7-PE-DIV-C");
    const l = await lote("R7-PE-DIV-L");
    const l1 = await lote("R7-PE-DIV-L1");
    await enlazar([c2], [l]);
    const division = await enlazar([l], [l1], "split");
    const [g, ce] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    await prisma.lotProcess.create({ data: {
      lotId: c2, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: ce.id,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: division,
    } });
    await abrirProcesoDePrueba(gestor, c2);
    expect((await procesoQueCubre(prisma, l)).estado, "control: L está cubierto por el reproceso ABIERTO").toBe("abierto");
    expect(await empezarDiceLoMismo(l)).toEqual({ puede: false, motivo: "lote_dividido" });

    // Sin proceso.
    expect(await empezarDiceLoMismo(await lote("R7-PE-SIN"))).toEqual({ puede: false, motivo: "sin_proceso_abierto" });
  });

  it("cada motivo por el que no se empieza tiene su texto en es y en (`error_proceso_<motivo>`), que la ficha y las páginas /new piden", () => {
    // Las claves son de plantilla (`error_proceso_${motivo}`): `claves-de-traduccion-existen` no las ve.
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;
    expect(MOTIVOS_PARA_NO_EMPEZAR.length, "la lista de motivos salió vacía").toBeGreaterThanOrEqual(7);
    expect([...MOTIVOS_PARA_NO_EMPEZAR]).toEqual(expect.arrayContaining(["corrida_ya_abierta", "lote_consumido"]));
    const faltan: string[] = [];
    for (const m of MOTIVOS_PARA_NO_EMPEZAR) {
      if (!es.Traceability?.[`error_proceso_${m}`]?.trim()) faltan.push(`es: Traceability.error_proceso_${m}`);
      if (!en.Traceability?.[`error_proceso_${m}`]?.trim()) faltan.push(`en: Traceability.error_proceso_${m}`);
    }
    expect(faltan).toEqual([]);
    // Control: las páginas arman la clave con ese prefijo; si cambian de prefijo, esta prueba tiene que seguirlas.
    for (const pagina of ["app/lots/[id]/page.tsx", "app/lots/[id]/fermentation/new/page.tsx", "app/lots/[id]/drying/new/page.tsx"]) {
      const fuente = readFileSync(pagina, "utf8");
      expect(fuente, `${pagina} no pregunta a puedeEmpezarCorrida`).toContain("puedeEmpezarCorrida(");
      expect(fuente, `${pagina} no pinta el motivo con su texto`).toContain("error_proceso_${");
    }
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

  it("un proceso «Sin receta» rechaza una receta pedida a mano: la corrida no la elige", async () => {
    const l = await lote("R4-SIN-RECHAZA");
    await abrirProcesoDePrueba(gestor, l); // sin receta
    await expect(
      startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record", processRecipeVersionId: recetaVersionId }),
    ).rejects.toThrow(new LotProcessError("receta_distinta_del_proceso"));
    expect(await corridasEmpezadasEn([l])).toBe(0);
  });

  it("en un proceso «Sin receta» la corrida tampoco lleva receta", async () => {
    const l = await lote("R4-SIN");
    await abrirProcesoDePrueba(gestor, l);
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    expect(run.processRecipeVersionId).toBeNull();
  });
});

describe("R5 — no se cierra un proceso con corridas abiertas", () => {
  // La humedad de cierre es la del propio lote del proceso (`medicionDeHumedad`, de arriba): lo que se prueba aquí
  // son las corridas, no de qué lote es la medición. Se borra DESPUÉS de los procesos (`mediciones`, en el afterAll).
  const cerrar = (procesoId: string, medicionId: string) =>
    cerrarProceso(gestor, { lotProcessId: procesoId, endedAt: ahora(), closingMoistureMeasurementId: medicionId });
  const cerradoEn = async (procesoId: string) =>
    (await prisma.lotProcess.findUniqueOrThrow({ where: { id: procesoId }, select: { endedAt: true } })).endedAt;

  it("con un secado abierto unido al proceso, cerrar se rechaza; terminado, cierra por humedad", async () => {
    const l = await lote("R5-UNIDA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const { run } = await startDryingRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    const m = await medicionDeHumedad(l);
    // Control: el secado SÍ quedó unido al proceso; sin esto, el rechazo de abajo podría ser de cualquier otra cosa.
    expect(run.lotProcessId).toBe(p.id);
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    // El rechazo es de la transacción entera: el proceso sigue abierto.
    expect(await cerradoEn(p.id)).toBeNull();
    const { outputLot } = await endDryingRun(gestor, { dryingRunId: run.id, endedAt: ahora(), outputLotCode: `R5-SAL-${RUN}`, outputLotType: "parchment", provenanceClass: "original_record" });
    lotes.push(outputLot.id);
    const cerrado = await cerrar(p.id, m);
    expect(cerrado.closureKind).toBe("moisture");
  });

  it("una fermentación abierta unida al proceso también impide cerrarlo; terminada, cierra", async () => {
    const l = await lote("R5-FERM");
    const p = await abrirProcesoDePrueba(gestor, l);
    const { run } = await startFermentationRun(gestor, { lotId: l, startedAt: ahora(), provenanceClass: "original_record" });
    const m = await medicionDeHumedad(l);
    expect(run.lotProcessId).toBe(p.id);
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    expect(await cerradoEn(p.id)).toBeNull();
    const { outputLot } = await endFermentationRun(gestor, { fermentationRunId: run.id, endedAt: ahora(), outputLotCode: `R5-FERM-SAL-${RUN}`, outputLotType: "cherry", provenanceClass: "original_record" });
    lotes.push(outputLot.id);
    expect((await cerrar(p.id, m)).closureKind).toBe("moisture");
  });

  it("cuenta también una corrida abierta que NO quedó unida (las de antes de esta parte)", async () => {
    const l = await lote("R5-SUELTA");
    const p = await abrirProcesoDePrueba(gestor, l);
    // Una corrida de antes de la Parte 1: sobre el lote, SIN `lotProcessId`. Su limpieza la hace el `afterAll`: la
    // encuentra por el lote de entrada de su transformación, que va en `transformaciones` por si acaso.
    const suelta = await prisma.dryingRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      dryingRunId: suelta.id, inputs: { create: [{ lotId: l }] },
    } });
    transformaciones.push(t.id);
    const m = await medicionDeHumedad(l);
    // Control: de verdad no está unida, así que sólo la segunda rama de la cuenta puede verla.
    expect(suelta.lotProcessId).toBeNull();
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    expect(await cerradoEn(p.id)).toBeNull();
  });

  it("cuenta una corrida abierta que empezó en un DESCENDIENTE del lote del proceso y no quedó unida", async () => {
    const padre = await lote("R5-DESC-PADRE");
    const hijo = await lote("R5-DESC-HIJO");
    await enlazar([padre], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, padre);
    const suelta = await prisma.dryingRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
    transformaciones.push((await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      dryingRunId: suelta.id, inputs: { create: [{ lotId: hijo }] },
    } })).id);
    const m = await medicionDeHumedad(padre);
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    expect(await cerradoEn(p.id)).toBeNull();
  });

  it("cuenta una corrida abierta unida por lotProcessId aunque ninguna transformación la ligue al linaje", async () => {
    const l = await lote("R5-SOLO-ID");
    const p = await abrirProcesoDePrueba(gestor, l);
    // La puerta vieja (`colgarCorrida`) colgaba corridas de un proceso sin mirar su linaje: la única señal que queda es
    // el `lotProcessId`. Sin transformación, ninguna entrada de lote la delata.
    const colgada = await prisma.dryingRun.create({ data: { startedAt: ahora(), lotProcessId: p.id, createdBy: gestor } });
    sueltas.push(colgada.id);
    const m = await medicionDeHumedad(l);
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    expect(await cerradoEn(p.id)).toBeNull();
  });

  it("una corrida abierta de OTRO café no impide cerrar: la cuenta es del linaje, no de la base", async () => {
    const mio = await lote("R5-MIO");
    const ajeno = await lote("R5-AJENO");
    const p = await abrirProcesoDePrueba(gestor, mio);
    await abrirProcesoDePrueba(gestor, ajeno);
    const { run } = await startDryingRun(gestor, { lotId: ajeno, startedAt: ahora(), provenanceClass: "original_record" });
    const m = await medicionDeHumedad(mio);
    // Control: la corrida ajena SÍ está abierta; si no, que el cierre salga bien no diría nada de cómo se cuenta.
    expect((await prisma.dryingRun.findUniqueOrThrow({ where: { id: run.id } })).endedAt).toBeNull();
    expect((await cerrar(p.id, m)).closureKind).toBe("moisture");
  });

  it("cerrar decide DESPUÉS de tener el linaje: si otra transacción cierra el proceso mientras espera, se rechaza con process_already_closed", async () => {
    const l = await lote("R5-CARRERA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const ganadora = await medicionDeHumedad(l);
    const perdedora = await medicionDeHumedad(l);

    // Otra transacción toma la fila del lote del proceso y, dentro de ella, lo CIERRA en crudo. Todavía no confirma:
    // quien lea ahora ve el proceso abierto.
    const cierra = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${l}::uuid FOR UPDATE`;
      await tx.lotProcess.update({
        where: { id: p.id },
        data: { endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: ganadora },
      });
    });
    let cierre: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await cierra.pid;
      cierre = resultadoDe(cerrar(p.id, perdedora));
      await esperarQueAlguienEspere(pid, "el cierre no esperó a la otra transacción");
      cierra.soltar();
      await cierra.hecho; // COMMIT: el proceso queda cerrado por la otra
      const v = await cierre;
      expect(v.ok, "el segundo cierre pasó por encima del primero").toBe(false);
      if (!v.ok) {
        expect(v.error).toBeInstanceOf(LotProcessError);
        expect((v.error as LotProcessError).message).toBe("process_already_closed");
      }
      // Control: el cierre que ganó es el de la otra transacción, y nadie lo sobrescribió.
      const final = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id }, select: { closingMoistureMeasurementId: true } });
      expect(final.closingMoistureMeasurementId).toBe(ganadora);
    } finally {
      cierra.soltar();
      await cierra.hecho.catch(() => undefined);
      await cierre;
    }
  });

  it("cerrar cuenta las corridas DESPUÉS de tener el linaje: una que otra transacción confirma mientras espera lo rechaza con corridas_abiertas", async () => {
    const l = await lote("R5-CORRIDA-EN-CARRERA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const m = await medicionDeHumedad(l); // creada ANTES, fuera de la transacción que retiene

    // Otra transacción toma la fila del lote (la que `bloquearLinaje` necesita) y, dentro de ella, EMPIEZA un secado unido al
    // proceso, como lo hace `startDryingRun` con el linaje bloqueado. Todavía no confirma: quien cuente las corridas ahora
    // no la ve. Su id va a la lista de limpieza en cuanto existe, así que el `afterAll` la borra aunque la prueba falle.
    let corridaId = "";
    const empieza = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${l}::uuid FOR UPDATE`;
      const run = await tx.dryingRun.create({ data: { startedAt: ahora(), lotProcessId: p.id, createdBy: gestor } });
      corridaId = run.id;
      sueltas.push(run.id);
    });
    let cierre: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await empieza.pid;
      cierre = resultadoDe(cerrar(p.id, m));
      // Sin `bloquearLinaje` al principio de la transacción de cierre, aquí nunca aparece nadie bloqueado.
      await esperarQueAlguienEspere(pid, "el cierre no esperó la fila del lote: no bloqueó el linaje");
      empieza.soltar();
      await empieza.hecho; // COMMIT: el secado queda confirmado, unido a un proceso abierto
      const v = await cierre;
      // Si `exigeSinCorridasAbiertas` cuenta ANTES de tener el linaje —por encima de `bloquearLinaje`, o con el cliente global
      // antes de la transacción—, cuenta cero (el secado aún no estaba confirmado) y el cierre sale: un proceso cerrado por
      // humedad con un secado abierto unido, el estado que R5 prohíbe.
      expect(v.ok, "el cierre contó las corridas antes de tener el linaje y cerró un proceso con un secado abierto unido").toBe(false);
      if (!v.ok) {
        expect(v.error).toBeInstanceOf(LotProcessError);
        expect((v.error as LotProcessError).message).toBe("corridas_abiertas");
      }
      expect(await cerradoEn(p.id), "el proceso se cerró").toBeNull();
      // Control: el secado SÍ quedó confirmado, abierto y unido a ESTE proceso; sin esto, «rechazó» podría ser cualquier otra cosa.
      expect(await prisma.dryingRun.count({ where: { id: corridaId, endedAt: null, lotProcessId: p.id } })).toBe(1);
    } finally {
      empieza.soltar();
      await empieza.hecho.catch(() => undefined);
      await cierre;
    }
  });

  it("una corrida abierta sobre un ANCESTRO del lote del proceso no impide cerrar: el proceso cubre el lote y su descendencia, no lo de arriba", async () => {
    const padre = await lote("R5-ANC-PADRE");
    const hijo = await lote("R5-ANC-HIJO");
    await enlazar([padre], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, hijo);
    const suelta = await prisma.dryingRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
    transformaciones.push((await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      dryingRunId: suelta.id, inputs: { create: [{ lotId: padre }] },
    } })).id);
    const m = await medicionDeHumedad(hijo);
    // Controles: el padre SÍ es un ancestro del lote del proceso, y la corrida SÍ está abierta y sin unir; sin esto, que el cierre
    // salga bien no diría nada de cómo se cuenta la ascendencia.
    expect(await idsDeAscendencia(prisma, hijo)).toContain(padre);
    expect(suelta.endedAt).toBeNull();
    expect(suelta.lotProcessId).toBeNull();
    expect((await cerrar(p.id, m)).closureKind).toBe("moisture");
  });

  /** Una fermentación de ANTES de la Parte 1: abierta, sin `lotProcessId`, y su única señal es la transformación que la ligó a `lotId`. */
  async function fermentacionSuelta(lotId: string) {
    const f = await prisma.fermentationRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
    transformaciones.push((await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      fermentationRunId: f.id, inputs: { create: [{ lotId }] },
    } })).id);
    return f;
  }

  it("cuenta también una FERMENTACIÓN abierta que NO quedó unida, sobre el propio lote del proceso", async () => {
    const l = await lote("R5-FERM-SUELTA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const suelta = await fermentacionSuelta(l);
    const m = await medicionDeHumedad(l);
    // Control: de verdad está abierta y no unida, así que sólo la segunda rama de la cuenta de fermentaciones puede verla.
    expect(suelta.endedAt).toBeNull();
    expect(suelta.lotProcessId).toBeNull();
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    expect(await cerradoEn(p.id)).toBeNull();
  });

  it("cuenta también una FERMENTACIÓN abierta que NO quedó unida y empezó en un DESCENDIENTE del lote del proceso", async () => {
    const padre = await lote("R5-FERM-DESC-PADRE");
    const hijo = await lote("R5-FERM-DESC-HIJO");
    await enlazar([padre], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, padre);
    const suelta = await fermentacionSuelta(hijo);
    const m = await medicionDeHumedad(padre);
    expect(suelta.endedAt).toBeNull();
    expect(suelta.lotProcessId).toBeNull();
    await expect(cerrar(p.id, m)).rejects.toThrow(new LotProcessError("corridas_abiertas"));
    expect(await cerradoEn(p.id)).toBeNull();
  });
});

describe("R2 — el orden del bloqueo del linaje no depende de la caja del uuid", () => {
  it("un uuid en mayúsculas se bloquea en el orden de los minúsculos: la fila menor se toma ANTES de esperar la mayor", async () => {
    // Dos lotes sin parentesco con id elegido: en el orden de cadenas, «B» (mayúscula) va ANTES que «a», y «b» después.
    // Sin normalizar, quien pide `[B…, a…]` esperaría a la fila `b` SIN haber tomado la `a`, y otra transacción que pida
    // `[a…, b…]` en minúsculas la esperaría a ella: un interbloqueo. Con el orden normalizado toma la `a` y luego espera la `b`.
    const menor = `a${randomUUID().slice(1)}`;
    const mayor = `b${randomUUID().slice(1)}`;
    for (const id of [menor, mayor]) {
      await prisma.lot.create({ data: {
        id, lotCode: `R2-ORDEN-${id.slice(0, 8)}-${RUN}`, lotType: "cherry", organizationId: orgId, locationId: plotId,
        status: "approved", classification: "internal", createdBy: gestor,
      } });
      lotes.push(id);
    }
    // Otra transacción retiene la fila MAYOR.
    const retiene = retener((tx) => tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${mayor}::uuid FOR UPDATE`);
    let bloqueo: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await retiene.pid;
      bloqueo = resultadoDe(prisma.$transaction((tx) => bloquearLinajes(tx, [mayor.toUpperCase(), menor]), { timeout: 30000, maxWait: 10000 }));
      await esperarQueAlguienEspere(pid, "el bloqueo no esperó la fila mayor que retiene la otra transacción");
      // Control de la herramienta: la fila mayor SÍ está retenida, así que `lotesLibres` no la devuelve.
      expect(await lotesLibres([mayor]), "la fila mayor no está retenida: la prueba no mide nada").toEqual([]);
      expect(await lotesLibres([menor]), "el bloqueo esperó la fila mayor SIN haber tomado la menor: el orden no está normalizado").toEqual([]);
      retiene.soltar();
      await retiene.hecho;
      const v = await bloqueo;
      expect(v.ok, "el bloqueo no terminó bien tras soltar la fila mayor").toBe(true);
      // Control: terminado el bloqueo, las dos filas SÍ se pueden tomar. El `[]` de antes no era que la consulta no sirve.
      expect(await lotesLibres([menor, mayor])).toEqual([menor, mayor]);
    } finally {
      retiene.soltar();
      await retiene.hecho.catch(() => undefined);
      await bloqueo;
    }
  });
});

describe("la limpieza de los procesos de prueba no deja huérfana su auditoría", () => {
  it("tras borrarProcesosDeLotesDonde no queda ningún evento de los procesos que borró, y los de otro proceso siguen", async () => {
    // Cada apertura escribe un `lot_process.open` que cuelga del PROCESO, no del lote ni del usuario: al borrar el
    // proceso queda huérfano, y desde la tarea 4 son 26 aperturas más por corrida de la suite.
    const l1 = await lote("LIMPIA-1");
    const l2 = await lote("LIMPIA-2");
    const otro = await lote("LIMPIA-OTRO");
    const p1 = await abrirProcesoDePrueba(gestor, l1);
    const p2 = await abrirProcesoDePrueba(gestor, l2);
    const pOtro = await abrirProcesoDePrueba(gestor, otro);
    const suyos = [p1.id, p2.id];
    const eventosDe = (ids: string[]) =>
      prisma.auditEvent.count({ where: { entityType: "lot_process", operation: "lot_process.open", entityId: { in: ids } } });

    // Control: antes de limpiar hay un evento por proceso; sin esto, el 0 de después se leería como «limpio» sin serlo.
    expect(await eventosDe(suyos)).toBe(2);

    await borrarProcesosDeLotesDonde({ id: { in: [l1, l2] } });

    expect(await prisma.lotProcess.count({ where: { id: { in: suyos } } }), "la limpieza no borró los procesos").toBe(0);
    expect(await eventosDe(suyos), "quedaron eventos lot_process.open de procesos que ya no existen").toBe(0);
    // El filtro es por los procesos que borró: el de otro lote conserva su proceso y su evento.
    expect(await prisma.lotProcess.count({ where: { id: pOtro.id } })).toBe(1);
    expect(await eventosDe([pOtro.id])).toBe(1);
  });
});

describe("R7 — el tablero ve el proceso del ancestro aunque la corrida no esté unida", () => {
  it("una fermentación vieja (sin lotProcessId) en un hijo no sale «sin grado»", async () => {
    const padre = await lote("TAB-P");
    const hijo = await lote("TAB-H");
    await enlazar([padre], [hijo]);
    // El proceso del padre lleva una receta cuya fase de fermentación declara sus horas: el tablero las lee del MISMO proceso
    // que da el grado. La versión cuelga de la receta de esta corrida, y cae con ella en el `afterAll` (Cascade).
    const { recipeId } = await prisma.processRecipeVersion.findUniqueOrThrow({ where: { id: recetaVersionId }, select: { recipeId: true } });
    const conFase = await prisma.processRecipeVersion.create({ data: {
      recipeId, version: 3, status: "approved", createdBy: gestor, fases: { create: [{ phase: "fermentation", expectedHours: 36 }] },
      // Tarea 9, ronda de arreglo 1: y una meta con ritmo de la fase de fermentación, que el tablero tiene que leer del MISMO
      // proceso. La de secado es el control: es de otra fase y no puede salir en una fermentación.
      targets: { create: [
        { variable: "ph", moment: "during", phase: "fermentation", unit: "pH", everyHours: 6 },
        { variable: "moisture", moment: "during", phase: "drying", unit: "%", everyHours: 12 },
      ] },
    } });
    await abrirProcesoDePrueba(gestor, padre, { processRecipeVersionId: conFase.id });
    // Una corrida de ANTES de la Parte 1: cruda, sin `lotProcessId` (R9 no la rellena). La limpia el `afterAll`, que encuentra
    // la corrida por la entrada de su transformación (`hijo` está en `lotes`): nada de borrarla debajo de las aserciones.
    const corrida = await prisma.fermentationRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      fermentationRunId: corrida.id, inputs: { create: [{ lotId: hijo }] },
    } });
    transformaciones.push(t.id);
    const d = await datosDelTablero(gestor);
    const entrada = d.lotes.find((l) => l.lotId === hijo);
    expect(entrada, "el hijo con fermentación abierta tiene que estar en el tablero").toBeDefined();
    expect(entrada!.veredicto).not.toBe("SIN_GRADO_DECLARADO");
    expect(entrada!.expectedHours, "el tablero no leyó las horas de la fase del proceso que cubre al lote").toBe(36);
    expect(entrada!.metas, "el tablero no leyó las metas de la fase del proceso que cubre al lote").toEqual([
      { variable: "ph", everyHours: 6, ultimaLectura: null },
    ]);
  });

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02). Diseño R1: «las pantallas atrapan lineage_too_deep y lo dicen». El tablero recorre
   * el resolvedor lote por lote, y un solo lote con más de 64 generaciones tumbaba el tablero ENTERO para todos (un 500). Ahora
   * esa fila sale marcada y las demás salen. 66 lotes, cada uno hijo del anterior y ninguno con proceso: desde el último, el
   * resolvedor sube 65 generaciones y lanza.
   */
  it("un lote con más de 64 generaciones no tumba el tablero: su fila sale marcada y las demás salen", async () => {
    // La fila normal: un hijo cuyo proceso vive en el padre, con su fermentación abierta.
    const padre = await lote("TAB-HONDO-P");
    const hijo = await lote("TAB-HONDO-H");
    await enlazar([padre], [hijo]);
    await abrirProcesoDePrueba(gestor, padre);
    const fermentarCrudo = async (lotId: string) => {
      const corrida = await prisma.fermentationRun.create({ data: { startedAt: ahora(), createdBy: gestor } });
      const t = await prisma.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
        fermentationRunId: corrida.id, inputs: { create: [{ lotId }] },
      } });
      transformaciones.push(t.id);
    };
    await fermentarCrudo(hijo);
    // La fila honda.
    const ids: string[] = [];
    for (let i = 0; i < 66; i++) ids.push(await lote(`TAB-HONDO${i}`));
    for (let i = 1; i < ids.length; i++) await enlazar([ids[i - 1]!], [ids[i]!]);
    const hondo = ids[ids.length - 1]!;
    await fermentarCrudo(hondo);

    const d = await datosDelTablero(gestor);
    const deHondo = d.lotes.find((l) => l.lotId === hondo);
    expect(deHondo, "el lote hondo desapareció del tablero").toBeDefined();
    expect(deHondo!.veredicto).toBe(LINAJE_DEMASIADO_HONDO);
    const deHijo = d.lotes.find((l) => l.lotId === hijo);
    expect(deHijo, "la fila normal no salió junto a la honda").toBeDefined();
    expect(deHijo!.veredicto, "la fila normal no puede heredar la marca").not.toBe(LINAJE_DEMASIADO_HONDO);
    // Y la cola de atención la pone en «sin veredicto», con su motivo y sin tumbar a las demás.
    const cola = colaDeAtencion({ lotes: d.lotes, desviacionesAbiertasPorLote: d.desviacionesAbiertasPorLote, ahora: d.medidoEn });
    const fila = cola.find((f) => f.lotId === hondo);
    expect(fila?.grupo).toBe("sin_veredicto");
    expect(fila?.motivos).toEqual([LINAJE_DEMASIADO_HONDO]);
    expect(cola.some((f) => f.lotId === hijo)).toBe(true);
  }, 120000);
});

/**
 * Tarea 9, ronda de arreglo 1 (2026-10-02). La página del proceso enseña el proceso que CUBRE al lote, que puede vivir en un
 * ANCESTRO. Sus formularios —manejo, cierre, intención, objetivo— llaman a servicios que piden `manage` sobre el lote DONDE VIVE
 * el proceso (`loteGestionable(proceso.lotId)`), y la página los ofrecía con el permiso del lote que se mira: a quien gestiona
 * sólo el hijo le ofrecía lo que el servicio le rechaza. `puedeGestionarProceso` pregunta lo mismo que esos servicios.
 */
describe("R7 — los formularios del proceso se ofrecen según el lote donde vive el proceso", () => {
  it("quien gestiona el hijo y NO el lote del proceso no los ve, y el servicio se lo rechaza; quien gestiona el del proceso, sí", async () => {
    const padre = await lote("FORM-P");
    const hijo = await lote("FORM-H", plotB);
    await enlazar([padre], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, padre);
    // Control: `soloB` SÍ gestiona el lote que mira. Con el permiso de ese lote, la página le ofrecía los formularios.
    expect(await puedeGestionarLote(soloB, await prisma.lot.findUniqueOrThrow({ where: { id: hijo } }))).toBe(true);
    expect(await puedeGestionarProceso(soloB, p.id), "se le ofrecería un formulario que el servicio rechaza").toBe(false);
    await expect(cambiarIntencion(soloB, p.id, `TEST otra intención ${RUN}`)).rejects.toThrow(TraceabilityAccessError);
    // Quien gestiona el lote del proceso: el predicado y el servicio dicen que sí.
    expect(await puedeGestionarProceso(gestor, p.id)).toBe(true);
    await expect(cambiarIntencion(gestor, p.id, `TEST otra intención ${RUN}`)).resolves.toBeDefined();
  });
});
