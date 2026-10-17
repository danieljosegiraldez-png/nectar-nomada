/**
 * Un tueste descuenta del lote verde LO QUE SE CARGÓ, no el lote entero — decisión de Daniel del
 * 2026-10-17, tras recorrer el tueste en un navegador por primera vez.
 *
 * **El defecto, medido así:** sobre un lote verde de 8 kg se registró un tueste de muestra de
 * 0,2 kg. El libro de masa del verde escribió un `transfer_out` de **8 kg** —todo su saldo— y el
 * tostado recibió 0,17: unos 7,8 kg desaparecieron. El tueste es un `stage_change`, y
 * `settleMassBalance` trata ese tipo como consumo TOTAL (`FULL_CONSUMPTION_TYPES`), así que ignoraba
 * la carga que el propio servicio le pasaba. Ninguna prueba afirmaba cuánto quedaba en el verde.
 *
 * **La regla, decidida:** el tueste va por el camino parcial, como la trilla y la selección, y sin la
 * carga no se registra —sin ella no se sabe cuánto salió del lote—. El tueste desde una MUESTRA no
 * cambia: la extracción ya la descontó del lote, y lo cubre `samples.test.ts`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "../../lib/db";
import { computeLotBalance, MassBalanceError } from "../../lib/traceability/balance";
import { recordRoastSession, RoastSessionValidationError } from "../../lib/traceability/roasting";
import type { Prisma } from "../../generated/prisma/client";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";
import { crearUsuarioConAcceso } from "../helpers/traceability";

const deps = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));

import { recordRoastSessionAction } from "../../app/actions/traceability";

const RUN = `tuestecarga-${Date.now()}`;
let admin: { userAccountId: string; personId: string };
let organizationId: string;
let contador = 0;

const saldo = async (lotId: string) => {
  const b = await computeLotBalance(prisma as unknown as Prisma.TransactionClient, lotId);
  return b.recorded ? Number(b.quantity) : null;
};

/** Un lote verde con su propio libro de masa: `kg` recibidos, y nada más. */
async function verde(kg: number) {
  contador += 1;
  const lote = await prisma.lot.create({ data: { lotCode: `${RUN}-V${contador}`, lotType: "green", organizationId } });
  await prisma.quantityEvent.create({
    data: { lotId: lote.id, eventType: "received", quantity: kg, unit: "kg", occurredAt: new Date("2026-10-01T12:00:00Z"), provenanceClass: "original_record", createdBy: admin.userAccountId },
  });
  return lote;
}

const tuestes = (lotId: string) => prisma.roastSession.count({ where: { transformations: { some: { inputs: { some: { lotId } } } } } });

const base = { startedAt: new Date("2026-10-16T15:00:00Z"), endedAt: new Date("2026-10-16T15:12:00Z"), provenanceClass: "original_record" as const };

beforeAll(async () => {
  admin = await crearUsuarioConAcceso(RUN);
  organizationId = await createTestOrganization(RUN);
}, 60000);

/** Todo por la marca: los lotes verdes y sus tostados (`<código>-T01`) empiezan por RUN. */
afterAll(async () => {
  const lotes = await prisma.lot.findMany({ where: { lotCode: { startsWith: RUN } }, select: { id: true } });
  const ids = lotes.map((l) => l.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: admin.userAccountId }) });
  if (ids.length) {
    const ts = await prisma.lotTransformation.findMany({
      where: { OR: [{ inputs: { some: { lotId: { in: ids } } } }, { outputs: { some: { lotId: { in: ids } } } }] },
      select: { id: true, roastSessionId: true },
    });
    await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: ids } }) });
    if (ts.length) {
      const tIds = ts.map((t) => t.id);
      await prisma.lotTransformationInput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
      await prisma.lotTransformationOutput.deleteMany({ where: assertDefinedWhere({ transformationId: { in: tIds } }) });
      await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: tIds } }) });
      const rIds = ts.map((t) => t.roastSessionId).filter((x): x is string => x != null);
      if (rIds.length) await prisma.roastSession.deleteMany({ where: assertDefinedWhere({ id: { in: rIds } }) });
    }
    await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  }
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: admin.userAccountId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: admin.userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: admin.personId }) });
  await deleteTestOrganizations(RUN);
}, 60000);

describe("el tueste descuenta la carga", () => {
  it("tostar 0,2 kg de un verde de 8 kg deja 7,8, no cero", async () => {
    const lote = await verde(8);
    const { outputLot } = await recordRoastSession(admin.userAccountId, { ...base, lotId: lote.id, purpose: "sample", chargeWeightKg: 0.2, dischargeWeightKg: 0.17 });
    expect(await saldo(lote.id)).toBeCloseTo(7.8, 6);
    expect(await saldo(outputLot.id)).toBeCloseTo(0.17, 6);
  });

  it("un tueste de producción, igual: descuenta su carga", async () => {
    const lote = await verde(8);
    await recordRoastSession(admin.userAccountId, { ...base, lotId: lote.id, purpose: "production", outputLotCode: `${RUN}-PROD`, chargeWeightKg: 2, dischargeWeightKg: 1.7 });
    expect(await saldo(lote.id)).toBeCloseTo(6, 6);
  });

  it("dos tuestes seguidos descuentan los dos", async () => {
    const lote = await verde(8);
    await recordRoastSession(admin.userAccountId, { ...base, lotId: lote.id, purpose: "sample", chargeWeightKg: 0.2, dischargeWeightKg: 0.17 });
    await recordRoastSession(admin.userAccountId, { ...base, lotId: lote.id, purpose: "sample", chargeWeightKg: 0.3, dischargeWeightKg: 0.25 });
    expect(await saldo(lote.id)).toBeCloseTo(7.5, 6);
  });

  it("sin la carga se rechaza, y no queda ni el tueste ni el descuento", async () => {
    const lote = await verde(8);
    await expect(
      recordRoastSession(admin.userAccountId, { ...base, lotId: lote.id, purpose: "sample", chargeWeightKg: null, dischargeWeightKg: 0.17 }),
    ).rejects.toThrow(new RoastSessionValidationError("charge_weight_required"));
    expect(await tuestes(lote.id)).toBe(0);
    expect(await saldo(lote.id)).toBeCloseTo(8, 6);
  });

  it("una carga mayor que lo que queda se rechaza, y no se escribe nada", async () => {
    const lote = await verde(8);
    await expect(
      recordRoastSession(admin.userAccountId, { ...base, lotId: lote.id, purpose: "sample", chargeWeightKg: 9, dischargeWeightKg: 7.6 }),
    ).rejects.toThrow(MassBalanceError);
    expect(await tuestes(lote.id)).toBe(0);
    expect(await saldo(lote.id)).toBeCloseTo(8, 6);
  });
});

describe("la pantalla del tueste", () => {
  const formulario = (lotId: string, campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ lotId, purpose: "sample", startedAt: "2026-10-16T10:00", tzOffsetMinutes: "300", provenanceClass: "original_record", ...campos })) fd.set(k, v);
    return fd;
  };

  it("al guardar, vuelve al lote diciendo que se registró", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    const lote = await verde(8);
    const e = await recordRoastSessionAction({}, formulario(lote.id, { chargeWeightKg: "0.2", dischargeWeightKg: "0.17" })).then(() => null, (x: unknown) => x);
    expect((e as Error).message).toBe(`redirect:/lots/${lote.id}?ok=tueste`);
  });

  it("sin la carga, la pantalla dice qué falta en vez de un código", async () => {
    deps.user.mockResolvedValue({ userAccountId: admin.userAccountId });
    const lote = await verde(8);
    expect(await recordRoastSessionAction({}, formulario(lote.id, { dischargeWeightKg: "0.17" }))).toEqual({ error: "error_roast_charge_weight_required" });
  });
});
