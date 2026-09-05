/**
 * P4 §8. Postgres real para el ámbito; la firma y la caducidad son puras.
 *
 * **`AUTH_SECRET` se pone aquí**, no se toma del entorno: un test que dependa
 * de un secreto real de despliegue pasa o falla según la máquina, y además
 * ataría la suite a un valor que no debe salir de Vercel.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { prisma } from "../../lib/db";
import { startFieldSession, recordFieldEvent } from "../../lib/traceability/fieldSessions";
import { LocationAccessError } from "../../lib/traceability/locations";
import {
  issueAuthorizationSnapshot,
  verifyAuthorizationSnapshot,
  ofreceEnLocation,
  SnapshotError,
  VIGENCIA_DIAS,
  type SignedSnapshot,
} from "../../lib/sync/authorizationSnapshot";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

process.env.AUTH_SECRET ??= "secreto-de-pruebas-p4-no-usado-en-ningun-despliegue";

const RUN_ID = `p4snap-${Date.now()}`;
let organizationId: string;
let plotMio: string;
let plotAjeno: string;
let personId: string;
let userAccountId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  organizationId = org.id;
  const mk = async (n: string) => (await prisma.location.create({
    data: { locationType: "plot", name: `TEST ${n} (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } })).id;
  plotMio = await mk("Mio");
  plotAjeno = await mk("Ajeno");
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Op", displayName: `TEST Op (${RUN_ID})`, locale: "es" } });
  personId = p.id;
  const cuenta = await prisma.userAccount.create({ data: { personId, authProvider: "credentials", status: "active" } });
  userAccountId = cuenta.id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const sc = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotMio } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: sc.id } });
});

afterAll(async () => {
  const ids = [plotMio, plotAjeno];
  const ses = await prisma.fieldSession.findMany({ where: { locationId: { in: ids } }, select: { id: true } });
  const sesIds = ses.map((s) => s.id);
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: sesIds } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: sesIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: ids } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

describe("instantánea de autorización", () => {
  it("lleva las Locations del operador y lo que puede hacer en ellas, no las ajenas", async () => {
    const { snapshot } = await issueAuthorizationSnapshot(userAccountId);
    const ids = snapshot.scopes.map((s) => s.locationId);
    expect(ids).toContain(plotMio);
    expect(ids, "el lote ajeno no").not.toContain(plotAjeno);
    const mio = snapshot.scopes.find((s) => s.locationId === plotMio)!;
    expect(mio.permissions.length, "y dice QUÉ puede hacer, no sólo dónde").toBeGreaterThan(0);
    expect(ofreceEnLocation(snapshot, plotMio, mio.permissions[0]!)).toBe(true);
    expect(ofreceEnLocation(snapshot, plotAjeno, mio.permissions[0]!)).toBe(false);
  });

  /**
   * LA razón de que §8 exista. Sin techo, un aparato perdido sigue preparando
   * trabajo para siempre contra un ámbito que ya no tiene.
   */
  it("caduca, y una caducada se rechaza", async () => {
    const ahora = new Date("2026-09-05T00:00:00Z");
    const firmado = await issueAuthorizationSnapshot(userAccountId, ahora);

    const dentro = new Date(ahora.getTime() + (VIGENCIA_DIAS - 1) * 86400_000);
    expect(verifyAuthorizationSnapshot(firmado, dentro).userAccountId).toBe(userAccountId);

    const fuera = new Date(ahora.getTime() + (VIGENCIA_DIAS + 1) * 86400_000);
    expect(() => verifyAuthorizationSnapshot(firmado, fuera)).toThrow(SnapshotError);
  });

  it("una instantánea editada deja de verificar", async () => {
    const firmado = await issueAuthorizationSnapshot(userAccountId);
    const manipulada: SignedSnapshot = {
      signature: firmado.signature,
      snapshot: { ...firmado.snapshot,
        scopes: [...firmado.snapshot.scopes, { locationId: plotAjeno, permissions: ["location:manage_attributes"] }] },
    };
    expect(() => verifyAuthorizationSnapshot(manipulada)).toThrow(SnapshotError);
  });

  it("alargar la caducidad a mano tampoco cuela", async () => {
    const firmado = await issueAuthorizationSnapshot(userAccountId, new Date("2026-01-01T00:00:00Z"));
    const estirada: SignedSnapshot = {
      signature: firmado.signature,
      snapshot: { ...firmado.snapshot, expiresAt: "2030-01-01T00:00:00.000Z" },
    };
    expect(() => verifyAuthorizationSnapshot(estirada)).toThrow(SnapshotError);
  });

  /**
   * Separación de claves: firmar con `AUTH_SECRET` en crudo no vale. Si valiera,
   * cualquier artefacto firmado con esa clave en otro sistema —una cookie de
   * sesión, por ejemplo— podría presentarse como una instantánea.
   */
  it("no acepta una firma hecha con AUTH_SECRET en crudo", async () => {
    const { snapshot } = await issueAuthorizationSnapshot(userAccountId);
    const cruda = createHmac("sha256", process.env.AUTH_SECRET!)
      .update(JSON.stringify(snapshot)).digest("base64url");
    expect(() => verifyAuthorizationSnapshot({ snapshot, signature: cruda })).toThrow(SnapshotError);
  });

  /**
   * **El test que importa de verdad.** Una instantánea forjada que se conceda
   * el lote ajeno NO consigue nada: el servidor re-comprueba cada mutación.
   * Si esto fallara, §8 habría convertido una ayuda de interfaz en una
   * frontera de seguridad, que es exactamente lo que no debe ser.
   */
  it("aunque la instantánea diga que sí, el servidor sigue negando", async () => {
    const { snapshot } = await issueAuthorizationSnapshot(userAccountId);
    const forjada = { ...snapshot,
      scopes: [...snapshot.scopes, { locationId: plotAjeno, permissions: ["location:manage_attributes"] }] };

    // La interfaz se lo creería…
    expect(ofreceEnLocation(forjada, plotAjeno, "location:manage_attributes")).toBe(true);

    // …y el servidor no.
    await expect(
      startFieldSession(userAccountId, { locationId: plotAjeno, operatorPersonId: personId,
        startedAt: new Date("2026-08-28T07:00:00Z"), provenanceClass: "direct_observation" }),
    ).rejects.toThrow(LocationAccessError);

    // Y tampoco por la puerta de los eventos, sobre una jornada del lote ajeno
    // creada saltándose el servicio.
    const ajena = await prisma.fieldSession.create({
      data: { locationId: plotAjeno, operatorPersonId: personId, startedAt: new Date("2026-08-28T07:00:00Z"),
              provenanceClass: "direct_observation", createdBy: userAccountId } });
    const kind = await prisma.variableCatalogValue.findFirstOrThrow({
      where: { value: "observacion", catalog: { key: "event_kind" } } });
    await expect(
      recordFieldEvent(userAccountId, { fieldSessionId: ajena.id, eventKindValueId: kind.id,
        occurredAt: new Date("2026-08-28T07:30:00Z"), provenanceClass: "direct_observation" }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("sin AUTH_SECRET no firma nada en silencio: falla", async () => {
    const guardado = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      await expect(issueAuthorizationSnapshot(userAccountId)).rejects.toThrow(SnapshotError);
    } finally {
      process.env.AUTH_SECRET = guardado;
    }
  });
});
