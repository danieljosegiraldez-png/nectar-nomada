import type { Aviso } from "./pendienteDeLaParcela";

/**
 * Los avisos de las trampas de broca — spec de trampas §6.
 *
 * Pura, como `pendienteDeLaParcela`: recibe «hoy» ya calculado (`diaDeHoy`) y
 * las trampas ya leídas, y no consulta la base.
 *
 * **Sin regla no hay avisos**, por vencida que esté una trampa: no se inventa
 * el quincenal de ninguna guía. Y una regla sugiere, no actúa: el aviso de
 * lectura alta sólo lleva el texto de la acción que escribió el encargado.
 *
 * Las reglas miran la ESCALA, nunca el número de capturas.
 */
export type NivelDeBroca = "ninguno" | "pocos" | "algunos" | "muchos";

/** El orden de la escala: «disparó» es índice ≥ índice del disparador. */
const ESCALA: readonly NivelDeBroca[] = ["ninguno", "pocos", "algunos", "muchos"];

export interface TrampaParaAviso {
  id: string;
  trapNumber: number | null;
  bloque: string | null;
  /**
   * El bloque de VERDAD (FK), a diferencia de `bloque` que es su nombre para
   * mostrar. Es lo que compara «atendido» contra `plotBlockIds` de una
   * intervención — spec §4.2. `null` = trampa sin bloque, y a esa sólo la
   * cubre una intervención sobre la parcela entera.
   */
  plotBlockId: string | null;
  status: "active" | "removed" | "dead";
  /**
   * `dia` es campo de día `YYYY-MM-DD` (la revisión se guarda a medianoche UTC).
   * `brocaLevel` nulo es una revisión vieja sin lectura: cuenta como visita
   * —el plazo corre desde su día— y como «no disparó». Descartarla movería el
   * plazo hacia atrás, a una revisión anterior o a la instalación.
   *
   * **F7 fix-final**: si `dia` es ANTERIOR a `instaladaEl`, `avisosDeTrampas`
   * la trata como si no existiera — es de un ciclo cerrado por un retiro y
   * reinstalación posteriores, y ni cuenta como visita ni puede disparar.
   *
   * `id` y `observedAt` (el INSTANTE, no el día) son la Tarea 4: hacen falta
   * para nombrar la observación que motivó el aviso y para comparar contra
   * `occurredAt` de una intervención con la precisión que pide «atendido»
   * (spec §4.2) — un `>` de instantes, no de días.
   */
  ultimaRevision: { id: string; dia: string; observedAt: Date; brocaLevel: NivelDeBroca | null } | null;
  /**
   * Día `YYYY-MM-DD` de la última observación `installed` O `reinstalled`
   * (lo que sea más reciente); `null` si no hay ninguna. Es la fecha de la
   * activación VIGENTE, no necesariamente la primera vez que se instaló.
   */
  instaladaEl: string | null;
}

export interface ReglaParaAviso {
  triggerLevel: NivelDeBroca;
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
  /** Tarea 4, spec §4.2: la regla puede apuntar a un producto del catálogo. */
  suggestedMaterial: { id: string; name: string } | null;
}

/**
 * Una intervención vigente de la MISMA parcela que la trampa — Tarea 4, spec
 * §4.2. Sólo lo que hace falta para juzgar si «cubre»: nunca el `kind`, porque
 * cualquier tipo cuenta igual, también un manejo cultural (la regla sugiere,
 * no manda).
 */
export interface IntervencionQueCubre {
  occurredAt: Date;
  parcelaEntera: boolean;
  plotBlockIds: readonly string[];
}

/**
 * Días de `desde` a `hasta`, dos cadenas `YYYY-MM-DD`. Con `Date.UTC` y sin
 * zona horaria: un día es un día, sin horario de verano que reste una hora.
 */
function diasEntre(desde: string, hasta: string): number {
  const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

export function avisosDeTrampas(e: {
  hoy: string;
  trampas: readonly TrampaParaAviso[];
  regla: ReglaParaAviso | null;
  /** Vigentes de la MISMA parcela — spec §4.2. Sin este parámetro nada atiende. */
  intervenciones: readonly IntervencionQueCubre[];
}): Aviso[] {
  const { regla } = e;
  if (regla == null) return [];
  const disparador = ESCALA.indexOf(regla.triggerLevel);

  const avisos: Aviso[] = [];
  for (const t of e.trampas) {
    // Una retirada o muerta no se revisa.
    if (t.status !== "active") continue;

    // F7 fix-final — una revisión de ANTES de la última instalación/
    // reinstalación es de un ciclo cerrado: ni cuenta como visita ni puede
    // disparar nada. Sin esto, retirar una trampa con una lectura alta y
    // reinstalarla meses después seguía proponiendo la acción de esa lectura
    // vieja, y el plazo corría desde ella en vez de desde la reinstalación.
    // Comparación de cadenas `YYYY-MM-DD`, válida porque son ISO.
    const revisionVigente =
      t.ultimaRevision != null && (t.instaladaEl == null || t.ultimaRevision.dia >= t.instaladaEl)
        ? t.ultimaRevision
        : null;

    const lectura = revisionVigente?.brocaLevel;
    const disparo = lectura != null && ESCALA.indexOf(lectura) >= disparador;

    // Nunca revisada (o la única revisión es de antes de reinstalar): el
    // plazo corre desde la instalación/reinstalación. Sin eso y sin
    // instalación registrada no hay desde dónde contar, y no se inventa uno.
    const desde = revisionVigente?.dia ?? t.instaladaEl;
    const plazo = disparo ? regla.alertDays : regla.normalDays;
    // El día exacto del vencimiento todavía no avisa: sólo un retraso > 0.
    const diasDeRetraso = desde == null ? 0 : diasEntre(desde, e.hoy) - plazo;
    if (diasDeRetraso > 0) {
      avisos.push({ tipo: "trampa_por_revisar", specimenId: t.id, trapNumber: t.trapNumber, diasDeRetraso });
    }

    // Spec §4.2: «atendido» apaga SÓLO este aviso, nunca `trampa_por_revisar`
    // (la trampa sigue con su plazo). Cubre cualquier intervención vigente de
    // ESTA parcela, posterior a la lectura que disparó — estrictamente
    // posterior: una simultánea no cuenta. Una trampa sin bloque sólo la
    // cubre una intervención sobre la parcela entera; con bloque, también una
    // que incluya ese bloque. Nunca una intervención sobre plantas sueltas
    // (esas no llegan aquí como `parcelaEntera` ni aportan a `plotBlockIds`,
    // ver `intervencionesVigentes`).
    const atendida =
      disparo &&
      revisionVigente != null &&
      e.intervenciones.some(
        (i) =>
          i.occurredAt.getTime() > revisionVigente.observedAt.getTime() &&
          (i.parcelaEntera || (t.plotBlockId != null && i.plotBlockIds.includes(t.plotBlockId))),
      );

    if (disparo && !atendida) {
      avisos.push({
        tipo: "trampa_con_lectura_alta",
        specimenId: t.id,
        trapNumber: t.trapNumber,
        lectura: lectura,
        accion: regla.suggestedAction,
        observationId: revisionVigente!.id,
        plotBlockId: t.plotBlockId,
        materialId: regla.suggestedMaterial?.id ?? null,
        materialName: regla.suggestedMaterial?.name ?? null,
      });
    }
  }
  return avisos;
}

/**
 * De las trampas que devuelve `getPlotDetail` a la entrada de `avisosDeTrampas`.
 *
 * Los dos días salen de campos de día (medianoche UTC), así que su día es
 * `toISOString().slice(0, 10)`, sin zona. Una revisión sin lectura NO se
 * descarta: pasa con `brocaLevel: null` (ver `TrampaParaAviso`).
 */
export function trampasParaAviso(
  trampas: readonly {
    id: string;
    trapNumber: number | null;
    bloque: string | null;
    plotBlockId: string | null;
    status: TrampaParaAviso["status"];
    instaladaEl: Date | null;
    ultimaRevision: { id: string; observedAt: Date; brocaLevel: NivelDeBroca | null } | null;
  }[],
): TrampaParaAviso[] {
  const dia = (d: Date) => d.toISOString().slice(0, 10);
  return trampas.map((t) => ({
    id: t.id,
    trapNumber: t.trapNumber,
    bloque: t.bloque,
    plotBlockId: t.plotBlockId,
    status: t.status,
    instaladaEl: t.instaladaEl == null ? null : dia(t.instaladaEl),
    ultimaRevision:
      t.ultimaRevision == null
        ? null
        : { id: t.ultimaRevision.id, dia: dia(t.ultimaRevision.observedAt), observedAt: t.ultimaRevision.observedAt, brocaLevel: t.ultimaRevision.brocaLevel },
  }));
}
