/**
 * **El guardia es un SÍMBOLO, no un nombre.** `PENDING_IMPLEMENTATIONS/007`,
 * escalón 2 — decisión de Daniel del 2026-10-04.
 *
 * **Qué cierra.** `analizar.mjs` reconoce un guardia por convención de nombre, y
 * la ficha dice el precio: *«una función que no hace nada con ese nombre cuenta
 * como guardia»*. Esto resuelve cada llamada hasta la **declaración real** de su
 * símbolo —siguiendo los alias de `import`— y comprueba que toda operación que
 * la convención llama «guardia directo» **alcance de verdad** el servicio de
 * autorización.
 *
 * **No sustituye la clasificación: la verifica.** La allowlist y las tres
 * compuertas se apoyan en las clases de `analizar.mjs`; cambiarlas de substrato
 * sería otro cambio con otra discusión. Esta compuerta sólo falla cuando la
 * convención **miente**.
 *
 * **El coste, medido el 2026-10-04 y no supuesto** —era la decisión que la ficha
 * dejaba al dueño—: `~16-23 s` y `~1,8 GB`, con las **19.996** llamadas del árbol
 * resueltas al **100 %**. Tres mediciones del mismo número diferían 25×: 8 s
 * medía un solo archivo, 208 s medía bajo presión de memoria. La buena es ésta,
 * en proceso limpio.
 *
 * Hermético: lee el árbol, no la base.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analizar } from "../../scripts/inventario/analizar.mjs";
import { modelosDelEsquema } from "../../scripts/inventario/esquema.mjs";
import { autorizacionPorSimbolo, clave } from "../../scripts/inventario/simbolos.mjs";

const RAIZ = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const IGNORA = /node_modules|\.next|generated|\.git/;

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(join(RAIZ, dir))) {
    const rel = `${dir}/${e}`;
    if (IGNORA.test(rel)) continue;
    if (statSync(join(RAIZ, rel)).isDirectory()) archivos(rel, out);
    else if (/\.tsx?$/.test(rel)) out.push(rel);
  }
  return out;
}

const rutas = [...archivos("app"), ...archivos("lib")];
const fuentes = new Map(rutas.map((f) => [f, readFileSync(join(RAIZ, f), "utf8")]));
const filas = analizar(fuentes, modelosDelEsquema(readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8")));
const S = autorizacionPorSimbolo({ raiz: RAIZ });
const k = (f: { archivo: string; nombre: string }) => clave(f.archivo, f.nombre);

/** Toda clave que el grafo conoce, como origen o como destino de una llamada. */
const conocidas = new Set<string>([...S.aristas.keys(), ...[...S.aristas.values()].flatMap((v) => [...v])]);

describe("el guardia se resuelve hasta su símbolo", () => {
  /**
   * **La fila patrón, y va primero.** Las dos mitades se identifican por
   * `archivo:nombre`, y los nombres los calculan DOS funciones distintas:
   * `unidades()` en `analizar.mjs` y `unidadDe()` en `simbolos.mjs`. Si
   * divergen, el cruce da cero y el verde de abajo no significa nada.
   */
  it("las claves de los dos lados casan", () => {
    const casan = filas.filter((f) => S.aristas.has(k(f))).length;
    expect(filas.length, "el inventario no puede salir vacío").toBeGreaterThan(100);
    expect(
      casan,
      `sólo ${casan} de ${filas.length} claves existen en el grafo: ` +
        "unidades() y unidadDe() divergieron y nada de este archivo mide"
    ).toBe(filas.length);
  });

  it("la resolución alcanza el 100 % de las llamadas, o no sabemos qué no vio", () => {
    expect(S.llamadas).toBeGreaterThan(1000);
    expect(S.resueltas, `${S.llamadas - S.resueltas} llamadas sin resolver`).toBe(S.llamadas);
  });

  /**
   * **El defecto que este escalón existe para cerrar.** Hoy sale 0, y eso es un
   * hecho medido, no una esperanza: las 396 operaciones que la convención llama
   * «guardia directo» alcanzan todas el servicio de autorización.
   *
   * Si alguna aparece, lo que hay es un nombre que promete y no cumple: una
   * función llamada `require…Access` que no llega al servicio. Eso no se
   * justifica en la allowlist — se arregla.
   */
  it("ninguna operación es «guardia directo» por el nombre sin alcanzar el servicio", () => {
    const directas = filas.filter((f) => f.clase === "guardia directo");
    expect(directas.length, "sin «guardia directo» no hay nada que verificar").toBeGreaterThan(50);
    const mienten = directas.filter((f) => !S.autorizan.has(k(f))).map(k);
    expect(
      mienten,
      "la convención de nombres las cuenta como guardia y el comprobador de tipos dice " +
        "que no alcanzan lib/rbac/service.ts. Un nombre que promete y no cumple se arregla, " +
        "no se justifica en la allowlist."
    ).toEqual([]);
  });

  /**
   * **La inversa NO es un fallo, y se fija como hecho.** Son operaciones que
   * autorizan de verdad y la convención no ve, así que alguien tuvo que
   * justificarlas a mano. Medido el 2026-10-04: **dos**, y sus propias razones
   * en la allowlist dicen por qué —«que el detector no reconoce porque está a
   * dos saltos», «el detector no lo reconoce como guardia»—. El comprobador de
   * tipos sostiene ahora esas dos frases.
   *
   * Si el número crece, la convención se está quedando atrás y conviene saberlo;
   * si baja, alguien las acercó al servicio. Las tres puertas se excluyen porque
   * «alcanzar» es trivial para ellas.
   */
  it("y las que autorizan sin que el nombre lo vea están contadas", () => {
    const sinClase = filas.filter((f) => !f.clase.startsWith("guardia"));
    const callan = sinClase.filter((f) => S.autorizan.has(k(f)) && !S.puertas.has(k(f))).map(k);
    expect(callan.sort()).toEqual([
      "lib/equipos/bandejas.ts:registrarBandejas",
      "lib/equipos/modosDeInstrumento.ts:declararModoDeInstrumento",
    ]);
  });

  /**
   * **Lo que la convención no podía distinguir y el símbolo sí**, los tres casos
   * medidos el 2026-10-04. Los `exige*` son el ejemplo bueno: hay **50** en el
   * árbol y la mayoría son **validadores**, así que meterlos en la convención
   * habría marcado 36 operaciones como guardadas por la fuerza de un validador
   * de fechas. Con símbolos no hay nada que enumerar.
   */
  it.each([
    ["un guardia en español llega al servicio", "lib/equipos/equipos.ts:exigePermiso", true],
    ["y otro también", "lib/traceability/entregasDeCosecha.ts:exigePoderAnotar", true],
    ["un validador con el mismo prefijo NO", "lib/traceability/ritmo.ts:exigeFecha", false],
    ["y el homónimo de can() tampoco", "lib/rbac/resolve.ts:can", false],
  ])("%s", (_etiqueta, llave, esperado) => {
    // **El control de existencia, y hace falta.** La primera versión de este caso
    // puso `exigeFecha` en `intervenciones.ts` cuando vive en `ritmo.ts`, y pasó
    // en verde: una aserción de «no autoriza» sobre una clave que NO EXISTE da
    // `false` por el motivo equivocado. Sin esta línea, un error de ruta se lee
    // como un guardia que discrimina.
    expect(conocidas.has(llave), `${llave} no existe en el grafo: la aserción no mide`).toBe(true);
    expect(S.autorizan.has(llave)).toBe(esperado);
  });
});
