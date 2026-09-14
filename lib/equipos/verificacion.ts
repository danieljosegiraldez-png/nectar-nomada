/**
 * ¿Estaba este instrumento verificado cuando produjo esta lectura?
 *
 * Dominio puro: aritmética y fechas, sin Prisma y sin red. Quien lo llama trae
 * las verificaciones ya leídas.
 *
 * ## La regla es de Daniel, del 2026-09-14, y NO es la del documento
 *
 * `docs/beneficio/02_calibration.md` §3 y `EQUIPMENT_AND_READINESS.md` §7 daban
 * por supuesta una vigencia de **calendario** —«24 h en cosecha activa», «7
 * días»— con la columna marcada `[PROVISIONAL]`, que es justo donde faltaba el
 * dueño. Él la cerró con otra cosa:
 *
 * > «cada aplicación se hace una prueba de refractómetro con agua, y que debe
 * > estar en 0 brix, o si es pHímetro específico, se debe poner una referencia
 * > de solución 4.0 pH y otra de 7.0 y o 10 […] entonces no se debe calibrar si
 * > se han realizado estas pruebas positivamente que están bajo el rango óptimo,
 * > y están por decir calibradas, se continúan usando, no se calibran por tiempo
 * > definido solamente […] si se alerta y queda explícito que no está revisado.»
 *
 * **Lo que verifica es el contraste, no el reloj.** El tiempo sólo produce un
 * aviso, y un aviso no descalifica: bloquear se esquiva en el patio —el operario
 * apunta el número en papel y lo mete luego— y entonces la plataforma tiene una
 * lectura con PEOR procedencia y ningún rastro de que la revisión estuviera en
 * duda. El hecho se captura igual; bloquear sólo decide si el sistema se entera.
 *
 * ## Y lo que este módulo NO hace
 *
 * No decide si una lectura vale: **devuelve un estado y su confianza, y quien
 * mira decide.** Es la misma autonomía que gobierna los cuatro motores de
 * `lib/beneficio/`: el motor recomienda, la persona frente al tanque resuelve.
 */

import type { DataConfidence } from "../beneficio/ph";

const HORA = 3_600_000;

/**
 * Por qué se cree —o no— que el instrumento estaba bien en ese momento.
 *
 * **`SIN_INSTRUMENTO` no es un fallo del instrumento: es un hueco del registro**,
 * y hoy es el caso de casi todas las lecturas. Tratarlo como una avería apagaría
 * la pantalla entera el día que esto se despliegue, que sería una regresión
 * disfrazada de rigor.
 */
export type EstadoDeVerificacion =
  | "VERIFICADO"
  | "REVISION_VENCIDA"
  | "VERIFICACION_FALLIDA"
  | "SIN_VERIFICACION"
  | "SIN_INSTRUMENTO";

export interface VerificacionDelInstrumento {
  readonly occurredAt: Date;
  /** Derivado en la base por trigger, nunca escrito a mano. Ver la migración. */
  readonly outcome: "pass" | "fail";
}

export interface EntradaDeVerificacion {
  /** `false` cuando la lectura no dice con qué instrumento se tomó. */
  readonly instrumentoDeclarado: boolean;
  /** Todas las del instrumento; este módulo se queda con las anteriores al momento. */
  readonly verificaciones: readonly VerificacionDelInstrumento[];
  /** `Equipment.checkAdvisoryHours`. **Nulo = no vence por tiempo**, el caso por defecto. */
  readonly horasDeAviso: number | null;
  /** Cuándo se tomó la lectura que se está juzgando. */
  readonly momento: Date;
}

/**
 * El estado del instrumento **en el instante de la lectura**, no hoy.
 *
 * Juzgar con las verificaciones posteriores contestaría otra pregunta —«¿está
 * bien ahora?»— y volvería el veredicto de una lectura vieja dependiente de algo
 * que ocurrió después. Es la misma disciplina que `LotTransformation`: lo que se
 * sabía entonces no cambia porque el mundo avance.
 */
export function estadoDeVerificacion(e: EntradaDeVerificacion): EstadoDeVerificacion {
  if (!e.instrumentoDeclarado) return "SIN_INSTRUMENTO";

  const previas = e.verificaciones.filter((v) => v.occurredAt.getTime() <= e.momento.getTime());
  if (previas.length === 0) return "SIN_VERIFICACION";

  // **El empate lo gana el fallo.** Dos verificaciones al mismo instante, una
  // buena y una mala, es un instrumento del que se sospecha: quedarse con la
  // buena porque llegó después en la lista sería dejar que el orden de inserción
  // decida un veredicto de calidad de dato.
  let ultima = previas[0]!;
  for (const v of previas) {
    const t = v.occurredAt.getTime();
    const tu = ultima.occurredAt.getTime();
    if (t > tu || (t === tu && v.outcome === "fail")) ultima = v;
  }

  if (ultima.outcome === "fail") return "VERIFICACION_FALLIDA";
  if (e.horasDeAviso === null) return "VERIFICADO";

  // Semiabierto, como los umbrales de los motores: justo en el límite todavía
  // está revisado. Un instrumento no se estropea al dar la hora en punto.
  const transcurridas = (e.momento.getTime() - ultima.occurredAt.getTime()) / HORA;
  return transcurridas > e.horasDeAviso ? "REVISION_VENCIDA" : "VERIFICADO";
}

/**
 * Qué confianza impone ese estado — **como techo, no como valor**.
 *
 * Devuelve `null` para `SIN_INSTRUMENTO`: no impone nada, porque no saber con qué
 * se midió no es lo mismo que saber que el instrumento estaba mal. Quien llama
 * conserva entonces la confianza que la lectura ya tenía por su procedencia.
 */
export function confianzaPorVerificacion(estado: EstadoDeVerificacion): DataConfidence | null {
  switch (estado) {
    case "SIN_INSTRUMENTO":
      return null;
    case "VERIFICADO":
      return "VALIDATED";
    case "REVISION_VENCIDA":
      // Usable: alimenta curvas y puede avisar. No confirma una crítica.
      return "REVISION_VENCIDA";
    case "VERIFICACION_FALLIDA":
    case "SIN_VERIFICACION":
      // Excluida del cálculo. Una alerta construida sobre un instrumento que
      // falló su contraste tiene aspecto profesional y contenido falso.
      return "UNCALIBRATED";
  }
}

/** Orden de menos a más fiable, para poder tomar el mínimo de dos confianzas. */
const ESCALA: readonly DataConfidence[] = [
  "UNCALIBRATED",
  "REVISION_VENCIDA",
  "RETROSPECTIVE",
  "TEMP_DRIFT_RISK",
  "TEMP_UNCOMPENSATED",
  "VALIDATED",
];

/**
 * La peor de las dos, que es la única combinación defendible.
 *
 * Una lectura corregida tomada con un instrumento impecable sigue siendo una
 * lectura corregida; una lectura impecable tomada con un instrumento que falló
 * su contraste sigue sin poder confirmar nada. **La confianza no se promedia**:
 * cada motivo por separado basta para dudar.
 */
export function peorConfianza(a: DataConfidence, b: DataConfidence): DataConfidence {
  const ia = ESCALA.indexOf(a);
  const ib = ESCALA.indexOf(b);
  // Un valor desconocido no se trata como bueno: si la escala no lo contiene
  // —porque alguien añadió uno y olvidó esta lista— gana el otro.
  if (ia < 0) return b;
  if (ib < 0) return a;
  return ia <= ib ? a : b;
}

/**
 * ¿Debe la pantalla decir en voz alta que este instrumento no está revisado?
 *
 * Es la otra mitad de la decisión de Daniel: el vencimiento **avisa**. Sin esto
 * el estado existiría en la base y no llegaría a nadie, que es como se construye
 * un registro que nadie mira.
 */
export function avisaFaltaDeRevision(estado: EstadoDeVerificacion): boolean {
  return estado === "REVISION_VENCIDA" || estado === "VERIFICACION_FALLIDA" || estado === "SIN_VERIFICACION";
}

/**
 * Si un contraste cae dentro de su tolerancia.
 *
 * **Absoluta y no relativa**, y conviene decir por qué: el primer patrón que
 * Daniel nombró es agua a **0 °Bx**, y cualquier porcentaje de cero es cero — con
 * tolerancia relativa ese contraste no podría pasar nunca, y el síntoma sería
 * «este refractómetro nunca se verifica», que se lee como avería del instrumento
 * en vez de error del criterio.
 */
export function dentroDeTolerancia(observado: number, referencia: number, tolerancia: number): boolean {
  if (!Number.isFinite(observado) || !Number.isFinite(referencia) || !Number.isFinite(tolerancia)) return false;
  return Math.abs(observado - referencia) <= Math.abs(tolerancia);
}
