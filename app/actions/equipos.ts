"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import { informarCondicion, verificarInstrumento, type ContrasteObservado } from "../../lib/equipos/equipos";
import { TZ_OFFSET_FIELD, parseLocalDateTime } from "../../lib/time/localDateTime";

/**
 * Verificar un instrumento contra sus patrones.
 *
 * **Un patrón sin valor escrito se OMITE, no se envía como cero.** El agua
 * destilada vale 0 °Bx, así que un campo vacío interpretado como cero produciría
 * un contraste aprobado sobre algo que nadie miró — el mismo cero peligroso que
 * el trigger de la base evita por el otro lado. Si no queda ninguno, el servicio
 * rechaza la verificación entera.
 */
export async function verificarInstrumentoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const equipmentId = String(formData.get("equipmentId") ?? "");
  const contrastes: ContrasteObservado[] = [];
  for (const [clave, valor] of formData.entries()) {
    if (!clave.startsWith("observado_")) continue;
    const texto = String(valor).trim();
    if (texto === "") continue;
    const n = Number(texto);
    if (!Number.isFinite(n)) continue;
    contrastes.push({ requirementId: clave.slice("observado_".length), observedValue: n });
  }

  const tempTexto = String(formData.get("ambientTempC") ?? "").trim();

  await verificarInstrumento(user.userAccountId, {
    equipmentId,
    // El desfase del dispositivo lo manda el formulario; sin él esto fallaría en
    // vez de suponer una zona. Es la trampa de husos horarios que costó nueve
    // sitios en tres módulos, y `parseLocalDateTime` es su arreglo.
    occurredAt: parseLocalDateTime(String(formData.get("occurredAt") ?? ""), String(formData.get(TZ_OFFSET_FIELD) ?? "")),
    contrastes,
    performedByPersonId: String(formData.get("performedByPersonId") ?? "") || null,
    ambientTempC: tempTexto === "" ? null : Number(tempTexto),
    note: String(formData.get("note") ?? "") || null,
  });

  revalidatePath("/equipos");
  revalidatePath(`/equipos/${equipmentId}`);
  redirect(`/equipos/${equipmentId}?ok=verificado`);
}

/** Informar de la condición de un equipo. Exige `report_condition`, no `manage`. */
export async function informarCondicionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const equipmentId = String(formData.get("equipmentId") ?? "");
  await informarCondicion(user.userAccountId, {
    equipmentId,
    condition: String(formData.get("condition") ?? "operational") as
      | "operational"
      | "needs_cleaning"
      | "needs_maintenance"
      | "faulty"
      | "out_of_service",
    occurredAt: parseLocalDateTime(String(formData.get("occurredAt") ?? ""), String(formData.get(TZ_OFFSET_FIELD) ?? "")),
    note: String(formData.get("note") ?? "") || null,
  });

  revalidatePath("/equipos");
  revalidatePath(`/equipos/${equipmentId}`);
  redirect(`/equipos/${equipmentId}?ok=condicion`);
}
