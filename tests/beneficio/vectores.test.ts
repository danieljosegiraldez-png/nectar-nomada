import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Los 47 criterios de aceptación del módulo de beneficio, ejecutados de verdad.
 *
 * **De dónde salen.** `docs/beneficio/` es la especificación v3.0 que Daniel
 * encargó, y `tests/fixtures/vectores-de-beneficio.json` es su contrato
 * ejecutable: 13 vectores de pH, 12 de Brix, 13 de balance de masas y 9 de
 * secado. **Diez llevan `why: "REGRESION…"`** y describen defectos reales de la
 * versión anterior; existen para impedir que vuelvan.
 *
 * **Por qué este archivo existe antes que los motores.** El paquete manda
 * construir por pasos y no avanzar hasta que el anterior esté verde. Un tablero
 * que empieza vacío y va llenándose es la única forma de que «faltan 47
 * criterios» sea un hecho visible en cada corrida en vez de una promesa.
 *
 * **Y por eso lo que falta sale como `todo`, no como verde ni como rojo.**
 * Verde mentiría. Rojo permanente enseña a ignorar la compuerta, que es lo que
 * `CLAUDE.md` prohíbe: «un guardia que nunca puede pasar es peor que ninguno».
 * `it.todo` sale contado y aparte, que es exactamente lo que es.
 *
 * **El inventario se declara a mano, y esa es la mitad que protege.** Añadir un
 * motor obliga a tocar `MOTORES`, y eso se lee en el diff. Sin esa línea,
 * alguien podría borrar un motor y sus vectores volverían a `todo` en silencio.
 *
 * Hermético: sólo lee un JSON.
 */

const RAIZ = new URL("../..", import.meta.url).pathname;
const VECTORES = JSON.parse(
  readFileSync(join(RAIZ, "tests/fixtures/vectores-de-beneficio.json"), "utf8"),
) as Record<string, unknown>;

/** Las cuatro familias del contrato, con el módulo que debe contestarlas. */
const FAMILIAS = [
  { clave: "ph", prefijo: "PH", motor: "lib/beneficio/ph.ts" },
  { clave: "brix", prefijo: "BX", motor: "lib/beneficio/brix.ts" },
  { clave: "mass_balance", prefijo: "MB", motor: "lib/beneficio/balanceDeMasas.ts" },
  { clave: "drying", prefijo: "DR", motor: "lib/beneficio/secado.ts" },
] as const;

/**
 * Los motores que YA se pueden ejercer. Se declara a mano, a propósito: es la
 * línea que hay que tocar para decir «esto ya está», y se lee en el diff.
 */
const MOTORES: ReadonlySet<string> = new Set<string>([]);

/**
 * `why` es **opcional**: 37 de los 47 lo traen y diez de ésos empiezan por
 * `REGRESION`. Los otros diez llevan la explicación en el propio `id`
 * —`MB-005-gross-imbalance-blocks-transition`— así que no falta nada; lo que
 * falta es no suponer que está.
 */
interface Vector {
  id: string;
  why?: string;
  expect: Record<string, unknown>;
}

/** Qué se enseña de un vector en el tablero: su `why`, o su `id` si no lo trae. */
const rotulo = (v: Vector): string =>
  v.why ? v.why.slice(0, 70) : v.id.split("-").slice(2).join(" ").replace(/-/g, " ");

const vectoresDe = (clave: string): Vector[] => (VECTORES[clave] as Vector[]) ?? [];

describe("los criterios de aceptación del beneficio", () => {
  /**
   * **Control positivo del propio arnés.** Si el JSON se moviera de sitio o
   * cambiara de forma, las listas saldrían vacías y todo lo de abajo pasaría
   * —o quedaría en `todo`— sin haber mirado nada. Se afirma la cuenta y la
   * forma antes que ningún veredicto.
   */
  it("el contrato se lee entero y trae los 47 criterios", () => {
    const total = FAMILIAS.reduce((n, f) => n + vectoresDe(f.clave).length, 0);
    const desglose = FAMILIAS.map((f) => `${f.clave}=${vectoresDe(f.clave).length}`).join(" ");
    expect(total, `vectores leídos: ${desglose}`).toBe(47);

    for (const f of FAMILIAS) {
      const suyos = vectoresDe(f.clave);
      expect(suyos.length, `la familia ${f.clave} salió vacía`).toBeGreaterThan(0);
      for (const v of suyos) {
        expect(v.id, `un vector de ${f.clave} no tiene id`).toMatch(new RegExp(`^${f.prefijo}-\\d+`));
        expect(v.expect, `${v.id} no declara qué espera`).toBeTruthy();
      }
    }
  });

  /**
   * Los diez de regresión son la memoria del paquete: cada uno es un defecto que
   * ya ocurrió. Se cuentan aparte para que borrar uno no pase desapercibido.
   */
  it("los diez criterios de regresión siguen en el contrato", () => {
    const regresiones = FAMILIAS.flatMap((f) => vectoresDe(f.clave))
      .filter((v) => String(v.why ?? "").startsWith("REGRESION"))
      .map((v) => v.id);
    expect(regresiones, `regresiones encontradas: ${regresiones.join(", ")}`).toHaveLength(10);
  });

  /**
   * El inventario no puede mentir en la dirección peligrosa: declarar un motor
   * implementado sin que su archivo exista dejaría sus vectores fuera de `todo`
   * y fuera de las pruebas — desaparecidos, que es peor que rojos.
   */
  it("cada motor declarado como implementado existe en el disco", () => {
    const fantasmas = [...MOTORES].filter((ruta) => {
      try {
        readFileSync(join(RAIZ, ruta), "utf8");
        return false;
      } catch {
        return true;
      }
    });
    expect(fantasmas, `declarados implementados y ausentes: ${fantasmas.join(", ")}`).toEqual([]);
  });

  for (const familia of FAMILIAS) {
    const implementado = MOTORES.has(familia.motor);
    describe(`${familia.clave} · ${familia.motor}${implementado ? "" : " (sin construir)"}`, () => {
      for (const v of vectoresDe(familia.clave)) {
        if (!implementado) {
          it.todo(`${v.id} — ${rotulo(v)}`);
          continue;
        }
        // Cuando el motor entre, aquí se le pasa el vector y se compara contra
        // `v.expect`. La rama vive vacía a propósito hasta entonces: escribirla
        // antes sería adivinar la firma que `docs/03` ya declara.
        it(`${v.id}`, () => {
          throw new Error(`${familia.motor} está declarado implementado pero nadie ejerce ${v.id}`);
        });
      }
    });
  }
});
