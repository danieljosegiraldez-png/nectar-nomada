import { prisma } from "../db";
import { leerEnmiendas, type Enmienda } from "../traceability/enmiendas";
import type { MensajeDeBitacora } from "../integrations/bitacora";

/**
 * A9.12 (D10b) — el emisor de bitácora. **Lee de `AuditEvent` y de nada más.**
 *
 * ## Por qué de ahí y no de un registro propio
 *
 * D10 lo dice mejor de lo que yo lo diría: *si algo existe sólo en el chat, no
 * existe.* Una bitácora que fuera su propia fuente sería un segundo sistema de
 * registro compitiendo con el primero, y el día que discreparan no habría a
 * quién creerle. Aquí es un **espejo**: todo lo que sale de este módulo ya está
 * escrito, con actor, momento, operación y motivo.
 *
 * La consecuencia práctica es la que justifica el ticket: **el retroactivo es
 * posible después**. Cuando haya canal, se puede emitir hacia atrás leyendo el
 * mismo sitio, porque el registro no dependía del canal para existir.
 *
 * ## Se reutiliza `leerEnmiendas` (A9.3), y por eso este ticket dependía de él
 *
 * No se escribe una segunda consulta contra `AuditEvent`. La primera versión de
 * ese lector preguntaba por `entityType: "Lot"` y **nadie escribe nunca esa
 * cadena** —las escrituras usan `snake_case`—, así que el panel afirmaba «sin
 * historial» con una consulta que no podía acertar. Un segundo lector encima
 * habría heredado el fallo.
 *
 * ## Un párrafo que este archivo tenía y dejó de ser cierto
 *
 * Decía que la pérdida de una colonia **no se podía espejar**, y era verdad:
 * hasta el 2026-09-08 ningún servicio cambiaba `Colony.status`, así que el
 * hecho más caro del apiario no llegaba al rastro. Decía además que por eso el
 * conteo del sistema **sólo podía subir**, y que su divergencia con el
 * declarado en la visita era estructural.
 *
 * **Las dos cosas se arreglaron a la vez.** `registrarFinDeColonia` marca la
 * colonia y audita `colony.end`; el conteo ya puede bajar, y hay una regla
 * inmediata para la pérdida. Queda escrito en vez de borrado porque el error
 * era del diseño, no de la redacción: una columna con valores que nadie escribe
 * se lee como capacidad y no lo es.
 *
 * Lo que sigue siendo cierto: la alerta de pérdida de A9.8 compara dos conteos
 * **declarados**, no estados de fila. Son dos preguntas distintas — «cuántas
 * contó quien fue» y «cuántas dice el sistema» — y conviene que sigan siéndolo.
 */

/** Las claves de `entityType` tal como las ESCRIBEN los servicios, verificadas una a una. */
const SUJETOS_DE_UNA_VISITA = {
  visita: "field_session",
  evento: "field_event",
  inspeccion: "inspection",
  eventoDeColonia: "colony_event",
  cosecha: "apiary_harvest_event",
} as const;

/**
 * Lo que no espera al cierre, con su razón. Es una lista **corta y declarada**,
 * no un umbral: cada entrada dice por qué merece interrumpir.
 *
 * Sólo entra lo que de verdad está en el rastro. La pérdida de colonias no
 * está —ver la cabecera— y no se finge que sí.
 */
interface ReglaInmediata {
  operation: string;
  /** Sobre el `after` del propio registro, que es lo único que hay sin re-consultar. */
  cuando: (after: Record<string, unknown>) => boolean;
  razon: string;
  texto: (after: Record<string, unknown>) => string;
}

export const REGLAS_INMEDIATAS: readonly ReglaInmediata[] = [
  {
    // La regla que esta cabecera decía que NO se podía escribir. Ya se puede:
    // `registrarFinDeColonia` audita `colony.end`, así que el hecho llega al
    // rastro y el espejo lo alcanza.
    operation: "colony.end",
    cuando: () => true,
    razon:
      "Es el hecho más caro del apiario y el que menos avisa. Perder una colonia cambia el conteo contra el compromiso de polinización y no se recupera esperando al cierre de la visita.",
    texto: (a) => `Se perdió una colonia${a.status === "absconded" ? " (se fugó)" : ""}.`,
  },
  {
    operation: "inspection.create",
    cuando: (a) => a.outcome === "issue_observed",
    razon:
      "Alguien fue a la caja y vio algo. Esperar al cierre de la visita puede ser horas, y quien decide si se trata no es siempre quien inspecciona.",
    texto: () => "Se observó un problema en una inspección.",
  },
  {
    operation: "colony_event.create",
    cuando: (a) => a.eventType === "treatment",
    razon:
      "Se aplicó un producto. Tiene periodo de carencia y afecta a la miel que salga de esa colmena, así que quien coseche necesita saberlo sin buscarlo.",
    texto: (a) => `Se aplicó un tratamiento${typeof a.treatmentProduct === "string" ? `: ${a.treatmentProduct}` : ""}.`,
  },
];

function comoObjeto(valor: unknown): Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

/**
 * Los mensajes inmediatos que corresponden a un rastro ya leído. **Función
 * pura**: recibe enmiendas y devuelve mensajes, sin tocar la base. Así las
 * reglas se prueban una a una sin construir una visita entera por cada una.
 */
export function inmediatosDe(enmiendas: readonly Enmienda[], enlaceDe: (e: Enmienda) => string): MensajeDeBitacora[] {
  const mensajes: MensajeDeBitacora[] = [];
  for (const e of enmiendas) {
    for (const regla of REGLAS_INMEDIATAS) {
      if (e.operation !== regla.operation) continue;
      const after = comoObjeto(e.after);
      if (!regla.cuando(after)) continue;
      mensajes.push({
        // Del id del registro, no del momento de emitir: reintentar no duplica.
        clave: `inmediato:${e.id}`,
        clase: "inmediato",
        texto: regla.texto(after),
        enlace: enlaceDe(e),
        occurredAt: e.occurredAt,
      });
    }
  }
  return mensajes;
}

export interface ResumenDeVisita {
  fieldSessionId: string;
  locationId: string;
  inspecciones: number;
  eventosDeColonia: number;
  cosechas: number;
  /** Los inmediatos que ocurrieron DENTRO de esta visita, ya emitidos o no. */
  inmediatos: number;
}

/**
 * Lo que se registró en una visita, contado desde su rastro.
 *
 * **No recibe `userAccountId` y no autoriza**: se llama desde el cierre de
 * visita, que ya pasó por `requireFieldSessionAccess`. Misma disciplina que
 * `leerEnmiendas` y `vitalesDeSitios` — un lector que pide principal parece una
 * compuerta y termina usándose como tal.
 */
export async function resumenDeVisita(fieldSessionId: string): Promise<{
  resumen: ResumenDeVisita;
  mensajes: MensajeDeBitacora[];
} | null> {
  const visita = await prisma.fieldSession.findUnique({
    where: { id: fieldSessionId },
    select: {
      id: true,
      locationId: true,
      completedAt: true,
      startedAt: true,
      events: { select: { id: true, inspectionId: true, colonyEventId: true, apiaryHarvestEventId: true } },
    },
  });
  if (!visita) return null;

  // Los sujetos del rastro: la visita, sus eventos de campo, y los registros
  // concretos que esos eventos apuntan. Las FK las añadió A9.1 justo para esto.
  const sujetos: { entityType: string; entityId: string }[] = [
    { entityType: SUJETOS_DE_UNA_VISITA.visita, entityId: visita.id },
  ];
  for (const e of visita.events) {
    sujetos.push({ entityType: SUJETOS_DE_UNA_VISITA.evento, entityId: e.id });
    if (e.inspectionId) sujetos.push({ entityType: SUJETOS_DE_UNA_VISITA.inspeccion, entityId: e.inspectionId });
    if (e.colonyEventId) sujetos.push({ entityType: SUJETOS_DE_UNA_VISITA.eventoDeColonia, entityId: e.colonyEventId });
    if (e.apiaryHarvestEventId) sujetos.push({ entityType: SUJETOS_DE_UNA_VISITA.cosecha, entityId: e.apiaryHarvestEventId });
  }

  // El límite por defecto de `leerEnmiendas` es 50 y una visita larga lo pasa.
  // Se pide por sujeto, que es la cota real de lo que puede haber.
  const enmiendas = await leerEnmiendas(sujetos, { limite: Math.max(50, sujetos.length * 4) });

  const enlaceDeLaVisita = `/apiaries/${visita.locationId}`;
  const inmediatos = inmediatosDe(enmiendas, () => enlaceDeLaVisita);

  const resumen: ResumenDeVisita = {
    fieldSessionId: visita.id,
    locationId: visita.locationId,
    inspecciones: enmiendas.filter((e) => e.operation === "inspection.create").length,
    eventosDeColonia: enmiendas.filter((e) => e.operation === "colony_event.create").length,
    cosechas: enmiendas.filter((e) => e.operation === "apiary_harvest_event.create").length,
    inmediatos: inmediatos.length,
  };

  // Cifras y enlace. Nunca el contenido: el mensaje llega a un teléfono y RBAC
  // no interviene en esa pantalla — el enlace sí vuelve a pasar por la compuerta.
  const partes = [
    `${resumen.inspecciones} inspecciones`,
    `${resumen.eventosDeColonia} eventos de colonia`,
    `${resumen.cosechas} cosechas`,
  ];
  const mensajes: MensajeDeBitacora[] = [
    {
      clave: `resumen:${visita.id}`,
      clase: "resumen",
      texto: `Visita cerrada. Se registraron ${partes.join(", ")}.`,
      enlace: enlaceDeLaVisita,
      occurredAt: visita.completedAt ?? visita.startedAt,
    },
  ];

  return { resumen, mensajes };
}
