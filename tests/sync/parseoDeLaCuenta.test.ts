import { describe, expect, it } from "vitest";
import {
  KINDS_DE_APIARIO,
  KINDS_DE_PARCELA,
  KIND_DE_FIN_DE_COLONIA,
  parsearMutaciones,
} from "../../lib/sync/parsearMutaciones";
import { RAZON_CUENTA_INVALIDA } from "../../lib/sync/cuentaDelBorrador";

/**
 * ADR-199 — el parseo valida la cuenta del borrador una vez, para todos los tipos, y la deja
 * normalizada: una cadena o `null`, nunca `undefined` ni otra cosa.
 */

const HUELLA = "11e594f481958c10";

const muestra = (extra: Record<string, unknown> = {}) => ({
  kind: "soil_sample",
  clientDraftId: "d1",
  locationId: "loc1",
  sampleCode: "S-01",
  sampledAt: "2026-09-16T12:00:00.000Z",
  provenanceClass: "direct_observation",
  ...extra,
});

const evento = (extra: Record<string, unknown> = {}) => ({
  clientDraftId: "e1",
  fieldSessionId: "fs1",
  eventKindValueId: "k1",
  occurredAt: "2026-09-16T12:00:00.000Z",
  ...extra,
});

describe("parsearMutaciones y cuentaDelBorrador", () => {
  it("la cuenta viaja en una mutación que se copia entera (parcela)", () => {
    const r = parsearMutaciones([muestra({ cuentaDelBorrador: HUELLA })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]).toMatchObject({ kind: "soil_sample", cuentaDelBorrador: HUELLA });
  });

  it("y en la de evento de campo, que se construye campo a campo", () => {
    const r = parsearMutaciones([evento({ cuentaDelBorrador: HUELLA })]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations[0]).toMatchObject({ clientDraftId: "e1", cuentaDelBorrador: HUELLA });
  });

  it("sin cuenta llega null en los dos caminos", () => {
    const r = parsearMutaciones([muestra(), evento()]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations).toHaveLength(2);
    expect(r.mutations.map((m) => m.cuentaDelBorrador)).toEqual([null, null]);
  });

  it("una cuenta que no es cadena se rechaza SOLA, y las demás pasan", () => {
    const r = parsearMutaciones([
      muestra({ clientDraftId: "malo", cuentaDelBorrador: 5 }),
      muestra({ clientDraftId: "bueno", cuentaDelBorrador: HUELLA }),
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mutations.map((m) => m.clientDraftId)).toEqual(["bueno"]);
    expect(r.rechazos).toEqual([{ clientDraftId: "malo", reason: RAZON_CUENTA_INVALIDA }]);
  });

  it("una cuenta vacía también se rechaza", () => {
    const r = parsearMutaciones([muestra({ cuentaDelBorrador: "" })]);
    expect(r.ok && r.rechazos).toEqual([{ clientDraftId: "d1", reason: RAZON_CUENTA_INVALIDA }]);
  });

  it("sin clientDraftId no hay a quién atribuir el rechazo: 400 de lote", () => {
    expect(parsearMutaciones([{ kind: "soil_sample", cuentaDelBorrador: 5 }])).toEqual({ ok: false, error: "mutation_malformed" });
  });
});

/**
 * La cuenta se normaliza en TODOS los tipos que reconoce el parseo, no sólo en los dos de arriba.
 *
 * Cada rama de `parsearMutaciones` construye su mutación de otra manera —unas copian el objeto entero, la
 * del evento de campo lo arma campo a campo—, y una rama nueva que olvidara llevar `cuentaDelBorrador`
 * dejaría esos borradores sin cuenta: el servidor los decidiría por el aparato, a nombre de quien envía.
 * Cada fila es la mutación MÍNIMA válida de su rama, leída de `lib/sync/parsearMutaciones.ts`.
 */
const DIA = "2026-09-16T12:00:00.000Z";
const MINIMAS: Array<{ tipo: string; mutacion: Record<string, unknown> }> = [
  { tipo: "inspection", mutacion: { kind: "inspection", clientDraftId: "m1", colonyId: "c1", occurredAt: DIA } },
  { tipo: "colony_event", mutacion: { kind: "colony_event", clientDraftId: "m1", colonyId: "c1", occurredAt: DIA } },
  { tipo: "varroa_count", mutacion: { kind: "varroa_count", clientDraftId: "m1", colonyId: "c1", occurredAt: DIA } },
  { tipo: KIND_DE_FIN_DE_COLONIA, mutacion: { kind: "colony_end", clientDraftId: "m1", colonyId: "c1", endedAt: DIA } },
  {
    tipo: "soil_sample",
    mutacion: { kind: "soil_sample", clientDraftId: "m1", locationId: "loc1", sampledAt: DIA, sampleCode: "S-01" },
  },
  {
    tipo: "foliar_sample",
    mutacion: { kind: "foliar_sample", clientDraftId: "m1", locationId: "loc1", sampledAt: DIA, sampleCode: "F-01" },
  },
  { tipo: "soil_profile", mutacion: { kind: "soil_profile", clientDraftId: "m1", locationId: "loc1", describedAt: DIA } },
  { tipo: "planting_cohort", mutacion: { kind: "planting_cohort", clientDraftId: "m1", locationId: "loc1" } },
  {
    tipo: "trap_check",
    mutacion: {
      kind: "trap_check",
      clientDraftId: "m1",
      locationId: "loc1",
      observedAt: "2026-09-16",
      brocaLevel: "pocos",
      specimenId: "sp1",
    },
  },
  {
    tipo: "field_event",
    mutacion: { clientDraftId: "m1", fieldSessionId: "fs1", eventKindValueId: "k1", occurredAt: DIA },
  },
];

describe("la cuenta se normaliza en todos los tipos que reconoce el parseo", () => {
  it("control: la lista cubre exactamente los tipos que el parseo declara", () => {
    const declarados = [...KINDS_DE_APIARIO, KIND_DE_FIN_DE_COLONIA, ...KINDS_DE_PARCELA, "field_event"];
    expect(MINIMAS.map((m) => m.tipo).sort()).toEqual([...declarados].sort());
  });

  it.each(MINIMAS)("$tipo: con cuenta sale con esa cuenta", ({ mutacion }) => {
    const r = parsearMutaciones([{ ...mutacion, cuentaDelBorrador: HUELLA }]);
    expect(r.ok, "el parseo no debe tumbar el lote").toBe(true);
    if (!r.ok) return;
    // Control: la mutación mínima SÍ se aceptó. Si cayó en `rechazos`, lo de abajo mediría nada.
    expect(r.rechazos).toEqual([]);
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]!.cuentaDelBorrador).toBe(HUELLA);
  });

  it.each(MINIMAS)("$tipo: sin cuenta sale con null, nunca undefined", ({ mutacion }) => {
    const r = parsearMutaciones([mutacion]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rechazos).toEqual([]);
    expect(r.mutations).toHaveLength(1);
    expect(r.mutations[0]!.cuentaDelBorrador).toBeNull();
  });
});
