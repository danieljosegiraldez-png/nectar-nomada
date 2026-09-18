/**
 * La foto de la etiqueta del frasco — botiquín, Tarea 6.
 *
 * El `ANEXO_G` saca de la norma argentina (SENASA obliga a conservar los
 * troqueles o marbetes) su conclusión de diseño: «guardar foto de la etiqueta
 * como adjunto». Es el molde de `lib/traceability/media.ts`: subida en dos
 * pasos —URL firmada, y la fila `Asset` sólo cuando el navegador confirma—, con
 * su propia carpeta y su propia columna padre (`Asset.consumableLotId`).
 *
 * Permiso: `lot:manage` en el sitio del frasco, lo mismo que recibirlo. Fotografiar
 * la etiqueta es parte de la recepción, no gestión.
 *
 * Spec: docs/superpowers/specs/2026-09-17-faena-de-colmena-y-botiquin-design.md §B
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { objectStorageProvider } from "../integrations/storage";
import type { ProvenanceClass } from "../../generated/prisma/client";

const BUCKET = "nectar-originals";

export class EtiquetaError extends Error {}

/** La carpeta de ESE frasco. La barra final importa: sin ella, un id que empiece igual pasaría. */
const carpetaDe = (consumableLotId: string) => `nectar-originals/inventario/${consumableLotId}/`;

async function exigirPermiso(userAccountId: string, consumableLotId: string) {
  const lote = await prisma.consumableLot.findUnique({ where: { id: consumableLotId }, select: { locationId: true } });
  if (!lote) throw new EtiquetaError("frasco no encontrado");
  const objetivo = lote.locationId
    ? ({ scopeType: "location", scopeRefId: lote.locationId } as const)
    : ({ scopeType: "platform", scopeRefId: null } as const);
  if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) {
    throw new EtiquetaError("forbidden");
  }
}

export async function pedirSubidaDeEtiqueta(
  userAccountId: string,
  input: { consumableLotId: string; originalFilename: string; contentType: string },
) {
  await exigirPermiso(userAccountId, input.consumableLotId);
  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `${carpetaDe(input.consumableLotId)}${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

export interface FinalizarFotoDeEtiquetaInput {
  readonly consumableLotId: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly originalFilename: string;
  /** Sin valor por defecto, como en trazabilidad: una foto es un registro con procedencia. */
  readonly provenanceClass: ProvenanceClass;
}

export async function finalizarFotoDeEtiqueta(userAccountId: string, input: FinalizarFotoDeEtiquetaInput) {
  await exigirPermiso(userAccountId, input.consumableLotId);

  // Sin esto, quien conozca la clave de una subida ajena podría colgarla de su frasco.
  if (!input.storageKey.startsWith(carpetaDe(input.consumableLotId))) {
    throw new EtiquetaError("clave de almacenamiento inválida: no es de la carpeta de este frasco");
  }

  const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { id: userAccountId }, select: { personId: true } });

  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: input.mimeType.startsWith("image/") ? "photo" : "document",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: cuenta.personId,
        status: "approved",
        classification: "internal",
        createdBy: userAccountId,
        provenanceClass: input.provenanceClass,
        consumableLotId: input.consumableLotId,
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
