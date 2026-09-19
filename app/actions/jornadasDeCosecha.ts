"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { JornadaError, abrirJornada, agregarRecolector, cerrarJornada } from "../../lib/traceability/jornadasDeCosecha";
import {
  EntregaError,
  anotarEntrega,
  anularEntrega,
  confirmarFotoDeEntrega,
  pedirSubidaDeFotoDeEntrega,
  type OrigenDeEntrega,
} from "../../lib/traceability/entregasDeCosecha";
import {
  SituacionError,
  confirmarFotoDeSituacion,
  pedirSubidaDeFotoDeSituacion,
  reportarCondicionDelDia,
  reportarSituacion,
} from "../../lib/traceability/situacionesDeCampo";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { FechaDeDiaInvalida, LocalDateTimeError, TZ_OFFSET_FIELD, fechaDeDia, parseLocalDateTime } from "../../lib/time/localDateTime";

/**
 * Spec 2026-09-18 jornada y entrega de cosecha §3.6 — las acciones de la jornada (finca) y de
 * «Mis entregas» (recolector). Toda la autorización está en los servicios; aquí sólo se lee el
 * formulario y se traducen los errores con nombre.
 */
export type JornadaActionState = { error?: string; ok?: boolean };

const CODIGOS = [
  "finca_no_encontrada", "fecha_invalida", "sin_asignaciones", "parcela_fuera_de_la_finca", "no_es_recolector",
  "ya_es_recolector", "persona_no_encontrada", "ya_cerrada", "jornada_cerrada", "no_es_su_entrega", "sin_permiso",
  "peso_invalido", "no_asignado_en_la_jornada", "origen_no_asignado", "motivo_obligatorio", "ya_anulada",
  "sobre_no_asignado", "nota_obligatoria", "event_kind_invalido", "condicion_del_dia_invalido",
  "tipo_de_archivo_invalido", "clave_invalida", "tamano_invalido", "beneficio_no_valido", "destino_fijo", "ya_recibida",
] as const;

async function traducir(error: unknown): Promise<JornadaActionState> {
  const t = await getTranslations("Jornadas");
  if (error instanceof JornadaError || error instanceof EntregaError || error instanceof SituacionError) {
    const codigo = CODIGOS.find((c) => c === error.message);
    return { error: codigo ? t(`error_${codigo}`) : t("error_generico") };
  }
  if (error instanceof TraceabilityAccessError) return { error: t("error_sin_permiso") };
  if (error instanceof LocalDateTimeError || error instanceof FechaDeDiaInvalida) return { error: t("error_fecha_invalida") };
  throw error;
}

async function usuario() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user.userAccountId;
}

/** «L:<id>», «B:<id>» o «P:<id>» → el origen del servicio. Cualquier otra cosa no es un origen. */
async function leerOrigen(valor: FormDataEntryValue | null): Promise<OrigenDeEntrega | null> {
  const [tipo, id] = String(valor ?? "").split(":");
  if (!id) return null;
  if (tipo === "L") return { locationId: id };
  if (tipo === "B") return { plotBlockId: id };
  if (tipo === "P") return { specimenId: id };
  return null;
}

function instante(formData: FormData, campo: string) {
  return parseLocalDateTime(String(formData.get(campo) ?? ""), String(formData.get(TZ_OFFSET_FIELD) ?? ""));
}

export async function agregarRecolectorAction(_prev: JornadaActionState, formData: FormData): Promise<JornadaActionState> {
  const yo = await usuario();
  try {
    const desde = fechaDeDia(String(formData.get("desde") ?? ""), "desde");
    if (!desde) return traducir(new JornadaError("fecha_invalida"));
    await agregarRecolector(yo, { fincaSiteId: String(formData.get("fincaSiteId") ?? ""), personId: String(formData.get("personId") ?? ""), desde });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/finca/jornadas");
  return { ok: true };
}

/** Las asignaciones llegan como casillas «parcela:persona». */
export async function abrirJornadaAction(_prev: JornadaActionState, formData: FormData): Promise<JornadaActionState> {
  const yo = await usuario();
  let id: string;
  try {
    const fecha = fechaDeDia(String(formData.get("fecha") ?? ""), "fecha");
    if (!fecha) return traducir(new JornadaError("fecha_invalida"));
    const asignaciones = formData
      .getAll("asignacion")
      .map((v) => String(v).split(":"))
      .filter((p): p is [string, string] => p.length === 2 && !!p[0] && !!p[1])
      .map(([locationId, personId]) => ({ locationId, personId }));
    const jornada = await abrirJornada(yo, {
      fincaSiteId: String(formData.get("fincaSiteId") ?? ""),
      beneficioId: String(formData.get("beneficioId") ?? ""),
      fecha,
      nota: String(formData.get("nota") ?? "") || null,
      asignaciones,
    });
    id = jornada.id;
  } catch (error) {
    return traducir(error);
  }
  redirect(`/finca/jornadas/${id}`);
}

export async function cerrarJornadaAction(_prev: JornadaActionState, formData: FormData): Promise<JornadaActionState> {
  const yo = await usuario();
  const jornadaId = String(formData.get("jornadaId") ?? "");
  try {
    await cerrarJornada(yo, jornadaId);
  } catch (error) {
    return traducir(error);
  }
  revalidatePath(`/finca/jornadas/${jornadaId}`);
  return { ok: true };
}

/** La usan la jornada (capataz) y «Mis entregas» (recolector, con su propia persona). */
export async function anotarEntregaAction(_prev: JornadaActionState, formData: FormData): Promise<JornadaActionState> {
  const yo = await usuario();
  const jornadaId = String(formData.get("jornadaId") ?? "");
  try {
    const origen = await leerOrigen(formData.get("origen"));
    if (!origen) return traducir(new EntregaError("origen_no_asignado"));
    const peso = Number(String(formData.get("pesoFincaKg") ?? "").trim().replace(",", "."));
    await anotarEntrega(yo, {
      jornadaId,
      recolectorPersonId: String(formData.get("recolectorPersonId") ?? ""),
      origen,
      pesoFincaKg: peso,
      enviadaAt: instante(formData, "enviadaAt"),
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath(`/finca/jornadas/${jornadaId}`);
  revalidatePath("/mis-entregas");
  return { ok: true };
}

export async function anularEntregaAction(_prev: JornadaActionState, formData: FormData): Promise<JornadaActionState> {
  const yo = await usuario();
  try {
    await anularEntrega(yo, { entregaId: String(formData.get("entregaId") ?? ""), motivo: String(formData.get("motivo") ?? "") });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath(`/finca/jornadas/${String(formData.get("jornadaId") ?? "")}`);
  return { ok: true };
}

/** Foto de una entrega, paso 1: la URL de subida directa. */
export async function pedirSubidaDeFotoDeEntregaAction(
  entregaId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const yo = await usuario();
  try {
    return await pedirSubidaDeFotoDeEntrega(yo, { entregaId, originalFilename, contentType });
  } catch (error) {
    const r = await traducir(error);
    return { error: r.error ?? "" };
  }
}

/** Foto de una entrega, paso 2: con la subida hecha, el Asset atado a la entrega. */
export async function confirmarFotoDeEntregaAction(
  entregaId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
): Promise<{ ok: true } | { error: string }> {
  const yo = await usuario();
  try {
    await confirmarFotoDeEntrega(yo, { entregaId, storageKey, mimeType, sizeBytes, originalFilename, provenanceClass: "original_record" });
  } catch (error) {
    const r = await traducir(error);
    return { error: r.error ?? "" };
  }
  return { ok: true };
}

/** «Reportar algo del campo»: una situación sobre lo asignado, o la condición del día. */
export async function reportarSituacionAction(_prev: JornadaActionState, formData: FormData): Promise<JornadaActionState> {
  const yo = await usuario();
  const jornadaId = String(formData.get("jornadaId") ?? "");
  const nota = String(formData.get("nota") ?? "") || null;
  try {
    const ocurridaAt = instante(formData, "ocurridaAt");
    const condicion = String(formData.get("condicionValueId") ?? "");
    if (condicion) {
      const origen = await leerOrigen(formData.get("sobre"));
      if (!origen || !("locationId" in origen)) return traducir(new SituacionError("sobre_no_asignado"));
      await reportarCondicionDelDia(yo, { jornadaId, locationId: origen.locationId, condicionValueId: condicion, nota, ocurridaAt });
    } else {
      const sobre = await leerOrigen(formData.get("sobre"));
      if (!sobre) return traducir(new SituacionError("sobre_no_asignado"));
      await reportarSituacion(yo, { jornadaId, sobre, tipoValueId: String(formData.get("tipoValueId") ?? ""), nota, ocurridaAt });
    }
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/mis-entregas");
  return { ok: true };
}

/** Foto de una situación, paso 1: la URL de subida directa. */
export async function pedirSubidaDeFotoDeSituacionAction(
  jornadaId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const yo = await usuario();
  try {
    return await pedirSubidaDeFotoDeSituacion(yo, { jornadaId, originalFilename, contentType });
  } catch (error) {
    const r = await traducir(error);
    return { error: r.error ?? "" };
  }
}

/** Foto de una situación, paso 2: el evento de campo con su Asset, sobre lo asignado. */
export async function confirmarFotoDeSituacionAction(input: {
  jornadaId: string;
  sobre: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  originalFilename: string;
  nota: string;
  ocurridaAtIso: string;
}): Promise<{ ok: true } | { error: string }> {
  const yo = await usuario();
  try {
    const sobre = await leerOrigen(input.sobre);
    if (!sobre) throw new SituacionError("sobre_no_asignado");
    await confirmarFotoDeSituacion(yo, {
      jornadaId: input.jornadaId,
      sobre,
      storageKey: input.storageKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      originalFilename: input.originalFilename,
      nota: input.nota || null,
      ocurridaAt: new Date(input.ocurridaAtIso),
    });
  } catch (error) {
    const r = await traducir(error);
    return { error: r.error ?? "" };
  }
  revalidatePath("/mis-entregas");
  return { ok: true };
}
