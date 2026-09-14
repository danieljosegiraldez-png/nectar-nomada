import { describe, expect, it } from "vitest";

import { confianzaDe, veredictoDelLote, type MedicionDelLote } from "../../lib/beneficio/desdeElLote";

/**
 * El puente entre nuestros registros y los motores.
 *
 * **Lo que de verdad se vigila aquí no es la traducción: es que lo intraducible
 * NO se rellene.** Los motores son honestos porque sus umbrales vienen del
 * perfil; si el puente le inventa un perfil a un lote que no lo declara, el
 * veredicto pasa a juzgarse con una cinética que no es la suya y **nadie se
 * entera**, porque sale un estado perfectamente plausible.
 *
 * Es la misma forma del `?? ["proceso_de_cafe"]` de septiembre, y por eso la
 * mitad de estas pruebas comprueban **ausencias**: que sin grado no haya
 * veredicto, que un grado sin perfil no caiga al del lavado, y que una lectura
 * corregida no alimente una alerta.
 *
 * Hermético: aritmética y fechas, sin base.
 */

const INICIO = new Date("2026-03-14T06:00:00-05:00");
const h = (n: number) => new Date(INICIO.getTime() + n * 3_600_000);

const lectura = (v: number, hora: number, extra: Partial<MedicionDelLote> = {}): MedicionDelLote => ({
  variable: "ph",
  value: v,
  occurredAt: h(hora),
  provenanceClass: "measured_fact",
  fueCorregida: false,
  ...extra,
});

describe("el puente no inventa lo que no puede traducir", () => {
  it("sin proceso abierto no hay veredicto, y lo dice", () => {
    expect(
      veredictoDelLote({ fase: null, gradoDeProceso: "Washed", mediciones: [lectura(4.2, 6)], ahora: h(6) }),
    ).toBe("SIN_PROCESO_ABIERTO");
  });

  it("sin grado declarado no hay veredicto", () => {
    expect(
      veredictoDelLote({
        fase: { tipo: "fermentacion", iniciadaEn: INICIO },
        gradoDeProceso: null,
        mediciones: [lectura(4.2, 6)],
        ahora: h(6),
      }),
    ).toBe("SIN_GRADO_DECLARADO");
  });

  /**
   * **La prueba que más importa.** Tres de los cinco grados de Daniel no tienen
   * perfil escrito en el contrato. Caer al del lavado los juzgaría con umbrales
   * ajenos y el estado saldría plausible — que es como se firma un verde vacío.
   */
  it.each(["Honey", "Semi Wash 50%", "Semi Wash 75%"])(
    "«%s» no tiene perfil y NO se le presta el del lavado",
    (grado) => {
      const r = veredictoDelLote({
        fase: { tipo: "fermentacion", iniciadaEn: INICIO },
        gradoDeProceso: grado,
        mediciones: [lectura(4.2, 6), lectura(4.1, 12)],
        ahora: h(12),
      });
      expect(r, `${grado} recibió un veredicto que nadie escribió`).toBe("GRADO_SIN_PERFIL");
    },
  );

  /**
   * **El control positivo de todo lo anterior.** Sin esto, las cuatro pruebas de
   * arriba pasarían igual con una función que devolviera siempre una razón: no
   * estarían midiendo la distinción, sólo la negativa.
   */
  it("y los dos grados que SÍ casan producen veredicto de verdad", () => {
    for (const [grado, clave] of [
      ["Washed", "WASHED_STANDARD"],
      ["Natural", "NATURAL"],
    ] as const) {
      const r = veredictoDelLote({
        fase: { tipo: "fermentacion", iniciadaEn: INICIO },
        gradoDeProceso: grado,
        mediciones: [lectura(5.6, 0), lectura(4.2, 12)],
        ahora: h(12),
      });
      expect(typeof r, `${grado} debería tener veredicto`).not.toBe("string");
      if (typeof r === "string") continue;
      expect(r.perfil.key).toBe(clave);
      expect(r.ph?.status).toBeTruthy();
      expect(r.fase).toBe("fermentacion");
    }
  });

  it("con proceso y perfil pero sin lecturas, tampoco se inventa nada", () => {
    expect(
      veredictoDelLote({
        fase: { tipo: "fermentacion", iniciadaEn: INICIO },
        gradoDeProceso: "Washed",
        mediciones: [],
        ahora: h(6),
      }),
    ).toBe("SIN_LECTURAS");
  });
});

describe("la confianza sale de lo que este repositorio sí guarda", () => {
  it("una lectura corregida queda fuera del cálculo", () => {
    expect(confianzaDe(lectura(4.2, 6, { fueCorregida: true }))).toBe("UNCALIBRATED");
  });

  it("sólo un hecho medido puede confirmar una alerta crítica", () => {
    expect(confianzaDe(lectura(4.2, 6, { provenanceClass: "measured_fact" }))).toBe("VALIDATED");
    for (const otra of ["interpretation", "ai_suggestion", "manufacturer_spec"]) {
      expect(
        confianzaDe(lectura(4.2, 6, { provenanceClass: otra })),
        `${otra} no puede valer como VALIDATED`,
      ).not.toBe("VALIDATED");
    }
  });

  /**
   * La mitad que de verdad protege: **la corrección cambia el veredicto**.
   * Comprobar el mapeo de confianza por separado no basta — lo que importa es
   * que el motor lo obedezca, y eso sólo se ve llamándolo.
   */
  it("y una lectura corregida NO puede sostener una crítica", () => {
    const base = {
      fase: { tipo: "fermentacion" as const, iniciadaEn: INICIO },
      gradoDeProceso: "Washed",
      ahora: h(26.5),
    };
    // Dos lecturas bajo 3,50 separadas media hora: confirman y elevan a CRITICAL.
    const confirmada = veredictoDelLote({
      ...base,
      mediciones: [lectura(3.44, 26), lectura(3.41, 26.5)],
    });
    // La misma pareja, con la última corregida: ya no puede confirmar.
    const corregida = veredictoDelLote({
      ...base,
      mediciones: [lectura(3.44, 26), lectura(3.41, 26.5, { fueCorregida: true })],
    });

    if (typeof confirmada === "string" || typeof corregida === "string") {
      throw new Error("las dos debían producir veredicto");
    }
    expect(confirmada.ph?.severity, "dos hechos medidos deben confirmar").toBe("CRITICAL");
    expect(corregida.ph?.severity, "con una corregida NO debe confirmar").not.toBe("CRITICAL");
    expect(corregida.ph?.awaitingConfirmation).toBe(true);
  });
});

describe("lo que el puente no puede traducir, lo declara", () => {
  it("el punto de muestreo no existe aquí, y el veredicto lo dice", () => {
    const r = veredictoDelLote({
      fase: { tipo: "fermentacion", iniciadaEn: INICIO },
      gradoDeProceso: "Washed",
      mediciones: [
        lectura(21, 0, { variable: "brix" }),
        lectura(19, 6, { variable: "brix" }),
      ],
      ahora: h(6),
    });
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(
      r.limitaciones,
      "sin punto de muestreo el guardia de series mezcladas de Brix no puede disparar, y callarlo sería peor",
    ).toContain("SIN_PUNTO_DE_MUESTREO");
  });

  it("el secado declara sus dos límites: un punto de cama y sin actividad de agua", () => {
    const r = veredictoDelLote({
      fase: { tipo: "secado", iniciadaEn: INICIO },
      gradoDeProceso: "Washed",
      mediciones: [
        lectura(24, 0, { variable: "moisture" }),
        lectura(14, 24, { variable: "moisture" }),
      ],
      ahora: h(24),
    });
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(r.limitaciones).toContain("UN_SOLO_PUNTO_DE_CAMA");
    expect(r.limitaciones).toContain("SIN_ACTIVIDAD_DE_AGUA");
    // Y el motor sí corre: diez puntos en un día por debajo del 25 % es el
    // endurecimiento superficial que DR-002 describe.
    expect(r.secado?.status).toBe("RATE_TOO_FAST");
  });
});
