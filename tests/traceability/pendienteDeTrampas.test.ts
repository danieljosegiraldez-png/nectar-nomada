/**
 * Hermética: sin base y sin reloj («hoy» entra como cadena). No va al grupo
 * `base-sembrada`; la corre el carril hermético de `scripts/ci.sh`.
 */
import { describe, expect, it } from "vitest";
import { avisosDeTrampas, trampasParaAviso, type IntervencionQueCubre } from "../../lib/traceability/pendienteDeTrampas";

const REGLA = {
  triggerLevel: "algunos" as const,
  normalDays: 14,
  alertDays: 7,
  suggestedAction: "aplicar Bralic",
  suggestedMaterial: null,
};
/** `observedAt` a medianoche UTC del mismo día que `dia`, como hace `trampasParaAviso`. */
const revision = (dia: string, brocaLevel: "ninguno" | "pocos" | "algunos" | "muchos" | null, id = "o1") => ({
  id,
  dia,
  observedAt: new Date(`${dia}T00:00:00Z`),
  brocaLevel,
});
const activa = (extra: Partial<Parameters<typeof avisosDeTrampas>[0]["trampas"][number]> = {}) => ({
  id: "t1", trapNumber: 7, bloque: "Norte", plotBlockId: null, status: "active" as const,
  ultimaRevision: null, instaladaEl: "2026-09-01", ...extra,
});
const sinIntervenciones: readonly IntervencionQueCubre[] = [];

describe("avisos de trampas", () => {
  it("sin regla no avisa de nada, por vencida que esté", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-12-31", trampas: [activa()], regla: null, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos).toEqual([]);
  });

  it("cuenta el plazo normal desde la instalación cuando nunca se revisó", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-16", trampas: [activa()], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("el día exacto del vencimiento todavía no avisa", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-15", trampas: [activa()], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos).toEqual([]);
  });

  it("usa el plazo de alerta cuando la última lectura disparó", () => {
    const t = activa({ ultimaRevision: revision("2026-09-10", "muchos") });
    const avisos = avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos.map((a) => a.tipo)).toContain("trampa_por_revisar");
  });

  it("propone la acción de la regla cuando la lectura disparó, y sin intervenciones (control) sale como siempre", () => {
    const t = activa({ ultimaRevision: revision("2026-09-16", "algunos") });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos).toContainEqual({
      tipo: "trampa_con_lectura_alta", specimenId: "t1", trapNumber: 7,
      lectura: "algunos", accion: "aplicar Bralic",
      observationId: "o1", plotBlockId: null, materialId: null, materialName: null,
    });
  });

  it("el aviso trae materialId/materialName de la regla cuando ésta apunta a un producto", () => {
    const t = activa({ ultimaRevision: revision("2026-09-16", "algunos") });
    const reglaConProducto = { ...REGLA, suggestedMaterial: { id: "m1", name: "Bralic WP" } };
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: reglaConProducto, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos).toContainEqual(
      expect.objectContaining({ tipo: "trampa_con_lectura_alta", materialId: "m1", materialName: "Bralic WP" }),
    );
  });

  it("una lectura por debajo del disparador no propone nada", () => {
    const t = activa({ ultimaRevision: revision("2026-09-16", "pocos") });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" });
    expect(avisos.map((a) => a.tipo)).not.toContain("trampa_con_lectura_alta");
  });

  it("una trampa retirada no genera avisos", () => {
    const t = activa({ status: "removed", ultimaRevision: revision("2026-01-01", "muchos") });
    expect(avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" })).toEqual([]);
  });

  // F7 fix-final — escenario de Codex: instalada el 1 de enero, retirada el 2
  // de enero, reinstalada el 18 de septiembre. Sin el arreglo, la lectura alta
  // de antes del retiro seguía proponiendo "aplicar Bralic" y el plazo corría
  // desde el 1 de enero, así que una trampa reinstalada HOY aparecía vencida
  // por meses el mismo día que se puso de nuevo en el suelo.
  it("el plazo corre desde la reinstalación, e ignora una lectura alta de antes del retiro", () => {
    const t = activa({
      instaladaEl: "2026-09-18", // la reinstalación, no la instalación original (1 de enero)
      ultimaRevision: revision("2026-01-01", "muchos"),
    });
    expect(avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" })).toEqual([]);
  });
});

// Tarea 4, spec §4.2: «atendido» apaga SÓLO `trampa_con_lectura_alta`, nunca
// `trampa_por_revisar`. Una fila por combinación de la tabla del spec, más los
// bordes que el brief pide explícitamente.
//
// Revisión final del PR B, hallazgos 1 y 3: `hoy` es "2026-09-12", DESPUÉS de
// las intervenciones "posteriores" (2026-09-11) — antes era "2026-09-10",
// igual al día de la lectura, lo que habría hecho que el arreglo del hallazgo
// 3 (excluir intervenciones futuras) las tratara como futuras y las
// invalidara por la razón equivocada. Con `hoy` más adelante, cada fila sigue
// probando SÓLO lo que su nombre dice.
describe("«atendido»: una intervención posterior que cubre la trampa", () => {
  // Lectura del 10, que dispara con REGLA (triggerLevel "algunos"). Del 10 al
  // 12 van 2 días, muy por debajo del plazo de alerta (7): nunca sale
  // `trampa_por_revisar` por sí solo, así que el único aviso posible es el de
  // lectura alta y una fila que falla no se puede confundir con la otra.
  const conBloque = (plotBlockId: string | null) =>
    activa({ plotBlockId, ultimaRevision: revision("2026-09-10", "muchos") });
  const hoy = "2026-09-12";
  const soloLecturaAlta = (avisos: ReturnType<typeof avisosDeTrampas>) => avisos.map((a) => a.tipo);

  it("parcela entera posterior → atendido", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual([]);
  });

  it("bloque propio posterior → atendido", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: ["B1"] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual([]);
  });

  it("OTRO bloque → no atiende", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: ["B2"] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("sólo plantas (parcelaEntera: false, plotBlockIds: []) → no atiende", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("trampa sin bloque + intervención con bloque cualquiera → no atiende", () => {
    const t = conBloque(null);
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: ["B1"] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("trampa sin bloque + parcela entera → atendido", () => {
    const t = conBloque(null);
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual([]);
  });

  it("intervención ANTERIOR a la lectura → no atiende", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-09T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual(["trampa_con_lectura_alta"]);
  });

  // Revisión final, hallazgo 1: el borde ya no es sólo el instante — es el
  // DÍA. Antes esta intervención (mismo día que la lectura, pero de hora
  // POSTERIOR: 20:00 contra la medianoche de la lectura) atendía, porque
  // `20:00Z > 00:00Z` como instantes. La lectura es un campo de día: comparar
  // el día evita afirmar que pasó un día completo cuando no pasó.
  it("intervención del MISMO día que la lectura, aunque de hora posterior → no atiende (el borde es por DÍA, no por instante)", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-10T20:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual(["trampa_con_lectura_alta"]);
  });

  // El tipo de intervención NUNCA entra en la regla — `IntervencionQueCubre`
  // ni siquiera lleva `kind`: un manejo cultural cubre exactamente igual que
  // una aplicación, porque la regla sugiere, no manda (spec de la pieza 2, §5).
  it("un manejo cultural cuenta igual que una aplicación: el tipo no entra en la regla", () => {
    const t = conBloque("B1");
    // Sin campo `kind`: esta misma forma es la que produce una aplicación,
    // una liberación de enemigos naturales o un manejo cultural.
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones, zona: "UTC" }))).toEqual([]);
  });

  it("el aviso de revisión vencida sale aunque la lectura alta esté atendida", () => {
    const t = activa({ plotBlockId: "B1", instaladaEl: "2026-07-01", ultimaRevision: revision("2026-08-01", "muchos") });
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-08-02T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    // Lectura alta → plazo de alerta (7 días). Del 1 de agosto al 20 van 19: 12 de retraso.
    const avisos = avisosDeTrampas({ hoy: "2026-08-20", trampas: [t], regla: REGLA, intervenciones, zona: "UTC" });
    expect(avisos).toEqual([{ tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 12 }]);
  });
});

/**
 * Revisión final del PR B, hallazgo 1: el día se compara en la zona de la
 * PARCELA (`avisosDeTrampas.zona`), la misma que calculó `hoy` — nunca UTC a
 * secas. Con América/Panamá (UTC−5), un instante puede caer en un día
 * distinto en UTC y en la zona local; lo que cuenta es el día LOCAL.
 */
describe("el día de la intervención se compara en la zona de la parcela — revisión final, hallazgo 1", () => {
  const t = () => activa({ plotBlockId: null, ultimaRevision: revision("2026-09-10", "muchos") });

  it("mismo día en Panamá aunque caiga en el día siguiente en UTC → no atiende", () => {
    // 2026-09-10T23:00:00Z menos 5 horas = 2026-09-10T18:00 en Panamá: SIGUE
    // siendo el 10. En UTC a secas también sería el 10, así que esta fila no
    // demuestra la zona por sí sola — la siguiente sí, con su contraste.
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-10T23:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    const avisos = avisosDeTrampas({ hoy: "2026-09-11", trampas: [t()], regla: REGLA, intervenciones, zona: "America/Panama" });
    expect(avisos.map((a) => a.tipo)).toEqual(["trampa_con_lectura_alta"]);
  });

  it("un instante que en UTC ya es el 11, pero en Panamá TODAVÍA es el 10 → no atiende (control: sí atendería en UTC)", () => {
    // 2026-09-11T02:00:00Z: en UTC es 11 de septiembre (día siguiente, ATENDERÍA
    // en UTC a secas); en Panamá (UTC−5) son las 2026-09-10T21:00, TODAVÍA el 10.
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T02:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    const enPanama = avisosDeTrampas({ hoy: "2026-09-11", trampas: [t()], regla: REGLA, intervenciones, zona: "America/Panama" });
    expect(enPanama.map((a) => a.tipo)).toEqual(["trampa_con_lectura_alta"]);
    // Control: la MISMA intervención, comparada en UTC, sí atiende — la
    // diferencia es exclusivamente la zona que se pasó.
    const enUtc = avisosDeTrampas({ hoy: "2026-09-11", trampas: [t()], regla: REGLA, intervenciones, zona: "UTC" });
    expect(enUtc.map((a) => a.tipo)).toEqual([]);
  });

  it("al día siguiente EN PANAMÁ → atiende", () => {
    // 2026-09-11T06:00:00Z menos 5 horas = 2026-09-11T01:00 en Panamá: el 11,
    // un día completo después del 10.
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T06:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    const avisos = avisosDeTrampas({ hoy: "2026-09-11", trampas: [t()], regla: REGLA, intervenciones, zona: "America/Panama" });
    expect(avisos.map((a) => a.tipo)).toEqual([]);
  });
});

/**
 * Revisión final del PR B, hallazgo 3: una fecha futura no puede atender
 * nada HOY, aunque sea de un día posterior al de la lectura. Distinto del
 * hallazgo 1 (mismo día que la lectura): aquí el día de la intervención SÍ es
 * posterior a la lectura, y aun así se excluye porque es posterior a `hoy`.
 */
describe("una intervención de fecha futura no atiende — revisión final, hallazgo 3", () => {
  it("intervención fechada MAÑANA (futura respecto a hoy) → no atiende, aunque sea posterior a la lectura", () => {
    const t = activa({ plotBlockId: null, ultimaRevision: revision("2026-09-10", "muchos") });
    const intervenciones: IntervencionQueCubre[] = [
      // Posterior a la lectura (10) pero FUTURA respecto a "hoy" (10): un
      // error de captura que puso mañana en vez de hoy.
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    const avisos = avisosDeTrampas({ hoy: "2026-09-10", trampas: [t], regla: REGLA, intervenciones, zona: "UTC" });
    expect(avisos.map((a) => a.tipo)).toEqual(["trampa_con_lectura_alta"]);
  });

  it("control: la MISMA fecha, cuando ya no es futura (hoy avanzó), sí atiende", () => {
    const t = activa({ plotBlockId: null, ultimaRevision: revision("2026-09-10", "muchos") });
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    const avisos = avisosDeTrampas({ hoy: "2026-09-11", trampas: [t], regla: REGLA, intervenciones, zona: "UTC" });
    expect(avisos.map((a) => a.tipo)).toEqual([]);
  });
});

describe("entrada de los avisos desde getPlotDetail", () => {
  // `observedAt` es un campo de día: medianoche UTC.
  const cruda = (ultimaRevision: { id: string; observedAt: Date; brocaLevel: "muchos" | null } | null) => ({
    id: "t1", trapNumber: 7, bloque: "Norte", plotBlockId: null, status: "active" as const,
    instaladaEl: new Date("2026-09-01T00:00:00Z"), ultimaRevision,
  });

  it("convierte los dos días a YYYY-MM-DD y conserva el instante y el id de la observación", () => {
    const [t] = trampasParaAviso([cruda({ id: "o1", observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: "muchos" })]);
    expect(t).toEqual({
      id: "t1", trapNumber: 7, bloque: "Norte", plotBlockId: null, status: "active",
      instaladaEl: "2026-09-01",
      ultimaRevision: { id: "o1", dia: "2026-09-10", observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: "muchos" },
    });
  });

  it("una revisión sin lectura NO se descarta: el plazo corre desde su día", () => {
    const trampas = trampasParaAviso([cruda({ id: "o1", observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: null })]);
    expect(trampas[0]!.ultimaRevision).toEqual({ id: "o1", dia: "2026-09-10", observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: null });
    // Desde la revisión van 10 días (< 14). Desde la instalación irían 19: si
    // se descartara la revisión, esto avisaría con 5 días de retraso.
    expect(avisosDeTrampas({ hoy: "2026-09-20", trampas, regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" })).toEqual([]);
  });

  it("una revisión sin lectura cuenta como «no disparó»: plazo normal y sin acción", () => {
    const trampas = trampasParaAviso([cruda({ id: "o1", observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: null })]);
    // 15 días desde la revisión: 1 de retraso con el plazo normal (14); con el
    // de alerta (7) serían 8.
    expect(avisosDeTrampas({ hoy: "2026-09-25", trampas, regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" })).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("sin revisión y sin instalación registrada no inventa un plazo", () => {
    const trampas = trampasParaAviso([{ ...cruda(null), instaladaEl: null }]);
    expect(trampas[0]!.instaladaEl).toBeNull();
    expect(avisosDeTrampas({ hoy: "2026-12-31", trampas, regla: REGLA, intervenciones: sinIntervenciones, zona: "UTC" })).toEqual([]);
  });
});
