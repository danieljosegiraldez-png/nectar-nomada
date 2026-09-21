"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { bajarBandeja, BandejaError, cargarBandeja, moverBandeja } from "../../lib/traceability/bandejasDelSecado";
import { TraceabilityAccessError } from "../../lib/traceability/lots";

type Estado = { error?: string };

// Sin `export`: de un archivo "use server" sólo salen funciones async.
function textoOVacio(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}
function numeroOVacio(v: FormDataEntryValue | null): number | null {
  const s = textoOVacio(v);
  return s === null ? null : Number(s);
}

function codigo(error: unknown): string {
  if (error instanceof BandejaError) return error.codigo;
  if (error instanceof TraceabilityAccessError) return "sin_acceso";
  throw error;
}

export async function cargarBandejaAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lotId = String(formData.get("lotId") ?? "");
  try {
    await cargarBandeja(user.userAccountId, {
      dryingRunId: String(formData.get("dryingRunId") ?? ""),
      equipmentId: String(formData.get("equipmentId") ?? ""),
      desde: new Date(),
    });
  } catch (error) {
    return { error: codigo(error) };
  }
  revalidatePath(`/lots/${lotId}`);
  return {};
}

export async function bajarBandejaAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const lotId = String(formData.get("lotId") ?? "");
  // Bajar la última cierra el secado: su formulario trae los mismos datos que el
  // cierre de siempre (`endDryingFormAction`). En las demás no vienen.
  const esUltima = formData.get("esUltima") === "1";
  try {
    await bajarBandeja(user.userAccountId, {
      dryingRunTrayId: String(formData.get("dryingRunTrayId") ?? ""),
      hasta: new Date(),
      cierre: esUltima ? {
        outputLotCode: String(formData.get("outputLotCode") ?? ""),
        // Mismo tratamiento que `endDryingFormAction`: el valor sale de la lista LOT_TYPES del formulario.
        outputLotType: String(formData.get("outputLotType") ?? "green") as never,
        quantity: numeroOVacio(formData.get("quantity")),
        unit: textoOVacio(formData.get("unit")),
        provenanceClass: "original_record",
      } : null,
    });
  } catch (error) {
    return { error: codigo(error) };
  }
  revalidatePath(`/lots/${lotId}`);
  return {};
}

export async function moverBandejaAction(_prev: Estado, formData: FormData): Promise<Estado> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // `lotId` sólo llega desde la ficha del lote; desde /beneficio/bandejas
  // (quien configura moviendo una bandeja vacía) no hay lote que revalidar.
  const lotId = textoOVacio(formData.get("lotId"));
  try {
    await moverBandeja(user.userAccountId, {
      equipmentId: String(formData.get("equipmentId") ?? ""),
      posicionId: String(formData.get("posicionId") ?? ""),
      occurredAt: new Date(),
    });
  } catch (error) {
    return { error: codigo(error) };
  }
  if (lotId) revalidatePath(`/lots/${lotId}`);
  revalidatePath("/beneficio/bandejas");
  return {};
}
