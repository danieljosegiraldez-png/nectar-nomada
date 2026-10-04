/**
 * Las situaciones de campo del recolector — spec 2026-09-18 jornada y entrega §3.5. Plan, Tarea 4.
 *
 * Grupo `base-sembrada`: necesita los perfiles y catálogos sembrados (Recolector, Farm Manager,
 * `event_kind`, `condicion_del_dia`).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { abrirJornada, agregarRecolector, cerrarJornada } from "../../lib/traceability/jornadasDeCosecha";
import {
  confirmarFotoDeSituacion,
  pedirSubidaDeFotoDeSituacion,
  reportarCondicionDelDia,
  reportarSituacion,
  situacionesDeJornada,
  situacionesDeLaFinca,
} from "../../lib/traceability/situacionesDeCampo";
import { requireLocationAttributeAccess } from "../../lib/traceability/locations";

const RUN = `sit-${Date.now()}`;
const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const hoy = new Date(new Date().toISOString().slice(0, 10));

let orgId: string;
let finca: string;
let beneficio: string;
let parcela: string;
let otraParcela: string;
let bloque: string;
let manager: string;
let cuentaA: string;
let cuentaC: string;
let asignacionC: string;
let jornada: string;
let incidencia: string;
let otroTipo: string;
let lluvia: string;

async function persona(n: string) {
  const id = randomUUID();
  await prisma.person.create({ data: { id, givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN})` } });
  personas.push(id);
  return id;
}
async function cuenta(personId: string, perfil: string) {
  const id = randomUUID();
  await prisma.userAccount.create({ data: { id, personId, status: "active", authProvider: "credentials" } });
  cuentas.push(id);
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: finca } });
  const s = existente ?? (await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: finca } }));
  if (!existente) scopes.push(s.id);
  const a = await prisma.assignment.create({ data: { userAccountId: id, scopeId: s.id, roleProfileId: rp.id } });
  return { id, asignacion: a.id };
}
async function valor(catalogo: string, v: string) {
  return (await prisma.variableCatalogValue.findFirstOrThrow({ where: { value: v, catalog: { key: catalogo } } })).id;
}

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })).id;
  finca = (await prisma.location.create({ data: { name: `TEST Finca (${RUN})`, locationType: "site", organizationId: orgId, classification: "internal" } })).id;
  beneficio = (await prisma.location.create({ data: { name: `TEST Beneficio (${RUN})`, locationType: "beneficio", parentLocationId: finca, classification: "internal" } })).id;
  parcela = (await prisma.location.create({ data: { name: `TEST P (${RUN})`, locationType: "plot", parentLocationId: finca, classification: "internal" } })).id;
  otraParcela = (await prisma.location.create({ data: { name: `TEST Q (${RUN})`, locationType: "plot", parentLocationId: finca, classification: "internal" } })).id;
  bloque = (await prisma.plotBlock.create({ data: { locationId: parcela, name: `TEST Bloque (${RUN})` } })).id;
  manager = (await cuenta(await persona("Manager"), "Farm Manager")).id;
  const a = await persona("Recolector A");
  const c = await persona("Recolector C");
  cuentaA = (await cuenta(a, "Recolector")).id;
  const cc = await cuenta(c, "Recolector");
  cuentaC = cc.id;
  asignacionC = cc.asignacion;
  const ayer = new Date(hoy.getTime() - 86_400_000);
  await agregarRecolector(manager, { fincaSiteId: finca, personId: a, desde: ayer });
  await agregarRecolector(manager, { fincaSiteId: finca, personId: c, desde: ayer });
  // El destino ya no se pasa a `abrirJornada`: lo lleva la finca y la jornada lo COPIA (ADR-194).
  await prisma.location.update({ where: { id: finca }, data: { beneficioDestinoId: beneficio } });
  jornada = (
    await abrirJornada(manager, {
      fincaSiteId: finca,
      fecha: hoy,
      asignaciones: [
        { locationId: parcela, personId: a },
        { locationId: parcela, personId: c },
      ],
    })
  ).id;
  incidencia = await valor("event_kind", "incidencia");
  otroTipo = await valor("event_kind", "otro");
  lluvia = await valor("condicion_del_dia", "lluvia");
}, 30000);

afterAll(async () => {
  const jornadas = (await prisma.jornadaDeCosecha.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((j) => j.id);
  const sesiones = (await prisma.fieldSession.findMany({ where: { jornadaDeCosechaId: { in: jornadas } }, select: { id: true } })).map((s) => s.id);
  const filas = await prisma.fieldEvent.findMany({ where: { fieldSessionId: { in: sesiones } }, select: { id: true, assetId: true } });
  const eventos = filas.map((e) => e.id);
  const assets = filas.map((e) => e.assetId).filter((a): a is string => !!a);
  const recolectores = (await prisma.fincaRecolector.findMany({ where: { fincaSiteId: finca }, select: { id: true } })).map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ entityId: { in: [...jornadas, ...sesiones, ...eventos, ...recolectores, ...assets] } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ id: { in: eventos } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesiones } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assets } }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ id: { in: jornadas } }) });
  await prisma.fincaRecolector.deleteMany({ where: assertDefinedWhere({ id: { in: recolectores } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ id: bloque }) });
  // La FK del destino es RESTRICT: sin soltarlo, borrar el beneficio lanza y —siendo el
  // `afterAll` una cadena— abandona los borrados de abajo.
  await prisma.location.updateMany({ where: assertDefinedWhere({ beneficioDestinoId: beneficio }), data: { beneficioDestinoId: null } });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [beneficio, parcela, otraParcela] } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: finca }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: orgId }) });
}, 30000);

describe("reportar", () => {
  it("A reporta una situación sobre un bloque de su parcela, dentro de una FieldSession de la jornada", async () => {
    const e = await reportarSituacion(cuentaA, { jornadaId: jornada, sobre: { plotBlockId: bloque }, tipoValueId: incidencia, nota: "broca en el bloque", ocurridaAt: new Date() });
    expect(e.plotBlockId).toBe(bloque);
    const sesion = await prisma.fieldSession.findUniqueOrThrow({ where: { id: e.fieldSessionId } });
    expect(sesion.jornadaDeCosechaId).toBe(jornada);
    expect(sesion.locationId).toBe(parcela);
    expect(await prisma.auditEvent.findFirst({ where: { entityId: e.id, operation: "field_event.record" } })).not.toBeNull();
    // Un segundo reporte reusa la misma sesión.
    const e2 = await reportarSituacion(cuentaA, { jornadaId: jornada, sobre: { locationId: parcela }, tipoValueId: incidencia, nota: null, ocurridaAt: new Date() });
    expect(e2.fieldSessionId).toBe(e.fieldSessionId);
  }, 20000);

  it("sobre una parcela no asignada se rechaza", async () => {
    await expect(
      reportarSituacion(cuentaA, { jornadaId: jornada, sobre: { locationId: otraParcela }, tipoValueId: incidencia, ocurridaAt: new Date() }),
    ).rejects.toThrow(/sobre_no_asignado/);
  }, 20000);

  it("«otro» sin nota se rechaza, con nota entra", async () => {
    await expect(reportarSituacion(cuentaA, { jornadaId: jornada, sobre: { locationId: parcela }, tipoValueId: otroTipo, nota: " ", ocurridaAt: new Date() })).rejects.toThrow(
      /nota_obligatoria/,
    );
    const e = await reportarSituacion(cuentaA, { jornadaId: jornada, sobre: { locationId: parcela }, tipoValueId: otroTipo, nota: "árbol caído", ocurridaAt: new Date() });
    expect(e.notes).toBe("árbol caído");
  }, 20000);

  it("la condición del día es una observación con su valor del catálogo, y sólo de ese catálogo", async () => {
    const e = await reportarCondicionDelDia(cuentaA, { jornadaId: jornada, locationId: parcela, condicionValueId: lluvia, ocurridaAt: new Date() });
    expect(e.condicionDelDiaValueId).toBe(lluvia);
    await expect(reportarCondicionDelDia(cuentaA, { jornadaId: jornada, locationId: parcela, condicionValueId: incidencia, ocurridaAt: new Date() })).rejects.toThrow(
      /condicion_del_dia_invalido/,
    );
  }, 20000);

  it("reportar no da location:manage_attributes: A sigue sin poder editar la parcela", async () => {
    await expect(requireLocationAttributeAccess(cuentaA, parcela)).rejects.toThrow();
    // Control: el Farm Manager sí puede, así que el rechazo de A es del permiso, no del id.
    await expect(requireLocationAttributeAccess(manager, parcela)).resolves.not.toThrow();
  }, 20000);
});

describe("quién lo ve", () => {
  it("el Farm Manager ve la situación de A", async () => {
    const todo = await situacionesDeJornada(manager, jornada);
    expect(todo.some((e) => e.notes === "broca en el bloque")).toBe(true);
  }, 20000);

  it("C, recolector sin field_report:view, NO ve la de A", async () => {
    const vistas = await situacionesDeJornada(cuentaC, jornada);
    expect(vistas.some((e) => e.notes === "broca en el bloque")).toBe(false);
  }, 20000);

  it("C con field_report:view concedido en la finca SÍ la ve (control positivo)", async () => {
    const permiso = await prisma.permission.findUniqueOrThrow({ where: { resourceType_action: { resourceType: "field_report", action: "view" } } });
    await prisma.assignmentPermissionOverride.create({
      data: { assignmentId: asignacionC, permissionId: permiso.id, effect: "grant", reason: `TEST trabaja la misma parcela (${RUN})` },
    });
    const vistas = await situacionesDeJornada(cuentaC, jornada);
    expect(vistas.some((e) => e.notes === "broca en el bloque")).toBe(true);
  }, 20000);
});

describe("la foto de una situación", () => {
  it("confirmarla crea un FieldEvent de tipo foto con su Asset, sobre lo asignado", async () => {
    const storageKey = `nectar-originals/field/jornadas/${jornada}/TEST-${RUN}.jpg`;
    const e = await confirmarFotoDeSituacion(cuentaA, {
      jornadaId: jornada, sobre: { plotBlockId: bloque }, storageKey, mimeType: "image/jpeg", sizeBytes: 1234, originalFilename: "broca.jpg", nota: "TEST foto", ocurridaAt: new Date(),
    });
    expect(e.assetId).not.toBeNull();
    expect(e.plotBlockId).toBe(bloque);
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: e.assetId! } });
    expect(asset.storageKey).toBe(storageKey);
    const tipo = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: e.eventKindValueId } });
    expect(tipo.value).toBe("foto");
  }, 20000);

  it("una clave fuera de la jornada, o sobre algo no asignado, se rechaza", async () => {
    const base = { jornadaId: jornada, mimeType: "image/jpeg", sizeBytes: 10, originalFilename: "x.jpg", ocurridaAt: new Date() };
    await expect(confirmarFotoDeSituacion(cuentaA, { ...base, sobre: { locationId: parcela }, storageKey: `nectar-originals/field/otra/TEST-${RUN}.jpg` })).rejects.toThrow(
      /clave_invalida/,
    );
    await expect(
      confirmarFotoDeSituacion(cuentaA, { ...base, sobre: { locationId: otraParcela }, storageKey: `nectar-originals/field/jornadas/${jornada}/TEST-${RUN}-2.jpg` }),
    ).rejects.toThrow(/sobre_no_asignado/);
  }, 20000);

  it("pedir la subida exige un medio y la compuerta del recolector", async () => {
    await expect(pedirSubidaDeFotoDeSituacion(cuentaA, { jornadaId: jornada, originalFilename: "x.pdf", contentType: "application/pdf" })).rejects.toThrow(
      /tipo_de_archivo_invalido/,
    );
    // El Farm Manager ve las situaciones pero no reporta como recolector: no tiene field_report:create_own.
    await expect(pedirSubidaDeFotoDeSituacion(manager, { jornadaId: jornada, originalFilename: "x.jpg", contentType: "image/jpeg" })).rejects.toThrow(/sin_permiso/);
  }, 20000);
});

/**
 * **Lo que el recolector reporta tiene que llegar a alguien sin ir a buscarlo.**
 *
 * Decisión de Daniel, 2026-10-04. El spec del 2026-09-18 ya decía QUIÉN lo ve (§3.5) y el §6 ya
 * exigía estas pruebas de permiso — que existen y pasan, arriba—, pero su §3.6 «Pantallas»
 * enumeró tres pantallas y se olvidó de ésta. Resultado medido el 2026-10-04:
 * `situacionesDeJornada` aparece en **0** archivos de `app/` (control: `detalleDeJornada`, que la
 * pantalla sí usa, aparece en 1), así que diez pruebas en verde cubrían una función que ninguna
 * pantalla llamaba. Gente metiendo datos en un agujero.
 *
 * Este lector es el de la banda de `/finca`: por FINCA y no por jornada, porque el punto es
 * enterarse sin abrir nada.
 */
describe("situacionesDeLaFinca — lo que pide atención hoy", () => {
  let jornadaCerrada: string;

  it("una situación de una jornada ABIERTA aparece", async () => {
    const { filas } = await situacionesDeLaFinca(manager, finca);
    expect(filas.some((e) => e.notes === "broca en el bloque")).toBe(true);
  }, 20000);

  /**
   * **El control que hace que el caso de arriba signifique algo.** Si el lector devolviera
   * siempre todo, la primera aserción pasaría igual. Se cierra una jornada con su propia
   * situación dentro y se comprueba que la de la abierta sigue, y la de la cerrada no.
   */
  it("la de una jornada CERRADA no aparece, y la abierta sigue apareciendo", async () => {
    const otra = await abrirJornada(manager, {
      fincaSiteId: finca,
      // Hoy, no anteayer: A es recolector activo «desde ayer», y una jornada anterior a eso la
      // rechaza `abrirJornada` con `no_es_recolector`. Lo que esta prueba mide es el cierre, no la fecha.
      fecha: hoy,
      asignaciones: [{ locationId: otraParcela, personId: (await prisma.userAccount.findUniqueOrThrow({ where: { id: cuentaA }, select: { personId: true } })).personId }],
    });
    jornadaCerrada = otra.id;
    await reportarSituacion(cuentaA, {
      jornadaId: otra.id,
      sobre: { locationId: otraParcela },
      tipoValueId: incidencia,
      nota: "esto se reportó y luego se cerró la jornada",
      ocurridaAt: new Date(),
    });
    const { filas: antesDeCerrar } = await situacionesDeLaFinca(manager, finca);
    expect(antesDeCerrar.some((e) => e.notes === "esto se reportó y luego se cerró la jornada"), "con la jornada abierta SÍ se ve, o la prueba no mide el cierre").toBe(true);

    await cerrarJornada(manager, otra.id);

    const { filas: despues } = await situacionesDeLaFinca(manager, finca);
    expect(despues.some((e) => e.notes === "esto se reportó y luego se cerró la jornada"), "cerrada, deja de pedir atención").toBe(false);
    expect(despues.some((e) => e.notes === "broca en el bloque"), "y la de la jornada abierta sigue: el lector no se vació entero").toBe(true);
  }, 30000);

  /**
   * **Mismo permiso que `situacionesDeJornada`, comprobado sobre ESTE lector.** Se levanta una
   * cuenta nueva a propósito: a `cuentaC` le concedieron `field_report:view` en la prueba de
   * arriba y no se lo quitan, así que apoyarse en ella haría que el resultado dependiera del
   * orden de las pruebas.
   */
  it("un recolector sin field_report:view no ve lo ajeno; su superior sí", async () => {
    const d = await persona("Recolector D");
    const cuentaD = (await cuenta(d, "Recolector")).id;
    const { filas: suyas } = await situacionesDeLaFinca(cuentaD, finca);
    expect(suyas.some((e) => e.notes === "broca en el bloque"), "D no reportó eso y no tiene el permiso").toBe(false);
    const { filas: delManager } = await situacionesDeLaFinca(manager, finca);
    expect(delManager.some((e) => e.notes === "broca en el bloque"), "el control: su superior sí la ve").toBe(true);
  }, 20000);

  /** Sin nada que atender se devuelve vacío, para que la pantalla diga «no hay» en vez de pintar un cero. */
  it("una finca sin jornadas abiertas devuelve vacío", async () => {
    const vacia = await prisma.location.create({
      data: { name: `TEST Finca vacía (${RUN})`, locationType: "site", organizationId: orgId, classification: "internal" },
    });
    try {
      const vista = await situacionesDeLaFinca(manager, vacia.id);
      expect(vista.filas).toEqual([]);
      expect(vista.zona, "y la zona viaja aunque no haya filas, para que la pantalla sepa formatear").not.toBeUndefined();
    } finally {
      await prisma.location.delete({ where: { id: vacia.id } });
    }
  }, 20000);

  afterAll(async () => {
    if (jornadaCerrada) {
      const sesiones = (await prisma.fieldSession.findMany({ where: { jornadaDeCosechaId: jornadaCerrada }, select: { id: true } })).map((s) => s.id);
      await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesiones } }) });
      await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesiones } }) });
    }
  }, 20000);
});
