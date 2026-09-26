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
const bloque = readFileSync(join(raiz, "app/components/traceability/ClasificacionPorMalla.tsx"), "utf8");
const comparacion = readFileSync(join(raiz, "app/lots/[id]/clasificacion/page.tsx"), "utf8");

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

  it("las fechas van en la zona del lugar, no en el día UTC", () => {
    // `toISOString().slice(0,10)` da el día en UTC: una clasificación de las 20:00 en Panamá sale
    // fechada al día siguiente. El repositorio ya resuelve esto con `mostrarFecha`, y la ficha lo
    // usa para sus otras fechas desde el 2026-09-05 (Codex, 2026-09-26).
    for (const [nombre, fuente] of [["el bloque", bloque], ["la comparación", comparacion]] as const) {
      // Control positivo: que el archivo se leyó y es el que creemos.
      expect(fuente, nombre).toContain("mostrarFecha");
      // Y que no queda ninguna fecha pintada en UTC. Se mira el patrón completo, no la palabra
      // suelta: `toISOString` aparece a propósito dentro del comentario que explica por qué no.
      expect(fuente.replace(/\/\*[\s\S]*?\*\//g, ""), nombre).not.toContain("toISOString().slice");
    }
  });

  it("la tabla ancha de la comparación va en un contenedor con desplazamiento", () => {
    // Es la tabla con más columnas de la aplicación —una por rango declarado— y `.nn-table` no
    // tiene ninguna regla en globals.css: el único contenedor real es `.nn-table-scroll`.
    expect(comparacion).toContain('className="nn-table-scroll"');
  });

  it("no pregunta por la clasificación cuando no hay ninguna selección en juego", () => {
    // Toda clasificación es una transformación de tipo `selection`: sin ninguna, la respuesta sería
    // `null` seguro y son tres consultas y una comprobación de permiso tiradas en cada ficha verde.
    expect(ficha).toContain('lot.lotType === "green" && selectionTransformation');
  });
});
