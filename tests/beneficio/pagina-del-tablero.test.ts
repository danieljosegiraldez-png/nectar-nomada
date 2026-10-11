/**
 * La PÁGINA `/beneficio`, renderizada entera: lo que sólo vive en su JSX.
 *
 * **Por qué existe.** El diseño del tablero (§6) manda un flip-test: «pintar `demora: null` como
 * «en hora» → debe caer una prueba». Esa regla la pinta `textoDeRitmo` **dentro de**
 * `app/beneficio/page.tsx`, y ninguna prueba importaba la página: era la única de las cinco reglas
 * del flip-test sin guardia, y mutarla no hacía caer nada. Lo mismo pasaba con la rama `sinAmbito`
 * —el bloque de instrumentos seguía diciendo «Ningún instrumento pide atención» sobre un `[]` que
 * nadie midió— y con «0 de 0 tanques».
 *
 * **Cómo.** Se llama a `BeneficioPage` como la función `async` que es y se renderiza con
 * `renderToReadableStream` (las tres piezas y el resto de la página son componentes de servidor
 * `async`, que `renderToStaticMarkup` no resuelve). Sólo se simulan los bordes que exigen sesión y
 * base: la sesión, los permisos, los beneficios y `datosDelTablero`. Todo lo demás es el código real,
 * con `messages/es.json` y formato ICU REAL (`intl-messageformat`): un texto sin clave revienta la
 * prueba en vez de pintar la clave cruda.
 *
 * **Cada prueba lleva anotada la mutación que la hace caer.**
 *
 * Hermética: sin base (todo lo que toca la base está simulado), así que NO va a
 * `scripts/pruebas-por-compuerta.txt`.
 */
import { renderToReadableStream } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { curvaDeLote } from "../../lib/beneficio/curvaDeLote";
import type { CurvaDelTablero, DatosDelTablero } from "../../lib/beneficio/datosDelTablero";
import { lineaDeEtapas } from "../../lib/beneficio/lineaDeEtapas";
import type { EntradaDeLoteParaTablero } from "../../lib/beneficio/tablero";

let datosActuales: DatosDelTablero;

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
vi.mock("../../lib/rbac/service", () => ({ permissionKeysAnywhere: async () => new Set(["lot:view"]) }));
// La página y su barra preguntan si se ofrece Recetas con la regla de la lista (PENDING_IMPLEMENTATIONS/027).
vi.mock("../../lib/traceability/processTargets", () => ({ puedeCrearRecetaEnAlguna: async () => false }));
vi.mock("../../lib/traceability/beneficios", () => ({ listarBeneficios: async () => [] }));
vi.mock("../../lib/beneficio/datosDelTablero", () => ({ datosDelTablero: async () => datosActuales }));
// Sólo se pintan con beneficios, y `listarBeneficios` devuelve `[]`: fuera, para no arrastrar su base.
vi.mock("../../app/components/rutinas/RutinasDeLugar", () => ({ RutinasDeLugar: () => null }));

const { default: BeneficioPage } = await import("../../app/beneficio/page");

const AHORA = new Date("2026-03-10T12:00:00.000Z");
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);
const aTexto = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

const ETAPAS = lineaDeEtapas({
  proceso: 2, secado: 1, almacen: 1, pidenDecision: {},
});

function datos(o: Partial<DatosDelTablero> = {}): DatosDelTablero {
  return {
    lotes: [],
    tanques: [],
    camas: [],
    corridas: [],
    corridasPorUnidad: [],
    instrumentos: [],
    desviacionesAbiertasPorLote: new Map(),
    sinAmbito: false,
    etapas: ETAPAS,
    liberacion: null,
    curva: null,
    medidoEn: AHORA,
    ...o,
  };
}

/** `sinAmbito`, tal como lo devuelve `datosDelTablero` (su `VACIO`): todo vacío y `sinAmbito: true`. */
const SIN_AMBITO = datos({ sinAmbito: true, etapas: [] });

/**
 * **Un instrumento que esta cuenta VE y que no pide nada.** `instrumentosQuePidenAtencion`
 * (`tablero.ts`) filtra por `kind === "instrument"` y por tres estados; `VERIFICADO` no es uno de
 * ellos, así que este equipo cuenta como visible y no entra en la lista de trabajo.
 *
 * Hace falta desde `PENDING_IMPLEMENTATIONS/019`: antes, «ninguno pide atención» se comprobaba con
 * la lista **vacía**, que es exactamente el caso que ahora dice otra cosa.
 */
const EQUIPO_VERIFICADO = {
  id: "eq-1", name: "Potenciómetro A", kind: "instrument", verificacion: "VERIFICADO",
} as const;

async function pintar(d: DatosDelTablero): Promise<string> {
  datosActuales = d;
  const jsx = await BeneficioPage({ searchParams: Promise.resolve({}) });
  const flujo = await renderToReadableStream(jsx);
  await flujo.allReady;
  return await new Response(flujo).text();
}

/** La página con un lote tocado (`?lote=…`): pinta la curva de `d.curva`. */
async function pintarConLote(d: DatosDelTablero, lote: string): Promise<string> {
  datosActuales = d;
  const jsx = await BeneficioPage({ searchParams: Promise.resolve({ lote, variable: "ph" }) });
  const flujo = await renderToReadableStream(jsx);
  await flujo.allReady;
  return await new Response(flujo).text();
}

const unidad = (id: string, nombre: string) => ({
  id, nombre, lifecycleStatus: "active" as const, condicion: null,
});

describe("la página — el ritmo de la cola, en palabras", () => {
  // Sin veredicto a propósito: lo que se afirma es el ritmo, que se calcula aparte del veredicto y
  // se pinta igual en todos los grupos.
  const lote = (lotCode: string, expectedHours: number | null, inicioHaceHoras: number): EntradaDeLoteParaTablero => ({
    lotId: `id-${lotCode}`,
    lotCode,
    corridaId: `c-${lotCode}`,
    veredicto: "SIN_LECTURAS",
    faseIniciada: haceHoras(inicioHaceHoras),
    expectedHours,
    metas: [],
    ultimaLectura: null,
  });

  /** El texto del ritmo de la fila de un lote, o `undefined` si el lote no sale en la cola. */
  const ritmoDe = (html: string, lotCode: string) => {
    const li = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) => m[1]!).find((x) => x.includes(`<strong>${lotCode}</strong>`));
    return li === undefined ? undefined : aTexto(/<span class="nn-board-ritmo">(.*?)<\/span>/.exec(li)?.[1] ?? "(sin ritmo)");
  };

  it("`demora: null` dice «sin duración declarada» y NUNCA «en hora»; cada estado dice lo suyo", async () => {
    const html = await pintar(
      datos({
        lotes: [
          lote("L-EN-HORA", 48, 10), //   10 h de 48: en hora
          lote("L-TARDE", 48, 60), //     60 h de 48: va tarde, +12 h
          lote("L-SIN-DECLARAR", null, 10), // la receta no declara duración: no se sabe
          lote("L-INVALIDA", -1, 10), //  la base trae una duración que no es una duración
        ],
      }),
    );
    // Control: están las cuatro filas. Sin él, «no dice en hora» podría ser «la fila no salió».
    for (const c of ["L-EN-HORA", "L-TARDE", "L-SIN-DECLARAR", "L-INVALIDA"]) {
      expect(ritmoDe(html, c), `fila ${c}`).toBeDefined();
    }
    expect(ritmoDe(html, "L-EN-HORA")).toBe("en hora");
    expect(ritmoDe(html, "L-TARDE")).toBe("va tarde, +12 h sobre lo esperado");
    expect(ritmoDe(html, "L-SIN-DECLARAR")).toBe("sin duración declarada");
    expect(ritmoDe(html, "L-SIN-DECLARAR")).not.toContain("en hora");
    expect(ritmoDe(html, "L-INVALIDA")).toBe("datos de ritmo inválidos (duracion_esperada_invalida_en_la_base)");
    // MUTACIÓN (flip-test 4 del diseño, §6): en `textoDeRitmo`, pintar `ritmoEnHora` cuando
    // `demora` es `null` (p. ej. `else if (fila.ritmo.demora !== true)`) → cae por «L-SIN-DECLARAR».
    // Antes de este archivo no caía NINGUNA prueba: la regla vivía sólo en el JSX.
  });
});

describe("la página — `sinAmbito` no afirma nada que no midió", () => {
  it("dice «no alcanza ningún lote», y NI la línea, NI «0 de 0», NI «ningún instrumento pide atención»", async () => {
    const texto = aTexto(await pintar(SIN_AMBITO));
    expect(texto).toContain("Tu cuenta todavía no alcanza ningún lote"); // control: ES la rama sinAmbito
    expect(texto).not.toContain("Dónde está el café"); // la línea de etapas
    expect(texto).not.toMatch(/de 0\b/); // «0 de 0»
    // Hallazgo 5: `VACIO.instrumentos` es `[]` porque no se miró nada, no porque ninguno pida atención.
    expect(texto).not.toContain("Ningún instrumento pide atención");
    expect(texto).not.toContain("Instrumentos que piden atención");
    // Control positivo: CON ámbito y con un instrumento VISIBLE que no pide atención, SÍ lo dice.
    // Sin esta fila, el `not.toContain` de arriba pasaría también si el bloque no existiera nunca.
    //
    // **Este control pintaba `datos()` —con `instrumentos: []`— y afirmaba la frase equivocada**
    // (`PENDING_IMPLEMENTATIONS/019`): una lista vacía CON ámbito significa «no ves ninguno», no
    // «ninguno pide atención», y la prueba exigía la segunda. Ahora lleva un equipo visible, que es
    // lo único que hace verdadera la frase que comprueba.
    const conAmbito = aTexto(await pintar(datos({ instrumentos: [EQUIPO_VERIFICADO] })));
    expect(conAmbito).toContain("Ningún instrumento pide atención");
    expect(conAmbito).toContain("Dónde está el café");
    // MUTACIÓN: sacar el `<section className="nn-mill-instruments">` del `datos.sinAmbito ? null : …`
    // (volver a pintarlo siempre) → cae por «Ningún instrumento pide atención».
  });
});

describe("la página — «0 de 0» no es «no hay ninguno»", () => {
  it("sin unidades visibles dice que NINGUNA está a la vista, no «0 de 0» ni «No hay tanques declarados» (hallazgo 6)", async () => {
    const texto = aTexto(await pintar(datos({ tanques: [], camas: [] })));
    expect(texto).toContain("Ningún tanque a la vista");
    expect(texto).toContain("Ninguna cama a la vista");
    expect(texto).not.toMatch(/\bde 0\b/);
    expect(texto).not.toContain("No hay tanques declarados");
    expect(texto).not.toContain("No hay camas declaradas");
    // Control positivo: con unidades visibles SÍ hay cuentas y SÍ hay «de N». Sin esta fila, los
    // `not` de arriba pasarían igual si la página nunca pintara las cuentas.
    const con = aTexto(
      await pintar(datos({ tanques: [unidad("t1", "Tanque 1"), unidad("t2", "Tanque 2")], camas: [unidad("c1", "Cama 1")] })),
    );
    expect(con).toMatch(/\bde 2\b/);
    expect(con).toMatch(/\bde 1\b/);
    expect(con).not.toContain("Ningún tanque a la vista");
    expect(con).not.toContain("Ninguna cama a la vista");
    // MUTACIÓN: quitar el `total === 0 ? …` de las cuentas (volver a pintar `libresYSanos` y
    // `total` siempre) → cae por «de 0».
  });
});

describe("la página — le pasa a la curva el perfil que rige el lote", () => {
  const LOTE = "3f2b6c1e-8a44-4d0e-9b57-0c1d2e3f4a5b";
  // 4,7 con la matriz del lavado es «proliferación butírica y mohos»; con la de NATURAL está dentro de la ventana óptima.
  const curvaCon = (perfilDelLote: CurvaDelTablero["perfilDelLote"]): CurvaDelTablero => ({
    ...curvaDeLote({
      lecturas: [{ occurredAt: haceHoras(5), value: 5.0 }, { occurredAt: haceHoras(1), value: 4.7 }],
      objetivos: [{ momento: "during", minValue: 3.8, maxValue: 4.5, targetValue: 4.15 }],
      ancho: 480, alto: 200,
    }),
    perfilDelLote,
  });

  it("un lote WASHED_STANDARD pinta el bloque de qué sugiere el dato; el MISMO dato con otro perfil o sin perfil, no", async () => {
    const lavado = aTexto(await pintarConLote(datos({ curva: curvaCon("WASHED_STANDARD") }), LOTE));
    // Control: es la sección de la curva y el bloque está.
    expect(lavado).toContain("Criterio de Néctar Nómada");
    expect(lavado).toContain("stinker");
    for (const perfil of ["NATURAL", null] as const) {
      const texto = aTexto(await pintarConLote(datos({ curva: curvaCon(perfil) }), LOTE));
      expect(texto, `perfil ${perfil}`).not.toContain("Criterio de Néctar Nómada");
      expect(texto, `perfil ${perfil}`).not.toContain("stinker");
    }
    // MUTACIÓN: quitar `perfilDelLote={datos.curva?.perfilDelLote ?? null}` de la página → el lote lavado no pinta y cae por «Criterio de Néctar Nómada».
    // MUTACIÓN: `perfilDelLote="WASHED_STANDARD"` fijo en la página → NATURAL cita «stinker» y cae.
  });
});

/**
 * **Una lista vacía de instrumentos tiene DOS motivos** (`PENDING_IMPLEMENTATIONS/019`).
 *
 * La sección se escondía sólo con `sinAmbito`. Con ámbito de lotes y cero equipos visibles
 * —la cuenta ve lotes y no ve ningún equipo de medición— `instrumentos.length === 0` y la
 * pantalla decía «Ningún instrumento pide atención», que se lee como «todos bien». Lo cierto es
 * «no veo ninguno»: lo demostrado es que la consulta no recuperó nada.
 *
 * Las tres filas de abajo son los tres estados, y las dos primeras **tienen que salir distintas**:
 * si dijeran lo mismo, el arreglo no mide nada.
 *
 * Flip-test: volver la condición a `instrumentos.length === 0 ? instrumentosNinguno : …` hace caer
 * la primera prueba por «No ves ningún equipo de medición» y deja pasar las otras dos.
 */
describe("la página — «ninguno pide atención» no es «no ves ninguno» (019)", () => {
  it("con ámbito y CERO equipos visibles dice que no ves ninguno, NO que ninguno pide atención", async () => {
    const texto = aTexto(await pintar(datos({ instrumentos: [] })));
    expect(texto).toContain("No ves ningún equipo de medición");
    expect(texto).not.toContain("Ningún instrumento pide atención");
    // Control de que SÍ estamos en la rama con ámbito: la línea de etapas se pinta.
    expect(texto).toContain("Dónde está el café");
  });

  it("CONTROL: con un equipo visible que no pide nada, sí dice que ninguno pide atención", async () => {
    const texto = aTexto(await pintar(datos({ instrumentos: [EQUIPO_VERIFICADO] })));
    expect(texto).toContain("Ningún instrumento pide atención");
    expect(texto).not.toContain("No ves ningún equipo de medición");
  });

  it("y con uno que sí pide atención lo nombra, sin ninguna de las dos frases vacías", async () => {
    const texto = aTexto(await pintar(datos({
      instrumentos: [{ id: "eq-2", name: "Refractómetro B", kind: "instrument", verificacion: "REVISION_VENCIDA" }],
    })));
    expect(texto).toContain("Refractómetro B");
    expect(texto).not.toContain("Ningún instrumento pide atención");
    expect(texto).not.toContain("No ves ningún equipo de medición");
  });

  /**
   * **Esta prueba daba por bueno el defecto en su primera versión, y la escribí yo.** Afirmaba que
   * una cuenta que ve un tanque y CERO instrumentos dijera «Ningún instrumento pide atención»,
   * porque la condición contaba `datos.instrumentos` — una lista que lleva **todo** el equipo
   * visible con su `kind` (`datosDelTablero.ts:516`). Eso es la misma mentira del 019 con otra
   * cara: no hay ningún instrumento del que decir que no pide nada. La cuenta buena es
   * `instrumentosVisibles`, que filtra por `kind`.
   */
  it("un tanque visible NO vuelve verdadera la frase: sin instrumentos, no ves ninguno", async () => {
    const texto = aTexto(await pintar(datos({
      instrumentos: [{ id: "eq-3", name: "Tanque viejo", kind: "tank", verificacion: "VERIFICADO" }],
    })));
    expect(texto).toContain("No ves ningún equipo de medición");
    expect(texto).not.toContain("Ningún instrumento pide atención");
    // Control de que el tanque SÍ estaba en los datos: si la lista hubiera llegado vacía, la
    // aserción de arriba pasaría sin medir el caso que esta prueba existe para medir.
    expect(texto).toContain("Dónde está el café");
  });

  it("y un instrumento visible junto a un tanque sí deja la frase en «ninguno pide atención»", async () => {
    const texto = aTexto(await pintar(datos({
      instrumentos: [
        { id: "eq-3", name: "Tanque viejo", kind: "tank", verificacion: "VERIFICADO" },
        EQUIPO_VERIFICADO,
      ],
    })));
    expect(texto).toContain("Ningún instrumento pide atención");
    expect(texto).not.toContain("No ves ningún equipo de medición");
  });
});
