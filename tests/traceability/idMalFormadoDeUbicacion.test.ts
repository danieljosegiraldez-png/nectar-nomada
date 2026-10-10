/**
 * Un id de ubicación que no tiene forma de UUID es una ubicación que no existe, no una avería.
 *
 * **El defecto, medido el 2026-10-09** (`PENDING_IMPLEMENTATIONS/026`): varias páginas daban 500 con
 * un id basura en la URL porque alguna función mandaba la cadena a `prisma.location.findUnique`,
 * Postgres rechazaba la conversión a `uuid` y Prisma lanzaba `P2007`, que la página no atrapa:
 *
 * - `requireLocationAttributeAccess` — ocho páginas: seis de `plots/[id]/…` (entran por
 *   `getPlotDetail`), `bodegas/[id]` e `instalaciones/[id]`;
 * - `puedeSubdividirParcela` — `plots/[id]`, que la llama fuera de su `try`;
 * - `conAncestros`, dentro de `can()`, y detrás `contextoDeManejo` —
 *   `plots/[id]/manejo/[interventionId]` y `plots/[id]/manejo/nuevo`. Las dos hacen falta: con un
 *   Platform Admin, `can()` pasa y `contextoDeManejo` consulta el mismo id en la línea siguiente.
 *
 * **Las filas de cada función, y ninguna sobra:**
 *
 * 1. *El defecto* — un id basura da lo que la función da a «no existe». Cae con el código de antes,
 *    con el error de Prisma.
 * 2. *Control: un UUID bien formado que no existe* da exactamente lo mismo. Es la regla: la respuesta
 *    a un id basura es la de un id que no existe, ni más ni menos.
 * 3. *Control: la parcela que existe* da lo de siempre. Sin él, una guarda que rechazara todo pasaría
 *    las dos primeras.
 *
 * Para `can()` el control 3 es además el que importa: un operario con ámbito en la FINCA tiene que
 * seguir alcanzando la parcela, que cuelga de ella. Ésa es la razón de ser de `conAncestros`, y una
 * guarda mal puesta la rompería sin que las filas de id basura lo notaran.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { can } from "../../lib/rbac/service";
import { puedeSubdividirParcela } from "../../lib/traceability/fincas";
import { contextoDeManejo } from "../../lib/traceability/intervenciones";
import {
  LocationAccessError,
  puedeGestionarAtributosDeUbicacion,
  requireLocationAttributeAccess,
} from "../../lib/traceability/locations";
import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { getPlotDetail } from "../../lib/traceability/plantingCohorts";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { crearParcela, crearUsuarioConAcceso } from "../helpers/traceability";

const RUN_ID = `idmal-ubic-${Date.now()}`;

/** Ids que una URL puede traer y que Postgres no aceptaría como `uuid`. */
const IDS_BASURA = ["no-es-un-id", "123", "00000000-0000-0000-0000-00000000000"];

/** Platform Admin: pasa todas las comprobaciones de permiso, así que llega a cada consulta. */
let usuario: Awaited<ReturnType<typeof crearUsuarioConAcceso>>;
let parcela: Awaited<ReturnType<typeof crearParcela>>;
/** `Farm Operator` con ámbito en la FINCA de la parcela, no en la parcela: lo que mide es la subida por ancestros. */
let operarioId: string;

beforeAll(async () => {
  usuario = await crearUsuarioConAcceso();
  parcela = await crearParcela();

  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Operario", displayName: `TEST Operario (${RUN_ID})`, locale: "es" },
  });
  operarioId = (
    await prisma.userAccount.create({ data: { personId: persona.id, authProvider: "credentials", status: "active" } })
  ).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: parcela.parentLocationId } });
  await prisma.assignment.create({ data: { userAccountId: operarioId, roleProfileId: perfil.id, scopeId: scope.id } });
});

/**
 * Lo del administrador y la parcela, como `tests/territorio/rejillaEnGetPlotDetail.test.ts`, que usa
 * los mismos ayudantes. El ámbito de plataforma que devuelve `crearUsuarioConAcceso` es el compartido
 * y no se borra. Lo del operario se descubre por el `RUN_ID`, así que una corrida que murió a mitad
 * del `beforeAll` se limpia igual. Estas lecturas no escriben auditoría.
 */
afterAll(async () => {
  const operarios = await prisma.person.findMany({
    where: { displayName: { contains: RUN_ID } },
    select: { userAccount: { select: { id: true } } },
  });
  const idsDeOperarios = operarios.flatMap((p) => (p.userAccount ? [p.userAccount.id] : []));
  if (idsDeOperarios.length) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: idsDeOperarios } }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: idsDeOperarios } }) });
  }
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  if (parcela) {
    // El `Scope` se borra DESPUÉS del `Assignment`, que lo referencia con RESTRICT.
    await prisma.scope.deleteMany({
      where: assertDefinedWhere({ scopeType: "location" as const, scopeRefId: parcela.parentLocationId ?? parcela.id }),
    });
    await prisma.location.deleteMany({
      where: assertDefinedWhere({ id: { in: [parcela.id, parcela.parentLocationId ?? parcela.id] } }),
    });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: parcela.organizationId ?? "" }) });
  }
  if (usuario) {
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: usuario.userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: usuario.userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: usuario.personId }) });
  }
});

/** Lo que la promesa lanza, o `null` si no lanza. */
async function loQueLanza(promesa: Promise<unknown>) {
  return promesa.then(
    () => null,
    (e: unknown) => e,
  );
}

/** Lo que las páginas de ubicación necesitan para dar su respuesta de «no existe»: esta clase y este mensaje. */
async function esNoExiste(promesa: Promise<unknown>) {
  const error = await loQueLanza(promesa);
  expect(error).toBeInstanceOf(LocationAccessError);
  expect((error as Error).message).toBe("location_not_found");
}

describe.each([
  ["requireLocationAttributeAccess", (id: string) => requireLocationAttributeAccess(usuario.userAccountId, id)],
  ["getPlotDetail", (id: string) => getPlotDetail(usuario.userAccountId, id)],
] as const)("%s con un id de la URL", (_nombre, leer) => {
  it.each(IDS_BASURA)("«%s» se trata como una ubicación que no existe", async (id) => {
    await esNoExiste(leer(id));
  });

  it("control: un UUID bien formado que no existe da lo mismo", async () => {
    await esNoExiste(leer(randomUUID()));
  });

  it("control: la parcela que existe pasa", async () => {
    // Si lanzara, la prueba caería con ese error.
    await leer(parcela.id);
  });
});

describe.each([
  ["puedeGestionarAtributosDeUbicacion", (id: string) => puedeGestionarAtributosDeUbicacion(usuario.userAccountId, id)],
  ["puedeSubdividirParcela", (id: string) => puedeSubdividirParcela(usuario.userAccountId, id)],
] as const)("%s con un id de la URL", (_nombre, preguntar) => {
  it.each(IDS_BASURA)("«%s» contesta que no, sin reventar", async (id) => {
    await expect(preguntar(id)).resolves.toBe(false);
  });

  it("control: un UUID bien formado que no existe contesta lo mismo", async () => {
    await expect(preguntar(randomUUID())).resolves.toBe(false);
  });

  it("control: la parcela que existe contesta que sí", async () => {
    await expect(preguntar(parcela.id)).resolves.toBe(true);
  });
});

describe("contextoDeManejo con un id de la URL", () => {
  /** Lo que las dos páginas de manejo convierten en `notFound()`. */
  async function esSinAcceso(promesa: Promise<unknown>) {
    const error = await loQueLanza(promesa);
    expect(error).toBeInstanceOf(TraceabilityAccessError);
    expect((error as Error).message).toBe("no_lot_access");
  }

  it.each(IDS_BASURA)("«%s» da lo mismo que una ubicación que no existe", async (id) => {
    await esSinAcceso(contextoDeManejo(usuario.userAccountId, id));
  });

  it("control: un UUID bien formado que no existe da lo mismo", async () => {
    await esSinAcceso(contextoDeManejo(usuario.userAccountId, randomUUID()));
  });

  it("control: la parcela que existe devuelve su contexto", async () => {
    const contexto = await contextoDeManejo(usuario.userAccountId, parcela.id);
    expect(contexto.id).toBe(parcela.id);
  });
});

describe("can() sobre una ubicación de la URL", () => {
  const puede = (cuenta: string, locationId: string) =>
    can(cuenta, "manage_attributes", "location", { scopeType: "location", scopeRefId: locationId }, "internal");

  it.each(IDS_BASURA)("«%s»: el operario no puede, y no revienta", async (id) => {
    await expect(puede(operarioId, id)).resolves.toBe(false);
  });

  it("control: con un UUID que no existe, el operario tampoco", async () => {
    await expect(puede(operarioId, randomUUID())).resolves.toBe(false);
  });

  it("control: el operario de la FINCA sigue alcanzando la parcela que cuelga de ella", async () => {
    await expect(puede(operarioId, parcela.id)).resolves.toBe(true);
  });

  it.each(IDS_BASURA)("«%s»: el Platform Admin recibe lo mismo que con un UUID que no existe", async (id) => {
    const conBasura = await puede(usuario.userAccountId, id);
    const conInexistente = await puede(usuario.userAccountId, randomUUID());
    expect(conBasura).toBe(conInexistente);
  });
});
