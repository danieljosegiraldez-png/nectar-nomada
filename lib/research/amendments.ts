/**
 * S1 (docs/implementation/45_S1_SUELO_AMBIENTE_TAZA.md §2, semanas 10–14). La
 * aplicación de enmienda al terreno — el Paso 8 del plan de acción del marco.
 *
 * **Decisión del dueño, 2026-09-01: opción A.** Es un `TreatmentBatch` con
 * `locationId`, no una entidad aparte. El control experimental ya vive en
 * `Experiment.controlTreatmentBatchId` apuntando a un `TreatmentBatch`, y una
 * entidad paralela habría dejado al T0 del marco —el control sin tratar que
 * §10.3 llama no negociable— sin poder ocupar ese campo.
 *
 * **Módulo aparte de `treatments.ts` y no una rama dentro de
 * `createTreatmentBatch`.** Aquél existe para material que se procesa: deriva
 * el ámbito del lote, valida etapas de proceso y no sabe nada de Gate 0.
 * Meterle un `if` sobre qué clase de sujeto tiene habría hecho que el camino
 * del café cargara con una compuerta que no le corresponde, y al revés.
 *
 * ---
 *
 * **Gate 0 es la razón de que este archivo exista.**
 *
 * La recomendación principal del marco entero no es construir nada: es un
 * ALTO. «Ningún bloque nuevo recibe biochar, compost ni fertilizante hasta que
 * existan la química de suelo base, la física de suelo base, un lote de biochar
 * caracterizado y el protocolo escrito.» Firmado por Bob, Sherry y Daniel.
 * «Si falta alguno, no se aplica. Sin excepciones.»
 *
 * Enmendar antes de medir **no retrasa la ciencia: la imposibilita**, porque
 * una línea base no se puede reconstruir después.
 *
 * Un sistema que registra aplicaciones sin comprobar nada empuja exactamente en
 * la dirección contraria a una decisión ya firmada. Así que la compuerta es
 * estructural: `applyAmendment` **se niega** mientras falte cualquiera de las
 * cuatro condiciones, y `evaluarGate0` dice **cuáles** faltan, no un booleano —
 * «no se puede» sin decir qué falta obliga a adivinar.
 *
 * **Sin escotilla de escape, y es deliberado.** La firma no dice «salvo que
 * corra prisa». Lo que sí puede pasar es que la compuerta se abra: en cuanto
 * los datos existen, deja de negar. Un guardia que nunca puede pasar sería peor
 * que ninguno; éste pasa el día que el Año 0 ha hecho su trabajo.
 *
 * **Lo que NO gatea:** el manejo ordinario de la finca. Las áreas de producción
 * fuera del ensayo siguen con su manejo normal, y eso no se registra por aquí —
 * esta función exige un `ProtocolVersion`, así que por construcción sólo pasa
 * por ella lo que es un acto experimental.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireResearchAccess, ResearchAccessError } from "./access";
import type { ProvenanceClass } from "../../generated/prisma/client";
import { validateTreatmentBatchVariableValue } from "./treatments";
import { variablePerteneceAlPanel } from "../traceability/units";
import { resolveOrganizationForLocation } from "../traceability/locations";
import type { Prisma } from "../../generated/prisma/client";
import type { TreatmentBatchVariableValueInput } from "./treatments";

export class AmendmentValidationError extends Error {}
export class Gate0NotPassedError extends Error {
  constructor(public readonly faltan: readonly string[]) {
    super(`gate_0_not_passed:${faltan.join(",")}`);
  }
}

/** Las cuatro condiciones de Gate 0, en el orden en que el marco las lista. */
export type CondicionDeGate0 =
  | "baseline_soil_chemistry"
  | "baseline_soil_physics"
  | "characterised_biochar"
  | "written_protocol";

/**
 * Qué le falta a este bloque para poder recibir una enmienda.
 *
 * Devuelve la lista, no un booleano. Cada condición se comprueba contra un
 * hecho registrado, no contra una casilla que alguien marcó:
 *
 * - **Química base**: existe al menos una `SoilSample` de este bloque **con al
 *   menos un resultado**. Una muestra enviada y sin resultado no es química
 *   recibida — es una muestra en tránsito, y el marco dice «recibida».
 * - **Física base**: existe al menos una `SoilProfile` de este bloque. Es la
 *   calicata descrita del Paso 4.
 * - **Biochar caracterizado**: el lote que se va a aplicar tiene al menos un
 *   resultado de la Tabla 7. Sólo se exige cuando hay lote de biochar: el T3
 *   del marco es enmienda orgánica **sin** biochar, y exigirlo ahí sería
 *   inventar una condición que la firma no pone.
 * - **Protocolo escrito**: la `ProtocolVersion` está `active`, no `draft`. Un
 *   borrador no es un protocolo escrito; es uno a medio escribir.
 */
/**
 * Las variables de suelo que, si ninguna está presente, no hay química base.
 *
 * No se exige la Tabla 3 entera: un laboratorio puede reportar por tandas y el
 * marco dice «química completa recibida», no «las dieciocho a la vez». Lo que
 * sí se exige es que la lectura **sea del panel de suelo** — antes valía
 * cualquiera, incluida una de Brix colgada de una muestra de suelo.
 */
const DOMINIO_QUIMICA = "analisis_de_suelo" as const;
const DOMINIO_ENMIENDA = "analisis_de_enmienda" as const;

type ClienteDeLectura = Prisma.TransactionClient | typeof prisma;

async function evaluarGate0(
  input: {
    locationId: string;
    biocharBatchId?: string | null;
    protocolVersionId: string;
    /**
     * Cuándo se aplica la enmienda. La evidencia tiene que ser **anterior**:
     * una medición fechada después del tratamiento no es una línea base, y sin
     * esta comprobación servía igual. Lo encontró la revisión independiente.
     */
    startedAt: Date;
  },
  db: ClienteDeLectura = prisma,
): Promise<CondicionDeGate0[]> {
  const faltan: CondicionDeGate0[] = [];

  const [quimicas, calicatas, version] = await Promise.all([
    // Las mediciones de suelo del bloque, anteriores al tratamiento. Se filtra
    // por variable en memoria porque el panel vive en el registro canónico, no
    // en la base: `Measurement.variable` es texto libre en el esquema.
    db.measurement.findMany({
      where: {
        soilSample: { locationId: input.locationId, sampledAt: { lt: input.startedAt } },
        occurredAt: { lt: input.startedAt },
      },
      select: { variable: true },
    }),
    db.soilProfile.count({
      where: {
        locationId: input.locationId,
        describedAt: { lt: input.startedAt },
        // Una calicata vacía no es una calicata descrita. El Paso 4 pide
        // horizontes, profundidad de raíces y las señales de anaerobiosis; se
        // exige **algo** de eso, no todo, porque una calicata que topó con roca
        // a los 40 cm es un hallazgo legítimo con pocos campos.
        OR: [
          { horizons: { some: {} } },
          { rootingDepthCm: { not: null } },
          { mottling: { not: null } },
          { greyColours: { not: null } },
        ],
      },
    }),
    db.protocolVersion.findUnique({
      where: { id: input.protocolVersionId },
      select: { status: true },
    }),
  ]);

  if (!quimicas.some((m) => variablePerteneceAlPanel(m.variable, DOMINIO_QUIMICA))) {
    faltan.push("baseline_soil_chemistry");
  }
  if (calicatas === 0) faltan.push("baseline_soil_physics");

  if (input.biocharBatchId) {
    const lecturas = await db.measurement.findMany({
      where: { biocharBatchId: input.biocharBatchId, occurredAt: { lt: input.startedAt } },
      select: { variable: true },
    });
    if (!lecturas.some((m) => variablePerteneceAlPanel(m.variable, DOMINIO_ENMIENDA))) {
      faltan.push("characterised_biochar");
    }
  }

  if (!version || version.status !== "active") faltan.push("written_protocol");

  return faltan;
}

/**
 * Qué le falta a este bloque, para enseñarlo en pantalla.
 *
 * `evaluarGate0` no se exporta: lee la base y no recibe principal, así que
 * exportarla sería una lectura sin puerta —el inventario de acceso lo señaló, y
 * tenía razón—. Lo que se sabría por ahí no es catastrófico («este bloque no
 * tiene química de suelo») pero es información de una finca ajena, y la puerta
 * cuesta tres líneas.
 */
export async function getGate0Status(
  userAccountId: string,
  input: {
    locationId: string;
    biocharBatchId?: string | null;
    protocolVersionId: string;
    /** Contra qué fecha se juzga. Por defecto, ahora. */
    startedAt?: Date;
  },
): Promise<CondicionDeGate0[]> {
  await requireResearchAccess(userAccountId, "execute_protocol", [
    { projectId: null, locationId: input.locationId },
  ]);
  return evaluarGate0({ ...input, startedAt: input.startedAt ?? new Date() });
}

export interface ApplyAmendmentInput {
  protocolVersionId: string;
  /** El bloque tratado. Requerido: una enmienda sin terreno no es una enmienda. */
  locationId: string;
  /** El lote de biochar aplicado, si lo hay. El T3 del marco no lleva. */
  biocharBatchId?: string | null;
  /** El código del tratamiento — «T0».. «T4» en la Tabla 8 del marco. */
  batchLabel: string;
  operatorPersonId?: string | null;
  startedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
  /**
   * Dosis, método y profundidad viajan por aquí y no como columnas nuevas.
   * Son lo que el protocolo **varía**, y `TreatmentBatchVariableValue` es la
   * maquinaria que RO1 construyó exactamente para eso. Tres columnas propias
   * habrían bifurcado el mecanismo para el primer protocolo que las use.
   */
  variableValues?: TreatmentBatchVariableValueInput[];
}

export async function applyAmendment(userAccountId: string, input: ApplyAmendmentInput) {
  if (!input.batchLabel.trim()) throw new AmendmentValidationError("batch_label_required");

  const location = await prisma.location.findUnique({
    where: { id: input.locationId },
    select: { id: true },
  });
  if (!location) throw new ResearchAccessError("location_not_found");

  const version = await prisma.protocolVersion.findUnique({
    where: { id: input.protocolVersionId },
    include: { variables: true, protocol: { select: { experiment: { select: { projectId: true } } } } },
  });
  if (!version) throw new ResearchAccessError("protocol_version_not_found");

  // **Sólo la Location, no el proyecto.** `requireResearchAccess` recorre los
  // targets y **retorna al primer permiso que pasa**: es autorización
  // alternativa, no coherencia. En el camino del café da igual porque el
  // `locationId` se deriva del lote; aquí llega del usuario, así que pasar
  // también el proyecto habría dejado que quien tiene permiso a nivel de
  // proyecto aplicara una enmienda a la parcela de otra finca. Lo señaló la
  // revisión independiente del 2026-09-01.
  await requireResearchAccess(userAccountId, "execute_protocol", [
    { projectId: null, locationId: input.locationId },
  ]);

  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ locationId: input.locationId }]);

  // Coherencia de ámbitos: el lote de biochar tiene que ser de la misma
  // organización que el terreno tratado. Antes sólo se comprobaba que el UUID
  // existiera, y «el UUID existe» no demuestra ni procedencia ni autoridad.
  // Aplicar biochar de otra finca puede ser legítimo algún día, pero eso es una
  // decisión con nombre, no un hueco.
  if (input.biocharBatchId) {
    const lote = await prisma.biocharBatch.findUnique({
      where: { id: input.biocharBatchId },
      select: { organizationId: true },
    });
    if (!lote) throw new ResearchAccessError("biochar_batch_not_found");
    const organizacionDelBloque = await resolveOrganizationForLocation(input.locationId);
    if (!organizacionDelBloque || organizacionDelBloque !== lote.organizationId) {
      throw new AmendmentValidationError("biochar_batch_from_another_organization");
    }
  }

  // La MISMA validación semántica que el camino canónico: catálogo correcto,
  // enum cerrado, `dataQuality` cuando la identidad es desconocida. Antes sólo
  // se comprobaba que la variable estuviera declarada.
  const variablesPorId = new Map(version.variables.map((v) => [v.id, v]));
  for (const valor of input.variableValues ?? []) {
    const variable = variablesPorId.get(valor.protocolVariableId);
    if (!variable) throw new AmendmentValidationError("variable_not_declared_on_protocol_version");
    await validateTreatmentBatchVariableValue(variable, valor);
  }

  return prisma.$transaction(async (tx) => {
    // **Gate 0 dentro de la transacción**, no antes. El estado del protocolo es
    // mutable: entre comprobar y confirmar, la versión podía dejar de estar
    // `active` y el tratamiento aterrizaba bajo un estado distinto del que la
    // compuerta juzgó.
    const faltan = await evaluarGate0({ ...input, startedAt: input.startedAt }, tx);
    if (faltan.length > 0) throw new Gate0NotPassedError(faltan);

    const batch = await tx.treatmentBatch.create({
      data: {
        protocolVersionId: input.protocolVersionId,
        // Nunca los dos: el CHECK `treatment_batch_un_solo_sujeto` lo impide en
        // la base, y aquí ni siquiera se acepta un `lotId`.
        locationId: input.locationId,
        lotId: null,
        biocharBatchId: input.biocharBatchId ?? null,
        projectId: version.protocol.experiment?.projectId ?? null,
        batchLabel: input.batchLabel.trim(),
        operatorPersonId: input.operatorPersonId ?? null,
        startedAt: input.startedAt,
        notes: input.notes ?? null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference ?? null,
        createdBy: userAccountId,
        variableValues: {
          create: (input.variableValues ?? []).map((v) => ({
            protocolVariableId: v.protocolVariableId,
            textValue: v.textValue ?? null,
            numericValue: v.numericValue ?? null,
            booleanValue: v.booleanValue ?? null,
            catalogValueId: v.catalogValueId ?? null,
            dataQuality: v.dataQuality ?? null,
          })),
        },
      },
      include: { variableValues: true },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "treatment_batch.apply_amendment",
        entityType: "treatment_batch",
        entityId: batch.id,
        after: batch,
        sourceInterface: "research.service",
      },
      tx,
    );
    return batch;
  });
}

/** Las enmiendas aplicadas a un bloque, la más reciente primero. */
export async function listAmendmentsForLocation(userAccountId: string, locationId: string) {
  await requireResearchAccess(userAccountId, "execute_protocol", [{ projectId: null, locationId }]);
  return prisma.treatmentBatch.findMany({
    where: { locationId },
    include: {
      biocharBatch: { select: { id: true, batchCode: true } },
      protocolVersion: { select: { version: true, protocol: { select: { name: true } } } },
    },
    orderBy: { startedAt: "desc" },
  });
}
