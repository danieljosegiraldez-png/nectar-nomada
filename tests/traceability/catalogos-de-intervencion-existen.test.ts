import { describe, expect, it } from "vitest";

import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";
import { CATALOGOS_DE_INTERVENCION } from "../../lib/traceability/lotProcess";

/**
 * Cada catálogo que el formulario de intervenciones ofrece tiene que existir de
 * verdad en la semilla.
 *
 * **Por qué esto necesita un guardia y no basta con leer el diff.** Añadir un
 * catálogo aquí es una línea —lo dice el comentario de `CATALOGOS_DE_INTERVENCION`,
 * y es justo lo que lo hace fácil de romper—. Si esa línea trae una errata, nada
 * se queja: `registrarIntervencion` filtra por `catalog.key` y la consulta del
 * formulario hace `where: { catalog: { key: { in: [...] } } }`. Una clave que no
 * existe **devuelve cero filas**, y cero filas se pinta como una lista sin
 * opciones. En el patio eso se lee como «todavía no hay valores cargados», que
 * es exactamente la conclusión equivocada.
 *
 * Es la forma que `CLAUDE.md` tiene escrita: un cero plausible de algo que no se
 * midió. Aquí el cero se convierte en un fallo con nombre.
 *
 * Hermético: compara dos constantes de TypeScript, sin base y sin red.
 */

const CLAVES_SEMBRADAS = new Set(VARIABLE_CATALOGS.map((c) => c.key));

describe("los catálogos de intervención existen en la semilla", () => {
  /**
   * **El control positivo del propio análisis.** Si `VARIABLE_CATALOGS` se
   * renombrara o se vaciara, las comprobaciones de abajo pasarían todas sin
   * mirar nada: un conjunto vacío no contradice a nadie porque no se consulta.
   * Esta primera prueba es la que se cae cuando el instrumento deja de medir.
   */
  it("el análisis ve los dos lados", () => {
    expect(CLAVES_SEMBRADAS.size, "la semilla no define ningún catálogo: se rompió la lectura").toBeGreaterThanOrEqual(
      20,
    );
    expect(CATALOGOS_DE_INTERVENCION.length, "la lista de intervenciones salió vacía").toBeGreaterThanOrEqual(8);
    for (const conocido of ["condicion_oxigeno", "manejo_temperatura"]) {
      expect(CLAVES_SEMBRADAS, `falta ${conocido} — la semilla no es la que se cree`).toContain(conocido);
    }
  });

  it("ninguna clave de la lista apunta a un catálogo que no existe", () => {
    const huerfanas = CATALOGOS_DE_INTERVENCION.filter((k) => !CLAVES_SEMBRADAS.has(k));
    expect(
      huerfanas,
      `el formulario ofrecería estos catálogos y la consulta devolvería cero filas: ${huerfanas.join(", ")}`,
    ).toEqual([]);
  });

  it("y ninguno de ellos está sembrado sin valores, que se pintaría igual de vacío", () => {
    const vacios = CATALOGOS_DE_INTERVENCION.filter((k) => {
      const def = VARIABLE_CATALOGS.find((c) => c.key === k);
      return def !== undefined && def.values.length === 0;
    });
    expect(vacios, `catálogos sin un solo valor: ${vacios.join(", ")}`).toEqual([]);
  });

  /**
   * La decisión de Daniel del 2026-09-14, escrita donde una regresión la toca.
   *
   * No es una prueba de que la constante contenga una cadena —eso sería
   * tautológico—. Es que **la cepa concreta que él nombró es alcanzable desde el
   * beneficio de un lote**: la clave está en la lista Y el valor está en la
   * semilla. Antes de hoy la segunda mitad era cierta y la primera no, y por eso
   * `registrarIntervencion` rechazaba MP72 con `catalog_value_wrong_catalog`.
   */
  it("la cepa de levadura se puede registrar contra un lote, y MP72 está en el vocabulario", () => {
    expect(
      CATALOGOS_DE_INTERVENCION,
      "sin esta clave, registrarIntervencion rechaza cualquier cepa: la levadura vuelve a ser una nota",
    ).toContain("levadura_cultivo");

    const levaduras = VARIABLE_CATALOGS.find((c) => c.key === "levadura_cultivo");
    expect(levaduras, "el catálogo de levaduras desapareció de la semilla").toBeDefined();
    expect(levaduras!.values.map((v) => v.value)).toContain("MP72");
  });
});
