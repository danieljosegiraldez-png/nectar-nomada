/**
 * Armar la `EntradaDelLote` que `veredictoDelLote` consume.
 *
 * **Por qué existe.** Esta regla vivía dentro de `app/lots/[id]/page.tsx` y era la única copia:
 * el tablero del beneficio tenía que repetirla para cada lote, y dos copias de «de dónde sale el
 * grado en reposo» divergen el día que una se corrige. Ahora la ficha y el tablero llaman a la
 * misma función, así que **no pueden discrepar**.
 *
 * **Por qué es PURA, y no el cargador `async` que el plan pedía.** El plan (tarea 1) decía mover
 * las líneas 312–345 de la ficha. Al ejecutarlo se midió que dependen de `measurements`,
 * `fermentationRuns` y `dryingRuns`, que salen del cargador grande de la ficha — el que trae
 * además linaje, tareas y auditoría. Un tablero que llamara a eso **por lote** pagaría todo
 * aquello por nada. Así que se extrae la **regla** y cada llamador aporta sus datos: la ficha los
 * que ya cargó, el tablero los que consulte estrecho.
 *
 * Y siendo pura, su prueba es **hermética** y la corre `scripts/ci.sh` sin base.
 */
import { faseDelLote } from "./reposo";
import type { EntradaDelLote, MedicionDelLote } from "./desdeElLote";
import type { EstadoDeVerificacion } from "../equipos/verificacion";

/** Lo mínimo que esta función necesita de una medición guardada. */
export interface MedicionCruda {
  readonly id: string;
  readonly variable: string;
  readonly value: number;
  readonly occurredAt: Date;
  readonly provenanceClass: string;
  /** El id de la medición a la que ÉSTA corrige, si corrige alguna. */
  readonly correctsId: string | null;
  readonly instrumentId: string | null;
}

/** Lo mínimo de un proceso del lote. */
export interface ProcesoCrudo {
  readonly endedAt: Date | null;
  /** El `value` del catálogo `grado_proceso`, tal cual. */
  readonly gradoDeProceso: string | null;
}

export interface EntradaDelLoteInput {
  readonly fermentacionAbierta: { readonly startedAt: Date } | null;
  readonly secadoAbierto: { readonly startedAt: Date } | null;
  readonly ultimoSecadoTerminado: { readonly endedAt: Date; readonly endedOutcome: string | null } | null;
  /**
   * Los procesos del lote **en el orden en que los devuelve `listarProcesosDeLote`**, del más
   * viejo al más nuevo. El orden importa: en reposo se toma el último.
   */
  readonly procesos: readonly ProcesoCrudo[];
  readonly mediciones: readonly MedicionCruda[];
  /**
   * **Los ids de las mediciones del lote que YA FUERON CORREGIDAS**, calculados sobre **todas** sus
   * mediciones y no sólo sobre las de `mediciones`.
   *
   * **Por qué entra en vez de deducirse aquí** (`PENDING_IMPLEMENTATIONS/018`): se armaba con los
   * `correctsId` de `mediciones`, que llega ya acotada a la fase abierta. Y `correctMeasurement`
   * permite corregir la **fecha**, así que una corrección puede caer antes del inicio de la fase: la
   * corrección queda fuera de esa lista, su `correctsId` no entra en el conjunto, y la original —ya
   * corregida— vuelve a contarse como vigente.
   *
   * La vigencia de una medición es una propiedad de la **cadena de correcciones**, no de la ventana
   * de la pantalla. Se resuelve antes, y por eso el conjunto lo arma quien consulta.
   *
   * **Obligatorio y sin valor por defecto, a propósito:** un llamador que lo olvide no compila. Con
   * un `?? new Set()` el defecto volvería en silencio, que es exactamente cómo llegó.
   */
  readonly idsCorregidos: ReadonlySet<string>;
  /** Cómo estaba el instrumento **en el instante de cada lectura**, por id de medición. */
  readonly estadosDeInstrumento: ReadonlyMap<string, EstadoDeVerificacion>;
  readonly ahora: Date;
}

/**
 * La entrada del veredicto, o `null` si el lote no tiene fase abierta.
 *
 * Devuelve `null` y no una entrada vacía porque «no hay fase» no es «hay fase y no se sabe nada»:
 * lo segundo lo dice `veredictoDelLote` con un `SinVeredicto`, que la pantalla puede explicar.
 */
export function entradaDelLote(input: EntradaDelLoteInput): EntradaDelLote | null {
  const fase = faseDelLote({
    fermentacionAbierta: input.fermentacionAbierta,
    secadoAbierto: input.secadoAbierto,
    ultimoSecadoTerminado: input.ultimoSecadoTerminado,
  });
  if (!fase) return null;

  // La corrección supersede a la original, y los motores la excluyen del cálculo.
  //
  // **El conjunto YA NO se arma aquí** (`PENDING_IMPLEMENTATIONS/018`). Se armaba con los
  // `correctsId` de `input.mediciones`, que llega acotada a la fase abierta, así que una corrección
  // con fecha anterior al inicio de la fase quedaba fuera y la original volvía a contarse como
  // vigente. Lo calcula quien consulta, sobre TODAS las mediciones del lote; ver `idsCorregidos`.
  const corregidas = input.idsCorregidos;

  const procesoAbierto = input.procesos.find((p) => p.endedAt === null) ?? null;
  // En reposo NO hay proceso abierto —el secado ya terminó— así que el grado, y con él los
  // umbrales, salen del último proceso que corrió. Sin esto el lote en reposo caería por
  // `GRADO_SIN_PERFIL` y no enseñaría ningún día.
  const procesoDelVeredicto =
    fase.tipo === "reposo" ? (input.procesos[input.procesos.length - 1] ?? null) : procesoAbierto;

  const mediciones: MedicionDelLote[] = input.mediciones.map((m) => ({
    variable: m.variable,
    value: m.value,
    occurredAt: m.occurredAt,
    provenanceClass: m.provenanceClass,
    fueCorregida: corregidas.has(m.id),
    // `SIN_INSTRUMENTO` es el estado REAL de casi toda lectura de hoy: la columna acaba de
    // existir y nadie la ha rellenado. Tratar el hueco como avería apagaría la pantalla entera.
    estadoDelInstrumento: input.estadosDeInstrumento.get(m.id) ?? "SIN_INSTRUMENTO",
  }));

  return {
    fase,
    gradoDeProceso: procesoDelVeredicto?.gradoDeProceso ?? null,
    mediciones,
    ahora: input.ahora,
  };
}
