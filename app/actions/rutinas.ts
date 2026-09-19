"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import {
  RutinaError,
  anularRegistro,
  cambiarIntervalo,
  crearRutina,
  registrarRealizada,
  retirarRutina,
} from "../../lib/rutinas/rutinas";
import { fechaDeDia } from "../../lib/time/localDateTime";
import type { CareRoutineKind, ProvenanceClass } from "../../generated/prisma/client";

/**
 * Rutinas de equipo (Tarea 9, spec §3.4). Misma forma que `app/actions/modelos.ts`:
 * `destino` se calcula dentro del `try`, y `redirect()` se llama UNA sola vez al
 * final, fuera de cualquier `catch` — así su excepción de control (`NEXT_REDIRECT`)
 * nunca se confunde con el error de dominio que el `catch` sí debe atrapar.
 *
 * Sólo se atrapa `RutinaError`: cualquier otra cosa se relanza y revienta con la
 * pantalla de error de siempre, que es lo que se quiere de un fallo que no es de
 * este dominio.
 */

/** Un intervalo vacío nunca es 0 (CLAUDE.md): se rechaza aquí, antes de llegar al servicio. */
function diasOFalla(f: FormData, campo: string): number {
  const texto = String(f.get(campo) ?? "").trim();
  if (texto === "") throw new RutinaError("intervalo_positivo");
  return Number(texto);
}

export async function crearRutinaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  let destino: string;
  try {
    const kindNote = String(formData.get("kindNote") ?? "").trim();
    const instructions = String(formData.get("instructions") ?? "").trim();
    await crearRutina(user.userAccountId, {
      equipmentId,
      kind: String(formData.get("kind") ?? "") as CareRoutineKind,
      kindNote: kindNote || null,
      intervalDays: diasOFalla(formData, "intervalDays"),
      instructions: instructions || null,
    });
    revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    destino = `/equipos/${equipmentId}?ok=rutina_creada`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `/equipos/${equipmentId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function registrarRealizadaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  let destino: string;
  try {
    const performedOn = fechaDeDia(formData.get("performedOn") as string | null, "performedOn");
    if (!performedOn) throw new RutinaError("fecha_obligatoria");
    await registrarRealizada(user.userAccountId, {
      routineId: String(formData.get("routineId") ?? ""),
      performedOn,
      performedByPersonId: String(formData.get("performedByPersonId") ?? "") || null,
      note: String(formData.get("note") ?? "") || null,
      provenanceClass: (String(formData.get("provenanceClass") ?? "") || "original_record") as ProvenanceClass,
    });
    revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    destino = `/equipos/${equipmentId}?ok=rutina_registrada`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `/equipos/${equipmentId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function anularRegistroFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  let destino: string;
  try {
    await anularRegistro(
      user.userAccountId,
      String(formData.get("eventId") ?? ""),
      String(formData.get("motivo") ?? ""),
    );
    revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    destino = `/equipos/${equipmentId}?ok=rutina_anulada`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `/equipos/${equipmentId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function cambiarIntervaloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  let destino: string;
  try {
    await cambiarIntervalo(user.userAccountId, String(formData.get("routineId") ?? ""), diasOFalla(formData, "intervalDays"));
    revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    destino = `/equipos/${equipmentId}?ok=datos`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `/equipos/${equipmentId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function retirarRutinaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");

  let destino: string;
  try {
    await retirarRutina(user.userAccountId, String(formData.get("routineId") ?? ""), new Date());
    revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    destino = `/equipos/${equipmentId}?ok=datos`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `/equipos/${equipmentId}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}
