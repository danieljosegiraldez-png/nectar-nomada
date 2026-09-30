/**
 * La línea de seis etapas del proceso, pura: cuántos lotes hay en cada una, y cuál NO se anota.
 *
 * **Sin base de datos a propósito**, igual que `tablero.ts`: recibe cuentas ya hechas y devuelve
 * la línea en orden, así que su prueba es hermética. Las lecturas viven en otro módulo.
 *
 * **Lo que este módulo existe para impedir** es que un cero y un «sin registro» se confundan.
 * Medido el 2026-09-30 contra `prisma/schema.prisma`: recepción (`RecepcionDeCereza`), proceso
 * (`LotProcess`), secado (`DryingRun`) y almacén (`StorageAssignment`) se registran; la
 * selección se cuenta filtrando `LotTransformation` por `transformationType: "selection"`.
 *
 * **La flotación sí está en el esquema, pero como método de una selección, no como etapa
 * propia**: `LotTransformation.selectionMethodValue`, con `condicionDePesaje` obligatoria sólo
 * cuando el método es `flotacion` —la que moja la cereza—, decisión de Daniel del 2026-09-19.
 * (Las otras dos menciones, `PedidoDeCereza.maxFlotesPct` y
 * `VeredictoDeCalidadDePedido.flotesKg`, son un umbral y parte de un veredicto.) Por eso no se
 * puede contar aquí: un **método pasado** de una transformación no dice **cuánto hay en esa
 * etapa ahora**, que es lo que la línea muestra. Un cero dice «no hay nada ahí»; la flotación no
 * puede decir eso, porque el sistema no lo sabe. Si se pintara `0`, el operario leería que no
 * hay café flotando. §4.5 manda decir «sin registro de esta etapa» justo en este caso.
 *
 * Por eso `flotacion` **no se recibe por parámetro**: que no se pueda pasar es a propósito, para
 * que nadie le meta un cero sin darse cuenta de lo que significa.
 *
 * **Si Daniel decide que la columna cuente «selecciones hechas por flotación»**, es un cambio de
 * esta función pura y de su prueba, sin migración ni datos nuevos: el método ya se guarda.
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

export function lineaDeEtapas(input: {
  readonly recepcion: number;
  readonly seleccion: number;
  readonly proceso: number;
  readonly secado: number;
  readonly almacen: number;
  /** Lotes que piden decisión, por clave de etapa. Sale de `colaDeAtencion`. */
  readonly pidenDecision: Readonly<Record<string, number>>;
}): readonly Etapa[] {
  const cuentas: Record<string, number> = {
    recepcion: input.recepcion,
    seleccion: input.seleccion,
    proceso: input.proceso,
    secado: input.secado,
    almacen: input.almacen,
  };
  return ORDEN.map((clave): Etapa =>
    clave === "flotacion"
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
