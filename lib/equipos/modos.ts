// lib/equipos/modos.ts
import type { MaterialState } from "../../generated/prisma/client";

export interface ModoDeMedicion {
  readonly id: string;
  readonly label: string;
  readonly materialState: MaterialState;
  readonly rangeMin: number | null;
  readonly rangeMax: number | null;
}

/** El modo que este material pide, o `null` si el aparato no tiene ninguno. */
export function modoEsperado(
  material: MaterialState,
  modos: readonly ModoDeMedicion[],
): ModoDeMedicion | null {
  return modos.find((m) => m.materialState === material) ?? null;
}

/**
 * Sólo afirma desajuste cuando se sabe modo Y material. Un nulo es ignorancia,
 * y tratarla como error convertiría «no lo sabemos» en una acusación.
 */
export function hayDesajuste(
  modo: ModoDeMedicion | null,
  material: MaterialState | null,
): boolean {
  if (!modo || !material) return false;
  return modo.materialState !== material;
}

/** Fuera del rango el aparato no da número: no es un cero, es una no-lectura. */
export function fueraDeRango(modo: ModoDeMedicion, valor: number): boolean {
  if (modo.rangeMin != null && valor < modo.rangeMin) return true;
  if (modo.rangeMax != null && valor > modo.rangeMax) return true;
  return false;
}
