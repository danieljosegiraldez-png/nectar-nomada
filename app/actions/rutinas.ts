"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getCurrentUser } from "../../lib/auth/session";
import { insumosDelFormulario } from "../../lib/rutinas/insumosDelFormulario";
import { lugarParaVolver, rutaDeLugar } from "../../lib/rutinas/lugares";
import {
  RutinaError,
  anularRegistro,
  cambiarIntervalo,
  crearRutina,
  registrarRealizada,
  retirarRutina,
} from "../../lib/rutinas/rutinas";
import { MaterialConsumptionValidationError } from "../../lib/traceability/operations";
import { fechaDeDia } from "../../lib/time/localDateTime";
import type { CareRoutineKind, ProvenanceClass } from "../../generated/prisma/client";

/**
 * Rutinas de equipo o de lugar (Tarea 9, spec §3.4; lugares en spec 2026-09-19 §5).
 * Misma forma que `app/actions/modelos.ts`: `destino` se calcula dentro del `try`,
 * y `redirect()` se llama UNA sola vez al final, fuera de cualquier `catch` — así
 * su excepción de control (`NEXT_REDIRECT`) nunca se confunde con el error de
 * dominio que el `catch` sí debe atrapar.
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

/**
 * A dónde vuelve: la ficha del equipo, o la pantalla del lugar (spec 2026-09-19
 * §5). `lugarParaVolver` exige permiso (Hallazgo A, ola de arreglos de revisión
 * final): sin él, cae a `/instalaciones` en vez de revelar el tipo/padre del
 * lugar por la URL.
 */
async function volverA(userAccountId: string, f: FormData): Promise<string> {
  const equipmentId = String(f.get("equipmentId") ?? "");
  if (equipmentId) return `/equipos/${equipmentId}`;
  const locationId = String(f.get("locationId") ?? "");
  const l = await lugarParaVolver(userAccountId, locationId);
  return l ? rutaDeLugar(l) : "/instalaciones";
}

export async function crearRutinaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const base = await volverA(user.userAccountId, formData);

  let destino: string;
  try {
    const kindNote = String(formData.get("kindNote") ?? "").trim();
    const instructions = String(formData.get("instructions") ?? "").trim();
    await crearRutina(user.userAccountId, {
      equipmentId: equipmentId || null,
      locationId: String(formData.get("locationId") ?? "") || null,
      kind: String(formData.get("kind") ?? "") as CareRoutineKind,
      kindNote: kindNote || null,
      intervalDays: diasOFalla(formData, "intervalDays"),
      instructions: instructions || null,
    });
    if (equipmentId) revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    revalidatePath(base);
    destino = `${base}?ok=rutina_creada`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `${base}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function registrarRealizadaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const base = await volverA(user.userAccountId, formData);

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
      insumos: insumosDelFormulario(formData),
    });
    if (equipmentId) revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    revalidatePath(base);
    destino = `${base}?ok=rutina_registrada`;
  } catch (error) {
    if (error instanceof MaterialConsumptionValidationError) {
      destino = `${base}?error=${error.message.startsWith("unidad distinta") ? "unidad_distinta" : "consumo_invalido"}`;
    } else if (error instanceof RutinaError) {
      destino = `${base}?error=${encodeURIComponent(error.message)}`;
    } else {
      throw error;
    }
  }
  redirect(destino);
}

export async function anularRegistroFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const base = await volverA(user.userAccountId, formData);

  let destino: string;
  try {
    await anularRegistro(
      user.userAccountId,
      String(formData.get("eventId") ?? ""),
      String(formData.get("motivo") ?? ""),
    );
    if (equipmentId) revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    revalidatePath(base);
    destino = `${base}?ok=rutina_anulada`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `${base}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function cambiarIntervaloFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const base = await volverA(user.userAccountId, formData);

  let destino: string;
  try {
    await cambiarIntervalo(user.userAccountId, String(formData.get("routineId") ?? ""), diasOFalla(formData, "intervalDays"));
    if (equipmentId) revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    revalidatePath(base);
    destino = `${base}?ok=datos`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `${base}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}

export async function retirarRutinaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const equipmentId = String(formData.get("equipmentId") ?? "");
  const base = await volverA(user.userAccountId, formData);

  let destino: string;
  try {
    await retirarRutina(user.userAccountId, String(formData.get("routineId") ?? ""), new Date());
    if (equipmentId) revalidatePath(`/equipos/${equipmentId}`);
    revalidatePath("/equipos");
    revalidatePath(base);
    destino = `${base}?ok=datos`;
  } catch (error) {
    if (!(error instanceof RutinaError)) throw error;
    destino = `${base}?error=${encodeURIComponent(error.message)}`;
  }
  redirect(destino);
}
