/**
 * Las situaciones de campo que reporta el recolector durante su jornada de cosecha.
 *
 * Spec: docs/superpowers/specs/2026-09-18-jornada-y-entrega-de-cosecha-design.md §3.5. Daniel,
 * 2026-09-18: «recolector puede hacer un registro de jornada que puedan ver sus superiores y
 * demás que deben reportar o trabajan ese lote si se les da autorización».
 *
 * - **No hay modelo nuevo:** una situación es un `FieldEvent` en una `FieldSession` atada a la
 *   jornada (`jornadaDeCosechaId`), con el bloque o la planta si el sujeto es uno de ellos.
 * - **Compuerta propia**, como la del apiario en `jornadaDeCampo.ts`: abrir una `FieldSession`
 *   por la vía general exige `location:manage_attributes`, que es la autoridad para reescribir
 *   sol, sombra y suelo, y el recolector no debe tenerla. Aquí basta `field_report:create_own`
 *   sobre la finca y estar asignado en la jornada, y sólo sobre lo asignado.
 * - **Quién lo ve:** quien lo reportó, lo suyo; con `field_report:view` sobre la finca (Farm
 *   Manager, capataz, o a quien se le conceda), todo lo de la jornada; nadie más.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { objectStorageProvider } from "../integrations/storage";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { parcelaDeOrigen, type OrigenDeEntrega } from "./entregasDeCosecha";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class SituacionError extends Error {}

/** La cuenta es recolector asignado en esta jornada abierta, con `field_report:create_own` en la finca. */
async function exigeReportarEnJornada(userAccountId: string, jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({
    where: { id: jornadaId },
    include: { fincaSite: { select: { id: true, classification: true } } },
  });
  if (!jornada) throw new SituacionError("jornada_no_encontrada");
  const target = { scopeType: "location" as const, scopeRefId: jornada.fincaSite.id };
  if (!(await can(userAccountId, "create_own", "field_report", target, jornada.fincaSite.classification))) {
    throw new SituacionError("sin_permiso");
  }
  if (jornada.estado !== "abierta") throw new SituacionError("jornada_cerrada");
  const { personId } = await prisma.userAccount.findUniqueOrThrow({ where: { id: userAccountId }, select: { personId: true } });
  const asignadas = new Set(
    (await prisma.asignacionDeJornada.findMany({ where: { jornadaId, personId }, select: { locationId: true } })).map((a) => a.locationId),
  );
  if (!asignadas.size) throw new SituacionError("no_asignado_en_la_jornada");
  return { jornada, personId, asignadas };
}

/** «Otro» sin nota no dice nada: la regla de F1 §1. */
function exigeNotaSiOtro(valor: string, nota: string | null | undefined) {
  if (valor === "otro" && !nota?.trim()) throw new SituacionError("nota_obligatoria");
}

async function grabarEvento(
  userAccountId: string,
  ctx: { jornadaId: string; personId: string; parcela: string },
  data: { eventKindValueId: string; ocurridaAt: Date; nota: string | null; plotBlockId?: string; specimenId?: string; condicionDelDiaValueId?: string },
  foto?: { storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string; provenanceClass: ProvenanceClass },
) {
  return prisma.$transaction(async (tx) => {
    // Reusa la FieldSession abierta de esta persona en esta parcela y jornada, o abre una.
    let sesion = await tx.fieldSession.findFirst({
      where: { jornadaDeCosechaId: ctx.jornadaId, operatorPersonId: ctx.personId, locationId: ctx.parcela, endedAt: null },
    });
    if (!sesion) {
      sesion = await tx.fieldSession.create({
        data: {
          locationId: ctx.parcela,
          operatorPersonId: ctx.personId,
          jornadaDeCosechaId: ctx.jornadaId,
          startedAt: data.ocurridaAt,
          provenanceClass: "direct_observation",
          createdBy: userAccountId,
        },
      });
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, operation: "field_session.start", entityType: "field_session", entityId: sesion.id, after: sesion, sourceInterface: "traceability.service" },
        tx,
      );
    }
    // La foto es un FieldEvent que apunta a su Asset (lib/sync/fieldMedia.ts): Asset, evento y sus
    // AuditEvent en UNA transacción, para que no quede un medio sin evento ni un evento sin medio.
    const asset = foto
      ? await tx.asset.create({
          data: {
            assetType: foto.mimeType.startsWith("video/") ? "video" : "photo",
            storageKey: foto.storageKey,
            storageBucket: BUCKET,
            mimeType: foto.mimeType,
            sizeBytes: foto.sizeBytes,
            originalFilename: foto.originalFilename,
            creatorPersonId: ctx.personId,
            status: "approved",
            classification: "internal",
            createdBy: userAccountId,
            provenanceClass: foto.provenanceClass,
          },
        })
      : null;
    if (asset) {
      await recordAuditEvent(
        { actorUserAccountId: userAccountId, operation: "asset.create", entityType: "asset", entityId: asset.id, after: asset, sourceInterface: "traceability.service" },
        tx,
      );
    }
    const evento = await tx.fieldEvent.create({
      data: {
        assetId: asset?.id ?? null,
        fieldSessionId: sesion.id,
        eventKindValueId: data.eventKindValueId,
        occurredAt: data.ocurridaAt,
        operatorPersonId: ctx.personId,
        notes: data.nota,
        plotBlockId: data.plotBlockId ?? null,
        specimenId: data.specimenId ?? null,
        condicionDelDiaValueId: data.condicionDelDiaValueId ?? null,
        provenanceClass: "direct_observation",
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "field_event.record", entityType: "field_event", entityId: evento.id, after: evento, sourceInterface: "traceability.service" },
      tx,
    );
    return evento;
  });
}

async function valorDeCatalogo(id: string, clave: string) {
  const valor = await prisma.variableCatalogValue.findUnique({ where: { id }, include: { catalog: { select: { key: true } } } });
  if (!valor || valor.catalog.key !== clave) throw new SituacionError(`${clave}_invalido`);
  return valor;
}

export interface ReportarSituacionInput {
  readonly jornadaId: string;
  readonly sobre: OrigenDeEntrega;
  readonly tipoValueId: string;
  readonly nota?: string | null;
  readonly ocurridaAt: Date;
}

/** Una situación sobre lo asignado: parcela, bloque o planta. Tipo de `event_kind`; «otro» con nota. */
export async function reportarSituacion(userAccountId: string, input: ReportarSituacionInput) {
  const { personId, asignadas } = await exigeReportarEnJornada(userAccountId, input.jornadaId);
  if (Number.isNaN(input.ocurridaAt.getTime())) throw new SituacionError("fecha_invalida");
  const tipo = await valorDeCatalogo(input.tipoValueId, "event_kind");
  exigeNotaSiOtro(tipo.value, input.nota);
  const parcela = await parcelaDeOrigen(prisma, input.sobre);
  if (!parcela || !asignadas.has(parcela)) throw new SituacionError("sobre_no_asignado");
  return grabarEvento(
    userAccountId,
    { jornadaId: input.jornadaId, personId, parcela },
    {
      eventKindValueId: tipo.aliasOfId ?? tipo.id,
      ocurridaAt: input.ocurridaAt,
      nota: input.nota?.trim() || null,
      plotBlockId: "plotBlockId" in input.sobre ? input.sobre.plotBlockId : undefined,
      specimenId: "specimenId" in input.sobre ? input.sobre.specimenId : undefined,
    },
  );
}

export interface ReportarCondicionInput {
  readonly jornadaId: string;
  readonly locationId: string;
  readonly condicionValueId: string;
  readonly nota?: string | null;
  readonly ocurridaAt: Date;
}

/**
 * La condición del día en una parcela asignada: lluvia, neblina u otro. Es una observación, **sin
 * valor medido**: los milímetros son la lectura de un instrumento (spec de instrumentos de campo).
 */
export async function reportarCondicionDelDia(userAccountId: string, input: ReportarCondicionInput) {
  const { personId, asignadas } = await exigeReportarEnJornada(userAccountId, input.jornadaId);
  if (Number.isNaN(input.ocurridaAt.getTime())) throw new SituacionError("fecha_invalida");
  if (!asignadas.has(input.locationId)) throw new SituacionError("sobre_no_asignado");
  const condicion = await valorDeCatalogo(input.condicionValueId, "condicion_del_dia");
  exigeNotaSiOtro(condicion.value, input.nota);
  const observacion = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "observacion", catalog: { key: "event_kind" } },
    select: { id: true },
  });
  return grabarEvento(
    userAccountId,
    { jornadaId: input.jornadaId, personId, parcela: input.locationId },
    { eventKindValueId: observacion.id, ocurridaAt: input.ocurridaAt, nota: input.nota?.trim() || null, condicionDelDiaValueId: condicion.aliasOfId ?? condicion.id },
  );
}

const BUCKET = "nectar-originals";
const prefijoDeJornada = (jornadaId: string) => `nectar-originals/field/jornadas/${jornadaId}/`;

/** Qué tipo de evento es un medio, por su MIME. Lo demás no se acepta. */
function tipoDeMedio(mime: string) {
  if (mime.startsWith("image/")) return "foto";
  if (mime.startsWith("video/")) return "video";
  throw new SituacionError("tipo_de_archivo_invalido");
}

/**
 * Foto de una situación, paso 1: la URL de subida directa. Misma compuerta que reportar. La clave
 * la acuña el servidor bajo el prefijo de la jornada; al confirmar se vuelve a comprobar.
 */
export async function pedirSubidaDeFotoDeSituacion(userAccountId: string, input: { jornadaId: string; originalFilename: string; contentType: string }) {
  tipoDeMedio(input.contentType);
  await exigeReportarEnJornada(userAccountId, input.jornadaId);
  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `${prefijoDeJornada(input.jornadaId)}${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

export interface ConfirmarFotoDeSituacionInput {
  readonly jornadaId: string;
  readonly sobre: OrigenDeEntrega;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly originalFilename: string;
  readonly nota?: string | null;
  readonly ocurridaAt: Date;
}

/**
 * Foto de una situación, paso 2: con la subida hecha, un `FieldEvent` de tipo foto (o video) que
 * apunta a su `Asset`, sobre lo asignado. No pasa por `lib/sync/fieldMedia.ts` porque aquel exige
 * `location:manage_attributes`, que el recolector no tiene ni debe tener.
 */
export async function confirmarFotoDeSituacion(userAccountId: string, input: ConfirmarFotoDeSituacionInput) {
  const { personId, asignadas } = await exigeReportarEnJornada(userAccountId, input.jornadaId);
  if (!input.storageKey.startsWith(prefijoDeJornada(input.jornadaId))) throw new SituacionError("clave_invalida");
  if (!(input.sizeBytes > 0)) throw new SituacionError("tamano_invalido");
  if (Number.isNaN(input.ocurridaAt.getTime())) throw new SituacionError("fecha_invalida");
  const parcela = await parcelaDeOrigen(prisma, input.sobre);
  if (!parcela || !asignadas.has(parcela)) throw new SituacionError("sobre_no_asignado");
  const kind = await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: tipoDeMedio(input.mimeType), catalog: { key: "event_kind" } },
    select: { id: true, aliasOfId: true },
  });
  return grabarEvento(
    userAccountId,
    { jornadaId: input.jornadaId, personId, parcela },
    {
      eventKindValueId: kind.aliasOfId ?? kind.id,
      ocurridaAt: input.ocurridaAt,
      nota: input.nota?.trim() || null,
      plotBlockId: "plotBlockId" in input.sobre ? input.sobre.plotBlockId : undefined,
      specimenId: "specimenId" in input.sobre ? input.sobre.specimenId : undefined,
    },
    { storageKey: input.storageKey, mimeType: input.mimeType, sizeBytes: input.sizeBytes, originalFilename: input.originalFilename, provenanceClass: "original_record" },
  );
}

/** Lo reportado en una jornada: todo, con `field_report:view` sobre la finca; si no, sólo lo propio. */
export async function situacionesDeJornada(userAccountId: string, jornadaId: string) {
  const jornada = await prisma.jornadaDeCosecha.findUnique({
    where: { id: jornadaId },
    include: { fincaSite: { select: { id: true, classification: true } } },
  });
  if (!jornada) throw new SituacionError("jornada_no_encontrada");
  const target = { scopeType: "location" as const, scopeRefId: jornada.fincaSite.id };
  const veTodo = await can(userAccountId, "view", "field_report", target, jornada.fincaSite.classification);
  const { personId } = await prisma.userAccount.findUniqueOrThrow({ where: { id: userAccountId }, select: { personId: true } });
  return prisma.fieldEvent.findMany({
    where: { fieldSession: { jornadaDeCosechaId: jornadaId }, ...(veTodo ? {} : { operatorPersonId: personId }) },
    orderBy: { occurredAt: "asc" },
    include: {
      eventKindValue: { select: { value: true } },
      condicionDelDiaValue: { select: { value: true } },
      operator: { select: { id: true, displayName: true } },
      fieldSession: { select: { location: { select: { id: true, name: true } } } },
      plotBlock: { select: { id: true, name: true } },
      specimen: { select: { id: true, commonName: true } },
      asset: { select: { id: true, mimeType: true } },
    },
  });
}
