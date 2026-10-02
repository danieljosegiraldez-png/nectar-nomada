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
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess } from "./lots";
import { abrirProcesoEnTx, bloquearLinaje, exigeSinCorridasAbiertas, idsDeDescendencia } from "./procesoDelLinaje";
import { Prisma } from "../../generated/prisma/client";
import type { ProvenanceClass } from "../../generated/prisma/client";

// El error vive en su propio archivo (Parte 1, §3.2) y se reexporta para que ningún importador cambie.
import { LotProcessError } from "./errorDeProceso";
export { LotProcessError };

/**
 * Los catálogos de los que puede salir una intervención de manejo.
 *
 * **Corrección del 2026-09-07.** La primera versión inventaba un catálogo nuevo,
 * `intervencion_de_proceso`. Daniel lo señaló —«la lista ya está de antes»— y al
 * medir la base había **24 catálogos con valores**, entre ellos los que
 * describen exactamente lo que él puso de ejemplo: `condicion_oxigeno`
 * (anaerobico, maceracion_carbonica…), `manejo_temperatura` (choque_termico,
 * fermentacion_fria…), `medio_lavado`, `metodo_inoculacion`, `sustrato_anadido`,
 * `recipiente`. Crear uno paralelo habría partido el vocabulario en dos, y la
 * mitad nueva habría empezado vacía.
 *
 * **Es una lista y no un catálogo único** porque una intervención puede ser de
 * naturalezas distintas: cambiar la atmósfera, aplicar un choque térmico,
 * trasegar a otro recipiente. Añadir un catálogo aquí es una línea —«puedo
 * agregar luego más», dijo él— y se lee en el diff.
 *
 * **Qué NO está aquí, a propósito:** `grado_proceso` (Natural, Washed, Honey) y
 * `estado_cereza` (entera, despulpada) describen el batch entero, no algo que
 * ocurre en un instante. Eso va en `intent`, que es donde el dueño lo puso en su
 * propio ejemplo: «tanto peso whole cherries, proceso natural anaeróbico».
 */
/** Las claves de los dos catálogos que describen el batch, no un instante. */
export const CATALOGO_GRADO_PROCESO = "grado_proceso";
export const CATALOGO_ESTADO_CEREZA = "estado_cereza";
/** Parte 1, R7: la lista de motivos de devolución a secado. */
export const CATALOGO_MOTIVO_DEVOLUCION = "motivo_devolucion_a_secado";

export const CATALOGOS_DE_INTERVENCION: readonly string[] = [
  "condicion_oxigeno",
  "manejo_temperatura",
  "medio_lavado",
  "metodo_inoculacion",
  "sustrato_anadido",
  "recipiente",
  "cereza_flotado",
  "cereza_seleccion",
  // 2026-09-14, decisión de Daniel: «las cepas de levadura NO ES TEXTO LIBRE, se
  // deben agregar las levaduras que se van a usar o ya tenerlas en el sistema».
  //
  // **Ya las teníamos, y ése es el punto.** `levadura_cultivo` está en
  // `lib/research/catalogs.ts` desde RO1, con el vocabulario que él mismo
  // decidió —MP72, HDA54, Sunrise Orange, Deep Amber, Cool Blue, Green Origin y
  // «Spontaneous Wild» marcada `impliesUnknownIdentity`—. Lo que faltaba era
  // esta línea: el catálogo existía y **sólo lo alcanzaba Research OS**, por
  // `ProtocolVariable`. En el beneficio de un lote corriente, `registrarIntervencion`
  // lo RECHAZABA con `catalog_value_wrong_catalog`.
  //
  // O sea que se podía registrar CÓMO se inoculó —`metodo_inoculacion`: direct
  // pitch, rehydrated, spontaneous— y no CON QUÉ. El dato que distingue dos
  // fermentaciones por lo demás idénticas era justo el que no tenía dónde ir.
  "levadura_cultivo",
];

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
  /**
   * Del catálogo `grado_proceso`: Natural, Washed, Semi Wash 50/75%, Honey.
   * **Obligatorio** (Daniel, 2026-09-08): un café es natural, lavado o honey; no
   * es «ninguno». La columna es NOT NULL, así que el tipo lo dice igual.
   */
  processGradeValueId: string;
  /** Del catálogo `estado_cereza`: entera, despulpada. **Obligatorio.** */
  cherryStateValueId: string;
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

/**
 * Comprueba que un valor de catálogo es del catálogo que le toca.
 *
 * **La FK sola no basta**, y es el mismo error que ya se cazó con las
 * intervenciones: un valor de `medio_lavado` en la columna del grado de proceso
 * es una FK perfectamente válida, y dejaría la columna contaminada con
 * vocabulario ajeno sin que nada se queje.
 */
async function exigeDelCatalogo(catalogValueId: string, claveEsperada: string, campo: string): Promise<void> {
  const valor = await prisma.variableCatalogValue.findUnique({
    where: { id: catalogValueId },
    include: { catalog: true },
  });
  if (!valor) throw new LotProcessError(`${campo}_not_found`);
  if (valor.catalog.key !== claveEsperada) throw new LotProcessError(`${campo}_wrong_catalog`);
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
 * este lote» dejara de tener respuesta. Desde la Parte 1 (R2, 2026-10-01) la
 * regla es del café y no del lote: se mira todo el linaje, y la hace
 * `abrirProcesoEnTx` dentro de la transacción, con el linaje bloqueado.
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

  // Se comprueban SIEMPRE, no «si vienen»: son obligatorios, y una cadena vacía
  // que llegara de un formulario mal armado tiene que salir con una frase, no
  // con una violación de clave foránea.
  if (!input.processGradeValueId?.trim()) throw new LotProcessError("process_grade_required");
  if (!input.cherryStateValueId?.trim()) throw new LotProcessError("cherry_state_required");
  await exigeDelCatalogo(input.processGradeValueId, CATALOGO_GRADO_PROCESO, "process_grade");
  await exigeDelCatalogo(input.cherryStateValueId, CATALOGO_ESTADO_CEREZA, "cherry_state");

  // R2 (Parte 1, 2026-10-01): la comprobación de «otro proceso abierto» ya no se hace aquí, con el cliente
  // global y fuera de la transacción: la hace `abrirProcesoEnTx` dentro, con el linaje bloqueado.
  try {
    return await prisma.$transaction(async (tx) => {
      await bloquearLinaje(tx, input.lotId);
      return abrirProcesoEnTx(tx, userAccountId, {
        lotId: input.lotId,
        processRecipeVersionId: input.processRecipeVersionId ?? null,
        intent: input.intent.trim(),
        processGradeValueId: input.processGradeValueId,
        cherryStateValueId: input.cherryStateValueId,
        targetMoisturePct: input.targetMoisturePct,
        startedAt: input.startedAt,
        notes: input.notes?.trim() || null,
        provenanceClass: input.provenanceClass,
        sourceReference: input.sourceReference?.trim() || null,
      });
    });
  } catch (error) {
    // El índice único parcial es la red: si algo se colara entre el bloqueo y la escritura, sale con
    // nombre y no como un error de restricción ilegible.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new LotProcessError("process_already_open");
    }
    throw error;
  }
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
  /** De uno de los catálogos de `CATALOGOS_DE_INTERVENCION`. */
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
  const lote = await loteGestionable(userAccountId, proceso.lotId);
  await exigirPersonaPermitida(userAccountId, input.operatorPersonId, [{ projectId: lote.projectId, locationId: lote.locationId }]);
  if (proceso.endedAt !== null) throw new LotProcessError("process_already_closed");

  const valor = await prisma.variableCatalogValue.findUnique({
    where: { id: input.catalogValueId },
    include: { catalog: true },
  });
  if (!valor) throw new LotProcessError("catalog_value_not_found");
  if (!CATALOGOS_DE_INTERVENCION.includes(valor.catalog.key)) {
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
 * **La medición tiene que ser de humedad y del lote del proceso o de un
 * DESCENDIENTE suyo, nunca de otra rama.** Desde el 2026-09-27 se admite la de un
 * descendiente: el proceso se abre sobre la cereza y la humedad se mide en el
 * lote nuevo que crea cada corrida, que es el mismo café. Sin las dos
 * comprobaciones, cerrar con la medición de otro café —o con un Brix— produce
 * un proceso que parece completo y cuyo número no significa lo que dice.
 *
 * **No exige haber alcanzado el objetivo.** Se puede cerrar por encima, y el
 * reporte enseñará la diferencia: la receta declara el objetivo y la corrida
 * registra lo que pasó, que es la frase del propio dueño en `ProcessRecipe`.
 *
 * **R5 (Parte 1, 2026-10-01): no cierra con corridas abiertas** en el linaje que cubre
 * (`exigeSinCorridasAbiertas`), y lo decide dentro de la transacción con el linaje bloqueado.
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

  return prisma.$transaction(async (tx) => {
    // R5 (Parte 1, 2026-10-01): con el linaje bloqueado, para que ninguna corrida empiece entre la
    // comprobación y el cierre. Lo que sigue se decide con el bloqueo ya tomado: otro cierre que
    // ganó la espera se ve aquí, y no se pisa.
    await bloquearLinaje(tx, proceso.lotId);
    const actual = await tx.lotProcess.findUniqueOrThrow({ where: { id: proceso.id } });
    if (actual.endedAt !== null) throw new LotProcessError("process_already_closed");
    // Daniel, 2026-09-27: la humedad de cierre puede ser de un DESCENDIENTE del lote del proceso,
    // porque es el mismo café. El proceso se abre sobre la cereza y la fermentación crea un lote nuevo
    // de pergamino: exigir el mismo lote dejaba el proceso sin poder cerrarse nunca (medido: cero
    // mediciones de humedad en el lote del proceso). Lo que sigue prohibido es una medición de OTRA
    // rama, y el error se conserva con su nombre.
    if (medicion.lotId !== proceso.lotId) {
      const descendencia = await idsDeDescendencia(tx, proceso.lotId);
      if (!medicion.lotId || !descendencia.includes(medicion.lotId)) {
        throw new LotProcessError("measurement_belongs_to_another_lot");
      }
    }
    await exigeSinCorridasAbiertas(tx, { id: proceso.id, lotId: proceso.lotId });

    const cerrado = await tx.lotProcess.update({
      where: { id: input.lotProcessId },
      // Parte 1, R5/R6 (2026-10-01): todo cierre por esta puerta es por humedad, y la base lo exige (CHECK).
      data: { endedAt: input.endedAt, closingMoistureMeasurementId: input.closingMoistureMeasurementId, closureKind: "moisture" },
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
          closureKind: cerrado.closureKind,
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
 * La compuerta de bodega: un lote **no sale de secado** antes de llegar a su
 * objetivo de humedad.
 *
 * **Regla del dueño (2026-09-07), literal:** «bloquear, alertar, acción para
 * regresar a secado; no debe salir de secado antes bajo ninguna circunstancia».
 * Por eso esto lanza en vez de avisar, y por eso existe `devolverASecado`.
 *
 * **Sólo bloquea si el lote TIENE un proceso.** Medido el 2026-09-07: producción
 * tiene 45 lotes y **cero** procesos, porque `LotProcess` nació hoy. Bloquear
 * también los que no tienen ninguno dejaría los 45 inalmacenables de golpe por
 * un dato que nadie pudo declarar todavía. No es una puerta trasera: en cuanto
 * un lote abre su primer proceso, queda bajo la regla y ya no sale de ella.
 *
 * Se mira el proceso **más reciente**, no el abierto: un lote cuyo proceso se
 * cerró por encima del objetivo tampoco puede almacenarse, que es justo el caso
 * que la regla persigue.
 */
export async function exigeSecadoTerminado(lotId: string): Promise<void> {
  const proceso = await prisma.lotProcess.findFirst({
    where: { lotId },
    orderBy: { sequenceOrder: "desc" },
    include: { closingMoistureMeasurement: true },
  });
  if (!proceso) return;

  if (proceso.endedAt === null) throw new LotProcessError("drying_not_finished");
  if (proceso.closingMoistureMeasurement === null) throw new LotProcessError("no_closing_moisture");

  const medida = proceso.closingMoistureMeasurement.value.toNumber();
  const objetivo = proceso.targetMoisturePct.toNumber();
  if (medida > objetivo) throw new LotProcessError("moisture_above_target");
}

/**
 * Devuelve el lote a secado: reabre su proceso más reciente.
 *
 * **Es la acción que el dueño pidió junto al bloqueo.** Reabrir contradice la
 * regla de «cerrado no se toca», y por eso **exige un motivo** y lo deja en el
 * `AuditEvent` con lo que se está deshaciendo: qué humedad de cierre se
 * descarta y contra qué objetivo. Sin el motivo, reabrir sería indistinguible de
 * un descuido.
 *
 * No borra la medición: la suelta. La fila de `Measurement` sigue donde estaba,
 * porque es un hecho medido y no deja de haber ocurrido.
 */
export async function devolverASecado(
  userAccountId: string,
  input: { lotId: string; motivo: string },
) {
  await loteGestionable(userAccountId, input.lotId);

  const motivo = input.motivo.trim();
  if (motivo.length === 0) throw new LotProcessError("motivo_required");

  const proceso = await prisma.lotProcess.findFirst({
    where: { lotId: input.lotId },
    orderBy: { sequenceOrder: "desc" },
    include: { closingMoistureMeasurement: true },
  });
  if (!proceso) throw new LotProcessError("process_not_found");
  if (proceso.endedAt === null) throw new LotProcessError("process_already_open");

  const antes = {
    endedAt: proceso.endedAt,
    closingMoistureMeasurementId: proceso.closingMoistureMeasurementId,
    humedadDeCierre: proceso.closingMoistureMeasurement?.value.toNumber() ?? null,
    targetMoisturePct: proceso.targetMoisturePct.toNumber(),
  };

  return prisma.$transaction(async (tx) => {
    const reabierto = await tx.lotProcess.update({
      where: { id: proceso.id },
      // Parte 1 (2026-10-01): provisional hasta la tarea 8, que sustituye esta función entera. Limpia el
      // tipo junto con la medición porque el CHECK exige que un proceso abierto no tenga tipo de cierre.
      data: { endedAt: null, closingMoistureMeasurementId: null, closureKind: null },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.reopen_for_drying",
        entityType: "lot_process",
        entityId: proceso.id,
        before: antes,
        after: { endedAt: null, closingMoistureMeasurementId: null, motivo },
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );

    return reabierto;
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
      processGradeValue: true,
      cherryStateValue: true,
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

/**
 * Lo que la pantalla necesita para pintar sus desplegables: el vocabulario de
 * manejos y las mediciones de humedad de este lote.
 *
 * **Las mediciones se listan, no se teclean.** Cerrar un proceso guarda el
 * puntero a una `Measurement`, no una copia de su número; si la pantalla dejara
 * escribir el valor a mano habría dos verdades y la de la pantalla no tendría ni
 * fecha ni quién la tomó.
 *
 * **Puede devolver listas vacías, y eso es información:** sin vocabulario
 * cargado no hay manejos que registrar, y sin ninguna medición de humedad el
 * proceso no se puede cerrar. La pantalla lo dice en vez de enseñar un
 * desplegable vacío.
 */
export async function opcionesParaProceso(userAccountId: string, lotId: string) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);

  const [valores, mediciones] = await Promise.all([
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: { in: [...CATALOGOS_DE_INTERVENCION] } } },
      include: { catalog: true },
      orderBy: [{ catalog: { key: "asc" } }, { displayOrder: "asc" }, { value: "asc" }],
    }),
    // Las de este lote Y las de su descendencia, por lo mismo que `cerrarProceso`: la humedad que
    // cierra un proceso abierto en cereza se mide sobre el pergamino que salió de él.
    idsDeDescendencia(prisma, lotId).then((descendencia) =>
      prisma.measurement.findMany({
        where: { lotId: { in: [lotId, ...descendencia] }, variable: "moisture" },
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { lot: { select: { lotCode: true } } },
      }),
    ),
  ]);

  const [grados, estados] = await Promise.all([
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_GRADO_PROCESO } },
      orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    }),
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_ESTADO_CEREZA } },
      orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    }),
  ]);

  return {
    grados: grados.map((v) => ({ id: v.id, label: v.value })),
    estadosDeCereza: estados.map((v) => ({ id: v.id, label: v.value })),
    intervenciones: valores.map((v) => ({ id: v.id, label: `${v.catalog.name} · ${v.value}` })),
    // El código del lote va en la etiqueta cuando la medición NO es de este lote: ofrecer una
    // humedad de otro lote sin decir de cuál es pedirle al operario que adivine (ADR-080: un id
    // no significa nada, un código sí).
    mediciones: mediciones.map((m) => ({
      id: m.id,
      label:
        m.lotId === lotId
          ? `${m.value.toNumber()} ${m.unit} · ${m.occurredAt.toISOString().slice(0, 10)}`
          : `${m.value.toNumber()} ${m.unit} · ${m.occurredAt.toISOString().slice(0, 10)} · de ${m.lot?.lotCode ?? "otro lote"}`,
    })),
  };
}

/** El tipo que devuelve `listarProcesosDeLote`, para quien lo pinte. */
export type ProcesoDeLote = Awaited<ReturnType<typeof listarProcesosDeLote>>[number];
