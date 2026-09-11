/**
 * El parseo del cuerpo del lote de campo: de JSON crudo a `PushMutation[]`.
 *
 * **Por qué vive fuera de la ruta.** Estaba dentro de
 * `app/api/v1/sync/field-events/route.ts`, y ahí **no se podía probar**: importar
 * esa ruta arrastra `resolverPrincipal` → `next-auth`, que vitest no resuelve.
 * Así que la pieza que decide qué tipos existen no tenía una sola prueba, y por
 * eso pudo quedarse sin la rama de `colony_end` durante toda la A9.5 — con la
 * consecuencia descrita abajo.
 *
 * Es la regla de `CLAUDE.md` aplicada al pie de la letra: *«el guardia es el que
 * llama a la función con la entrada hostil, lo que suele obligar a exportarla.
 * Si eso incomoda, la incomodidad es el aviso»*.
 *
 * **El defecto que lo trajo.** Un `kind` no reconocido cae al camino de
 * `FieldEvent`, que exige `fieldSessionId`, y el resultado es un **400 del lote
 * entero**. El cliente trata un 4xx de lote como fallo de transporte —y hace
 * bien, porque no puede distinguirlo de «no llegué»—, así que deja todo en cola:
 * un solo borrador con un `kind` que la ruta no conoce **bloquea la cola
 * indefinidamente**, él y todo lo que tenga detrás. De ahí que esta función sea
 * el sitio donde se declara la lista de tipos, y que haya un guardia que la
 * compara con los que el cliente sabe encolar.
 */
import type { PushMutation, MutacionDeEvento } from "./pushFieldEvents";

/** Las fechas viajan como texto ISO por JSON y vuelven a ser fechas aquí. */
export function toDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Los tipos de apiario que el lote entiende, **fechados con `occurredAt`**.
 *
 * Declarada y exportada a propósito: es la lista que
 * `tests/sync/parseoDelLote.test.ts` compara con lo que el cliente encola. Sin
 * ella, la comparación tendría que leer el texto de un `if`.
 */
export const KINDS_DE_APIARIO = ["inspection", "colony_event", "varroa_count"] as const;

/** `colony_end` va aparte porque fecha con `endedAt`: cuándo se perdió la colonia. */
export const KIND_DE_FIN_DE_COLONIA = "colony_end";

export type ParseoDeLote =
  | { ok: true; mutations: PushMutation[] }
  | { ok: false; error: string };

export function parsearMutaciones(mutations: readonly unknown[]): ParseoDeLote {
  const parsed: PushMutation[] = [];

  for (const raw of mutations) {
    const m = (raw ?? {}) as Record<string, unknown>;
    const occurredAt = toDate(m.occurredAt);

    if (m.kind === KIND_DE_FIN_DE_COLONIA) {
      // Si el borrador no trajo `endedAt`, vale su `occurredAt`: la cola lo pone
      // siempre, y es cuando el operador lo anotó. Inventar `Date.now()` aquí
      // fecharía la pérdida el día que hubo señal.
      const endedAt = toDate(m.endedAt) ?? occurredAt;
      if (typeof m.clientDraftId !== "string" || typeof m.colonyId !== "string" || !endedAt) {
        return { ok: false, error: "mutation_malformed" };
      }
      parsed.push({ ...(m as object), endedAt } as PushMutation);
      continue;
    }

    // A9.5 — las mutaciones de apiario no llevan `fieldSessionId`: la visita la
    // resuelve el servidor a partir de la que esté abierta en ese sitio
    // (`lib/traceability/visitaAbierta.ts`). El aparato no la conoce, y
    // pedírsela lo obligaría a adivinar cuál era la visita del día.
    if (typeof m.kind === "string" && (KINDS_DE_APIARIO as readonly string[]).includes(m.kind)) {
      if (typeof m.clientDraftId !== "string" || typeof m.colonyId !== "string" || !occurredAt) {
        return { ok: false, error: "mutation_malformed" };
      }
      // Los campos propios de cada tipo los valida su servicio de dominio: aquí
      // sólo se comprueba lo que hace falta para poder llamarlo. Un conteo de
      // varroa con el método mal escrito vuelve como `rejected` con su razón, no
      // como un 400 que tumbaría el lote de los demás.
      parsed.push({ ...(m as object), occurredAt } as PushMutation);
      continue;
    }

    if (typeof m.clientDraftId !== "string" || typeof m.fieldSessionId !== "string") {
      return { ok: false, error: "mutation_missing_ids" };
    }
    if (typeof m.eventKindValueId !== "string" || !occurredAt) {
      return { ok: false, error: "mutation_malformed" };
    }
    parsed.push({
      clientDraftId: m.clientDraftId,
      fieldSessionId: m.fieldSessionId,
      eventKindValueId: m.eventKindValueId,
      occurredAt,
      recordedAt: toDate(m.recordedAt),
      position: (m.position ?? undefined) as MutacionDeEvento["position"],
      operatorPersonId: typeof m.operatorPersonId === "string" ? m.operatorPersonId : null,
      notes: typeof m.notes === "string" ? m.notes : null,
    });
  }

  return { ok: true, mutations: parsed };
}
