/**
 * Una colmena no se crea sin su colocación.
 *
 * **El incidente, medido el 2026-09-15.** ADR-126 creó `apiary.hive_placement`, rellenó una
 * fila por cada colmena que existía, y dejó la invariante **en un comentario**:
 * «`createHive` no la crea». `scripts/apiario-toabre.ts` la creó a mano, con esa nota al
 * lado; `scripts/apiario-las-nubes.ts` y `scripts/procedencias-y-sitios.ts` —escritos el
 * mismo día, por el mismo camino— no.
 *
 * El resultado sobre la copia local con los datos reales: **10 de 29 colmenas sin ninguna
 * colocación**, y las diez eran las de Apiario Las Nubes. Para `apiarioDeColmenaEn` no
 * constaban en ningún sitio en ninguna fecha, y `colmenasDeLaVentana` —el §9 completo, la
 * primera pregunta histórica del módulo— era ciega al apiario real del dueño. **Nada fallaba
 * en rojo: la respuesta salía vacía**, que se lee como «no hay».
 *
 * **Por qué un guardia de FUENTE.** Una comprobación de datos —«ninguna colmena sin
 * colocación abierta»— sería más fuerte y no se puede tener: `tests/traceability/
 * jornadaEnApiario.test.ts` crea colmenas con `prisma.hive.create` para su propio montaje, y
 * sobre la base compartida ese montaje convive con las demás sesiones. El guardia se iría a
 * rojo por una prueba ajena en vuelo, que es la peor clase de guardia. Así que lo que se
 * comprueba es lo que se puede: **que cada sitio que crea una colmena cree su colocación**.
 *
 * **Su límite, dicho:** mide por ARCHIVO, no por línea. Un archivo con dos `hive.create` y
 * una sola colocación pasa. Lo que caza es la omisión entera, que es la que ocurrió.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../..", import.meta.url).pathname;
const AMBITO = ["lib", "scripts"];

function fuentes(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...fuentes(ruta));
    else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) salida.push(ruta);
  }
  return salida;
}

/** Los `.create` sobre la tabla de colmenas, mirando código y no comentarios. */
export function creaColmenas(fuente: string): number {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return [...sinComentarios.matchAll(/\b(?:prisma|tx)\.hive\.create\b/g)].length;
}

/** Y la colocación, por el ayudante compartido o por la tabla directamente. */
export function creaColocaciones(fuente: string): number {
  const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  return [...sinComentarios.matchAll(/\bcrearColocacionInicial\b|\b(?:prisma|tx)\.hivePlacement\.create\b/g)].length;
}

describe("una colmena no se crea sin su colocación", () => {
  const archivos = AMBITO.flatMap((d) => fuentes(join(RAIZ, d))).map((r) => relative(RAIZ, r));
  const conCreacion = archivos.filter((r) => creaColmenas(readFileSync(join(RAIZ, r), "utf8")) > 0);

  it("el detector encuentra los sitios que crean colmenas — control positivo antes de todo", () => {
    // Sin esto, «ninguno incumple» significaría «no miré». Al escribirse eran cuatro:
    // el servicio y los tres guiones de datos.
    expect(conCreacion.length).toBeGreaterThanOrEqual(4);
    expect(conCreacion).toContain("lib/apiary/hives.ts");
    expect(conCreacion).toContain("scripts/apiario-las-nubes.ts");
  });

  it("cada uno crea también su colocación", () => {
    const sinColocacion = conCreacion.filter((r) => creaColocaciones(readFileSync(join(RAIZ, r), "utf8")) === 0);
    expect(sinColocacion).toEqual([]);
  });

  it("CONTROL DEL DETECTOR: sobre fuentes sintéticas, cuenta lo que hay y no lo que se nombra", () => {
    expect(creaColmenas('await tx.hive.create({ data: {} });')).toBe(1);
    expect(creaColmenas('await prisma.hive.create({});\nawait tx.hive.create({});')).toBe(2);
    // Un comentario que HABLA de crear colmenas no es crear una: es la trampa que ya me
    // costó una medición el mismo día, con `not.toContain("prisma")` sobre un comentario.
    expect(creaColmenas('// aquí iría un tx.hive.create\nexport const x = 1;')).toBe(0);
    expect(creaColmenas('/* prisma.hive.create */')).toBe(0);
    // Y que no confunda otras tablas.
    expect(creaColmenas("await tx.hivePlacement.create({});")).toBe(0);
    expect(creaColocaciones("await crearColocacionInicial(tx, {});")).toBe(1);
    expect(creaColocaciones("await tx.hivePlacement.create({});")).toBe(1);
    expect(creaColocaciones("// crearColocacionInicial")).toBe(0);
  });
});
