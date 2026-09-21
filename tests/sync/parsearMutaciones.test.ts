/**
 * Ronda final de arreglos, A10 + A11 — el parseo de `trap_check`, puro y sin
 * base (`fechaDeDia` y las validaciones de tipo no tocan Prisma).
 *
 * **Por qué un archivo aparte de `tests/sync/parseoDelLote.test.ts`.** Aquél
 * necesita base para sus fixtures de apiario (`beforeAll`/`afterAll` con
 * `prisma`), así que vive en el grupo `base-sembrada`. Las dos pruebas de
 * este archivo no necesitan ninguna fila: `parsearMutaciones` es una función
 * pura, y validar sus rechazos por tipo no exige crear nada. Hermético a
 * propósito, para que lo corra `scripts/ci.sh` sin depender de la base
 * compartida.
 */
import { describe, expect, it } from "vitest";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";

const BASE = {
  kind: "trap_check",
  clientDraftId: "draft-1",
  locationId: "loc-1",
  specimenId: "specimen-1",
  observedAt: "2026-09-18",
  brocaLevel: "pocos",
};

function unaMutacion(m: unknown) {
  const parseo = parsearMutaciones([m]);
  if (!parseo.ok) throw new Error(`el lote entero se rechazó: ${parseo.error}`);
  return parseo;
}

describe("A10 — trap_check.observedAt exige un día YYYY-MM-DD, no un instante", () => {
  it("un día limpio se acepta y se convierte a medianoche UTC", () => {
    const { mutations, rechazos } = unaMutacion(BASE);
    expect(rechazos).toEqual([]);
    expect(mutations).toHaveLength(1);
    expect((mutations[0] as { observedAt: Date }).observedAt.toISOString()).toBe(
      "2026-09-18T00:00:00.000Z",
    );
  });

  // EL GUARDIA: antes de este arreglo, `toDate` aceptaba cualquier cadena que
  // `new Date()` supiera interpretar, incluida ésta — y la convertía en 19 de
  // septiembre en UTC (el offset -05:00 cruza la medianoche), desplazando el
  // día que la ronda cree estar registrando. Ahora se rechaza esta mutación
  // en particular, sin tumbar el lote entero.
  it("un instante con hora y offset se RECHAZA, no se trunca al día que le convenga", () => {
    const { mutations, rechazos } = unaMutacion({ ...BASE, observedAt: "2026-09-18T23:30:00-05:00" });
    expect(mutations).toHaveLength(0);
    expect(rechazos).toEqual([{ clientDraftId: "draft-1", reason: "observed_at_not_a_day" }]);
  });

  it("un instante en UTC puro también se rechaza", () => {
    const { rechazos } = unaMutacion({ ...BASE, observedAt: "2026-09-18T00:00:00.000Z" });
    expect(rechazos).toEqual([{ clientDraftId: "draft-1", reason: "observed_at_not_a_day" }]);
  });

  it("ausente se rechaza con su propia razón, distinta de la de un instante", () => {
    const { rechazos } = unaMutacion({ ...BASE, observedAt: undefined });
    expect(rechazos).toEqual([{ clientDraftId: "draft-1", reason: "observed_at_required" }]);
  });

  it("un día que no existe en el calendario se rechaza, no se normaliza a otro", () => {
    // `fechaDeDia` lanza para el 31 de febrero en vez de dejar que `new Date`
    // lo normalice al 3 de marzo (ver su docstring en `localDateTime.ts`).
    const { rechazos } = unaMutacion({ ...BASE, observedAt: "2026-02-31" });
    expect(rechazos).toEqual([{ clientDraftId: "draft-1", reason: "observed_at_not_a_day" }]);
  });

  // Control positivo: una mutación buena detrás de la mala SÍ se aplica —
  // esto distingue un rechazo por mutación de un 400 que tumbe el lote.
  it("una mutación con fecha inválida no bloquea a la buena que viene detrás", () => {
    const parseo = parsearMutaciones([
      { ...BASE, clientDraftId: "draft-mala", observedAt: "hace dos semanas" },
      { ...BASE, clientDraftId: "draft-buena" },
    ]);
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    expect(parseo.rechazos).toEqual([{ clientDraftId: "draft-mala", reason: "observed_at_not_a_day" }]);
    expect(parseo.mutations).toHaveLength(1);
    expect(parseo.mutations[0]).toMatchObject({ clientDraftId: "draft-buena" });
  });
});

describe("A11 — los campos opcionales de trap_check se validan por TIPO", () => {
  it("cleaned/liquidChanged/lureRecharged/otherInsects: sólo booleano o ausente", () => {
    const { mutations } = unaMutacion({
      ...BASE,
      cleaned: true,
      liquidChanged: false,
      lureRecharged: null,
    });
    expect(mutations[0]).toMatchObject({ cleaned: true, liquidChanged: false, lureRecharged: null });
  });

  // EL GUARDIA de cada campo: un valor del tipo equivocado rechaza SÓLO esta
  // mutación (Codex #8 — `cleaned: "yes"` reventaba a Prisma con un 500 de
  // todo el lote antes de este arreglo).
  it.each([
    ["cleaned", "yes", "cleaned_not_valid"],
    ["liquidChanged", "yes", "liquid_changed_not_valid"],
    ["lureRecharged", 1, "lure_recharged_not_valid"],
    ["otherInsects", "no", "other_insects_not_valid"],
  ] as const)("%s con un valor no booleano (%j) se rechaza: %s", (campo, valor, razon) => {
    const { rechazos, mutations } = unaMutacion({ ...BASE, [campo]: valor });
    expect(mutations).toHaveLength(0);
    expect(rechazos).toEqual([{ clientDraftId: "draft-1", reason: razon }]);
  });

  it("otherInsectsNote acepta texto o ausente, y rechaza un objeto (Codex #8)", () => {
    expect(unaMutacion({ ...BASE, otherInsectsNote: "avispas" }).mutations[0]).toMatchObject({
      otherInsectsNote: "avispas",
    });
    const { rechazos } = unaMutacion({ ...BASE, otherInsectsNote: {} });
    expect(rechazos).toEqual([{ clientDraftId: "draft-1", reason: "other_insects_note_not_valid" }]);
  });

  it("captureCount acepta un entero >= 0 o ausente, nunca negativo ni fraccionario", () => {
    expect(unaMutacion({ ...BASE, captureCount: 12 }).mutations[0]).toMatchObject({ captureCount: 12 });
    expect(unaMutacion({ ...BASE, captureCount: null }).mutations[0]).toMatchObject({ captureCount: null });
    expect(unaMutacion({ ...BASE, captureCount: -1 }).rechazos).toEqual([
      { clientDraftId: "draft-1", reason: "capture_count_invalid" },
    ]);
    expect(unaMutacion({ ...BASE, captureCount: 2.5 }).rechazos).toEqual([
      { clientDraftId: "draft-1", reason: "capture_count_invalid" },
    ]);
  });

  // Control positivo del bloque entero: un lote con UNA mutación mala y OTRA
  // buena aplica la buena — el mismo criterio que exige el brief para A11.
  it("un lote con un campo mal formado y otro bueno detrás: el bueno se aplica", () => {
    const parseo = parsearMutaciones([
      { ...BASE, clientDraftId: "draft-mala", cleaned: "yes" },
      { ...BASE, clientDraftId: "draft-buena", cleaned: true },
    ]);
    expect(parseo.ok).toBe(true);
    if (!parseo.ok) return;
    expect(parseo.rechazos).toEqual([{ clientDraftId: "draft-mala", reason: "cleaned_not_valid" }]);
    expect(parseo.mutations).toHaveLength(1);
    expect(parseo.mutations[0]).toMatchObject({ clientDraftId: "draft-buena", cleaned: true });
  });
});
