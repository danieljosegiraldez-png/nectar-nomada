/**
 * El proceso por el que pasa un lote: abrirlo, colgarle lo que ocurre, cerrarlo.
 *
 * **Definición del dueño (2026-09-07), literal:** «uno o más eventos o procesos
 * transformativos o de manejo, antes o durante el secado, antes de llegar al %
 * H deseado a almacenar». El proceso es la SECUENCIA; esto es la cabecera que
 * la agrupa, y los eventos —fermentaciones, secados— ya existían sueltos.
 *
 * **Bodega.** La compuerta de bodega vive aquí, en `exigeSecadoTerminado`
 * (regla del dueño, 2026-09-07: «no debe salir de secado antes bajo ninguna
 * circunstancia»; R7 de la Parte 1, 2026-10-01). Un lote por encima de su
 * `targetMoisturePct` NO entra a bodega. Corre dentro de `moveLotToStorage`,
 * en su transacción y con el linaje bloqueado, y sólo al ENTRAR: reubicar un
 * lote que ya está dentro no la consulta. La deshace `devolverASecado`, que desde la
 * tarea 8 de la Parte 1 (R7) no reabre nada: abre una continuación unida al proceso cerrado.
 */
import { exigirPersonaPermitida } from "../people/quienLoHizo";
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import {
  abrirProcesoEnTx,
  bloquearLinaje,
  enMinusculas,
  TRANSACCION_DEL_LINAJE,
  exigeSinCorridasAbiertas,
  exigeSinOtroProcesoAbierto,
  idsDeDescendencia,
  loteDividido,
  procesoParaUnaCorrida,
  procesoQueCubre,
  procesosParaEntrada,
  type OrigenDelProceso,
} from "./procesoDelLinaje";
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
    }, TRANSACCION_DEL_LINAJE);
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
 *
 * **Ni con una humedad anterior a su inicio** (`medicion_anterior_al_proceso`, revisión final, 2026-10-03).
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
  // R7 (revisión final, ronda de arreglo 1, 2026-10-03): la humedad que cierra un proceso dice cómo TERMINÓ, así que no puede ser
  // anterior a su inicio. Sin esto, la continuación de una devolución a secado se cerraba con la misma lectura que cerró el
  // proceso anterior —la que la devolución acababa de declarar errónea— y el lote volvía a bodega sin secar. El instante igual
  // vale: una lectura tomada al abrir es posterior a nada.
  if (medicion.occurredAt < proceso.startedAt) throw new LotProcessError("medicion_anterior_al_proceso");

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
  }, TRANSACCION_DEL_LINAJE);
}

/**
 * La compuerta de bodega: un lote **no sale de secado** antes de llegar a su objetivo de humedad.
 *
 * **Regla del dueño (2026-09-07), literal:** «bloquear, alertar, acción para regresar a secado; no
 * debe salir de secado antes bajo ninguna circunstancia».
 *
 * **Parte 1, R7 (2026-09-30).** Mira el proceso que CUBRE al lote —buscado hacia arriba—, no sólo el
 * del propio lote: el que va a bodega es el pergamino, y su proceso vive en la cereza. Corre DENTRO
 * de la transacción de bodega, después de `bloquearLinaje`: antes comprobaba fuera, y en el hueco
 * otra petición podía reabrir o abrir un proceso.
 *
 * **Un lote sin proceso pasa, como hoy.** Medido el 2026-09-07: producción tenía 45 lotes y cero
 * procesos; bloquearlos los dejaría inalmacenables por un dato que nadie pudo declarar. Hasta que
 * la parte «Re-importar» rehaga el histórico (R9).
 */
export async function exigeSecadoTerminado(tx: Prisma.TransactionClient, lotId: string): Promise<void> {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  // R6.6 (ronda de arreglo 1, 2026-10-02). NO es redundante con la de `closureKind` de más abajo, aunque lo parezca: con un REPROCESO
  // del ancestro (R2 lo permite sobre un proceso cerrado), el proceso que cubre a un lote dividido es el reproceso —cerrado por
  // humedad, en el objetivo—, no el `divided`. Sólo esta línea, que mira la división de la que el lote es entrada, lo deja fuera.
  // Lo prueba `bodegaConProceso.test.ts` («un lote dividido sigue fuera de bodega aunque su ancestro se reprocese…»).
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "sin_proceso") return;
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  const proceso = await tx.lotProcess.findUniqueOrThrow({
    where: { id: cobertura.vigente.id },
    include: { closingMoistureMeasurement: true },
  });
  if (proceso.endedAt === null) throw new LotProcessError("drying_not_finished");
  if (proceso.closureKind === "divided") throw new LotProcessError("lote_dividido");
  if (proceso.closingMoistureMeasurement === null) throw new LotProcessError("no_closing_moisture");
  // Con la ÚLTIMA corrección de la medición de cierre, si la tiene (revisión final, ronda de arreglo 1, 2026-10-03): corregir
  // la lectura que cerró el proceso no tocaba la compuerta, que seguía leyendo el número que se acababa de declarar erróneo.
  const medida = (await lecturaVigente(tx, proceso.closingMoistureMeasurement)).value.toNumber();
  const objetivo = proceso.targetMoisturePct.toNumber();
  if (medida > objetivo) throw new LotProcessError("moisture_above_target");
}

/**
 * La lectura que hoy vale de una medición: ella misma, o la última corrección de su cadena (`correctsId`). `correctMeasurement`
 * no deja corregir dos veces la misma fila —se corrige la corrección—, así que la cadena es una línea. Revisión final, ronda de
 * arreglo 1 (2026-10-03): la usan la compuerta de bodega y lo que la ficha y la página del proceso enseñan como humedad de
 * cierre, para que digan lo mismo. Con un tope, por si la base trajera un ciclo que el servicio no puede escribir: se lanza en
 * vez de devolver una lectura cualquiera.
 */
async function lecturaVigente<M extends { id: string; value: Prisma.Decimal }>(
  tx: Prisma.TransactionClient,
  medicion: M,
): Promise<{ id: string; value: Prisma.Decimal }> {
  let vigente: { id: string; value: Prisma.Decimal } = medicion;
  for (let paso = 0; paso <= 1000; paso++) {
    const correccion = await tx.measurement.findFirst({
      where: { correctsId: vigente.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, value: true },
    });
    if (!correccion) return vigente;
    vigente = correccion;
  }
  throw new LotProcessError("measurement_correction_chain_too_long");
}

/**
 * El proceso cerrado que una devolución a secado continuaría, o el rechazo con nombre — Parte 1, R7. Son las comprobaciones
 * que `devolverASecado` hace ANTES de escribir nada, sacadas aquí (tarea 9, 2026-10-02) para que `puedeDevolverASecado`, que
 * decide si la pantalla ofrece el formulario, pregunte LO MISMO que el servicio y no una copia que pueda divergir.
 *
 * Las dos comprobaciones de dividido dan el rechazo antes de escribir nada. No son lo único que lo impediría: `abrirProcesoEnTx`
 * rechaza `lote_dividido` igual, por R2. Aquí el error sale con su código antes de que la asignación de bodega se haya tocado.
 *
 * Dentro de la devolución corre con su `tx` y DESPUÉS de `bloquearLinaje`; el predicado la llama con el cliente global, sólo lee.
 */
async function procesoQueDevolver(tx: Prisma.TransactionClient, lotId: string) {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  if (await loteDividido(tx, lotId)) throw new LotProcessError("lote_dividido");
  const cobertura = await procesoQueCubre(tx, lotId);
  if (cobertura.estado === "mezcla") throw new LotProcessError("lote_mezclado");
  if (cobertura.estado === "sin_proceso") throw new LotProcessError("process_not_found");
  if (cobertura.estado === "abierto") throw new LotProcessError("process_already_open");
  const cerrado = await tx.lotProcess.findUniqueOrThrow({ where: { id: cobertura.vigente.id } });
  if (cerrado.closureKind !== "moisture") throw new LotProcessError("lote_dividido");
  return cerrado;
}

export interface DevolverASecadoInput {
  lotId: string;
  /** Del catálogo `motivo_devolucion_a_secado`. */
  motivoValueId: string;
  /** Obligatoria con «otro». */
  nota?: string | null;
  ocurrioEn: Date;
}

/**
 * Devuelve el lote a secado — Parte 1, R7 (2026-09-30).
 *
 * **Es la acción que el dueño pidió junto al bloqueo de bodega** (2026-09-07: «bloquear, alertar, acción
 * para regresar a secado»). **Ya no reabre el proceso cerrado: abre una continuación unida a él.** Reabrir
 * tenía tres defectos: borraba la medición de cierre, que es un hecho que sí ocurrió; volvía a abrir el
 * proceso para TODOS los lotes que cubre, también los hermanos ya guardados; y se saltaba R2. Daniel aprobó
 * el cambio el 2026-09-30.
 *
 * **Sólo por un defecto de humedad**: el motivo sale de una lista y se guarda en su propia fila
 * (`LotProcessReturn`), para poder contar cuántas veces pasa y por qué. «otro» exige nota.
 *
 * **La fecha del hecho (`ocurrioEn`) no puede ser anterior al cierre del proceso ni a la entrada en bodega**
 * (`devolucion_antes_del_cierre`, ronda de arreglo 1, 2026-10-02): es el inicio de la continuación y el fin de la
 * asignación de bodega, y ninguna de las dos puede quedar al revés.
 *
 * Todo en una transacción y con el linaje bloqueado PRIMERO —antes de leer o terminar la asignación de
 * bodega, el mismo orden que `moveLotToStorage`—: si un paso falla, no queda nada a medias.
 */
export async function devolverASecado(userAccountId: string, input: DevolverASecadoInput) {
  await loteGestionable(userAccountId, input.lotId);
  const motivo = input.motivoValueId
    ? await prisma.variableCatalogValue.findUnique({ where: { id: input.motivoValueId }, include: { catalog: true } })
    : null;
  if (!motivo || motivo.catalog.key !== CATALOGO_MOTIVO_DEVOLUCION) throw new LotProcessError("motivo_required");
  const nota = input.nota?.trim() || null;
  if (motivo.value === "otro" && !nota) throw new LotProcessError("motivo_otro_requiere_nota");

  return prisma.$transaction(async (tx) => {
    await bloquearLinaje(tx, input.lotId);
    const cerrado = await procesoQueDevolver(tx, input.lotId);

    const bodega = await tx.storageAssignment.findFirst({ where: { lotId: input.lotId, endedAt: null } });

    // Cronología (R7, ronda de arreglo 1, 2026-10-02). `ocurrioEn` es a la vez el fin de la asignación de bodega, el
    // inicio de la continuación y la fecha de la devolución, y la base no tiene ningún `CHECK` que la compare con nada:
    // una anterior al cierre dejaba una continuación que empieza antes de que el proceso que continúa terminara, y una
    // anterior a la entrada en bodega dejaba una asignación con `ended_at < started_at`. Se rechaza ANTES de escribir.
    // Estricta: la misma fecha del cierre o de la entrada vale. (`endedAt` de un proceso cerrado nunca es nulo; la
    // comparación con `null` sólo está para que el tipo lo sepa.)
    if (cerrado.endedAt !== null && input.ocurrioEn < cerrado.endedAt) throw new LotProcessError("devolucion_antes_del_cierre");
    if (bodega && input.ocurrioEn < bodega.startedAt) throw new LotProcessError("devolucion_antes_del_cierre");

    // Primero sale de bodega, DESPUÉS se comprueba R2 dentro de `abrirProcesoEnTx`: si fuera al revés, R2 lo
    // rechazaría por estar en bodega, que es justo de donde se le está sacando.
    if (bodega) await tx.storageAssignment.update({ where: { id: bodega.id }, data: { endedAt: input.ocurrioEn } });

    // La continuación se abre sobre el lote DEVUELTO, no sobre el lote donde vive el proceso cerrado: los
    // hermanos siguen bajo el cerrado. Copia sus atributos y lleva el hilo (`derivedFromLotProcessId`).
    const continuacion = await abrirProcesoEnTx(tx, userAccountId, {
      lotId: input.lotId,
      processRecipeVersionId: cerrado.processRecipeVersionId,
      intent: cerrado.intent,
      processGradeValueId: cerrado.processGradeValueId,
      cherryStateValueId: cerrado.cherryStateValueId,
      targetMoisturePct: cerrado.targetMoisturePct,
      startedAt: input.ocurrioEn,
      notes: cerrado.notes,
      provenanceClass: cerrado.provenanceClass,
      sourceReference: cerrado.sourceReference,
      derivedFromLotProcessId: cerrado.id,
    });
    const devolucion = await tx.lotProcessReturn.create({
      data: {
        closedLotProcessId: cerrado.id,
        continuationLotProcessId: continuacion.id,
        reasonValueId: motivo.id,
        note: nota,
        endedStorageAssignmentId: bodega?.id ?? null,
        occurredAt: input.ocurrioEn,
        createdBy: userAccountId,
      },
    });
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "lot_process.return_to_drying",
        entityType: "lot_process_return",
        entityId: devolucion.id,
        after: devolucion,
        sourceInterface: "traceability.lotProcess",
      },
      tx,
    );
    return { continuacion, devolucion };
  }, TRANSACCION_DEL_LINAJE);
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
  lotId = enMinusculas(lotId); // F5: compara `m.lotId === lotId` para la etiqueta; ver `enMinusculas`.
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);

  // R7 (revisión final, ronda de arreglo 1, 2026-10-03): el desplegable de cierre ofrece sólo lo que `cerrarProceso` acepta y la
  // compuerta lee. Con un proceso ABIERTO que cubre al lote, sólo las humedades desde su inicio —una anterior no dice cómo
  // terminó, y la de la continuación de una devolución sería la misma que la motivó—. Y nunca una lectura ya corregida: vale su
  // corrección, que es otra fila y sale en la lista.
  const cobertura = await procesoQueCubre(prisma, lotId);
  const desde =
    cobertura.estado === "abierto"
      ? (await prisma.lotProcess.findUniqueOrThrow({ where: { id: cobertura.vigente.id }, select: { startedAt: true } })).startedAt
      : null;
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
        where: {
          lotId: { in: [lotId, ...descendencia] },
          variable: "moisture",
          corrections: { none: {} },
          ...(desde === null ? {} : { occurredAt: { gte: desde } }),
        },
        orderBy: { occurredAt: "desc" },
        take: 20,
        include: { lot: { select: { lotCode: true } } },
      }),
    ),
  ]);

  const [grados, estados, motivos] = await Promise.all([
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_GRADO_PROCESO } },
      orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    }),
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_ESTADO_CEREZA } },
      orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    }),
    // Parte 1, R7: la lista de motivos de «devolver a secado».
    prisma.variableCatalogValue.findMany({
      where: { catalog: { key: CATALOGO_MOTIVO_DEVOLUCION } },
      orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
    }),
  ]);

  return {
    grados: grados.map((v) => ({ id: v.id, label: v.value })),
    estadosDeCereza: estados.map((v) => ({ id: v.id, label: v.value })),
    motivosDeDevolucion: motivos.map((v) => ({ id: v.id, label: v.value })),
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

const INCLUIR_PARA_PANTALLA = {
  processRecipeVersion: { include: { recipe: true } },
  processGradeValue: true,
  cherryStateValue: true,
  closingMoistureMeasurement: true,
  interventions: { orderBy: { occurredAt: "asc" as const }, include: { catalogValue: true, operator: true } },
  fermentationRuns: { orderBy: { startedAt: "asc" as const } },
  dryingRuns: { orderBy: { startedAt: "asc" as const } },
  lot: { select: { id: true, lotCode: true } },
} as const;

/**
 * Parte 1, R7 (tarea 9, 2026-10-02): lo que la ficha y la página del proceso enseñan — el proceso que CUBRE al lote, en
 * qué lote vive, su historia (`cadena`, del más cercano al más lejano) y, si es una mezcla, de qué está hecha. `paraEntrada`
 * es lo que la ficha pasa a `entradaDelLote`, por la MISMA función que usa el tablero (`procesosParaEntrada`).
 *
 * `recetaConVersion` es «Lavado · v1», o null en un proceso «Sin receta»: la ficha enseña eso y el formulario de
 * fermentación lo lee (R4). `etiqueta` sigue siendo el nombre a secas, que es por lo que agrupa el reporte.
 *
 * `listarProcesosDeLote` sigue existiendo: lista los procesos PROPIOS del lote, que es otra pregunta (y la usan las pruebas).
 * Lanza `lineage_too_deep` como el resolvedor: quien pinta lo atrapa y lo dice.
 *
 * **Permisos, proceso a proceso** (revisión final, ronda de arreglo 1, 2026-10-03; Codex y registro, línea 205). `view` sobre el
 * lote MIRADO no autoriza a ver los procesos que viven en OTROS lotes —un ancestro, las ramas de una mezcla—: quien ve sólo el
 * pergamino de la parcela B no ve la cereza de la parcela A. Cada lote dueño de un proceso se autoriza por SEPARADO
 * (`requireLotAccess` con varios candidatos autoriza si pasa cualquiera, así que se llama una vez por lote). Un proceso cuyo lote
 * dueño no se ve sale como `{ oculto: true, abierto }`: sólo que lo cubre un proceso de un lote que no puede ver y si está abierto
 * —sin código de lote, receta, intención, notas, intervenciones, operadores, corridas ni medición—. Decisión conservadora del
 * controlador (CLAUDE.md §10, «las asignaciones estrechan»), con la pregunta a Daniel de si abrirlo. Las COMPUERTAS no cambian:
 * deciden con `procesoQueCubre`, que no mira permisos. `paraEntrada` sigue llevando el grado del vigente al veredicto, como el
 * tablero y la lista de catas (va con la misma pregunta).
 */
export async function coberturaDelLote(userAccountId: string, lotId: string) {
  lotId = enMinusculas(lotId); // F5: ver `enMinusculas`.
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);

  const cobertura = await procesoQueCubre(prisma, lotId);
  const enCadena = cobertura.estado === "mezcla" ? cobertura.composicion.procesos : cobertura.cadena;
  // Los lotes dueños que quien mira puede VER, uno por uno. El propio lote ya se autorizó arriba.
  const duenos = await prisma.lot.findMany({
    where: { id: { in: [...new Set(enCadena.map((p) => p.lotId))] } },
    select: { id: true, projectId: true, locationId: true, classification: true },
  });
  const visibles = new Set<string>([lot.id]);
  for (const dueno of duenos) {
    if (dueno.id === lot.id) continue;
    try {
      await requireLotAccess(userAccountId, "view", [dueno]);
      visibles.add(dueno.id);
    } catch (error) {
      if (!(error instanceof TraceabilityAccessError)) throw error;
    }
  }
  const ids = enCadena.filter((p) => visibles.has(p.lotId)).map((p) => p.id);
  const filas = await prisma.lotProcess.findMany({ where: { id: { in: ids } }, include: INCLUIR_PARA_PANTALLA });
  // La humedad de cierre que se enseña es la que la compuerta lee: la última corrección de la medición, si la tiene (revisión
  // final, ronda de arreglo 1, 2026-10-03). Si no, la página diría «cerró en el objetivo» de un lote que la compuerta rechaza, y
  // no ofrecería devolverlo a secado.
  const conCierre = await Promise.all(
    filas.map(async (p) => {
      const cierre = p.closingMoistureMeasurement === null ? null : (await lecturaVigente(prisma, p.closingMoistureMeasurement)).value.toNumber();
      return [p, cierre] as const;
    }),
  );
  const porId = new Map(
    conCierre.map(([p, cierre]) => [
      p.id,
      {
        ...p,
        etiqueta: p.processRecipeVersion?.recipe.name ?? SIN_RECETA,
        recetaConVersion: p.processRecipeVersion ? `${p.processRecipeVersion.recipe.name} · v${p.processRecipeVersion.version}` : null,
        humedadDeCierre: cierre,
        /** Negativo = cerró por debajo del objetivo. Null hasta que se cierra por humedad. */
        diferenciaContraObjetivo: cierre === null ? null : cierre - p.targetMoisturePct.toNumber(),
      },
    ]),
  );
  // De un proceso oculto sólo sale un hecho más, `bloqueadoAlEntrar`: cerrado por encima de su objetivo (la misma lectura que la
  // compuerta). Sin él, la página del proceso no podía decidir «bloqueado» y dejaba de ofrecer «Devolver a secado» a quien
  // gestiona ESTE lote, que el servicio sí acepta (residuo de la ronda de arreglo 1, 2026-10-03). Es lo que la compuerta le
  // diría al intentar mover a bodega; nada de su receta, su lote ni su medición.
  const bloqueadoOculto = new Map<string, boolean>();
  // Por los ids de procesos ya resueltos, no por lote (el guardia `proceso-por-el-resolvedor` lee el `where`).
  const idsOcultos = enCadena.filter((p) => !visibles.has(p.lotId)).map((p) => p.id);
  const ocultos = await prisma.lotProcess.findMany({
    where: { id: { in: idsOcultos }, endedAt: { not: null } },
    select: { id: true, targetMoisturePct: true, closingMoistureMeasurement: true },
  });
  for (const p of ocultos) {
    if (p.closingMoistureMeasurement === null) continue;
    const cierre = (await lecturaVigente(prisma, p.closingMoistureMeasurement)).value.toNumber();
    bloqueadoOculto.set(p.id, cierre > p.targetMoisturePct.toNumber());
  }
  const presentar = (p: { id: string; lotId: string; endedAt: Date | null; origen: OrigenDelProceso; profundidad: number }) =>
    visibles.has(p.lotId)
      ? { oculto: false as const, ...porId.get(p.id)!, origen: p.origen, profundidad: p.profundidad }
      : { oculto: true as const, abierto: p.endedAt === null, bloqueadoAlEntrar: bloqueadoOculto.get(p.id) ?? false };

  return {
    estado: cobertura.estado,
    vigente: cobertura.vigente ? presentar(cobertura.vigente) : null,
    cadena: cobertura.cadena.map(presentar),
    composicion:
      cobertura.estado === "mezcla"
        ? { procesos: cobertura.composicion.procesos.map(presentar), ramaSinProceso: cobertura.composicion.ramaSinProceso }
        : null,
    paraEntrada: await procesosParaEntrada(prisma, lotId),
  };
}

export type CoberturaDelLote = Awaited<ReturnType<typeof coberturaDelLote>>;
/** Un proceso como lo pinta la pantalla: con su lote (`lot`), por qué existe (`origen`) y a cuántas generaciones vive; o, si
 *  vive en un lote que quien mira no puede ver, sólo eso y si está abierto (`oculto: true`). */
export type ProcesoDeLoteConLugar = CoberturaDelLote["cadena"][number];

/**
 * Los motivos por los que R2 no deja abrir un proceso: los códigos con que `exigeSinOtroProcesoAbierto` rechaza. Cada uno
 * tiene su frase (`processCannotOpen_<motivo>`, en es y en en), y lo vigila `bodegaConProceso.test.ts`: las claves son de
 * plantilla y ningún otro guardia las ve. Un código que no esté aquí no es un motivo que la pantalla sepa decir: el
 * predicado lo relanza, y la página lo trata como cualquier otro error del proceso.
 */
export const MOTIVOS_PARA_NO_ABRIR = [
  "process_already_open",
  "lote_dividido",
  "lote_mezclado",
  "descendiente_en_bodega",
  "lote_en_bodega",
  "proceso_no_aplica_a_miel",
  "lineage_too_deep",
  "lot_not_found",
] as const;
export type MotivoParaNoAbrir = (typeof MOTIVOS_PARA_NO_ABRIR)[number];
const esMotivoParaNoAbrir = (m: string): m is MotivoParaNoAbrir => (MOTIVOS_PARA_NO_ABRIR as readonly string[]).includes(m);

/**
 * Si R2 dejaría abrir un proceso en este lote, para no OFRECER lo que va a fallar. No escribe; el servidor vuelve a
 * comprobarlo al abrir (ocultar un botón no es autorizar). Pregunta lo MISMO que el servicio: `exigeSinOtroProcesoAbierto`.
 */
export async function puedeAbrirProceso(
  userAccountId: string,
  lotId: string,
): Promise<{ puede: true } | { puede: false; motivo: MotivoParaNoAbrir }> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);
  try {
    await exigeSinOtroProcesoAbierto(prisma, lotId);
    return { puede: true };
  } catch (error) {
    if (error instanceof LotProcessError && esMotivoParaNoAbrir(error.message)) return { puede: false, motivo: error.message };
    throw error;
  }
}

/**
 * Las frases con que la pantalla dice por qué no se abre un proceso: una por motivo, y una más para `lote_en_bodega` cuando el
 * lote SÍ se puede devolver a secado (tarea 9, ronda de arreglo 1). Cada una con su clave `processCannotOpen_<frase>`, en es y
 * en en; lo vigila `bodegaConProceso.test.ts`.
 */
export const FRASES_DE_NO_ABRIR = [...MOTIVOS_PARA_NO_ABRIR, "lote_en_bodega_se_puede_devolver"] as const;
export type FraseDeNoAbrir = (typeof FRASES_DE_NO_ABRIR)[number];

/**
 * Qué frase dice por qué no se abre un proceso (tarea 9, ronda de arreglo 1, 2026-10-02). En bodega, la frase sólo manda a
 * «Devolver a secado» si `puedeDevolverASecado` dijo que sí. En un lote guardado antes de la Parte 1 (R9, sin proceso) la
 * devolución no existe, y la página del proceso se contradecía: la frase de no abrir mandaba a devolver y la sección de
 * devolver decía que no había proceso que continuar. Quien no lo preguntó (`null`: la ficha, el formulario de fermentación)
 * recibe la frase que no promete ese camino.
 */
export function fraseDeNoAbrir(motivo: MotivoParaNoAbrir, puedeDevolver: { puede: boolean } | null): FraseDeNoAbrir {
  return motivo === "lote_en_bodega" && puedeDevolver?.puede === true ? "lote_en_bodega_se_puede_devolver" : motivo;
}

/**
 * Si quien mira puede usar los formularios del proceso —manejo, cierre, intención y objetivo— (tarea 9, ronda de arreglo 1,
 * 2026-10-02). Sus servicios (`registrarIntervencion`, `cerrarProceso`, `cambiarIntencion`, `cambiarObjetivoDeHumedad`) piden
 * `manage` sobre el lote DONDE VIVE el proceso (`loteGestionable` con `proceso.lotId`), y desde R1 ése puede ser un ancestro del
 * lote que se mira. La página los ofrecía con el permiso del lote que se mira: a quien gestiona sólo el hijo le ofrecía lo que
 * el servicio le rechaza. Pregunta lo MISMO que esos servicios, con la misma función. No escribe; ocultar no es autorizar.
 */
export async function puedeGestionarProceso(userAccountId: string, lotProcessId: string): Promise<boolean> {
  const proceso = await prisma.lotProcess.findUnique({ where: { id: lotProcessId }, select: { lotId: true } });
  if (!proceso) return false;
  try {
    await loteGestionable(userAccountId, proceso.lotId);
    return true;
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return false;
    throw error;
  }
}

/**
 * Los motivos por los que una corrida no empieza sobre un lote (R3, R6.6 y R7): los códigos con que `procesoParaUnaCorrida`
 * rechaza (revisión final, ronda de arreglo 1, 2026-10-03). Cada uno tiene su texto, `error_proceso_<motivo>`, en es y en
 * en (lo vigila `corridaConProceso.test.ts`); `sin_proceso_abierto` la pantalla lo trata aparte, porque ahí la frase depende
 * de si se puede abrir un proceso (`puedeAbrirProceso`).
 */
export const MOTIVOS_PARA_NO_EMPEZAR = [
  "lote_dividido",
  "lote_en_bodega",
  "corrida_ya_abierta",
  "lote_consumido",
  "lote_mezclado",
  "sin_proceso_abierto",
  "lineage_too_deep",
] as const;
export type MotivoParaNoEmpezar = (typeof MOTIVOS_PARA_NO_EMPEZAR)[number];
const esMotivoParaNoEmpezar = (m: string): m is MotivoParaNoEmpezar => (MOTIVOS_PARA_NO_EMPEZAR as readonly string[]).includes(m);

/**
 * Si `startFermentationRun` y `startDryingRun` dejarían empezar una corrida sobre este lote, para no OFRECER lo que va a fallar
 * (revisión final, ronda de arreglo 1, 2026-10-03). Antes la ficha decidía con «hay un proceso abierto y no está en bodega» y
 * ofrecía empezar sobre la cereza ya consumida por su fermentación, o sobre un lote dividido cubierto por el reproceso de su
 * ancestro (menor M8), y la página de fermentación sólo miraba si el proceso estaba abierto.
 *
 * Pregunta LO MISMO que el servicio: `procesoParaUnaCorrida`, la función que `procesoAbiertoParaCorrida` corre después de
 * bloquear el linaje —aquí sin bloquear, porque sólo lee—. No escribe; el servidor vuelve a comprobarlo al empezar.
 */
export async function puedeEmpezarCorrida(
  userAccountId: string,
  lotId: string,
): Promise<{ puede: true } | { puede: false; motivo: MotivoParaNoEmpezar }> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);
  try {
    await procesoParaUnaCorrida(prisma, lot.id);
    return { puede: true };
  } catch (error) {
    if (error instanceof LotProcessError && esMotivoParaNoEmpezar(error.message)) return { puede: false, motivo: error.message };
    throw error;
  }
}

/**
 * Los motivos por los que `devolverASecado` rechaza un lote antes de mirar lo que trae el formulario (motivo, nota y fecha):
 * los de `procesoQueDevolver` y los de R2 al abrir la continuación. Cada uno con su frase (`processCannotReturn_<motivo>`).
 */
export const MOTIVOS_PARA_NO_DEVOLVER = [
  "process_not_found",
  "process_already_open",
  "lote_dividido",
  "lote_mezclado",
  "descendiente_en_bodega",
  "proceso_no_aplica_a_miel",
  "lineage_too_deep",
  "lot_not_found",
] as const;
export type MotivoParaNoDevolver = (typeof MOTIVOS_PARA_NO_DEVOLVER)[number];
const esMotivoParaNoDevolver = (m: string): m is MotivoParaNoDevolver => (MOTIVOS_PARA_NO_DEVOLVER as readonly string[]).includes(m);

/**
 * Si `devolverASecado` aceptaría este lote, para que la página ofrezca el formulario SÓLO donde el servicio lo acepta
 * (tarea 9, 2026-10-02). Antes se ofrecía en todo lote en bodega, también donde la devolución siempre falla: un lote guardado
 * sin proceso (`process_not_found`), una mezcla, un dividido, uno cuyo proceso sigue abierto.
 *
 * Imita al servicio paso por paso, sin escribir:
 * 1. `procesoQueDevolver`, la MISMA función que la devolución corre antes de escribir;
 * 2. R2 tal como la aplica la devolución: con la bodega YA terminada. `exigeSinOtroProcesoAbierto` mira la bodega del PROPIO
 *    lote lo ÚLTIMO, así que un `lote_en_bodega` dice que todo lo anterior pasó —y la devolución termina esa bodega antes de
 *    abrir—. Si algún día esa comprobación se mueve antes, `bodegaConProceso.test.ts` («…con un DESCENDIENTE con su proceso
 *    abierto…») cae. La bodega de un DESCENDIENTE (`descendiente_en_bodega`, decisión de Daniel del 2026-10-02) va antes, y
 *    la devolución no la termina: es un motivo más.
 *
 * No mira lo que trae el formulario —el motivo, la nota, la fecha—: eso lo rechaza el servicio con su frase al enviar.
 */
export async function puedeDevolverASecado(
  userAccountId: string,
  lotId: string,
): Promise<{ puede: true } | { puede: false; motivo: MotivoParaNoDevolver }> {
  const lot = await prisma.lot.findUnique({ where: { id: lotId } });
  if (!lot) throw new LotProcessError("lot_not_found");
  await requireLotAccess(userAccountId, "view", [lot]);
  try {
    await procesoQueDevolver(prisma, lotId);
    try {
      await exigeSinOtroProcesoAbierto(prisma, lotId);
    } catch (error) {
      if (!(error instanceof LotProcessError && error.message === "lote_en_bodega")) throw error;
    }
    return { puede: true };
  } catch (error) {
    if (error instanceof LotProcessError && esMotivoParaNoDevolver(error.message)) return { puede: false, motivo: error.message };
    throw error;
  }
}
