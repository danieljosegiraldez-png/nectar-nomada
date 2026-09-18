import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  ModeloError,
  crearModelo,
  declararEspecificacion,
  editarModelo,
  listarModelos,
  modeloParaFicha,
  modelosParaElegir,
  puedeCrearCompartido,
  retirarEspecificacion,
  retirarModelo,
} from "../../lib/equipos/modelos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let admin: string, jefeA: string, operarioA: string, orgA: string, orgB: string, sitioA: string, sitioB: string, RUN: string;

beforeAll(async () => {
  f = await montarFixtures("mod");
  ({ admin, jefeA, operarioA, orgA, orgB, sitioA, sitioB } = f);
  RUN = f.run;
});
afterAll(async () => {
  const modelos = await prisma.equipmentModel.findMany({ where: { manufacturer: { contains: RUN } }, select: { id: true } });
  const ids = modelos.map((m) => m.id);
  await prisma.equipmentModelSpec.deleteMany({ where: { modelId: { in: ids } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: ids } } });
  await f.limpiar();
});

describe("puedeCrearCompartido", () => {
  it("sólo con plataforma", async () => {
    expect(await puedeCrearCompartido(admin)).toBe(true);
    expect(await puedeCrearCompartido(jefeA)).toBe(false);
  });
});

describe("crearModelo", () => {
  it("el jefe crea un modelo propio; la organización sale del sitio", async () => {
    const m = await crearModelo(jefeA, {
      dueno: { tipo: "propio", locationId: sitioA },
      kind: "instrument", manufacturer: `ATAGO ${RUN}`, modelName: "PAL-1",
      recommendedMaintenanceDays: 180, provenanceClass: "manufacturer_specification",
    });
    const fila = await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } });
    expect(fila.organizationId).toBe(orgA);
    expect(fila.createdBy).toBe(jefeA);
  });

  it("el operario no crea modelos (definir el catálogo es gestión)", async () => {
    await expect(
      crearModelo(operarioA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "op", provenanceClass: "original_record" }),
    ).rejects.toThrow();
  });

  it("un compartido exige plataforma", async () => {
    await expect(
      crearModelo(jefeA, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "comp", provenanceClass: "original_record" }),
    ).rejects.toThrow();
    const m = await crearModelo(admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `X ${RUN}`, modelName: "comp", provenanceClass: "original_record" });
    expect((await prisma.equipmentModel.findUniqueOrThrow({ where: { id: m.id } })).organizationId).toBeNull();
  });

  it("el duplicado sin mayúsculas sale como ModeloError legible, no como error de Prisma", async () => {
    await expect(
      crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: ` atago ${RUN}`, modelName: "pal-1", provenanceClass: "original_record" }),
    ).rejects.toThrow(new ModeloError("modelo_duplicado"));
  });

  it("escribe un AuditEvent en la misma transacción", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "vessel", manufacturer: `X ${RUN}`, modelName: "tanque 500", capacityValue: "500", capacityUnit: "L", contactMaterial: "acero_inoxidable", provenanceClass: "manufacturer_specification" });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "equipment_model", entityId: m.id, operation: "create" } });
    expect(ev?.actorUserAccountId).toBe(jefeA);
  });
});

describe("editar y retirar", () => {
  it("editar deja el valor anterior en la auditoría", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `E ${RUN}`, modelName: "e1", recommendedMaintenanceDays: 90, provenanceClass: "original_record" });
    await editarModelo(jefeA, m.id, { manufacturer: `E ${RUN}`, modelName: "e1", recommendedMaintenanceDays: 120, provenanceClass: "original_record" });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment_model", entityId: m.id, operation: "update" } });
    expect((ev.before as { recommendedMaintenanceDays: number }).recommendedMaintenanceDays).toBe(90);
    expect((ev.after as { recommendedMaintenanceDays: number }).recommendedMaintenanceDays).toBe(120);
  });

  it("el jefe de A no edita un modelo de B ni uno compartido", async () => {
    const deB = await crearModelo(admin, { dueno: { tipo: "propio", locationId: sitioB }, kind: "instrument", manufacturer: `B ${RUN}`, modelName: "b1", provenanceClass: "original_record" });
    await expect(editarModelo(jefeA, deB.id, { manufacturer: `B ${RUN}`, modelName: "b1", provenanceClass: "original_record" })).rejects.toThrow();
  });

  it("retirar no borra: la fila sigue y deja de ofrecerse", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `R ${RUN}`, modelName: "r1", provenanceClass: "original_record" });
    await retirarModelo(jefeA, m.id, new Date());
    expect(await prisma.equipmentModel.findUnique({ where: { id: m.id } })).not.toBeNull();
    const elegibles = await modelosParaElegir(jefeA, orgA, "instrument");
    expect(elegibles.propios.map((x) => x.id)).not.toContain(m.id);
  });
});

describe("especificaciones", () => {
  it("se declaran, se retiran, y la ficha sólo muestra las vigentes", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "instrument", manufacturer: `S ${RUN}`, modelName: "s1", provenanceClass: "manufacturer_specification" });
    const bx = await declararEspecificacion(jefeA, m.id, { quantity: "sólidos solubles", unit: "°Bx", rangeMin: "0", rangeMax: "32", resolution: "0.1", accuracyAbs: "0.2" });
    await declararEspecificacion(jefeA, m.id, { quantity: "temperatura", unit: "°C", rangeMin: "10", rangeMax: "40" });
    await retirarEspecificacion(jefeA, bx.id, new Date());
    const ficha = await modeloParaFicha(jefeA, m.id);
    expect(ficha.specs.map((s) => s.quantity)).toEqual(["temperatura"]);
  });

  it("una especificación en un modelo de vaso se rechaza", async () => {
    const m = await crearModelo(jefeA, { dueno: { tipo: "propio", locationId: sitioA }, kind: "vessel", manufacturer: `V ${RUN}`, modelName: "v1", provenanceClass: "original_record" });
    await expect(declararEspecificacion(jefeA, m.id, { quantity: "x", unit: "y" })).rejects.toThrow(new ModeloError("especificacion_solo_en_instrumentos"));
  });
});

describe("listarModelos", () => {
  it("el operario ve los compartidos y los de su organización, no los de B", async () => {
    const lista = await listarModelos(operarioA);
    const todos = [...lista.compartidos, ...lista.propios];
    expect(todos.some((m) => m.organizationId === orgB)).toBe(false);
    expect(lista.propios.some((m) => m.organizationId === orgA)).toBe(true);
    expect(lista.compartidos.every((m) => m.organizationId === null)).toBe(true);
  });
});
