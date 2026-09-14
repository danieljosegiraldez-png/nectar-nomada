/**
 * El vocabulario de la consulta a vecinos, **sin `prisma` detrás**.
 *
 * **Por qué nace ya separado.** Es la **quinta** vez que el módulo apícola necesita este
 * reparto: `infestacion.ts`, `alimentacion.ts`, `vocabularioDeTratamiento.ts` y
 * `motivoDeTraslado.ts` existen por lo mismo. El formulario de la consulta es
 * `"use client"` y necesita los tres resultados para pintar su desplegable; importar un
 * **valor** del servicio arrastraría `prisma` —y con él `pg`— al paquete del navegador,
 * que es lo que rompió producción durante una hora el 2026-09-13. Esta vez se escribe así
 * desde el principio en vez de esperar a que `cliente-sin-prisma` lo cace.
 */
import type { NeighbourConsultationOutcome } from "../../generated/prisma/client";

/** Una entrada que la consulta rechaza. */
export class ConsultaInvalida extends Error {}

/**
 * Los tres resultados posibles. **Los tres son respuestas**, y por eso son un enum y no
 * una fecha anulable: «fuimos y no hay aplicación prevista» es el resultado más valioso
 * del protocolo, y guardado como «sin fecha» sería indistinguible de «nadie preguntó».
 */
export const RESULTADOS_DE_CONSULTA = [
  "sin_aplicacion_prevista",
  "aplicacion_prevista",
  "no_se_pudo_consultar",
] as const satisfies readonly NeighbourConsultationOutcome[];

export type ResultadoDeConsulta = (typeof RESULTADOS_DE_CONSULTA)[number];

export function exigeResultadoDeConsulta(valor: unknown): ResultadoDeConsulta {
  if (typeof valor !== "string" || !(RESULTADOS_DE_CONSULTA as readonly string[]).includes(valor)) {
    throw new ConsultaInvalida("resultado_de_consulta_desconocido");
  }
  return valor as ResultadoDeConsulta;
}

/**
 * Cada cuántos días toca volver a consultar. **El Anexo dice «protocolo mensual»**, y 30
 * días es lo que eso significa aquí: no se usa «mismo día del mes siguiente» porque
 * entonces una consulta del 31 de enero no tendría fecha en febrero.
 */
export const DIAS_DE_CADENCIA_DE_CONSULTA = 30;

/**
 * Con cuántos días de antelación se avisa. Siete, **el mismo número que el aviso del
 * alimento** (`DIAS_DE_AVISO_DE_ALIMENTO`): son los dos avisos que se atienden planificando
 * la próxima ida, no corriendo, y dos antelaciones distintas para la misma decisión sólo
 * harían que una de las dos se ignorase.
 */
export const DIAS_DE_AVISO_DE_CONSULTA = 7;

const DIA = 86_400_000;

export type EstadoDeConsulta = "sin_consultar" | "vencida" | "por_vencer" | "al_dia";

/**
 * En qué estado está el protocolo de un sitio. **Espeja `clasificarAlcance`** de
 * `alimentacion.ts` a propósito: es la misma forma de pregunta —«¿esto sigue cubierto, va
 * a vencer, o ya venció?»— y dos clasificadores con formas distintas para la misma
 * pregunta terminan dando veredictos distintos.
 *
 * **`sin_consultar` no es «vencida»**, y la diferencia importa: un apiario nuevo no ha
 * incumplido nada, sólo no tiene historia. Tratarlos igual haría que el sitio recién
 * creado gritara el primer día y que nadie distinguiera «nunca» de «hace mucho».
 *
 * Puro y exportado: se prueba con la entrada hostil sin construir un apiario.
 */
export function clasificarConsulta(
  ultimaConsulta: Date | null | undefined,
  ahora: Date,
  dentroDeDias: number = DIAS_DE_AVISO_DE_CONSULTA,
  cadenciaEnDias: number = DIAS_DE_CADENCIA_DE_CONSULTA,
): EstadoDeConsulta {
  if (!ultimaConsulta) return "sin_consultar";
  const vence = ultimaConsulta.getTime() + cadenciaEnDias * DIA;
  if (ahora.getTime() >= vence) return "vencida";
  if (ahora.getTime() + dentroDeDias * DIA >= vence) return "por_vencer";
  return "al_dia";
}

/**
 * Días que faltan para que venza el protocolo. **Negativo significa que ya venció, y por
 * cuánto** — es el número que decide si esto se atiende hoy.
 *
 * Hacia arriba con `Math.ceil`, como `diasDeAlcance` y `carenciasVigentes`: medio día que
 * queda sigue siendo un día en el que el protocolo está cumplido.
 */
export function diasHastaLaProximaConsulta(
  ultimaConsulta: Date,
  ahora: Date,
  cadenciaEnDias: number = DIAS_DE_CADENCIA_DE_CONSULTA,
): number {
  const vence = ultimaConsulta.getTime() + cadenciaEnDias * DIA;
  return Math.ceil((vence - ahora.getTime()) / DIA);
}
