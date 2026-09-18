/**
 * El vocabulario de artefactos de colmena, sin base detrás: lo usan el servicio
 * (`artefactos.ts`) y el formulario de inspección (cliente) — spec 2026-09-17 §A.
 *
 * Vocabulario cerrado con escape, la regla de Daniel para la alimentación: «que no sea
 * campo libre, que sean variables». Tiene que casar con el enum `HiveFittingKind`; lo
 * comprueba `satisfies` en `artefactos.ts`.
 */
export const TIPOS_DE_ARTEFACTO = [
  "excluidor",
  "reductor_de_piquera",
  "piso_ventilado",
  "alimentador",
  "alza",
  "nodo_de_sensores",
  "otro",
] as const;
export type TipoDeArtefacto = (typeof TIPOS_DE_ARTEFACTO)[number];

/**
 * Los que se declaran con un toque en la inspección. El nodo NO: tiene identidad y permiso
 * propio, y se instala donde se dice CUÁL aparato (spec §7.1).
 */
export const DECLARABLES_EN_INSPECCION = TIPOS_DE_ARTEFACTO.filter((k) => k !== "nodo_de_sensores");
