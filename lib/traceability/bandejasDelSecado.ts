/**
 * Las bandejas de un secado (spec de secado por bandeja §4.2–§4.3; paso 2).
 *
 * Un lote se reparte en varias bandejas; cada bandeja lleva un solo lote a la
 * vez; el secado termina bandeja a bandeja, y bajar la última lo CIERRA en la
 * misma transacción (decisiones de Daniel, 2026-09-18). Las reglas duras viven
 * en la base —migración `bandejas_de_la_corrida`—; aquí se comprueban antes para
 * dar un error legible, y lo que la base rechace se traduce al mismo código.
 *
 * La POSICIÓN no se escribe aquí: es el último EquipmentTransfer de la bandeja
 * hacia una posición de estante, y se mueve con `moverBandeja` (quien gestiona el
 * lote cargado) o con `trasladarEquipo` (quien configura equipos).
 *
 * **Ajustes del pre-flight aplicados aquí (ajustes.md, Tarea 2), donde difieren
 * del texto del encargo:**
 * - D1/D3: el nombre de una posición (cama/estante/instalación) sólo sale si
 *   quien mira pasa `can(manage_attributes, location)` sobre ESA ubicación —
 *   mismo permiso que usa `bandejasDeLaFinca` (`lib/equipos/bandejas.ts:145-152`)
 *   para lo mismo. Por eso `posicionDeBandeja` recibe `userAccountId`, a
 *   diferencia de la firma que trae el encargo: sin él no hay con qué pedir ese
 *   permiso. Cuando no pasa, la `Posicion` sale con `oculta: true` y los mismos
 *   campos en `null` que ya usa el caso `ajena`.
 * - D2: el NOMBRE de cada bandeja de la corrida (no sólo las del conflicto) pasa
 *   por `puedeVerEquipo`; sin ese permiso se muestra un marcador fijo en vez del
 *   nombre real.
 * - D4: cargar, listar disponibles y los candidatos de conflicto exigen un
 *   recipiente NUMERADO (`trayTypeId` no nulo).
 * - D6/D7: `moverBandeja` decide el permiso ANTES que `no_es_bandeja` /
 *   `bandeja_fija` / `posicion_invalida`, y la vía de "configura el destino"
 *   exige TAMBIÉN `puedeVerEquipo` sobre la bandeja. `isFixedInPlace` se relee
 *   dentro de la transacción, después del `FOR UPDATE`.
 * - D10: el último traslado de las bandejas de la corrida y de sus candidatos de
 *   conflicto se trae en dos consultas (una por grupo), no una por fila.
 */
import { prisma } from "../db";
import { recordAuditEvent } from "../audit";
import { can } from "../rbac/service";
import { puedeVerEquipo, puedeConfigurarEn } from "../equipos/equipos";
import { requireLotAccess, TraceabilityAccessError } from "./lots";
import { cerrarCorridaEnTransaccion, type CierreDelSecado } from "./drying";
import { BandejaError } from "./bandejaError";
import type { Location } from "../../generated/prisma/client";

export { BandejaError } from "./bandejaError";

const BANDEJA_OCULTA = "(bandeja oculta)";

export interface Posicion {
  camaId: string;
  ajena: boolean;
  /** Sólo `true` cuando quien mira no puede administrar ESA ubicación (D1). Ausente en los demás casos. */
  oculta?: boolean;
  cama: string | null;
  instalacion: string | null;
  estante: string | null;
  nivel: number | null;
  puesto: number | null;
}
export interface BandejaEnCorrida {
  id: string; equipmentId: string; nombre: string; desde: Date; hasta: Date | null;
  posicion: Posicion | null;
  conflicto: string[];
  conflictoSinAcceso: number;
}

/**
 * El lote que se seca en esta corrida, con el permiso ya exigido: `manage` para
 * cargar y bajar, `view` para leer. Misma resolución que `recordDryingTurnEvent`.
 */
async function corridaConPermiso(userAccountId: string, dryingRunId: string, accion: "manage" | "view" = "manage") {
  const run = await prisma.dryingRun.findUnique({ where: { id: dryingRunId } });
  if (!run) throw new BandejaError("corrida_no_encontrada");
  const apertura = await prisma.lotTransformation.findFirst({
    where: { dryingRunId }, orderBy: { occurredAt: "asc" }, include: { inputs: { include: { lot: true } } },
  });
  const lot = apertura?.inputs[0]?.lot;
  if (!lot) throw new TraceabilityAccessError("drying_run_not_found");
  await requireLotAccess(userAccountId, accion, [{ projectId: lot.projectId, locationId: lot.locationId, classification: lot.classification }]);
  return { run, lot };
}

/**
 * Lo que la base rechaza —dos cargas que ganaron la lectura previa a la vez, un
 * intervalo cerrado que se solapa— llega como el mismo código que da el servicio.
 * Los textos son los de la migración, sin tildes a propósito.
 */
function traducirRechazo(error: unknown): unknown {
  if (error instanceof BandejaError) return error;
  const texto = error instanceof Error ? error.message : String(error);
  // Sólo la unicidad de ESTA tabla es «ocupada»: el cierre reutilizado puede
  // chocar con otra (p. ej. el código del lote de salida) y no es lo mismo.
  const p2002DeLaBandeja = (error as { code?: string })?.code === "P2002"
    && /drying_run_tray|una_abierta_por_bandeja/.test(JSON.stringify((error as { meta?: unknown }).meta ?? {}) + texto);
  if (p2002DeLaBandeja || /ya lleva otro lote/.test(texto)) return new BandejaError("bandeja_ocupada");
  if (/con cama no lleva bandejas/.test(texto)) return new BandejaError("corrida_con_cama");
  if (/ya esta cerrado/.test(texto)) return new BandejaError("secado_cerrado");
  if (/tipo recipiente/.test(texto)) return new BandejaError("no_es_bandeja");
  if (/bandejas sin bajar/.test(texto)) return new BandejaError("bandejas_sin_bajar");
  return error;
}

/**
 * D1: arma la `Posicion` a partir de la ubicación de destino de un traslado,
 * con el nombre gateado por el permiso de ESA ubicación. Una sola función para
 * que `posicionDeBandeja` y el cómputo por lote de `bandejasDeCorrida` (D10)
 * apliquen exactamente la misma regla.
 */
async function resolverPosicion(
  userAccountId: string,
  cama: (Location & { parentLocation: (Location & { parentLocation: Location | null }) | null }) | null | undefined,
  organizationId: string,
): Promise<Posicion | null> {
  if (!cama || cama.locationType !== "drying_bed") return null;
  if (cama.organizationId !== organizationId) {
    return { camaId: cama.id, ajena: true, cama: null, instalacion: null, estante: null, nivel: null, puesto: null };
  }
  // El nombre de una posición lo autoriza la posición misma, no el permiso del
  // lote ni del equipo — mismo permiso que `bandejasDeLaFinca`
  // (`lib/equipos/bandejas.ts:145-152`, D1). `location` no tiene una acción
  // `view` propia en el catálogo.
  const puedeVerLugar = await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: cama.id }, cama.classification);
  if (!puedeVerLugar) {
    return { camaId: cama.id, ajena: false, oculta: true, cama: null, instalacion: null, estante: null, nivel: null, puesto: null };
  }
  // Una posición cuelga de un ESTANTE, y el estante de la instalación (plan 2a).
  // Una cama suelta —cama africana, piso con lona— cuelga directo de la instalación.
  const padre = cama.parentLocation;
  const enEstante = padre?.locationType === "drying_rack";
  return {
    camaId: cama.id, ajena: false, cama: cama.name,
    instalacion: (enEstante ? padre?.parentLocation?.name : padre?.name) ?? null,
    estante: enEstante ? padre!.name : null,
    nivel: cama.rackLevel, puesto: cama.rackSlot,
  };
}

/**
 * Dónde estaba una bandeja en un instante: su último traslado hasta entonces, si
 * fue a una cama. **No recibe principal para autorizar CARGAR o BAJAR** —la
 * llaman `bandejasDeCorrida`, que ya exigió `view`/`manage` del lote, y las
 * pruebas—, pero SÍ recibe `userAccountId` para el permiso de NOMBRAR la
 * posición (D1): son dos preguntas distintas y una cama ajena o clasificada no
 * dice su nombre aunque el lote sí se pueda ver.
 */
export async function posicionDeBandeja(userAccountId: string, equipmentId: string, en: Date, organizationId: string): Promise<Posicion | null> {
  const t = await prisma.equipmentTransfer.findFirst({
    where: { equipmentId, occurredAt: { lte: en } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    include: { toLocation: { include: { parentLocation: { include: { parentLocation: true } } } } },
  });
  return resolverPosicion(userAccountId, t?.toLocation, organizationId);
}

export async function cargarBandeja(userAccountId: string, input: { dryingRunId: string; equipmentId: string; desde: Date }) {
  const { run, lot } = await corridaConPermiso(userAccountId, input.dryingRunId);
  if (run.endedAt) throw new BandejaError("secado_cerrado");
  if (run.dryingBedLocationId) throw new BandejaError("corrida_con_cama");
  if (input.desde < run.startedAt) throw new BandejaError("fecha_antes_del_secado");
  const equipo = await prisma.equipment.findUnique({ where: { id: input.equipmentId } });
  // D4: sólo un recipiente NUMERADO (tipo y número) es una bandeja.
  if (!equipo || equipo.kind !== "vessel" || equipo.trayTypeId === null) throw new BandejaError("no_es_bandeja");
  if (equipo.organizationId !== lot.organizationId) throw new BandejaError("bandeja_de_otra_organizacion");
  if (!(await puedeVerEquipo(userAccountId, equipo))) throw new BandejaError("bandeja_sin_acceso");
  if (equipo.lifecycleStatus !== "active") throw new BandejaError("bandeja_retirada");
  if (await prisma.dryingRunTray.findFirst({ where: { equipmentId: equipo.id, hasta: null } })) throw new BandejaError("bandeja_ocupada");

  try {
    return await prisma.$transaction(async (tx) => {
      const fila = await tx.dryingRunTray.create({ data: {
        dryingRunId: run.id, equipmentId: equipo.id, desde: input.desde,
        provenanceClass: "original_record", createdBy: userAccountId,
      } });
      await recordAuditEvent({
        actorUserAccountId: userAccountId, operation: "drying_run_tray.cargar", entityType: "drying_run_tray",
        entityId: fila.id, after: fila, sourceInterface: "traceability.service",
      }, tx);
      return { id: fila.id };
    });
  } catch (error) {
    throw traducirRechazo(error);
  }
}

export async function bajarBandeja(
  userAccountId: string,
  input: { dryingRunTrayId: string; hasta: Date; cierre?: CierreDelSecado | null },
) {
  const fila = await prisma.dryingRunTray.findUnique({ where: { id: input.dryingRunTrayId } });
  if (!fila) throw new BandejaError("bandeja_no_encontrada");
  const { run, lot } = await corridaConPermiso(userAccountId, fila.dryingRunId);
  if (run.endedAt) throw new BandejaError("secado_cerrado");
  if (fila.hasta) throw new BandejaError("ya_bajada");
  if (input.hasta < fila.desde) throw new BandejaError("fecha_antes_de_cargar");

  try {
    return await prisma.$transaction(async (tx) => {
      // La corrida quieta: «¿es la última?» se decide sin que otra pestaña cargue
      // o baje en medio. Mismo orden de bloqueo que el disparador (corrida primero).
      await tx.$queryRaw`SELECT 1 FROM "traceability"."drying_run" WHERE "id" = ${run.id}::uuid FOR UPDATE`;
      const { count } = await tx.dryingRunTray.updateMany({ where: { id: fila.id, hasta: null }, data: { hasta: input.hasta } });
      if (count !== 1) throw new BandejaError("ya_bajada");
      const quedan = await tx.dryingRunTray.count({ where: { dryingRunId: run.id, hasta: null } });
      if (quedan === 0 && !input.cierre) throw new BandejaError("la_ultima_cierra_el_secado");
      if (quedan > 0 && input.cierre) throw new BandejaError("quedan_otras_bandejas");
      await recordAuditEvent({
        actorUserAccountId: userAccountId, operation: "drying_run_tray.bajar", entityType: "drying_run_tray",
        entityId: fila.id, before: fila, after: { ...fila, hasta: input.hasta }, sourceInterface: "traceability.service",
      }, tx);
      if (quedan === 0 && input.cierre) {
        const cierre = await cerrarCorridaEnTransaccion(tx, userAccountId, run.id, lot, { ...input.cierre, dryingRunId: run.id, endedAt: input.hasta });
        // El audit de este cierre se escribe AQUÍ, dentro de esta misma
        // transacción, y no en `cerrarCorridaEnTransaccion` — ver el comentario
        // largo de esa función en drying.ts: el guardia de atomicidad reconoce
        // "dentro de una transacción" por un cierre `(tx) => { … }` en el MISMO
        // archivo, y este `try { return await prisma.$transaction(...) }` lo es.
        await recordAuditEvent({
          actorUserAccountId: userAccountId, operation: "drying_run.end", entityType: "drying_run",
          entityId: cierre.run.id, after: cierre.run, sourceInterface: "traceability.service",
        }, tx);
      }
      return { id: fila.id, cerro: quedan === 0 };
    });
  } catch (error) {
    throw traducirRechazo(error);
  }
}

export async function bandejasDeCorrida(userAccountId: string, dryingRunId: string): Promise<BandejaEnCorrida[]> {
  const { lot } = await corridaConPermiso(userAccountId, dryingRunId, "view");
  const filas = await prisma.dryingRunTray.findMany({
    where: { dryingRunId }, orderBy: [{ desde: "asc" }], include: { equipment: true },
  });
  const ahora = new Date();

  // D10: el último traslado de CADA bandeja de esta corrida, en una sola
  // consulta (ya ordenada por bandeja y fecha), no una por fila.
  const transferInclude = { toLocation: { include: { parentLocation: { include: { parentLocation: true } } } } } as const;
  const transfersDeFilas = filas.length > 0
    ? await prisma.equipmentTransfer.findMany({
        where: { equipmentId: { in: filas.map((f) => f.equipmentId) } },
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        include: transferInclude,
      })
    : [];
  const ultimoAntesDe = (equipmentId: string, en: Date) =>
    transfersDeFilas.find((t) => t.equipmentId === equipmentId && t.occurredAt <= en) ?? null;

  const conPosicion = await Promise.all(filas.map(async (f) => ({
    f,
    posicion: await resolverPosicion(userAccountId, ultimoAntesDe(f.equipmentId, f.hasta ?? ahora)?.toLocation, lot.organizationId),
    // D2: el nombre de CADA fila pasa por `puedeVerEquipo`, no sólo los del conflicto.
    nombre: (await puedeVerEquipo(userAccountId, f.equipment)) ? f.equipment.name : BANDEJA_OCULTA,
  })));

  // Conflicto (§4.2) = ocupación FÍSICA: otro recipiente NUMERADO (D4) de la
  // organización cuyo último traslado también es esta cama, esté cargado o no.
  // El registro dice que está ahí, y una posición lleva una bandeja. Se enseña;
  // no se bloquea. Una posición `ajena` u `oculta` para quien mira no entra en
  // este cómputo: no hay nombre que comparar sin poder nombrar la posición.
  const camas = [...new Set(conPosicion
    .filter((x) => x.f.hasta === null && x.posicion && !x.posicion.ajena && !x.posicion.oculta)
    .map((x) => x.posicion!.camaId))];
  const ocupantes = new Map<string, { equipmentId: string; nombre: string | null }[]>();
  if (camas.length > 0) {
    const candidatos = await prisma.equipmentTransfer.findMany({
      where: { toLocationId: { in: camas }, equipment: { organizationId: lot.organizationId, kind: "vessel", trayTypeId: { not: null } } },
      select: { equipmentId: true, equipment: { select: { id: true, name: true, projectId: true, classification: true } } },
      distinct: ["equipmentId"],
    });
    // D10: los traslados de los candidatos, también en una sola consulta.
    const idsCandidatos = candidatos.map((c) => c.equipmentId);
    const transfersDeCandidatos = idsCandidatos.length > 0
      ? await prisma.equipmentTransfer.findMany({
          where: { equipmentId: { in: idsCandidatos } },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          include: transferInclude,
        })
      : [];
    for (const c of candidatos) {
      const ultimo = transfersDeCandidatos.find((t) => t.equipmentId === c.equipmentId) ?? null; // ya ordenado desc
      const p = await resolverPosicion(userAccountId, ultimo?.toLocation, lot.organizationId);
      if (p && !p.ajena && !p.oculta && camas.includes(p.camaId)) {
        // El conflicto se cuenta siempre; el NOMBRE sólo si esta persona ve ese equipo
        // (segunda pasada de Codex): mismo `can(view)` que en `bandejasDisponibles`.
        const nombre = (await puedeVerEquipo(userAccountId, c.equipment)) ? c.equipment.name : null;
        ocupantes.set(p.camaId, [...(ocupantes.get(p.camaId) ?? []), { equipmentId: c.equipmentId, nombre }]);
      }
    }
  }
  return conPosicion.map(({ f, posicion, nombre }) => {
    const otros = f.hasta === null && posicion && !posicion.ajena && !posicion.oculta
      ? (ocupantes.get(posicion.camaId) ?? []).filter((o) => o.equipmentId !== f.equipmentId)
      : [];
    return {
      id: f.id, equipmentId: f.equipmentId, nombre, desde: f.desde, hasta: f.hasta, posicion,
      conflicto: otros.flatMap((o) => (o.nombre === null ? [] : [o.nombre])),
      conflictoSinAcceso: otros.filter((o) => o.nombre === null).length,
    };
  });
}

export async function bandejasDisponibles(userAccountId: string, dryingRunId: string) {
  const { lot } = await corridaConPermiso(userAccountId, dryingRunId);
  // SIN `take`: un tope ANTES del filtro de permiso podía devolver una lista vacía
  // teniendo bandejas visibles más abajo (segunda pasada de Codex). La consulta ya
  // está acotada a los recipientes NUMERADOS (D4), libres y activos de UNA organización.
  const filas = await prisma.equipment.findMany({
    where: {
      organizationId: lot.organizationId, kind: "vessel", lifecycleStatus: "active", trayTypeId: { not: null },
      dryingRunTrays: { none: { hasta: null } },
    },
    orderBy: { name: "asc" },
  });
  const visibles = [];
  for (const e of filas) if (await puedeVerEquipo(userAccountId, e)) visibles.push({ id: e.id, nombre: e.name });
  return visibles;
}

// --- Mover una bandeja de posición (paso 4b) --------------------------------

export interface PosicionParaMover { id: string; instalacion: string | null; estante: string | null; nivel: number; puesto: number; ocupada: boolean; ocupadaPor: string | null }

export async function moverBandeja(userAccountId: string, input: { equipmentId: string; posicionId: string; occurredAt: Date }) {
  const equipo = await prisma.equipment.findUnique({ where: { id: input.equipmentId } });
  const destino = await prisma.location.findUnique({ where: { id: input.posicionId }, include: { parentLocation: true } });

  // D7: el PERMISO se decide antes que `no_es_bandeja` / `bandeja_fija` /
  // `posicion_invalida` — ninguno de los tres se revela a quien no autoriza.
  const cargaVista = equipo ? await prisma.dryingRunTray.findFirst({ where: { equipmentId: equipo.id, hasta: null }, select: { id: true, dryingRunId: true } }) : null;
  let permitido = false;
  if (cargaVista) {
    try { await corridaConPermiso(userAccountId, cargaVista.dryingRunId); permitido = true; }
    catch (error) { if (!(error instanceof TraceabilityAccessError)) throw error; }
  }
  if (!permitido && equipo && destino) {
    // D6: la vía de "configura el destino" exige TAMBIÉN ver la bandeja.
    if ((await puedeConfigurarEn(userAccountId, destino.id)) && (await puedeVerEquipo(userAccountId, equipo))) permitido = true;
  }
  if (!permitido) throw new BandejaError("bandeja_sin_acceso");

  // Validez, DESPUÉS del permiso.
  if (!equipo || equipo.kind !== "vessel") throw new BandejaError("no_es_bandeja");
  if (equipo.isFixedInPlace) throw new BandejaError("bandeja_fija");
  if (!destino || destino.locationType !== "drying_bed" || destino.parentLocation?.locationType !== "drying_rack"
      || destino.rackLevel == null || destino.rackSlot == null || destino.organizationId !== equipo.organizationId) {
    throw new BandejaError("posicion_invalida");
  }
  // D1: el destino tiene que ser una posición que esta persona pueda VER —mismo
  // permiso que nombra una posición en `resolverPosicion`—, no sólo una donde
  // pueda configurar o cuyo lote gestione.
  if (!(await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: destino.id }, destino.classification))) {
    throw new BandejaError("posicion_invalida");
  }

  return prisma.$transaction(async (tx) => {
    // Mismo bloqueo que toma el disparador de drying_run_tray al cargar o bajar:
    // mientras dure, nadie cambia la carga de esta bandeja.
    await tx.$queryRaw`SELECT 1 FROM "core"."equipment" WHERE "id" = ${equipo.id}::uuid FOR UPDATE`;
    // D7: releer `isFixedInPlace` DESPUÉS del bloqueo — pudo cambiar mientras
    // se esperaba.
    const equipoAhora = await tx.equipment.findUniqueOrThrow({ where: { id: equipo.id } });
    if (equipoAhora.isFixedInPlace) throw new BandejaError("bandeja_fija");
    const cargaAhora = await tx.dryingRunTray.findFirst({ where: { equipmentId: equipo.id, hasta: null }, select: { id: true } });
    // Si el permiso vino del lote, la carga tiene que ser la misma. Si vino de
    // configurar el destino, no depende de la carga.
    if (permitido && cargaAhora?.id !== cargaVista?.id) throw new BandejaError("bandeja_cambio");
    const ultimo = await tx.equipmentTransfer.findFirst({
      where: { equipmentId: equipo.id }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: { toLocationId: true, occurredAt: true },
    });
    if (ultimo && input.occurredAt < ultimo.occurredAt) throw new BandejaError("fecha_antes_del_ultimo_traslado");
    const t = await tx.equipmentTransfer.create({ data: {
      equipmentId: equipo.id, fromLocationId: ultimo?.toLocationId ?? null, toLocationId: destino.id,
      occurredAt: input.occurredAt, createdBy: userAccountId,
    } });
    await recordAuditEvent({ actorUserAccountId: userAccountId, entityType: "equipment_transfer", entityId: t.id,
      operation: "drying_tray.move", sourceInterface: "traceability.service",
      after: { equipmentId: equipo.id, fromLocationId: t.fromLocationId, toLocationId: destino.id } }, tx);
    return { id: t.id };
  });
}

export async function posicionesParaMover(userAccountId: string, equipmentId: string): Promise<PosicionParaMover[]> {
  const equipo = await prisma.equipment.findUniqueOrThrow({ where: { id: equipmentId } });
  const org = equipo.organizationId;
  const carga = await prisma.dryingRunTray.findFirst({ where: { equipmentId, hasta: null }, select: { dryingRunId: true } });
  let porLote = false;
  if (carga) {
    try { await corridaConPermiso(userAccountId, carga.dryingRunId); porLote = true; }
    catch (error) { if (!(error instanceof TraceabilityAccessError)) throw error; }
  }
  const todas = await prisma.location.findMany({
    where: { organizationId: org, locationType: "drying_bed", parentLocation: { locationType: "drying_rack" } },
    include: { parentLocation: { include: { parentLocation: true } } },
    orderBy: [{ parentLocationId: "asc" }, { rackLevel: "asc" }, { rackSlot: "asc" }],
  });
  // D1: sólo entran las posiciones que esta persona PUEDE VER —mismo permiso
  // que nombra una posición—, y sólo entre ésas, las que además puede mover
  // (gestiona el lote cargado, o configura ahí).
  const posiciones = [];
  for (const p of todas) {
    const puedeVer = await can(userAccountId, "manage_attributes", "location", { scopeType: "location", scopeRefId: p.id }, p.classification);
    if (!puedeVer) continue;
    if (porLote || (await puedeConfigurarEn(userAccountId, p.id))) posiciones.push(p);
  }
  if (posiciones.length === 0) return [];

  // Quién ocupa cada posición HASTA AHORA: el último traslado vigente de cada recipiente.
  const ahora = new Date();
  const ultimos = await prisma.equipmentTransfer.findMany({
    where: { occurredAt: { lte: ahora }, equipment: { organizationId: org, kind: "vessel" } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    select: { equipmentId: true, toLocationId: true, equipment: { select: { id: true, name: true, projectId: true, classification: true } } },
  });
  const visto = new Set<string>(); const ocupante = new Map<string, { nombre: string | null }>();
  for (const u of ultimos) {
    if (visto.has(u.equipmentId)) continue;
    visto.add(u.equipmentId);
    ocupante.set(u.toLocationId, { nombre: (await puedeVerEquipo(userAccountId, u.equipment)) ? u.equipment.name : null });
  }
  return posiciones.map((p) => {
    const estante = p.parentLocation!;
    const instalacion = estante.parentLocation;
    // Nombres de estante e instalación sólo si son de la misma organización.
    return {
      id: p.id,
      estante: estante.organizationId === org ? estante.name : null,
      instalacion: instalacion && instalacion.organizationId === org ? instalacion.name : null,
      nivel: p.rackLevel!, puesto: p.rackSlot!,
      ocupada: ocupante.has(p.id),
      ocupadaPor: ocupante.get(p.id)?.nombre ?? null,
    };
  });
}
