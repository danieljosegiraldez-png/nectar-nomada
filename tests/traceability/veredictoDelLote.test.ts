/**
 * El veredicto de calidad de un lote armado desde recepciones — spec de la recepción a los lotes
 * §3.4, plan Tarea 5.
 *
 * Lo que se juzga es la cereza del PEDIDO, así que el veredicto vive en el lote de nivel 1 y suma
 * TODAS sus selecciones. El lote aceptado que sale de una selección no lo tiene: juzgarlo otra vez
 * contaría dos veces la misma cereza. Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { borrarVinculosDeLote } from "../helpers/borrarVinculosDeLote";
import { abrirJornada, agregarRecolector } from "../../lib/traceability/jornadasDeCosecha";
import { anotarEntrega } from "../../lib/traceability/entregasDeCosecha";
import { recibirCereza } from "../../lib/traceability/recepcionesDeCereza";
import { crearPedido } from "../../lib/traceability/pedidosDeCereza";
import { armarLote } from "../../lib/traceability/lotesDeBeneficio";
import { recordSelection } from "../../lib/traceability/selection";
import { recordTransformation } from "../../lib/traceability/lots";

const RUN = `vered-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const orgs: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let finca: string;
let parcela: string;
let beneficio: string;
let jornada: string;
let recolector: string;
let capataz: string;
let receptor: string;
let operario: string;
let metodoFlotacion: string;
let metodoManual: string;
let catVerde: string;
let catFlotes: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(personId: string, perfil: string, siteId: string) {
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: siteId } });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: siteId } }));
  if (!existente) scopes.push(s.id);
  await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: rp.id } });
  return id;
}
const loc = async (n: string, tipo: "site" | "plot" | "beneficio", extra: Record<string, string>) =>
  (await prisma.location.create({ data: { name: `TEST ${n} (${RUN})`, locationType: tipo, classification: "internal", ...extra } })).id;

const valorDe = async (catalogo: string, valor: string) =>
  (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: valor, catalog: { key: catalogo }, aliasOfId: null } })).id;

beforeAll(async () => {
  const o = await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } });
  orgs.push(o.id);
  finca = await loc("Finca", "site", { organizationId: o.id });
  parcela = await loc("Parcela", "plot", { parentLocationId: finca });
  beneficio = await loc("Beneficio", "beneficio", { parentLocationId: finca });
  recolector = await persona("Recolector");
  await cuenta(recolector, "Recolector", finca);
  capataz = await cuenta(await persona("Capataz"), "Farm Operator", finca);
  receptor = await cuenta(await persona("Receptor"), "Farm Operator", finca);
  operario = await cuenta(await persona("Operario"), "Farm Manager", finca);
  await agregarRecolector(capataz, { fincaSiteId: finca, personId: recolector, desde: new Date(hoy.getTime() - 86_400_000) });
  // El destino ya no se pasa a `abrirJornada`: lo lleva la finca y la jornada lo COPIA (ADR-194).
  await prisma.location.update({ where: { id: finca }, data: { beneficioDestinoId: beneficio } });
  jornada = (await abrirJornada(capataz, { fincaSiteId: finca, fecha: hoy, asignaciones: [{ locationId: parcela, personId: recolector }] })).id;
  metodoFlotacion = await valorDe("seleccion_metodo", "flotacion");
  metodoManual = await valorDe("seleccion_metodo", "manual");
  catVerde = await valorDe("rechazo_categoria", "cereza_verde");
  catFlotes = await valorDe("rechazo_categoria", "flotadores");
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId: { in: jornadas } }, select: { id: true } })).map((e) => e.id);
  const recepciones = (await prisma.recepcionDeCereza.findMany({ where: { beneficioId: beneficio }, select: { id: true } })).map((r) => r.id);
  const lotes = (await prisma.lot.findMany({ where: { lotCode: { contains: RUN } }, select: { id: true } })).map((l) => l.id);
  const transformaciones = (
    await prisma.lotTransformation.findMany({ where: { OR: [{ inputs: { some: { lotId: { in: lotes } } } }, { outputs: { some: { lotId: { in: lotes } } } }] }, select: { id: true } })
  ).map((t) => t.id);
  const pedidos = (await prisma.pedidoDeCereza.findMany({ where: { beneficioId: beneficio }, select: { id: true } })).map((p) => p.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...entregas, ...recepciones, ...lotes, ...transformaciones, ...pedidos, ...recolectores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.veredictoDeCalidadDePedido.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.quantityEvent.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.deviation.deleteMany({ where: assertDefinedWhere({ lotTransformationId: { in: transformaciones } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ id: { in: transformaciones } }) });
  await borrarVinculosDeLote(recepciones);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: recepciones } }) });
  await prisma.pedidoDeCereza.deleteMany({ where: assertDefinedWhere({ id: { in: pedidos } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  // La FK del destino es RESTRICT: sin soltarlo, borrar el beneficio lanza y —siendo el
  // `afterAll` una cadena— abandona los borrados de abajo.
  await prisma.location.updateMany({ where: assertDefinedWhere({ beneficioDestinoId: beneficio }), data: { beneficioDestinoId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [parcela, beneficio] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: finca }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
}, 30000);

let n = 0;
const codigo = () => `TEST-${RUN}-${++n}`;

/** Un pedido de 100 kg con ≥ 75 % maduro, ≤ 12 % verde y ≤ 12 % flotes. */
const pedidoConLimites = async () =>
  (await crearPedido(operario, { beneficioId: beneficio, fuente: { fincaSiteId: finca }, fecha: hoy, kgPedidos: 100, margenCantidadPct: 5, minMaduroPct: 75, maxVerdePct: 12, maxFlotesPct: 12 })).id;

/** Una recepción de `kg` netos, opcionalmente atada a un pedido. */
async function recepcion(kg: number, pedidoId?: string) {
  const entregaId = (
    await anotarEntrega(capataz, { jornadaId: jornada, recolectorPersonId: recolector, origen: { locationId: parcela }, pesoFincaKg: kg, enviadaAt: new Date() })
  ).id;
  return recibirCereza(receptor, {
    claveDeEnvio: randomUUID(), beneficioId: beneficio, origen: { entregaId }, pedidoId: pedidoId ?? null,
    recibidaAt: new Date(), brutoKg: kg + 1, recipientes: 2, taraPorRecipienteKg: 0.5,
  });
}

const veredictoDe = (lotId: string) => prisma.veredictoDeCalidadDePedido.findUnique({ where: { lotId } });

function seleccion(lotId: string, insumo: number, aceptado: number, verde: number, flotes: number, extra: Record<string, unknown> = {}) {
  const rejected = [];
  if (verde > 0) rejected.push({ lotCode: codigo(), lotType: "cherry" as const, quantity: verde, rejectionCategoryValueId: catVerde });
  if (flotes > 0) rejected.push({ lotCode: codigo(), lotType: "cherry" as const, quantity: flotes, rejectionCategoryValueId: catFlotes });
  return recordSelection(operario, {
    inputLotId: lotId, inputQuantity: insumo, unit: "kg",
    selectionMethodValueId: metodoManual,
    accepted: { lotCode: codigo(), lotType: "cherry", quantity: aceptado },
    rejected, occurredAt: new Date(), provenanceClass: "measured_fact", ...extra,
  });
}

describe("el veredicto de un lote de recepciones", () => {
  it("100 de un pedido con 80 aceptado, 10 verde y 10 flotes: CUMPLE, con sus cuatro masas", async () => {
    const p = await pedidoConLimites();
    const r = await recepcion(100, p);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 100 }] });
    await seleccion(lote.id, 100, 80, 10, 10);
    const v = await veredictoDe(lote.id);
    expect(v?.juicio).toBe("CUMPLE");
    expect([Number(v?.insumoKg), Number(v?.aceptadoKg), Number(v?.verdeKg), Number(v?.flotesKg)]).toEqual([100, 80, 10, 10]);
    expect(v?.pedidoId).toBe(p);
    expect(v?.selecciones).toBe(1);
  }, 40000);

  it("una segunda selección recalcula: 1 kg limpio y después 99 con 30 de verde → NO_CUMPLE", async () => {
    const p = await pedidoConLimites();
    const r = await recepcion(100, p);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 100 }] });
    await seleccion(lote.id, 1, 1, 0, 0);
    expect((await veredictoDe(lote.id))?.juicio).toBe("CUMPLE");
    await seleccion(lote.id, 99, 69, 30, 0);
    const v = await veredictoDe(lote.id);
    expect(v?.juicio).toBe("NO_CUMPLE");
    expect(v?.motivo).toMatch(/verde/);
    expect(Number(v?.insumoKg)).toBe(100);
    expect(v?.selecciones).toBe(2);
  }, 40000);

  it("el lote ACEPTADO que se vuelve a seleccionar no crea veredicto: no tiene vínculos", async () => {
    const p = await pedidoConLimites();
    const r = await recepcion(100, p);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 100 }] });
    const primera = await seleccion(lote.id, 100, 80, 10, 10);
    const aceptado = primera.outputLots[0];
    if (!aceptado) throw new Error("la selección tiene que dar un lote aceptado");
    await seleccion(aceptado.id, 80, 70, 10, 0);
    expect(await veredictoDe(aceptado.id)).toBeNull();
    // Control positivo: el de nivel 1 SÍ lo tiene, y no lo movió la segunda selección.
    expect(Number((await veredictoDe(lote.id))?.insumoKg)).toBe(100);
  }, 40000);

  it("un lote con recepciones de DOS pedidos: NO_ATRIBUIBLE", async () => {
    const a = await recepcion(50, await pedidoConLimites());
    const b = await recepcion(50, await pedidoConLimites());
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: a.id, kg: 50 }, { recepcionId: b.id, kg: 50 }] });
    await seleccion(lote.id, 100, 100, 0, 0);
    const v = await veredictoDe(lote.id);
    expect(v?.juicio).toBe("NO_ATRIBUIBLE");
    expect(v?.pedidoId).toBeNull();
  }, 40000);

  it("flotación sin condición se rechaza; con WET entra y juzga", async () => {
    const p = await pedidoConLimites();
    const r = await recepcion(100, p);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 100 }] });
    await expect(seleccion(lote.id, 100, 80, 10, 10, { selectionMethodValueId: metodoFlotacion })).rejects.toThrow(/condicion_de_pesaje_obligatoria/);
    expect(await veredictoDe(lote.id)).toBeNull();
    await seleccion(lote.id, 100, 80, 10, 10, { selectionMethodValueId: metodoFlotacion, condicionDePesaje: "WET" });
    expect((await veredictoDe(lote.id))?.juicio).toBe("CUMPLE");
  }, 40000);

  it("dos selecciones, una WET y otra DRAINED: INCOMPARABLE_WEIGHING_CONDITION", async () => {
    const p = await pedidoConLimites();
    const r = await recepcion(100, p);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 100 }] });
    await seleccion(lote.id, 50, 40, 5, 5, { selectionMethodValueId: metodoFlotacion, condicionDePesaje: "WET" });
    await seleccion(lote.id, 50, 40, 5, 5, { selectionMethodValueId: metodoFlotacion, condicionDePesaje: "DRAINED" });
    expect((await veredictoDe(lote.id))?.juicio).toBe("INCOMPARABLE_WEIGHING_CONDITION");
  }, 40000);

  it("una selección MANUAL sin condición entra y juzga (control positivo del caso anterior)", async () => {
    const p = await pedidoConLimites();
    const r = await recepcion(100, p);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 100 }] });
    await seleccion(lote.id, 100, 80, 10, 10, { selectionMethodValueId: metodoManual });
    const v = await veredictoDe(lote.id);
    expect(v?.juicio).toBe("CUMPLE");
  }, 40000);
});

describe("el gancho de la transformación", () => {
  it("si `enLaMismaTransaccion` lanza, no queda ni transformación ni lotes de salida", async () => {
    const r = await recepcion(20);
    const lote = await armarLote(operario, { beneficioId: beneficio, codigo: codigo(), recepciones: [{ recepcionId: r.id, kg: 20 }] });
    const salida = codigo();
    const antes = await prisma.lotTransformation.count({ where: { inputs: { some: { lotId: lote.id } } } });
    await expect(
      recordTransformation(operario, {
        transformationType: "split", occurredAt: new Date(), provenanceClass: "direct_observation",
        inputs: [{ lotId: lote.id, quantity: 20, unit: "kg" }],
        outputs: [{ lotCode: salida, lotType: "cherry", quantity: 20, unit: "kg" }],
        enLaMismaTransaccion: async () => {
          throw new Error("el veredicto falló");
        },
      }),
    ).rejects.toThrow(/el veredicto falló/);
    expect(await prisma.lotTransformation.count({ where: { inputs: { some: { lotId: lote.id } } } })).toBe(antes);
    expect(await prisma.lot.findFirst({ where: { lotCode: salida } })).toBeNull();
  }, 40000);
});
