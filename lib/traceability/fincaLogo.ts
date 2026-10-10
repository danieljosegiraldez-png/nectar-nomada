/**
 * Botones de finca y parcela (2026-09-21): el logotipo de una finca.
 *
 * Mismo viaje de dos pasos que `lib/traceability/landMedia.ts` (URL PUT firmada → el navegador
 * sube directo a R2 → sólo entonces se crea la fila `Asset`), y mismo `objectStorageProvider` —
 * pero **una función propia, sin tocar `landMedia.ts`**. Otra rama va a añadirle a
 * `finalizeLandAssetUpload` una comprobación de `creatorPersonId`; cruzar los dos cambios en el
 * mismo archivo era el riesgo que este archivo evita quedándose aparte. Lo que se reúsa son los
 * helpers de firma y almacenamiento (`objectStorageProvider`) y el permiso
 * (`requireLocationAttributeAccess`), no la función de `landMedia.ts`.
 *
 * El navegador reduce la imagen antes de subir (canvas → máx. 128×128 → WebP, PNG si el
 * navegador no produce WebP): el servidor sólo acepta esos dos formatos y rechaza lo demás o lo
 * que pase de `MAX_LOGO_BYTES`.
 *
 * Reemplazar el logotipo apunta `Location.logoAssetId` al Asset nuevo; el Asset viejo no se
 * borra — sigue en `core.asset`, simplemente deja de ser el logotipo. El cambio de columna y su
 * `AuditEvent` van en la misma transacción (los vigila `tests/arquitectura/audit-atomico.test.ts`).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { objectStorageProvider } from "../integrations/storage";
import { requireLocationAttributeAccess, puedeGestionarAtributosDeUbicacion, LocationAccessError } from "./locations";
import { UUID } from "../validation/uuid";

export class FincaLogoValidationError extends Error {}

/** Los dos únicos formatos que el navegador puede producir (spec: WebP con PNG de respaldo). */
const TIPOS_ACEPTADOS = ["image/webp", "image/png"] as const;
/** «que pasen de, digamos, 200 KB» — el encargo, tal cual. */
const MAX_LOGO_BYTES = 200 * 1024;

const prefijoDe = (siteId: string) => `nectar-originals/location-logo/${siteId}/`;

/** Misma pregunta que hace `finalizeFincaLogoUpload`, sin escribir — para que la pantalla decida si ofrece el enlace. */
export const puedeCambiarLogotipo = puedeGestionarAtributosDeUbicacion;

export interface RequestFincaLogoUploadInput {
  siteId: string;
  contentType: string;
}

export async function requestFincaLogoUpload(userAccountId: string, input: RequestFincaLogoUploadInput) {
  await requireLocationAttributeAccess(userAccountId, input.siteId);
  const sitio = await prisma.location.findUnique({
    where: { id: input.siteId },
    select: { locationType: true },
  });
  if (!sitio) throw new LocationAccessError("location_not_found");
  if (sitio.locationType !== "site") throw new FincaLogoValidationError("no_es_una_finca");
  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(input.contentType)) {
    throw new FincaLogoValidationError("tipo_no_soportado");
  }
  const ext = input.contentType === "image/png" ? "png" : "webp";
  const storageKey = `${prefijoDe(input.siteId)}${randomUUID()}.${ext}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

export interface FinalizeFincaLogoUploadInput {
  siteId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
}

export async function finalizeFincaLogoUpload(userAccountId: string, input: FinalizeFincaLogoUploadInput) {
  await requireLocationAttributeAccess(userAccountId, input.siteId);

  const sitio = await prisma.location.findUnique({
    where: { id: input.siteId },
    select: { id: true, locationType: true },
  });
  if (!sitio) throw new LocationAccessError("location_not_found");
  if (sitio.locationType !== "site") throw new FincaLogoValidationError("no_es_una_finca");

  if (!(TIPOS_ACEPTADOS as readonly string[]).includes(input.mimeType)) {
    throw new FincaLogoValidationError("tipo_no_soportado");
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    throw new FincaLogoValidationError("tamano_invalido");
  }
  if (input.sizeBytes > MAX_LOGO_BYTES) throw new FincaLogoValidationError("archivo_demasiado_grande");
  // La clave tiene que estar bajo el prefijo de ESTA finca — mismo guardia que
  // `finalizeLandAssetUpload`, para que nadie registre como suyo un objeto subido bajo otra.
  if (!input.storageKey.startsWith(prefijoDe(input.siteId))) {
    throw new FincaLogoValidationError("invalid_storage_key");
  }

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: "photo",
        storageKey: input.storageKey,
        storageBucket: "nectar-originals",
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: userAccount.personId,
        status: "approved",
        classification: "internal",
        createdBy: userAccountId,
        provenanceClass: "original_record",
        locationId: sitio.id,
      },
    });

    // El «antes» se lee DENTRO de la transacción y con la fila bloqueada: dos cambios a la vez
    // auditarían el mismo logotipo anterior si se leyera fuera (revisión de Codex, 2026-09-21).
    const [bloqueada] = await tx.$queryRaw<{ logo_asset_id: string | null }[]>`
      select logo_asset_id from core.location where id = ${sitio.id}::uuid for update`;
    const antes = { logoAssetId: bloqueada?.logo_asset_id ?? null };
    const location = await tx.location.update({
      where: { id: sitio.id },
      data: { logoAssetId: asset.id },
      select: { id: true, logoAssetId: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "location.set_logo",
        entityType: "location",
        entityId: location.id,
        before: antes,
        after: { logoAssetId: location.logoAssetId },
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return { asset, location };
  });
}

/** La URL firmada del logotipo de una finca, o `null` si no tiene. No autoriza —el llamador ya
 * obtuvo `logoAssetId` de una lectura que sí lo hizo, mismo molde que `listLandAssets`. */
export async function urlDelLogotipo(logoAssetId: string | null): Promise<string | null> {
  if (!logoAssetId) return null;
  const asset = await prisma.asset.findUnique({ where: { id: logoAssetId }, select: { storageKey: true } });
  if (!asset) return null;
  return objectStorageProvider.getSignedUrl(asset.storageKey);
}

/**
 * Lo que necesita la pantalla del logotipo: la finca, si existe, es una finca y quien mira puede
 * cambiarle el logotipo. `null` en cualquier otro caso — la página responde 404 sin distinguir.
 */
export async function fincaParaLogotipo(userAccountId: string, siteId: string): Promise<{ id: string; name: string } | null> {
  // El id llega de la URL, y esta consulta va antes que `requireLocationAttributeAccess`, así que la
  // guarda de ésa no la cubre. Sin forma de UUID, `P2007` y un 500 (PENDING_IMPLEMENTATIONS/026).
  if (!UUID.test(siteId)) return null;
  const sitio =await prisma.location.findUnique({ where: { id: siteId }, select: { id: true, name: true, locationType: true } });
  if (!sitio || sitio.locationType !== "site") return null;
  try {
    await requireLocationAttributeAccess(userAccountId, siteId);
  } catch (error) {
    if (error instanceof LocationAccessError) return null;
    throw error;
  }
  return { id: sitio.id, name: sitio.name };
}
