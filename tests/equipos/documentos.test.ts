import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Sin red: la URL firmada se sustituye por la clave. Va ANTES de importar el servicio.
vi.mock("../../lib/traceability/media", () => ({ getSignedUrlForAsset: async (k: string) => `url:${k}` }));

import { prisma } from "../../lib/db";
import { DocumentoError, confirmarSubidaDeDocumento, documentosDeEquipo } from "../../lib/equipos/documentos";
import { registrarEquipo, trasladarEquipo } from "../../lib/equipos/equipos";
import { CatalogoError } from "../../lib/catalogos/propiedad";
import { crearModelo } from "../../lib/equipos/modelos";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

let f: Fixtures;
let equipoA: string, otroEquipo: string, viajeroPropio: string, viajeroComp: string, modeloComp: string, modeloPropio: string;

const subir = (usuario: string, destino: object, clave: string) =>
  confirmarSubidaDeDocumento(usuario, {
    destino: destino as never,
    storageKey: clave,
    mimeType: "application/pdf",
    sizeBytes: 1234,
    originalFilename: "manual.pdf",
    provenanceClass: "manufacturer_specification",
  });

beforeAll(async () => {
  f = await montarFixtures("doc");
  modeloComp = (await crearModelo(f.admin, { dueno: { tipo: "compartido" }, kind: "instrument", manufacturer: `Doc ${f.run}`, modelName: "comp", provenanceClass: "manufacturer_specification" })).id;
  modeloPropio = (await crearModelo(f.jefeA, { dueno: { tipo: "propio", locationId: f.sitioA }, kind: "instrument", manufacturer: `Doc ${f.run}`, modelName: "propio", provenanceClass: "manufacturer_specification" })).id;
  const alta = (modelId: string | null) =>
    registrarEquipo(f.jefeA, { name: `TEST eq ${f.run} ${Math.random()}`, kind: "instrument", organizationId: f.orgA, initialLocationId: f.sitioA, provenanceClass: "original_record", modelId });
  equipoA = (await alta(modeloComp)).id;
  otroEquipo = (await alta(null)).id;
  viajeroPropio = (await alta(modeloPropio)).id;
  viajeroComp = (await alta(modeloComp)).id;
});

afterAll(async () => {
  await prisma.asset.deleteMany({ where: { OR: [{ equipmentId: { in: [equipoA, otroEquipo, viajeroPropio, viajeroComp] } }, { equipmentModelId: { in: [modeloComp, modeloPropio] } }] } });
  await prisma.equipmentTransfer.deleteMany({ where: { equipmentId: { in: [equipoA, otroEquipo, viajeroPropio, viajeroComp] } } });
  await prisma.equipment.deleteMany({ where: { id: { in: [equipoA, otroEquipo, viajeroPropio, viajeroComp] } } });
  await prisma.equipmentModel.deleteMany({ where: { id: { in: [modeloComp, modeloPropio] } } });
  await f.limpiar();
});

describe("confirmarSubidaDeDocumento", () => {
  it("el jefe adjunta al equipo: Asset con su FK y su procedencia, y AuditEvent", async () => {
    const a = await subir(f.jefeA, { tipo: "equipo", equipmentId: equipoA }, `nectar-originals/equipos/${equipoA}/cert.pdf`);
    const fila = await prisma.asset.findUniqueOrThrow({ where: { id: a.id } });
    expect(fila.equipmentId).toBe(equipoA);
    expect(fila.provenanceClass).toBe("manufacturer_specification");
    expect(await prisma.auditEvent.count({ where: { entityType: "asset", entityId: a.id } })).toBe(1);
  });
  it("una clave de otro equipo se rechaza", async () => {
    await expect(subir(f.jefeA, { tipo: "equipo", equipmentId: equipoA }, `nectar-originals/equipos/${otroEquipo}/x.pdf`)).rejects.toThrow(
      new DocumentoError("clave_invalida"),
    );
  });
  it("el operario no adjunta (gestión)", async () => {
    await expect(subir(f.operarioA, { tipo: "equipo", equipmentId: equipoA }, `nectar-originals/equipos/${equipoA}/y.pdf`)).rejects.toThrow(
      new DocumentoError("forbidden"),
    );
  });
  it("al modelo compartido sólo con plataforma; al propio, el jefe de su organización", async () => {
    await expect(subir(f.jefeA, { tipo: "modelo", modelId: modeloComp }, `nectar-originals/equipos/modelos/${modeloComp}/m.pdf`)).rejects.toThrow(
      new CatalogoError("forbidden"),
    );
    await subir(f.admin, { tipo: "modelo", modelId: modeloComp }, `nectar-originals/equipos/modelos/${modeloComp}/m.pdf`);
    await subir(f.jefeA, { tipo: "modelo", modelId: modeloPropio }, `nectar-originals/equipos/modelos/${modeloPropio}/p.pdf`);
  });
});

describe("documentosDeEquipo", () => {
  it("separa los del equipo de los heredados del modelo", async () => {
    const docs = await documentosDeEquipo(f.operarioA, equipoA);
    expect(docs.propios.map((d) => d.url)).toContain(`url:nectar-originals/equipos/${equipoA}/cert.pdf`);
    expect(docs.delModelo.map((d) => d.url)).toContain(`url:nectar-originals/equipos/modelos/${modeloComp}/m.pdf`);
    expect(docs.propios.some((d) => d.url.includes("/modelos/"))).toBe(false);
  });

  it("un equipo trasladado a un sitio de OTRA organización no enseña ahí los documentos del modelo propio", async () => {
    const docPropio = `url:nectar-originals/equipos/modelos/${modeloPropio}/p.pdf`;
    const docComp = `url:nectar-originals/equipos/modelos/${modeloComp}/m.pdf`;
    // Control positivo: en su sitio de origen, el operario de A SÍ los ve.
    expect((await documentosDeEquipo(f.operarioA, viajeroPropio)).delModelo.map((d) => d.url)).toContain(docPropio);

    for (const id of [viajeroPropio, viajeroComp]) {
      await trasladarEquipo(f.jefeA, { equipmentId: id, fromLocationId: f.sitioA, toLocationId: f.sitioB, occurredAt: new Date() });
    }
    // El operario de B ve el equipo (está en su sitio), pero no el catálogo de A.
    const enB = await documentosDeEquipo(f.operarioB, viajeroPropio);
    expect(enB.delModelo.map((d) => d.url)).not.toContain(docPropio);
    expect(enB.delModelo).toEqual([]);
    // Lo compartido sí viaja: el mismo operario ve el manual del modelo compartido.
    expect((await documentosDeEquipo(f.operarioB, viajeroComp)).delModelo.map((d) => d.url)).toContain(docComp);
  });
});
