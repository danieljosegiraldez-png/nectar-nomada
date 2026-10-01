/**
 * La línea de seis etapas del proceso, pura: cuántos lotes hay en cada una **ahora**, y cuáles
 * NO se anotan.
 *
 * **Sin base de datos a propósito**, igual que `tablero.ts`: recibe cuentas ya hechas y devuelve
 * la línea en orden, así que su prueba es hermética. Las lecturas viven en otro módulo.
 *
 * **Lo que este módulo existe para impedir** es que un cero, un acumulado y un «sin registro» se
 * confundan. La línea responde «cuántos lotes **hay** en cada etapa» y §4.5 del diseño dice que la
 * pieza responde «**dónde se atasca hoy**»: cada cuenta tiene que ser **lo que hay ahora**.
 *
 * **Tres etapas dicen `sin_registro`: recepción, flotación y selección** (decisión de Daniel, el
 * 2026-09-30; ADR-195). Son el mismo caso:
 *
 * - **Proceso, secado y almacén** tienen fin declarado (`LotProcess.endedAt`, `DryingRun.endedAt`,
 *   `StorageAssignment.endedAt`): «hay» es «sin terminar», así que su cuenta es un presente.
 * - **Recepción** (`RecepcionDeCereza`) y **selección** (`LotTransformation` de tipo
 *   `selection`) son **actos pasados**: no tienen fin. Contar los lotes que alguna vez pasaron por
 *   ahí da un **acumulado** —cuántos pasaron—, no un «cuántos hay»; con una temporada encima se
 *   leería «Recepción 847 · Secado 3», y la columna más grande sería la que menos informa.
 * - **Flotación** ni siquiera es una etapa del esquema: es un **método** de una selección
 *   (`LotTransformation.selectionMethodValue`, con `condicionDePesaje` obligatoria sólo cuando el
 *   método es `flotacion` —la que moja la cereza—, decisión de Daniel del 2026-09-19). Un **método
 *   pasado** de una transformación no dice **cuánto hay en esa etapa ahora**. Si se pintara `0`, el
 *   operario leería que no hay café flotando.
 *
 * El mismo razonamiento que prohibía pintar la flotación se aplicaba a las otras dos; aplicarlo a
 * una sola de las tres era una inconsistencia, no una decisión. Un cero dice «no hay nada ahí»; un
 * acumulado dice «pasaron tantos»; ninguno de los dos dice lo que la línea promete, y §4.5 manda
 * decir «sin registro de esta etapa» justo en ese caso.
 *
 * Por eso `recepcion`, `flotacion` y `seleccion` **no se reciben por parámetro**: que no se pueda
 * pasar es a propósito, para que nadie les meta un número sin darse cuenta de lo que significa.
 *
 * **Qué haría falta para que contaran de verdad** —no es un olvido, es una decisión—: una
 * condición de **vigencia**, es decir, lo que hace «sin terminar» a las otras tres:
 * - «en recepción» = recibido y **sin selección aún**;
 * - «en selección» = con selección y **sin proceso abierto**;
 * - «en flotación» no tiene forma sin una etapa propia en el esquema: hoy es un método.
 * Con esas condiciones el cambio es de esta función pura, de su prueba y de `datosDelTablero.ts`
 * (las dos consultas que ADR-195 quitó), sin migración para las dos primeras.
 *
 * Diseño: `docs/superpowers/specs/2026-09-16-tablero-del-beneficio-design.md` §4.5.
 */

export type EstadoDeEtapa =
  | { readonly tipo: "cuenta"; readonly lotes: number; readonly pidenDecision: number }
  | { readonly tipo: "sin_registro" };

export interface Etapa {
  readonly clave: "recepcion" | "flotacion" | "seleccion" | "proceso" | "secado" | "almacen";
  readonly estado: EstadoDeEtapa;
}

/** Las etapas en el orden del proceso. La pantalla no debe poder reordenarlas. */
const ORDEN = ["recepcion", "flotacion", "seleccion", "proceso", "secado", "almacen"] as const;

/** Las que no cuentan, por lo dicho arriba. Un solo sitio: no se reparte entre ramas. */
const SIN_REGISTRO: ReadonlySet<string> = new Set(["recepcion", "flotacion", "seleccion"]);

export function lineaDeEtapas(input: {
  readonly proceso: number;
  readonly secado: number;
  readonly almacen: number;
  /** Lotes que piden decisión, por clave de etapa. Sale de `colaDeAtencion`. */
  readonly pidenDecision: Readonly<Record<string, number>>;
}): readonly Etapa[] {
  const cuentas: Record<string, number> = {
    proceso: input.proceso,
    secado: input.secado,
    almacen: input.almacen,
  };
  return ORDEN.map((clave): Etapa =>
    SIN_REGISTRO.has(clave)
      ? { clave, estado: { tipo: "sin_registro" } }
      : {
          clave,
          estado: {
            tipo: "cuenta",
            lotes: cuentas[clave] ?? 0,
            pidenDecision: input.pidenDecision[clave] ?? 0,
          },
        },
  );
}
