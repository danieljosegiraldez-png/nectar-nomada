"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import {
  crearModelo,
  declararEspecificacion,
  editarModelo,
  retirarEspecificacion,
  retirarModelo,
  type DatosDeModelo,
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
 * Alta de un modelo. El dueño llega como `compartido` o como el id de un SITIO; la
 * organización la deriva el servicio del sitio (spec §2.5), no el formulario.
 */
export async function crearModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const dueno = String(formData.get("dueno") ?? "");
  const kind = String(formData.get("kind") ?? "instrument") as EquipmentKind;
  const modelo = await crearModelo(user.userAccountId, {
    ...datosDelFormulario(formData),
    kind,
    dueno: dueno === "compartido" ? { tipo: "compartido" } : { tipo: "propio", locationId: dueno },
  });
  // Filas de especificación del mismo formulario: `spec_quantity_0`, `spec_unit_0`…
  if (kind === "instrument") {
    for (let i = 0; formData.has(`spec_quantity_${i}`); i++) {
      const q = String(formData.get(`spec_quantity_${i}`) ?? "").trim();
      const u = String(formData.get(`spec_unit_${i}`) ?? "").trim();
      if (!q && !u) continue;
      await declararEspecificacion(user.userAccountId, modelo.id, {
        quantity: q,
        unit: u,
        rangeMin: String(formData.get(`spec_rangeMin_${i}`) ?? "") || null,
        rangeMax: String(formData.get(`spec_rangeMax_${i}`) ?? "") || null,
        resolution: String(formData.get(`spec_resolution_${i}`) ?? "") || null,
        accuracyAbs: String(formData.get(`spec_accuracyAbs_${i}`) ?? "") || null,
      });
    }
  }
  revalidatePath("/equipos/modelos");
  const volverA = volverASeguro(formData);
  redirect(volverA ? `${volverA}${volverA.includes("?") ? "&" : "?"}modelo=${modelo.id}` : `/equipos/modelos/${modelo.id}?ok=creado`);
}

/** Editar los datos de un modelo. Tipo y dueño no se tocan aquí. */
export async function editarModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");
  await editarModelo(user.userAccountId, modelId, datosDelFormulario(formData));
  revalidatePath("/equipos/modelos");
  revalidatePath(`/equipos/modelos/${modelId}`);
  redirect(`/equipos/modelos/${modelId}?ok=editado`);
}

/** Retirar un modelo. Nada se borra: `retiredAt`. */
export async function retirarModeloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");
  await retirarModelo(user.userAccountId, modelId, new Date());
  revalidatePath("/equipos/modelos");
  revalidatePath(`/equipos/modelos/${modelId}`);
  redirect(`/equipos/modelos/${modelId}?ok=retirado`);
}

/** Declarar una especificación vigente de un modelo de instrumento. */
export async function declararEspecificacionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");
  await declararEspecificacion(user.userAccountId, modelId, {
    quantity: String(formData.get("quantity") ?? ""),
    unit: String(formData.get("unit") ?? ""),
    rangeMin: String(formData.get("rangeMin") ?? "") || null,
    rangeMax: String(formData.get("rangeMax") ?? "") || null,
    resolution: String(formData.get("resolution") ?? "") || null,
    accuracyAbs: String(formData.get("accuracyAbs") ?? "") || null,
  });
  revalidatePath(`/equipos/modelos/${modelId}`);
  redirect(`/equipos/modelos/${modelId}?ok=editado`);
}

/** Retirar una especificación. Nada se borra: `retiredAt`. */
export async function retirarEspecificacionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const modelId = String(formData.get("modelId") ?? "");
  const specId = String(formData.get("specId") ?? "");
  await retirarEspecificacion(user.userAccountId, specId, new Date());
  revalidatePath(`/equipos/modelos/${modelId}`);
  redirect(`/equipos/modelos/${modelId}?ok=retirado`);
}
