/**
 * P4 §2 — el carril de tokens del aparato.
 *
 * `AUTH_SECRET` se pone aquí y no se toma del entorno: un test atado a un
 * secreto de despliegue pasa o falla según la máquina.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { prisma } from "../../lib/db";
import { hashPassword } from "../../lib/auth/password";
import {
  registrarAparato,
  refrescarAcceso,
  verificarAccess,
  DeviceAuthError,
  ACCESS_TTL_SEGUNDOS,
  interpretarAutorizacion,
} from "../../lib/sync/deviceTokens";
import { pushFieldEvents } from "../../lib/sync/pushFieldEvents";

import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

process.env.AUTH_SECRET ??= "secreto-de-pruebas-p5-no-usado-en-ningun-despliegue";

const RUN_ID = `p5tok-${Date.now()}`;
const CORREO = `${RUN_ID}@example.invalid`;
const CLAVE = "clave-de-prueba-larga-y-tonta";

let organizationId: string;
let plotId: string;
let personId: string;
let userAccountId: string;
let sesionId: string;
let kindId: string;

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" } });
  organizationId = org.id;
  plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST Plot (${RUN_ID})`, organizationId, status: "approved", classification: "internal" } })).id;
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Tok", displayName: `TEST Tok (${RUN_ID})`, locale: "es", email: CORREO } });
  personId = p.id;
  const cuenta = await prisma.userAccount.create({
    data: { personId, authProvider: "credentials", status: "active", passwordHash: await hashPassword(CLAVE) } });
  userAccountId = cuenta.id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const sc = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } });
  await prisma.assignment.create({ data: { userAccountId, roleProfileId: perfil.id, scopeId: sc.id } });
  sesionId = (await prisma.fieldSession.create({
    data: { locationId: plotId, operatorPersonId: personId, startedAt: new Date("2026-08-28T07:00:00Z"),
            provenanceClass: "direct_observation", createdBy: userAccountId } })).id;
  kindId = (await prisma.variableCatalogValue.findFirstOrThrow({
    where: { value: "observacion", catalog: { key: "event_kind" } } })).id;
});

afterAll(async () => {
  const ses = await prisma.fieldSession.findMany({ where: { locationId: plotId }, select: { id: true } });
  const ids = ses.map((s) => s.id);
  await prisma.fieldEvent.deleteMany({ where: assertDefinedWhere({ fieldSessionId: { in: ids } }) });
  await prisma.fieldSession.deleteMany({ where: assertDefinedWhere({ id: { in: ids } }) });
  await prisma.device.deleteMany({ where: assertDefinedWhere({ label: { contains: RUN_ID } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: plotId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
});

const alta = (extra: Record<string, unknown> = {}) =>
  registrarAparato({ email: CORREO, password: CLAVE, label: `TEST ${RUN_ID}`, platform: "android", ...extra });

describe("carril de tokens del aparato", () => {
  /**
   * La propiedad que decide si un volcado de la base sirve para suplantar a un
   * aparato. Si el refresh estuviera en claro, un backup mal guardado bastaría.
   */
  it("el refresh se guarda hasheado, nunca en claro", async () => {
    const { device, refreshToken } = await alta();
    const fila = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(fila.refreshTokenHash).not.toBeNull();
    expect(fila.refreshTokenHash, "el token no puede estar en la columna").not.toBe(refreshToken);
    expect(fila.refreshTokenHash).not.toContain(refreshToken);
    // Control positivo: el hash SÍ resuelve al aparato, así que no es basura.
    const encontrado = await prisma.device.findUnique({ where: { refreshTokenHash: fila.refreshTokenHash! } });
    expect(encontrado?.id).toBe(device.id);
  });

  it("el access se verifica sin tocar la base y lleva a quién representa", async () => {
    const { accessToken, device } = await alta();
    const payload = verificarAccess(accessToken);
    expect(payload.deviceId).toBe(device.id);
    expect(payload.userAccountId).toBe(userAccountId);
  });

  it("un access caducado se rechaza", async () => {
    const { accessToken } = await alta();
    const despues = new Date(Date.now() + (ACCESS_TTL_SEGUNDOS + 60) * 1000);
    expect(() => verificarAccess(accessToken, despues)).toThrow(DeviceAuthError);
  });

  it("un access manipulado se rechaza", async () => {
    const { accessToken } = await alta();
    const [cuerpo, firma] = accessToken.split(".");
    const otro = Buffer.from(JSON.stringify({ deviceId: "x", userAccountId: "y",
      exp: Math.floor(Date.now() / 1000) + 9999 })).toString("base64url");
    expect(() => verificarAccess(`${otro}.${firma}`)).toThrow(DeviceAuthError);
    expect(() => verificarAccess(`${cuerpo}.${"a".repeat(firma!.length)}`)).toThrow(DeviceAuthError);
  });

  it("no acepta un access firmado con AUTH_SECRET en crudo", async () => {
    const cuerpo = Buffer.from(JSON.stringify({ deviceId: "x", userAccountId: "y",
      exp: Math.floor(Date.now() / 1000) + 9999 })).toString("base64url");
    const crudo = createHmac("sha256", process.env.AUTH_SECRET!).update(cuerpo).digest("base64url");
    expect(() => verificarAccess(`${cuerpo}.${crudo}`)).toThrow(DeviceAuthError);
  });

  it("el refresh canjea accesos nuevos", async () => {
    const { refreshToken, device } = await alta();
    const { accessToken } = await refrescarAcceso(refreshToken);
    expect(verificarAccess(accessToken).deviceId).toBe(device.id);
  });

  /** Revocar corta el refresco en el acto: ahí es donde la revocación muerde. */
  it("revocar el aparato corta el refresco", async () => {
    const { refreshToken, device } = await alta();
    await prisma.device.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    await expect(refrescarAcceso(refreshToken)).rejects.toThrow(DeviceAuthError);
  });

  /**
   * **La afirmación que hace honesto el comentario del módulo.** Un access ya
   * emitido sigue siendo criptográficamente válido hasta que expira —eso es
   * inherente a un token sin estado— pero NO sirve para escribir: el push
   * comprueba `revokedAt` en cada lote. La ventana es de lectura, no de
   * escritura.
   */
  it("un aparato revocado NO escribe, aunque su access siga vivo", async () => {
    const { accessToken, device } = await alta();
    await prisma.device.update({ where: { id: device.id }, data: { revokedAt: new Date() } });

    // El token sigue verificando — eso es lo inherente…
    expect(verificarAccess(accessToken).deviceId).toBe(device.id);

    // …y aun así no mete una fila.
    await expect(pushFieldEvents(userAccountId, device.id, [{
      clientDraftId: `${RUN_ID}-revocado`, fieldSessionId: sesionId,
      eventKindValueId: kindId, occurredAt: new Date("2026-08-28T07:30:00Z"),
    }])).rejects.toThrow();
    expect(await prisma.fieldEvent.count({ where: { clientDraftId: `${RUN_ID}-revocado` } })).toBe(0);
  });

  /**
   * Un correo desconocido y una contraseña mala dan el MISMO error. Si no, el
   * endpoint es un oráculo de qué correos tienen cuenta en la plataforma.
   */
  it("no distingue correo desconocido de contraseña mala", async () => {
    const a = await alta({ password: "otra-cosa" }).catch((e) => (e as Error).message);
    const b = await alta({ email: "nadie@example.invalid" }).catch((e) => (e as Error).message);
    expect(a).toBe("credenciales_invalidas");
    expect(b).toBe("credenciales_invalidas");
  });

  it("sin AUTH_SECRET no firma en silencio: falla", async () => {
    const guardado = process.env.AUTH_SECRET;
    delete process.env.AUTH_SECRET;
    try {
      await expect(alta()).rejects.toThrow(DeviceAuthError);
    } finally {
      process.env.AUTH_SECRET = guardado;
    }
  });
});

/**
 * La interpretación de la cabecera, que es la parte nueva.
 *
 * **Lo que NO se prueba aquí, dicho en vez de insinuado:** la composición
 * (`resolverPrincipal`) importa el carril de la cookie, que arrastra
 * `next-auth`, que no carga fuera de una petición de Next — se comprobó
 * intentándolo. Por eso la decisión se extrajo a `interpretarAutorizacion`, que
 * es lo que sí se puede equivocar. La rama de la cookie **no cambió** en este
 * trabajo: es la misma línea que las rutas ya tenían.
 */
describe("interpretarAutorizacion: el Bearer decide, bueno o malo", () => {
  const conBearer = (t: string) => `Bearer ${t}`;

  it("un Bearer válido identifica al aparato y a su cuenta", async () => {
    const { accessToken, device } = await alta();
    const { hayBearer, principal } = interpretarAutorizacion(conBearer(accessToken));
    expect(hayBearer).toBe(true);
    expect(principal).toEqual({ userAccountId, deviceId: device.id });
  });

  /**
   * Un Bearer inválido es un NO, no una invitación a probar la cookie. Si
   * cayera a la sesión del navegador, un aparato revocado seguiría operando
   * con la sesión de quien lo registró — y la revocación dejaría de significar
   * lo que dice.
   */
  it("un Bearer inválido no cae a la cookie: es un no", async () => {
    const r = interpretarAutorizacion(conBearer("basura.inventada"));
    expect(r.hayBearer, "hubo Bearer, así que decide él").toBe(true);
    expect(r.principal).toBeNull();
    expect(interpretarAutorizacion(null).hayBearer, "sin cabecera sí pasa a la cookie").toBe(false);
  });

  it("un Bearer caducado tampoco cuela", async () => {
    const cuerpo = Buffer.from(JSON.stringify({ deviceId: "x", userAccountId: "y",
      exp: Math.floor(Date.now() / 1000) - 10 })).toString("base64url");
    expect(interpretarAutorizacion(conBearer(`${cuerpo}.loquesea`)).principal).toBeNull();
  });
});
