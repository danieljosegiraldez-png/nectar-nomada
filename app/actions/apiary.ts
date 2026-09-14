"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import {
  createHive,
  createColony,
  registrarFinDeColonia,
  crearApiario,
  ApiaryAccessError,
  exigeEstadoDeFin,
} from "../../lib/apiary/hives";
import { completarCierreDeTratamiento } from "../../lib/apiary/cierreDeEvento";
import { actualizarConfiguracionDeCaja } from "../../lib/apiary/configuracionDeCaja";
import { exigeClaseDeCausa } from "../../lib/apiary/causaDePerdida";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent, ColonyEventValidationError } from "../../lib/apiary/colonyEvents";
import { requestApiaryAssetUpload, finalizeApiaryAssetUpload } from "../../lib/apiary/media";
import type { RecordInspectionInput } from "../../lib/apiary/inspections";
import type { RecordColonyEventInput } from "../../lib/apiary/colonyEvents";
import type { ApiaryAssetParent } from "../../lib/apiary/media";
import { fechaDeDia, parseLocalDateTime, TZ_OFFSET_FIELD } from "../../lib/time/localDateTime";

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};
const emptyToNullNumber = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? Number(str) : null;
};

// --- Hive / Colony creation, online-only (§7's A0 scope note: offline is
// wired to the Inspection/ColonyEvent forms specifically, not to these) ---

/**
 * Crear el apiario.
 *
 * **Faltaba** (medido el 2026-09-09): se podían registrar colmenas, colonias,
 * inspecciones y visitas, pero no **el sitio donde ocurre todo eso**. Los tres
 * apiarios que hay salieron de la semilla y de un script de importación.
 *
 * Redirige a la ficha del apiario recién creado, que es donde toca seguir:
 * lo siguiente que hace un apicultor es poner su primera colmena.
 */
export async function crearApiarioFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const sitio = await crearApiario(user.userAccountId, {
    name: String(formData.get("name") ?? ""),
    organizationId: String(formData.get("organizationId") ?? ""),
    projectId: emptyToNull(formData.get("projectId")),
    latitude: emptyToNullNumber(formData.get("latitude")),
    longitude: emptyToNullNumber(formData.get("longitude")),
  });

  revalidatePath("/apiaries");
  redirect(`/apiaries/${sitio.id}`);
}

export async function createHiveFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locationId = String(formData.get("locationId") ?? "");
  await createHive(user.userAccountId, {
    identifier: String(formData.get("identifier") ?? ""),
    locationId,
    projectId: emptyToNull(formData.get("projectId")),
    // DÍA, no instante. Hasta el 2026-09-11 esto usaba el parser de instantes,
    // que exige el desfase de zona y **lanza si falta** — y `NewHiveForm` no lo
    // manda. Crear una colmena CON fecha de instalación reventaba la página con
    // un `digest`; sin fecha funcionaba, que es por qué pasó desapercibido.
    // Nadie instala una colmena «a las 10:30»: es un día.
    installedAt: fechaDeDia(formData.get("installedAt") as string | null, "installedAt"),
  });

  revalidatePath(`/apiaries/${locationId}`);
}

export async function createColonyFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apiaryId = String(formData.get("apiaryId") ?? "");
  const hiveId = String(formData.get("hiveId") ?? "");
  await createColony(user.userAccountId, {
    hiveId,
    startedAt: new Date(),
    // §1: origin is a required, capture-or-lose-it fact — no default.
    originType: String(formData.get("originType") ?? "other") as never,
    originNote: emptyToNull(formData.get("originNote")),
    // A9.10 (D6) — el origen agrupable. `emptyToNull` porque la opción vacía
    // del desplegable es «sin registro», que es un dato y no un hueco.
    originSourceValueId: emptyToNull(formData.get("originSourceValueId")),
    // §1a: a beekeeper directly observed/established this colony.
    provenanceClass: "direct_observation",
  });

  revalidatePath(`/apiaries/${apiaryId}/hives/${hiveId}`);
}

// --- Harvest/extraction -> HoneyBatch as a Lot (A3), online-only, same
// reasoning as the two actions above ---

export async function recordApiaryHarvestFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { lot } = await recordApiaryHarvest(user.userAccountId, {
    lotCode: String(formData.get("lotCode") ?? ""),
    colonyId: String(formData.get("colonyId") ?? ""),
    occurredAt: new Date(),
    extractedWeightKg: emptyToNullNumber(formData.get("extractedWeightKg")),
    framesHarvested: emptyToNullNumber(formData.get("framesHarvested")),
    notes: emptyToNull(formData.get("notes")),
    // T9.5 §3(b): an extraction weight/frame count is an instrument/
    // count value read at the time — measured_fact, matching
    // recordHarvestEvent's own choice for the coffee-side equivalent.
    provenanceClass: "measured_fact",
  });

  // Reuses the existing /lots/[id] page verbatim — §2's whole point: a
  // honey Lot is a Lot, so it already has a detail page, a report, photo
  // attachment, and everything else, with zero new UI built here.
  revalidatePath("/lots");
  redirect(`/lots/${lot.id}`);
}

// --- Inspección y evento de colonia YA NO se sincronizan desde aquí. Hasta
// A9.5 estas dos acciones eran el transporte de `lib/apiary/offlineQueue.ts`,
// una petición por borrador. Ahora la cola empuja POR LOTES contra
// `/api/v1/sync/field-events`, que es lo que la deuda escrita en
// `lib/sync/offlineQueue.ts` anunciaba, y las acciones quedaron sin llamador.
//
// Se quitan en vez de dejarlas: la autorización y el manejo de errores que
// hacían viven ahora en `pushFieldEvents`, y dos caminos de escritura para lo
// mismo envejecen por separado — que es exactamente el problema del que este
// ticket viene saliendo. ---

// --- A6: Photo attachment on Hive/Colony/Inspection/ColonyEvent — same
// two-step round trip as app/actions/traceability.ts's Lot-side pair
// (requestLotAssetUploadAction/finalizeLotAssetUploadAction), online-only
// like every other apiary form except Inspection/ColonyEvent quick-entry.

export async function requestApiaryAssetUploadAction(
  parent: ApiaryAssetParent,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    return await requestApiaryAssetUpload(user.userAccountId, { parent, originalFilename, contentType });
  } catch (error) {
    if (error instanceof ApiaryAccessError) return { error: t("error_access", { detail: error.message }) };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

export async function finalizeApiaryAssetUploadAction(
  parent: ApiaryAssetParent,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
  creatorPersonId: string | null,
  revalidationPath: string,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    await finalizeApiaryAssetUpload(user.userAccountId, {
      parent,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename,
      // Same reasoning as finalizeLotAssetUploadAction: a photo of a hive,
      // colony, inspection, or colony event documents what was directly in
      // front of the photographer at capture time — direct_observation,
      // not operator-selectable.
      provenanceClass: "direct_observation",
      creatorPersonId,
    });
  } catch (error) {
    if (error instanceof ApiaryAccessError) return { error: t("error_access", { detail: error.message }) };
    throw error;
  }

  revalidatePath(revalidationPath);
  return { ok: true };
}

/**
 * A9 · Anexo B §4 — completar el cierre de un tratamiento: cuándo se retiró lo que
 * quedó dentro, y qué se observó después.
 *
 * **Es una acción de servidor y no pasa por la cola offline**, a diferencia de todo
 * lo demás del apiario. El motivo no es técnico: esto se hace **en la casa**, con el
 * cuaderno delante y señal, semanas después de aplicar. La cola existe para lo que
 * se anota de pie con guantes, y meter aquí un borrador sería pagar su complejidad
 * sin comprar nada.
 *
 * `removalDate` es un **día** —`type="date"`— y se parsea con `fechaDeDia`, que
 * falla si la cadena no es un día. Usar el parser de instantes es exactamente lo que
 * tumbó la creación de colmenas el 2026-09-11.
 */
export async function completarCierreDeTratamientoFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locationId = String(formData.get("locationId") ?? "");
  await completarCierreDeTratamiento(user.userAccountId, {
    colonyEventId: String(formData.get("colonyEventId") ?? ""),
    removalDate: fechaDeDia(formData.get("removalDate") as string | null, "removalDate"),
    // `soloLoQueVino`: si el campo no vino en el formulario, no se toca. Mandar
    // `null` diría «se vació a propósito», que es otra cosa.
    ...(formData.has("efficacyNote") ? { efficacyNote: emptyToNull(formData.get("efficacyNote")) } : {}),
    reason: emptyToNull(formData.get("reason")),
  });

  revalidatePath(`/apiaries/${locationId}`);
}

/**
 * A9 · Anexo B §2.4 — la configuración de la caja.
 *
 * **El formulario manda la configuración COMPLETA**, no un parche: representa «cómo
 * está la caja hoy», con los valores actuales precargados. Por eso un desplegable
 * vacío significa «sin registrar» —`null`— y no «no lo toques». El servicio sí
 * admite cambios parciales, que es lo que usan las pruebas y usaría una API.
 *
 * Los tres booleanos viajan como `si`/`no`/vacío y NO como casilla: un `Boolean?`
 * tiene tres estados y una casilla dos, que es lo que
 * `tests/arquitectura/booleanos-de-tres-estados.test.ts` existe para impedir.
 */
export async function actualizarConfiguracionDeCajaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const triEstado = (nombre: string): boolean | null => {
    const v = String(formData.get(nombre) ?? "");
    return v === "si" ? true : v === "no" ? false : null;
  };

  const hiveId = String(formData.get("hiveId") ?? "");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  await actualizarConfiguracionDeCaja(user.userAccountId, {
    hiveId,
    broodBoxes: emptyToNull(formData.get("broodBoxes")),
    supers: emptyToNull(formData.get("supers")),
    framesPerBox: emptyToNull(formData.get("framesPerBox")),
    queenExcluder: triEstado("queenExcluder"),
    feederType: emptyToNull(formData.get("feederType")),
    entranceReducer: triEstado("entranceReducer"),
    screenedBottomBoard: triEstado("screenedBottomBoard"),
    reason: emptyToNull(formData.get("reason")),
  });

  revalidatePath(`/apiaries/${apiaryId}/hives/${hiveId}`);
}
