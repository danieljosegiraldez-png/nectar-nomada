/**
 * La cola de atención del tablero del beneficio: qué grupo y en qué orden.
 *
 * **Lo que estas pruebas existen para impedir.** El riesgo de una cola no es que no ordene: es
 * que **diga algo tranquilizador sin haberlo medido** — «en curso» sobre un lote del que no se
 * sabe nada, o «en hora» sobre uno cuya receta nadie declaró. Por eso la primera prueba es que
 * «Sin veredicto» NUNCA se mezcla con «En curso»: no saber no es ir bien.
 *
 * Hermética: sin base, así que NO va a `scripts/pruebas-por-compuerta.txt`.
 */
import { describe, expect, it } from "vitest";
import {
  colaDeAtencion,
  ocupacionDelSitio,
  type EntradaDeLoteParaTablero,
} from "../../lib/beneficio/tablero";

const HORA = 3_600_000;
const AHORA = new Date("2026-03-10T12:00:00.000Z");
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * HORA);

const SIN_DESVIACIONES = new Map<string, number>();

/** Un dictamen mínimo: la cola sólo lee `status` y `severity`. */
const dictamen = (status: string, severity: "INFO" | "WARNING" | "CRITICAL") => ({ status, severity });

function lote(over: Partial<EntradaDeLoteParaTablero> = {}): EntradaDeLoteParaTablero {
  return {
    lotId: "l-base",
    lotCode: "LOTE-BASE",
    veredicto: { ph: dictamen("LAG_PHASE", "INFO"), brix: null, secado: null },
    faseIniciada: haceHoras(10),
    expectedHours: 24,
    metas: [{ variable: "ph", everyHours: 6, ultimaLectura: haceHoras(2) }],
    ultimaLectura: haceHoras(2),
    ...over,
  };
}

const CRITICO = lote({
  lotId: "l-critico",
  veredicto: { ph: dictamen("STALLED_ROT_HAZARD", "CRITICAL"), brix: null, secado: null },
});
const LISTO = lote({
  lotId: "l-listo",
  veredicto: { ph: null, brix: dictamen("TERMINATION_READY", "INFO"), secado: null },
});
const AVISO = lote({
  lotId: "l-aviso",
  veredicto: { ph: dictamen("SUSPECT_DILUTION", "WARNING"), brix: null, secado: null },
});
const SIN_VEREDICTO = lote({ lotId: "l-sin", veredicto: "SIN_LECTURAS" });
const EN_CURSO = lote({ lotId: "l-curso" });

describe("colaDeAtencion", () => {
  it("ordena los cinco grupos: critico, listo, aviso, sin veredicto, en curso", () => {
    const filas = colaDeAtencion({
      lotes: [EN_CURSO, SIN_VEREDICTO, AVISO, LISTO, CRITICO],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(filas.map((f) => f.grupo)).toEqual([
      "critico",
      "listo_para_decidir",
      "aviso",
      "sin_veredicto",
      "en_curso",
    ]);
  });

  it("un lote sin lecturas va a sin_veredicto, jamás a en_curso", () => {
    const [fila] = colaDeAtencion({
      lotes: [SIN_VEREDICTO],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(fila!.grupo).toBe("sin_veredicto");
    expect(fila!.motivos).toContain("SIN_LECTURAS");
  });

  it("dato insuficiente o sensor en falla también son sin_veredicto", () => {
    const filas = colaDeAtencion({
      lotes: [
        lote({ lotId: "a", veredicto: { ph: dictamen("DATA_INSUFFICIENT", "INFO"), brix: null, secado: null } }),
        lote({ lotId: "b", veredicto: { ph: null, brix: dictamen("SENSOR_FAULT", "INFO"), secado: null } }),
      ],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(filas.map((f) => f.grupo)).toEqual(["sin_veredicto", "sin_veredicto"]);
  });

  it("gana el grupo más grave, y la fila lleva TODOS sus motivos", () => {
    const [fila] = colaDeAtencion({
      lotes: [
        lote({
          lotId: "ambos",
          veredicto: {
            ph: dictamen("STALLED_ROT_HAZARD", "CRITICAL"),
            brix: dictamen("TERMINATION_READY", "INFO"),
            secado: null,
          },
        }),
      ],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(fila!.grupo).toBe("critico");
    expect(fila!.motivos).toContain("STALLED_ROT_HAZARD");
    expect(fila!.motivos).toContain("TERMINATION_READY");
  });

  it("una lectura debida sube un lote de en_curso a aviso", () => {
    const debiendo = lote({
      lotId: "debe",
      metas: [{ variable: "ph", everyHours: 6, ultimaLectura: haceHoras(7) }],
      ultimaLectura: haceHoras(7),
    });
    const [fila] = colaDeAtencion({
      lotes: [debiendo],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(fila!.grupo).toBe("aviso");
  });

  /**
   * Ir tarde **no** cambia de grupo, porque una fase larga puede ser deliberada (Daniel,
   * 2026-09-17). Sólo ordena dentro del suyo.
   */
  it("ir tarde no cambia de grupo, pero ordena por encima de uno en hora", () => {
    const tarde = lote({ lotId: "tarde", faseIniciada: haceHoras(40), expectedHours: 24 });
    const enHora = lote({ lotId: "enhora", faseIniciada: haceHoras(10), expectedHours: 24 });
    const filas = colaDeAtencion({
      lotes: [enHora, tarde],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(filas.every((f) => f.grupo === "en_curso")).toBe(true);
    expect(filas[0]!.lotId).toBe("tarde");
  });

  /**
   * `demora: null` es «no se sabe» y `demora: false` es «en hora». `puntajeDeUrgencia` los puntúa
   * **igual a propósito**, así que la diferencia la tiene que hacer la fila: nunca se pinta un
   * `null` como «en hora».
   */
  it("demora null y demora false dan el mismo puntaje y texto distinto", () => {
    // **Los dos llevan una lectura debida a propósito.** Sin ella los dos puntúan 0 y la
    // igualdad de abajo es trivialmente cierta: la primera versión de esta prueba pasaba
    // idéntica con la regla mutada, y el flip-test lo destapó con 0 caídas. El
    // `not.toBe(0)` es el control que hace que la igualdad signifique algo.
    const debidas = [{ variable: "ph", everyHours: 6, ultimaLectura: haceHoras(7) }];
    const sinDuracion = lote({ lotId: "sinDur", expectedHours: null, faseIniciada: haceHoras(10), metas: debidas });
    const enHora = lote({ lotId: "enHora", expectedHours: 24, faseIniciada: haceHoras(10), metas: debidas });
    const filas = colaDeAtencion({
      lotes: [sinDuracion, enHora],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    const a = filas.find((f) => f.lotId === "sinDur")!;
    const b = filas.find((f) => f.lotId === "enHora")!;
    expect(a.puntaje).not.toBe(0);
    expect(a.puntaje).toBe(b.puntaje);
    expect("demora" in a.ritmo ? a.ritmo.demora : "error").toBeNull();
    expect("demora" in b.ritmo ? b.ritmo.demora : "error").toBe(false);
  });

  it("una desviación de balance abierta sube a aviso, y nunca a critico", () => {
    const filas = colaDeAtencion({
      lotes: [EN_CURSO],
      desviacionesAbiertasPorLote: new Map([[EN_CURSO.lotId, 1]]),
      ahora: AHORA,
    });
    expect(filas[0]!.grupo).toBe("aviso");
    expect(filas[0]!.motivos).toContain("DESVIACION_DE_BALANCE_ABIERTA");
  });

  it("sin desviación abierta, el mismo lote se queda en en_curso", () => {
    const filas = colaDeAtencion({
      lotes: [EN_CURSO],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(filas[0]!.grupo).toBe("en_curso");
  });

  it("orden determinista: a igual puntaje y misma última lectura, por lotId", () => {
    const a = lote({ lotId: "bbb", ultimaLectura: haceHoras(3) });
    const b = lote({ lotId: "aaa", ultimaLectura: haceHoras(3) });
    const uno = colaDeAtencion({ lotes: [a, b], desviacionesAbiertasPorLote: SIN_DESVIACIONES, ahora: AHORA });
    const otro = colaDeAtencion({ lotes: [b, a], desviacionesAbiertasPorLote: SIN_DESVIACIONES, ahora: AHORA });
    expect(uno.map((f) => f.lotId)).toEqual(["aaa", "bbb"]);
    expect(otro.map((f) => f.lotId)).toEqual(["aaa", "bbb"]);
  });

  /**
   * Un dato corrupto no tumba la página. `estadoDeRitmo` lanza `RitmoError` ante un ritmo `≤ 0`,
   * una fase que empieza en el futuro o una lectura futura; se captura **lote por lote**.
   */
  it("un lote con ritmo inválido no tumba a los demás", () => {
    const roto = lote({ lotId: "roto", metas: [{ variable: "ph", everyHours: 0, ultimaLectura: haceHoras(2) }] });
    const filas = colaDeAtencion({
      lotes: [roto, EN_CURSO],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(filas).toHaveLength(2);
    const r = filas.find((f) => f.lotId === "roto")!;
    expect(r.grupo).toBe("sin_veredicto");
    expect("error" in r.ritmo).toBe(true);
    expect(filas.find((f) => f.lotId === EN_CURSO.lotId)!.grupo).toBe("en_curso");
  });

  it("un lote sin fase abierta no entra en la cola", () => {
    const filas = colaDeAtencion({
      lotes: [lote({ lotId: "sinFase", faseIniciada: null })],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    expect(filas).toHaveLength(0);
  });
});

describe("ocupacionDelSitio", () => {
  const unidad = (id: string, over: { condicion?: string | null; retirado?: boolean } = {}) => ({
    id,
    lifecycleStatus: (over.retirado ? "retired" : "active") as "active" | "retired" | "disposed",
    condicion: (over.condicion ?? null) as
      | "operational"
      | "needs_cleaning"
      | "needs_maintenance"
      | "faulty"
      | "out_of_service"
      | null,
  });
  const corrida = (over: Partial<{ equipmentId: string | null; bedLocationId: string | null; vesselNote: string | null }> = {}) => ({
    equipmentId: null,
    bedLocationId: null,
    vesselNote: null,
    ...over,
  });

  /**
   * **El error caro.** Asignar una corrida por el texto libre de `vesselNote` haría parecer
   * libre un tanque que no lo está, y alguien le echaría cereza encima. Así que no se asigna a
   * ninguna unidad y se cuenta aparte, en voz alta.
   */
  it("una corrida con el tanque sólo en texto libre no ocupa ningún tanque", () => {
    const o = ocupacionDelSitio({
      tanques: [unidad("t1"), unidad("t2")],
      camas: [],
      corridas: [corrida({ vesselNote: "el de la esquina" })],
    });
    expect(o.sinUnidadDeclarada).toBe(1);
    expect(o.tanques.enUso).toBe(0);
    expect(o.tanques.libresYSanos).toBe(2);
  });

  it("un tanque libre pero averiado no cuenta como libre y sano", () => {
    const o = ocupacionDelSitio({
      tanques: [unidad("sano"), unidad("averiado", { condicion: "faulty" })],
      camas: [],
      corridas: [],
    });
    expect(o.tanques.total).toBe(2);
    expect(o.tanques.libresYSanos).toBe(1);
    expect(o.tanques.requierenIntervencion).toBe(1);
    expect(o.tanques.enUso).toBe(0);
  });

  it("dos corridas abiertas en la misma unidad son un conflicto de datos", () => {
    const o = ocupacionDelSitio({
      tanques: [unidad("t1")],
      camas: [],
      corridas: [corrida({ equipmentId: "t1" }), corrida({ equipmentId: "t1" })],
    });
    expect(o.conflictos).toEqual(["t1"]);
    // Sigue contando como UNO en uso, no dos: es una unidad, con un problema de datos.
    expect(o.tanques.enUso).toBe(1);
  });

  it("una sola corrida en una unidad NO es conflicto", () => {
    const o = ocupacionDelSitio({
      tanques: [unidad("t1")],
      camas: [],
      corridas: [corrida({ equipmentId: "t1" })],
    });
    expect(o.conflictos).toEqual([]);
    expect(o.tanques.enUso).toBe(1);
    expect(o.tanques.libresYSanos).toBe(0);
  });

  /**
   * Las camas se clasifican con el MISMO `clasificar` que los tanques, no con una regla
   * paralela. Y su `condicion` es siempre `null`: una cama no tiene informe de condición, así
   * que nunca puede salir «requiere intervención» por ese motivo.
   */
  it("las camas usan el mismo clasificador, y una con secado abierto está en uso", () => {
    const o = ocupacionDelSitio({
      tanques: [],
      camas: [unidad("c1"), unidad("c2"), unidad("c3")],
      corridas: [corrida({ bedLocationId: "c1" })],
    });
    expect(o.camas).toEqual({ total: 3, libresYSanos: 2, enUso: 1, requierenIntervencion: 0 });
  });

  it("una corrida que nombra una unidad que no es del sitio no ocupa nada y no se pierde", () => {
    const o = ocupacionDelSitio({
      tanques: [unidad("t1")],
      camas: [],
      corridas: [corrida({ equipmentId: "de-otro-sitio" })],
    });
    expect(o.tanques.enUso).toBe(0);
    expect(o.sinUnidadDeclarada).toBe(0);
    expect(o.ajenas).toBe(1);
  });
});
