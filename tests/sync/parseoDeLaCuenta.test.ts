import { describe, expect, it } from "vitest";
import { parsearMutaciones } from "../../lib/sync/parsearMutaciones";
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
