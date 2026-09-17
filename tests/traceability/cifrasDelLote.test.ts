/** Hermética. El caso que tiene que poder fallar: un conteo ausente nunca suma como 0 sin decirlo. */
import { describe, expect, it } from "vitest";
import { cifrasDelLote, type CohorteParaCifras } from "../../lib/traceability/cifrasDelLote";
import type { EstadoDeProduccion } from "../../lib/traceability/estadoDeProduccion";

const enProd: EstadoDeProduccion = { estado: "en_produccion", desde: new Date("2020-01-01T00:00:00Z"), precision: "year" };
const sinMarcar: EstadoDeProduccion = { estado: "sin_marcar" };

describe("cifrasDelLote", () => {
  it("reparte las plantas conocidas entre en producción y sin marcar", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: 600, cultivarValue: { value: "Caturra" } },
      { id: "b", plantCount: 400, cultivarValue: { value: "Catuaí" } },
    ];
    const estados = new Map<string, EstadoDeProduccion>();
    estados.set("a", enProd);
    estados.set("b", sinMarcar);
    const r = cifrasDelLote(cohortes, estados);
    expect(r).toMatchObject({ plantasConocidas: 1000, cohortesSinConteo: 0, enProduccion: 600, sinMarcar: 400 });
  });

  it("una siembra sin conteo NO suma 0 en silencio: cuenta como siembra sin conteo", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: 600, cultivarValue: { value: "Caturra" } },
      { id: "b", plantCount: null, cultivarValue: { value: "Caturra" } },
    ];
    const estados = new Map<string, EstadoDeProduccion>();
    estados.set("a", enProd);
    estados.set("b", enProd);
    const r = cifrasDelLote(cohortes, estados);
    expect(r.plantasConocidas).toBe(600);
    expect(r.cohortesSinConteo).toBe(1);
    expect(r.variedades).toEqual([{ nombre: "Caturra", plantas: 600, cohortesSinConteo: 1 }]);
    // Las dos están marcadas: «en producción» son DOS siembras, y una no tiene
    // conteo. Sin estas cifras la tarjeta decía «en producción: 600» como total
    // medido.
    expect(r).toMatchObject({
      enProduccion: 600,
      siembrasEnProduccion: 2,
      enProduccionSinConteo: 1,
      sinMarcar: 0,
      siembrasSinMarcar: 0,
      sinMarcarSinConteo: 0,
    });
  });

  it("si ninguna siembra tiene conteo, cada estado dice cuántas siembras tiene sin conteo, no un 0", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: null, cultivarValue: null },
      { id: "b", plantCount: null, cultivarValue: null },
      { id: "c", plantCount: null, cultivarValue: null },
    ];
    const estados = new Map<string, EstadoDeProduccion>([["a", enProd]]);
    const r = cifrasDelLote(cohortes, estados);
    expect(r).toMatchObject({
      plantasConocidas: 0,
      cohortesSinConteo: 3,
      enProduccion: 0,
      siembrasEnProduccion: 1,
      enProduccionSinConteo: 1,
      sinMarcar: 0,
      siembrasSinMarcar: 2,
      sinMarcarSinConteo: 2,
    });
  });

  it("agrupa por variedad, de más a menos plantas, y la desconocida al final", () => {
    const cohortes: CohorteParaCifras[] = [
      { id: "a", plantCount: 100, cultivarValue: null },
      { id: "b", plantCount: 200, cultivarValue: { value: "Catuaí" } },
      { id: "c", plantCount: 900, cultivarValue: { value: "Caturra" } },
      { id: "d", plantCount: 50, cultivarValue: { value: "Catuaí" } },
    ];
    const r = cifrasDelLote(cohortes, new Map());
    expect(r.variedades.map((v) => [v.nombre, v.plantas])).toEqual([
      ["Caturra", 900],
      ["Catuaí", 250],
      [null, 100],
    ]);
  });

  it("una siembra sin estado en el mapa cuenta como sin marcar, nunca como en producción", () => {
    const r = cifrasDelLote([{ id: "a", plantCount: 10, cultivarValue: null }], new Map());
    expect(r).toMatchObject({ enProduccion: 0, sinMarcar: 10 });
  });
});
