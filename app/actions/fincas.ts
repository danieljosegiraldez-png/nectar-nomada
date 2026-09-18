"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { COOKIE_FINCA, FincaError, TODAS, crearFinca, crearParcela } from "../../lib/traceability/fincas";
import { LocationAccessError, LocationValidationError, createMicrolot } from "../../lib/traceability/locations";
import { MOTIVOS_DE_SUBDIVISION } from "../../lib/traceability/motivosDeSubdivision";

/**
 * Spec fincas y parcelas §3.1 — elegir la finca. Guarda el sitio elegido, o «todas», en una
 * cookie de sesión del navegador. **No autoriza nada**: cada página vuelve a resolverla contra
 * las fincas que quien mira puede ver, y una que no esté ahí se ignora.
 */
export async function elegirFincaAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const valor = String(formData.get("finca") ?? "");
  const store = await cookies();
  store.set(COOKIE_FINCA, valor === TODAS ? TODAS : valor, { path: "/", sameSite: "lax", httpOnly: true });
  // Sólo una ruta propia: una URL absoluta aquí sería una redirección abierta.
  const volver = String(formData.get("volver") ?? "");
  redirect(volver.startsWith("/") && !volver.startsWith("//") ? volver : "/finca");
}

export type FincasActionState = { error?: string; ok?: boolean };

const CODIGOS_CON_MENSAJE = [
  "nombre_invalido", "nombre_repetido", "name_required", "ya_tiene_terreno", "organizacion_no_es_finca",
  "padre_no_es_una_finca", "area_invalida", "tipo_invalido", "motivo_invalido", "otro_sin_nota", "sin_permiso",
] as const;

/**
 * Los errores con nombre de fincas y ubicaciones se dicen en pantalla; cualquier otro sube, como
 * en el resto de las acciones: un fallo que no se reconoce no se disfraza de validación.
 */
async function traducir(error: unknown): Promise<FincasActionState> {
  const t = await getTranslations("Fincas");
  if (error instanceof FincaError || error instanceof LocationValidationError) {
    const codigo = CODIGOS_CON_MENSAJE.find((c) => c === error.message);
    return { error: codigo ? t(`error_${codigo}`) : t("error_generico") };
  }
  if (error instanceof LocationAccessError) return { error: t("error_sin_permiso") };
  throw error;
}

/** Spec §3.2 — dar de alta una finca, o el terreno de una organización de finca que no lo tiene. */
export async function crearFincaAction(_prev: FincasActionState, formData: FormData): Promise<FincasActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const organizationId = String(formData.get("organizationId") ?? "");
  const tipo = String(formData.get("tipo") ?? "");
  try {
    if (organizationId) await crearFinca(user.userAccountId, { organizationId });
    else {
      if (tipo !== "farm" && tipo !== "estate") return traducir(new FincaError("tipo_invalido"));
      await crearFinca(user.userAccountId, {
        nombre: String(formData.get("nombre") ?? ""),
        tipo,
        descripcion: String(formData.get("descripcion") ?? "") || null,
      });
    }
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/fincas");
  redirect("/fincas");
}

/** Spec §3.3 — una parcela nueva en la finca elegida. */
export async function crearParcelaAction(_prev: FincasActionState, formData: FormData): Promise<FincasActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const areaTexto = String(formData.get("areaHectareas") ?? "").trim().replace(",", ".");
  const area = areaTexto === "" ? null : Number(areaTexto);
  try {
    await crearParcela(user.userAccountId, {
      siteId: String(formData.get("siteId") ?? ""),
      nombre: String(formData.get("nombre") ?? ""),
      areaHectareas: area,
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/finca");
  revalidatePath("/plots");
  return { ok: true };
}

/** Spec §3.3 — una microparcela dentro de una parcela, con su motivo. */
export async function crearMicroparcelaAction(_prev: FincasActionState, formData: FormData): Promise<FincasActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const parentLocationId = String(formData.get("parentLocationId") ?? "");
  const motivo = String(formData.get("motivo") ?? "");
  if (!(MOTIVOS_DE_SUBDIVISION as readonly string[]).includes(motivo)) return traducir(new FincaError("motivo_invalido"));
  const nota = String(formData.get("nota") ?? "").trim() || null;
  if (motivo === "other" && !nota) return traducir(new FincaError("otro_sin_nota"));
  try {
    await createMicrolot(user.userAccountId, {
      parentLocationId,
      name: String(formData.get("nombre") ?? ""),
      subdivisionReason: motivo as (typeof MOTIVOS_DE_SUBDIVISION)[number],
      subdivisionReasonNote: nota,
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath(`/plots/${parentLocationId}`);
  revalidatePath("/plots");
  return { ok: true };
}
