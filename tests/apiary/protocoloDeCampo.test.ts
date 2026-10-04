/**
 * A9.4 (D2) — la lista de chequeo de campo entra en `ProtocolVariable`.
 *
 * **La primera prueba es la falsación que el propio informe pidió**
 * (`48_A9_CAPTURA_DE_CAMPO_REPORTE.md` §8): *«intentar describir los 44 ítems
 * de `protocolos/apiario-campo-v2.json` (la vigente, ADR-165) con `ProtocolVariable` más las cuatro
 * columnas propuestas, y ver cuántos no entran — si son más de cinco, D2 estaba
 * mal»*. Aquí se cuenta, no se estima.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { RUTA_DEL_PROTOCOLO_DE_CAMPO,
  cargarProtocoloDeCampo,
  leerProtocoloDeCampo,
  variablesDe,
} from "../../lib/apiary/protocoloDeCampo";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a94-${Date.now()}`;
let cuentaId: string;
/**
 * `true` sólo si ESTA corrida creó el protocolo. La limpieza se gobierna por aquí y no por
 * «hay un id»: hasta el 2026-09-14 borraba el protocolo **siempre**, así que una corrida
 * sobre la copia compartida se llevaba el que el dueño acababa de cargar. Misma disciplina
 * que `assertDefinedWhere`: no borrar lo que no es tuyo.
 */
let loCreoEstaPrueba = false;
let protocolIdCreado: string | null = null;
let versionIdCreada: string | null = null;
const protocolosDePrueba: string[] = [];
const temporales: string[] = [];

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
  // **Se borra SÓLO lo que esta prueba creó.** Desde ADR-165 el protocolo del dueño puede tener
  // la v1 cargada y esta prueba crear la v2 debajo: borrar el protocolo entero se llevaría la
  // v1, que en la base compartida es la de verdad. Si creó una versión, borra esa versión; el
  // protocolo sólo si también lo creó.
  if (versionIdCreada) {
    await prisma.protocolVariable.deleteMany({ where: assertDefinedWhere({ protocolVersionId: versionIdCreada }) });
    await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ id: versionIdCreada }) });
  }
  if (protocolIdCreado && loCreoEstaPrueba) {
    await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id: protocolIdCreado }) });
  }
  // Los directorios de las dos raíces falsas: con reintentos y sin lanzar si fallan.
  const { rmSync } = await import("node:fs");
  for (const d of temporales) {
    try {
      rmSync(d, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // un temporal que no se pudo borrar no debe tumbar la limpieza de la base, que va detrás
    }
  }
  for (const id of protocolosDePrueba) {
    await prisma.protocolVariable.deleteMany({ where: assertDefinedWhere({ protocolVersion: { protocolId: id } }) });
    await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ protocolId: id }) });
    await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id }) });
  }
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: cuentaId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: cuentaId }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
});

/**
 * **Las cuatro cuentas a mano de este archivo se movieron el 2026-10-03** y se dejan a mano a
 * propósito: son filas patrón, y su trabajo es que un ítem nuevo no entre sin que nadie lo cuente.
 *
 * `PENDING_IMPLEMENTATIONS/010`, Parte A, añadió **diez** ítems al protocolo —tres de §2.2 y los
 * siete de §2.4, que es la sección que no tenía ninguno— así que **44 → 54**. Y los que declaran
 * cubrir una columna pasan de **16 a 27**: los diez nuevos la declaran, y `pollen_stores` ganó la
 * suya, que no tenía.
 *
 * La que dice «la v1 conserva sus variables intactas» también sube a 54, y no es una contradicción:
 * su `raiz(v)` escribe el contenido REAL del protocolo con el número de versión cambiado, así que
 * su «v1» y su «v2» son el mismo archivo de 54 ítems.
 */
describe("los 54 ítems del dueño caben en ProtocolVariable", () => {
  it("ninguno se queda fuera — la falsación de §8 del informe", () => {
    const protocolo = leerProtocoloDeCampo();
    const itemsEnElJson = protocolo.activities.reduce((n, a) => n + a.items.length, 0);
    const variables = variablesDe(protocolo);

    // Control positivo del análisis: si el JSON dejara de leerse, o las
    // actividades vinieran vacías, todo lo de abajo pasaría sin comprobar nada.
    expect(itemsEnElJson, "el JSON no trae ítems: no se está midiendo nada").toBe(54);
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
    expect(cubren.length).toBe(27);
    for (const v of cubren) {
      expect(v.coversExistingColumn, `${v.key} declara una columna con forma rara`).toMatch(/^[A-Z]\w+\.\w+$/);
    }
  });

  it("se carga como ProtocolVersion, con sus 54 variables y su AuditEvent", async () => {
    const { version, creado, protocoloCreado } = await cargarProtocoloDeCampo(cuentaId);
    protocolIdCreado = version.protocolId;
    loCreoEstaPrueba = protocoloCreado;
    if (creado) versionIdCreada = version.id;

    // **`creado` no se exige, y la razón importa.** En CI siempre es `true`: el carril con
    // base arranca con un Postgres nuevo. En la copia LOCAL, que todas las sesiones
    // comparten, el protocolo puede estar **ya cargado** — y eso no es basura que limpiar:
    // es lo que el dueño quiere en producción, donde estas 44 preguntas son la lista de
    // chequeo del apicultor.
    //
    // Esta prueba defiende el **contenido** y la **idempotencia**. Que la base estuviera
    // vacía era una precondición accidental, y exigirla convertía una operación legítima
    // —cargar el protocolo— en un CI roto para todas las sesiones. Pasó el 2026-09-14.
    //
    // La garantía de que el cargador CREA no se pierde: sobre una base limpia, si dejara de
    // crear, no habría `version` y las aserciones de abajo caerían.
    expect(typeof creado).toBe("boolean");

    const guardadas = await prisma.protocolVariable.findMany({ where: { protocolVersionId: version.id } });
    expect(guardadas.length).toBe(54);
    expect(guardadas.filter((v) => v.stage === "field").length).toBe(43);
    expect(guardadas.filter((v) => v.stage === "close").length).toBe(11);
    // Cuatro desde la v2 (ADR-165): la condición del sitio dejó de ser texto libre.
    expect(guardadas.filter((v) => v.valueType === "multi_enum").length).toBe(4);
    expect(version.version).toBe(2);
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

    // De ESTA versión hay una sola. El protocolo puede tener más —la v1 del dueño debajo—, y
    // eso no es duplicar: es versionar.
    const versiones = await prisma.protocolVersion.count({ where: { protocolId: protocolIdCreado!, version: 2 } });
    expect(versiones).toBe(1);
  });

  it("UNA VERSIÓN NUEVA SE AÑADE AL MISMO PROTOCOLO, y la anterior no se toca", async () => {
    // Con un identificador de prueba y dos raíces falsas: una trae el JSON como v1, otra como v2.
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const base = leerProtocoloDeCampo();
    const raiz = (v: number) => {
      const d = mkdtempSync(join(tmpdir(), "protocolo-"));
      temporales.push(d);
      mkdirSync(join(d, "protocolos"));
      writeFileSync(join(d, RUTA_DEL_PROTOCOLO_DE_CAMPO), JSON.stringify({ ...base, version: v }));
      return d;
    };
    const identificador = `test-apiario-${RUN_ID}`;
    const v1 = await cargarProtocoloDeCampo(cuentaId, { raiz: raiz(1), identificador });
    protocolosDePrueba.push(v1.version.protocolId);
    const v2 = await cargarProtocoloDeCampo(cuentaId, { raiz: raiz(2), identificador });
    // Se apunta TAMBIÉN el de la v2: si el cargador la metiera en un protocolo aparte —la
    // regresión que esta prueba caza—, la limpieza tiene que llevárselo igual. Lo destapó el
    // flip-test, que dejó uno colgado en la base compartida.
    if (!protocolosDePrueba.includes(v2.version.protocolId)) protocolosDePrueba.push(v2.version.protocolId);
    expect([v1.protocoloCreado, v2.protocoloCreado, v2.creado]).toEqual([true, false, true]);
    expect(v2.version.protocolId).toBe(v1.version.protocolId);
    const versiones = await prisma.protocolVersion.findMany({ where: { protocolId: v1.version.protocolId }, orderBy: { version: "asc" } });
    expect(versiones.map((v) => [v.version, v.id])).toEqual([[1, v1.version.id], [2, v2.version.id]]);
    // La v1 conserva sus variables intactas.
    expect(await prisma.protocolVariable.count({ where: { protocolVersionId: v1.version.id } })).toBe(54);
  });
});
