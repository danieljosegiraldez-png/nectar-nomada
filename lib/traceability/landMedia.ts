/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2). Fotografía de la
 * tierra: del bloque, del retorte de biochar y del perfil de una calicata.
 *
 * **Por qué no se reusa `media.ts`.** Aquél exige un `lotId` en cada llamada
 * —«always carry lotId for scoping»— y se gatea con `lot:manage`. Un lote de
 * biochar y una calicata no cuelgan de ningún lote de café: su ámbito es la
 * Location, y su permiso `location:manage_attributes`, el mismo con el que se
 * registraron. Forzarlos por el camino del café habría exigido inventar un Lot
 * de mentira o relajar el permiso.
 *
 * Mismo viaje de dos pasos y mismo `objectStorageProvider`: se pide una URL PUT
 * firmada, el navegador sube el archivo directo a R2, y sólo entonces se crea
 * la fila `Asset`. Un fallo a mitad no deja un `Asset` apuntando a nada.
 *
 * El marco pide fotografía en dos sitios y sólo dos: el Paso 2 («fotografiar el
 * retorte y el proceso») y el Paso 4 («fotografiar cada perfil con una
 * escala»). La foto general de un bloque cabe en `Asset.locationId`, que existe
 * desde el principio.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import { recordAuditEvent } from "../audit";
import type { ClassificationLevel, ProvenanceClass } from "../../generated/prisma/client";

export class LandMediaValidationError extends Error {}

const BUCKET = "nectar-originals";
const DEFAULT_CLASSIFICATION: ClassificationLevel = "internal";

/** El prefijo bajo el que vive todo lo de un bloque. */
const prefijoDe = (locationId: string) => `nectar-originals/land/${locationId}/`;

export type LandAssetParent =
  | { kind: "location" }
  | { kind: "biocharBatch"; biocharBatchId: string }
  | { kind: "soilProfile"; soilProfileId: string };

export interface RequestLandAssetUploadInput {
  locationId: string;
  originalFilename: string;
  contentType: string;
}

export async function requestLandAssetUpload(userAccountId: string, input: RequestLandAssetUploadInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);

  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `${prefijoDe(input.locationId)}${randomUUID()}${ext ? `.${ext}` : ""}`;

  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

export interface FinalizeLandAssetUploadInput {
  locationId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  parent: LandAssetParent;
  // ADR-038 — requerido, sin default: una fotografía de campo es evidencia
  // original igual que una lectura.
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  creatorPersonId?: string | null;
}

/**
 * **La comprobación que de verdad importa está aquí abajo.**
 *
 * El `locationId` que llega es el que se autoriza, y el padre llega aparte. Sin
 * comprobar que el padre PERTENECE a esa Location, alguien con acceso al bloque
 * A podría colgar una foto del perfil de suelo del bloque B mandando el id de A
 * en la casilla del ámbito: la autorización pasaría —tiene acceso a A— y la
 * fila aterrizaría en B. Es la clase de agujero que no se ve leyendo el
 * formulario, porque el formulario nunca manda esa combinación.
 */
async function exigirPadreDeEsaLocation(parent: LandAssetParent, locationId: string) {
  if (parent.kind === "biocharBatch") {
    const lote = await prisma.biocharBatch.findUnique({
      where: { id: parent.biocharBatchId },
      select: { producedAtLocationId: true },
    });
    if (!lote) throw new LocationAccessError("biochar_batch_not_found");
    if (lote.producedAtLocationId !== locationId) {
      throw new LandMediaValidationError("parent_belongs_to_another_location");
    }
    return { biocharBatchId: parent.biocharBatchId };
  }
  if (parent.kind === "soilProfile") {
    const perfil = await prisma.soilProfile.findUnique({
      where: { id: parent.soilProfileId },
      select: { locationId: true },
    });
    if (!perfil) throw new LocationAccessError("soil_profile_not_found");
    if (perfil.locationId !== locationId) {
      throw new LandMediaValidationError("parent_belongs_to_another_location");
    }
    return { soilProfileId: parent.soilProfileId };
  }
  return {};
}

export async function finalizeLandAssetUpload(userAccountId: string, input: FinalizeLandAssetUploadInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);

  // La clave tiene que estar bajo el prefijo de ESTE bloque. Sin esto, un
  // llamador podría registrar como suyo un objeto subido bajo otro bloque.
  if (!input.storageKey.startsWith(prefijoDe(input.locationId))) {
    throw new LandMediaValidationError("invalid_storage_key");
  }

  const padre = await exigirPadreDeEsaLocation(input.parent, input.locationId);

  const userAccount = await prisma.userAccount.findUniqueOrThrow({
    where: { id: userAccountId },
    select: { personId: true },
  });

  // Fila y auditoría en la misma transacción: una fotografía guardada sin su
  // audit es peor que ninguna.
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: input.mimeType.startsWith("image/")
          ? "photo"
          : input.mimeType.startsWith("video/")
            ? "video"
            : "document",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: input.creatorPersonId ?? userAccount.personId,
        status: "approved",
        classification: DEFAULT_CLASSIFICATION,
        createdBy: userAccountId,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        // Siempre, sea cual sea el padre: es el ámbito con el que se autorizó y
        // por el que se lista. El padre específico lo añade `padre`.
        locationId: input.locationId,
        ...padre,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "asset.create",
        entityType: "asset",
        entityId: asset.id,
        after: asset,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return asset;
  });
}

/**
 * Las fotografías de un bloque, agrupadas por a qué cuelgan.
 *
 * Las URL firmadas se piden aquí y no en la página: son de vida corta, y
 * pedirlas al construir la página es lo que hace que caduquen antes de que
 * nadie las mire si se cachean. La página no toca el proveedor.
 */
export async function listLandAssets(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  const assets = await prisma.asset.findMany({
    where: { locationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      storageKey: true,
      mimeType: true,
      originalFilename: true,
      createdAt: true,
      biocharBatchId: true,
      soilProfileId: true,
    },
  });
  return Promise.all(
    assets.map(async (a) => ({ ...a, url: await objectStorageProvider.getSignedUrl(a.storageKey) })),
  );
}
