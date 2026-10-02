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
import { createSampleFromLot } from "../../lib/traceability/samples";
import { cerrarProceso } from "../../lib/traceability/lotProcess";
import { procesoQueCubre, bloquearLinaje } from "../../lib/traceability/procesoDelLinaje";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import type { Prisma } from "../../generated/prisma/client";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `division-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
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
async function lote(codigo: string, lotType: "cherry" | "honey" = "cherry") {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal", createdBy: gestor,
  } })).id;
  lotes.push(id);
  return id;
}
/** Le da al lote un libro de masa con `kg`. */
async function conSaldo(lotId: string, kg: number) {
  await prisma.quantityEvent.create({ data: { lotId, eventType: "process_output", quantity: kg, unit: "kg", occurredAt: new Date("2026-03-02T12:00:00Z"), provenanceClass: "measured_fact" } });
}
/** Cada llamada da códigos nuevos: dividir dos veces el mismo lote no choca con `UNIQUE(organization_id, lot_code)`. */
let divisiones = 0;
function dividir(lotId: string, entra: number | null, partes: number[], tipo: "split" | "selection" = "split") {
  const n = ++divisiones;
  return recordTransformation(gestor, {
    transformationType: tipo, occurredAt: T, provenanceClass: "original_record",
    inputs: [{ lotId, quantity: entra, unit: entra === null ? null : "kg" }],
    outputs: partes.map((kg, i) => ({ lotCode: `${lotId.slice(0, 8)}-${n}${String.fromCharCode(65 + i)}-${RUN}`, lotType: "processing" as const, quantity: kg, unit: "kg" })),
  }).then((r) => { lotes.push(...r.outputLots.map((l) => l.id)); return r; });
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
}, 60000);

afterAll(async () => {
  // Todos los lotes de la organización de esta corrida, no sólo los apuntados: una transformación que sale bien
  // sin esperarlo —en rojo, o con una mutación del flip— crea lotes que ninguna lista conoce, y el borrado de la
  // organización del final reventaría (`lot_organization_id_fkey` es RESTRICT). Medido en la primera corrida en
  // rojo: quedó el lote de la fusión.
  const deLaOrganizacion = await prisma.lot.findMany({ where: assertDefinedWhere({ organizationId: orgId }), select: { id: true } });
  const todos = [...new Set([...lotes, ...deLaOrganizacion.map((l) => l.id)])];
  const ts = (await prisma.lotTransformation.findMany({
    where: { OR: [{ inputs: { some: { lotId: { in: todos } } } }, { outputs: { some: { lotId: { in: todos } } } }] },
    select: { id: true, dryingRunId: true },
  }));
  // Antes que las transformaciones: `divided_by_transformation_id` es RESTRICT.
  await borrarProcesosDeLotesDonde({ id: { in: todos } });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: todos } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: ts.map((t) => t.id) } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: ts.map((t) => t.id) } }) });
  const sec = ts.map((t) => t.dryingRunId).filter((x): x is string => x !== null);
  await prisma.dryingRun.deleteMany({ where: assertDefinedWhere({ id: { in: sec } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: todos } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R6 — dividir bajo un proceso abierto", () => {
  it("cierra el padre como dividido y da a cada parte su proceso, unido al anterior", async () => {
    const l = await lote("D1");
    await conSaldo(l, 100);
    const p = await abrirProcesoDePrueba(gestor, l);
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
      expect(c.processGradeValueId).toBe(p.processGradeValueId);
      expect(c.targetMoisturePct.toNumber()).toBe(p.targetMoisturePct.toNumber());
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
    await abrirProcesoDePrueba(gestor, fuera);
    await expect(dividir(fuera, 90, [45, 45])).rejects.toThrow(new LotProcessError("division_deja_remanente"));

    // 2 % por defecto (la organización no fija otra): sobra 1 kg de 99, dentro de 1,98.
    const dentro = await lote("D4");
    await conSaldo(dentro, 100);
    await abrirProcesoDePrueba(gestor, dentro);
    await expect(dividir(dentro, 99, [50, 49])).resolves.toBeDefined();
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
    const r = await dividir(m, 4, [4]);
    // La parte sale como `processing` aunque el origen sea miel, y la miel conserva su remanente (10 − 4).
    expect(r.outputLots[0]!.lotType).toBe("processing");
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
  });

  it("dividir decide DESPUÉS de tener el linaje: un secado que otra transacción empezó se ve al soltarla", async () => {
    // El proceso vive en C y se divide F, su hija. La transacción ajena retiene la fila de C —la que
    // `bloquearLinajes` de la división tiene que tomar— y empieza un secado unido al proceso sobre F. La
    // división espera; al soltar ve el secado y se rechaza. Sin el bloqueo, no espera a nadie: decide
    // antes de que el secado exista y cierra el proceso con una corrida dentro.
    const c = await lote("D10-C");
    const p = await abrirProcesoDePrueba(gestor, c);
    const f = await lote("D10-F");
    await prisma.lotTransformation.create({ data: {
      transformationType: "stage_change", occurredAt: T, provenanceClass: "original_record",
      inputs: { create: [{ lotId: c }] }, outputs: { create: [{ lotId: f }] },
    } });
    const retiene = retener(async (tx) => {
      await bloquearLinaje(tx, c);
      const run = await tx.dryingRun.create({ data: { startedAt: T, lotProcessId: p.id, createdBy: gestor } });
      await tx.lotTransformation.create({ data: {
        transformationType: "stage_change", occurredAt: T, provenanceClass: "original_record", createdBy: gestor,
        dryingRunId: run.id, inputs: { create: [{ lotId: f }] },
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
    const res = await Promise.allSettled([
      dividir(l, 100, [50, 50]),
      startDryingRun(gestor, { lotId: l, startedAt: T, provenanceClass: "original_record" }),
    ]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  }, 20000);
});
