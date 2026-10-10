/**
 * Un id de investigación que no tiene forma de UUID es uno que no existe, no una avería.
 *
 * **El defecto, medido el 2026-10-09** (`PENDING_IMPLEMENTATIONS/026`): `research/[protocolId]`,
 * `research/execute/[protocolVersionId]` y `research/treatments/[id]` daban 500 con un id basura en la URL.
 * `getProtocolDetail`, `getProtocolVersionDetail` y `getTreatmentBatchDetail` mandaban la cadena a
 * `findUnique`, Postgres rechazaba la conversión a `uuid` y Prisma lanzaba `P2007`. Con un UUID que no
 * existe ya daban 404: las tres lanzan su `ResearchAccessError("…_not_found")`, que la página convierte en
 * `notFound()`. Ahora un id basura recibe exactamente eso.
 *
 * **Las filas de cada función, y ninguna sobra:**
 *
 * 1. *El defecto* — un id basura lanza esa clase con ese mensaje. Cae con el código de antes, con `P2007`.
 * 2. *Control: un UUID bien formado que no existe* da exactamente lo mismo.
 * 3. *Control: el registro que existe* se devuelve. Sin él, una guarda que rechazara todo pasaría las dos
 *    primeras.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { ResearchAccessError } from "../../lib/research/access";
import { getProtocolDetail, getProtocolVersionDetail } from "../../lib/research/protocols";
import { getTreatmentBatchDetail } from "../../lib/research/treatments";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearUsuarioConAcceso } from "../helpers/traceability";

const RUN_ID = `idmal-research-${Date.now()}`;

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

/** Platform Admin: pasa la comprobación de permiso, así que se mide lo que pasa con el registro. */
let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let protocoloId: string;
let versionId: string;
let loteId: string;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  protocoloId = (await prisma.protocol.create({ data: { name: `TEST ${RUN_ID}` } })).id;
  versionId = (await prisma.protocolVersion.create({ data: { protocolId: protocoloId, version: 1 } })).id;
  loteId = (
    await prisma.treatmentBatch.create({
      data: { protocolVersionId: versionId, batchLabel: `TEST ${RUN_ID}`, startedAt: new Date("2026-03-01"), provenanceClass: "original_record" },
    })
  ).id;
});

/**
 * Los tres registros se descubren por el `RUN_ID`, así que se limpian aunque el `beforeAll` muera después
 * de crearlos; hijos antes que padres. Lo que crea `crearUsuarioConAcceso` sólo se borra si el ayudante
 * llegó a devolverlo: su marca no es el `RUN_ID` de este archivo. El ámbito de plataforma que devuelve
 * es el compartido y no se borra. Estas lecturas no escriben auditoría.
 */
afterAll(async () => {
  const protocolos = await prisma.protocol.findMany({ where: { name: `TEST ${RUN_ID}` }, select: { id: true } });
  const idsDeProtocolos = protocolos.map((p) => p.id);
  await prisma.treatmentBatch.deleteMany({ where: assertDefinedWhere({ batchLabel: `TEST ${RUN_ID}` }) });
  if (idsDeProtocolos.length) {
    await prisma.protocolVersion.deleteMany({ where: assertDefinedWhere({ protocolId: { in: idsDeProtocolos } }) });
    await prisma.protocol.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeProtocolos } }) });
  }
  if (usuario) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: usuario.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  }
});

/** Lo que las tres páginas convierten en `notFound()`: esta clase y este mensaje. */
async function esNoExiste(promesa: Promise<unknown>, mensaje: string) {
  const error = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ResearchAccessError);
  expect((error as Error).message).toBe(mensaje);
}

describe.each([
  ["getProtocolDetail", "protocol_not_found", (id: string) => getProtocolDetail(usuario.userAccountId, id), () => protocoloId],
  ["getProtocolVersionDetail", "protocol_version_not_found", (id: string) => getProtocolVersionDetail(usuario.userAccountId, id), () => versionId],
  ["getTreatmentBatchDetail", "treatment_batch_not_found", (id: string) => getTreatmentBatchDetail(usuario.userAccountId, id), () => loteId],
] as const)("%s con un id de la URL", (_nombre, mensaje, leer, existente) => {
  it.each(IDS_BASURA)("«%s» se trata como uno que no existe", async (id) => {
    await esNoExiste(leer(id), mensaje);
  });

  it("control: un UUID bien formado que no existe da lo mismo", async () => {
    await esNoExiste(leer(randomUUID()), mensaje);
  });

  it("control: el que existe se devuelve", async () => {
    const leido = await leer(existente());
    expect(leido.id).toBe(existente());
  });
});
