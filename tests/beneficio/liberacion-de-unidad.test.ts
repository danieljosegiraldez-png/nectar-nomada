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
import { proximaLiberacion } from "../../lib/beneficio/liberacionDeUnidad";

const AHORA = new Date("2026-03-10T12:00:00.000Z");

describe("proximaLiberacion", () => {
  it("sin expectedHours dice «sin duración declarada», no una hora", () => {
    const r = proximaLiberacion({
      ahora: AHORA,
      corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours: null }],
    });
    expect(r).toEqual({ tipo: "sin_duracion_declarada" });
  });

  it("elige la que se libera antes, no la primera de la lista", () => {
    const r = proximaLiberacion({
      ahora: AHORA,
      corridas: [
        { equipmentId: "tarde", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 48 },
        { equipmentId: "pronto", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
  });

  it("elige la mínima aunque esté en medio: ni la primera, ni la última, ni la mayor", () => {
    const r = proximaLiberacion({
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
    const r = proximaLiberacion({
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
    const r = proximaLiberacion({
      ahora: AHORA,
      corridas: [
        { equipmentId: "muda", bedLocationId: null, iniciadaEn: AHORA, expectedHours: null },
        { equipmentId: "habla", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 6 },
      ],
    });
    expect(r).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T18:00:00.000Z") });
  });

  it("sin corridas abiertas devuelve null, que no es «sin duración»", () => {
    expect(proximaLiberacion({ ahora: AHORA, corridas: [] })).toBeNull();
  });

  it("suma la duración a cuándo EMPEZÓ cada corrida, no a ahora", () => {
    const r = proximaLiberacion({
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
      const r = proximaLiberacion({
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
      const sola = proximaLiberacion({
        ahora: AHORA,
        corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours }],
      });
      expect(sola, `expectedHours=${expectedHours}`).toEqual({ tipo: "sin_duracion_declarada" });

      // Con una que sí habla: el 0 / -5 daría una hora ANTERIOR (o igual) al inicio y ganaría por
      // «la que se libera antes». Gana la de 6 h.
      const conOtra = proximaLiberacion({
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
      proximaLiberacion({
        ahora: AHORA,
        corridas: [{ equipmentId: "t1", bedLocationId: null, iniciadaEn: AHORA, expectedHours: 0.5 }],
      }),
    ).toEqual({ tipo: "a_las", cuando: new Date("2026-03-10T12:30:00.000Z") });
  });
});
