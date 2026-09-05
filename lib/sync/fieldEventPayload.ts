import { parseLocalDateTime, TZ_OFFSET_FIELD } from "../time/localDateTime";

/**
 * P4 §11 — el payload que la cola guarda, construido a partir del formulario.
 *
 * **Por qué es una función pura y vive aquí.** La primera versión de esto vivía
 * dentro del `onSubmit` del formulario y leía el desfase horario de un campo
 * llamado `"timezoneOffsetMinutes"`, un nombre inventado: el real es
 * `TZ_OFFSET_FIELD` = `"tzOffsetMinutes"`. `parseLocalDateTime` lanzaba
 * `timezone_offset_missing`, y como el `onSubmit` ya había llamado a
 * `preventDefault()`, la anotación **se perdía en silencio** mientras la
 * pantalla decía «guardado en este dispositivo».
 *
 * Sólo pasaba sin señal, que es exactamente cuando no hay nada más que salve al
 * operador. No lo cazó ningún test porque el cableado del cliente no tenía
 * ninguno; lo cazó recorrer el modo avión en un navegador.
 *
 * Extraída, la decisión se puede probar sin IndexedDB, sin `fetch` y sin DOM —
 * `FormData` existe en Node. Es el mismo movimiento que `classifyDraftAge` en
 * la cola de apiario y `clasificarRespuesta` aquí al lado.
 */
export interface EventoDeCampoEncolado {
  fieldSessionId: string;
  eventKindValueId: string;
  occurredAt: string;
  recordedAt: string;
  operatorPersonId: string | null;
  notes: string | null;
  position: { latitude: number | null; longitude: number | null; accuracyM: number | null };
}

const texto = (fd: FormData, name: string): string | null => {
  const v = String(fd.get(name) ?? "").trim();
  return v === "" ? null : v;
};

const numero = (fd: FormData, name: string): number | null => {
  const v = texto(fd, name);
  return v === null ? null : Number(v);
};

export function construirEventoEncolado(
  fd: FormData,
  fieldSessionId: string,
  ahora: Date = new Date(),
): EventoDeCampoEncolado {
  return {
    fieldSessionId,
    eventKindValueId: String(fd.get("eventKindValueId") ?? ""),
    // El mismo instante que calcularía el servidor: la misma función pura y el
    // mismo campo de desfase, nombrado por su constante y no a mano.
    occurredAt: parseLocalDateTime(
      String(fd.get("occurredAt") ?? ""),
      texto(fd, TZ_OFFSET_FIELD),
    ).toISOString(),
    // El reloj del aparato al anotarlo, que es un hecho distinto de cuándo pasó
    // (P2 §5). Coinciden casi siempre; en un evento fechado hacia atrás, no.
    recordedAt: ahora.toISOString(),
    operatorPersonId: texto(fd, "operatorPersonId"),
    notes: texto(fd, "notes"),
    position: {
      latitude: numero(fd, "latitude"),
      longitude: numero(fd, "longitude"),
      accuracyM: numero(fd, "accuracyM"),
    },
  };
}
