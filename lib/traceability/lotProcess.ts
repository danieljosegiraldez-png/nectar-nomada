/**
 * El proceso por el que pasa un lote: abrirlo, colgarle lo que ocurre, cerrarlo.
 *
 * **Definición del dueño (2026-09-07), literal:** «uno o más eventos o procesos
 * transformativos o de manejo, antes o durante el secado, antes de llegar al %
 * H deseado a almacenar». El proceso es la SECUENCIA; esto es la cabecera que
 * la agrupa, y los eventos —fermentaciones, secados— ya existían sueltos.
 *
 * **Qué NO hace este archivo, y es deliberado.** No toca bodega. El
 * `targetMoisturePct` se declara y se compara, pero almacenar un lote por
 * encima de su objetivo no se bloquea ni se marca: esa decisión sigue abierta
 * con el dueño, y construirla por adivinanza es peor que no tenerla.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess } from "./lots";
import type { ProvenanceClass } from "../../generated/prisma/client";

export class LotProcessError extends Error {}

/** La clave del catálogo abierto de manejos. Sus valores los define el dueño. */
export const CATALOGO_DE_INTERVENCIONES = "intervencion_de_proceso";

/** Lo que declara la intención al abrir un proceso. */
export interface AbrirProcesoInput {
  lotId: string;
  /** Null = «Sin receta», que el reporte agrupa aparte (decisión de Daniel). */
  processRecipeVersionId?: string | null;
  /**
   * La intención de ESTE batch. **Obligatoria aunque no haya receta**, por
   * corrección del dueño: «se puso tanto peso whole cherries, proceso natural
   * anaeróbico, tantas horas». «Sin receta» nunca significa «sin nada
   * declarado» — significa que esta intención no está estandarizada.
   */
  intent: string;
  /** Obligatorio: «no se abre un proceso sin decir a qué humedad se va a almacenar». */
  targetMoisturePct: number;
  startedAt: Date;
  notes?: string | null;
  provenanceClass: ProvenanceClass;
  sourceReference?: string | null;
}

/**
 * El rango del porcentaje, comprobado aquí Y en la base.
 *
 * No es duplicación ociosa: el `CHECK` es la garantía —un importador o SQL
 * directo no se lo saltan— y esto es lo que convierte una violación de
 * restricción ilegible en una frase. Si algún día divergen, manda el CHECK.
 */
function exigePorcentaje(valor: number, campo: string): void {
  if (!Number.isFinite(valor) || valor <= 0 || valor > 100) {
    throw new LotProcessError(`${campo}_out_of_range`);
  }
}

async function loteGestionable(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "manage", [lot]);
  return lot;
}

/**
 * Abre un proceso sobre un lote y devuelve la fila creada.
 *
 * **El `sequenceOrder` se calcula, no se pide.** Un lote puede pasar por varios
 * procesos (decisión de Daniel), y dejar que el llamador elija el número
 * invitaría a repetirlo — la unicidad `(lotId, sequenceOrder)` lo rechazaría,
 * pero con un error de restricción que nadie puede leer.
 *
 * **Dos procesos abiertos a la vez no tienen sentido** y se rechazan: un lote
 * está en un proceso o en otro, y permitirlo haría que «el proceso actual de
 * este lote» dejara de tener respuesta.
 */
export async function abrirProceso(userAccountId: string, input: AbrirProcesoInput) {
  await loteGestionable(userAccountId, input.lotId);
  exigePorcentaje(input.targetMoisturePct, "target_moisture_pct");
  // El CHECK de la base la rechaza igual; aquí sale con una frase legible.
  if (input.intent.trim().length === 0) throw new LotProcessError("intent_required");

  if (input.processRecipeVersionId) {
    const version = await prisma.processRecipeVersion.findUnique({
      where: { id: input.processRecipeVersionId },
      include: { recipe: true },
    });
    if (!version) throw new LotProcessError("recipe_version_not_found");
    if (version.recipe.status === "archived") throw new LotProcessError("recipe_archived");
  }

  const abierto = await prisma.lotProcess.findFirst({
    where: { lotId: input.lotId, endedAt: null },
    select: { id: true },
  });
  if (abierto) throw new LotProcessError("process_already_open");

  const ultimo = await prisma.lotProcess.findFirst({
    where: { lotId: input.lotId },
    orderBy: { sequenceOrder: "desc" },
    select: { sequenceOrder: true },
  });

  return prisma.$transaction(async (tx) => {
    const proceso = await tx.lotProcess.create({
      data: {
        lotId: input.lotId,
        sequenceOrder: (ultimo?.sequenceOrder ?? 0) + 1,
        processRecipeVersionId: input.processRecipeVersionId ?? null,
        intent: input.intent.trim(),
        targetMoisturePct: input.targetMoisturePct,
        startedAt: input.startedAt,
        notes: input.notes?.trim() || null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference?.trim() || null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.open",
        entityType: "lot_process",
        entityId: proceso.id,
        after: proceso,
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return proceso;
  });
}

/**
 * Cambia el % H objetivo de un proceso ya abierto.
 *
 * **Se puede cambiar** —el dueño lo dijo: «siempre está clara la intención del
 * proceso… pero puede ser que se modifique»— **y el cambio deja rastro**. No es
 * versionado como una receta: es la intención de UN lote y corregirla es
 * normal. Lo que no puede pasar es que cambie sin que nadie lo sepa, así que el
 * `AuditEvent` lleva el antes y el después, en la misma transacción.
 *
 * **Cerrado no se toca.** Cambiar el objetivo de un proceso ya cerrado
 * reescribiría contra qué se juzgó una decisión que ya se tomó.
 */
export async function cambiarObjetivoDeHumedad(
  userAccountId: string,
  lotProcessId: string,
  nuevoObjetivo: number,
  razon?: string | null,
) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  await loteGestionable(userAccountId, proceso.lotId);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");

  exigePorcentaje(nuevoObjetivo, "target_moisture_pct");
  const antes = proceso.targetMoisturePct.toNumber();
  if (antes === nuevoObjetivo) return proceso;

  return prisma.$transaction(async (tx) => {
    const despues = await tx.lotProcess.update({
      where: { id: lotProcessId },
      data: { targetMoisturePct: nuevoObjetivo },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.change_moisture_target",
        entityType: "lot_process",
        entityId: lotProcessId,
        before: { targetMoisturePct: antes },
        after: { targetMoisturePct: nuevoObjetivo, razon: razon?.trim() || null },
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return despues;
  });
}

/**
 * Cambia la intención declarada de un proceso abierto.
 *
 * **El dueño lo pidió explícito:** «puede ser que en medio proceso de esta
 * receta pueda cambiar y/o ser modificada… se puede modificar e ir describiendo
 * qué se aplica o qué protocolos se usaron, para su documentación y
 * reproducibilidad». Así que la intención no es inmutable — pero cada versión
 * queda en el `AuditEvent`, que es lo que hace reproducible el lote: se puede
 * leer qué se pretendía en cada momento, no sólo qué se pretende ahora.
 */
export async function cambiarIntencion(
  userAccountId: string,
  lotProcessId: string,
  nuevaIntencion: string,
  razon?: string | null,
) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  await loteGestionable(userAccountId, proceso.lotId);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");

  const limpia = nuevaIntencion.trim();
  if (limpia.length === 0) throw new LotProcessError("intent_required");
  if (limpia === proceso.intent) return proceso;

  return prisma.$transaction(async (tx) => {
    const despues = await tx.lotProcess.update({ where: { id: lotProcessId }, data: { intent: limpia } });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.change_intent",
        entityType: "lot_process",
        entityId: lotProcessId,
        before: { intent: proceso.intent },
        after: { intent: limpia, razon: razon?.trim() || null },
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return despues;
  });
}

export interface RegistrarIntervencionInput {
  lotProcessId: string;
  /** Del catálogo abierto `intervencion_de_proceso`. */
  catalogValueId: string;
  occurredAt: Date;
  operatorPersonId?: string | null;
  notes?: string | null;
}

/**
 * Registra un manejo que no es una fermentación ni un secado: flotado,
 * despulpado, reposo, mover a sombra.
 *
 * **El valor tiene que pertenecer al catálogo de intervenciones**, no a
 * cualquiera. Sin esa comprobación se podría colgar aquí un valor de
 * `medio_lavado` o de cultivar y la lista quedaría contaminada, con una FK
 * perfectamente válida diciendo que todo está bien.
 */
export async function registrarIntervencion(userAccountId: string, input: RegistrarIntervencionInput) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: input.lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  await loteGestionable(userAccountId, proceso.lotId);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");

  const valor = await prisma.variableCatalogValue.findUnique({
    where: { id: input.catalogValueId },
    include: { catalog: true },
  });
  if (!valor) throw new LotProcessError("catalog_value_not_found");
  if (valor.catalog.key !== CATALOGO_DE_INTERVENCIONES) {
    throw new LotProcessError("catalog_value_wrong_catalog");
  }

  return prisma.$transaction(async (tx) => {
    const intervencion = await tx.lotProcessIntervention.create({
      data: {
        lotProcessId: input.lotProcessId,
        catalogValueId: input.catalogValueId,
        occurredAt: input.occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        notes: input.notes?.trim() || null,
        createdBy: userAccountId,
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.record_intervention",
        entityType: "lot_process_intervention",
        entityId: intervencion.id,
        after: intervencion,
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return intervencion;
  });
}

export interface CerrarProcesoInput {
  lotProcessId: string;
  endedAt: Date;
  /** La medición de humedad con la que se da por terminado. */
  closingMoistureMeasurementId: string;
}

/**
 * Cierra el proceso con la medición de humedad que lo terminó.
 *
 * **Se guarda el puntero a la medición, no una copia de su número.** Copiarlo
 * crearía dos verdades que pueden divergir, y CLAUDE.md §49 prohíbe mezclar la
 * medición con el valor derivado. El reporte lee la medición.
 *
 * **La medición tiene que ser de humedad y de ESTE lote.** Sin las dos
 * comprobaciones, cerrar con la medición de otro café —o con un Brix— produce
 * un proceso que parece completo y cuyo número no significa lo que dice.
 *
 * **No exige haber alcanzado el objetivo.** Se puede cerrar por encima, y el
 * reporte enseñará la diferencia: la receta declara el objetivo y la corrida
 * registra lo que pasó, que es la frase del propio dueño en `ProcessRecipe`.
 */
export async function cerrarProceso(userAccountId: string, input: CerrarProcesoInput) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: input.lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  await loteGestionable(userAccountId, proceso.lotId);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");
  if (input.endedAt < proceso.startedAt) throw new LotProcessError("ends_before_it_started");

  const medicion = await prisma.measurement.findUnique({ where: { id: input.closingMoistureMeasurementId } });
  if (!medicion) throw new LotProcessError("measurement_not_found");
  if (medicion.variable !== "moisture") throw new LotProcessError("measurement_is_not_moisture");
  if (medicion.lotId !== proceso.lotId) throw new LotProcessError("measurement_belongs_to_another_lot");

  return prisma.$transaction(async (tx) => {
    const cerrado = await tx.lotProcess.update({
      where: { id: input.lotProcessId },
      data: { endedAt: input.endedAt, closingMoistureMeasurementId: input.closingMoistureMeasurementId },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.close",
        entityType: "lot_process",
        entityId: cerrado.id,
        before: { endedAt: null },
        after: {
          endedAt: cerrado.endedAt,
          closingMoistureMeasurementId: cerrado.closingMoistureMeasurementId,
          targetMoisturePct: cerrado.targetMoisturePct,
        },
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return cerrado;
  });
}

/**
 * Cuelga una corrida de fermentación o de secado que ya existe del proceso.
 *
 * Se hace en dos pasos —crear la corrida, colgarla— y no al crearla, porque las
 * corridas ya existían antes que `LotProcess` y sus caminos de creación siguen
 * funcionando sin él. Forzar el proceso ahí habría roto lo que ya se registra.
 */
export async function colgarCorrida(
  userAccountId: string,
  input: { lotProcessId: string; tipo: "fermentation" | "drying"; runId: string },
) {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: input.lotProcessId } });
  if (!proceso) throw new LotProcessError("process_not_found");
  await loteGestionable(userAccountId, proceso.lotId);

  return prisma.$transaction(async (tx) => {
    const actualizada =
      input.tipo === "fermentation"
        ? await tx.fermentationRun.update({ where: { id: input.runId }, data: { lotProcessId: proceso.id } })
        : await tx.dryingRun.update({ where: { id: input.runId }, data: { lotProcessId: proceso.id } });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.attach_run",
        entityType: input.tipo === "fermentation" ? "fermentation_run" : "drying_run",
        entityId: input.runId,
        after: { lotProcessId: proceso.id },
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return actualizada;
  });
}

/**
 * Los procesos de un lote, con lo que cuelga de cada uno.
 *
 * `etiqueta` es lo que el reporte agrupa: el nombre de la receta, o **«Sin
 * receta»** — decisión de Daniel, para que el hueco se vea en vez de esconderse
 * y para no deducir «natural» de la ausencia de fermentación, que sería
 * inferir un hecho y guardarlo como tal.
 */
export const SIN_RECETA = "Sin receta";

export async function listarProcesosDeLote(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);

  const procesos = await prisma.lotProcess.findMany({
    where: { lotId },
    orderBy: { sequenceOrder: "asc" },
    include: {
      processRecipeVersion: { include: { recipe: true } },
      closingMoistureMeasurement: true,
      interventions: { orderBy: { occurredAt: "asc" }, include: { catalogValue: true, operator: true } },
      fermentationRuns: { orderBy: { startedAt: "asc" } },
      dryingRuns: { orderBy: { startedAt: "asc" } },
    },
  });

  return procesos.map((p) => ({
    ...p,
    etiqueta: p.processRecipeVersion?.recipe.name ?? SIN_RECETA,
    humedadDeCierre: p.closingMoistureMeasurement?.value.toNumber() ?? null,
    /** Negativo = cerró por debajo del objetivo. Null hasta que se cierra. */
    diferenciaContraObjetivo:
      p.closingMoistureMeasurement === null
        ? null
        : p.closingMoistureMeasurement.value.toNumber() - p.targetMoisturePct.toNumber(),
  }));
}

/** El tipo que devuelve `listarProcesosDeLote`, para quien lo pinte. */
export type ProcesoDeLote = Awaited<ReturnType<typeof listarProcesosDeLote>>[number];
