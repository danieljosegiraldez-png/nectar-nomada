/**
 * La identidad del material — Tarea 1 del plan de inventario.
 *
 * **Sin esto no hay existencias.** Hasta hoy el material vivía como TEXTO LIBRE
 * en `MaterialConsumptionEntry.materialName`, y no se puede sumar lo que se
 * escribe distinto cada vez: «aserrín», «aserrin» y «aserrín para el ahumador»
 * son tres materiales para una base de datos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial, MaterialValidationError } from "../../lib/inventario/materiales";
import { MaterialAccessError } from "../../lib/inventario/materiales";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `inv-${Date.now()}`;

let orgA: string;
let orgB: string;
let projectId: string;
let gestorId: string;   // Farm Manager  — tiene equipment:manage
let operarioId: string; // Farm Operator — NO lo tiene

async function cuenta(label: string, perfil: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: label, displayName: `TEST ${label} (${RUN_ID})`, locale: "es" },
  });
  const ua = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const scope =
    (await prisma.scope.findFirst({ where: { scopeType: "project", scopeRefId: projectId } })) ??
    (await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } }));
  await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: p.id, scopeId: scope.id } });
  return ua.id;
}

beforeAll(async () => {
  orgA = await createTestOrganization(`${RUN_ID}-A`);
  orgB = await createTestOrganization(`${RUN_ID}-B`);
  const proyecto = await prisma.project.create({
    data: { name: `TEST Inventario (${RUN_ID})`, status: "approved", classification: "internal" },
  });
  projectId = proyecto.id;
  gestorId = await cuenta("Gestor", "Farm Manager");
  operarioId = await cuenta("Operario", "Farm Operator");
}, 30000);

afterAll(async () => {
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId: { in: [orgA, orgB] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: [gestorId, operarioId] } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: projectId }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: [gestorId, operarioId] } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ displayName: { contains: RUN_ID } }) });
  await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
  await deleteTestOrganizations(`${RUN_ID}-A`);
  await deleteTestOrganizations(`${RUN_ID}-B`);
}, 30000);

describe("la identidad del material", () => {
  it("el mismo nombre dos veces en la misma finca se rechaza", async () => {
    // La razón entera de esta tarea: dos filas «Aserrín» son dos materiales, y
    // entonces las existencias de aserrín no se pueden sumar.
    await crearMaterial(gestorId, { projectId, organizationId: orgA, name: "Aserrín", defaultUnit: "saco" });
    await expect(crearMaterial(gestorId, { projectId, organizationId: orgA, name: "Aserrín", defaultUnit: "saco" }))
      .rejects.toThrow(/ya_existe/);
  }, 20000);

  it("pero DOS FINCAS pueden llamar «Melaza» a lo suyo", async () => {
    // Por organización, no global — mismo criterio que `ProcessRecipe`, cuyo
    // comentario lo dice con esas palabras.
    await crearMaterial(gestorId, { projectId, organizationId: orgA, name: "Melaza", defaultUnit: "gal" });
    await expect(crearMaterial(gestorId, { projectId, organizationId: orgB, name: "Melaza", defaultUnit: "gal" }))
      .resolves.toBeTruthy();
  }, 20000);

  it("el nombre se normaliza al comparar: «  aserrín » ya existe", async () => {
    // Si el espacio de más creara un material nuevo, el texto libre volvería por
    // la puerta de atrás y esta tarea no habría servido de nada.
    await crearMaterial(gestorId, { projectId, organizationId: orgA, name: "Gallinaza", defaultUnit: "quintal" });
    await expect(crearMaterial(gestorId, { projectId, organizationId: orgA, name: "  gallinaza ", defaultUnit: "quintal" }))
      .rejects.toThrow(/ya_existe/);
  }, 20000);

  it("un material sin unidad se rechaza — sin unidad no hay existencias", async () => {
    await expect(crearMaterial(gestorId, { projectId, organizationId: orgA, name: "Sin unidad", defaultUnit: "  " }))
      .rejects.toThrow(MaterialValidationError);
  }, 20000);

  it("un Farm Operator NO define materiales, aunque registre consumos", async () => {
    // Definir qué es «gallinaza» es un acto de gestión, no de faena. El control
    // positivo al lado: sin él, este «no puede» sería el de una cuenta sin
    // permisos y no el de un permiso que falta.
    await expect(crearMaterial(operarioId, { projectId, organizationId: orgA, name: "Prohibido", defaultUnit: "kg" }))
      .rejects.toThrow(MaterialAccessError);
    await expect(crearMaterial(gestorId, { projectId, organizationId: orgA, name: "Permitido", defaultUnit: "kg" }))
      .resolves.toBeTruthy();
  }, 20000);
});
