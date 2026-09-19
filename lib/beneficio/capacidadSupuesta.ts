/**
 * El estimado de capacidad cuando todavía no hay pesajes (spec §4.2b).
 * `[PROVISIONAL]` (00_reglas_del_modulo §5): configuración, no una constante de
 * dominio; se reemplaza en cuanto hay un pesaje de ese estado.
 *
 * SÓLO para cereza, porque es lo único para lo que la fuente da densidad. Para
 * mucílago y lavado no hay estimado y NO se inventa uno (21_rubrica_veracidad §2.1).
 */
export const CAPACIDAD_SUPUESTA = {
  CHERRY: {
    densidadKgM3: 400,
    profundidadCm: 2.8,
    fuente: "Las Nubes Cerro Azul — Drying Plan 2026-27, §6 (densidad provisional hasta el pesaje de §7)",
    estado: "PROVISIONAL",
  },
} as const satisfies Partial<Record<"CHERRY" | "MUCILAGE_HONEY" | "PARCHMENT", { densidadKgM3: number; profundidadCm: number; fuente: string; estado: "PROVISIONAL" }>>;
