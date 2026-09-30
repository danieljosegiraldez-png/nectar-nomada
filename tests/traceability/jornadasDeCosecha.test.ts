/**
 * Recolectores y jornadas de cosecha — spec 2026-09-18 jornada y entrega de cosecha §3.1–3.2.
 * Plan: docs/superpowers/plans/2026-09-18-jornada-y-entrega-de-cosecha.md, Tarea 2.
 *
 * Grupo `base-sembrada`: necesita los perfiles del catálogo sembrados.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";
import { abrirJornada, agregarRecolector, cerrarJornada, darDeBajaRecolector, detalleDeJornada, JornadaError, recolectoresDeFinca } from "../../lib/traceability/jornadasDeCosecha";
import { declararDestinoDeFinca } from "../../lib/traceability/destinoDeFinca";
import { anotarEntrega } from "../../lib/traceability/entregasDeCosecha";
import { pendientesDeBeneficio } from "../../lib/traceability/recepcionesDeCereza";
import { can } from "../../lib/rbac/service";

const RUN = `jor-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const orgs: string[] = [];
const ubicaciones: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let A: string;
let beneficioA: string;
/** Beneficio bajo la finca B: los de A **no** lo ven. Es lo que prueba la otra mitad de ADR-194. */
let beneficioForaneo: string;
/** Segundo beneficio BAJO la finca A: el gestor sí lo ve, así que puede declararlo de verdad. */
let beneficioA2: string;
let B: string;
let parcelaA: string;
let parcelaB: string;
let managerA: string;
let operarioA: string;
let operarioB: string;
let recolector1: string;
let noRecolector: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(perfil: string, siteId: string) {
  const personId = await persona(perfil);
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
async function finca(letra: string) {
  const org = await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca ${letra} (${RUN})`, status: "approved", classification: "internal" } });
  orgs.push(org.id);
  const site = await prisma.location.create({ data: { name: `TEST Finca ${letra} (${RUN})`, locationType: "site", organizationId: org.id, classification: "internal" } });
  ubicaciones.push(site.id);
  const plot = await prisma.location.create({ data: { name: `TEST Parcela ${letra} (${RUN})`, locationType: "plot", parentLocationId: site.id, classification: "internal" } });
  ubicaciones.push(plot.id);
  return { site: site.id, plot: plot.id };
}

beforeAll(async () => {
  const fa = await finca("A");
  const fb = await finca("B");
  A = fa.site; parcelaA = fa.plot; B = fb.site; parcelaB = fb.plot;
  beneficioA = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: A, classification: "internal" } })).id;
  beneficioA2 = (await prisma.location.create({ data: { name: `TEST Beneficio A2 (${RUN})`, locationType: "beneficio", parentLocationId: A, classification: "internal" } })).id;
  beneficioForaneo = (await prisma.location.create({ data: { name: `TEST Beneficio foráneo (${RUN})`, locationType: "beneficio", parentLocationId: B, classification: "internal" } })).id;
  managerA = await cuenta("Farm Manager", A);
  operarioA = await cuenta("Farm Operator", A);
  operarioB = await cuenta("Farm Operator", B);
  recolector1 = await persona("Recolector 1");
  noRecolector = await persona("No recolector");
  const { organizationId } = await prisma.location.findUniqueOrThrow({ where: { id: A }, select: { organizationId: true } });
  await prisma.organizationMembership.createMany({ data: [recolector1, noRecolector].map((personId) => ({ personId, organizationId: organizationId! })) });
  await agregarRecolector(managerA, { fincaSiteId: A, personId: recolector1, desde: new Date(hoy.getTime() - 86_400_000) });
  // El destino ya no se pasa a `abrirJornada`: lo lleva la finca (ADR-194).
  await declararDestinoDeFinca(managerA, { fincaSiteId: A, beneficioId: beneficioA });
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: { in: [A, B] } }, select: { id: true } })).map((j) => j.id);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: { in: [A, B] } }, select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...recolectores] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.entregaDeCosecha.deleteMany({ where: assertDefinedWhere({ jornadaId: { in: jornadas } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.organizationMembership.deleteMany({ where: assertDefinedWhere({ personId: { in: personas } }) });
  // La FK del destino es RESTRICT: un beneficio al que una finca envía no se puede borrar.
  await prisma.location.updateMany({ where: assertDefinedWhere({ id: { in: [A, B] } }), data: { beneficioDestinoId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [beneficioA, beneficioA2, beneficioForaneo, parcelaA, parcelaB] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [A, B] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: orgs } }) });
}, 30000);

describe("los permisos nuevos", () => {
  it("están en el catálogo, y el perfil Recolector sólo tiene los suyos", () => {
    const clave = (r: string, a: string) => PERMISSIONS.some((p) => p.resourceType === r && p.action === a);
    expect(clave("harvest_delivery", "create_own")).toBe(true);
    expect(clave("field_report", "create_own")).toBe(true);
    expect(clave("field_report", "view")).toBe(true);
    const recolector = ROLE_PROFILES.find((p) => p.name === "Recolector")!;
    expect(recolector.permissions.map(([r, a]) => `${r}:${a}`).sort()).toEqual(["classification:clear_internal", "field_report:create_own", "harvest_delivery:create_own"]);
    // Control del mismo lector: el capataz sí ve situaciones de campo, y lot:manage sigue ahí.
    const fo = ROLE_PROFILES.find((p) => p.name === "Farm Operator")!;
    expect(fo.permissions.some(([r, a]) => r === "field_report" && a === "view")).toBe(true);
    expect(fo.permissions.some(([r, a]) => r === "lot" && a === "manage")).toBe(true);
  });
});

describe("la jornada de cosecha", () => {
  it("el Farm Manager de la finca abre una jornada con su asignación, y se lee con su detalle", async () => {
    const j = await abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    expect(j.estado).toBe("abierta");
    const d = await detalleDeJornada(managerA, j.id);
    expect(d.asignaciones.map((a) => [a.location.id, a.person.id])).toEqual([[parcelaA, recolector1]]);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: j.id, operation: "harvest_day.open" } })).not.toBeNull();
  }, 20000);

  it("el capataz de esta finca también abre (control positivo)", async () => {
    const j = await abrirJornada(operarioA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    expect(j.fincaSiteId).toBe(A);
  }, 20000);

  it("una parcela de otra finca se rechaza", async () => {
    await expect(abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaB, personId: recolector1 }] })).rejects.toThrow(
      /parcela_fuera_de_la_finca/,
    );
  }, 20000);

  it("una persona que no es recolectora de la finca se rechaza", async () => {
    await expect(abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: noRecolector }] })).rejects.toThrow(
      /no_es_recolector/,
    );
  }, 20000);

  it("el capataz de OTRA finca no abre jornadas aquí", async () => {
    await expect(abrirJornada(operarioB, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] })).rejects.toThrow();
  }, 20000);

  it("sin asignaciones no se abre, y cerrar dos veces da ya_cerrada", async () => {
    await expect(abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [] })).rejects.toThrow(/sin_asignaciones/);
    const j = await abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    const cerrada = await cerrarJornada(managerA, j.id);
    expect(cerrada.estado).toBe("cerrada");
    await expect(cerrarJornada(managerA, j.id)).rejects.toThrow(/ya_cerrada/);
  }, 20000);

  it("la lista de recolectores de la finca", async () => {
    const lista = await recolectoresDeFinca(managerA, A);
    expect(lista.map((r) => r.personId)).toContain(recolector1);
    expect(lista.map((r) => r.personId)).not.toContain(noRecolector);
  }, 20000);
});

describe("dar de baja a un recolector (2026-09-25)", () => {
  /**
   * `agregarRecolector` no tenía inverso: el campo `hasta` estaba en el modelo y ningún código lo
   * escribía. Daniel dio de alta un recolector de prueba en producción y no había cómo quitarlo.
   * Cerrar NO borra: sus entregas siguen siendo suyas; lo que cambia es que ya no se le puede
   * asignar a jornadas posteriores.
   */
  it("cierra el periodo y desaparece de los recolectores de hoy, sin borrar la fila", async () => {
    const personaId = await persona("Baja");
    const { organizationId: orgDeA } = await prisma.location.findUniqueOrThrow({ where: { id: A }, select: { organizationId: true } });
    await prisma.organizationMembership.create({ data: { personId: personaId, organizationId: orgDeA! } });
    await agregarRecolector(managerA, { fincaSiteId: A, personId: personaId, desde: new Date(hoy.getTime() - 86_400_000) });
    expect((await recolectoresDeFinca(managerA, A)).map((r) => r.personId)).toContain(personaId);

    await darDeBajaRecolector(managerA, { fincaSiteId: A, personId: personaId, hasta: new Date(hoy.getTime() - 3_600_000) });

    expect((await recolectoresDeFinca(managerA, A)).map((r) => r.personId)).not.toContain(personaId);
    const fila = await prisma.fincaRecolector.findFirstOrThrow({ where: { personId: personaId, fincaSiteId: A } });
    expect(fila.hasta, "la fila sigue ahí, cerrada").not.toBeNull();
  });

  it("rechaza una baja anterior al alta: sería una ventana imposible", async () => {
    const personaId = await persona("BajaAntes");
    const { organizationId: orgDeA } = await prisma.location.findUniqueOrThrow({ where: { id: A }, select: { organizationId: true } });
    await prisma.organizationMembership.create({ data: { personId: personaId, organizationId: orgDeA! } });
    await agregarRecolector(managerA, { fincaSiteId: A, personId: personaId, desde: hoy });
    // **La clase y el mensaje exactos, no una expresión regular.** La base tiene su propio
    // `CHECK (hasta > desde)`, así que quitando esta comprobación la escritura falla igual — pero con
    // un `PrismaClientKnownRequestError` de mensaje VACÍO. Con `toThrow(/…/)` la prueba pasaba en los
    // dos mundos y no discriminaba: lo vio el flip-test del 2026-09-25.
    let capturado: unknown;
    try {
      await darDeBajaRecolector(managerA, { fincaSiteId: A, personId: personaId, hasta: new Date(hoy.getTime() - 10 * 86_400_000) });
    } catch (e) {
      capturado = e;
    }
    expect(capturado, "tiene que rechazar").toBeInstanceOf(JornadaError);
    expect((capturado as Error).message).toBe("baja_antes_del_alta");
  });

  it("rechaza dar de baja a quien no es recolector", async () => {
    await expect(
      darDeBajaRecolector(managerA, { fincaSiteId: A, personId: noRecolector, hasta: hoy }),
    ).rejects.toThrow(/no_es_recolector/);
  });

  it("y el operario de OTRA finca no puede dar de baja a nadie aquí", async () => {
    await expect(
      darDeBajaRecolector(operarioB, { fincaSiteId: A, personId: recolector1, hasta: hoy }),
    ).rejects.toThrow();
  });
});

/**
 * ADR-194, sus dos mitades. Diseño:
 * `docs/superpowers/specs/2026-09-30-destino-de-cereza-por-finca-design.md`.
 */
describe("el destino sale de la finca, no de quien abre", () => {
  /**
   * **La jornada COPIA, no referencia.** Decisión de Daniel, 2026-09-30, y la misma regla que
   * `docs/beneficio/20_modelo_ciclo_completo.md` fija para las muestras: «una muestra guarda una
   * instantánea del estado del lote, no una referencia viva». Si la jornada resolviera el destino
   * en vivo, cambiar el de la finca movería jornadas ya cerradas —y con ellas entregas ya
   * recibidas— hacia un beneficio que nunca las recibió. Un refactor mecánico rompe justo esto,
   * porque «leer el destino de la finca» suena igual de bien en las dos formas.
   */
  it("la jornada COPIA el destino: cambiar el de la finca no la mueve", async () => {
    const j = await abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    const antes = (await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId;
    expect(antes).toBe(beneficioA);

    // **Por el SERVICIO, no por un `prisma.update` directo.** La primera versión de esta prueba
    // cambiaba la columna a mano, y su flip-test lo delató: propagar el cambio a las jornadas
    // abiertas desde `declararDestinoDeFinca` —el error que esta prueba existe para cazar— la
    // dejaba en verde, porque el camino mutado no era el que la prueba recorría.
    await declararDestinoDeFinca(managerA, { fincaSiteId: A, beneficioId: beneficioA2 });
    const despues = (await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId;
    expect(despues).toBe(beneficioA); // NO `beneficioA2`: es una instantánea.

    await declararDestinoDeFinca(managerA, { fincaSiteId: A, beneficioId: beneficioA });
  });

  /**
   * **La otra mitad de ADR-194, y la que nadie había nombrado.** «El cosechador no tiene que
   * definir a quién le entrega; sólo entrega y pesa». Mientras `abrirJornada` exigía `lot:view`
   * sobre el beneficio, un capataz que no alcanza el beneficio de destino no podía abrir la
   * jornada del día — la contradicción quedaba abierta aunque el selector desapareciera.
   *
   * **El control positivo va ANTES del veredicto y es lo que hace que esta prueba signifique
   * algo:** si `operarioA` resultara ver el beneficio foráneo, la apertura pasaría por el motivo
   * equivocado y la prueba saldría verde sin probar nada.
   */
  it("quien abre la jornada NO necesita permiso en el beneficio", async () => {
    const foraneo = await prisma.location.findUniqueOrThrow({ where: { id: beneficioForaneo }, select: { classification: true } });
    const loVe = await can(operarioA, "view", "lot", { scopeType: "location", scopeRefId: beneficioForaneo }, foraneo.classification);
    expect(loVe).toBe(false); // control: el capataz de A NO alcanza el beneficio de B

    await prisma.location.update({ where: { id: A }, data: { beneficioDestinoId: beneficioForaneo } });
    const j = await abrirJornada(operarioA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    expect((await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId).toBe(beneficioForaneo);

    await prisma.location.update({ where: { id: A }, data: { beneficioDestinoId: beneficioA } });
  });

  /**
   * Una finca sin destino **abre jornada igual** —Jaramillo y Artillería existen— y sus entregas no
   * aparecen en ningún beneficio.
   *
   * **Afirma sobre IDs y no sobre recuentos, a propósito.** Las otras pruebas de este archivo
   * abren jornadas sobre la misma finca A con destino `beneficioA`, así que un
   * `toHaveLength(0)` mediría el resto de la suite y no este cambio. Y el control positivo no es
   * repetir la consulta: es **enlazar la finca y volver a preguntar**. Sin él, un «no aparece» se
   * lee como «funciona» cuando puede ser «no miré».
   */
  it("una finca sin destino abre jornada, y su entrega no sale en ningún beneficio", async () => {
    await prisma.location.update({ where: { id: A }, data: { beneficioDestinoId: null } });
    const j = await abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    expect((await prisma.jornadaDeCosecha.findUniqueOrThrow({ where: { id: j.id } })).beneficioId).toBeNull();
    const sinDestino = await anotarEntrega(managerA, { jornadaId: j.id, recolectorPersonId: recolector1, origen: { locationId: parcelaA }, pesoFincaKg: 12, enviadaAt: new Date() });
    expect((await pendientesDeBeneficio(managerA, beneficioA)).map((e) => e.id)).not.toContain(sinDestino.id);

    // Control positivo: con la finca enlazada, la MISMA consulta sí la trae.
    await declararDestinoDeFinca(managerA, { fincaSiteId: A, beneficioId: beneficioA });
    const j2 = await abrirJornada(managerA, { fincaSiteId: A, fecha: hoy, asignaciones: [{ locationId: parcelaA, personId: recolector1 }] });
    const conDestino = await anotarEntrega(managerA, { jornadaId: j2.id, recolectorPersonId: recolector1, origen: { locationId: parcelaA }, pesoFincaKg: 13, enviadaAt: new Date() });
    expect((await pendientesDeBeneficio(managerA, beneficioA)).map((e) => e.id)).toContain(conDestino.id);
  });
});
