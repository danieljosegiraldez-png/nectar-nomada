import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Una acción que redirige con `?ok=` tiene que aterrizar en una pantalla que LEA `ok`.
 *
 * **El fallo que esto guarda, medido el 2026-09-28 recorriendo la interfaz con Daniel.**
 * `registrarInspeccionFormAction` redirigía a `/lots/<id>?ok=inspeccion` desde que existe, y
 * `app/lots/[id]/page.tsx` sólo leía `error` de sus `searchParams`. La confirmación **no se mostró
 * nunca**: el operador registraba una inspección de secado y la página volvía igual que estaba, sin
 * decir que había entrado. Catorce pantallas de la casa ya leían `ok` y ésa era la excepción.
 *
 * **Por qué es una clase y no un caso.** El parámetro lo escribe la acción y lo lee la pantalla, y
 * nada las ata: se puede añadir un `?ok=` nuevo, o mover un redirect a otra ruta, y el resultado es
 * una confirmación silenciosa. No rompe nada —por eso sobrevivió— y sólo se nota mirando la
 * pantalla con ojos de operador. Un guardia sí puede verlo.
 *
 * **Lo que NO comprueba:** que el código concreto (`ok=inspeccion`) tenga su rama y su texto. Eso
 * exigiría interpretar el JSX, y un guardia que adivina marca como malo lo que está bien — ya pasó
 * aquí con el que leía la fuente fiándose de la indentación. Esto comprueba lo que se puede
 * comprobar sin interpretar: que la pantalla de destino mire el parámetro.
 */

const ACCIONES = "app/actions";

/**
 * Las que YA estaban sordas cuando se escribió este guardia, el 2026-09-29, con su fecha para que
 * envejezcan a la vista. **No es una excepción de diseño: es deuda nombrada.** Se listan para que
 * el guardia pueda pasar y así impedir que aparezcan NUEVAS; arreglarlas es escribir su rama y su
 * texto en cada pantalla, y el texto lo decide Daniel.
 *
 * La que motivó el guardia —`/lots/<id>?ok=inspeccion`— NO está aquí: se arregló en el mismo
 * cambio. Si alguna de éstas se arregla, se borra de aquí y el guardia lo exige desde entonces.
 */
const CONOCIDAS = new Set<string>([
  // **Vacía desde el 2026-09-30, y es la forma buena de que esté.** Las cuatro que había
  // —`/beneficio/ajustes` con `guardado` y `concesion`, `/plots/[id]` con `manejo`, y la
  // corrección de un manejo— se arreglaron: las tres pantallas leen `ok` y lo pintan. Ya no hay
  // ninguna excepción, así que el guardia exige la regla entera.
  //
  // Si algún día hay que añadir una, va con su fecha y su motivo, y el test de abajo obliga a
  // borrarla en cuanto se arregle: una lista que nombra cosas ya hechas enseña a leerla por encima.
]);

/** Cada `redirect("…?ok=…")` de las acciones: la ruta de destino y el código. */
function redireccionesConOk(): { archivo: string; ruta: string; codigo: string }[] {
  const salida: { archivo: string; ruta: string; codigo: string }[] = [];
  for (const nombre of readdirSync(ACCIONES)) {
    if (!nombre.endsWith(".ts")) continue;
    const src = readFileSync(join(ACCIONES, nombre), "utf8");
    // `redirect(`/lots/${x}?ok=inspeccion`)` y también comillas normales.
    //
    // **El código puede ser DINÁMICO**, como `?ok=${kind}` en `manejo.ts`, donde dice qué tipo de
    // intervención se registró. Al principio el patrón sólo casaba `[a-z_-]+` y esa redirección se
    // volvió invisible: el guardia dejó de cubrir `/plots/[id]` justo cuando se arregló. Lo destapó
    // el flip-test —quitar las tres comparaciones de esa página y ver que el guardia seguía verde—,
    // no releer el regex. Un extractor que pierde un caso no falla: mide de menos y sale en verde.
    for (const m of src.matchAll(/redirect\(\s*[`"']([^`"']*)\?ok=([a-z_-]+|\$\{[^}]+\})/g)) {
      salida.push({ archivo: join(ACCIONES, nombre), ruta: m[1]!, codigo: m[2]! });
    }
  }
  return salida;
}

/**
 * El `page.tsx` de una ruta del App Router. Un segmento interpolado —`${lotId}`— casa con el
 * directorio dinámico que haya ahí, sea `[id]`, `[slug]` o el nombre que tenga: la acción no sabe
 * cómo se llama el parámetro en el disco, y exigir que coincidan sería inventar una regla.
 */
function paginaDe(ruta: string): string | null {
  const segmentos = ruta.split("/").filter(Boolean);
  let dir = "app";
  for (const seg of segmentos) {
    if (seg.includes("${")) {
      const dinamico = readdirSync(dir, { withFileTypes: true }).find((e) => e.isDirectory() && e.name.startsWith("["));
      if (!dinamico) return null;
      dir = join(dir, dinamico.name);
      continue;
    }
    const siguiente = join(dir, seg);
    if (!existsSync(siguiente)) return null;
    dir = siguiente;
  }
  const page = join(dir, "page.tsx");
  return existsSync(page) ? page : null;
}

/**
 * ¿La pantalla **usa** `ok`, y no sólo lo declara?
 *
 * **Las dos versiones anteriores estaban mal, y lo dijeron los flips, no la lectura.**
 *
 * La primera pedía `ok` seguido de `:`/`,`/`}` en cualquier parte, y eso lo satisface **el tipo**
 * —`searchParams: Promise<{ ok?: string }>`— sin que nadie lea el valor: mutando la página para que
 * dejara de leerlo, el guardia seguía en verde.
 *
 * La segunda exigía la desestructuración `const { ok } = await searchParams`, y **marcó como sordas
 * a `/equipos/[id]` y `/recipes/[id]`, que leen bien**: resuelven `searchParams` dentro de un
 * `Promise.all` y usan `sp.ok` / `query.ok`. Un guardia que marca el código correcto enseña a
 * ignorarlo, y aquí ya se descartaron tres versiones de un hook por eso.
 *
 * Lo que distingue de verdad no es **cómo** se obtiene el valor sino que se **use**: una comparación
 * `ok === "…"` —con o sin objeto delante— o una desestructuración desde `await searchParams`. El
 * tipo por sí solo no basta, y la forma de obtenerlo da igual.
 */
function leeOk(page: string): boolean {
  const src = readFileSync(page, "utf8");
  // **Una comparación, no una desestructuración.** La tercera versión aceptaba también
  // `const { ok } = await searchParams`, y el flip lo tumbó: quitando de la página la rama que
  // pinta el aviso —pero dejando la desestructuración— el guardia seguía en verde. Sacar el valor
  // y no enseñarlo deja la confirmación igual de invisible, que es lo que esto vigila.
  // Comprobado sobre las 16 redirecciones reales: ninguna pantalla correcta se marca por esto.
  return /\bok\b\s*===/.test(src) && /searchParams/.test(src);
}

describe("una confirmación que nadie lee no es una confirmación", () => {
  const redirecciones = redireccionesConOk();

  /**
   * **Control positivo del extractor, y va primero a propósito.** Si el regex deja de casar, la
   * lista sale vacía y el test de abajo pasa sobre nada — la forma exacta de un cero que significa
   * «no miré». El 2026-09-29 había 23 redirecciones con `?ok=`.
   */
  it("el extractor encuentra las redirecciones con ?ok=", () => {
    expect(redirecciones.length, `Ningún redirect con ?ok= en ${ACCIONES}: el extractor está ciego`).toBeGreaterThanOrEqual(15);
    expect(redirecciones.map((r) => r.codigo)).toContain("inspeccion");
    // Y al menos uno DINÁMICO, para que el punto ciego del 2026-09-30 no pueda volver sin caer aquí.
    expect(
      redirecciones.filter((r) => r.codigo.startsWith("${")).length,
      "Ningún `?ok=${…}`: el extractor volvió a perder los códigos dinámicos",
    ).toBeGreaterThanOrEqual(1);
  });

  it("cada ruta de destino se resuelve a una pantalla", () => {
    const perdidas = redirecciones.filter((r) => paginaDe(r.ruta) === null).map((r) => `${r.ruta} (desde ${r.archivo})`);
    expect(perdidas, "Redirige a una ruta sin `page.tsx`: o la ruta está mal, o este resolutor no la entiende").toEqual([]);
  });

  it("y esa pantalla lee `ok` de sus searchParams", () => {
    const sordas = redirecciones
      .filter((r) => !CONOCIDAS.has(`${r.ruta}?ok=${r.codigo}`))
      .filter((r) => {
        const page = paginaDe(r.ruta);
        return page !== null && !leeOk(page);
      })
      .map((r) => `${r.ruta}?ok=${r.codigo} → ${paginaDe(r.ruta)}`);
    expect(
      sordas,
      "La acción confirma algo que la pantalla de destino nunca enseña. Leé `ok` ahí, o quitá el parámetro",
    ).toEqual([]);
  });

  /**
   * **Que la deuda no se quede de adorno.** Si alguien arregla una de las conocidas y no la borra
   * de la lista, el guardia deja de exigirla sin que nadie lo note — y una lista que nombra cosas
   * ya arregladas enseña a leerla por encima, que es como muere un inventario.
   */
  it("la lista de conocidas no nombra ninguna que ya esté arreglada", () => {
    const yaArregladas = [...CONOCIDAS].filter((entrada) => {
      const ruta = entrada.split("?ok=")[0]!;
      const page = paginaDe(ruta);
      return page !== null && leeOk(page);
    });
    expect(yaArregladas, "Esto ya lee `ok`: borralo de CONOCIDAS y el guardia lo exigirá").toEqual([]);
  });
});
