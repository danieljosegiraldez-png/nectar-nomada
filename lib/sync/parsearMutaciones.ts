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
import type { PushMutation, MutacionDeEvento, MutacionDePerfilDeSuelo } from "./pushFieldEvents";
import type { HorizonteDelFormulario } from "../traceability/horizontesDelFormulario";
import { fechaDeDia } from "../time/localDateTime";

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

/**
 * Los cuatro tipos de captura de parcela. Exportada como las de apiario: la
 * prueba compara esta lista con lo que el cliente encola, en vez de leer el
 * texto de un `if`.
 */
export const KINDS_DE_PARCELA = ["soil_sample", "foliar_sample", "soil_profile", "planting_cohort"] as const;

/** Un número que llega del JSON, o `null`. `"abc"` es `null`, no `NaN`. */
function numeroOpcional(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Una cadena no vacía que llega del JSON, o `null`. */
function textoOpcional(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * Los horizontes de una calicata encolada, normalizados **aquí y no en el
 * servicio**.
 *
 * Es el único campo anidado del protocolo, y por eso el único que puede llegar
 * con una forma que ni el tipo ni Prisma esperan: un `horizons: "cuatro"`, o
 * una fila con `topCm: "abc"`. Sin esta normalización eso no sería un rechazo
 * sino una excepción —`TypeError` al recorrer, o `P2009` de Prisma—, o sea un
 * **500**, y un 500 hace que `clasificarRespuesta` diga `reintentar` y el mismo
 * lote vuelva para siempre. Lo que el servicio sí valida —ordinales duplicados,
 * un horizonte al revés, profundidades negativas— se queda donde está y vuelve
 * como `rejected` con su razón.
 *
 * El `ordinal` se renumera por posición, igual que hace
 * `horizontesDelFormulario`: es el servidor quien decide la secuencia, no el
 * cliente.
 */
function horizontesDeLaMutacion(v: unknown): HorizonteDelFormulario[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((h): h is Record<string, unknown> => typeof h === "object" && h !== null)
    .map((h, i) => ({
      ordinal: i + 1,
      topCm: numeroOpcional(h.topCm),
      bottomCm: numeroOpcional(h.bottomCm),
      designation: textoOpcional(h.designation),
      colour: textoOpcional(h.colour),
      structure: textoOpcional(h.structure),
      textureByFeel: textoOpcional(h.textureByFeel),
      notes: textoOpcional(h.notes),
    }));
}

export type ParseoDeLote =
  | { ok: true; mutations: PushMutation[]; rechazos: { clientDraftId: string; reason: string }[] }
  | { ok: false; error: string };

export function parsearMutaciones(mutations: readonly unknown[]): ParseoDeLote {
  const parsed: PushMutation[] = [];
  const rechazos: { clientDraftId: string; reason: string }[] = [];

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
      //
      // **`coverageUntil` es la excepción, y no es un adorno.** Es un campo de DÍA
      // (Anexo B §3, `date` en el protocolo) y tiene que llegar al servicio como
      // `Date`, no como texto. `fechaDeDia` lo fija a medianoche UTC y **falla** si
      // la cadena no es un día válido, en vez de dejar que `new Date()` adivine —
      // que es exactamente lo que tumbó la creación de colmenas el 2026-09-11.
      let coverageUntil: Date | null = null;
      if (m.coverageUntil != null && m.coverageUntil !== "") {
        try {
          coverageUntil = fechaDeDia(String(m.coverageUntil), "coverageUntil");
        } catch {
          return { ok: false, error: "mutation_malformed" };
        }
      }
      // Sólo se añade donde significa algo: un conteo de varroa con
      // `coverageUntil` sería un campo que nadie puede leer.
      parsed.push(
        (m.kind === "colony_event"
          ? { ...(m as object), occurredAt, coverageUntil }
          : { ...(m as object), occurredAt }) as PushMutation,
      );
      continue;
    }

    // Captura de parcela: los cuatro tipos de KINDS_DE_PARCELA.
    if (typeof m.kind === "string" && (KINDS_DE_PARCELA as readonly string[]).includes(m.kind)) {
      // Sin `clientDraftId` no hay a quién atribuir el rechazo, así que es 400
      // de lote — la misma frontera que el `kind` desconocido de abajo, y la que
      // el spec fija. CON él, un dato malo se rechaza SOLO y las demás
      // mutaciones del lote se aplican: tumbar el lote entero marcaba `error`
      // todos los borradores, los buenos incluidos, y `syncFieldEvents` los
      // vuelve a recoger en la tanda siguiente — el mismo 400 para siempre.
      if (typeof m.clientDraftId !== "string") return { ok: false, error: "mutation_missing_ids" };
      const clientDraftId = m.clientDraftId;
      const rechazar = (reason: string) => {
        rechazos.push({ clientDraftId, reason });
      };
      if (typeof m.locationId !== "string") {
        rechazar("location_id_required");
        continue;
      }
      // Cada tipo tiene su fecha obligatoria y su campo obligatorio; lo demás lo
      // valida su servicio de dominio y vuelve como `rejected` con su razón.
      if (m.kind === "soil_profile") {
        const describedAt = toDate(m.describedAt);
        if (!describedAt) {
          rechazar("described_at_required");
          continue;
        }
        // Tipado de verdad, no `as PushMutation` sobre un literal: con `horizons`
        // dentro, la aserción directa deja de solapar y TS la rechaza. Declarar
        // la variable con su tipo es además lo que hace que quitar un campo del
        // tipo rompa aquí en vez de pasar callado.
        const perfil: MutacionDePerfilDeSuelo = {
          ...(m as unknown as MutacionDePerfilDeSuelo),
          describedAt,
          horizons: horizontesDeLaMutacion(m.horizons),
        };
        parsed.push(perfil);
        continue;
      }
      if (m.kind === "planting_cohort") {
        parsed.push({ ...(m as object), plantedAt: toDate(m.plantedAt) } as PushMutation);
        continue;
      }
      const sampledAt = toDate(m.sampledAt);
      if (!sampledAt) {
        rechazar("sampled_at_required");
        continue;
      }
      // `sample_code_required` es literalmente la razón que lanza `exigirCodigo`
      // en `lib/traceability/soilSamples.ts`: el operador ve el mismo texto
      // venga el rechazo del parseo o del servicio.
      if (typeof m.sampleCode !== "string" || m.sampleCode.trim() === "") {
        rechazar("sample_code_required");
        continue;
      }
      parsed.push({ ...(m as object), sampledAt } as PushMutation);
      continue;
    }

    // Un `kind` que esta versión no conoce no puede tumbar el lote de los demás.
    // Medido en el cliente: un 400 hace que `clasificarRespuesta` devuelva
    // `rechazar`, y eso marca **todos** los borradores del lote como `error`,
    // los buenos incluidos; y como `syncFieldEvents` vuelve a recoger los
    // `error` en la tanda siguiente, el mismo lote regresa, recibe otro 400, y
    // la cola no se vacía nunca mientras el borrador raro siga dentro.
    // Con `clientDraftId` se puede atribuir el rechazo a su mutación; sin él no,
    // y entonces sí es 400 de lote.
    if (typeof m.kind === "string" && m.kind !== "field_event") {
      if (typeof m.clientDraftId !== "string") return { ok: false, error: "mutation_malformed" };
      rechazos.push({ clientDraftId: m.clientDraftId, reason: "unknown_kind" });
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

  return { ok: true, mutations: parsed, rechazos };
}
