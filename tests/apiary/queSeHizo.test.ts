/**
 * **Cada línea de la visita dice de qué caja habla y qué se le hizo** — V-6 de la revisión del
 * Apiario. Hasta el 2026-10-10 la pantalla de la visita pintaba cada registro como su clase
 * («observacion»), la hora y la nota: una visita de diez cajas era diez «observacion» seguidas.
 *
 * Hermético: la descripción sale de una función pura sobre lo que el lector de la visita trae.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ColonyEventType, VarroaMethod } from "../../generated/prisma/enums";
import { cajaDelRegistro, queSeHizo } from "../../lib/apiary/queSeHizo";

// Devuelve la clave y, si los hay, sus valores: lo que se afirma es qué se pidió traducir.
const t = (clave: string, valores?: Record<string, string | number>) => (valores ? `${clave}${JSON.stringify(valores)}` : clave);
const de = (identifier: string) => ({ colony: { hive: { identifier } } });
const NADA = { inspection: null, colonyEvent: null, apiaryHarvestEvent: null, varroaCount: null };

describe("qué se hizo, en una línea", () => {
  it("una inspección: su caja y su resultado", () => {
    const r = { ...NADA, inspection: { outcome: "nothing_unusual", ...de("H1") } };
    expect(cajaDelRegistro(r)).toBe("H1");
    expect(queSeHizo(r, t)).toBe("reportSujeto_inspeccion: inspectionOutcome_nothing_unusual");
  });

  it("un manejo: su tipo, y el producto o el alimento cuando lo hay", () => {
    const tratamiento = { ...NADA, colonyEvent: { eventType: "treatment", treatmentProduct: "Apivar", feedingMaterial: null, ...de("H2") } };
    const alimento = { ...NADA, colonyEvent: { eventType: "feeding", treatmentProduct: null, feedingMaterial: "jarabe 1:1", ...de("H2") } };
    const observacion = { ...NADA, colonyEvent: { eventType: "passing_observation", treatmentProduct: null, feedingMaterial: null, ...de("H2") } };
    expect(cajaDelRegistro(tratamiento)).toBe("H2");
    expect(queSeHizo(tratamiento, t)).toBe("colonyEventType_treatment: Apivar");
    expect(queSeHizo(alimento, t)).toBe("colonyEventType_feeding: jarabe 1:1");
    // Sin detalle no se inventa uno: sale el tipo solo.
    expect(queSeHizo(observacion, t)).toBe("colonyEventType_passing_observation");
  });

  it("una cosecha: su peso, y sin peso no se inventa", () => {
    expect(queSeHizo({ ...NADA, apiaryHarvestEvent: { extractedWeightKg: { toString: () => "22.5" }, ...de("H3") } }, t)).toBe("reportSujeto_cosecha: 22.5 kg");
    expect(queSeHizo({ ...NADA, apiaryHarvestEvent: { extractedWeightKg: null, ...de("H3") } }, t)).toBe("reportSujeto_cosecha");
  });

  it("un conteo de varroa: ácaros, abejas y la infestación derivada", () => {
    const r = { ...NADA, varroaCount: { mitesCounted: 3, sampleBees: 300, ...de("H4") } };
    expect(cajaDelRegistro(r)).toBe("H4");
    expect(queSeHizo(r, t)).toBe('registroVarroa{"acaros":3,"abejas":300,"porCiento":1}');
  });

  it("un registro que no es del apiario —una medición de café— no tiene caja ni línea", () => {
    expect(cajaDelRegistro(NADA)).toBeNull();
    expect(queSeHizo(NADA, t)).toBeNull();
  });
});

/**
 * Las dos familias que esta línea y el informe construyen con una plantilla
 * (`colonyEventType_${t}`, `varroaMethod_${m}`) tienen etiqueta en los dos idiomas. Una que falte
 * no la ve el compilador, y `next-intl` pinta el nombre de la clave sin fallar en rojo.
 */
describe("las etiquetas que la línea construye con una plantilla", () => {
  const leer = (ruta: string) => JSON.parse(readFileSync(join(new URL("../..", import.meta.url).pathname, ruta), "utf8")).Apiary as Record<string, string>;
  const es = leer("messages/es.json"), en = leer("messages/en.json");
  for (const [prefijo, valores] of [["colonyEventType", Object.values(ColonyEventType)], ["varroaMethod", Object.values(VarroaMethod)]] as const) {
    it(`${prefijo}: ${valores.length} valores, en español y en inglés`, () => {
      expect(valores.length).toBeGreaterThan(0);
      for (const v of valores) {
        expect(es[`${prefijo}_${v}`], `falta Apiary.${prefijo}_${v} en es.json`).toBeTruthy();
        expect(en[`${prefijo}_${v}`], `falta Apiary.${prefijo}_${v} en en.json`).toBeTruthy();
      }
    });
  }
});
