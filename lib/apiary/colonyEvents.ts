/**
 * Ticket A2 — REVISED (docs/implementation/22_APIARY_V1_SCOPING_REPORT.md
 * §1a, §3). feeding/treatment/passing_observation share one
 * type-discriminated table — none of the three carries Inspection's
 * evidentiary claim, so mixing them here (but never with Inspection
 * itself) is safe. Same shape as FermentationIntervention/DryingTurnEvent/
 * QuantityEvent elsewhere in this schema.
 *
 * RBAC resolves via the parent Colony's own Hive, same as ./inspections.
 */
import { prisma } from "../db";
import { ApiaryAccessError, requireApiaryAccess, requireColonyEventWriteAccess } from "./hives";
import { recordAuditEvent } from "../audit";
import { exigeMetodoDeAlimentacion } from "./alimentacion";
import { exigeMaterialDeAlimentacion } from "./vocabularioDeAlimentacion";
import { exigeObjetivo, exigeVia } from "./objetivoDelTratamiento";
import { ligarAVisitaAbierta } from "../traceability/visitaAbierta";
import { estadoDeVencimiento } from "../inventario/vencimiento";
import { diaDeHoy } from "../time/diaDeHoy";
import { can } from "../rbac/service";
import type { ColonyEventType, ProvenanceClass } from "../../generated/prisma/client";

export class ColonyEventValidationError extends Error {}

async function resolveColonyScope(colonyId: string) {
  const colony = await prisma.colony.findUnique({ where: { id: colonyId }, include: { hive: true } });
  if (!colony) throw new ApiaryAccessError("colony_not_found");
  return { projectId: colony.hive.projectId, locationId: colony.hive.locationId };
}

export interface RecordColonyEventInput {
  colonyId: string;
  eventType: ColonyEventType;
  occurredAt?: Date;
  operatorPersonId?: string | null;
  /** Del vocabulario del dueno (ADR-148). `otro` obliga a decir cual en `feedingMaterial`. */
  feedingMaterialKind?: string | null;
  feedingMaterial?: string | null;
  feedingQuantity?: number | null;
  feedingUnit?: string | null;
  /**
   * Sólo tiene sentido en `feeding`: hasta cuándo alcanza lo dejado, estimado por
   * quien alimenta. **Campo de DÍA**, medianoche UTC.
   *
   * **Sigue sin ser obligatoria aquí, y la razón original se mantiene:** las
   * alimentaciones de urgencia se registran sin saberlo, y la obligatoriedad vive
   * en el protocolo A9.4 (`coverage_until`, `"required": true`), donde el dueño la
   * cambia sin tocar código. El formulario la exige para guardar, que es donde esa
   * exigencia no cuesta un dato perdido.
   *
   * **Lo que se añadió el 2026-09-13 es la otra mitad:** que su ausencia se VEA.
   * `alcanceDelAlimento` devuelve esa colonia como `sin_fecha` en vez de contarla
   * entre las tranquilas. Es el mismo trato que el dueño eligió para la carencia
   * en ADR-115 —«avisa y registra igual»—: impedir el registro no devuelve la miel
   * al panal, y esconder el hueco es cómo se repite Toabré.
   */
  coverageUntil?: Date | null;
  /**
   * Cómo se dejó el alimento. Anexo B §3, opcional. Llega como CADENA del
   * formulario y de la cola, y se valida abajo: un `as never` dejaría entrar
   * cualquier valor del enum (ADR-112).
   */
  feedingMethod?: string | null;
  treatmentProduct?: string | null;
  // Required whenever eventType = treatment (§1a) — enforced below, not by
  // the DB column, same shape as recordMaterialConsumptionEntry's own
  // batchLabel requiredness (T12.6).
  treatmentBatchLabel?: string | null;
  /**
   * Días de carencia del producto. **Obligatorio cuando `eventType =
   * treatment`**, como el lote: el Anexo B §4 lo marca así y dice por qué —sin
   * él una cosecha puede violar la carencia sin que el sistema lo sepa—.
   */
  treatmentWithdrawalDays?: number | null;
  treatmentDose?: number | null;
  treatmentDoseUnit?: string | null;
  /**
   * El frasco del botiquín del que salió la dosis — botiquín, Tarea 7. **Opcional
   * para siempre**: obligar a elegir frasco convertiría un registro legalmente
   * exigido en un trámite que se esquiva. Sólo en `treatment`. Con dosis, se
   * descuenta del frasco en la misma transacción.
   */
  consumableLotId?: string | null;
  /**
   * Contra qué. **Obligatorio cuando `eventType = treatment`**, como el lote y la
   * carencia: el Anexo B §4 lo marca así y dice por qué —*«eficacia por objetivo;
   * hoy no se puede agrupar»*—. Llega como CADENA y se valida abajo.
   */
  treatmentTarget?: string | null;
  /** Cómo se aplicó. Opcional. Cadena, validada abajo. */
  treatmentRoute?: string | null;
  note?: string | null;
  // A5/A0 (25_OFFLINE_OPTIONS_ANALYSIS.md §0) — same idempotent-sync
  // purpose as RecordInspectionInput.clientDraftId.
  clientDraftId?: string | null;
}

/**
 * §1a's own framing, mapped onto ProvenanceClass values that already
 * exist: feeding/treatment are a record of an action taken
 * (`original_record`); passing_observation is a state fact, witnessed
 * (`direct_observation`). Not caller-supplied — fixed here, at the action
 * layer, per eventType, same non-operator-selectable discipline every
 * other fixed provenanceClass in this codebase already follows.
 */
function provenanceClassFor(eventType: ColonyEventType): ProvenanceClass {
  switch (eventType) {
    case "feeding":
    case "treatment":
      return "original_record";
    case "passing_observation":
    case "other":
      return "direct_observation";
  }
}

/**
 * Las reglas del evento, en un solo sitio, porque ahora hay DOS puertas.
 *
 * Se extrajo tal cual al construir el registro en lote (ADR-136): duplicarlas habría hecho
 * que una regla añadida después valiera para una puerta y no para la otra — que es
 * exactamente cómo la invariante de la colocación se aplicó en un guion y se olvidó en el
 * siguiente. Devuelve los tres campos ya normalizados; no toca la base.
 */
export function normalizarEventoDeColonia(
  input: Pick<
    RecordColonyEventInput,
    | "eventType"
    | "treatmentBatchLabel"
    | "treatmentWithdrawalDays"
    | "treatmentTarget"
    | "treatmentRoute"
    | "feedingMethod"
    | "feedingMaterialKind"
    | "feedingMaterial"
  >,
) {
  if (input.eventType === "treatment" && !input.treatmentBatchLabel?.trim()) {
    throw new ColonyEventValidationError("treatment_batch_label_required");
  }

  // La carencia, con la misma fuerza que el lote. Se comprueba `== null` y no
  // la verdad del número: **cero es un valor legítimo** —hay productos sin
  // carencia— y un `!input.treatmentWithdrawalDays` lo habría rechazado,
  // obligando a mentir poniendo un 1.
  if (input.eventType === "treatment" && input.treatmentWithdrawalDays == null) {
    throw new ColonyEventValidationError("treatment_withdrawal_days_required");
  }
  if (input.treatmentWithdrawalDays != null && (!Number.isInteger(input.treatmentWithdrawalDays) || input.treatmentWithdrawalDays < 0)) {
    throw new ColonyEventValidationError("treatment_withdrawal_days_invalid");
  }

  // El objetivo, con la misma fuerza que el lote y la carencia. Sin él, la
  // pregunta que el Anexo pide contestar —qué se trató contra varroa esta
  // temporada— no tiene respuesta, y una fila sin objetivo la deja sin responder
  // para siempre: nadie va a volver a preguntarle al que aplicó.
  if (input.eventType === "treatment" && (input.treatmentTarget == null || input.treatmentTarget === "")) {
    throw new ColonyEventValidationError("treatment_target_required");
  }
  const treatmentTarget =
    input.treatmentTarget == null || input.treatmentTarget === "" ? null : exigeObjetivo(input.treatmentTarget);
  const treatmentRoute =
    input.treatmentRoute == null || input.treatmentRoute === "" ? null : exigeVia(input.treatmentRoute);
  // Y ninguno de los dos tiene sentido fuera de un tratamiento: una alimentación
  // «contra varroa» sería un dato que nadie podría leer.
  if ((treatmentTarget !== null || treatmentRoute !== null) && input.eventType !== "treatment") {
    throw new ColonyEventValidationError("objetivo_o_via_solo_en_tratamiento");
  }

  // El método, validado en la frontera. Y sólo tiene sentido alimentando: un
  // tratamiento con «bolsa sobre cabezales» es un dato que nadie podría leer.
  const feedingMethod =
    input.feedingMethod == null || input.feedingMethod === ""
      ? null
      : exigeMetodoDeAlimentacion(input.feedingMethod);
  if (feedingMethod !== null && input.eventType !== "feeding") {
    throw new ColonyEventValidationError("feeding_method_solo_en_alimentacion");
  }

  // CON QUÉ, del vocabulario del dueño (ADR-148). Se validan los DOS campos juntos porque la
  // regla es sobre el par: «otro» obliga a decir cuál, y eso no se ve mirando ninguno solo.
  const { kind: feedingMaterialKind, cual: feedingMaterial } = exigeMaterialDeAlimentacion(
    input.feedingMaterialKind,
    input.feedingMaterial,
  );
  // Mismo razonamiento que el método y que el objetivo: un tratamiento «con melaza» es un dato
  // que nadie podría leer. El TEXTO no se restringe igual --`feedingMaterial` lleva desde antes
  // del vocabulario lo que se escribiera a mano, y en un tratamiento eso no existe-- pero el
  // vocabulario nuevo sí, porque es nuestro desde hoy y puede nacer limpio.
  if (feedingMaterialKind !== null && input.eventType !== "feeding") {
    throw new ColonyEventValidationError("feeding_material_solo_en_alimentacion");
  }

  return { treatmentTarget, treatmentRoute, feedingMethod, feedingMaterialKind, feedingMaterial };
}

export async function recordColonyEvent(userAccountId: string, input: RecordColonyEventInput) {
  const { treatmentTarget, treatmentRoute, feedingMethod, feedingMaterialKind, feedingMaterial } = normalizarEventoDeColonia(input);

  const scope = await resolveColonyScope(input.colonyId);
  await requireColonyEventWriteAccess(userAccountId, [scope]);

  if (input.clientDraftId) {
    const existing = await prisma.colonyEvent.findUnique({ where: { clientDraftId: input.clientDraftId } });
    if (existing) return existing;
  }

  if (input.consumableLotId && input.eventType !== "treatment") {
    throw new ColonyEventValidationError("consumable_lot_only_for_treatment");
  }
  if (input.consumableLotId) {
    // Un id malformado haría fallar a Prisma con un error que la cola de campo
    // trataría como avería y reintentaría para siempre; esto es un dato malo.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.consumableLotId)) {
      throw new ColonyEventValidationError("consumable_lot_not_found");
    }
    // Descontar es escribir en el libro del frasco: la misma compuerta que
    // `registrarConsumo`, sobre el sitio del frasco. Registrar el evento en la
    // colmena no da permiso sobre el botiquín de otro.
    const frasco = await prisma.consumableLot.findUnique({ where: { id: input.consumableLotId }, select: { locationId: true } });
    if (!frasco) throw new ColonyEventValidationError("consumable_lot_not_found");
    const objetivo = frasco.locationId
      ? ({ scopeType: "location", scopeRefId: frasco.locationId } as const)
      : ({ scopeType: "platform", scopeRefId: null } as const);
    if (!(await can(userAccountId, "manage", "lot", objetivo, "internal"))) {
      throw new ApiaryAccessError("forbidden");
    }
  }

  const colonyEvent = await prisma.$transaction(async (tx) => {
    const occurredAt = input.occurredAt ?? new Date();

    // ¿Vencido el día de la aplicación? Avisa, no bloquea: se aplica igual y la
    // marca queda en el evento. El día se cuenta en la zona del sitio, y sin
    // fecha en el frasco la marca queda en nulo — lo desconocido no es vigente.
    let treatmentLotExpiredAtApplication: boolean | null = null;
    if (input.consumableLotId) {
      const frasco = await tx.consumableLot.findUnique({
        where: { id: input.consumableLotId },
        select: { expiresAt: true },
      });
      if (!frasco) throw new ColonyEventValidationError("consumable_lot_not_found");
      const sitio = await tx.location.findUnique({ where: { id: scope.locationId }, select: { timezone: true } });
      const estado = estadoDeVencimiento({
        expiresAt: frasco.expiresAt,
        avisarDiasAntes: null,
        hoy: diaDeHoy(occurredAt, sitio?.timezone ?? null),
      });
      treatmentLotExpiredAtApplication = estado.estado === "SIN_FECHA" ? null : estado.estado === "VENCIDO";

      // **El descuento, en la MISMA transacción**, con la misma comprobación de
      // unidad que el consumo (`recordMaterialConsumptionEntry`): un tratamiento
      // guardado sin su descuento sería medicamento aplicado que el inventario no
      // vio. Sin dosis no se descuenta: el enlace dice DE QUÉ frasco, no cuánto.
      if (input.treatmentDose != null) {
        const unidad = (input.treatmentDoseUnit ?? "").trim();
        if (!unidad) throw new ColonyEventValidationError("unidad requerida para descontar del frasco");
        const previo = await tx.consumableStockEvent.findFirst({
          where: { consumableLotId: input.consumableLotId },
          select: { unit: true },
        });
        if (previo && previo.unit !== unidad) {
          throw new ColonyEventValidationError(
            `unidad distinta: el frasco va en ${previo.unit} y la dosis viene en ${unidad}`,
          );
        }
        await tx.consumableStockEvent.create({
          data: {
            consumableLotId: input.consumableLotId,
            eventType: "consumed",
            quantity: input.treatmentDose,
            unit: unidad,
            occurredAt,
            provenanceClass: provenanceClassFor(input.eventType),
            createdBy: userAccountId,
          },
        });
      }
    }

    const colonyEvent = await tx.colonyEvent.create({
      data: {
        colonyId: input.colonyId,
        eventType: input.eventType,
        occurredAt,
        operatorPersonId: input.operatorPersonId ?? null,
        feedingMaterialKind,
        feedingMaterial,
        feedingQuantity: input.feedingQuantity ?? null,
        feedingUnit: input.feedingUnit ?? null,
        coverageUntil: input.eventType === "feeding" ? (input.coverageUntil ?? null) : null,
        feedingMethod,
        treatmentTarget,
        treatmentRoute,
        treatmentProduct: input.treatmentProduct ?? null,
        treatmentBatchLabel: input.treatmentBatchLabel?.trim() ?? null,
        treatmentWithdrawalDays: input.treatmentWithdrawalDays ?? null,
        treatmentDose: input.treatmentDose ?? null,
        treatmentDoseUnit: input.treatmentDoseUnit ?? null,
        consumableLotId: input.consumableLotId ?? null,
        treatmentLotExpiredAtApplication,
        note: input.note ?? null,
        provenanceClass: provenanceClassFor(input.eventType),
        clientDraftId: input.clientDraftId ?? null,
        createdBy: userAccountId,
      },
    });

    // C1 §3: evidentiary write. Not reached on the clientDraftId idempotent
    // no-op path above, same reasoning as recordInspection.
    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "colony_event.create",
        entityType: "colony_event",
        entityId: colonyEvent.id,
        after: colonyEvent,
        sourceInterface: "apiary.service",
      },
      tx,
    );

    // A9.2 — ver la cabecera de `visitaAbierta.ts`.
    await ligarAVisitaAbierta(tx, {
      userAccountId,
      locationId: scope.locationId,
      occurredAt: colonyEvent.occurredAt,
      provenanceClass: colonyEvent.provenanceClass,
      sujeto: { colonyEventId: colonyEvent.id },
    });

    return colonyEvent;
  });

  return colonyEvent;
}

export async function listColonyEventsForColony(userAccountId: string, colonyId: string) {
  const scope = await resolveColonyScope(colonyId);
  await requireApiaryAccess(userAccountId, "view", [scope]);

  return prisma.colonyEvent.findMany({ where: { colonyId }, include: { assets: true }, orderBy: { occurredAt: "desc" } });
}

/**
 * El mismo manejo, aplicado a varias colmenas de una vez.
 *
 * **Por qué existe, y en boca del dueño:** *«cuando entro a apiario poder seleccionar todas
 * las colmenas para aplicar que se hizo algo que hice igual a todas, y no tener que hacer
 * siempre una por una»*. En Toabré una alimentación es una bolsa de jarabe sobre los
 * cabezales de cada caja en la misma vuelta; un tratamiento de varroa se aplica al apiario,
 * porque el ácaro no respeta cajas.
 *
 * ## Por qué SÓLO `feeding` y `treatment`, y la línea no es de gusto
 *
 * El esquema ya la traza: `provenanceClassFor` da **`original_record`** a esos dos y
 * **`direct_observation`** a `passing_observation` y `other`. Un registro original de algo
 * que **hiciste** en diez cajas son diez registros ciertos; una observación directa de diez
 * cajas sacada de una sola mirada no lo es. Por eso una inspección nunca entra aquí —el
 * Anexo E §4 la marca «(por colmena)», y cuadros cubiertos, reina vista o patrón de cría son
 * hechos de UNA colonia—, y por eso los otros dos tipos quedan fuera hasta que el dueño diga
 * qué significa hacerlos en grupo.
 *
 * ## Y además sale MÁS correcto que una por una
 *
 * Los dos guardan la fecha que dispara un aviso: `coverageUntil` —hasta cuándo alcanza el
 * alimento— y la carencia del tratamiento. Tecleadas diez veces se desvían, y diez cajas que
 * recibieron el mismo jarabe el mismo día empiezan a avisar en fechas distintas. Lo mismo con
 * `treatmentBatchLabel`: un dedazo en una de diez rompe el agrupado por objetivo.
 *
 * ## Lo que NO se relaja por ser en lote
 *
 * Una fila por colonia, no una fila por lote: la carencia y las alertas se calculan por
 * colonia, y el día que trates 8 de 10 el registro tiene que decir 8. Un `AuditEvent` por
 * fila, como hace `trasladarColmenas`. Y `ligarAVisitaAbierta` por fila, para que la jornada
 * abierta las recoja todas.
 */
export class EventoEnLoteInvalido extends Error {
  constructor(
    message: string,
    /** Los identificadores concretos que lo provocaron, para que el mensaje nombre cuáles. */
    readonly detalles: string[] = [],
  ) {
    super(message);
  }
}

export interface EventoEnLoteInput
  // `consumableLotId` fuera: una dosis por colmena contra UN frasco es otro
  // cálculo, y aceptarlo aquí para ignorarlo sería perder el dato en silencio.
  extends Omit<RecordColonyEventInput, "colonyId" | "clientDraftId" | "consumableLotId"> {
  /** Las colonias a las que se aplicó. Vacío es un error, no un no-op silencioso. */
  colonyIds: readonly string[];
  /**
   * La clave de reintento del LOTE. De ella sale una por fila —`<lote>:<colonia>`—, y sin
   * ella un «sincronizar» repetido sin señal escribiría unas dos veces y otras ninguna.
   */
  loteDeClienteId?: string | null;
}

export async function registrarEventoEnLote(userAccountId: string, input: EventoEnLoteInput) {
  if (input.eventType !== "feeding" && input.eventType !== "treatment") {
    throw new EventoEnLoteInvalido("tipo_no_admite_lote", [input.eventType]);
  }

  const colonyIds = [...new Set(input.colonyIds)];
  if (colonyIds.length === 0) throw new EventoEnLoteInvalido("sin_colmenas");

  const { treatmentTarget, treatmentRoute, feedingMethod, feedingMaterialKind, feedingMaterial } = normalizarEventoDeColonia(input);

  const colonias = await prisma.colony.findMany({
    where: { id: { in: colonyIds } },
    select: {
      id: true,
      status: true,
      endedAt: true,
      hive: { select: { id: true, identifier: true, projectId: true, locationId: true } },
    },
  });

  const faltan = colonyIds.filter((id) => !colonias.some((c) => c.id === id));
  if (faltan.length > 0) throw new EventoEnLoteInvalido("colonia_no_encontrada", faltan);

  // **Una colonia muerta no recibe jarabe.** Registrarlo sería escribir un manejo sobre una
  // caja vacía, y el módulo ya tiene doce de ésas entre Finca Rosina y Toabré Finca 1.
  const noVivas = colonias.filter((c) => c.endedAt !== null || c.status !== "active");
  if (noVivas.length > 0) {
    throw new EventoEnLoteInvalido("colonia_no_viva", noVivas.map((c) => c.hive.identifier));
  }

  // **Un lote es de UN sitio.** No porque la base lo impida, sino porque el formulario lo
  // ofrece desde la ficha de un apiario: aceptar colmenas de dos sitios haría que el mismo
  // lote afirmara una vuelta que nadie dio.
  const sitios = [...new Set(colonias.map((c) => c.hive.locationId))];
  if (sitios.length > 1) throw new EventoEnLoteInvalido("colmenas_de_varios_sitios", sitios);
  const locationId = sitios[0]!;

  // Se autoriza con TODOS los ámbitos concretos en juego: las colmenas de un mismo apiario
  // pueden colgar de proyectos distintos, y pasar sólo uno rechazaría el caso normal. Es el
  // mismo arreglo que ADR-126 necesitó en el traslado.
  const candidatos = [...new Map(
    colonias.map((c) => [`${c.hive.projectId ?? ""}|${c.hive.locationId}`, { projectId: c.hive.projectId, locationId: c.hive.locationId }]),
  ).values()];
  await requireColonyEventWriteAccess(userAccountId, candidatos);

  const claveDe = (colonyId: string) =>
    input.loteDeClienteId ? `${input.loteDeClienteId}:${colonyId}` : null;

  // Idempotencia: lo ya escrito por un intento anterior no se vuelve a escribir ni se cuenta
  // como nuevo. Se dice cuántas estaban, en vez de callarlo.
  const claves = colonyIds.map(claveDe).filter((c): c is string => c !== null);
  const yaEscritas = claves.length
    ? await prisma.colonyEvent.findMany({ where: { clientDraftId: { in: claves } }, select: { clientDraftId: true } })
    : [];
  const yaEstan = new Set(yaEscritas.map((e) => e.clientDraftId));
  const pendientes = colonias.filter((c) => !yaEstan.has(claveDe(c.id)));

  const occurredAt = input.occurredAt ?? new Date();
  const provenanceClass = provenanceClassFor(input.eventType);

  const escritos = await prisma.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const colonia of pendientes) {
      const colonyEvent = await tx.colonyEvent.create({
        data: {
          colonyId: colonia.id,
          eventType: input.eventType,
          occurredAt,
          operatorPersonId: input.operatorPersonId ?? null,
          feedingMaterialKind,
          feedingMaterial,
          feedingQuantity: input.feedingQuantity ?? null,
          feedingUnit: input.feedingUnit ?? null,
          coverageUntil: input.eventType === "feeding" ? (input.coverageUntil ?? null) : null,
          feedingMethod,
          treatmentTarget,
          treatmentRoute,
          treatmentProduct: input.treatmentProduct ?? null,
          treatmentBatchLabel: input.treatmentBatchLabel?.trim() ?? null,
          treatmentWithdrawalDays: input.treatmentWithdrawalDays ?? null,
          treatmentDose: input.treatmentDose ?? null,
          treatmentDoseUnit: input.treatmentDoseUnit ?? null,
          note: input.note ?? null,
          provenanceClass,
          clientDraftId: claveDe(colonia.id),
          createdBy: userAccountId,
        },
      });
      ids.push(colonyEvent.id);

      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "colony_event.create",
          entityType: "colony_event",
          entityId: colonyEvent.id,
          after: colonyEvent,
          reason: `Aplicado en lote a ${pendientes.length} colmena(s) del sitio.`,
          sourceInterface: "apiary.service",
        },
        tx,
      );

      await ligarAVisitaAbierta(tx, {
        userAccountId,
        locationId,
        occurredAt,
        provenanceClass,
        sujeto: { colonyEventId: colonyEvent.id },
      });
    }
    return ids;
  });

  return {
    locationId,
    colonyEventIds: escritos,
    escritos: escritos.length,
    /** Las que ya había escrito un intento anterior con la misma clave de lote. */
    yaEstaban: colonias.length - pendientes.length,
    colmenas: colonias.map((c) => c.hive.identifier),
  };
}
