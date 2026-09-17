import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Dónde está la inspección de colmena.**
 *
 * El dueño no la encontró (2026-09-17, en campo): *«puedo agregar colmenas,
 * abrir jornadas, aplicar a varias… pero dónde es que yo hago la inspección ya
 * estructurada, no lo veo»*. Estaba construida — **dentro de cada colmena**, un
 * nivel más adentro que donde la buscaba, y nada en la pantalla del apiario lo
 * decía.
 *
 * El arreglo fue un aviso. Un aviso que señala a un sitio del que la inspección
 * se ha movido es **peor que no tener aviso**: manda a la gente a un sitio
 * vacío y le enseña a no leer los avisos. Esto guarda las dos mitades del
 * camino, no el texto del aviso.
 */
const RAIZ = join(__dirname, "..", "..");
const PANTALLA_APIARIO = join(RAIZ, "app/apiaries/[id]/page.tsx");
const PANTALLA_COLMENA = join(RAIZ, "app/apiaries/[id]/hives/[hiveId]/page.tsx");

describe("el camino a la inspección de colmena", () => {
  it("la pantalla del apiario enlaza a la colmena individual", () => {
    const src = readFileSync(PANTALLA_APIARIO, "utf8");
    expect(src).toContain("/apiaries/${apiary.id}/hives/${hive.id}");
  });

  it("y dice que ahí dentro se inspecciona — si no, el enlace no se descubre", () => {
    const src = readFileSync(PANTALLA_APIARIO, "utf8");
    expect(src).toContain('t("hivesHint")');
  });

  /**
   * **Por qué con expresión regular y no con `toContain`.** La primera versión
   * de estas dos pruebas usaba `toContain("<InspectionForm")`, y su flip-test
   * las tumbó a ellas: renombrar el componente a `InspectionFormMovido` deja la
   * subcadena intacta, así que la prueba seguía verde con la inspección movida.
   * El límite de palabra es toda la diferencia entre el guardia y el adorno.
   */
  const seUsa = (src: string, componente: string) =>
    new RegExp(`<${componente}[\\s/>]`).test(src);

  it("la inspección SÍ vive en la pantalla de la colmena", () => {
    // La mitad que de verdad importa. Si alguien mueve `InspectionForm` a otra
    // ruta, el aviso de arriba pasa a mentir y esta prueba cae.
    const src = readFileSync(PANTALLA_COLMENA, "utf8");
    expect(seUsa(src, "InspectionForm"), "InspectionForm no se usa aquí").toBe(true);
  });

  it("y también la alimentación y el tratamiento, que es lo otro que el aviso promete", () => {
    const src = readFileSync(PANTALLA_COLMENA, "utf8");
    for (const c of ["ColonyEventQuickEntry", "HarvestForm", "ConteoDeVarroaForm"]) {
      expect(seUsa(src, c), `${c} no se usa aquí`).toBe(true);
    }
  });

  it("control del propio guardia: un componente renombrado NO cuela", () => {
    // La prueba de que el límite de palabra hace su trabajo. Sin esto, nadie
    // sabría que `toContain` volvió a colarse.
    expect(seUsa("<InspectionFormMovido foo />", "InspectionForm")).toBe(false);
    expect(seUsa("<InspectionForm foo />", "InspectionForm")).toBe(true);
  });

  it("control: una promesa que el aviso NO hace tampoco se busca aquí", () => {
    // Sin esto, las cuatro de arriba pasarían igual en un archivo que
    // contuviera cualquier cosa — comprueba que el fichero es el que creo y no
    // uno que casa con todo.
    const src = readFileSync(PANTALLA_COLMENA, "utf8");
    expect(src).not.toContain("<FormularioDeTrilla");
  });
});
