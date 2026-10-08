"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { COOKIE_FINCA, FincaError, TODAS, crearFinca, crearParcela } from "../../lib/traceability/fincas";
import { LocationAccessError, RejillaInvalida, LocationValidationError, createMicrolot } from "../../lib/traceability/locations";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { JornadaError } from "../../lib/traceability/jornadasDeCosecha";
import { declararDestinoDeFinca } from "../../lib/traceability/destinoDeFinca";
import { FincaLogoValidationError, finalizeFincaLogoUpload, requestFincaLogoUpload } from "../../lib/traceability/fincaLogo";
import { MOTIVOS_DE_SELECCION } from "../../lib/traceability/motivosDeSeleccion";

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
  "nombre_invalido", "nombre_repetido", "name_required", "organizacion_no_es_finca",
  "padre_no_es_una_finca", "area_invalida", "tipo_invalido", "motivo_invalido", "otro_sin_nota", "sin_permiso",
  "gps_incompleto", "latitud_fuera_de_rango", "longitud_fuera_de_rango",
  "tipo_no_soportado", "archivo_demasiado_grande", "tamano_invalido", "no_es_una_finca",
  // Los de `declararDestinoDeFinca`, que lanza `JornadaError` porque reusa sus dos guardas.
  "beneficio_no_valido", "finca_no_encontrada",
] as const;

/**
 * Los errores con nombre de fincas y ubicaciones se dicen en pantalla; cualquier otro sube, como
 * en el resto de las acciones: un fallo que no se reconoce no se disfraza de validación.
 */
async function traducir(error: unknown): Promise<FincasActionState> {
  const t = await getTranslations("Fincas");
  if (error instanceof FincaError || error instanceof LocationValidationError || error instanceof FincaLogoValidationError || error instanceof JornadaError) {
    const codigo = CODIGOS_CON_MENSAJE.find((c) => c === error.message);
    return { error: codigo ? t(`error_${codigo}`) : t("error_generico") };
  }
  // `TraceabilityAccessError` es lo que lanza `requireLotAccess`, y SIN esta rama subía y daba
  // una pantalla de error 500 en vez de «no tienes permiso» — el fallo del PR #433.
  if (error instanceof LocationAccessError || error instanceof TraceabilityAccessError) return { error: t("error_sin_permiso") };
  // **`RejillaInvalida` la lanza `createMicrolot` desde la tarea 4 de la rejilla**, y
  // sin esta rama subía al `throw` de abajo: la pantalla de error 500 en vez de un
  // mensaje — el fallo del PR #433 otra vez. Hoy es inalcanzable porque
  // `crearMicroparcelaAction` todavía no manda el rango, y por eso lo encontró una
  // revisión independiente y no un operario: es un 500 esperando la pantalla.
  //
  // Sus frases viven en `Traceability`, no aquí, así que se piden de ese espacio —
  // mismo patrón que `BandejaError` en `app/actions/traceability.ts`. Duplicar las
  // siete frases en `Fincas` las dejaría derivando.
  if (error instanceof RejillaInvalida) {
    const tr = await getTranslations("Traceability");
    const [clave, ...resto] = error.message.split(":");
    return { error: tr(`error_${clave}` as "error_rejilla_a_medias", { value: resto.join(":").trim() }) };
  }
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
  // Vacío es `null`; cualquier otra cosa se convierte y la valida el servicio (NaN incluido).
  const numero = (campo: string) => {
    const texto = String(formData.get(campo) ?? "").trim().replace(",", ".");
    return texto === "" ? null : Number(texto);
  };
  const area = numero("area");
  const enMetros = formData.get("areaUnidad") === "m2";
  try {
    await crearParcela(user.userAccountId, {
      siteId: String(formData.get("siteId") ?? ""),
      nombre: String(formData.get("nombre") ?? ""),
      areaHectareas: enMetros ? null : area,
      areaMetrosCuadrados: enMetros ? area : null,
      latitude: numero("latitude"),
      longitude: numero("longitude"),
      descripcion: String(formData.get("descripcion") ?? ""),
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
  if (!(MOTIVOS_DE_SELECCION as readonly string[]).includes(motivo)) return traducir(new FincaError("motivo_invalido"));
  const nota = String(formData.get("nota") ?? "").trim() || null;
  if (motivo === "other" && !nota) return traducir(new FincaError("otro_sin_nota"));
  try {
    await createMicrolot(user.userAccountId, {
      parentLocationId,
      name: String(formData.get("nombre") ?? ""),
      motivoDeLaSeleccion: motivo as (typeof MOTIVOS_DE_SELECCION)[number],
      notaDelMotivoDeLaSeleccion: nota,
    });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath(`/plots/${parentLocationId}`);
  revalidatePath("/plots");
  return { ok: true };
}

/** Botones de finca (2026-09-21) — primer paso del logotipo: la URL firmada para subir a R2. */
export async function requestFincaLogoUploadAction(
  siteId: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    return await requestFincaLogoUpload(user.userAccountId, { siteId, contentType });
  } catch (error) {
    return { error: (await traducir(error)).error ?? "" };
  }
}

/** Segundo paso: el objeto ya está en R2; se crea el `Asset` y la finca pasa a apuntarlo. */
export async function finalizeFincaLogoUploadAction(
  siteId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  try {
    await finalizeFincaLogoUpload(user.userAccountId, { siteId, storageKey, mimeType, sizeBytes, originalFilename });
  } catch (error) {
    return { error: (await traducir(error)).error ?? "" };
  }
  revalidatePath("/finca");
  return { ok: true };
}

/**
 * Declarar —o quitar— el beneficio al que esta finca envía su cereza (ADR-194, diseño §4.1).
 *
 * La cadena vacía significa **quitarlo**, y se traduce a `null` aquí y no en el servicio: en un
 * `FormData` no existe el `null`, así que la frontera tiene que decidirlo alguien, y es esta.
 */
export async function declararDestinoDeFincaAction(_prev: FincasActionState, formData: FormData): Promise<FincasActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const siteId = String(formData.get("siteId") ?? "");
  const beneficioId = String(formData.get("beneficioId") ?? "");
  try {
    await declararDestinoDeFinca(user.userAccountId, { fincaSiteId: siteId, beneficioId: beneficioId || null });
  } catch (error) {
    return traducir(error);
  }
  revalidatePath("/fincas");
  revalidatePath(`/fincas/${siteId}/destino`);
  return { ok: true };
}
