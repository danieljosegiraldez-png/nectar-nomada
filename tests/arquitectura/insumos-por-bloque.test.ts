import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Arreglo de revisión, item 2a (Parte 2 de rutinas de estante): antes,
 * `app/instalaciones/[id]/page.tsx` resolvía `insumosDeLaInstalacion` UNA vez
 * con el id de la instalación y sólo la pasaba a SU PROPIO bloque —cada cama
 * ya resolvía el suyo, sin recibir el prop—, lo que dejaba a `insumosDeLugar`
 * (~línea 230 de `tests/rutinas/rutinasDeLugar.test.ts`) verde aunque alguien
 * volviera a pasarle `insumosDeLaInstalacion` a cada cama: esa prueba sólo
 * llama al servicio, nunca a la página.
 *
 * No hay arnés de renderizado de páginas de servidor en este repositorio (ver
 * `tests/arquitectura/cama-con-su-permiso.test.ts`, mismo patrón: leer la
 * fuente). Éste exige que los TRES bloques —instalación, cama, estante—
 * pasen por `insumosParaBloque(...)` (`lib/rutinas/propsDeBloques.ts`, con su
 * propia prueba en `tests/rutinas/propsDeBloques.test.ts`), nunca la variable
 * de la instalación directamente: `RutinasDeLugar` trata cualquier valor
 * PROVISTO, incluido `[]`, como "ya resuelto" — pasarle el de la instalación a
 * una cama que tiene `report_condition` sin tenerlo la instalación (o al
 * revés) le da los lotes equivocados sin que nada lo distinga de un `[]`
 * legítimo.
 *
 * **Su límite, dicho:** reconoce el arreglo por el nombre literal de la
 * llamada. Si la página deja de importar `insumosParaBloque` con ese nombre,
 * este guardia hay que actualizarlo — no es una prueba semántica de "insumos
 * correctos", es una prueba de que la decisión pasa por el sitio único.
 */
const RUTA = new URL("../../app/instalaciones/[id]/page.tsx", import.meta.url);

describe("app/instalaciones/[id]/page.tsx: insumos por bloque, siempre vía insumosParaBloque", () => {
  it("ningún bloque pasa insumosDeLaInstalacion directamente; los tres pasan por insumosParaBloque", () => {
    const fuente = readFileSync(RUTA, "utf8");
    // Control negativo, el hallazgo: la forma que rompería el aislamiento.
    expect(fuente).not.toContain("insumos={insumosDeLaInstalacion}");
    // Control positivo: los tres bloques, con su etiqueta correcta.
    expect(fuente).toContain('insumosParaBloque("cama", insumosDeLaInstalacion)');
    expect(fuente).toContain('insumosParaBloque("estante", insumosDeLaInstalacion)');
    expect(fuente).toContain('insumosParaBloque("instalacion", insumosDeLaInstalacion)');
  });
});
