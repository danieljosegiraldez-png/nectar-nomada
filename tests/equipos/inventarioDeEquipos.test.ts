import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EquipoEnLista } from "../../lib/equipos/equipos";

/**
 * La pantalla `/equipos` y los equipos retirados (Parte 2c; decisión D5 de Daniel, 2026-10-05): el inventario —`listarEquipos`, que
 * no se filtra— **marca** al equipo retirado con «Retirado» junto a su nombre, y un retirado **no pide «atención»**.
 *
 * **Por qué se renderiza la página y no se lee su fuente.** «Atención» no es una función exportada: se arma dentro del JSX de
 * `app/equipos/page.tsx` con cinco condiciones en O, y ninguna miraba `lifecycleStatus`. Un guardia de fuente sólo vería que la
 * palabra está escrita; renderizando se ve lo que sale en pantalla. Sólo se simulan los bordes que exigen sesión y base —la sesión,
 * `listarEquipos`, `disponibilidadDeRecipientes`, `sitiosParaRegistrar` y las rutinas vencidas—; todo lo demás es el código real.
 *
 * **«Capacidad ahora» queda vacía a propósito** (`resumen.total` en 0): así la única `<li>` de la página son las de «Pide atención»
 * y `enAtencion` no se confunde con la lista de capacidad. Esa lista ya sólo trae activos desde el commit C y se prueba en
 * `retirarEquipo.test.ts` y `retiroEnElTablero.test.ts`.
 *
 * **El primer caso es el control del análisis**: comprueba que los dos detectores (`enAtencion` y `filaDe`) ven la página real, con
 * los activos. Si cae con «no está en ninguna tabla», la forma del HTML no es la supuesta y los demás casos no miden nada.
 *
 * **Cada caso lleva anotada, encima, la mutación que lo hace caer**: qué quitar de `app/equipos/page.tsx` y qué prueba cae por su
 * nombre. Se repite a mano: aplicar la mutación, correr este archivo y ver caer SÓLO ese caso —con una excepción: pintar «Retirado»
 * siempre hace caer además los dos casos de las tablas, porque las filas activas pasan a decirlo— mientras el control del análisis
 * sigue en verde. Después, restaurar la página con `git checkout -- app/equipos/page.tsx`.
 */
let listaActual: EquipoEnLista[] = [];

vi.mock("next-intl/server", async () => {
  const { IntlMessageFormat } = await import("intl-messageformat");
  const todos = (await import("../../messages/es.json")).default as unknown as Record<string, Record<string, string>>;
  return {
    getTranslations: async (ns: string) => (clave: string, valores?: Record<string, unknown>) => {
      const m = todos[ns]?.[clave];
      if (m === undefined) throw new Error(`falta la clave «${ns}.${clave}» en messages/es.json`);
      return String(new IntlMessageFormat(m, "es").format(valores as never));
    },
  };
});
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: async () => ({ userAccountId: "cuenta-de-prueba" }) }));
vi.mock("../../lib/equipos/equipos", () => ({
  listarEquipos: async () => listaActual,
  disponibilidadDeRecipientes: async () => ({ filas: [], resumen: { total: 0, libresYSanos: 0, enUso: 0, requierenIntervencion: 0 } }),
  sitiosParaRegistrar: async () => [],
}));
vi.mock("../../lib/rutinas/rutinas", () => ({ vencidasPorEquipo: async () => new Map<string, number>() }));

const { default: EquiposPage } = await import("../../app/equipos/page");

const AHORA = new Date("2026-03-10T12:00:00.000Z");
const aTexto = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function pintar(lista: EquipoEnLista[]): Promise<string> {
  listaActual = lista;
  const jsx = await EquiposPage({ searchParams: Promise.resolve({}) });
  const flujo = await renderToReadableStream(jsx);
  await flujo.allReady;
  return await new Response(flujo).text();
}

/**
 * ¿Sale este equipo en la lista de «Pide atención»? Con «Capacidad ahora» vacía, las `<li>` de la página son las de atención. Cada
 * trozo se corta en su `</li>`: sin eso el último trozo llegaría hasta el final de la página y vería los enlaces de las tablas.
 */
const enAtencion = (html: string, id: string) =>
  html
    .split("<li>")
    .slice(1)
    .some((trozo) => trozo.slice(0, trozo.indexOf("</li>")).includes(`/equipos/${id}"`));

/** El texto de la FILA de la tabla de un equipo: desde su celda de nombre hasta el cierre de la fila. Lanza si el equipo no está en ninguna tabla. */
function filaDe(html: string, id: string): string {
  const inicio = html.search(new RegExp(`<td>\\s*<a [^>]*href="/equipos/${id}"`));
  if (inicio < 0) throw new Error(`el equipo ${id} no está en ninguna tabla de la página: ¿cambió la forma del HTML?`);
  return aTexto(html.slice(inicio, html.indexOf("</tr>", inicio)));
}

const eq = (o: Pick<EquipoEnLista, "id" | "name" | "kind"> & Partial<EquipoEnLista>): EquipoEnLista => ({
  trayTypeId: null,
  lifecycleStatus: "active",
  ubicacion: null,
  condicion: null,
  verificacion: "SIN_INSTRUMENTO",
  ultimaVerificacion: null,
  checkAdvisoryHours: null,
  model: null,
  ...o,
});

const INSTRUMENTO_ACTIVO = eq({ id: "eq-instrumento-activo", name: "Refractómetro de la mesa", kind: "instrument", verificacion: "SIN_VERIFICACION" });
const INSTRUMENTO_RETIRADO = eq({
  id: "eq-instrumento-retirado",
  name: "Refractómetro viejo",
  kind: "instrument",
  verificacion: "SIN_VERIFICACION",
  lifecycleStatus: "retired",
});
const MAQUINA_AVERIADA = eq({ id: "eq-maquina-averiada", name: "Despulpadora de la entrada", kind: "machine", condicion: { condition: "faulty", occurredAt: AHORA } });
const MAQUINA_RETIRADA = eq({
  id: "eq-maquina-retirada",
  name: "Despulpadora vieja",
  kind: "machine",
  lifecycleStatus: "retired",
  condicion: { condition: "faulty", occurredAt: AHORA },
});
const MAQUINA_SANA = eq({ id: "eq-maquina-sana", name: "Secadora del patio", kind: "machine" });
/** Los dos activos con problemas piden atención; el sano no; y los dos retirados TIENEN el mismo problema que sus gemelos activos. */
const TODOS = [INSTRUMENTO_ACTIVO, INSTRUMENTO_RETIRADO, MAQUINA_AVERIADA, MAQUINA_RETIRADA, MAQUINA_SANA];

describe("/equipos y los equipos retirados (D5)", () => {
  it("control del análisis: la página pinta, los activos con problemas piden atención y el sano no", async () => {
    const html = await pintar(TODOS);
    expect(enAtencion(html, INSTRUMENTO_ACTIVO.id), "el instrumento activo sin contraste tiene que pedir atención").toBe(true);
    expect(enAtencion(html, MAQUINA_AVERIADA.id), "la máquina activa averiada tiene que pedir atención").toBe(true);
    expect(enAtencion(html, MAQUINA_SANA.id), "la máquina sana no pide atención").toBe(false);
    // Y el detector de filas ve las dos tablas de verdad.
    expect(filaDe(html, INSTRUMENTO_ACTIVO.id)).toContain("Refractómetro de la mesa");
    expect(filaDe(html, MAQUINA_SANA.id)).toContain("Secadora del patio");
  });

  // Mutación que lo hace caer: quitar `e.lifecycleStatus === "active" &&` de `atencion` en `app/equipos/page.tsx`.
  it("un equipo retirado sale de «Pide atención», aunque siga sin contraste o averiado", async () => {
    const html = await pintar(TODOS);
    expect(enAtencion(html, INSTRUMENTO_RETIRADO.id), "el instrumento retirado no pide atención").toBe(false);
    expect(enAtencion(html, MAQUINA_RETIRADA.id), "la máquina retirada no pide atención").toBe(false);
    // El encabezado cuenta sólo los dos activos: con los retirados serían cuatro.
    expect(aTexto(html)).toContain("Pide atención (2)");
  });

  // Mutación: cambiar la PRIMERA `{marcaDeRetirado(e)}` de la página (la de la tabla de instrumentos) por `{null}`.
  it("el inventario marca «Retirado» junto al nombre en la tabla de instrumentos, y no marca al activo", async () => {
    const html = await pintar(TODOS);
    expect(filaDe(html, INSTRUMENTO_RETIRADO.id)).toContain("Refractómetro viejo · Retirado");
    expect(filaDe(html, INSTRUMENTO_ACTIVO.id)).not.toContain("Retirado");
  });

  // Mutación: cambiar la SEGUNDA `{marcaDeRetirado(e)}` (la de la tabla de otros equipos) por `{null}`.
  it("el inventario marca «Retirado» junto al nombre en la tabla de otros equipos, y no marca al activo", async () => {
    const html = await pintar(TODOS);
    expect(filaDe(html, MAQUINA_RETIRADA.id)).toContain("Despulpadora vieja · Retirado");
    expect(filaDe(html, MAQUINA_AVERIADA.id)).not.toContain("Retirado");
    expect(filaDe(html, MAQUINA_SANA.id)).not.toContain("Retirado");
  });

  // Mutación: que la marca se pinte siempre (`e.lifecycleStatus === "retired" ? (` → `true ? (`).
  it("sin ningún retirado no se marca ni se saca nada (control: los activos siguen pidiendo atención)", async () => {
    const html = await pintar([INSTRUMENTO_ACTIVO, MAQUINA_AVERIADA, MAQUINA_SANA]);
    expect(aTexto(html)).not.toContain("Retirado");
    expect(aTexto(html)).toContain("Pide atención (2)");
  });
});
