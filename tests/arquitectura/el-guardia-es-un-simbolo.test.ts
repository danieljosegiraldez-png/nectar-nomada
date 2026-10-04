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
import declaracion from "../../docs/arquitectura/permiso-por-dominio.json";

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


/**
 * **¿Es el guardia EL DEBIDO?** `PENDING_IMPLEMENTATIONS/005`, la propiedad que
 * le quedaba — decisión de Daniel del 2026-10-04.
 *
 * El escalón 2 de la 007 cierra que **haya** un guardia de verdad. Esto cierra
 * otra cosa: que el permiso que exige **corresponda al dato que toca**. La 005
 * dice que eso *«no lo da ningún inventario, porque no es una forma que se pueda
 * reconocer — hay que decir, por dominio, qué permiso corresponde a qué dato, y
 * comprobarlo»*. La declaración está en
 * `docs/arquitectura/permiso-por-dominio.json`; esto la comprueba.
 *
 * **Por qué vive en ESTE archivo y no en el suyo.** Un `ts.Program` cuesta ~1,8 GB
 * y ~20 s, y esta máquina tiene un OOM registrado en `CLAUDE.md` de un día en que
 * dos pasos cayeron con el mismo 134. Dos archivos de prueba serían dos Programs
 * en dos trabajadores de vitest a la vez. Comparten el de arriba a propósito.
 *
 * **Y la 005 rechazó un token universal para todo Prisma** —el `AuthzContext`, en
 * compuerta 2, «el coste no vale la garantía»—. Esto es la otra vía que ella misma
 * sugiere: por dominio, empezando por el de más consecuencia, que es el lote.
 */
describe("el permiso que exige una operación corresponde al dato que toca", () => {
  const dominio = declaracion.dominios[0]!;
  const gobernados = new Set(dominio.gobierna);
  const permiso = dominio.permiso;
  const declaradas = new Map(
    dominio.excepciones.map((e) => [clave(e.archivo, e.operacion), e] as const)
  );
  /** Las del dominio que llevan clase de guardia: las que tienen algo que verificar. */
  const delDominio = filas.filter(
    (f) => f.modelos.some((m) => gobernados.has(m)) && f.clase.startsWith("guardia")
  );

  it("la declaración nombra un dominio con modelos y el inventario lo alcanza", () => {
    expect(gobernados.size, "un dominio sin modelos no verifica nada").toBeGreaterThan(5);
    expect(delDominio.length, "si ninguna operación toca el dominio, el verde no mide").toBeGreaterThan(20);
    /**
     * **Cada modelo declarado tiene que EXISTIR en el esquema.** No es ceremonia:
     * la primera versión de esta declaración traía `lotClassification`,
     * `lotStorageMove` y `greenSample`, inventados leyendo la prosa de la ficha
     * 005 — ninguno es un modelo de Prisma. Un nombre inventado no gobierna nada
     * y el guardia pasaría en verde sobre un dominio vacío.
     */
    const delEsquema = modelosDelEsquema(readFileSync(join(RAIZ, "prisma/schema.prisma"), "utf8"));
    const inventados = [...gobernados].filter((m) => !delEsquema.has(m));
    expect(inventados, "no son modelos de prisma/schema.prisma: un nombre inventado no gobierna nada")
      .toEqual([]);
    const sinTocar = [...gobernados].filter((m) => !filas.some((f) => f.modelos.includes(m)));
    expect(sinTocar.length, `declarados y sin una sola operación que los toque: ${sinTocar.join(", ")}`)
      .toBeLessThan(gobernados.size / 2);
  });

  /**
   * **El guardia.** Toda operación que toque un modelo del dominio tiene que
   * exigir su permiso — o estar declarada con su razón. Medido el 2026-10-04:
   * 83 con clase de guardia, 70 exigen `lot`, y las 13 restantes están
   * declaradas una a una.
   */
  it("toda operación del dominio exige su permiso, o está declarada con su razón", () => {
    const sinExplicar = delDominio
      .filter((f) => !(S.recursos.get(k(f))?.has(permiso) ?? false))
      .filter((f) => !declaradas.has(k(f)))
      .map((f) => `${k(f)}  [${[...(S.recursos.get(k(f)) ?? [])].sort().join(", ") || "sin permiso resuelto"}]`);
    expect(
      sinExplicar,
      `toca un modelo que gobierna «${permiso}» y no lo exige. Si el permiso correcto es otro, ` +
        "decláralo en docs/arquitectura/permiso-por-dominio.json con su razón; si no, ponle el guardia debido."
    ).toEqual([]);
  });

  /** Cada excepción dice por qué. Una sin razón es una bendición en blanco. */
  it("cada excepción declarada tiene su razón escrita", () => {
    for (const e of dominio.excepciones) {
      expect(e.razon?.trim(), `${e.archivo}:${e.operacion} sin razón`).toBeTruthy();
      expect(e.veredicto?.trim(), `${e.archivo}:${e.operacion} sin veredicto`).toBeTruthy();
    }
  });

  /**
   * **Detector de podredumbre**, el mismo que ya tiene la allowlist de acceso: una
   * excepción que ya no aplica —porque la operación desapareció, o porque ya exige
   * el permiso— se borra, no se queda bendiciendo algo que no existe.
   */
  it("ninguna excepción declarada sobra", () => {
    const vivas = new Set(delDominio.map(k));
    const fantasmas = [...declaradas.keys()].filter((llave) => !vivas.has(llave));
    expect(fantasmas, "la operación ya no toca el dominio o ya no existe: bórralas de la declaración")
      .toEqual([]);
    const yaLoExigen = [...declaradas.keys()].filter((llave) => S.recursos.get(llave)?.has(permiso) ?? false);
    expect(yaLoExigen, `ya exigen «${permiso}»: la excepción sobra`).toEqual([]);
  });
});
