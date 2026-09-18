import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Hallazgo 5 (revisión independiente de Codex sobre `conceder-beneficio`,
 * 2026-09-18): `app/instalaciones/[id]/page.tsx` calculaba UN solo booleano
 * —`puedeEditarBeneficioEn` sobre la INSTALACIÓN— y lo usaba para decidir si
 * ofrecía el formulario de edición de CADA cama. `actualizarUbicacionDeSecado`
 * (lib/traceability/instalaciones.ts) sí comprueba el permiso por el id DE LA
 * CAMA, así que un capataz con concesión sólo en una cama veía (y podía
 * enviar) el formulario de las demás, que el servidor iba a rechazar una a
 * una — un formulario ofrecido a quien no puede guardarlo, la misma clase de
 * defecto que el commit cc3d9ce ya cerró para la instalación y las recetas.
 *
 * No hay arnés de renderizado de páginas de servidor en este repositorio
 * (ninguna page.tsx se renderiza en tests; ver tests/arquitectura/*.test.ts,
 * que en su lugar leen la fuente). Este guardia sigue ese mismo patrón: lee
 * el archivo y exige que la llamada a `puedeEditarBeneficioEn` dentro del
 * bloque de camas use el id DE LA CAMA (`c.id`), no el de la instalación.
 *
 * **Su límite, dicho:** reconoce el arreglo por el nombre del identificador
 * pasado a `puedeEditarBeneficioEn`. Si el bloque de camas cambia de variable
 * de iteración (deja de llamarse `c`), este guardia hay que actualizarlo con
 * el nuevo nombre — no es una prueba semántica de "por cama", es una prueba
 * de que la llamada existe con la forma correcta.
 */
const RUTA = new URL("../../app/instalaciones/[id]/page.tsx", import.meta.url);

describe("app/instalaciones/[id]/page.tsx: cada cama usa SU PROPIO permiso", () => {
  it("llama a puedeEditarBeneficioEn con el id de la cama (c.id), no sólo con el de la instalación", () => {
    const fuente = readFileSync(RUTA, "utf8");
    const llamadas = [...fuente.matchAll(/puedeEditarBeneficioEn\(\s*user\.userAccountId\s*,\s*([^)]+)\)/g)].map((m) =>
      m[1]!.trim(),
    );
    // Control positivo: la instalación sigue comprobándose con `id` (para el
    // formulario de la propia instalación y para "crear cama", que cuelga del
    // padre) — si esto desaparece, el guardia de abajo estaría mirando un
    // archivo que ya no tiene la forma que se espera.
    expect(llamadas).toContain("id");
    // El hallazgo: debe existir TAMBIÉN una llamada con el id de la cama.
    expect(llamadas).toContain("c.id");
  });
});
