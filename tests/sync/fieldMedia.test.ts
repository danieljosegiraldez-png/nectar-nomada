/**
 * P4 §7. Postgres real, fixtures por RUN_ID.
 *
 * **Lo que NO se puede probar aquí, dicho en vez de insinuado:** el camino de
 * éxito de `requestFieldMediaUpload` llama al adaptador real de R2 y no hay
 * credenciales en ningún entorno — mismo límite que `tests/traceability/
 * media.test.ts` documenta desde T12.5. Se prueba todo lo que corre ANTES de
 * esa llamada (jornada, RBAC, mime) y **todo** `finalizeFieldMedia`, que no
 * toca almacenamiento en ningún momento.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { startFieldSession, FieldSessionValidationError } from "../../lib/traceability/fieldSessions";
import { LocationAccessError } from "../../lib/traceability/locations";
import { finalizeFieldMedia, requestFieldMediaUpload, FieldMediaError } from "../../lib/sync/fieldMedia";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `p4med-${Date.now()}`;

let organizationId: string;
let plotMio: string;
let plotAjeno: string;
let personId: string;
let userAccountId: string;
let sesionId: string;
let sesionAjenaId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  organizationId = org.id;
  const mk = async (n: string) => (await prisma.location.create({
    data: { locationType: "plot", name: `TEST ${n} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
  })).id;
  plotMio = await mk("Mio");
  plotAjeno = await mk("Ajeno");

  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Op", displayName: `TEST Op (${RUN_ID})`, locale: "es" } });
  personId = p.id;
  const cuenta = await prisma.userAccount.create({
    data: { personId, authProvider: "credentials", status: "active" } });
  userAccountId = cuenta.id;

  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotMio } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: scope.id } });

  sesionId = (await startFieldSession(userAccountId, {
    locationId: plotMio, operatorPersonId: personId,
    startedAt: new Date("2026-08-28T07:00:00Z"), provenanceClass: "direct_observation" })).id;

  sesionAjenaId = (await prisma.fieldSession.create({
    data: { locationId: plotAjeno, operatorPersonId: personId, startedAt: new Date("2026-08-28T07:00:00Z"),
            provenanceClass: "direct_observation", createdBy: userAccountId } })).id;
});

afterAll(async () => {
  const ids = [plotMio, plotAjeno];
  const ses = await prisma.fieldSession.findMany({ where: { locationId: { in: ids } }, select: { id: true } });
  const sesIds = ses.map((s) => s.id);
  const evs = await prisma.fieldEvent.findMany({ where: { fieldSessionId: { in: sesIds } }, select: { assetId: true } });
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesIds } }) });
  const assetIds = evs.map((e) => e.assetId).filter((x): x is string => x != null);
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ id: { in: assetIds } }) });
  await prisma.asset.deleteMany({ where: assertDefinedWhere({ storageKey: { contains: RUN_ID } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: ids } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

const clave = (sesion: string, n: string) => `nectar-originals/field/${sesion}/${RUN_ID}-${n}.jpg`;

const entrada = (n: string, extra: Partial<Parameters<typeof finalizeFieldMedia>[1]> = {}) => ({
  fieldSessionId: sesionId,
  storageKey: clave(sesionId, n),
  mimeType: "image/jpeg",
  sizeBytes: 1234,
  originalFilename: "foto.jpg",
  clientDraftId: `${RUN_ID}-${n}`,
  occurredAt: new Date("2026-08-28T07:30:00Z"),
  ...extra,
});

describe("medios de campo", () => {
  it("una foto se convierte en un FieldEvent de tipo foto, con su Asset", async () => {
    const ev = await finalizeFieldMedia(userAccountId, entrada("a"));
    expect(ev.assetId).not.toBeNull();
    const kind = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: ev.eventKindValueId } });
    expect(kind.value).toBe("foto");
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: ev.assetId! } });
    expect(asset.assetType).toBe("photo");
    expect(asset.capturedAt?.toISOString()).toBe("2026-08-28T07:30:00.000Z");
  });

  /**
   * La misma propiedad que el push: una respuesta perdida no puede convertirse
   * en dos fotos del mismo momento.
   */
  it("reintentar con el mismo clientDraftId no crea una segunda foto", async () => {
    const e = entrada("b");
    const primero = await finalizeFieldMedia(userAccountId, e);
    const segundo = await finalizeFieldMedia(userAccountId, e);
    expect(segundo.id).toBe(primero.id);
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: e.clientDraftId } })).toBe(1);
    expect(await prisma.asset.count({ where: { storageKey: e.storageKey } })).toBe(1);
    const audits = await prisma.auditEvent.count({ where: { entityType: "field_event", entityId: primero.id } });
    expect(audits, "el hecho pasó una vez").toBe(1);
  });

  /**
   * LA propiedad de seguridad de esta pieza. La clave la acuña el servidor,
   * pero el cliente la devuelve en el segundo paso: si no se re-comprobara,
   * podría reclamar cualquier objeto del bucket —incluida la foto de otra
   * finca— y colgarlo de su propia jornada.
   */
  it("rechaza una clave de almacenamiento que no es de esta jornada", async () => {
    await expect(
      finalizeFieldMedia(userAccountId, entrada("c", { storageKey: clave(sesionAjenaId, "c") })),
    ).rejects.toThrow(FieldMediaError);
    await expect(
      finalizeFieldMedia(userAccountId, entrada("d", { storageKey: "nectar-originals/traceability/otro/x.jpg" })),
    ).rejects.toThrow(FieldMediaError);
  });

  it("rechaza una jornada fuera del alcance del operador", async () => {
    await expect(
      finalizeFieldMedia(userAccountId, {
        ...entrada("e"), fieldSessionId: sesionAjenaId, storageKey: clave(sesionAjenaId, "e") }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("rechaza un tipo de archivo que no sabe registrar", async () => {
    await expect(
      finalizeFieldMedia(userAccountId, entrada("f", { mimeType: "application/zip" })),
    ).rejects.toThrow(FieldMediaError);
  });

  it("mapea vídeo y audio a su tipo de evento, no todo a foto", async () => {
    const v = await finalizeFieldMedia(userAccountId, entrada("g", { mimeType: "video/mp4" }));
    const a = await finalizeFieldMedia(userAccountId, entrada("h", { mimeType: "audio/m4a" }));
    const kv = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: v.eventKindValueId } });
    const ka = await prisma.variableCatalogValue.findUniqueOrThrow({ where: { id: a.eventKindValueId } });
    expect([kv.value, ka.value]).toEqual(["video", "nota_de_voz"]);
  });

  /**
   * P2 §6: la posición va también en el Asset, porque dónde se tomó la foto es
   * un hecho de la foto y `locationId` no puede expresar un punto de ladera.
   */
  it("la posición queda en el Asset y en el evento", async () => {
    const ev = await finalizeFieldMedia(userAccountId, entrada("i", {
      position: { latitude: 8.5, longitude: -80.1, accuracyM: 9 } }));
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: ev.assetId! } });
    expect([asset.latitude, asset.longitude, asset.accuracyM]).toEqual([8.5, -80.1, 9]);
    expect([ev.latitude, ev.longitude, ev.accuracyM]).toEqual([8.5, -80.1, 9]);
  });

  /**
   * Una Persona inexistente se dice, no se estrella.
   *
   * Este test nació como «atomicidad» y **no probaba atomicidad**, dos veces.
   * Lo dijo el flip-test: sacar el `$transaction` del servicio dejaba los diez
   * casos en verde. La razón, medida con un sondeo: el `Asset` usa el mismo
   * `operatorPersonId` como `creatorPersonId`, así que **ningún input puede
   * romper el evento sin romper antes el Asset** — el fallo siempre cae en la
   * primera escritura y nunca hay estado a medias que deshacer.
   *
   * Lo que quedó del intento es un defecto real que destapó: aquí faltaba la
   * comprobación de que la Persona existe, la misma que `recordFieldEvent`
   * tiene desde que una revisión la pidió. Sin ella, un id mal tecleado daba un
   * error opaco de clave foránea en vez de decir qué pasa.
   *
   * **Sobre la atomicidad, dicho en vez de insinuado:** el `$transaction` del
   * servicio protege contra fallos que NO vienen del input —una conexión que
   * se cae entre las dos escrituras— y **ningún test de este archivo lo
   * demuestra**, porque ese fallo no se puede provocar por la interfaz
   * pública. Se conserva por la razón escrita en el servicio, no porque haya
   * una prueba detrás.
   */
  it("una Persona que no existe se rechaza con su nombre, sin dejar nada a medias", async () => {
    const e = entrada("k", { operatorPersonId: "00000000-0000-0000-0000-000000000000" });

    await expect(finalizeFieldMedia(userAccountId, e)).rejects.toThrow(FieldMediaError);

    expect(await prisma.asset.count({ where: { storageKey: e.storageKey } })).toBe(0);
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: e.clientDraftId } })).toBe(0);
  });

  it("solicitar una subida para una jornada que no existe se niega antes de firmar nada", async () => {
    await expect(
      requestFieldMediaUpload(userAccountId, {
        fieldSessionId: "00000000-0000-0000-0000-000000000000",
        originalFilename: "x.jpg", contentType: "image/jpeg" }),
    ).rejects.toThrow(FieldSessionValidationError);
  });

  it("solicitar con un mime no soportado se niega antes de mirar la jornada", async () => {
    await expect(
      requestFieldMediaUpload(userAccountId, {
        fieldSessionId: sesionId, originalFilename: "x.zip", contentType: "application/zip" }),
    ).rejects.toThrow(FieldMediaError);
  });
});
