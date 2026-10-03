/**
 * R7 de la Parte 1: la compuerta de bodega mira el proceso que CUBRE al lote —buscado hacia arriba—, y
 * lo hace DENTRO de la transacción de `moveLotToStorage`, con el linaje bloqueado. El que va a bodega
 * es el pergamino, y su proceso vive en la cereza. Sólo al ENTRAR: reubicar un lote que ya está dentro
 * no vuelve a juzgar el secado. Un lote sin proceso entra, como hoy (R9).
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { moveLotToStorage } from "../../lib/traceability/storage";
import {
  abrirProceso,
  cerrarProceso,
  coberturaDelLote,
  devolverASecado,
  opcionesParaProceso,
  puedeAbrirProceso,
  puedeDevolverASecado,
  fraseDeNoAbrir,
  CATALOGO_MOTIVO_DEVOLUCION,
  FRASES_DE_NO_ABRIR,
  MOTIVOS_PARA_NO_ABRIR,
  MOTIVOS_PARA_NO_DEVOLVER,
} from "../../lib/traceability/lotProcess";
import { createSampleFromLot } from "../../lib/traceability/samples";
import { startDryingRun, endDryingRun } from "../../lib/traceability/drying";
import { recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { loteDividido, procesoQueCubre, procesosParaEntrada } from "../../lib/traceability/procesoDelLinaje";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import type { Prisma } from "../../generated/prisma/client";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `bodega-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
/** Revisión final (ronda de arreglo 1, F7): una segunda parcela, quien sólo la ve a ella (`soloB`) y quien ve las dos (`ambos`). */
let plotB: string, scopeB: string, soloB: string, ambos: string;
/** Los dos valores de catálogo que lleva todo proceso, buscados una vez: la carrera no tiene que gastar su
 *  arranque en dos lecturas, o una de las dos mitades llegaría siempre tarde y la prueba no correría nada. */
let gradoId: string, cerezaId: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
/** Mediciones de cierre. Se borran DESPUÉS de los procesos que las referencian (`closing_moisture_measurement_id` es RESTRICT). */
const mediciones: string[] = [];
/** Secados insertados crudos (tarea 9): se borran DESPUÉS de las transformaciones que los nombran. */
const secados: string[] = [];

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

/** Una humedad del lote, insertada cruda. `occurredAt` por defecto el 2026-03-20: una humedad que cierra un proceso no puede ser
 *  anterior a su inicio (`medicion_anterior_al_proceso`), así que un proceso que empieza después necesita la suya. */
async function humedad(lotId: string, value: number, occurredAt: Date = new Date("2026-03-20T12:00:00Z")) {
  const id = (await prisma.measurement.create({ data: { variable: "moisture", value, unit: "%", occurredAt, lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
  mediciones.push(id);
  return id;
}
/** Una corrección de `medicionId`, insertada cruda, como la escribiría `correctMeasurement` (`correctsId`). */
async function correccion(medicionId: string, value: number) {
  const original = await prisma.measurement.findUniqueOrThrow({ where: { id: medicionId } });
  const id = (await prisma.measurement.create({ data: {
    variable: "moisture", value, unit: "%", occurredAt: original.occurredAt, lotId: original.lotId, provenanceClass: "measured_fact",
    createdBy: gestor, correctsId: medicionId, reason: `TEST ${RUN}`,
  } })).id;
  mediciones.push(id);
  return id;
}

/** Cuántas asignaciones de bodega tiene el lote, y cuántas siguen abiertas: lo que una entrada rechazada NO pudo dejar escrito. */
async function asignaciones(lotId: string) {
  const [todas, abiertas] = await Promise.all([
    prisma.storageAssignment.count({ where: { lotId } }),
    prisma.storageAssignment.count({ where: { lotId, endedAt: null } }),
  ]);
  return { todas, abiertas };
}

/** Abre un proceso con los valores de catálogo ya buscados (`abrirProcesoDePrueba` los busca en cada llamada). */
function abrirDirecto(lotId: string) {
  return abrirProceso(gestor, {
    lotId, intent: "TEST: proceso abierto a la vez que se almacena (Parte 1, R7)", targetMoisturePct: 11.5,
    startedAt: new Date("2020-01-01T00:00:00Z"), provenanceClass: "original_record",
    processGradeValueId: gradoId, cherryStateValueId: cerezaId, processRecipeVersionId: null,
  });
}

/**
 * Un proceso ABIERTO insertado crudo, sin pasar por `abrirProceso` (ronda de arreglo 1 de la revisión final, 2026-10-03). Para
 * las pruebas de bodega cuyo estado de partida —un lote guardado bajo un ancestro con proceso abierto— ya no se puede construir
 * por el servicio: desde la decisión de Daniel del 2026-10-02, abrir sobre un lote con un descendiente en bodega se rechaza. Es
 * el estado de un lote guardado antes de la Parte 1. El primero del lote (`sequenceOrder` 1).
 */
async function procesoAbiertoCrudo(lotId: string) {
  return prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2020-01-01T00:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
  } });
}

/**
 * El resultado de una promesa sin que llegue a rechazarse nunca: mientras la prueba espera a otra cosa, una
 * entrada que falla no deja un rechazo sin atender (vitest lo contaría como error aparte). Misma forma que en
 * `corridaConProceso.test.ts`.
 */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: unknown };
const resultadoDe = <T>(p: Promise<T>): Promise<Resultado<T>> =>
  p.then((valor) => ({ ok: true as const, valor }), (error: unknown) => ({ ok: false as const, error }));

/**
 * Una transacción AJENA que hace `trabajo` y se queda abierta hasta que se la suelte; `pid` es su sesión en la
 * base, para preguntarle a `pg_blocking_pids` quién la espera. Copiada de `corridaConProceso.test.ts`, donde
 * está explicada. **Hay que llamar siempre a `soltar()`, también si la prueba falla (en un `finally`)**: si no,
 * el `afterAll` esperaría a lo que retiene y la limpieza se colgaría.
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

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
  plotB = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot B ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  scopeB = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotB } })).id;
  soloB = await cuenta("SoloB");
  ambos = await cuenta("Ambos");
  await prisma.assignment.create({ data: { userAccountId: soloB, roleProfileId: farm.id, scopeId: scopeB } });
  await prisma.assignment.create({ data: { userAccountId: ambos, roleProfileId: farm.id, scopeId: scopeB } });
  await prisma.assignment.create({ data: { userAccountId: ambos, roleProfileId: farm.id, scopeId } });
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  gradoId = g.id;
  cerezaId = c.id;
}, 60000);

afterAll(async () => {
  // El orden es el de las FK. Las asignaciones de bodega, antes que los lotes y la ubicación que referencian; los
  // procesos, antes que sus mediciones de cierre y que las transformaciones que cerraron por división (las dos
  // RESTRICT) y antes que los lotes; las transformaciones, antes que los lotes que enlazan.
  //
  // Tarea 9: la muestra verde. Las muestras, PRIMERO: apuntan a su lote y a la transformación de extracción. Y las
  // transformaciones que escriben los servicios (empezar y terminar un secado, sacar una muestra) no están en
  // `transformaciones`: se buscan por sus lotes, con los secados que nombran, antes de borrar nada.
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ sourceLotId: { in: lotes } }) });
  const deServicios = await prisma.lotTransformation.findMany({
    where: assertDefinedWhere({ OR: [{ inputs: { some: { lotId: { in: lotes } } } }, { outputs: { some: { lotId: { in: lotes } } } }] }),
    select: { id: true, dryingRunId: true },
  });
  const todasLasTransformaciones = [...new Set([...transformaciones, ...deServicios.map((t) => t.id)])];
  const todosLosSecados = [...new Set([...secados, ...deServicios.flatMap((t) => (t.dryingRunId ? [t.dryingRunId] : []))])];
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  // Las recetas de `coberturaDelLote`, DESPUÉS de los procesos que las usan (`process_recipe_version_id` es RESTRICT); sus
  // versiones caen con ellas (Cascade).
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: todasLasTransformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: todasLasTransformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: todasLasTransformaciones } }) });
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: todosLosSecados } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  // Los eventos de proceso (`lot_process.open`, `…close`) ya los borró el ayudante por el id de su proceso; esto recoge
  // lo que cualquier otra escritura de la cuenta haya dejado.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [gestor, soloB, ambos] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId: { in: [scopeId, scopeB] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [scopeId, scopeB] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gestor, soloB, ambos] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotId, plotB] } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R7 — la compuerta de bodega mira el proceso que cubre al lote", () => {
  it("el pergamino cuyo proceso vive en la cereza no entra con el proceso abierto", async () => {
    const cereza = await lote("B1-C");
    const fermentado = await lote("B1-F");
    const pergamino = await lote("B1-P");
    await enlazar([cereza], [fermentado]);
    await enlazar([fermentado], [pergamino]);
    await abrirProcesoDePrueba(gestor, cereza);
    await expect(moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("drying_not_finished"));
    expect((await asignaciones(pergamino)).todas, "una entrada rechazada dejó una asignación escrita").toBe(0);
  });

  it("con el id en MAYÚSCULAS, el pergamino tampoco entra con el proceso abierto en la cereza: la compuerta no falla abierta", async () => {
    // Revisión final (ronda de arreglo 1, 2026-10-03; corrige el registro, línea 139). Postgres encuentra el lote con el id en
    // mayúsculas —compara `uuid` sin caja—, pero el resolvedor comparaba en JavaScript el id recibido con los que devuelve la
    // base: el pergamino «no tenía padres», salía `sin_proceso`, y la compuerta lo dejaba entrar con el proceso abierto.
    const cereza = await lote("B14-C");
    const pergamino = await lote("B14-P");
    await enlazar([cereza], [pergamino]);
    await abrirProcesoDePrueba(gestor, cereza);
    await expect(moveLotToStorage(gestor, { lotId: pergamino.toUpperCase(), locationId: plotId, startedAt: ahora() }))
      .rejects.toThrow(new LotProcessError("drying_not_finished"));
    expect((await asignaciones(pergamino)).todas, "la entrada con el id en mayúsculas dejó una asignación escrita").toBe(0);
  });

  it("cerrado por humedad en el objetivo, el pergamino entra; por encima, no", async () => {
    const cereza = await lote("B2-C");
    const pergamino = await lote("B2-P");
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza); // objetivo 11,5
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino, 11) });
    const entrada = await moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() });
    expect(entrada.lotId).toBe(pergamino);
    expect(entrada.endedAt).toBeNull();

    const cereza2 = await lote("B3-C");
    const pergamino2 = await lote("B3-P");
    await enlazar([cereza2], [pergamino2]);
    const p2 = await abrirProcesoDePrueba(gestor, cereza2);
    await cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino2, 13) });
    await expect(moveLotToStorage(gestor, { lotId: pergamino2, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("moisture_above_target"));
    expect((await asignaciones(pergamino2)).todas, "una entrada rechazada dejó una asignación escrita").toBe(0);
  });

  it("la humedad EN el objetivo entra: la compuerta rechaza sólo lo que lo supera", async () => {
    // Diseño R7: «la medición de cierre en el objetivo o por debajo». Las dos de arriba (11 y 13 contra 11,5) no
    // pisan la frontera: con `>=` en lugar de `>` seguirían las dos en verde.
    const cereza = await lote("B8-C");
    const pergamino = await lote("B8-P");
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza); // objetivo 11,5
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino, 11.5) });
    const entrada = await moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() });
    expect(entrada.lotId).toBe(pergamino);
  });

  it("la compuerta juzga con la ÚLTIMA corrección de la humedad de cierre: corregida por encima del objetivo no entra; por debajo, sí", async () => {
    // Revisión final (ronda de arreglo 1, 2026-10-03, M2). Corregir la lectura que cerró el proceso no tocaba la compuerta, que
    // seguía leyendo el número declarado erróneo. Dos árboles, en las dos direcciones: con la lectura ORIGINAL, el primero entraría
    // y el segundo no. El segundo lleva una cadena de DOS correcciones: vale la última, no la primera.
    const cereza = await lote("B12-C");
    const pergamino = await lote("B12-P");
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza); // objetivo 11,5
    const m = await humedad(pergamino, 11);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: m });
    await correccion(m, 13);
    await expect(moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("moisture_above_target"));
    expect((await asignaciones(pergamino)).todas, "una entrada rechazada dejó una asignación escrita").toBe(0);
    // La ficha y la página del proceso enseñan la misma humedad que la compuerta lee.
    expect(visible((await coberturaDelLote(gestor, pergamino)).vigente).humedadDeCierre).toBe(13);

    const cereza2 = await lote("B13-C");
    const pergamino2 = await lote("B13-P");
    await enlazar([cereza2], [pergamino2]);
    const p2 = await abrirProcesoDePrueba(gestor, cereza2);
    const m2 = await humedad(pergamino2, 13);
    await cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: ahora(), closingMoistureMeasurementId: m2 });
    await correccion(await correccion(m2, 12.5), 11);
    const entrada = await moveLotToStorage(gestor, { lotId: pergamino2, locationId: plotId, startedAt: ahora() });
    expect(entrada.lotId).toBe(pergamino2);
    expect(visible((await coberturaDelLote(gestor, pergamino2)).vigente).humedadDeCierre).toBe(11);
  });

  it("reubicar dentro de bodega no vuelve a juzgar el secado", async () => {
    const cereza = await lote("B4-C");
    const guardado = await lote("B4-G");
    await enlazar([cereza], [guardado]);
    await prisma.storageAssignment.create({ data: { lotId: guardado, locationId: plotId, startedAt: new Date("2026-03-01T12:00:00Z") } });
    // Un ancestro con proceso ABIERTO sobre un lote ya guardado: es un lote guardado ANTES de la Parte 1 cuyo ancestro tiene
    // un proceso abierto (diseño R7, «Sólo al entrar a bodega»). Se inserta CRUDO: por el servicio ya no se puede, porque
    // abrir un proceso sobre un lote con un descendiente en bodega se rechaza (`descendiente_en_bodega`, decisión de Daniel
    // del 2026-10-02). Esta prueba es de la reubicación, no de la apertura: con el proceso abierto la compuerta rechazaría
    // una ENTRADA, y una reubicación no la consulta.
    await procesoAbiertoCrudo(cereza);
    const nueva = await moveLotToStorage(gestor, { lotId: guardado, locationId: plotId, startedAt: ahora() });
    expect(nueva.lotId).toBe(guardado);
    // Control: de verdad se reubicó —la vieja se cerró y hay una nueva abierta—, no se devolvió nada por otro camino.
    expect(await asignaciones(guardado)).toEqual({ todas: 2, abiertas: 1 });
  });

  it("un lote sin proceso entra como hoy", async () => {
    const l = await lote("B5");
    const entrada = await moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: ahora() });
    expect(entrada.lotId).toBe(l);
  });

  it("la compuerta rechaza un lote dividido y una mezcla, cada uno con su código", async () => {
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    // Dividido: la entrada de una división que cerró un proceso.
    const x = await lote("B7-X");
    const x1 = await lote("B7-X1");
    // Un descendiente de X que ya existía ANTES de dividir: no es la entrada de la división, así que `loteDividido`
    // dice que no, y sólo lo rechaza que el proceso que lo cubre sea el dividido.
    const z = await lote("B7-Z");
    await enlazar([x], [z]);
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "split", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      inputs: { create: [{ lotId: x }] }, outputs: { create: [{ lotId: x1 }] },
    } });
    transformaciones.push(t.id);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
      endedAt: ahora(), closureKind: "divided", dividedByTransformationId: t.id,
    } });
    await expect(moveLotToStorage(gestor, { lotId: x, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("lote_dividido"));
    await expect(moveLotToStorage(gestor, { lotId: z, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("lote_dividido"));

    // Mezcla: dos ramas cerradas por humedad, con procesos distintos.
    const a = await lote("B7-A");
    const b = await lote("B7-B");
    const pa = await abrirProcesoDePrueba(gestor, a);
    await cerrarProceso(gestor, { lotProcessId: pa.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(a, 11) });
    const pb = await abrirProcesoDePrueba(gestor, b);
    await cerrarProceso(gestor, { lotProcessId: pb.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(b, 11) });
    const m = await lote("B7-M");
    await enlazar([a, b], [m]);
    await expect(moveLotToStorage(gestor, { lotId: m, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("lote_mezclado"));
    for (const id of [x, z, m]) expect((await asignaciones(id)).todas, "una entrada rechazada dejó una asignación escrita").toBe(0);
  });

  it("almacenar a la vez que se abre un proceso que lo cubre: no salen bien las dos, y la que pierde dice por qué", async () => {
    // Diez vueltas, cada una con un lote nuevo, y las dos mitades arrancan juntas (los valores de catálogo ya están
    // buscados). Es una carrera: sin el bloqueo del linaje alguna vuelta deja las dos bien. La que NO la aísla del todo
    // —puede ganar siempre la misma mitad— es ésta; la que sí lo hace es la determinista de abajo.
    for (let vuelta = 1; vuelta <= 10; vuelta++) {
      const l = await lote(`B6-${vuelta}`);
      const [almacena, abre] = await Promise.allSettled([
        moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: ahora() }),
        abrirDirecto(l),
      ]);
      const bien = [almacena, abre].filter((x) => x.status === "fulfilled");
      expect(bien, `vuelta ${vuelta}: salieron bien las dos`).toHaveLength(1);
      // El MOTIVO del rechazo, no sólo cuántas salieron: la entrada pierde con `drying_not_finished` si el proceso se
      // abrió primero, y la apertura pierde con `lote_en_bodega` si el lote entró primero.
      const perdedora = almacena.status === "rejected" ? almacena : abre;
      expect(perdedora.status).toBe("rejected");
      if (perdedora.status === "rejected") {
        expect(perdedora.reason).toBeInstanceOf(LotProcessError);
        expect((perdedora.reason as LotProcessError).message).toBe(almacena.status === "rejected" ? "drying_not_finished" : "lote_en_bodega");
      }
      // Y el estado final no es el que la compuerta prohíbe: lote en bodega con un proceso abierto que lo cubre.
      const enBodega = (await asignaciones(l)).abiertas;
      const abiertos = await prisma.lotProcess.count({ where: { lotId: l, endedAt: null } });
      expect(enBodega + abiertos, `vuelta ${vuelta}: el lote quedó en bodega con un proceso abierto`).toBe(1);
    }
  }, 60000);

  it("almacenar decide DESPUÉS de tener el linaje: espera a quien retiene la fila de un ancestro, y si éste abre un proceso, se rechaza", async () => {
    const cereza = await lote("B9-C");
    const pergamino = await lote("B9-P");
    await enlazar([cereza], [pergamino]);

    // Otra transacción retiene la fila de la CEREZA, que es un ancestro del lote que va a bodega, y dentro de ella
    // abre un proceso (crudo, como lo dejaría la apertura con el linaje bloqueado). Todavía no confirma: quien lea
    // ahora no ve ningún proceso, y la entrada saldría bien.
    const abre = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${cereza}::uuid FOR UPDATE`;
      await tx.lotProcess.create({ data: {
        lotId: cereza, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2026-03-01T12:00:00Z"),
        provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
      } });
    });
    let entrada: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await abre.pid;
      entrada = resultadoDe(moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: ahora() }));
      // Sin `bloquearLinaje` dentro de la transacción de bodega la entrada termina sin esperar a nadie, y aquí nunca
      // aparece nadie bloqueado.
      await esperarQueAlguienEspere(pid, "la entrada a bodega no esperó la fila del ancestro: no bloqueó el linaje");
      abre.soltar();
      await abre.hecho; // COMMIT: el proceso queda abierto sobre la cereza
      const v = await entrada;
      expect(v.ok, "la entrada decidió antes de tener el linaje y dejó entrar un lote cuyo proceso se acababa de abrir").toBe(false);
      if (!v.ok) {
        expect(v.error).toBeInstanceOf(LotProcessError);
        expect((v.error as LotProcessError).message).toBe("drying_not_finished");
      }
      expect((await asignaciones(pergamino)).todas, "la entrada rechazada dejó una asignación escrita").toBe(0);
      // Control: el proceso SÍ quedó confirmado, abierto y sobre la cereza; sin esto, «rechazó» podría ser cualquier otra cosa.
      expect(await prisma.lotProcess.count({ where: { lotId: cereza, endedAt: null } })).toBe(1);
    } finally {
      abre.soltar();
      await abre.hecho.catch(() => undefined);
      await entrada;
    }
  });

  it("un lote dividido sigue fuera de bodega aunque su ancestro se reprocese y cierre en el objetivo: lo rechaza `loteDividido`, no el proceso vigente", async () => {
    // Ronda de arreglo 1 (2026-10-01). La PRIMERA comprobación de `exigeSecadoTerminado` (`loteDividido`) NO es redundante con la
    // del proceso vigente (`closureKind: divided`), y el informe de la tarea 7 se equivocó al decirlo. El estado es alcanzable
    // sólo por servicios, y R2 lo permite («abrir un proceso nuevo sobre un lote cubierto por uno CERRADO está permitido»):
    //   C (cereza) -> L (stage_change); un proceso P1 abierto sobre C, que cubre a L;
    //   se divide L bajo P1 (L queda dividido; P1 queda `divided`; cada parte recibe su copia);
    //   se cierran por humedad las copias de las partes;
    //   se abre un proceso NUEVO P2 sobre C —el reproceso— y se cierra por humedad en el objetivo.
    // Ahora el proceso que CUBRE a L es P2 (el más reciente de C): cerrado por humedad, en el objetivo. Sólo `loteDividido(L)` —que
    // mira la división de la que L es entrada, no el vigente— lo deja fuera de bodega.
    const c = await lote("B10-C");
    const paso = await recordTransformation(gestor, {
      transformationType: "stage_change", occurredAt: new Date("2026-03-02T12:00:00Z"), provenanceClass: "original_record",
      inputs: [{ lotId: c, quantity: null, unit: null }],
      outputs: [{ lotCode: `B10-L-${RUN}`, lotType: "processing", quantity: null, unit: null }],
    });
    transformaciones.push(paso.transformation.id);
    lotes.push(...paso.outputLots.map((x) => x.id));
    const l = paso.outputLots[0]!.id;
    const p1 = await abrirProcesoDePrueba(gestor, c, { startedAt: new Date("2026-03-01T12:00:00Z") });

    const division = await recordTransformation(gestor, {
      transformationType: "split", occurredAt: new Date("2026-03-10T12:00:00Z"), provenanceClass: "original_record",
      inputs: [{ lotId: l, quantity: null, unit: null }],
      outputs: ["A", "B"].map((x) => ({ lotCode: `B10-${x}-${RUN}`, lotType: "processing" as const, quantity: null, unit: null })),
    });
    transformaciones.push(division.transformation.id);
    lotes.push(...division.outputLots.map((x) => x.id));
    const partes = division.outputLots.map((x) => x.id);
    for (const parte of partes) {
      const copia = await prisma.lotProcess.findFirstOrThrow({ where: { lotId: parte } });
      await cerrarProceso(gestor, { lotProcessId: copia.id, endedAt: new Date("2026-03-20T12:00:00Z"), closingMoistureMeasurementId: await humedad(parte, 11) });
    }
    // El reproceso sobre el ancestro, cerrado por humedad en el objetivo (11 contra 11,5).
    const p2 = await abrirProcesoDePrueba(gestor, c, { startedAt: new Date("2026-04-01T12:00:00Z") });
    // La humedad del reproceso, tomada DESPUÉS de su inicio: con la del 2026-03-20 se cerraba antes (registro, línea 172) y desde la
    // revisión final se rechaza (`medicion_anterior_al_proceso`).
    await cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: new Date("2026-04-20T12:00:00Z"), closingMoistureMeasurementId: await humedad(c, 11, new Date("2026-04-15T12:00:00Z")) });

    // Controles de que el estado es el que se quiere probar: sin ellos, el rechazo de abajo podría venir de cualquier otra cosa.
    expect(await loteDividido(prisma, l), "L debería ser la entrada de una división que cerró un proceso").toBe(true);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p1.id } })).closureKind, "P1 debería haber quedado dividido").toBe("divided");
    const cobertura = await procesoQueCubre(prisma, l);
    expect(cobertura.estado).toBe("cerrado");
    expect(cobertura.vigente?.id, "el proceso que cubre a L debería ser el reproceso P2, no el dividido P1").toBe(p2.id);
    const vigente = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p2.id }, include: { closingMoistureMeasurement: true } });
    expect(vigente.closureKind).toBe("moisture");
    expect(vigente.closingMoistureMeasurement!.value.toNumber()).toBeLessThanOrEqual(vigente.targetMoisturePct.toNumber());

    await expect(moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: ahora() })).rejects.toThrow(new LotProcessError("lote_dividido"));
    expect((await asignaciones(l)).todas, "una entrada rechazada dejó una asignación escrita").toBe(0);
    // Control positivo: una PARTE de esa división, con su copia cerrada por humedad en el objetivo, sí entra por la misma compuerta.
    const entrada = await moveLotToStorage(gestor, { lotId: partes[0]!, locationId: plotId, startedAt: ahora() });
    expect(entrada.lotId).toBe(partes[0]);
  });

  it("una reubicación decide DESPUÉS de tener el linaje: si mientras esperaba el lote salió de bodega, entra por la compuerta y se rechaza", async () => {
    // Ronda de arreglo 1 (2026-10-01): la lectura de la asignación abierta —la que decide entre ENTRADA (con compuerta) y
    // REUBICACIÓN (sin ella)— va DESPUÉS de `bloquearLinaje`, y el bloqueo se toma en toda llamada. Lo que lo amenaza es
    // `devolverASecado` (tarea 8): termina la asignación de bodega y abre una continuación. Aquí una transacción ajena hace
    // lo primero con el proceso que cubre al lote ABIERTO (el ancestro lo tiene, como en «reubicar dentro de bodega…»).
    const cereza = await lote("B11-C");
    const guardado = await lote("B11-G");
    await enlazar([cereza], [guardado]);
    const vieja = await prisma.storageAssignment.create({ data: { lotId: guardado, locationId: plotId, startedAt: new Date("2026-03-01T12:00:00Z") } });
    // Crudo, como en «reubicar dentro de bodega…»: por el servicio ya no se abre un proceso sobre un lote con un descendiente
    // en bodega (`descendiente_en_bodega`), y esta prueba es del orden de la reubicación, no de la apertura.
    await procesoAbiertoCrudo(cereza);

    const saca = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${guardado}::uuid FOR UPDATE`;
      await tx.storageAssignment.update({ where: { id: vieja.id }, data: { endedAt: new Date("2026-03-15T12:00:00Z") } });
    });
    let reubicacion: Promise<Resultado<unknown>> | undefined;
    try {
      const pid = await saca.pid;
      // Sin COMMIT todavía: quien lea ahora la asignación del lote la ve abierta, y la llamada iría por la rama de reubicación.
      reubicacion = resultadoDe(moveLotToStorage(gestor, { lotId: guardado, locationId: plotId, startedAt: ahora() }));
      // La llamada queda en espera de la otra transacción: con el arreglo, en `bloquearLinaje` (la fila del lote); sin él, más tarde, en
      // la fila de la asignación que va a cerrar. Esta espera sólo prueba que la llamada está en vuelo; lo que prueba el ORDEN es el
      // resultado de abajo.
      await esperarQueAlguienEspere(pid, "la reubicación no quedó esperando a la otra transacción");
      saca.soltar();
      await saca.hecho; // COMMIT: la asignación abierta ya no existe
      const v = await reubicacion;
      expect(v.ok, "la llamada leyó la asignación antes de tener el linaje: fue por la rama de reubicación, sin compuerta, y metió el lote en bodega con el proceso abierto").toBe(false);
      if (!v.ok) {
        expect(v.error).toBeInstanceOf(LotProcessError);
        expect((v.error as LotProcessError).message).toBe("drying_not_finished");
      }
      // Sólo queda la que cerró la otra transacción: la llamada rechazada no escribió nada.
      expect(await asignaciones(guardado)).toEqual({ todas: 1, abiertas: 0 });
      // Control: el proceso del ancestro sigue ABIERTO; sin esto, «rechazó» podría ser cualquier otra cosa.
      expect(await prisma.lotProcess.count({ where: { lotId: cereza, endedAt: null } })).toBe(1);
    } finally {
      saca.soltar();
      await saca.hecho.catch(() => undefined);
      await reubicacion;
    }
  });
});

describe("R7 — de bodega a secado sólo por un defecto de humedad", () => {
  async function motivo(valor: string) {
    return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: valor, catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } } })).id;
  }

  it("desde bodega: termina la bodega, abre la continuación y deja a los hermanos bajo el cerrado", async () => {
    const cereza = await lote("V1-C");
    const a = await lote("V1-A");
    const b = await lote("V1-B");
    await enlazar([cereza], [a, b]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(a, 11) });
    await moveLotToStorage(gestor, { lotId: a, locationId: plotId, startedAt: ahora() });
    await moveLotToStorage(gestor, { lotId: b, locationId: plotId, startedAt: ahora() });

    const { continuacion, devolucion } = await devolverASecado(gestor, { lotId: a, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: ahora() });
    expect(continuacion.lotId).toBe(a);
    expect(devolucion.endedStorageAssignmentId).not.toBeNull();
    expect(await prisma.storageAssignment.count({ where: { lotId: a, endedAt: null } })).toBe(0);
    // El hermano sigue bajo el proceso CERRADO y en bodega.
    // Ronda de arreglo 1 (2026-10-02): cada aserción de los hermanos lleva su mensaje, porque son las que caen cuando la
    // devolución toca a `b` con la continuación de `a` bien hecha (ver el informe: flips S1 y S2).
    const cobB = await procesoQueCubre(prisma, b);
    expect(cobB.vigente?.id, "HERMANO b: devolver `a` cambió el proceso que cubre a `b`").toBe(p.id);
    expect(cobB.estado, "HERMANO b: devolver `a` reabrió el proceso cerrado que también cubre a `b`").toBe("cerrado");
    expect(
      await prisma.storageAssignment.count({ where: { lotId: b, endedAt: null } }),
      "HERMANO b: devolver `a` terminó la asignación de bodega de `b`",
    ).toBe(1);
  });

  it("«otro» exige nota", async () => {
    const l = await lote("V2");
    const p = await abrirProcesoDePrueba(gestor, l);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(l, 11) });
    await expect(devolverASecado(gestor, { lotId: l, motivoValueId: await motivo("otro"), ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("motivo_otro_requiere_nota"));
  });

  it("un lote dividido no se devuelve a secado", async () => {
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    const x = await lote("V3-X");
    const x1 = await lote("V3-X1");
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "split", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      inputs: { create: [{ lotId: x }] }, outputs: { create: [{ lotId: x1 }] },
    } });
    transformaciones.push(t.id);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
      endedAt: ahora(), closureKind: "divided", dividedByTransformationId: t.id,
    } });
    await expect(devolverASecado(gestor, { lotId: x, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("lote_dividido"));
  });

  // Lo que sigue lo añade la tarea 8 al encargo: cada prueba fija una comprobación de `devolverASecado` que las tres de arriba
  // no cubren, y cada una cae con su mutación (ver el informe de la tarea).

  it("un descendiente de un lote dividido, anterior a la división, tampoco se devuelve: lo rechaza el cierre `divided` del vigente", async () => {
    // `loteDividido(z)` dice que NO —z no es la entrada de la división—, así que `lote_dividido` sólo puede venir de que el proceso que
    // lo cubre sea el cerrado como `divided`. Con X la entrada de la división, las dos comprobaciones de dividido se tapan entre sí
    // (la prueba de arriba): sin la del cierre, la continuación se abriría sobre Z copiando un proceso dividido.
    const x = await lote("V9-X");
    const x1 = await lote("V9-X1");
    const z = await lote("V9-Z");
    await enlazar([x], [z]);
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "split", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      inputs: { create: [{ lotId: x }] }, outputs: { create: [{ lotId: x1 }] },
    } });
    transformaciones.push(t.id);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
      endedAt: ahora(), closureKind: "divided", dividedByTransformationId: t.id,
    } });
    // Controles de que el estado es el que se quiere probar: Z no es «dividido», y su vigente SÍ es el cerrado como `divided`.
    expect(await loteDividido(prisma, z), "Z no debería ser la entrada de ninguna división").toBe(false);
    const cobertura = await procesoQueCubre(prisma, z);
    expect(cobertura.estado).toBe("cerrado");
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: cobertura.vigente!.id } })).closureKind).toBe("divided");

    await expect(devolverASecado(gestor, { lotId: z, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("lote_dividido"));
    expect(await prisma.lotProcess.count({ where: { lotId: z } }), "el rechazo dejó un proceso escrito en Z").toBe(0);
  });

  /**
   * Un lote cuyo proceso (en el propio lote) ya cerró por humedad en el objetivo, y cuántas devoluciones tiene ese proceso.
   * El cierre es del 2026-05-01 y no «ahora»: la fecha de una devolución tiene que ser POSTERIOR al cierre (ronda de arreglo 1,
   * 2026-10-02), y una prueba que da su propia fecha al hecho necesita un cierre al que poder ser posterior.
   */
  async function loteCerrado(codigo: string) {
    const l = await lote(codigo);
    const p = await abrirProcesoDePrueba(gestor, l);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: new Date("2026-05-01T12:00:00Z"), closingMoistureMeasurementId: await humedad(l, 11) });
    return { l, p };
  }
  const devolucionesDe = (procesoId: string) => prisma.lotProcessReturn.count({ where: { closedLotProcessId: procesoId } });

  it("un valor que no es del catálogo de motivos no vale: una clave foránea válida no basta", async () => {
    const { l, p } = await loteCerrado("V4");
    // `gradoId` es un valor REAL de `grado_proceso`: pasa la clave foránea de `reason_value_id` y contaminaría la lista de motivos.
    await expect(devolverASecado(gestor, { lotId: l, motivoValueId: gradoId, ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("motivo_required"));
    expect(await devolucionesDe(p.id), "un motivo de otro catálogo dejó una devolución escrita").toBe(0);
  });

  it("«otro» con nota se devuelve y la nota queda sin sus espacios; con una nota de sólo espacios, no", async () => {
    const { l, p } = await loteCerrado("V6");
    const otro = await motivo("otro");
    await expect(devolverASecado(gestor, { lotId: l, motivoValueId: otro, nota: "   ", ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("motivo_otro_requiere_nota"));
    expect(await devolucionesDe(p.id), "una nota de espacios dejó una devolución escrita").toBe(0);
    // La fecha que el operario dio es la del hecho: la devolución y el inicio de la continuación, no «ahora».
    const cuando = new Date("2026-06-01T12:00:00Z");
    const { continuacion, devolucion } = await devolverASecado(gestor, { lotId: l, motivoValueId: otro, nota: "  se pesó mal la muestra  ", ocurrioEn: cuando });
    expect(devolucion.note).toBe("se pesó mal la muestra");
    expect(devolucion.occurredAt).toEqual(cuando);
    expect(continuacion.startedAt).toEqual(cuando);
    // El lote no estaba en bodega (sólo cerró su proceso): no hay asignación que terminar.
    expect(devolucion.endedStorageAssignmentId).toBeNull();
    expect(await devolucionesDe(p.id)).toBe(1);
  });

  it("sin proceso, con el proceso abierto, o en una mezcla, no hay nada que devolver: cada uno con su código", async () => {
    const m = await motivo("error_de_medicion");
    const sin = await lote("V7-S");
    await expect(devolverASecado(gestor, { lotId: sin, motivoValueId: m, ocurrioEn: ahora() })).rejects.toThrow(new LotProcessError("process_not_found"));
    // Abierto: sin esta comprobación, `closureKind` nulo se leería como «no cerrado por humedad» y saldría `lote_dividido`, que miente.
    const abierto = await lote("V7-O");
    await abrirProcesoDePrueba(gestor, abierto);
    await expect(devolverASecado(gestor, { lotId: abierto, motivoValueId: m, ocurrioEn: ahora() })).rejects.toThrow(new LotProcessError("process_already_open"));
    // Mezcla: dos ramas cerradas por humedad con procesos distintos.
    const a = (await loteCerrado("V7-A")).l;
    const b = (await loteCerrado("V7-B")).l;
    const mezcla = await lote("V7-M");
    await enlazar([a, b], [mezcla]);
    await expect(devolverASecado(gestor, { lotId: mezcla, motivoValueId: m, ocurrioEn: ahora() })).rejects.toThrow(new LotProcessError("lote_mezclado"));
  });

  /**
   * Cronología (ronda de arreglo 1, 2026-10-02). `ocurrioEn` es a la vez el fin de la asignación de bodega, el inicio de la
   * continuación y la fecha de la devolución, y antes no se comparaba con nada: aceptaba una devolución anterior al cierre del
   * proceso que continúa, y dejaba una asignación con `ended_at < started_at` (la base no tiene `CHECK` para eso).
   *
   * Un lote CON proceso cerrado y en bodega, con las tres fechas que se pasan explícitas: el cierre (`cierre`), la entrada a bodega
   * (`entrada`) y, en cada prueba, la de la devolución. **Cada prueba deja que SOLO una comprobación pueda rechazarla**: si la
   * devolución fuera anterior al cierre Y a la entrada, quitar una de las dos comprobaciones no se vería.
   */
  async function enBodegaTrasCerrar(codigo: string, cierre: Date, entrada: Date) {
    const l = await lote(codigo);
    const p = await abrirProcesoDePrueba(gestor, l);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: cierre, closingMoistureMeasurementId: await humedad(l, 11) });
    await moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: entrada });
    // Controles del estado de partida: el lote está en bodega, con su proceso cerrado y sin continuación ni devolución.
    expect(await asignaciones(l)).toEqual({ todas: 1, abiertas: 1 });
    expect(await devolucionesDe(p.id)).toBe(0);
    return { l, p };
  }
  /** Lo que un rechazo no pudo dejar escrito: ninguna continuación ni devolución, y la bodega como estaba. */
  async function sinHuellaDelRechazo(l: string, procesoId: string) {
    expect(await devolucionesDe(procesoId), "el rechazo dejó una devolución escrita").toBe(0);
    expect(await prisma.lotProcess.count({ where: { lotId: l } }), "el rechazo dejó una continuación escrita").toBe(1);
    expect(await asignaciones(l), "el rechazo terminó la asignación de bodega").toEqual({ todas: 1, abiertas: 1 });
  }

  it("una devolución anterior al cierre del proceso se rechaza y no escribe nada: devolucion_antes_del_cierre", async () => {
    // La entrada a bodega (03-01) es ANTERIOR al cierre registrado (03-10) a propósito: así la devolución (03-05) no es anterior a la
    // entrada y la única comprobación que puede rechazarla es la del cierre. Con la entrada posterior, las dos la rechazarían.
    const { l, p } = await enBodegaTrasCerrar("V11", new Date("2026-03-10T12:00:00Z"), new Date("2026-03-01T12:00:00Z"));
    await expect(devolverASecado(gestor, { lotId: l, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: new Date("2026-03-05T12:00:00Z") }))
      .rejects.toThrow(new LotProcessError("devolucion_antes_del_cierre"));
    await sinHuellaDelRechazo(l, p.id);
  });

  it("una devolución anterior a la entrada en bodega se rechaza y no escribe nada: devolucion_antes_del_cierre", async () => {
    // Aquí la devolución (03-15) es POSTERIOR al cierre (03-10) y anterior a la entrada (03-20): sólo la comprobación de la
    // asignación puede rechazarla, y sin ella terminaría una asignación antes de que empezara.
    const { l, p } = await enBodegaTrasCerrar("V12", new Date("2026-03-10T12:00:00Z"), new Date("2026-03-20T12:00:00Z"));
    await expect(devolverASecado(gestor, { lotId: l, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: new Date("2026-03-15T12:00:00Z") }))
      .rejects.toThrow(new LotProcessError("devolucion_antes_del_cierre"));
    await sinHuellaDelRechazo(l, p.id);
  });

  it("la frontera es estricta: una devolución en el MISMO instante del cierre y de la entrada se acepta", async () => {
    // Control del reverso: el guardia no puede rechazar lo que es posible. Una devolución inmediata al cierre, a la hora exacta de
    // la entrada, es un hecho que puede ocurrir; con `<=` en lugar de `<` esta prueba cae.
    const instante = new Date("2026-03-10T12:00:00Z");
    const { l } = await enBodegaTrasCerrar("V13", instante, instante);
    const { continuacion, devolucion } = await devolverASecado(gestor, { lotId: l, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: instante });
    expect(continuacion.startedAt).toEqual(instante);
    expect(devolucion.endedStorageAssignmentId).not.toBeNull();
    expect(await asignaciones(l)).toEqual({ todas: 1, abiertas: 0 });
  });

  it("si abrir la continuación falla, la asignación de bodega no queda terminada: todo o nada", async () => {
    // R7: «si cualquier paso falla, se deshace todo». El fallo tiene que llegar DESPUÉS de terminar la bodega, o no prueba nada: R2 rechaza
    // la continuación porque un DESCENDIENTE del lote devuelto tiene un proceso abierto —un reproceso, que R2 permite sobre un lote
    // cubierto por uno cerrado—, y eso `abrirProcesoEnTx` lo mira ya con la asignación terminada.
    const cereza = await lote("V10-C");
    const a = await lote("V10-A");
    const hijo = await lote("V10-H");
    await enlazar([cereza], [a]);
    await enlazar([a], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(a, 11) });
    await moveLotToStorage(gestor, { lotId: a, locationId: plotId, startedAt: ahora() });
    await abrirProcesoDePrueba(gestor, hijo);
    // Controles del estado: `a` está en bodega, su vigente es el cerrado de la cereza, y un descendiente suyo tiene un proceso abierto.
    expect(await asignaciones(a)).toEqual({ todas: 1, abiertas: 1 });
    expect((await procesoQueCubre(prisma, a)).vigente?.id).toBe(p.id);
    expect(await prisma.lotProcess.count({ where: { lotId: hijo, endedAt: null } })).toBe(1);

    await expect(devolverASecado(gestor, { lotId: a, motivoValueId: await motivo("error_de_medicion"), ocurrioEn: ahora() }))
      .rejects.toThrow(new LotProcessError("process_already_open"));
    expect(await asignaciones(a), "el rechazo dejó terminada la asignación de bodega").toEqual({ todas: 1, abiertas: 1 });
    expect(await devolucionesDe(p.id), "el rechazo dejó una devolución escrita").toBe(0);
    expect(await prisma.lotProcess.count({ where: { lotId: a } }), "el rechazo dejó una continuación escrita").toBe(0);
  });

  it("la continuación no se cierra con la humedad que cerró el proceso anterior: medicion_anterior_al_proceso; con una lectura nueva, sí", async () => {
    // Revisión final (ronda de arreglo 1, 2026-10-03). M1 cierra P1 en el objetivo y el lote entra en bodega; se devuelve a secado
    // (la continuación P2 empieza el 2026-06-01). Cerrar P2 con M1 —la lectura que la devolución acaba de declarar errónea— dejaba
    // volver a bodega sin secar. La pantalla tampoco la ofrece: el desplegable de cierre sólo trae lo medido desde el inicio de P2.
    const l = await lote("V14");
    const p1 = await abrirProcesoDePrueba(gestor, l);
    const m1 = await humedad(l, 11);
    await cerrarProceso(gestor, { lotProcessId: p1.id, endedAt: new Date("2026-05-01T12:00:00Z"), closingMoistureMeasurementId: m1 });
    await moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: new Date("2026-05-02T12:00:00Z") });
    const motivo = (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "error_de_medicion", catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } } })).id;
    const { continuacion: p2 } = await devolverASecado(gestor, { lotId: l, motivoValueId: motivo, ocurrioEn: new Date("2026-06-01T12:00:00Z") });
    // Una lectura nueva, y otra corregida: la corregida no se ofrece, su corrección sí.
    const m2 = await humedad(l, 11, new Date("2026-06-10T12:00:00Z"));
    const m3 = await humedad(l, 14, new Date("2026-06-09T12:00:00Z"));
    const c3 = await correccion(m3, 12);

    const ofrecidas = (await opcionesParaProceso(gestor, l)).mediciones.map((m) => m.id);
    expect(ofrecidas, "el desplegable ofrece la humedad que cerró el proceso anterior").not.toContain(m1);
    expect(ofrecidas, "el desplegable ofrece una lectura ya corregida").not.toContain(m3);
    expect(ofrecidas, "control: el desplegable no ofrece las lecturas nuevas").toEqual(expect.arrayContaining([m2, c3]));

    await expect(cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: new Date("2026-06-11T12:00:00Z"), closingMoistureMeasurementId: m1 }))
      .rejects.toThrow(new LotProcessError("medicion_anterior_al_proceso"));
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p2.id } })).endedAt, "el rechazo cerró la continuación").toBeNull();
    // Control: con la lectura nueva, cierra por humedad.
    const cerrada = await cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: new Date("2026-06-11T12:00:00Z"), closingMoistureMeasurementId: m2 });
    expect(cerrada.closureKind).toBe("moisture");
  });

  it("devolver a secado decide DESPUÉS de tener el linaje: si mientras esperaba el lote se reubicó, termina la asignación NUEVA", async () => {
    // R2: `devolverASecado` es la operación que `moveLotToStorage` espera en su orden de bloqueo (tarea 7, ronda de arreglo 1). Aquí una
    // transacción ajena hace lo que haría una reubicación —retiene la fila del lote, termina la asignación vieja y abre otra— y no
    // confirma. La llamada tiene que ESPERAR; al confirmar, lee la asignación abierta que hay entonces (la nueva) y la termina.
    // Sin `bloquearLinaje` al principio la llamada lee la vieja antes de esperar, la sobrescribe al soltarse, y `lote_en_bodega` la rechaza
    // al ver la nueva abierta —o, si no la rechazara, dejaría la nueva abierta con una continuación abierta encima.
    const cereza = await lote("V8-C");
    const a = await lote("V8-A");
    await enlazar([cereza], [a]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(a, 11) });
    const vieja = await moveLotToStorage(gestor, { lotId: a, locationId: plotId, startedAt: ahora() });
    const motivoId = await motivo("error_de_medicion");

    let nuevaId: string | undefined;
    const reubica = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${a}::uuid FOR UPDATE`;
      await tx.storageAssignment.update({ where: { id: vieja.id }, data: { endedAt: ahora() } });
      nuevaId = (await tx.storageAssignment.create({ data: { lotId: a, locationId: plotId, startedAt: ahora() } })).id;
    });
    let devolucion: Promise<Resultado<Awaited<ReturnType<typeof devolverASecado>>>> | undefined;
    try {
      const pid = await reubica.pid;
      // La fecha del hecho se toma AHORA, cuando la otra transacción ya creó la asignación nueva con su `startedAt`: tomada antes
      // quedaba anterior a ella, y una devolución no puede terminar una asignación antes de que empezara (ronda de arreglo 1).
      const cuando = ahora();
      // Sin COMMIT todavía: quien lea ahora la asignación del lote ve la VIEJA abierta.
      devolucion = resultadoDe(devolverASecado(gestor, { lotId: a, motivoValueId: motivoId, ocurrioEn: cuando }));
      await esperarQueAlguienEspere(pid, "la devolución no quedó esperando a la otra transacción");
      reubica.soltar();
      await reubica.hecho; // COMMIT: la vieja está terminada y hay una nueva abierta
      const v = await devolucion;
      expect(v.ok, "la devolución decidió antes de tener el linaje y fue rechazada (o dejó una continuación sobre un lote que sigue en bodega)").toBe(true);
      if (v.ok) {
        expect(v.valor.devolucion.endedStorageAssignmentId, "terminó la asignación VIEJA, ya terminada, y dejó la nueva abierta").toBe(nuevaId);
        expect(v.valor.continuacion.lotId).toBe(a);
      }
      // Las dos terminadas: nada abierto en bodega, y la continuación abierta (control de que de verdad pasó).
      expect(await asignaciones(a)).toEqual({ todas: 2, abiertas: 0 });
      // La asignación se termina en el instante que dio el operario, no en «ahora».
      expect((await prisma.storageAssignment.findUniqueOrThrow({ where: { id: nuevaId! } })).endedAt).toEqual(cuando);
      expect(await prisma.lotProcess.count({ where: { lotId: a, endedAt: null } })).toBe(1);
    } finally {
      reubica.soltar();
      await reubica.hecho.catch(() => undefined);
      await devolucion;
    }
  });
});

/**
 * La entrada de una muestra verde que el servicio ACEPTA: los campos de la prueba de `tests/traceability/samples.test.ts` que
 * acepta una muestra verde (la que no lleva `rejects`), cambiando sólo el lote y el código.
 */
function muestraVerde(sourceLotId: string, codigo: string): Parameters<typeof createSampleFromLot>[1] {
  return {
    provenanceClass: "original_record",
    sampleCode: `${codigo}-${RUN}`,
    sampleType: "green_coffee",
    materialState: "GREEN",
    sourceLotId,
    occurredAt: ahora(),
  };
}

describe("R7 — la muestra verde con proceso exige el proceso cerrado por humedad", () => {
  // La prueba se arma para que la compuerta VIEJA pase: un pergamino salido de un secado terminado con `target_reached`. Así sólo
  // la condición nueva puede rechazarla; con un lote sin secado, la vieja ya lanza el mismo error y la prueba no distinguiría nada.
  it("con el proceso cerrado se saca; devuelto a secado (continuación abierta), ya no", async () => {
    const cereza = await lote("MV-C");
    const p = await abrirProcesoDePrueba(gestor, cereza);
    const { run } = await startDryingRun(gestor, { lotId: cereza, startedAt: ahora(), provenanceClass: "original_record" });
    const { outputLot: pergamino } = await endDryingRun(gestor, {
      dryingRunId: run.id, endedAt: ahora(), outputLotCode: `MV-P-${RUN}`, outputLotType: "parchment",
      provenanceClass: "original_record", endedOutcome: "target_reached",
    });
    lotes.push(pergamino.id);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino.id, 11) });
    // Control positivo: con el proceso cerrado por humedad, las dos compuertas dejan pasar.
    await expect(createSampleFromLot(gestor, muestraVerde(pergamino.id, "MV-1"))).resolves.toBeDefined();

    const motivo = (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "error_de_medicion", catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } } })).id;
    await devolverASecado(gestor, { lotId: pergamino.id, motivoValueId: motivo, ocurrioEn: ahora() });
    // Ahora SÓLO la compuerta nueva rechaza: la vieja sigue viendo el secado terminado.
    await expect(createSampleFromLot(gestor, muestraVerde(pergamino.id, "MV-2"))).rejects.toThrow(/green_sample_before_reposo/);
  });

  it("sin proceso, la muestra verde sigue entrando con un secado terminado a más de 6 generaciones", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push(await lote(`G${i}`));
    // Un secado VIEJO, crudo y terminado con objetivo alcanzado, de G0 a G1.
    const secado = await prisma.dryingRun.create({ data: { startedAt: new Date("2026-02-01T12:00:00Z"), endedAt: new Date("2026-02-10T12:00:00Z"), endedOutcome: "target_reached", createdBy: gestor } });
    secados.push(secado.id);
    const ts = await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: new Date("2026-02-10T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
      dryingRunId: secado.id, inputs: { create: [{ lotId: ids[0]! }] }, outputs: { create: [{ lotId: ids[1]! }] },
    } });
    transformaciones.push(ts.id);
    for (let i = 2; i < 10; i++) await enlazar([ids[i - 1]!], [ids[i]!]);
    await prisma.lot.update({ where: { id: ids[9]! }, data: { lotType: "green" } });
    // G1 queda a 8 generaciones de G9: el tope viejo de 6 no llegaba y decía «no».
    await expect(createSampleFromLot(gestor, muestraVerde(ids[9]!, "G9"))).resolves.toBeDefined();
  }, 60000);

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02): la rama de MEZCLA, que no tenía prueba. Una mezcla no tiene vigente: la compuerta
   * decide sobre TODOS los procesos a los que llegan sus ramas, y basta uno sin cerrar por humedad para rechazar. El lote de la
   * muestra sale de un secado terminado con objetivo alcanzado —está en reposo—, así que la compuerta VIEJA deja pasar: sólo la
   * nueva puede rechazar.
   */
  it("en una mezcla, todo proceso al que llegan sus ramas tiene que estar cerrado por humedad", async () => {
    const cerradoPorHumedad = async (codigo: string) => {
      const l = await lote(codigo);
      const p = await abrirProcesoDePrueba(gestor, l);
      await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: new Date("2026-05-01T12:00:00Z"), closingMoistureMeasurementId: await humedad(l, 11) });
      return l;
    };
    /** Un lote que junta a `padres` en un secado crudo, terminado con el objetivo alcanzado: su fase es «reposo». */
    const mezclaEnReposo = async (codigo: string, padres: string[]) => {
      const m = await lote(codigo);
      const secado = await prisma.dryingRun.create({ data: {
        startedAt: new Date("2026-05-02T12:00:00Z"), endedAt: new Date("2026-05-09T12:00:00Z"), endedOutcome: "target_reached", createdBy: gestor,
      } });
      secados.push(secado.id);
      const t = await prisma.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: new Date("2026-05-09T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
        dryingRunId: secado.id, inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: [{ lotId: m }] },
      } });
      transformaciones.push(t.id);
      return m;
    };

    // Control: las dos ramas cerradas por humedad, y entra. Sin esto, el rechazo de abajo podría ser de la compuerta vieja.
    const buena = await mezclaEnReposo("MV-MEZ-OK", [await cerradoPorHumedad("MV-MEZ-OK-A"), await cerradoPorHumedad("MV-MEZ-OK-B")]);
    expect((await procesoQueCubre(prisma, buena)).estado, "la prueba no armó una mezcla").toBe("mezcla");
    await expect(createSampleFromLot(gestor, muestraVerde(buena, "MV-MEZ-OK"))).resolves.toBeDefined();

    // Una rama con su proceso todavía abierto: no entra, aunque la otra esté cerrada y el secado haya terminado.
    const abierta = await lote("MV-MEZ-NO-B");
    await abrirProcesoDePrueba(gestor, abierta);
    const mala = await mezclaEnReposo("MV-MEZ-NO", [await cerradoPorHumedad("MV-MEZ-NO-A"), abierta]);
    expect((await procesoQueCubre(prisma, mala)).estado, "la prueba no armó una mezcla").toBe("mezcla");
    await expect(createSampleFromLot(gestor, muestraVerde(mala, "MV-MEZ-NO"))).rejects.toThrow(/green_sample_before_reposo/);
  });

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02). `tieneSecadoTerminadoArriba` recorre la ascendencia —y lanza `lineage_too_deep`
   * con más de 64 generaciones—, y su respuesta sólo la usa la muestra VERDE. Se llamaba para toda muestra de un lote verde, así
   * que una muestra de otro estado, de un lote muy hondo, se rechazaba por un recorrido que no necesitaba.
   */
  it("una muestra que no es verde, de un lote verde con más de 64 generaciones, entra: no recorre la ascendencia", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 66; i++) ids.push(await lote(`NV${i}`));
    for (let i = 1; i < ids.length; i++) await enlazar([ids[i - 1]!], [ids[i]!]);
    const hondo = ids[ids.length - 1]!;
    await prisma.lot.update({ where: { id: hondo }, data: { lotType: "green" } });
    // Control: la muestra VERDE sí recorre el linaje, y con 66 generaciones lanza. Sin él, que la otra entre no probaría que
    // la cadena es lo bastante honda para tropezar.
    await expect(createSampleFromLot(gestor, muestraVerde(hondo, "NV-VERDE"))).rejects.toThrow(new LotProcessError("lineage_too_deep"));
    await expect(createSampleFromLot(gestor, { ...muestraVerde(hondo, "NV-OTRA"), materialState: null })).resolves.toBeDefined();
  }, 120000);
});

/**
 * Lo que la página OFRECE (tarea 9, 2026-10-02). La página del proceso y la ficha sólo pintan «Abrir proceso» y «Devolver a
 * secado» cuando el servicio lo aceptaría; cuando no, una frase con el motivo. Ocultar no es autorizar —el servicio vuelve a
 * comprobarlo—, pero ofrecer lo que va a fallar es enseñar a desconfiar de la pantalla.
 *
 * Cada caso pregunta al predicado y DESPUÉS al servicio, y exige que digan lo mismo: el motivo del predicado es el código
 * con el que el servicio rechaza, y un «se puede» es una escritura que sale bien.
 */
describe("R7 — la pantalla sólo ofrece lo que el servicio aceptaría", () => {
  async function motivoDeDevolucion() {
    return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "error_de_medicion", catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } } })).id;
  }
  /** Un lote con su proceso cerrado por humedad en el objetivo (el cierre es del 2026-05-01, para poder devolver después). */
  async function cerrado(codigo: string) {
    const l = await lote(codigo);
    const p = await abrirProcesoDePrueba(gestor, l);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: new Date("2026-05-01T12:00:00Z"), closingMoistureMeasurementId: await humedad(l, 11) });
    return l;
  }
  /** Un lote dividido bajo un proceso, armado crudo como en «un lote dividido no se devuelve a secado». */
  async function dividido(codigo: string) {
    const x = await lote(`${codigo}-X`);
    const x1 = await lote(`${codigo}-X1`);
    const t = await prisma.lotTransformation.create({ data: {
      transformationType: "split", occurredAt: ahora(), provenanceClass: "original_record", createdBy: gestor,
      inputs: { create: [{ lotId: x }] }, outputs: { create: [{ lotId: x1 }] },
    } });
    transformaciones.push(t.id);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11.5, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: gradoId, cherryStateValueId: cerezaId,
      endedAt: ahora(), closureKind: "divided", dividedByTransformationId: t.id,
    } });
    return x;
  }

  /** El predicado y el servicio de devolver, sobre el mismo lote: tienen que decir lo mismo. Devuelve el veredicto del predicado. */
  async function devolverDiceLoMismo(lotId: string) {
    const veredicto = await puedeDevolverASecado(gestor, lotId);
    const servicio = devolverASecado(gestor, { lotId, motivoValueId: await motivoDeDevolucion(), ocurrioEn: ahora() });
    if (veredicto.puede) await expect(servicio, "el predicado dijo «se puede» y el servicio lo rechazó").resolves.toBeDefined();
    else await expect(servicio, `el predicado dijo «${veredicto.motivo}» y el servicio no rechazó con ese código`).rejects.toThrow(new LotProcessError(veredicto.motivo));
    return veredicto;
  }
  /** Lo mismo para abrir. */
  async function abrirDiceLoMismo(lotId: string) {
    const veredicto = await puedeAbrirProceso(gestor, lotId);
    const servicio = abrirDirecto(lotId);
    if (veredicto.puede) await expect(servicio, "el predicado dijo «se puede» y el servicio lo rechazó").resolves.toBeDefined();
    else await expect(servicio, `el predicado dijo «${veredicto.motivo}» y el servicio no rechazó con ese código`).rejects.toThrow(new LotProcessError(veredicto.motivo));
    return veredicto;
  }

  it("devolver a secado: en bodega con el proceso cerrado por humedad se ofrece, y el servicio lo acepta", async () => {
    const l = await cerrado("PD-OK");
    await moveLotToStorage(gestor, { lotId: l, locationId: plotId, startedAt: new Date("2026-05-02T12:00:00Z") });
    expect(await devolverDiceLoMismo(l)).toEqual({ puede: true });
  });

  it("devolver a secado: cada caso que el servicio rechaza tiene su motivo, y es el código del servicio", async () => {
    // Sin proceso en el linaje y en bodega: un lote guardado antes de la Parte 1. La compuerta lo deja entrar (R9).
    const sin = await lote("PD-SIN");
    await moveLotToStorage(gestor, { lotId: sin, locationId: plotId, startedAt: ahora() });
    expect(await devolverDiceLoMismo(sin)).toEqual({ puede: false, motivo: "process_not_found" });

    // Con el proceso que lo cubre todavía abierto.
    const abierto = await lote("PD-ABI");
    await abrirProcesoDePrueba(gestor, abierto);
    expect(await devolverDiceLoMismo(abierto)).toEqual({ puede: false, motivo: "process_already_open" });

    // Una mezcla de dos ramas cerradas por humedad.
    const mezcla = await lote("PD-MEZ");
    await enlazar([await cerrado("PD-MEZ-A"), await cerrado("PD-MEZ-B")], [mezcla]);
    expect(await devolverDiceLoMismo(mezcla)).toEqual({ puede: false, motivo: "lote_mezclado" });

    // Un lote dividido bajo un proceso.
    expect(await devolverDiceLoMismo(await dividido("PD-DIV"))).toEqual({ puede: false, motivo: "lote_dividido" });
  });

  it("devolver a secado: en bodega, con un DESCENDIENTE con su proceso abierto, no se ofrece — el servicio lo rechaza al abrir la continuación", async () => {
    // El caso que las comprobaciones previas de `devolverASecado` no ven: lo rechaza R2 dentro de `abrirProcesoEnTx`, con la bodega ya
    // terminada. Un predicado que sólo repitiera las comprobaciones previas diría «se puede» aquí, y la pantalla ofrecería un fallo.
    const cereza = await lote("PD-DES-C");
    const a = await lote("PD-DES-A");
    const hijo = await lote("PD-DES-H");
    await enlazar([cereza], [a]);
    await enlazar([a], [hijo]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(a, 11) });
    await moveLotToStorage(gestor, { lotId: a, locationId: plotId, startedAt: ahora() });
    await abrirProcesoDePrueba(gestor, hijo);
    expect(await devolverDiceLoMismo(a)).toEqual({ puede: false, motivo: "process_already_open" });
  });

  it("devolver la cereza con su pergamino en bodega se rechaza, y abrir sobre ella también: descendiente_en_bodega", async () => {
    // Decisión de Daniel, 2026-10-02 (registro, líneas 182 y 189). La cereza NO está en bodega —sólo su pergamino—, así que el
    // rechazo no es `lote_en_bodega`: es que la continuación abierta sobre la cereza cubriría al pergamino guardado. El
    // predicado y el servicio tienen que decir lo mismo, y el rechazo no deja nada escrito.
    const cereza = await lote("PD-DB-C");
    const pergamino = await lote("PD-DB-P");
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: new Date("2026-05-01T12:00:00Z"), closingMoistureMeasurementId: await humedad(pergamino, 11) });
    await moveLotToStorage(gestor, { lotId: pergamino, locationId: plotId, startedAt: new Date("2026-05-02T12:00:00Z") });
    expect(await devolverDiceLoMismo(cereza)).toEqual({ puede: false, motivo: "descendiente_en_bodega" });
    expect(await prisma.lotProcess.count({ where: { lotId: cereza } }), "el rechazo dejó una continuación escrita").toBe(1);
    expect(await prisma.lotProcessReturn.count({ where: { closedLotProcessId: p.id } }), "el rechazo dejó una devolución escrita").toBe(0);
    expect(await abrirDiceLoMismo(cereza)).toEqual({ puede: false, motivo: "descendiente_en_bodega" });

    // Control: el MISMO árbol con el pergamino FUERA de bodega se devuelve —y abre la continuación sobre la cereza—. Sin él, el
    // rechazo de arriba podría venir de cualquier otra comprobación de la devolución.
    const cereza2 = await lote("PD-DBC-C");
    const pergamino2 = await lote("PD-DBC-P");
    await enlazar([cereza2], [pergamino2]);
    const p2 = await abrirProcesoDePrueba(gestor, cereza2);
    await cerrarProceso(gestor, { lotProcessId: p2.id, endedAt: new Date("2026-05-01T12:00:00Z"), closingMoistureMeasurementId: await humedad(pergamino2, 11) });
    expect(await devolverDiceLoMismo(cereza2)).toEqual({ puede: true });
  });

  it("abrir un proceso: libre se ofrece; en bodega, bajo otro abierto, en una mezcla o dividido, no — cada uno con el código del servicio", async () => {
    expect(await abrirDiceLoMismo(await lote("PA-OK"))).toEqual({ puede: true });

    const enBodega = await lote("PA-BOD");
    await moveLotToStorage(gestor, { lotId: enBodega, locationId: plotId, startedAt: ahora() });
    expect(await abrirDiceLoMismo(enBodega)).toEqual({ puede: false, motivo: "lote_en_bodega" });

    const padre = await lote("PA-ABI-P");
    const hijo = await lote("PA-ABI-H");
    await enlazar([padre], [hijo]);
    await abrirProcesoDePrueba(gestor, padre);
    expect(await abrirDiceLoMismo(hijo)).toEqual({ puede: false, motivo: "process_already_open" });

    const mezcla = await lote("PA-MEZ");
    await enlazar([await cerrado("PA-MEZ-A"), await cerrado("PA-MEZ-B")], [mezcla]);
    expect(await abrirDiceLoMismo(mezcla)).toEqual({ puede: false, motivo: "lote_mezclado" });

    expect(await abrirDiceLoMismo(await dividido("PA-DIV"))).toEqual({ puede: false, motivo: "lote_dividido" });
  });

  // Tarea 9, ronda de arreglo 1 (2026-10-02): el motivo de la miel no tenía caso, ni contrastado con el servicio.
  it("abrir un proceso: un lote de miel no lo ofrece, y el servicio lo rechaza con el mismo código", async () => {
    const miel = await lote("PA-MIEL");
    await prisma.lot.update({ where: { id: miel }, data: { lotType: "honey" } });
    expect(await abrirDiceLoMismo(miel)).toEqual({ puede: false, motivo: "proceso_no_aplica_a_miel" });
  });

  /**
   * Tarea 9, ronda de arreglo 1 (2026-10-02). En un lote guardado antes de la Parte 1 (R9, sin proceso), la página del proceso se
   * contradecía: el motivo de no poder abrir (`lote_en_bodega`) mandaba a «Devolver a secado», y la sección de devolver decía que
   * no hay proceso que continuar. La frase sólo manda a devolver donde `puedeDevolverASecado` dice que sí; sin saberlo —la ficha
   * y el formulario de fermentación no lo preguntan—, no inventa ese camino.
   */
  it("en bodega, la frase de no abrir sólo manda a «Devolver a secado» donde el servicio lo aceptaría", async () => {
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;

    // Guardado sin proceso: ni se abre (en bodega) ni se devuelve (no hay proceso que continuar).
    const sin = await lote("PF-SIN");
    await moveLotToStorage(gestor, { lotId: sin, locationId: plotId, startedAt: ahora() });
    expect(await abrirDiceLoMismo(sin)).toEqual({ puede: false, motivo: "lote_en_bodega" });
    const devolverSin = await puedeDevolverASecado(gestor, sin);
    expect(devolverSin).toEqual({ puede: false, motivo: "process_not_found" });
    expect(fraseDeNoAbrir("lote_en_bodega", devolverSin), "manda a devolver un lote sin proceso que devolver").toBe("lote_en_bodega");

    // Cerrado por humedad y en bodega: se puede devolver, y la frase lo dice.
    const con = await cerrado("PF-CON");
    await moveLotToStorage(gestor, { lotId: con, locationId: plotId, startedAt: new Date("2026-05-02T12:00:00Z") });
    expect(await puedeAbrirProceso(gestor, con)).toEqual({ puede: false, motivo: "lote_en_bodega" });
    const devolverCon = await puedeDevolverASecado(gestor, con);
    expect(devolverCon).toEqual({ puede: true });
    expect(fraseDeNoAbrir("lote_en_bodega", devolverCon)).toBe("lote_en_bodega_se_puede_devolver");

    // Sin saber si se puede devolver, la frase que no promete nada; y los demás motivos no cambian.
    expect(fraseDeNoAbrir("lote_en_bodega", null)).toBe("lote_en_bodega");
    expect(fraseDeNoAbrir("lote_dividido", devolverCon)).toBe("lote_dividido");

    // Y los textos: la frase de siempre no nombra «Devolver a secado»; la que se usa cuando sí se puede, sí.
    expect(es.Traceability?.processCannotOpen_lote_en_bodega).not.toContain(es.Traceability?.processBackToDryingButton);
    expect(en.Traceability?.processCannotOpen_lote_en_bodega).not.toContain(en.Traceability?.processBackToDryingButton);
    expect(es.Traceability?.processCannotOpen_lote_en_bodega_se_puede_devolver).toContain(es.Traceability?.processBackToDryingButton);
    expect(en.Traceability?.processCannotOpen_lote_en_bodega_se_puede_devolver).toContain(en.Traceability?.processBackToDryingButton);
  });

  it("la ficha y la página del proceso dicen «Sin receta» en su idioma, y la ficha no pinta un veredicto sin cobertura (M6, M7)", () => {
    // Revisión final (ronda de arreglo 1, 2026-10-03). GUARDIA DE FUENTE —las páginas no se renderizan en pruebas—: dice que el
    // código está escrito así, no que la pantalla lo pinte. M6: un proceso sin receta salía con la constante `SIN_RECETA`
    // («Sin receta», en español también con la interfaz en inglés). M7: con `lineage_too_deep`, `procesos` llegaba vacío al
    // veredicto y la ficha decía «el proceso no dice qué grado es» junto a «el linaje es demasiado hondo».
    const ficha = readFileSync("app/lots/[id]/page.tsx", "utf8");
    const paginaDelProceso = readFileSync("app/lots/[id]/process/page.tsx", "utf8");
    for (const [nombre, fuente] of [["ficha", ficha], ["página del proceso", paginaDelProceso]] as const) {
      expect(fuente, `${nombre}: una frase del proceso cae en la etiqueta del reporte`).not.toMatch(/recetaConVersion \?\? [\w.]*etiqueta/);
      expect(fuente, `${nombre}: la composición nombra la etiqueta del reporte`).not.toMatch(/lotCode\} · \$\{p\.etiqueta\}/);
      expect(fuente, `${nombre}: no usa la clave de «Sin receta» de la pantalla`).toContain('t("processNoRecipeLabel")');
    }
    expect(paginaDelProceso, "el encabezado del proceso cae en la etiqueta del reporte").not.toMatch(/processNumberHeading[^\n]*\{p\.etiqueta\}/);
    expect(ficha, "la ficha pinta el veredicto aunque la cobertura no se pudiera leer").toContain(
      "const veredicto = entrada && errorDeCobertura === null ? veredictoDelLote(entrada) : null;",
    );
    // Control: las dos claves existen en los dos idiomas, y la inglesa no es la española.
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;
    expect(es.Traceability?.processNoRecipeLabel).toBe("Sin receta");
    expect(en.Traceability?.processNoRecipeLabel).toBe("No recipe");
  });

  it("cada motivo posible de los dos predicados tiene su frase en es.json y en en.json, y las páginas la piden con ese prefijo", () => {
    // Las claves son de PLANTILLA (`processCannotOpen_${motivo}`): `claves-de-traduccion-existen` no las ve, y `t()` acepta cualquier
    // cadena. Lo que las vigila es esto: la lista de motivos es la que los predicados pueden devolver (fuera de ella, relanzan).
    const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as Record<string, Record<string, string>>;
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")) as Record<string, Record<string, string>>;
    const paginaDelProceso = readFileSync("app/lots/[id]/process/page.tsx", "utf8");
    const ficha = readFileSync("app/lots/[id]/page.tsx", "utf8");
    // Control: las páginas arman la clave con estos prefijos. Si cambian de prefijo, esta prueba tiene que seguirlas.
    expect(paginaDelProceso).toContain("processCannotOpen_${");
    expect(paginaDelProceso).toContain("processCannotReturn_${");
    expect(ficha).toContain("processCannotOpen_${");
    expect(MOTIVOS_PARA_NO_ABRIR.length, "la lista de motivos de abrir salió vacía").toBeGreaterThanOrEqual(7);
    expect(MOTIVOS_PARA_NO_DEVOLVER.length, "la lista de motivos de devolver salió vacía").toBeGreaterThanOrEqual(7);
    const faltan: string[] = [];
    // Las de abrir son las frases (`FRASES_DE_NO_ABRIR`: cada motivo y la variante de bodega que sí se puede devolver).
    expect(FRASES_DE_NO_ABRIR.length, "las frases de abrir no cubren todos los motivos").toBeGreaterThan(MOTIVOS_PARA_NO_ABRIR.length);
    for (const [prefijo, motivos] of [["processCannotOpen_", FRASES_DE_NO_ABRIR], ["processCannotReturn_", MOTIVOS_PARA_NO_DEVOLVER]] as const) {
      for (const m of motivos) {
        if (!es.Traceability?.[`${prefijo}${m}`]?.trim()) faltan.push(`es: Traceability.${prefijo}${m}`);
        if (!en.Traceability?.[`${prefijo}${m}`]?.trim()) faltan.push(`en: Traceability.${prefijo}${m}`);
      }
    }
    expect(faltan).toEqual([]);
  });
});

/**
 * Un proceso de `coberturaDelLote` que quien mira SÍ ve, o la prueba falla diciéndolo (revisión final, F7: los de un lote que no
 * puede ver salen `oculto`). Estrecha el tipo para leer sus campos.
 */
function visible<P extends { oculto: boolean }>(p: P | null | undefined): Extract<P, { oculto: false }> {
  expect(p, "no hay proceso que mirar").toBeTruthy();
  expect(p!.oculto, "el proceso salió oculto a quien sí puede ver su lote").toBe(false);
  return p as Extract<P, { oculto: false }>;
}

/**
 * `coberturaDelLote` (tarea 9): lo que la ficha y la página del proceso enseñan. Sin prueba propia, el flip lo midió: dejar
 * `recetaConVersion` siempre nulo, cortar la cadena al vigente o dejar `paraEntrada` vacío no hacía caer nada —las pantallas
 * no se renderizan en pruebas—. Esto fija lo que esas pantallas leen.
 */
describe("R7 — coberturaDelLote, lo que la ficha y la página del proceso enseñan", () => {
  async function versionDeReceta(nombre: string) {
    const receta = await prisma.processRecipe.create({ data: { name: `TEST ${nombre} ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
    return (await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor } })).id;
  }

  it("el pergamino enseña el proceso de la cereza: en qué lote vive, su receta con versión, y al veredicto le llega lo mismo que al tablero", async () => {
    const cereza = await lote("CB1-C");
    const pergamino = await lote("CB1-P");
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza, { processRecipeVersionId: await versionDeReceta("Lavado CB1") });
    const c = await coberturaDelLote(gestor, pergamino);
    expect(c.estado).toBe("abierto");
    const vigente = visible(c.vigente);
    expect(vigente.id).toBe(p.id);
    expect(vigente.lot.lotCode, "la ficha no sabría decir en qué lote vive el proceso").toBe(`CB1-C-${RUN}`);
    expect(vigente.etiqueta).toBe(`TEST Lavado CB1 ${RUN}`);
    expect(vigente.recetaConVersion, "la ficha y el formulario de fermentación leen la receta con su versión").toBe(`TEST Lavado CB1 ${RUN} · v1`);
    expect(vigente.origen).toBe("original");
    expect(vigente.profundidad).toBe(1);
    // Lo que la ficha pasa al veredicto es lo que el tablero le pasa: la misma función, y no vacío.
    expect(c.paraEntrada).toEqual(await procesosParaEntrada(prisma, pergamino));
    expect(c.paraEntrada).toEqual([{ endedAt: null, gradoDeProceso: "Washed" }]);
  });

  it("un reproceso enseña la cadena entera, del más cercano al más lejano, y un proceso sin receta no inventa versión", async () => {
    const cereza = await lote("CB2-C");
    const pergamino = await lote("CB2-P");
    await enlazar([cereza], [pergamino]);
    const p1 = await abrirProcesoDePrueba(gestor, cereza); // «Sin receta»
    await cerrarProceso(gestor, { lotProcessId: p1.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino, 11) });
    const p2 = await abrirProcesoDePrueba(gestor, pergamino, { processRecipeVersionId: await versionDeReceta("Reproceso CB2") });
    const c = await coberturaDelLote(gestor, pergamino);
    expect(visible(c.vigente).id).toBe(p2.id);
    const cadena = c.cadena.map((p) => visible(p));
    expect(cadena.map((p) => p.id), "la cadena perdió la historia de arriba").toEqual([p2.id, p1.id]);
    expect(cadena.map((p) => p.lot.lotCode)).toEqual([`CB2-P-${RUN}`, `CB2-C-${RUN}`]);
    expect(cadena[1]!.etiqueta).toBe("Sin receta");
    expect(cadena[1]!.recetaConVersion, "«Sin receta» no tiene versión que enseñar").toBeNull();
    expect(cadena[1]!.humedadDeCierre).toBe(11);
  });

  it("con el id en MAYÚSCULAS devuelve lo mismo que en minúsculas", async () => {
    // Revisión final (ronda de arreglo 1, F5): la ficha y la página del proceso la llaman con el id del lote; en mayúsculas, el
    // resolvedor no encontraba los padres y el pergamino salía sin proceso (o una mezcla, si el proceso era suyo).
    const cereza = await lote("CB4-C");
    const pergamino = await lote("CB4-P");
    await enlazar([cereza], [pergamino]);
    await abrirProcesoDePrueba(gestor, cereza);
    const enMinusculas = await coberturaDelLote(gestor, pergamino);
    expect(enMinusculas.estado, "control: en minúsculas lo cubre el proceso abierto de la cereza").toBe("abierto");
    expect(await coberturaDelLote(gestor, pergamino.toUpperCase())).toEqual(enMinusculas);
    // Y con el proceso PROPIO: en mayúsculas salía «mezcla».
    const propio = await coberturaDelLote(gestor, cereza.toUpperCase());
    expect(propio.estado).toBe("abierto");
    expect(propio).toEqual(await coberturaDelLote(gestor, cereza));
  });

  it("una mezcla devuelve su composición, ningún vigente y nada para el veredicto", async () => {
    const a = await lote("CB3-A");
    const b = await lote("CB3-B");
    const m = await lote("CB3-M");
    const pa = await abrirProcesoDePrueba(gestor, a);
    const pb = await abrirProcesoDePrueba(gestor, b);
    await enlazar([a, b], [m]);
    const c = await coberturaDelLote(gestor, m);
    expect(c.estado).toBe("mezcla");
    expect(c.vigente).toBeNull();
    expect(c.composicion?.procesos.map((p) => visible(p).id).sort()).toEqual([pa.id, pb.id].sort());
    expect(c.composicion?.ramaSinProceso).toBe(false);
    expect(c.paraEntrada).toEqual([]);
  });

  it("quien ve sólo el pergamino (parcela B) no recibe los datos del proceso que vive en la cereza (parcela A); quien ve las dos, sí", async () => {
    // Revisión final (ronda de arreglo 1, 2026-10-03; Codex y registro, línea 205). `view` sobre el lote mirado no autoriza los
    // procesos que viven en otros lotes: cada lote dueño se autoriza por separado, y uno que no se ve sale `oculto` —sólo que lo
    // cubre un proceso y si está abierto—.
    const cereza = await lote("CB5-C"); // parcela A
    const pergamino = await lote("CB5-P", plotB);
    await enlazar([cereza], [pergamino]);
    const p = await abrirProcesoDePrueba(gestor, cereza, { processRecipeVersionId: await versionDeReceta("Lavado CB5") });
    // Control de los permisos: `soloB` ve el pergamino y NO la cereza; sin esto, «oculto» podría ser cualquier otra cosa.
    await expect(coberturaDelLote(soloB, cereza)).rejects.toThrow(TraceabilityAccessError);

    const c = await coberturaDelLote(soloB, pergamino);
    expect(c.estado).toBe("abierto");
    expect(c.vigente).toEqual({ oculto: true, abierto: true, bloqueadoAlEntrar: false });
    expect(c.cadena).toEqual([{ oculto: true, abierto: true, bloqueadoAlEntrar: false }]);
    // Nada del proceso de A en lo que devuelve: ni su id, ni su lote, ni su receta, ni su intención.
    const devuelto = JSON.stringify({ vigente: c.vigente, cadena: c.cadena, composicion: c.composicion });
    for (const dato of [p.id, cereza, `CB5-C-${RUN}`, `Lavado CB5 ${RUN}`, p.intent]) expect(devuelto).not.toContain(dato);

    // Control: quien ve las DOS parcelas recibe el proceso entero.
    const deAmbos = await coberturaDelLote(ambos, pergamino);
    const vigente = visible(deAmbos.vigente);
    expect(vigente.id).toBe(p.id);
    expect(vigente.lot.lotCode).toBe(`CB5-C-${RUN}`);
    expect(vigente.recetaConVersion).toBe(`TEST Lavado CB5 ${RUN} · v1`);
  });

  it("oculto y cerrado por encima del objetivo, la cobertura dice que bloquea la entrada a bodega; cerrado en el objetivo, no", async () => {
    // Residuo de la ronda de arreglo 1 (2026-10-03). Con el vigente oculto la página del proceso no tenía con qué decidir
    // «bloqueado», y dejaba de ofrecer «Devolver a secado» a quien gestiona el pergamino —que el servicio sí acepta—. La
    // forma oculta lleva sólo ese booleano: el mismo hecho que la compuerta le diría al intentar mover a bodega.
    for (const [cierre, bloquea] of [[13, true], [11, false]] as const) {
      const cereza = await lote(`CB6-C-${cierre}`); // parcela A
      const pergamino = await lote(`CB6-P-${cierre}`, plotB);
      await enlazar([cereza], [pergamino]);
      const p = await abrirProcesoDePrueba(gestor, cereza);
      await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: ahora(), closingMoistureMeasurementId: await humedad(pergamino, cierre) });
      const c = await coberturaDelLote(soloB, pergamino);
      expect(c.vigente, `cierre ${cierre}`).toEqual({ oculto: true, abierto: false, bloqueadoAlEntrar: bloquea });
    }
  });
});
