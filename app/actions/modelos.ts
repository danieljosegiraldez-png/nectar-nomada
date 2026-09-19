"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { CatalogoError } from "../../lib/catalogos/propiedad";
import {
  ModeloError,
  crearModelo,
  declararEspecificacion,
  editarModelo,
  retirarEspecificacion,
  retirarModelo,
  type DatosDeModelo,
  type EspecificacionInput,
} from "../../lib/equipos/modelos";
import type { EquipmentContactMaterial, EquipmentKind, ProvenanceClass } from "../../generated/prisma/client";

function datosDelFormulario(f: FormData): DatosDeModelo {
  const s = (k: string) => String(f.get(k) ?? "").trim();
  const dias = s("recommendedMaintenanceDays");
  const material = s("contactMaterial");
  return {
    manufacturer: s("manufacturer"),
    modelName: s("modelName"),
    // Vacío es «el fabricante no lo dice», nunca 0 (ADR-080).
    recommendedMaintenanceDays: dias === "" ? null : Number(dias),
    capacityValue: s("capacityValue") || null,
    capacityUnit: s("capacityUnit") || null,
    contactMaterial: (material || null) as EquipmentContactMaterial | null,
    contactMaterialNote: s("contactMaterialNote") || null,
    provenanceClass: (s("provenanceClass") || "manufacturer_specification") as ProvenanceClass,
    sourceReference: s("sourceReference") || null,
    notes: s("notes") || null,
  };
}

/** `volverA` sólo se acepta si empieza por `/equipos/nuevo`: nada de redirecciones abiertas. */
function volverASeguro(f: FormData): string {
  const v = String(f.get("volverA") ?? "");
  return v.startsWith("/equipos/nuevo") ? v : "";
}

/**
 * `ModeloError` y `CatalogoError` traen un mensaje legible (`modelo_duplicado`,
 * `forbidden`, `capacidad_con_unidad`…) que la página necesita para no reventar
 * contra la pantalla de error genérica de Next. Todo lo demás se relanza.
 */
function esErrorDeCatalogo(e: unknown): e is ModeloError | CatalogoError {
  return e instanceof ModeloError || e instanceof CatalogoError;
}

/**
 * Alta de un modelo. El dueño llega como `compartido` o como el id de un SITIO; la
 * organización la deriva el servicio del sitio (spec §2.5), no el formulario.
 *
 * **`redirect()` se llama UNA sola vez, al final, fuera del `try`.** Adentro
 * sólo se calcula a dónde ir (`destino`): así el `redirect()` de éxito nunca
 * queda envuelto por el mismo `try` que atrapa los errores del servicio, y no
 * hay riesgo de que su excepción de control (`NEXT_REDIRECT`) se confunda con
 * un fallo real.
 */
export async function crearModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dueno = String(formData.get("dueno") ?? "");
  const kind = String(formData.get("kind") ?? "instrument") as EquipmentKind;
  const volverA = volverASeguro(formData);

  // Filas de especificación del mismo formulario: `spec_quantity_0`, `spec_unit_0`…
  // Van DENTRO de `crearModelo`, que las escribe en la misma transacción que el
  // modelo: una fila mala no deja un modelo a medias.
  const especificaciones: EspecificacionInput[] = [];
  if (kind === "instrument") {
    for (let i = 0; formData.has(`spec_quantity_${i}`); i++) {
      const q = String(formData.get(`spec_quantity_${i}`) ?? "").trim();
      const u = String(formData.get(`spec_unit_${i}`) ?? "").trim();
      if (!q && !u) continue;
      especificaciones.push({
        quantity: q,
        unit: u,
        rangeMin: String(formData.get(`spec_rangeMin_${i}`) ?? "") || null,
        rangeMax: String(formData.get(`spec_rangeMax_${i}`) ?? "") || null,
        resolution: String(formData.get(`spec_resolution_${i}`) ?? "") || null,
        accuracyAbs: String(formData.get(`spec_accuracyAbs_${i}`) ?? "") || null,
      });
    }
  }

  let destino: string;
  try {
    const modelo = await crearModelo(user.userAccountId, {
      ...datosDelFormulario(formData),
      kind,
      dueno: dueno === "compartido" ? { tipo: "compartido" } : { tipo: "propio", locationId: dueno },
      especificaciones,
    });
    revalidatePath("/equipos/modelos");
    destino = volverA
      ? `${volverA}${volverA.includes("?") ? "&" : "?"}modelo=${modelo.id}`
      : `/equipos/modelos/${modelo.id}?ok=creado`;
  } catch (error) {
    if (!esErrorDeCatalogo(error)) throw error;
    const params = new URLSearchParams({ error: error.message });
    if (volverA) params.set("volverA", volverA);
    destino = `/equipos/modelos/nuevo?${params.toString()}`;
  }
  redirect(destino);
}

/** Editar los datos de un modelo. Tipo y dueño no se tocan aquí. */
export async function editarModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");

  let destino: string;
  try {
    await editarModelo(user.userAccountId, modelId, datosDelFormulario(formData));
    revalidatePath("/equipos/modelos");
    revalidatePath(`/equipos/modelos/${modelId}`);
    destino = `/equipos/modelos/${modelId}?ok=editado`;
  } catch (error) {
    if (!esErrorDeCatalogo(error)) throw error;
    destino = `/equipos/modelos/${modelId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

/** Retirar un modelo. Nada se borra: `retiredAt`. */
export async function retirarModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");

  let destino: string;
  try {
    await retirarModelo(user.userAccountId, modelId, new Date());
    revalidatePath("/equipos/modelos");
    revalidatePath(`/equipos/modelos/${modelId}`);
    destino = `/equipos/modelos/${modelId}?ok=retirado`;
  } catch (error) {
    if (!esErrorDeCatalogo(error)) throw error;
    destino = `/equipos/modelos/${modelId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

/** Declarar una especificación vigente de un modelo de instrumento. */
export async function declararEspecificacionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");

  let destino: string;
  try {
    await declararEspecificacion(user.userAccountId, modelId, {
      quantity: String(formData.get("quantity") ?? ""),
      unit: String(formData.get("unit") ?? ""),
      rangeMin: String(formData.get("rangeMin") ?? "") || null,
      rangeMax: String(formData.get("rangeMax") ?? "") || null,
      resolution: String(formData.get("resolution") ?? "") || null,
      accuracyAbs: String(formData.get("accuracyAbs") ?? "") || null,
    });
    revalidatePath(`/equipos/modelos/${modelId}`);
    destino = `/equipos/modelos/${modelId}?ok=editado`;
  } catch (error) {
    if (!esErrorDeCatalogo(error)) throw error;
    destino = `/equipos/modelos/${modelId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

/** Retirar una especificación. Nada se borra: `retiredAt`. */
export async function retirarEspecificacionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");
  const specId = String(formData.get("specId") ?? "");

  let destino: string;
  try {
    await retirarEspecificacion(user.userAccountId, specId, new Date());
    revalidatePath(`/equipos/modelos/${modelId}`);
    destino = `/equipos/modelos/${modelId}?ok=retirado`;
  } catch (error) {
    if (!esErrorDeCatalogo(error)) throw error;
    destino = `/equipos/modelos/${modelId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}
