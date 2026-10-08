import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listVariableDefinitions } from "../../lib/traceability/units";
import {
  Aspect,
  BiocharCooling,
  BiocharMoistureCondition,
  CanopyPosition,
  ShadePercentageBracket,
  DataQuality,
  ProvenanceClass,
  SoilFeatureObservation,
  SunExposure,
  BroodPattern,
  BroodStage,
  ColonyPopulation,
  FeedingMaterial,
  InspectionOutcome,
  QueenSighting,
  StoresLevel,
  Temperament,
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
  { nombre: "SoilFeatureObservation", prefijo: "soilObservation", valores: Object.values(SoilFeatureObservation) },
  { nombre: "CanopyPosition", prefijo: "canopyPosition", valores: Object.values(CanopyPosition) },
] as const;

/**
 * Los valores del reporte de visita viven en otro espacio de nombres: `Apiary`, no `Traceability`.
 *
 * **Por qué hace falta aparte.** El bloque de abajo lee sólo `Traceability`, así que jamás vio
 * `population_*`. El #373 renombró el valor del enum de `apinada` a `apiñada` y dejó la clave
 * sin la eñe: el formulario de inspección pedía `population_apiñada`, no la encontraba, y
 * `next-intl` —sin `onError` configurado— pintaba el nombre de la clave en el desplegable.
 * Nada falló en rojo; se leyó mal en pantalla. Producción no tenía ninguna inspección todavía
 * (`apiary.inspection` vacía el 2026-10-08), así que nadie lo había visto.
 *
 * Cubre las ocho familias que construye `DetallesDelReporte` con una plantilla
 * (`population_${v}`...): una clave que falte ahí no la ve el compilador.
 */
const esApiary = JSON.parse(leer("messages/es.json")).Apiary as Record<string, string>;
const enApiary = JSON.parse(leer("messages/en.json")).Apiary as Record<string, string>;

const CASOS_APIARY = [
  { nombre: "ColonyPopulation", prefijo: "population", valores: Object.values(ColonyPopulation) },
  { nombre: "QueenSighting", prefijo: "queenSighting", valores: Object.values(QueenSighting) },
  { nombre: "BroodPattern", prefijo: "broodPattern", valores: Object.values(BroodPattern) },
  { nombre: "BroodStage", prefijo: "broodStage", valores: Object.values(BroodStage) },
  { nombre: "StoresLevel", prefijo: "storesLevel", valores: Object.values(StoresLevel) },
  { nombre: "Temperament", prefijo: "temperament", valores: Object.values(Temperament) },
  { nombre: "FeedingMaterial", prefijo: "feedingMaterial", valores: Object.values(FeedingMaterial) },
  { nombre: "InspectionOutcome", prefijo: "inspectionOutcome", valores: Object.values(InspectionOutcome) },
] as const;

describe("cada valor de colonia del reporte tiene etiqueta en los dos idiomas (Apiary)", () => {
  for (const { nombre, prefijo, valores } of CASOS_APIARY) {
    it(`${nombre}: ${valores.length} valores, en español y en inglés`, () => {
      expect(valores.length).toBeGreaterThan(0);
      for (const valor of valores) {
        expect(esApiary[`${prefijo}_${valor}`], `falta Apiary.${prefijo}_${valor} en es.json`).toBeTruthy();
        expect(enApiary[`${prefijo}_${valor}`], `falta Apiary.${prefijo}_${valor} en en.json`).toBeTruthy();
      }
    });
  }
});

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

  /**
   * Las variables del registro canónico no son un enum de Prisma, pero fallan
   * igual: el formulario de caracterización de biochar las ofrece por nombre y
   * las pinta con `variable_<nombre>`. Una variable nueva sin etiqueta rompe el
   * renderizado de esa página y de ninguna otra.
   */
  it("cada parámetro de laboratorio tiene etiqueta en los dos idiomas", () => {
    // Los tres paneles de laboratorio, no sólo el de enmienda: los tres se
    // pintan con `variable_<nombre>` y los tres revientan igual sin etiqueta.
    const variables = new Set(
      (["analisis_de_enmienda", "analisis_de_suelo", "analisis_foliar"] as const).flatMap((d) =>
        listVariableDefinitions(d).map((v) => v.variable),
      ),
    );
    expect(variables.size).toBeGreaterThan(0);
    for (const v of variables) {
      expect(es[`variable_${v}`], `falta variable_${v} en es.json`).toBeTruthy();
      expect(en[`variable_${v}`], `falta variable_${v} en en.json`).toBeTruthy();
    }
  });

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

  it("CANOPY_POSITIONS coincide con el enum CanopyPosition", () => {
    expect(listaDelFormulario("SampleForms.tsx", "CANOPY_POSITIONS")).toEqual(Object.values(CanopyPosition));
  });

  it("OBSERVACIONES coincide con el enum SoilFeatureObservation", () => {
    // Las tres, y en ese orden: «no se miró» va la última porque no es una
    // observación del suelo sino la ausencia de una.
    expect(listaDelFormulario("SoilProfileForm.tsx", "OBSERVACIONES")).toEqual(
      Object.values(SoilFeatureObservation),
    );
  });
});

/**
 * Un desplegable no enseña el valor crudo del enum.
 *
 * **El defecto, medido el 2026-09-09.** `TreatmentBatchForm` pintaba
 * `{pc}` y `{dq}`: en una interfaz en español, un apicultor veía
 * «measured_fact» y «verified_with_limitation». No revienta, no avisa —
 * simplemente se lee mal, que es la misma familia que «Batches» contra
 * «Lotes». De 25 desplegables con clave = valor, **22 traducían y 3 no**, los
 * tres en ese archivo. Uno de los tres era correcto; ver la excepción.
 *
 * Y arrastraba un segundo fallo: ese formulario ofrecía
 * `manufacturer_specification` e `hypothesis`, **dos valores que no tenían
 * etiqueta en ningún idioma**. No se notaba justamente porque no las usaba.
 *
 * **El detector se calibra contra una población conocida.** Un patrón que deja
 * casos fuera devuelve cero culpables, que se lee igual que «todo bien»: por
 * eso se afirma primero cuántos inspeccionó. El barrido manual de ese día
 * encontró 25.
 */
const DIRECTORIOS_DE_FORMULARIOS = [
  "app/components/traceability",
  "app/components/research",
  "app/components/apiary",
] as const;

/**
 * Captura la fuente que se recorre, la variable del bucle y lo que se pinta,
 * para un `<option>` cuya clave y valor son la propia variable.
 */
const OPCION = /\{\(?([\w.?\s[\]]+?)\)?(?:\s*\?\?\s*\[\])?\)?\.map\(\((\w+)(?:,\s*\w+)?\)\s*=>\s*\(?\s*<option key=\{\2\} value=\{\2\}>\s*\{([^}]+)\}/g;

/**
 * Lo que SÍ se pinta crudo con razón. Por la fuente que se recorre, no por
 * archivo: mueve el bloque de sitio y la excepción sigue valiendo; cambia lo
 * que recorre y deja de valer, que es justo lo que se quiere.
 */
const CRUDO_CON_RAZON: Record<string, string> = {
  "variable.enumValues":
    "No es un enum de Prisma: es la lista que el autor del protocolo congeló en esa versión —«río», «quebrada», «pozo», «red»—. Son datos, ya escritos en el idioma de quien los declaró, y un vocabulario abierto no tiene clave de traducción posible.",
  unidades:
    "Tampoco es un enum: son símbolos de unidad —C, F, pH, Bx, %, aw, mg/kg, ppm— que salen de `unidadesAceptadas` y son los MISMOS en los dos idiomas. Una clave `unidad_%` o `unidad_mg/kg` no traduciría nada y añadiría un sitio donde desincronizarse con el registro, que es la única fuente de qué unidades admite cada variable. Declarada el 2026-09-11, cuando el formulario de medición dejó de pedir la unidad escrita a mano.",
};

function opcionesDeDesplegable() {
  const filas: { archivo: string; fuente: string; variable: string; pintado: string }[] = [];
  for (const d of DIRECTORIOS_DE_FORMULARIOS) {
    for (const f of readdirSync(join(RAIZ, d)).filter((x) => x.endsWith(".tsx"))) {
      const src = leer(`${d}/${f}`);
      for (const m of src.matchAll(OPCION)) {
        filas.push({ archivo: `${d}/${f}`, fuente: m[1]!.trim(), variable: m[2]!, pintado: m[3]!.trim() });
      }
    }
  }
  return filas;
}

describe("los desplegables enseñan etiquetas, no valores de enum", () => {
  it("el detector ve la población entera, no un trozo", () => {
    // Control de calibración. Si el patrón se rompe, esto falla ANTES que el
    // veredicto, en vez de dejar un cero que se lee como limpio.
    expect(opcionesDeDesplegable().length).toBeGreaterThanOrEqual(20);
  });

  it("ninguno pinta el valor crudo, salvo la excepción declarada", () => {
    const crudos = opcionesDeDesplegable()
      .filter((o) => o.pintado === o.variable)
      .filter((o) => !(o.fuente in CRUDO_CON_RAZON))
      .map((o) => `${o.archivo}: recorre ${o.fuente} y pinta {${o.pintado}}`);
    expect(crudos, "Un desplegable enseña el valor crudo del enum. Píntalo con t(`prefijo_${valor}`), o declara la excepción con su razón en CRUDO_CON_RAZON.").toEqual([]);
  });

  it("la excepción declarada sigue existiendo — si no, sobra", () => {
    // Una excepción que ya no aplica a nada envejece en silencio y enseña a
    // leer la lista por encima.
    const fuentes = new Set(opcionesDeDesplegable().map((o) => o.fuente));
    for (const fuente of Object.keys(CRUDO_CON_RAZON)) {
      expect(fuentes.has(fuente), `CRUDO_CON_RAZON declara «${fuente}» y ya no lo recorre nadie: quítalo`).toBe(true);
    }
  });
});

/**
 * Cada valor de procedencia o calidad que un formulario OFRECE tiene etiqueta.
 *
 * **No se comprueba el enum entero a propósito.** Cinco de los diez
 * `ProvenanceClass` no los ofrece ningún formulario —`recommendation`,
 * `ai_suggestion` y compañía—, y exigirles etiqueta sería pedir traducciones
 * para pantallas que no existen. Lo que rompe es ofrecer un valor sin
 * etiqueta, y eso es lo que se mide.
 */
describe("todo valor de procedencia o calidad que se ofrece tiene etiqueta", () => {
  const LISTAS = /const (?:PROVENANCES|PROVENANCE_CLASSES|DATA_QUALITIES|DATA_QUALITY_LEVELS) = \[([^\]]*)\]/g;

  /**
   * Los conjuntos que el PR #255 sacó de los formularios a un módulo propio.
   *
   * **Hay que leerlos aquí o la cobertura es accidental.** Medido el 2026-09-10:
   * sin esta mitad, el guardia sólo veía las listas que `TreatmentBatchForm`
   * conserva en casa —siete valores— y daba verde porque esos siete resultan ser
   * un superconjunto de los cinco del módulo. Coincidencia, no cobertura: un
   * sexto valor en el módulo habría entrado sin etiqueta y sin que nada fallara.
   */
  const MODULO_DE_PROCEDENCIA = "lib/traceability/procedencia.ts";
  const CONJUNTOS_DEL_MODULO = /export const PROCEDENCIA_\w+: readonly ProvenanceClass\[\] = \[([^\]]*)\]/g;

  function ofrecidos() {
    const porPrefijo = { provenanceClass: new Set<string>(), dataQuality: new Set<string>() };
    for (const d of DIRECTORIOS_DE_FORMULARIOS) {
      for (const f of readdirSync(join(RAIZ, d)).filter((x) => x.endsWith(".tsx"))) {
        const src = leer(`${d}/${f}`);
        for (const m of src.matchAll(LISTAS)) {
          const prefijo = m[0]!.includes("DATA_QUALIT") ? "dataQuality" : "provenanceClass";
          for (const v of m[1]!.matchAll(/"([a-z_0-9]+)"/g)) porPrefijo[prefijo].add(v[1]!);
        }
      }
    }
    const modulo = leer(MODULO_DE_PROCEDENCIA);
    const conjuntos = [...modulo.matchAll(CONJUNTOS_DEL_MODULO)];
    // Control: el módulo declara varios conjuntos. Un cero aquí significaría
    // que el patrón dejó de casar —renombrado, otro tipado— y la mitad de la
    // cobertura se iría sin ruido.
    expect(conjuntos.length, `no se reconoció ningún conjunto en ${MODULO_DE_PROCEDENCIA}`).toBeGreaterThan(0);
    for (const m of conjuntos) {
      for (const v of m[1]!.matchAll(/"([a-z_0-9]+)"/g)) porPrefijo.provenanceClass.add(v[1]!);
    }
    return porPrefijo;
  }

  it("los ofrecidos son valores reales del enum", () => {
    const { provenanceClass, dataQuality } = ofrecidos();
    // Control: se encontró algo. Un regex roto daría dos conjuntos vacíos y
    // todas las aserciones de abajo pasarían sin mirar nada.
    expect(provenanceClass.size).toBeGreaterThan(0);
    expect(dataQuality.size).toBeGreaterThan(0);
    expect([...provenanceClass].filter((v) => !Object.values(ProvenanceClass).includes(v as never))).toEqual([]);
    expect([...dataQuality].filter((v) => !Object.values(DataQuality).includes(v as never))).toEqual([]);
  });

  it("cada uno tiene etiqueta en español y en inglés", () => {
    const porPrefijo = ofrecidos();
    for (const [prefijo, valores] of Object.entries(porPrefijo)) {
      for (const v of valores) {
        expect(es[`${prefijo}_${v}`], `un formulario ofrece ${v} y falta ${prefijo}_${v} en es.json`).toBeTruthy();
        expect(en[`${prefijo}_${v}`], `un formulario ofrece ${v} y falta ${prefijo}_${v} en en.json`).toBeTruthy();
      }
    }
  });
});
