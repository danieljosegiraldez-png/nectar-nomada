"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import { asignarATienda, confirmarRecepcion, crearVariante, TiendaInvalida, TiendaSinPermiso } from "../../lib/commerce/tienda";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { fechaDeDia } from "../../lib/time/localDateTime";

type Estado = { error?: string; ok?: boolean };

/** Traduce los rechazos de la tienda; lo que no es de aquí se relanza. */
async function rechazo(error: unknown): Promise<Estado> {
  const t = await getTranslations("Tienda");
  if (error instanceof TiendaInvalida) {
    const [codigo, ...resto] = error.message.split(":");
    return { error: t(`error_${codigo!.trim()}` as "error_envases_invalidos", { valor: resto.join(":").trim() }) };
  }
  if (error instanceof TiendaSinPermiso || error instanceof TraceabilityAccessError) return { error: t("error_sin_permiso") };
  throw error;
}

/**
 * ADR-163 — asignar envases de un lote envasado a una variante. **No toca el inventario**: eso
 * lo hace la recepción en la tienda. La fecha es de DÍA y no se rellena con «hoy».
 */
export async function asignarATiendaAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Tienda");
  const lotId = String(formData.get("lotId") ?? "");
  try {
    const dia = fechaDeDia(String(formData.get("assignedAt") ?? ""), "assignedAt");
    if (!dia) return { error: t("error_falta_la_fecha") };
    await asignarATienda(user.userAccountId, {
      lotId,
      productVariantId: String(formData.get("productVariantId") ?? ""),
      unitsAssigned: String(formData.get("unitsAssigned") ?? ""),
      assignedAt: dia,
    });
  } catch (error) {
    return rechazo(error);
  }
  revalidatePath(`/lots/${lotId}`);
  revalidatePath("/tienda");
  return { ok: true };
}

/** ADR-163 — confirmar lo que llegó. Es lo único que sube el inventario de la tienda. */
export async function confirmarRecepcionAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Tienda");
  try {
    const dia = fechaDeDia(String(formData.get("receivedAt") ?? ""), "receivedAt");
    if (!dia) return { error: t("error_falta_la_fecha") };
    await confirmarRecepcion(user.userAccountId, {
      allocationId: String(formData.get("allocationId") ?? ""),
      unitsReceived: String(formData.get("unitsReceived") ?? ""),
      receiptNote: String(formData.get("receiptNote") ?? ""),
      receivedAt: dia,
    });
  } catch (error) {
    return rechazo(error);
  }
  revalidatePath("/tienda");
  return { ok: true };
}

/** ADR-163 — crear una variante de un producto. El precio lo da quien lleva la tienda. */
export async function crearVarianteAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await crearVariante(user.userAccountId, {
      productId: String(formData.get("productId") ?? ""),
      variantName: String(formData.get("variantName") ?? ""),
      sku: String(formData.get("sku") ?? ""),
      priceAmount: String(formData.get("priceAmount") ?? ""),
    });
  } catch (error) {
    return rechazo(error);
  }
  revalidatePath("/tienda");
  return { ok: true };
}
