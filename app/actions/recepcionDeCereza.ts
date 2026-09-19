"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { COOKIE_BENEFICIO } from "../../lib/traceability/beneficioElegido";
import {
  RecepcionError,
  anularRecepcion,
  confirmarFotoDeRecepcion,
  pedirSubidaDeFotoDeRecepcion,
  recibirCereza,
  type OrigenDeRecepcion,
} from "../../lib/traceability/recepcionesDeCereza";
import { PedidoError, cerrarPedido, crearPedido } from "../../lib/traceability/pedidosDeCereza";
import { ProveedorError, crearProveedorDeCereza } from "../../lib/traceability/proveedoresDeCereza";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { FechaDeDiaInvalida, LocalDateTimeError, TZ_OFFSET_FIELD, fechaDeDia, parseLocalDateTime } from "../../lib/time/localDateTime";
import type { SamplePoint } from "../../lib/beneficio/brix";

/**
 * Spec recepción de cereza en el beneficio §4 — las acciones de `/beneficio/recepcion` y
 * `/beneficio/pedidos`. Toda la autorización está en los servicios; aquí sólo se lee el formulario
 * y se traducen los errores con nombre.
 */
export type RecepcionActionState = { error?: string; ok?: boolean };

const CODIGOS = [
  "clave_de_envio_obligatoria", "fecha_invalida", "pesos_invalidos", "punto_de_muestreo_obligatorio", "motivo_obligatorio",
  "entrega_no_encontrada", "entrega_no_enviada", "otro_destino", "ya_recibida", "misma_persona", "proveedor_no_valido",
  "peso_declarado_invalido", "pedido_no_valido", "nota_obligatoria", "recepcion_no_encontrada", "ya_anulada",
  "clave_invalida", "tamano_invalido", "beneficio_no_valido", "kg_invalidos", "margen_invalido", "fuente_no_valida",
  "min_maduro_invalido", "max_verde_invalido", "max_flotes_invalido", "pedido_no_encontrado", "ya_cerrado",
  "sin_permiso", "nombre_invalido", "proveedor_repetido",
] as const;

async function traducir(error: unknown): Promise<RecepcionActionState> {
  const t = await getTranslations("Recepcion");
  if (error instanceof RecepcionError || error instanceof PedidoError || error instanceof ProveedorError) {
    const codigo = CODIGOS.find((c) => c === error.message);
    return { error: codigo ? t(`error_${codigo}`) : t("error_generico") };
  }
  if (error instanceof TraceabilityAccessError) return { error: t("error_sin_permiso") };
  if (error instanceof LocalDateTimeError || error instanceof FechaDeDiaInvalida) return { error: t("error_fecha_invalida") };
  throw error;
}

async function usuario() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user.userAccountId;
}

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const numero = (fd: FormData, k: string) => {
  const v = texto(fd, k).replace(",", ".");
  return v === "" ? null : Number(v);
};

/** Elegir el beneficio: sólo guarda una cookie que acota; cada página la vuelve a resolver. */
export async function elegirBeneficioAction(formData: FormData): Promise<void> {
  await usuario();
  const store = await cookies();
  store.set(COOKIE_BENEFICIO, texto(formData, "beneficio"), { path: "/", sameSite: "lax", httpOnly: true });
  const volver = texto(formData, "volver");
  redirect(volver.startsWith("/") && !volver.startsWith("//") ? volver : "/beneficio/recepcion");
}

/** Recibir o rechazar: una entrega de la finca (`entregaId`) o cereza de fuera (`proveedorId`). */
export async function recibirCerezaAction(_prev: RecepcionActionState, formData: FormData): Promise<RecepcionActionState> {
  const yo = await usuario();
  try {
    const entregaId = texto(formData, "entregaId");
    const origen: OrigenDeRecepcion = entregaId
      ? { entregaId }
      : { proveedorId: texto(formData, "proveedorId"), pesoDeclaradoKg: numero(formData, "pesoDeclaradoKg") };
    const bx = numero(formData, "brix");
    const rechazar = texto(formData, "modo") === "rechazar";
    await recibirCereza(yo, {
      claveDeEnvio: texto(formData, "claveDeEnvio"),
      beneficioId: texto(formData, "beneficioId"),
      origen,
      pedidoId: texto(formData, "pedidoId") || null,
      recibidaAt: parseLocalDateTime(texto(formData, "recibidaAt"), String(formData.get(TZ_OFFSET_FIELD) ?? "")),
      brutoKg: numero(formData, "brutoKg") ?? Number.NaN,
      recipientes: numero(formData, "recipientes") ?? 0,
      taraPorRecipienteKg: numero(formData, "taraPorRecipienteKg") ?? 0,
      brix: bx == null ? null : { valor: bx, puntoDeMuestreo: texto(formData, "puntoDeMuestreo") as SamplePoint },
      nota: texto(formData, "nota") || null,
      rechazo: rechazar ? { motivo: texto(formData, "motivoRechazo") } : null,
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/beneficio/recepcion");
  return { ok: true };
}

export async function anularRecepcionAction(_prev: RecepcionActionState, formData: FormData): Promise<RecepcionActionState> {
  const yo = await usuario();
  try {
    await anularRecepcion(yo, { recepcionId: texto(formData, "recepcionId"), motivo: texto(formData, "motivo") });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/beneficio/recepcion");
  return { ok: true };
}

export async function crearProveedorAction(_prev: RecepcionActionState, formData: FormData): Promise<RecepcionActionState> {
  const yo = await usuario();
  try {
    await crearProveedorDeCereza(yo, { nombre: texto(formData, "nombre"), lugar: texto(formData, "lugar") || null });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/beneficio/recepcion");
  revalidatePath("/beneficio/pedidos");
  return { ok: true };
}

/** La fuente llega como «F:<sitio>» (finca propia) o «P:<organización>» (productor de fuera). */
export async function crearPedidoAction(_prev: RecepcionActionState, formData: FormData): Promise<RecepcionActionState> {
  const yo = await usuario();
  try {
    const [tipo, id] = texto(formData, "fuente").split(":");
    if (!id || (tipo !== "F" && tipo !== "P")) throw new PedidoError("fuente_no_valida");
    const fecha = fechaDeDia(texto(formData, "fecha"), "fecha");
    if (!fecha) throw new PedidoError("fecha_invalida");
    await crearPedido(yo, {
      beneficioId: texto(formData, "beneficioId"),
      fuente: tipo === "F" ? { fincaSiteId: id } : { proveedorId: id },
      fecha,
      kgPedidos: numero(formData, "kgPedidos") ?? Number.NaN,
      margenCantidadPct: numero(formData, "margenCantidadPct") ?? 0,
      minMaduroPct: numero(formData, "minMaduroPct"),
      maxVerdePct: numero(formData, "maxVerdePct"),
      maxFlotesPct: numero(formData, "maxFlotesPct"),
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/beneficio/pedidos");
  return { ok: true };
}

export async function cerrarPedidoAction(_prev: RecepcionActionState, formData: FormData): Promise<RecepcionActionState> {
  const yo = await usuario();
  try {
    await cerrarPedido(yo, { pedidoId: texto(formData, "pedidoId"), nota: texto(formData, "nota") || null });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/beneficio/pedidos");
  return { ok: true };
}

export async function pedirSubidaDeFotoDeRecepcionAction(
  recepcionId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const yo = await usuario();
  try {
    return await pedirSubidaDeFotoDeRecepcion(yo, { recepcionId, originalFilename, contentType });
  } catch (error) {
    return { error: (await traducir(error)).error ?? "" };
  }
}

export async function confirmarFotoDeRecepcionAction(
  recepcionId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
): Promise<{ ok: true } | { error: string }> {
  const yo = await usuario();
  try {
    await confirmarFotoDeRecepcion(yo, { recepcionId, storageKey, mimeType, sizeBytes, originalFilename });
  } catch (error) {
    return { error: (await traducir(error)).error ?? "" };
  }
  revalidatePath("/beneficio/recepcion");
  return { ok: true };
}
