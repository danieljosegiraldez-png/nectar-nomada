/**
 * Manuales, fichas técnicas, certificados y fotos de modelos y equipos (spec §3.5).
 * Misma forma que `lib/traceability/media.ts`: el navegador sube directo a R2 con
 * una URL firmada, y el `Asset` se crea sólo cuando la subida se confirma — una
 * subida abandonada no deja un `Asset` apuntando a nada.
 *
 * Subir es gestión: `equipment:manage` en el equipo, o el permiso de catálogo en el
 * modelo.
 */
import { randomUUID } from "node:crypto";
import type { ProvenanceClass } from "../../generated/prisma/client";
import { recordAuditEvent } from "../audit";
import { filtroVisible, organizacionesVisibles, requireEntradaDeCatalogoAccess } from "../catalogos/propiedad";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { getSignedUrlForAsset } from "../traceability/media";
import { puedeSobreEquipo } from "./equipos";

export class DocumentoError extends Error {}

export type DestinoDeDocumento = { tipo: "modelo"; modelId: string } | { tipo: "equipo"; equipmentId: string };

export interface DocumentoVisible {
  id: string;
  originalFilename: string | null;
  mimeType: string;
  url: string;
  createdAt: Date;
}

const BUCKET = "nectar-originals";
const GESTIONAR = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;

function prefijo(d: DestinoDeDocumento) {
  return d.tipo === "modelo" ? `nectar-originals/equipos/modelos/${d.modelId}/` : `nectar-originals/equipos/${d.equipmentId}/`;
}

async function requireDocumentoAccess(userAccountId: string, d: DestinoDeDocumento) {
  if (d.tipo === "equipo") {
    if (!(await puedeSobreEquipo(userAccountId, d.equipmentId, "manage"))) throw new DocumentoError("forbidden");
    return;
  }
  const m = await prisma.equipmentModel.findUnique({ where: { id: d.modelId }, select: { organizationId: true } });
  if (!m) throw new DocumentoError("modelo_no_encontrado");
  await requireEntradaDeCatalogoAccess(userAccountId, m, GESTIONAR);
}

export async function pedirSubidaDeDocumento(userAccountId: string, destino: DestinoDeDocumento, originalFilename: string, contentType: string) {
  await requireDocumentoAccess(userAccountId, destino);
  const ext = originalFilename.includes(".") ? originalFilename.split(".").pop() : undefined;
  const storageKey = `${prefijo(destino)}${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType });
  return { uploadUrl, storageKey };
}

export async function confirmarSubidaDeDocumento(
  userAccountId: string,
  input: { destino: DestinoDeDocumento; storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string; provenanceClass: ProvenanceClass },
) {
  await requireDocumentoAccess(userAccountId, input.destino);
  if (!input.storageKey.startsWith(prefijo(input.destino))) throw new DocumentoError("clave_invalida");
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
        ...(input.destino.tipo === "equipo" ? { equipmentId: input.destino.equipmentId } : { equipmentModelId: input.destino.modelId }),
      },
      select: { id: true },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "asset.create", entityType: "asset", entityId: asset.id, sourceInterface: "lib/equipos/documentos.ts", after: { destino: input.destino, storageKey: input.storageKey } },
      tx,
    );
    return asset;
  });
}

async function visibles(where: object): Promise<DocumentoVisible[]> {
  const filas = await prisma.asset.findMany({
    where: { ...where, status: "approved" },
    select: { id: true, originalFilename: true, mimeType: true, storageKey: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(filas.map(async ({ storageKey, ...f }) => ({ ...f, url: await getSignedUrlForAsset(storageKey) })));
}

export async function documentosDeEquipo(userAccountId: string, equipmentId: string) {
  if (!(await puedeSobreEquipo(userAccountId, equipmentId, "view"))) throw new DocumentoError("forbidden");
  const e = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId }, select: { modelId: true } });
  const [propios, delModelo] = await Promise.all([
    visibles({ equipmentId }),
    e.modelId ? visibles({ equipmentModelId: e.modelId }) : Promise.resolve([]),
  ]);
  return { propios, delModelo };
}

export async function documentosDeModelo(userAccountId: string, modelId: string) {
  const orgs = await organizacionesVisibles(userAccountId, VER);
  const m = await prisma.equipmentModel.findFirst({ where: { id: modelId, ...filtroVisible(orgs) }, select: { id: true } });
  if (!m) throw new DocumentoError("modelo_no_encontrado");
  return visibles({ equipmentModelId: modelId });
}
