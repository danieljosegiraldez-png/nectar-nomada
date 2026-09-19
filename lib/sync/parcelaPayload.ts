import { fechaDeDia } from "../time/localDateTime";
import { calcularFechaConPrecision } from "../time/fechaConPrecision";
import {
  horizontesDelFormulario,
  type HorizonteDelFormulario,
} from "../traceability/horizontesDelFormulario";

/**
 * Task 5 — los cuatro payloads que la cola guarda para la captura de parcela,
 * construidos a partir del `FormData` de cada formulario.
 *
 * **Por qué son funciones puras y viven aquí, y no dentro del `onSubmit`.**
 * Mismo motivo que `lib/sync/fieldEventPayload.ts`: este repositorio no tiene
 * `jsdom` ni `@testing-library`, así que nada que llame a `render()` puede
 * correr en esta suite. `FormData` sí existe en Node, y con eso basta para
 * probar la decisión sin DOM, sin IndexedDB y sin `fetch`.
 *
 * **Las tres fechas son campos de DÍA, no instantes.** `sampledAt` y
 * `describedAt` salen de un `<input type="date">` y se parsean con
 * `fechaDeDia` — el mismo parser que usan `createSoilSampleAction`,
 * `createFoliarSampleAction` y `createSoilProfileAction` en
 * `app/actions/traceability.ts` (ahí como `fechaDeDiaCompartida`). Usar
 * `parseLocalDateTime` aquí, como hace `fieldEventPayload.ts` con `occurredAt`,
 * aplicaría el desfase horario del dispositivo a una fecha que ya está fijada a
 * medianoche UTC y la movería un día atrás — el fallo que documenta la cabecera
 * de `fechaDeDia`.
 *
 * `plantedAt` es distinto de los otros dos: no es siempre `type="date"`.
 * `PlantingCohortForm` deja elegir precisión (año, mes, día), y el tipo de
 * input sigue a esa elección. La aritmética de año/mes/día — qué fecha
 * significa cada precisión — vive en `lib/time/fechaConPrecision.ts` y la
 * importan LOS DOS lados: `app/actions/traceability.ts` (`parsePlantedAt`, el
 * camino con señal) y este módulo. Antes de la ronda de arreglo 1 sobre esta
 * tarea estaba duplicada por su cuenta aquí, atada al otro lado sólo por un
 * comentario en prosa.
 *
 * **Sólo la rama de CREAR se encola.** `SoilProfileForm` y `PlantingCohortForm`
 * sirven también para corregir un registro existente, y corregir sin señal
 * exigiría resolver conflictos que el spec deja fuera de alcance a propósito.
 * Por eso estos constructores no reciben ni `soilProfileId` ni `cohortId` ni
 * `reason`: la decisión de si se encola o se sigue el camino normal la toma el
 * componente, antes de llamar a cualquiera de ellos.
 */

const texto = (fd: FormData, name: string): string | null => {
  const v = String(fd.get(name) ?? "").trim();
  return v === "" ? null : v;
};

const numero = (fd: FormData, name: string): number | null => {
  const v = texto(fd, name);
  return v === null ? null : Number(v);
};

/** El tri-estado de `TriStateField`: `"yes" | "no" | ""` en el `FormData`. */
const booleano = (fd: FormData, name: string): boolean | null => {
  const v = texto(fd, name);
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
};

/**
 * Un campo de DÍA que el formulario exige (`required`). Ausente o inexistente
 * en el calendario lanza, igual que `fechaDeDiaRequerida` del lado servidor —
 * y por la misma razón: inventar «hoy» convertiría una ausencia en una
 * afirmación (ADR-080).
 */
function diaRequerido(fd: FormData, name: string): string {
  const dia = fechaDeDia(fd.get(name) as string | null, name);
  if (!dia) throw new Error(`${name}_required`);
  return dia.toISOString();
}

export interface PayloadDeMuestraDeSuelo {
  kind: "soil_sample";
  locationId: string;
  sampleCode: string;
  sampledAt: string;
  treatmentPlotLabel: string | null;
  samplingPointLabel: string | null;
  depthTopCm: number | null;
  depthBottomCm: number | null;
  subSampleCount: number | null;
  laboratory: string | null;
  extractionMethod: string | null;
  provenanceClass: string;
  dataQuality: string | null;
  notes: string | null;
}

export function construirPayloadDeMuestraDeSuelo(fd: FormData, locationId: string): PayloadDeMuestraDeSuelo {
  return {
    kind: "soil_sample",
    locationId,
    sampleCode: String(fd.get("sampleCode") ?? "").trim(),
    sampledAt: diaRequerido(fd, "sampledAt"),
    treatmentPlotLabel: texto(fd, "treatmentPlotLabel"),
    samplingPointLabel: texto(fd, "samplingPointLabel"),
    depthTopCm: numero(fd, "depthTopCm"),
    depthBottomCm: numero(fd, "depthBottomCm"),
    subSampleCount: numero(fd, "subSampleCount"),
    laboratory: texto(fd, "laboratory"),
    extractionMethod: texto(fd, "extractionMethod"),
    provenanceClass: String(fd.get("provenanceClass") ?? ""),
    dataQuality: texto(fd, "dataQuality"),
    notes: texto(fd, "notes"),
  };
}

export interface PayloadDeMuestraFoliar {
  kind: "foliar_sample";
  locationId: string;
  sampleCode: string;
  sampledAt: string;
  treatmentPlotLabel: string | null;
  leafPairPosition: number | null;
  canopyPosition: string | null;
  treeAgeYears: number | null;
  cultivar: string | null;
  phenologicalStage: string | null;
  branchBearingFruit: boolean | null;
  laboratory: string | null;
  provenanceClass: string;
  dataQuality: string | null;
  notes: string | null;
}

export function construirPayloadDeMuestraFoliar(fd: FormData, locationId: string): PayloadDeMuestraFoliar {
  return {
    kind: "foliar_sample",
    locationId,
    sampleCode: String(fd.get("sampleCode") ?? "").trim(),
    sampledAt: diaRequerido(fd, "sampledAt"),
    treatmentPlotLabel: texto(fd, "treatmentPlotLabel"),
    leafPairPosition: numero(fd, "leafPairPosition"),
    canopyPosition: texto(fd, "canopyPosition"),
    treeAgeYears: numero(fd, "treeAgeYears"),
    cultivar: texto(fd, "cultivar"),
    phenologicalStage: texto(fd, "phenologicalStage"),
    branchBearingFruit: booleano(fd, "branchBearingFruit"),
    laboratory: texto(fd, "laboratory"),
    provenanceClass: String(fd.get("provenanceClass") ?? ""),
    dataQuality: texto(fd, "dataQuality"),
    notes: texto(fd, "notes"),
  };
}

export interface PayloadDePerfilDeSuelo {
  kind: "soil_profile";
  locationId: string;
  describedAt: string;
  pitDepthCm: number | null;
  rootingDepthCm: number | null;
  rootDistribution: string | null;
  /**
   * §6.1 — las cuatro observaciones de anaerobiosis. El formulario las pinta
   * con `name={campo}` dentro de un `.map`, y por eso una comparación que
   * buscara `name="mottling"` en la fuente no las encuentra: así se perdieron
   * en la primera versión de esta cola.
   */
  mottling: string | null;
  greyColours: string | null;
  rootChannelConcretions: string | null;
  sourSmell: string | null;
  impedingLayerDepthCm: number | null;
  impedingLayerNote: string | null;
  provenanceClass: string;
  dataQuality: string | null;
  notes: string | null;
  /**
   * Los horizontes descritos, ya numerados. Viaja como array anidado dentro del
   * JSON del borrador, que es lo que `createSoilProfile` espera en `horizons`.
   */
  horizons: HorizonteDelFormulario[];
}

/**
 * Sólo la calicata NUEVA se encola. `SoilProfileForm` en modo corrección no
 * pide `describedAt` de nuevo ni horizontes, y `values.id` es lo que el
 * componente ya usa para distinguir las dos ramas.
 *
 * **Lleva los once campos que el modo crear captura**, no un subconjunto. El
 * hoyo se cava una vez: una calicata encolada sin sus horizontes ni sus
 * banderas de anaerobiosis es una fila que dice que alguien miró y no vio nada.
 */
export function construirPayloadDePerfilDeSuelo(fd: FormData, locationId: string): PayloadDePerfilDeSuelo {
  return {
    kind: "soil_profile",
    locationId,
    describedAt: diaRequerido(fd, "describedAt"),
    pitDepthCm: numero(fd, "pitDepthCm"),
    rootingDepthCm: numero(fd, "rootingDepthCm"),
    rootDistribution: texto(fd, "rootDistribution"),
    mottling: texto(fd, "mottling"),
    greyColours: texto(fd, "greyColours"),
    rootChannelConcretions: texto(fd, "rootChannelConcretions"),
    sourSmell: texto(fd, "sourSmell"),
    impedingLayerDepthCm: numero(fd, "impedingLayerDepthCm"),
    impedingLayerNote: texto(fd, "impedingLayerNote"),
    provenanceClass: String(fd.get("provenanceClass") ?? ""),
    dataQuality: texto(fd, "dataQuality"),
    notes: texto(fd, "notes"),
    horizons: horizontesDelFormulario(fd),
  };
}

export interface PayloadDeSiembra {
  kind: "planting_cohort";
  locationId: string;
  cultivarValueId: string | null;
  plantedAt: string | null;
  plantedPrecision: string | null;
  plantCount: number | null;
  provenanceClass: string;
  dataQuality: string | null;
  notes: string | null;
}

/**
 * La aritmética de precisión vive en `calcularFechaConPrecision`
 * (`lib/time/fechaConPrecision.ts`), compartida con `parsePlantedAt` en
 * `app/actions/traceability.ts`: un año suelto se guarda como el 1 de enero
 * de ese año con `plantedPrecision: "year"`, un mes como el día 1 de ese mes
 * con `"month"`, y sin fecha los dos van nulos — «no se sabe cuándo» es una
 * respuesta legítima. Sólo aquí se convierte a cadena ISO, porque el payload
 * viaja como JSON.
 */
function construirFechaDeSiembra(fd: FormData): { plantedAt: string | null; plantedPrecision: string | null } {
  const raw = String(fd.get("plantedAt") ?? "").trim();
  if (!raw) return { plantedAt: null, plantedPrecision: null };
  const precision = String(fd.get("plantedPrecision") ?? "date");
  const { fecha, precision: precisionResuelta } = calcularFechaConPrecision(raw, precision);
  return { plantedAt: fecha.toISOString(), plantedPrecision: precisionResuelta };
}

/** Sólo la siembra NUEVA se encola: `PlantingCohortForm` en modo corrección no pide `provenanceClass`. */
export function construirPayloadDeSiembra(fd: FormData, locationId: string): PayloadDeSiembra {
  const { plantedAt, plantedPrecision } = construirFechaDeSiembra(fd);
  return {
    kind: "planting_cohort",
    locationId,
    cultivarValueId: texto(fd, "cultivarValueId"),
    plantedAt,
    plantedPrecision,
    plantCount: numero(fd, "plantCount"),
    provenanceClass: String(fd.get("provenanceClass") ?? ""),
    dataQuality: texto(fd, "dataQuality"),
    notes: texto(fd, "notes"),
  };
}

export interface PayloadDeRevisionDeTrampa {
  kind: "trap_check";
  locationId: string;
  specimenId: string;
  clientDraftId: string;
  observedAt: string;
  brocaLevel: string;
  captureCount: number | null;
  otherInsects: boolean | null;
  otherInsectsNote: string | null;
  cleaned: boolean | null;
  liquidChanged: boolean | null;
  lureRecharged: boolean | null;
}

/**
 * La revisión de la ronda de trampas, sin señal — Tarea 11 (Tarea 10, ruling del
 * controlador, extendido a la cola).
 *
 * **Sin `observerPersonId` ni `provenanceClass`, a diferencia de los cuatro
 * constructores de arriba.** `RondaDeTrampaForm` no los ofrece ni siquiera como
 * campo oculto (SECURITY.md §2 — un `<input type="hidden">` es falsificable, y
 * un payload de cola es tan falsificable como un campo oculto: viaja igual, por
 * fuera de cualquier sesión). Los dos se fijan en el SERVIDOR al aplicar la
 * mutación (`aplicarRevisionDeTrampa` en `pushFieldEvents.ts`), con la misma
 * regla que `recordRoundTrapCheckFormAction`: procedencia siempre
 * `direct_observation`, observador la Person de la cuenta del dispositivo. Este
 * constructor no puede leer del `FormData` un campo que el formulario nunca
 * pinta.
 */
export function construirPayloadDeRevisionDeTrampa(
  fd: FormData,
  specimenId: string,
  locationId: string,
  clientDraftId: string,
): PayloadDeRevisionDeTrampa {
  const otros = booleano(fd, "otherInsects");
  return {
    kind: "trap_check",
    locationId,
    specimenId,
    clientDraftId,
    observedAt: diaRequerido(fd, "observedAt"),
    brocaLevel: String(fd.get("brocaLevel") ?? ""),
    captureCount: numero(fd, "captureCount"),
    otherInsects: otros,
    // Mismo criterio que `recordRoundTrapCheckFormAction` (F8 fix-final): la
    // nota se guarda salvo cuando "otros" es explícitamente NO.
    otherInsectsNote: otros === false ? null : texto(fd, "otherInsectsNote"),
    cleaned: booleano(fd, "cleaned"),
    liquidChanged: booleano(fd, "liquidChanged"),
    lureRecharged: booleano(fd, "lureRecharged"),
  };
}
