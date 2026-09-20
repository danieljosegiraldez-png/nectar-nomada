/**
 * El Brix de la cereza al recibirla: si está madura para entrar al proceso.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.5, sobre
 * `docs/beneficio/11_brix_kinetics.md` §1:
 *
 * | 18,0 – 24,0 °Bx | `INTAKE_OPTIMAL`   |
 * | < 16,0 °Bx      | `INTAKE_UNDERRIPE` |
 * | 0,0 – 32,0 °Bx  | rango físico; fuera → `SENSOR_FAULT` |
 *
 * **Entre 16 y 18, y por encima de 24, el documento no dice nada**, y aquí no se inventa un umbral:
 * sale `SIN_VEREDICTO`, que no es un estado del contrato sino la ausencia de uno. Fuera del rango
 * físico el valor se guarda igual, con `SENSOR_FAULT`: descartar un dato de campo lo destruye.
 */
import { BRIX_PHYSICAL_MAX, BRIX_PHYSICAL_MIN } from "./perfiles";

export type VeredictoBrixDeRecepcion = "INTAKE_OPTIMAL" | "INTAKE_UNDERRIPE" | "SIN_VEREDICTO" | "SENSOR_FAULT";

export const BRIX_INTAKE_OPTIMO_MIN = 18.0;
export const BRIX_INTAKE_OPTIMO_MAX = 24.0;
export const BRIX_INTAKE_INMADURA_BAJO = 16.0;

export function evaluarBrixDeRecepcion(bx: number): VeredictoBrixDeRecepcion {
  // El mismo predicado que `evaluarBrix` (lib/beneficio/brix.ts). Con NaN, las dos comparaciones
  // dan falso y sale SENSOR_FAULT: un NaN nunca puede halagar el veredicto.
  if (!(bx > BRIX_PHYSICAL_MIN && bx <= BRIX_PHYSICAL_MAX)) return "SENSOR_FAULT";
  if (bx >= BRIX_INTAKE_OPTIMO_MIN && bx <= BRIX_INTAKE_OPTIMO_MAX) return "INTAKE_OPTIMAL";
  if (bx < BRIX_INTAKE_INMADURA_BAJO) return "INTAKE_UNDERRIPE";
  return "SIN_VEREDICTO";
}
