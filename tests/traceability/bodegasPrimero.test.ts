import { describe, expect, it } from "vitest";
import { ordenarParaAlmacenar } from "../../lib/traceability/ordenarParaAlmacenar";

describe("almacenar: bodegas primero, nada deja de ser elegible", () => {
  it("separa bodegas del resto y no pierde ninguna", () => {
    const ls = [
      { id: "1", name: "Parcela", locationType: "plot" },
      { id: "2", name: "Bodega B", locationType: "storage_facility" },
      { id: "3", name: "Cama vieja", locationType: "drying_bed" },
      { id: "4", name: "Bodega A", locationType: "storage_facility" },
    ];
    const { bodegas, otros } = ordenarParaAlmacenar(ls);
    expect(bodegas.map((b) => b.id)).toEqual(["4", "2"]);
    expect(otros.map((o) => o.id)).toEqual(["3", "1"]);
    expect(bodegas.length + otros.length).toBe(ls.length);
  });
});
