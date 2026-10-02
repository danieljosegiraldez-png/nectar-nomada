/**
 * R7 de la Parte 1: la compuerta de bodega mira el proceso que CUBRE al lote —buscado hacia arriba—, y
 * lo hace DENTRO de la transacción de `moveLotToStorage`, con el linaje bloqueado. El que va a bodega
 * es el pergamino, y su proceso vive en la cereza. Sólo al ENTRAR: reubicar un lote que ya está dentro
 * no vuelve a juzgar el secado. Un lote sin proceso entra, como hoy (R9).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { abrirProceso, cerrarProceso } from "../../lib/traceability/lotProcess";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import type { Prisma } from "../../generated/prisma/client";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `bodega-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
/** Los dos valores de catálogo que lleva todo proceso, buscados una vez: la carrera no tiene que gastar su
 *  arranque en dos lecturas, o una de las dos mitades llegaría siempre tarde y la prueba no correría nada. */
let gradoId: string, cerezaId: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
/** Mediciones de cierre. Se borran DESPUÉS de los procesos que las referencian (`closing_moisture_measurement_id` es RESTRICT). */
const mediciones: string[] = [];

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

async function humedad(lotId: string, value: number) {
  const id = (await prisma.measurement.create({ data: { variable: "moisture", value, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
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
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  // Los eventos de proceso (`lot_process.open`, `…close`) ya los borró el ayudante por el id de su proceso; esto recoge
  // lo que cualquier otra escritura de la cuenta haya dejado.
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: [gestor] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId: { in: [scopeId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: [scopeId] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gestor] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotId] } }) });
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

  it("reubicar dentro de bodega no vuelve a juzgar el secado", async () => {
    const cereza = await lote("B4-C");
    const guardado = await lote("B4-G");
    await enlazar([cereza], [guardado]);
    await prisma.storageAssignment.create({ data: { lotId: guardado, locationId: plotId, startedAt: new Date("2026-03-01T12:00:00Z") } });
    // Un ancestro con proceso ABIERTO: R2 lo deja abrir, porque `lote_en_bodega` mira el propio lote
    // y no su descendencia. Con el proceso abierto, la compuerta rechazaría una ENTRADA; una
    // reubicación no la consulta.
    await abrirProcesoDePrueba(gestor, cereza);
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
});
