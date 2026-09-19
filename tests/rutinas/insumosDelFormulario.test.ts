import { describe, expect, it } from "vitest";
import { insumosDelFormulario } from "../../lib/rutinas/insumosDelFormulario";
import { RutinaError } from "../../lib/rutinas/error";

/**
 * Se llama a la función con las entradas que la romperían, no a través de un
 * formulario real que no la ejercita (regla de la casa, 2026-09-07). Hermético:
 * sólo construye `FormData` en memoria, sin base ni Prisma.
 */
function form(filas: { lote?: string; cantidad?: string; unidad?: string }[]): FormData {
  const f = new FormData();
  filas.forEach((fila, i) => {
    if (fila.lote !== undefined) f.set(`insumo_${i}_lote`, fila.lote);
    if (fila.cantidad !== undefined) f.set(`insumo_${i}_cantidad`, fila.cantidad);
    if (fila.unidad !== undefined) f.set(`insumo_${i}_unidad`, fila.unidad);
  });
  return f;
}

describe("insumosDelFormulario", () => {
  it("cantidad vacía: quantity es null, NUNCA 0", () => {
    const salida = insumosDelFormulario(form([{ lote: "lote-1", cantidad: "" }]));
    expect(salida).toEqual([{ consumableLotId: "lote-1", quantity: null, unit: null }]);
    expect(salida[0]!.quantity).not.toBe(0);
  });

  it("cantidad vacía con unidad puesta: la unidad se conserva igual", () => {
    const salida = insumosDelFormulario(form([{ lote: "lote-1", cantidad: "", unidad: "kg" }]));
    expect(salida).toEqual([{ consumableLotId: "lote-1", quantity: null, unit: "kg" }]);
  });

  it("fila sin campo de cantidad ni unidad (ninguno de los dos en el FormData): igual que vacíos", () => {
    const salida = insumosDelFormulario(form([{ lote: "lote-1" }]));
    expect(salida).toEqual([{ consumableLotId: "lote-1", quantity: null, unit: null }]);
  });

  it("unidad sin cantidad: quantity null, no cantidad_invalida ni unidad_obligatoria", () => {
    const salida = insumosDelFormulario(form([{ lote: "lote-1", unidad: "kg" }]));
    expect(salida).toEqual([{ consumableLotId: "lote-1", quantity: null, unit: "kg" }]);
  });

  it.each(["0", "-1", "abc"])("cantidad «%s»: cantidad_invalida", (cantidad) => {
    expect(() => insumosDelFormulario(form([{ lote: "lote-1", cantidad }]))).toThrow(
      new RutinaError("cantidad_invalida"),
    );
  });

  it("cantidad positiva sin unidad: unidad_obligatoria", () => {
    expect(() => insumosDelFormulario(form([{ lote: "lote-1", cantidad: "3" }]))).toThrow(
      new RutinaError("unidad_obligatoria"),
    );
  });

  it("cantidad positiva con unidad en blanco (sólo espacios): sigue siendo unidad_obligatoria", () => {
    expect(() => insumosDelFormulario(form([{ lote: "lote-1", cantidad: "3", unidad: "   " }]))).toThrow(
      new RutinaError("unidad_obligatoria"),
    );
  });

  it("cantidad positiva con unidad: pasa, con el número parseado", () => {
    const salida = insumosDelFormulario(form([{ lote: "lote-1", cantidad: "2.5", unidad: "kg" }]));
    expect(salida).toEqual([{ consumableLotId: "lote-1", quantity: 2.5, unit: "kg" }]);
  });

  it("fila sin lote se salta entera, aunque traiga cantidad y unidad", () => {
    const salida = insumosDelFormulario(form([{ lote: "", cantidad: "5", unidad: "kg" }]));
    expect(salida).toEqual([]);
  });

  it("fila sin ningún campo (lote ausente del FormData): también se salta", () => {
    const salida = insumosDelFormulario(form([{}]));
    expect(salida).toEqual([]);
  });

  it("máximo tres filas: una cuarta se ignora aunque venga con datos", () => {
    const f = form([
      { lote: "lote-0", cantidad: "1", unidad: "kg" },
      { lote: "lote-1", cantidad: "2", unidad: "kg" },
      { lote: "lote-2", cantidad: "3", unidad: "kg" },
    ]);
    // Una cuarta fila con índice 3, que la función no mira porque el bucle va de 0 a 2.
    f.set("insumo_3_lote", "lote-3");
    f.set("insumo_3_cantidad", "4");
    f.set("insumo_3_unidad", "kg");
    const salida = insumosDelFormulario(f);
    expect(salida).toHaveLength(3);
    expect(salida.map((x) => x.consumableLotId)).toEqual(["lote-0", "lote-1", "lote-2"]);
  });

  it("tres filas mezcladas: la del medio vacía no aporta nada, las otras dos sí", () => {
    const salida = insumosDelFormulario(
      form([
        { lote: "lote-0", cantidad: "1", unidad: "kg" },
        { lote: "" },
        { lote: "lote-2" },
      ]),
    );
    expect(salida).toEqual([
      { consumableLotId: "lote-0", quantity: 1, unit: "kg" },
      { consumableLotId: "lote-2", quantity: null, unit: null },
    ]);
  });
});
