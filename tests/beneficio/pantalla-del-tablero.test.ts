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
import { curvaDeLote, type ObjetivoDeCurva } from "../../lib/beneficio/curvaDeLote";
import { LIENZO_DE_CURVA } from "../../lib/beneficio/curvaEnPantalla";
import { perfilDeLaFaseAbierta } from "../../lib/beneficio/desdeElLote";
import { ejesDeLaCurva } from "../../lib/beneficio/ejesDeLaCurva";
import type { ClaveDePerfil } from "../../lib/beneficio/perfiles";
import type { CeldaDelMapa } from "../../lib/beneficio/tablero";
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

const { ANCHO_DE_LA_MARCA, CurvaDeLote, ESPACIO_DE_LOS_VALORES, FRANJA_DE_LAS_HORAS, PAD_X } = await import(
  "../../app/components/beneficio/CurvaDeLote"
);
const { LineaDeEtapas } = await import("../../app/components/beneficio/LineaDeEtapas");
const { LiberacionDeUnidad } = await import("../../app/components/beneficio/LiberacionDeUnidad");
const { MapaDeUnidades } = await import("../../app/components/beneficio/MapaDeUnidades");

const ID = "3f2b6c1e-8a44-4d0e-9b57-0c1d2e3f4a5b";
const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
// **El lienzo REAL, no una copia:** esta constante fue `{ ancho: 480, alto: 200 }` escrita a mano, y subir
// `LIENZO_DE_CURVA.ancho` a 720 dejaba verdes los guardias de legibilidad de abajo —medían un lienzo que la pantalla ya no usa—.
const LIENZO = LIENZO_DE_CURVA;
const BANDA = { momento: "during", minValue: 4.0, maxValue: 4.6, targetValue: 4.3 } as const;

const aTexto = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/**
 * `perfil` es el que rige el lote (`CurvaDelTablero.perfilDelLote`). **Por omisión, el de la matriz**: casi todas
 * las pruebas de este archivo hablan de otra cosa (los ejes, la banda, el recorte) y pintan un lote que sí tiene
 * matriz; las que hablan del perfil lo pasan EXPLÍCITO.
 */
async function pintarCurva(
  curva: ReturnType<typeof curvaDeLote> | null,
  variable: "ph" | "brix" | "moisture" = "ph",
  perfil: ClaveDePerfil | null = "WASHED_STANDARD",
) {
  return renderToStaticMarkup(
    await CurvaDeLote({ pedida: { lotId: ID, variable }, curva, codigoDelLote: "P5-X", perfilDelLote: perfil }),
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
  objetivos: [BANDA], ...LIENZO,
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
    // El borde de ABAJO del dibujo de las marcas es el `piso` (alto + margen): el viewBox lleva debajo la franja de las horas,
    // que no es margen de marcas (`FRANJA_DE_LAS_HORAS`; ahí no cae ningún punto y ahí van los rótulos).
    expect(ys[1]).toBeCloseTo(vb.y + vb.h - FRANJA_DE_LAS_HORAS - 1, 6);
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
      objetivos: [], ...LIENZO,
    });
    const html = await pintarCurva(sin);
    expect(marcas(html)).toHaveLength(3); // los puntos SÍ
    expect(html).not.toContain("nn-curva-banda");
    expect(html).not.toContain("nn-curva-objetivo");
    expect(aTexto(html)).toContain("no tiene rango declarado en la receta");
    // Control: la misma curva CON banda pinta una (si no, el `not.toContain` de arriba no distingue nada).
    const con = await pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(8), value: 4.3 }], objetivos: [BANDA], ...LIENZO }));
    expect(con).toContain('class="nn-curva-banda"');
    // MUTACIÓN: pintar la banda cuando es `sin_objetivo_declarado` (p. ej. con valores por defecto) → cae.
  });

  it("con banda y CERO lecturas no se afirma nada sobre el rango (hallazgo 2)", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: [], objetivos: [BANDA], ...LIENZO }));
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
        objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }], ...LIENZO,
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
      await pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(12), value: 4.4 }], objetivos: [BANDA], ...LIENZO })),
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
      curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: 4.6, maxValue: 4.0, targetValue: 4.3 }], ...LIENZO }),
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
      curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: 4.0, maxValue: 4.6, targetValue: 4.3 }], ...LIENZO }),
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
  const OBJETIVO = { momento: "during", minValue: 4.0, maxValue: 4.6, targetValue: 4.3 } as const;
  const BANDA_DEL_EJE = { min: 4.0, max: 4.6 };
  const AL_10 = new Date("2026-03-10T10:00:00Z");

  it("la marca del eje Y cae en la MISMA coordenada que el punto de ese valor — los TRES pares", () => {
    const yDelPunto = (value: number) =>
      curvaDeLote({ lecturas: [{ occurredAt: AL_10, value }], objetivos: [OBJETIVO], ancho: 300, alto: 120 }).puntos[0]!.y;
    const e = ejesDeLaCurva({
      lecturas: [{ occurredAt: AL_10, value: 4.3 }], banda: BANDA_DEL_EJE, ancho: 300, alto: 120,
    });
    // Control: hay tres marcas, y NO están todas en el mismo sitio (si lo estuvieran, ninguno de los
    // tres pares de abajo distinguiría una escala de otra).
    expect(e.y).toHaveLength(3);
    expect(new Set(e.y.map((m) => m.pos)).size).toBe(3);

    // **Cada par deja pasar una divergencia distinta, y por eso van los TRES** (medido ejecutando las
    // dos mutaciones de abajo, no deducido). Qué par cae con cada una:
    //
    //   | divergencia de una de las dos escalas   | máximo (4,6) | centro (4,3) | mínimo (4,0) |
    //   | `alto` equivocado (110 en vez de 120)   | **pasa** 0=0 | cae 60≠55    | cae 120≠110  |
    //   | escala INVERTIDA (sin el `tamano -`)    | cae 0≠120    | **pasa** 60=60 | cae 120≠0  |
    //
    // El MÁXIMO (4,6) da 0 en las dos escalas bien puestas: no ve un `alto` divergido, pero sí la inversión.
    expect(yDelPunto(4.6)).toBe(e.y[0]!.pos);
    // El CENTRO (4,3) da 60: ve un `alto` divergido (55 contra 60) y NO ve la inversión (el centro de
    // una escala invertida sigue siendo el centro).
    expect(yDelPunto(4.3)).toBe(e.y[1]!.pos);
    // El MÍNIMO (4,0) da 120: ve las dos. Es el par más fuerte; los otros dos acotan DÓNDE diverge.
    expect(yDelPunto(4.0)).toBe(e.y[2]!.pos);
    // MUTACIÓN: en `ejesDeLaCurva.escalaY`, quitar el `tamano -` → cae el máximo (0≠120) y el mínimo; el centro NO.
    // MUTACIÓN: en `ejesDeLaCurva`, `escalaY(v, min, max, alto - 10)` → cae el centro (60≠55) y el mínimo; el máximo NO.
    // Ninguna de las dos mutaciones hace caer SÓLO a esta prueba: las de `ejesDeLaCurva` fijan los mismos
    // números. Lo que esta prueba añade es cubrir lo que NINGUNA de las dos suites ve sola: que las dos
    // escalas sean la misma, no que cada una sea la que su suite escribió.
  });

  it("un valor INTERMEDIO, que no es ninguna de las tres anclas, cae donde le toca entre las marcas: las dos escalas son LINEALES", () => {
    // **El hueco de los TRES pares:** máximo, centro y mínimo son 0, mitad y `alto` en cualquier escala monótona que conserve
    // los extremos y el centro. Una escala NO lineal —p. ej. la curva «smoothstep» `t²(3 − 2t)`, que da 0, ½ y 1 exactamente
    // en esos tres puntos— pasa el test de arriba entero y desplaza los intermedios: un 4,2 se pintaría donde no está el 4,2
    // de su eje. Se añaden valores que no son ancla (4,1; 4,15; 4,2; 4,45) y se comparan con la interpolación LINEAL entre
    // las marcas que dice el eje (el mínimo y el máximo), y además con el número hecho a mano para 4,2.
    const yDelPunto = (value: number) =>
      curvaDeLote({ lecturas: [{ occurredAt: AL_10, value }], objetivos: [OBJETIVO], ancho: 300, alto: 120 }).puntos[0]!.y;
    const e = ejesDeLaCurva({ lecturas: [{ occurredAt: AL_10, value: 4.3 }], banda: BANDA_DEL_EJE, ancho: 300, alto: 120 });
    const [yMax, yCentro, yMin] = [e.y[0]!.pos, e.y[1]!.pos, e.y[2]!.pos];
    for (const v of [4.1, 4.15, 4.2, 4.45]) {
      const esperado = yMin + ((v - 4.0) / (4.6 - 4.0)) * (yMax - yMin);
      // Control: el valor NO es ninguna de las tres anclas, y cae ESTRICTAMENTE entre las marcas, así que no es un extremo disfrazado.
      expect([yMax, yCentro, yMin]).not.toContain(esperado);
      expect(Math.min(yMax, yMin)).toBeLessThan(esperado);
      expect(Math.max(yMax, yMin)).toBeGreaterThan(esperado);
      expect(yDelPunto(v), `el punto de ${v}`).toBeCloseTo(esperado, 9);
    }
    // El número a mano, que no sale de ningún módulo: 4,2 está a un tercio de la banda 4,0–4,6 → y = 120 − 40 = 80.
    expect(yDelPunto(4.2)).toBeCloseTo(80, 9);
    // MUTACIÓN: en `curvaDeLote.escalaY`, `((v - min) / (max - min)) * tamano` → smoothstep (`t * t * (3 - 2 * t)`): los tres pares de
    // arriba PASAN (0, 60 y 120 no cambian) y cae SÓLO esta prueba (el 4,2 sale en 88,9 y no en 80).
  });

  it("el eje X coincide con la X de la primera y la última lectura", () => {
    const lecturas = [
      { occurredAt: new Date("2026-03-10T08:00:00Z"), value: 4.3 },
      { occurredAt: new Date("2026-03-10T16:00:00Z"), value: 4.4 },
    ];
    const c = curvaDeLote({ lecturas, objetivos: [OBJETIVO], ancho: 300, alto: 120 });
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
    const c = curvaDeLote({ lecturas, objetivos: [], ancho: 300, alto: 120 });
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
    ancla: /text-anchor="(\w+)"/.exec(m[1]!)?.[1] ?? "start",
  }));
}
const soloElSvg = (html: string) => /<svg\b[\s\S]*<\/svg>/.exec(html)![0];

describe("CurvaDeLote — los ejes dicen a qué valor está la banda y cuánto lleva la fase", () => {
  const LECTURAS = [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(16), value: 4.4 }];

  it("el eje Y rotula máximo, centro y mínimo de la banda, y el X las horas; todo DENTRO del mismo <svg>", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS, objetivos: [BANDA], ...LIENZO }));
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
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS, objetivos: [BANDA], ...LIENZO }));
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
      curvaDeLote({ lecturas: [{ occurredAt: t(8), value: 4.5 }, { occurredAt: t(12), value: 4.1 }], objetivos: [], ...LIENZO }),
    );
    const y = rotulos(html, "y");
    expect(y.map((r) => r.texto)).toEqual(["4.5", "4.3", "4.1"]);
    expect([y[0]!.y, y[2]!.y]).toEqual([0, 200]);
    // MUTACIÓN: rotular con una banda inventada (p. ej. 4,0–4,6 fijos) → cae.
  });

  it("con la receta AL REVÉS el eje no se espeja: el 4,9 se rotula ARRIBA, a la altura de su punto", async () => {
    const lecturas = [{ occurredAt: t(8), value: 4.2 }, { occurredAt: t(12), value: 4.9 }, { occurredAt: t(16), value: 4.0 }];
    const html = await pintarCurva(
      curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: 4.6, maxValue: 4.0, targetValue: 4.3 }], ...LIENZO }),
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
    const conBanda = soloElSvg(await pintarCurva(curvaDeLote({ lecturas: [], objetivos: [BANDA], ...LIENZO })));
    expect(rotulos(conBanda, "y").map((r) => r.texto)).toEqual(["4.6", "4.3", "4.0"]);
    expect(rotulos(conBanda, "x")).toEqual([]); // unas horas sin ninguna lectura serían inventadas
    // Sin banda y sin lecturas no hay NINGÚN rótulo: no hay con qué escalar.
    const sinNada = await pintarCurva(curvaDeLote({ lecturas: [], objetivos: [], ...LIENZO }));
    expect(sinNada).not.toContain("nn-curva-eje");
    // Control positivo: con lecturas SÍ hay horas (si no, el `toEqual([])` de arriba sería «nunca pinta horas»).
    expect(rotulos(await pintarCurva(curvaDeLote({ lecturas: LECTURAS, objetivos: [BANDA], ...LIENZO })), "x")).toHaveLength(2);
    // MUTACIÓN: rotular las horas con `0 h` y `0 h` aunque no haya lecturas → cae por `rotulos(…, "x")`.
    // MUTACIÓN: rotular con una banda inventada cuando no hay objetivo ni lecturas → cae por `sinNada`.
  });
});

// ── La GEOMETRÍA de los ejes. «Dentro del lienzo» y «legible» no son la misma propiedad (la lección del PR #564, en el
// CLAUDE.md): las pruebas de arriba miran que el texto, la clase y UNA coordenada estén; ninguna miraba DÓNDE caen los
// rótulos ni cuánto miden. Medido antes de escribir esto: con `ESPACIO_DE_LOS_VALORES` en 0, los rótulos Y en `x = -200`, las
// horas a `alto + 2000` o encima de los puntos, el ancla fija en `middle`, los ejes pintados DESPUÉS de los puntos y el cuerpo
// en 10 px, las 88 pruebas seguían en verde. Todo lo de abajo lee del MARKUP renderizado —no de las constantes del componente—.
const CSS_DE_LA_APP = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
/** El cuerpo de los rótulos, leído del CSS real (`.nn-curva-eje { font-size: …px }`), en unidades del viewBox. */
const CUERPO_DE_LOS_EJES = Number(/\.nn-curva-eje\s*\{[^}]*?font-size:\s*([\d.]+)px/.exec(CSS_DE_LA_APP)?.[1]);
/**
 * Ancho de un rótulo según un MODELO deliberadamente grueso, porque no hay navegador aquí: dígitos y letras a 0,6 em, punto y
 * espacio a 0,3 em. Una tipografía de sistema da ~0,55 em al dígito, así que el modelo se pasa de ancho un poco: prefiere un
 * falso «no cabe» a un falso «cabe». El paso 7 del navegador mira lo que este modelo no puede.
 */
const anchoDeTexto = (texto: string) => [...texto].reduce((a, c) => a + (/[. ]/.test(c) ? 0.3 : 0.6) * CUERPO_DE_LOS_EJES, 0);
type Rotulo = ReturnType<typeof rotulos>[number];
/** De dónde a dónde se extiende el rótulo en X, según su ancla (`start` crece a la derecha, `end` a la izquierda). */
function extensionEnX(r: Rotulo): [number, number] {
  const w = anchoDeTexto(r.texto);
  return r.ancla === "end" ? [r.x - w, r.x] : r.ancla === "middle" ? [r.x - w / 2, r.x + w / 2] : [r.x, r.x + w];
}
/** De dónde a dónde se extiende un rótulo del eje X en Y: de la altura de las mayúsculas sobre la línea de base a un poco por debajo. */
const extensionEnY = (r: Rotulo): [number, number] => [r.y - 0.8 * CUERPO_DE_LOS_EJES, r.y + 0.2 * CUERPO_DE_LOS_EJES];
/**
 * La caja de UNA marca. `marcas()` da un círculo como UN solo vértice (su centro): sin inflarlo con su radio (4,5) la caja
 * mide cero y «se solapan» da falso con el rótulo encima del punto — lo vio la mutación de las horas a media altura, que
 * el primer intento de esta prueba dejaba pasar.
 */
function cajaDeUnaMarca(m: { vertices: [number, number][] }): { x: [number, number]; y: [number, number] } {
  const xs = m.vertices.map((p) => p[0]);
  const ys = m.vertices.map((p) => p[1]);
  const r = m.vertices.length === 1 ? 4.5 : 0;
  return { x: [Math.min(...xs) - r, Math.max(...xs) + r], y: [Math.min(...ys) - r, Math.max(...ys) + r] };
}
/** El punto más bajo de TODAS las marcas (con el vértice de un triángulo anclado y el radio de un círculo) y cuántas hay. */
function cajaDeLasMarcas(html: string) {
  const cajas = marcas(html).map(cajaDeUnaMarca);
  return { maxY: Math.max(...cajas.map((c) => c.y[1])), n: cajas.length };
}
const seSolapan = (a: [number, number], b: [number, number]) => a[0] < b[1] && b[0] < a[1];
/** Ancho del contenido de un teléfono de 375 px con 16 px de margen por lado (supuesto: el paso 7 lee el ancho real del <svg>). */
const ANCHO_DE_UN_TELEFONO = 343;

describe("CurvaDeLote — los ejes CABEN, SE LEEN y NO TAPAN el dato (la geometría, no sólo la presencia)", () => {
  const LECTURAS_8H = [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(16), value: 4.4 }];
  const BANDA_BAJA = { momento: "during", minValue: 3.8, maxValue: 4.5, targetValue: 4.15 } as const;
  /** Las tres curvas que más aprietan las horas: la lectura de sobrefermentación va justo debajo del mínimo de la banda. */
  const CURVAS_QUE_APRIETAN = {
    "la ÚLTIMA lectura apenas bajo el mínimo (3,72 contra 3,8–4,5)": [{ occurredAt: t(8), value: 4.2 }, { occurredAt: t(16), value: 3.72 }],
    "la PRIMERA lectura apenas bajo el mínimo": [{ occurredAt: t(8), value: 3.72 }, { occurredAt: t(16), value: 4.2 }],
    "una lectura TAN abajo que se ancla en el borde (0 contra 3,8–4,5)": [{ occurredAt: t(8), value: 4.2 }, { occurredAt: t(16), value: 0 }],
  } as const;
  // Toma UN objetivo y lo envuelve en la lista, para que los sitios de llamada sigan hablando de
  // una sola banda: la lista de varios la ejercita `elegirObjetivo` en `curva-de-lote.test.ts`.
  const pintar = (
    lecturas: readonly { occurredAt: Date; value: number }[],
    objetivo: ObjetivoDeCurva = BANDA_BAJA,
    variable: "ph" | "brix" | "moisture" = "ph",
  ) => pintarCurva(curvaDeLote({ lecturas: [...lecturas], objetivos: [objetivo], ...LIENZO }), variable);

  it("el cuerpo de los rótulos se lee del CSS real (control de la prueba: si el patrón no casa, todo lo de abajo mediría con NaN)", () => {
    expect(Number.isFinite(CUERPO_DE_LOS_EJES)).toBe(true);
    expect(CUERPO_DE_LOS_EJES).toBeGreaterThan(0);
    // Y el modelo de ancho es el que se cree: «10.25» (4 dígitos y un punto) es más ancho que «4.6».
    expect(anchoDeTexto("10.25")).toBeGreaterThan(anchoDeTexto("4.6"));
  });

  it("los rótulos del eje Y quedan a la IZQUIERDA del lienzo y DENTRO del viewBox ensanchado", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS_8H, objetivos: [BANDA], ...LIENZO }));
    const vb = viewBoxDe(html);
    const y = rotulos(html, "y");
    expect(y).toHaveLength(3); // control: están los tres
    for (const r of y) {
      const [izq, der] = extensionEnX(r);
      expect(der, `«${r.texto}»: su borde derecho debe quedar a la izquierda del lienzo (x < 0)`).toBeLessThan(0);
      expect(izq, `«${r.texto}»: su borde izquierdo (${izq.toFixed(1)}) debe caber en el viewBox (desde ${vb.x})`).toBeGreaterThanOrEqual(vb.x);
    }
    // MUTACIÓN: `ESPACIO_DE_LOS_VALORES = 0` → el viewBox arranca en −10 y «4.6» (≈ −36) se sale → cae.
    // MUTACIÓN: los rótulos Y a `x={-200}` → se salen del viewBox por la izquierda → cae.
  });

  it("el rótulo MÁS ANCHO posible («10.25») también cabe, y sólo cabe porque el viewBox se ensanchó", async () => {
    const html = await pintar(
      [{ occurredAt: t(8), value: 10 }, { occurredAt: t(16), value: 10.1 }],
      { momento: "during", minValue: 9.5, maxValue: 10.25, targetValue: 10 },
      "moisture",
    );
    const vb = viewBoxDe(html);
    const ancho = rotulos(html, "y").find((r) => r.texto === "10.25");
    expect(ancho, "hay un rótulo «10.25»").toBeDefined();
    const [izq] = extensionEnX(ancho!);
    expect(izq).toBeGreaterThanOrEqual(vb.x);
    // El ensanche hace falta: con sólo el relleno de siempre (`PAD_X`) este rótulo se saldría. Es lo que convierte la
    // declaración «52 unidades para que quepan» en una propiedad: si el hueco sobrara, esta línea caería.
    expect(izq, "sin el hueco reservado, «10.25» no cabría").toBeLessThan(-PAD_X);
    // MUTACIÓN: `ESPACIO_DE_LOS_VALORES = 0` → cae por la primera aserción. `CUERPO` a 30 px en el CSS → cae (no cabe).
  });

  it("los rótulos del eje Y NO PISAN ninguna marca: una marca sobresale 4,5 por la izquierda de x = 0 si es un círculo y 6 si es un rombo", async () => {
    // El primer guardia del eje Y sólo medía «a la izquierda del lienzo» (`der < 0`): con los rótulos en `x = -1` pasaban las 99 y el
    // rótulo «4.3» quedaba SOBRE el primer punto. La propiedad que importa es que no tapen el dato, contando el radio o el semiancho de la marca.
    const caso = (lecturas: { occurredAt: Date; value: number }[]) => pintar(lecturas, BANDA);
    const CASOS = {
      "un círculo a la altura del rótulo «4.3»": { lecturas: [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(16), value: 4.4 }], sobresale: 4.5 },
      "un círculo a la altura del rótulo «4.6» (el máximo)": { lecturas: [{ occurredAt: t(8), value: 4.6 }, { occurredAt: t(16), value: 4.3 }], sobresale: 4.5 },
      "un círculo a la altura del rótulo «4.0» (el mínimo)": { lecturas: [{ occurredAt: t(8), value: 4.0 }, { occurredAt: t(16), value: 4.3 }], sobresale: 4.5 },
      "un ROMBO apenas por encima del máximo (4,62), que sobresale 6": { lecturas: [{ occurredAt: t(8), value: 4.62 }, { occurredAt: t(16), value: 4.3 }], sobresale: 6 },
    } as const;
    for (const [nombre, { lecturas, sobresale }] of Object.entries(CASOS)) {
      const html = await caso([...lecturas]);
      const dibujo = marcas(html);
      const rotulosY = rotulos(html, "y");
      expect(rotulosY, nombre).toHaveLength(3); // control: los tres rótulos están
      // CONTROL POSITIVO, parte 1: la marca de la izquierda sí sobresale lo que el comentario dice (si no, «no pisan» no probaría nada).
      // (`marcas()` devuelve primero todos los círculos y luego los polígonos: la de más a la izquierda no es la `[0]`.)
      expect(Math.min(...dibujo.map((m) => cajaDeUnaMarca(m).x[0])), `${nombre}: cuánto sobresale la marca de más a la izquierda`).toBe(-sobresale);
      for (const r of rotulosY) {
        const [rx0, rx1] = extensionEnX(r);
        // Un rótulo del eje Y va centrado en su `y` (`dy="0.35em"`): la línea de base cae 0,35 em por debajo.
        const ry: [number, number] = [r.y + 0.35 * CUERPO_DE_LOS_EJES - 0.8 * CUERPO_DE_LOS_EJES, r.y + 0.35 * CUERPO_DE_LOS_EJES + 0.2 * CUERPO_DE_LOS_EJES];
        for (const m of dibujo) {
          const c = cajaDeUnaMarca(m);
          expect(seSolapan([rx0, rx1], c.x) && seSolapan(ry, c.y), `${nombre}: «${r.texto}» pisa una marca`).toBe(false);
        }
      }
    }
    // CONTROL POSITIVO, parte 2: con los rótulos en `x = -1` el «4.3» SÍ pisaba el primer punto. Sin esto, el bucle de arriba podía pasar por no mirar donde el rótulo cae.
    const htmlCentro = await caso([...CASOS["un círculo a la altura del rótulo «4.3»"].lecturas]);
    const r43 = rotulos(htmlCentro, "y").find((r) => r.texto === "4.3")!;
    const aMenosUno: Rotulo = { ...r43, x: -1 };
    const primero = cajaDeUnaMarca(marcas(htmlCentro).reduce((a, m) => (cajaDeUnaMarca(m).x[0] < cajaDeUnaMarca(a).x[0] ? m : a)));
    const ryCentro: [number, number] = [r43.y - 0.45 * CUERPO_DE_LOS_EJES, r43.y + 0.55 * CUERPO_DE_LOS_EJES];
    expect(seSolapan(extensionEnX(aMenosUno), primero.x) && seSolapan(ryCentro, primero.y), "con x = -1 el rótulo «4.3» cae sobre el primer punto").toBe(true);
    // MUTACIÓN: rótulos Y a `x={-1}` → «4.3» pisa el círculo y cae. A `x={-5}` → pisa el rombo (sobresale 6) y cae. A `x={-7}` NO cae: deja 1 unidad de holgura, y es correcto.
  });

  it("el viewBox mide exactamente lo que dice, leído del ATRIBUTO: ancho + relleno + hueco, y la franja de las horas debajo", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS_8H, objetivos: [BANDA], ...LIENZO }));
    const vb = viewBoxDe(html);
    expect(vb.x).toBe(-(PAD_X + ESPACIO_DE_LOS_VALORES));
    expect(vb.w).toBe(LIENZO.ancho + 2 * PAD_X + ESPACIO_DE_LOS_VALORES);
    // El borde derecho cubre el último punto con su marcador (radio 4,5, vértice a 6): si el ancho olvidara el hueco, se cortaría.
    expect(vb.x + vb.w).toBeGreaterThanOrEqual(LIENZO.ancho + 6);
    const margen = -vb.y;
    expect(vb.h).toBe(LIENZO.alto + 2 * margen + FRANJA_DE_LAS_HORAS);
    // MUTACIÓN: sumar el hueco al `x` del viewBox pero no a su ancho → el borde derecho queda en `ancho − 42` y cae.
  });

  it("las horas van por DEBAJO de toda marca —incluida la anclada abajo— y dentro del viewBox por abajo", async () => {
    for (const [nombre, lecturas] of Object.entries(CURVAS_QUE_APRIETAN)) {
      const html = await pintar(lecturas);
      const vb = viewBoxDe(html);
      const caja = cajaDeLasMarcas(html);
      const x = rotulos(html, "x");
      expect(caja.n, nombre).toBe(2); // control: las dos lecturas se dibujan
      expect(x, nombre).toHaveLength(2);
      for (const r of x) {
        const [arriba, abajo] = extensionEnY(r);
        expect(arriba, `${nombre}: «${r.texto}» debe empezar por debajo de la marca más baja (${caja.maxY.toFixed(1)})`).toBeGreaterThan(caja.maxY);
        expect(abajo, `${nombre}: «${r.texto}» debe terminar dentro del viewBox (${vb.y + vb.h})`).toBeLessThanOrEqual(vb.y + vb.h);
      }
    }
    // Control: la curva anclada de verdad tiene un triángulo anclado (`punto-lejos`), o «anclada» sería «normal».
    expect(await pintar(CURVAS_QUE_APRIETAN["una lectura TAN abajo que se ancla en el borde (0 contra 3,8–4,5)"])).toContain("nn-curva-punto-lejos");
    // MUTACIÓN: horas a `y = alto + 2000` → fuera del viewBox por abajo y cae.
    // MUTACIÓN: horas a media altura (`alto / 2`), encima de los puntos → cae por la marca más baja.
  });

  it("las horas no se salen del viewBox por los lados: el rótulo de la derecha va anclado a la derecha", async () => {
    // 120 h → «120 h»: tres dígitos, el rótulo más ancho que puede salir de una fase de fermentación larga.
    const largas = [{ occurredAt: new Date("2026-03-10T08:00:00Z"), value: 4.3 }, { occurredAt: new Date("2026-03-15T08:00:00Z"), value: 4.4 }];
    for (const lecturas of [LECTURAS_8H, largas]) {
      const html = await pintarCurva(curvaDeLote({ lecturas, objetivos: [BANDA], ...LIENZO }));
      const vb = viewBoxDe(html);
      const x = rotulos(html, "x");
      expect(x).toHaveLength(2);
      for (const r of x) {
        const [izq, der] = extensionEnX(r);
        expect(izq, `«${r.texto}» por la izquierda`).toBeGreaterThanOrEqual(vb.x);
        expect(der, `«${r.texto}» por la derecha (viewBox hasta ${vb.x + vb.w})`).toBeLessThanOrEqual(vb.x + vb.w);
      }
    }
    // Control: lo de arriba se mide con un rótulo de verdad ancho.
    expect(rotulos(await pintarCurva(curvaDeLote({ lecturas: largas, objetivos: [BANDA], ...LIENZO })), "x").map((r) => r.texto)).toEqual(["0 h", "120 h"]);
    // MUTACIÓN: `textAnchor="middle"` fijo → «120 h» a `x = ancho` se sale ~24 por la derecha (el relleno es 10) y cae.
  });

  it("el rótulo de las horas NO PISA ninguna marca — la última lectura apenas bajo el mínimo de la banda es la sobrefermentación", async () => {
    for (const [nombre, lecturas] of Object.entries(CURVAS_QUE_APRIETAN)) {
      const html = await pintar(lecturas);
      const marcasDelDibujo = marcas(html);
      for (const r of rotulos(html, "x")) {
        const [rx0, rx1] = extensionEnX(r);
        const [ry0, ry1] = extensionEnY(r);
        for (const m of marcasDelDibujo) {
          const c = cajaDeUnaMarca(m);
          const pisa = seSolapan([rx0, rx1], c.x) && seSolapan([ry0, ry1], c.y);
          expect(pisa, `${nombre}: «${r.texto}» pisa una marca`).toBe(false);
        }
      }
    }
    // CONTROL POSITIVO, y es la mitad que importa: con las horas donde estaban (línea de base en `alto + 22`) esa MISMA
    // lectura SÍ las pisaba. Sin esto, «no se pisan» podría ser «las marcas nunca caen por esa zona».
    const html = await pintar(CURVAS_QUE_APRIETAN["la ÚLTIMA lectura apenas bajo el mínimo (3,72 contra 3,8–4,5)"]);
    const ultima = marcas(html)[1]!;
    const antiguo = rotulos(html, "x")[1]!;
    const dondeEstaban: Rotulo = { ...antiguo, y: LIENZO.alto + 22 };
    const cajaDeLaUltima = cajaDeUnaMarca(ultima);
    expect(
      seSolapan(extensionEnX(dondeEstaban), cajaDeLaUltima.x) && seSolapan(extensionEnY(dondeEstaban), cajaDeLaUltima.y),
      "con las horas a alto + 22 la última lectura cae sobre la «h»",
    ).toBe(true);
    // MUTACIÓN: horas con la línea de base en `alto + 22` (sin la franja) → el rótulo «8 h» queda bajo el punto de 3,72 y cae.
  });

  it("los ejes se pintan ANTES que la curva y los puntos: si un rótulo y un punto coinciden, manda el dato", async () => {
    const html = soloElSvg(await pintarCurva(curvaDeLote({ lecturas: LECTURAS_8H, objetivos: [BANDA], ...LIENZO })));
    const ultimoEje = Math.max(html.lastIndexOf('class="nn-curva-eje'), html.lastIndexOf('class="nn-curva-marca"'));
    const primerDato = Math.min(html.indexOf('class="nn-curva-linea"'), html.indexOf('class="nn-curva-punto'));
    expect(ultimoEje, "hay ejes").toBeGreaterThan(0);
    expect(primerDato, "hay polilínea y puntos").toBeGreaterThan(0);
    expect(ultimoEje).toBeLessThan(primerDato);
    // MUTACIÓN: mover el bloque de los ejes después del `.map` de los puntos → los rótulos tapan al dato y cae.
  });

  it("en un teléfono de 375 px el rótulo de los ejes mide al menos 10 px de pantalla", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: LECTURAS_8H, objetivos: [BANDA], ...LIENZO }));
    const vb = viewBoxDe(html);
    // El `<svg>` ocupa el ancho del contenedor y el cuerpo se escala con él: unidades del viewBox × (ancho de pantalla / ancho del viewBox).
    const enPantalla = (CUERPO_DE_LOS_EJES * ANCHO_DE_UN_TELEFONO) / vb.w;
    expect(enPantalla, `${CUERPO_DE_LOS_EJES} unidades × ${ANCHO_DE_UN_TELEFONO} / ${vb.w} = ${enPantalla.toFixed(1)} px`).toBeGreaterThanOrEqual(10);
    // MUTACIÓN: `.nn-curva-eje { font-size: 10px }` → 10 × 343 / 552 = 6,2 px y cae. Hoy son 11,2 px.
    // El 10 es una decisión, no una norma: «no bajar de 10 px efectivos en el teléfono». Subirlo ensancha el hueco que hace falta (ver «10.25»).
    // LÍMITE: el cuerpo se lee de la PRIMERA regla `.nn-curva-eje {` del texto del CSS; un `font-size` posterior o en línea pasa sin que esta prueba lo vea.
    // MUTACIÓN: `LIENZO_DE_CURVA.ancho` a 720 → `LIENZO` (que ES ese objeto) da un viewBox más ancho y el cuerpo en pantalla baja de 10 px: cae esta prueba.
  });
});

describe("CurvaDeLote — qué sugiere el dato si se espera (rúbrica 22): sólo pH, citado, sin ordenar", () => {
  /** Una lectura sola del valor dado, contra la banda de siempre. */
  const conUnPh = (value: number, variable: "ph" | "brix" | "moisture" = "ph") =>
    pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(10), value }], objetivos: [BANDA], ...LIENZO }), variable);
  const bloqueDeRiesgo = (html: string) => /<div class="nn-curva-riesgo">[\s\S]*?<\/div>/.exec(html)?.[0] ?? null;
  /**
   * El bloque SIN el párrafo de la guía de Daniel (`nn-curva-riesgo-guia`). Hoy las ocho celdas de «Qué hace el operario» están
   * vacías y no hay párrafo; el día que Daniel rellene una, la pantalla lo pinta (lo exige `guia-no-inventada.test.ts`) y las dos
   * pruebas que miran «lo que escribe el código» —UNA frase a la vista, y «nada escrito a mano»— no deben caer por texto SUYO.
   */
  const sinLaGuiaDeDaniel = (bloque: string) => bloque.replace(/<p[^>]*nn-curva-riesgo-guia[^>]*>[\s\S]*?<\/p>/g, "");

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
    for (const f of FILAS) expect(riesgoDeEsperar("ph", f.valor, "WASHED_STANDARD")?.banda ?? null, `pH ${f.valor}`).toBe(f.banda);
    // Y no hay una banda que la tabla no conozca: barriendo −2…16 de a 0,01 se ven SIETE bandas (las
    // ocho filas menos la retirada). Una banda nueva en el módulo obliga a decidir aquí si se pinta.
    const vistas = new Set<string>();
    for (let v = -200; v <= 1600; v += 1) {
      const r = riesgoDeEsperar("ph", v / 100, "WASHED_STANDARD");
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
    // El módulo no ve la tendencia: `riesgoDeEsperar(variable, valor, perfil)`. En el documento esa banda es
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
      curvaDeLote({ lecturas: [{ occurredAt: t(16), value: 4.8 }, { occurredAt: t(8), value: 3.0 }], objetivos: [BANDA], ...LIENZO }),
    );
    const texto = aTexto(bloqueDeRiesgo(html)!);
    expect(texto).toContain("stinker"); // la de las 16 h
    expect(texto).not.toContain("Daño consumado"); // la de las 8 h: la primera, no la más reciente
    // La lectura citada se dice, para que no haya que adivinar de cuál habla.
    expect(texto).toContain("4.8");
    // MUTACIÓN: tomar `curva.lecturas[0]` en vez de la última → pinta «Daño consumado» y cae.
  });

  it("con cero lecturas no hay riesgo que citar", async () => {
    const html = await pintarCurva(curvaDeLote({ lecturas: [], objetivos: [BANDA], ...LIENZO }));
    expect(bloqueDeRiesgo(html)).toBeNull();
    // MUTACIÓN: `const ultima = curva.lecturas.at(-1) ?? { value: 3 }` → cero lecturas cita «Daño consumado» y cae.
    // (Con `{ value: 0 }` NO cae, medido: 0 es «fuera de [2.50, 8.00]», la fila del electrodo, que no se pinta.)
  });

  // **C1: la matriz es la del perfil `WASHED_STANDARD`, no la de cualquier lote.** Se parte del GRADO de proceso —lo que el
  // lote declara— y se pasa por la misma función que decide su perfil (`perfilDeLaFaseAbierta`), no de una clave escrita a mano:
  // así la prueba cae tanto si la pantalla ignora el perfil como si el mapeo grado→perfil presta el del lavado a otro grado.
  describe("sólo con el perfil de la matriz: un lote que no es lavado NO recibe la cita del lavado", () => {
    /**
     * El perfil de un lote cuya fase abierta es `fase` (por omisión, fermentación) y tiene un proceso de grado `grado`;
     * con `fase = null`, el de un lote SIN fase abierta.
     */
    const perfilDe = (grado: string | null, fase: "fermentation" | "drying" | null = "fermentation", conReceta = true) =>
      perfilDeLaFaseAbierta(
        fase === null
          ? undefined
          : {
              fase,
              proceso: {
                processGradeValue: grado === null ? null : { value: grado },
                processRecipeVersion: conReceta ? { id: "receta" } : null,
                endedAt: null,
              },
            },
      );
    /** 4,7 está DENTRO de la ventana óptima de NATURAL (3,9–4,8) y, en la matriz del lavado, es «proliferación butírica y mohos». */
    const PH = 4.7;
    const pintarConPerfil = (perfil: ClaveDePerfil | null, valor = PH) =>
      pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(10), value: valor }], objetivos: [BANDA], ...LIENZO }), "ph", perfil);

    it("un lote Washed SÍ pinta el bloque, con la cita del lavado (control de las pruebas de abajo)", async () => {
      expect(perfilDe("Washed")).toBe("WASHED_STANDARD");
      const html = await pintarConPerfil(perfilDe("Washed"));
      expect(bloqueDeRiesgo(html), "con perfil Washed debe haber bloque").not.toBeNull();
      expect(aTexto(bloqueDeRiesgo(html)!)).toContain("stinker");
    });

    it("Natural, Honey, los dos Semi Wash, un grado desconocido y un lote sin grado NO pintan NADA: ni el bloque ni una frase neutra", async () => {
      const casos: [string, string | null][] = [
        ["Natural", "Natural"], ["Honey", "Honey"], ["Semi Wash 50%", "Semi Wash 50%"], ["Semi Wash 75%", "Semi Wash 75%"],
        ["un grado que ningún perfil conoce", "Anaeróbico"], ["sin grado declarado", null],
      ];
      for (const [nombre, grado] of casos) {
        const html = await pintarConPerfil(perfilDe(grado));
        const texto = aTexto(html);
        expect(bloqueDeRiesgo(html), `${nombre}: no debe haber bloque`).toBeNull();
        expect(texto, nombre).not.toContain("Criterio de Néctar Nómada");
        expect(texto, nombre).not.toContain("sugiere");
        expect(texto, nombre).not.toContain("stinker");
        expect(texto, nombre).not.toMatch(/todo bien|sin riesgo|ninguno/i);
      }
      // Control: el MISMO pH y la MISMA curva con el perfil del lavado sí pintan, así que el vacío de arriba es del perfil y no del dato.
      expect(bloqueDeRiesgo(await pintarConPerfil(perfilDe("Washed")))).not.toBeNull();
      // MUTACIÓN: llamar `riesgoDeEsperar(pedida.variable, ultima.value, "WASHED_STANDARD")` (ignorar `perfilDelLote`) → Natural cita «stinker» y cae.
      // MUTACIÓN: añadir `Honey: "WASHED_STANDARD"` a `PERFIL_POR_GRADO` → Honey pinta el bloque y cae.
    });

    it("un lote Washed SIN fase abierta no pinta: sin fase no hay qué esperar (I1)", async () => {
      const sinFase = perfilDe("Washed", null);
      expect(sinFase).toBeNull();
      expect(bloqueDeRiesgo(await pintarConPerfil(sinFase))).toBeNull();
      // Control: con fase abierta, el mismo grado sí pinta.
      expect(bloqueDeRiesgo(await pintarConPerfil(perfilDe("Washed", "fermentation")))).not.toBeNull();
      // MUTACIÓN: quitar `if (!abierta) return null;` de `perfilDeLaFaseAbierta` → revienta con `undefined` y cae.
    });

    // **La otra mitad de C1: la matriz es de una FASE, la fermentación.** `10_ph_fermentation.md` §1 es la matriz de pH de la
    // fermentación y `13_drying_moisture.md` no tiene ninguna: un lote Washed con una corrida de SECADO abierta tiene perfil
    // `WASHED_STANDARD`, y con un pH dentro de una ventana de secado la pantalla le citaría cinética de fermentación.
    it("un lote Washed con SECADO abierto no pinta; el mismo con FERMENTACIÓN abierta sí (la matriz es de la fermentación)", async () => {
      const secando = perfilDe("Washed", "drying");
      expect(secando, "con secado abierto no hay perfil que citar").toBeNull();
      const htmlSecando = await pintarConPerfil(secando);
      expect(bloqueDeRiesgo(htmlSecando)).toBeNull();
      expect(aTexto(htmlSecando)).not.toContain("Criterio de Néctar Nómada");
      expect(aTexto(htmlSecando)).not.toContain("stinker");
      // Tampoco con otros grados que sí tienen perfil: es la fase, no el grado.
      expect(perfilDe("Natural", "drying")).toBeNull();
      // Control, con el MISMO grado y el MISMO dato: con fermentación abierta SÍ pinta, y es la cita del lavado.
      const fermentando = perfilDe("Washed", "fermentation");
      expect(fermentando).toBe("WASHED_STANDARD");
      expect(aTexto(bloqueDeRiesgo(await pintarConPerfil(fermentando))!)).toContain("stinker");
      // MUTACIÓN: quitar `if (abierta.fase !== "fermentation") return null;` de `perfilDeLaFaseAbierta` → el secado cita «stinker» y cae.
      // MUTACIÓN: invertirlo (`=== "fermentation"`) → cae el control de la fermentación.
    });

    // **Y de una RECETA.** ADR-181: los perfiles son plantillas y sin receta el motor no opina. Codex construyó la entrada:
    // fermentación abierta, grado Washed, SIN receta, última lectura pH 3,40 — y la pantalla decía a la vez «esta variable no
    // tiene rango declarado en la receta» y «Degradación ácida, decoloración del pergamino».
    it("un lote Washed en fermentación SIN receta no cita nada (y dice que no hay rango); el mismo CON receta sí cita", async () => {
      const sinReceta = perfilDe("Washed", "fermentation", false);
      expect(sinReceta, "sin receta no hay perfil que citar").toBeNull();
      // Sin receta tampoco hay objetivo: `curvaDeUnLote` pasa `objetivos: []`, y es lo que la pantalla ya dice.
      const htmlSin = await pintarCurva(
        curvaDeLote({ lecturas: [{ occurredAt: t(10), value: 3.4 }], objetivos: [], ...LIENZO }),
        "ph",
        sinReceta,
      );
      expect(aTexto(htmlSin)).toContain("no tiene rango declarado en la receta"); // control: es la pantalla de Codex
      expect(bloqueDeRiesgo(htmlSin)).toBeNull();
      expect(aTexto(htmlSin)).not.toContain("Degradación ácida");
      expect(aTexto(htmlSin)).not.toContain("Criterio de Néctar Nómada");
      // Control positivo, con el MISMO grado, la MISMA fase y el MISMO pH: con receta, cita.
      const conReceta = perfilDe("Washed", "fermentation", true);
      expect(conReceta).toBe("WASHED_STANDARD");
      expect(aTexto(bloqueDeRiesgo(await pintarConPerfil(conReceta, 3.4))!)).toContain("Degradación ácida");
      // MUTACIÓN: quitar `if (!abierta.proceso?.processRecipeVersion) return null;` de `perfilDeLaFaseAbierta` → cita sin receta y cae.
    });

    it("la fuente NOMBRA el perfil de la matriz, detrás del toque, en los dos idiomas", async () => {
      const bloque = bloqueDeRiesgo(await pintarConPerfil("WASHED_STANDARD"))!;
      const detalle = /<details[^>]*>[\s\S]*?<\/details>/.exec(bloque)![0];
      expect(aTexto(detalle)).toContain("WASHED_STANDARD");
      // Y a la vista, sin tocar nada, no: es UNA frase (la prueba de «una frase a la vista» lo exige también).
      expect(aTexto(bloque.replace(detalle, ""))).not.toContain("WASHED_STANDARD");
      const leer = (f: string) => JSON.parse(readFileSync(new URL(`../../messages/${f}.json`, import.meta.url), "utf8")).SeccionBeneficio as Record<string, string>;
      expect(leer("es").curvaRiesgoFuente).toContain("{perfil}");
      expect(leer("en").curvaRiesgoFuente).toContain("{perfil}");
      // MUTACIÓN: quitar `perfil: riesgo.perfil` del `t("curvaRiesgoFuente", …)` → el texto pinta «{perfil}» o revienta, y cae.
    });
  });

  // **C2: con varias lecturas en el instante máximo NO hay «última».**
  describe("«tu última lectura»: con varias en el mismo instante no se cita ninguna", () => {
    const conLecturas = (lecturas: { occurredAt: Date; value: number }[]) =>
      pintarCurva(curvaDeLote({ lecturas, objetivos: [BANDA], ...LIENZO }));

    it("dos lecturas al MISMO instante, en cualquier orden: no se escribe nada (y la misma pareja con una hora de diferencia SÍ)", async () => {
      // Tres textos distintos según cuál llegara última: la de 3,0 («Daño consumado») o la de 4,8 («stinker»).
      for (const lecturas of [
        [{ occurredAt: t(10), value: 3.0 }, { occurredAt: t(10), value: 4.8 }],
        [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(10), value: 3.0 }],
      ]) {
        const html = await conLecturas(lecturas);
        expect(bloqueDeRiesgo(html), `${lecturas.map((l) => l.value).join(" y ")} al mismo instante`).toBeNull();
        expect(aTexto(html)).not.toContain("tu última lectura");
        expect(aTexto(html)).not.toContain("stinker");
        expect(aTexto(html)).not.toContain("Daño consumado");
      }
      // Control, con las MISMAS dos lecturas separadas una hora: sí se escribe, y cita la POSTERIOR.
      const despues4_8 = aTexto(bloqueDeRiesgo(await conLecturas([{ occurredAt: t(10), value: 3.0 }, { occurredAt: t(11), value: 4.8 }]))!);
      expect(despues4_8).toContain("stinker");
      expect(despues4_8).not.toContain("Daño consumado");
      const despues3_0 = aTexto(bloqueDeRiesgo(await conLecturas([{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(11), value: 3.0 }]))!);
      expect(despues3_0).toContain("Daño consumado");
      expect(despues3_0).not.toContain("stinker");
      // MUTACIÓN: `const ultima = curva.lecturas[curva.lecturas.length - 1]` (sin `ultimaLectura`) → cita la que quede al final y cae.
    });

    it("un empate que NO es el del instante máximo no impide citar: la última sigue siendo única", async () => {
      const html = await conLecturas([
        { occurredAt: t(8), value: 3.0 }, { occurredAt: t(8), value: 3.2 }, // empate entre las primeras
        { occurredAt: t(12), value: 4.8 },
      ]);
      const texto = aTexto(bloqueDeRiesgo(html)!);
      expect(texto).toContain("stinker");
      expect(texto).toContain("4.8");
      // MUTACIÓN: devolver `null` ante CUALQUIER empate de instante (no sólo el del máximo) → no pinta y cae.
    });
  });

  // **C3: una lectura que el motor de veredictos excluye se DIBUJA y no sostiene nada.**
  describe("la procedencia decide qué puede sostener una lectura, no si se dibuja", () => {
    // `PENDING_IMPLEMENTATIONS/021`, decisión de Daniel del 2026-10-02: «dibujarla marcada, y nunca
    // interpretarla». Dibujar el registro y usarlo como fundamento de una interpretación requieren
    // juicios distintos — el registro es autoritativo (§3 de `CLAUDE.md`), la interpretación no.
    //
    // **Las dos mitades hacen falta**, y por separado ninguna mide: «no cita» pasaría con una
    // pantalla que no pinta nada, y «dibuja el punto» pasaría con una que cita igual. El control
    // positivo de las dos es la MISMA cifra con instrumento verificado.
    const con = (confianza: "VALIDATED" | "REVISION_VENCIDA" | "UNCALIBRATED" | undefined, value: number) =>
      pintarCurva(curvaDeLote({ lecturas: [{ occurredAt: t(10), value: 4.0 }, { occurredAt: t(11), value, confianza }], objetivos: [BANDA], ...LIENZO }));

    it("instrumento que falló su contraste: el punto se pinta MARCADO, con su leyenda, y no cita nada", async () => {
      const html = await con("UNCALIBRATED", 3.0);
      // mitad 1 — no sostiene la cita, que en esta banda es «Daño consumado», de grado CRITICAL
      expect(bloqueDeRiesgo(html)).toBeNull();
      expect(aTexto(html)).not.toContain("Daño consumado");
      // mitad 2 — y el registro SÍ está en la pantalla, marcado y dicho
      expect(html).toContain("nn-curva-punto-sin-verificar");
      expect(aTexto(html)).toContain("Instrumento sin verificar");
      // MUTACIÓN: quitar `sostieneLaCita` del cálculo de `riesgo` en CurvaDeLote.tsx → cita y cae.
    });

    it("control positivo: la MISMA cifra con instrumento verificado sí cita, y sin marca", async () => {
      // Sin esta prueba, la de arriba pasaría con una pantalla que no pinta ningún bloque de riesgo.
      const html = await con("VALIDATED", 3.0);
      expect(aTexto(bloqueDeRiesgo(html)!)).toContain("Daño consumado");
      expect(html).not.toContain("nn-curva-punto-sin-verificar");
      expect(aTexto(html)).not.toContain("Instrumento sin verificar");
    });

    it("revisión vencida: sostiene la de grado WARNING y NO la CRITICAL — las dos direcciones", async () => {
      // La regla de Daniel del 2026-09-14, que `confianzaPorVerificacion` ya llevaba escrita:
      // «alimenta curvas y puede avisar. No confirma una crítica». Con una sola de las dos
      // direcciones, una compuerta que negara TODO a una revisión vencida pasaría igual.
      const critica = await con("REVISION_VENCIDA", 3.0); // `< 3.30` → CRITICAL
      expect(bloqueDeRiesgo(critica)).toBeNull();
      const aviso = await con("REVISION_VENCIDA", 3.6); // `[3.50, 3.80)` → WARNING
      expect(aTexto(bloqueDeRiesgo(aviso)!)).toContain("sobrefermentación");
      // Y no se marca: una revisión vencida no es un instrumento que falló.
      expect(aviso).not.toContain("nn-curva-punto-sin-verificar");
    });

    it("sin instrumento declarado NO degrada nada, y eso sostiene la pantalla de hoy", async () => {
      // `measurement.instrument_id` acaba de existir y nadie lo ha rellenado: si el hueco se tratara
      // como avería, esta pantalla quedaría muda en TODOS los lotes el día que se despliegue. Ese
      // defecto está nombrado en `desdeElLote.ts`; esta prueba es la que lo impide.
      const html = await con(undefined, 3.0);
      expect(aTexto(bloqueDeRiesgo(html)!)).toContain("Daño consumado");
      expect(html).not.toContain("nn-curva-punto-sin-verificar");
    });
  });

  describe("«ninguna frase ordena»: las frases de entrada son TEXTOS FIJOS, el resto del bloque un vocabulario cerrado, y lo pintado no lleva nada a mano", () => {
    // Tres capas, y el LÍMITE que queda escrito aquí porque un guardia cuyo alcance no está escrito se cuenta dos veces:
    //
    // 1. **Las cuatro frases de entrada** (`curvaRiesgoDice` y `curvaRiesgoDiceSiSeEstanca`, en es y en en) se comparan con su
    //    CADENA EXACTA. Son los dos textos que el plan define («el dato sugiere», nunca «lave ahora»), y cambiarlos tiene que ser
    //    deliberado: se edita `ENTRADAS`. Un vocabulario no basta ahí: «lleva» está en el léxico por «quien lleva el lote» y
    //    también es imperativo, así que «…, lleva el lote, el dato sugiere:» pasaba 99/99 (medido; la lista de palabras
    //    prohibidas de antes la derrotaba «retire el lote ya»). Medido que cae con la cadena exacta.
    // 2. **Las otras cuatro claves** (`Marca`, `DeDondeSale`, `Fuente`, `CitaLiteral`) sólo tienen un VOCABULARIO cerrado: una
    //    palabra nueva obliga a venir aquí y añadirla A PROPÓSITO (el precio de `DEUDA_CONOCIDA` en
    //    `claves-de-traduccion-existen.test.ts`). «lleva» sólo vale DENTRO de la frase fija «quien lleva el lote» (`FRASES_FIJAS`,
    //    que se quita antes de mirar palabras) y no está en el léxico: añadir «Lleva el lote.» a `curvaRiesgoFuente` cae
    //    (medido; con «lleva» en el léxico pasaba 99/99). **LÍMITE QUE QUEDA:** una orden armada sólo con las palabras que sí
    //    están (p. ej. «Cita la frase»: «cita» es nombre y verbo) pasa. Ninguna de ellas manda sobre el lote, pero es un
    //    límite de léxico, no de sentido: el sentido sólo lo cierra una cadena exacta, y por eso las frases de entrada lo son.
    //    **El ejemplo literal más claro: «Es una orden. No una orden»** pasa el vocabulario cerrado de `curvaRiesgoFuente` porque cada
    //    una de sus palabras («es», «una», «orden», «no») está permitida —son las de «no una orden»—, y dice lo contrario de lo que
    //    esa clave quiere decir. Medido y aceptado: el guardia mira palabras, no sentido.
    // 3. **Lo que se pinta** (es) debe ser EXACTAMENTE la composición de los mensajes más la cita, sin espacios que cuenten: texto
    //    escrito a mano en el componente, dentro del mismo <p> o del <details>, rompe la igualdad (era la brecha de «lleva el
    //    lote» a mano en el JSX). **LÍMITE:** sólo mira el bloque de riesgo, no el resto del componente, y sólo en castellano
    //    (el simulacro de `next-intl` de este archivo es el de `es.json`).
    const ENTRADAS = {
      es: {
        curvaRiesgoDice: "con tu última lectura (pH {ph}), el dato sugiere:",
        curvaRiesgoDiceSiSeEstanca: "si el pH se estanca donde está hoy (tu última lectura: {ph}), el dato sugiere:",
      },
      en: {
        curvaRiesgoDice: "with your latest reading (pH {ph}), the data suggests:",
        curvaRiesgoDiceSiSeEstanca: "if the pH stalls where it is today (your latest reading: {ph}), the data suggests:",
      },
    } as const;
    // El vocabulario de las OTRAS cuatro claves (las palabras de las frases de entrada ya no están: no hace falta que «sugiere» ni
    // «estanca» —que en castellano sirven de imperativo— valgan en ninguna otra parte; ni «lleva», que sólo vale en su frase fija).
    const VOCABULARIO = {
      es: new Set([
        "criterio", "de", "néctar", "nómada", "dónde", "sale", "banda", "la", "matriz", "ph", "es", "un", "no", "una", "orden",
        "decisión", "frase", "entre", "comillas", "cita", "literal", "del", "documento", "tal", "como", "está", "escrita",
        // «perfil»: `curvaRiesgoFuente` nombra el perfil de la matriz («…de la matriz de pH del perfil {perfil} de {documento}»). Es un nombre.
        "perfil",
        // `curvaRiesgoSinVerificar` («Instrumento sin verificar: se registra, no se interpreta.»), añadidas
        // A PROPÓSITO el 2026-10-06 con `PENDING_IMPLEMENTATIONS/021`. Redacción de Daniel.
        // **«registra» e «interpreta» sirven también de imperativo en castellano**, que es justo por lo
        // que «sugiere» y «estanca» NO están en este léxico. Se aceptan porque no mandan nada sobre el
        // lote: dicen qué hace el PROGRAMA con la lectura —la conserva y no la usa para afirmar—, que
        // es lo contrario de una orden al productor. Es el límite de léxico que la cabecera ya declara.
        "instrumento", "sin", "verificar", "se", "registra", "interpreta",
      ]),
      en: new Set([
        "néctar", "nómada", "criterion", "where", "this", "comes", "from", "band", "of", "the", "ph", "matrix", "in", "it", "is", "a",
        "not", "an", "order", "decision", "up", "to", "quoted", "phrase", "literal", "quote", "that", "document", "which", "written",
        "spanish", "and", "left", "untranslated",
        // «profile»: `curvaRiesgoFuente` nombra el perfil de la matriz («…of the {perfil} profile in {documento}»). Es un nombre.
        "profile",
        // `curvaRiesgoSinVerificar` («Unverified instrument: recorded, not interpreted.»), mismas razones.
        "unverified", "instrument", "recorded", "interpreted",
      ]),
    } as const;
    /** Frases enteras permitidas, que se quitan ANTES de mirar palabras: su verbo no vale suelto en ninguna otra parte. */
    const FRASES_FIJAS = { es: ["quien lleva el lote"], en: ["whoever runs the lot"] } as const;
    const CLAVES_DE_ENTRADA = ["curvaRiesgoDice", "curvaRiesgoDiceSiSeEstanca"] as const;
    /** Las palabras de `texto` que no están en el vocabulario (sin los `{marcadores}` ICU, ni números, ni signos). */
    const fueraDelVocabulario = (texto: string, idioma: "es" | "en") => {
      const sinFrasesFijas = FRASES_FIJAS[idioma].reduce((t, frase) => t.split(frase).join(" "), texto.replace(/\{[^}]*\}/g, " ").toLocaleLowerCase(idioma));
      return [...new Set(sinFrasesFijas.match(/\p{L}+/gu) ?? [])].filter((p) => !VOCABULARIO[idioma].has(p));
    };
    const leerMensajes = (f: string) => JSON.parse(readFileSync(new URL(`../../messages/${f}.json`, import.meta.url), "utf8")).SeccionBeneficio as Record<string, string>;
    /** Las claves `curvaRiesgo*` que el componente pide, DESCUBIERTAS en su fuente: una clave nueva entra sola al guardia. */
    const clavesDelBloque = () => {
      const src = readFileSync(new URL("../../app/components/beneficio/CurvaDeLote.tsx", import.meta.url), "utf8");
      return [...new Set([...src.matchAll(/\bt\(\s*"(curvaRiesgo\w*)"/g)].map((m) => m[1]!))].sort();
    };

    it("el detector de vocabulario marca lo que debe y deja pasar el texto de hoy (control)", () => {
      expect(fueraDelVocabulario("Lave ahora este lote", "es")).toEqual(["lave", "ahora", "este", "lote"]);
      expect(fueraDelVocabulario("remove the lot now", "en")).toEqual(["remove", "lot", "now"]);
      // Y el texto de hoy de las otras cuatro claves no marca nada: si el detector marcara lo bueno, el guardia enseñaría a ignorarlo.
      expect(fueraDelVocabulario(leerMensajes("es").curvaRiesgoFuente!, "es")).toEqual([]);
      // Y la frase fija es lo único que deja pasar a «lleva»: la misma palabra suelta, en una orden, SÍ se marca.
      expect(fueraDelVocabulario(`${leerMensajes("es").curvaRiesgoFuente!} Lleva el lote.`, "es")).toEqual(["lleva", "el", "lote"]);
      expect(fueraDelVocabulario(`${leerMensajes("en").curvaRiesgoFuente!} Run the lot.`, "en")).toEqual(["run", "lot"]);
    });

    it("las cuatro frases de entrada son EXACTAMENTE las que el plan define: «el dato sugiere», en los dos idiomas", () => {
      for (const idioma of ["es", "en"] as const) {
        const m = leerMensajes(idioma);
        for (const k of CLAVES_DE_ENTRADA) {
          expect(m[k], `${idioma}.${k}: cambiar esta frase es una decisión; se edita ENTRADAS a propósito`).toBe(ENTRADAS[idioma][k]);
        }
      }
      // MUTACIÓN: `curvaRiesgoDice` = «con tu última lectura (pH {ph}), el dato sugiere, lleva el lote:» (palabras del vocabulario) → cae.
      // MUTACIÓN: «… (pH {ph}), retire el lote ya; el dato sugiere:» → cae. En en.json, «…, remove the lot now; the data suggests:» → cae.
      // MUTACIÓN: la misma frase de entrada reordenada con las mismas palabras («el dato sugiere: con tu última lectura (pH {ph}),») → cae.
    });

    it("las otras cuatro claves, en los dos idiomas, sólo usan su vocabulario cerrado; y ninguna clave curvaRiesgo* queda sin vigilar", () => {
      const claves = clavesDelBloque();
      // Control: se descubrieron las seis. Un patrón que dejara de casar daría `[]` y «ninguna fuera del vocabulario» se leería como «todo bien».
      expect(claves).toEqual(["curvaRiesgoCitaLiteral", "curvaRiesgoDeDondeSale", "curvaRiesgoDice", "curvaRiesgoDiceSiSeEstanca", "curvaRiesgoFuente", "curvaRiesgoMarca", "curvaRiesgoSinVerificar"]);
      for (const idioma of ["es", "en"] as const) {
        const m = leerMensajes(idioma);
        // Y ninguna `curvaRiesgo*` de los mensajes queda sin vigilar porque el componente no la pida con `t("…")` literal.
        expect(Object.keys(m).filter((k) => k.startsWith("curvaRiesgo")).sort(), `${idioma}: claves de mensajes contra claves del componente`).toEqual(claves);
        for (const k of claves.filter((c) => !(CLAVES_DE_ENTRADA as readonly string[]).includes(c))) {
          expect(fueraDelVocabulario(m[k]!, idioma), `${idioma}.${k}: «${m[k]}»`).toEqual([]);
        }
        expect(m.curvaRiesgoFuente, `${idioma}.curvaRiesgoFuente`).toContain(idioma === "es" ? "no una orden" : "not an order");
      }
      // MUTACIÓN: añadir una palabra fuera del vocabulario a `curvaRiesgoFuente` («… retire el lote») → cae. Una clave `curvaRiesgoAviso` nueva en es.json → cae.
    });

    it("lo que se PINTA es exactamente la composición de los mensajes y la cita: nada escrito a mano dentro del bloque", async () => {
      const { getTranslations } = await import("next-intl/server");
      const tr = await getTranslations("SeccionBeneficio");
      const sinEspacios = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, "");
      for (const f of FILAS.filter((x) => x.pinta)) {
        const ph = f.valor.toFixed(1);
        const entrada = f.siSeEstanca ? tr("curvaRiesgoDiceSiSeEstanca", { ph }) : tr("curvaRiesgoDice", { ph });
        const esperado =
          tr("curvaRiesgoMarca") + ":" + entrada + "«" + f.cita + "»." +
          tr("curvaRiesgoDeDondeSale") + tr("curvaRiesgoFuente", { banda: f.banda!, perfil: "WASHED_STANDARD", documento: "docs/beneficio/10_ph_fermentation.md" }) + tr("curvaRiesgoCitaLiteral");
        const pintado = aTexto(sinLaGuiaDeDaniel(bloqueDeRiesgo(await conUnPh(f.valor))!));
        expect(sinEspacios(pintado), `pH ${f.valor}`).toBe(sinEspacios(esperado));
      }
      // Control: el comparador SÍ ve una palabra de más (si ignorara el texto sobrante, «igual» no diría nada).
      expect(sinEspacios("Criterio: con tu lectura lleva el lote")).not.toBe(sinEspacios("Criterio: con tu lectura"));
      // MUTACIÓN: « lleva el lote» a mano dentro del mismo <p> (fuera de `t(…)`) → cae. Un `<p>Retire el lote ya</p>` dentro del bloque → cae.
      // MUTACIÓN: texto a mano dentro del <details> → cae.
    });
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
    // **Y cerrado**: «la profundidad va detrás de un toque» es el paso 3 del plan y el antipatrón 3 de la rúbrica 22. Un
    // `<details open>` pasa todo lo de arriba —la fuente SIGUE dentro del `<details>`— y la deja a la vista sin tocar nada.
    const abierto = /<details[^>]*\bopen\b/;
    expect(bloque, "el <details> del bloque no lleva `open`").not.toMatch(abierto);
    // Control de la expresión: casa con lo que React escribe para `open` (`open=""`) y con la forma a secas, y NO con la clase de hoy.
    expect('<details class="nn-inline-disclosure" open="">').toMatch(abierto);
    expect("<details open>").toMatch(abierto);
    expect(detalle!).not.toMatch(abierto);
    // MUTACIÓN: sacar la fuente del <details> → «tres párrafos» a la vista, y cae.
    // MUTACIÓN: `<details className="nn-inline-disclosure" open>` → la fuente queda a la vista sin tocar nada, y cae.
  });

  it("es UNA frase a la vista: un solo <p> fuera del <details>", async () => {
    const bloque = bloqueDeRiesgo(await conUnPh(4.8))!;
    const aLaVista = sinLaGuiaDeDaniel(bloque).replace(/<details[\s\S]*<\/details>/, "");
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

/**
 * **El guardia de pantalla de `PENDING_IMPLEMENTATIONS/017`.** El defecto vivía en el artefacto que
 * mira el operario, no en una función: un objetivo `final` se pintaba como una franja sobre TODO el
 * recorrido y la frase contaba las lecturas intermedias como desviaciones. Con el pH bajando de 6,5
 * a 4,3 —que es el diseño de una fermentación— la pantalla decía «2 lecturas fuera del rango de la
 * receta» sobre un lote que va exactamente como debe.
 *
 * **Cada caso va con su control, y el control tiene que salir distinto.** Las mismas tres lecturas
 * con un objetivo `during` sí dan la franja ancha y sí cuentan dos fuera; si las dos columnas
 * coincidieran, esta prueba no mediría nada.
 */
describe("la curva en pantalla — un objetivo de un instante no se pinta como banda de todo el recorrido", () => {
  const BAJANDO = [
    { occurredAt: t(8), value: 6.5 },
    { occurredAt: t(12), value: 5.0 },
    { occurredAt: t(16), value: 4.3 },
  ];
  const META = { minValue: 4.0, maxValue: 4.6, targetValue: 4.3 } as const;
  const bandaDelHtml = (html: string) => {
    const r = /<rect[^>]*class="nn-curva-banda"[^>]*>/.exec(html)?.[0] ?? null;
    if (r === null) return null;
    const leer = (atr: string) => Number(new RegExp(`${atr}="([-0-9.]+)"`).exec(r)?.[1] ?? NaN);
    return { x: leer("x"), ancho: leer("width") };
  };
  const pintarCon = (momento: "initial" | "during" | "final") =>
    pintarCurva(curvaDeLote({ lecturas: BAJANDO, objetivos: [{ momento, ...META }], ...LIENZO }));

  it("con meta FINAL la banda es una marca en el borde derecho, no una franja de lado a lado", async () => {
    const b = bandaDelHtml(await pintarCon("final"));
    expect(b, "la marca se pinta").not.toBeNull();
    // Afirmar que NO son NaN antes de comparar: `NaN < x` es `false` y se leería como «cabe».
    expect(Number.isNaN(b!.x) || Number.isNaN(b!.ancho), "ni x ni ancho son NaN").toBe(false);
    expect(b!.ancho).toBe(ANCHO_DE_LA_MARCA);
    expect(b!.x).toBe(LIENZO.ancho - ANCHO_DE_LA_MARCA);
  });

  it("con meta INICIAL la marca va en el borde izquierdo", async () => {
    const b = bandaDelHtml(await pintarCon("initial"));
    expect(Number.isNaN(b!.x) || Number.isNaN(b!.ancho)).toBe(false);
    expect(b!.ancho).toBe(ANCHO_DE_LA_MARCA);
    expect(b!.x).toBe(0);
  });

  it("CONTROL: con meta `during` la banda SÍ cruza el lienzo entero", async () => {
    const b = bandaDelHtml(await pintarCon("during"));
    expect(Number.isNaN(b!.x) || Number.isNaN(b!.ancho)).toBe(false);
    expect(b!.ancho).toBe(LIENZO.ancho);
    expect(b!.x).toBe(0);
    // Y el control del control: la franja ancha y la marca NO miden lo mismo, o las tres pruebas
    // de arriba pasarían con cualquier implementación.
    expect(LIENZO.ancho).not.toBe(ANCHO_DE_LA_MARCA);
  });

  it("con meta FINAL la pantalla NO llama desviación a las lecturas intermedias", async () => {
    const texto = aTexto(await pintarCon("final"));
    expect(texto).not.toContain("lecturas fuera del rango de la receta");
    expect(texto).toContain("La última lectura está dentro del rango que la receta pide al final");
    // Y dice a qué alcanzó el juicio, también en la descripción accesible del SVG.
    expect(texto).toContain("sólo se juzga la lectura final");
  });

  it("CONTROL: las MISMAS lecturas con meta `during` sí se cuentan como dos desviaciones", async () => {
    const texto = aTexto(await pintarCon("during"));
    expect(texto).toContain("2 lecturas fuera del rango de la receta");
    expect(texto).not.toContain("sólo se juzga la lectura final");
  });

  it("dos objetivos de instantes distintos y ninguno de trayectoria: no se elige, y se dice", async () => {
    const html = await pintarCurva(
      curvaDeLote({
        lecturas: BAJANDO,
        objetivos: [
          { momento: "initial", minValue: 5.8, maxValue: 6.8, targetValue: 6.3 },
          { momento: "final", ...META },
        ],
        ...LIENZO,
      }),
    );
    // Ninguna banda dibujada —no se elige por el operario— y el motivo dicho, que NO es «la receta
    // no declara rango»: eso sería falso, declara dos.
    expect(html).not.toContain("nn-curva-banda");
    expect(aTexto(html)).toContain("declara dos objetivos para esta variable en esta fase");
    expect(aTexto(html)).not.toContain("no tiene rango declarado en la receta");
  });
});

/**
 * **El mapa de unidades no tenía NINGUNA prueba de render**, y `loteNoVisible` habría sido un campo
 * que la API expone y el operario no lee nunca. Es el defecto que Codex encontró el 2026-10-01 en la
 * curva —«la promesa llegaba hasta la API y no hasta el productor»— y la forma de no repetirlo es
 * que el guardia **renderice** y exija el texto en el HTML.
 */
describe("el mapa de unidades — una unidad ocupada por un lote que no ves lo dice en palabras", () => {
  const celda = (over: Partial<CeldaDelMapa> = {}): CeldaDelMapa => ({
    id: "u1",
    nombre: "Tanque 1",
    libreYSano: false,
    motivos: ["EN_USO"],
    loteNoVisible: false,
    ...over,
  });
  const pintar = async (celdas: readonly CeldaDelMapa[]) =>
    aTexto(renderToStaticMarkup(await MapaDeUnidades({ tanques: celdas, camas: [] })));

  it("lo dice, además del motivo y no en su lugar", async () => {
    const texto = await pintar([celda({ loteNoVisible: true })]);
    expect(texto).toContain("ocupada por un lote que no ves");
    // `EN_USO` sigue estando: es verdad y es el motivo. Lo otro explica por qué no lo encontrará.
    expect(texto).toContain("en uso");
  });

  it("CONTROL: la MISMA celda sin la bandera no lo dice, y sigue diciendo el motivo", async () => {
    const texto = await pintar([celda({ loteNoVisible: false })]);
    expect(texto).not.toContain("ocupada por un lote que no ves");
    expect(texto).toContain("en uso");
  });

  it("una unidad libre y sana no lo dice tampoco", async () => {
    const texto = await pintar([celda({ libreYSano: true, motivos: [], loteNoVisible: false })]);
    expect(texto).toContain("libre y sana");
    expect(texto).not.toContain("ocupada por un lote que no ves");
  });

  it("y con dos unidades sólo lo lleva la que toca", async () => {
    const texto = await pintar([
      celda({ id: "a", nombre: "Tanque A", loteNoVisible: true }),
      celda({ id: "b", nombre: "Tanque B", loteNoVisible: false }),
    ]);
    // Una sola aparición: si el componente lo pintara en todas, saldrían dos.
    expect(texto.match(/ocupada por un lote que no ves/g) ?? []).toHaveLength(1);
  });
});

/**
 * **«No se pudo resolver la receta» tiene que PINTARSE, y no es «no declara rango»**
 * (`PENDING_IMPLEMENTATIONS/019`).
 *
 * Este guardia existe por lo que pasó con el mensaje de «varios objetivos» del 017: estaba
 * escrito, era correcto, y **no se pintaba nunca** porque `sin_banda` cortaba la cadena de
 * ternarios antes de llegar a él. Lo cazó una prueba de pantalla, no una lectura del código.
 * El caso nuevo entra por la misma puerta —`juicio.tipo === "sin_banda"`— así que corre el
 * mismo riesgo y necesita el mismo guardia.
 *
 * El flip-test que le toca: mover la rama de `receta_no_resuelta` DEBAJO de `sin_banda` en
 * `CurvaDeLote.tsx` tiene que hacer caer la primera prueba de aquí.
 */
describe("la curva en pantalla — sin receta resuelta no se afirma nada SOBRE la receta (019)", () => {
  const SIN_RECETA = curvaDeLote({
    lecturas: [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(12), value: 4.4 }],
    objetivos: [], recetaResuelta: false, ...LIENZO,
  });
  const RECETA_SIN_RANGO = curvaDeLote({
    lecturas: [{ occurredAt: t(8), value: 4.3 }, { occurredAt: t(12), value: 4.4 }],
    objetivos: [], recetaResuelta: true, ...LIENZO,
  });

  it("dice que no se pudo resolver, y NO dice que la receta no declara rango", async () => {
    const texto = aTexto(await pintarCurva(SIN_RECETA));
    expect(texto).toContain("No se pudo saber qué receta aplica");
    expect(texto).not.toContain("no tiene rango declarado en la receta");
  });

  // **El control que TIENE que salir distinto.** Las dos curvas llevan la MISMA lista vacía de
  // objetivos y las mismas lecturas: lo único que cambia es si la receta se resolvió. Si las dos
  // pintaran lo mismo, la prueba de arriba pasaría con el defecto puesto.
  it("CONTROL: la MISMA lista vacía con la receta resuelta sí dice que no declara rango", async () => {
    const texto = aTexto(await pintarCurva(RECETA_SIN_RANGO));
    expect(texto).toContain("no tiene rango declarado en la receta");
    expect(texto).not.toContain("No se pudo saber qué receta aplica");
  });

  it("los puntos se siguen dibujando: «sin banda» no es «no dibujé nada»", async () => {
    const html = await pintarCurva(SIN_RECETA);
    expect(marcas(html)).toHaveLength(2);
  });

  // El rótulo accesible del `<desc>` también tiene que decirlo: un lector de pantalla no ve el
  // párrafo de abajo si el `<desc>` ya afirmó otra cosa.
  it("el rótulo accesible lo dice igual, y con la frase corta que le toca", async () => {
    // El `<desc>` lleva `id`, así que el patrón no puede ser `<desc>` a secas.
    const desc = /<desc[^>]*>([\s\S]*?)<\/desc>/.exec(await pintarCurva(SIN_RECETA))![1]!;
    expect(desc).toContain("no se pudo resolver qué receta aplica");
    expect(desc).not.toContain("sin rango declarado en la receta");
  });
});
