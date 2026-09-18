/**
 * El clima que alguien vio al visitar el sitio.
 *
 * ## Qué corrige, y es lo que más importa de esta pieza
 *
 * El mapa del protocolo daba esta pregunta por **sin sitio** con esta nota: *«Sin columna. El
 * Anexo C lo pide como vital del sitio y lo deja en una capa externa sin proveedor conectado.»*
 *
 * **Esa nota confunde dos preguntas distintas.** El vital del Anexo C es el **«Clima 7 días»**
 * —un *pronóstico*, capa externa, sin proveedor: eso sigue bloqueado y bien bloqueado—. La
 * pregunta del Anexo E es **«Clima observado»**: lo que el apicultor **vio estando ahí**. La
 * segunda no necesita ningún proveedor, y su vocabulario llevaba escrito desde el principio en
 * `protocolos/apiario-campo-v1.json`.
 *
 * Es la segunda vez esta semana que un `sin_sitio` resulta no ser un hueco sino una lectura
 * equivocada de la nota (ADR-143 fue la primera, con `efficacy_note`).
 *
 * ## Los cuatro valores son del protocolo, no míos
 *
 * `despejado`, `nublado`, `viento`, `lluvia`. **No se añadió ninguno**, ni siquiera `otro`: el
 * protocolo no lo declara, y el sitio donde el dueño cambia qué se pregunta es ese JSON —ésa es
 * toda la idea de A9.4—.
 *
 * **Y `neblina` merece su mención**: el marco de investigación de Las Nubes describe el sitio
 * como *«low-elevation cloud-forest environment»*, así que la neblina no es rara ahí. Añadirla
 * es decisión del dueño y se hace **en los dos sitios a la vez** —el JSON y una migración—, que
 * es justo lo que el guardia `tests/arquitectura/enum-del-protocolo.test.ts` vigila desde hoy.
 *
 * Puro, sin `prisma`: el formulario de visita es de cliente.
 */
import type { WeatherObserved } from "../../generated/prisma/client";

export class ClimaInvalido extends Error {}

/**
 * En el orden del protocolo, que no es alfabético: va de mejor a peor para trabajar, y así es
 * como lo lee quien está mirando el cielo antes de abrir una caja.
 */
export const CLIMAS_OBSERVADOS = [
  "despejado",
  "nublado",
  "viento",
  "lluvia",
] as const satisfies readonly WeatherObserved[];

export type ClimaObservado = (typeof CLIMAS_OBSERVADOS)[number];

export function esClimaObservado(valor: unknown): valor is ClimaObservado {
  return typeof valor === "string" && (CLIMAS_OBSERVADOS as readonly string[]).includes(valor);
}

/**
 * La puerta de entrada. Llega como **cadena** del formulario, así que un `as never` dejaría
 * guardar cualquier cosa (ADR-112).
 *
 * El vacío devuelve `null` y **no es un error**: el protocolo marca esta pregunta
 * `"required": false`, y no mirar el cielo no invalida la visita. `null` es «sin registrar»
 * (ADR-080), que es distinto de «despejado».
 */
export function exigeClimaObservado(valor: unknown): ClimaObservado | null {
  const v = typeof valor === "string" ? valor.trim() : "";
  if (v === "") return null;
  if (!esClimaObservado(v)) throw new ClimaInvalido(`clima_observado_desconocido: ${v}`);
  return v;
}
