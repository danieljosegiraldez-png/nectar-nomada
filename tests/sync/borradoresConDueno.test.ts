/**
 * ADR-199 — el servidor no procesa un borrador de otra cuenta.
 *
 * Postgres real, sin mocks. La limpieza DESCUBRE lo que tiene que borrar consultando por el RUN_ID, en
 * vez de heredar variables del `beforeAll`: si éste muere a mitad, el `afterAll` limpia igual, y al
 * final cuenta que no quede nada del RUN_ID.
 *
 * Cada caso de «ajeno» cuenta filas antes y después. Un rechazo con la fila escrita igual sería el
 * defecto entero, y un `toMatchObject` sobre el resultado no lo vería.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { pushFieldEvents, type MutacionDeMuestraDeSuelo, type MutacionDeRevisionDeTrampa } from "../../lib/sync/pushFieldEvents";
import { createTrap, recordTrapCheck, TrapAccessError } from "../../lib/traceability/traps";
import { huellaDeCuenta } from "../../lib/auth/huellaDeCuenta";
import { BorradorAjenoError, RAZON_BORRADOR_AJENO } from "../../lib/sync/cuentaDelBorrador";
import { claveDeFotoDeTrampa, finalizeTrampaPhotoPorBorrador, requestTrampaPhotoUpload } from "../../lib/traceability/landMedia";

const RUN_ID = `borradores-con-dueno-${Date.now()}`;

let plotId: string;
let cuentaA: string;
let cuentaB: string;
let sinAcceso: string;
let aparatoDeA: string;
let aparatoDeB: string;
let aparatoSinCreador: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  // `createTrap` exige un `site` antepasado: un `plot` suelto es una topología que el dominio no produce.
  const site = await prisma.location.create({
    data: { locationType: "site", name: `TEST Site (${RUN_ID})`, organizationId: org.id, status: "approved", classification: "internal" },
  });
  const plot = await prisma.location.create({
    data: {
      locationType: "plot",
      name: `TEST Plot (${RUN_ID})`,
      organizationId: org.id,
      parentLocationId: site.id,
      status: "approved",
      classification: "internal",
    },
  });
  plotId = plot.id;

  // Las dos cuentas tienen acceso al mismo sitio, a propósito: así un «ajeno» no se puede confundir con
  // un rechazo por falta de acceso. Farm Operator de esa parcela, no Platform Admin.
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  const crearCuenta = async (nombre: string) => {
    const persona = await prisma.person.create({
      data: { givenName: "TEST", familyName: nombre, displayName: `TEST ${nombre} (${RUN_ID})`, locale: "es" },
    });
    const cuenta = await prisma.userAccount.create({
      data: { personId: persona.id, authProvider: "credentials", status: "active" },
    });
    await prisma.assignment.create({ data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id } });
    return cuenta.id;
  };
  cuentaA = await crearCuenta("A");
  cuentaB = await crearCuenta("B");

  // Una cuenta SIN ninguna asignación. A y B tienen acceso al sitio a propósito, para que un «ajeno» no se
  // confunda con un rechazo por acceso; ésta es la que fija el orden: lo ajeno se retiene aunque quien
  // envía no tenga permiso, y no se rechaza por acceso (el teléfono lo marcaría como error y ofrecería
  // descartarlo). Su persona lleva el RUN_ID para que el `afterAll` la descubra.
  const personaSinAcceso = await prisma.person.create({
    data: { givenName: "TEST", familyName: "SinAcceso", displayName: `TEST SinAcceso (${RUN_ID})`, locale: "es" },
  });
  sinAcceso = (await prisma.userAccount.create({ data: { personId: personaSinAcceso.id, authProvider: "credentials", status: "active" } })).id;

  aparatoDeA = (await prisma.device.create({ data: { label: `TEST de A (${RUN_ID})`, platform: "pwa", createdBy: cuentaA } })).id;
  aparatoDeB = (await prisma.device.create({ data: { label: `TEST de B (${RUN_ID})`, platform: "pwa", createdBy: cuentaB } })).id;
  aparatoSinCreador = (await prisma.device.create({ data: { label: `TEST sin creador (${RUN_ID})`, platform: "pwa" } })).id;
});

afterAll(async () => {
  const ubicacionIds = (await prisma.location.findMany({ where: { name: { contains: RUN_ID } }, select: { id: true } })).map((u) => u.id);
  const personaIds = (await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } })).map((p) => p.id);
  const cuentaIds = (await prisma.userAccount.findMany({ where: { personId: { in: personaIds } }, select: { id: true } })).map((c) => c.id);

  await prisma.asset.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicacionIds } }) });
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: ubicacionIds } } }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: ubicacionIds } }) });
  await prisma.soilSample.deleteMany({ where: assertDefinedWhere({ sampleCode: { startsWith: RUN_ID } }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentaIds } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN_ID } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentaIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: { in: ubicacionIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentaIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personaIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicacionIds }, locationType: "plot" as const }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicacionIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ name: { contains: RUN_ID } }) });

  // Control de la limpieza: lo que distingue «limpió» de «pasó».
  expect(await prisma.location.count({ where: { name: { contains: RUN_ID } } })).toBe(0);
  expect(await prisma.person.count({ where: { displayName: { contains: RUN_ID } } })).toBe(0);
  expect(await prisma.device.count({ where: { label: { contains: RUN_ID } } })).toBe(0);
});

const muestra = (clientDraftId: string, cuentaDelBorrador?: string | null) =>
  ({
    kind: "soil_sample",
    clientDraftId,
    locationId: plotId,
    sampleCode: `${RUN_ID}-${clientDraftId}`,
    sampledAt: new Date("2026-09-16T12:00:00Z"),
    provenanceClass: "direct_observation",
    cuentaDelBorrador,
  }) satisfies MutacionDeMuestraDeSuelo & { cuentaDelBorrador?: string | null };

const filasDe = (clientDraftId: string) => prisma.soilSample.count({ where: { clientDraftId } });
const auditoriaDe = (cuenta: string) => prisma.auditEvent.count({ where: { actorUserAccountId: cuenta } });

describe("el lote no procesa un borrador de otra cuenta (ADR-199)", () => {
  it("control: con la cuenta de quien envía, se aplica", async () => {
    const id = `${RUN_ID}-propio`;
    const antes = await auditoriaDe(cuentaB);
    const [r] = await pushFieldEvents(cuentaB, aparatoDeB, [muestra(id, huellaDeCuenta(cuentaB))]);
    expect(r).toMatchObject({ status: "applied" });
    expect(await filasDe(id)).toBe(1);
    expect(await auditoriaDe(cuentaB)).toBeGreaterThan(antes);
  });

  it("con la cuenta de otra persona: retenido, sin fila y sin AuditEvent", async () => {
    const id = `${RUN_ID}-de-a`;
    const antes = await auditoriaDe(cuentaB);
    const [r] = await pushFieldEvents(cuentaB, aparatoDeB, [muestra(id, huellaDeCuenta(cuentaA))]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO });
    expect(await filasDe(id)).toBe(0);
    expect(await auditoriaDe(cuentaB)).toBe(antes);
  });

  it("sin cuenta, en el aparato de quien envía: se aplica, por la regla del aparato", async () => {
    const id = `${RUN_ID}-legado-propio`;
    const [r] = await pushFieldEvents(cuentaB, aparatoDeB, [muestra(id, null)]);
    expect(r).toMatchObject({ status: "applied" });
    expect(await filasDe(id)).toBe(1);
  });

  it("sin cuenta, en el aparato de otra cuenta: retenido, sin fila, y dice de quién es", async () => {
    const id = `${RUN_ID}-legado-de-a`;
    const antes = await auditoriaDe(cuentaB);
    const [r] = await pushFieldEvents(cuentaB, aparatoDeA, [muestra(id)]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: huellaDeCuenta(cuentaA) });
    expect(await filasDe(id)).toBe(0);
    expect(await auditoriaDe(cuentaB)).toBe(antes);
  });

  it("sin cuenta, en un aparato sin creador: retenido, y sin dueño que nombrar", async () => {
    const id = `${RUN_ID}-legado-sin-creador`;
    const [r] = await pushFieldEvents(cuentaB, aparatoSinCreador, [muestra(id, null)]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO });
    expect(await filasDe(id)).toBe(0);
  });

  it("en un lote mixto, lo propio entra y lo ajeno se retiene, en la misma petición", async () => {
    const propio = `${RUN_ID}-mixto-propio`;
    const ajeno = `${RUN_ID}-mixto-ajeno`;
    const resultados = await pushFieldEvents(cuentaB, aparatoDeB, [
      muestra(propio, huellaDeCuenta(cuentaB)),
      muestra(ajeno, huellaDeCuenta(cuentaA)),
    ]);
    expect(resultados.map((r) => [r.clientDraftId, r.status])).toEqual([
      [propio, "applied"],
      [ajeno, "rejected"],
    ]);
    expect(await filasDe(propio)).toBe(1);
    expect(await filasDe(ajeno)).toBe(0);
  });

  it("una revisión de trampa de otra cuenta no deja a B como observador", async () => {
    const trampa = await createTrap(cuentaA, {
      locationId: plotId,
      installedAt: new Date("2026-09-01"),
      provenanceClass: "direct_observation",
    });
    const id = `${RUN_ID}-trampa`;
    const revision: MutacionDeRevisionDeTrampa & { cuentaDelBorrador: string } = {
      kind: "trap_check",
      clientDraftId: id,
      locationId: plotId,
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos",
      cuentaDelBorrador: huellaDeCuenta(cuentaA),
    };

    const [deB] = await pushFieldEvents(cuentaB, aparatoDeB, [revision]);
    expect(deB).toMatchObject({ status: "rejected", reason: RAZON_BORRADOR_AJENO });
    expect(await prisma.specimenObservation.count({ where: { clientDraftId: id } })).toBe(0);

    // Control: el mismo borrador, enviado por su dueño, sí entra, y con A de observador. Sin esto, el
    // cero de arriba podría deberse a cualquier otra cosa que impida guardar la revisión.
    const [deA] = await pushFieldEvents(cuentaA, aparatoDeA, [revision]);
    expect(deA).toMatchObject({ status: "applied" });
    const fila = await prisma.specimenObservation.findUniqueOrThrow({ where: { clientDraftId: id }, select: { observerPersonId: true } });
    const personaDeA = await prisma.userAccount.findUniqueOrThrow({ where: { id: cuentaA }, select: { personId: true } });
    expect(fila.observerPersonId).toBe(personaDeA.personId);
  });

  it("quien no tiene acceso al sitio recibe la respuesta de dueño, no un rechazo por acceso", async () => {
    // Sin cuenta, en el aparato de A, enviado por una cuenta sin ninguna asignación. Si el dueño se
    // decidiera después del acceso, esto saldría rechazado por permiso (otro motivo, sin la cuenta de A)
    // y el teléfono lo marcaría como error en vez de retenerlo.
    const id = `${RUN_ID}-sin-acceso`;
    const antes = await auditoriaDe(sinAcceso);
    const [r] = await pushFieldEvents(sinAcceso, aparatoDeA, [muestra(id)]);
    expect(r).toEqual({ clientDraftId: id, status: "rejected", reason: RAZON_BORRADOR_AJENO, cuentaDelBorrador: huellaDeCuenta(cuentaA) });
    expect(await filasDe(id)).toBe(0);
    expect(await auditoriaDe(sinAcceso)).toBe(antes);
  });
});

describe("las fotos de la ronda no se suben ni se cuelgan a nombre de otra cuenta (ADR-199)", () => {
  async function revisionDeA() {
    const trampa = await createTrap(cuentaA, { locationId: plotId, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation" });
    return recordTrapCheck(cuentaA, {
      specimenId: trampa.id,
      observedAt: new Date("2026-09-15"),
      brocaLevel: "pocos",
      provenanceClass: "direct_observation",
      clientDraftId: crypto.randomUUID(),
    });
  }

  it("pedir la subida de una foto de otra cuenta lanza, antes de firmar nada", async () => {
    const pedir = requestTrampaPhotoUpload(cuentaB, {
      locationId: plotId,
      originalFilename: "tela.jpg",
      contentType: "image/jpeg",
      photoClientDraftId: crypto.randomUUID(),
      revisionClientDraftId: crypto.randomUUID(),
      borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeB },
    });
    await expect(pedir).rejects.toBeInstanceOf(BorradorAjenoError);
  });

  it("sin cuenta, desde el aparato de A, también, y nombra a A", async () => {
    const error = await requestTrampaPhotoUpload(cuentaB, {
      locationId: plotId,
      originalFilename: "tela.jpg",
      contentType: "image/jpeg",
      photoClientDraftId: crypto.randomUUID(),
      revisionClientDraftId: crypto.randomUUID(),
      borrador: { cuenta: null, deviceId: aparatoDeA },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BorradorAjenoError);
    expect((error as BorradorAjenoError).cuentaDelDueno).toBe(huellaDeCuenta(cuentaA));
  });

  it("finalizar la foto de otra cuenta no crea ningún Asset; su dueño sí puede", async () => {
    const revision = await revisionDeA();
    const storageKey = claveDeFotoDeTrampa(plotId, crypto.randomUUID(), "tela.jpg");
    const entrada = {
      locationId: plotId,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation" as const,
    };

    await expect(
      finalizeTrampaPhotoPorBorrador(cuentaB, { ...entrada, borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeB } }),
    ).rejects.toBeInstanceOf(BorradorAjenoError);
    expect(await prisma.asset.count({ where: { storageKey } })).toBe(0);

    // Control: la misma foto, finalizada por su dueño, sí crea el Asset. Sin esto, el cero de arriba
    // podría deberse a que faltaba la revisión o el acceso.
    const asset = await finalizeTrampaPhotoPorBorrador(cuentaA, {
      ...entrada,
      borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeA },
    });
    expect(asset.storageKey).toBe(storageKey);
  });

  it("una llamada del servidor sin borrador no se mira: es la sesión actual", async () => {
    const revision = await revisionDeA();
    const storageKey = claveDeFotoDeTrampa(plotId, crypto.randomUUID(), "tela.jpg");
    const asset = await finalizeTrampaPhotoPorBorrador(cuentaA, {
      locationId: plotId,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation",
    });
    expect(asset.storageKey).toBe(storageKey);
  });

  it("control: una foto sin cuenta, en el aparato de quien envía, se finaliza (regla del aparato)", async () => {
    const revision = await revisionDeA();
    const storageKey = claveDeFotoDeTrampa(plotId, crypto.randomUUID(), "tela.jpg");
    const asset = await finalizeTrampaPhotoPorBorrador(cuentaA, {
      locationId: plotId,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation",
      borrador: { cuenta: null, deviceId: aparatoDeA },
    });
    expect(asset.storageKey).toBe(storageKey);
  });

  it("control: sin acceso al sitio, una foto PROPIA sí se rechaza por acceso", async () => {
    // Fija que `sinAcceso` de verdad no tiene permiso: sin esto, las dos pruebas de abajo podrían pasar
    // porque esa cuenta tuviera acceso y el orden no importara.
    const pedir = requestTrampaPhotoUpload(sinAcceso, {
      locationId: plotId,
      originalFilename: "tela.jpg",
      contentType: "image/jpeg",
      photoClientDraftId: crypto.randomUUID(),
      revisionClientDraftId: crypto.randomUUID(),
      borrador: { cuenta: huellaDeCuenta(sinAcceso), deviceId: null },
    });
    await expect(pedir).rejects.toBeInstanceOf(TrapAccessError);
  });

  it("sin acceso al sitio, pedir la subida de una foto ajena da la respuesta de dueño, no la de acceso", async () => {
    const error = await requestTrampaPhotoUpload(sinAcceso, {
      locationId: plotId,
      originalFilename: "tela.jpg",
      contentType: "image/jpeg",
      photoClientDraftId: crypto.randomUUID(),
      revisionClientDraftId: crypto.randomUUID(),
      borrador: { cuenta: huellaDeCuenta(cuentaA), deviceId: aparatoDeB },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BorradorAjenoError);
    expect(error).not.toBeInstanceOf(TrapAccessError);
  });

  it("sin acceso al sitio, finalizar una foto ajena da la respuesta de dueño, nombra a A y no crea ningún Asset", async () => {
    const revision = await revisionDeA();
    const storageKey = claveDeFotoDeTrampa(plotId, crypto.randomUUID(), "tela.jpg");
    const error = await finalizeTrampaPhotoPorBorrador(sinAcceso, {
      locationId: plotId,
      storageKey,
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "tela.jpg",
      revisionClientDraftId: revision.clientDraftId!,
      provenanceClass: "direct_observation",
      borrador: { cuenta: null, deviceId: aparatoDeA },
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BorradorAjenoError);
    expect(error).not.toBeInstanceOf(TrapAccessError);
    expect((error as BorradorAjenoError).cuentaDelDueno).toBe(huellaDeCuenta(cuentaA));
    expect(await prisma.asset.count({ where: { storageKey } })).toBe(0);
  });
});
