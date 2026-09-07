/**
 * A9.4 (D2) — la lista de chequeo de campo entra en `ProtocolVariable`.
 *
 * **La primera prueba es la falsación que el propio informe pidió**
 * (`48_A9_CAPTURA_DE_CAMPO_REPORTE.md` §8): *«intentar describir los 44 ítems
 * de `protocolos/apiario-campo-v1.json` con `ProtocolVariable` más las cuatro
 * columnas propuestas, y ver cuántos no entran — si son más de cinco, D2 estaba
 * mal»*. Aquí se cuenta, no se estima.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  cargarProtocoloDeCampo,
  leerProtocoloDeCampo,
  variablesDe,
} from "../../lib/apiary/protocoloDeCampo";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a94-${Date.now()}`;
let cuentaId: string;
let protocolIdCreado: string | null = null;

beforeAll(async () => {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: "A94", displayName: `TEST A94 (${RUN_ID})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  cuentaId = cuenta.id;
});

afterAll(async () => {
  if (protocolIdCreado) {
    await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id: protocolIdCreado }) });
  }
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: cuentaId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: cuentaId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
});

describe("los 44 ítems del dueño caben en ProtocolVariable", () => {
  it("ninguno se queda fuera — la falsación de §8 del informe", () => {
    const protocolo = leerProtocoloDeCampo();
    const itemsEnElJson = protocolo.activities.reduce((n, a) => n + a.items.length, 0);
    const variables = variablesDe(protocolo);

    // Control positivo del análisis: si el JSON dejara de leerse, o las
    // actividades vinieran vacías, todo lo de abajo pasaría sin comprobar nada.
    expect(itemsEnElJson, "el JSON no trae ítems: no se está midiendo nada").toBe(44);
    expect(protocolo.activities.length).toBe(5);

    // La cuenta que pedía el informe: cuántos NO entran.
    expect(variables.length, "hay ítems que no se pudieron describir").toBe(itemsEnElJson);

    // Y que cada uno lleve lo que lo hace utilizable, no sólo que exista.
    const sinEtapa = variables.filter((v) => v.stage !== "field" && v.stage !== "close");
    expect(sinEtapa.map((v) => v.key), "ítems sin etapa: la separación campo/cierre es el corazón del ticket").toEqual([]);

    const sinClave = variables.filter((v) => !v.key || !v.key.includes("."));
    expect(sinClave.length, "ítems sin clave direccionable").toBe(0);
  });

  it("las claves son únicas entre actividades", () => {
    // Dos actividades tienen un ítem `note`, y `inspection.note` no es
    // `feeding.note`. Sin el prefijo, leer las respuestas los confundiría.
    const claves = variablesDe(leerProtocoloDeCampo()).map((v) => v.key);
    expect(new Set(claves).size, "hay claves repetidas entre actividades").toBe(claves.length);
  });

  it("los 16 ítems que cubren una columna existente lo declaran", () => {
    // Casi el 40 % de la lista ya es columna existente y el protocolo sólo
    // declara cómo se muestra. Es lo que evita duplicar el dato.
    const cubren = variablesDe(leerProtocoloDeCampo()).filter((v) => v.coversExistingColumn);
    expect(cubren.length).toBe(16);
    for (const v of cubren) {
      expect(v.coversExistingColumn, `${v.key} declara una columna con forma rara`).toMatch(/^[A-Z]\w+\.\w+$/);
    }
  });

  it("se carga como ProtocolVersion, con sus 44 variables y su AuditEvent", async () => {
    const { version, creado } = await cargarProtocoloDeCampo(cuentaId);
    protocolIdCreado = version.protocolId;
    expect(creado).toBe(true);

    const guardadas = await prisma.protocolVariable.findMany({ where: { protocolVersionId: version.id } });
    expect(guardadas.length).toBe(44);
    expect(guardadas.filter((v) => v.stage === "field").length).toBe(34);
    expect(guardadas.filter((v) => v.stage === "close").length).toBe(10);
    expect(guardadas.filter((v) => v.valueType === "multi_enum").length).toBe(3);
    expect(guardadas.filter((v) => v.valueType === "date").length).toBe(3);

    const audit = await prisma.auditEvent.findFirst({
      where: { entityId: version.id, operation: "protocol_version.create" },
    });
    expect(audit, "la carga no dejó AuditEvent").not.toBeNull();
  });

  it("cargarlo dos veces no duplica nada", async () => {
    // Un cargador que duplica en silencio es peor que uno que falla.
    const segunda = await cargarProtocoloDeCampo(cuentaId);
    expect(segunda.creado).toBe(false);

    const versiones = await prisma.protocolVersion.count({ where: { protocolId: protocolIdCreado! } });
    expect(versiones).toBe(1);
  });
});
