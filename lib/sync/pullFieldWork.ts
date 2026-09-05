import { prisma } from "../db";
import { can } from "../rbac/service";

/**
 * P4 §5 — pull por cursor: qué se lleva un dispositivo para poder trabajar.
 *
 * **Paginación por clave, no por desplazamiento.** Un `skip/take` sobre datos
 * que cambian mientras se pagina salta filas o las repite, y en una cola de
 * sincronización eso significa trabajo de campo que el aparato nunca ve. El
 * cursor es `(marca de tiempo, id)`: el id desempata, porque dos filas con la
 * misma marca tienen que ordenarse de forma estable o la página siguiente se
 * salta una.
 *
 * **Dos marcas distintas, a propósito:**
 * - `FieldSession` va por `updatedAt` porque **cambia**: cerrarla la modifica,
 *   y un aparato que la descargó abierta tiene que enterarse.
 * - `FieldEvent` va por `createdAt` porque es append-only de verdad —
 *   comprobado: ningún sitio del código lo actualiza ni lo borra. Darle un
 *   `updatedAt` para uniformar el cursor sería mentir sobre su naturaleza.
 *
 * **El ámbito lo decide el servidor, no el aparato.** El dispositivo no pide
 * «dame el lote 3»; pide «dame lo mío», y aquí se resuelve contra el RBAC real
 * (§20). Un aparato comprometido no puede ensanchar lo que descarga pidiendo
 * más.
 *
 * **Sin lápidas, y no por olvido:** ni `FieldSession` ni `FieldEvent` tienen
 * `status`, nada las borra, y las jornadas no desaparecen. Cuando exista una
 * tabla de este flujo que sí se archive, `RecordStatus.archived` es la lápida
 * que §5 nombra.
 */

export interface PullCursor {
  sessionUpdatedAt: string | null;
  sessionId: string | null;
  eventCreatedAt: string | null;
  eventId: string | null;
}

export const CURSOR_VACIO: PullCursor = {
  sessionUpdatedAt: null,
  sessionId: null,
  eventCreatedAt: null,
  eventId: null,
};

export interface PullResult {
  locations: { id: string; name: string; locationType: string }[];
  sessions: {
    id: string;
    locationId: string;
    operatorPersonId: string;
    startedAt: Date;
    endedAt: Date | null;
    notes: string | null;
    updatedAt: Date;
  }[];
  events: {
    id: string;
    fieldSessionId: string;
    eventKindValueId: string;
    occurredAt: Date;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
    accuracyM: number | null;
    clientDraftId: string | null;
    createdAt: Date;
  }[];
  eventKinds: { id: string; value: string }[];
  cursor: PullCursor;
  hasMore: boolean;
}

/** Igual que el tope del push: holgado para una jornada, acotado para el servidor. */
export const LIMITE_POR_PAGINA = 200;

/**
 * Las Locations en las que este operador puede trabajar.
 *
 * Se filtra llamando a `can()` por candidata en vez de reimplementar las reglas
 * de ámbito. Es una consulta de asignaciones por Location —N+1— y se acepta a
 * ojos abiertos: producción tiene **16 Locations**, y la alternativa es una
 * segunda copia de la resolución de ámbitos que puede derivar de la de verdad
 * sin que nadie lo note. Un ámbito de RBAC que deriva es un fallo de seguridad
 * silencioso; 16 consultas indexadas son milisegundos.
 *
 * Si esto llega a miles de Locations, lo que hay que hacer es exportar
 * `getResolvedAssignments` de `lib/rbac/service.ts` y usar el `can` puro de
 * `resolve.ts` — una lectura y N comprobaciones en memoria. No inventar un
 * resolutor nuevo.
 */
async function locationsVisibles(userAccountId: string) {
  const candidatas = await prisma.location.findMany({
    select: { id: true, name: true, locationType: true, classification: true },
    orderBy: { name: "asc" },
  });
  const permitidas = [];
  for (const l of candidatas) {
    if (await can(userAccountId, "manage_attributes", "location",
                  { scopeType: "location", scopeRefId: l.id }, l.classification)) {
      permitidas.push({ id: l.id, name: l.name, locationType: l.locationType });
    }
  }
  return permitidas;
}

export async function pullFieldWork(
  userAccountId: string,
  cursor: PullCursor = CURSOR_VACIO,
  limite: number = LIMITE_POR_PAGINA,
): Promise<PullResult> {
  const locations = await locationsVisibles(userAccountId);
  const locationIds = locations.map((l) => l.id);

  if (locationIds.length === 0) {
    // Sin ámbito no hay nada que descargar, y el cursor se devuelve tal cual:
    // avanzarlo sobre un conjunto vacío haría que el aparato se saltara trabajo
    // el día que alguien le dé permisos.
    return { locations: [], sessions: [], events: [], eventKinds: [], cursor, hasMore: false };
  }

  // La forma canónica de «(a, b) > (x, y)» en Prisma, que no compara tuplas.
  const despuesDe = (marca: string, campo: "updatedAt" | "createdAt", id: string) => ({
    OR: [{ [campo]: { gt: new Date(marca) } }, { [campo]: new Date(marca), id: { gt: id } }],
  });

  const sessions = await prisma.fieldSession.findMany({
    where: {
      locationId: { in: locationIds },
      ...(cursor.sessionUpdatedAt && cursor.sessionId
        ? despuesDe(cursor.sessionUpdatedAt, "updatedAt", cursor.sessionId)
        : {}),
    },
    select: {
      id: true, locationId: true, operatorPersonId: true, startedAt: true,
      endedAt: true, notes: true, updatedAt: true,
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limite + 1, // el de más sólo dice si hay más; no se manda
  });
  const hayMasSesiones = sessions.length > limite;
  const sesionesPagina = hayMasSesiones ? sessions.slice(0, limite) : sessions;

  const events = await prisma.fieldEvent.findMany({
    where: {
      fieldSession: { locationId: { in: locationIds } },
      ...(cursor.eventCreatedAt && cursor.eventId
        ? despuesDe(cursor.eventCreatedAt, "createdAt", cursor.eventId)
        : {}),
    },
    select: {
      id: true, fieldSessionId: true, eventKindValueId: true, occurredAt: true,
      notes: true, latitude: true, longitude: true, accuracyM: true,
      clientDraftId: true, createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limite + 1,
  });
  const hayMasEventos = events.length > limite;
  const eventosPagina = hayMasEventos ? events.slice(0, limite) : events;

  // El vocabulario va entero en cada respuesta, sin cursor. Son doce filas y
  // el formulario no se puede dibujar sin ellas; paginarlo añadiría un estado
  // más que mantener sincronizado a cambio de ahorrar nada medible.
  const eventKinds = await prisma.variableCatalogValue.findMany({
    where: { catalog: { key: "event_kind" }, aliasOfId: null },
    select: { id: true, value: true },
    orderBy: { value: "asc" },
  });

  const ultimaSesion = sesionesPagina.at(-1);
  const ultimoEvento = eventosPagina.at(-1);

  return {
    locations,
    sessions: sesionesPagina,
    events: eventosPagina,
    eventKinds,
    // El cursor sólo avanza donde hubo filas. Avanzarlo en la mitad vacía
    // dejaría un `null` pisando una posición buena y el aparato re-descargaría
    // todo en la siguiente vuelta.
    cursor: {
      sessionUpdatedAt: ultimaSesion ? ultimaSesion.updatedAt.toISOString() : cursor.sessionUpdatedAt,
      sessionId: ultimaSesion ? ultimaSesion.id : cursor.sessionId,
      eventCreatedAt: ultimoEvento ? ultimoEvento.createdAt.toISOString() : cursor.eventCreatedAt,
      eventId: ultimoEvento ? ultimoEvento.id : cursor.eventId,
    },
    hasMore: hayMasSesiones || hayMasEventos,
  };
}
