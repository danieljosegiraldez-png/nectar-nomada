/**
 * R3 y R4 de la Parte 1: una corrida se une sola al proceso que cubre a su lote; sin proceso abierto
 * no empieza; la fermentación lleva la receta del proceso y no otra.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { startFermentationRun, endFermentationRun } from "../../lib/traceability/fermentation";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { cerrarProceso } from "../../lib/traceability/lotProcess";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { procesoQueCubre } from "../../lib/traceability/procesoDelLinaje";
import type { Prisma } from "../../generated/prisma/client";
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
    const padre = await lote("R3-CERRADO");
    const hijo = await lote("R3-CERRADO-HIJO");
    await enlazar([padre], [hijo]);
    await cerradoPorHumedad(padre);
    // Control: los dos lotes SÍ están cubiertos por un proceso —cerrado—, así que el rechazo de abajo no es el de
    // «no hay ninguno» (estado `sin_proceso`) sino el de «el que hay ya no está abierto».
    expect((await procesoQueCubre(prisma, padre)).estado).toBe("cerrado");
    expect((await procesoQueCubre(prisma, hijo)).estado).toBe("cerrado");
    await expect(
      startDryingRun(gestor, { lotId: padre, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
    await expect(
      startDryingRun(gestor, { lotId: hijo, startedAt: ahora(), provenanceClass: "original_record" }),
    ).rejects.toThrow(new LotProcessError("sin_proceso_abierto"));
    // Y no empezó nada: el rechazo es de la transacción entera.
    expect(await corridasEmpezadasEn([padre, hijo])).toBe(0);
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
