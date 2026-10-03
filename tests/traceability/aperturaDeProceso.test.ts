/**
 * R2 de la Parte 1: un solo proceso abierto por café, comprobado en el linaje y no sólo en el lote.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { abrirProcesoDePrueba, borrarProcesosDeLotesDonde } from "../helpers/procesoDePrueba";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `apertura-${Date.now()}`;
let orgId: string, plotId: string, scopeId: string, gestor: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
const mediciones: string[] = [];

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
async function enlazar(tipo: "stage_change" | "split" | "merge", padres: string[], hijos: string[]) {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: tipo, occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record", createdBy: gestor,
    inputs: { create: padres.map((lotId) => ({ lotId })) }, outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
  return t.id;
}
/** Un proceso cerrado por humedad, insertado crudo. */
async function cerradoCrudo(lotId: string) {
  const [g, c] = await Promise.all([
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
    prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
  ]);
  const m = (await prisma.measurement.create({ data: { variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact", createdBy: gestor } })).id;
  mediciones.push(m);
  return (await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
    endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture", closingMoistureMeasurementId: m,
  } })).id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  gestor = await cuenta("Gestor");
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const farm = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: gestor, roleProfileId: farm.id, scopeId } });
}, 60000);

afterAll(async () => {
  await borrarProcesosDeLotesDonde({ id: { in: lotes } });
  await prisma.storageAssignment.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: gestor }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ scopeId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: gestor }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R2 — un solo proceso abierto por café", () => {
  it("no se abre en el hijo si el padre tiene uno abierto", async () => {
    const padre = await lote("P1-PADRE");
    const hijo = await lote("P1-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await abrirProcesoDePrueba(gestor, padre);
    await expect(abrirProcesoDePrueba(gestor, hijo)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("no se abre en el padre si un hijo tiene uno abierto", async () => {
    const padre = await lote("P2-PADRE");
    const hijo = await lote("P2-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await abrirProcesoDePrueba(gestor, hijo);
    await expect(abrirProcesoDePrueba(gestor, padre)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("sí se abre un reproceso bajo un proceso CERRADO", async () => {
    const padre = await lote("P3-PADRE");
    const hijo = await lote("P3-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    await cerradoCrudo(padre);
    const p = await abrirProcesoDePrueba(gestor, hijo);
    expect(p.endedAt).toBeNull();
  });

  it("rechaza dividido, en bodega, mezcla y miel, cada uno con su código", async () => {
    // Dividido: la entrada de una división que cerró un proceso.
    const x = await lote("P4-DIV");
    const x1 = await lote("P4-DIV1");
    const t = await enlazar("split", [x], [x1]);
    const [g, c] = await Promise.all([
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "Washed", catalog: { key: "grado_proceso" } } }),
      prisma.variableCatalogValue.findFirstOrThrow({ where: { value: "despulpada", catalog: { key: "estado_cereza" } } }),
    ]);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: g.id, cherryStateValueId: c.id,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: t,
    } });
    await expect(abrirProcesoDePrueba(gestor, x)).rejects.toThrow(new LotProcessError("lote_dividido"));

    // En bodega.
    const b = await lote("P4-BODEGA");
    await prisma.storageAssignment.create({ data: { lotId: b, locationId: plotId, startedAt: new Date("2026-03-22T12:00:00Z") } });
    await expect(abrirProcesoDePrueba(gestor, b)).rejects.toThrow(new LotProcessError("lote_en_bodega"));

    // Mezcla.
    const a1 = await lote("P4-MA");
    const a2 = await lote("P4-MB");
    await cerradoCrudo(a1);
    await cerradoCrudo(a2);
    const m = await lote("P4-MEZCLA");
    await enlazar("merge", [a1, a2], [m]);
    await expect(abrirProcesoDePrueba(gestor, m)).rejects.toThrow(new LotProcessError("lote_mezclado"));

    // Miel.
    const miel = await lote("P4-MIEL", "honey");
    await expect(abrirProcesoDePrueba(gestor, miel)).rejects.toThrow(new LotProcessError("proceso_no_aplica_a_miel"));
  });

  it("no se abre sobre un lote con un descendiente en bodega: descendiente_en_bodega; el mismo árbol sin bodega abre", async () => {
    // Decisión de Daniel, 2026-10-02 (registro, línea 189): «ya en almacén/reposo no se puede abrir un lote». El que está en
    // bodega es el NIETO, a dos generaciones: no es el propio lote (eso es `lote_en_bodega`), y un proceso abierto en el
    // abuelo lo cubriría. Ningún proceso en el árbol, para que el rechazo no pueda venir de `process_already_open`.
    const abuelo = await lote("P9-ABUELO");
    const padre = await lote("P9-PADRE");
    const nieto = await lote("P9-NIETO");
    await enlazar("stage_change", [abuelo], [padre]);
    await enlazar("stage_change", [padre], [nieto]);
    await prisma.storageAssignment.create({ data: { lotId: nieto, locationId: plotId, startedAt: new Date("2026-03-22T12:00:00Z") } });
    await expect(abrirProcesoDePrueba(gestor, abuelo)).rejects.toThrow(new LotProcessError("descendiente_en_bodega"));
    expect(await prisma.lotProcess.count({ where: { lotId: abuelo } }), "el rechazo dejó un proceso escrito").toBe(0);

    // Control: el MISMO árbol, sin nada en bodega, abre. Sin él, el rechazo de arriba podría venir de cualquier cosa del árbol.
    const abuelo2 = await lote("P9C-ABUELO");
    const padre2 = await lote("P9C-PADRE");
    const nieto2 = await lote("P9C-NIETO");
    await enlazar("stage_change", [abuelo2], [padre2]);
    await enlazar("stage_change", [padre2], [nieto2]);
    const p = await abrirProcesoDePrueba(gestor, abuelo2);
    expect(p.endedAt).toBeNull();
  });

  it("un descendiente a más de 12 generaciones con proceso abierto impide abrir arriba", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 15; i++) ids.push(await lote(`P6-${i}`));
    for (let i = 1; i < 15; i++) await enlazar("stage_change", [ids[i - 1]!], [ids[i]!]);
    await abrirProcesoDePrueba(gestor, ids[14]!);
    await expect(abrirProcesoDePrueba(gestor, ids[0]!)).rejects.toThrow(new LotProcessError("process_already_open"));
  }, 60000);

  it("dos aperturas a la vez en padre e hijo: sólo una sale bien, y la otra con nombre", async () => {
    const padre = await lote("P5-PADRE");
    const hijo = await lote("P5-HIJO");
    await enlazar("stage_change", [padre], [hijo]);
    const res = await Promise.allSettled([abrirProcesoDePrueba(gestor, padre), abrirProcesoDePrueba(gestor, hijo)]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const fallo = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(fallo.reason).toBeInstanceOf(LotProcessError);
    expect((fallo.reason as Error).message).toBe("process_already_open");
  }, 20000);

  it("no se abre bajo un ancestro abierto aunque haya uno cerrado más cerca", async () => {
    // G (raíz, sin proceso) → P (con un proceso CERRADO) → C. G abre sin problema, porque P está
    // cerrado; desde entonces C no puede: su proceso vigente es el cerrado de P, que no ve el
    // abierto de G, y sólo el recorrido del linaje entero lo encuentra.
    const g = await lote("P7-G");
    const p = await lote("P7-P");
    const c = await lote("P7-C");
    await enlazar("stage_change", [g], [p]);
    await enlazar("stage_change", [p], [c]);
    await cerradoCrudo(p);
    const deG = await abrirProcesoDePrueba(gestor, g);
    expect(deG.endedAt).toBeNull();
    await expect(abrirProcesoDePrueba(gestor, c)).rejects.toThrow(new LotProcessError("process_already_open"));
  });

  it("abrir un proceso escribe su evento de auditoría lot_process.open", async () => {
    // Las tareas 6 y 8 reutilizan el núcleo de apertura y cuentan con este evento.
    const l = await lote("P8-AUDITORIA");
    const p = await abrirProcesoDePrueba(gestor, l);
    const evento = await prisma.auditEvent.findFirst({
      where: { operation: "lot_process.open", entityType: "lot_process", entityId: p.id },
    });
    expect(evento, "abrir un proceso no dejó su evento lot_process.open").not.toBeNull();
  });
});
