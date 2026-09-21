/**
 * Botones de finca y parcela (2026-09-21): el logotipo de una finca.
 *
 * `requestFincaLogoUpload` llama al adaptador real de R2 (`putObject`), y no hay credenciales de
 * R2 en ningún entorno de prueba garantizado — mismo problema que documenta la cabecera de
 * `tests/traceability/landMedia.test.ts`. Se espía `objectStorageProvider.putObject` en vez de
 * depender de que falten las credenciales (en un Mac con `.env` pueden estar).
 *
 * Grupo `base-sembrada`: toca la base.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import { objectStorageProvider } from "../../lib/integrations/storage";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  FincaLogoValidationError,
  finalizeFincaLogoUpload,
  requestFincaLogoUpload,
} from "../../lib/traceability/fincaLogo";
import { crearFinca, crearParcela, crearUsuarioConAcceso, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const sitios: string[] = [];
const cuentas: string[] = [];
const personas: string[] = [];
const scopes: string[] = [];
const organizaciones: string[] = [];
const assetIds: string[] = [];

afterAll(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: sitios } }) });
  await prisma.location.updateMany({ where: assertDefinedWhere({ id: { in: sitios } }), data: { logoAssetId: null } });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: sitios } }) });
  const orgs = await prisma.organization.findMany({ where: { locations: { none: {} } }, select: { id: true } });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones.filter((o) => orgs.some((x) => x.id === o)) } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
}, 30000);

async function finca() {
  const f = await crearFinca();
  sitios.push(f.id);
  organizaciones.push(f.organizationId!);
  return f;
}

async function conAcceso() {
  const u = await crearUsuarioConAcceso();
  cuentas.push(u.userAccountId);
  personas.push(u.personId);
  scopes.push(u.scopeId);
  return u;
}

describe("requestFincaLogoUpload", () => {
  it("con permiso, firma un PUT bajo el prefijo de esa finca, con la clave del contentType", async () => {
    const f = await finca();
    const u = await conAcceso();
    const firmar = vi.spyOn(objectStorageProvider, "putObject").mockResolvedValue({ uploadUrl: "https://firmada.test/put" });
    try {
      const { uploadUrl, storageKey } = await requestFincaLogoUpload(u.userAccountId, { siteId: f.id, contentType: "image/webp" });
      expect(uploadUrl).toBe("https://firmada.test/put");
      expect(storageKey).toMatch(new RegExp(`^nectar-originals/location-logo/${f.id}/.+\\.webp$`));
      expect(firmar).toHaveBeenCalledWith({ key: storageKey, contentType: "image/webp" });
    } finally {
      firmar.mockRestore();
    }
  }, 20000);

  it("un tipo que no sea WebP ni PNG se rechaza antes de firmar nada", async () => {
    const f = await finca();
    const u = await conAcceso();
    const firmar = vi.spyOn(objectStorageProvider, "putObject").mockResolvedValue({ uploadUrl: "https://firmada.test/put" });
    try {
      await expect(requestFincaLogoUpload(u.userAccountId, { siteId: f.id, contentType: "image/gif" })).rejects.toThrow(/tipo_no_soportado/);
      expect(firmar).not.toHaveBeenCalled();
    } finally {
      firmar.mockRestore();
    }
  }, 20000);

  it("sin permiso, se rechaza antes de firmar nada", async () => {
    const f = await finca();
    const sinAcceso = await crearUsuarioSinAcceso();
    cuentas.push(sinAcceso.userAccountId);
    personas.push(sinAcceso.personId);
    scopes.push(sinAcceso.scopeId);
    const firmar = vi.spyOn(objectStorageProvider, "putObject").mockResolvedValue({ uploadUrl: "https://firmada.test/put" });
    try {
      await expect(
        requestFincaLogoUpload(sinAcceso.userAccountId, { siteId: f.id, contentType: "image/webp" }),
      ).rejects.toThrow(LocationAccessError);
      expect(firmar).not.toHaveBeenCalled();
    } finally {
      firmar.mockRestore();
    }
  }, 20000);

  it("una parcela no puede obtener una subida firmada como si fuera una finca", async () => {
    const f = await finca();
    const parcela = await crearParcela(f);
    sitios.push(parcela.id);
    const u = await conAcceso();
    const firmar = vi.spyOn(objectStorageProvider, "putObject").mockResolvedValue({ uploadUrl: "https://firmada.test/put" });
    try {
      await expect(
        requestFincaLogoUpload(u.userAccountId, { siteId: parcela.id, contentType: "image/webp" }),
      ).rejects.toThrow(/no_es_una_finca/);
      expect(firmar).not.toHaveBeenCalled();
    } finally {
      firmar.mockRestore();
    }
  }, 20000);
});

describe("finalizeFincaLogoUpload", () => {
  it("con permiso, actualiza Location.logoAssetId y escribe el AuditEvent en la misma transacción", async () => {
    const f = await finca();
    const u = await conAcceso();
    const storageKey = `nectar-originals/location-logo/${f.id}/uno.webp`;
    const { asset, location } = await finalizeFincaLogoUpload(u.userAccountId, {
      siteId: f.id,
      storageKey,
      mimeType: "image/webp",
      sizeBytes: 5000,
      originalFilename: "logo.webp",
    });
    assetIds.push(asset.id);
    expect(location.logoAssetId).toBe(asset.id);

    const enBase = await prisma.location.findUniqueOrThrow({ where: { id: f.id }, select: { logoAssetId: true } });
    expect(enBase.logoAssetId).toBe(asset.id);

    const evento = await prisma.auditEvent.findFirst({ where: { entityId: f.id, operation: "location.set_logo" } });
    expect(evento).not.toBeNull();
    expect(evento?.after).toMatchObject({ logoAssetId: asset.id });
    expect(evento?.before).toMatchObject({ logoAssetId: null });
  }, 20000);

  it("sin permiso se deniega, y la columna no cambia", async () => {
    const f = await finca();
    const sinAcceso = await crearUsuarioSinAcceso();
    cuentas.push(sinAcceso.userAccountId);
    personas.push(sinAcceso.personId);
    scopes.push(sinAcceso.scopeId);
    const storageKey = `nectar-originals/location-logo/${f.id}/rechazado.webp`;

    await expect(
      finalizeFincaLogoUpload(sinAcceso.userAccountId, {
        siteId: f.id,
        storageKey,
        mimeType: "image/webp",
        sizeBytes: 5000,
        originalFilename: "logo.webp",
      }),
    ).rejects.toThrow(LocationAccessError);

    const enBase = await prisma.location.findUniqueOrThrow({ where: { id: f.id }, select: { logoAssetId: true } });
    expect(enBase.logoAssetId).toBeNull();
    expect(await prisma.asset.count({ where: { storageKey } })).toBe(0);
  }, 20000);

  it("reemplazar el logotipo apunta al Asset nuevo; el Asset anterior se conserva", async () => {
    const f = await finca();
    const u = await conAcceso();
    const primero = await finalizeFincaLogoUpload(u.userAccountId, {
      siteId: f.id,
      storageKey: `nectar-originals/location-logo/${f.id}/primero.webp`,
      mimeType: "image/webp",
      sizeBytes: 4000,
      originalFilename: "primero.webp",
    });
    assetIds.push(primero.asset.id);

    const segundo = await finalizeFincaLogoUpload(u.userAccountId, {
      siteId: f.id,
      storageKey: `nectar-originals/location-logo/${f.id}/segundo.webp`,
      mimeType: "image/webp",
      sizeBytes: 4500,
      originalFilename: "segundo.webp",
    });
    assetIds.push(segundo.asset.id);

    expect(segundo.location.logoAssetId).toBe(segundo.asset.id);
    // El Asset viejo no se borra: sigue en la base, aunque ya no sea el logotipo.
    expect(await prisma.asset.findUnique({ where: { id: primero.asset.id } })).not.toBeNull();

    const evento = await prisma.auditEvent.findFirst({
      where: { entityId: f.id, operation: "location.set_logo", after: { path: ["logoAssetId"], equals: segundo.asset.id } },
    });
    expect(evento?.before).toMatchObject({ logoAssetId: primero.asset.id });
  }, 20000);

  it("un archivo que no es imagen, o que pasa de 200 KB, se rechaza sin crear el Asset", async () => {
    const f = await finca();
    const u = await conAcceso();

    await expect(
      finalizeFincaLogoUpload(u.userAccountId, {
        siteId: f.id,
        storageKey: `nectar-originals/location-logo/${f.id}/no-imagen.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 5000,
        originalFilename: "no-imagen.pdf",
      }),
    ).rejects.toThrow(FincaLogoValidationError);

    await expect(
      finalizeFincaLogoUpload(u.userAccountId, {
        siteId: f.id,
        storageKey: `nectar-originals/location-logo/${f.id}/grande.webp`,
        mimeType: "image/webp",
        sizeBytes: 200 * 1024 + 1,
        originalFilename: "grande.webp",
      }),
    ).rejects.toThrow(FincaLogoValidationError);

    expect(await prisma.asset.count({ where: { locationId: f.id } })).toBe(0);
    const enBase = await prisma.location.findUniqueOrThrow({ where: { id: f.id }, select: { logoAssetId: true } });
    expect(enBase.logoAssetId).toBeNull();
  }, 20000);

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    "rechaza un tamaño inválido (%s) sin crear el Asset",
    async (sizeBytes) => {
      const f = await finca();
      const u = await conAcceso();
      await expect(
        finalizeFincaLogoUpload(u.userAccountId, {
          siteId: f.id,
          storageKey: `nectar-originals/location-logo/${f.id}/tamano-invalido.webp`,
          mimeType: "image/webp",
          sizeBytes,
          originalFilename: "tamano-invalido.webp",
        }),
      ).rejects.toThrow(/tamano_invalido/);
      expect(await prisma.asset.count({ where: { locationId: f.id } })).toBe(0);
    },
    20000,
  );

  it("una storageKey fuera del prefijo de esta finca se rechaza", async () => {
    const f = await finca();
    const otra = await finca();
    const u = await conAcceso();
    await expect(
      finalizeFincaLogoUpload(u.userAccountId, {
        siteId: f.id,
        storageKey: `nectar-originals/location-logo/${otra.id}/ajeno.webp`,
        mimeType: "image/webp",
        sizeBytes: 4000,
        originalFilename: "ajeno.webp",
      }),
    ).rejects.toThrow(FincaLogoValidationError);
  }, 20000);
});
