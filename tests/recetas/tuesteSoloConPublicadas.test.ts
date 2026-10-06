/**
 * El tueste sólo sigue —y el lote sólo elige como óptimo— una versión PUBLICADA que no sea Libre.
 * Parte 2a, §3.3 y §5.2 (tarea 5; decisión del controlador, 2026-10-04).
 *
 * **El hueco que cierra.** Hasta la 2a toda versión nacía publicada, así que `recordRoastSession` y `elegirPerfilDeTueste`
 * sólo comprobaban que la versión existiera y fuera de la organización del lote. Desde la tarea 3 una versión nace en
 * BORRADOR (alguien todavía decide qué lleva), y desde la tarea 10 existen las recetas Libres (una por proceso, escritas al
 * abrirlo). Los selectores ya no las ofrecen (`listRecipeVersionsForLot`), pero un servicio que acepta lo que el selector no
 * ofrece es una puerta abierta para un formulario fabricado: la 2a crea los borradores y la 2a cierra ese hueco.
 *
 * **Es un archivo propio** y no una prueba más de `roasting.test.ts` porque ése es del grupo `datos-reales` (afirma hechos de
 * la finca) y CI no lo corre; éste va en `base-sembrada`. Tampoco se añade a `perfilDeTueste.test.ts`: cada tarea de la 2a
 * toca ese archivo por su cuenta y los puntos de anclaje se pisarían.
 *
 * Cada rechazo lleva su control al lado, y el control cambia SÓLO lo que el rechazo mira (el estado de la versión; la marca
 * `esLibre` de la receta). El estado se mira después de la organización: una versión AJENA en borrador se rechaza por ser
 * ajena, y no cuenta nada de su estado a quien no es de esa organización.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { recordRoastSession, elegirPerfilDeTueste, getPerfilDeTuesteElegido, RoastSessionValidationError } from "../../lib/traceability/roasting";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN = `tueste-publicadas-${Date.now()}`;
let orgId: string, otraOrgId: string, plotId: string, scopeId: string, cuenta: string, verdeId: string;

/** Una receta con su versión 1, cruda y con el estado que pide la prueba. */
async function receta(nombre: string, datos: { organizationId: string; version?: "approved" | "draft"; esLibre?: boolean }) {
  const r = await prisma.processRecipe.create({
    data: {
      name: `TEST ${nombre} ${RUN}`,
      organizationId: datos.organizationId,
      status: "approved",
      esLibre: datos.esLibre ?? false,
      createdBy: cuenta,
      versions: { create: { version: 1, status: datos.version ?? "approved", createdBy: cuenta } },
    },
    select: { id: true, versions: { select: { id: true } } },
  });
  return { recipeId: r.id, versionId: r.versions[0]!.id };
}

const tueste = (recipeVersionId: string) => ({
  lotId: verdeId,
  outputLotCode: `TOST-${RUN}-${Math.random().toString(36).slice(2, 8)}`,
  startedAt: new Date("2026-09-01T10:00:00Z"),
  provenanceClass: "direct_observation" as const,
  purpose: "sample" as const,
  recipeVersionId,
});
const tuestesDeLaCuenta = () => prisma.roastSession.count({ where: { createdBy: cuenta } });
const perfilesDelLote = () => prisma.lotRoastProfile.count({ where: { lotId: verdeId } });

beforeAll(async () => {
  orgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" } })).id;
  otraOrgId = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST otra ${RUN}`, status: "approved", classification: "internal" } })).id;
  plotId = (await prisma.location.create({ data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" } })).id;
  const p = await prisma.person.create({ data: { givenName: "TEST", familyName: "Tueste", displayName: `TEST Tueste (${RUN})`, locale: "es" } });
  cuenta = (await prisma.userAccount.create({ data: { personId: p.id, authProvider: "credentials", status: "active" } })).id;
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: cuenta, roleProfileId: rp.id, scopeId } });
  verdeId = (await prisma.lot.create({ data: { lotCode: `VERDE-${RUN}`, lotType: "green", organizationId: orgId, locationId: plotId, createdBy: cuenta } })).id;
}, 60000);

afterAll(async () => {
  // La limpieza DESCUBRE lo que tiene que borrar por el RUN de esta corrida y no hereda nada de las variables del fixture (ronda de arreglo del
  // 2026-10-06, H2): si el `beforeAll` muriera antes de asignarlas —un rol que no existe—, `assertDefinedWhere` sobre `verdeId` sin asignar abortaba
  // el `afterAll` entero y dejaba vivo lo que el `beforeAll` SÍ había creado (medido con esa mutación: organizaciones 0→2, parcelas, personas, cuentas
  // y ámbitos 0→1). Aquí `orgId`, `plotId`, `cuenta`, `verdeId`… no se leen: se buscan las filas por su nombre, y las que dependen de ellas (parcelas,
  // cuentas, ámbitos, lotes) por las halladas. Cada `where` sale de arreglos —que pueden estar vacíos, y `{ in: [] }` no casa con nada—, nunca de una
  // variable que pueda no estar asignada.
  const organizaciones = (await prisma.organization.findMany({ where: { name: { contains: RUN } }, select: { id: true } })).map((o) => o.id);
  const parcelas = (await prisma.location.findMany({
    where: { OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }] }, select: { id: true },
  })).map((l) => l.id);
  const personas = (await prisma.person.findMany({ where: { displayName: { contains: RUN } }, select: { id: true } })).map((p) => p.id);
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  const ambitos = (await prisma.scope.findMany({
    where: { scopeType: "location", scopeRefId: { in: parcelas } }, select: { id: true },
  })).map((s) => s.id);
  // El verde (`VERDE-<RUN>`), los lotes del tueste (`TOST-<RUN>-…`) y cualquier otro que cuelgue de estas organizaciones o de estas cuentas.
  const lotes = (await prisma.lot.findMany({
    where: { OR: [{ lotCode: { contains: RUN } }, { organizationId: { in: organizaciones } }, { createdBy: { in: cuentas } }] }, select: { id: true },
  })).map((l) => l.id);

  // El orden es el de las FK: el perfil elegido y los tuestes (que apuntan a la versión) antes que las recetas; las recetas
  // —con sus versiones en Cascade— antes que la organización (`process_recipe.organization_id` es RESTRICT desde la tarea 1).
  await prisma.lotRoastProfile.deleteMany({ where: assertDefinedWhere({ lotId: { in: lotes } }) });
  await prisma.roastSession.deleteMany({ where: assertDefinedWhere({ createdBy: { in: cuentas } }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ createdBy: { in: cuentas } }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ id: { in: lotes } }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ OR: [{ name: { contains: RUN } }, { organizationId: { in: organizaciones } }] }) });
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ OR: [{ scopeId: { in: ambitos } }, { userAccountId: { in: cuentas } }] }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: ambitos } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: parcelas } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) });
  // Al final, para que un fallo no deje sin borrar lo de arriba: se CUENTAN las filas del propio RUN, que es lo único que distingue «limpió» de «pasó».
  const quedan = {
    organizaciones: await prisma.organization.count({ where: { name: { contains: RUN } } }),
    parcelas: await prisma.location.count({ where: { name: { contains: RUN } } }),
    personas: await prisma.person.count({ where: { displayName: { contains: RUN } } }),
    cuentas: await prisma.userAccount.count({ where: { id: { in: cuentas } } }),
    ambitos: await prisma.scope.count({ where: { id: { in: ambitos } } }),
    lotes: await prisma.lot.count({ where: { lotCode: { contains: RUN } } }),
    tuestes: await prisma.roastSession.count({ where: { createdBy: { in: cuentas } } }),
    recetas: await prisma.processRecipe.count({ where: { name: { contains: RUN } } }),
  };
  expect(Object.entries(quedan).filter(([, n]) => n > 0), "quedan filas de esta corrida").toEqual([]);
}, 60000);

describe("Parte 2a — registrar un tueste con un perfil: sólo uno publicado y que no sea Libre", () => {
  it("rechaza una versión en BORRADOR (`version_no_publicada`) y no escribe nada; la misma versión, publicada, se sigue", async () => {
    const { versionId } = await receta("perfil borrador", { organizationId: orgId, version: "draft" });
    const antes = await tuestesDeLaCuenta();
    await expect(recordRoastSession(cuenta, tueste(versionId))).rejects.toThrow(new RoastSessionValidationError("version_no_publicada"));
    expect(await tuestesDeLaCuenta(), "un rechazo dejó un tueste escrito").toBe(antes);
    // Control: lo único que cambia es el estado de la versión.
    await prisma.processRecipeVersion.update({ where: { id: versionId }, data: { status: "approved" } });
    const { roastSession } = await recordRoastSession(cuenta, tueste(versionId));
    expect(roastSession.recipeVersionId).toBe(versionId);
  });

  it("rechaza una receta LIBRE (`version_no_publicada`) aunque su versión esté publicada; la misma receta, sin la marca, se sigue", async () => {
    const { recipeId, versionId } = await receta("perfil libre", { organizationId: orgId, esLibre: true });
    const antes = await tuestesDeLaCuenta();
    await expect(recordRoastSession(cuenta, tueste(versionId))).rejects.toThrow(new RoastSessionValidationError("version_no_publicada"));
    expect(await tuestesDeLaCuenta(), "un rechazo dejó un tueste escrito").toBe(antes);
    // Control: lo único que cambia es la marca de la receta.
    await prisma.processRecipe.update({ where: { id: recipeId }, data: { esLibre: false } });
    const { roastSession } = await recordRoastSession(cuenta, tueste(versionId));
    expect(roastSession.recipeVersionId).toBe(versionId);
  });

  it("una versión AJENA en borrador se rechaza por ser ajena: su estado no se cuenta a quien no es de su organización", async () => {
    const { versionId } = await receta("perfil ajeno borrador", { organizationId: otraOrgId, version: "draft" });
    await expect(recordRoastSession(cuenta, tueste(versionId))).rejects.toThrow(new RoastSessionValidationError("recipe_belongs_to_another_organization"));
    await expect(elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: versionId })).rejects.toThrow(
      new RoastSessionValidationError("recipe_belongs_to_another_organization"),
    );
  });
});

describe("Parte 2a — elegir el perfil óptimo de un lote: sólo uno publicado y que no sea Libre", () => {
  it("rechaza una versión en BORRADOR (`version_no_publicada`) y no deja ningún perfil elegido; la misma versión, publicada, se elige", async () => {
    const { versionId } = await receta("óptimo borrador", { organizationId: orgId, version: "draft" });
    const antes = await perfilesDelLote();
    await expect(elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: versionId })).rejects.toThrow(
      new RoastSessionValidationError("version_no_publicada"),
    );
    expect(await perfilesDelLote(), "un rechazo dejó un perfil elegido").toBe(antes);
    // Control: lo único que cambia es el estado de la versión.
    await prisma.processRecipeVersion.update({ where: { id: versionId }, data: { status: "approved" } });
    await elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: versionId });
    expect((await getPerfilDeTuesteElegido(cuenta, verdeId))?.recipeVersionId).toBe(versionId);
  });

  it("rechaza una receta LIBRE (`version_no_publicada`) aunque su versión esté publicada; la misma receta, sin la marca, se elige", async () => {
    const { recipeId, versionId } = await receta("óptimo libre", { organizationId: orgId, esLibre: true });
    // El perfil que ya había (del `it` anterior): un rechazo no lo cambia.
    const elegidoAntes = (await getPerfilDeTuesteElegido(cuenta, verdeId))?.recipeVersionId ?? null;
    await expect(elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: versionId })).rejects.toThrow(
      new RoastSessionValidationError("version_no_publicada"),
    );
    expect((await getPerfilDeTuesteElegido(cuenta, verdeId))?.recipeVersionId ?? null, "un rechazo cambió el perfil elegido").toBe(elegidoAntes);
    // Control: lo único que cambia es la marca de la receta.
    await prisma.processRecipe.update({ where: { id: recipeId }, data: { esLibre: false } });
    await elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: versionId });
    expect((await getPerfilDeTuesteElegido(cuenta, verdeId))?.recipeVersionId).toBe(versionId);
  });
});
