/**
 * Tres fichas que daban 500 con un id de la URL, mal formado o que no existe.
 *
 * **El defecto, medido el 2026-10-09** (`PENDING_IMPLEMENTATIONS/026`): `calibration/[calibrationSessionId]`,
 * `competitions/[editionId]` y `partner/[projectId]` leían el registro con `findUniqueOrThrow`. Con un id
 * basura, Postgres rechazaba la conversión a `uuid` y Prisma lanzaba `P2007`; con un UUID que no existe,
 * `P2025`. Ninguno de los dos es la clase que cada página atrapa, así que las dos cosas daban 500 en vez
 * de 404. Ahora las tres funciones lanzan su propia clase con un «no existe» —`session_not_found`,
 * `edition_not_found`, `project_not_found`—, que la página convierte en `notFound()`.
 *
 * **Las filas de cada función, y ninguna sobra:**
 *
 * 1. *El defecto* — un id basura lanza esa clase con ese mensaje. Cae con el código de antes, con `P2007`.
 * 2. *Un UUID bien formado que no existe* da exactamente lo mismo. Aquí no es sólo un control: con el
 *    código de antes también caía, con `P2025`.
 * 3. *Control: el registro que existe* se devuelve. Sin él, una guarda que rechazara todo pasaría las dos
 *    primeras.
 *
 * Se mide con un Platform Admin, que pasa la comprobación de permiso de las tres y por eso llega a la
 * consulta. La comprobación de permiso va antes de la de existencia, como antes: quien no tiene permiso
 * sigue recibiendo «sin permiso», no «no existe».
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../lib/db";
import { CompetitionAccessError, getEditionDetail } from "../lib/competitions/service";
import { PartnerAccessError, getProjectWorkspace } from "../lib/partner/workspace";
import { CalibrationAccessError, getCalibrationSessionDetail } from "../lib/sensory/calibration";
import { assertDefinedWhere } from "./helpers/assertDefinedWhere";
import { crearUsuarioConAcceso } from "./helpers/traceability";

const RUN_ID = `idmal-orthrow-${Date.now()}`;

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let calibracionId: string;
let edicionId: string;
let proyectoId: string;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  calibracionId = (
    await prisma.calibrationSession.create({ data: { sessionDate: new Date("2026-03-01"), category: `TEST ${RUN_ID}` } })
  ).id;
  const competencia = await prisma.competition.create({ data: { domain: "coffee", name: `TEST ${RUN_ID}` } });
  edicionId = (await prisma.competitionEdition.create({ data: { competitionId: competencia.id, label: `TEST ${RUN_ID}` } })).id;
  proyectoId = (
    await prisma.project.create({ data: { name: `TEST ${RUN_ID}`, status: "approved", classification: "internal" } })
  ).id;
});

/**
 * Los tres registros se descubren por el `RUN_ID`, así que se limpian aunque el `beforeAll` muera después
 * de crearlos. Lo que crea `crearUsuarioConAcceso` sólo se borra si el ayudante llegó a devolverlo: su
 * marca no es el `RUN_ID` de este archivo. El ámbito de plataforma que devuelve es el compartido y no se
 * borra. Estas lecturas no escriben auditoría.
 */
afterAll(async () => {
  await prisma.calibrationSession.deleteMany({ where: assertDefinedWhere({ category: `TEST ${RUN_ID}` }) });
  await prisma.competitionEdition.deleteMany({ where: assertDefinedWhere({ label: `TEST ${RUN_ID}` }) });
  await prisma.competition.deleteMany({ where: assertDefinedWhere({ name: `TEST ${RUN_ID}` }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ name: `TEST ${RUN_ID}` }) });
  if (usuario) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: usuario.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  }
});

async function lanza(promesa: Promise<unknown>, clase: new (...args: never[]) => Error, mensaje: string) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(clase);
  expect((error as Error).message).toBe(mensaje);
}

describe.each([
  [
    "getCalibrationSessionDetail",
    CalibrationAccessError,
    "session_not_found",
    (id: string) => getCalibrationSessionDetail(usuario.userAccountId, id),
    () => calibracionId,
    (r: unknown) => (r as { id: string }).id,
  ],
  [
    "getEditionDetail",
    CompetitionAccessError,
    "edition_not_found",
    (id: string) => getEditionDetail(usuario.userAccountId, id),
    () => edicionId,
    (r: unknown) => (r as { id: string }).id,
  ],
  [
    "getProjectWorkspace",
    PartnerAccessError,
    "project_not_found",
    (id: string) => getProjectWorkspace(usuario.userAccountId, id),
    () => proyectoId,
    (r: unknown) => (r as { project: { id: string } }).project.id,
  ],
] as const)("%s con un id de la URL", (_nombre, clase, mensaje, leer, existente, idDe) => {
  it.each(IDS_BASURA)("«%s» se trata como uno que no existe", async (id) => {
    await lanza(leer(id), clase, mensaje);
  });

  it("un UUID bien formado que no existe da lo mismo", async () => {
    await lanza(leer(randomUUID()), clase, mensaje);
  });

  it("control: el que existe se devuelve", async () => {
    expect(idDe(await leer(existente()))).toBe(existente());
  });
});
