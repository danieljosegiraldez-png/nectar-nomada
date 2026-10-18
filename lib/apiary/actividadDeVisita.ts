import type { VisitPurpose } from "../../generated/prisma/client";

/*
 * Vive aparte de `pendienteDeLaVisita.ts` para que se pueda importar sin la base: la pantalla de la
 * visita y la prueba de sus etiquetas lo leen, y aquel módulo arrastra `prisma`.
 */

/**
 * Lo que un registro de la visita le hizo a una caja. `otro` es la observación de paso y el manejo
 * «otro»; la varroa va aparte porque el diagnóstico la acepta como atención y los demás no.
 */
export type Actividad = "inspeccion" | "alimentacion" | "tratamiento" | "cosecha" | "varroa" | "otro";
export const ACTIVIDADES: readonly Actividad[] = ["inspeccion", "alimentacion", "tratamiento", "cosecha", "varroa", "otro"];

/**
 * **Qué pide cada propósito en cada caja** — V-3/V-10 de la revisión del Apiario, regla de Daniel del
 * 2026-10-08: inspección, una inspección (vale «nada fuera de lo normal»); alimentación, tratamiento y
 * cosecha, su manejo; diagnóstico, una inspección o un conteo de varroa; montaje, nada por caja.
 *
 * Un `Record` total sobre los valores de `VisitPurpose`: un propósito nuevo no compila hasta que se
 * diga qué pide.
 */
export const LO_QUE_PIDE = {
  inspeccion: ["inspeccion"],
  alimentacion: ["alimentacion"],
  tratamiento: ["tratamiento"],
  cosecha: ["cosecha"],
  diagnostico: ["inspeccion", "varroa"],
  montaje: [],
} as const satisfies Record<VisitPurpose, readonly Actividad[]>;
