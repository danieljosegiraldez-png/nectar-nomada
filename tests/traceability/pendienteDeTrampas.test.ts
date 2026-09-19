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
    const avisos = avisosDeTrampas({ hoy: "2026-12-31", trampas: [activa()], regla: null, intervenciones: sinIntervenciones });
    expect(avisos).toEqual([]);
  });

  it("cuenta el plazo normal desde la instalación cuando nunca se revisó", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-16", trampas: [activa()], regla: REGLA, intervenciones: sinIntervenciones });
    expect(avisos).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("el día exacto del vencimiento todavía no avisa", () => {
    const avisos = avisosDeTrampas({ hoy: "2026-09-15", trampas: [activa()], regla: REGLA, intervenciones: sinIntervenciones });
    expect(avisos).toEqual([]);
  });

  it("usa el plazo de alerta cuando la última lectura disparó", () => {
    const t = activa({ ultimaRevision: revision("2026-09-10", "muchos") });
    const avisos = avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones });
    expect(avisos.map((a) => a.tipo)).toContain("trampa_por_revisar");
  });

  it("propone la acción de la regla cuando la lectura disparó, y sin intervenciones (control) sale como siempre", () => {
    const t = activa({ ultimaRevision: revision("2026-09-16", "algunos") });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones });
    expect(avisos).toContainEqual({
      tipo: "trampa_con_lectura_alta", specimenId: "t1", trapNumber: 7,
      lectura: "algunos", accion: "aplicar Bralic",
      observationId: "o1", plotBlockId: null, materialId: null, materialName: null,
    });
  });

  it("el aviso trae materialId/materialName de la regla cuando ésta apunta a un producto", () => {
    const t = activa({ ultimaRevision: revision("2026-09-16", "algunos") });
    const reglaConProducto = { ...REGLA, suggestedMaterial: { id: "m1", name: "Bralic WP" } };
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: reglaConProducto, intervenciones: sinIntervenciones });
    expect(avisos).toContainEqual(
      expect.objectContaining({ tipo: "trampa_con_lectura_alta", materialId: "m1", materialName: "Bralic WP" }),
    );
  });

  it("una lectura por debajo del disparador no propone nada", () => {
    const t = activa({ ultimaRevision: revision("2026-09-16", "pocos") });
    const avisos = avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones });
    expect(avisos.map((a) => a.tipo)).not.toContain("trampa_con_lectura_alta");
  });

  it("una trampa retirada no genera avisos", () => {
    const t = activa({ status: "removed", ultimaRevision: revision("2026-01-01", "muchos") });
    expect(avisosDeTrampas({ hoy: "2026-09-17", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones })).toEqual([]);
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
    expect(avisosDeTrampas({ hoy: "2026-09-18", trampas: [t], regla: REGLA, intervenciones: sinIntervenciones })).toEqual([]);
  });
});

// Tarea 4, spec §4.2: «atendido» apaga SÓLO `trampa_con_lectura_alta`, nunca
// `trampa_por_revisar`. Una fila por combinación de la tabla del spec, más los
// bordes que el brief pide explícitamente.
describe("«atendido»: una intervención posterior que cubre la trampa", () => {
  // Lectura del 10, que dispara con REGLA (triggerLevel "algunos"). `hoy` cae
  // el mismo día que la lectura para que NUNCA salga `trampa_por_revisar` por
  // sí solo (14 días de plazo normal) y así el único aviso posible sea el de
  // lectura alta — así una fila que falla no se puede confundir con la otra.
  const conBloque = (plotBlockId: string | null) =>
    activa({ plotBlockId, ultimaRevision: revision("2026-09-10", "muchos") });
  const hoy = "2026-09-10";
  const soloLecturaAlta = (avisos: ReturnType<typeof avisosDeTrampas>) => avisos.map((a) => a.tipo);

  it("parcela entera posterior → atendido", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual([]);
  });

  it("bloque propio posterior → atendido", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: ["B1"] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual([]);
  });

  it("OTRO bloque → no atiende", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: ["B2"] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("sólo plantas (parcelaEntera: false, plotBlockIds: []) → no atiende", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("trampa sin bloque + intervención con bloque cualquiera → no atiende", () => {
    const t = conBloque(null);
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: false, plotBlockIds: ["B1"] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("trampa sin bloque + parcela entera → atendido", () => {
    const t = conBloque(null);
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-11T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual([]);
  });

  it("intervención ANTERIOR a la lectura → no atiende", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-09T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual(["trampa_con_lectura_alta"]);
  });

  it("intervención SIMULTÁNEA a la lectura → no atiende (el borde es estricto: `>`)", () => {
    const t = conBloque("B1");
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-09-10T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual(["trampa_con_lectura_alta"]);
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
    expect(soloLecturaAlta(avisosDeTrampas({ hoy, trampas: [t], regla: REGLA, intervenciones }))).toEqual([]);
  });

  it("el aviso de revisión vencida sale aunque la lectura alta esté atendida", () => {
    const t = activa({ plotBlockId: "B1", instaladaEl: "2026-07-01", ultimaRevision: revision("2026-08-01", "muchos") });
    const intervenciones: IntervencionQueCubre[] = [
      { occurredAt: new Date("2026-08-02T00:00:00Z"), parcelaEntera: true, plotBlockIds: [] },
    ];
    // Lectura alta → plazo de alerta (7 días). Del 1 de agosto al 20 van 19: 12 de retraso.
    const avisos = avisosDeTrampas({ hoy: "2026-08-20", trampas: [t], regla: REGLA, intervenciones });
    expect(avisos).toEqual([{ tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 12 }]);
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
    expect(avisosDeTrampas({ hoy: "2026-09-20", trampas, regla: REGLA, intervenciones: sinIntervenciones })).toEqual([]);
  });

  it("una revisión sin lectura cuenta como «no disparó»: plazo normal y sin acción", () => {
    const trampas = trampasParaAviso([cruda({ id: "o1", observedAt: new Date("2026-09-10T00:00:00Z"), brocaLevel: null })]);
    // 15 días desde la revisión: 1 de retraso con el plazo normal (14); con el
    // de alerta (7) serían 8.
    expect(avisosDeTrampas({ hoy: "2026-09-25", trampas, regla: REGLA, intervenciones: sinIntervenciones })).toEqual([
      { tipo: "trampa_por_revisar", specimenId: "t1", trapNumber: 7, diasDeRetraso: 1 },
    ]);
  });

  it("sin revisión y sin instalación registrada no inventa un plazo", () => {
    const trampas = trampasParaAviso([{ ...cruda(null), instaladaEl: null }]);
    expect(trampas[0]!.instaladaEl).toBeNull();
    expect(avisosDeTrampas({ hoy: "2026-12-31", trampas, regla: REGLA, intervenciones: sinIntervenciones })).toEqual([]);
  });
});
