/**
 * Completar un tratamiento después, y corregirlo si hace falta. **Son dos cosas
 * distintas y el servicio las trata distinto.**
 *
 * **Qué cierra.** `PENDING_IMPLEMENTATIONS/011`: medido el 2026-09-13,
 * `lib/apiary/` **no tenía una sola función de actualización**. Un `ColonyEvent` se
 * escribía una vez y no había forma auditada de completarlo, así que los dos campos
 * de etapa **cierre** del Anexo B §4 —«fecha de retiro» y «eficacia observada»— no
 * se podían añadir sin crear una columna que nadie pudiera rellenar. Eso ya costó
 * una semana con `coverage_until` (ADR-118), y no se repite.
 *
 * ## La distinción, que es el diseño entero
 *
 * **Completar** es escribir por primera vez un hecho que *siempre* iba a llegar
 * después: las tiras se retiran semanas después de ponerlas. No es una corrección,
 * no hay nada que enmendar, y **no lleva razón ni plazo** — pedirlos convertiría el
 * curso normal del trabajo en una excepción que hay que justificar.
 *
 * **Corregir** es cambiar algo ya escrito. Ahí sí: **razón obligatoria**, y el valor
 * anterior queda en `before` del `AuditEvent`, que es lo que `leerEnmiendas` ya sabe
 * leer sin cambiarle nada.
 *
 * Es la misma política que `completarVisita` dejó escrita en trazabilidad —*«un
 * valor de etapa `field` no se edita desde el cierre; se enmienda escribiendo el
 * nuevo con su razón, y el original queda en `before`»*— y el mismo vocabulario:
 * `sourceInterface = "apiary.close"` frente a `"apiary.service"`, para que **«se
 * capturó en el campo» y «se completó en la casa» se distingan leyendo la fila**.
 *
 * ## Lo que NO deja tocar, y por qué
 *
 * Sólo los dos campos de cierre. El producto, el lote, la dosis, la carencia y el
 * objetivo se capturaron con la caja abierta y **no se editan desde aquí**: si
 * estuvieran mal, lo que corresponde es un evento nuevo con su razón, no
 * reescribir la evidencia de lo que se hizo aquel día. `CLAUDE.md` §49 lo pone en
 * su lista: no mutar registros científicos en silencio.
 */
import { prisma } from "../db";
import { requireApiaryAccess, ApiaryAccessError } from "./hives";
import { recordAuditEvent } from "../audit";
import { VIAS_QUE_DEJAN_MATERIAL } from "./vocabularioDeTratamiento";

/** Una entrada que el cierre rechaza. */
export class CierreInvalido extends Error {}

export interface CompletarCierreInput {
  colonyEventId: string;
  /** Día en que se retiró lo que quedaba dentro. Medianoche UTC. */
  removalDate?: Date | null;
  /** Qué se observó después. Prosa; el dato medible vive en `VarroaCount`. */
  efficacyNote?: string | null;
  /**
   * Obligatoria **sólo si se cambia un valor ya escrito**. Completar un hueco no
   * la lleva: el retiro siempre iba a anotarse después.
   */
  reason?: string | null;
}

/**
 * Completa —o corrige— el cierre de un tratamiento.
 *
 * Devuelve la fila y **si fue corrección**, que es lo que la pantalla necesita para
 * decir lo que pasó sin volver a deducirlo.
 */
export async function completarCierreDeTratamiento(userAccountId: string, input: CompletarCierreInput) {
  const evento = await prisma.colonyEvent.findUnique({
    where: { id: input.colonyEventId },
    include: { colony: { include: { hive: true } } },
  });
  if (!evento) throw new ApiaryAccessError("colony_event_not_found");
  await requireApiaryAccess(userAccountId, "manage", [
    { projectId: evento.colony.hive.projectId, locationId: evento.colony.hive.locationId },
  ]);

  // Sólo un tratamiento tiene cierre. Una alimentación no se «retira».
  if (evento.eventType !== "treatment") throw new CierreInvalido("no_es_un_tratamiento");

  const tocaRetiro = input.removalDate !== undefined;
  const tocaNota = input.efficacyNote !== undefined;
  if (!tocaRetiro && !tocaNota) throw new CierreInvalido("nada_que_completar");

  // La fecha de retiro no puede ser ANTERIOR a la aplicación: retirar algo antes de
  // ponerlo no es un dato, es un dedazo. Se compara por día, porque `removalDate`
  // es un día y `occurredAt` un instante.
  if (input.removalDate) {
    const diaDeAplicacion = new Date(evento.occurredAt.toISOString().slice(0, 10));
    if (input.removalDate < diaDeAplicacion) throw new CierreInvalido("retiro_antes_de_aplicar");
  }

  // **Aquí está la distinción.** Cambiar algo ya escrito exige razón; rellenar un
  // hueco no. Se mira campo por campo: completar el retiro y a la vez corregir la
  // nota es una corrección, y pedirla entera es más honesto que decidir por el
  // primero que se mire.
  const corrigeRetiro = tocaRetiro && evento.treatmentRemovalDate !== null;
  const corrigeNota = tocaNota && evento.treatmentEfficacyNote !== null;
  const esCorreccion = corrigeRetiro || corrigeNota;
  if (esCorreccion && !input.reason?.trim()) throw new CierreInvalido("razon_requerida_para_corregir");

  const despues = await prisma.$transaction(async (tx) => {
    const fila = await tx.colonyEvent.update({
      where: { id: input.colonyEventId },
      data: {
        ...(tocaRetiro ? { treatmentRemovalDate: input.removalDate ?? null } : {}),
        ...(tocaNota ? { treatmentEfficacyNote: input.efficacyNote?.trim() || null } : {}),
      },
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        // Dos operaciones y no una: quien lea el rastro necesita distinguir
        // «se completó lo que faltaba» de «se cambió lo que había».
        operation: esCorreccion ? "colony_event.correct" : "colony_event.close",
        entityType: "colony_event",
        entityId: fila.id,
        before: evento,
        after: fila,
        // `recordAuditEvent` acepta `string | undefined`, no `null`: ausente es
        // ausente, y un `null` explícito diría «se dejó vacío a propósito».
        reason: input.reason?.trim() || undefined,
        // La columna que hace legible el rastro: esto NO se capturó en el campo.
        sourceInterface: "apiary.close",
      },
      tx,
    );
    return fila;
  });

  return { evento: despues, esCorreccion };
}

export interface RetiroPendiente {
  colonyEventId: string;
  colonyId: string;
  hiveIdentifier: string;
  /** Cuándo se aplicó. */
  occurredAt: Date;
  product: string | null;
  /** Días desde la aplicación, hacia arriba. */
  diasDesde: number;
  /** Días de carencia que se declararon, si se declararon. */
  withdrawalDays: number | null;
}

/**
 * Los tratamientos de un sitio que **dejaron material dentro y nadie ha retirado**.
 *
 * *«Las tiras que no se retiran generan resistencia»* — el Anexo B §4. Tres
 * decisiones:
 *
 * **1. Sólo las vías que dejan material.** `VIAS_QUE_DEJAN_MATERIAL` contiene hoy
 * sólo `tira`, porque es lo único que el Anexo nombra; un goteo o un espolvoreo no
 * dejan nada que retirar, y meterlos llenaría el aviso de filas que no piden nada.
 * Si `cebo` debe entrar, es decisión del dueño y está anotada en ADR-119.
 *
 * **2. Una vía sin registrar NO entra.** `treatmentRoute` nulo significa que nadie
 * dijo cómo se aplicó, no que fuera una tira. Meterlo sería convertir una ausencia
 * en afirmación (ADR-080), y además llenaría el aviso de tratamientos viejos de
 * antes de que la columna existiera.
 *
 * **3. Espera a que pase la carencia.** Retirar una tira el día después de ponerla
 * no es lo que se pide; avisar antes de tiempo enseña a ignorar la sección. Cuando
 * no se declararon días de carencia, se usa la ventana que quien llama pase.
 *
 * **No autoriza y no pide principal**, misma disciplina que sus hermanas: quien
 * llama ya obtuvo el `locationId` de una lectura que sí autoriza.
 */
export async function retirosPendientes(
  locationId: string,
  ahora: Date = new Date(),
  diasMinimos = 14,
): Promise<RetiroPendiente[]> {
  const DIA = 24 * 60 * 60 * 1000;
  const tratamientos = await prisma.colonyEvent.findMany({
    where: {
      eventType: "treatment",
      treatmentRemovalDate: null,
      treatmentRoute: { in: [...VIAS_QUE_DEJAN_MATERIAL] },
      colony: { status: "active", hive: { locationId } },
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      colonyId: true,
      occurredAt: true,
      treatmentProduct: true,
      treatmentWithdrawalDays: true,
      colony: { select: { hive: { select: { identifier: true } } } },
    },
  });

  return tratamientos
    .map((t) => ({
      colonyEventId: t.id,
      colonyId: t.colonyId,
      hiveIdentifier: t.colony.hive.identifier,
      occurredAt: t.occurredAt,
      product: t.treatmentProduct,
      diasDesde: Math.ceil((ahora.getTime() - t.occurredAt.getTime()) / DIA),
      withdrawalDays: t.treatmentWithdrawalDays,
    }))
    // El umbral: la carencia declarada, o la ventana que pase quien llama.
    .filter((t) => t.diasDesde >= (t.withdrawalDays ?? diasMinimos))
    // Lo más viejo primero: lleva más tiempo dentro.
    .sort((a, b) => b.diasDesde - a.diasDesde);
}
