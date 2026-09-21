import { insumosDeLugar } from "./lugares";

/**
 * Qué `insumos` recibe cada instancia de `RutinasDeLugar` en
 * `app/instalaciones/[id]/page.tsx` (arreglo de revisión, Parte 2 §2a). El
 * permiso `report_condition` se juzga POR LUGAR (`puedeSobreLugar`), así que
 * los insumos ya resueltos de la INSTALACIÓN no son los de una CAMA ni los de
 * un ESTANTE (`drying_rack`). Sólo el bloque de la instalación recibe el
 * valor ya resuelto; cada cama y cada estante reciben `undefined`, para que
 * `RutinasDeLugar` los resuelva con SU PROPIO id (`insumosDeLugar`) — pasarle
 * `insumosDeLaInstalacion` ahí se leería como "ya resuelto, y vacío de
 * verdad" (comentario de `RutinasDeLugar`), que es el mismo hallazgo que la
 * re-revisión final ya cerró una vez para las camas; esta función es el
 * único sitio que decide el prop, así que un guardia de fuente puede exigir
 * que la página pase SIEMPRE por aquí en vez de por la variable de la
 * instalación directamente.
 */
export function insumosParaBloque(
  bloque: "instalacion" | "cama" | "estante",
  insumosDeLaInstalacion: Awaited<ReturnType<typeof insumosDeLugar>>,
): Awaited<ReturnType<typeof insumosDeLugar>> | undefined {
  return bloque === "instalacion" ? insumosDeLaInstalacion : undefined;
}
