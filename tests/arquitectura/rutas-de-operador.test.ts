import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Toda página desde la que se captura en el campo se abre sin señal.
 *
 * **El hueco que lo motiva, medido el 2026-09-07.** `public/sw.js` cachea las
 * rutas de `OPERATOR_ROUTE_PREFIXES`, y esa lista se mantenía a mano. Al añadir
 * la pantalla de visita del apiario quedó fuera —la pantalla que agrupa el
 * trabajo del día no abría sin señal, que es exactamente cuando se usa— y al
 * derivar la lista apareció un segundo hueco **del café, anterior a esto**:
 * `/plots` no estaba, y esa página tiene ocho formularios de captura. `/lots`
 * sí estaba, y es otra cosa: parcela de terreno contra lote de café, la misma
 * confusión de vocabulario que `SESSION_STATE.md` ya tiene anotada.
 *
 * **Por qué se deriva y no se lista.** Una lista a mano en un archivo y las
 * páginas en otro divergen sin avisar, y el síntoma no aparece en desarrollo:
 * en el escritorio siempre hay señal. Esto es la misma lección que el guardia
 * de atomicidad de auditoría aprendió al quitarse su lista de archivos.
 *
 * **Su límite, dicho:** reconoce una página de captura por sus imports —de
 * `components/apiary/` o del formulario de jornada—. Una pantalla que capture
 * en campo sin importar ninguno de los dos no la vería. Si eso llega a pasar,
 * este guardia se amplía por ahí; no se cambia por una lista.
 */
const RAIZ = new URL("../..", import.meta.url).pathname;

function paginas(dir: string): string[] {
  const salida: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) salida.push(...paginas(ruta));
    else if (entrada === "page.tsx") salida.push(ruta);
  }
  return salida;
}

/** `app/apiaries/[id]/page.tsx` → `/apiaries/[id]` */
const rutaDe = (rel: string) => "/" + relative("app", rel).replace(/\/page\.tsx$/, "");

/**
 * Qué cuenta como captura de campo, acotado a propósito: las pantallas que
 * renderizan un formulario **de apiario** o el de **jornada de campo**. Ésa es
 * hoy la superficie que se usa de pie, con guantes y sin señal.
 *
 * La primera versión de esto reconocía cualquier `*Form` de `app/components/` y
 * daba **24** páginas — catas, protocolos de investigación, productos públicos:
 * trabajo de escritorio que no necesita caché offline y que, cacheado, sólo
 * gastaría almacenamiento del teléfono. Ampliar la definición hasta que
 * incluyera lo que no toca es la forma barata de que el guardia deje de
 * significar algo.
 */
const IMPORTA_FORMULARIO_DE_CAMPO = /from\s*"[^"]*components\/(apiary\/[A-Za-z]+|traceability\/FieldSessionForms)"/;

const PREFIJOS: string[] = (() => {
  const sw = readFileSync(join(RAIZ, "public/sw.js"), "utf8");
  const m = sw.match(/const OPERATOR_ROUTE_PREFIXES\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error("no encuentro OPERATOR_ROUTE_PREFIXES en public/sw.js");
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
})();

const cubierta = (ruta: string) => PREFIJOS.some((p) => ruta === p || ruta.startsWith(p + "/"));

const DE_CAPTURA = paginas(join(RAIZ, "app"))
  .map((r) => relative(RAIZ, r))
  .filter((r) => IMPORTA_FORMULARIO_DE_CAMPO.test(readFileSync(join(RAIZ, r), "utf8")))
  .map(rutaDe)
  .sort();

describe("el service worker cubre lo que se captura en el campo", () => {
  it("el análisis encuentra páginas de captura de verdad", () => {
    // Control positivo: si el detector dejara de reconocer una página de
    // captura, la comprobación de abajo pasaría sin comprobar nada.
    expect(DE_CAPTURA.length, "ninguna página de captura detectada: el análisis no está mirando").toBeGreaterThan(2);
    expect(PREFIJOS.length, "no se leyó ningún prefijo de public/sw.js").toBeGreaterThan(1);
  });

  it("toda página con un formulario de captura está en OPERATOR_ROUTE_PREFIXES", () => {
    expect(
      DE_CAPTURA.filter((r) => !cubierta(r)),
      "estas páginas capturan datos y NO se cachean, así que no abren sin señal. " +
        "Añade su prefijo a `OPERATOR_ROUTE_PREFIXES` en `public/sw.js`.",
    ).toEqual([]);
  });

  /**
   * **Las que se LEEN sin señal, declaradas** — R2 del plan farm-to-green (ADR-197), 2026-10-09.
   * `/beneficio` no captura con los formularios de campo que este archivo reconoce, así que no
   * entra por la derivación de arriba; pero el jefe de beneficio la abre en el patio, sin red, para
   * ver la cola y la ocupación. Se declara aquí, a mano y a propósito: es una decisión, no algo que
   * se pueda deducir de los imports. Sus formularios siguen necesitando red hasta que la cola de
   * envíos del beneficio exista (después del PR-B de la 2a).
   */
  it("las rutas que se leen sin conexión están en OPERATOR_ROUTE_PREFIXES", () => {
    const LECTURA_SIN_CONEXION = ["/beneficio"];
    expect(LECTURA_SIN_CONEXION.filter((r) => !cubierta(r))).toEqual([]);
  });
});
