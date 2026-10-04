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

/**
 * Qué nombres invoca cada archivo, como **nodos**: un nombre en un comentario o
 * en una cadena no es una invocación.
 */
export declare function invocacionesPorArchivo(fuentes: Map<string, string>): Map<string, Set<string>>;

/**
 * Qué archivos autorizan: alguno de sus nodos **llama** al servicio de
 * autorización o a un guardia por convención de nombre.
 *
 * **No puede ver** una página que autoriza llamando a un servicio que lanza un
 * error de acceso y lo convierte en `notFound()`; eso es el escalón 2 de
 * `PENDING_IMPLEMENTATIONS/007`.
 */
export declare function archivosQueGuardan(fuentes: Map<string, string>): Set<string>;
