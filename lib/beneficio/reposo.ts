/**
 * El reposo del café: la edad entre el fin del secado y hoy, contra los dos
 * umbrales del perfil.
 *
 * **Es una edad, no una fase.** No se declara, no se cierra y no hay tabla para
 * él: se calcula al leer, como el envejecimiento del biochar. Tratarlo como un
 * estado cerrado —que es hacia donde iba el primer diseño— haría imposible el
 * trabajo normal, porque un lote puede estar meses sin vender **con muestras
 * saliendo todo el tiempo**.
 *
 * **Y no bloquea nada.** Las dos lecturas que devuelve son para enseñar junto al
 * lote, no para cerrar puertas. Decisión de Daniel, 2026-09-16: la venta
 * temprana avisa y pasa, porque «depende el arreglo» — un comprador puede
 * aceptar menos reposo, o el precio puede reflejarlo, y bloquear una venta
 * legítima porque el sistema cree saber más que quien negocia es peor que
 * registrarla marcada.
 *
 * Spec: docs/superpowers/specs/2026-09-16-reposo-trilla-y-subproductos-design.md §A.
 */

/** Lectura de una de las dos compuertas. Ninguna impide nada. */
export type CompuertaDeReposo = "TEMPRANA" | "EN_PLAZO" | "SIN_UMBRAL";

export interface EstadoDeReposo {
  /**
   * Nulo cuando el reloj no arrancó: sin fin de secado, o con un fin que no
   * llegó a objetivo. **Nulo no es cero**: cero días significaría «terminó hoy»,
   * y eso es una afirmación que aquí no se puede hacer.
   */
  readonly diasDeReposo: number | null;
  readonly muestra: CompuertaDeReposo;
  readonly venta: CompuertaDeReposo;
  /**
   * Lo que faltó para dar una lectura completa. Va hasta la pantalla a
   * propósito, igual que `SIN_INSTRUMENTO_DECLARADO`: la falta de un dato se
   * declara, nunca se calla.
   */
  readonly limitaciones: readonly string[];
}

export interface EntradaDeReposo {
  readonly finDeSecado: Date | null;
  /** `DryingRun.endedOutcome`. El reloj sólo arranca con `target_reached`. */
  readonly desenlace: string | null;
  readonly perfil:
    | { readonly diasParaMuestra: number; readonly diasParaVenta: number }
    | undefined;
  readonly ahora: Date;
}

const MS_POR_DIA = 86_400_000;

export function evaluarReposo(entrada: EntradaDeReposo): EstadoDeReposo {
  const limitaciones: string[] = [];

  // Las dos causas de que el reloj no arranque son distintas y no se mezclan:
  // «nadie cerró el secado» y «se cerró sin llegar» piden cosas distintas a
  // quien lee. Por eso son excluyentes y no se acumulan.
  if (!entrada.finDeSecado) {
    limitaciones.push("SIN_FIN_DE_SECADO");
  } else if (entrada.desenlace !== "target_reached") {
    limitaciones.push("SECADO_SIN_OBJETIVO_ALCANZADO");
  }

  const finDeSecado = entrada.finDeSecado;
  const arranca = finDeSecado !== null && entrada.desenlace === "target_reached";
  const diasDeReposo = arranca
    ? Math.floor((entrada.ahora.getTime() - finDeSecado.getTime()) / MS_POR_DIA)
    : null;

  if (!entrada.perfil) limitaciones.push("PERFIL_SIN_REPOSO");

  const compuerta = (umbral: number | undefined): CompuertaDeReposo => {
    if (umbral === undefined) return "SIN_UMBRAL";
    if (diasDeReposo === null) return "SIN_UMBRAL";
    // Inclusivo: a los 60 días exactos ya está en plazo. El día que se cumple
    // el umbral cuenta, porque el umbral es «60 días de reposo», no «más de 60».
    return diasDeReposo >= umbral ? "EN_PLAZO" : "TEMPRANA";
  };

  return {
    diasDeReposo,
    muestra: compuerta(entrada.perfil?.diasParaMuestra),
    venta: compuerta(entrada.perfil?.diasParaVenta),
    limitaciones,
  };
}
