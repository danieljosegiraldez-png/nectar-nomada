/**
 * El mapa de sitios, y las cuatro formas en que este mapa se rompe callado.
 *
 * **Por qué un guardia de código fuente y no una prueba de render.** Leaflet
 * pinta contra un DOM real y mide su contenedor; en jsdom el contenedor mide 0 y
 * la prueba pasaría igual con el mapa roto. Las cuatro cosas que abajo se
 * afirman son formas escritas —igual que el inventario de acceso y el guardia
 * de doble toque—, y cada una tiene su **control positivo**: se enseña primero
 * el caso donde la forma buena SÍ aparece, porque «no encontré lo malo» sobre un
 * archivo que no se está leyendo es el verde vacío de siempre.
 *
 * Las cuatro salen de fallos concretos, no de una lista de buenas prácticas:
 *
 * 1. **Leaflet importado en el módulo revienta el render de servidor.** Toca
 *    `window` al cargarse. `app/apiaries/page.tsx` es un componente de servidor,
 *    así que un `import "leaflet"` estático en el hijo tumba la pantalla entera.
 * 2. **Sin atribución no se pueden usar las teselas de OpenStreetMap.** Es una
 *    condición de su política de uso, no una cortesía, y ADR-009 enmendado
 *    eligió OSM justo porque no exige token — no porque no exija nada.
 * 3. **El formulario de coordenadas condicionado a que ya haya una propuesta.**
 *    Es el fallo que tuvo esta pantalla hasta el 2026-09-08: sin visitas con
 *    GPS no hay propuesta, sin propuesta no aparecía el formulario, y sin
 *    formulario no había forma de teclear una coordenada. Cero de 24
 *    ubicaciones tenían coordenadas y la única puerta para arreglarlo estaba
 *    detrás de una condición que nadie podía cumplir.
 * 4. **Un contenedor sin altura resuelta da un mapa de 0 px.** Leaflet no lanza
 *    error: inicializa, no dibuja nada, y la pantalla se ve vacía.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../..", import.meta.url).pathname;
const leer = (ruta: string) => readFileSync(`${RAIZ}${ruta}`, "utf8");

const MAPA = "app/components/apiary/MapaDeSitios.tsx";
const FICHA = "app/apiaries/[id]/page.tsx";
const FORMULARIO_COORDENADAS = "app/components/apiary/ConfirmarCoordenadasForm.tsx";
const HOJA = "app/globals.css";

describe("el mapa de sitios", () => {
  it("carga Leaflet dentro de un efecto, nunca en el módulo", () => {
    const src = leer(MAPA);

    // Control positivo: la forma BUENA está aquí. Sin esto, la aserción de
    // abajo pasaría sobre un archivo que ya no carga Leaflet de ninguna manera.
    expect(src).toMatch(/await import\(["']leaflet["']\)/);
    expect(src.trimStart()).toMatch(/^["']use client["']/);

    // Y la forma mala no. `import type` no cuenta: se borra al compilar y nunca
    // llega a ejecutar nada.
    const estaticos = [...src.matchAll(/^import\s+(?!type\b)[^;]*?from\s+["']leaflet/gm)].map((m) => m[0]);
    expect(estaticos).toEqual([]);
  });

  it("pide las teselas de OpenStreetMap con su atribución", () => {
    const src = leer(MAPA);
    expect(src).toContain("tile.openstreetmap.org");
    // La atribución va en el mismo sitio que la capa, y nombra a OSM.
    expect(src).toMatch(/attribution:[^\n]*OpenStreetMap/);
  });

  /**
   * **El formulario se mudó el 2026-09-19 y esta prueba cayó, que es lo que
   * tenía que pasar.** Su comentario decía «si algún día se muda, esta prueba
   * tiene que fallar en vez de aprobar su ausencia», y así fue: salió a
   * `ConfirmarCoordenadasForm` —un componente de cliente— para poder ENSEÑAR el
   * error que la acción devuelve, que antes era un 500
   * (`PENDING_IMPLEMENTATIONS/013`). La propiedad vigilada no cambia; cambia
   * dónde se lee, y ahora se lee en los dos sitios: la ficha tiene que pintarlo
   * sin condición, y el componente tiene que traer los campos.
   */
  it("el formulario de coordenadas no depende de que exista una propuesta", () => {
    const ficha = leer(FICHA);
    const formulario = leer(FORMULARIO_COORDENADAS);

    // Control positivo, en sus dos mitades: la ficha lo pinta y el componente
    // existe con sus campos. Sin esto, «no encontré la condición mala» sería
    // verde sobre un formulario que ya no está en ninguna parte.
    expect(ficha).toContain("<ConfirmarCoordenadasForm");
    expect(formulario).toContain("confirmarCoordenadasAction");
    expect(formulario).toContain('name="latitude"');

    // La forma mala: cualquier condicional de JSX cuyo test sea la propuesta.
    // Los valores por defecto SÍ pueden mirarla —`propuesta ? … : ""` dentro de
    // un `defaultValue` es lo correcto—, así que sólo se persigue el
    // condicional que abre bloque, que es el que esconde el formulario.
    expect(ficha).not.toMatch(/\{\s*coordenadas\.propuesta\s*\?\s*\(/);
    expect(formulario).not.toMatch(/\{\s*propuesta\s*\?\s*\(/);
    // Y tampoco la sección entera detrás de «hay algo que decir».
    expect(ficha).not.toMatch(/\{coordenadas\.yaDeclaradas \|\| coordenadas\.muestras > 0 \?/);
  });

  it("el contenedor del mapa tiene una altura explícita", () => {
    const css = leer(HOJA);
    const regla = css.match(/\.nn-mapa\s*\{([^}]*)\}/);
    // Control positivo: la regla existe. Un `match` nulo con un `?.` detrás
    // haría que «sin altura» y «sin regla» se leyeran igual.
    expect(regla).not.toBeNull();
    expect(regla![1]).toMatch(/height:\s*\d+px/);

    // Y la clase que el componente pone es esa misma, no una parecida.
    expect(leer(MAPA)).toContain('className="nn-mapa"');
  });
});
