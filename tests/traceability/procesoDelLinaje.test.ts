/**
 * R1 de la Parte 1: el proceso que cubre a un lote se busca HACIA ARRIBA por su linaje.
 * docs/superpowers/specs/2026-09-30-parte-1-el-proceso-cubre-al-lote-design.md
 *
 * Linajes armados a mano —lotes y transformaciones crudas, sin servicios— porque lo que se prueba es
 * el recorrido, no los permisos. Los procesos también se insertan crudos, con los valores de catálogo
 * REALES de la base sembrada (Washed, despulpada): no hay valores de prueba que limpiar.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../lib/db";
import {
  procesoQueCubre, idsDeAscendencia, idsDeDescendencia, loteDividido, procesosParaEntrada,
  gradoDelProcesoQueCubre, TOPE_DE_LINAJE,
} from "../../lib/traceability/procesoDelLinaje";
import { LotProcessError } from "../../lib/traceability/errorDeProceso";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `linaje-${Date.now()}`;
let orgId: string;
let plotId: string;
let valorGrado: string;
let valorCereza: string;
const lotes: string[] = [];
const transformaciones: string[] = [];
const mediciones: string[] = [];

async function valor(catalogo: string, v: string): Promise<string> {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } }, select: { id: true } })).id;
}

async function lote(codigo: string, lotType: "cherry" | "processing" | "parchment" | "green" | "honey" = "cherry"): Promise<string> {
  const id = (await prisma.lot.create({ data: {
    lotCode: `${codigo}-${RUN}`, lotType, organizationId: orgId, locationId: plotId, status: "approved", classification: "internal",
  } })).id;
  lotes.push(id);
  return id;
}

async function enlazar(tipo: "stage_change" | "split" | "merge", padres: string[], hijos: string[]): Promise<string> {
  const t = await prisma.lotTransformation.create({ data: {
    transformationType: tipo, occurredAt: new Date("2026-03-05T12:00:00Z"), provenanceClass: "original_record",
    inputs: { create: padres.map((lotId) => ({ lotId })) },
    outputs: { create: hijos.map((lotId) => ({ lotId })) },
  } });
  transformaciones.push(t.id);
  return t.id;
}

async function proceso(lotId: string, estado: "abierto" | "cerrado", sequenceOrder = 1): Promise<string> {
  let medicion: string | null = null;
  if (estado === "cerrado") {
    medicion = (await prisma.measurement.create({ data: {
      variable: "moisture", value: 10.5, unit: "%", occurredAt: new Date("2026-03-20T12:00:00Z"), lotId, provenanceClass: "measured_fact",
    } })).id;
    mediciones.push(medicion);
  }
  return (await prisma.lotProcess.create({ data: {
    lotId, sequenceOrder, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
    provenanceClass: "original_record", processGradeValueId: valorGrado, cherryStateValueId: valorCereza,
    ...(estado === "cerrado"
      ? { endedAt: new Date("2026-03-21T12:00:00Z"), closureKind: "moisture" as const, closingMoistureMeasurementId: medicion }
      : {}),
  } })).id;
}

/** Una cadena de `n` lotes, cada uno hijo del anterior. Devuelve los ids de arriba abajo. */
async function cadena(prefijo: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await lote(`${prefijo}${i}`));
  for (let i = 1; i < n; i++) await enlazar("stage_change", [ids[i - 1]!], [ids[i]!]);
  return ids;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  valorGrado = await valor("grado_proceso", "Washed");
  valorCereza = await valor("estado_cereza", "despulpada");
}, 60000);

afterAll(async () => {
  await prisma.lotProcess.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.measurement.deleteMany({ where: assertDefinedWhere({ id: { in: mediciones } }) });
  await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 60000);

describe("R1 — el proceso que cubre a un lote", () => {
  it("un lote con su propio proceso abierto lo tiene vigente", async () => {
    const l = await lote("PROPIO");
    const p = await proceso(l, "abierto");
    const c = await procesoQueCubre(prisma, l);
    expect(c.estado).toBe("abierto");
    expect(c.vigente?.id).toBe(p);
    expect(c.cadena.map((x) => x.id)).toEqual([p]);
  });

  it("el pergamino encuentra el proceso de la cereza, dos generaciones arriba", async () => {
    const [cereza, fermentado, pergamino] = await cadena("PERG", 3);
    const p = await proceso(cereza!, "abierto");
    const c = await procesoQueCubre(prisma, pergamino!);
    expect(c.estado).toBe("abierto");
    expect(c.vigente?.id).toBe(p);
    expect(c.vigente?.lotId).toBe(cereza);
    expect(c.vigente?.profundidad).toBe(2);
    expect(fermentado).toBeDefined();
  });

  it("sin proceso en ninguna rama es sin_proceso", async () => {
    const l = await lote("SOLO");
    const c = await procesoQueCubre(prisma, l);
    expect(c.estado).toBe("sin_proceso");
    expect(c.vigente).toBeNull();
  });

  it("reproceso: el verde tiene P2 vigente y P1 en la cadena", async () => {
    const [cereza, pergamino, verde] = await cadena("REPRO", 3);
    const p1 = await proceso(cereza!, "cerrado");
    const p2 = await proceso(pergamino!, "abierto");
    const c = await procesoQueCubre(prisma, verde!);
    expect(c.vigente?.id).toBe(p2);
    expect(c.cadena.map((x) => x.id)).toEqual([p2, p1]);
  });

  it("una fusión de ramas con procesos distintos es mezcla, aunque una rama llegue antes", async () => {
    const a = await lote("MEZ-A");
    const pa = await proceso(a, "cerrado");
    const [b, b1] = await cadena("MEZ-B", 2);
    const pb = await proceso(b!, "cerrado");
    const m = await lote("MEZ-M");
    await enlazar("merge", [a, b1!], [m]);
    const c = await procesoQueCubre(prisma, m);
    expect(c.estado).toBe("mezcla");
    expect(c.vigente).toBeNull();
    expect(c.composicion?.procesos.map((x) => x.id).sort()).toEqual([pa, pb].sort());
  });

  it("una fusión con una rama sin proceso es mezcla, y lo dice", async () => {
    const a = await lote("MEZ2-A");
    await proceso(a, "cerrado");
    const z = await lote("MEZ2-Z");
    const m = await lote("MEZ2-M");
    await enlazar("merge", [a, z], [m]);
    const c = await procesoQueCubre(prisma, m);
    expect(c.estado).toBe("mezcla");
    expect(c.composicion?.ramaSinProceso).toBe(true);
  });

  it("si el lote tiene dos procesos, el vigente es el más reciente y el otro va en la cadena", async () => {
    const l = await lote("DOS");
    const p1 = await proceso(l, "cerrado", 1);
    const p2 = await proceso(l, "abierto", 2);
    const c = await procesoQueCubre(prisma, l);
    expect(c.vigente?.id).toBe(p2);
    expect(c.cadena.map((x) => x.id)).toEqual([p2, p1]);
  });

  it("un diamante que vuelve al mismo proceso no es mezcla", async () => {
    const raiz = await lote("DIA-R");
    const p = await proceso(raiz, "abierto");
    const s1 = await lote("DIA-S1");
    const s2 = await lote("DIA-S2");
    await enlazar("split", [raiz], [s1, s2]);
    const d = await lote("DIA-D");
    await enlazar("merge", [s1, s2], [d]);
    const c = await procesoQueCubre(prisma, d);
    expect(c.estado).toBe("abierto");
    expect(c.vigente?.id).toBe(p);
    const arriba = await idsDeAscendencia(prisma, d);
    expect([...arriba].sort()).toEqual([raiz, s1, s2].sort());
  });

  it(`el borde: ${TOPE_DE_LINAJE} generaciones exactas se resuelven`, async () => {
    const ids = await cadena("BORDE", TOPE_DE_LINAJE + 1);
    await proceso(ids[0]!, "abierto");
    const c = await procesoQueCubre(prisma, ids[ids.length - 1]!);
    expect(c.vigente?.profundidad).toBe(TOPE_DE_LINAJE);
  }, 120000);

  it(`un linaje que pasa del tope (${TOPE_DE_LINAJE}) lanza en vez de decir «sin proceso»`, async () => {
    const ids = await cadena("HONDO", TOPE_DE_LINAJE + 2);
    const ultimo = ids[ids.length - 1]!;
    await expect(procesoQueCubre(prisma, ultimo)).rejects.toThrow(new LotProcessError("lineage_too_deep"));
    await expect(idsDeAscendencia(prisma, ultimo)).rejects.toThrow(new LotProcessError("lineage_too_deep"));
  }, 120000);

  it("la descendencia pasa de 12 generaciones sin cortarse en silencio", async () => {
    const ids = await cadena("ABAJO", 15);
    const abajo = await idsDeDescendencia(prisma, ids[0]!);
    expect(abajo).toHaveLength(14);
  }, 60000);

  it("un lote es «dividido» sólo si es la entrada de una división que cerró un proceso", async () => {
    const x = await lote("DIV-X");
    const x1 = await lote("DIV-X1");
    const x2 = await lote("DIV-X2");
    const t = await enlazar("split", [x], [x1, x2]);
    await prisma.lotProcess.create({ data: {
      lotId: x, sequenceOrder: 1, intent: `TEST ${RUN}`, targetMoisturePct: 11, startedAt: new Date("2026-03-01T12:00:00Z"),
      provenanceClass: "original_record", processGradeValueId: valorGrado, cherryStateValueId: valorCereza,
      endedAt: new Date("2026-03-05T12:00:00Z"), closureKind: "divided", dividedByTransformationId: t,
    } });
    expect(await loteDividido(prisma, x)).toBe(true);
    expect(await loteDividido(prisma, x1)).toBe(false);
  });

  it("ficha y tablero reciben lo mismo: el grado del vigente, también para un hijo", async () => {
    const [cereza, hijo] = await cadena("ENTRADA", 2);
    await proceso(cereza!, "abierto");
    expect(await procesosParaEntrada(prisma, hijo!)).toEqual([{ endedAt: null, gradoDeProceso: "Washed" }]);
    expect(await gradoDelProcesoQueCubre(prisma, hijo!)).toBe("Washed");
  });
});
