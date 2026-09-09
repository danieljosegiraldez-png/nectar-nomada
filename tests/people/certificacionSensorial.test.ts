/**
 * Lo que decide qué credencial acaba en producción.
 *
 * **Por qué importa (2026-09-07).** `Person.sensoryCertifications` es una columna
 * `Json?`: acepta literalmente cualquier cosa. Desde ayer un informe de cata
 * externo se atribuye a una persona, y lo que hace que ese puntaje signifique
 * algo es qué credencial tenía quien lo firmó. Esta validación es lo único que
 * hay entre una línea de terminal mal escrita y una columna que nadie podrá
 * volver a leer.
 *
 * La última prueba de cada bloque es la que da sentido a las demás: **lo válido
 * pasa**. Sin ellas, un validador que rechazara todo saldría igual de verde.
 */
import { describe, expect, it } from "vitest";
import {
  agregarCertificacion,
  leerCertificaciones,
  validarCertificacion,
  CertificacionInvalida,
  type CertificacionSensorial,
} from "../../lib/people/certificacionSensorial";

const Q: CertificacionSensorial = {
  certifying_body: "CQI",
  certification_name: "Q Arabica Grader",
  date_earned: "2024-05-01",
};

describe("validarCertificacion", () => {
  it("acepta lo mínimo: cuerpo, nombre y fecha", () => {
    expect(validarCertificacion({ ...Q })).toEqual(Q);
  });

  it("acepta los seis campos de §7.3", () => {
    const completa = {
      ...Q,
      level_or_rank: "Q",
      expiry_date: "2027-05-01",
      certificate_reference: "Q-12345",
    };
    expect(validarCertificacion(completa)).toEqual(completa);
  });

  it("recorta los espacios de alrededor", () => {
    expect(validarCertificacion({ ...Q, certifying_body: "  CQI  " }).certifying_body).toBe("CQI");
  });

  /**
   * **Lo ausente se guarda ausente.** Una cadena vacía en
   * `certificate_reference` afirma que hay una referencia y que es vacía; la
   * ausencia dice lo que pasa de verdad, que nadie la anotó (CLAUDE.md §3).
   */
  it("quita las opcionales vacías en vez de guardarlas como cadena vacía", () => {
    const r = validarCertificacion({ ...Q, level_or_rank: "   ", certificate_reference: "" });
    expect("level_or_rank" in r).toBe(false);
    expect("certificate_reference" in r).toBe(false);
  });

  // `date_earned` salió de esta lista el 2026-09-08: ver el bloque «la fecha es
  // opcional» más abajo. Quedan las dos sin las cuales no se afirma nada.
  for (const campo of ["certifying_body", "certification_name"] as const) {
    it(`rechaza que falte "${campo}"`, () => {
      const d: Record<string, unknown> = { ...Q };
      delete d[campo];
      expect(() => validarCertificacion(d)).toThrow(new RegExp(`Falta "${campo}"`));
    });

    it(`rechaza "${campo}" con sólo espacios`, () => {
      expect(() => validarCertificacion({ ...Q, [campo]: "   " })).toThrow(CertificacionInvalida);
    });
  }

  it("rechaza una fecha con otro formato", () => {
    expect(() => validarCertificacion({ ...Q, date_earned: "01/05/2024" })).toThrow(/AAAA-MM-DD/);
  });

  /** `2026-02-31` casa el patrón y no existe. */
  it("rechaza una fecha que casa el patrón pero no existe", () => {
    expect(() => validarCertificacion({ ...Q, date_earned: "2026-02-31" })).toThrow(/fecha real/);
  });

  it("rechaza un vencimiento anterior a la fecha de obtención", () => {
    expect(() => validarCertificacion({ ...Q, expiry_date: "2023-01-01" })).toThrow(/anterior a "date_earned"/);
  });

  it("acepta un vencimiento el mismo día", () => {
    expect(validarCertificacion({ ...Q, expiry_date: Q.date_earned }).expiry_date).toBe(Q.date_earned);
  });

  it("rechaza lo que no es un objeto", () => {
    expect(() => validarCertificacion("Q Grader")).toThrow(CertificacionInvalida);
  });
});

describe("leerCertificaciones", () => {
  it("una columna nula es una lista vacía, no un error", () => {
    expect(leerCertificaciones(null)).toEqual([]);
    expect(leerCertificaciones(undefined)).toEqual([]);
  });

  it("lee una lista buena", () => {
    expect(leerCertificaciones([Q])).toEqual([Q]);
  });

  /**
   * **No repara lo que encuentra.** Arreglar una fila rota en silencio
   * convertiría un dato roto en uno plausible, que es peor: nadie volvería a
   * mirarlo.
   */
  it("falla nombrando cuál de las guardadas está rota, en vez de saltársela", () => {
    expect(() => leerCertificaciones([Q, { certifying_body: "CQI" }])).toThrow(/certificación 2/);
  });

  it("falla si la columna no es una lista", () => {
    expect(() => leerCertificaciones({ q: true })).toThrow(/no es una lista/);
  });
});

describe("agregarCertificacion", () => {
  it("añade sobre una lista vacía", () => {
    expect(agregarCertificacion([], Q)).toEqual([Q]);
  });

  it("conserva las que ya estaban", () => {
    const otra = { ...Q, certifying_body: "SCA", certification_name: "CVA" };
    expect(agregarCertificacion([Q], otra)).toEqual([Q, otra]);
  });

  /**
   * Renovar produce otra fecha, y las dos filas deben convivir: el historial de
   * credenciales es parte de la procedencia de cada informe que firmó.
   */
  it("la misma certificación con otra fecha SÍ entra: es una renovación", () => {
    const renovada = { ...Q, date_earned: "2027-05-01" };
    expect(agregarCertificacion([Q], renovada)).toHaveLength(2);
  });

  it("rechaza la misma exacta", () => {
    expect(() => agregarCertificacion([Q], { ...Q })).toThrow(/ya tiene/);
  });

  it("rechaza la misma escrita con otras mayúsculas", () => {
    expect(() => agregarCertificacion([Q], { ...Q, certifying_body: "cqi" })).toThrow(/ya tiene/);
  });
});

/**
 * **La fecha es opcional desde el 2026-09-08, y el caso que lo obligó.**
 *
 * Kurt Ngo está en la base como Q de CQI con `date_earned: null` porque nadie
 * supo la fecha. Exigirla no produjo una fila con fecha: produjo una que **ni
 * se podía leer**, y que llegó a dejar la pantalla de informes externos sin
 * abrirse. La fila de abajo es la suya, copiada tal cual de la base.
 */
describe("una credencial de la que no se sabe la fecha", () => {
  const KURT = {
    date_earned: null,
    expiry_date: null,
    level_or_rank: null,
    certifying_body: "CQI",
    certification_name: "Q Grader",
    certificate_reference: null,
  };

  it("la fila que hay en la base se lee, y sin inventarle fecha", () => {
    const r = validarCertificacion(KURT);
    expect(r.certifying_body).toBe("CQI");
    expect(r.certification_name).toBe("Q Grader");
    expect("date_earned" in r, "ausente, no null ni cadena vacía").toBe(false);
  });

  it("y `leerCertificaciones` la devuelve en vez de tumbar la lista entera", () => {
    expect(leerCertificaciones([KURT])).toHaveLength(1);
  });

  /**
   * El control positivo de las dos de arriba: opcional no significa que valga
   * cualquier cosa. Sin esto, un validador que aceptara todo las pasaría igual.
   */
  it("pero una fecha presente sigue teniendo que ser una fecha de verdad", () => {
    expect(() => validarCertificacion({ ...KURT, date_earned: "2026-02-31" })).toThrow(/fecha real/);
    expect(() => validarCertificacion({ ...KURT, date_earned: "01/05/2024" })).toThrow(/AAAA-MM-DD/);
  });

  it("un vencimiento sin fecha de obtención entra: no hay contra qué compararlo", () => {
    expect(validarCertificacion({ ...KURT, expiry_date: "2027-05-01" }).expiry_date).toBe("2027-05-01");
  });

  /**
   * El flujo que describió el dueño: Kurt entra con su cuenta y confirma la
   * fecha. Lo que corresponde entonces es rellenar el hueco, no dejarle dos
   * «Q Grader (CQI)» en la lista.
   */
  it("cuando su titular confirma la fecha, COMPLETA el marcador en vez de duplicarlo", () => {
    const marcador = validarCertificacion(KURT);
    const confirmada = validarCertificacion({ ...KURT, date_earned: "2019-11-08", level_or_rank: "Q" });
    const salida = agregarCertificacion([marcador], confirmada);
    expect(salida, "una credencial, no dos").toHaveLength(1);
    expect(salida[0]!.date_earned).toBe("2019-11-08");
    expect(salida[0]!.level_or_rank).toBe("Q");
  });

  it("completar nunca pisa un valor que ya estaba", () => {
    const previa = validarCertificacion({ ...KURT, level_or_rank: "Q", certificate_reference: "REF-VIEJA" });
    const confirmada = validarCertificacion({ ...KURT, date_earned: "2019-11-08" });
    const salida = agregarCertificacion([previa], confirmada);
    expect(salida[0]!.certificate_reference, "la referencia previa sobrevive").toBe("REF-VIEJA");
    expect(salida[0]!.level_or_rank).toBe("Q");
    expect(salida[0]!.date_earned).toBe("2019-11-08");
  });

  it("al revés no: una sin fecha no se añade sobre una que ya la tiene", () => {
    const conFecha = validarCertificacion({ ...KURT, date_earned: "2019-11-08" });
    expect(() => agregarCertificacion([conFecha], validarCertificacion(KURT))).toThrow(/no añade nada/);
  });

  it("y dos sin fecha de la misma credencial siguen siendo la misma", () => {
    const marcador = validarCertificacion(KURT);
    expect(() => agregarCertificacion([marcador], validarCertificacion(KURT))).toThrow(/sin fecha/);
  });
});
