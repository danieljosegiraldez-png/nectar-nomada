/**
 * La ingestión de lo que manda un nodo de sensores — artefactos de colmena, Tarea 5.
 *
 * Spec: docs/superpowers/specs/2026-09-17-artefactos-de-colmena-design.md §B y §6, y del paquete
 * Smart Hive su `PLATFORM_API.md`: «autenticar la ruta, comprobar el registro del UID, validar la
 * carga, verificar que event_id casa con device/epoch/seq, resolver la colmena del momento de la
 * observación, e insertar la observación cruda inmutable».
 *
 * Las reglas que se adoptan literales, porque son las de esta casa:
 * - **La identidad sale del REGISTRO y de la ruta, nunca del cuerpo.** El `notecard_uid` que la
 *   ruta trae verificado dice qué aparato es; el `device_id` del cuerpo sólo se contrasta.
 * - **El tiempo desconocido se queda desconocido.** Con `time_quality: unknown` o `ts: null`,
 *   `observedAt` es nulo — nunca la hora de llegada.
 * - **El crudo no se toca.** Se guarda entero y un disparador de la base impide reescribirlo.
 * - **Idempotente.** Duplicado exacto = el mismo registro, `duplicado: true`. Mismo id con otro
 *   contenido = cuarentena, sin pisar al primero.
 *
 * Sin `userAccountId`: no la llama una persona sino una ruta autenticada (Tarea 7). Por eso no
 * escribe AuditEvent por fila —serían miles al día— y la observación misma es el registro
 * inmutable de lo que llegó.
 */
import { createHash } from "node:crypto";
import { prisma } from "../db";
import { Prisma } from "../../generated/prisma/client";

/** La carga no es una observación válida: malformada, fuera de esquema o incoherente. (HTTP 400) */
export class ObservacionRechazada extends Error {}
/** La ruta no identifica un aparato del registro, o el cuerpo dice ser otro. (HTTP 403) */
export class AparatoNoAutorizado extends Error {}
/** Mismo id que una observación ya guardada, con OTRO contenido. Queda en cuarentena. (HTTP 409) */
export class ObservacionEnConflicto extends Error {}

const ESQUEMA = "nn.hive.observation/1";
const CAMPOS = [
  "schema", "device_id", "epoch", "seq", "event_id", "ts", "time_quality", "boot", "uptime_ms",
  "hardware", "firmware", "configuration_id", "reset_cause", "observations", "faults", "events",
  "missed_samples",
] as const;

type Carga = {
  schema: string; device_id: string; epoch: string; seq: number; event_id: string; ts: number | null;
  time_quality: "unknown" | "notecard"; boot: number; uptime_ms: number; hardware: string; firmware: string;
  configuration_id: string; reset_cause: number; observations: Record<string, unknown>; faults: string[];
  events: string[]; missed_samples: number;
};

const entero = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const texto = (v: unknown, min: number, max: number) => typeof v === "string" && v.length >= min && v.length <= max;

/**
 * La forma de arriba de `schemas/telemetry.schema.json` del paquete, a mano: el mismo `required`,
 * los mismos patrones y límites, y `additionalProperties: false`. Las observaciones anidadas se
 * guardan tal cual — de ellas se ocupa la lectura derivada, no la puerta.
 */
export function validarCarga(carga: unknown): Carga {
  if (typeof carga !== "object" || carga === null || Array.isArray(carga)) throw new ObservacionRechazada("carga_no_es_objeto");
  const c = carga as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    if (!(CAMPOS as readonly string[]).includes(k)) throw new ObservacionRechazada(`campo_desconocido: ${k}`);
  }
  for (const k of CAMPOS) if (!(k in c)) throw new ObservacionRechazada(`campo_requerido: ${k}`);
  if (c.schema !== ESQUEMA) throw new ObservacionRechazada("esquema_desconocido");
  if (typeof c.device_id !== "string" || !/^rp2040-[0-9a-f]{16}$/.test(c.device_id)) throw new ObservacionRechazada("device_id_invalido");
  if (typeof c.epoch !== "string" || !/^[0-9a-f]{32}$/.test(c.epoch)) throw new ObservacionRechazada("epoch_invalido");
  if (!entero(c.seq, 0)) throw new ObservacionRechazada("seq_invalido");
  if (!texto(c.event_id, 1, 128)) throw new ObservacionRechazada("event_id_invalido");
  if (c.ts !== null && !entero(c.ts, 1704067200, 4102444799)) throw new ObservacionRechazada("ts_invalido");
  if (c.time_quality !== "unknown" && c.time_quality !== "notecard") throw new ObservacionRechazada("time_quality_invalido");
  if (!entero(c.boot, 1)) throw new ObservacionRechazada("boot_invalido");
  if (!entero(c.uptime_ms, 0)) throw new ObservacionRechazada("uptime_ms_invalido");
  for (const k of ["hardware", "firmware", "configuration_id"] as const) {
    if (!texto(c[k], 1, 64)) throw new ObservacionRechazada(`${k}_invalido`);
  }
  if (!entero(c.reset_cause, 0)) throw new ObservacionRechazada("reset_cause_invalido");
  if (typeof c.observations !== "object" || c.observations === null || Array.isArray(c.observations)) {
    throw new ObservacionRechazada("observations_invalido");
  }
  if (!Array.isArray(c.faults) || c.faults.length > 32 || !c.faults.every((f) => texto(f, 1, 140))) {
    throw new ObservacionRechazada("faults_invalido");
  }
  if (!Array.isArray(c.events) || c.events.length > 16 || !c.events.every((e) => texto(e, 1, 64))) {
    throw new ObservacionRechazada("events_invalido");
  }
  if (!entero(c.missed_samples, 0)) throw new ObservacionRechazada("missed_samples_invalido");
  return c as unknown as Carga;
}

/** JSON con las claves ordenadas: la misma carga da la misma huella aunque llegue reordenada. */
function canonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonico).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonico((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}
export const huellaDeCarga = (carga: unknown) => createHash("sha256").update(canonico(carga)).digest("hex");

export interface RutaAutenticada {
  /** El UID del Notecard, VERIFICADO por la ruta — nunca leído del cuerpo. */
  readonly notecardUid: string;
}

export async function ingerirObservacion(carga: unknown, ruta: RutaAutenticada, intento = 0): Promise<{ id: string; duplicado: boolean }> {
  const c = validarCarga(carga);

  const nodo = await prisma.hiveNode.findUnique({ where: { notecardUid: ruta.notecardUid } });
  if (!nodo) throw new AparatoNoAutorizado("aparato_no_registrado");
  if (nodo.lifecycleStatus !== "active") throw new AparatoNoAutorizado("aparato_fuera_de_servicio");
  if (c.device_id !== nodo.deviceId) throw new AparatoNoAutorizado("identidad_no_coincide");
  if (c.event_id !== `${c.device_id}:${c.epoch}:${c.seq}`) throw new ObservacionRechazada("event_id_no_casa");

  const payloadHash = huellaDeCarga(c);
  const clave = { deviceId_epoch_seq: { deviceId: c.device_id, epoch: c.epoch, seq: c.seq } };

  const previa = await prisma.nodeObservation.findUnique({ where: clave, select: { id: true, payloadHash: true } });
  if (previa) {
    if (previa.payloadHash === payloadHash) return { id: previa.id, duplicado: true };
    // Mismo id, otro contenido: se guarda aparte y el primero queda intacto.
    await prisma.nodeObservationConflict.create({
      data: {
        deviceId: c.device_id, epoch: c.epoch, seq: c.seq, existingObservationId: previa.id,
        payload: c as unknown as Prisma.InputJsonValue, payloadHash,
      },
    });
    throw new ObservacionEnConflicto(`conflicto: ${c.event_id} ya existe con otro contenido`);
  }

  // Sin hora conocida no hay momento — y sin momento no hay colmena que resolver.
  const observedAt = c.ts !== null && c.time_quality !== "unknown" ? new Date(c.ts * 1000) : null;
  const asignacion = observedAt
    ? await prisma.hiveFitting.findFirst({
        where: {
          hiveNodeId: nodo.id,
          installedAt: { lte: observedAt },
          OR: [{ removedAt: null }, { removedAt: { gt: observedAt } }],
        },
        select: { hiveId: true },
      })
    : null;

  try {
    const o = await prisma.nodeObservation.create({
      data: {
        deviceId: c.device_id,
        epoch: c.epoch,
        seq: c.seq,
        eventId: c.event_id,
        hiveNodeId: nodo.id,
        observedAt,
        timeQuality: c.time_quality,
        hiveId: asignacion?.hiveId ?? null,
        payload: c as unknown as Prisma.InputJsonValue,
        payloadHash,
        faults: c.faults,
        missedSamples: c.missed_samples,
      },
      select: { id: true },
    });
    return { id: o.id, duplicado: false };
  } catch (error) {
    // Dos entregas del mismo evento a la vez: la base decide cuál entró, y la otra se vuelve a
    // leer como duplicado o conflicto. Una sola vuelta: una segunda carrera sería otra cosa.
    if (intento === 0 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return ingerirObservacion(carga, ruta, 1);
    }
    throw error;
  }
}
