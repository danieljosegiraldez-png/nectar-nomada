/**
 * El perfil de tueste como variable, y el óptimo por lote.
 *
 * **El hueco que cierra (2026-09-06).** Un puntaje de taza no podía decir con
 * qué perfil se tostó: `RoastSession` no se enlazaba con ninguna receta y no
 * distinguía un tueste de muestra de uno de producción, así que los dos eran
 * indistinguibles después. Sin eso, el hilo «tarea de finca → puntaje» se rompe
 * justo en el centro.
 *
 * Decisiones de Daniel: reusar `ProcessRecipe` en vez de una entidad propia, y
 * que «óptimo» viva en la relación perfil↔LOTE — un perfil puede ser el bueno
 * para un café y no para otro.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import {
  recordRoastSession,
  elegirPerfilDeTueste,
  getPerfilDeTuesteElegido,
  RoastSessionValidationError,
} from "../../lib/traceability/roasting";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import type { RoastPurpose } from "../../generated/prisma/client";

const RUN = `perfil-${Date.now()}`;
let orgId: string, otraOrgId: string, plotId: string, scopeId: string, cuenta: string;
let verdeId: string, perfilA: string, perfilB: string, perfilAjeno: string;

beforeAll(async () => {
  orgId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST ${RUN}`, status: "approved", classification: "internal" },
  })).id;
  otraOrgId = (await prisma.organization.create({
    data: { organizationType: "farm", name: `TEST otra ${RUN}`, status: "approved", classification: "internal" },
  })).id;
  plotId = (await prisma.location.create({
    data: { locationType: "plot", name: `TEST plot ${RUN}`, organizationId: orgId, status: "approved", classification: "internal" },
  })).id;
  const p = await prisma.person.create({
    data: { givenName: "TEST", familyName: "Perfil", displayName: `TEST Perfil (${RUN})`, locale: "es" },
  });
  cuenta = (await prisma.userAccount.create({
    data: { personId: p.id, authProvider: "credentials", status: "active" },
  })).id;
  scopeId = (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: plotId } })).id;
  const rp = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  await prisma.assignment.create({ data: { userAccountId: cuenta, roleProfileId: rp.id, scopeId } });

  verdeId = (await prisma.lot.create({
    data: { lotCode: `VERDE-${RUN}`, lotType: "green", organizationId: orgId, locationId: plotId, createdBy: cuenta },
  })).id;

  const receta = async (nombre: string, org: string | null) => {
    const r = await prisma.processRecipe.create({ data: { name: nombre, organizationId: org, createdBy: cuenta } });
    return (await prisma.processRecipeVersion.create({
      data: { recipeId: r.id, version: 1, status: "approved", createdBy: cuenta },
    })).id;
  };
  perfilA = await receta(`TEST perfil A ${RUN}`, orgId);
  perfilB = await receta(`TEST perfil B ${RUN}`, orgId);
  perfilAjeno = await receta(`TEST perfil ajeno ${RUN}`, otraOrgId);
});

afterAll(async () => {
  await prisma.lotRoastProfile.deleteMany({ where: assertDefinedWhere({ lotId: verdeId }) });
  await prisma.roastSession.deleteMany({ where: assertDefinedWhere({ createdBy: cuenta }) });
  await prisma.lotTransformation.deleteMany({ where: assertDefinedWhere({ createdBy: cuenta }) });
  await prisma.lot.deleteMany({ where: assertDefinedWhere({ createdBy: cuenta }) });
  await prisma.processRecipeVersion.deleteMany({ where: assertDefinedWhere({ createdBy: cuenta }) });
  await prisma.processRecipe.deleteMany({ where: assertDefinedWhere({ createdBy: cuenta }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: cuenta }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: scopeId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: cuenta }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: plotId }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: [orgId, otraOrgId] } }) });
});

/** `purpose` va en la firma y no dentro de `extra`: con `Record<string, unknown>`
 *  esparcido al final, TypeScript no ve el campo obligatorio y el archivo
 *  compila mal aunque las pruebas pasen. Lo cazó la compuerta, no la suite. */
const tueste = (purpose: RoastPurpose, extra: { recipeVersionId?: string } = {}) => ({
  lotId: verdeId,
  outputLotCode: `TOST-${RUN}-${Math.random().toString(36).slice(2, 8)}`,
  startedAt: new Date("2026-09-01T10:00:00Z"),
  provenanceClass: "direct_observation" as const,
  purpose,
  ...extra,
});

describe("un tueste dice para qué fue y qué perfil siguió", () => {
  it("guarda muestra y producción como cosas distintas", async () => {
    const muestra = await recordRoastSession(cuenta, tueste("sample"));
    const produccion = await recordRoastSession(cuenta, tueste("production"));

    const [m, p] = await Promise.all([
      prisma.roastSession.findUniqueOrThrow({ where: { id: muestra.roastSession.id } }),
      prisma.roastSession.findUniqueOrThrow({ where: { id: produccion.roastSession.id } }),
    ]);
    expect(m.purpose).toBe("sample");
    expect(p.purpose, "si los dos salieran iguales, un puntaje no podría decir de dónde viene").toBe("production");
  });

  it("guarda el perfil seguido, y admite no seguir ninguno", async () => {
    const con = await recordRoastSession(cuenta, tueste("sample", { recipeVersionId: perfilA }));
    const sin = await recordRoastSession(cuenta, tueste("sample"));

    expect((await prisma.roastSession.findUniqueOrThrow({ where: { id: con.roastSession.id } })).recipeVersionId).toBe(perfilA);
    expect(
      (await prisma.roastSession.findUniqueOrThrow({ where: { id: sin.roastSession.id } })).recipeVersionId,
      "los primeros tuestes de muestra se hacen sin perfil: así se encuentra uno",
    ).toBeNull();
  });

  it("rechaza un perfil de otra organización", async () => {
    await expect(
      recordRoastSession(cuenta, tueste("sample", { recipeVersionId: perfilAjeno })),
    ).rejects.toBeInstanceOf(RoastSessionValidationError);
  });
});

describe("el óptimo es de un lote, no del perfil", () => {
  it("se elige, y se lee de vuelta con sus objetivos", async () => {
    await elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: perfilA, notes: "el que mejor cató" });
    const leido = await getPerfilDeTuesteElegido(cuenta, verdeId);
    expect(leido?.recipeVersionId).toBe(perfilA);
    expect(leido?.notes).toBe("el que mejor cató");
    expect(leido?.recipeVersion.recipe.name, "la pantalla necesita el nombre, no el id").toContain("perfil A");
  });

  /**
   * Reemplaza, no acumula: hay UN óptimo vigente por lote. Sin esta prueba, un
   * `create` en vez de `upsert` fallaría con un error de restricción única que
   * nadie relacionaría con «ya habías elegido uno».
   */
  it("elegir otro reemplaza al anterior, y sigue habiendo uno solo", async () => {
    await elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: perfilB });
    expect((await getPerfilDeTuesteElegido(cuenta, verdeId))?.recipeVersionId).toBe(perfilB);
    expect(await prisma.lotRoastProfile.count({ where: assertDefinedWhere({ lotId: verdeId }) })).toBe(1);
  });

  it("rechaza elegir un perfil de otra organización", async () => {
    await expect(
      elegirPerfilDeTueste(cuenta, { lotId: verdeId, recipeVersionId: perfilAjeno }),
    ).rejects.toBeInstanceOf(RoastSessionValidationError);
  });

  /**
   * Control positivo del vacío: un lote sin elegir devuelve `null`, no el perfil
   * de otro. Sin esto, una consulta mal filtrada que devolviera siempre la
   * primera fila pasaría las pruebas de arriba.
   */
  it("un lote sin perfil elegido devuelve null", async () => {
    const otro = await prisma.lot.create({
      data: { lotCode: `VERDE2-${RUN}`, lotType: "green", organizationId: orgId, locationId: plotId, createdBy: cuenta },
    });
    expect(await getPerfilDeTuesteElegido(cuenta, otro.id)).toBeNull();
  });
});
