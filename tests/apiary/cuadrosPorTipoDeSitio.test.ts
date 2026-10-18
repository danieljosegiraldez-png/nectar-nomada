/**
 * A un meliponario no se le pregunta por cuadros.
 *
 * **El defecto.** `InspectionForm` ofrecía «cuadros cubiertos de abeja» a TODA inspección, sin
 * mirar dónde está la colonia. Los meliponinos no se manejan en cuadros, así que la pregunta no
 * tiene respuesta — y el vacío que deja se lee después como «no se contó», no como «aquí no
 * aplica». Es la distinción que ADR-080 defiende en todo el módulo, rota por omisión.
 *
 * **Ningún dato real lo ejercita.** Medido el 2026-10-08 sobre la base compartida: 6 sitios
 * `apiary_site` y **0** `meliponary`. Una prueba que recorriera los datos de la casa pasaría
 * igual con el formulario viejo y con el nuevo, así que aquí no se recorre nada: se afirma
 * sobre el predicado y sobre el cableado del formulario.
 *
 * Hermético: lee archivos, no toca la base.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SE_MANEJA_EN_CUADROS,
  TIPOS_DE_SITIO_DE_ABEJAS,
  seManejaEnCuadros,
} from "../../lib/apiary/sitioDeAbejas";

describe("se maneja en cuadros, por tipo de sitio", () => {
  it("el apiario sí y el meliponario no — y los dos valores DIFIEREN", () => {
    // El `expect` de la diferencia es el control que impide un predicado que siempre contesta
    // lo mismo: con `true` en los dos, las dos primeras líneas pasarían y no decidiría nada.
    expect(seManejaEnCuadros("apiary_site")).toBe(true);
    expect(seManejaEnCuadros("meliponary")).toBe(false);
    expect(seManejaEnCuadros("apiary_site")).not.toBe(seManejaEnCuadros("meliponary"));
  });

  it("el mapa cubre TODOS los tipos de sitio de abejas, ni uno menos", () => {
    // Fila patrón. El `Record` ya lo exige en tiempo de compilación; esto lo dice en una línea
    // legible si alguien lo afloja a un objeto suelto.
    expect(Object.keys(SE_MANEJA_EN_CUADROS).sort()).toEqual([...TIPOS_DE_SITIO_DE_ABEJAS].sort());
    expect(TIPOS_DE_SITIO_DE_ABEJAS.length).toBeGreaterThan(1);
  });

  it("un tipo que no es sitio de abejas no apaga la pregunta", () => {
    // La dirección peligrosa es la contraria: un `false` por omisión escondería el campo en
    // cualquier sitio que este mapa no conozca, y nadie lo notaría.
    expect(seManejaEnCuadros("plot")).toBe(true);
    expect(seManejaEnCuadros(null)).toBe(true);
    expect(seManejaEnCuadros(undefined)).toBe(true);
  });
});

/**
 * Dónde cierra el paréntesis que abre en `inicio`: cuenta `(` y `)`, y salta lo que va dentro de
 * comillas o de una plantilla, que es donde un paréntesis no es código. No es un analizador de
 * TSX: quien lo usa comprueba que lo que encontró es lo que esperaba.
 */
function cierreDelParentesis(fuente: string, inicio: number): number {
  let nivel = 0;
  let comilla: string | null = null;
  for (let i = inicio; i < fuente.length; i++) {
    const c = fuente[i]!;
    if (comilla) {
      if (c === "\\") i++;
      else if (c === comilla) comilla = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") comilla = c;
    else if (c === "(") nivel++;
    else if (c === ")" && --nivel === 0) return i;
  }
  return -1;
}

describe("el formulario de inspección deja de preguntar donde no aplica", () => {
  /**
   * **Se lee la FUENTE y no se renderiza, y el motivo lo encontró un control que falló.**
   *
   * La primera versión de esta prueba renderizaba el componente con `renderToStaticMarkup` y
   * afirmaba que con `enCuadros: true` aparecía la etiqueta. **Falló** — y con ella su hermana
   * negativa quedó sin valor: los campos de detalle viven detrás de `showDetails`, que arranca
   * en `false` y sólo lo abre un clic. Un render estático no puede pulsarlo, así que el
   * `not.toContain` habría pasado por una razón que no tiene nada que ver con el arreglo.
   *
   * Es el mismo camino que ya siguen `tres-respuestas-en-el-formulario.test.ts` y
   * `donde-esta-la-inspeccion.test.ts` sobre este mismo archivo. Y vale lo que ellas dicen:
   * **un test de fuente sólo ve el cableado**, no lo que el navegador pinta.
   */
  const FORMULARIO = join(process.cwd(), "app/components/apiary/InspectionForm.tsx");
  const fuente = readFileSync(FORMULARIO, "utf8");

  it("el archivo se leyó de verdad", () => {
    // Fila patrón. Sin esto, una ruta mal escrita daría una cadena vacía y los `toContain` de
    // abajo fallarían por el motivo equivocado — o peor, un `not.toContain` pasaría solo.
    expect(fuente.length).toBeGreaterThan(5_000);
    expect(fuente).toContain("beeCoveredFramesLabel");
  });

  it("recibe `enCuadros` como propiedad, no lo adivina", () => {
    expect(fuente).toContain("enCuadros: boolean;");
  });

  it("y la pregunta por cuadros está condicionada a esa propiedad", () => {
    // El bloque entero va dentro de `{enCuadros ? ( … ) : null}`: se busca la apertura y que la
    // etiqueta caiga DESPUÉS, no sólo que las dos cadenas existan en el archivo.
    const puerta = fuente.indexOf("{enCuadros ? (");
    const etiqueta = fuente.indexOf("beeCoveredFramesLabel");
    expect(puerta, "no se encontró la puerta `{enCuadros ? (`").toBeGreaterThan(0);
    expect(etiqueta).toBeGreaterThan(puerta);
    expect(etiqueta - puerta).toBeLessThan(200);
  });

  it("y TODAS las preguntas de cuadros están dentro de esa puerta, también los marcos negros", () => {
    // ADR-200 (§2 y Consecuencias): «Marcos negros» sólo donde se preguntan los cuadros. Hasta el
    // 2026-10-14 el campo iba justo DEBAJO de la puerta, fuera de ella, y el caso de arriba no podía
    // verlo: sólo busca `beeCoveredFramesLabel`. Aquí se descubren las etiquetas `…Frames…Label`, no
    // se enumeran, y el cierre se halla contando paréntesis, no por la indentación.
    const apertura = fuente.indexOf("{enCuadros ? (");
    expect(apertura, "no se encontró la puerta `{enCuadros ? (`").toBeGreaterThan(0);
    const inicio = apertura + "{enCuadros ? ".length;
    const cierre = cierreDelParentesis(fuente, inicio);
    // Control del contador: si un paréntesis dentro de una cadena lo desviara, lo que «cierra» no
    // sería la puerta, y esto lo dice en vez de medir sobre el tramo equivocado.
    expect(fuente.slice(cierre, cierre + ") : null}".length)).toBe(") : null}");

    const etiquetas = [...fuente.matchAll(/t\("(\w*Frames\w*Label)"\)/g)].map((m) => ({ clave: m[1]!, en: m.index! }));
    expect(etiquetas.map((e) => e.clave)).toEqual(expect.arrayContaining(["beeCoveredFramesLabel", "darkFramesLabel"]));
    for (const e of etiquetas) {
      expect(e.en > inicio && e.en < cierre, `${e.clave} queda fuera de la puerta \`{enCuadros ? (\``).toBe(true);
    }
    // Control que tiene que salir distinto: lo que se pregunta después de la puerta queda fuera.
    expect(fuente.indexOf("broodStagesLegend")).toBeGreaterThan(cierre);
  });

  it("y el control que discrimina: la población NO está condicionada", () => {
    // Sin esto, un detector que diera por bueno cualquier campo pasaría igual. La población se
    // pregunta siempre —todas las colonias tienen población— así que su etiqueta tiene que
    // aparecer ANTES de la puerta.
    const puerta = fuente.indexOf("{enCuadros ? (");
    expect(fuente.indexOf("populationLabel")).toBeLessThan(puerta);
  });

  it("la página se la calcula desde el TIPO DE SITIO, que es donde vive la especie", () => {
    const pagina = readFileSync(join(process.cwd(), "app/apiaries/[id]/hives/[hiveId]/page.tsx"), "utf8");
    expect(pagina.length).toBeGreaterThan(10_000);
    expect(pagina).toContain("seManejaEnCuadros(hive.location.locationType)");
  });
});
