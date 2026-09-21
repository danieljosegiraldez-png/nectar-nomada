/**
 * El formulario de almacenar: bodegas arriba, lo demás debajo; ninguno se
 * pierde (spec 2026-09-19 §4.1).
 *
 * Módulo propio, sin imports: `StorageForm` es `"use client"` y el guardia
 * `tests/arquitectura/cliente-sin-prisma.test.ts` prohíbe que un componente de
 * cliente arrastre `prisma` — `bodegas.ts` sí lo importa, así que esta función
 * vive aparte y `bodegas.ts` la reexporta para quien la necesite del lado del
 * servidor.
 */
export function ordenarParaAlmacenar<T extends { locationType: string; name: string }>(ls: T[]) {
  const porNombre = (a: T, b: T) => a.name.localeCompare(b.name, "es");
  return {
    bodegas: ls.filter((l) => l.locationType === "storage_facility").sort(porNombre),
    otros: ls.filter((l) => l.locationType !== "storage_facility").sort(porNombre),
  };
}
