/**
 * La curva de un lote contra su banda: la banda sale de un dato, la Y crece hacia abajo, y una
 * sola lectura no produce `NaN`.
 *
 * Los números están hechos a mano para que un error de escala se vea. `NaN` comparado con lo que
 * sea da `false`, así que las pruebas de degenerados afirman sobre `Number.isNaN` ANTES de
 * comparar, y luego sobre el valor exacto.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { curvaDeLote, ultimaLectura } from "../../lib/beneficio/curvaDeLote";

const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
const BANDA = { minValue: 4.0, maxValue: 5.0, targetValue: 4.5 };

describe("curvaDeLote", () => {
  it("sin ProcessTarget no hay banda, y lo dice", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.2 }],
      objetivo: null, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    // Control: los puntos SÍ se dibujan. Sin él, «sin banda» podría ser «no dibujé nada».
    expect(c.puntos).toHaveLength(2);
  });

  it("un objetivo sin min ni max no dibuja banda: media banda es una banda inventada", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: { minValue: null, maxValue: null, targetValue: 4.5 },
      ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("con sólo uno de los dos extremos tampoco hay banda", () => {
    const soloMin = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: { minValue: 4.0, maxValue: null, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    const soloMax = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: { minValue: null, maxValue: 5.0, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    expect(soloMin.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    expect(soloMax.banda).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("escala el tiempo al ancho y el valor al alto, con el eje Y al derecho", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.0 }, { occurredAt: t(14), value: 4.0 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: 0 });     // la primera lectura, valor máximo → arriba
    expect(c.puntos[1]).toEqual({ x: 300, y: 120 }); // la última, valor mínimo → abajo
    // El lienzo se devuelve tal cual: el `<svg>` los usa para su `viewBox`. Distintos a propósito.
    expect(c.ancho).toBe(300);
    expect(c.alto).toBe(120);
    // En SVG la Y crece hacia ABAJO. Si esta prueba no existiera, la curva saldría del revés
    // y seguiría pareciendo una curva.
  });

  it("un valor a mitad de la banda y de la hora cae en el centro, y las tres escalas son lineales", () => {
    const c = curvaDeLote({
      lecturas: [
        { occurredAt: t(10), value: 4.75 },
        { occurredAt: t(11), value: 4.5 },  // 1 h de 4: x = 75
        { occurredAt: t(14), value: 4.0 },
      ],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: 30 });   // 4,75 → un cuarto desde arriba
    expect(c.puntos[1]).toEqual({ x: 75, y: 60 });  // la hora 11 NO es la mitad del tiempo
    expect(c.puntos[2]).toEqual({ x: 300, y: 120 });
  });

  it("la banda y el objetivo salen en coordenadas de valor: máximo arriba, mínimo abajo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.5 }],
      objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: 4.25 }, ancho: 300, alto: 120,
    });
    // El objetivo 4,25 está a un cuarto del mínimo: 120 - 30 = 90.
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: 90 });
  });

  it("una banda sin targetValue no inventa objetivo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }],
      objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: null }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: null });
  });

  it("el orden de llegada de las lecturas no cambia la curva", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(14), value: 4.0 }, { occurredAt: t(10), value: 5.0 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos).toEqual([{ x: 0, y: 0 }, { x: 300, y: 120 }]);
  });

  it("una lectura fuera de la banda queda fuera del lienzo, sin recortar", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.5 }, { occurredAt: t(14), value: 3.5 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: -60 });
    expect(c.puntos[1]).toEqual({ x: 300, y: 180 });
  });

  it("sin banda, el eje Y escala al mínimo y máximo de los propios datos", () => {
    // Ni el mínimo (4,0) ni el máximo (5,0) son la primera ni la última lectura: si lo fueran,
    // una escala tomada del primer o del último valor daría lo mismo y la prueba no la vería.
    const c = curvaDeLote({
      lecturas: [
        { occurredAt: t(10), value: 4.5 },
        { occurredAt: t(12), value: 5.0 },  // máximo de los datos
        { occurredAt: t(13), value: 4.0 },  // mínimo de los datos
        { occurredAt: t(14), value: 4.25 },
      ],
      objetivo: null, ancho: 300, alto: 120,
    });
    expect(c.puntos).toEqual([
      { x: 0, y: 60 },
      { x: 150, y: 0 },    // máximo → arriba
      { x: 225, y: 120 },  // mínimo → abajo
      { x: 300, y: 90 },
    ]);
  });

  it("un cero es un valor legítimo de receta, no un hueco: la banda con minValue 0 se dibuja", () => {
    // Humedad o Brix pueden empezar en 0. Un `||` en vez de `??` leería ese 0 como «ausente» y
    // haría desaparecer la banda, que es justo la banda perdida que el diseño prohíbe.
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 6 }, { occurredAt: t(14), value: 0 }],
      objetivo: { minValue: 0, maxValue: 12, targetValue: 0 }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: 120 });
    expect(c.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 120 }]);
  });

  it("un maxValue 0 también es un valor: la banda de −4 a 0 se dibuja", () => {
    // El gemelo del cero de arriba, del otro extremo: sin él, un `||` sólo en `maxValue`
    // sobrevive, porque la prueba anterior tiene un máximo de 12.
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: -1 }, { occurredAt: t(14), value: -3 }],
      objetivo: { minValue: -4, maxValue: 0, targetValue: -2 }, ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", yMin: 120, yMax: 0, yObjetivo: 60 });
    expect(c.puntos).toEqual([{ x: 0, y: 30 }, { x: 300, y: 90 }]);
  });

  it("una sola lectura no produce NaN", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    // Afirmar que NO es NaN ANTES de comparar: `NaN > x` es false y halaga cualquier hipótesis.
    expect(Number.isNaN(c.puntos[0]!.x)).toBe(false);
    expect(Number.isNaN(c.puntos[0]!.y)).toBe(false);
    // Media anchura: no hay recorrido que lo ponga en un extremo. 4,5 es el centro de la banda.
    expect(c.puntos[0]).toEqual({ x: 150, y: 60 });
  });

  it("una sola lectura sin banda va a media altura, no a NaN ni a un extremo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivo: null, ancho: 300, alto: 120,
    });
    expect(Number.isNaN(c.puntos[0]!.x)).toBe(false);
    expect(Number.isNaN(c.puntos[0]!.y)).toBe(false);
    expect(c.puntos[0]).toEqual({ x: 150, y: 60 });
  });

  it("todas las lecturas iguales, sin banda, van a media altura y se reparten en el tiempo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.8 }],
      objetivo: null, ancho: 300, alto: 120,
    });
    for (const p of c.puntos) {
      expect(Number.isNaN(p.x)).toBe(false);
      expect(Number.isNaN(p.y)).toBe(false);
    }
    expect(c.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 60 }]);
  });

  it("dos lecturas a la misma hora no dividen entre cero en la X", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.0 }, { occurredAt: t(10), value: 4.0 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.puntos.map((p) => Number.isNaN(p.x))).toEqual([false, false]);
    expect(c.puntos).toEqual([{ x: 150, y: 0 }, { x: 150, y: 120 }]);
  });

  it("una banda de ancho cero (min = max) no produce NaN ni dibuja banda", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.7 }],
      objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    // Como `banda_al_reves`: sin banda que dibujar. Una banda a media altura sería una banda en un
    // sitio que ya no corresponde al valor 4,5 (los puntos se escalan contra sus datos).
    expect(c.banda).toEqual({ tipo: "banda_de_ancho_cero" });
    expect(c.puntos.map((p) => Number.isNaN(p.y))).toEqual([false, false]);
  });

  it("con la banda de ancho cero una serie que varía NO sale plana: se escala contra sus datos (hallazgo de Codex)", () => {
    // Antes `escalaY` mandaba TODO valor a media altura con `max === min` y la serie 4,5 → 4,9 → 4,7
    // salía como una recta en y = 60: «nada cambió», contradiciendo el aviso de la propia pantalla.
    const lecturas = [
      { occurredAt: t(10), value: 4.5 },
      { occurredAt: t(12), value: 4.9 },
      { occurredAt: t(14), value: 4.7 },
    ];
    const c = curvaDeLote({
      lecturas, objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    // Coordenadas a mano, escala 4,5–4,9 (los propios datos): 4,5 abajo (120), 4,9 arriba (0), 4,7 al medio (60).
    expect(c.puntos).toEqual([{ x: 0, y: 120 }, { x: 150, y: 0 }, { x: 300, y: 60 }]);
    // Es exactamente lo que sale SIN objetivo: la geometría es la del camino «sin banda».
    const sinBanda = curvaDeLote({ lecturas, objetivo: null, ancho: 300, alto: 120 });
    expect(c.puntos).toEqual(sinBanda.puntos);
    // Control: con ancho cero y lecturas TODAS iguales sí va a media altura (rango de datos cero), y no es NaN.
    const iguales = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.5 }],
      objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: null }, ancho: 300, alto: 120,
    });
    expect(iguales.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 60 }]);
    // MUTACIÓN: en `curvaDeLote`, `hayBanda = minValue !== null && maxValue !== null && !alReves` (sin
    // `&& !anchoCero`) → la serie vuelve a salir en y = 60 y cae esta prueba.
  });

  it("con la banda de ancho cero, dos lecturas a la misma hora con valores distintos NO se superponen", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(10), value: 9.9 }],
      objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }, ancho: 300, alto: 120,
    });
    // Misma X (150, media anchura), Y distintas: 4,5 abajo y 9,9 arriba. Con la mutación caían las dos en (150, 60).
    expect(c.puntos).toEqual([{ x: 150, y: 120 }, { x: 150, y: 0 }]);
    expect(c.puntos[0]!.y).not.toBe(c.puntos[1]!.y);
    // MUTACIÓN: la misma de arriba (`hayBanda` sin `&& !anchoCero`) → las dos en (150, 60) y cae.
  });

  it("sin lecturas devuelve una curva vacía, no un error", () => {
    const c = curvaDeLote({ lecturas: [], objetivo: BANDA, ancho: 300, alto: 120 });
    expect(c.puntos).toEqual([]);
    expect(c.banda.tipo).toBe("banda");
    expect(c.ancho).toBe(300);
    expect(c.alto).toBe(120);
  });

  it("una receta al revés (min > max) no dibuja banda y NO espeja los puntos (hallazgo 2)", () => {
    // Medido: con la receta al revés la banda salía IDÉNTICA a la correcta (yMin=alto, yMax=0) y lo
    // que se invertía eran los puntos. Un pH de 4,9 sobrefermentado se pintaba ABAJO.
    const lecturas = [
      { occurredAt: t(8), value: 4.2 },
      { occurredAt: t(12), value: 4.9 },
      { occurredAt: t(16), value: 4.0 },
    ];
    const alReves = curvaDeLote({
      lecturas, objetivo: { minValue: 5.0, maxValue: 4.0, targetValue: 4.5 }, ancho: 480, alto: 200,
    });
    expect(alReves.banda).toEqual({ tipo: "banda_al_reves" });
    // Los puntos se escalan contra sus propios datos (4,0–4,9), como sin banda: «hacia arriba, el
    // valor más alto» vuelve a ser cierto. El 4,9 queda ARRIBA (y=0) y el 4,0 ABAJO (y=alto).
    const sinBanda = curvaDeLote({ lecturas, objetivo: null, ancho: 480, alto: 200 });
    expect(alReves.puntos).toEqual(sinBanda.puntos);
    expect(alReves.puntos[1]).toEqual({ x: 240, y: 0 });
    expect(alReves.puntos[2]).toEqual({ x: 480, y: 200 });
    // Control: la receta bien puesta SÍ dibuja banda (si no, `banda_al_reves` podría salir siempre).
    const bien = curvaDeLote({
      lecturas, objetivo: { minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }, ancho: 480, alto: 200,
    });
    expect(bien.banda.tipo).toBe("banda");
  });
});

describe("curvaDeLote — lo que devuelve para quien rotula (los ejes y el riesgo de esperar)", () => {
  // La pantalla recibe una `Curva` y NADA más: los puntos son coordenadas, y la banda son las
  // coordenadas `0` y `alto` de siempre. De ahí no se recupera a qué pH está la banda ni cuál fue
  // la última lectura, que es lo que piden los ejes (`ejesDeLaCurva`) y el riesgo (`riesgoDeEsperar`).
  // Por eso la curva trae también, tal cual, lo que ya tenía en la mano.

  it("trae las lecturas por hora —aunque lleguen desordenadas—, con su valor", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(14), value: 4.2 }, { occurredAt: t(10), value: 4.8 }, { occurredAt: t(12), value: 4.5 }],
      objetivo: BANDA, ancho: 300, alto: 120,
    });
    expect(c.lecturas.map((l) => l.value)).toEqual([4.8, 4.5, 4.2]);
    expect(c.lecturas.map((l) => l.occurredAt.getTime())).toEqual([t(10).getTime(), t(12).getTime(), t(14).getTime()]);
    // Control: son las MISMAS lecturas de las que salieron los puntos (tantas como puntos).
    expect(c.lecturas).toHaveLength(c.puntos.length);
  });

  it("trae el rango que declaró la receta, tal cual; `null` si falta un extremo", () => {
    const lecturas = [{ occurredAt: t(10), value: 4.8 }];
    expect(curvaDeLote({ lecturas, objetivo: BANDA, ancho: 300, alto: 120 }).rango).toEqual({ min: 4.0, max: 5.0 });
    // Sin objetivo, o con un extremo vacío, no hay rango: ni se inventa uno ni se completa con el otro extremo.
    expect(curvaDeLote({ lecturas, objetivo: null, ancho: 300, alto: 120 }).rango).toBeNull();
    expect(
      curvaDeLote({ lecturas, objetivo: { minValue: 4.0, maxValue: null, targetValue: 4.5 }, ancho: 300, alto: 120 }).rango,
    ).toBeNull();
    expect(
      curvaDeLote({ lecturas, objetivo: { minValue: null, maxValue: 5.0, targetValue: 4.5 }, ancho: 300, alto: 120 }).rango,
    ).toBeNull();
  });

  it("el rango al revés o de ancho cero se devuelve IGUAL: quien rotula decide, no esta función", () => {
    // `banda` ya dice «no se dibuja»; `rango` es el dato declarado. Esconderlo aquí obligaría a quien
    // rotula a adivinar si «sin rango» significa «la receta no lo declara» o «la receta lo declaró mal».
    const lecturas = [{ occurredAt: t(10), value: 4.8 }];
    const alReves = curvaDeLote({ lecturas, objetivo: { minValue: 5.0, maxValue: 4.0, targetValue: 4.5 }, ancho: 300, alto: 120 });
    expect(alReves.banda).toEqual({ tipo: "banda_al_reves" });
    expect(alReves.rango).toEqual({ min: 5.0, max: 4.0 });
    const ceroAncho = curvaDeLote({ lecturas, objetivo: { minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }, ancho: 300, alto: 120 });
    expect(ceroAncho.banda).toEqual({ tipo: "banda_de_ancho_cero" });
    expect(ceroAncho.rango).toEqual({ min: 4.5, max: 4.5 });
  });

  it("sin lecturas no hay lecturas, y el rango se conserva", () => {
    const c = curvaDeLote({ lecturas: [], objetivo: BANDA, ancho: 300, alto: 120 });
    expect(c.lecturas).toEqual([]);
    expect(c.rango).toEqual({ min: 4.0, max: 5.0 });
  });
});

describe("ultimaLectura — con varias en el instante máximo NO hay «última»", () => {
  // El orden entre lecturas del mismo instante es el que devolvió la base: arbitrario y no estable. Elegir una sería
  // presentar una lectura cualquiera como «tu última». Sin desempate inventado: ni por valor, ni por id, ni por nota.
  it("una sola en el instante máximo es la última, venga en el orden que venga", () => {
    const a = { occurredAt: t(8), value: 6.0 };
    const b = { occurredAt: t(12), value: 4.8 };
    expect(ultimaLectura([a, b])).toBe(b);
    expect(ultimaLectura([b, a])).toBe(b);
  });

  it("dos en el mismo instante máximo, en cualquier orden y con cualquier valor: null", () => {
    const x = { occurredAt: t(10), value: 3.0 };
    const y = { occurredAt: t(10), value: 4.8 };
    expect(ultimaLectura([x, y])).toBeNull();
    expect(ultimaLectura([y, x])).toBeNull();
    // Ni siquiera con el mismo valor: tampoco hay UNA, y no se inventa un desempate.
    expect(ultimaLectura([{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(10), value: 4.8 }])).toBeNull();
    // Todas las lecturas de un lote en el mismo instante (7 de 10 lotes de la base local): null, no la primera ni la de recepción.
    expect(ultimaLectura([6.0, 5.4, 5.0, 4.6].map((value) => ({ occurredAt: t(9), value })))).toBeNull();
  });

  it("un empate que no es el del máximo no cuenta; y con el máximo una hora después, sí hay última", () => {
    const tardia = { occurredAt: t(12), value: 4.8 };
    expect(ultimaLectura([{ occurredAt: t(8), value: 3.0 }, { occurredAt: t(8), value: 3.2 }, tardia])).toBe(tardia);
    // Control de la pareja de arriba: las MISMAS dos lecturas con una hora de diferencia sí tienen última, y es la posterior.
    const posterior = { occurredAt: t(11), value: 4.8 };
    expect(ultimaLectura([{ occurredAt: t(10), value: 3.0 }, posterior])).toBe(posterior);
  });

  it("sin lecturas no hay última; y un instante que no es un número tampoco la tiene", () => {
    expect(ultimaLectura([])).toBeNull();
    // `NaN` compara falso con todo: sin una decisión explícita «la última» saldría por casualidad.
    expect(ultimaLectura([{ occurredAt: new Date("no es una fecha"), value: 4.8 }])).toBeNull();
    expect(ultimaLectura([{ occurredAt: t(8), value: 3.0 }, { occurredAt: new Date("no es una fecha"), value: 4.8 }])).toBeNull();
  });
});
