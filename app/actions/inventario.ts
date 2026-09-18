"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import { crearMaterial } from "../../lib/inventario/materiales";
import { recibirLote } from "../../lib/inventario/lotes";
import { CAMPOS_DEL_PRODUCTO, completarProducto, opcionesDeRecepcion, type CampoDelProducto } from "../../lib/inventario/recepcion";
import { fechaDeDia } from "../../lib/time/localDateTime";

/**
 * Recibir un medicamento en el botiquín — botiquín, Tarea 9.
 *
 * Un producto NUEVO se crea con sus campos; uno existente sólo se COMPLETA en lo
 * que aún no declara (`completarProducto` nunca sobrescribe). Después, el frasco.
 * Son dos escrituras de dos servicios: si el frasco falla, el producto queda
 * creado —es catálogo, no existencias— y el formulario puede reintentarse
 * eligiéndolo.
 *
 * Un campo vacío se envía como nulo, nunca como cero: cero días de carencia es
 * una respuesta, un campo vacío es que nadie la dio.
 */
export async function recibirMedicamentoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const texto = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    return bruto === "" ? null : bruto;
  };
  const numero = (clave: string) => {
    const bruto = texto(clave);
    if (bruto === null) return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  };

  const locationId = texto("locationId") ?? "";
  const sitio = (await opcionesDeRecepcion(user.userAccountId)).sitios.find((s) => s.id === locationId);
  if (!sitio) redirect("/inventario/recibir?error=sitio");

  const campos: Partial<Record<CampoDelProducto, string | number | null>> = {};
  for (const c of CAMPOS_DEL_PRODUCTO) {
    campos[c] = c === "defaultWithdrawalDays" || c === "avisarDiasAntes" ? numero(`p_${c}`) : texto(`p_${c}`);
  }

  let materialId = texto("materialId");
  const unit = texto("unit") ?? "";
  if (materialId === "__nuevo__") {
    const creado = await crearMaterial(user.userAccountId, {
      locationId,
      organizationId: sitio.organizationId,
      name: texto("nuevoNombre") ?? "",
      defaultUnit: unit,
      isVeterinaryMedicine: true,
      manufacturer: texto("p_manufacturer"),
      activeIngredient: texto("p_activeIngredient"),
      sanitaryRegistration: texto("p_sanitaryRegistration"),
      defaultWithdrawalDays: numero("p_defaultWithdrawalDays"),
      avisarDiasAntes: numero("p_avisarDiasAntes"),
      storageConditions: texto("p_storageConditions"),
      safetyNotes: texto("p_safetyNotes"),
    });
    materialId = creado.id;
  } else if (materialId && sitio.puedeDefinirProducto && Object.values(campos).some((v) => v != null)) {
    await completarProducto(user.userAccountId, { materialId, locationId, campos });
  }

  await recibirLote(user.userAccountId, {
    locationId,
    materialId: materialId ?? "",
    batchLabel: texto("batchLabel") ?? "",
    quantity: numero("quantity"),
    unit,
    // Campo de DÍA: medianoche UTC, como el resto de fechas de día de la casa.
    expiresAt: fechaDeDia(texto("expiresAt"), "expiresAt"),
    presentation: texto("presentation"),
    supplier: texto("supplier"),
    supplierAddress: texto("supplierAddress"),
    invoiceReference: texto("invoiceReference"),
    notes: texto("notes"),
  });

  revalidatePath("/inventario");
  redirect("/inventario?ok=recibido");
}
