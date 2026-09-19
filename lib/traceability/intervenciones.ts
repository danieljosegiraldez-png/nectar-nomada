/**
 * Registrar y corregir una intervención fitosanitaria de parcela — Tarea 5 del
 * plan (spec 2026-09-18 §2). Servicio central: las tareas 6-8 leen lo que éste
 * escribe.
 *
 * Copia tres patrones ya probados en este repositorio:
 * - el descuento por línea es el de `lib/apiary/colonyEvents.ts` (vencimiento
 *   con `estadoDeVencimiento` + `diaDeHoy`, comprobación de unidad contra el
 *   primer `ConsumableStockEvent`, `consumed` dentro de la misma transacción);
 * - el permiso es el de `recordMaterialConsumptionEntry`
 *   (`lib/traceability/operations.ts`): `requireLotAccess` con padre
 *   `location`;
 * - la idempotencia de envío es `unaVezPorEnvio`, igual que jornales y consumo
 *   de material.
 *
 * **Nunca se edita en sitio.** Corregir escribe una fila nueva con
 * `correctsId` y `correctionReason`; la original queda intacta y no se corrige
 * lo ya corregido.
 */
import { prisma } from "../db";
import { unaVezPorEnvio } from "../envios/unaVezPorEnvio";
import { requireLotAccess, DEFAULT_NEW_RECORD_CLASSIFICATION, TraceabilityAccessError } from "./lots";
import { ubicacionesEmparentadas } from "./ubicacionesEmparentadas";
import { resolveOrganizationForLocation, LocationAccessError } from "./locations";
import { requireOpenFieldSessionForEvent, FieldSessionValidationError } from "./fieldSessions";
import type { IntervencionParaCarencia } from "./carenciaDeIntervencion";
import { estadoDeVencimiento } from "../inventario/vencimiento";
import { diaDeHoy } from "../time/diaDeHoy";
import { recordAuditEvent } from "../audit";
import { Prisma } from "../../generated/prisma/client";
import type {
  DataQuality,
  PlotIntervention,
  PlotInterventionKind,
  PlotInterventionMethod,
  PlotInterventionTarget,
} from "../../generated/prisma/client";

export class IntervencionValidationError extends Error {}

export interface LineaInput {
  readonly materialId: string;
  readonly consumableLotId?: string | null;
  readonly quantity?: number | null;
  readonly unit?: string | null;
  readonly withdrawalDays?: number | null;
  readonly reentryHours?: number | null;
}

export interface RegistrarIntervencionInput {
  readonly locationId: string;
  readonly kind: PlotInterventionKind;
  readonly target: PlotInterventionTarget;
  readonly targetNote?: string | null;
  readonly method?: PlotInterventionMethod | null;
  readonly mixVolume?: number | null;
  readonly mixUnit?: string | null;
  readonly occurredAt: Date;
  readonly operatorPersonId?: string | null;
  readonly fieldSessionId?: string | null;
  readonly motivoObservationId?: string | null;
  readonly specimenIds?: readonly string[];
  readonly plotBlockIds?: readonly string[];
  readonly lineas: readonly LineaInput[];
  readonly dataQuality?: DataQuality | null;
  readonly notes?: string | null;
  readonly claveDeEnvio?: string | null;
}

/**
 * Paso 1 del brief: validación PURA, sin base. Mensajes en español y
 * concretos, como `normalizarEventoDeColonia` en `colonyEvents.ts`.
 */
function validarPura(input: Pick<RegistrarIntervencionInput, "kind" | "target" | "targetNote" | "lineas">) {
  if (input.kind === "manejo_cultural" && input.lineas.length !== 0) {
    throw new IntervencionValidationError("un manejo cultural no lleva líneas de producto");
  }
  if (input.kind !== "manejo_cultural" && input.lineas.length === 0) {
    throw new IntervencionValidationError("una aplicación o liberación necesita al menos una línea");
  }
  if (input.target === "otro" && !input.targetNote?.trim()) {
    throw new IntervencionValidationError('target "otro" exige targetNote');
  }
  for (const linea of input.lineas) {
    for (const [campo, valor] of [
      ["withdrawalDays", linea.withdrawalDays],
      ["reentryHours", linea.reentryHours],
    ] as const) {
      if (valor != null && (!Number.isInteger(valor) || valor < 0)) {
        throw new IntervencionValidationError(`${campo} inválido: ${valor}. Cero es válido; negativo no.`);
      }
    }
    // Ronda final, hallazgo 5: nulo y cero se conservan tal cual (nulo = no
    // declarada; cero es una cantidad legítima); negativo y no finito se
    // rechazan aquí para que el camino SIN frasco —que no pasa por el `CHECK`
    // del libro mayor— no acepte lo que el camino CON frasco ya rechazaba.
    if (linea.quantity != null && (!Number.isFinite(linea.quantity) || linea.quantity < 0)) {
      throw new IntervencionValidationError(`quantity inválida: ${linea.quantity}. Cero es válido; negativo no.`);
    }
  }
}

interface ParcelaResuelta {
  readonly id: string;
  readonly organizationId: string | null;
  readonly timezone: string | null;
  readonly locationType: string;
}

/**
 * Paso 4 del brief: cada referencia existe y es de quien dice ser. Corre
 * ANTES de abrir la transacción, con el cliente total — no autoriza nada, sólo
 * comprueba identidad; el permiso ya se resolvió en el paso 3.
 */
async function validarReferencias(
  parcela: ParcelaResuelta,
  datos: Pick<
    RegistrarIntervencionInput,
    "specimenIds" | "plotBlockIds" | "lineas" | "fieldSessionId" | "motivoObservationId"
  >,
) {
  const specimenIds = datos.specimenIds ?? [];
  if (specimenIds.length > 0) {
    const especimenes = await prisma.specimen.findMany({
      where: { id: { in: [...specimenIds] } },
      select: { id: true, locationId: true },
    });
    const porId = new Map(especimenes.map((e) => [e.id, e]));
    for (const id of specimenIds) {
      const especimen = porId.get(id);
      if (!especimen) throw new IntervencionValidationError(`no existe la planta ${id}`);
      if (especimen.locationId !== parcela.id) {
        throw new IntervencionValidationError(`la planta ${id} es de otra parcela`);
      }
    }
  }

  // Tarea 2: cada bloque tiene que ser de esta parcela — `locationId` IGUAL,
  // no basta con estar emparentado (brief, Notas del controlador).
  const plotBlockIds = datos.plotBlockIds ?? [];
  if (plotBlockIds.length > 0) {
    const bloques = await prisma.plotBlock.findMany({
      where: { id: { in: [...plotBlockIds] } },
      select: { id: true, locationId: true },
    });
    const porId = new Map(bloques.map((b) => [b.id, b]));
    for (const id of plotBlockIds) {
      const bloque = porId.get(id);
      if (!bloque) throw new IntervencionValidationError(`no existe el bloque ${id}`);
      if (bloque.locationId !== parcela.id) {
        throw new IntervencionValidationError(`el bloque ${id} es de otra parcela`);
      }
    }
  }

  const materiales = await prisma.consumableMaterial.findMany({
    where: { id: { in: datos.lineas.map((l) => l.materialId) } },
    select: { id: true, organizationId: true, isPlantProtection: true },
  });
  const materialPorId = new Map(materiales.map((m) => [m.id, m]));
  for (const linea of datos.lineas) {
    const material = materialPorId.get(linea.materialId);
    if (!material) throw new IntervencionValidationError(`no existe el material ${linea.materialId}`);
    if (!material.isPlantProtection) {
      throw new IntervencionValidationError(`${linea.materialId} no es un material de manejo fitosanitario`);
    }
    if (material.organizationId !== parcela.organizationId) {
      throw new IntervencionValidationError(`${linea.materialId} es de otra organización`);
    }
  }

  const loteIds = datos.lineas.map((l) => l.consumableLotId).filter((id): id is string => id != null);
  if (loteIds.length > 0) {
    const lotes = await prisma.consumableLot.findMany({
      where: { id: { in: loteIds } },
      select: { id: true, materialId: true },
    });
    const lotePorId = new Map(lotes.map((l) => [l.id, l]));
    for (const linea of datos.lineas) {
      if (!linea.consumableLotId) continue;
      const lote = lotePorId.get(linea.consumableLotId);
      if (!lote) throw new IntervencionValidationError(`no existe el frasco ${linea.consumableLotId}`);
      if (lote.materialId !== linea.materialId) {
        throw new IntervencionValidationError(`el frasco ${linea.consumableLotId} no es de ese material`);
      }
    }
  }

  if (datos.fieldSessionId || datos.motivoObservationId) {
    const emparentadas = await ubicacionesEmparentadas(parcela.id);

    if (datos.fieldSessionId) {
      const jornada = await prisma.fieldSession.findUnique({
        where: { id: datos.fieldSessionId },
        select: { locationId: true },
      });
      if (!jornada) throw new IntervencionValidationError("no existe la jornada");
      if (!emparentadas.includes(jornada.locationId)) {
        throw new IntervencionValidationError("la jornada es de una parcela sin relación con ésta");
      }
    }

    // Ronda final, hallazgo 4: `motivoObservationId` se escribía directo, sin
    // comprobar que exista, que sea una lectura de trampa (`trap_check` — el
    // único tipo que trae `captureCount`, spec §4.3) ni que su planta esté
    // emparentada con esta parcela. Sin esto, una intervención de A podía
    // quedar «motivada» por una observación de B.
    if (datos.motivoObservationId) {
      const motivo = await prisma.specimenObservation.findUnique({
        where: { id: datos.motivoObservationId },
        select: { observationType: true, specimen: { select: { locationId: true } } },
      });
      if (!motivo) throw new IntervencionValidationError("no existe la observación que motiva la intervención");
      if (motivo.observationType !== "trap_check") {
        throw new IntervencionValidationError("la observación que motiva la intervención no es una lectura de trampa");
      }
      if (!emparentadas.includes(motivo.specimen.locationId)) {
        throw new IntervencionValidationError("la observación que motiva la intervención es de otra parcela");
      }
    }
  }
}

/**
 * Ronda de arreglos 2: `organizationId` es la de la parcela RESUELTA, no la
 * columna cruda de `Location`. Las parcelas reales («Lote 1 — Finca Rosina»)
 * la tienen nula: la organización vive en el sitio padre («Finca Rosina»), y
 * `resolveOrganizationForLocation` (`lib/traceability/locations.ts`) es la
 * función que ya existe para subir por `parentLocationId` hasta encontrarla.
 * Antes esta función leía `location.organizationId` a secas, y con eso el
 * selector de productos salía vacío y ningún material podía pasar la
 * comprobación «es de la organización de la parcela».
 */
async function resolverParcela(locationId: string): Promise<ParcelaResuelta | null> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, timezone: true, locationType: true },
  });
  if (!location) return null;
  const organizationId = await resolveOrganizationForLocation(locationId);
  return { ...location, organizationId };
}

/**
 * Crea las áreas (plantas y bloques) de la intervención. Sin filas = la
 * parcela entera. Cada fila lleva exactamente una de las dos referencias —
 * `CHECK` en la base — así que nunca se pasan las dos en la misma llamada.
 */
async function crearAreas(
  tx: Prisma.TransactionClient,
  interventionId: string,
  specimenIds: readonly string[],
  plotBlockIds: readonly string[] = [],
) {
  const areas = [];
  for (const specimenId of specimenIds) {
    areas.push(await tx.plotInterventionArea.create({ data: { interventionId, specimenId } }));
  }
  for (const plotBlockId of plotBlockIds) {
    areas.push(await tx.plotInterventionArea.create({ data: { interventionId, plotBlockId } }));
  }
  return areas;
}

/**
 * Crea las líneas de producto de la intervención y, cuando `descontar` es
 * cierto, descuenta del frasco en la MISMA transacción — igual que
 * `recordColonyEvent`. Una corrección pasa `descontar: false`: no vuelve a
 * gastar producto (brief, Restricciones globales).
 */
async function crearLineasDeIntervencion(
  tx: Prisma.TransactionClient,
  args: {
    readonly interventionId: string;
    readonly lineas: readonly LineaInput[];
    readonly occurredAt: Date;
    readonly timezone: string | null;
    readonly descontar: boolean;
    readonly userAccountId: string;
  },
) {
  const hoy = diaDeHoy(args.occurredAt, args.timezone);
  const lineas = [];

  for (const linea of args.lineas) {
    let lotExpiredAtApplication: boolean | null = null;

    if (linea.consumableLotId) {
      const frasco = await tx.consumableLot.findUniqueOrThrow({
        where: { id: linea.consumableLotId },
        select: { expiresAt: true },
      });
      const estado = estadoDeVencimiento({ expiresAt: frasco.expiresAt, avisarDiasAntes: null, hoy });
      lotExpiredAtApplication = estado.estado === "SIN_FECHA" ? null : estado.estado === "VENCIDO";

      if (args.descontar && linea.quantity != null) {
        const unidad = (linea.unit ?? "").trim();
        if (!unidad) throw new IntervencionValidationError("unidad requerida para descontar del frasco");
        const previo = await tx.consumableStockEvent.findFirst({
          where: { consumableLotId: linea.consumableLotId },
          select: { unit: true },
        });
        if (previo && previo.unit !== unidad) {
          throw new IntervencionValidationError(
            `unidad distinta: el frasco va en ${previo.unit} y la línea viene en ${unidad}`,
          );
        }
        await tx.consumableStockEvent.create({
          data: {
            consumableLotId: linea.consumableLotId,
            eventType: "consumed",
            quantity: linea.quantity,
            unit: unidad,
            occurredAt: args.occurredAt,
            provenanceClass: "original_record",
            createdBy: args.userAccountId,
          },
        });
      }
    }

    lineas.push(
      await tx.plotInterventionLine.create({
        data: {
          interventionId: args.interventionId,
          materialId: linea.materialId,
          consumableLotId: linea.consumableLotId ?? null,
          quantity: linea.quantity ?? null,
          unit: linea.unit ?? null,
          withdrawalDays: linea.withdrawalDays ?? null,
          reentryHours: linea.reentryHours ?? null,
          lotExpiredAtApplication,
        },
      }),
    );
  }

  return lineas;
}

export async function registrarIntervencion(
  userAccountId: string,
  input: RegistrarIntervencionInput,
): Promise<PlotIntervention> {
  validarPura(input);

  const parcela = await resolverParcela(input.locationId);
  if (!parcela || (parcela.locationType !== "plot" && parcela.locationType !== "micro_plot")) {
    throw new IntervencionValidationError("no_es_parcela");
  }

  await requireLotAccess(userAccountId, "manage", [
    { locationId: input.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION },
  ]);

  await validarReferencias(parcela, input);

  // Ronda final, hallazgo 3: `validarReferencias` sólo comprueba que la
  // jornada esté emparentada con esta parcela — identidad, no autorización.
  // Esta función SÍ va a escribir un `FieldEvent` en esa jornada (abajo), y
  // eso exige las mismas reglas que `recordFieldEvent`: acceso sobre la
  // ubicación de la jornada (que puede no ser la de esta parcela — una cuenta
  // con ámbito sólo en la microparcela no autoriza escribir en la madre) y
  // que siga ABIERTA. Sin esto, una jornada cerrada o ajena aceptaba el
  // evento igual, un camino que `recordFieldEvent` ya rechaza.
  if (input.fieldSessionId) {
    try {
      await requireOpenFieldSessionForEvent(userAccountId, input.fieldSessionId, input.occurredAt);
    } catch (error) {
      if (error instanceof LocationAccessError) {
        throw new TraceabilityAccessError(`sin acceso a la jornada: ${error.message}`);
      }
      if (error instanceof FieldSessionValidationError) {
        throw new IntervencionValidationError(`jornada no disponible: ${error.message}`);
      }
      throw error;
    }
  }

  return unaVezPorEnvio(userAccountId, input.claveDeEnvio, {
    tipo: "PlotIntervention",
    recuperar: (id) => prisma.plotIntervention.findUniqueOrThrow({ where: { id } }),
    crear: async (tx) => {
      const creada = await tx.plotIntervention.create({
        data: {
          locationId: input.locationId,
          kind: input.kind,
          target: input.target,
          targetNote: input.targetNote?.trim() || null,
          method: input.method ?? null,
          mixVolume: input.mixVolume ?? null,
          mixUnit: input.mixUnit ?? null,
          occurredAt: input.occurredAt,
          operatorPersonId: input.operatorPersonId ?? null,
          fieldSessionId: input.fieldSessionId ?? null,
          motivoObservationId: input.motivoObservationId ?? null,
          provenanceClass: "original_record",
          dataQuality: input.dataQuality ?? null,
          notes: input.notes ?? null,
          createdBy: userAccountId,
        },
      });

      const areas = await crearAreas(tx, creada.id, input.specimenIds ?? [], input.plotBlockIds ?? []);
      const lineas = await crearLineasDeIntervencion(tx, {
        interventionId: creada.id,
        lineas: input.lineas,
        occurredAt: input.occurredAt,
        timezone: parcela.timezone,
        descontar: true,
        userAccountId,
      });

      if (input.fieldSessionId) {
        const tipoDeEvento = await tx.variableCatalogValue.findFirst({
          where: { value: "manejo_fitosanitario", catalog: { key: "event_kind" } },
          select: { id: true, aliasOfId: true },
        });
        if (!tipoDeEvento) {
          throw new IntervencionValidationError("falta el tipo de evento manejo_fitosanitario: correr db:seed");
        }
        await tx.fieldEvent.create({
          data: {
            fieldSessionId: input.fieldSessionId,
            eventKindValueId: tipoDeEvento.aliasOfId ?? tipoDeEvento.id,
            occurredAt: input.occurredAt,
            operatorPersonId: input.operatorPersonId ?? null,
            plotInterventionId: creada.id,
            provenanceClass: "original_record",
            createdBy: userAccountId,
          },
        });
      }

      await recordAuditEvent(
        {
          actorUserAccountId: userAccountId,
          operation: "plot_intervention.create",
          entityType: "plot_intervention",
          entityId: creada.id,
          after: { ...creada, lineas, areas },
          sourceInterface: "traceability.service",
        },
        tx,
      );

      return creada;
    },
  });
}

export async function corregirIntervencion(
  userAccountId: string,
  input: {
    readonly interventionId: string;
    readonly motivo: string;
    readonly nueva: Omit<RegistrarIntervencionInput, "locationId" | "claveDeEnvio">;
  },
): Promise<PlotIntervention> {
  const motivo = input.motivo.trim();
  if (!motivo) throw new IntervencionValidationError("una corrección necesita motivo");

  validarPura(input.nueva);

  // Ronda 1: «no existe» y «no tienes permiso» son indistinguibles para quien
  // no tiene permiso — decisión del controlador. Si la fila no existe no hay
  // locationId contra el que juzgar, así que se lanza el MISMO error que
  // `requireLotAccess` lanzaría, en vez de uno propio que delataría la
  // existencia del id a quien lo prueba sin acceso.
  const original = await prisma.plotIntervention.findUnique({
    where: { id: input.interventionId },
    include: { correcciones: { select: { id: true }, take: 1 } },
  });
  if (!original) throw new TraceabilityAccessError("no_lot_access");

  await requireLotAccess(userAccountId, "manage", [
    { locationId: original.locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION },
  ]);

  // «Ya tiene corrección» va DESPUÉS del permiso: es un error de negocio, no
  // uno de acceso, y sólo se revela a quien ya demostró tener permiso sobre
  // la parcela.
  if (original.correcciones.length > 0) {
    throw new IntervencionValidationError("esta intervención ya tiene una corrección: no se corrige lo corregido");
  }

  const parcela = await resolverParcela(original.locationId);
  if (!parcela) throw new IntervencionValidationError("no_es_parcela");

  await validarReferencias(parcela, input.nueva);

  return prisma.$transaction(async (tx) => {
    // Ronda final, hallazgo 2: la comprobación de arriba («ya tiene
    // corrección») lee y escribe en pasos separados, así que dos operadores
    // pueden pasarla los dos antes de que cualquiera confirme. La garantía
    // real es el índice único PARCIAL de la base sobre `corrects_id`
    // (migración `20260918170000_correccion_unica_y_cantidad_no_negativa`,
    // `WHERE corrects_id IS NOT NULL`) — mismo patrón que
    // `lib/sensory/service.ts` para su doble envío: el `catch` va atado a
    // este `create`, así que un P2002 aquí sólo puede ser esa unicidad.
    const creada = await tx.plotIntervention
      .create({
        data: {
          locationId: original.locationId,
          kind: input.nueva.kind,
          target: input.nueva.target,
          targetNote: input.nueva.targetNote?.trim() || null,
          method: input.nueva.method ?? null,
          mixVolume: input.nueva.mixVolume ?? null,
          mixUnit: input.nueva.mixUnit ?? null,
          occurredAt: input.nueva.occurredAt,
          operatorPersonId: input.nueva.operatorPersonId ?? null,
          fieldSessionId: input.nueva.fieldSessionId ?? null,
          motivoObservationId: input.nueva.motivoObservationId ?? null,
          provenanceClass: "original_record",
          dataQuality: input.nueva.dataQuality ?? null,
          notes: input.nueva.notes ?? null,
          correctsId: original.id,
          correctionReason: motivo,
          createdBy: userAccountId,
        },
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new IntervencionValidationError("ya_corregida");
        }
        throw error;
      });

    const areas = await crearAreas(tx, creada.id, input.nueva.specimenIds ?? [], input.nueva.plotBlockIds ?? []);
    // Sin descuento: una corrección no vuelve a gastar producto (Restricciones
    // globales del brief). Un saldo mal descontado se cuadra con
    // `reconciliar` del inventario, que exige su propia razón.
    const lineas = await crearLineasDeIntervencion(tx, {
      interventionId: creada.id,
      lineas: input.nueva.lineas,
      occurredAt: input.nueva.occurredAt,
      timezone: parcela.timezone,
      descontar: false,
      userAccountId,
    });

    await recordAuditEvent(
      {
        actorUserAccountId: userAccountId,
        operation: "plot_intervention.correct",
        entityType: "plot_intervention",
        entityId: creada.id,
        before: original,
        after: { ...creada, lineas, areas },
        reason: motivo,
        sourceInterface: "traceability.service",
      },
      tx,
    );

    return creada;
  });
}

/**
 * Intervenciones vigentes (sin corrección que las sustituya) en las
 * ubicaciones dadas — Tarea 6, spec §3.4. Un solo `findMany`: la marca de
 * carencia en la cosecha llama esto por cada `ubicacionesEmparentadas`.
 *
 * **No autoriza**: quien la llama ya pasó la compuerta (`recordHarvestEvent`)
 * o no necesita una (`ubicacionesEmparentadas` tampoco autoriza).
 */
export async function intervencionesVigentes(
  locationIds: readonly string[],
  opciones?: { hasta?: Date; db?: Prisma.TransactionClient },
): Promise<
  (IntervencionParaCarencia & {
    locationId: string;
    target: PlotInterventionTarget;
    parcelaEntera: boolean;
    plotBlockIds: string[];
  })[]
> {
  const db = opciones?.db ?? prisma;
  const filas = await db.plotIntervention.findMany({
    where: {
      locationId: { in: [...locationIds] },
      correcciones: { none: {} },
      ...(opciones?.hasta ? { occurredAt: { lte: opciones.hasta } } : {}),
    },
    select: {
      id: true,
      kind: true,
      occurredAt: true,
      locationId: true,
      target: true,
      lineas: { select: { withdrawalDays: true, reentryHours: true } },
      areas: { select: { plotBlockId: true } },
    },
  });

  // Tarea 2: sin áreas = parcela entera; los bloques son las áreas cuyo
  // `plotBlockId` no es nulo (las de planta no cuentan para esta lista).
  return filas.map(({ areas, ...resto }) => ({
    ...resto,
    parcelaEntera: areas.length === 0,
    plotBlockIds: areas.map((a) => a.plotBlockId).filter((id): id is string => id != null),
  }));
}

export type IntervencionListada = Prisma.PlotInterventionGetPayload<{
  include: {
    lineas: {
      include: {
        material: { select: { name: true; defaultWithdrawalDays: true; defaultReentryHours: true; safetyNotes: true } };
        consumableLot: { select: { batchLabel: true } };
      };
    };
    areas: { include: { specimen: { select: { commonName: true } } } };
    operator: { select: { displayName: true } };
    correcciones: { select: { id: true } };
  };
}>;

/**
 * La lista para la pantalla de la parcela — Tarea 6, spec §5. Vigentes y
 * corregidas, más recientes primero: la corrección es información, no algo
 * que ocultar.
 */
export async function listarIntervenciones(userAccountId: string, locationId: string): Promise<IntervencionListada[]> {
  await requireLotAccess(userAccountId, "view", [{ locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

  return prisma.plotIntervention.findMany({
    where: { locationId },
    include: {
      lineas: {
        include: {
          material: { select: { name: true, defaultWithdrawalDays: true, defaultReentryHours: true, safetyNotes: true } },
          consumableLot: { select: { batchLabel: true } },
        },
      },
      areas: { include: { specimen: { select: { commonName: true } } } },
      operator: { select: { displayName: true } },
      correcciones: { select: { id: true } },
    },
    orderBy: { occurredAt: "desc" },
  });
}

export interface MaterialFitosanitario {
  readonly id: string;
  readonly name: string;
  readonly defaultWithdrawalDays: number | null;
  readonly defaultReentryHours: number | null;
  readonly safetyNotes: string | null;
  readonly storageConditions: string | null;
  readonly lotes: readonly { readonly id: string; readonly batchLabel: string; readonly expiresAt: Date | null }[];
}

/**
 * Los productos de manejo fitosanitario de la organización de una parcela —
 * Tarea 8, spec §5. El formulario de intervención sólo ofrece éstos: nunca un
 * material cualquiera del botiquín o la bodega.
 */
export async function productosFitosanitarios(userAccountId: string, locationId: string): Promise<MaterialFitosanitario[]> {
  await requireLotAccess(userAccountId, "view", [{ locationId, classification: DEFAULT_NEW_RECORD_CLASSIFICATION }]);

  const parcela = await resolverParcela(locationId);
  if (!parcela?.organizationId) return [];

  const materiales = await prisma.consumableMaterial.findMany({
    where: { organizationId: parcela.organizationId, isPlantProtection: true },
    select: {
      id: true,
      name: true,
      defaultWithdrawalDays: true,
      defaultReentryHours: true,
      safetyNotes: true,
      storageConditions: true,
      lots: { select: { id: true, batchLabel: true, expiresAt: true } },
    },
    orderBy: { name: "asc" },
  });

  return materiales.map((m) => ({
    id: m.id,
    name: m.name,
    defaultWithdrawalDays: m.defaultWithdrawalDays,
    defaultReentryHours: m.defaultReentryHours,
    safetyNotes: m.safetyNotes,
    storageConditions: m.storageConditions,
    lotes: m.lots,
  }));
}

/**
 * `productosFitosanitarios` para una pantalla que ofrece el selector como algo
 * OPCIONAL (regla de trampas, Tarea 3 ronda 1) — un ámbito de ubicación sólo
 * alcanza hacia sus descendientes (`lib/rbac/service.ts`), así que alguien con
 * `location:manage_attributes` asignado exactamente en la parcela (no en la
 * finca ni en un ancestro) puede entrar al tablero de esa parcela y aun así no
 * tener `lot:view` sobre la finca. Sin este envoltorio, `productosFitosanitarios`
 * lanzaba `TraceabilityAccessError` sin capturar y la página entera reventaba
 * (500) en vez de sólo faltar el selector — el guardado ya fallaba con gracia
 * antes de esta tarea (`saveTrapRuleFormAction` + `friendlyError`), y esta
 * función preserva ese mismo trato para la lectura.
 *
 * Sólo traga `TraceabilityAccessError`: cualquier otro error se relanza.
 */
export async function productosFitosanitariosSiPuede(
  userAccountId: string,
  locationId: string,
): Promise<MaterialFitosanitario[]> {
  try {
    return await productosFitosanitarios(userAccountId, locationId);
  } catch (error) {
    if (error instanceof TraceabilityAccessError) return [];
    throw error;
  }
}
