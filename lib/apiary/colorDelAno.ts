/**
 * El color del año — spec docs/superpowers/specs/2026-09-18-alzas-y-tandas-de-marcos-design.md §5.1.
 *
 * Daniel, 2026-09-18: «todas las abejas reinas nacidas ese año reciben ese apodo y color y toda la
 * cera nueva de ese año que entra como marco en alza o cámara de cría recibe esa marca color». Es
 * el código internacional de las reinas, y se repite cada cinco años. **Nadie elige el color: se
 * calcula del año.** Módulo puro, sin base: lo usan el servicio y la pantalla.
 */

export type ColorDeAño = "blanco" | "amarillo" | "rojo" | "verde" | "azul";

/** Por el último dígito del año: 1 y 6 blanco, 2 y 7 amarillo, 3 y 8 rojo, 4 y 9 verde, 5 y 0 azul. */
const POR_RESTO = ["azul", "blanco", "amarillo", "rojo", "verde"] as const satisfies readonly ColorDeAño[];

export function colorDelAño(año: number): ColorDeAño {
  if (!Number.isInteger(año)) throw new RangeError("año_invalido");
  return POR_RESTO[(((año % 5) + 5) % 5) as 0 | 1 | 2 | 3 | 4];
}

/**
 * Cuándo avisar — spec §7.1, contestada por Daniel («2-4 years»): a los 2 años, revisar esa cera;
 * a los 4, ya debería estar renovada. Igual para cámara de cría y alza. Una sola constante para
 * cambiarlo en un sitio.
 */
export const UMBRALES_DE_CERA = { revisar: 2, renovar: 4 } as const;

export type AvisoDeCera = "revisar" | "renovar" | null;

export function avisoDeCera(edad: number): AvisoDeCera {
  if (edad >= UMBRALES_DE_CERA.renovar) return "renovar";
  if (edad >= UMBRALES_DE_CERA.revisar) return "revisar";
  return null;
}
