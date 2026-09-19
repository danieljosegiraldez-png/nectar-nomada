/**
 * Las reglas de la recepción de cereza que viven EN LA BASE, no sólo en el servicio.
 *
 * Spec: docs/superpowers/specs/2026-09-19-recepcion-de-cereza-en-beneficio-design.md §3.
 * Plan: docs/superpowers/plans/2026-09-19-recepcion-de-cereza-en-beneficio.md, Tarea 1.
 *
 * Cada rechazo lleva su control positivo. Y una cosa de Postgres que decide cómo se escriben: los
 * disparadores BEFORE corren ANTES que los CHECK, así que cada sonda de un CHECK construye una fila
 * que pasa los disparadores; si no, el rechazo sería del disparador y no probaría el CHECK.
 * Grupo `base-sembrada`.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `rec-esq-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
let orgId: string;
let proveedorId: string;
let siteId: string;
let plotId: string;
let beneficioId: string;
let otroBeneficioId: string;
let jornadaId: string;
let recolector: string;
let cuentaRecolector: string;
let capataz: string;
let receptor: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(personId: string) {
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  return id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })).id;
  proveedorId = (await prisma.organization.create({ data: { organizationType: "producer", name: `TEST Don Pedro (${RUN})`, status: "approved", classification: "internal" } })).id;
  siteId = (await prisma.location.create({ data: { name: `TEST Sitio (${RUN})`, locationType: "site", organizationId: orgId, classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { name: `TEST Parcela (${RUN})`, locationType: "plot", parentLocationId: siteId, classification: "internal" } })).id;
  beneficioId = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: siteId, classification: "internal" } })).id;
  otroBeneficioId = (await prisma.location.create({ data: { name: `TEST Otro beneficio (${RUN})`, locationType: "beneficio", parentLocationId: siteId, classification: "internal" } })).id;
  recolector = await persona("Recolector");
  cuentaRecolector = await cuenta(recolector);
  capataz = await cuenta(await persona("Capataz"));
  receptor = await cuenta(await persona("Receptor"));
  jornadaId = (await prisma.jornadaDeCosecha.create({ data: { fincaSiteId: siteId, beneficioId, fecha: new Date() } })).id;
}, 30000);

afterAll(async () => {
  const entregas = (await prisma.entregaDeCosecha.findMany({ where: { jornadaId }, select: { id: true } })).map((e) => e.id);
  await prisma.recepcionDeCereza.deleteMany({ where: assertDefinedWhere({ beneficioId: { in: [beneficioId, otroBeneficioId] } }) });
  await prisma.pedidoDeCereza.deleteMany({ where: assertDefinedWhere({ beneficioId }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: entregas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: jornadaId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [plotId, beneficioId, otroBeneficioId] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: siteId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [orgId, proveedorId] } }) });
}, 30000);

/** Una entrega enviada de 20 kg, anotada por el capataz. Cada prueba usa la suya. */
async function entrega() {
  return (
    await prisma.entregaDeCosecha.create({
      data: { jornadaId, recolectorId: recolector, locationId: plotId, pesoFincaKg: 20, enviadaAt: new Date(), anotadaPor: capataz },
    })
  ).id;
}

/** Una recepción válida de esa entrega: bruto 21, 2 recipientes de 0,5 → neto 20, BALANCED. */
function recepcion(entregaId: string | null, extra: Record<string, unknown> = {}) {
  return prisma.recepcionDeCereza.create({
    data: {
      claveDeEnvio: randomUUID(),
      beneficioId,
      entregaId,
      recibidaPor: receptor,
      recibidaAt: new Date(),
      brutoKg: 21,
      recipientes: 2,
      taraPorRecipienteKg: 0.5,
      netoKg: 20,
      referenciaKg: 20,
      diferenciaKg: 0,
      toleranciaKg: 0.5,
      comparacion: "BALANCED",
      politicaDeBalance: { relativeTolerance: 0.005, absoluteFloorKg: 0.5, grossThreshold: 0.05 },
      ...extra,
    },
  });
}
const sinComparacion = { referenciaKg: null, diferenciaKg: null, toleranciaKg: null, comparacion: null, politicaDeBalance: undefined };

describe("la recepción de cereza, en la base", () => {
  it("un origen: dos se rechazan, ninguno también; uno entra", async () => {
    const e = await entrega();
    await expect(recepcion(e, { proveedorId })).rejects.toThrow(/recepcion_de_cereza_un_origen/);
    await expect(recepcion(null, sinComparacion)).rejects.toThrow(/recepcion_de_cereza_un_origen/);
    const buena = await recepcion(null, { ...sinComparacion, proveedorId });
    expect(buena.proveedorId).toBe(proveedorId);
  }, 20000);

  it("el neto se recalcula en la base: 18 con bruto 20 y 2 × 0,5 se rechaza; 19 entra", async () => {
    const e = await entrega();
    await expect(recepcion(e, { brutoKg: 20, netoKg: 18 })).rejects.toThrow(/recepcion_de_cereza_pesos/);
    const buena = await recepcion(e, { brutoKg: 20, netoKg: 19 });
    expect(Number(buena.netoKg)).toBe(19);
  }, 20000);

  it("fuera de tolerancia exige nota; con nota entra", async () => {
    const e = await entrega();
    await expect(recepcion(e, { comparacion: "DISCREPANCY_FLAGGED" })).rejects.toThrow(/recepcion_de_cereza_nota_si_discrepa/);
    const buena = await recepcion(e, { comparacion: "DISCREPANCY_FLAGGED", nota: "sacos mojados" });
    expect(buena.comparacion).toBe("DISCREPANCY_FLAGGED");
  }, 20000);

  it("el Brix va con su punto de muestreo y su veredicto, o no va", async () => {
    const e = await entrega();
    await expect(recepcion(e, { brix: 19, veredictoBrix: "INTAKE_OPTIMAL" })).rejects.toThrow(/recepcion_de_cereza_brix_completo/);
    const buena = await recepcion(e, { brix: 19, puntoDeMuestreo: "CHERRY_PULP", veredictoBrix: "INTAKE_OPTIMAL" });
    expect(buena.puntoDeMuestreo).toBe("CHERRY_PULP");
  }, 20000);

  it("rechazada exige motivo", async () => {
    const e = await entrega();
    await expect(recepcion(e, { estado: "rechazada" })).rejects.toThrow(/recepcion_de_cereza_rechazo/);
    const buena = await recepcion(e, { estado: "rechazada", motivoRechazo: "fermentada" });
    expect(buena.estado).toBe("rechazada");
  }, 20000);
});

describe("dos personas, en la base", () => {
  it("quien anotó la entrega no la recibe; su recolector con cuenta tampoco; otra persona sí", async () => {
    const e = await entrega();
    await expect(recepcion(e, { recibidaPor: capataz })).rejects.toThrow(/recepcion_de_cereza_dos_personas/);
    await expect(recepcion(e, { recibidaPor: cuentaRecolector })).rejects.toThrow(/recepcion_de_cereza_dos_personas/);
    const buena = await recepcion(e);
    expect(buena.recibidaPor).toBe(receptor);
  }, 20000);

  it("la referencia es el peso de finca: otra cifra se rechaza", async () => {
    const e = await entrega();
    await expect(recepcion(e, { referenciaKg: 19 })).rejects.toThrow(/recepcion_de_cereza_referencia/);
  }, 20000);

  it("cambiar quién recibió, o el neto, se rechaza; anular con sus tres campos entra", async () => {
    const r = await recepcion(await entrega());
    await expect(prisma.recepcionDeCereza.update({ where: { id: r.id }, data: { recibidaPor: capataz } })).rejects.toThrow(
      /recepcion_de_cereza_dos_personas/,
    );
    await expect(prisma.recepcionDeCereza.update({ where: { id: r.id }, data: { brutoKg: 22, netoKg: 21 } })).rejects.toThrow(
      /recepcion_de_cereza_inmutable/,
    );
    const anulada = await prisma.recepcionDeCereza.update({
      where: { id: r.id },
      data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: receptor, motivoAnulacion: "pesada en otra báscula" },
    });
    expect(anulada.estado).toBe("anulada");
    await expect(prisma.recepcionDeCereza.update({ where: { id: r.id }, data: { motivoAnulacion: "otra razón" } })).rejects.toThrow(
      /recepcion_de_cereza_inmutable/,
    );
  }, 20000);

  it("quien anotó la entrega tampoco la anula", async () => {
    const r = await recepcion(await entrega());
    await expect(
      prisma.recepcionDeCereza.update({ where: { id: r.id }, data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: capataz, motivoAnulacion: "x" } }),
    ).rejects.toThrow(/recepcion_de_cereza_dos_personas/);
  }, 20000);
});

describe("una entrega, una recepción vigente", () => {
  it("dos recepciones vigentes de la misma entrega se rechazan; anulada la primera, la segunda entra", async () => {
    const e = await entrega();
    const primera = await recepcion(e);
    await expect(recepcion(e)).rejects.toThrow(/Unique constraint|recepcion_de_cereza_entrega_vigente/);
    await prisma.recepcionDeCereza.update({
      where: { id: primera.id },
      data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: receptor, motivoAnulacion: "se repite" },
    });
    const segunda = await recepcion(e);
    expect(segunda.entregaId).toBe(e);
  }, 20000);

  it("la entrega recibida no se anula; con la recepción anulada, sí", async () => {
    const e = await entrega();
    const r = await recepcion(e);
    const anularEntrega = () =>
      prisma.entregaDeCosecha.update({ where: { id: e }, data: { estado: "anulada", anuladaAt: new Date(), motivoAnulacion: "error" } });
    await expect(anularEntrega()).rejects.toThrow(/entrega_de_cosecha_recibida_no_se_anula/);
    await prisma.recepcionDeCereza.update({
      where: { id: r.id },
      data: { estado: "anulada", anuladaAt: new Date(), anuladaPor: receptor, motivoAnulacion: "error de peso" },
    });
    const anulada = await anularEntrega();
    expect(anulada.estado).toBe("anulada");
  }, 20000);

  it("el destino de la jornada queda fijo con una entrega recibida; sin ella, cambia", async () => {
    const otra = await prisma.jornadaDeCosecha.create({ data: { fincaSiteId: siteId, beneficioId, fecha: new Date() } });
    const cambiar = (b: string) => prisma.jornadaDeCosecha.update({ where: { id: otra.id }, data: { beneficioId: b } });
    const cambiada = await cambiar(otroBeneficioId);
    expect(cambiada.beneficioId).toBe(otroBeneficioId);
    await cambiar(beneficioId);
    const e = (await prisma.entregaDeCosecha.create({
      data: { jornadaId: otra.id, recolectorId: recolector, locationId: plotId, pesoFincaKg: 20, enviadaAt: new Date(), anotadaPor: capataz },
    })).id;
    const r = await recepcion(e);
    await expect(cambiar(otroBeneficioId)).rejects.toThrow(/jornada_de_cosecha_destino_fijo/);
    await prisma.recepcionDeCereza.delete({ where: { id: r.id } });
    await prisma.entregaDeCosecha.delete({ where: { id: e } });
    await prisma.jornadaDeCosecha.delete({ where: { id: otra.id } });
  }, 20000);
});
