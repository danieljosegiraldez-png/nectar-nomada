"use server";

import { PersonaNoPermitidaError } from "../../lib/people/quienLoHizo";
import { CondicionDelSitioInvalida } from "../../lib/apiary/condicionDelSitio";
import { PropositoInvalido } from "../../lib/apiary/propositoDeVisita";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../lib/auth/session";
import { fechaDeDia as fechaDeDiaCompartida, FechaDeDiaInvalida,
  parseLocalDateTime,
  parseOptionalLocalDateTime,
  LocalDateTimeError,
  TZ_OFFSET_FIELD,
} from "../../lib/time/localDateTime";
import { calcularFechaConPrecision } from "../../lib/time/fechaConPrecision";
// Los horizontes los lee `lib/traceability/horizontesDelFormulario.ts`, que
// comparten este camino y el de la cola offline. Ver su cabecera.
import { horizontesDelFormulario, maxIndiceDeFilas } from "../../lib/traceability/horizontesDelFormulario";
import { recordTransformation, TraceabilityAccessError } from "../../lib/traceability/lots";
import { confirmarCoordenadasDelSitio, CoordenadasValidationError } from "../../lib/traceability/coordenadasDelSitio";
import { SitioNoEncontradoError } from "../../lib/traceability/fincas";
import { recordSelection, SelectionValidationError } from "../../lib/traceability/selection";
import { recordQuantityEvent, QuantityValidationError } from "../../lib/traceability/quantity";
import {
  recordMeasurement,
  correctMeasurement,
  MeasurementValidationError,
} from "../../lib/traceability/measurements";
import { UnitValidationError } from "../../lib/traceability/units";
import { recordHarvestEvent, recordReceivingEvent, CerezaError } from "../../lib/traceability/harvest";
import { recordRoastSession, elegirPerfilDeTueste, RoastSessionValidationError, CODIGOS_DE_TUESTE_CON_FRASE } from "../../lib/traceability/roasting";
import { startFermentationRun, recordFermentationIntervention, endFermentationRun } from "../../lib/traceability/fermentation";
import {
  createRecipeWithVersion,
  createRecipeVersion,
  updateRecipeMetadata,
  ProcessTargetError,
} from "../../lib/traceability/processTargets";
import { startDryingRun, recordDryingTurnEvent, registrarTandaDeVolteo, endDryingRun, DryingValidationError } from "../../lib/traceability/drying";
import { BandejaError } from "../../lib/traceability/bandejaError";
import { claveDeErrorDeProceso } from "../../lib/traceability/errorDeProceso";
import { moveLotToStorage } from "../../lib/traceability/storage";
import { registrarTrilla, TrillaValidationError } from "../../lib/traceability/trilla";
import { recordGreenGrading, GreenGradingValidationError } from "../../lib/traceability/greenGrading";
import {
  abrirProceso,
  cambiarIntencion,
  cambiarObjetivoDeHumedad,
  cerrarProceso,
  devolverASecado,
  registrarIntervencion,
  LotProcessError,
} from "../../lib/traceability/lotProcess";
import {
  startFieldSession,
  endFieldSession,
  completarVisita,
  recordFieldEvent,
  FieldSessionValidationError,
} from "../../lib/traceability/fieldSessions";
import { registrarVitalesEnSitio, VitalesEnSitioInvalido } from "../../lib/apiary/vitalesEnSitio";
// Las cinco siguientes se importan SÓLO para nombrarlas en `friendlyError`.
// Ninguna acción llama a estos módulos: llegan aquí a través de los servicios
// que sí se llaman (`PENDING_IMPLEMENTATIONS/013`).
import { ClimaInvalido } from "../../lib/apiary/climaObservado";
import { CajasPresentesInvalido } from "../../lib/apiary/cajasPresentes";
import { ApiaryAccessError } from "../../lib/apiary/hives";
import { MassBalanceError } from "../../lib/traceability/balance";
import { ByproductValidationError } from "../../lib/traceability/subproductos";
import { ClaveDeEnvioAjena } from "../../lib/envios/unaVezPorEnvio";
import {
  recordHarvestSources,
  createPlantingCohort,
  updatePlantingCohort,
  PlantingCohortValidationError,
} from "../../lib/traceability/plantingCohorts";
import { recordEnteredProduction, PlantingEventValidationError } from "../../lib/traceability/plantingEvents";
import {
  anadirRangoAlBloque,
  createPlotBlock,
  quitarRangoDelBloque,
  setPlotBlockType,
  PlotBlockValidationError,
} from "../../lib/traceability/plotBlocks";
import { declararTrozoDeForma, quitarTrozoDeForma } from "../../lib/traceability/formaDeLaParcela";
import { createTrap, recordTrapCheck, TrapAccessError, TrapValidationError } from "../../lib/traceability/traps";
import { saveTrapRule, TrapRuleValidationError } from "../../lib/traceability/trapRules";
import {
  updateLocationAttributes,
  LocationAccessError,
  LocationValidationError,
  RejillaInvalida,
} from "../../lib/traceability/locations";
import {
  createBiocharBatch,
  updateBiocharBatch,
  BiocharBatchValidationError,
} from "../../lib/traceability/biocharBatches";
import {
  emitirReporteDeVisita,
  publicarReporteConEnlace,
  revocarEnlace,
  ReporteError,
} from "../../lib/traceability/reporteDeVisita";
import {
  exigeProcedencia,
  ProcedenciaInvalida,
  PROCEDENCIA_DE_MEDICION,
  PROCEDENCIA_DE_REGISTRO_DE_CAMPO,
  PROCEDENCIA_DE_SIEMBRA,
  PROCEDENCIA_DE_ANALISIS,
  PROCEDENCIA_DE_BIOCHAR,
} from "../../lib/traceability/procedencia";
import {
  createSoilProfile,
  updateSoilProfile,
  SoilProfileValidationError,
  type SoilHorizonInput,
} from "../../lib/traceability/soilProfiles";
import {
  createSoilSample,
  createFoliarSample,
  SampleValidationError,
} from "../../lib/traceability/soilSamples";
import { createSampleFromLot, SampleValidationError as SampleFromLotValidationError } from "../../lib/traceability/samples";
import { requestLotAssetUpload, finalizeLotAssetUpload, type LotAssetParent } from "../../lib/traceability/media";
import {
  requestLandAssetUpload,
  finalizeLandAssetUpload,
  requestTrampaPhotoUpload,
  finalizeTrampaPhotoPorBorrador,
  LandMediaValidationError,
  type LandAssetParent,
} from "../../lib/traceability/landMedia";
import { volverAValido } from "../../lib/traceability/volverA";
import {
  recordLabourEntry,
  recordMaterialConsumptionEntry,
  LabourValidationError,
  MaterialConsumptionValidationError,
  type LabourEntryParent,
  type MaterialConsumptionParent,
} from "../../lib/traceability/operations";

export interface TraceabilityActionState {
  error?: string;
  /**
   * La inspección de secado que la última medición usó o creó.
   *
   * Vuelve al formulario para que la SIGUIENTE lectura de la misma pasada la nombre en vez de
   * crear otra: tres zonas revisadas de una pasada son UNA inspección, que es lo que ocurrió.
   * Deliberadamente no hay ninguna ventana de tiempo decidiendo qué es «la misma pasada» — un
   * umbral inventado es como llegó el marcador de 24 h a la pantalla del lote.
   */
  inspeccionId?: string;
  /**
   * Avisos que NO son errores: el acto se guardó y hay algo que decir.
   *
   * Lo pide D7 de la rejilla: un bloque experimental que se solapa con una
   * trampa **se guarda**, porque es una decisión del agrónomo y no un error de
   * captura — «señalarlo, no corregirlo en silencio». Van aparte de `error` a
   * propósito: pintarlos con `role="alert"` y clase de error diría que algo falló
   * cuando lo que pasó es que todo se guardó.
   */
  avisos?: string[];
}

// Matched by class, not by exact message string — UnitValidationError's
// messages carry a dynamic suffix (e.g. "out_of_range:temperature:120")
// that can't map to a fixed i18n key. The raw code is still shown (via
// {detail}) since this is an internal operator tool, not public-facing
// copy — functional and honest beats a polished translation catalog for
// every possible internal error code.
async function friendlyError(t: Awaited<ReturnType<typeof getTranslations>>, error: unknown): Promise<string> {
  if (error instanceof PersonaNoPermitidaError) return t("error_persona_no_permitida");
  if (error instanceof CondicionDelSitioInvalida) {
    const [clave, ...resto] = error.message.split(":");
    return t(`error_condicion_${clave}` as "error_condicion_otro_sin_decir_cual", { value: resto.join(":") });
  }
  if (error instanceof PropositoInvalido) {
    // `proposito_desconocido: trasiego` trae los valores tras los dos puntos;
    // `proposito_requerido` no trae nada. Sin esta rama la clase caía al
    // `throw` final y abrir una jornada sin propósito era un 500.
    const [clave, ...resto] = error.message.split(":");
    return t(`error_${clave}` as "error_proposito_requerido", { value: resto.join(":").trim() });
  }
  if (error instanceof ProcedenciaInvalida) {
    // `provenance_not_offered:ai_suggestion` trae el valor pegado con dos
    // puntos, como los errores de atributo del informe externo.
    const [clave, ...resto] = error.message.split(":");
    return t(`error_${clave}` as "error_provenance_required", { value: resto.join(":") });
  }
  if (error instanceof TraceabilityAccessError) return t("error_access", { detail: error.message });
  // Parte 1 (tarea 12, 2026-10-03): un texto por código. El genérico de abajo sigue para los demás, con el código de detalle.
  const claveDeProceso = claveDeErrorDeProceso(error);
  if (claveDeProceso) return t(claveDeProceso as "error_proceso_sin_proceso_abierto");
  // R6.6 lanza `lote_dividido` también desde las mediciones y las muestras, con sus propias clases.
  if ((error instanceof MeasurementValidationError || error instanceof SampleFromLotValidationError) && error.message === "lote_dividido") {
    return t("error_proceso_lote_dividido");
  }
  if (error instanceof LotProcessError) return t("error_lot_process", { detail: error.message });
  if (error instanceof QuantityValidationError) return t("error_quantity", { detail: error.message });
  if (error instanceof MeasurementValidationError) return t("error_measurement", { detail: error.message });
  if (error instanceof UnitValidationError) return t("error_unit", { detail: error.message });
  if (error instanceof SelectionValidationError) return t("error_selection", { detail: error.message });
  if (error instanceof LocationAccessError) return t("error_access", { detail: error.message });
  if (error instanceof LocationValidationError) return t("error_location", { detail: error.message });
  // La rejilla tiene frase POR CODIGO, como `PropositoInvalido`: «media rejilla» y
  // «algo queda fuera» se corrigen de maneras distintas, y el segundo trae dentro
  // QUE estorba. Sin esta rama la clase cae al `throw` final y encoger la rejilla
  // de una parcela es un 500 — el defecto del PR #433, que
  // `tests/arquitectura/acciones-traducen-sus-errores.test.ts` ya vigila solo.
  if (error instanceof RejillaInvalida) {
    const [clave, ...resto] = error.message.split(":");
    const valor = resto.join(":").trim();
    // La planta trae DOS numeros, y van como parametros numericos. Lo que NO
    // puede pasar es que la frase del disparador entre entera en `{value}`: eso
    // hacia que la pantalla en INGLES dijera «una planta en la hilera 9, planta
    // 3», que es el RULING que las bandejas ya habian resuelto mas abajo.
    if (clave === "rejilla_con_planta_fuera") {
      // `noUncheckedIndexedAccess`: el destructurado puede dar `undefined`, y un
      // mensaje con un hueco vacio es peor que uno que no se imprime.
      const [hilera = "?", planta = "?"] = valor.split(",");
      return t("error_rejilla_con_planta_fuera", { hilera, planta });
    }
    return t(`error_${clave}` as "error_rejilla_a_medias", { value: valor });
  }
  if (error instanceof PlantingEventValidationError) return t("error_production", { detail: error.message });
  if (error instanceof PlantingCohortValidationError) return t("error_harvest_sources", { detail: error.message });
  if (error instanceof FieldSessionValidationError) return t("error_field_session", { detail: error.message });
  if (error instanceof BiocharBatchValidationError) return t("error_biochar", { detail: error.message });
  if (error instanceof SoilProfileValidationError) return t("error_soil_profile", { detail: error.message });
  if (error instanceof SampleFromLotValidationError && error.message === "green_sample_before_reposo") {
    return t("error_sample_green_before_reposo");
  }
  if (error instanceof SampleFromLotValidationError && error.message === "sample_exceeds_available") {
    return t("error_sample_exceeds_available");
  }
  if (error instanceof SampleFromLotValidationError && error.message === "sample_mixed_units") {
    return t("error_sample_mixed_units");
  }
  if (error instanceof SampleFromLotValidationError && error.message === "sample_quantity_precision") {
    return t("error_sample_quantity_precision");
  }
  if (error instanceof SampleFromLotValidationError && error.message === "sample_quantity_must_be_positive") {
    return t("error_sample_quantity_positive");
  }
  if (error instanceof SampleFromLotValidationError) return t("error_sample", { detail: error.message });
  if (error instanceof SampleValidationError) return t("error_sample", { detail: error.message });
  if (error instanceof LandMediaValidationError) return t("error_land_media", { detail: error.message });
  // F4 fix-final — «revisa la lectura y la fecha» no es verdad de una trampa
  // retirada: el caso real es que no se puede revisar en absoluto, y ése se
  // dice, con su propia clave.
  if (error instanceof TrapValidationError && error.message === "trap_retired") return t("error_trap_retired");
  // La escala o la fecha: el mensaje dice qué revisar, y el código crudo no
  // aporta al operario de campo nada que ese mensaje no diga.
  if (error instanceof TrapValidationError) return t("error_trap");
  if (error instanceof TrapAccessError) return t("error_access", { detail: error.message });
  // «Revisa la lectura y la fecha» no es verdad de un bloque: el caso real es
  // un nombre repetido, y ése se dice.
  // **Los tres códigos que NO son «no se pudo crear el bloque».** `error_block`
  // dice literalmente eso, y quitar un rango que otro ya quitó —una página vieja—
  // salía como «No se pudo crear el bloque: range_not_found», con el código crudo
  // y en inglés. Lo encontró una revisión independiente el 2026-10-02.
  if (error instanceof PlotBlockValidationError && error.message === "range_not_found") {
    return t("error_rango_no_encontrado");
  }
  if (error instanceof PlotBlockValidationError && error.message === "block_not_found") {
    return t("error_bloque_no_encontrado");
  }
  if (error instanceof PlotBlockValidationError && error.message === "block_location_not_found") {
    return t("error_bloque_sin_sitio");
  }
  if (error instanceof PlotBlockValidationError) return t("error_block", { detail: error.message });
  // Cada código de la regla tiene su frase: dice qué campo corregir.
  if (error instanceof TrapRuleValidationError) {
    return t(`error_trapRule_${error.message}` as "error_trapRule_suggested_action_required");
  }
  if (error instanceof FechaInvalidaError) return t("error_datetime", { detail: error.message });
  if (error instanceof LocalDateTimeError) return t("error_datetime", { detail: error.message });
  // --- Las que faltaban, y por qué están escritas juntas ---------------------
  //
  // `PENDING_IMPLEMENTATIONS/013`: cada una de éstas era un 500. Nada las
  // capturaba aquí, así que escapaban de la acción y el formulario recibía el
  // error de servidor en vez de una frase. Las nombró la revisión de Codex del
  // PR #433 sobre `main` y las volvió a nombrar, una por una, el guardia de
  // `tests/arquitectura/acciones-traducen-sus-errores.test.ts`, que es quien
  // impide que la lista vuelva a crecer en silencio.
  if (error instanceof VitalesEnSitioInvalido) return t("error_vitales_en_sitio", { detail: error.message });
  if (error instanceof ClimaInvalido) return t("error_clima", { detail: error.message });
  if (error instanceof CajasPresentesInvalido) return t("error_cajas_presentes", { detail: error.message });
  // Un sitio de abejas tiene su propia puerta, y su «no puedes» es el mismo
  // «no puedes» de trazabilidad: misma clave, que ya dice lo que hay que decir.
  if (error instanceof ApiaryAccessError) return t("error_access", { detail: error.message });
  if (error instanceof MassBalanceError) return t("error_mass_balance", { detail: error.message });
  if (error instanceof ByproductValidationError) return t("error_subproducto", { detail: error.message });
  if (error instanceof CerezaError) return t("error_cereza", { detail: error.message });
  // Cada código del camino de la muestra tiene su frase: dice qué corregir, en vez de enseñar el
  // código en inglés dentro de una frase en español. La lista vive en `lib/traceability/roasting.ts`,
  // junto a los `throw`; el envoltorio de abajo sigue cubriendo a los demás.
  if (
    error instanceof RoastSessionValidationError &&
    (CODIGOS_DE_TUESTE_CON_FRASE as readonly string[]).includes(error.message)
  ) {
    return t(`error_roast_${error.message}` as "error_roast_sample_must_be_green");
  }
  if (error instanceof RoastSessionValidationError) return t("error_roast", { detail: error.message });
  if (error instanceof TrillaValidationError) return t("error_hulling", { detail: error.message });
  if (error instanceof GreenGradingValidationError && error.message === "screen_system_invalid") {
    return t("error_green_grading_screen_system_invalid");
  }
  if (error instanceof GreenGradingValidationError && error.message === "screen_system_other_needs_note") {
    return t("error_green_grading_screen_system_other_needs_note");
  }
  if (error instanceof GreenGradingValidationError) return t("error_green_grading", { detail: error.message });
  if (error instanceof ProcessTargetError) return t("error_process_target", { detail: error.message });
  if (error instanceof LabourValidationError) return t("error_labour", { detail: error.message });
  if (error instanceof MaterialConsumptionValidationError) {
    return t("error_material_consumption", { detail: error.message });
  }
  if (error instanceof CoordenadasValidationError) return t("error_coordenadas", { detail: error.message });
  // Entró con el PR #445 y el guardia la cazó al fusionar: sin esta rama era otro 500.
  if (error instanceof SitioNoEncontradoError) return t("error_sitio_no_encontrado", { detail: error.message });
  // Dos toques del mismo botón. No es un fallo del operario ni hay nada que
  // corregir en el formulario: lo que hay que decirle es que ya está guardado.
  if (error instanceof ClaveDeEnvioAjena) return t("error_clave_de_envio");
  // A4 (secado por bandeja, ajustes.md): sin esta rama, una bandeja cargada
  // entre que se pinta la página y se envía el cierre era un 500 — el mismo
  // caso que ya obligó a las ramas de arriba.
  //
  // RULING (Tarea 3): el `detail` es el MENSAJE traducido del código, no el
  // código crudo — `error.codigo` sin traducir se leería en español en la
  // pantalla en inglés. `BandejasDelSecado` es donde viven esos `error_<código>`
  // (los mismos que usa la bandeja del lote), así que se pide ese espacio
  // aparte, aquí, en vez de duplicar los 19 mensajes en `Traceability`.
  if (error instanceof BandejaError) {
    const tb = await getTranslations("BandejasDelSecado");
    return t("error_bandeja", { detail: tb(`error_${error.codigo}` as "error_bandeja_ocupada") });
  }
  throw error;
}

/**
 * La hora que escribió el operador, en el instante que de verdad significa.
 *
 * `new Date("2026-03-12T07:30")` la interpretaba en la zona DEL SERVIDOR — en
 * producción, UTC — así que un 07:30 de Panamá se guardaba como las 02:30. En
 * desarrollo no se veía: navegador y servidor comparten zona y el error se
 * cancela. Lo encontró una revisión independiente el 2026-08-31.
 */
const fechaLocal = (formData: FormData, campo: string) =>
  parseLocalDateTime(String(formData.get(campo) ?? ""), asString(formData.get(TZ_OFFSET_FIELD)));

/** Igual, pero un campo vacío es legítimo y devuelve `null`: `endedAt`, los
 *  cracks de un tueste. `fechaLocal` LANZA con la cadena vacía, así que usarlo
 *  en un campo opcional rompe el envío en cuanto alguien lo deja en blanco —
 *  que es el caso normal. */
const fechaLocalOpcional = (formData: FormData, campo: string) =>
  parseOptionalLocalDateTime(String(formData.get(campo) ?? ""), asString(formData.get(TZ_OFFSET_FIELD)));

const asString = (v: FormDataEntryValue | null) => (v == null ? null : String(v));

const emptyToNull = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
};

/**
 * Un booleano que puede no haberse registrado: `""` → `null`, `"yes"` → `true`,
 * `"no"` → `false`.
 *
 * **Sustituye a una casilla con campo oculto, que no distinguía los tres
 * estados desde el formulario.** El patrón anterior era: un `<input type=
 * "hidden" name="XPresent" value="1">` junto a la casilla, y en la acción
 * `marcada("XPresent") ? marcada("X") : null`. Pero el oculto se enviaba
 * SIEMPRE, así que la rama `null` era inalcanzable: dejar la casilla intacta
 * guardaba `false`, es decir «no», no «no lo sé».
 *
 * Lo caro no era el valor sino lo que se deriva de él. `camposDeProtocoloQue
 * Faltan` cuenta `null` como ausente y `false` como registrado, así que una
 * muestra foliar guardada sin tocar la casilla afirmaba que la rama no llevaba
 * fruto **y** se presentaba como comparable. Ausencia convertida en afirmación,
 * que es justo lo que ADR-080 prohíbe. Lo encontró la quinta revisión
 * independiente, la de la capa de pantalla.
 *
 * Un `<select>` de tres opciones lo arregla por partida doble: el operario
 * puede decir «sin registrar» a propósito, y la clave viaja SIEMPRE en el
 * `FormData`, que es lo que `soloLoQueVino` necesita para que una corrección
 * pueda borrar un valor anterior. Por eso el oculto ya no hace falta.
 */
const booleanoDeTresEstados = (value: FormDataEntryValue | null): boolean | null => {
  const texto = String(value ?? "").trim();
  if (texto === "yes") return true;
  if (texto === "no") return false;
  return null;
};

/**
 * Un número que el formulario **debe** traer. Un campo ausente o ilegible falla
 * en vez de convertirse en 0: un 0 en una columna de medida se lee como que
 * alguien midió cero, y eso es una afirmación (ADR-080).
 */
function requiredNumber(formData: FormData, campo: string): number {
  const crudo = String(formData.get(campo) ?? "").trim();
  if (!crudo) throw new MeasurementValidationError(`${campo}_required`);
  const n = Number(crudo);
  if (!Number.isFinite(n)) throw new MeasurementValidationError(`${campo}_not_a_number`);
  return n;
}

const emptyToNullNumber = (value: FormDataEntryValue | null) => {
  const str = String(value ?? "").trim();
  return str.length ? Number(str) : null;
};

// --- Create Lot (Harvest / Receiving), §30 screen 4 ---------------------

export async function recordHarvestAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let lotId: string;
  try {
    const { lot } = await recordHarvestEvent(user.userAccountId, {
      lotCode: String(formData.get("lotCode") ?? ""),
      locationId: String(formData.get("locationId") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      projectId: emptyToNull(formData.get("projectId")),
      harvestedAt: fechaLocal(formData, "harvestedAt"),
      cherryWeightKg: emptyToNullNumber(formData.get("cherryWeightKg")),
      brix: emptyToNullNumber(formData.get("brix")),
      // La cereza como dato (2026-09-11). `condition` ya no se pide en pantalla
      // —era texto libre con 29 filas diciendo «Ripe Cherry»— y se queda en el
      // modelo sólo para que esas 29 conserven su prosa.
      cherryColorValueId: emptyToNull(formData.get("cherryColorValueId")),
      cherryDefectsValueId: emptyToNull(formData.get("cherryDefectsValueId")),
      cherryCleanlinessValueId: emptyToNull(formData.get("cherryCleanlinessValueId")),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): a harvest weight/brix reading is an instrument value
      // read at receiving — measured_fact, not an unqualified claim.
      provenanceClass: "measured_fact",
    });
    lotId = lot.id;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath("/lots");
  redirect(`/lots/${lotId}`);
}

export async function recordReceivingAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  let lotId: string;
  try {
    const { lot } = await recordReceivingEvent(user.userAccountId, {
      lotCode: String(formData.get("lotCode") ?? ""),
      organizationId: String(formData.get("organizationId") ?? ""),
      locationId: emptyToNull(formData.get("locationId")),
      projectId: emptyToNull(formData.get("projectId")),
      receivedAt: fechaLocal(formData, "receivedAt"),
      deliveryNote: emptyToNull(formData.get("deliveryNote")),
      cherryWeightKg: emptyToNullNumber(formData.get("cherryWeightKg")),
      // Recepción sigue con `condition` de texto libre: su tabla es OTRA y
      // necesita su propia migración. Declarado como lo siguiente, 2026-09-11.
      condition: emptyToNull(formData.get("condition")),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): same reasoning as recordHarvestAction — a delivery
      // weight is a scale reading, measured_fact.
      provenanceClass: "measured_fact",
    });
    lotId = lot.id;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath("/lots");
  redirect(`/lots/${lotId}`);
}

// --- Record Measurement, §30 screen 5 (contextual component) ------------

export async function recordMeasurementAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  let inspeccionId: string | null = null;
  try {
    const medida = await recordMeasurement(user.userAccountId, {
      claveDeEnvio: emptyToNull(formData.get("claveDeEnvio")),
      lotId,
      instrumentId: emptyToNull(formData.get("instrumentId")),
      instrumentModeId: emptyToNull(formData.get("instrumentModeId")),
      materialState: emptyToNull(formData.get("materialState")) as import("../../generated/prisma/client").MaterialState | null,
      samplingEventId: emptyToNull(formData.get("samplingEventId")),
      samplingRole: emptyToNull(formData.get("samplingRole")) as import("../../generated/prisma/client").SamplingRole | null,
      samplingZone: emptyToNull(formData.get("samplingZone")) as import("../../generated/prisma/client").SamplingZone | null,
      sampleKind: emptyToNull(formData.get("sampleKind")) as import("../../generated/prisma/client").SampleKind | null,
      variable: String(formData.get("variable") ?? "") as never,
      // `?? 0` convertía un valor ausente en una medición de CERO. El
      // `required` del formulario sólo protege la interfaz: invocando la acción
      // sin `value` se creaba una lectura de 0 con aspecto de medida. Ahora se
      // exige, y el servicio ya distingue el 0 legítimo del ausente (ADR-080).
      value: requiredNumber(formData, "value"),
      unit: String(formData.get("unit") ?? ""),
      // **Cuándo se MIDIÓ, no cuándo se guardó** (Daniel, 2026-09-11). Antes
      // era `new Date()`: medir a las 7 y escribirlo a las 9 quedaba fechado a
      // las 9, y en una fermentación la curva es el dato. Va por
      // `parseLocalDateTime`, que combina el reloj de pared con el desfase del
      // dispositivo — un `new Date(cadena)` lo interpretaría en la zona del
      // SERVIDOR, que en producción es UTC, y guardaría un instante corrido
      // cinco horas con aspecto de correcto.
      occurredAt: fechaLocal(formData, "occurredAt"),
      notes: emptyToNull(formData.get("notes")),
      // Pre-existing gap fix: MeasurementForm now carries these as hidden
      // fields when rendered against an active FermentationRun/DryingRun/
      // StorageAssignment (see app/lots/[id]/page.tsx's MeasurementForm
      // call) — absent otherwise, same as roastSessionId once the R1 UI
      // wires it in.
      fermentationRunId: emptyToNull(formData.get("fermentationRunId")),
      dryingRunId: emptyToNull(formData.get("dryingRunId")),
      storageAssignmentId: emptyToNull(formData.get("storageAssignmentId")),
      // T9.5 §3(c): the one write path where the UI itself exposes both
      // fields (MeasurementForm) rather than the action choosing silently.
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_MEDICION),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
    });
    inspeccionId = medida.inspeccionId;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return inspeccionId ? { inspeccionId } : {};
}

// --- Record Fermentation, §30 screen 6 -----------------------------------

export async function startFermentationAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await startFermentationRun(user.userAccountId, {
      lotId,
      vesselNote: emptyToNull(formData.get("vesselNote")),
      startedAt: new Date(),
      inoculated: formData.get("inoculated") === "on",
      inoculationNote: emptyToNull(formData.get("inoculationNote")),
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      // T9.5 §3(b): starting a run is an action taken, not a measurement.
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

export async function recordFermentationInterventionFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordFermentationIntervention(user.userAccountId, {
    fermentationRunId: String(formData.get("fermentationRunId") ?? ""),
    interventionType: String(formData.get("interventionType") ?? "other") as never,
    occurredAt: new Date(),
    notes: emptyToNull(formData.get("notes")),
  });

  revalidatePath(`/lots/${lotId}`);
}

export async function endFermentationFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await endFermentationRun(user.userAccountId, {
    fermentationRunId: String(formData.get("fermentationRunId") ?? ""),
    endedAt: new Date(),
    outputLotCode: String(formData.get("outputLotCode") ?? ""),
    outputLotType: String(formData.get("outputLotType") ?? "drying") as never,
    quantity: emptyToNullNumber(formData.get("quantity")),
    unit: emptyToNull(formData.get("unit")),
    provenanceClass: "original_record",
  });

  revalidatePath(`/lots/${lotId}`);
}

// --- Record Drying, §30 screen 7 -----------------------------------------

/**
 * R1 §4 — registrar un tueste ya terminado.
 *
 * Una sola llamada, no un empezar/terminar como fermentación y secado: lo
 * decide el servicio en su cabecera y aquí sólo se respeta.
 *
 * Sin clave de idempotencia, y es deliberado: `recordRoastSession` crea el lote
 * de salida con `outputLotCode`, que es único por organización, así que un
 * segundo envío choca contra el índice y falla ruidosamente en vez de duplicar
 * — el mismo motivo por el que las muestras tampoco la llevan.
 */
/**
 * Marcar el perfil óptimo de un lote. Reemplaza al anterior si lo había: hay uno
 * vigente por lote, y la historia queda en la auditoría.
 */
export async function elegirPerfilDeTuesteAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await elegirPerfilDeTueste(user.userAccountId, {
      lotId,
      recipeVersionId: String(formData.get("recipeVersionId") ?? ""),
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

export async function recordRoastSessionAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await recordRoastSession(user.userAccountId, {
      lotId,
      outputLotCode: String(formData.get("outputLotCode") ?? "").trim(),
      // Sin valor por defecto aquí tampoco: si la pantalla no lo manda, el
      // servicio debe quejarse, no adivinar.
      purpose: String(formData.get("purpose") ?? "") as never,
      sourceSampleId: emptyToNull(formData.get("sourceSampleId")),
      recipeVersionId: emptyToNull(formData.get("recipeVersionId")),
      roastLevel: emptyToNull(formData.get("roastLevel")),
      equipmentNote: emptyToNull(formData.get("equipmentNote")),
      equipmentId: emptyToNull(formData.get("equipmentId")),
      chargeWeightKg: emptyToNullNumber(formData.get("chargeWeightKg")),
      dischargeWeightKg: emptyToNullNumber(formData.get("dischargeWeightKg")),
      startedAt: fechaLocal(formData, "startedAt"),
      endedAt: fechaLocalOpcional(formData, "endedAt"),
      firstCrackAt: fechaLocalOpcional(formData, "firstCrackAt"),
      secondCrackAt: fechaLocalOpcional(formData, "secondCrackAt"),
      notes: emptyToNull(formData.get("notes")),
      // §3: un perfil leído de la máquina y otro recordado esa noche no valen
      // lo mismo, así que se elige en la pantalla en vez de fijarse aquí.
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

export async function startDryingAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await startDryingRun(user.userAccountId, {
      lotId,
      method: emptyToNull(formData.get("method")),
      layerDepthCm: emptyToNullNumber(formData.get("layerDepthCm")),
      startedAt: new Date(),
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      // T9.5 §3(b): starting a run is an action taken, not a measurement.
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

export async function recordDryingTurnFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  await recordDryingTurnEvent(user.userAccountId, {
    dryingRunId: String(formData.get("dryingRunId") ?? ""),
    eventType: String(formData.get("eventType") ?? "other") as never,
    occurredAt: new Date(),
  });

  revalidatePath(`/lots/${lotId}`);
}

/**
 * «Revolví éstas» — la tanda, desde la cola de secado.
 *
 * **Las casillas son UNIDADES FÍSICAS y la tanda son CORRIDAS**, así que hay que deduplicar.
 * Seis bandejas del mismo lote son UNA corrida de secado, y `DryingTurnEvent` cuelga de la
 * corrida, no de la bandeja: el modelo no sabe registrar «volteé tres de las seis bandejas».
 * Sin el dedupe, marcar dos bandejas hermanas daría `tanda_con_unidad_repetida` — un error por
 * hacer exactamente lo que la pantalla invita a hacer.
 *
 * **Eso es un límite del modelo, no una decisión de esta pantalla**, y conviene que esté dicho
 * aquí: el día que un volteo necesite nombrar la bandeja, se cambia `DryingTurnEvent`.
 *
 * La hora es `new Date()` a propósito, como en el volteo suelto: el operario acaba de voltear y
 * lo está confirmando. No hay un reloj de pared que interpretar, así que no hay desfase que
 * combinar.
 */
export async function registrarTandaFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const corridas = [...new Set(formData.getAll("corrida").map(String).filter((c) => c.length > 0))];
  // Confirmar sin marcar nada no es un acto: sería una tanda que afirma que se volteó algo sin
  // decir qué. El servicio también lo rechaza; aquí se atrapa antes para dar un aviso y no un error.
  if (corridas.length === 0) redirect("/beneficio/secado?error=tanda_vacia");

  try {
    await registrarTandaDeVolteo(user.userAccountId, {
      dryingRunIds: corridas,
      occurredAt: new Date(),
      provenanceClass: "direct_observation",
    });
  } catch (error) {
    if (error instanceof TraceabilityAccessError) redirect("/beneficio/secado?error=sin_permiso");
    throw error;
  }

  revalidatePath("/beneficio/secado");
  redirect(`/beneficio/secado?ok=${corridas.length}`);
}

export async function endDryingFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await endDryingRun(user.userAccountId, {
      dryingRunId: String(formData.get("dryingRunId") ?? ""),
      endedAt: new Date(),
      outputLotCode: String(formData.get("outputLotCode") ?? ""),
      outputLotType: String(formData.get("outputLotType") ?? "") as never,
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      provenanceClass: "original_record",
    });
  } catch (error) {
    // A4 (secado por bandeja, ajustes.md): una bandeja cargada entre que se
    // pinta la página y se envía este formulario ya no es un 500 — vuelve al
    // lote con el código en la URL, que es lo único que esta acción sin
    // estado de error propio puede transmitir.
    if (error instanceof BandejaError || error instanceof DryingValidationError) {
      revalidatePath(`/lots/${lotId}`);
      const codigo = error instanceof BandejaError ? error.codigo : "estado_salida_invalido";
      redirect(`/lots/${lotId}?error=${codigo}`);
    }
    throw error;
  }

  revalidatePath(`/lots/${lotId}`);
}

// --- Record Storage Movement, §30 screen 8 -------------------------------

export async function recordStorageMoveAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await moveLotToStorage(user.userAccountId, {
      claveDeEnvio: emptyToNull(formData.get("claveDeEnvio")),
      lotId,
      locationId: String(formData.get("locationId") ?? ""),
      containerNote: emptyToNull(formData.get("containerNote")),
      startedAt: new Date(),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

// --- Create Sample, §30 screen 9 -----------------------------------------

export async function createSampleAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  const quantityGrams = emptyToNullNumber(formData.get("quantityGrams"));
  try {
    await createSampleFromLot(user.userAccountId, {
      sampleCode: String(formData.get("sampleCode") ?? ""),
      sampleType: String(formData.get("sampleType") ?? ""),
      materialState: emptyToNull(formData.get("materialState")) as import("../../generated/prisma/client").MaterialState | null,
      sourceLotId: lotId,
      quantity: quantityGrams == null ? emptyToNullNumber(formData.get("quantity")) : quantityGrams / 1000,
      unit: quantityGrams == null ? emptyToNull(formData.get("unit")) : "kg",
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): extracting a sample is an action taken against the lot.
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${lotId}`);
}

// --- Trilla desde almacenamiento -------------------------------------------

export async function recordHullingAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const lotId = String(formData.get("lotId") ?? "");

  let greenLotId: string;
  try {
    const result = await registrarTrilla(user.userAccountId, {
      lotePergaminoId: lotId,
      masaEntradaKg: Number(formData.get("masaEntradaKg")),
      loteVerde: {
        lotCode: String(formData.get("lotCode") ?? "").trim(),
        masaKg: Number(formData.get("masaVerdeKg")),
      },
      cascarillaKg: Number(formData.get("cascarillaKg")),
      mermaKg: Number(formData.get("mermaKg")),
      producedAtLocationId: String(formData.get("producedAtLocationId") ?? ""),
      occurredAt: fechaLocal(formData, "occurredAt"),
      provenanceClass: "original_record",
      notes: emptyToNull(formData.get("notes")),
    });
    greenLotId = result.loteVerde.id;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }
  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${greenLotId}`);
}

// --- Clasificacion del cafe verde por mallas -------------------------------

export async function recordGreenGradingAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const lotId = String(formData.get("lotId") ?? "");

  const fractions = [];
  const lastFraction = maxIndiceDeFilas(formData, "fractionQuantity");
  for (let i = 0; i <= lastFraction; i++) {
    const quantityKg = emptyToNullNumber(formData.get(`fractionQuantity.${i}`));
    const lotCode = emptyToNull(formData.get(`fractionLotCode.${i}`));
    if (quantityKg == null && !lotCode) continue;
    fractions.push({
      lotCode: lotCode ?? "",
      quantityKg: quantityKg ?? 0,
      screenMin: emptyToNullNumber(formData.get(`fractionScreenMin.${i}`)),
      screenMax: emptyToNullNumber(formData.get(`fractionScreenMax.${i}`)),
      screenSystem: emptyToNull(formData.get(`fractionScreenSystem.${i}`)),
      screenStatus: String(formData.get(`fractionScreenStatus.${i}`) ?? "unknown") as "measured" | "supplier_declared" | "qualitative" | "unknown",
      gradeNote: emptyToNull(formData.get(`fractionGradeNote.${i}`)),
      uniformityPct: emptyToNullNumber(formData.get(`fractionUniformityPct.${i}`)),
    });
  }

  const defectLots = [];
  const lastDefect = maxIndiceDeFilas(formData, "defectQuantity");
  for (let i = 0; i <= lastDefect; i++) {
    const quantityKg = emptyToNullNumber(formData.get(`defectQuantity.${i}`));
    const lotCode = emptyToNull(formData.get(`defectLotCode.${i}`));
    const rejectionCategoryValueId = emptyToNull(formData.get(`defectCategory.${i}`));
    if (quantityKg == null && !lotCode && !rejectionCategoryValueId) continue;
    if (quantityKg == null || !lotCode || !rejectionCategoryValueId) {
      return { error: t("error_green_grading", { detail: "defect_incomplete" }) };
    }
    defectLots.push({ lotCode, quantityKg, rejectionCategoryValueId });
  }

  let firstFractionId: string;
  try {
    const result = await recordGreenGrading(user.userAccountId, {
      inputLotId: lotId,
      inputQuantityKg: Number(formData.get("inputQuantityKg") ?? 0),
      fractions,
      defectLots,
      declaredLossKg: emptyToNullNumber(formData.get("declaredLossKg")),
      occurredAt: fechaLocal(formData, "occurredAt"),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: "original_record",
      sourceReference: emptyToNull(formData.get("sourceReference")),
    });
    firstFractionId = result.outputLots[0]?.id ?? lotId;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  redirect(`/lots/${firstFractionId}`);
}

// --- P3: selección (44_P3_SELECTION.md §6) ---------------------------------

/**
 * Records a selection from the batch page.
 *
 * Rejection rows arrive as parallel indexed fields (`rejectedCategory.0`,
 * `rejectedQuantity.0`, `rejectedLotCode.0`, ...) because the operator adds and
 * removes rows client-side and FormData has no nested shape. Rows whose weight
 * is blank are dropped rather than sent as zero: an operator who added a row
 * and then did not use it has not weighed nothing, they have not weighed.
 */
export async function recordSelectionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  const unit = String(formData.get("unit") ?? "kg");

  const rejected: Array<{ lotCode: string; lotType: never; quantity: number; rejectionCategoryValueId: string }> = [];
  // Mismo fallo que el de aportes de cosecha, mismo arreglo: el formulario deja
  // añadir filas de rechazo sin límite y este bucle paraba en 20. Un lote con
  // 21 categorías de rechazo perdía la última en silencio — y aquí el balance
  // de masa lo habría marcado como faltante sin explicar, culpando al operador.
  const totalRechazos = maxIndiceDeFilas(formData, "rejectedQuantity");
  for (let i = 0; i <= totalRechazos; i++) {
    const quantity = emptyToNullNumber(formData.get(`rejectedQuantity.${i}`));
    const category = emptyToNull(formData.get(`rejectedCategory.${i}`));
    const code = emptyToNull(formData.get(`rejectedLotCode.${i}`));
    if (quantity == null || !category || !code) continue;
    rejected.push({
      lotCode: code,
      lotType: String(formData.get("acceptedLotType") ?? "cherry") as never,
      quantity,
      rejectionCategoryValueId: category,
    });
  }

  try {
    await recordSelection(user.userAccountId, {
      inputLotId: lotId,
      inputQuantity: Number(formData.get("inputQuantity") ?? 0),
      unit,
      selectionMethodValueId: emptyToNull(formData.get("selectionMethod")),
      equipmentNote: emptyToNull(formData.get("equipmentNote")),
      accepted: {
        lotCode: String(formData.get("acceptedLotCode") ?? ""),
        lotType: String(formData.get("acceptedLotType") ?? "cherry") as never,
        quantity: Number(formData.get("acceptedQuantity") ?? 0),
      },
      rejected,
      declaredLossQuantity: emptyToNullNumber(formData.get("declaredLossQuantity")),
      declaredLossReason: emptyToNull(formData.get("declaredLossReason")),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
      // T9.5 §3(b): a selection is an action taken against the material, and
      // the weights on it are read off a scale — measured_fact, not a
      // recollection.
      provenanceClass: "measured_fact",
      // Vacío es `null` —«sin declarar»—, no una suposición. El servicio la exige si el método es
      // la flotación, y el formulario sólo la pide entonces.
      condicionDePesaje: emptyToNull(formData.get("condicionDePesaje")) as "DRAINED" | "WET" | "DRY" | null,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

// --- Split / merge / blend / stage_change, used by the Lot Detail "record processing step" mini-forms ---

export async function recordStageChangeFormAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const lotId = String(formData.get("lotId") ?? "");
  const outputLotCode = emptyToNull(formData.get("outputLotCode"));
  const outputLotType = emptyToNull(formData.get("outputLotType"));

  await recordTransformation(user.userAccountId, {
    transformationType: "stage_change",
    occurredAt: new Date(),
    // T9.5 §3(b): a stage change / split / merge / blend is an action
    // taken, not a measurement.
    provenanceClass: "original_record",
    inputs: [{ lotId, quantity: emptyToNullNumber(formData.get("quantity")), unit: emptyToNull(formData.get("unit")) }],
    outputs:
      outputLotCode && outputLotType
        ? [
            {
              lotCode: outputLotCode,
              lotType: outputLotType as never,
              quantity: emptyToNullNumber(formData.get("quantity")),
              unit: emptyToNull(formData.get("unit")),
            },
          ]
        : [],
  });

  revalidatePath(`/lots/${lotId}`);
}

// --- T12.5: Photo/asset attachment, §30's six attachment points ---------

export async function requestLotAssetUploadAction(
  lotId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    return await requestLotAssetUpload(user.userAccountId, { lotId, originalFilename, contentType });
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return { error: t("error_access", { detail: error.message }) };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

export async function finalizeLotAssetUploadAction(
  lotId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
  parent: LotAssetParent,
  creatorPersonId: string | null,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    await finalizeLotAssetUpload(user.userAccountId, {
      lotId,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename,
      parent,
      // T12.5 §2: a field photo — of a lot, a harvest, a measurement in
      // progress, a fermentation vessel, a drying bed, a sample — is
      // someone photographing what is directly in front of them at the
      // moment of capture, the same reasoning HarvestEvent's weight/brix
      // readings use for measured_fact, applied to direct_observation
      // instead since a photo documents rather than measures. Not
      // operator-selectable: unlike Measurement (T9.5 §3(c)), there is no
      // genuinely ambiguous case among these six attachment points to
      // expose a picker for.
      provenanceClass: "direct_observation",
      creatorPersonId,
    });
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return { error: t("error_access", { detail: error.message }) };
    throw error;
  }

  revalidatePath(`/lots/${lotId}`);
  return { ok: true };
}

// --- T12.6: Labour-time and material-consumption capture -----------------
// (docs/implementation/20_CAPTURE_OR_LOSE_IT_REPORT.md)

function labourParentFromFormData(formData: FormData): LabourEntryParent {
  const kind = String(formData.get("parentKind") ?? "");
  const parentId = String(formData.get("parentId") ?? "");
  switch (kind) {
    case "harvestEvent":
      return { kind, harvestEventId: parentId };
    case "receivingEvent":
      return { kind, receivingEventId: parentId };
    case "fermentationRun":
      return { kind, fermentationRunId: parentId };
    case "dryingRun":
      return { kind, dryingRunId: parentId };
    default:
      throw new TraceabilityAccessError("invalid_parent_kind");
  }
}

function consumptionParentFromFormData(formData: FormData): MaterialConsumptionParent {
  const kind = String(formData.get("parentKind") ?? "");
  const parentId = String(formData.get("parentId") ?? "");
  switch (kind) {
    case "fermentationRun":
      return { kind, fermentationRunId: parentId };
    case "dryingRun":
      return { kind, dryingRunId: parentId };
    default:
      throw new TraceabilityAccessError("invalid_parent_kind");
  }
}

/**
 * **Devuelve estado, no `void`.** Hasta el 2026-09-19 no capturaba nada: un
 * recuento en cero, unas horas en cero o un segundo toque del botón subían un
 * `LabourValidationError` o un `ClaveDeEnvioAjena` hasta el navegador, y lo que
 * veía el operario era un 500 (`PENDING_IMPLEMENTATIONS/013`).
 */
export async function recordLabourEntryFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await recordLabourEntry(user.userAccountId, {
      lotId,
      // La clave la pinta el servidor en un campo oculto y se renueva con el
      // `revalidatePath` de abajo: dos toques del mismo formulario la repiten,
      // un registro posterior legítimo lleva otra.
      claveDeEnvio: emptyToNull(formData.get("claveDeEnvio")),
      parent: labourParentFromFormData(formData),
      workerCount: Number(formData.get("workerCount") ?? 0),
      hours: Number(formData.get("hours") ?? 0),
      taskNote: emptyToNull(formData.get("taskNote")),
      providedByOrganizationId: emptyToNull(formData.get("providedByOrganizationId")),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
      // Source report §3: a headcount/hours tally reported at the time is a
      // direct observation — not operator-selectable, matching how T9.5
      // handled every call site without a genuinely ambiguous provenance.
      provenanceClass: "direct_observation",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

/** Igual que la de arriba, y por el mismo motivo: antes no capturaba nada. */
export async function recordMaterialConsumptionEntryFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await recordMaterialConsumptionEntry(user.userAccountId, {
      claveDeEnvio: emptyToNull(formData.get("claveDeEnvio")),
      lotId,
      parent: consumptionParentFromFormData(formData),
      materialName: String(formData.get("materialName") ?? ""),
      batchLabel: String(formData.get("batchLabel") ?? ""),
      quantity: emptyToNullNumber(formData.get("quantity")),
      unit: emptyToNull(formData.get("unit")),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
      provenanceClass: "direct_observation",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

/**
 * Create a recipe and its first version — ADR-100.
 *
 * The targets arrive as `targets[0][variable]`, `targets[0][moment]`… because
 * the count is not known in advance. Parsed by walking indices until one comes
 * up empty rather than trusting a hidden count field, which a truncated POST
 * would make wrong.
 */
export async function createRecipeAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const targets = parseTargetRows(formData);

  try {
    await createRecipeWithVersion(user.userAccountId, {
      name: String(formData.get("name") ?? ""),
      description: emptyToNull(formData.get("description")),
      organizationId: emptyToNull(formData.get("organizationId")),
      expectedHours: emptyToNullNumber(formData.get("expectedHours")),
      targets,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath("/recipes");
  redirect("/recipes?ok=1");
}

/** Shared by both recipe forms — the target rows arrive the same way. */
function parseTargetRows(formData: FormData) {
  const targets: {
    variable: string;
    moment: "initial" | "during" | "final";
    phase: "fermentation" | "drying";
    unit: string;
    targetValue: number | null;
    minValue: number | null;
    maxValue: number | null;
    everyHours: number | null;
    note: string | null;
  }[] = [];
  for (let i = 0; i < 50; i++) {
    const variable = formData.get(`targets[${i}][variable]`);
    if (typeof variable !== "string" || variable === "") break;
    targets.push({
      variable,
      moment: String(formData.get(`targets[${i}][moment]`) ?? "final") as "initial" | "during" | "final",
      // La fase por defecto es fermentación, que es lo que toda receta existente describe: un
      // formulario viejo o una llamada sin el campo sigue significando lo que significaba. Lo que
      // NO se admite es una fase inventada, así que cualquier otra cosa cae a fermentación y el
      // servicio la valida igual.
      phase: formData.get(`targets[${i}][phase]`) === "drying" ? "drying" : "fermentation",
      unit: String(formData.get(`targets[${i}][unit]`) ?? ""),
      targetValue: emptyToNullNumber(formData.get(`targets[${i}][targetValue]`)),
      minValue: emptyToNullNumber(formData.get(`targets[${i}][minValue]`)),
      maxValue: emptyToNullNumber(formData.get(`targets[${i}][maxValue]`)),
      // El formulario sólo pinta este campo con `moment: during` y lo limpia al
      // cambiar de momento, pero la acción no se fía de eso: se puede invocar
      // sin pasar por la pantalla, y `validateTargets` rechaza el caso.
      everyHours: emptyToNullNumber(formData.get(`targets[${i}][everyHours]`)),
      note: emptyToNull(formData.get(`targets[${i}][note]`)),
    });
  }
  return targets;
}

/** Rename a recipe, or reword its description — ADR-102. Never its targets. */
export async function updateRecipeAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const recipeId = String(formData.get("recipeId") ?? "");

  try {
    await updateRecipeMetadata(user.userAccountId, recipeId, {
      name: String(formData.get("name") ?? ""),
      description: emptyToNull(formData.get("description")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=renamed`);
}

/** A new version — the only way targets ever change (ADR-102). */
export async function createRecipeVersionAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const recipeId = String(formData.get("recipeId") ?? "");

  try {
    await createRecipeVersion(
      user.userAccountId,
      recipeId,
      parseTargetRows(formData),
      emptyToNull(formData.get("notes")),
      // Sin esto, publicar una v2 dejaba la version vigente sin duracion
      // esperada aunque la v1 la tuviera. Lo cazo la revision de Codex.
      emptyToNullNumber(formData.get("expectedHours")),
    );
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes");
  redirect(`/recipes/${recipeId}?ok=versioned`);
}

// --- Atributos de un lote de terreno (F1 §1 / P1 §3) ---------------------

/**
 * El servicio tiene forma de `PATCH`: una clave ausente se deja intacta y un
 * `null` explícito **borra** el valor. Este formulario muestra los ocho campos
 * a la vez, así que aquí se manda siempre el juego completo — lo que ves es lo
 * que se guarda, y vaciar una casilla la borra de verdad en vez de dejar un
 * valor viejo que la pantalla ya no muestra.
 *
 * `emptyToNullNumber` es lo que impide el fallo que de verdad importa: una
 * casilla de área vacía tiene que llegar como `null`, nunca como `0`. Un lote
 * de 0 ha no es un lote sin medir — es una afirmación, y encima haría que la
 * densidad se leyera como «área no positiva» en vez de «falta el área»
 * (ADR-080).
 */
export async function updatePlotAttributesAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await updateLocationAttributes(user.userAccountId, {
      locationId,
      areaHectares: emptyToNullNumber(formData.get("areaHectares")),
      plantSpacingMeters: emptyToNullNumber(formData.get("plantSpacingMeters")),
      altitudeMinM: emptyToNullNumber(formData.get("altitudeMinM")),
      altitudeMaxM: emptyToNullNumber(formData.get("altitudeMaxM")),
      sunExposure: emptyToNull(formData.get("sunExposure")) as never,
      shadePercentage: emptyToNull(formData.get("shadePercentage")) as never,
      slopeDescription: emptyToNull(formData.get("slopeDescription")),
      aspect: emptyToNull(formData.get("aspect")) as never,
      soilType: emptyToNull(formData.get("soilType")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  revalidatePath("/plots");
  return {};
}

// --- De qué bloques salió una cosecha (P1 §5) ----------------------------

/**
 * Añade aportes; **no reemplaza** los que ya hay. El servicio crea filas, así
 * que enviar dos veces suma dos veces, y la pantalla enseña siempre el total
 * acumulado para que eso se vea en lugar de sorprender.
 *
 * Una fila sin lote se salta en silencio: el formulario arranca con tres filas
 * vacías y llenar sólo una es lo normal. Lo que **no** se salta es una fila con
 * lote y sin peso — ese es el caso honesto de «este bloque aportó, y nadie lo
 * pesó por separado», que la reconciliación cuenta como desconocido y no como
 * cero (ADR-080).
 */
export async function recordHarvestSourcesFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  const harvestEventId = String(formData.get("harvestEventId") ?? "");

  const sources: Array<{
    locationId: string;
    plantingCohortId: string | null;
    cherryWeightKg: number | null;
    notes: string | null;
  }> = [];
  // Se recorren TODAS las filas que mandó el formulario, no las primeras veinte.
  // El formulario deja añadir filas sin límite y este bucle paraba en 20: una
  // cosecha de 21 bloques guardaba los primeros y decía que había ido bien.
  // Lo encontró una revisión independiente el 2026-08-31.
  const totalFilas = maxIndiceDeFilas(formData, "sourceLocation");
  for (let i = 0; i <= totalFilas; i++) {
    const locationId = emptyToNull(formData.get(`sourceLocation.${i}`));
    if (!locationId) continue;
    sources.push({
      locationId,
      plantingCohortId: emptyToNull(formData.get(`sourceCohort.${i}`)),
      cherryWeightKg: emptyToNullNumber(formData.get(`sourceWeight.${i}`)),
      notes: emptyToNull(formData.get(`sourceNotes.${i}`)),
    });
  }

  if (sources.length === 0) {
    return { error: t("error_harvest_sources", { detail: "sources_required" }) };
  }

  try {
    await recordHarvestSources(user.userAccountId, { harvestEventId, sources });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

// --- Registrar y corregir una siembra (P1 §1) ----------------------------

/**
 * La fecha llega como dos campos: el valor y su precisión. Un año suelto se
 * guarda como el 1 de enero de ese año **con `plantedPrecision: "year"`**, que
 * es lo que impide que la pantalla lo lea después como un día concreto. Sin
 * fecha, los dos van nulos: «no se sabe cuándo» es una respuesta legítima y
 * frecuente, y el servicio la acepta.
 *
 * La aritmética de año/mes/día vive en `lib/time/fechaConPrecision.ts` y no
 * aquí: `lib/sync/parcelaPayload.ts` (la cola sin señal) necesita la MISMA
 * regla, y antes de la ronda de arreglo 1 sobre Task 5 la tenía duplicada por
 * su cuenta. Ver la cabecera de ese módulo.
 */
function parsePlantedAt(formData: FormData): { plantedAt: Date | null; plantedPrecision: string | null } {
  const raw = String(formData.get("plantedAt") ?? "").trim();
  if (!raw) return { plantedAt: null, plantedPrecision: null };
  // <input type="date"> da YYYY-MM-DD; los otros dos modos recortan.
  const precision = String(formData.get("plantedPrecision") ?? "date");
  const { fecha, precision: precisionResuelta } = calcularFechaConPrecision(raw, precision);
  return { plantedAt: fecha, plantedPrecision: precisionResuelta };
}

export async function createPlantingCohortFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  const { plantedAt, plantedPrecision } = parsePlantedAt(formData);

  try {
    await createPlantingCohort(user.userAccountId, {
      locationId,
      cultivarValueId: emptyToNull(formData.get("cultivarValueId")),
      plantCount: emptyToNullNumber(formData.get("plantCount")),
      plantedAt,
      plantedPrecision: plantedPrecision as never,
      // ADR-038: sin valor por defecto. El formulario obliga a elegirlo porque
      // «de dónde sale este dato» no lo puede decidir una acción.
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_SIEMBRA),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}

export async function updatePlantingCohortFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  const { plantedAt, plantedPrecision } = parsePlantedAt(formData);

  try {
    await updatePlantingCohort(user.userAccountId, {
      cohortId: String(formData.get("cohortId") ?? ""),
      cultivarValueId: emptyToNull(formData.get("cultivarValueId")),
      plantCount: emptyToNullNumber(formData.get("plantCount")),
      plantedAt,
      plantedPrecision: plantedPrecision as never,
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
      notes: emptyToNull(formData.get("notes")),
      reason: String(formData.get("reason") ?? ""),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}

/**
 * Marca una siembra en producción — tablero de parcela, spec §5.
 *
 * La fecha pasa por `calcularFechaConPrecision`, la misma aritmética de
 * `plantedAt`, porque «desde 2019» no es el 1 de enero. Revalida el tablero y
 * los ajustes: los dos pintan el estado.
 */
export async function recordEnteredProductionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const raw = String(formData.get("occurredAt") ?? "").trim();
  if (!raw) return { error: t("plotDashboardProductionDateRequired") };
  const { fecha, precision } = calcularFechaConPrecision(raw, String(formData.get("occurredPrecision") ?? "year"));

  let locationId: string;
  try {
    // El servicio devuelve el evento creado, y de ahí sale la ruta a revalidar
    // — igual que `updateSoilProfileAction` con `perfil.locationId`. El
    // formulario ya no manda `locationId`: un campo del POST sería
    // independiente de la parcela real de la siembra.
    const evento = await recordEnteredProduction(user.userAccountId, {
      plantingCohortId: String(formData.get("cohortId") ?? ""),
      occurredAt: fecha,
      occurredPrecision: precision,
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_SIEMBRA),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
      notes: emptyToNull(formData.get("notes")),
    });
    locationId = evento.locationId;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}

// --- Trampas de broca (F2 §3–§4) ----------------------------------------

/** El estado del alta de trampa: además del error, el número que asignó el
 *  sistema, para que el operario lo rotule en la botella. */
export interface TrapActionState extends TraceabilityActionState {
  trapNumber?: number;
}

/**
 * Las tres acciones revalidan tablero y ajustes **también cuando fallan**: el
 * fallo puede deberse a que otro operario cambió la parcela entretanto (un
 * bloque con ese nombre, una trampa más), y la pantalla debe enseñarlo.
 * `locationId` del POST sólo decide qué ruta se refresca; la autorización la
 * hace el servicio sobre el id que de verdad escribe.
 */
function revalidarParcela(locationId: string) {
  if (!locationId) return;
  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
}

export async function createPlotBlockFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  try {
    await createPlotBlock(user.userAccountId, {
      locationId,
      name: String(formData.get("name") ?? ""),
      blockType: String(formData.get("blockType") ?? "") as never,
      description: emptyToNull(formData.get("description")),
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    revalidarParcela(locationId);
    return { error: await friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return {};
}

export async function setPlotBlockTypeFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  try {
    await setPlotBlockType(user.userAccountId, {
      plotBlockId: String(formData.get("plotBlockId") ?? ""),
      blockType: String(formData.get("blockType") ?? "") as never,
      description: emptyToNull(formData.get("description")),
    });
  } catch (error) {
    revalidarParcela(locationId);
    return { error: await friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return {};
}

export async function createTrapFormAction(
  _prevState: TrapActionState,
  formData: FormData,
): Promise<TrapActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  let trapNumber: number | null;
  try {
    const trampa = await createTrap(user.userAccountId, {
      locationId,
      plotBlockId: emptyToNull(formData.get("plotBlockId")),
      installedAt: fechaDeDiaRequerida(formData, "installedAt"),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
    });
    trapNumber = trampa.trapNumber;
  } catch (error) {
    revalidarParcela(locationId);
    return { error: await friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return trapNumber == null ? {} : { trapNumber };
}

export async function recordTrapCheckFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  try {
    // Sin número tecleado es `null`: nadie contó. Nunca un 0 (ADR-080).
    const conteo = emptyToNullNumber(formData.get("captureCount"));
    const otros = booleanoDeTresEstados(formData.get("otherInsects"));
    await recordTrapCheck(user.userAccountId, {
      specimenId: String(formData.get("specimenId") ?? ""),
      observedAt: fechaDeDiaRequerida(formData, "observedAt"),
      brocaLevel: String(formData.get("brocaLevel") ?? "") as never,
      captureCount: conteo,
      otherInsects: otros,
      // F8 fix-final — la nota se guarda salvo cuando "otros" es
      // explícitamente NO: antes se descartaba también con "sin registrar",
      // así que escribir una nota y dejar el selector sin tocar la borraba en
      // silencio.
      otherInsectsNote: otros === false ? null : emptyToNull(formData.get("otherInsectsNote")),
      // F1 fix-final (ADR-080) — tri-estado, como `otherInsects`: una casilla
      // sin marcar no distingue "no se hizo" de "no se preguntó".
      cleaned: booleanoDeTresEstados(formData.get("cleaned")),
      liquidChanged: booleanoDeTresEstados(formData.get("liquidChanged")),
      lureRecharged: booleanoDeTresEstados(formData.get("lureRecharged")),
      // F3 fix-final (spec §4.6) — quién estuvo en el campo.
      observerPersonId: emptyToNull(formData.get("observerPersonId")),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
    });
  } catch (error) {
    revalidarParcela(locationId);
    return { error: await friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return {};
}

/**
 * La regla de trampas de la finca — F2 §5. La finca viaja en el formulario
 * (`farmLocationId`) y `saveTrapRule` comprueba el acceso sobre ella; la
 * parcela (`locationId`) sólo sirve para revalidar las dos pantallas.
 */
export async function saveTrapRuleFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  const locationId = String(formData.get("locationId") ?? "");

  try {
    await saveTrapRule(user.userAccountId, {
      farmLocationId: String(formData.get("farmLocationId") ?? ""),
      triggerLevel: String(formData.get("triggerLevel") ?? "") as never,
      // Vacío o con letras da NaN o 0, y el servicio lo rechaza con su código.
      normalDays: Number(String(formData.get("normalDays") ?? "").trim() || Number.NaN),
      alertDays: Number(String(formData.get("alertDays") ?? "").trim() || Number.NaN),
      suggestedAction: String(formData.get("suggestedAction") ?? ""),
      // Vacío del selector es "sin producto", nunca un id inventado.
      suggestedMaterialId: emptyToNull(formData.get("suggestedMaterialId")),
    });
  } catch (error) {
    revalidarParcela(locationId);
    return { error: await friendlyError(t, error) };
  }

  revalidarParcela(locationId);
  return {};
}

// --- Jornada de campo (P2 §3–§5) ----------------------------------------

/**
 * Las coordenadas van todas o ninguna. El servicio ya lo exige; aquí se
 * respeta no mandando un objeto a medias: media coordenada no ubica nada y
 * guardarla sugeriría que sí.
 */
function parseCoordinates(formData: FormData) {
  const latitude = emptyToNullNumber(formData.get("latitude"));
  const longitude = emptyToNullNumber(formData.get("longitude"));
  const accuracyM = emptyToNullNumber(formData.get("accuracyM"));
  if (latitude == null && longitude == null) return undefined;
  return { latitude, longitude, accuracyM };
}

export async function startFieldSessionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  let sessionId: string;
  try {
    const session = await startFieldSession(user.userAccountId, {
      locationId,
      operatorPersonId: String(formData.get("operatorPersonId") ?? ""),
      startedAt: fechaLocal(formData, "startedAt"),
      start: parseCoordinates(formData),
      notes: emptyToNull(formData.get("notes")),
      // Las casillas marcadas. `getAll` devuelve [] cuando no hay ninguna, y [] NO es
      // «sin registrar» —eso es sólo `null`, de la cola offline vieja—: el servicio lo
      // rechaza con `proposito_requerido`, que `friendlyError` convierte en mensaje.
      purposes: formData.getAll("purposes").map((v) => String(v)),
      // Una jornada la abre quien está en el sitio: es observación directa de
      // que la visita ocurrió, no un registro transcrito de otra fuente.
      provenanceClass: "direct_observation",
    });
    sessionId = session.id;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  // Intencional, y NO es el patrón `volverA` de las otras acciones de esta
  // tarea: quien abre una jornada va a trabajar en ella, no vuelve al tablero.
  redirect(`/field-sessions/${sessionId}`);
}

export async function recordFieldEventFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  try {
    await recordFieldEvent(user.userAccountId, {
      fieldSessionId,
      eventKindValueId: String(formData.get("eventKindValueId") ?? ""),
      occurredAt: fechaLocal(formData, "occurredAt"),
      position: parseCoordinates(formData),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: "direct_observation",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  return {};
}

export async function endFieldSessionFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  try {
    await endFieldSession(user.userAccountId, {
      fieldSessionId,
      endedAt: fechaLocal(formData, "endedAt"),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  return {};
}

// --- Corregir una medición (C1 §3) --------------------------------------

/**
 * Una corrección **no borra ni edita** la lectura original: crea una medición
 * nueva que la supersede vía `correctsId`, y la vieja se queda en el registro.
 * Es lo contrario del `PATCH` con que se corrige una cohorte, y la asimetría es
 * deliberada: el valor de una medición **fue observado** y sigue siéndolo
 * aunque estuviera mal apuntado; el conteo de una cohorte es una cifra que se
 * escribió, sin más.
 *
 * El motivo es obligatorio en el servicio. Aquí no se inventa uno por defecto.
 */
export async function correctMeasurementFormAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await correctMeasurement(user.userAccountId, {
      measurementId: String(formData.get("measurementId") ?? ""),
      // `?? 0` convertía un valor ausente en una medición de CERO. El
      // `required` del formulario sólo protege la interfaz: invocando la acción
      // sin `value` se creaba una lectura de 0 con aspecto de medida. Ahora se
      // exige, y el servicio ya distingue el 0 legítimo del ausente (ADR-080).
      value: requiredNumber(formData, "value"),
      unit: String(formData.get("unit") ?? ""),
      // Cuándo ocurrió la lectura CORRECTA. No es «ahora»: corregir a las seis
      // de la tarde una lectura de las nueve de la mañana no la mueve a la
      // tarde, y ponerlo por defecto invitaría a dejarlo mal.
      occurredAt: fechaLocal(formData, "occurredAt"),
      reason: String(formData.get("reason") ?? ""),
      operatorPersonId: emptyToNull(formData.get("operatorPersonId")),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_MEDICION),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}`);
  return {};
}

// --- Caracterización de un lote de biochar (S1 §2, Tabla 7) --------------

/**
 * Una lectura de laboratorio sobre un sujeto que no es café.
 *
 * Acción propia y no un parámetro más de `recordMeasurementAction`: aquélla
 * empieza leyendo `lotId` y revalida `/lots/[id]`, y aquí el sujeto no es un
 * lote de café. Compartirla habría obligado a que una acción decidiera por `if`
 * qué clase de sujeto tiene y a qué ruta pertenece.
 *
 * La clase de sujeto llega como un campo y **se valida contra una lista
 * cerrada**: es un valor de formulario, y un valor de formulario que se usa
 * como nombre de campo sin comprobar es cómo se escribe en una columna que
 * nadie pretendía.
 */
const SUJETOS_DE_LABORATORIO = ["biocharBatchId", "soilSampleId", "foliarSampleId"] as const;
type SujetoDeLaboratorio = (typeof SUJETOS_DE_LABORATORIO)[number];

export async function recordLabMeasurementAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const sujeto = String(formData.get("sujeto") ?? "") as SujetoDeLaboratorio;
  const sujetoId = String(formData.get("sujetoId") ?? "");
  if (!SUJETOS_DE_LABORATORIO.includes(sujeto)) {
    return { error: t("error_sample", { detail: "unknown_subject" }) };
  }

  try {
    await recordMeasurement(user.userAccountId, {
      claveDeEnvio: emptyToNull(formData.get("claveDeEnvio")),
      [sujeto]: sujetoId,
      variable: String(formData.get("variable") ?? "") as never,
      // Nunca `?? 0`: una casilla vacía no es una lectura de cero (ADR-080).
      value: requiredNumber(formData, "value"),
      unit: String(formData.get("unit") ?? ""),
      occurredAt: fechaDeDiaRequerida(formData, "occurredAt"),
      notes: emptyToNull(formData.get("notes")),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_ANALISIS),
      sourceReference: emptyToNull(formData.get("sourceReference")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  // La ficha del biochar vive en su propia ruta; las muestras, en la del lote.
  revalidatePath(sujeto === "biocharBatchId" ? `/biochar/${sujetoId}` : "/plots", "layout");
  return {};
}

// --- Lote de biochar (S1 §2, semanas 1-4) --------------------------------

/**
 * Fecha de producción: sólo el día, sin hora.
 *
 * `<input type="date">` da `YYYY-MM-DD`, y una cadena ISO de sólo fecha se
 * interpreta en UTC por especificación — así que aquí NO hace falta el desfase
 * del dispositivo que sí necesita `datetime-local` (ver `fechaLocal`). Un lote
 * de biochar se anota por día; nadie registra a qué hora se apagó el horno.
 */
// La lógica subió a `lib/time/localDateTime.ts` el 2026-09-11 para que haya UNA
// fuente: de un archivo `"use server"` no se puede exportar, así que
// `app/actions/apiary.ts` no podía reutilizarla y acabó parseando su campo de día
// con el parser de instantes — un fallo real, con `digest`, al crear una colmena
// con fecha. Aquí queda el envoltorio que lee el `FormData`; la regla del día y
// la comprobación del 31 de febrero viven en un solo sitio.
const fechaDeDia = (formData: FormData, campo: string) => {
  try {
    return fechaDeDiaCompartida(formData.get(campo) as string | null, campo);
  } catch (error) {
    // Se re-envuelve en el error LOCAL porque los `catch` de este archivo lo
    // nombran, y cambiarlos sería un cambio mucho mayor que el arreglo.
    if (error instanceof FechaDeDiaInvalida) throw new FechaInvalidaError(error.message);
    throw error;
  }
};

/**
 * Una fecha que el POST trae y no existe en el calendario.
 *
 * **Sin `export`, y no es estilo.** Este archivo es `"use server"`, y de uno de
 * esos Next.js sólo deja exportar funciones `async`: cada export se convierte en
 * un punto de entrada invocable desde el navegador, y una clase no lo es. Con el
 * `export` puesto, `next build` cae con 69 errores —todo lo que importa el
 * módulo deja de resolver— mientras tipos, lint y tests siguen en verde, porque
 * para TypeScript el archivo es válido. Estuvo así una hora en `main`.
 *
 * Sólo se lanza y se captura aquí dentro, así que el `export` nunca hizo falta.
 * El guardia está en `tests/arquitectura/use-server-solo-async.test.ts`.
 */
class FechaInvalidaError extends Error {}

/**
 * Una fecha que el registro EXIGE. Ausente falla, no se inventa.
 *
 * Cuatro acciones hacían `fechaDeDia(...) ?? new Date()`: si el POST omitía la
 * fecha, la fila afirmaba que la muestra se tomó hoy. Es el mismo patrón que el
 * `?? 0` que ya creó mediciones de cero — convertir una ausencia en una
 * afirmación (ADR-080). Lo encontró la cuarta revisión.
 */
const fechaDeDiaRequerida = (formData: FormData, campo: string) => {
  const fecha = fechaDeDia(formData, campo);
  if (!fecha) throw new FechaInvalidaError(`${campo}_required`);
  return fecha;
};

/** Los campos de la Tabla 6 que comparten crear y corregir. */
/**
 * Quita las claves cuyo campo **no venía en el POST**.
 *
 * Los servicios tienen contrato PATCH: `undefined` conserva, `null` borra. Las
 * acciones de corrección construían el objeto con TODAS las claves, mapeando
 * ausencia a `null`, así que una invocación parcial **vaciaba** lo que no
 * mencionaba — el régimen térmico de un lote de biochar, las señales de
 * anaerobiosis de una calicata. Por la pantalla no pasaba, porque el formulario
 * de edición pinta todos los campos; pero el formulario no es la frontera
 * (SECURITY.md §2), y el contrato que el servicio documenta quedaba desmentido
 * por la acción que lo llama. Lo encontró la cuarta revisión independiente.
 *
 * Al CREAR no se usa: ahí no hay nada que conservar, y ausente = `null` es
 * correcto.
 */
function soloLoQueVino<T extends Record<string, unknown>>(
  formData: FormData,
  campos: T,
  /** Campos que no son casillas y cuyo nombre en el POST difiere de la clave. */
  alias: Record<string, string> = {},
): Partial<T> {
  const salida: Partial<T> = {};
  for (const clave of Object.keys(campos) as (keyof T & string)[]) {
    if (formData.has(alias[clave] ?? clave)) salida[clave] = campos[clave];
  }
  return salida;
}

function camposDeBiochar(formData: FormData) {
  return {
    producedAt: fechaDeDia(formData, "producedAt"),
    feedstock: emptyToNull(formData.get("feedstock")),
    feedstockSource: emptyToNull(formData.get("feedstockSource")),
    moistureCondition: emptyToNull(formData.get("moistureCondition")) as never,
    kilnDesign: emptyToNull(formData.get("kilnDesign")),
    peakTemperatureC: emptyToNullNumber(formData.get("peakTemperatureC")),
    temperatureMethod: emptyToNull(formData.get("temperatureMethod")),
    burnDurationMinutes: emptyToNullNumber(formData.get("burnDurationMinutes")),
    timeAtPeakMinutes: emptyToNullNumber(formData.get("timeAtPeakMinutes")),
    oxygenManagement: emptyToNull(formData.get("oxygenManagement")),
    cooling: emptyToNull(formData.get("cooling")) as never,
    quenchWaterSource: emptyToNull(formData.get("quenchWaterSource")),
    particleSize: emptyToNull(formData.get("particleSize")),
    storageConditions: emptyToNull(formData.get("storageConditions")),
    chargingMaterial: emptyToNull(formData.get("chargingMaterial")),
    chargingRatio: emptyToNull(formData.get("chargingRatio")),
    coComposted: booleanoDeTresEstados(formData.get("coComposted")),
    chargingDurationDays: emptyToNullNumber(formData.get("chargingDurationDays")),
    analysisLaboratory: emptyToNull(formData.get("analysisLaboratory")),
    notes: emptyToNull(formData.get("notes")),
    dataQuality: emptyToNull(formData.get("dataQuality")) as never,
  };
}

export async function createBiocharBatchAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  try {
    await createBiocharBatch(user.userAccountId, {
      batchCode: String(formData.get("batchCode") ?? ""),
      // La organización ya no viaja: se deriva de la Location en el servicio.
      producedAtLocationId: String(formData.get("producedAtLocationId") ?? ""),
      // ADR-038: sin valor por defecto. Lo elige el formulario, que obliga.
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_BIOCHAR),
      ...camposDeBiochar(formData),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath("/biochar");
  return {};
}

export async function updateBiocharBatchAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const biocharBatchId = String(formData.get("biocharBatchId") ?? "");
  try {
    await updateBiocharBatch(user.userAccountId, {
      biocharBatchId,
      batchCode: String(formData.get("batchCode") ?? ""),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_BIOCHAR),
      ...soloLoQueVino(formData, camposDeBiochar(formData)),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/biochar/${biocharBatchId}`);
  revalidatePath("/biochar");
  return {};
}

// --- Calicata (S1 §2, semanas 3-6) ---------------------------------------

/** Los campos que comparten describir y corregir. */
function camposDeCalicata(formData: FormData) {
  return {
    pitDepthCm: emptyToNullNumber(formData.get("pitDepthCm")),
    rootingDepthCm: emptyToNullNumber(formData.get("rootingDepthCm")),
    rootDistribution: emptyToNull(formData.get("rootDistribution")),
    mottling: emptyToNull(formData.get("mottling")) as never,
    greyColours: emptyToNull(formData.get("greyColours")) as never,
    rootChannelConcretions: emptyToNull(formData.get("rootChannelConcretions")) as never,
    sourSmell: emptyToNull(formData.get("sourSmell")) as never,
    impedingLayerDepthCm: emptyToNullNumber(formData.get("impedingLayerDepthCm")),
    impedingLayerNote: emptyToNull(formData.get("impedingLayerNote")),
    notes: emptyToNull(formData.get("notes")),
    dataQuality: emptyToNull(formData.get("dataQuality")) as never,
  };
}

export async function createSoilProfileAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await createSoilProfile(user.userAccountId, {
      locationId,
      describedAt: fechaDeDiaRequerida(formData, "describedAt"),
      // ADR-038: sin valor por defecto. El formulario obliga a elegirlo.
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      horizons: horizontesDelFormulario(formData),
      ...camposDeCalicata(formData),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  // Fix round 1 (Tarea 6): `/plots/[id]/suelo/nuevo` manda `volverA` para
  // volver a la pestaña Condiciones al guardar. Fuera del try/catch: `redirect()`
  // lanza una señal especial (NEXT_REDIRECT) que un catch de arriba se tragaría.
  const destino = volverAValido(String(formData.get("volverA") ?? ""), locationId);
  if (destino) redirect(destino);
  return {};
}

export async function updateSoilProfileAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  try {
    // El servicio devuelve el perfil corregido, y de ahí sale la ruta a
    // revalidar. Antes se usaba el `locationId` **del POST**, que es un campo
    // independiente: corregir un perfil del bloque B revalidaba el bloque A si
    // el POST lo decía. No permitía escribir donde no se debe —el ámbito lo
    // deriva el servicio del propio perfil— pero dejaba la página de B
    // cacheada con el valor viejo. Lo encontró la cuarta revisión.
    const perfil = await updateSoilProfile(user.userAccountId, {
      soilProfileId: String(formData.get("soilProfileId") ?? ""),
      describedAt: formData.has("describedAt") ? fechaDeDiaRequerida(formData, "describedAt") : undefined,
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      ...soloLoQueVino(formData, camposDeCalicata(formData)),
    });
    revalidatePath(`/plots/${perfil.locationId}`);
    revalidatePath(`/plots/${perfil.locationId}/ajustes`);
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  return {};
}

// --- Muestras al laboratorio (S1 §2, semanas 6-10) -----------------------

export async function createSoilSampleAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await createSoilSample(user.userAccountId, {
      locationId,
      sampleCode: String(formData.get("sampleCode") ?? ""),
      sampledAt: fechaDeDiaRequerida(formData, "sampledAt"),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      treatmentPlotLabel: emptyToNull(formData.get("treatmentPlotLabel")),
      samplingPointLabel: emptyToNull(formData.get("samplingPointLabel")),
      depthTopCm: emptyToNullNumber(formData.get("depthTopCm")),
      depthBottomCm: emptyToNullNumber(formData.get("depthBottomCm")),
      subSampleCount: emptyToNullNumber(formData.get("subSampleCount")),
      laboratory: emptyToNull(formData.get("laboratory")),
      extractionMethod: emptyToNull(formData.get("extractionMethod")),
      notes: emptyToNull(formData.get("notes")),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  // Fix round 1 (Tarea 6): `/plots/[id]/muestras/nueva` manda `volverA` para
  // volver a la pestaña Muestras al guardar. Fuera del try/catch: `redirect()`
  // lanza una señal especial (NEXT_REDIRECT) que un catch de arriba se tragaría.
  const destino = volverAValido(String(formData.get("volverA") ?? ""), locationId);
  if (destino) redirect(destino);
  return {};
}

export async function createFoliarSampleAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await createFoliarSample(user.userAccountId, {
      locationId,
      sampleCode: String(formData.get("sampleCode") ?? ""),
      sampledAt: fechaDeDiaRequerida(formData, "sampledAt"),
      provenanceClass: exigeProcedencia(formData.get("provenanceClass"), PROCEDENCIA_DE_REGISTRO_DE_CAMPO),
      treatmentPlotLabel: emptyToNull(formData.get("treatmentPlotLabel")),
      leafPairPosition: emptyToNullNumber(formData.get("leafPairPosition")),
      canopyPosition: emptyToNull(formData.get("canopyPosition")) as never,
      treeAgeYears: emptyToNullNumber(formData.get("treeAgeYears")),
      cultivar: emptyToNull(formData.get("cultivar")),
      phenologicalStage: emptyToNull(formData.get("phenologicalStage")),
      branchBearingFruit: booleanoDeTresEstados(formData.get("branchBearingFruit")),
      laboratory: emptyToNull(formData.get("laboratory")),
      notes: emptyToNull(formData.get("notes")),
      dataQuality: emptyToNull(formData.get("dataQuality")) as never,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  // Fix round 1 (Tarea 6): `/plots/[id]/muestras/nueva` manda `volverA` para
  // volver a la pestaña Muestras al guardar. Fuera del try/catch: `redirect()`
  // lanza una señal especial (NEXT_REDIRECT) que un catch de arriba se tragaría.
  const destino = volverAValido(String(formData.get("volverA") ?? ""), locationId);
  if (destino) redirect(destino);
  return {};
}

// --- Fotografías de la tierra (S1 §2) ------------------------------------

export async function requestLandAssetUploadAction(
  locationId: string,
  originalFilename: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    return await requestLandAssetUpload(user.userAccountId, { locationId, originalFilename, contentType });
  } catch (error) {
    if (error instanceof LocationAccessError) return { error: t("error_access", { detail: error.message }) };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

export async function finalizeLandAssetUploadAction(
  locationId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
  parent: LandAssetParent,
  creatorPersonId: string | null,
  // Fix round 1 (Tarea 6): opcional — `/plots/[id]/fotos/nueva` lo manda para
  // volver a la pestaña Fotos al guardar. Los demás llamadores (la foto de una
  // calicata, en la pestaña Condiciones) no lo pasan y quedan exactamente como
  // antes.
  volverA?: string | null,
): Promise<{ ok: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    await finalizeLandAssetUpload(user.userAccountId, {
      locationId,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename,
      parent,
      // Una fotografía de campo es evidencia original: la tomó quien estaba
      // ahí. No es `measured_fact` —no hay instrumento— ni una interpretación.
      provenanceClass: "direct_observation",
      creatorPersonId,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  // Fuera del try/catch: `redirect()` lanza una señal especial (NEXT_REDIRECT)
  // que un catch de arriba se tragaría.
  const destino = volverAValido(volverA, locationId);
  if (destino) redirect(destino);
  return { ok: true };
}

// --- Foto de la ronda de trampas, sin señal (Tarea 12) -------------------
//
// Gemelas de `requestLandAssetUploadAction`/`finalizeLandAssetUploadAction`
// de arriba, y NO un `if` dentro de ellas: ruling P2 del controlador gatea
// esta pareja con `requireTrapAccess` (specimen:manage), nunca con
// `location:manage_attributes`, y las dos de arriba siguen exactamente como
// estaban para los demás padres (bloque, perfil de suelo, lote de biochar).

export async function requestTrampaPhotoUploadAction(
  locationId: string,
  originalFilename: string,
  contentType: string,
  // Fix round 1 (Tarea 12) — el clientDraftId de la FOTO, del que
  // `requestTrampaPhotoUpload` deriva la clave. Es lo que hace que un
  // reintento con acuse perdido calcule la MISMA clave en vez de una nueva.
  photoClientDraftId: string,
  // A6 fix-final — el clientDraftId de la REVISIÓN a la que esta foto dice
  // pertenecer. Sin él, `requestTrampaPhotoUpload` no puede comprobar si la
  // clave derivada ya tiene un `Asset` de OTRA revisión antes de firmar el
  // PUT — ver su docstring en `landMedia.ts`.
  revisionClientDraftId: string,
): Promise<{ uploadUrl: string; storageKey: string } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Traceability");
  try {
    return await requestTrampaPhotoUpload(user.userAccountId, {
      locationId,
      originalFilename,
      contentType,
      photoClientDraftId,
      revisionClientDraftId,
    });
  } catch (error) {
    if (error instanceof TrapAccessError) return { error: t("error_access", { detail: error.message }) };
    if (error instanceof Error) return { error: error.message };
    throw error;
  }
}

/**
 * `{ pendiente: true }` no es un error: la revisión todavía no llegó por su
 * propia cola (Tarea 11) y la foto se reintenta, sin engancharse nunca a otra
 * revisión (spec §4.3). `syncTrapPhotos` (`lib/sync/trapPhotoQueue.ts`) es
 * quien distingue las tres formas de esta respuesta.
 */
export async function finalizeTrampaPhotoPorBorradorAction(
  locationId: string,
  storageKey: string,
  mimeType: string,
  sizeBytes: number,
  originalFilename: string,
  revisionClientDraftId: string,
): Promise<{ ok: true } | { pendiente: true } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");
  try {
    await finalizeTrampaPhotoPorBorrador(user.userAccountId, {
      locationId,
      storageKey,
      mimeType,
      sizeBytes,
      originalFilename,
      revisionClientDraftId,
      // Una fotografía de la ronda es evidencia original: la tomó quien
      // registró la revisión. Misma regla que la revisión (T10, ruling del
      // controlador): procedencia siempre observación directa.
      provenanceClass: "direct_observation",
      // A5 fix-final (I6) — ya NO se acepta `creatorPersonId` del llamador.
      // Antes esta acción reenviaba lo que le pasara `syncTrapPhotos`
      // (siempre `null` por la UI real), pero seguía existiendo un parámetro
      // que una llamada directa a la Server Action podía forjar con el id de
      // otra Person — el mismo patrón que `observerPersonId`/`provenanceClass`
      // ya cerraron. `finalizeTrampaPhotoPorBorrador` fija siempre
      // `userAccount.personId` en el servidor.
    });
  } catch (error) {
    if (error instanceof LandMediaValidationError && error.message === "revision_not_found_yet") {
      return { pendiente: true };
    }
    return { error: await friendlyError(t, error) };
  }
  revalidatePath("/finca/trampas/ronda");
  return { ok: true };
}

// ── El proceso de un lote ───────────────────────────────────────────────────
//
// Seis acciones y no una: abrir, cambiar el objetivo, cambiar la intención,
// registrar un manejo, cerrar y devolver a secado son operaciones distintas con
// autorizaciones y errores distintos. Meterlas en un `switch` sobre un campo
// oculto haría que un fallo de una se leyera como el de otra.
//
// Todas devuelven a `/lots/[id]/process`, que es donde el operador está: en el
// campo, con el teléfono, sin ganas de volver a navegar.

export async function abrirProcesoAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await abrirProceso(user.userAccountId, {
      lotId,
      intent: String(formData.get("intent") ?? ""),
      targetMoisturePct: Number(formData.get("targetMoisturePct")),
      processRecipeVersionId: emptyToNull(formData.get("processRecipeVersionId")),
      // Sin `emptyToNull`: son obligatorios. Un formulario que llegue vacío
      // manda la cadena vacía y el servicio la rechaza con una frase legible,
      // en vez de convertirla en `null` y morir contra la clave foránea.
      processGradeValueId: String(formData.get("processGradeValueId") ?? ""),
      cherryStateValueId: String(formData.get("cherryStateValueId") ?? ""),
      notes: emptyToNull(formData.get("notes")),
      startedAt: new Date(),
      // Abrir un proceso es una acción tomada, no una medición — el mismo
      // criterio que `startDryingAction` (T9.5 §3b).
      provenanceClass: "original_record",
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}/process`);
  redirect(`/lots/${lotId}/process`);
}

export async function cambiarObjetivoAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await cambiarObjetivoDeHumedad(
      user.userAccountId,
      String(formData.get("lotProcessId") ?? ""),
      Number(formData.get("targetMoisturePct")),
      emptyToNull(formData.get("razon")),
    );
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}/process`);
  redirect(`/lots/${lotId}/process`);
}

export async function cambiarIntencionAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await cambiarIntencion(
      user.userAccountId,
      String(formData.get("lotProcessId") ?? ""),
      String(formData.get("intent") ?? ""),
      emptyToNull(formData.get("razon")),
    );
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}/process`);
  redirect(`/lots/${lotId}/process`);
}

export async function registrarIntervencionAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await registrarIntervencion(user.userAccountId, {
      lotProcessId: String(formData.get("lotProcessId") ?? ""),
      catalogValueId: String(formData.get("catalogValueId") ?? ""),
      occurredAt: new Date(),
      notes: emptyToNull(formData.get("notes")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}/process`);
  redirect(`/lots/${lotId}/process`);
}

export async function cerrarProcesoAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await cerrarProceso(user.userAccountId, {
      lotProcessId: String(formData.get("lotProcessId") ?? ""),
      endedAt: new Date(),
      closingMoistureMeasurementId: String(formData.get("closingMoistureMeasurementId") ?? ""),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}/process`);
  redirect(`/lots/${lotId}/process`);
}

export async function devolverASecadoAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const lotId = String(formData.get("lotId") ?? "");
  try {
    await devolverASecado(user.userAccountId, {
      lotId,
      motivoValueId: String(formData.get("motivoValueId") ?? ""),
      nota: emptyToNull(formData.get("nota")),
      ocurrioEn: new Date(),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/lots/${lotId}/process`);
  redirect(`/lots/${lotId}/process`);
}

/**
 * Declarar dónde está un sitio, a partir de lo que dijeron las visitas.
 *
 * Recibe la latitud y la longitud del formulario **en vez de recogerlas del
 * servicio**: si las leyera del propio cálculo, «confirmar» sería un botón que
 * aprueba lo que el sistema ya decidió, y una lectura de GPS se habría
 * convertido en un hecho declarado por la puerta de atrás (`CLAUDE.md` §3).
 */
export async function confirmarCoordenadasAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    // Los campos son editables, así que una latitud de 95 llega de verdad. Sin
    // este `catch` —así estuvo hasta el 2026-09-19— eso era un 500 en vez de
    // «esa latitud no existe».
    await confirmarCoordenadasDelSitio(user.userAccountId, {
      locationId,
      latitude: Number(formData.get("latitude")),
      longitude: Number(formData.get("longitude")),
      reason: String(formData.get("reason") ?? "").trim() || null,
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/apiaries/${locationId}`);
  return {};
}

/**
 * Emitir el informe de una visita.
 *
 * **La puerta que faltaba** (medido el 2026-09-10): `emitirReporteDeVisita`
 * existía desde A9.6 y **no lo llamaba nadie**. La pantalla del informe lee lo
 * congelado con `leerReporteDeVisita` y hace `notFound()` si no hay nada, así
 * que cerrar una visita y pulsar «informe» daba **404**. El servicio estaba
 * entero y la mitad del flujo era inalcanzable desde la aplicación.
 *
 * Redirige al informe recién emitido, que es lo que se quería ver.
 */
export async function emitirReporteDeVisitaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  try {
    await emitirReporteDeVisita(user.userAccountId, { fieldSessionId });
  } catch (error) {
    if (error instanceof ReporteError) {
      return { error: t(`error_${error.message}` as "error_visita_sin_completar") };
    }
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  redirect(`/field-sessions/${fieldSessionId}/report`);
}

/** Lo que devuelve publicar: el enlace se enseña **una sola vez**. */
export interface EnlaceDeReporteState extends TraceabilityActionState {
  /** La ruta pública completa, con el token en claro. Sólo existe aquí. */
  enlace?: string;
  expira?: string;
}

/**
 * Publicar el enlace con el que un supervisor abre el informe sin cuenta.
 *
 * **El token en claro existe una sola vez**, cuando se emite: la base guarda su
 * hash, por la misma razón que el refresh de los aparatos. Así que se devuelve
 * en el estado del formulario y la pantalla lo enseña ahí mismo; si se pierde,
 * se publica otro y se revoca el viejo. No se guarda en el rastro de auditoría
 * — un rastro que guarda la llave deja de ser un rastro.
 */
export async function publicarEnlaceDeReporteAction(
  _prevState: EnlaceDeReporteState,
  formData: FormData,
): Promise<EnlaceDeReporteState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  const diasCrudo = String(formData.get("diasDeVigencia") ?? "").trim();

  try {
    const { token, expiresAt } = await publicarReporteConEnlace(user.userAccountId, {
      fieldSessionId,
      diasDeVigencia: diasCrudo === "" ? undefined : Number(diasCrudo),
    });
    return { enlace: `/informe/${token}`, expira: expiresAt.toISOString().slice(0, 10) };
  } catch (error) {
    if (error instanceof ReporteError) {
      return { error: t(`error_${error.message}` as "error_visita_sin_completar") };
    }
    return { error: await friendlyError(t, error) };
  }
}

/**
 * Cortar un enlace ya entregado.
 *
 * **Es la razón por la que el token se guarda** en vez de firmarse: uno firmado
 * se verifica sin consultar la base y no se puede revocar sin lista de bloqueo.
 * Hasta hoy el servicio existía y no había pantalla, así que un enlace mandado
 * por WhatsApp no se podía cortar desde la aplicación.
 */
export async function revocarEnlaceDeReporteAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  try {
    await revocarEnlace(user.userAccountId, String(formData.get("publicacionId") ?? ""));
  } catch (error) {
    if (error instanceof ReporteError) {
      return { error: t(`error_${error.message}` as "error_publicacion_no_encontrada") };
    }
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}/report`);
  return {};
}

/**
 * Completar la visita: lo que la saca de borrador.
 *
 * **El paso que no tenía puerta, y que rompía el informe.** A9.3 construyó
 * `completarVisita` «sin pantalla nueva» —se refería a que la auditoría no
 * necesitaba entidad propia— y la invocación nunca se cableó. El resultado,
 * medido el 2026-09-10: «Cerrar jornada» pone `endedAt` y **nada** pone
 * `status: "completed"`, que es lo único que `emitirReporteDeVisita` mira. Así
 * que el botón de emitir contestaba «cierra la visita» **justo después de
 * cerrarla**, y no había forma de salir de ahí desde la aplicación.
 *
 * Son dos hechos distintos a propósito (§A9.1 D4): `endedAt` es cuándo se salió
 * del sitio; `completedAt`, cuándo se termino de escribir. Completar abre
 * además la ventana de edición, y por eso pide lo que sólo sabe quien cierra:
 * cuándo toca volver y cuántas colonias quedaron vivas.
 */
export async function completarVisitaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  const proximaCruda = String(formData.get("nextVisitDueAt") ?? "").trim();
  const coloniasCrudas = String(formData.get("coloniesAliveCount") ?? "").trim();
  const cajasCrudas = String(formData.get("hivesPresentCount") ?? "").trim();
  // Cadena, validada por el servicio. El vacio es `null` --nadie mirO el cielo-- y NO
  // «despejado»: el protocolo la marca opcional.
  const climaCrudo = String(formData.get("weatherObserved") ?? "").trim();
  const costoCrudo = String(formData.get("travelCostUsd") ?? "").trim();

  try {
    await completarVisita(user.userAccountId, {
      fieldSessionId,
      // Día, no instante: «cuándo toca volver» es una fecha de calendario. Se
      // trata como los demás campos de día — medianoche UTC — y NO se convierte
      // con el desfase del dispositivo, que la movería un día.
      nextVisitDueAt: proximaCruda === "" ? null : new Date(`${proximaCruda}T00:00:00Z`),
      coloniesAliveCount: coloniasCrudas === "" ? null : Number(coloniasCrudas),
      // Vacío es `null` —«nadie contó»— y NO cero: un apiario vaciado se cuenta como cero, y
      // ese cero es un dato distinto de no haber contado (ADR-080).
      hivesPresentCount: cajasCrudas === "" ? null : Number(cajasCrudas),
      weatherObserved: climaCrudo === "" ? null : climaCrudo,
      // Sin ninguna casilla marcada NO se toca: las casillas no pueden decir «lo de antes», y
      // borrar lo que se anotó en el sitio por no volver a marcarlo al cerrar sería perderlo.
      ...(formData.getAll("siteConditions").length === 0
        ? {}
        : { siteConditions: formData.getAll("siteConditions").map(String), siteConditionOtherNote: emptyToNull(formData.get("siteConditionOtherNote")) }),
      notes: emptyToNull(formData.get("notes")),
      // Las tres de casa (`stage: close`). El vacío es `null` —«no se anotó»— y NO cero: una
      // visita sin viáticos anotados no es una visita que costó cero.
      travelCostUsd: costoCrudo === "" ? null : Number(costoCrudo),
      probableCause: emptyToNull(formData.get("probableCause")),
      recommendation: emptyToNull(formData.get("recommendation")),
      reason: emptyToNull(formData.get("reason")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  return {};
}

/**
 * Los vitales de campo, anotados ESTANDO EN EL SITIO (ADR-157).
 *
 * Es el mismo dato que el cierre puede escribir, por otra puerta: la diferencia es que ésta
 * estampa `fieldVitalsOnSiteAt`. El dueño pidió poder hacerlo de las dos formas; lo que esto
 * añade no es una restricción sino el registro de cuál de las dos pasó.
 */
export async function vitalesEnSitioAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const fieldSessionId = String(formData.get("fieldSessionId") ?? "");
  const clima = String(formData.get("weatherObserved") ?? "").trim();
  const colonias = String(formData.get("coloniesAliveCount") ?? "").trim();
  const cajas = String(formData.get("hivesPresentCount") ?? "").trim();

  try {
    await registrarVitalesEnSitio(user.userAccountId, {
      fieldSessionId,
      // `undefined` NO toca la columna; la cadena vacía se traduce a `undefined` y no a `null`
      // a propósito: quien anota sólo el clima en el sitio no borra el recuento de antes.
      weatherObserved: clima === "" ? undefined : clima,
      coloniesAliveCount: colonias === "" ? undefined : Number(colonias),
      hivesPresentCount: cajas === "" ? undefined : Number(cajas),
      siteConditions: formData.getAll("siteConditions").map(String),
      siteConditionOtherNote: emptyToNull(formData.get("siteConditionOtherNote")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/field-sessions/${fieldSessionId}`);
  return {};
}

/**
 * La rejilla de una parcela (tarea 7 del plan de la rejilla).
 *
 * Misma forma que `updatePlotAttributesAction`, que es la vecina: `useActionState`
 * y un `error` traducido de vuelta, **sin `redirect`**. No hay `?ok=` porque esta
 * familia de formularios no redirige — y `confirmacion-que-se-lee` sólo vigila a
 * las que sí, así que queda fuera por diseño y no por olvido.
 */
export async function guardarRejillaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await updateLocationAttributes(user.userAccountId, {
      locationId,
      gridOrigin: emptyToNull(formData.get("gridOrigin")) as never,
      rowCount: emptyToNullNumber(formData.get("rowCount")),
      plantsPerRow: emptyToNullNumber(formData.get("plantsPerRow")),
      rowSpacingMeters: emptyToNullNumber(formData.get("rowSpacingMeters")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}

/**
 * El rango de una microparcela: **dónde está dentro de la numeración de su parcela** (D3).
 *
 * §6 del diseño del 2026-10-01, que lo pedía y nunca se construyó. Hasta hoy una
 * microparcela no podía decir qué trozo ocupa desde la aplicación —medido el 2026-10-02:
 * cero archivos de `app/` escribían `rangeRowFrom`— así que el estado `sin_rango` de la
 * comparación **no tenía salida**: el sistema decía «declara el rango» y no había dónde.
 *
 * Misma familia que `guardarRejillaAction` y el mismo servicio: `undefined` no toca la
 * columna, así que el formulario de la rejilla no borra este rango ni éste aquélla.
 */
export async function guardarRangoDeMicroparcelaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await updateLocationAttributes(user.userAccountId, {
      locationId,
      // Vacío es «sin rango», nunca cero: `Number("")` es 0, y una microparcela de la
      // hilera 0 a la 0 no existe (ADR-080).
      rangeRowFrom: emptyToNullNumber(formData.get("rangeRowFrom")),
      rangeRowTo: emptyToNullNumber(formData.get("rangeRowTo")),
      rangePlantFrom: emptyToNullNumber(formData.get("rangePlantFrom")),
      rangePlantTo: emptyToNullNumber(formData.get("rangePlantTo")),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}

/**
 * Añadir un rango a un bloque, con los solapes que D7 permite **como aviso**.
 *
 * El servicio devuelve con quién se solapa y cuántas celdas comparte; aquí se
 * traducen y vuelven en `avisos`, no en `error`: el rango se guardó.
 */
export async function anadirRangoAlBloqueAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  let solapes: Array<{ bloque: string; celdas: number }> = [];
  let sinPlantar = 0;
  try {
    const r = await anadirRangoAlBloque(user.userAccountId, {
      plotBlockId: String(formData.get("plotBlockId") ?? ""),
      rowFrom: Number(formData.get("rowFrom") ?? Number.NaN),
      rowTo: Number(formData.get("rowTo") ?? Number.NaN),
      plantFrom: Number(formData.get("plantFrom") ?? Number.NaN),
      plantTo: Number(formData.get("plantTo") ?? Number.NaN),
    });
    solapes = [...r.solapesAvisados];
    sinPlantar = r.celdasSinPlantar;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  // **Dos avisos distintos y que no se pisan** (D7 y D11): con quién se solapa, y
  // cuántas de sus celdas la forma dice que no están plantadas. Los dos van por
  // `avisos` y no por `error`, porque el rango SE GUARDÓ.
  const avisos = [
    ...solapes.map((s) => t("rejillaSolapeAviso", { bloque: s.bloque, celdas: s.celdas })),
    ...(sinPlantar > 0 ? [t("rejillaFueraDeLaFormaAviso", { celdas: sinPlantar })] : []),
  ];
  return avisos.length ? { avisos } : {};
}

/**
 * Declarar un trozo de la forma del lote: qué celdas del tablero están plantadas (D9).
 *
 * Misma familia que `guardarRejillaAction`: `useActionState`, un `error` traducido de
 * vuelta y **sin `redirect`**. El servicio lo cuelga de la raíz de la numeración, así que
 * esta acción no tiene que resolver nada.
 */
export async function declararTrozoDeFormaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await declararTrozoDeForma(user.userAccountId, {
      locationId,
      rowFrom: Number(formData.get("rowFrom") ?? Number.NaN),
      rowTo: Number(formData.get("rowTo") ?? Number.NaN),
      plantFrom: Number(formData.get("plantFrom") ?? Number.NaN),
      plantTo: Number(formData.get("plantTo") ?? Number.NaN),
    });
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}

/**
 * Quitar un trozo de la forma, **avisando de las plantas que deja fuera** (§7.4).
 *
 * El aviso va aquí y no al declarar: declarar sólo añade suelo plantado, y quitar es lo
 * que puede dejar una planta situada donde la forma ya no llega. Vuelve en `avisos` y no
 * en `error` porque **el trozo se quitó**: rechazar obligaría a declarar como plantado un
 * terreno que no lo está, y el operario sabe algo que la base no.
 */
export async function quitarTrozoDeFormaAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  let fuera = 0;
  try {
    const r = await quitarTrozoDeForma(user.userAccountId, String(formData.get("trozoId") ?? ""));
    fuera = r.plantasQueQuedanFuera;
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return fuera > 0 ? { avisos: [t("rejillaFormaPlantasFueraAviso", { plantas: fuera })] } : {};
}

/** Quitar un rango. Es un acto y el servicio lo registra. */
export async function quitarRangoDelBloqueAction(
  _prevState: TraceabilityActionState,
  formData: FormData,
): Promise<TraceabilityActionState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations("Traceability");

  const locationId = String(formData.get("locationId") ?? "");
  try {
    await quitarRangoDelBloque(user.userAccountId, String(formData.get("rangoId") ?? ""));
  } catch (error) {
    return { error: await friendlyError(t, error) };
  }

  revalidatePath(`/plots/${locationId}`);
  revalidatePath(`/plots/${locationId}/ajustes`);
  return {};
}
