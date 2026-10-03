import { describe, expect, it } from "vitest";

import { confianzaDe, perfilDeLaFaseAbierta, veredictoDelLote, type MedicionDelLote } from "../../lib/beneficio/desdeElLote";

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

describe("perfilDeLaFaseAbierta: el perfil que rige un lote por su fase abierta, o null — nunca «el de siempre»", () => {
  /** Una corrida abierta cuyo proceso declara `grado` (`null` = proceso sin grado; `"sin-proceso"` = corrida sin proceso). */
  const abiertaCon = (
    grado: string | null | "sin-proceso",
    fase: "fermentation" | "drying" = "fermentation",
    /** `false` = el proceso no tiene versión de receta. */
    conReceta = true,
    /** `null` = el proceso sigue abierto. */
    endedAt: Date | null = null,
  ) => ({
    fase,
    proceso:
      grado === "sin-proceso"
        ? null
        : { processGradeValue: grado === null ? null : { value: grado }, processRecipeVersion: conReceta ? { id: "receta" } : null, endedAt },
  });

  it("Washed y Natural, con una fase abierta, tienen su perfil", () => {
    expect(perfilDeLaFaseAbierta(abiertaCon("Washed"))).toBe("WASHED_STANDARD");
    expect(perfilDeLaFaseAbierta(abiertaCon("Natural"))).toBe("NATURAL");
  });

  it("Honey y los dos Semi Wash no tienen perfil: no se les presta el del lavado", () => {
    for (const grado of ["Honey", "Semi Wash 50%", "Semi Wash 75%"]) {
      expect(perfilDeLaFaseAbierta(abiertaCon(grado)), grado).toBeNull();
    }
  });

  it("SIN fase abierta no hay perfil; y con una corrida sin proceso o sin grado, tampoco", () => {
    expect(perfilDeLaFaseAbierta(undefined)).toBeNull();
    expect(perfilDeLaFaseAbierta(abiertaCon("sin-proceso"))).toBeNull();
    expect(perfilDeLaFaseAbierta(abiertaCon(null))).toBeNull();
    expect(perfilDeLaFaseAbierta(abiertaCon(""))).toBeNull();
    // Control: la misma llamada con una corrida que sí tiene grado con perfil lo devuelve, así que los `null` de arriba no son «siempre null».
    expect(perfilDeLaFaseAbierta(abiertaCon("Washed"))).not.toBeNull();
  });

  it("sólo la FERMENTACIÓN tiene perfil que citar: con secado abierto es null aunque el grado sea Washed", () => {
    // La matriz de pH que se cita (`10_ph_fermentation.md` §1) es de la fermentación; `13_drying_moisture.md` no tiene ninguna.
    for (const grado of ["Washed", "Natural"]) {
      expect(perfilDeLaFaseAbierta(abiertaCon(grado, "drying")), `${grado} con secado`).toBeNull();
    }
    // Control: los MISMOS grados con la fermentación abierta sí tienen perfil, así que el null de arriba es de la fase y no del grado.
    expect(perfilDeLaFaseAbierta(abiertaCon("Washed", "fermentation"))).toBe("WASHED_STANDARD");
    expect(perfilDeLaFaseAbierta(abiertaCon("Natural", "fermentation"))).toBe("NATURAL");
    // Una fase que no es ninguna de las dos que existen hoy tampoco la tiene (la guarda es «es fermentación», no «no es secado»).
    const rara = { fase: "reposo", proceso: { processGradeValue: { value: "Washed" } } } as unknown as Parameters<typeof perfilDeLaFaseAbierta>[0];
    expect(perfilDeLaFaseAbierta(rara)).toBeNull();
  });

  it("sin RECETA no hay perfil que citar: el grado Washed sólo sugiere una plantilla (ADR-181: sin receta el motor no opina)", () => {
    // `00_conventions.md` §8: los perfiles son plantillas para crear recetas y los umbrales salen de la receta.
    for (const grado of ["Washed", "Natural"]) {
      expect(perfilDeLaFaseAbierta(abiertaCon(grado, "fermentation", false)), `${grado} sin receta`).toBeNull();
    }
    // Control: los MISMOS grados y la MISMA fase con receta sí tienen perfil, así que el null de arriba es de la receta y no del grado ni de la fase.
    expect(perfilDeLaFaseAbierta(abiertaCon("Washed", "fermentation", true))).toBe("WASHED_STANDARD");
    expect(perfilDeLaFaseAbierta(abiertaCon("Natural", "fermentation", true))).toBe("NATURAL");
  });

  it("con el proceso CERRADO no hay perfil, aunque tenga receta y sea Washed (M10: el veredicto de la fila ya no lo toma)", () => {
    // Revisión final de la Parte 1 (ronda de arreglo 1, 2026-10-03). Una fermentación vieja abierta bajo un proceso que ya se
    // cerró: la fila decía «sin grado declarado» y la curva citaba la matriz del lavado.
    const cerrado = new Date("2026-03-21T12:00:00Z");
    for (const grado of ["Washed", "Natural"]) {
      expect(perfilDeLaFaseAbierta(abiertaCon(grado, "fermentation", true, cerrado)), `${grado} cerrado`).toBeNull();
    }
    // Control: el MISMO proceso abierto sí tiene perfil, así que el null de arriba es del cierre.
    expect(perfilDeLaFaseAbierta(abiertaCon("Washed", "fermentation", true, null))).toBe("WASHED_STANDARD");
  });

  it("un grado que es una propiedad heredada del objeto no es un perfil", () => {
    // `PERFIL_POR_GRADO["constructor"]` encuentra `Object` si no se pregunta por las propiedades PROPIAS.
    for (const grado of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      expect(perfilDeLaFaseAbierta(abiertaCon(grado)), grado).toBeNull();
    }
  });

  it("coincide con el que usa el veredicto: lo que tiene perfil aquí tiene veredicto allí, y viceversa", () => {
    const hayVeredicto = (grado: string) =>
      typeof veredictoDelLote({
        fase: { tipo: "fermentacion", iniciadaEn: INICIO }, gradoDeProceso: grado, mediciones: [lectura(4.2, 6)], ahora: h(6),
      }) === "object";
    for (const grado of ["Washed", "Natural", "Honey", "Semi Wash 50%", "Semi Wash 75%"]) {
      expect(perfilDeLaFaseAbierta(abiertaCon(grado)) !== null, grado).toBe(hayVeredicto(grado));
    }
  });
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

describe("el instrumento que produjo la lectura también decide su confianza", () => {
  const conInstrumento = (estado: Parameters<typeof veredictoDelLote>[0]["mediciones"][number]["estadoDelInstrumento"]) =>
    veredictoDelLote({
      fase: { tipo: "fermentacion", iniciadaEn: INICIO },
      gradoDeProceso: "Washed",
      ahora: h(26.5),
      mediciones: [
        lectura(3.44, 26, { estadoDelInstrumento: estado }),
        lectura(3.41, 26.5, { estadoDelInstrumento: estado }),
      ],
    });

  /**
   * **El control positivo de todo el bloque.** Sin él, las comprobaciones de
   * abajo pasarían igual con una función que nunca confirmara nada: no estarían
   * midiendo el efecto del instrumento, sólo una negativa.
   */
  it("dos hechos medidos con un instrumento VERIFICADO sí confirman una crítica", () => {
    const r = conInstrumento("VERIFICADO");
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(r.ph?.severity).toBe("CRITICAL");
  });

  it("con el instrumento VENCIDO de revisión, las mismas lecturas NO confirman", () => {
    const r = conInstrumento("REVISION_VENCIDA");
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(r.ph?.severity, "vencido avisa, no confirma").not.toBe("CRITICAL");
    // Y sigue siendo usable: el motor las ve, que es la mitad de la decisión de
    // Daniel que un `UNCALIBRATED` habría destruido.
    expect(r.ph?.status, "vencido NO se excluye del cálculo").not.toBe("DATA_INSUFFICIENT");
  });

  it("y con un instrumento que FALLÓ su contraste, quedan fuera del cálculo", () => {
    const r = conInstrumento("VERIFICACION_FALLIDA");
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(r.ph?.status).toBe("DATA_INSUFFICIENT");
  });

  /**
   * **La que impide que desplegar esto apague la pantalla.** Hoy ninguna lectura
   * declara instrumento; si el hueco impusiera confianza, este veredicto —que es
   * el mismo que la suite ya verifica más arriba— dejaría de existir.
   */
  it("sin instrumento declarado, el veredicto es exactamente el de antes", () => {
    const r = conInstrumento(undefined);
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(r.ph?.severity).toBe("CRITICAL");
    expect(r.limitaciones, "pero se dice en voz alta").toContain("SIN_INSTRUMENTO_DECLARADO");
  });

  it("y con instrumento declarado, esa limitación NO se declara", () => {
    const r = conInstrumento("VERIFICADO");
    if (typeof r === "string") throw new Error("debía haber veredicto");
    expect(r.limitaciones).not.toContain("SIN_INSTRUMENTO_DECLARADO");
  });
});

it("emite UNEVEN_DRYING cuando dos zonas de la misma cama difieren, y no cuando son réplica", () => {
  const base = { variable: "moisture", occurredAt: new Date("2026-03-05T09:00:00Z"),
                 provenanceClass: "direct_observation", fueCorregida: false,
                 materialState: "PARCHMENT", samplingEventId: "ev-1" } as const;

  const zonas = fase(veredictoDelLote({
    fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
    gradoDeProceso: "Washed", ahora: new Date("2026-03-05T12:00:00Z"),
    mediciones: [
      { ...base, value: 22, samplingRole: "ZONE" },
      { ...base, value: 13, samplingRole: "ZONE" },
    ],
  }));
  expect(zonas.secado?.status).toBe("UNEVEN_DRYING");

  // Control positivo: los MISMOS números como réplica NO alertan — su diferencia
  // es ruido de muestreo, y alertar con ellos sería inventar una señal.
  const replica = fase(veredictoDelLote({
    fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
    gradoDeProceso: "Washed", ahora: new Date("2026-03-05T12:00:00Z"),
    mediciones: [
      { ...base, value: 22, samplingRole: "REPLICATE" },
      { ...base, value: 13, samplingRole: "REPLICATE" },
    ],
  }));
  expect(replica.secado?.status).not.toBe("UNEVEN_DRYING");
});


// `veredictoDelLote` devuelve `VeredictoDeFase | SinVeredicto`, y `SinVeredicto`
// es una cadena. Sin este guardia, `v.secado` no compila — y peor, un
// `(v as any).secado` daría `undefined` y el `not.toContain` pasaría VACÍO.
function fase(v: ReturnType<typeof veredictoDelLote>) {
  if (typeof v === "string") throw new Error(`esperaba un veredicto, salió ${v}`);
  return v;
}

const COMUN = {
  fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
  gradoDeProceso: "Washed",
  ahora: new Date("2026-03-20T12:00:00Z"),
} as const;

const HUMEDAD_EN_OBJETIVO = {
  variable: "moisture", value: 11, occurredAt: new Date("2026-03-19T09:00:00Z"),
  provenanceClass: "direct_observation", fueCorregida: false,
  materialState: "PARCHMENT", samplingRole: "ZONE", samplingEventId: "ev-aw",
} as const;

it("emite TARGET_REACHED sólo cuando hay humedad Y actividad de agua", () => {
  const conAw = fase(veredictoDelLote({
    ...COMUN,
    mediciones: [
      HUMEDAD_EN_OBJETIVO,
      { variable: "water_activity", value: 0.58, occurredAt: new Date("2026-03-19T09:05:00Z"),
        provenanceClass: "direct_observation", fueCorregida: false,
        materialState: "PARCHMENT", samplingEventId: "ev-aw" },
    ],
  }));
  expect(conAw.secado?.status).toBe("TARGET_REACHED");

  // Control positivo: LA MISMA humedad sin actividad de agua no alcanza el
  // objetivo, y además lo dice en vez de callarlo.
  const sinAw = fase(veredictoDelLote({ ...COMUN, mediciones: [HUMEDAD_EN_OBJETIVO] }));
  expect(sinAw.secado?.status).not.toBe("TARGET_REACHED");
  expect(sinAw.limitaciones).toContain("SIN_ACTIVIDAD_DE_AGUA");
});


it("un lote SIN el dato nuevo sigue declarando sus limitaciones, no se calla", () => {
  const viejo = fase(veredictoDelLote({
    fase: { tipo: "secado", iniciadaEn: new Date("2026-03-01T06:00:00Z") },
    gradoDeProceso: "Washed", ahora: new Date("2026-03-05T12:00:00Z"),
    mediciones: [{ variable: "moisture", value: 15, occurredAt: new Date("2026-03-04T09:00:00Z"),
                   provenanceClass: "direct_observation", fueCorregida: false }],
  }));
  expect(viejo.limitaciones).toContain("UN_SOLO_PUNTO_DE_CAMA");
  expect(viejo.limitaciones).toContain("SIN_ACTIVIDAD_DE_AGUA");
});


it("declara sólo los datos que faltan y no mezcla inspecciones ni lecturas corregidas", () => {
  const aw = { ...HUMEDAD_EN_OBJETIVO, variable: "water_activity", value: 0.58 };
  const evaluar = (mediciones: MedicionDelLote[]) => fase(veredictoDelLote({ ...COMUN, mediciones }));
  const completa = evaluar([
    { ...HUMEDAD_EN_OBJETIVO, estadoDelInstrumento: "VERIFICADO" },
    { ...HUMEDAD_EN_OBJETIVO, value: 11.2 }, aw,
  ]);
  expect(completa.secado?.status).toBe("TARGET_REACHED");
  expect(completa.secado?.readingsUsed).toBe(1);
  expect(completa.limitaciones).toEqual([]);
  for (const extra of [{ samplingEventId: "otra" }, { samplingEventId: null }, { fueCorregida: true }]) {
    const separada = evaluar([HUMEDAD_EN_OBJETIVO, { ...aw, ...extra }]);
    expect(separada.secado?.waterActivity).toBeNull();
    expect(separada.secado?.status).toBe("DRYING_NORMAL");
    expect(separada.limitaciones).toContain("SIN_ACTIVIDAD_DE_AGUA");
  }
  for (const extra of [{ samplingEventId: "otra" }, { samplingEventId: null }, { fueCorregida: true }, { samplingRole: "REPLICATE" as const }]) {
    const separada = evaluar([HUMEDAD_EN_OBJETIVO, { ...HUMEDAD_EN_OBJETIVO, value: 22, ...extra }]);
    expect(separada.secado?.dispersionPp).toBeNull();
    expect(separada.limitaciones).toContain("UN_SOLO_PUNTO_DE_CAMA");
  }
});

it("Brix distingue el estado material real y declara el punto ausente", () => {
  const evaluar = (materiales: MedicionDelLote["materialState"][]) => fase(veredictoDelLote({
    fase: { tipo: "fermentacion", iniciadaEn: INICIO }, gradoDeProceso: "Washed", ahora: h(6),
    mediciones: materiales.map((materialState, i) => lectura(21 - i, i * 6, { variable: "brix", materialState })),
  }));
  const mezclada = evaluar(["CHERRY", "MUCILAGE_HONEY", "PARCHMENT"]);
  expect(mezclada.brix?.status).toBe("MIXED_SAMPLE_POINTS");
  expect(mezclada.limitaciones).not.toContain("SIN_PUNTO_DE_MUESTREO");
  expect(evaluar(["CHERRY", undefined]).limitaciones).toContain("SIN_PUNTO_DE_MUESTREO");
  const verde = evaluar(["GREEN"]);
  expect(verde.brix).toBeNull();
  expect(verde.limitaciones).toContain("SIN_PUNTO_DE_MUESTREO");
});
