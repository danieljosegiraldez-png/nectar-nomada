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
import { curvaDeLote, elegirObjetivo, indiceDeLaUnicaEnElExtremo, ultimaLectura } from "../../lib/beneficio/curvaDeLote";

const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
const BANDA = { momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: 4.5 } as const;

describe("curvaDeLote", () => {
  it("sin ProcessTarget no hay banda, y lo dice", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.2 }],
      objetivos: [], ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    // Control: los puntos SÍ se dibujan. Sin él, «sin banda» podría ser «no dibujé nada».
    expect(c.puntos).toHaveLength(2);
  });

  it("un objetivo sin min ni max no dibuja banda: media banda es una banda inventada", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivos: [{ momento: "during", minValue: null, maxValue: null, targetValue: 4.5 }],
      ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("con sólo uno de los dos extremos tampoco hay banda", () => {
    const soloMin = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivos: [{ momento: "during", minValue: 4.0, maxValue: null, targetValue: 4.5 }], ancho: 300, alto: 120,
    });
    const soloMax = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }],
      objetivos: [{ momento: "during", minValue: null, maxValue: 5.0, targetValue: 4.5 }], ancho: 300, alto: 120,
    });
    expect(soloMin.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    expect(soloMax.banda).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("escala el tiempo al ancho y el valor al alto, con el eje Y al derecho", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.0 }, { occurredAt: t(14), value: 4.0 }],
      objetivos: [BANDA], ancho: 300, alto: 120,
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
      objetivos: [BANDA], ancho: 300, alto: 120,
    });
    expect(c.puntos[0]).toEqual({ x: 0, y: 30 });   // 4,75 → un cuarto desde arriba
    expect(c.puntos[1]).toEqual({ x: 75, y: 60 });  // la hora 11 NO es la mitad del tiempo
    expect(c.puntos[2]).toEqual({ x: 300, y: 120 });
  });

  it("la banda y el objetivo salen en coordenadas de valor: máximo arriba, mínimo abajo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.5 }],
      objetivos: [{ momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: 4.25 }], ancho: 300, alto: 120,
    });
    // El objetivo 4,25 está a un cuarto del mínimo: 120 - 30 = 90.
    expect(c.banda).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 120, yMax: 0, yObjetivo: 90 });
  });

  it("una banda sin targetValue no inventa objetivo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }],
      objetivos: [{ momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: null }], ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 120, yMax: 0, yObjetivo: null });
  });

  it("el orden de llegada de las lecturas no cambia la curva", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(14), value: 4.0 }, { occurredAt: t(10), value: 5.0 }],
      objetivos: [BANDA], ancho: 300, alto: 120,
    });
    expect(c.puntos).toEqual([{ x: 0, y: 0 }, { x: 300, y: 120 }]);
  });

  it("una lectura fuera de la banda queda fuera del lienzo, sin recortar", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 5.5 }, { occurredAt: t(14), value: 3.5 }],
      objetivos: [BANDA], ancho: 300, alto: 120,
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
      objetivos: [], ancho: 300, alto: 120,
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
      objetivos: [{ momento: "during", minValue: 0, maxValue: 12, targetValue: 0 }], ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 120, yMax: 0, yObjetivo: 120 });
    expect(c.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 120 }]);
  });

  it("un maxValue 0 también es un valor: la banda de −4 a 0 se dibuja", () => {
    // El gemelo del cero de arriba, del otro extremo: sin él, un `||` sólo en `maxValue`
    // sobrevive, porque la prueba anterior tiene un máximo de 12.
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: -1 }, { occurredAt: t(14), value: -3 }],
      objetivos: [{ momento: "during", minValue: -4, maxValue: 0, targetValue: -2 }], ancho: 300, alto: 120,
    });
    expect(c.banda).toEqual({ tipo: "banda", alcance: "trayectoria", yMin: 120, yMax: 0, yObjetivo: 60 });
    expect(c.puntos).toEqual([{ x: 0, y: 30 }, { x: 300, y: 90 }]);
  });

  it("una sola lectura no produce NaN", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }],
      objetivos: [BANDA], ancho: 300, alto: 120,
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
      objetivos: [], ancho: 300, alto: 120,
    });
    expect(Number.isNaN(c.puntos[0]!.x)).toBe(false);
    expect(Number.isNaN(c.puntos[0]!.y)).toBe(false);
    expect(c.puntos[0]).toEqual({ x: 150, y: 60 });
  });

  it("todas las lecturas iguales, sin banda, van a media altura y se reparten en el tiempo", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.8 }],
      objetivos: [], ancho: 300, alto: 120,
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
      objetivos: [BANDA], ancho: 300, alto: 120,
    });
    expect(c.puntos.map((p) => Number.isNaN(p.x))).toEqual([false, false]);
    expect(c.puntos).toEqual([{ x: 150, y: 0 }, { x: 150, y: 120 }]);
  });

  it("una banda de ancho cero (min = max) no produce NaN ni dibuja banda", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.7 }],
      objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }], ancho: 300, alto: 120,
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
      lecturas, objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }], ancho: 300, alto: 120,
    });
    // Coordenadas a mano, escala 4,5–4,9 (los propios datos): 4,5 abajo (120), 4,9 arriba (0), 4,7 al medio (60).
    expect(c.puntos).toEqual([{ x: 0, y: 120 }, { x: 150, y: 0 }, { x: 300, y: 60 }]);
    // Es exactamente lo que sale SIN objetivo: la geometría es la del camino «sin banda».
    const sinBanda = curvaDeLote({ lecturas, objetivos: [], ancho: 300, alto: 120 });
    expect(c.puntos).toEqual(sinBanda.puntos);
    // Control: con ancho cero y lecturas TODAS iguales sí va a media altura (rango de datos cero), y no es NaN.
    const iguales = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(14), value: 4.5 }],
      objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: null }], ancho: 300, alto: 120,
    });
    expect(iguales.puntos).toEqual([{ x: 0, y: 60 }, { x: 300, y: 60 }]);
    // MUTACIÓN: en `curvaDeLote`, `hayBanda = minValue !== null && maxValue !== null && !alReves` (sin
    // `&& !anchoCero`) → la serie vuelve a salir en y = 60 y cae esta prueba.
  });

  it("con la banda de ancho cero, dos lecturas a la misma hora con valores distintos NO se superponen", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.5 }, { occurredAt: t(10), value: 9.9 }],
      objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }], ancho: 300, alto: 120,
    });
    // Misma X (150, media anchura), Y distintas: 4,5 abajo y 9,9 arriba. Con la mutación caían las dos en (150, 60).
    expect(c.puntos).toEqual([{ x: 150, y: 120 }, { x: 150, y: 0 }]);
    expect(c.puntos[0]!.y).not.toBe(c.puntos[1]!.y);
    // MUTACIÓN: la misma de arriba (`hayBanda` sin `&& !anchoCero`) → las dos en (150, 60) y cae.
  });

  it("sin lecturas devuelve una curva vacía, no un error", () => {
    const c = curvaDeLote({ lecturas: [], objetivos: [BANDA], ancho: 300, alto: 120 });
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
      lecturas, objetivos: [{ momento: "during", minValue: 5.0, maxValue: 4.0, targetValue: 4.5 }], ancho: 480, alto: 200,
    });
    expect(alReves.banda).toEqual({ tipo: "banda_al_reves" });
    // Los puntos se escalan contra sus propios datos (4,0–4,9), como sin banda: «hacia arriba, el
    // valor más alto» vuelve a ser cierto. El 4,9 queda ARRIBA (y=0) y el 4,0 ABAJO (y=alto).
    const sinBanda = curvaDeLote({ lecturas, objetivos: [], ancho: 480, alto: 200 });
    expect(alReves.puntos).toEqual(sinBanda.puntos);
    expect(alReves.puntos[1]).toEqual({ x: 240, y: 0 });
    expect(alReves.puntos[2]).toEqual({ x: 480, y: 200 });
    // Control: la receta bien puesta SÍ dibuja banda (si no, `banda_al_reves` podría salir siempre).
    const bien = curvaDeLote({
      lecturas, objetivos: [{ momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }], ancho: 480, alto: 200,
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
      objetivos: [BANDA], ancho: 300, alto: 120,
    });
    expect(c.lecturas.map((l) => l.value)).toEqual([4.8, 4.5, 4.2]);
    expect(c.lecturas.map((l) => l.occurredAt.getTime())).toEqual([t(10).getTime(), t(12).getTime(), t(14).getTime()]);
    // Control: son las MISMAS lecturas de las que salieron los puntos (tantas como puntos).
    expect(c.lecturas).toHaveLength(c.puntos.length);
  });

  it("trae el rango que declaró la receta, tal cual; `null` si falta un extremo", () => {
    const lecturas = [{ occurredAt: t(10), value: 4.8 }];
    expect(curvaDeLote({ lecturas, objetivos: [BANDA], ancho: 300, alto: 120 }).rango).toEqual({ min: 4.0, max: 5.0 });
    // Sin objetivo, o con un extremo vacío, no hay rango: ni se inventa uno ni se completa con el otro extremo.
    expect(curvaDeLote({ lecturas, objetivos: [], ancho: 300, alto: 120 }).rango).toBeNull();
    expect(
      curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: 4.0, maxValue: null, targetValue: 4.5 }], ancho: 300, alto: 120 }).rango,
    ).toBeNull();
    expect(
      curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: null, maxValue: 5.0, targetValue: 4.5 }], ancho: 300, alto: 120 }).rango,
    ).toBeNull();
  });

  it("el rango al revés o de ancho cero se devuelve IGUAL: quien rotula decide, no esta función", () => {
    // `banda` ya dice «no se dibuja»; `rango` es el dato declarado. Esconderlo aquí obligaría a quien
    // rotula a adivinar si «sin rango» significa «la receta no lo declara» o «la receta lo declaró mal».
    const lecturas = [{ occurredAt: t(10), value: 4.8 }];
    const alReves = curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: 5.0, maxValue: 4.0, targetValue: 4.5 }], ancho: 300, alto: 120 });
    expect(alReves.banda).toEqual({ tipo: "banda_al_reves" });
    expect(alReves.rango).toEqual({ min: 5.0, max: 4.0 });
    const ceroAncho = curvaDeLote({ lecturas, objetivos: [{ momento: "during", minValue: 4.5, maxValue: 4.5, targetValue: 4.5 }], ancho: 300, alto: 120 });
    expect(ceroAncho.banda).toEqual({ tipo: "banda_de_ancho_cero" });
    expect(ceroAncho.rango).toEqual({ min: 4.5, max: 4.5 });
  });

  it("sin lecturas no hay lecturas, y el rango se conserva", () => {
    const c = curvaDeLote({ lecturas: [], objetivos: [BANDA], ancho: 300, alto: 120 });
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

/**
 * **El momento del objetivo decide a qué lecturas se aplica** — el defecto de
 * `PENDING_IMPLEMENTATIONS/017`: una meta `final` se usaba como banda de TODA la trayectoria, así
 * que un pH que baja de 6,5 a 4,0 por diseño salía como «2 lecturas fuera del rango de la receta»
 * durante todo el descenso.
 *
 * La regla es la que `readingsForMoment` (`lib/traceability/processTargets.ts`) ya aplica en el
 * resto del sistema: `during` son todas, `initial` la primera, `final` la última. Aquí **no se
 * reusa esa función** y la razón es medible: para `initial`/`final` toma `ordered[0]` y
 * `ordered[last]` **sin regla de empate**, mientras esta curva devuelve `null` ante un empate de
 * instante (ver `ultimaLectura`, y los 7 de 10 lotes reales que lo motivaron). Unificarlas
 * reintroduciría ese defecto.
 */
describe("curvaDeLote — el momento del objetivo decide a qué se aplica la banda", () => {
  const TRES = [
    { occurredAt: t(8), value: 6.5 },
    { occurredAt: t(12), value: 5.0 },
    { occurredAt: t(16), value: 4.3 },
  ];

  it("un objetivo `during` cubre la trayectoria", () => {
    const c = curvaDeLote({
      lecturas: TRES,
      objetivos: [{ momento: "during", minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }],
      ancho: 300, alto: 120,
    });
    expect(c.banda.tipo).toBe("banda");
    expect(c.banda.tipo === "banda" ? c.banda.alcance : null).toBe("trayectoria");
  });

  it("un objetivo `final` NO cubre la trayectoria: su alcance es el final del eje", () => {
    const c = curvaDeLote({
      lecturas: TRES,
      objetivos: [{ momento: "final", minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }],
      ancho: 300, alto: 120,
    });
    expect(c.banda.tipo === "banda" ? c.banda.alcance : null).toBe("al_final");
  });

  it("un objetivo `initial` es el caso de lavado y natural: Brix o pH al principio", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(8), value: 18.4 }],
      objetivos: [{ momento: "initial", minValue: 17.0, maxValue: 20.0, targetValue: 18.5 }],
      ancho: 300, alto: 120,
    });
    expect(c.banda.tipo === "banda" ? c.banda.alcance : null).toBe("al_inicio");
    // Control: la lectura SÍ se dibuja. Sin él, «no cubre la trayectoria» podría ser «no dibujé nada».
    expect(c.puntos).toHaveLength(1);
  });

  it("el alcance NO cambia la geometría: la misma banda y los mismos puntos en los tres momentos", () => {
    const geom = (momento: "initial" | "during" | "final") => {
      const c = curvaDeLote({
        lecturas: TRES,
        objetivos: [{ momento, minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }],
        ancho: 300, alto: 120,
      });
      return { puntos: c.puntos, y: c.banda.tipo === "banda" ? [c.banda.yMin, c.banda.yMax] : null };
    };
    expect(geom("final")).toEqual(geom("during"));
    expect(geom("initial")).toEqual(geom("during"));
  });
});

/**
 * **Cuál de los objetivos declarados rige la curva.** El defecto de 017 no era sólo el alcance: era
 * que `datosDelTablero` hacía `find(during) ?? find(final)` y por tanto ELEGÍA en silencio. Aquí la
 * regla se dice y se prueba: `during` manda porque es el único momento que describe una trayectoria
 * (el esquema ya lo dice de `everyHours`: «un objetivo inicial o final ocurre una vez»); con uno
 * solo, ése; y con dos que no son trayectoria, **no se elige** — se dice qué había.
 */
describe("elegirObjetivo — nunca elige por ti entre dos momentos", () => {
  const o = (momento: "initial" | "during" | "final") =>
    ({ momento, minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }) as const;

  // El `true` de cada llamada dice «la receta SÍ se resolvió» (019): sin él no se distinguiría de
  // «no se pudo saber qué receta aplicaba», que es el caso del bloque de más abajo.
  it("sin objetivos declarados no hay objetivo", () => {
    expect(elegirObjetivo([], true)).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  it("`during` gana sobre los otros dos: es el único que describe una trayectoria", () => {
    expect(elegirObjetivo([o("initial"), o("during"), o("final")], true)).toEqual({
      tipo: "elegido", objetivo: o("during"),
    });
    // Control de orden: gana igual si llega al final de la lista.
    expect(elegirObjetivo([o("final"), o("during")], true)).toEqual({ tipo: "elegido", objetivo: o("during") });
  });

  it("un solo objetivo, sea `initial` o `final`, se elige", () => {
    expect(elegirObjetivo([o("initial")], true)).toEqual({ tipo: "elegido", objetivo: o("initial") });
    expect(elegirObjetivo([o("final")], true)).toEqual({ tipo: "elegido", objetivo: o("final") });
  });

  it("`initial` y `final` juntos sin `during`: NO elige, y nombra los momentos que había", () => {
    expect(elegirObjetivo([o("final"), o("initial")], true)).toEqual({
      tipo: "varios_sin_trayectoria", momentos: ["initial", "final"],
    });
  });
});

/**
 * **«No se pudo resolver la receta» NO es «la receta no declara rango»** (`PENDING_IMPLEMENTATIONS/019`).
 * Las dos llegan aquí como una lista vacía de objetivos, y hasta ahora las dos salían como
 * `sin_objetivo_declarado`, que la pantalla pinta afirmando algo **sobre la receta**. Sin corrida
 * abierta nadie consultó ninguna receta: lo único demostrado es que la consulta no recuperó nada.
 *
 * El indicador entra **obligatorio** porque el defecto es precisamente no haberlo dicho: con un valor
 * por omisión, un sitio que lo olvide vuelve a afirmar sobre la receta sin haberla mirado.
 */
describe("elegirObjetivo — una lista vacía tiene DOS motivos y no dicen lo mismo (019)", () => {
  const o = (momento: "initial" | "during" | "final") =>
    ({ momento, minValue: 4.0, maxValue: 5.0, targetValue: 4.5 }) as const;

  it("sin receta resuelta no se afirma nada sobre la receta", () => {
    expect(elegirObjetivo([], false)).toEqual({ tipo: "receta_no_resuelta" });
  });

  // **El control que TIENE que salir distinto.** Si las dos filas dieran lo mismo, el indicador no
  // mide nada y la prueba de arriba pasaría con el defecto puesto.
  it("control: la MISMA lista vacía, con la receta resuelta, sigue diciendo que no declara rango", () => {
    expect(elegirObjetivo([], true)).toEqual({ tipo: "sin_objetivo_declarado" });
  });

  // Un indicador en `false` no puede borrar un rango que la receta SÍ declara: si hay objetivos,
  // la receta se resolvió, y quien llame mal no cambia eso.
  it("con objetivos declarados el indicador no manda", () => {
    expect(elegirObjetivo([o("during")], false)).toEqual({ tipo: "elegido", objetivo: o("during") });
    expect(elegirObjetivo([o("initial"), o("final")], false)).toEqual({
      tipo: "varios_sin_trayectoria", momentos: ["initial", "final"],
    });
  });

  it("curvaDeLote lo propaga, y los puntos se siguen dibujando", () => {
    const c = curvaDeLote({
      lecturas: [{ occurredAt: t(10), value: 4.8 }, { occurredAt: t(14), value: 4.2 }],
      objetivos: [], recetaResuelta: false, ancho: 300, alto: 120,
    });
    expect(c.eleccion).toEqual({ tipo: "receta_no_resuelta" });
    // La banda es otra unión y no cambia: no hay banda en ninguno de los dos motivos.
    expect(c.banda).toEqual({ tipo: "sin_objetivo_declarado" });
    expect(c.puntos).toHaveLength(2);
  });
});

/**
 * **La primera y la última, con la MISMA regla de empate.** `ultimaLectura` ya se niega a desempatar;
 * el juicio de un objetivo `initial` necesita lo simétrico, y duplicar la regla es cómo se pierde.
 */
describe("indiceDeLaUnicaEnElExtremo", () => {
  it("con tres instantes distintos, la primera es 0 y la última es 2 — venga el orden que venga", () => {
    const l = [{ occurredAt: t(16), value: 4.3 }, { occurredAt: t(8), value: 6.5 }, { occurredAt: t(12), value: 5.0 }];
    expect(indiceDeLaUnicaEnElExtremo(l, "primera")).toBe(1);
    expect(indiceDeLaUnicaEnElExtremo(l, "ultima")).toBe(0);
  });

  it("un empate en el instante mínimo no tiene primera, y el máximo de ese mismo conjunto sí tiene última", () => {
    const l = [{ occurredAt: t(8), value: 6.5 }, { occurredAt: t(8), value: 6.4 }, { occurredAt: t(16), value: 4.3 }];
    expect(indiceDeLaUnicaEnElExtremo(l, "primera")).toBeNull();
    expect(indiceDeLaUnicaEnElExtremo(l, "ultima")).toBe(2);
  });

  it("un empate en el instante máximo no tiene última", () => {
    const l = [{ occurredAt: t(8), value: 6.5 }, { occurredAt: t(16), value: 4.3 }, { occurredAt: t(16), value: 4.2 }];
    expect(indiceDeLaUnicaEnElExtremo(l, "ultima")).toBeNull();
    expect(indiceDeLaUnicaEnElExtremo(l, "primera")).toBe(0);
  });

  it("una sola lectura es a la vez la primera y la última", () => {
    const l = [{ occurredAt: t(8), value: 6.5 }];
    expect(indiceDeLaUnicaEnElExtremo(l, "primera")).toBe(0);
    expect(indiceDeLaUnicaEnElExtremo(l, "ultima")).toBe(0);
  });

  it("sin lecturas, y con un instante que no es un número, no hay ninguna de las dos", () => {
    expect(indiceDeLaUnicaEnElExtremo([], "primera")).toBeNull();
    const malo = [{ occurredAt: new Date("no es fecha"), value: 4.3 }];
    expect(indiceDeLaUnicaEnElExtremo(malo, "primera")).toBeNull();
    expect(indiceDeLaUnicaEnElExtremo(malo, "ultima")).toBeNull();
  });
});
