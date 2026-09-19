/**
 * Hermética. `idValidoEnLista` es la comprobación que decide si `?bloque=` o
 * `?material=` se usan para precargar el formulario de manejo — brief PR B
 * tarea 5, decisión #3: un id que no está en la lista se ignora en silencio.
 */
import { describe, expect, it } from "vitest";
import { idValidoEnLista } from "../../lib/traceability/precargaDeIntervencion";

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
