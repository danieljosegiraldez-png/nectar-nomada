/**
 * La pantalla del tablero, renderizada: las reglas que esta tarea existía para defender.
 *
 * **Por qué se renderiza.** Las funciones puras (`curvaDeLote`, `lineaDeEtapas`,
 * `proximaLiberacion`) pasaban sus pruebas y la pantalla podía contradecirlas en la última
 * pulgada: un `<svg>` que recorta, un `0` pintado donde no hay registro, una hora donde no hay
 * duración. Ninguna prueba importaba los componentes, así que seis mutaciones —una por regla—
 * sobrevivían. Aquí se llama a cada componente de servidor como la función `async` que es, se
 * renderiza con `renderToStaticMarkup`, y se afirma sobre el HTML.
 *
 * `next-intl/server` se simula con `messages/es.json` y formato ICU REAL (`intl-messageformat`),
 * así que un texto sin clave revienta la prueba en vez de pintar la clave cruda, y un plural mal
 * escrito se ve. El texto que se afirma es el que un operario lee.
 *
 * **Cada prueba lleva anotada la mutación que la hace caer.** Un flip-test sin esa línea es un
 * adorno.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { curvaDeLote } from "../../lib/beneficio/curvaDeLote";
import { lineaDeEtapas } from "../../lib/beneficio/lineaDeEtapas";

vi.mock("next-intl/server", async () => {
  const { IntlMessageFormat } = await import("intl-messageformat");
  const mensajes = (await import("../../messages/es.json")).default.SeccionBeneficio as Record<string, string>;
  return {
    getTranslations: async () => (clave: string, valores?: Record<string, unknown>) => {
      const m = mensajes[clave];
      if (m === undefined) throw new Error(`falta la clave «${clave}» en messages/es.json`);
      return String(new IntlMessageFormat(m, "es").format(valores as never));
    },
  };
});

const { CurvaDeLote } = await import("../../app/components/beneficio/CurvaDeLote");
const { LineaDeEtapas } = await import("../../app/components/beneficio/LineaDeEtapas");
const { LiberacionDeUnidad } = await import("../../app/components/beneficio/LiberacionDeUnidad");

const ID = "3f2b6c1e-8a44-4d0e-9b57-0c1d2e3f4a5b";
const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
const LIENZO = { ancho: 480, alto: 200 };
const BANDA = { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 };

const aTexto = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

async function pintarCurva(curva: ReturnType<typeof curvaDeLote> | null) {
  return renderToStaticMarkup(
    await CurvaDeLote({ pedida: { lotId: ID, variable: "ph" }, curva, codigoDelLote: "P5-X" }),
  );
}

/** Los números de un atributo `points="x,y x,y …"`. */
const vertices = (points: string) => points.trim().split(/\s+/).map((p) => p.split(",").map(Number) as [number, number]);

/** Cada marca del dibujo: su clase y sus vértices (un círculo cuenta como un solo punto). */
function marcas(html: string) {
  const salida: { clase: string; vertices: [number, number][] }[] = [];
  for (const m of html.matchAll(/<circle class="([^"]*)" cx="([-\d.]+)" cy="([-\d.]+)"/g)) {
    salida.push({ clase: m[1]!, vertices: [[Number(m[2]), Number(m[3])]] });
  }
  for (const m of html.matchAll(/<polygon class="([^"]*)" points="([^"]*)"/g)) {
    salida.push({ clase: m[1]!, vertices: vertices(m[2]!) });
  }
  return salida;
}

const viewBoxDe = (html: string) => {
  const [x, y, w, h] = /viewBox="([^"]+)"/.exec(html)![1]!.split(" ").map(Number) as [number, number, number, number];
  return { x, y, w, h };
};
const centro = (v: [number, number][]) => [v.reduce((a, p) => a + p[0], 0) / v.length, v.reduce((a, p) => a + p[1], 0) / v.length] as const;

/** Una curva con las tres situaciones: dentro, fuera pero cabe, y TAN lejos que no cabe ni en el margen. */
const CURVA_CON_FUERA = curvaDeLote({
  lecturas: [
    { occurredAt: t(8), value: 4.3 }, // dentro
    { occurredAt: t(10), value: 4.8 }, // fuera de la banda, cabe en el margen
    { occurredAt: t(12), value: 12 }, // muy arriba: se ancla
    { occurredAt: t(14), value: -5 }, // muy abajo: se ancla
    { occurredAt: t(16), value: 4.4 }, // dentro
  ],
  objetivo: BANDA, ...LIENZO,
});

describe("CurvaDeLote — lo que se salió de la receta SE VE", () => {
  it("el viewBox contiene el centro de TODA marca, incluidas las ancladas", async () => {
    const html = await pintarCurva(CURVA_CON_FUERA);
    const m = marcas(html);
    // Control: están las cinco marcas, y dos de ellas ancladas. Sin él, «todas caben» podría ser «no pinté nada».
    expect(m).toHaveLength(5);
    expect(m.filter((x) => x.clase.includes("nn-curva-punto-lejos"))).toHaveLength(2);
    const vb = viewBoxDe(html);
    for (const x of m) {
      const [cx, cy] = centro(x.vertices);
      expect(cx).toBeGreaterThanOrEqual(vb.x);
      expect(cx).toBeLessThanOrEqual(vb.x + vb.w);
      expect(cy).toBeGreaterThanOrEqual(vb.y);
      expect(cy).toBeLessThanOrEqual(vb.y + vb.h);
    }
    // MUTACIÓN: `viewBox` a `0 0 480 200` (recorta todo lo de fuera) → cae esta prueba.
  });

  it("una marca anclada queda EXACTAMENTE en el borde del viewBox: el margen del dibujo y el de colocarPuntos son uno", async () => {
    const html = await pintarCurva(CURVA_CON_FUERA);
    const vb = viewBoxDe(html);
    const lejos = marcas(html).filter((x) => x.clase.includes("nn-curva-punto-lejos"));
    const ys = lejos.map((x) => centro(x.vertices)[1]).sort((a, b) => a - b);
    // El triángulo de arriba tiene el vértice 7 por encima y la base 5 por debajo: centro = y + 1.
    expect(ys[0]).toBeCloseTo(vb.y + 1, 6);
    expect(ys[1]).toBeCloseTo(vb.y + vb.h - 1, 6);
    // MUTACIÓN: pasar a `colocarPuntos` un margen distinto del que usa el `viewBox` (p. ej. `margen * 2`
    // o `alto * 0.2`) → las marcas anclan lejos del borde y cae esta prueba (y la de arriba, si es mayor).
  });

  it("el <svg> que se pinta lleva overflow: visible, y hace falta: el vértice del triángulo anclado queda fuera del viewBox", async () => {
    const html = await pintarCurva(CURVA_CON_FUERA);
    const vb = viewBoxDe(html);
    const fuera = marcas(html)
      .filter((x) => x.clase.includes("nn-curva-punto-lejos"))
      .flatMap((x) => x.vertices)
      .some(([, y]) => y < vb.y || y > vb.y + vb.h);
    // Control: sin un vértice fuera, «overflow visible» no haría falta y esta prueba no diría nada.
    expect(fuera).toBe(true);
    // Se afirma sobre el ELEMENTO renderizado, no sobre un archivo de estilos: una declaración en
    // `globals.css` sobrevive a que el componente cambie de clase, a un override posterior o a un
    // comentario, y daría verde sobre un `<svg>` que recorta.
    const abre = /<svg\b[^>]*>/.exec(html);
    expect(abre, "hay un <svg>").not.toBeNull();
    expect(abre![0]).toMatch(/style="[^"]*overflow:\s*visible/);
    // MUTACIÓN: quitar `style={{ overflow: "visible" }}` del `<svg>` (o renombrar su clase si el
    // atributo dependiera de ella) → el vértice anclado se corta y cae esta prueba.
  });

  it("sin objetivo declarado se dibujan los puntos, NO la banda, y se dice", async () => {
    const sin = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 4.6 }, { occurredAt: t(12), value: 4.1 }, { occurredAt: t(16), value: 3.9 }],
      objetivo: null, ...LIENZO,
    });
    const html = await pintarCurva(sin);
    expect(marcas(html)).toHaveLength(3); // los puntos SÍ
    expect(html).not.toContain("nn-curva-banda");
    expect(html).not.toContain("nn-curva-objetivo");
    expect(aTexto(html)).toContain("no tiene rango declarado en la receta");
    // Control: la misma curva CON banda pinta una (si no, el `not.toContain` de arriba no distingue nada).
    const con = await pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(8), value: 4.3 }], objetivo: BANDA, ...LIENZO }));
    expect(con).toContain('class="nn-curva-banda"');
    // MUTACIÓN: pintar la banda cuando es `sin_objetivo_declarado` (p. ej. con valores por defecto) → cae.
  });

  it("con banda y CERO lecturas no se afirma nada sobre el rango (hallazgo 2)", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: [], objetivo: BANDA, ...LIENZO }));
    const texto = aTexto(html);
    expect(texto).toContain("no hay curva que dibujar"); // control: esta es la pantalla de «sin lecturas»
    expect(texto).not.toContain("dentro del rango");
    // (la leyenda «un rombo es una lectura fuera del rango» sí puede estar: no cuenta ninguna.)
    expect(texto).not.toMatch(/\d+ lecturas? fuera del rango de la receta/);
    // MUTACIÓN: volver a `fueraDeBanda > 0 ? … : curvaTodasDentro` sin mirar `puntos.length` → cae.
  });

  it("con la banda de ancho cero NO se dice «todas dentro» aunque una lectura sea 9,9 contra 4,5 (hallazgo 3)", async () => {
    const html = await pintarCurva(
      curvaDeLote({
        lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 9.9 }],
        objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }, ...LIENZO,
      }),
    );
    const texto = aTexto(html);
    expect(marcas(html)).toHaveLength(2); // control: las lecturas se dibujan
    expect(texto).not.toContain("dentro del rango");
    expect(texto).toContain("ancho cero");
    // La explicación VISIBLE, no sólo el `<desc>` (que sólo lee un lector de pantalla): `aTexto`
    // junta los dos, y `toContain("ancho cero")` se conformaba con cualquiera.
    expect(html).toContain('class="nn-warn nn-curva-ancho-cero"');
    // MUTACIÓN: quitar la rama visible `banda_de_ancho_cero` del componente → cae (el `<desc>` sigue).
    // Control positivo: con una banda de verdad y lecturas dentro, SÍ lo dice (si no, el `not` de arriba no discrimina).
    const sana = aTexto(
      await pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(12), value: 4.4 }], objetivo: BANDA, ...LIENZO })),
    );
    expect(sana).toContain("Todas las lecturas están dentro del rango de la receta");
    // MUTACIÓN: quitar el caso `banda_de_ancho_cero` de `juicioDeBanda` → cae.
  });

  it("con la receta AL REVÉS (min > max) no dibuja banda, no cuenta nada «fuera» y no espeja la curva (hallazgo 2)", async () => {
    const lecturas = [
      { occurredAt: t(8), value: 4.2 },
      { occurredAt: t(12), value: 4.9 }, // sobrefermentado: va ARRIBA, donde está el valor más alto
      { occurredAt: t(16), value: 4.0 },
    ];
    const html = await pintarCurva(
      curvaDeLote({ lecturas, objetivo: { minValue: 4.6, maxValue: 4.0, targetValue: 4.3 }, ...LIENZO }),
    );
    const texto = aTexto(html);
    expect(marcas(html)).toHaveLength(3); // control: las lecturas se dibujan
    // Ni la banda ni la línea del objetivo: una banda dibujada se leería como la receta.
    expect(html).not.toContain("nn-curva-banda");
    expect(html).not.toContain("nn-curva-objetivo");
    expect(texto).not.toContain("dentro del rango");
    expect(texto).not.toMatch(/\d+ lecturas? fuera del rango de la receta/);
    // La explicación VISIBLE (no sólo el `<desc>`).
    expect(html).toContain('class="nn-warn nn-curva-al-reves"');
    expect(texto).toContain("rango al revés");
    // El 4,9 queda en la parte ALTA del dibujo y el 4,0 en la baja: `curvaEjes` dice la verdad.
    const ys = marcas(html).map((m) => centro(m.vertices)[1]);
    expect(ys[1]!).toBeLessThan(ys[0]!);
    expect(ys[0]!).toBeLessThan(ys[2]!);
    // Control positivo: la misma receta bien puesta SÍ dibuja la banda (si no, los `not` de arriba no distinguen).
    const bien = await pintarCurva(
      curvaDeLote({ lecturas, objetivo: { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 }, ...LIENZO }),
    );
    expect(bien).toContain('class="nn-curva-banda"');
    expect(bien).not.toContain("nn-curva-al-reves");
    // MUTACIÓN: quitar el caso `banda_al_reves` de `curvaDeLote` (escalar contra la banda al revés)
    // → cae por el orden de los puntos y por la banda dibujada.
  });

  it("con lecturas fuera de la banda las cuenta, con plural", async () => {
    const texto = aTexto(await pintarCurva(CURVA_CON_FUERA));
    // 4,8 / 12 / -5 están fuera de 4,0–4,6.
    expect(texto).toContain("3 lecturas fuera del rango de la receta");
  });
});

describe("LineaDeEtapas — un cero no es «sin registro»", () => {
  const ETAPAS = lineaDeEtapas({
    recepcion: 0, seleccion: 3, proceso: 2, secado: 0, almacen: 1,
    pidenDecision: { proceso: 2 },
  });

  async function filas() {
    const html = renderToStaticMarkup(await LineaDeEtapas({ etapas: ETAPAS }));
    return [...html.matchAll(/<li class="([^"]*)">(.*?)<\/li>/g)].map((m) => ({ clase: m[1]!, html: m[2]!, texto: aTexto(m[2]!) }));
  }

  it("la flotación dice «sin registro de esta etapa», sin cuenta, sin dígitos y sin color", async () => {
    const f = await filas();
    expect(f).toHaveLength(6); // control: la línea entera está
    expect(f.map((x) => x.texto.split(" ")[0])).toEqual(["Recepción", "Flotación", "Selección", "Proceso", "Secado", "Almacén"]);
    const flotacion = f[1]!;
    expect(flotacion.texto).toContain("sin registro de esta etapa");
    expect(flotacion.html).not.toContain("nn-etapa-cuenta");
    expect(flotacion.texto).not.toMatch(/\d/);
    expect(flotacion.clase).toContain("nn-etapa-sin-registro");
    expect(flotacion.clase).not.toContain("nn-etapa-decide");
    // MUTACIÓN: pintar `0` (o la cuenta) en una etapa `sin_registro` → cae.
  });

  it("un cero SÍ es un cero (no se colorea), y sólo se colorea la etapa que pide decisión", async () => {
    const f = await filas();
    expect(f[0]!.texto).toBe("Recepción 0 lotes"); // 0 es un dato
    expect(f[0]!.clase).toBe("nn-etapa");
    expect(f[3]!.clase).toContain("nn-etapa-decide");
    expect(f[3]!.texto).toContain("2 piden decisión");
    expect(f.filter((x) => x.clase.includes("nn-etapa-decide"))).toHaveLength(1);
    // Singular con su plural: una etapa con 1 lote dice «lote», no «lotes».
    expect(f[5]!.texto).toBe("Almacén 1 lote");
    // MUTACIÓN: colorear con `pidenDecision >= 0` → cae por la recepción y el almacén.
  });
});

describe("LiberacionDeUnidad — nunca una hora inventada", () => {
  const ahora = t(12);
  const pintar = async (liberacion: Parameters<typeof LiberacionDeUnidad>[0]["liberacion"]) =>
    aTexto(renderToStaticMarkup(await LiberacionDeUnidad({ liberacion, ahora })));
  const HORA_O_FECHA = /\d{1,2}:\d{2}|\d{4}-\d{2}-\d{2}/;

  it("sin duración declarada dice eso y NO lleva ninguna hora ni fecha", async () => {
    const texto = await pintar({ tipo: "sin_duracion_declarada" });
    expect(texto).toContain("sin duración declarada");
    expect(texto).not.toMatch(HORA_O_FECHA);
    // MUTACIÓN: pintar una hora en `sin_duracion_declarada` (p. ej. `mostrarInstante(ahora, null)`) → cae.
  });

  it("con duración declarada sí dice la hora, en la zona del sitio (control del `not.toMatch` de arriba)", async () => {
    // 15:00 UTC = 10:00 en America/Panama.
    expect(await pintar({ tipo: "a_las", cuando: t(15) })).toContain("2026-03-10 10:00");
  });

  it("una liberación vencida dice que ya debía estar libre, no «ahora»", async () => {
    const texto = await pintar({ tipo: "a_las", cuando: t(9) });
    expect(texto).toContain("debía liberarse el 2026-03-10 04:00");
    expect(texto).toContain("sigue ocupada");
  });

  it("sin corrida ocupando una unidad dice otra cosa, no «sin duración»", async () => {
    const texto = await pintar(null);
    expect(texto).toContain("ninguna unidad declarada está ocupada");
    expect(texto).not.toContain("sin duración declarada");
  });
});

describe("las cuentas de la capacidad llevan plural ICU, en los dos idiomas (hallazgo 4)", () => {
  const leer = (f: string) => JSON.parse(readFileSync(new URL(`../../messages/${f}.json`, import.meta.url), "utf8")).SeccionBeneficio;
  const dar = async (idioma: "es" | "en", clave: string, valores: Record<string, number>) => {
    const { IntlMessageFormat } = await import("intl-messageformat");
    return String(new IntlMessageFormat(leer(idioma)[clave], idioma).format(valores));
  };

  it("con uno, nada de «1 libres» ni «1 requieren» / «1 need»", async () => {
    const uno = { libres: 1, total: 1, intervencion: 1 };
    expect(await dar("es", "capacidadTanques", uno)).toBe("Tanques: 1 libre y sano de 1 · 1 requiere intervención");
    expect(await dar("es", "capacidadCamas", uno)).toBe("Camas: 1 libre de 1");
    expect(await dar("en", "capacidadTanques", uno)).toBe("Tanks: 1 free and sound of 1 · 1 needs attention");
    // Control: con varios sí va en plural (si no, el `toBe` de arriba no distingue nada).
    const dos = { libres: 2, total: 5, intervencion: 3 };
    expect(await dar("es", "capacidadTanques", dos)).toBe("Tanques: 2 libres y sanos de 5 · 3 requieren intervención");
    expect(await dar("es", "capacidadCamas", dos)).toBe("Camas: 2 libres de 5");
    expect(await dar("en", "capacidadTanques", dos)).toBe("Tanks: 2 free and sound of 5 · 3 need attention");
    // MUTACIÓN: volver `capacidadTanques` de es a «{libres} libres y sanos … {intervencion} requieren …» → cae.
  });
});
