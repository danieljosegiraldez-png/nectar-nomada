import { describe, expect, it } from "vitest";
import { insumosParaBloque } from "../../lib/rutinas/propsDeBloques";

/**
 * `insumosParaBloque` es la única decisión de qué `insumos` recibe cada
 * instancia de `RutinasDeLugar` en `app/instalaciones/[id]/page.tsx` (arreglo
 * de revisión, item 2a de la Parte 2 de rutinas de estante). No hay arnés de
 * renderizado de páginas de servidor en este repositorio (ver
 * `tests/arquitectura/cama-con-su-permiso.test.ts`), así que esto prueba la
 * FUNCIÓN pura, y `tests/arquitectura/insumos-por-bloque.test.ts` es el
 * guardia de fuente que exige que la página pase SIEMPRE por aquí.
 */
describe("insumosParaBloque: sólo la instalación recibe el valor ya resuelto", () => {
  const insumosDeLaInstalacion = [{ id: "lote-1", etiqueta: "Cal · L1", materialName: "Cal", batchLabel: "L1" }];

  it("instalación: el mismo valor ya resuelto", () => {
    expect(insumosParaBloque("instalacion", insumosDeLaInstalacion)).toBe(insumosDeLaInstalacion);
  });

  it("cama: undefined —para que RutinasDeLugar resuelva con SU PROPIO id—, no el `[]`/valor de la instalación", () => {
    expect(insumosParaBloque("cama", insumosDeLaInstalacion)).toBeUndefined();
  });

  it("estante: undefined, igual que una cama", () => {
    expect(insumosParaBloque("estante", insumosDeLaInstalacion)).toBeUndefined();
  });
});
