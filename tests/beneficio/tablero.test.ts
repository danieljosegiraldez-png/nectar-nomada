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
  instrumentosQuePidenAtencion,
  pidenDecisionPorEtapa,
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

  /**
   * El mapa sale de la MISMA pasada que los resúmenes: si pintar el mapa tuviera su propia
   * cuenta, podría decir «libre» donde el resumen dice «en uso». Aquí se prueba que no pueden
   * discrepar, y que una unidad ocupada Y averiada lleva sus dos motivos.
   */
  it("el mapa trae cada unidad con su nombre y sus motivos, y casa con el resumen", () => {
    const o = ocupacionDelSitio({
      tanques: [
        { ...unidad("libre"), nombre: "Tanque 1" },
        { ...unidad("ocupado"), nombre: "Tanque 2" },
        { ...unidad("ambos", { condicion: "faulty" }), nombre: "Tanque 3" },
        unidad("sinNombre"),
      ],
      camas: [{ ...unidad("c1"), nombre: "Cama 1" }],
      corridas: [corrida({ equipmentId: "ocupado" }), corrida({ equipmentId: "ambos" }), corrida({ bedLocationId: "c1" })],
    });
    expect(o.mapa.tanques.map((c) => c.id)).toEqual(["libre", "ocupado", "ambos", "sinNombre"]);
    expect(o.mapa.tanques.map((c) => c.nombre)).toEqual(["Tanque 1", "Tanque 2", "Tanque 3", null]);
    expect(o.mapa.tanques.map((c) => c.motivos)).toEqual([[], ["EN_USO"], ["EN_USO", "CONDICION"], []]);
    expect(o.mapa.camas).toEqual([{ id: "c1", nombre: "Cama 1", libreYSano: false, motivos: ["EN_USO"] }]);
    // Casa con el resumen, que es lo que impide dos cuentas distintas.
    expect(o.mapa.tanques.filter((c) => c.libreYSano)).toHaveLength(o.tanques.libresYSanos);
    expect(o.mapa.camas.filter((c) => c.libreYSano)).toHaveLength(o.camas.libresYSanos);
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

describe("instrumentosQuePidenAtencion", () => {
  const eq = (id: string, kind: "instrument" | "vessel" | "tool" | "machine", verificacion: string) => ({
    id,
    name: `EQ ${id}`,
    kind,
    verificacion: verificacion as never,
  });

  it("devuelve sólo los tres estados que piden que alguien vaya", () => {
    const r = instrumentosQuePidenAtencion([
      eq("vencida", "instrument", "REVISION_VENCIDA"),
      eq("fallida", "instrument", "VERIFICACION_FALLIDA"),
      eq("sinver", "instrument", "SIN_VERIFICACION"),
      eq("ok", "instrument", "VERIFICADO"),
    ]);
    expect(r.map((i) => i.id)).toEqual(["vencida", "fallida", "sinver"]);
  });

  /**
   * **El filtro por `kind` se prueba con una entrada que el cargador real NO produce hoy:**
   * `listarEquipos` pone `SIN_INSTRUMENTO` a todo lo que no es instrumento, así que filtrar
   * sólo por estado ya los excluiría y esta prueba pasaría sin que el filtro por `kind`
   * existiera. Se construye el caso hostil a mano para que el filtro esté de verdad probado —
   * y así queda como red para el día que un traslado de `kind` o un importador produzcan la
   * combinación. Sin esto sería un guardia que no puede fallar.
   */
  it("un equipo que NO es instrumento no aparece, aunque su estado lo pidiera", () => {
    const r = instrumentosQuePidenAtencion([
      eq("tanque", "vessel", "REVISION_VENCIDA"),
      eq("maquina", "machine", "SIN_VERIFICACION"),
      eq("potenciometro", "instrument", "REVISION_VENCIDA"),
    ]);
    expect(r.map((i) => i.id)).toEqual(["potenciometro"]);
  });

  it("sin nada que pida atención devuelve una lista vacía, no null", () => {
    expect(instrumentosQuePidenAtencion([eq("ok", "instrument", "VERIFICADO")])).toEqual([]);
  });
});

describe("pidenDecisionPorEtapa", () => {
  // Hermético: la regla a probar es sólo a qué etapa va cada grupo de la cola, así que se le dan
  // ENTRADAS ya armadas, que ninguna base sembrada produce. (Vivió en `datosDelTablero.ts`, que
  // importa la base; es pura y su sitio es éste, junto a `colaDeAtencion`.)
  const entrada = (lotId: string, ph: ReturnType<typeof dictamen>): EntradaDeLoteParaTablero => ({
    lotId,
    lotCode: lotId,
    veredicto: { ph, brix: null, secado: null },
    faseIniciada: haceHoras(10),
    expectedHours: null,
    metas: [],
    ultimaLectura: null,
  });
  const critico = (id: string) => entrada(id, dictamen("OUT_OF_RANGE", "CRITICAL"));
  const listo = (id: string) => entrada(id, dictamen("TERMINATION_READY", "INFO"));
  const aviso = (id: string) => entrada(id, dictamen("DRIFTING", "WARNING"));
  const enCurso = (id: string) => entrada(id, dictamen("ON_TRACK", "INFO"));

  it("cuenta crítico y listo para decidir, y cada grupo cae en la etapa de SU fase", () => {
    const r = pidenDecisionPorEtapa({
      // Fermentación: 2 piden decisión (crítico + listo) y 2 no (aviso, en curso).
      fermentacion: [critico("f1"), listo("f2"), aviso("f3"), enCurso("f4")],
      // Secado: 1 pide decisión. **Distinto de 2 a propósito**: con el mismo número en las dos, cruzar
      // las fases pasaría la prueba.
      secado: [critico("s1"), enCurso("s2")],
      desviacionesAbiertasPorLote: SIN_DESVIACIONES,
      ahora: AHORA,
    });
    // Mutaciones que la hacen caer: contar `aviso`; cruzar fermentación con secado; contar sólo
    // `critico`; devolver sólo una de las dos claves.
    expect(r).toEqual({ proceso: 2, secado: 1 });
  });

  it("una desviación abierta sube a aviso, y aviso no pide decisión", () => {
    // **Lo que esto NO guarda, dicho:** el mapa de desviaciones no puede cambiar este recuento. Una
    // desviación sólo sube a `aviso` a quien NO era crítico ni listo (`colaDeAtencion`), y `aviso` no
    // cuenta; con un `new Map()` en su lugar el resultado es el mismo. Esta prueba comprueba que una
    // desviación no rompe la cuenta, no que el mapa llegue hasta aquí.
    const r = pidenDecisionPorEtapa({
      fermentacion: [enCurso("f1")],
      secado: [],
      desviacionesAbiertasPorLote: new Map([["f1", 1]]),
      ahora: AHORA,
    });
    expect(r).toEqual({ proceso: 0, secado: 0 });
  });

  it("sin entradas es 0 — y ese 0 sí es cierto, porque la etapa sí tiene cola", () => {
    expect(
      pidenDecisionPorEtapa({ fermentacion: [], secado: [], desviacionesAbiertasPorLote: SIN_DESVIACIONES, ahora: AHORA }),
    ).toEqual({ proceso: 0, secado: 0 });
  });
});
