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
import { ejesDeLaCurva } from "../../lib/beneficio/ejesDeLaCurva";
import { riesgoDeEsperar } from "../../lib/beneficio/riesgoDeEsperar";
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

async function pintarCurva(curva: ReturnType<typeof curvaDeLote> | null, variable: "ph" | "brix" | "moisture" = "ph") {
  return renderToStaticMarkup(
    await CurvaDeLote({ pedida: { lotId: ID, variable }, curva, codigoDelLote: "P5-X" }),
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
    // La serie que se dibuja NO es plana (4,5 → 9,9 es de borde a borde: de y = 200 a y = 0), y la banda de
    // ancho cero no se pinta a media altura como si fuera la receta. Antes: recta en y = 100 y «nada cambió».
    const linea = /class="nn-curva-linea"[^>]*points="([^"]+)"|points="([^"]+)"[^>]*class="nn-curva-linea"/.exec(html);
    expect(linea, "debe haber una polilínea").not.toBeNull();
    expect(vertices(linea![1] ?? linea![2]!)).toEqual([[0, 200], [480, 0]]);
    expect(html).not.toContain("nn-curva-banda");
    expect(html).not.toContain("nn-curva-objetivo");
    // MUTACIÓN: en `curvaDeLote`, `hayBanda` sin `&& !anchoCero` → los dos vértices en y = 100 y cae.
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

describe("los ejes y la curva usan LA MISMA escala — la prueba que justifica que no se importen", () => {
  // `ejesDeLaCurva` REPITE la escala de `curvaDeLote` en vez de importarla (dos módulos puros no se
  // acoplan). El precio es que si divergen, los números del eje dejan de corresponder a los puntos y
  // nada lo diría: cada módulo pasa sus pruebas por separado. Esta es la que las pone frente a frente.
  const OBJETIVO = { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 };
  const BANDA_DEL_EJE = { min: 4.0, max: 4.6 };
  const AL_10 = new Date("2026-03-10T10:00:00Z");

  it("la marca del eje Y cae en la MISMA coordenada que el punto de ese valor — los TRES pares", () => {
    const yDelPunto = (value: number) =>
      curvaDeLote({ lecturas: [{ occurredAt: AL_10, value }], objetivo: OBJETIVO, ancho: 300, alto: 120 }).puntos[0]!.y;
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: AL_10, value: 4.3 }], banda: BANDA_DEL_EJE, ancho: 300, alto: 120,
    });
    // Control: hay tres marcas, y NO están todas en el mismo sitio (si lo estuvieran, ninguno de los
    // tres pares de abajo distinguiría una escala de otra).
    expect(e.y).toHaveLength(3);
    expect(new Set(e.y.map((m) => m.pos)).size).toBe(3);

    // El MÁXIMO (4,6): su punto da 0 y su marca da 0. **No caza nada**: con un `alto` equivocado de
    // 110 el máximo sigue dando 0. Está para que el trío cuente la historia entera, no por lo que prueba.
    expect(yDelPunto(4.6)).toBe(e.y[0]!.pos);
    // El CENTRO (4,3): 60 con `alto` 120. Caza un `alto` divergido (con 110 daría 55 contra 60).
    expect(yDelPunto(4.3)).toBe(e.y[1]!.pos);
    // El MÍNIMO (4,0): 120. Caza una escala INVERTIDA (la marca daría 0 y el punto 120).
    expect(yDelPunto(4.0)).toBe(e.y[2]!.pos);
    // MUTACIÓN: en `ejesDeLaCurva.escalaY`, quitar el `tamano -` (escala invertida) → cae el mínimo y el centro.
    // MUTACIÓN: en `ejesDeLaCurva`, `escalaY(v, min, max, alto - 10)` → cae el centro y el mínimo (el máximo NO).
  });

  it("el eje X coincide con la X de la primera y la última lectura", () => {
    const lecturas = [
      { occurredAt: new Date("2026-03-10T08:00:00Z"), value: 4.3 },
      { occurredAt: new Date("2026-03-10T16:00:00Z"), value: 4.4 },
    ];
    const c = curvaDeLote({ lecturas, objetivo: OBJETIVO, ancho: 300, alto: 120 });
    const e = ejesDeLaCurva({ lecturas, banda: BANDA_DEL_EJE, ancho: 300, alto: 120 });
    expect(e.x).toHaveLength(2); // control: las dos marcas están
    expect(c.puntos[0]!.x).toBe(e.x[0]!.pos);
    expect(c.puntos[1]!.x).toBe(e.x[1]!.pos);
    // Control: son distintas (0 y 300), así que «coinciden» no es «las dos valen lo mismo».
    expect(e.x[0]!.pos).not.toBe(e.x[1]!.pos);
    // MUTACIÓN: en `ejesDeLaCurva`, la marca final en `ancho - 10` → cae.
  });

  it("con UNA sola lectura y sin banda, el punto y las dos marcas coinciden a media anchura y media altura", () => {
    // El caso degenerado: el rango vale cero y dividir entre él da `NaN`. Dentro de cada módulo hay
    // una decisión (media altura, media anchura); sin esta prueba nada dice que las dos TOMARON LA MISMA.
    const lecturas = [{ occurredAt: AL_10, value: 4.5 }];
    const c = curvaDeLote({ lecturas, objetivo: null, ancho: 300, alto: 120 });
    const e = ejesDeLaCurva({ lecturas, banda: null, ancho: 300, alto: 120 });
    expect(e.x).toHaveLength(1); // control: una marca por eje, no tres con el mismo texto
    expect(e.y).toHaveLength(1);
    expect(Number.isNaN(c.puntos[0]!.x) || Number.isNaN(c.puntos[0]!.y)).toBe(false); // `NaN` compara falso con todo
    expect(Number.isNaN(e.x[0]!.pos) || Number.isNaN(e.y[0]!.pos)).toBe(false);
    expect(c.puntos[0]!.x).toBe(e.x[0]!.pos);
    expect(c.puntos[0]!.y).toBe(e.y[0]!.pos);
    // Y los valores a mano, que no son 0 ni el tamaño entero: 300/2 y 120/2.
    expect([c.puntos[0]!.x, c.puntos[0]!.y]).toEqual([150, 60]);
    // MUTACIÓN: en `ejesDeLaCurva.escalaY`, rango cero → `tamano` en vez de `tamano / 2` (el punto de
    // `curvaDeLote` sigue a media altura) → cae.
  });
});

/** Los rótulos de un eje, con la coordenada que el `<text>` lleva. */
function rotulos(html: string, eje: "x" | "y") {
  return [...html.matchAll(new RegExp(`<text class="nn-curva-eje nn-curva-eje-${eje}"([^>]*)>([^<]*)</text>`, "g"))].map((m) => ({
    texto: m[2]!,
    x: Number(/\bx="([-\d.]+)"/.exec(m[1]!)?.[1]),
    y: Number(/\by="([-\d.]+)"/.exec(m[1]!)?.[1]),
  }));
}
const soloElSvg = (html: string) => /<svg\b[\s\S]*<\/svg>/.exec(html)![0];

describe("CurvaDeLote — los ejes dicen a qué valor está la banda y cuánto lleva la fase", () => {
  const LECTURAS = [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(16), value: 4.4 }];

  it("el eje Y rotula máximo, centro y mínimo de la banda, y el X las horas; todo DENTRO del mismo <svg>", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS, objetivo: BANDA, ...LIENZO }));
    const svg = soloElSvg(html);
    // Con alto 200 y banda 4,0–4,6: arriba el máximo, en medio el centro, abajo el mínimo.
    expect(rotulos(svg, "y").map((r) => [r.texto, r.y])).toEqual([["4.6", 0], ["4.3", 100], ["4.0", 200]]);
    // Con las dos lecturas a 8 h de distancia: el arranque a la izquierda y las 8 h a la derecha.
    expect(rotulos(svg, "x").map((r) => [r.texto, r.x])).toEqual([["0 h", 0], ["8 h", 480]]);
    // Dentro del <svg> y no fuera de él: lo que cae fuera no comparte su `viewBox` ni su `overflow`.
    expect(html.replace(svg, "")).not.toContain("nn-curva-eje");
    // MUTACIÓN: pintar los rótulos fuera del <svg> (p. ej. en una `<ul>` aparte) → cae.
    // MUTACIÓN: quitar los rótulos del X → cae (sólo esta prueba nombra las horas).
  });

  it("el rótulo «4.3» y el punto de 4.3 están a la MISMA altura en la pantalla, no sólo en los módulos", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS, objetivo: BANDA, ...LIENZO }));
    const centroDelPunto = centro(marcas(html)[0]!.vertices)[1]; // la lectura de 4.3, a las 8 h
    const rotulo = rotulos(html, "y").find((r) => r.texto === "4.3")!;
    expect(rotulo, "hay un rótulo 4.3").toBeDefined();
    expect(centroDelPunto).toBe(100); // control: no es 0 ni 200, así que no coincide «por trivialidad»
    expect(rotulo.y).toBe(centroDelPunto);
    // MUTACIÓN: pasar a `ejesDeLaCurva` un `alto` distinto del de `curva.alto` (p. ej. `curva.alto - 10`)
    // → el rótulo se corre y cae; las dos pruebas de `ejesDeLaCurva` por separado seguirían verdes.
  });

  it("sin banda, el eje Y rotula el mínimo y el máximo de los DATOS", async () => {
    const html = await pintarCurva(
      curvaDeLote({ lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 4.1 }], objetivo: null, ...LIENZO }),
    );
    const y = rotulos(html, "y");
    expect(y.map((r) => r.texto)).toEqual(["4.5", "4.3", "4.1"]);
    expect([y[0]!.y, y[2]!.y]).toEqual([0, 200]);
    // MUTACIÓN: rotular con una banda inventada (p. ej. 4,0–4,6 fijos) → cae.
  });

  it("con la receta AL REVÉS el eje no se espeja: el 4,9 se rotula ARRIBA, a la altura de su punto", async () => {
    const lecturas = [{ occurredAt: t(8), value: 4.2 }, { occurredAt: t(12), value: 4.9 }, { occurredAt: t(16), value: 4.0 }];
    const html = await pintarCurva(
      curvaDeLote({ lecturas, objetivo: { minValue: 4.6, maxValue: 4.0, targetValue: 4.3 }, ...LIENZO }),
    );
    const y = rotulos(html, "y");
    // Los rótulos salen de los datos (4,0–4,9), no de la receta mal cargada...
    expect(y.map((r) => r.texto)).toEqual(["4.9", "4.45", "4.0"]);
    // ...y cada uno cae donde está su punto: el 4,9 (segundo punto) arriba, el 4,0 (tercero) abajo.
    expect(y[0]!.y).toBe(centro(marcas(html)[1]!.vertices)[1]);
    expect(y[2]!.y).toBe(centro(marcas(html)[2]!.vertices)[1]);
    // Control: arriba y abajo no coinciden.
    expect(y[0]!.y).toBeLessThan(y[2]!.y);
    // MUTACIÓN: pasar `banda: { min: 4.6, max: 4.0 }` y que `ejesDeLaCurva` la tome por buena → eje espejado → cae.
  });

  it("sin lecturas no hay HORAS que rotular; con banda el eje Y sigue diciendo a qué valor está, y sin banda no hay nada", async () => {
    // `ejesDeLaCurva` lo decide así (su prueba: «con banda el eje Y no depende de que haya lecturas»):
    // la banda se dibuja aunque no haya curva, y sin números no se sabe a qué pH está.
    const conBanda = soloElSvg(await pintarCurva(curvaDeLote({ lecturas: [], objetivo: BANDA, ...LIENZO })));
    expect(rotulos(conBanda, "y").map((r) => r.texto)).toEqual(["4.6", "4.3", "4.0"]);
    expect(rotulos(conBanda, "x")).toEqual([]); // unas horas sin ninguna lectura serían inventadas
    // Sin banda y sin lecturas no hay NINGÚN rótulo: no hay con qué escalar.
    const sinNada = await pintarCurva(curvaDeLote({ lecturas: [], objetivo: null, ...LIENZO }));
    expect(sinNada).not.toContain("nn-curva-eje");
    // Control positivo: con lecturas SÍ hay horas (si no, el `toEqual([])` de arriba sería «nunca pinta horas»).
    expect(rotulos(await pintarCurva(curvaDeLote({ lecturas: LECTURAS, objetivo: BANDA, ...LIENZO })), "x")).toHaveLength(2);
    // MUTACIÓN: rotular las horas con `0 h` y `0 h` aunque no haya lecturas → cae por `rotulos(…, "x")`.
    // MUTACIÓN: rotular con una banda inventada cuando no hay objetivo ni lecturas → cae por `sinNada`.
  });
});

describe("CurvaDeLote — qué sugiere el dato si se espera (rúbrica 22): sólo pH, citado, sin ordenar", () => {
  /** Una lectura sola del valor dado, contra la banda de siempre. */
  const conUnPh = (value: number, variable: "ph" | "brix" | "moisture" = "ph") =>
    pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(10), value }], objetivo: BANDA, ...LIENZO }), variable);
  const bloqueDeRiesgo = (html: string) => /<div class="nn-curva-riesgo">[\s\S]*?<\/div>/.exec(html)?.[0] ?? null;

  // Cada fila de `riesgoDeEsperar`, por su BANDA —el identificador estable del documento—, con el valor
  // con que se llega a ella. `riesgoDeEsperar` es la fuente de la columna `banda`: el primer `expect` de
  // cada fila comprueba que el valor llega a la banda que esta tabla dice, y si no, la tabla miente.
  const FILAS: readonly {
    valor: number; banda: string | null; pinta: boolean; cita?: string; siSeEstanca?: boolean;
  }[] = [
    { valor: 6.0, banda: "[5.20, 6.50)", pinta: true, cita: "Inactividad microbiológica si se prolonga" },
    { valor: 5.0, banda: "[4.50, 5.20)", pinta: true, cita: "Proliferación butírica y mohos → defecto stinker", siSeEstanca: true },
    { valor: 3.7, banda: "[3.50, 3.80)", pinta: true, cita: "Aproximación a sobrefermentación" },
    { valor: 3.4, banda: "[3.30, 3.50)", pinta: true, cita: "Degradación ácida, decoloración del pergamino" },
    { valor: 3.0, banda: "< 3.30", pinta: true, cita: "Daño consumado" },
    // Las tres que NO se pintan, y por qué (decide la BANDA, nunca buscar palabras en el texto):
    { valor: 4.0, banda: "[3.80, 4.50)", pinta: false }, // «Ninguno. Desarrollo ideal…»: a 0,2 de la vigilancia, sería falsa seguridad
    { valor: 2.0, banda: "fuera de [2.50, 8.00]", pinta: false }, // el electrodo, no el lote: esperar no lo cambia
    { valor: 7.0, banda: null, pinta: false }, // `[6.50, 8.00]`, retirada por ADR-181: el módulo devuelve `null`
  ];

  it("la tabla de filas de esta prueba coincide con lo que `riesgoDeEsperar` devuelve (control de la tabla)", () => {
    for (const f of FILAS) expect(riesgoDeEsperar("ph", f.valor)?.banda ?? null, `pH ${f.valor}`).toBe(f.banda);
    // Y no hay una banda que la tabla no conozca: barriendo −2…16 de a 0,01 se ven SIETE bandas (las
    // ocho filas menos la retirada). Una banda nueva en el módulo obliga a decidir aquí si se pinta.
    const vistas = new Set<string>();
    for (let v = -200; v <= 1600; v += 1) {
      const r = riesgoDeEsperar("ph", v / 100);
      if (r) vistas.add(r.banda);
    }
    expect([...vistas].sort()).toEqual(FILAS.flatMap((f) => (f.banda ? [f.banda] : [])).sort());
    expect(vistas.size).toBe(7);
  });

  it("cada banda con riesgo propio de LOTE se pinta: la cita LITERAL, envuelta en «el dato sugiere» y «criterio de Néctar Nómada»", async () => {
    for (const f of FILAS.filter((x) => x.pinta)) {
      const html = await conUnPh(f.valor);
      const bloque = bloqueDeRiesgo(html);
      expect(bloque, `pH ${f.valor}: debe haber bloque de riesgo`).not.toBeNull();
      const texto = aTexto(bloque!);
      expect(texto, `pH ${f.valor}`).toContain("Criterio de Néctar Nómada");
      expect(texto, `pH ${f.valor}`).toContain("el dato sugiere");
      expect(texto, `pH ${f.valor}: la cita, sin cambiar una palabra`).toContain(f.cita!);
      // La lectura citada se dice con su decimal («3.0», no «3»): una lectura no se redondea a entero.
      expect(texto, `pH ${f.valor}: la lectura que se cita`).toContain(f.valor.toFixed(1));
      // La que el módulo cita para «Daño consumado» NO se suaviza aquí aunque la literatura que cita el
      // propio documento diga otra cosa: esa tensión es de Daniel. Se pinta lo que el documento dice.
      expect(texto.includes("se estanca"), `pH ${f.valor}: sólo la banda 4,50–5,20 va condicionada`).toBe(f.siSeEstanca === true);
    }
    // MUTACIÓN: quitar la banda `< 3.30` de la lista de las que se pintan → pH 3,0 no pinta y cae.
    // MUTACIÓN: `textoDelValor` devolviendo `String(v)` → «pH 3» en vez de «pH 3.0» y cae.
    // MUTACIÓN: pintar la cita sin la envoltura («el dato sugiere») → cae por la frase.
  });

  it("la banda 4,50–5,20 va CONDICIONADA: «si el pH se estanca», nunca «aquí hay riesgo» como un hecho", async () => {
    // El módulo no ve la tendencia: `riesgoDeEsperar(variable, valor)`. En el documento esa banda es
    // `LAG_PHASE` antes de la ventana de gracia y `STALLED_ROT_HAZARD` después, y TODO lote sano pasa
    // por 4,5–5,2 bajando. ADR-181 define «estancado» por la tendencia del pH, no por la banda.
    const html = await conUnPh(4.8);
    const texto = aTexto(bloqueDeRiesgo(html)!);
    expect(texto).toContain("si el pH se estanca");
    // El `*stinker*` del documento es la cursiva de su markdown: se pinta como cursiva, no como asteriscos sueltos.
    expect(html).toContain("<em>stinker</em>");
    expect(texto).not.toContain("*");
    // Control: una banda de riesgo que NO es de estancamiento no lleva el condicional.
    expect(aTexto(bloqueDeRiesgo(await conUnPh(3.4))!)).not.toContain("se estanca");
    // MUTACIÓN: pintar la banda 4,50–5,20 como las demás (sin «si se estanca») → cae.
  });

  it("las tres que NO se pintan no escriben NADA: ni «ninguno», ni «todo bien», ni un bloque vacío", async () => {
    for (const f of FILAS.filter((x) => !x.pinta)) {
      const html = await conUnPh(f.valor);
      expect(bloqueDeRiesgo(html), `pH ${f.valor}`).toBeNull();
      const texto = aTexto(html);
      expect(texto, `pH ${f.valor}`).not.toContain("Criterio de Néctar Nómada");
      expect(texto, `pH ${f.valor}`).not.toContain("Ninguno");
      expect(texto, `pH ${f.valor}`).not.toContain("Desarrollo ideal");
      expect(texto, `pH ${f.valor}`).not.toContain("Electrodo");
      expect(texto, `pH ${f.valor}`).not.toMatch(/todo bien|sin riesgo/i);
    }
    // Control positivo: la misma llamada con un valor que SÍ tiene riesgo trae el bloque (si no, los
    // `null` de arriba podrían ser «el componente nunca pinta nada»).
    expect(bloqueDeRiesgo(await conUnPh(3.0))).not.toBeNull();
    // MUTACIÓN: añadir `"[3.80, 4.50)"` a las bandas que se pintan → pH 4,0 pinta «Ninguno…» y cae.
    // MUTACIÓN: pintar siempre lo que devuelva el módulo, sin filtrar por banda → cae por 4,0 y por 2,0.
  });

  it("con Brix o con humedad no aparece NINGÚN bloque de riesgo, ni con el mismo número que en pH sí lo trae", async () => {
    // 4,8 es justo un valor que en pH pinta riesgo: el número no distingue, sólo la variable.
    for (const variable of ["brix", "moisture"] as const) {
      const html = await conUnPh(4.8, variable);
      expect(bloqueDeRiesgo(html), variable).toBeNull();
      expect(aTexto(html), variable).not.toContain("Criterio de Néctar Nómada");
      expect(aTexto(html), variable).not.toContain("stinker");
    }
    // Control positivo: la MISMA llamada con pH sí lo trae.
    expect(aTexto(bloqueDeRiesgo(await conUnPh(4.8, "ph"))!)).toContain("stinker");
    // MUTACIÓN: llamar `riesgoDeEsperar("ph", …)` con la variable fija en vez de `pedida.variable` → cae.
  });

  it("el riesgo sale de la ÚLTIMA lectura por hora, no de la primera ni de la que llegó última", async () => {
    // Llegan desordenadas: la de las 16 h (4,8) va primero en el arreglo, la de las 8 h (3,0) después.
    const html = await pintarCurva(
      curvaDeLote({ lecturas: [{ occurredAt: t(16), value: 4.8 }, { occurredAt: t(8), value: 3.0 }], objetivo: BANDA, ...LIENZO }),
    );
    const texto = aTexto(bloqueDeRiesgo(html)!);
    expect(texto).toContain("stinker"); // la de las 16 h
    expect(texto).not.toContain("Daño consumado"); // la de las 8 h: la primera, no la más reciente
    // La lectura citada se dice, para que no haya que adivinar de cuál habla.
    expect(texto).toContain("4.8");
    // MUTACIÓN: tomar `curva.lecturas[0]` en vez de la última → pinta «Daño consumado» y cae.
  });

  it("con cero lecturas no hay riesgo que citar", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: [], objetivo: BANDA, ...LIENZO }));
    expect(bloqueDeRiesgo(html)).toBeNull();
    // MUTACIÓN: `riesgoDeEsperar("ph", curva.lecturas.at(-1)?.value ?? 0)` → cero lecturas cita «Daño consumado» y cae.
  });

  it("ninguna frase ORDENA: «el dato sugiere», nunca «lave ahora»", async () => {
    for (const f of FILAS.filter((x) => x.pinta)) {
      const texto = aTexto(bloqueDeRiesgo(await conUnPh(f.valor))!);
      expect(texto, `pH ${f.valor}`).not.toMatch(/\b(lave|lavar|lávelo|detenga|detén|pare|corte|actúe|haga|debe)\b/i);
    }
    // Control del patrón: sí casa con la frase que se quiere impedir.
    expect("Lave ahora este lote").toMatch(/\b(lave|lavar|lávelo|detenga|detén|pare|corte|actúe|haga|debe)\b/i);
    // MUTACIÓN: cambiar la envoltura a «Lave ahora: …» → cae.
  });

  it("la fuente va detrás de un toque: el documento y la banda están dentro de un <details>, no a la vista", async () => {
    const html = await conUnPh(4.8);
    const bloque = bloqueDeRiesgo(html)!;
    const detalle = /<details[^>]*>[\s\S]*?<\/details>/.exec(bloque)?.[0];
    expect(detalle, "hay un <details>").toBeDefined();
    expect(aTexto(detalle!)).toContain("10_ph_fermentation.md");
    expect(aTexto(detalle!)).toContain("[4.50, 5.20)");
    // Fuera del <details> —lo que se lee sin tocar nada— no hay ni el nombre del documento ni la banda.
    const aLaVista = aTexto(bloque.replace(detalle!, ""));
    expect(aLaVista).not.toContain("10_ph_fermentation.md");
    expect(aLaVista).not.toContain("[4.50, 5.20)");
    // MUTACIÓN: sacar la fuente del <details> → «tres párrafos» a la vista, y cae.
  });

  it("es UNA frase a la vista: un solo <p> fuera del <details>", async () => {
    const bloque = bloqueDeRiesgo(await conUnPh(4.8))!;
    const aLaVista = bloque.replace(/<details[\s\S]*<\/details>/, "");
    expect([...aLaVista.matchAll(/<p\b/g)]).toHaveLength(1);
    // MUTACIÓN: añadir un segundo párrafo explicativo fuera del <details> → cae (antipatrón 3).
  });

  it("la cita NO vive en los mensajes, y la envoltura está en los DOS idiomas", async () => {
    const leer = (f: string) => JSON.parse(readFileSync(new URL(`../../messages/${f}.json`, import.meta.url), "utf8")).SeccionBeneficio as Record<string, string>;
    const es = leer("es");
    const en = leer("en");
    const CLAVES = ["curvaRiesgoMarca", "curvaRiesgoDice", "curvaRiesgoDiceSiSeEstanca", "curvaRiesgoDeDondeSale", "curvaRiesgoFuente", "curvaRiesgoCitaLiteral"];
    for (const k of CLAVES) {
      expect(es[k], `es.${k}`).toBeTruthy();
      expect(en[k], `en.${k}`).toBeTruthy();
    }
    // La cita es del documento y se deja como está: ni se copia a un archivo de mensajes ni se traduce.
    const todo = JSON.stringify([es, en]);
    for (const f of FILAS.filter((x) => x.pinta)) {
      expect(todo, `«${f.cita}» no debe estar en los mensajes`).not.toContain(f.cita!.split(" → ")[0]!);
    }
    // En inglés la ENVOLTURA es inglés de verdad (no el castellano copiado) y sigue sin ordenar.
    expect(en.curvaRiesgoDice).toMatch(/suggests/);
    expect(en.curvaRiesgoMarca).toMatch(/Néctar Nómada/);
    expect(en.curvaRiesgoDice).not.toBe(es.curvaRiesgoDice);
    // Control: el castellano dice «sugiere» y el inglés NO lo copia tal cual.
    expect(es.curvaRiesgoDice).toMatch(/sugiere/);
    // MUTACIÓN: copiar el texto en castellano a en.json → `not.toBe` cae.
  });
});

describe("LineaDeEtapas — un cero no es «sin registro»", () => {
  const ETAPAS = lineaDeEtapas({
    proceso: 2, secado: 0, almacen: 1,
    pidenDecision: { proceso: 2 },
  });

  async function filas() {
    const html = renderToStaticMarkup(await LineaDeEtapas({ etapas: ETAPAS }));
    return [...html.matchAll(/<li class="([^"]*)">(.*?)<\/li>/g)].map((m) => ({ clase: m[1]!, html: m[2]!, texto: aTexto(m[2]!) }));
  }

  it("recepción, flotación y selección dicen «sin registro de esta etapa», sin cuenta, sin dígitos y sin color", async () => {
    const f = await filas();
    expect(f).toHaveLength(6); // control: la línea entera está
    expect(f.map((x) => x.texto.split(" ")[0])).toEqual(["Recepción", "Flotación", "Selección", "Proceso", "Secado", "Almacén"]);
    for (const i of [0, 1, 2]) {
      const sinRegistro = f[i]!;
      expect(sinRegistro.texto, `etapa ${i}`).toContain("sin registro de esta etapa");
      expect(sinRegistro.html).not.toContain("nn-etapa-cuenta");
      expect(sinRegistro.texto).not.toMatch(/\d/);
      expect(sinRegistro.clase).toContain("nn-etapa-sin-registro");
      expect(sinRegistro.clase).not.toContain("nn-etapa-decide");
    }
    // Control: las otras tres SÍ llevan cuenta, así que lo de arriba no es «toda la línea».
    for (const i of [3, 4, 5]) expect(f[i]!.html).toContain("nn-etapa-cuenta");
    // MUTACIÓN: pintar `0` (o la cuenta) en una etapa `sin_registro` → cae.
  });

  it("un cero SÍ es un cero (no se colorea), y sólo se colorea la etapa que pide decisión", async () => {
    const f = await filas();
    expect(f[4]!.texto).toBe("Secado 0 lotes"); // 0 es un dato
    expect(f[4]!.clase).toBe("nn-etapa");
    expect(f[3]!.clase).toContain("nn-etapa-decide");
    expect(f[3]!.texto).toContain("2 piden decisión");
    expect(f.filter((x) => x.clase.includes("nn-etapa-decide"))).toHaveLength(1);
    // Singular con su plural: una etapa con 1 lote dice «lote», no «lotes».
    expect(f[5]!.texto).toBe("Almacén 1 lote");
    // MUTACIÓN: colorear con `pidenDecision >= 0` → cae por el secado y el almacén.
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
