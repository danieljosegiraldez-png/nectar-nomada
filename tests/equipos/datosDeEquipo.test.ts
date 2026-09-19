import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { EquipoError, editarDatosDeEquipo, puedeSobreEquipo, registrarEquipo } from "../../lib/equipos/equipos";
import { crearModelo, retirarModelo } from "../../lib/equipos/modelos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let modeloComp: string, modeloDeB: string, modeloVaso: string, modeloRetirado: string;
let proveedor: string;

const alta = (extra: Record<string, unknown> = {}) =>
  registrarEquipo(f.jefeA, {
    name: `TEST eq ${f.run} ${Math.random()}`,
    kind: "instrument",
    organizationId: f.orgA,
    initialLocationId: f.sitioA,
    provenanceClass: "original_record",
    ...extra,
  });

beforeAll(async () => {
  f = await montarFixtures("dat");
  const m = (dueno: object, kind: "instrument" | "vessel", nombre: string) =>
    crearModelo(f.admin, { dueno: dueno as never, kind, manufacturer: `D ${f.run}`, modelName: nombre, provenanceClass: "manufacturer_specification" });
  modeloComp = (await m({ tipo: "compartido" }, "instrument", "comp")).id;
  modeloDeB = (await m({ tipo: "propio", locationId: f.sitioB }, "instrument", "deB")).id;
  modeloVaso = (await m({ tipo: "propio", locationId: f.sitioA }, "vessel", "vaso")).id;
  modeloRetirado = (await m({ tipo: "propio", locationId: f.sitioA }, "instrument", "retirado")).id;
  await retirarModelo(f.admin, modeloRetirado, new Date());
  proveedor = (
    await prisma.organization.create({
      data: { organizationType: "supplier", name: `TEST proveedor ${f.run}`, status: "approved", classification: "internal" },
    })
  ).id;
});

afterAll(async () => {
  const eqs = await prisma.equipment.findMany({ where: { organizationId: f.orgA }, select: { id: true } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: eqs.map((e) => e.id) } } });
  await prisma.equipment.deleteMany({ where: { organizationId: f.orgA } });
  await prisma.equipmentModel.deleteMany({ where: { manufacturer: `D ${f.run}` } });
  await prisma.organization.delete({ where: { id: proveedor } });
  await f.limpiar();
});

describe("registrarEquipo con los datos nuevos", () => {
  it("guarda modelo compartido, serie, código y garantía como día", async () => {
    const e = await alta({ modelId: modeloComp, serialNumber: " SN-1 ", internalCode: `REF-${f.run}`, warrantyUntil: new Date("2027-03-01T00:00:00Z") });
    const fila = await prisma.equipment.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila.modelId).toBe(modeloComp);
    expect(fila.serialNumber).toBe("SN-1");
    expect(fila.warrantyUntil?.toISOString()).toBe("2027-03-01T00:00:00.000Z");
  });
  it("rechaza, con frase legible, un modelo de otra organización, de otro tipo o retirado", async () => {
    await expect(alta({ modelId: modeloDeB })).rejects.toThrow(new EquipoError("modelo_no_elegible"));
    await expect(alta({ modelId: modeloVaso })).rejects.toThrow(new EquipoError("modelo_de_otro_tipo"));
    await expect(alta({ modelId: modeloRetirado })).rejects.toThrow(new EquipoError("modelo_retirado"));
  });
  it("código interno repetido en la organización, con otras mayúsculas", async () => {
    await alta({ internalCode: `DUP-${f.run}` });
    await expect(alta({ internalCode: ` dup-${f.run}` })).rejects.toThrow(new EquipoError("codigo_interno_duplicado"));
  });
});

describe("editarDatosDeEquipo", () => {
  it("deja el antes y el después en la auditoría", async () => {
    const e = await alta({ serialNumber: "A" });
    await editarDatosDeEquipo(f.jefeA, e.id, { serialNumber: "B" });
    const ev = await prisma.auditEvent.findFirstOrThrow({ where: { entityType: "equipment", entityId: e.id, operation: "update_datos" } });
    expect((ev.before as { serialNumber: string }).serialNumber).toBe("A");
    expect((ev.after as { serialNumber: string }).serialNumber).toBe("B");
  });
  it("un equipo cuyo modelo se retiró después conserva el modelo al editar otro dato", async () => {
    const propio = (
      await crearModelo(f.jefeA, { dueno: { tipo: "propio", locationId: f.sitioA }, kind: "instrument", manufacturer: `D ${f.run}`, modelName: "se-retira", provenanceClass: "manufacturer_specification" })
    ).id;
    const e = await alta({ modelId: propio, serialNumber: "S1" });
    await retirarModelo(f.jefeA, propio, new Date());
    // El formulario reenvía el modelo actual tal cual: no es elegirlo de nuevo.
    await editarDatosDeEquipo(f.jefeA, e.id, { modelId: propio, serialNumber: "S2" });
    const fila = await prisma.equipment.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila.modelId).toBe(propio);
    expect(fila.serialNumber).toBe("S2");
    // Control: CAMBIAR a un modelo retirado sigue rechazado.
    const otro = await alta({ serialNumber: "S3" });
    await expect(editarDatosDeEquipo(f.jefeA, otro.id, { modelId: propio })).rejects.toThrow(new EquipoError("modelo_retirado"));
  });
  it("el operario no edita los datos (gestión)", async () => {
    const e = await alta();
    await expect(editarDatosDeEquipo(f.operarioA, e.id, { serialNumber: "X" })).rejects.toThrow();
  });
  it("editar un solo dato no borra los demás; un null explícito sí borra", async () => {
    const e = await alta({
      modelId: modeloComp,
      serialNumber: "S1",
      internalCode: `KEEP-${f.run}`,
      supplierOrganizationId: proveedor,
      warrantyUntil: new Date("2027-01-01T00:00:00Z"),
    });
    await editarDatosDeEquipo(f.jefeA, e.id, { serialNumber: "S2" });
    const fila = await prisma.equipment.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila.serialNumber).toBe("S2");
    expect(fila.modelId).toBe(modeloComp);
    expect(fila.internalCode).toBe(`KEEP-${f.run}`);
    expect(fila.supplierOrganizationId).toBe(proveedor);
    expect(fila.warrantyUntil?.toISOString()).toBe("2027-01-01T00:00:00.000Z");

    await editarDatosDeEquipo(f.jefeA, e.id, { warrantyUntil: null });
    const fila2 = await prisma.equipment.findUniqueOrThrow({ where: { id: e.id } });
    expect(fila2.warrantyUntil).toBeNull();
    expect(fila2.serialNumber).toBe("S2");
    expect(fila2.supplierOrganizationId).toBe(proveedor);
  });
});

describe("puedeSobreEquipo", () => {
  it("el operario informa pero no gestiona; el ajeno, nada", async () => {
    const e = await alta();
    expect(await puedeSobreEquipo(f.operarioA, e.id, "report_condition")).toBe(true);
    expect(await puedeSobreEquipo(f.operarioA, e.id, "manage")).toBe(false);
    expect(await puedeSobreEquipo(f.ajeno, e.id, "view")).toBe(false);
  });
});
