/**
 * La foto de la etiqueta del frasco — botiquín, Tarea 6.
 *
 * El `ANEXO_G` saca de la norma argentina (SENASA obliga a conservar los
 * troqueles o marbetes) su conclusión de diseño: «guardar foto de la etiqueta
 * como adjunto». Sigue el molde que `Asset` ya tiene —una columna opcional por
 * padre— y el de `lib/traceability/media.ts`: subida en dos pasos, y la
 * finalización exige que la clave empiece por la carpeta de ESE lote.
 *
 * Como `tests/traceability/media.test.ts`, se prueba la FINALIZACIÓN directamente:
 * el pedido de subida toca R2 de verdad y es una envoltura fina.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { finalizarFotoDeEtiqueta, EtiquetaError } from "../../lib/inventario/etiqueta";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `eti-${Date.now()}`;

let organizationId: string;
let bodega: string;
let otroSitio: string;
let gestorId: string;
let ajenoId: string;
let materialId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  const mk = async (n: string) =>
    (await prisma.location.create({ data: { name: `TEST ${n} (${RUN_ID})`, locationType: "site", classification: "internal", organizationId } })).id;
  bodega = await mk("Bodega");
  otroSitio = await mk("Otro");
  const cuenta = async (n: string, sitio: string | null) => {
    const ua = await prisma.userAccount.create({
      data: {
        person: { create: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es" } },
        authProvider: "credentials", status: "active",
      },
    });
    if (sitio) {
      const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Manager" } });
      const scope =
        (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: sitio } })) ??
        (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } }));
      await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: p.id, scopeId: scope.id } });
    }
    return ua.id;
  };
  gestorId = await cuenta("Gestor", bodega);
  ajenoId = await cuenta("Ajeno", otroSitio);
  const m = await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Apivar ${RUN_ID}`, defaultUnit: "tira", isVeterinaryMedicine: true });
  materialId = m.id;
}, 30000);

afterAll(async () => {
  const lotes = await prisma.consumableLot.findMany({ where: { materialId }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  const assets = await prisma.asset.findMany({ where: { consumableLotId: { in: ids } }, select: { id: true } });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityType: "asset", entityId: { in: assets.map((a) => a.id) } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableStockEvent.deleteMany({ where: assertDefinedWhere({ consumableLotId: { in: ids } }) });
  await prisma.consumableLot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId }) });
  const personas = await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } });
  const pid = personas.map((p) => p.id);
  const cuentas = await prisma.userAccount.findMany({ where: { personId: { in: pid } }, select: { id: true } });
  const cid = cuentas.map((c) => c.id);
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cid } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [bodega, otroSitio] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cid } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: pid } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [bodega, otroSitio] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

const fotoDe = (loteId: string) => ({
  storageKey: `nectar-originals/inventario/${loteId}/etiqueta.jpg`,
  mimeType: "image/jpeg", sizeBytes: 12345, originalFilename: "etiqueta.jpg",
  provenanceClass: "original_record" as const,
});

describe("la foto de la etiqueta", () => {
  it("una foto queda colgada del frasco y se lista con él", async () => {
    const l = await recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `A-${RUN_ID}`, quantity: 1, unit: "tira" });
    const a = await finalizarFotoDeEtiqueta(gestorId, { consumableLotId: l.id, ...fotoDe(l.id) });
    expect(a.consumableLotId).toBe(l.id);
    expect(a.assetType).toBe("photo");
    const del = await prisma.asset.findMany({ where: { consumableLotId: l.id } });
    expect(del.map((x) => x.id)).toContain(a.id);
  }, 20000);

  it("una clave de OTRO lote se rechaza — nadie cuelga en su frasco lo que subió otro", async () => {
    // El punto de seguridad del molde: sin esta comprobación, quien sepa la clave
    // de una subida ajena podría atribuírsela a su propio frasco.
    const l = await recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `B-${RUN_ID}`, quantity: 1, unit: "tira" });
    const otro = await recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `C-${RUN_ID}`, quantity: 1, unit: "tira" });
    await expect(finalizarFotoDeEtiqueta(gestorId, { consumableLotId: l.id, ...fotoDe(otro.id) }))
      .rejects.toThrow(/clave/);
  }, 20000);

  it("una clave de la carpeta de TRAZABILIDAD se rechaza aunque lleve el id", async () => {
    // Un prefijo parecido no basta: la carpeta del inventario es otra.
    const l = await recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `D-${RUN_ID}`, quantity: 1, unit: "tira" });
    await expect(finalizarFotoDeEtiqueta(gestorId, {
      consumableLotId: l.id, ...fotoDe(l.id), storageKey: `nectar-originals/traceability/${l.id}/x.jpg`,
    })).rejects.toThrow(/clave/);
  }, 20000);

  it("quien no atiende el sitio del frasco no puede colgarle nada — y el control positivo", async () => {
    const l = await recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `E-${RUN_ID}`, quantity: 1, unit: "tira" });
    await expect(finalizarFotoDeEtiqueta(ajenoId, { consumableLotId: l.id, ...fotoDe(l.id) }))
      .rejects.toThrow(EtiquetaError);
    await expect(finalizarFotoDeEtiqueta(gestorId, { consumableLotId: l.id, ...fotoDe(l.id) }))
      .resolves.toBeTruthy();
  }, 20000);

  it("la foto y su auditoría van en la misma transacción", async () => {
    const l = await recibirLote(gestorId, { locationId: bodega, materialId, batchLabel: `F-${RUN_ID}`, quantity: 1, unit: "tira" });
    const a = await finalizarFotoDeEtiqueta(gestorId, { consumableLotId: l.id, ...fotoDe(l.id) });
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "asset", entityId: a.id } });
    expect(ev?.operation).toBe("asset.create");
  }, 20000);
});
