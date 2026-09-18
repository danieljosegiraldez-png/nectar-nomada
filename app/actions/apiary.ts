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
import { trasladarColmenas } from "../../lib/apiary/traslado";
import { altaDeColmenasEnLote } from "../../lib/apiary/altaEnLote";
import { registrarLimpiezaDeCaja, LimpiezaInvalida } from "../../lib/apiary/limpiezaDeCaja";
import { registrarConsultaAVecinos } from "../../lib/apiary/consultaAVecinos";
import { completarCierreDeCosecha } from "../../lib/apiary/cierreDeCosecha";
import { exigeClaseDeCausa } from "../../lib/apiary/causaDePerdida";
import { recordApiaryHarvest } from "../../lib/apiary/harvest";
import { recordInspection } from "../../lib/apiary/inspections";
import { recordColonyEvent, registrarEventoEnLote, ColonyEventValidationError } from "../../lib/apiary/colonyEvents";
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
    // Apiario o meliponario (ADR-145), y de qué lugar cuelga. Los dos llegan como cadena y
    // los valida el servicio: el tipo contra la familia, el padre contra su existencia.
    tipo: String(formData.get("tipo") ?? "apiary_site"),
    parentLocationId: emptyToNull(formData.get("parentLocationId")),
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

/**
 * Dar de alta VARIAS colmenas de una vez. ADR-149.
 *
 * **El encargo, del dueno en el apiario el 2026-09-16:** habia que registrar cinco colmenas en
 * cada sitio y el unico camino era `createHiveFormAction`, que crea UNA. Diez envios para dos
 * apiarios, tecleando el identificador cada vez.
 *
 * `desde` y `cuantas` llegan como cadena y los valida el servicio, igual que el tipo de sitio en
 * `crearApiarioFormAction`: aqui solo se convierten. Quien decide que es valido es
 * `identificadoresDelLote`, que es lo que el guardia puede llamar con la entrada hostil.
 */
export async function altaDeColmenasEnLoteFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locationId = String(formData.get("locationId") ?? "");
  const entero = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    // Cadena vacia -> NaN y NO 0: `Number("")` es 0, y un 0 aqui se leeria como
    // «empieza en cero» en vez de como un campo sin llenar.
    return bruto === "" ? Number.NaN : Number(bruto);
  };

  // La colonia solo viaja si el dueno lo marco. Sin la casilla se crean cajas vacias y la
  // colonia se anade despues, colmena por colmena, donde cada una puede decir su propio origen.
  const conColonia = String(formData.get("conColonia") ?? "") !== "";
  const instalada = fechaDeDia(formData.get("installedAt") as string | null, "installedAt");

  await altaDeColmenasEnLote(user.userAccountId, {
    locationId,
    prefijo: String(formData.get("prefijo") ?? ""),
    desde: entero("desde"),
    cuantas: entero("cuantas"),
    projectId: emptyToNull(formData.get("projectId")),
    installedAt: instalada,
    colonia: conColonia
      ? {
          originType: String(formData.get("originType") ?? "other") as never,
          originSourceValueId: emptyToNull(formData.get("originSourceValueId")),
          originNote: emptyToNull(formData.get("originNote")),
          // El mismo dia que la instalacion si la hay; si no, hoy. Una colonia que llega con
          // la caja no empieza otro dia.
          startedAt: instalada ?? new Date(),
          // Igual que `createColonyFormAction`: el apicultor la establecio y lo vio.
          provenanceClass: "direct_observation",
        }
      : null,
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

/**
 * A9 · Anexo B §5 — el cierre de una cosecha: qué miel era y cuánto pesó.
 *
 * Acción de servidor y no cola offline, por la misma razón que el cierre de un
 * tratamiento: se pesa en la extracción, con balanza y señal. **La humedad no está
 * aquí**: vive como `Measurement` sobre el lote que esta cosecha produjo, y se registra
 * por el camino del lote — ver `lib/apiary/cierreDeCosecha.ts`.
 */
export async function completarCierreDeCosechaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apiaryId = String(formData.get("apiaryId") ?? "");
  const hiveId = String(formData.get("hiveId") ?? "");
  await completarCierreDeCosecha(user.userAccountId, {
    apiaryHarvestEventId: String(formData.get("apiaryHarvestEventId") ?? ""),
    honeyType: emptyToNull(formData.get("honeyType")),
    extractedWeightKg: emptyToNull(formData.get("extractedWeightKg")),
    reason: emptyToNull(formData.get("reason")),
  });

  revalidatePath(`/apiaries/${apiaryId}/hives/${hiveId}`);
}

/**
 * A9 · Anexo E §8 — trasladar un grupo de colmenas a otro apiario.
 *
 * **Acción de servidor y no cola offline**, y la razón es la del propio Anexo: el traslado
 * *«cierra la vigencia de cada colmena en el apiario de origen y abre la del destino en la
 * misma operación»*. Eso es una transacción sobre varias filas; encolarlo sin señal
 * dejaría un lote de mutaciones que, aplicadas a medias, es exactamente lo que la regla
 * prohíbe —una colmena en dos lugares, o en ninguno—. Cargar el camión es además la parte
 * del trabajo en la que hay tiempo de esperar un guardado.
 *
 * **La fecha es de DÍA.** El Anexo la enseña como «13 sep 2026», el campo es
 * `type="date"` y se parsea con `fechaDeDia`, que la deja a medianoche UTC. Tratarla como
 * instante es el fallo de ADR-112.
 *
 * **Revalida los dos apiarios**, no sólo el de origen: el destino acaba de cambiar de
 * conteo y su ficha lo enseña.
 */
/**
 * A9 · Anexo E — aplicar el MISMO manejo a varias colmenas de una vez (ADR-136).
 *
 * Pedido por el dueño: *«poder seleccionar todas las colmenas para aplicar que se hizo algo
 * que hice igual a todas, y no tener que hacer siempre una por una»*. Es el mismo principio
 * que el §8 ya escribió para el traslado — *«selección múltiple con atajos, porque nadie
 * toca veinte casillas con guante»*— aplicado al manejo.
 *
 * **El id de lote se genera AQUÍ, en el servidor**, y no en el formulario: es la clave de
 * reintento de la que sale una por fila, y un id que naciera en el navegador cambiaría en
 * cada reenvío — que es justo cuando hace falta que NO cambie.
 *
 * `coverageUntil` es campo de DÍA (medianoche UTC) y no un instante: es la fecha que dispara
 * el aviso de la próxima visita, y tratarla como instante es el fallo que ADR-112 documenta.
 */
export async function aplicarManejoEnLoteFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const apiaryId = String(formData.get("apiaryId") ?? "");
  const colonyIds = formData.getAll("colonyIds").map((v) => String(v)).filter((v) => v.length > 0);
  const eventType = String(formData.get("eventType") ?? "");

  const dia = fechaDeDia(String(formData.get("occurredAt") ?? ""), "occurredAt");
  const cobertura = fechaDeDia(String(formData.get("coverageUntil") ?? ""), "coverageUntil");

  const numero = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    if (bruto === "") return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  };
  const texto = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    return bruto === "" ? null : bruto;
  };

  await registrarEventoEnLote(user.userAccountId, {
    colonyIds,
    eventType: eventType as "feeding" | "treatment",
    occurredAt: dia ?? new Date(),
    feedingMaterial: texto("feedingMaterial"),
    feedingQuantity: numero("feedingQuantity"),
    feedingUnit: texto("feedingUnit"),
    feedingMethod: texto("feedingMethod"),
    coverageUntil: cobertura,
    treatmentProduct: texto("treatmentProduct"),
    treatmentBatchLabel: texto("treatmentBatchLabel"),
    treatmentWithdrawalDays: numero("treatmentWithdrawalDays"),
    treatmentTarget: texto("treatmentTarget"),
    treatmentRoute: texto("treatmentRoute"),
    treatmentDose: numero("treatmentDose"),
    treatmentDoseUnit: texto("treatmentDoseUnit"),
    note: texto("note"),
    loteDeClienteId: `lote-${crypto.randomUUID()}`,
  });

  revalidatePath(`/apiaries/${apiaryId}`);
}

export async function trasladarColmenasFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const origenId = String(formData.get("apiaryId") ?? "");
  const destinoId = String(formData.get("destinationLocationId") ?? "");
  const hiveIds = formData.getAll("hiveIds").map((v) => String(v)).filter((v) => v.length > 0);

  const fecha = fechaDeDia(String(formData.get("occurredAt") ?? ""), "occurredAt");
  if (!fecha) {
    const t = await getTranslations("Apiary");
    throw new Error(t("trasladoFechaRequerida"));
  }

  // Tres estados y no un booleano: `null` es «no se anotó», que no es lo mismo que «se
  // viajó con las piqueras abiertas» (ADR-080). El formulario manda "si", "no" o nada.
  const piqueras = String(formData.get("entrancesClosed") ?? "");
  const entrancesClosed = piqueras === "si" ? true : piqueras === "no" ? false : null;

  await trasladarColmenas(user.userAccountId, {
    hiveIds,
    destinationLocationId: destinoId,
    occurredAt: fecha,
    reason: String(formData.get("reason") ?? ""),
    entrancesClosed,
  });

  revalidatePath(`/apiaries/${origenId}`);
  revalidatePath(`/apiaries/${destinoId}`);
}

/**
 * A9 · Anexo E §4 — registrar la consulta mensual a una finca vecina.
 *
 * **Acción de servidor y no cola offline.** El Anexo dice que es «protocolo mensual, no una
 * nota», y se hace hablando con alguien: no es el formulario de un toque frente a la caja.
 * La cola offline existe para lo que se llena con guantes puestos.
 *
 * **Las dos fechas son de DÍA**, no instantes: se parsean con `fechaDeDia`, que las deja a
 * medianoche UTC. La de la aplicación puede faltar —y debe faltar— cuando no hay aplicación
 * prevista, y el servicio lo exige en las dos direcciones.
 */
export async function registrarConsultaAVecinosFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const locationId = String(formData.get("locationId") ?? "");
  const t = await getTranslations("Apiary");

  const occurredAt = fechaDeDia(String(formData.get("occurredAt") ?? ""), "occurredAt");
  if (!occurredAt) throw new Error(t("consultaFechaRequerida"));

  const prevista = emptyToNull(formData.get("plannedApplicationAt"));
  const plannedApplicationAt = prevista ? fechaDeDia(prevista, "plannedApplicationAt") : null;

  await registrarConsultaAVecinos(user.userAccountId, {
    locationId,
    neighbourOrganizationId: String(formData.get("neighbourOrganizationId") ?? ""),
    occurredAt,
    outcome: String(formData.get("outcome") ?? ""),
    crop: emptyToNull(formData.get("crop")),
    plannedApplicationAt,
    informantName: emptyToNull(formData.get("informantName")),
    operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
    note: emptyToNull(formData.get("note")),
    // La consulta es lo que alguien nos dijo, no algo que observáramos. `direct_observation`
    // afirmaría que vimos el calendario de aspersiones de la finca vecina.
    provenanceClass: "original_record",
  });

  revalidatePath(`/apiaries/${locationId}`);
}


/**
 * La limpieza de la CAJA (ADR-159). **La primera acción del apiario que DEVUELVE el error en vez de
 * lanzarlo**, y no es capricho: sus hermanas casi nunca fallan, pero ésta rechaza en un caso
 * NORMAL —«esa caja tenía colonia ese día»— y el apicultor tiene que leer por qué, no ver una
 * página de error. Misma forma que `TraceabilityActionState`.
 *
 * Sólo se exporta esta función `async`: en un archivo `"use server"` una clase o una constante
 * exportada rompe el módulo entero (`CLAUDE.md`, «no todo rojo de Vercel es la cuota»).
 */
export async function registrarLimpiezaDeCajaAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Apiary");

  const hiveId = String(formData.get("hiveId") ?? "");
  const apiaryId = String(formData.get("apiaryId") ?? "");
  const texto = (clave: string) => {
    const v = String(formData.get(clave) ?? "").trim();
    return v === "" ? null : v;
  };

  try {
    // **La fecha es obligatoria y no se rellena con «hoy».** Un día por defecto afirmaría una fecha
    // que nadie dio — y «hoy» en UTC es mañana en Panamá desde las siete de la tarde.
    const dia = fechaDeDia(String(formData.get("occurredAt") ?? ""), "occurredAt");
    if (!dia) return { error: t("limpiezaError_falta_la_fecha") };

    await registrarLimpiezaDeCaja(user.userAccountId, {
      hiveId,
      occurredAt: dia,
      acts: formData.getAll("acts").map((v) => String(v)),
      actOtherNote: texto("actOtherNote"),
      reason: texto("reason"),
      reasonOtherNote: texto("reasonOtherNote"),
      notes: texto("notes"),
      provenanceClass: "original_record",
    });
  } catch (error) {
    if (error instanceof LimpiezaInvalida) {
      // `acto_desconocido: xyz` trae el valor detrás de los dos puntos.
      const [codigo, ...resto] = error.message.split(":");
      return { error: t(`limpiezaError_${codigo!.trim()}` as "limpiezaError_sin_actos", { valor: resto.join(":").trim() }) };
    }
    if (error instanceof ApiaryAccessError) return { error: t("limpiezaError_sin_permiso") };
    throw error;
  }

  revalidatePath(`/apiaries/${apiaryId}/hives/${hiveId}`);
  return { ok: true };
}
