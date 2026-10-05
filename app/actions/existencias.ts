"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { getCurrentUser } from "../../lib/auth/session";
import {
  ExistenciasError,
  reconciliar,
  registrarConteo,
  registrarMerma,
  registrarPerdida,
} from "../../lib/inventario/existencias";

/**
 * Las cuatro acciones de existencias — la puerta que al servicio le faltaba.
 *
 * **El servicio estaba entero y probado desde el 2026-09-17 y ninguna pantalla lo
 * llamaba.** Medido el 2026-10-04: `/inventario` imprimía «hay que cuadrarlo» y
 * «nadie sabe todavía cuánto hay» y no ofrecía dónde hacerlo. Es la misma forma
 * que el rango de microparcela: el sistema pide un dato que ninguna pantalla
 * puede dar.
 *
 * **Las cuatro exigen `lot:manage`, y eso NO cambia.** Decisión de Daniel,
 * 2026-10-04, sobre el §7.1 del spec de inventario, que la dejaba abierta
 * («¿mismo permiso o distinto, como `lot:release`?»): mismo permiso. Así que aquí
 * no se comprueba nada que el servicio no comprobara ya — el guardia vive donde
 * siempre vivió.
 *
 * **Consumir no está aquí a propósito:** ya tiene puerta por las intervenciones
 * fitosanitarias. Tampoco la custodia ni la foto de etiqueta, que son otras piezas.
 */
export interface EstadoDeExistencias {
  error?: string;
}

/**
 * Un error del servicio vuelve como frase, no como 500.
 *
 * `ExistenciasError` trae el detalle legible dentro —«una reconciliación sin razón
 * no se puede auditar»— así que se pasa como parámetro en vez de inventarle una
 * clave por caso. `tests/arquitectura/acciones-traducen-sus-errores.test.ts`
 * vigila que ninguna clase que estas acciones puedan recibir se quede sin rama.
 */
async function frase(error: unknown): Promise<string> {
  const t = await getTranslations("Inventario");
  if (error instanceof ExistenciasError) return t("error_existencias", { detail: error.message });
  throw error;
}

/** Lo que las cuatro comparten: la sesión, el lote, la cantidad y la unidad. */
async function comun(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const texto = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    return bruto === "" ? null : bruto;
  };
  const cantidad = Number(texto("quantity"));
  return {
    userAccountId: user.userAccountId,
    consumableLotId: texto("consumableLotId") ?? "",
    // `Number(null)` es 0 y `Number("")` también: un campo vacío se manda como
    // `NaN` para que el servicio lo rechace, en vez de contar un cero que nadie dijo.
    quantity: Number.isFinite(cantidad) ? cantidad : Number.NaN,
    unit: texto("unit") ?? "",
    reason: texto("reason"),
  };
}

/** Repinta la lista y la ficha del lote: el saldo cambió en las dos. */
function repintar(consumableLotId: string) {
  revalidatePath("/inventario");
  revalidatePath(`/inventario/lotes/${consumableLotId}`);
}

export async function contarFormAction(
  _prev: EstadoDeExistencias,
  formData: FormData,
): Promise<EstadoDeExistencias> {
  const { userAccountId, consumableLotId, quantity, unit } = await comun(formData);
  try {
    await registrarConteo(userAccountId, { consumableLotId, quantity, unit });
  } catch (error) {
    return { error: await frase(error) };
  }
  repintar(consumableLotId);
  return {};
}

export async function cuadrarFormAction(
  _prev: EstadoDeExistencias,
  formData: FormData,
): Promise<EstadoDeExistencias> {
  const { userAccountId, consumableLotId, quantity, unit, reason } = await comun(formData);
  // **La dirección se manda SIEMPRE, nunca por omisión.** El servicio asume `alza`
  // cuando falta, así que dejársela haría que cuadrar un faltante sumara.
  const direccion = String(formData.get("direccion") ?? "") === "baja" ? "baja" : "alza";
  try {
    await reconciliar(userAccountId, { consumableLotId, quantity, unit, reason: reason ?? "", direccion });
  } catch (error) {
    return { error: await frase(error) };
  }
  repintar(consumableLotId);
  return {};
}

export async function botarFormAction(
  _prev: EstadoDeExistencias,
  formData: FormData,
): Promise<EstadoDeExistencias> {
  const { userAccountId, consumableLotId, quantity, unit, reason } = await comun(formData);
  try {
    await registrarMerma(userAccountId, { consumableLotId, quantity, unit, reason });
  } catch (error) {
    return { error: await frase(error) };
  }
  repintar(consumableLotId);
  return {};
}

export async function perderFormAction(
  _prev: EstadoDeExistencias,
  formData: FormData,
): Promise<EstadoDeExistencias> {
  const { userAccountId, consumableLotId, quantity, unit, reason } = await comun(formData);
  try {
    await registrarPerdida(userAccountId, { consumableLotId, quantity, unit, reason });
  } catch (error) {
    return { error: await frase(error) };
  }
  repintar(consumableLotId);
  return {};
}
