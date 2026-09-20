/**
 * Las reglas del vínculo lote ← recepción, de la merma y del veredicto, EN LA BASE.
 *
 * Spec: docs/superpowers/specs/2026-09-19-de-la-recepcion-a-los-lotes-design.md §3.1–3.4.
 * Plan: docs/superpowers/plans/2026-09-19-de-la-recepcion-a-los-lotes.md, Tarea 1.
 *
 * Cada rechazo lleva su control positivo. Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarVinculosDeLote } from "../helpers/borrarVinculosDeLote";

const RUN = `ldr-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
let orgId: string;
let siteId: string;
let plotId: string;
let beneficioId: string;
let jornadaId: string;
let entregaId: string;
let recepcionId: string;
let loteId: string;
let otroLoteId: string;

async function cuenta(n: string) {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(personId);
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  return id;
}
const lote = async (codigo: string) =>
  (await prisma.lot.create({ data: { lotCode: `TEST-${codigo}-${RUN}`, lotType: "cherry", organizationId: orgId, locationId: beneficioId } })).id;

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })).id;
  siteId = (await prisma.location.create({ data: { name: `TEST Sitio (${RUN})`, locationType: "site", organizationId: orgId, classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { name: `TEST Parcela (${RUN})`, locationType: "plot", parentLocationId: siteId, classification: "internal" } })).id;
  beneficioId = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: siteId, classification: "internal" } })).id;
  const recolector = await cuenta("Recolector");
  const capataz = await cuenta("Capataz");
  const receptor = await cuenta("Receptor");
  const personaRecolector = (await prisma.userAccount.findUniqueOrThrow({ where: { id: recolector }, select: { personId: true } })).personId;
  jornadaId = (await prisma.jornadaDeCosecha.create({ data: { fincaSiteId: siteId, beneficioId, fecha: new Date() } })).id;
  entregaId = (
    await prisma.entregaDeCosecha.create({
      data: { jornadaId, recolectorId: personaRecolector, locationId: plotId, pesoFincaKg: 100, enviadaAt: new Date(), anotadaPor: capataz },
    })
  ).id;
  recepcionId = (
    await prisma.recepcionDeCereza.create({
      data: {
        claveDeEnvio: randomUUID(), beneficioId, entregaId, recibidaPor: receptor, recibidaAt: new Date(),
        brutoKg: 100, recipientes: 0, taraPorRecipienteKg: 0, netoKg: 100, referenciaKg: 100, diferenciaKg: 0, toleranciaKg: 0.5,
        comparacion: "BALANCED", politicaDeBalance: { relativeTolerance: 0.005, absoluteFloorKg: 0.5, grossThreshold: 0.05 },
      },
    })
  ).id;
  loteId = await lote("A");
  otroLoteId = await lote("B");
}, 30000);

afterAll(async () => {
  await prisma.veredictoDeCalidadDePedido.deleteMany({ where: assertDefinedWhere({ lotId: { in: [loteId, otroLoteId] } }) });
  await borrarVinculosDeLote([recepcionId]);
  await prisma.mermaDeRecepcion.deleteMany({ where: assertDefinedWhere({ recepcionId }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: [loteId, otroLoteId] } }) });
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: recepcionId }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: entregaId }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: jornadaId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotId, beneficioId] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: siteId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 30000);

const vinculo = (lotId: string, kg: number) => prisma.loteDesdeRecepcion.create({ data: { lotId, recepcionId, kg } });
const merma = (kg: number, extra: Record<string, unknown> = {}) =>
  prisma.mermaDeRecepcion.create({ data: { recepcionId, kg, motivo: "TEST derrame", anotadaPor: cuentas[2]!, anotadaAt: new Date(), ...extra } });

describe("los kilos que toma un lote", () => {
  it("60 + 60 de una recepción de 100 se rechaza; 60 + 40 entra", async () => {
    const primero = await vinculo(loteId, 60);
    expect(Number(primero.kg)).toBe(60);
    await expect(vinculo(otroLoteId, 60)).rejects.toThrow(/kg_sobre_lo_recibido/);
    const segundo = await vinculo(otroLoteId, 40);
    expect(Number(segundo.kg)).toBe(40);
    // Limpieza para las pruebas siguientes: el disparador de inmutabilidad se desactiva a propósito.
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" DISABLE TRIGGER "lote_desde_recepcion_inmutable"');
    await prisma.loteDesdeRecepcion.deleteMany({ where: { recepcionId } });
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" ENABLE TRIGGER "lote_desde_recepcion_inmutable"');
  }, 20000);

  it("la misma recepción dos veces en el MISMO lote se rechaza", async () => {
    const v = await vinculo(loteId, 10);
    await expect(vinculo(loteId, 5)).rejects.toThrow(/Unique constraint|lote_desde_recepcion_lot_id_recepcion_id_key/);
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" DISABLE TRIGGER "lote_desde_recepcion_inmutable"');
    await prisma.loteDesdeRecepcion.delete({ where: { id: v.id } });
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" ENABLE TRIGGER "lote_desde_recepcion_inmutable"');
  }, 20000);

  it("cero o menos se rechaza", async () => {
    await expect(vinculo(loteId, 0)).rejects.toThrow(/lote_desde_recepcion_kg_positivo/);
  }, 20000);

  it("editar o borrar el vínculo se rechaza: el origen de un lote no se reescribe", async () => {
    const v = await vinculo(loteId, 10);
    await expect(prisma.loteDesdeRecepcion.update({ where: { id: v.id }, data: { kg: 1 } })).rejects.toThrow(/lote_desde_recepcion_inmutable/);
    await expect(prisma.loteDesdeRecepcion.delete({ where: { id: v.id } })).rejects.toThrow(/lote_desde_recepcion_inmutable/);
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" DISABLE TRIGGER "lote_desde_recepcion_inmutable"');
    await prisma.loteDesdeRecepcion.delete({ where: { id: v.id } });
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" ENABLE TRIGGER "lote_desde_recepcion_inmutable"');
  }, 20000);
});

describe("la merma", () => {
  it("3 kg entran y bajan el disponible: con 3 de merma, tomar 98 se rechaza y 97 entra", async () => {
    const m = await merma(3);
    expect(Number(m.kg)).toBe(3);
    await expect(vinculo(loteId, 98)).rejects.toThrow(/kg_sobre_lo_recibido/);
    const v = await vinculo(loteId, 97);
    expect(Number(v.kg)).toBe(97);
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" DISABLE TRIGGER "lote_desde_recepcion_inmutable"');
    await prisma.loteDesdeRecepcion.delete({ where: { id: v.id } });
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" ENABLE TRIGGER "lote_desde_recepcion_inmutable"');
    await prisma.mermaDeRecepcion.delete({ where: { id: m.id } });
  }, 20000);

  it("una merma mayor que lo disponible se rechaza, y una sin motivo también", async () => {
    await expect(merma(200)).rejects.toThrow(/merma_de_recepcion_sobre_lo_disponible/);
    await expect(merma(1, { motivo: "   " })).rejects.toThrow(/merma_de_recepcion_motivo/);
  }, 20000);

  it("anulada exige fecha, quién y motivo", async () => {
    await expect(merma(1, { estado: "anulada" })).rejects.toThrow(/merma_de_recepcion_anulacion_completa/);
    const buena = await merma(1, { estado: "anulada", anuladaAt: new Date(), anuladaPor: cuentas[2]!, motivoAnulacion: "me equivoqué" });
    expect(buena.estado).toBe("anulada");
    await prisma.mermaDeRecepcion.delete({ where: { id: buena.id } });
  }, 20000);
});

describe("la recepción con lotes, y el veredicto", () => {
  it("una recepción con cereza ya tomada no se anula; sin vínculos, sí, y anulada ya no admite más", async () => {
    // Con SU propia recepción: una anulada no se puede devolver a `recibida` —lo impide el
    // disparador `recepcion_de_cereza_inmutable` de la pieza 2—, así que la principal no se toca.
    const suya = (
      await prisma.recepcionDeCereza.create({
        data: {
          claveDeEnvio: randomUUID(), beneficioId, proveedorId: orgId, recibidaPor: cuentas[2]!, recibidaAt: new Date(),
          brutoKg: 50, recipientes: 0, taraPorRecipienteKg: 0, netoKg: 50,
        },
      })
    ).id;
    const v = await prisma.loteDesdeRecepcion.create({ data: { lotId: loteId, recepcionId: suya, kg: 10 } });
    const anular = () =>
      prisma.recepcionDeCereza.update({
        where: { id: suya },
        data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: cuentas[2]!, motivoAnulacion: "error" },
      });
    await expect(anular()).rejects.toThrow(/ya_tiene_lotes/);
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" DISABLE TRIGGER "lote_desde_recepcion_inmutable"');
    await prisma.loteDesdeRecepcion.delete({ where: { id: v.id } });
    await prisma.$executeRawUnsafe('ALTER TABLE "traceability"."lote_desde_recepcion" ENABLE TRIGGER "lote_desde_recepcion_inmutable"');
    const anulada = await anular();
    expect(anulada.estado).toBe("anulada");
    // Y una recepción anulada ya no admite vínculos (la otra mitad del disparador).
    await expect(prisma.loteDesdeRecepcion.create({ data: { lotId: loteId, recepcionId: suya, kg: 1 } })).rejects.toThrow(/recepcion_no_recibida/);
    await prisma.recepcionDeCereza.delete({ where: { id: suya } });
  }, 20000);

  it("un veredicto que no es CUMPLE ni NO_CUMPLE exige motivo", async () => {
    const base = { lotId: loteId, selecciones: 1, insumoKg: 100, aceptadoKg: 80, verdeKg: 10, flotesKg: 10, actualizadoAt: new Date() };
    await expect(prisma.veredictoDeCalidadDePedido.create({ data: { ...base, juicio: "NO_ATRIBUIBLE" } })).rejects.toThrow(/veredicto_motivo_si_no_cumple/);
    const bueno = await prisma.veredictoDeCalidadDePedido.create({ data: { ...base, juicio: "CUMPLE" } });
    expect(bueno.juicio).toBe("CUMPLE");
    await prisma.veredictoDeCalidadDePedido.delete({ where: { id: bueno.id } });
  }, 20000);
});
