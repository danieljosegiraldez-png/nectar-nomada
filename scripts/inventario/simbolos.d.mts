/** El archivo del servicio de autorización, relativo a la raíz del proyecto. */
export declare const SERVICIO: string;
/** Las tres puertas del servicio por las que pasa toda autorización. */
export declare const RAICES: readonly string[];
/** `archivo:nombre`, la clave con que se identifica una unidad. */
export declare function clave(archivo: string, nombre: string): string;

export interface Autorizacion {
  /** quién llama a quién, por símbolo resuelto, con claves relativas. */
  readonly aristas: Map<string, Set<string>>;
  /** las claves de las tres puertas del servicio. */
  readonly puertas: Set<string>;
  /** cierre transitivo: quién alcanza una puerta, directa o por saltos. */
  readonly autorizan: Set<string>;
  readonly archivos: number;
  readonly llamadas: number;
  readonly resueltas: number;
}

/**
 * Construye un `ts.Program` con comprobador de tipos y resuelve cada llamada
 * hasta la declaración real de su símbolo. **Cuesta ~16-23 s y ~1,8 GB** sobre
 * este árbol, medido el 2026-10-04.
 */
export declare function autorizacionPorSimbolo(opciones?: {
  raiz?: string;
  servicio?: string;
  raices?: readonly string[];
}): Autorizacion;
