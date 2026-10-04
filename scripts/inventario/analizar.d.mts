/**
 * El contrato del detector, declarado porque `allowJs` es `false` y en este
 * repositorio **no había ni un import de `.mjs` desde TypeScript** (medido el
 * 2026-10-04: cero). Sin esto, el guardia que llama al detector con entrada
 * hostil no compila.
 *
 * Y de paso nombra las nueve clases. Las tres compuertas comparan `clase`
 * contra cadenas literales; con la union, una errata deja de ser un `false`
 * silencioso y pasa a ser un error de tipos.
 */
export type Clase =
  | "guardia directo"
  | "guardia transitivo"
  | "acotado por construcción"
  | "público por diseño"
  | "previo a la sesión"
  | "firma"
  | "recibe principal, sin guardia visible"
  | "depende del llamador (verificar a mano)"
  | "SIN CLASIFICAR";

export interface Fila {
  readonly archivo: string;
  readonly nombre: string;
  /** Los modelos que toca, más `"SQL-crudo"` si alcanza SQL sin pasar por modelos. */
  readonly modelos: readonly string[];
  readonly guardias: readonly string[];
  readonly principal: boolean;
  readonly transitivo: readonly string[];
  readonly acotado: boolean;
  readonly clase: Clase;
  /** Se borra al emitir la fila: el cuerpo no sale del detector. */
  readonly cuerpo?: undefined;
}

/** `fuentes` es ruta -> texto; `modelos`, lo que devuelve `modelosDelEsquema`. */
export declare function analizar(fuentes: Map<string, string>, modelos: Set<string>): Fila[];

/** Con `/g`: sirve para `match`/`matchAll`, **no** para `.test()` (guarda estado). */
export declare const GUARDIAS: RegExp;
