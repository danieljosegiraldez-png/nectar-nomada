"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { submitAssessment, computePanelResult, SensoryAccessError } from "../../lib/sensory/service";
import {
  buscarMuestrasParaCata,
  crearSesionDeCata,
  invitarParticipante,
  SesionDeCataError,
} from "../../lib/sensory/sessions";
import { etiquetaDeMuestra } from "../../lib/sensory/muestraEnCata";
import { registrarInformeExterno, InformeExternoError } from "../../lib/sensory/informeExterno";

export interface SensoryActionState {
  error?: string;
}

export async function submitAssessmentAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("Sensory");

  const blindSampleId = String(formData.get("blindSampleId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  const overallScoreRaw = formData.get("overallScore");
  const overallScore = overallScoreRaw ? Number(overallScoreRaw) : null;
  const comment = String(formData.get("comment") ?? "") || null;

  // Sólo los pinta el formulario de un protocolo que calcula el total; en
  // cualquier otro llegan ausentes y el servicio los guarda nulos. No se
  // ponen a 0 aquí: un 0 afirma «se contaron y no había ninguna».
  const tazas = (campo: string): number | null => {
    const crudo = formData.get(campo);
    return crudo === null || crudo === "" ? null : Number(crudo);
  };

  const attributeIds = formData.getAll("attributeId").map(String);
  const attributeResponses = attributeIds
    .map((attributeId) => {
      const raw = formData.get(`attr_${attributeId}`);
      if (raw === null || raw === "") return null;
      return { attributeId, value: Number(raw) };
    })
    .filter((r): r is { attributeId: string; value: number } => r !== null);

  try {
    await submitAssessment(user.userAccountId, {
      blindSampleId,
      overallScore,
      nonUniformCups: tazas("nonUniformCups"),
      defectiveCups: tazas("defectiveCups"),
      comment,
      attributeResponses,
    });
  } catch (error) {
    if (error instanceof SensoryAccessError) {
      return { error: t(`error_${error.message}` as "error_already_submitted") };
    }
    throw error;
  }

  revalidatePath(`/sensory/${sessionId}`);
  return {};
}

export async function computePanelResultFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const blindSampleId = String(formData.get("blindSampleId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  await computePanelResult(user.userAccountId, blindSampleId);
  revalidatePath(`/sensory/${sessionId}`);
}

/**
 * Crear una sesión de cata.
 *
 * Las muestras llegan como valores repetidos del mismo campo `muestras`, en el
 * orden en que las pintó la pantalla: `getAll` conserva ese orden, y el orden es
 * el que decide qué código ciego le toca a cada una.
 */
export async function crearSesionDeCataAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Sensory");

  const muestras = formData.getAll("muestras").map((v) => String(v)).filter(Boolean);
  let sesionId: string;
  try {
    const sesion = await crearSesionDeCata(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      protocolVersionId: String(formData.get("protocolVersionId") ?? ""),
      muestras,
      purpose: (String(formData.get("purpose") ?? "").trim() || null) as never,
      subject: (String(formData.get("subject") ?? "").trim() || null) as never,
      preparationMethod: (String(formData.get("preparationMethod") ?? "").trim() || null),
    });
    sesionId = sesion.id;
  } catch (error) {
    if (error instanceof SesionDeCataError) return { error: t(`error_${error.message}` as "error_name_required") };
    if (error instanceof SensoryAccessError) return { error: t("error_no_access") };
    throw error;
  }

  revalidatePath("/sensory");
  redirect(`/sensory/${sesionId}`);
}

/** Invitar a alguien a puntuar en una cata. */
/**
 * La búsqueda del selector de muestras de una cata. Devuelve etiquetas ya
 * hechas —la misma `etiquetaDeMuestra` que la página— y `hayMas` para que la
 * pantalla diga que hay que afinar en vez de callar que cortó.
 *
 * El permiso lo pone `buscarMuestrasParaCata`, no esta acción: que la llame un
 * formulario no la vuelve un control de acceso.
 */
export async function buscarMuestrasParaCataAction(
  texto: string,
): Promise<{ muestras: { id: string; label: string }[]; hayMas: boolean } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Sensory");
  try {
    const r = await buscarMuestrasParaCata(user.userAccountId, String(texto ?? "").slice(0, 100));
    return { muestras: r.muestras.map((m) => ({ id: m.id, label: etiquetaDeMuestra(m) })), hayMas: r.hayMas };
  } catch (error) {
    if (error instanceof SesionDeCataError) return { error: t(`error_${error.message}` as "error_name_required") };
    throw error;
  }
}

export async function invitarParticipanteAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Sensory");

  const sessionId = String(formData.get("sessionId") ?? "");
  try {
    await invitarParticipante(user.userAccountId, {
      sessionId,
      invitadoUserAccountId: String(formData.get("invitadoUserAccountId") ?? ""),
    });
  } catch (error) {
    if (error instanceof SesionDeCataError) return { error: t(`error_${error.message}` as "error_name_required") };
    throw error;
  }

  revalidatePath(`/sensory/${sessionId}`);
  return {};
}

/**
 * Registrar el informe de cata que firmó alguien de fuera.
 *
 * **Los atributos viajan por NOMBRE**, que es el contrato del servicio: el
 * informe dice «Flavor 7», no un UUID, y casar por nombre convierte «este
 * informe trae un atributo que el protocolo no tiene» en un error con nombre.
 * El id sólo se usa como clave del campo del formulario, porque un nombre con
 * espacios no sirve de `name=` sin escaparlo.
 */
export async function registrarInformeExternoAction(
  _prevState: SensoryActionState,
  formData: FormData,
): Promise<SensoryActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Sensory");

  const attributeIds = formData.getAll("attributeId").map(String);
  const respuestas = attributeIds
    .map((id) => {
      const valor = formData.get(`attr_${id}`);
      const nombre = String(formData.get(`nombre_${id}`) ?? "");
      // Un atributo sin puntuar se OMITE, no se manda como 0: un 0 afirma que
      // el catador lo puntuó con la nota mínima. Si el protocolo calcula el
      // total, el resolver lo rechaza por incompleto y lo dice.
      if (valor === null || String(valor).trim() === "" || nombre === "") return null;
      return { attributeName: nombre, value: Number(valor) };
    })
    .filter((r): r is { attributeName: string; value: number } => r !== null);

  const opcional = (campo: string): number | null => {
    const crudo = formData.get(campo);
    return crudo === null || String(crudo).trim() === "" ? null : Number(crudo);
  };

  const evaluadoCrudo = String(formData.get("evaluadoEl") ?? "").trim();

  try {
    await registrarInformeExterno(user.userAccountId, {
      sampleId: String(formData.get("sampleId") ?? ""),
      protocolVersionId: String(formData.get("protocolVersionId") ?? ""),
      evaluadorPersonId: String(formData.get("evaluadorPersonId") ?? ""),
      sourceReference: String(formData.get("sourceReference") ?? ""),
      // Día, no instante: el informe dice «12 de marzo», no una hora. Se trata
      // como los demás campos de día del sistema — medianoche UTC — y NO se
      // convierte con el desfase del dispositivo, que movería la fecha.
      evaluadoEl: evaluadoCrudo === "" ? null : new Date(`${evaluadoCrudo}T00:00:00Z`),
      respuestas,
      overallScore: opcional("overallScore"),
      tazasNoUniformes: opcional("tazasNoUniformes"),
      tazasDefectuosas: opcional("tazasDefectuosas"),
      comentario: String(formData.get("comentario") ?? "") || null,
    });
  } catch (error) {
    if (error instanceof InformeExternoError) {
      // Dos códigos traen el atributo pegado con dos puntos —
      // `unknown_attribute:Flavor`— porque el servicio nombra el culpable. La
      // clave de traducción es la primera mitad; el nombre va de parámetro.
      const [clave, ...resto] = error.message.split(":");
      const attribute = resto.join(":");
      return { error: t(`error_${clave}` as "error_no_manage_access", { attribute }) };
    }
    throw error;
  }

  revalidatePath("/sensory");
  redirect("/sensory");
}
