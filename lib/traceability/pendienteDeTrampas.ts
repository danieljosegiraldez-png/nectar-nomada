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
  status: "active" | "removed" | "dead";
  /** `dia` es campo de día `YYYY-MM-DD` (la revisión se guarda a medianoche UTC). */
  ultimaRevision: { dia: string; brocaLevel: NivelDeBroca } | null;
  instaladaEl: string; // día YYYY-MM-DD
}

export interface ReglaParaAviso {
  triggerLevel: NivelDeBroca;
  normalDays: number;
  alertDays: number;
  suggestedAction: string;
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
}): Aviso[] {
  const { regla } = e;
  if (regla == null) return [];
  const disparador = ESCALA.indexOf(regla.triggerLevel);

  const avisos: Aviso[] = [];
  for (const t of e.trampas) {
    // Una retirada o muerta no se revisa.
    if (t.status !== "active") continue;

    const lectura = t.ultimaRevision?.brocaLevel;
    const disparo = lectura != null && ESCALA.indexOf(lectura) >= disparador;

    // Nunca revisada: el plazo corre desde la instalación.
    const desde = t.ultimaRevision?.dia ?? t.instaladaEl;
    const plazo = disparo ? regla.alertDays : regla.normalDays;
    // El día exacto del vencimiento todavía no avisa: sólo un retraso > 0.
    const diasDeRetraso = diasEntre(desde, e.hoy) - plazo;
    if (diasDeRetraso > 0) {
      avisos.push({ tipo: "trampa_por_revisar", specimenId: t.id, trapNumber: t.trapNumber, diasDeRetraso });
    }

    if (disparo) {
      avisos.push({
        tipo: "trampa_con_lectura_alta",
        specimenId: t.id,
        trapNumber: t.trapNumber,
        lectura: lectura,
        accion: regla.suggestedAction,
      });
    }
  }
  return avisos;
}
