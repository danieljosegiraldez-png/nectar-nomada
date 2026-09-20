/**
 * Hermética. `idValidoEnLista` es la comprobación que decide si `?bloque=` o
 * `?material=` se usan para precargar el formulario de manejo — brief PR B
 * tarea 5, decisión #3: un id que no está en la lista se ignora en silencio.
 */
import { describe, expect, it } from "vitest";
import { idValidoEnLista, opcionesConActual } from "../../lib/traceability/precargaDeIntervencion";

describe("idValidoEnLista", () => {
  // Control positivo: el caso donde SÍ debe devolver el id.
  it("un id presente en la lista se devuelve tal cual", () => {
    expect(idValidoEnLista("a", [{ id: "a" }, { id: "b" }])).toBe("a");
  });

  it("un id que no está en la lista se ignora (null)", () => {
    expect(idValidoEnLista("z", [{ id: "a" }, { id: "b" }])).toBeNull();
  });

  it("sin parámetro (undefined): null, sin mirar la lista", () => {
    expect(idValidoEnLista(undefined, [{ id: "a" }])).toBeNull();
  });

  it("cadena vacía: null, igual que ausente", () => {
    expect(idValidoEnLista("", [{ id: "a" }])).toBeNull();
  });

  it("lista vacía: cualquier id se ignora, nunca revienta", () => {
    expect(idValidoEnLista("a", [])).toBeNull();
  });
});

/**
 * Ronda final de arreglos, hallazgo 4: sin `lot:view` sobre la finca, el
 * `<select>` de la regla de trampas recibe `productos: []`. Sin esta función,
 * `defaultValue={regla.suggestedMaterial.id}` no casa con ninguna `<option>`
 * y el navegador cae en «ninguno»: guardar sin tocar el selector borraría el
 * producto ya guardado.
 */
describe("opcionesConActual", () => {
  // Control positivo: el actual YA está en la lista, no se duplica.
  it("el actual ya está en la lista: la lista vuelve tal cual", () => {
    const opciones = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    expect(opcionesConActual(opciones, { id: "b", name: "B" })).toEqual(opciones);
  });

  it("el actual NO está en la lista (p. ej. productos vino vacío): se añade al final", () => {
    expect(opcionesConActual([], { id: "m1", name: "Bralic WP" })).toEqual([{ id: "m1", name: "Bralic WP" }]);
  });

  it("el actual no está entre varios productos listados: se añade al final, sin quitar los demás", () => {
    const opciones = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    expect(opcionesConActual(opciones, { id: "m1", name: "Bralic WP" })).toEqual([...opciones, { id: "m1", name: "Bralic WP" }]);
  });

  it("sin actual (null): la lista vuelve tal cual, incluida vacía", () => {
    const opciones = [{ id: "a", name: "A" }];
    expect(opcionesConActual(opciones, null)).toEqual(opciones);
    expect(opcionesConActual([], null)).toEqual([]);
  });
});
