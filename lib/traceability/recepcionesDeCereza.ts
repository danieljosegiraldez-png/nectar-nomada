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
  if (ya) {
    // El reintento se autoriza contra la recepción GUARDADA, no contra la que se pide: la clave
    // identifica el acto, no sustituye al permiso (revisión de Codex, hallazgo 3).
    await exigeGestionarBeneficio(userAccountId, ya.beneficioId);
    return ya;
  }

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
  if (input.brix && !Number.isFinite(input.brix.valor)) throw new RecepcionError("brix_invalido");
  // Se evalúa el valor que se va a GUARDAR (`Decimal(5,2)`): 17,999 se guarda 18,00 y tiene que
  // salir óptimo, no sin veredicto (revisión de Codex, hallazgo 9).
  const brix = input.brix ? Math.round(input.brix.valor * 100) / 100 : null;
  const veredictoBrix = brix == null ? null : evaluarBrixDeRecepcion(brix);
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
        // Otro envío con la MISMA clave pudo ganar el bloqueo mientras se esperaba: entonces lo que
        // corresponde es devolver el suyo, no «ya recibida» (revisión de Codex, hallazgo 5).
        const mismoEnvio = await tx.recepcionDeCereza.findUnique({ where: { claveDeEnvio: clave } });
        if (mismoEnvio) {
          if (mismoEnvio.beneficioId !== input.beneficioId) await exigeGestionarBeneficio(userAccountId, mismoEnvio.beneficioId);
          return mismoEnvio;
        }
        const entrega = await tx.entregaDeCosecha.findUnique({
          where: { id: input.origen.entregaId },
          include: { jornada: { select: { id: true, beneficioId: true, fincaSiteId: true } } },
        });
        if (!entrega) throw new RecepcionError("entrega_no_encontrada");
        // La jornada también, y DESPUÉS de la entrega (el mismo orden que cambiar el destino): así
        // el destino que se compara no puede cambiar antes de que esta recepción exista
        // (revisión de Codex, hallazgo 1).
        await tx.$queryRaw`SELECT "id" FROM "traceability"."jornada_de_cosecha" WHERE "id" = ${entrega.jornada.id}::uuid FOR UPDATE`;
        const destino = await tx.jornadaDeCosecha.findUniqueOrThrow({ where: { id: entrega.jornada.id }, select: { beneficioId: true } });
        if (entrega.estado !== "enviada") throw new RecepcionError("entrega_no_enviada");
        if (destino.beneficioId !== input.beneficioId) throw new RecepcionError("otro_destino");
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
          brix,
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
      if (existente) {
        await exigeGestionarBeneficio(userAccountId, existente.beneficioId);
        return existente;
      }
    }
    throw error;
  }
}

/**
 * Anula una recepción: la entrega vuelve a pendiente, en el mismo beneficio. Dos personas también
 * aquí, y **sólo mientras no haya salido ningún lote** (`ya_tiene_lotes`, pieza 3).
 */
export async function anularRecepcion(userAccountId: string, input: { recepcionId: string; motivo: string }) {
  const recepcion = await prisma.recepcionDeCereza.findUnique({ where: { id: input.recepcionId } });
  if (!recepcion) throw new RecepcionError("recepcion_no_encontrada");
  await exigeGestionarBeneficio(userAccountId, recepcion.beneficioId);
  const motivo = input.motivo.trim();
  if (!motivo) throw new RecepcionError("motivo_obligatorio");
  const persona = await personaDe(userAccountId);
  return prisma.$transaction(async (tx) => {
    // Dos anulaciones a la vez: la segunda espera y ve la primera (revisión de Codex, hallazgo 2).
    await tx.$queryRaw`SELECT "id" FROM "traceability"."recepcion_de_cereza" WHERE "id" = ${recepcion.id}::uuid FOR UPDATE`;
    const antes = await tx.recepcionDeCereza.findUniqueOrThrow({ where: { id: recepcion.id } });
    if (antes.estado === "anulada") throw new RecepcionError("ya_anulada");
    // De una recepción con cereza ya en un lote no se vuelve atrás: el lote existe y su genealogía
    // apunta aquí. El disparador `recepcion_de_cereza_con_lotes_no_se_anula` es la red.
    if ((await tx.loteDesdeRecepcion.count({ where: { recepcionId: antes.id } })) > 0) throw new RecepcionError("ya_tiene_lotes");
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

/** Lo recibido en un beneficio en las últimas `horas`, con quién lo recibió. */
export async function recepcionesDeBeneficio(userAccountId: string, beneficioId: string, horas: number) {
  await exigeVerBeneficio(userAccountId, beneficioId);
  const desde = new Date(Date.now() - horas * 3_600_000);
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

/**
 * Anota una merma: cereza que entró y no va a llegar a ningún lote —se regó, se pudrió, se pesó de
 * más—. No es un lote y no tiene genealogía; lo único que hace es bajar el disponible.
 *
 * El disponible se comprueba **dentro de la transacción y con la fila de la recepción bloqueada**:
 * una suma sin bloqueo no es una garantía, porque dos mermas simultáneas la leerían las dos antes
 * de que ninguna escribiera. El disparador `merma_de_recepcion_cabe` es la red, no la regla.
 */
export async function anotarMerma(
  userAccountId: string,
  input: { recepcionId: string; kg: number; motivo: string; anotadaAt: Date },
) {
  const recepcion = await prisma.recepcionDeCereza.findUnique({ where: { id: input.recepcionId }, select: { id: true, beneficioId: true } });
  if (!recepcion) throw new RecepcionError("recepcion_no_encontrada");
  await exigeGestionarBeneficio(userAccountId, recepcion.beneficioId);
  if (!(input.kg > 0)) throw new RecepcionError("kg_invalidos");
  const motivo = input.motivo.trim();
  if (!motivo) throw new RecepcionError("motivo_obligatorio");
  if (Number.isNaN(input.anotadaAt.getTime())) throw new RecepcionError("fecha_invalida");
  const kg = a3(input.kg);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "traceability"."recepcion_de_cereza" WHERE "id" = ${recepcion.id}::uuid FOR UPDATE`;
    const fila = await tx.recepcionDeCereza.findUniqueOrThrow({ where: { id: recepcion.id }, select: { estado: true, netoKg: true } });
    if (fila.estado !== "recibida") throw new RecepcionError("recepcion_no_recibida");
    if (kg > Number(fila.netoKg) - (await tomadoDe(tx, recepcion.id))) throw new RecepcionError("merma_sobre_lo_disponible");
    const merma = await tx.mermaDeRecepcion.create({
      data: { recepcionId: recepcion.id, kg, motivo, anotadaPor: userAccountId, anotadaAt: input.anotadaAt },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "cherry_reception.loss", entityType: "merma_de_recepcion", entityId: merma.id, after: merma, sourceInterface: "traceability.service" },
      tx,
    );
    return merma;
  });
}

/** Anula una merma mal anotada: el kilo vuelve al disponible. */
export async function anularMerma(userAccountId: string, input: { mermaId: string; motivo: string }) {
  const merma = await prisma.mermaDeRecepcion.findUnique({ where: { id: input.mermaId }, include: { recepcion: { select: { beneficioId: true } } } });
  if (!merma) throw new RecepcionError("merma_no_encontrada");
  await exigeGestionarBeneficio(userAccountId, merma.recepcion.beneficioId);
  const motivo = input.motivo.trim();
  if (!motivo) throw new RecepcionError("motivo_obligatorio");
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "traceability"."merma_de_recepcion" WHERE "id" = ${merma.id}::uuid FOR UPDATE`;
    const antes = await tx.mermaDeRecepcion.findUniqueOrThrow({ where: { id: merma.id } });
    if (antes.estado === "anulada") throw new RecepcionError("ya_anulada");
    const despues = await tx.mermaDeRecepcion.update({
      where: { id: antes.id },
      data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: userAccountId, motivoAnulacion: motivo },
    });
    await recordAuditEvent(
      { actorUserAccountId: userAccountId, operation: "cherry_reception.loss_void", entityType: "merma_de_recepcion", entityId: antes.id, before: antes, after: despues, sourceInterface: "traceability.service" },
      tx,
    );
    return despues;
  });
}

/** Lo ya comprometido de una recepción: mermas vigentes más lo que se llevaron los lotes. */
async function tomadoDe(tx: Prisma.TransactionClient, recepcionId: string) {
  const [mermas, lotes] = await Promise.all([
    tx.mermaDeRecepcion.aggregate({ where: { recepcionId, estado: "vigente" }, _sum: { kg: true } }),
    tx.loteDesdeRecepcion.aggregate({ where: { recepcionId }, _sum: { kg: true } }),
  ]);
  return Number(mermas._sum.kg ?? 0) + Number(lotes._sum.kg ?? 0);
}

/**
 * Cuánto queda por repartir de cada recepción: neto − mermas vigentes − lo ya vinculado a lotes.
 *
 * **Sin principal**: la llaman pantallas y servicios que ya autorizaron esas recepciones. Devuelve
 * cifras de ids concedidos y no escribe nada.
 */
export async function disponibleDeRecepciones(recepcionIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(recepcionIds)];
  if (ids.length === 0) return new Map();
  const [recepciones, mermas, lotes] = await Promise.all([
    prisma.recepcionDeCereza.findMany({ where: { id: { in: ids }, estado: "recibida" }, select: { id: true, netoKg: true } }),
    prisma.mermaDeRecepcion.groupBy({ by: ["recepcionId"], where: { recepcionId: { in: ids }, estado: "vigente" }, _sum: { kg: true } }),
    prisma.loteDesdeRecepcion.groupBy({ by: ["recepcionId"], where: { recepcionId: { in: ids } }, _sum: { kg: true } }),
  ]);
  const resta = new Map<string, number>();
  for (const g of [...mermas, ...lotes]) resta.set(g.recepcionId, (resta.get(g.recepcionId) ?? 0) + Number(g._sum.kg ?? 0));
  return new Map(recepciones.map((r) => [r.id, a3(Number(r.netoKg) - (resta.get(r.id) ?? 0))]));
}

/**
 * Las mermas vigentes de unas recepciones, para poder anular la que se anotó mal.
 *
 * **Sin principal**, como `disponibleDeRecepciones`: la llama la pantalla del beneficio con las
 * recepciones que `recepcionesDeBeneficio` —que sí exige `lot:view`— acaba de devolverle.
 */
export async function mermasDeRecepciones(recepcionIds: readonly string[]) {
  if (recepcionIds.length === 0) return [];
  return prisma.mermaDeRecepcion.findMany({
    where: { recepcionId: { in: [...recepcionIds] }, estado: "vigente" },
    orderBy: { anotadaAt: "desc" },
  });
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
