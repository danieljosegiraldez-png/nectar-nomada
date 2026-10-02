/**
 * R6 de la Parte 1: dividir un lote cubierto por un proceso abierto lo cierra como «dividido» y da a
 * cada parte su propio proceso, unido al anterior. Se divide el lote ENTERO, nunca con una corrida
 * en curso; el lote dividido queda cerrado; no se selecciona ni se fusiona bajo un proceso abierto.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { recordTransformation } from "../../lib/traceability/lots";
import { startDryingRun } from "../../lib/traceability/drying";
import { recordMeasurement } from "../../lib/traceability/measurements";
import { createSampleFromLot, SampleValidationError } from "../../lib/traceability/samples";
import { registrarInspeccion, opcionesParaInspeccion } from "../../lib/traceability/samplingEvents";
import { abrirProceso, cerrarProceso } from "../../lib/traceability/lotProcess";
import { computeLotBalance } from "../../lib/traceability/balance";
import { procesoQueCubre } from "../../lib/traceability/procesoDelLinaje";
import { reporteDeProceso } from "../../lib/traceability/reporteDeProceso";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import type { Prisma } from "../../generated/prisma/client";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `division-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
/** Una organización que FIJA su tolerancia de masa (5 %), para que la división no caiga siempre al 2 % por defecto. */
let orgTolerante: string;
/** Una versión de receta real, para que la copia de R6.4 tenga una receta que perder. */
let recetaVersionId: string;
/** Para medir y sacar muestra: el Farm Operator puede no tener permiso de muestras, y la prueba caería
 *  por acceso y no por la regla. Es el mismo admin que usa `recipeVersions.test.ts`. */
let admin: string;
const lotes: string[] = [];
/** Mediciones insertadas crudas para cerrar una copia. Se borran DESPUÉS de los procesos
 *  (`closing_moisture_measurement_id` es RESTRICT) y ANTES de los lotes. */
const mediciones: string[] = [];
const T = new Date("2026-03-10T12:00:00Z");

async function cuenta(label: string) {
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN})`, locale: "es" } });
  return (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
}
async function lote(codigo: string, lotType: "cherry" | "honey" = "cherry", organizationId: string = orgId) {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
/** Le da al lote un libro de masa con `kg`. */
async function conSaldo(lotId: string, kg: number) {
  await prisma.quantityEvent.create({ data: { lotId, eventType: "process_output", quantity: kg, unit: "kg", occurredAt: new Date("2026-03-02T12:00:00Z"), provenanceClass: "measured_fact" } });
}
/** Cada llamada da códigos nuevos: dividir dos veces el mismo lote no choca con `UNIQUE(organization_id, lot_code)`.
 *  `salida` es el tipo de las partes: la miel divide en miel (`dividirMiel`), no en `processing`. */
let divisiones = 0;
function dividir(lotId: string, entra: number | null, partes: number[], tipo: "split" | "selection" = "split", salida: "processing" | "honey" = "processing") {
  const n = ++divisiones;
  return recordTransformation(gestor, {
    transformationType: tipo, occurredAt: T, provenanceClass: "original_record",
    inputs: [{ lotId, quantity: entra, unit: entra === null ? null : "kg" }],
    outputs: partes.map((kg, i) => ({ lotCode: `${lotId.slice(0, 8)}-${n}${String.fromCharCode(65 + i)}-${RUN}`, lotType: salida, quantity: kg, unit: "kg" })),
  }).then((r) => { lotes.push(...r.outputLots.map((l) => l.id)); return r; });
}

/** Lo que una división rechazada NO pudo dejar escrito: ni transformación sobre el lote, ni asientos más allá del
 *  saldo inicial, ni partes con sus códigos, y el proceso sigue abierto sin tipo de cierre. */
async function nadaEscrito(lotId: string, procesoId: string, asientosIniciales: number) {
  expect(await prisma.lotTransformation.count({ where: { inputs: { some: { lotId } } } })).toBe(0);
  expect(await prisma.quantityEvent.count({ where: { lotId } })).toBe(asientosIniciales);
  expect(await prisma.lot.count({ where: { lotCode: { startsWith: `${lotId.slice(0, 8)}-` }, organizationId: { in: [orgId, orgTolerante] } } })).toBe(0);
  const p = await prisma.lotProcess.findUniqueOrThrow({ where: { id: procesoId } });
  expect(p.endedAt).toBeNull();
  expect(p.closureKind).toBeNull();
}

/**
 * El resultado de una promesa sin que llegue a rechazarse nunca: mientras la prueba espera a otra cosa, una
 * división que falla no deja un rechazo sin atender. Misma forma que en `corridaConProceso.test.ts`.
 */
type Resultado<T> = { ok: true; valor: T } | { ok: false; error: unknown };
const resultadoDe = <T>(p: Promise<T>): Promise<Resultado<T>> =>
  p.then((valor) => ({ ok: true as const, valor }), (error: unknown) => ({ ok: false as const, error }));

/**
 * Una transacción AJENA que hace `trabajo` y se queda abierta hasta que se la suelte; `pid` es su sesión en la
 * base, para preguntarle a `pg_blocking_pids` quién la espera. Copiada de `corridaConProceso.test.ts`, donde
 * está explicada. **Hay que llamar siempre a `soltar()`** (en un `finally`), o la limpieza se colgaría.
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
  hecho.catch(() => undefined);
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
  admin = (await prisma.assignment.findFirstOrThrow({
    where: { status: "active", roleProfile: { name: "Platform Admin" }, scope: { scopeType: "platform" } },
    select: { userAccountId: true },
  })).userAccountId;
  orgTolerante = (await prisma.organization.create({ data: {
    organizationType: "farm", name: `TEST tolerante ${RUN}`, status: "approved", classification: "internal", massBalanceTolerancePct: 5,
  } })).id;
  const receta = await prisma.processRecipe.create({ data: { name: `TEST receta ${RUN}`, organizationId: orgId, status: "approved", createdBy: gestor } });
  recetaVersionId = (await prisma.processRecipeVersion.create({ data: { recipeId: receta.id, version: 1, status: "approved", createdBy: gestor } })).id;
}, 60000);

afterAll(async () => {
  // Todos los lotes de la organización de esta corrida, no sólo los apuntados: una transformación que sale bien
  // sin esperarlo —en rojo, o con una mutación del flip— crea lotes que ninguna lista conoce, y el borrado de la
  // organización del final reventaría (`lot_organization_id_fkey` es RESTRICT). Medido en la primera corrida en
  // rojo: quedó el lote de la fusión.
  const organizaciones = [orgId, orgTolerante].filter((x): x is string => x !== undefined);
  const deLaOrganizacion = await prisma.lot.findMany({ where: assertDefinedWhere({ organizationId: { in: organizaciones } }), select: { id: true } });
  const todos = [...new Set([...lotes, ...deLaOrganizacion.map((l) => l.id)])];
  const ts = (await prisma.lotTransformation.findMany({
    where: { OR: [{ inputs: { some: { lotId: { in: todos } } } }, { outputs: { some: { lotId: { in: todos } } } }] },
    select: { id: true, dryingRunId: true },
  }));
  // Antes que las transformaciones: `divided_by_transformation_id` es RESTRICT.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  // También las de cualquier lote de la corrida: si la regla de R6.6 faltara, la medición sobre el lote dividido se
  // guardaría, y `measurement.lot_id` es SET NULL —borrar el lote la dejaría huérfana, sin lote—. Medido con el flip
  // que quita esa regla: dejó una.
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ OR: [{ id: { in: mediciones } }, { lotId: { in: todos } }] }) });
  // Las muestras de cualquier lote de la corrida, sus inspecciones y su auditoría (ronda de arreglo 1, 2026-10-01). En
  // verde no queda ninguna —la inspección sobre el lote dividido se rechaza—, pero sin la regla de R6.6 en
  // `registrarInspeccion` (el flip) sí, y `sample.source_lot_id` frenaría el borrado de los lotes. Antes que las
  // inspecciones, que las muestras referencian.
  const muestras = await prisma.sample.findMany({ where: assertDefinedWhere({ sourceLotId: { in: todos } }), select: { id: true, samplingEventId: true } });
  const inspecciones = muestras.map((m) => m.samplingEventId).filter((x): x is string => x !== null);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...muestras.map((m) => m.id), ...inspecciones] } }) });
  await prisma.sample.deleteMany({ where: assertDefinedWhere({ id: { in: muestras.map((m) => m.id) } }) });
  await prisma.samplingEvent.deleteMany({ where: assertDefinedWhere({ id: { in: inspecciones } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: ts.map((t) => t.id) } }) });
  const sec = ts.map((t) => t.dryingRunId).filter((x): x is string => x !== null);
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  // Su auditoría (`lot_transformation.create`, `drying_run.start`) cuelga de la transformación y de la corrida por su
  // `entityId`, y la base no la borra con ellas: quedaban 15 filas por corrida (ronda de arreglo 1, 2026-10-01).
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...ts.map((t) => t.id), ...sec] } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  // La receta, después de los procesos que apuntan a su versión; la versión se va con ella (Cascade).
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
}, 60000);

describe("R6 — dividir bajo un proceso abierto", () => {
  it("cierra el padre como dividido y da a cada parte su proceso, unido al anterior", async () => {
    const l = await lote("D1");
    await conSaldo(l, 100);
    // Ronda de arreglo 1 (2026-10-01): el padre se abre con una receta REAL y con intención, notas, referencia y
    // procedencia propias —ninguna es la de `abrirProcesoDePrueba`—. Abierto sin receta, una copia que la perdiera
    // seguiría pasando: null contra null.
    const [natural, entera] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Natural", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "entera", catalog: { key: "estado_cereza" } } }),
    ]);
    const p = await abrirProceso(gestor, {
      lotId: l, processRecipeVersionId: recetaVersionId, intent: `TEST intención D1 ${RUN}`, notes: `TEST nota D1 ${RUN}`,
      sourceReference: `TEST referencia D1 ${RUN}`, provenanceClass: "direct_observation", targetMoisturePct: 12.5,
      startedAt: new Date("2026-03-01T12:00:00Z"), processGradeValueId: natural.id, cherryStateValueId: entera.id,
    });
    expect(p.processRecipeVersionId).toBe(recetaVersionId);
    const r = await dividir(l, 100, [60, 40]);
    const cerrado = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } });
    expect(cerrado.closureKind).toBe("divided");
    expect(cerrado.dividedByTransformationId).toBe(r.transformation.id);
    expect(cerrado.endedAt?.toISOString()).toBe(T.toISOString());
    const copias = await prisma.lotProcess.findMany({ where: { lotId: { in: r.outputLots.map((o) => o.id) } } });
    expect(copias).toHaveLength(2);
    for (const c of copias) {
      expect(c.derivedFromLotProcessId).toBe(p.id);
      expect(c.startedAt.toISOString()).toBe(T.toISOString());
      expect(c.endedAt).toBeNull();
      // R6.4, los seis: receta y versión, intención, grado, estado de la cereza, humedad objetivo y procedencia
      // (clase, referencia y notas).
      expect(c.processRecipeVersionId).toBe(recetaVersionId);
      expect(c.intent).toBe(`TEST intención D1 ${RUN}`);
      expect(c.processGradeValueId).toBe(natural.id);
      expect(c.cherryStateValueId).toBe(entera.id);
      expect(c.targetMoisturePct.toNumber()).toBe(12.5);
      expect(c.provenanceClass).toBe("direct_observation");
      expect(c.sourceReference).toBe(`TEST referencia D1 ${RUN}`);
      expect(c.notes).toBe(`TEST nota D1 ${RUN}`);
    }
    // R6.4: la auditoría registra el cierre como dividido y una apertura por parte, con su origen en `after`.
    const cierre = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: p.id, operation: "lot_process.close" } });
    expect(cierre.after).toMatchObject({ closureKind: "divided", dividedByTransformationId: r.transformation.id, sinLibroDeMasa: false });
    const aperturas = await prisma.auditEvent.findMany({ where: { entityId: { in: copias.map((c) => c.id) }, operation: "lot_process.open" } });
    expect(aperturas).toHaveLength(2);
    for (const a of aperturas) expect(a.after).toMatchObject({ derivedFromLotProcessId: p.id });
    // R6.5: la historia anterior se hereda por la cadena, no se copia.
    const cob = await procesoQueCubre(prisma, r.outputLots[0]!.id);
    expect(cob.cadena.map((x) => x.id)).toContain(p.id);

    // R6.6: el lote dividido queda cerrado.
    await expect(abrirProcesoDePrueba(gestor, l)).rejects.toThrow(new LotProcessError("lote_dividido"));
    await expect(startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" })).rejects.toThrow(new LotProcessError("lote_dividido"));
    await expect(recordMeasurement(admin, { variable: "moisture", value: 11, unit: "%", occurredAt: T, lotId: l, provenanceClass: "measured_fact" })).rejects.toThrow(/lote_dividido/);
    await expect(createSampleFromLot(admin, {
      sourceLotId: l, sampleCode: `D1-M-${RUN}`, sampleType: "green_coffee", materialState: "GREEN", occurredAt: T, provenanceClass: "original_record",
    } as Parameters<typeof createSampleFromLot>[1])).rejects.toThrow(/lote_dividido/);
  });

  it("la copia se cierra con una humedad de una fecha entre la división y hoy", async () => {
    // R6.4: la copia empieza en el instante de la división, no «ahora». Es lo que hará el import con fechas
    // históricas: cerrar con una humedad medida días después de dividir. Una copia que naciera «ahora» lo
    // rechazaría con `ends_before_it_started`.
    const l = await lote("D12");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    const r = await dividir(l, 100, [100]);
    const parte = r.outputLots[0]!.id;
    const copia = await prisma.lotProcess.findFirstOrThrow({ where: { lotId: parte } });
    const fecha = new Date("2026-03-15T12:00:00Z");
    const humedad = (await prisma.measurement.create({ data: {
      variable: "moisture", value: 11, unit: "%", occurredAt: fecha, lotId: parte, provenanceClass: "measured_fact", createdBy: gestor,
    } })).id;
    mediciones.push(humedad);
    const cerrada = await cerrarProceso(gestor, { lotProcessId: copia.id, endedAt: fecha, closingMoistureMeasurementId: humedad });
    expect(cerrada.closureKind).toBe("moisture");
    expect(cerrada.endedAt?.toISOString()).toBe(fecha.toISOString());
  });

  it("dividir antes de que empezara el proceso se rechaza con su nombre, y no por el CHECK de fechas", async () => {
    // R6.3: el cierre es el instante de la división; si es anterior al inicio, se dice por qué antes de escribir.
    // Sin la comprobación lo frenaría `lot_process_termina_despues_de_empezar`, con un error opaco de la base.
    const l = await lote("D14");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l, { startedAt: new Date("2026-04-01T12:00:00Z") });
    await expect(dividir(l, 100, [50, 50])).rejects.toThrow(new LotProcessError("ends_before_it_started"));
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).endedAt).toBeNull();
  });

  it("con una corrida en curso no se divide", async () => {
    const l = await lote("D2");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    await startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" });
    await expect(dividir(l, 100, [50, 50])).rejects.toThrow(new LotProcessError("corridas_abiertas"));
  });

  it("dejar remanente fuera de la tolerancia se rechaza; dentro, no", async () => {
    const fuera = await lote("D3");
    await conSaldo(fuera, 100);
    const pFuera = await abrirProcesoDePrueba(gestor, fuera);
    await expect(dividir(fuera, 90, [45, 45])).rejects.toThrow(new LotProcessError("division_deja_remanente"));
    // Ronda de arreglo 1 (2026-10-01): el rechazo no deja nada escrito.
    await nadaEscrito(fuera, pFuera.id, 1);

    // 2 % por defecto (la organización no fija otra): sobra 1 kg de 99, dentro de 1,98.
    const dentro = await lote("D4");
    await conSaldo(dentro, 100);
    const pDentro = await abrirProcesoDePrueba(gestor, dentro);
    const r = await dividir(dentro, 99, [50, 49]);
    // Y dentro se divide de verdad: el proceso se cierra dividido, cada parte tiene su copia, y el kilo que sobra
    // se queda en el lote dividido —no se lo lleva ninguna parte—.
    const cerrado = await prisma.lotProcess.findUniqueOrThrow({ where: { id: pDentro.id } });
    expect(cerrado.closureKind).toBe("divided");
    expect(cerrado.dividedByTransformationId).toBe(r.transformation.id);
    const copias = await prisma.lotProcess.findMany({ where: { lotId: { in: r.outputLots.map((o) => o.id) } } });
    expect(copias).toHaveLength(2);
    for (const c of copias) expect(c.derivedFromLotProcessId).toBe(pDentro.id);
    const saldo = await computeLotBalance(prisma, dentro);
    expect(saldo.recorded).toBe(true);
    expect(saldo.quantity.toNumber()).toBe(1);
  });

  it("la tolerancia es la que FIJA la organización: con un 5 %, un remanente del 3 % se divide; con el 2 % por defecto, no", async () => {
    // Ronda de arreglo 1 (2026-10-01). Sin esta prueba, ninguna organización fijaba `massBalanceTolerancePct` y la
    // división caía siempre al 2 % por defecto: leer la tolerancia de la organización equivocada —o ninguna— pasaba.
    // Control: el MISMO reparto, en la organización que no la fija, se rechaza.
    const conDefecto = await lote("D17-2PC");
    await conSaldo(conDefecto, 100);
    const pDefecto = await abrirProcesoDePrueba(gestor, conDefecto);
    await expect(dividir(conDefecto, 97, [50, 47])).rejects.toThrow(new LotProcessError("division_deja_remanente"));
    await nadaEscrito(conDefecto, pDefecto.id, 1);

    const tolerante = await lote("D17-5PC", "cherry", orgTolerante);
    await conSaldo(tolerante, 100);
    const p = await abrirProcesoDePrueba(gestor, tolerante);
    const r = await dividir(tolerante, 97, [50, 47]);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).closureKind).toBe("divided");
    expect(await prisma.lotProcess.count({ where: { lotId: { in: r.outputLots.map((o) => o.id) } } })).toBe(2);
    expect((await computeLotBalance(prisma, tolerante)).quantity.toNumber()).toBe(3);
  });

  it("sin libro de masa se acepta, y el cierre lo dice", async () => {
    const l = await lote("D5");
    const p = await abrirProcesoDePrueba(gestor, l);
    const r = await dividir(l, 100, [50, 50]);
    const evento = await prisma.auditEvent.findFirst({ where: { entityId: p.id, operation: "lot_process.close" }, orderBy: { occurredAt: "desc" } });
    expect(JSON.stringify(evento!.after)).toContain('"sinLibroDeMasa":true');
    // El libro de masa acepta la división sin inventar nada: la diferencia queda desconocida (null, no 0) y el
    // lote dividido sigue sin ningún asiento —«nunca se pesó» no pasa a «pesado y vacío» (ADR-080)—.
    expect(r.reconciliation?.unexplained ?? null).toBeNull();
    expect(await prisma.quantityEvent.count({ where: { lotId: l } })).toBe(0);
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).closureKind).toBe("divided");
  });

  it("un lote dividido no se vuelve a dividir ni a seleccionar", async () => {
    // Sin libro de masa a propósito: con libro, la segunda división caería por `input_exceeds_available`
    // (el saldo ya es 0) y esta prueba no distinguiría la regla del balance.
    const l = await lote("D13");
    await abrirProcesoDePrueba(gestor, l);
    await dividir(l, 100, [50, 50]);
    await expect(dividir(l, 100, [50, 50])).rejects.toThrow(new LotProcessError("lote_dividido"));
    await expect(dividir(l, 100, [90, 10], "selection")).rejects.toThrow(new LotProcessError("lote_dividido"));
  });

  it("la miel sigue dividiendo en parcial, aunque tenga un proceso abierto colado", async () => {
    const m = await lote("D6-MIEL", "honey");
    await conSaldo(m, 10);
    // Un proceso ABIERTO insertado crudo (por servicio no se puede: R2 lo rechaza para miel). Sin él
    // la condición de miel de `recordTransformation` no tendría guardia: sin proceso arriba,
    // `antesDeTransformar` devuelve null por su cuenta y la división parcial pasaría igual.
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    await prisma.lotProcess.create({ data: {
      lotId: m, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 18, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
    } });
    // Como la divide `dividirMiel`: partes de miel (ronda de arreglo 1, 2026-10-01; antes salían `processing`, una
    // salida que el camino real nunca produce). La miel conserva su remanente (10 − 4).
    const r = await dividir(m, 4, [4], "split", "honey");
    expect(r.outputLots[0]!.lotType).toBe("honey");
    const restos = await prisma.quantityEvent.findMany({ where: { lotId: m }, select: { eventType: true, quantity: true } });
    expect(restos.reduce((a, e) => a + (e.eventType === "transfer_out" ? -1 : 1) * e.quantity.toNumber(), 0)).toBe(6);
    // Y R6 no la tocó: el proceso colado sigue abierto, y la parte no recibió copia.
    expect(await prisma.lotProcess.count({ where: { lotId: m, endedAt: null } })).toBe(1);
    expect(await prisma.lotProcess.count({ where: { lotId: r.outputLots[0]!.id } })).toBe(0);
  });

  it("si otro lote cubierto conserva saldo, no se divide: quedaría bajo un proceso dividido", async () => {
    const c = await lote("D11-C");
    await conSaldo(c, 100);
    const p = await abrirProcesoDePrueba(gestor, c);
    const f = await lote("D11-F");
    // F es hija de C sin consumirla: una transformación cruda no toca el libro de masa, así que C
    // sigue con sus 100 kg.
    await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: T, provenanceClass: "original_record",
      inputs: { create: [{ lotId: c }] }, outputs: { create: [{ lotId: f }] },
    } });
    await conSaldo(f, 50);
    await expect(dividir(f, 50, [25, 25])).rejects.toThrow(new LotProcessError("division_deja_remanente"));
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).endedAt).toBeNull();
  });

  it("una muestra con saldo bajo el proceso no impide dividir: las muestras no cuentan", async () => {
    // R6.1: «ningún otro lote cubierto puede conservar saldo», salvo las muestras, que salen del café a propósito
    // y no vuelven. Sin esta prueba, quitar la excepción no haría caer nada (flip de la tarea 6).
    const c = await lote("D15-C");
    await conSaldo(c, 100);
    const p = await abrirProcesoDePrueba(gestor, c);
    const muestra = (await prisma.lot.create({ data: {
      lotCode: `D15-S-${RUN}`, lotType: "sample", organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
    } })).id;
    lotes.push(muestra);
    await prisma.lotTransformation.create({ data: {
      transformationType: "sample_extraction", occurredAt: T, provenanceClass: "original_record",
      inputs: { create: [{ lotId: c }] }, outputs: { create: [{ lotId: muestra }] },
    } });
    await conSaldo(muestra, 1);
    await expect(dividir(c, 100, [100])).resolves.toBeDefined();
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).closureKind).toBe("divided");
  });

  it("seleccionar bajo un proceso abierto se rechaza, también por recordTransformation directo", async () => {
    const l = await lote("D7");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    await expect(dividir(l, 100, [90, 10], "selection")).rejects.toThrow(new LotProcessError("seleccion_bajo_proceso_abierto"));
  });

  it("fusionar con un proceso abierto se rechaza", async () => {
    const a = await lote("D8-A");
    const b = await lote("D8-B");
    await abrirProcesoDePrueba(gestor, a);
    await expect(recordTransformation(gestor, {
      transformationType: "merge", occurredAt: T, provenanceClass: "original_record",
      inputs: [{ lotId: a }, { lotId: b }], outputs: [{ lotCode: `D8-M-${RUN}`, lotType: "processing" }],
    })).rejects.toThrow(new LotProcessError("fusion_bajo_proceso_abierto"));
    // Lo mismo una mezcla (`blend`), y una «división» con dos entradas: también junta cafés.
    await expect(recordTransformation(gestor, {
      transformationType: "blend", occurredAt: T, provenanceClass: "original_record",
      inputs: [{ lotId: a }, { lotId: b }], outputs: [{ lotCode: `D8-BL-${RUN}`, lotType: "processing" }],
    })).rejects.toThrow(new LotProcessError("fusion_bajo_proceso_abierto"));
    await expect(recordTransformation(gestor, {
      transformationType: "split", occurredAt: T, provenanceClass: "original_record",
      inputs: [{ lotId: a }, { lotId: b }], outputs: [{ lotCode: `D8-S-${RUN}`, lotType: "processing" }],
    })).rejects.toThrow(new LotProcessError("fusion_bajo_proceso_abierto"));
    // Y con UNA sola entrada: una fusión o una mezcla no pasa a ser una división por traer una sola. Sin estos dos
    // casos, la condición «más de una entrada» taparía que se quitara el tipo `merge` o el `blend` (flip de la tarea 6).
    for (const tipo of ["merge", "blend"] as const) {
      await expect(recordTransformation(gestor, {
        transformationType: tipo, occurredAt: T, provenanceClass: "original_record",
        inputs: [{ lotId: a }], outputs: [{ lotCode: `D8-${tipo}-1-${RUN}`, lotType: "processing" }],
      })).rejects.toThrow(new LotProcessError("fusion_bajo_proceso_abierto"));
    }
  });

  it("dividir decide DESPUÉS de tener el linaje: un secado que otra transacción empezó se ve al soltarla", async () => {
    // El proceso vive en C y se divide F, su hija. La transacción ajena retiene la fila de C —la que
    // `bloquearLinajes` de la división tiene que tomar— y empieza un secado unido al proceso. La división
    // espera; al soltar ve el secado y se rechaza. Sin el bloqueo de la ASCENDENCIA, no espera a nadie: decide
    // antes de que el secado exista y cierra el proceso con una corrida dentro.
    const c = await lote("D10-C");
    const p = await abrirProcesoDePrueba(gestor, c);
    const f = await lote("D10-F");
    await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: T, provenanceClass: "original_record",
      inputs: { create: [{ lotId: c }] }, outputs: { create: [{ lotId: f }] },
    } });
    // Ronda de arreglo 1 (2026-10-01): la transacción ajena retiene SÓLO la fila de C. Antes el secado entraba sobre F,
    // y la clave ajena de `lot_transformation_input` toma `FOR KEY SHARE` sobre F: la división esperaba por su PROPIA
    // entrada, y bloquear sólo las entradas —sin la ascendencia— seguía en verde. Ahora el secado cuelga de C (y del
    // proceso, por `lotProcessId`), y nada de lo que escribe toca F.
    const retiene = retener(async (tx) => {
      await tx.$queryRaw`SELECT id FROM traceability.lot WHERE id = ${c}::uuid FOR UPDATE`;
      const run = await tx.dryingRun.create({ data: { startedAt: T, lotProcessId: p.id, createdBy: gestor } });
      await tx.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: T, provenanceClass: "original_record", createdBy: gestor,
        dryingRunId: run.id, inputs: { create: [{ lotId: c }] },
      } });
    });
    let division: Promise<Resultado<Awaited<ReturnType<typeof dividir>>>> | undefined;
    try {
      const pid = await retiene.pid;
      division = resultadoDe(dividir(f, null, [50, 50]));
      await esperarQueAlguienEspere(pid, "la división no esperó la fila del ancestro: no bloqueó el linaje");
      retiene.soltar();
      await retiene.hecho; // COMMIT: el secado queda empezado
      const v = await division;
      expect(v.ok, "la división cerró un proceso con un secado que empezó mientras ella esperaba").toBe(false);
      if (!v.ok) expect(v.error).toEqual(new LotProcessError("corridas_abiertas"));
    } finally {
      retiene.soltar();
      await retiene.hecho.catch(() => undefined);
      await division;
    }
    expect((await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } })).endedAt).toBeNull();
  });

  it("dividir a la vez que se empieza una corrida: no salen bien las dos", async () => {
    const l = await lote("D9");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    const [division, secado] = await Promise.allSettled([
      dividir(l, 100, [50, 50]),
      startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" }),
    ]);
    expect([division, secado].filter((x) => x.status === "fulfilled")).toHaveLength(1);
    // Ronda de arreglo 1 (2026-10-01): y la que pierde, por el motivo que corresponde a quién ganó. Contar sólo
    // cuántas salieron bien dejaba pasar un rechazo por cualquier otra cosa (una clave, un permiso, un tipo).
    const perdedora = division.status === "rejected" ? division : secado;
    if (perdedora.status !== "rejected") throw new Error("ninguna de las dos se rechazó");
    expect(perdedora.reason).toBeInstanceOf(LotProcessError);
    const motivo = (perdedora.reason as LotProcessError).message;
    if (division.status === "fulfilled") {
      // Ganó la división: el lote quedó dividido y el secado lo ve al tomar el linaje.
      expect(["lote_dividido", "sin_proceso_abierto"]).toContain(motivo);
    } else {
      // Ganó el secado: la división ve la corrida en curso.
      expect(motivo).toBe("corridas_abiertas");
    }
  }, 20000);

  it("bajo un proceso CERRADO, dividir en parcial y seleccionar siguen como hoy", async () => {
    // Ronda de arreglo 1 (2026-10-01). R6.6: «fuera de un proceso abierto, las divisiones siguen como hoy». El caso
    // que nadie vigilaba: un lote cubierto por un proceso que ya se cerró por humedad. Mirar «hay vigente» en vez de
    // «está abierto» lo trataría como si siguiera abierto.
    const l = await lote("D18");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l);
    const fechaDeCierre = new Date("2026-03-05T12:00:00Z");
    const humedad = (await prisma.measurement.create({ data: {
      variable: "moisture", value: 11, unit: "%", occurredAt: fechaDeCierre, lotId: l, provenanceClass: "measured_fact", createdBy: gestor,
    } })).id;
    mediciones.push(humedad);
    await cerrarProceso(gestor, { lotProcessId: p.id, endedAt: fechaDeCierre, closingMoistureMeasurementId: humedad });

    // Una división que deja 40 kg en el lote, y después una selección de esos 40.
    const division = await dividir(l, 60, [60]);
    const seleccion = await dividir(l, 40, [30, 10], "selection");
    expect((await computeLotBalance(prisma, l)).quantity.toNumber()).toBe(0);

    const cerrado = await prisma.lotProcess.findUniqueOrThrow({ where: { id: p.id } });
    expect(cerrado.closureKind).toBe("moisture");
    expect(cerrado.endedAt?.toISOString()).toBe(fechaDeCierre.toISOString());
    expect(cerrado.dividedByTransformationId).toBeNull();
    const partes = [...division.outputLots, ...seleccion.outputLots].map((o) => o.id);
    expect(partes).toHaveLength(3);
    expect(await prisma.lotProcess.count({ where: { lotId: { in: partes } } })).toBe(0);
  });

  it("sin proceso, dividir en parcial y seleccionar siguen como hoy", async () => {
    // Ronda de arreglo 1 (2026-10-01): la cereza sin proceso, que es la mayoría de los lotes de hoy.
    const l = await lote("D19");
    await conSaldo(l, 100);
    const division = await dividir(l, 60, [60]);
    const seleccion = await dividir(l, 40, [30, 10], "selection");
    expect((await computeLotBalance(prisma, l)).quantity.toNumber()).toBe(0);
    const partes = [...division.outputLots, ...seleccion.outputLots].map((o) => o.id);
    expect(await prisma.lotProcess.count({ where: { lotId: { in: [l, ...partes] } } })).toBe(0);
  });

  it("una división SIN partes bajo un proceso abierto se rechaza, y no escribe nada", async () => {
    // Ronda de arreglo 1 (2026-10-01). Sin libro de masa nada medía el remanente, y con cero salidas el proceso se
    // cerraba como dividido sin una sola copia: el café quedaba sin proceso y su lote, cerrado a todo. Con cero
    // partes TODO el café queda fuera de ellas.
    const l = await lote("D20");
    const p = await abrirProcesoDePrueba(gestor, l);
    await expect(dividir(l, 100, [])).rejects.toThrow(new LotProcessError("division_deja_remanente"));
    await nadaEscrito(l, p.id, 0);
  });

  it("una inspección no se registra sobre un lote dividido, y el lote dividido no se ofrece para inspeccionar", async () => {
    // Ronda de arreglo 1 (2026-10-01). R6.6: el lote dividido no admite muestras. `registrarInspeccion` (la pantalla
    // /inspecciones/nueva) crea muestras MOISTURE con `sourceLotId` y era una tercera puerta, sin la regla.
    const l = await lote("D16");
    await conSaldo(l, 100);
    await abrirProcesoDePrueba(gestor, l);
    const r = await dividir(l, 100, [60, 40]);
    const v = await resultadoDe(registrarInspeccion(gestor, {
      lotId: l, occurredAt: T, notes: `TEST D16 ${RUN}`, muestras: [{ materialState: "CHERRY", samplingRole: "REPLICATE" }],
    }));
    expect(v.ok, "la inspección sobre el lote dividido se registró").toBe(false);
    if (!v.ok) {
      expect(v.error).toBeInstanceOf(SampleValidationError);
      expect((v.error as Error).message).toBe("lote_dividido");
    }
    expect(await prisma.sample.count({ where: { sourceLotId: l } })).toBe(0);
    expect(await prisma.samplingEvent.count({ where: { notes: { contains: RUN } } })).toBe(0);

    // Las opciones del formulario: el lote dividido no sale; una de sus partes sí (control: si no saliera
    // ninguna, «no está» no diría nada).
    const { lotes: ofrecidos } = await opcionesParaInspeccion(gestor);
    const ids = ofrecidos.map((o) => o.id);
    expect(ids).toContain(r.outputLots[0]!.id);
    expect(ids).not.toContain(l);
  }, 30000);
});

describe("R6 — el reporte y la división", () => {
  it("el reporte no cuenta la fila del proceso dividido como un proceso más", async () => {
    const l = await lote("D10");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l);
    await dividir(l, 100, [50, 50]);
    const r = await reporteDeProceso(gestor);
    const fila = r.filas.find((f) => f.lotProcessId === p.id);
    expect(fila?.divididoEn).toHaveLength(2);
    const grupo = r.porProceso.find((g) => g.etiqueta === "Sin receta");
    expect(grupo?.filas).toBe(r.filas.filter((f) => f.etiqueta === "Sin receta" && f.divididoEn === null).length);
  });
});

/**
 * Tarea 9, ronda de arreglo 1 (2026-10-02). La prueba de arriba sólo mira el recuento de `porProceso`; el encargo pide que TODO
 * cálculo de grupo vaya sobre `filasQueCuentan`, y el recuento de `porGrado` y los puntajes que junta `agrupar` no tenían quién
 * los vigilara. El lote que se divide lleva un puntaje de taza: es lo único que podría arrastrar la fila dividida a un promedio.
 */
describe("R6 — el reporte agrupa sólo las filas que cuentan", () => {
  let protocoloId: string | undefined, versionId: string | undefined, sesionId: string | undefined;

  afterAll(async () => {
    // La cata, ANTES que la muestra a la que apunta su mapeo (la muestra la borra el `afterAll` del archivo, con su lote).
    if (sesionId) {
      await prisma.assessment.deleteMany({ where: assertDefinedWhere({ blindSample: { flight: { sessionId: sesionId } } }) });
      await prisma.sensoryBlindMapping.deleteMany({ where: assertDefinedWhere({ blindSample: { flight: { sessionId: sesionId } } }) });
      await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ id: sesionId }) });
    }
    if (versionId) await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ id: versionId }) });
    if (protocoloId) await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ id: protocoloId }) });
  }, 60000);

  it("el recuento por grado y los puntajes de cada grupo no cuentan la fila dividida", async () => {
    const l = await lote("D11");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l);
    // muestra → cata ciega → puntaje, sobre el lote que se va a dividir (misma forma que `reporteDeProceso.test.ts`).
    protocoloId = (await prisma.sensoryProtocol.create({ data: {
      domain: "coffee", name: `TEST protocolo ${RUN}`, status: "active", standardLicenseStatus: "adapted_original",
    } })).id;
    versionId = (await prisma.sensoryProtocolVersion.create({ data: { protocolId: protocoloId, version: 1, scoreMin: 0, scoreMax: 100, status: "active" } })).id;
    sesionId = (await prisma.sensorySession.create({ data: {
      name: `TEST cata ${RUN}`, protocolVersionId: versionId, status: "completed", classification: "internal", createdBy: gestor,
    } })).id;
    const vuelo = await prisma.sensoryFlight.create({ data: { sessionId: sesionId, name: "V1", sequenceOrder: 0 } });
    const muestra = await prisma.sample.create({ data: {
      sampleCode: `D11-M-${RUN}`, sampleType: "green", organizationId: orgId, locationId: plotId, sourceLotId: l,
      status: "approved", classification: "internal", createdBy: gestor,
    } });
    const ciega = await prisma.sensoryBlindSample.create({ data: { flightId: vuelo.id, blindCode: "A" } });
    await prisma.sensoryBlindMapping.create({ data: { blindSampleId: ciega.id, sampleId: muestra.id } });
    await prisma.assessment.create({ data: { blindSampleId: ciega.id, evaluatorUserAccountId: gestor, overallScore: 85, status: "submitted" } });

    await dividir(l, 100, [50, 50]);
    const r = await reporteDeProceso(gestor);
    const fila = r.filas.find((f) => f.lotProcessId === p.id);
    expect(fila?.divididoEn).toHaveLength(2);
    expect(fila?.puntajes, "control: la fila dividida lleva el puntaje; sin él, los promedios no distinguirían nada").toEqual([85]);

    const cuentan = r.filas.filter((f) => f.divididoEn === null);
    const promedioDe = (xs: number[]) => (xs.length === 0 ? null : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100);
    const grado = r.porGrado.find((g) => g.grado === "Washed");
    expect(grado, "el grupo Washed no salió").toBeDefined();
    expect(grado!.filas, "el recuento por grado cuenta la fila dividida").toBe(cuentan.filter((f) => f.gradoDeProceso === "Washed").length);
    expect(grado!.puntajePromedio, "el promedio por grado junta el puntaje de la fila dividida").toBe(
      promedioDe(cuentan.filter((f) => f.gradoDeProceso === "Washed").flatMap((f) => f.puntajes)),
    );
    const etiqueta = r.porProceso.find((g) => g.etiqueta === "Sin receta");
    expect(etiqueta?.puntajePromedio, "el promedio por receta junta el puntaje de la fila dividida").toBe(
      promedioDe(cuentan.filter((f) => f.etiqueta === "Sin receta").flatMap((f) => f.puntajes)),
    );
  });
});
