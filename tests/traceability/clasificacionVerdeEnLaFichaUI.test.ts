/**
 * La ficha esconde el cuajado genérico **sólo cuando es el mismo evento**, no cuando hay alguna
 * clasificación.
 *
 * **El defecto, encontrado por Codex el 2026-09-26 sobre el diff.** La primera versión escribía
 * `outturn && !clasificacionVerde`. Pero las dos cosas no hablan del mismo evento:
 * `selectionTransformation` es la PRIMERA selección en la que el lote aparece —como entrada **o
 * como salida**, porque `getLotDetail` trae las dos— y `clasificacionDeLote` devuelve la ÚLTIMA en
 * la que es entrada. Un lote que SALIÓ de una clasificación y después ENTRÓ en otra tenía escondido
 * el cuajado de su origen por la existencia de la segunda: cifras de un evento borradas por otro,
 * en una plataforma cuyo argumento es la trazabilidad.
 *
 * **Guardia de fuente, que es como este repositorio prueba las condiciones de pantalla** (ver
 * `cierreDeSecadoUI.test.ts`). No sustituye a renderizar: dice que la condición escrita es la
 * correcta, no que la página se pinte bien.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = new URL("../..", import.meta.url).pathname;
const ficha = readFileSync(join(raiz, "app/lots/[id]/page.tsx"), "utf8");

describe("clasificación por malla en la ficha del lote", () => {
  it("el archivo leído es el que creemos", () => {
    // Control positivo: sin esto, una ruta mal escrita o un archivo vacío haría pasar los
    // `not.toContain` de abajo diciendo exactamente lo contrario de lo que comprueban.
    expect(ficha.length).toBeGreaterThan(20000);
    expect(ficha).toContain("selectionOutturnHeading");
    expect(ficha).toContain("ClasificacionPorMalla");
  });

  it("suprime el cuajado comparando IDS de transformación, no la mera existencia", () => {
    expect(ficha).toContain(
      "const cuajadoEsElMismoEvento = clasificacionVerde?.transformationId === selectionTransformation?.id;",
    );
    expect(ficha).toContain("{outturn && !cuajadoEsElMismoEvento ? (");
    // La forma vieja, la que escondía el evento equivocado.
    expect(ficha).not.toContain("outturn && !clasificacionVerde");
  });

  it("no pregunta por la clasificación cuando no hay ninguna selección en juego", () => {
    // Toda clasificación es una transformación de tipo `selection`: sin ninguna, la respuesta sería
    // `null` seguro y son tres consultas y una comprobación de permiso tiradas en cada ficha verde.
    expect(ficha).toContain('lot.lotType === "green" && selectionTransformation');
  });
});
