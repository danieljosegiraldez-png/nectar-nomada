/**
 * El guardia de los códigos derivados. Llama a las funciones con la entrada
 * hostil directamente: una función que sólo se puede probar a través de un
 * formulario que no la ejercita no está probada.
 */
import { describe, it, expect } from "vitest";
import { codigosDerivados, letraDeOrden } from "../../lib/traceability/codigosDerivados";

describe("letraDeOrden", () => {
  it("A…Z y después AA, como una hoja de cálculo", () => {
    expect(letraDeOrden(0)).toBe("A");
    expect(letraDeOrden(25)).toBe("Z");
    expect(letraDeOrden(26)).toBe("AA");
    expect(letraDeOrden(27)).toBe("AB");
    expect(letraDeOrden(51)).toBe("AZ");
    expect(letraDeOrden(52)).toBe("BA");
  });

  it("rechaza lo que no es un índice", () => {
    expect(() => letraDeOrden(-1)).toThrow(RangeError);
    expect(() => letraDeOrden(1.5)).toThrow(RangeError);
  });
});

describe("codigosDerivados", () => {
  it("continúa la convención real del dueño: PE-90 produjo PE-90-A y PE-90-B", () => {
    expect(codigosDerivados("PE-90", 2)).toEqual(["PE-90-A", "PE-90-B"]);
  });

  it("tres corrientes, como PE-95 en los datos reales", () => {
    expect(codigosDerivados("PE-95", 3)).toEqual(["PE-95-A", "PE-95-B", "PE-95-C"]);
  });

  it("salta los sufijos que ya tienen dueño", () => {
    // `lot_code` es único por organización: reclamar uno tomado aborta la
    // transacción entera, así que saltarlo no es cortesía, es correción.
    expect(codigosDerivados("PE-90", 2, ["PE-90-A"])).toEqual(["PE-90-B", "PE-90-C"]);
    expect(codigosDerivados("PE-90", 2, ["PE-90-A", "PE-90-C"])).toEqual(["PE-90-B", "PE-90-D"]);
  });

  it("compara sin mirar mayúsculas: PE-90-a ya ocupa PE-90-A", () => {
    expect(codigosDerivados("PE-90", 1, ["pe-90-a"])).toEqual(["PE-90-B"]);
  });

  /**
   * Control positivo del control: sin nada tomado, la MISMA llamada tiene que
   * salir distinta. Si `codigosDerivados` ignorara `yaUsados`, las dos pruebas
   * de arriba seguirían pasando por coincidencia.
   */
  it("sin nada tomado devuelve la primera letra", () => {
    expect(codigosDerivados("PE-90", 1, [])).toEqual(["PE-90-A"]);
  });

  it("un padre que ya lleva sufijo recibe otro, y el código se alarga", () => {
    expect(codigosDerivados("PE-87-A", 2)).toEqual(["PE-87-A-A", "PE-87-A-B"]);
  });

  it("cero códigos es una respuesta legítima, no un error", () => {
    expect(codigosDerivados("PE-90", 0)).toEqual([]);
  });

  it("recorta el espacio alrededor del padre", () => {
    expect(codigosDerivados("  PE-90  ", 1)).toEqual(["PE-90-A"]);
  });

  it("rechaza un padre vacío en vez de acuñar «-A»", () => {
    expect(() => codigosDerivados("", 1)).toThrow(RangeError);
    expect(() => codigosDerivados("   ", 1)).toThrow(RangeError);
  });

  it("rechaza una cantidad que no es un entero no negativo", () => {
    expect(() => codigosDerivados("PE-90", -1)).toThrow(RangeError);
    expect(() => codigosDerivados("PE-90", 2.5)).toThrow(RangeError);
  });

  it("se planta antes de colgarse si no quedan sufijos razonables", () => {
    const todos = Array.from({ length: 702 }, (_, i) => `PE-90-${letraDeOrden(i)}`);
    expect(() => codigosDerivados("PE-90", 1, todos)).toThrow(/no quedan sufijos/);
  });
});
