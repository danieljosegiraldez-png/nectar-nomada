/**
 * Las ocho páginas que quedaban de `PENDING_IMPLEMENTATIONS/026`: un segmento de la URL que no existe, o
 * que no tiene la forma que espera la base, es «no existe», no una avería.
 *
 * **El defecto, medido el 2026-10-09.** Siete funciones mandaban el id de la URL a `findUnique` o
 * `findFirst` sobre una columna `@db.Uuid`, y con un id basura Postgres rechazaba la conversión y Prisma
 * lanzaba `P2007`, que ninguna página atrapa:
 *
 * | función | página |
 * |---|---|
 * | `getBiocharBatch` | `biochar/[id]` |
 * | `getStoryForEditor` | `content/[id]` |
 * | `instrumentoParaVerificar` | `equipos/[id]` |
 * | `modeloParaFicha` | `equipos/modelos/[id]` |
 * | `detalleDeJornada` | `finca/jornadas/[id]` |
 * | `getRecipeForEditor` | `recipes/[id]` |
 * | `getSessionForJudge` (por `grantedKeysForSession`) | `sensory/[sessionId]` |
 *
 * Con un UUID que no existe las siete ya lanzaban su propia clase de «no existe», que cada página
 * convierte en 404 o en una vuelta a su lista. Ahora un id basura recibe exactamente eso.
 *
 * Y la octava es distinta: `sensory/herramientas/ruedas/[wheel]` no recibe un id sino un **dominio**, y
 * `obtenerRuedaSensorial` lo pasaba al filtro de un enum. Con cualquier valor fuera del enum, Prisma
 * lanzaba un error de validación —con éste o con un UUID, da igual—. Ahora lo compara con
 * `SensoryWheelDomain`, que es el enum generado, y lanza `RuedaSensorialNoEncontrada`.
 *
 * **Las filas de cada función, y ninguna sobra:**
 *
 * 1. *El defecto* — un valor basura lanza esa clase con ese mensaje. Cae con el código de antes.
 * 2. *Control: un valor bien formado que no existe* da exactamente lo mismo. Para la rueda es un dominio
 *    válido sin rueda: «wine», que ninguna prueba ni la siembra crean.
 * 3. *Control: el registro que existe* se devuelve. Sin él, una guarda que rechazara todo pasaría las dos
 *    primeras. La rueda real es de «mead» y no de «cider», que es la que crea
 *    `tests/sensory/ruedas.test.ts`: `domain` es único y las dos pruebas pueden correr a la vez.
 *
 * Se mide con un Platform Admin, que pasa todas las comprobaciones de permiso y por eso llega a la
 * consulta.
 *
 * **Y una novena, de las rarezas de la misma ficha:** `admin/users/[assignmentId]/permisos` no daba 500
 * porque su página tenía un `catch {}` que se lo tragaba **todo** —también un fallo real—. Ahora la página
 * sólo atrapa `UserAdminError`, y por eso `listAssignmentPermissions` necesita su propia guarda: sin ella,
 * el id basura volvería a dar 500 en cuanto el `catch` dejó de tragárselo.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../lib/db";
import { listAssignmentPermissions, UserAdminError } from "../lib/rbac/admin";
import { ContentAccessError, getStoryForEditor } from "../lib/content/stories";
import { EquipoError, instrumentoParaVerificar } from "../lib/equipos/equipos";
import { ModeloError, modeloParaFicha } from "../lib/equipos/modelos";
import { getSessionForJudge, SensoryAccessError } from "../lib/sensory/service";
import { obtenerRuedaSensorial, RuedaSensorialNoEncontrada } from "../lib/sensory/ruedas";
import { getBiocharBatch } from "../lib/traceability/biocharBatches";
import { detalleDeJornada, JornadaError } from "../lib/traceability/jornadasDeCosecha";
import { LocationAccessError } from "../lib/traceability/locations";
import { getRecipeForEditor, ProcessTargetError } from "../lib/traceability/processTargets";
import { assertDefinedWhere } from "./helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "./helpers/testOrganization";
import { crearUsuarioConAcceso } from "./helpers/traceability";

const RUN_ID = `idmal-resto-${Date.now()}`;
const MARCA = `TEST ${RUN_ID}`;

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
const ids = { biochar: "", historia: "", equipo: "", modelo: "", jornada: "", receta: "", sesion: "", rueda: "", asignacion: "" };

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  // La asignación de plataforma del propio administrador: es real y la borra la limpieza de `usuario`.
  ids.asignacion = (await prisma.assignment.findFirstOrThrow({ where: { userAccountId: usuario.userAccountId } })).id;
  const organizationId = await createTestOrganization(RUN_ID);
  const sitio = await prisma.location.create({
    data: { name: MARCA, locationType: "site", organizationId, status: "approved", classification: "internal" },
  });
  // `getRecipeForEditor` exige que la organización de la receta tenga algún lote.
  await prisma.lot.create({ data: { lotCode: `${RUN_ID}-lote`, lotType: "green", organizationId } });

  ids.biochar = (
    await prisma.biocharBatch.create({
      data: { batchCode: RUN_ID, organizationId, producedAtLocationId: sitio.id, provenanceClass: "original_record" },
    })
  ).id;
  ids.historia = (await prisma.story.create({ data: { slug: RUN_ID, title: MARCA } })).id;
  ids.equipo = (
    await prisma.equipment.create({ data: { name: MARCA, kind: "vessel", organizationId, provenanceClass: "original_record" } })
  ).id;
  // Sin organización: los modelos compartidos los ve cualquiera (`filtroVisible`).
  ids.modelo = (
    await prisma.equipmentModel.create({
      data: { kind: "vessel", manufacturer: MARCA, modelName: MARCA, provenanceClass: "original_record" },
    })
  ).id;
  ids.jornada = (await prisma.jornadaDeCosecha.create({ data: { fincaSiteId: sitio.id, fecha: new Date("2026-03-01") } })).id;
  ids.receta = (await prisma.processRecipe.create({ data: { name: MARCA, organizationId } })).id;

  const protocolo = await prisma.sensoryProtocol.create({ data: { domain: "coffee", name: MARCA } });
  const versionDeProtocolo = await prisma.sensoryProtocolVersion.create({
    data: { protocolId: protocolo.id, version: 1, scoreMin: 0, scoreMax: 100 },
  });
  ids.sesion = (
    await prisma.sensorySession.create({
      data: { name: MARCA, protocolVersionId: versionDeProtocolo.id, status: "in_progress", classification: "internal" },
    })
  ).id;

  const rueda = await prisma.sensoryWheel.create({ data: { domain: "mead", title: MARCA } });
  await prisma.sensoryWheelVersion.create({
    data: { wheelId: rueda.id, version: 991, sourceAuthor: "TEST", sourceReference: "https://example.test/source", license: "TEST only" },
  });
  ids.rueda = rueda.id;
}, 30000);

/**
 * Todo lo de este archivo se descubre por el `RUN_ID`, hijos antes que padres, así que se limpia aunque el
 * `beforeAll` muera después de crearlo. Lo que crea `crearUsuarioConAcceso` sólo se borra si el ayudante
 * llegó a devolverlo: su marca no es la de este archivo. El ámbito de plataforma que devuelve es el
 * compartido y no se borra. Las versiones de rueda son de sólo añadir, y se borran con la misma escotilla
 * que usa `tests/sensory/ruedas.test.ts`. Estas lecturas no escriben auditoría.
 */
afterAll(async () => {
  const ruedas = await prisma.sensoryWheel.findMany({ where: { title: MARCA }, select: { id: true } });
  for (const { id } of ruedas) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL nn.limpieza_de_pruebas = 'on'`;
      await tx.sensoryWheelVersion.deleteMany({ where: assertDefinedWhere({ wheelId: id }) });
      await tx.sensoryWheel.delete({ where: { id } });
    });
  }
  await prisma.sensorySession.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await prisma.sensoryProtocolVersion.deleteMany({ where: assertDefinedWhere({ protocol: { name: MARCA } }) });
  await prisma.sensoryProtocol.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await prisma.jornadaDeCosecha.deleteMany({ where: assertDefinedWhere({ fincaSite: { name: MARCA } }) });
  await prisma.equipmentModel.deleteMany({ where: assertDefinedWhere({ manufacturer: MARCA }) });
  await prisma.equipment.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await prisma.story.deleteMany({ where: assertDefinedWhere({ slug: RUN_ID }) });
  await prisma.biocharBatch.deleteMany({ where: assertDefinedWhere({ batchCode: RUN_ID }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ lotCode: { startsWith: RUN_ID } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ name: MARCA }) });
  await deleteTestOrganizations(RUN_ID);
  if (usuario) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: usuario.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  }
}, 30000);

async function lanza(promesa: Promise<unknown>, clase: abstract new (...args: never[]) => Error, mensaje: string | null) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(clase);
  if (mensaje !== null) expect((error as Error).message).toBe(mensaje);
}

type Caso = readonly [
  nombre: string,
  clase: abstract new (...args: never[]) => Error,
  mensaje: string | null,
  leer: (valor: string) => Promise<unknown>,
  inexistente: () => string,
  existente: () => string,
  idDe: (leido: unknown) => string,
];

const porId = (r: unknown) => (r as { id: string }).id;

const CASOS: readonly Caso[] = [
  ["getBiocharBatch", LocationAccessError, "biochar_batch_not_found", (v) => getBiocharBatch(usuario.userAccountId, v), randomUUID, () => ids.biochar, porId],
  ["getStoryForEditor", ContentAccessError, "no_content_access", (v) => getStoryForEditor(usuario.userAccountId, v), randomUUID, () => ids.historia, (r) => (r as { story: { id: string } }).story.id],
  ["instrumentoParaVerificar", EquipoError, "equipment_not_found", (v) => instrumentoParaVerificar(usuario.userAccountId, v), randomUUID, () => ids.equipo, porId],
  ["modeloParaFicha", ModeloError, "modelo_no_encontrado", (v) => modeloParaFicha(usuario.userAccountId, v), randomUUID, () => ids.modelo, porId],
  ["detalleDeJornada", JornadaError, "jornada_no_encontrada", (v) => detalleDeJornada(usuario.userAccountId, v), randomUUID, () => ids.jornada, (r) => (r as { jornada: { id: string } }).jornada.id],
  ["getRecipeForEditor", ProcessTargetError, "recipe_not_found", (v) => getRecipeForEditor(usuario.userAccountId, v), randomUUID, () => ids.receta, porId],
  ["getSessionForJudge", SensoryAccessError, "no_session_access", (v) => getSessionForJudge(usuario.userAccountId, v), randomUUID, () => ids.sesion, (r) => (r as { session: { id: string } }).session.id],
  // La rueda se busca por dominio, no por id: el «inexistente» es un dominio válido sin rueda.
  ["obtenerRuedaSensorial", RuedaSensorialNoEncontrada, null, (v) => obtenerRuedaSensorial(v, usuario.userAccountId), () => "wine", () => "mead", (r) => (r as { id: string }).id],
  ["listAssignmentPermissions", UserAdminError, "assignment_not_found", (v) => listAssignmentPermissions(usuario.userAccountId, v), randomUUID, () => ids.asignacion, (r) => (r as { asignacion: { id: string } }).asignacion.id],
];

describe.each(CASOS)("%s con un valor de la URL", (nombre, clase, mensaje, leer, inexistente, existente, idDe) => {
  it.each(IDS_BASURA)("«%s» se trata como uno que no existe", async (valor) => {
    await lanza(leer(valor), clase, mensaje);
  });

  it("control: uno bien formado que no existe da lo mismo", async () => {
    await lanza(leer(inexistente()), clase, mensaje);
  });

  it("control: el que existe se devuelve", async () => {
    const esperado = nombre === "obtenerRuedaSensorial" ? ids.rueda : existente();
    expect(idDe(await leer(existente()))).toBe(esperado);
  });
});
