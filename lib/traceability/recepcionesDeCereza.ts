/**
 * La recepción de cereza en el beneficio: el ORIGEN trazable de toda cereza que entra, propia o
 * de fuera.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.4. Daniel,
 * 2026-09-19: «la idea es trazabilidad, y de una recepción se pueden correr muchos diferentes
 * procesos, y cada uno se ve como un lote».
 *
 * - **No crea lote.** En la pieza 3, de una recepción salen uno o varios lotes.
 * - **Doble peso:** bruto menos tara en el beneficio, contra el peso de finca (o el declarado por
 *   el productor de fuera), con `compararBasculas`. Fuera de tolerancia, nota; **nunca bloquea**.
 * - **Dos personas:** quien recibe, rechaza o anula no es quien anotó la entrega ni su recolector.
 *   Servicio y disparador `recepcion_de_cereza_dos_personas`.
 * - **Recibir exige, dentro de la transacción y con la fila de la entrega bloqueada**, que siga
 *   enviada, que su jornada vaya a ESTE beneficio y que no tenga otra recepción vigente. La lista de
 *   pendientes es una comodidad, no la regla.
 * - **Idempotente** por `claveDeEnvio`: un reintento devuelve la recepción ya guardada.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { objectStorageProvider } from "../integrations/storage";
import { SchemaError } from "../beneficio/balanceDeMasas";
import { compararBasculas, netoDeRecepcion } from "../beneficio/comparacionDePesos";
import { evaluarBrixDeRecepcion } from "../beneficio/brixDeRecepcion";
import type { SamplePoint } from "../beneficio/brix";
import { cantidadDelPedido, exigeGestionarBeneficio, exigeVerBeneficio } from "./pedidosDeCereza";
import { Prisma } from "../../generated/prisma/client";

export class RecepcionError extends Error {}

export type OrigenDeRecepcion = { entregaId: string } | { proveedorId: string; pesoDeclaradoKg?: number | null };

const PUNTOS: readonly SamplePoint[] = ["TANK_LIQUID_MID", "TANK_LIQUID_SURFACE", "MUCILAGE_PRESSED", "CHERRY_PULP", "PARCHMENT_BED"];
const a3 = (x: number) => Math.round(x * 1000) / 1000;
const BUCKET = "nectar-originals";

export interface RecibirCerezaInput {
  readonly claveDeEnvio: string;
  readonly beneficioId: string;
  readonly origen: OrigenDeRecepcion;
  readonly pedidoId?: string | null;
  readonly recibidaAt: Date;
  readonly brutoKg: number;
  readonly recipientes: number;
  readonly taraPorRecipienteKg: number;
  readonly brix?: { valor: number; puntoDeMuestreo: SamplePoint; instrumentoId?: string | null } | null;
  readonly nota?: string | null;
  readonly rechazo?: { motivo: string } | null;
}

async function personaDe(userAccountId: string) {
  return (await prisma.userAccount.findUniqueOrThrow({ where: { id: userAccountId }, select: { personId: true } })).personId;
}

export async function recibirCereza(userAccountId: string, input: RecibirCerezaInput) {
  // 1. Un reintento con la misma clave devuelve lo ya guardado, antes de volver a validar nada: el
  //    acto ya se aceptó una vez (misma regla que `finalizeFieldMedia`).
  const clave = input.claveDeEnvio.trim();
  if (!clave) throw new RecepcionError("clave_de_envio_obligatoria");
  const ya = await prisma.recepcionDeCereza.findUnique({ where: { claveDeEnvio: clave } });
  if (ya) return ya;

  // 2. Quien recibe gestiona ESTE beneficio.
  await exigeGestionarBeneficio(userAccountId, input.beneficioId);

  // 3. Lo que no depende de la base.
  if (Number.isNaN(input.recibidaAt.getTime())) throw new RecepcionError("fecha_invalida");
  let neto: number;
  try {
    neto = netoDeRecepcion(input.brutoKg, input.recipientes, input.taraPorRecipienteKg);
  } catch (error) {
    if (error instanceof SchemaError) throw new RecepcionError("pesos_invalidos");
    throw error;
  }
  if (input.brix && !PUNTOS.includes(input.brix.puntoDeMuestreo)) throw new RecepcionError("punto_de_muestreo_obligatorio");
  const veredictoBrix = input.brix ? evaluarBrixDeRecepcion(input.brix.valor) : null;
  const nota = input.nota?.trim() || null;
  const motivoRechazo = input.rechazo ? input.rechazo.motivo.trim() : null;
  if (input.rechazo && !motivoRechazo) throw new RecepcionError("motivo_obligatorio");
  const persona = await personaDe(userAccountId);

  try {
    return await prisma.$transaction(async (tx) => {
      let referencia: Prisma.Decimal | number | null = null;
      let fuente: { fincaSiteId: string } | { proveedorId: string };
      let pesoDeclaradoKg: number | null = null;

      if ("entregaId" in input.origen) {
        // La fila de la entrega queda bloqueada hasta el final: dos receptores a la vez esperan, y
        // el segundo ve la recepción del primero.
        await tx.$queryRaw`SELECT "id" FROM "traceability"."entrega_de_cosecha" WHERE "id" = ${input.origen.entregaId}::uuid FOR UPDATE`;
        const entrega = await tx.entregaDeCosecha.findUnique({
          where: { id: input.origen.entregaId },
          include: { jornada: { select: { beneficioId: true, fincaSiteId: true } } },
        });
        if (!entrega) throw new RecepcionError("entrega_no_encontrada");
        if (entrega.estado !== "enviada") throw new RecepcionError("entrega_no_enviada");
        if (entrega.jornada.beneficioId !== input.beneficioId) throw new RecepcionError("otro_destino");
        const vigente = await tx.recepcionDeCereza.findFirst({ where: { entregaId: entrega.id, estado: { not: "anulada" } }, select: { id: true } });
        if (vigente) throw new RecepcionError("ya_recibida");
        if (entrega.anotadaPor === userAccountId || entrega.recolectorId === persona) throw new RecepcionError("misma_persona");
        referencia = entrega.pesoFincaKg;
        fuente = { fincaSiteId: entrega.jornada.fincaSiteId };
      } else {
        const proveedor = await tx.organization.findUnique({ where: { id: input.origen.proveedorId }, select: { organizationType: true } });
        if (proveedor?.organizationType !== "producer") throw new RecepcionError("proveedor_no_valido");
        const declarado = input.origen.pesoDeclaradoKg;
        if (declarado != null) {
          if (!(Number.isFinite(declarado) && declarado > 0)) throw new RecepcionError("peso_declarado_invalido");
          pesoDeclaradoKg = a3(declarado);
          referencia = pesoDeclaradoKg;
        }
        fuente = { proveedorId: input.origen.proveedorId };
      }

      // El pedido, bloqueado también: dos recepciones a la vez no cruzan su margen sin nota.
      if (input.pedidoId) {
        await tx.$queryRaw`SELECT "id" FROM "traceability"."pedido_de_cereza" WHERE "id" = ${input.pedidoId}::uuid FOR UPDATE`;
        const pedido = await tx.pedidoDeCereza.findUnique({ where: { id: input.pedidoId } });
        const mismaFuente =
          pedido && ("fincaSiteId" in fuente ? pedido.fincaSiteId === fuente.fincaSiteId : pedido.proveedorId === fuente.proveedorId);
        if (!pedido || pedido.estado !== "abierto" || pedido.beneficioId !== input.beneficioId || !mismaFuente) {
          throw new RecepcionError("pedido_no_valido");
        }
        if (!input.rechazo) {
          const suma = await tx.recepcionDeCereza.aggregate({ where: { pedidoId: pedido.id, estado: "recibida" }, _sum: { netoKg: true } });
          const c = cantidadDelPedido(Number(pedido.kgPedidos), Number(suma._sum.netoKg ?? 0) + neto, Number(pedido.margenCantidadPct));
          if (c.exceso && !nota) throw new RecepcionError("nota_obligatoria");
        }
      }

      const comparacion = referencia != null ? compararBasculas(Number(referencia), neto) : null;
      if (comparacion && comparacion.estado !== "BALANCED" && !nota) throw new RecepcionError("nota_obligatoria");

      const recepcion = await tx.recepcionDeCereza.create({
        data: {
          claveDeEnvio: clave,
          beneficioId: input.beneficioId,
          entregaId: "entregaId" in input.origen ? input.origen.entregaId : null,
          proveedorId: "proveedorId" in input.origen ? input.origen.proveedorId : null,
          pedidoId: input.pedidoId ?? null,
          recibidaPor: userAccountId,
          recibidaAt: input.recibidaAt,
          brutoKg: a3(input.brutoKg),
          recipientes: input.recipientes,
          taraPorRecipienteKg: a3(input.taraPorRecipienteKg),
          netoKg: neto,
          pesoDeclaradoKg,
          // Tal cual la de la entrega: el disparador la compara con `IS DISTINCT FROM`.
          referenciaKg: referencia,
          diferenciaKg: comparacion?.diferenciaKg ?? null,
          toleranciaKg: comparacion?.toleranciaKg ?? null,
          comparacion: comparacion?.estado ?? null,
          politicaDeBalance: comparacion ? { ...comparacion.politica } : undefined,
          brix: input.brix ? input.brix.valor : null,
          puntoDeMuestreo: input.brix ? input.brix.puntoDeMuestreo : null,
          instrumentoId: input.brix?.instrumentoId ?? null,
          veredictoBrix,
          nota,
          estado: input.rechazo ? "rechazada" : "recibida",
          motivoRechazo,
        },
      });
      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: input.rechazo ? "cherry_reception.reject" : "cherry_reception.create",
          entityType: "recepcion_de_cereza",
          entityId: recepcion.id,
          after: recepcion,
          sourceInterface: "traceability.service",
        },
        tx,
      );
      return recepcion;
    });
  } catch (error) {
    // Dos envíos simultáneos con la misma clave: el segundo choca con el índice único y devuelve
    // la del primero, que es lo que habría devuelto de llegar un poco después.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existente = await prisma.recepcionDeCereza.findUnique({ where: { claveDeEnvio: clave } });
      if (existente) return existente;
    }
    throw error;
  }
}

/**
 * Anula una recepción: la entrega vuelve a pendiente, en el mismo beneficio. Dos personas también
 * aquí. **«Sólo mientras no haya salido ningún lote» llega con la pieza 3**, que crea el vínculo
 * entre lote y recepción; hasta entonces no hay lote del que comprobarlo.
 */
export async function anularRecepcion(userAccountId: string, input: { recepcionId: string; motivo: string }) {
  const recepcion = await prisma.recepcionDeCereza.findUnique({ where: { id: input.recepcionId } });
  if (!recepcion) throw new RecepcionError("recepcion_no_encontrada");
  await exigeGestionarBeneficio(userAccountId, recepcion.beneficioId);
  const motivo = input.motivo.trim();
  if (!motivo) throw new RecepcionError("motivo_obligatorio");
  const persona = await personaDe(userAccountId);
  return prisma.$transaction(async (tx) => {
    const antes = await tx.recepcionDeCereza.findUniqueOrThrow({ where: { id: recepcion.id } });
    if (antes.estado === "anulada") throw new RecepcionError("ya_anulada");
    if (antes.entregaId) {
      const e = await tx.entregaDeCosecha.findUniqueOrThrow({ where: { id: antes.entregaId }, select: { anotadaPor: true, recolectorId: true } });
      if (e.anotadaPor === userAccountId || e.recolectorId === persona) throw new RecepcionError("misma_persona");
    }
    const despues = await tx.recepcionDeCereza.update({
      where: { id: antes.id },
      data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: userAccountId, motivoAnulacion: motivo },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "cherry_reception.void", entityType: "recepcion_de_cereza", entityId: antes.id, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/** Las entregas enviadas de jornadas con destino a este beneficio, sin recepción vigente. */
export async function pendientesDeBeneficio(userAccountId: string, beneficioId: string) {
  await exigeVerBeneficio(userAccountId, beneficioId);
  return prisma.entregaDeCosecha.findMany({
    where: { estado: "enviada", jornada: { beneficioId }, recepciones: { none: { estado: { not: "anulada" } } } },
    orderBy: { enviadaAt: "asc" },
    include: {
      recolector: { select: { id: true, displayName: true } },
      location: { select: { id: true, name: true } },
      plotBlock: { select: { id: true, name: true } },
      specimen: { select: { id: true, commonName: true } },
      jornada: { select: { id: true, fecha: true, fincaSite: { select: { id: true, name: true } } } },
    },
  });
}

/** Lo recibido en un beneficio desde una fecha, con quién lo recibió. */
export async function recepcionesDeBeneficio(userAccountId: string, beneficioId: string, desde: Date) {
  await exigeVerBeneficio(userAccountId, beneficioId);
  const filas = await prisma.recepcionDeCereza.findMany({
    where: { beneficioId, recibidaAt: { gte: desde } },
    orderBy: { recibidaAt: "desc" },
    include: {
      entrega: { select: { id: true, recolector: { select: { displayName: true } }, jornada: { select: { fincaSite: { select: { name: true } } } } } },
      proveedor: { select: { id: true, name: true } },
      pedido: { select: { id: true, kgPedidos: true } },
      _count: { select: { assets: true } },
    },
  });
  const cuentas = await prisma.userAccount.findMany({
    where: { id: { in: [...new Set(filas.map((f) => f.recibidaPor))] } },
    select: { id: true, person: { select: { displayName: true } } },
  });
  const nombres = new Map(cuentas.map((c) => [c.id, c.person.displayName]));
  return filas.map((f) => ({ ...f, recibidaPorNombre: nombres.get(f.recibidaPor) ?? null }));
}

/**
 * Lo que el otro lado ve: la recepción vigente de cada entrega. **Sin principal**: la llaman
 * `detalleDeJornada` y `misEntregas`, que ya autorizaron ver esas entregas.
 */
export async function recepcionDeEntregas(entregaIds: readonly string[]) {
  const filas = await prisma.recepcionDeCereza.findMany({
    where: { entregaId: { in: [...entregaIds] }, estado: { not: "anulada" } },
    select: { entregaId: true, estado: true, netoKg: true, diferenciaKg: true, motivoRechazo: true },
  });
  return new Map(
    filas.map((f) => [
      f.entregaId as string,
      { estado: f.estado, netoKg: Number(f.netoKg), diferenciaKg: f.diferenciaKg == null ? null : Number(f.diferenciaKg), motivoRechazo: f.motivoRechazo },
    ]),
  );
}

/** Foto de una recepción, paso 1: la URL de subida directa. */
export async function pedirSubidaDeFotoDeRecepcion(userAccountId: string, input: { recepcionId: string; originalFilename: string; contentType: string }) {
  const recepcion = await prisma.recepcionDeCereza.findUnique({ where: { id: input.recepcionId }, select: { id: true, beneficioId: true } });
  if (!recepcion) throw new RecepcionError("recepcion_no_encontrada");
  await exigeGestionarBeneficio(userAccountId, recepcion.beneficioId);
  const ext = input.originalFilename.includes(".") ? input.originalFilename.split(".").pop() : undefined;
  const storageKey = `nectar-originals/recepciones/${recepcion.id}/${randomUUID()}${ext ? `.${ext}` : ""}`;
  const { uploadUrl } = await objectStorageProvider.putObject({ key: storageKey, contentType: input.contentType });
  return { uploadUrl, storageKey };
}

/** Paso 2: con la subida hecha, el `Asset` atado a la recepción, con su AuditEvent. */
export async function confirmarFotoDeRecepcion(
  userAccountId: string,
  input: { recepcionId: string; storageKey: string; mimeType: string; sizeBytes: number; originalFilename: string },
) {
  const recepcion = await prisma.recepcionDeCereza.findUnique({ where: { id: input.recepcionId }, select: { id: true, beneficioId: true } });
  if (!recepcion) throw new RecepcionError("recepcion_no_encontrada");
  await exigeGestionarBeneficio(userAccountId, recepcion.beneficioId);
  if (!input.storageKey.startsWith(`nectar-originals/recepciones/${recepcion.id}/`)) throw new RecepcionError("clave_invalida");
  if (!(input.sizeBytes > 0)) throw new RecepcionError("tamano_invalido");
  const persona = await personaDe(userAccountId);
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
        provenanceClass: "original_record",
        recepcionDeCerezaId: recepcion.id,
      },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "asset.create", entityType: "asset", entityId: asset.id, after: asset, sourceInterface: "traceability.service" },
      tx,
    );
    return asset;
  });
}
