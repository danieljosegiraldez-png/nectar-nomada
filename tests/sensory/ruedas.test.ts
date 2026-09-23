import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { listarRuedasSensoriales, obtenerRuedaSensorial, RuedaSensorialNoEncontrada } from "../../lib/sensory/ruedas";

let wheelId: string;
let versionId: string;
let familyId: string;
let descriptorId: string;
let nextVersionId: string;

beforeAll(async () => {
  const wheel = await prisma.sensoryWheel.create({ data: { domain: "cider", title: "TEST Cider wheel" } });
  wheelId = wheel.id;
  const version = await prisma.sensoryWheelVersion.create({ data: {
    wheelId, version: 991, sourceAuthor: "TEST Author", sourceReference: "https://example.test/source", license: "TEST only",
  } });
  versionId = version.id;
  const family = await prisma.sensoryWheelNode.create({ data: {
    versionId, key: "fruit", level: "family", termOriginal: "Fruit", displayOrder: 1,
  } });
  familyId = family.id;
  const descriptor = await prisma.sensoryWheelNode.create({ data: {
    versionId, key: "apple", level: "descriptor", parentId: family.id, parentLevel: "family", termOriginal: "Apple", displayOrder: 2,
  } });
  descriptorId = descriptor.id;
});

afterAll(async () => {
  if (!wheelId) return;
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
    await tx.sensoryWheelReference.deleteMany({ where: { node: { version: { wheelId } } } });
    await tx.sensoryWheelNodeDetail.deleteMany({ where: { node: { version: { wheelId } } } });
    await tx.sensoryWheelNode.deleteMany({ where: { version: { wheelId } } });
    await tx.sensoryWheelVersion.deleteMany({ where: { wheelId } });
    await tx.sensoryWheel.delete({ where: { id: wheelId } });
  });
});

describe("ruedas sensoriales versionadas", () => {
  it("rechaza una jerarquía cuyo nivel no corresponde al padre", async () => {
    await expect(prisma.sensoryWheelNode.create({ data: {
      versionId, key: "wrong", level: "subfamily", parentId: descriptorId, parentLevel: "descriptor", termOriginal: "Wrong", displayOrder: 2,
    } })).rejects.toThrow();
  });

  it("rechaza un padre que pertenece a otra versión", async () => {
    const siguiente = await prisma.sensoryWheelVersion.create({ data: {
      wheelId, version: 992, sourceAuthor: "TEST Author 2", sourceReference: "https://example.test/source-2", license: "TEST only",
    } });
    nextVersionId = siguiente.id;
    await expect(prisma.sensoryWheelNode.create({ data: {
      versionId: siguiente.id, key: "foreign-apple", level: "descriptor", parentId: familyId, parentLevel: "family", termOriginal: "Foreign apple", displayOrder: 1,
    } })).rejects.toThrow();
  });

  it("no deja cambiar el nivel de un padre que ya tiene hijos", async () => {
    await expect(prisma.sensoryWheelNode.update({ where: { id: familyId }, data: { level: "subfamily" } })).rejects.toThrow();
  });

  it("no deja hacer pública una rueda sin edición publicada", async () => {
    await expect(prisma.sensoryWheel.update({ where: { id: wheelId }, data: { isPublic: true } })).rejects.toThrow(/version publicada/);
  });

  it("una edición publicada queda congelada", async () => {
    await prisma.sensoryWheelVersion.update({ where: { id: versionId }, data: { status: "published" } });
    await expect(prisma.sensoryWheelNode.update({ where: { id: familyId }, data: { termOriginal: "Changed" } })).rejects.toThrow(/no se modifica/);
    await expect(prisma.sensoryWheelVersion.update({ where: { id: versionId }, data: { license: "changed" } })).rejects.toThrow(/congelada/);
  });

  it("el público sólo ve la rueda después de encenderla", async () => {
    await expect(obtenerRuedaSensorial("cider")).rejects.toBeInstanceOf(RuedaSensorialNoEncontrada);
    await prisma.sensoryWheel.update({ where: { id: wheelId }, data: { isPublic: true } });
    const lista = await listarRuedasSensoriales();
    expect(lista.some((wheel) => wheel.id === wheelId)).toBe(true);
    const wheel = await obtenerRuedaSensorial("cider");
    expect(wheel.version.nodes.map((node) => node.termOriginal)).toEqual(["Fruit", "Apple"]);
  });

  it("sólo admite una edición publicada y la sustituye atómicamente", async () => {
    await expect(prisma.sensoryWheelVersion.update({ where: { id: nextVersionId }, data: { status: "published" } })).rejects.toThrow();
    await prisma.sensoryWheelNode.create({ data: {
      versionId: nextVersionId, key: "fresh", level: "family", termOriginal: "Fresh", displayOrder: 1,
    } });
    await prisma.$transaction([
      prisma.sensoryWheelVersion.update({ where: { id: versionId }, data: { status: "superseded" } }),
      prisma.sensoryWheelVersion.update({ where: { id: nextVersionId }, data: { status: "published" } }),
    ]);
    const publicadas = await prisma.sensoryWheelVersion.findMany({ where: { wheelId, status: "published" } });
    expect(publicadas.map((version) => version.id)).toEqual([nextVersionId]);
    const wheel = await obtenerRuedaSensorial("cider");
    expect(wheel.version.nodes.map((node) => node.termOriginal)).toEqual(["Fresh"]);
  });
});
