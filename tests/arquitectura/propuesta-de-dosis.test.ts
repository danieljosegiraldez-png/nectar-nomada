import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **La dosis se PROPONE, no se escribe, y el aviso no convierte un hueco en una afirmación.**
 *
 * El PR #554 dejó que un producto fitosanitario declare su uso, su rango de dosis, la unidad y qué
 * plagas cubre. Esto comprueba cómo lo USA el formulario de intervención, y vigila las dos maneras
 * de estropearlo que esta casa ya ha pagado antes:
 *
 * 1. **Rellenar la cantidad con un número de dentro del rango.** La etiqueta da mínimo y máximo;
 *    elegir la media, o el mínimo, es inventarle una precisión que nadie declaró. El rango se
 *    enseña y decide el operario.
 * 2. **Avisar cuando la lista de plagas está vacía.** Vacío es «nadie lo declaró», no «no cubre
 *    ninguna». Avisar ahí pondría un aviso en todos los productos hasta que alguien rellene el
 *    catálogo, que es exactamente cómo se enseña a ignorar un aviso.
 *
 * Se lee la fuente, así que vale la regla de la casa: la mutación de un flip tiene que quitar **la
 * conducta**, no el token con el que casa el detector.
 */
const LINEA = new URL("../../app/components/traceability/LineaDeIntervencion.tsx", import.meta.url).pathname;
const SERVICIO = new URL("../../lib/traceability/intervenciones.ts", import.meta.url).pathname;
const fuente = (p: string) => readFileSync(p, "utf8");

describe("el servicio manda lo que el producto declara", () => {
  it("los cinco campos viajan al formulario, en el tipo y en la consulta", () => {
    const src = fuente(SERVICIO);
    for (const campo of ["plantProtectionUse", "doseMin", "doseMax", "doseUnit", "plantProtectionTargets"]) {
      // Dos veces como mínimo: declarado en el tipo y pedido en el `select`.
      expect(src.split(campo).length - 1, `${campo} aparece muy pocas veces`).toBeGreaterThanOrEqual(2);
    }
  });

  it("un `Decimal` nulo llega como NULO, no como 0", () => {
    // `Number(null)` da 0, y 0 no es «sin declarar»: es una dosis, y una que la base rechaza.
    expect(fuente(SERVICIO)).toMatch(/doseMin: m\.doseMin === null \? null : Number\(m\.doseMin\)/);
    expect(fuente(SERVICIO)).toMatch(/doseMax: m\.doseMax === null \? null : Number\(m\.doseMax\)/);
  });
});

describe("la dosis se propone como rango", () => {
  const src = () => fuente(LINEA);

  it("el campo de cantidad NO se precarga con la dosis del producto", () => {
    // La conducta prohibida: que `quantity` saque su `defaultValue` de doseMin/doseMax/una media.
    const bloque = src().slice(src().indexOf("].quantity`"), src().indexOf("].unit`"));
    expect(bloque, "el campo de cantidad se está precargando con la dosis del producto").not.toMatch(/dose(Min|Max)/);
    // Control positivo: el bloque medido es el correcto y no una cadena vacía.
    expect(bloque).toMatch(/defaultValue=\{valores\.quantity/);
  });

  it("y el rango sí se ENSEÑA", () => {
    expect(src()).toMatch(/dosisDeclarada/);
    expect(src()).toMatch(/manejoDoseLabel/);
  });

  it("la unidad se precarga del producto, con remonte al cambiar", () => {
    const bloque = src().slice(src().indexOf("].unit`") - 400, src().indexOf("].unit`") + 400);
    expect(bloque).toMatch(/valorMostradoDeUnidad/);
    expect(bloque, "sin `key` el defaultValue no se actualiza al cambiar de producto").toMatch(/key=\{materialId\}/);
  });
});

describe("el aviso del objetivo", () => {
  const src = () => fuente(LINEA);

  it("no avisa cuando el producto no declara NINGUNA plaga", () => {
    // Vacío es «nadie lo declaró». La condición tiene que exigir longitud > 0.
    expect(src()).toMatch(/plantProtectionTargets\.length > 0/);
  });

  it("no avisa con el objetivo «otro», que no es una plaga concreta", () => {
    expect(src()).toMatch(/target !== "otro"/);
  });

  it("y avisa cuando el producto declara plagas y el objetivo no está entre ellas", () => {
    expect(src()).toMatch(/!producto\.plantProtectionTargets\.includes\(target\)/);
    expect(src()).toMatch(/manejoTargetNoDeclarado/);
  });

  it("el aviso no bloquea el envío: es un párrafo, no un `required` ni un `disabled`", () => {
    const i = src().indexOf("noDeclaraElObjetivo ?");
    const bloque = src().slice(i, i + 300);
    expect(bloque).toMatch(/<p /);
    expect(bloque).not.toMatch(/disabled|required/);
  });
});
