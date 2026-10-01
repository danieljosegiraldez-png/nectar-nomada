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
import type { DatosDelTablero } from "../../lib/beneficio/datosDelTablero";
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

async function pintar(d: DatosDelTablero): Promise<string> {
  datosActuales = d;
  const jsx = await BeneficioPage({ searchParams: Promise.resolve({}) });
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
    // Control positivo: CON ámbito y sin instrumentos que pidan atención, SÍ lo dice. Sin esta fila,
    // el `not.toContain` de arriba pasaría también si el bloque no existiera nunca.
    const conAmbito = aTexto(await pintar(datos()));
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
