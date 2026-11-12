import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVIDADES, LO_QUE_PIDE } from "../../lib/apiary/actividadDeVisita";

/**
 * Las etiquetas del pendiente de la visita existen en los dos idiomas.
 *
 * La pantalla de la visita las construye con una plantilla —`pendienteActividad_${a}`—, así que una
 * actividad nueva sin su etiqueta no la ve el compilador, y `next-intl` pinta el nombre de la clave
 * sin fallar en rojo (la misma trampa que cuenta `valoresEnumerados.test.ts`).
 */
const leer = (ruta: string) => readFileSync(join(new URL("../..", import.meta.url).pathname, ruta), "utf8");
const es = JSON.parse(leer("messages/es.json")).Traceability as Record<string, string>;
const en = JSON.parse(leer("messages/en.json")).Traceability as Record<string, string>;

describe("el pendiente de la visita tiene etiqueta para cada actividad", () => {
  it(`las ${ACTIVIDADES.length} actividades, en español y en inglés`, () => {
    expect(ACTIVIDADES.length).toBeGreaterThan(0);
    for (const a of ACTIVIDADES) {
      expect(es[`pendienteActividad_${a}`], `falta Traceability.pendienteActividad_${a} en es.json`).toBeTruthy();
      expect(en[`pendienteActividad_${a}`], `falta Traceability.pendienteActividad_${a} en en.json`).toBeTruthy();
    }
  });

  it("y cada propósito su nombre, que encabeza su lista de faltas", () => {
    for (const p of Object.keys(LO_QUE_PIDE)) {
      expect(es[`visitPurpose_${p}`], `falta Traceability.visitPurpose_${p} en es.json`).toBeTruthy();
      expect(en[`visitPurpose_${p}`], `falta Traceability.visitPurpose_${p} en en.json`).toBeTruthy();
    }
  });
});
