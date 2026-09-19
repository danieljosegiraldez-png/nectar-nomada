"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { crearTipoDeBandeja, registrarBandejas } from "../../lib/equipos/bandejas";
import { registrarPesaje } from "../../lib/traceability/capacidadDeBandeja";
import { TZ_OFFSET_FIELD, parseLocalDateTime } from "../../lib/time/localDateTime";
import { leerProfundidades, mensajeDeBandeja } from "../beneficio/bandejas/utilidades";
import type { EstadoDeCarga } from "../../lib/traceability/capacidadDeBandeja";

export type BandejaFormState = { error?: string; ok?: string };

/** Tarea 5 del plan 2a: tipos, registro numerado y pesaje de bandejas. */
export async function crearTipoAction(_prev: BandejaFormState, form: FormData): Promise<BandejaFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Bandejas");
  try {
    await crearTipoDeBandeja(user.userAccountId, {
      organizationId: String(form.get("organizationId") ?? ""),
      nombre: String(form.get("nombre") ?? ""),
      ancho: Number(form.get("ancho")),
      largo: Number(form.get("largo")),
      unidad: String(form.get("unidad") ?? "ft") as "ft" | "cm",
    });
  } catch (error) {
    return { error: mensajeDeBandeja(error) };
  }
  revalidatePath("/beneficio/bandejas");
  return { ok: t("tipoCreado") };
}

export async function registrarBandejasAction(_prev: BandejaFormState, form: FormData): Promise<BandejaFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Bandejas");
  let numeros: string[];
  try {
    ({ numeros } = await registrarBandejas(user.userAccountId, {
      siteId: String(form.get("siteId") ?? ""),
      trayTypeId: String(form.get("trayTypeId") ?? ""),
      cantidad: Number(form.get("cantidad")),
    }));
  } catch (error) {
    return { error: mensajeDeBandeja(error) };
  }
  revalidatePath("/beneficio/bandejas");
  return {
    ok:
      numeros.length === 1
        ? t("bandejaRegistrada", { numero: numeros[0]! })
        : t("bandejasRegistradas", { primero: numeros[0]!, ultimo: numeros[numeros.length - 1]! }),
  };
}

export async function registrarPesajeAction(_prev: BandejaFormState, form: FormData): Promise<BandejaFormState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Bandejas");
  try {
    await registrarPesaje(user.userAccountId, {
      trayTypeId: String(form.get("trayTypeId") ?? ""),
      lotId: String(form.get("lotId") ?? ""),
      materialState: String(form.get("materialState") ?? "") as EstadoDeCarga,
      netKg: Number(form.get("netKg")),
      profundidadesCm: leerProfundidades(form),
      // El desfase del dispositivo, por si el pesaje se registra después de
      // haberse hecho (lib/time/localDateTime.ts).
      occurredAt: parseLocalDateTime(String(form.get("occurredAt") ?? ""), String(form.get(TZ_OFFSET_FIELD) ?? "")),
    });
  } catch (error) {
    return { error: mensajeDeBandeja(error) };
  }
  revalidatePath("/beneficio/bandejas");
  return { ok: t("pesajeRegistrado") };
}
