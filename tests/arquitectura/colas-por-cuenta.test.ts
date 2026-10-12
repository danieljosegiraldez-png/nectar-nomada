/**
 * ADR-199 — ningún lector de las colas offline, en `app/`, se salta el filtro por cuenta.
 *
 * **El defecto que esto vigila (revisión final, 2026-10-12).** `RondaDeTrampaForm` leía
 * `listFieldEventDrafts()` sin filtrar: con la clave de la revisión aún sin fijar, elegía el último
 * borrador de esa trampa de CUALQUIER cuenta, y si estaba en error pintaba «No se pudo enviar…» con un
 * botón «Descartar» que borraba el borrador de A desde la sesión de B. Las colas ya filtraban al ENVIAR;
 * ese componente leía la cola por su cuenta y nadie se lo había dicho. Ninguna prueba de la lógica
 * pura lo podía ver: era un componente que olvidaba llamar a la función correcta.
 *
 * **Qué se exige, por archivo.** Es la misma forma que `quien-lista-limpia-lo-que-lista`: se exige el
 * rastro de que el archivo decide de quién es lo que toca.
 *   · quien LISTA una cola (`listDrafts`, `listFieldEventDrafts`, `listTrapPhotoDrafts`) llama a
 *     `repartirPorCuenta(`, que separa lo que este navegador puede enviar de lo ajeno;
 *   · quien DESCARTA de una cola (`discardDraft`, `discardFieldEventDraft`, `discardTrapPhotoDraft`)
 *     llama a `descartablesPorEstaCuenta(`, que deja sólo lo que esta cuenta puede borrar.
 *
 * **Su límite, dicho.** Reconoce formas escritas, como el inventario de acceso: comprueba que el archivo
 * llama a la función, no que se la aplique a la lista correcta. Una cadena de texto que contuviera
 * `repartirPorCuenta(` también la satisfaría, porque el quitado de comentarios deja las cadenas. Es un
 * suelo: lo que cierra el hueco de «el componente olvida el filtro» es que el olvido se vea en rojo.
 *
 * Hermético: sólo lee fuente.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sinComentarios } from "../helpers/sinComentarios";

const RAIZ = new URL("../..", import.meta.url).pathname;

const QUE_LISTAN = ["listDrafts", "listFieldEventDrafts", "listTrapPhotoDrafts"] as const;
const QUE_DESCARTAN = ["discardDraft", "discardFieldEventDraft", "discardTrapPhotoDraft"] as const;
const FILTRO_DE_LECTURA = "repartirPorCuenta";
const FILTRO_DE_DESCARTE = "descartablesPorEstaCuenta";

/** ¿Llama a `nombre(` en código? El lookbehind evita que `xrepartirPorCuenta(` o `a.b$listDrafts(` valgan. */
function llama(codigo: string, nombre: string): boolean {
  return new RegExp(`(?<![\\w$])${nombre}\\s*\\(`).test(codigo);
}

/**
 * Lo que le falta a una fuente, en frases. Vacío = cumple. Exportable en espíritu: se prueba más abajo
 * con entradas hostiles escritas a mano, porque el árbol real no las contiene.
 */
function faltasDelFiltro(fuente: string): string[] {
  const codigo = sinComentarios(fuente);
  const faltas: string[] = [];

  const lista = QUE_LISTAN.filter((n) => llama(codigo, n));
  if (lista.length > 0 && !llama(codigo, FILTRO_DE_LECTURA)) {
    faltas.push(`llama a ${lista.join(" y ")} pero no a ${FILTRO_DE_LECTURA}(`);
  }

  const descarta = QUE_DESCARTAN.filter((n) => llama(codigo, n));
  if (descarta.length > 0 && !llama(codigo, FILTRO_DE_DESCARTE)) {
    faltas.push(`llama a ${descarta.join(" y ")} pero no a ${FILTRO_DE_DESCARTE}(`);
  }

  return faltas;
}

function archivosDeApp(): string[] {
  return (readdirSync(`${RAIZ}app`, { recursive: true }) as string[])
    .map((r) => String(r))
    .filter((r) => /\.(ts|tsx)$/.test(r))
    .map((r) => `app/${r}`)
    .sort();
}

describe("ningún lector de las colas en app/ se salta el filtro por cuenta", () => {
  const archivos = archivosDeApp();
  const fuentes = new Map(archivos.map((f) => [f, readFileSync(`${RAIZ}${f}`, "utf8")]));

  it("cada archivo que lista una cola llama a repartirPorCuenta, y cada uno que descarta, a descartablesPorEstaCuenta", () => {
    const incumplen: string[] = [];
    for (const [ruta, fuente] of fuentes) {
      for (const falta of faltasDelFiltro(fuente)) incumplen.push(`${ruta}: ${falta}`);
    }
    expect(
      incumplen,
      "un lector de la cola que no filtra por cuenta enseña, o deja borrar, el borrador de otra cuenta (ADR-199)",
    ).toEqual([]);
  });

  /**
   * Control positivo. Sin esto, un `readdirSync` que no devuelva nada, o un patrón que dejara de casar,
   * darían cero incumplimientos de cero lectores, que se lee igual que «todo bien».
   */
  it("está mirando de verdad: hay lectores y descartadores en app/", () => {
    expect(archivos.length, "el descubrimiento de archivos está roto").toBeGreaterThan(100);

    const listan = [...fuentes].filter(([, f]) => QUE_LISTAN.some((n) => llama(sinComentarios(f), n))).map(([r]) => r);
    expect(listan.length, `sólo encuentra ${listan.join(", ")}: el escáner no mide`).toBeGreaterThanOrEqual(3);

    const descartan = [...fuentes]
      .filter(([, f]) => QUE_DESCARTAN.some((n) => llama(sinComentarios(f), n)))
      .map(([r]) => r);
    expect(descartan.length, `sólo encuentra ${descartan.join(", ")}: el escáner no mide`).toBeGreaterThanOrEqual(2);
  });
});

/**
 * **El detector, con entrada hostil.** El árbol real no tiene un comentario que mencione el filtro sin
 * llamarlo ni un archivo que sólo lo importe, y un detector que los diera por buenos pasaría el test de
 * arriba sin que nada lo cuestionara. Cada caso se escribe a mano.
 */
describe("faltasDelFiltro — el detector, con entradas hostiles", () => {
  it("quien lista y llama al filtro cumple", () => {
    const fuente = "const { enviables } = repartirPorCuenta(await listFieldEventDrafts(), cuentaActual);";
    expect(faltasDelFiltro(fuente)).toEqual([]);
  });

  it("quien lista sin llamar al filtro no cumple, y la falta nombra lo que lista", () => {
    const faltas = faltasDelFiltro("const todos = await listFieldEventDrafts();");
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toContain("listFieldEventDrafts");
    expect(faltas[0]).toContain("repartirPorCuenta(");
  });

  it("mencionar el filtro SÓLO en un comentario de línea no cumple", () => {
    const fuente = ["// ADR-199: aquí iría repartirPorCuenta(drafts, cuenta)", "const todos = await listDrafts();"].join("\n");
    expect(faltasDelFiltro(fuente)).toHaveLength(1);
  });

  it("mencionarlo SÓLO en un comentario de bloque tampoco", () => {
    const fuente = ["/**", " * Antes de enviar se llama a repartirPorCuenta(drafts, cuenta).", " */", "const todos = await listTrapPhotoDrafts();"].join("\n");
    expect(faltasDelFiltro(fuente)).toHaveLength(1);
  });

  it("importarlo sin llamarlo tampoco", () => {
    const fuente = [
      'import { repartirPorCuenta } from "../../../lib/sync/cuentaDelBorrador";',
      "const todos = await listDrafts();",
    ].join("\n");
    expect(faltasDelFiltro(fuente)).toHaveLength(1);
  });

  it("un nombre que sólo CONTIENE el del filtro no vale", () => {
    expect(faltasDelFiltro("const x = norepartirPorCuenta(a); const todos = await listDrafts();")).toHaveLength(1);
  });

  it("quien descarta sin llamar a descartablesPorEstaCuenta no cumple", () => {
    const faltas = faltasDelFiltro("await discardFieldEventDraft(id);");
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toContain("discardFieldEventDraft");
    expect(faltas[0]).toContain("descartablesPorEstaCuenta(");
  });

  it("descartablesPorEstaCuenta sólo en un comentario no cumple; llamado, sí", () => {
    expect(faltasDelFiltro("// descartablesPorEstaCuenta(drafts, cuenta)\nawait discardDraft(id);")).toHaveLength(1);
    expect(faltasDelFiltro("for (const d of descartablesPorEstaCuenta(drafts, c)) await discardDraft(d.id);")).toEqual([]);
  });

  it("listar cumple con repartirPorCuenta, pero descartar NO se cubre con él: son dos exigencias", () => {
    const fuente = "const { enviables } = repartirPorCuenta(await listDrafts(), c); await discardDraft(id);";
    const faltas = faltasDelFiltro(fuente);
    expect(faltas).toHaveLength(1);
    expect(faltas[0]).toContain("descartablesPorEstaCuenta(");
  });

  it("control: lo que no es una cola no se marca", () => {
    // `purgeStaleDrafts(` contiene «Drafts(» pero no es ninguno de los seis nombres.
    expect(faltasDelFiltro("await purgeStaleDrafts(); const x = listaDeDrafts();")).toEqual([]);
  });
});
