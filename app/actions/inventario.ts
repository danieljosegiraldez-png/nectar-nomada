"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import { crearMaterial } from "../../lib/inventario/materiales";
import { esPlaga } from "../../lib/traceability/plagas";
import { recibirLote } from "../../lib/inventario/lotes";
import { CAMPOS_NUMERICOS, camposDe, completarProducto, opcionesDeRecepcion, type CampoDelProducto, type ClaseDeProducto } from "../../lib/inventario/recepcion";
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
/**
 * El uso declarado, o nulo. **No se acepta cualquier cadena que llegue del formulario**: un valor
 * fuera del enum haría reventar el insert con un error de Postgres en vez de guardarse como «sin
 * declarar», que es lo que un campo opcional debe hacer cuando llega vacío o mal.
 */
function usoDeProducto(valor: string | null): "preventivo" | "control" | null {
  return valor === "preventivo" || valor === "control" ? valor : null;
}

/**
 * «si»/«no» del desplegable a booleano, y **cualquier otra cosa a NULO**.
 *
 * El hueco tiene que sobrevivir el viaje: un `Boolean(valor)` convertiría «sin responder» en
 * `false`, o sea en la afirmación «este producto no daña polinizadores» sobre un producto del que
 * nadie dijo nada. Esta casa deja faltando lo que falta.
 */
function danaPolinizadores(valor: string | null): boolean | null {
  if (valor === "si") return true;
  if (valor === "no") return false;
  return null;
}

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

  const claseBruta = texto("clase");
  if (claseBruta !== "medicamento" && claseBruta !== "fitosanitario") redirect("/inventario/recibir?error=clase");
  const clase: ClaseDeProducto = claseBruta;

  const locationId = texto("locationId") ?? "";
  const sitio = (await opcionesDeRecepcion(user.userAccountId, clase)).sitios.find((s) => s.id === locationId);
  if (!sitio) redirect("/inventario/recibir?error=sitio");

  const campos: Partial<Record<CampoDelProducto, string | number | null>> = {};
  for (const c of camposDe(clase)) {
    // De la lista, no de una cadena de `===`: ésa es la copia que se olvida el día que entra un campo.
    campos[c] = CAMPOS_NUMERICOS.has(c) ? numero(`p_${c}`) : texto(`p_${c}`);
  }

  let materialId = texto("materialId");
  const unit = texto("unit") ?? "";
  if (materialId === "__nuevo__") {
    const creado = await crearMaterial(user.userAccountId, {
      locationId,
      organizationId: sitio.organizationId,
      name: texto("nuevoNombre") ?? "",
      defaultUnit: unit,
      isVeterinaryMedicine: clase === "medicamento",
      isPlantProtection: clase === "fitosanitario",
      manufacturer: texto("p_manufacturer"),
      activeIngredient: texto("p_activeIngredient"),
      sanitaryRegistration: texto("p_sanitaryRegistration"),
      defaultWithdrawalDays: numero("p_defaultWithdrawalDays"),
      avisarDiasAntes: numero("p_avisarDiasAntes"),
      defaultReentryHours: numero("p_defaultReentryHours"),
      storageConditions: texto("p_storageConditions"),
      safetyNotes: texto("p_safetyNotes"),
      // Lo que hace consistente el registro de una aplicación (Daniel, 2026-09-30). Sólo llega
      // con clase `fitosanitario`: `camposDe` no ofrece estos campos para un medicamento.
      plantProtectionUse: usoDeProducto(texto("p_plantProtectionUse")),
      doseMin: numero("p_doseMin"),
      doseMax: numero("p_doseMax"),
      doseUnit: texto("p_doseUnit"),
      plantProtectionTargets: formData.getAll("p_plantProtectionTargets").filter(esPlaga),
      harmfulToPollinators: danaPolinizadores(texto("p_harmfulToPollinators")),
    });
    materialId = creado.id;
  } else if (materialId && sitio.puedeDefinirProducto) {
    // Las plagas van aparte de `campos` —son una lista— así que también cuentan para decidir si
    // hay algo que completar. Sin esto, marcar sólo plagas no escribía nada y no lo decía.
    const plagas = formData.getAll("p_plantProtectionTargets").filter(esPlaga);
    if (Object.values(campos).some((v) => v != null) || plagas.length > 0) {
      await completarProducto(user.userAccountId, { materialId, locationId, campos, plantProtectionTargets: plagas });
    }
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
