import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  Aspect,
  BiocharCooling,
  BiocharMoistureCondition,
  ShadePercentageBracket,
  SunExposure,
} from "../../generated/prisma/enums";

/**
 * Un valor enumerado nuevo no llega sin su etiqueta ni sin su opción.
 *
 * **Por qué existe.** Un enum de la base, la lista que el formulario ofrece y
 * las claves de traducción son **tres listas separadas que tienen que decir lo
 * mismo**, y las tres se editan en archivos distintos. Los dos fallos que eso
 * produce se ven muy distinto:
 *
 * - **Falta la traducción** → `next-intl` revienta al renderizar. Ruidoso,
 *   pero sólo en la página que lo muestra, y sólo si alguien la visita.
 * - **Falta la opción en el formulario** → **silencio**. El valor existe en la
 *   base, un script puede escribirlo, y nadie puede elegirlo desde la
 *   aplicación. Nada falla; simplemente no está.
 *
 * El segundo es el que justifica este archivo.
 *
 * **Lo que NO prueba:** que la etiqueta sea correcta. `aspect_north` puede
 * decir «Sur» y esto pasa igual. Comprueba existencia, no verdad.
 *
 * Hermético a propósito: sólo lee archivos y JSON, sin tocar la base, así que
 * corre en CI (`scripts/ci.sh`).
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const leer = (f: string) => readFileSync(join(RAIZ, f), "utf8");

const es = JSON.parse(leer("messages/es.json")).Traceability as Record<string, string>;
const en = JSON.parse(leer("messages/en.json")).Traceability as Record<string, string>;

const CASOS = [
  { nombre: "Aspect", prefijo: "aspect", valores: Object.values(Aspect) },
  { nombre: "SunExposure", prefijo: "sunExposure", valores: Object.values(SunExposure) },
  { nombre: "ShadePercentageBracket", prefijo: "shadePercentage", valores: Object.values(ShadePercentageBracket) },
  { nombre: "BiocharMoistureCondition", prefijo: "biocharMoisture", valores: Object.values(BiocharMoistureCondition) },
  { nombre: "BiocharCooling", prefijo: "biocharCooling", valores: Object.values(BiocharCooling) },
] as const;

describe("cada valor enumerado tiene etiqueta en los dos idiomas", () => {
  for (const { nombre, prefijo, valores } of CASOS) {
    it(`${nombre}: ${valores.length} valores, en español y en inglés`, () => {
      // Que la lista no llegue vacía. Si el enum se renombra, `Object.values`
      // de undefined ya habría reventado arriba; esto cubre el enum vacío.
      expect(valores.length).toBeGreaterThan(0);
      for (const valor of valores) {
        expect(es[`${prefijo}_${valor}`], `falta ${prefijo}_${valor} en es.json`).toBeTruthy();
        expect(en[`${prefijo}_${valor}`], `falta ${prefijo}_${valor} en en.json`).toBeTruthy();
      }
    });
  }

  it("la etiqueta del campo de orientación existe en los dos idiomas", () => {
    expect(es.aspectLabel).toBeTruthy();
    expect(en.aspectLabel).toBeTruthy();
  });
});

/**
 * La lista literal del formulario, leída de su código fuente.
 *
 * Se lee como texto y no importando el componente porque `PlotAttributesForm`
 * lleva `"use client"` y arrastra `next-intl` y el módulo de acciones de
 * servidor: importarlo aquí convertiría un test hermético en uno que necesita
 * medio Next.js. La contrapartida es que este `match` depende del nombre de la
 * constante — por eso se comprueba primero que encontró algo, y así un
 * renombrado hace **fallar** el test en vez de vaciarlo.
 */
function listaDelFormulario(archivo: string, constante: string): string[] {
  const src = leer(`app/components/traceability/${archivo}`);
  const m = src.match(new RegExp(`const ${constante} = \\[([^\\]]*)\\] as const;`));
  const cuerpo = m?.[1];
  expect(cuerpo, `no se encontró la constante ${constante} en ${archivo}`).toBeTruthy();
  return [...cuerpo!.matchAll(/"([a-z_0-9]+)"/g)].map((x) => x[1]!);
}

describe("el formulario ofrece exactamente los valores que la base acepta", () => {
  it("ASPECTS coincide con el enum Aspect, en el mismo orden", () => {
    // El orden importa y no es alfabético: los ocho rumbos primero, y después
    // `flat` y `variable`, que no son direcciones.
    expect(listaDelFormulario("PlotAttributesForm.tsx", "ASPECTS")).toEqual(Object.values(Aspect));
  });

  it("SUN_EXPOSURES coincide con el enum SunExposure", () => {
    expect(listaDelFormulario("PlotAttributesForm.tsx", "SUN_EXPOSURES")).toEqual(Object.values(SunExposure));
  });

  it("SHADE_BRACKETS coincide con el enum ShadePercentageBracket", () => {
    expect(listaDelFormulario("PlotAttributesForm.tsx", "SHADE_BRACKETS")).toEqual(Object.values(ShadePercentageBracket));
  });

  it("MOISTURE_CONDITIONS coincide con el enum BiocharMoistureCondition", () => {
    expect(listaDelFormulario("BiocharBatchForm.tsx", "MOISTURE_CONDITIONS")).toEqual(
      Object.values(BiocharMoistureCondition),
    );
  });

  it("COOLINGS coincide con el enum BiocharCooling", () => {
    expect(listaDelFormulario("BiocharBatchForm.tsx", "COOLINGS")).toEqual(Object.values(BiocharCooling));
  });
});
