/**
 * Cuándo se libera la próxima unidad: tres casos, y `null` no es «sin duración declarada».
 *
 * «No hay nada ocupado» y «hay algo y no sé cuándo acaba» se parecen lo bastante para que un
 * refactor los junte; la primera y la cuarta prueba existen para que no. «Nunca una hora
 * inventada» es la frase del diseño del tablero.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import { proximaLiberacion, type CorridaConDuracion, type UnidadParaLiberar } from "../../lib/beneficio/liberacionDeUnidad";

const AHORA = new Date("2026-03-10T12:00:00.000Z");

/** Una unidad activa y sin informe de condición: nada le impide volver a estar libre. */
const sana = (id: string): UnidadParaLiberar => ({ id, lifecycleStatus: "active", condicion: null });

/**
 * **Las pruebas de duración declaran sanas las unidades que sus corridas nombran.**
 *
 * Hablan de cómo se combinan las DURACIONES, no de la salud de la unidad — eso lo prueba el
 * `describe` de abajo, que llama a `proximaLiberacion` directamente. Sin este envoltorio, cada una
 * tendría que repetir una lista de unidades que no es lo que mide, y el ruido escondería su caso.
 */
const unidadesDe = (corridas: readonly CorridaConDuracion[]): UnidadParaLiberar[] => [
  ...new Set(corridas.map((c) => c.equipmentId ?? c.bedLocationId).filter((id): id is string => id !== null)),
].map(sana);

const liberacion = (input: { readonly corridas: readonly CorridaConDuracion[]; readonly ahora: Date }) =>
  proximaLiberacion({ ...input, unidades: unidadesDe(input.corridas) });

describe("proximaLiberacion", () => {
  it("sin expectedHours dice «sin duración declarada», no una hora", () => {
    const r = liberacion({
      ahora: AHORA,
      corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours: null }],
    });
    expect(r).toEqual({ tipo: "sin_duracion_declarada" });
  });

  it("elige la que se libera antes, no la primera de la lista", () => {
    const r = liberacion({
      ahora: AHORA,
      corridas: [
        { equipmentId: "tarde", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 48 },
        { equipmentId: "pronto", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
  });

  it("elige la mínima aunque esté en medio: ni la primera, ni la última, ni la mayor", () => {
    const r = liberacion({
      ahora: AHORA,
      corridas: [
        { equipmentId: "a", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 48 },
        { equipmentId: "b", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
        { equipmentId: "c", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 24 },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
  });

  it("una corrida vencida y aún abierta conserva su hora, anterior a ahora: no se recorta", () => {
    // «Ya debería estar libre» es información; moverla a `ahora` la escondería, y sería
    // inventar una hora.
    const r = liberacion({
      ahora: AHORA,
      corridas: [
        {
          equipmentId: "vencida",
          bedLocationId: null,
          iniciadaEn: new Date("2026-03-09T00:00:00.000Z"),
          expectedHours: 6,
        },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-09T06:00:00.000Z") });
    expect(r?.tipo === "a_las" && r.cuando.getTime() < AHORA.getTime()).toBe(true);
  });

  it("una sin duración no borra la próxima conocida", () => {
    const r = liberacion({
      ahora: AHORA,
      corridas: [
        { equipmentId: "muda", bedLocationId: null, iniciadaEn: AHORA, expectedHours: null },
        { equipmentId: "habla", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
  });

  it("sin corridas abiertas devuelve null, que no es «sin duración»", () => {
    expect(liberacion({ ahora: AHORA, corridas: [] })).toBeNull();
  });

  it("suma la duración a cuándo EMPEZÓ cada corrida, no a ahora", () => {
    const r = liberacion({
      ahora: AHORA,
      corridas: [
        {
          equipmentId: "t1",
          bedLocationId: null,
          iniciadaEn: new Date("2026-03-10T00:00:00.000Z"),
          expectedHours: 24,
        },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-11T00:00:00.000Z") });
  });

  it("un expectedHours no finito (NaN, Infinity) no fabrica una fecha inválida", () => {
    for (const expectedHours of [NaN, Infinity]) {
      const r = liberacion({
        ahora: AHORA,
        corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours }],
      });
      expect(r, `expectedHours=${expectedHours}`).toEqual({ tipo: "sin_duracion_declarada" });
    }
  });

  it("expectedHours 0 o negativo NO es una duración: ni da una hora ni le gana a una declarada (hallazgo 1)", () => {
    // Los otros dos consumidores del repositorio ya lo tratan como inválido: la escritura lo
    // rechaza (`expected_hours_must_be_positive`) y la cola lo declara
    // (`duracion_esperada_invalida_en_la_base`). Aquí cuenta como no declarado, igual que NaN.
    for (const expectedHours of [0, -5]) {
      const sola = liberacion({
        ahora: AHORA,
        corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours }],
      });
      expect(sola, `expectedHours=${expectedHours}`).toEqual({ tipo: "sin_duracion_declarada" });

      // Con una que sí habla: el 0 / -5 daría una hora ANTERIOR (o igual) al inicio y ganaría por
      // «la que se libera antes». Gana la de 6 h.
      const conOtra = liberacion({
        ahora: AHORA,
        corridas: [
          { equipmentId: "mala", bedLocationId: null, iniciadaEn: AHORA, expectedHours },
          { equipmentId: "buena", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
        ],
      });
      expect(conOtra, `expectedHours=${expectedHours} + 6`).toEqual({
        tipo: "a_las",
        cuando: new Date("2026-03-10T18:00:00.000Z"),
      });
    }
    // Control: la duración positiva más pequeña SÍ es una duración (si no, `<= 0` podría ser `<= 1000`).
    expect(
      liberacion({
        ahora: AHORA,
        corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 0.5 }],
      }),
    ).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T12:30:00.000Z") });
  });
});

/**
 * **Los dos defectos de `PENDING_IMPLEMENTATIONS/015`, segunda mitad.**
 *
 * El mínimo se tomaba **global, sin agrupar por unidad**, así que dos corridas en el mismo tanque
 * —un conflicto de datos que la ocupación ya cuenta aparte— hacían que la pantalla anunciara la
 * hora de la PRIMERA: una hora a la que ese tanque no va a estar libre. Y no se miraba la salud de
 * la unidad, así que un tanque retirado o averiado prometía una liberación que no va a servir.
 *
 * **Cada caso con su control, y el control tiene que salir distinto.** Las mismas dos corridas en
 * unidades DISTINTAS sí dan la primera hora; la misma unidad sin el problema de salud sí aparece.
 */
describe("proximaLiberacion — se agrupa por unidad y se mira si la unidad podrá estar libre", () => {
  const t = (h: number) => new Date(`2026-03-10T${String(h).padStart(2, "0")}:00:00.000Z`);
  const enTanque = (id: string, iniciadaEn: Date, expectedHours: number | null): CorridaConDuracion =>
    ({ equipmentId: id, bedLocationId: null, iniciadaEn, expectedHours });

  it("dos corridas en la MISMA unidad: se libera cuando acaba la ÚLTIMA, no la primera", () => {
    const corridas = [enTanque("t1", t(8), 2), enTanque("t1", t(8), 6)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("t1")] })).toEqual({
      tipo: "a_las", cuando: t(14),
    });
  });

  it("CONTROL: las MISMAS dos duraciones en unidades DISTINTAS sí dan la primera hora", () => {
    const corridas = [enTanque("t1", t(8), 2), enTanque("t2", t(8), 6)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("t1"), sana("t2")] })).toEqual({
      tipo: "a_las", cuando: t(10),
    });
  });

  it("una unidad con una corrida SIN duración no tiene hora conocida, aunque otra de la misma unidad sí la declare", () => {
    // Era la misma forma del defecto: la unidad no se libera hasta que acaben las dos, y de una no
    // se sabe cuándo acaba. Anunciar la hora de la que habla es anunciar una hora falsa.
    const corridas = [enTanque("t1", t(8), 2), enTanque("t1", t(8), null)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("t1")] })).toEqual({
      tipo: "sin_duracion_declarada",
    });
  });

  it("CONTROL: esa misma unidad con las DOS duraciones declaradas sí da la mayor", () => {
    const corridas = [enTanque("t1", t(8), 2), enTanque("t1", t(8), 5)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("t1")] })).toEqual({
      tipo: "a_las", cuando: t(13),
    });
  });

  it("y una unidad muda no tapa a OTRA unidad que sí declara: gana la que se sabe", () => {
    const corridas = [enTanque("muda", t(8), null), enTanque("habla", t(8), 6)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("muda"), sana("habla")] })).toEqual({
      tipo: "a_las", cuando: t(14),
    });
  });

  it("una unidad RETIRADA no promete liberación: no va a estar disponible cuando acabe", () => {
    const corridas = [enTanque("retirado", t(8), 2), enTanque("bueno", t(8), 6)];
    const unidades: UnidadParaLiberar[] = [
      { id: "retirado", lifecycleStatus: "retired", condicion: null },
      sana("bueno"),
    ];
    // La hora del retirado (10 h) es ANTERIOR, así que si contara ganaría. Gana la del bueno.
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades })).toEqual({ tipo: "a_las", cuando: t(14) });
  });

  it("una unidad que REQUIERE INTERVENCIÓN tampoco: alguien tiene que ir antes de volver a llenarla", () => {
    const corridas = [enTanque("averiado", t(8), 2), enTanque("bueno", t(8), 6)];
    const unidades: UnidadParaLiberar[] = [
      { id: "averiado", lifecycleStatus: "active", condicion: "faulty" },
      sana("bueno"),
    ];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades })).toEqual({ tipo: "a_las", cuando: t(14) });
  });

  it("CONTROL de las dos de arriba: con la unidad sana, SÍ gana su hora anterior", () => {
    const corridas = [enTanque("x", t(8), 2), enTanque("bueno", t(8), 6)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("x"), sana("bueno")] })).toEqual({
      tipo: "a_las", cuando: t(10),
    });
  });

  it("`operational` NO es un problema: es un informe de que está bien", () => {
    const corridas = [enTanque("revisado", t(8), 2)];
    const unidades: UnidadParaLiberar[] = [{ id: "revisado", lifecycleStatus: "active", condicion: "operational" }];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades })).toEqual({ tipo: "a_las", cuando: t(10) });
  });

  it("una corrida de una unidad que no está en la lista no cuenta: es la misma regla que `ajenas`", () => {
    const corridas = [enTanque("desconocida", t(8), 2), enTanque("bueno", t(8), 6)];
    expect(proximaLiberacion({ ahora: AHORA, corridas, unidades: [sana("bueno")] })).toEqual({
      tipo: "a_las", cuando: t(14),
    });
    // Y si NINGUNA de las corridas es de una unidad conocida, no hay nada que prometer: `null`,
    // que no es «sin duración declarada».
    expect(proximaLiberacion({ ahora: AHORA, corridas: [enTanque("desconocida", t(8), 2)], unidades: [] })).toBeNull();
  });
});
