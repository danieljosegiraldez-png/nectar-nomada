/**
 * La entrega de cosecha: un viaje de un recolector al beneficio, anotado en la finca.
 *
 * Spec: docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md §3.3–3.4.
 * Daniel, 2026-09-18: «esta persona podría registrar en el app lo que entregó: foto, procedencia
 * de parcela, microparcela, bloque o plant specimen, y pesar en general lo entregado».
 *
 * - **No crea lote.** Queda `enviada`; el beneficio la recibirá (pieza 2) y armará lotes (pieza 3).
 * - **Quién la anota:** el recolector con cuenta (`harvest_delivery:create_own`), sólo la suya; o
 *   el capataz o Farm Manager (`lot:manage` en la finca), la de cualquiera de la jornada.
 * - **Enviada no se edita:** se anula con motivo, y sólo con `lot:manage`.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { objectStorageProvider } from "../integrations/storage";
import { requireLotAccess } from "./lots";
import { origenesDeParcelas } from "./jornadasDeCosecha";
import type { Prisma, ProvenanceClass } from "../../generated/prisma/client";

export class EntregaError extends Error {}

export type OrigenDeEntrega = { locationId: string } | { plotBlockId: string } | { specimenId: string };

const BUCKET = "nectar-originals";

async function jornadaConFinca(jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({
    where: { id: jornadaId },
    include: { fincaSite: { select: { id: true, classification: true } } },
  });
  if (!jornada) throw new EntregaError("jornada_no_encontrada");
  return jornada;
}

/** La `Person` de la cuenta; una cuenta siempre tiene una. */
async function personaDeLaCuenta(userAccountId: string) {
  const cuenta = await prisma.userAccount.findUniqueOrThrow({ where: { id: userAccountId }, select: { personId: true } });
  return cuenta.personId;
}

/**
 * Quién puede anotar la entrega de `recolectorId` en esta jornada. El propio recolector con
 * `harvest_delivery:create_own`; cualquier otro, sólo con `lot:manage` sobre la finca.
 */
async function exigePoderAnotar(userAccountId: string, jornada: Awaited<ReturnType<typeof jornadaConFinca>>, recolectorId: string) {
  const persona = await personaDeLaCuenta(userAccountId);
  if (persona === recolectorId) {
    const target = { scopeType: "location" as const, scopeRefId: jornada.fincaSite.id };
    if (await can(userAccountId, "create_own", "harvest_delivery", target, jornada.fincaSite.classification)) return;
  }
  try {
    await requireLotAccess(userAccountId, "manage", [{ locationId: jornada.fincaSite.id, classification: jornada.fincaSite.classification }]);
  } catch {
    // Un recolector que intenta anotar la de otro recibe un motivo claro, no un «sin acceso» genérico.
    throw new EntregaError(persona === recolectorId ? "sin_permiso" : "no_es_su_entrega");
  }
}

/**
 * ¿El origen está dentro de lo asignado a esta persona en esta jornada? La parcela asignada, un
 * bloque de esa parcela, o una planta de esa parcela (directa o por su bloque).
 */
async function exigeOrigenAsignado(tx: Prisma.TransactionClient, jornadaId: string, recolectorId: string, origen: OrigenDeEntrega) {
  const asignadas = new Set(
    (await tx.asignacionDeJornada.findMany({ where: { jornadaId, personId: recolectorId }, select: { locationId: true } })).map((a) => a.locationId),
  );
  if (!asignadas.size) throw new EntregaError("no_asignado_en_la_jornada");
  const parcela = await parcelaDeOrigen(tx, origen);
  if (!parcela || !asignadas.has(parcela)) throw new EntregaError("origen_no_asignado");
}

/**
 * La parcela de un origen: ella misma, la de un bloque, o la de una planta (directa o por su
 * bloque). `null` si el bloque o la planta no existen. La usan también las situaciones de campo.
 */
export async function parcelaDeOrigen(db: Prisma.TransactionClient, origen: OrigenDeEntrega): Promise<string | null> {
  if ("locationId" in origen) return origen.locationId;
  if ("plotBlockId" in origen) return (await db.plotBlock.findUnique({ where: { id: origen.plotBlockId }, select: { locationId: true } }))?.locationId ?? null;
  const planta = await db.specimen.findUnique({ where: { id: origen.specimenId }, select: { locationId: true, plotBlock: { select: { locationId: true } } } });
  return planta?.plotBlock?.locationId ?? planta?.locationId ?? null;
}

export interface AnotarEntregaInput {
  readonly jornadaId: string;
  readonly recolectorPersonId: string;
  readonly origen: OrigenDeEntrega;
  readonly pesoFincaKg: number;
  readonly enviadaAt: Date;
}

export async function anotarEntrega(userAccountId: string, input: AnotarEntregaInput) {
  const jornada = await jornadaConFinca(input.jornadaId);
  await exigePoderAnotar(userAccountId, jornada, input.recolectorPersonId);
  if (!(Number.isFinite(input.pesoFincaKg) && input.pesoFincaKg > 0)) throw new EntregaError("peso_invalido");
  if (Number.isNaN(input.enviadaAt.getTime())) throw new EntregaError("fecha_invalida");

  return prisma.$transaction(async (tx) => {
    const actual = await tx.jornadaDeCosecha.findUniqueOrThrow({ where: { id: input.jornadaId }, select: { estado: true } });
    if (actual.estado !== "abierta") throw new EntregaError("jornada_cerrada");
    await exigeOrigenAsignado(tx, input.jornadaId, input.recolectorPersonId, input.origen);
    const entrega = await tx.entregaDeCosecha.create({
      data: {
        jornadaId: input.jornadaId,
        recolectorId: input.recolectorPersonId,
        ...input.origen,
        pesoFincaKg: input.pesoFincaKg,
        enviadaAt: input.enviadaAt,
        anotadaPor: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_delivery.create", entityType: "entrega_de_cosecha", entityId: entrega.id, after: entrega, sourceInterface: "traceability.service" },
      tx,
    );
    return entrega;
  });
}

/** Anula una entrega enviada, con motivo. Sólo el capataz o el Farm Manager de la finca. */
export async function anularEntrega(userAccountId: string, input: { entregaId: string; motivo: string }) {
  const entrega = await prisma.entregaDeCosecha.findUnique({ where: { id: input.entregaId } });
  if (!entrega) throw new EntregaError("entrega_no_encontrada");
  const jornada = await jornadaConFinca(entrega.jornadaId);
  await requireLotAccess(userAccountId, "manage", [{ locationId: jornada.fincaSite.id, classification: jornada.fincaSite.classification }]);
  const motivo = input.motivo.trim();
  if (!motivo) throw new EntregaError("motivo_obligatorio");
  return prisma.$transaction(async (tx) => {
    const antes = await tx.entregaDeCosecha.findUniqueOrThrow({ where: { id: input.entregaId } });
    if (antes.estado !== "enviada") throw new EntregaError("ya_anulada");
    // Spec recepción §3.4: recibida en el beneficio, ya no se anula desde la finca. El disparador
    // `entrega_de_cosecha_recibida_no_se_anula` es la red en la base.
    const recibida = await tx.recepcionDeCereza.findFirst({ where: { entregaId: antes.id, estado: { not: "anulada" } }, select: { id: true } });
    if (recibida) throw new EntregaError("ya_recibida");
    const despues = await tx.entregaDeCosecha.update({ where: { id: antes.id }, data: { estado: "anulada", anuladaAt: new Date(), motivoAnulacion: motivo } });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "harvest_delivery.void", entityType: "entrega_de_cosecha", entityId: antes.id, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/** Lo del recolector de la cuenta: sus asignaciones en jornadas abiertas y SUS entregas. Nada de otros. */
export async function misEntregas(userAccountId: string) {
  const persona = await personaDeLaCuenta(userAccountId);
  const [asignaciones, entregas] = await Promise.all([
    prisma.asignacionDeJornada.findMany({
      where: { personId: persona, jornada: { estado: "abierta" } },
      include: { jornada: { select: { id: true, fecha: true, fincaSite: { select: { id: true, name: true } } } }, location: { select: { id: true, name: true } } },
    }),
    prisma.entregaDeCosecha.findMany({
      where: { recolectorId: persona },
      orderBy: { enviadaAt: "desc" },
      take: 50,
      include: {
        jornada: { select: { estado: true, fincaSite: { select: { timezone: true } } } },
        location: { select: { name: true } },
        plotBlock: { select: { name: true } },
        specimen: { select: { commonName: true } },
        _count: { select: { assets: true } },
      },
    }),
  ]);
  // Los orígenes sólo de las parcelas asignadas a ESTA persona en sus jornadas abiertas.
  const origenes = await origenesDeParcelas([...new Set(asignaciones.map((a) => a.locationId))]);
  return { personaId: persona, asignaciones, entregas, origenes };
}

/** Paso 1 de la foto de una entrega: la URL de subida. Misma autorización que anotarla. */
export async function pedirSubidaDeFotoDeEntrega(userAccountId: string, input: { entregaId: string; originalFilename: string; contentType: string }) {
  const entrega = await prisma.entregaDeCosecha.findUnique({ where: { id: input.entregaId } });
  if (!entrega) throw new EntregaError("entrega_no_encontrada");
  await exigePoderAnotar(userAccountId, await jornadaConFinca(entrega.jornadaId), entrega.recolectorId);
  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `nectar-originals/entregas/${entrega.id}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

/** Paso 2: con la subida hecha, el `Asset` de la foto, atado a la entrega, con su AuditEvent. */
export async function confirmarFotoDeEntrega(
  userAccountId: string,
  input: { entregaId: string; storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string; provenanceClass: ProvenanceClass },
) {
  const entrega = await prisma.entregaDeCosecha.findUnique({ where: { id: input.entregaId } });
  if (!entrega) throw new EntregaError("entrega_no_encontrada");
  await exigePoderAnotar(userAccountId, await jornadaConFinca(entrega.jornadaId), entrega.recolectorId);
  if (!input.storageKey.startsWith(`nectar-originals/entregas/${entrega.id}/`)) throw new EntregaError("clave_invalida");
  const persona = await personaDeLaCuenta(userAccountId);
  return prisma.$transaction(async (tx) => {
    const asset = await tx.asset.create({
      data: {
        assetType: input.mimeType.startsWith("video/") ? "video" : "photo",
        storageKey: input.storageKey,
        storageBucket: BUCKET,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        originalFilename: input.originalFilename,
        creatorPersonId: persona,
        status: "approved",
        classification: "internal",
        createdBy: userAccountId,
        provenanceClass: input.provenanceClass,
        entregaDeCosechaId: entrega.id,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "asset.create", entityType: "asset", entityId: asset.id, after: asset, sourceInterface: "traceability.service" },
      tx,
    );
    return asset;
  });
}
