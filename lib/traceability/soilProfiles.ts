/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 3–6). La
 * calicata: la descripción del perfil de suelo de un bloque, con sus
 * horizontes.
 *
 * **RBAC reusa `location:manage_attributes`** vía
 * `requireLocationAttributeAccess`, misma decisión que `plantingCohorts.ts` y
 * `biocharBatches.ts`: describir el suelo de un bloque es la misma autoridad
 * que describir su altitud o su pendiente, y ADR-091 hace que un permiso sin
 * sitio donde usarse sea un fallo de construcción.
 *
 * **Volver a describir NO es corregir.** Una calicata es la observación de un
 * día. La del Año 0 y la de dentro de tres años son dos filas —§14 pide
 * repetir el muestreo justamente para ver el cambio—, y fusionarlas borraría
 * la única evidencia de que el suelo se movió. Lo que sí es una edición es la
 * errata: si alguien tecleó 40 donde la libreta dice 400, el suelo no cambió.
 * Misma asimetría que ADR-102 fijó entre `PlantingCohort` y `Measurement`.
 *
 * **Lo que NO vive aquí:** las cifras físicas de la Tabla 4 —densidad
 * aparente, resistencia a la penetración con humedad pareada, infiltración—.
 * Son lecturas con unidad y llegan con la ronda de muestreo del Paso 6
 * (semanas 6–10), como `Measurement`. Esta pieza es la de las semanas 3–6, que
 * es la que no depende de ningún laboratorio.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLocationAttributeAccess, LocationAccessError } from "./locations";
import type {
  DataQuality,
  ProvenanceClass,
  SoilFeatureObservation,
} from "../../generated/prisma/client";

export class SoilProfileValidationError extends Error {}

export interface SoilHorizonInput {
  ordinal: number;
  topCm?: number | null;
  bottomCm?: number | null;
  designation?: string | null;
  colour?: string | null;
  structure?: string | null;
  textureByFeel?: string | null;
  notes?: string | null;
}

export interface SoilProfileFields {
  pitDepthCm?: number | null;
  rootingDepthCm?: number | null;
  rootDistribution?: string | null;
  mottling?: SoilFeatureObservation | null;
  greyColours?: SoilFeatureObservation | null;
  rootChannelConcretions?: SoilFeatureObservation | null;
  sourSmell?: SoilFeatureObservation | null;
  impedingLayerDepthCm?: number | null;
  impedingLayerNote?: string | null;
  notes?: string | null;
  sourceReference?: string | null;
  dataQuality?: DataQuality | null;
}

export interface CreateSoilProfileInput extends SoilProfileFields {
  locationId: string;
  describedAt: Date;
  // ADR-038 — requerido, sin default.
  provenanceClass: ProvenanceClass;
  horizons?: SoilHorizonInput[];
  clientDraftId?: string | null;
}

/**
 * Lo que se puede afirmar que está mal sin conocer el suelo.
 *
 * No se valida que la profundidad de la calicata llegue a los 80–100 cm que
 * pide el Paso 4. Una calicata que topó con roca a los 40 es un hecho, y de los
 * informativos: rechazarla obligaría a mentir en la casilla para poder guardar.
 */
function validarPerfil(campos: SoilProfileFields) {
  for (const [nombre, valor] of [
    ["pit_depth", campos.pitDepthCm],
    ["rooting_depth", campos.rootingDepthCm],
    ["impeding_layer_depth", campos.impedingLayerDepthCm],
  ] as const) {
    if (valor != null && valor < 0) throw new SoilProfileValidationError(`negative_${nombre}`);
  }
  // Las raíces no llegan más hondo que el hoyo desde el que se miraron. Si
  // llegan, o la calicata era más profunda o uno de los dos números está mal.
  if (campos.pitDepthCm != null && campos.rootingDepthCm != null && campos.rootingDepthCm > campos.pitDepthCm) {
    throw new SoilProfileValidationError("rooting_depth_exceeds_pit_depth");
  }
}

function validarHorizontes(horizons: SoilHorizonInput[]) {
  const ordinales = new Set<number>();
  for (const h of horizons) {
    if (!Number.isInteger(h.ordinal) || h.ordinal < 1) {
      throw new SoilProfileValidationError("horizon_ordinal_invalid");
    }
    if (ordinales.has(h.ordinal)) throw new SoilProfileValidationError("horizon_ordinal_duplicated");
    ordinales.add(h.ordinal);

    for (const [nombre, valor] of [["top", h.topCm], ["bottom", h.bottomCm]] as const) {
      if (valor != null && valor < 0) throw new SoilProfileValidationError(`negative_horizon_${nombre}`);
    }
    // Un horizonte que empieza más abajo de donde acaba está al revés, y el
    // error es fácil de cometer describiendo desde el fondo del hoyo.
    if (h.topCm != null && h.bottomCm != null && h.topCm > h.bottomCm) {
      throw new SoilProfileValidationError("horizon_top_below_bottom");
    }
  }
}

function datosDePerfil(c: SoilProfileFields) {
  return {
    pitDepthCm: c.pitDepthCm ?? null,
    rootingDepthCm: c.rootingDepthCm ?? null,
    rootDistribution: c.rootDistribution ?? null,
    mottling: c.mottling ?? null,
    greyColours: c.greyColours ?? null,
    rootChannelConcretions: c.rootChannelConcretions ?? null,
    sourSmell: c.sourSmell ?? null,
    impedingLayerDepthCm: c.impedingLayerDepthCm ?? null,
    impedingLayerNote: c.impedingLayerNote ?? null,
    notes: c.notes ?? null,
    sourceReference: c.sourceReference ?? null,
    dataQuality: c.dataQuality ?? null,
  };
}

export async function createSoilProfile(userAccountId: string, input: CreateSoilProfileInput) {
  await requireLocationAttributeAccess(userAccountId, input.locationId);
  validarPerfil(input);
  const horizons = input.horizons ?? [];
  validarHorizontes(horizons);

  // Perfil, horizontes y auditoría en la MISMA transacción. Un perfil guardado
  // con la mitad de sus horizontes describiría un suelo que nadie vio.
  return prisma.$transaction(async (tx) => {
    const perfil = await tx.soilProfile.create({
      data: {
        locationId: input.locationId,
        describedAt: input.describedAt,
        provenanceClass: input.provenanceClass,
        ...datosDePerfil(input),
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
        horizons: {
          create: horizons.map((h) => ({
            ordinal: h.ordinal,
            topCm: h.topCm ?? null,
            bottomCm: h.bottomCm ?? null,
            designation: h.designation ?? null,
            colour: h.colour ?? null,
            structure: h.structure ?? null,
            textureByFeel: h.textureByFeel ?? null,
            notes: h.notes ?? null,
          })),
        },
      },
      include: { horizons: { orderBy: { ordinal: "asc" } } },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "soil_profile.create",
        entityType: "soil_profile",
        entityId: perfil.id,
        after: perfil,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return perfil;
  });
}

export interface UpdateSoilProfileInput extends SoilProfileFields {
  soilProfileId: string;
  describedAt?: Date;
  provenanceClass?: ProvenanceClass;
}

/**
 * Corrección de erratas, con el antes en el audit.
 *
 * **No toca los horizontes**, y eso es deliberado: reemplazarlos borraría en
 * silencio una descripción que costó cavar un hoyo. Corregir un horizonte es
 * `updateSoilHorizon`, uno a uno y con su propio audit.
 */
export async function updateSoilProfile(userAccountId: string, input: UpdateSoilProfileInput) {
  const existente = await prisma.soilProfile.findUnique({ where: { id: input.soilProfileId } });
  if (!existente) throw new LocationAccessError("soil_profile_not_found");

  await requireLocationAttributeAccess(userAccountId, existente.locationId);

  // Se valida contra lo que la fila TENDRÁ, no contra lo que llega: en un PATCH
  // que sólo manda la profundidad de raíces, comparar con un hoyo ausente no
  // diría nada.
  validarPerfil({
    ...existente,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
  } as SoilProfileFields);

  const parcial = <T,>(v: T | undefined, k: string) => (v !== undefined ? { [k]: v ?? null } : {});

  return prisma.$transaction(async (tx) => {
    const despues = await tx.soilProfile.update({
      where: { id: input.soilProfileId },
      data: {
        ...(input.describedAt !== undefined ? { describedAt: input.describedAt } : {}),
        ...(input.provenanceClass !== undefined ? { provenanceClass: input.provenanceClass } : {}),
        ...parcial(input.pitDepthCm, "pitDepthCm"),
        ...parcial(input.rootingDepthCm, "rootingDepthCm"),
        ...parcial(input.rootDistribution, "rootDistribution"),
        ...parcial(input.mottling, "mottling"),
        ...parcial(input.greyColours, "greyColours"),
        ...parcial(input.rootChannelConcretions, "rootChannelConcretions"),
        ...parcial(input.sourSmell, "sourSmell"),
        ...parcial(input.impedingLayerDepthCm, "impedingLayerDepthCm"),
        ...parcial(input.impedingLayerNote, "impedingLayerNote"),
        ...parcial(input.notes, "notes"),
        ...parcial(input.sourceReference, "sourceReference"),
        ...parcial(input.dataQuality, "dataQuality"),
      },
      include: { horizons: { orderBy: { ordinal: "asc" } } },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "soil_profile.update",
        entityType: "soil_profile",
        entityId: despues.id,
        before: existente,
        after: despues,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return despues;
  });
}

/** Añade un horizonte a un perfil ya descrito. */
export async function addSoilHorizon(userAccountId: string, soilProfileId: string, horizon: SoilHorizonInput) {
  const perfil = await prisma.soilProfile.findUnique({
    where: { id: soilProfileId },
    include: { horizons: { select: { ordinal: true } } },
  });
  if (!perfil) throw new LocationAccessError("soil_profile_not_found");

  await requireLocationAttributeAccess(userAccountId, perfil.locationId);
  validarHorizontes([...perfil.horizons.map((h) => ({ ordinal: h.ordinal })), horizon]);

  return prisma.$transaction(async (tx) => {
    const creado = await tx.soilHorizon.create({
      data: {
        soilProfileId,
        ordinal: horizon.ordinal,
        topCm: horizon.topCm ?? null,
        bottomCm: horizon.bottomCm ?? null,
        designation: horizon.designation ?? null,
        colour: horizon.colour ?? null,
        structure: horizon.structure ?? null,
        textureByFeel: horizon.textureByFeel ?? null,
        notes: horizon.notes ?? null,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "soil_horizon.create",
        entityType: "soil_horizon",
        entityId: creado.id,
        after: creado,
        sourceInterface: "traceability.service",
      },
      tx,
    );
    return creado;
  });
}

/**
 * Las calicatas de un bloque, la más reciente primero.
 *
 * Se devuelven TODAS, no sólo la última: el punto de repetir la descripción es
 * poder ver el cambio, y una lista que esconde las viejas lo impide.
 */
export async function listSoilProfilesForLocation(userAccountId: string, locationId: string) {
  await requireLocationAttributeAccess(userAccountId, locationId);
  return prisma.soilProfile.findMany({
    where: { locationId },
    include: { horizons: { orderBy: { ordinal: "asc" } } },
    orderBy: { describedAt: "desc" },
  });
}

/**
 * ¿Hay señales de anaerobiosis periódica en este perfil?
 *
 * Derivado al leer, nunca guardado. Devuelve `null` —no `false`— cuando ninguna
 * de las cuatro señales se miró: §6.1 dice que la diferencia entre un suelo
 * húmedo y bien estructurado y uno húmedo y compactado es la que decide si el
 * problema es de drenaje o de nutrición, y contestar «no» a una pregunta que
 * nadie hizo es la forma exacta de mandar a la finca a fertilizar un problema
 * de aire.
 */
export function computeAnaerobicSignals(perfil: {
  mottling: SoilFeatureObservation | null;
  greyColours: SoilFeatureObservation | null;
  rootChannelConcretions: SoilFeatureObservation | null;
  sourSmell: SoilFeatureObservation | null;
}): { present: number; observed: number; anyPresent: boolean | null } {
  const señales = [perfil.mottling, perfil.greyColours, perfil.rootChannelConcretions, perfil.sourSmell];
  const observed = señales.filter((s) => s === "present" || s === "absent").length;
  const present = señales.filter((s) => s === "present").length;
  return { present, observed, anyPresent: observed === 0 ? null : present > 0 };
}
