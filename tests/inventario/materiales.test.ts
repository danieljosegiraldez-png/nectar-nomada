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

/**
 * El botiquín, Tarea 1: lo que el PRODUCTO lleva escrito una vez.
 *
 * Casa farmacéutica, principio activo, registro sanitario, carencia por
 * defecto, conservación, advertencias y plazo de aviso. Del producto y no del
 * frasco: el Apivar de un laboratorio es el mismo en todos los frascos, y
 * pedirlo en cada compra hace que se escriba distinto cada vez.
 */
describe("el producto como medicamento", () => {
  const base = () => ({ projectId, organizationId: orgA, defaultUnit: "tira" });

  it("un medicamento guarda casa farmacéutica, principio activo y registro", async () => {
    const m = await crearMaterial(gestorId, {
      ...base(), name: `Apivar ${Date.now()}`,
      isVeterinaryMedicine: true,
      manufacturer: "Véto-pharma", activeIngredient: "amitraz",
      sanitaryRegistration: "REG-123", storageConditions: "15–25 °C, lejos de la luz",
      safetyNotes: "Usar guantes. No tocar los ojos.", defaultWithdrawalDays: 0, avisarDiasAntes: 30,
    });
    expect(m.isVeterinaryMedicine).toBe(true);
    expect(m.manufacturer).toBe("Véto-pharma");
    expect(m.activeIngredient).toBe("amitraz");
    expect(m.safetyNotes).toContain("guantes");
    expect(m.avisarDiasAntes).toBe(30);
  }, 20000);

  it("carencia CERO declarada no es lo mismo que sin declarar", async () => {
    // El Reglamento (UE) 2019/6 la pide «aunque sea cero». Un `|| null` en vez
    // de `?? null` convertiría el 0 en «sin declarar» y perdería la declaración.
    const cero = await crearMaterial(gestorId, { ...base(), name: `Cero ${Date.now()}`, defaultWithdrawalDays: 0 });
    const nada = await crearMaterial(gestorId, { ...base(), name: `Nada ${Date.now()}` });
    expect(cero.defaultWithdrawalDays).toBe(0);
    expect(nada.defaultWithdrawalDays).toBeNull();
  }, 20000);

  it("un plazo de aviso negativo se rechaza", async () => {
    await expect(crearMaterial(gestorId, { ...base(), name: `NegA ${Date.now()}`, avisarDiasAntes: -1 }))
      .rejects.toThrow(MaterialValidationError);
  }, 20000);

  it("una carencia negativa se rechaza", async () => {
    await expect(crearMaterial(gestorId, { ...base(), name: `NegC ${Date.now()}`, defaultWithdrawalDays: -1 }))
      .rejects.toThrow(MaterialValidationError);
  }, 20000);

  it("y la BASE rechaza la carencia negativa aunque alguien rodee el servicio", async () => {
    // El CHECK, no la interfaz: un guion que escriba directo se topa con la misma regla.
    //
    // **Se exige el NOMBRE del CHECK, y no un `toThrow()` pelado.** La primera
    // versión aceptaba cualquier error, y salió VERDE ANTES de que existiera el
    // CHECK: Prisma rechazaba el campo porque la columna aún no existía. Un
    // guardia que pasa por la razón equivocada no guarda nada. Este mensaje
    // sólo lo puede producir la restricción de la base.
    await expect(prisma.consumableMaterial.create({
      data: { organizationId: orgA, name: `CheckC ${Date.now()}`, defaultUnit: "tira", defaultWithdrawalDays: -3 },
    })).rejects.toThrow(/consumable_material_carencia_no_negativa/);
  }, 20000);

  it("la gallinaza sigue creándose sin ninguno de estos campos, y NO es medicamento", async () => {
    // El control de que no se volvió obligatorio nada para lo que no es medicina.
    const g = await crearMaterial(gestorId, { ...base(), name: `Gallinaza ${Date.now()}`, defaultUnit: "quintal" });
    expect(g.isVeterinaryMedicine).toBe(false);
    expect(g.manufacturer).toBeNull();
  }, 20000);
});

/**
 * El producto de manejo fitosanitario — aplicaciones fitosanitarias, Tarea 4.
 * Gemelo del bloque de arriba: reentrada en vez de carencia.
 */
describe("el producto como fitosanitario", () => {
  const base = () => ({ projectId, organizationId: orgA, defaultUnit: "l" });

  it("un producto fitosanitario guarda su reentrada; cero declarado no es nulo", async () => {
    const m = await crearMaterial(gestorId, { ...base(), name: `Fito ${RUN_ID}`, isPlantProtection: true, defaultReentryHours: 0 });
    expect(m.isPlantProtection).toBe(true);
    expect(m.defaultReentryHours).toBe(0);
    const s = await crearMaterial(gestorId, { ...base(), name: `Fito2 ${RUN_ID}`, isPlantProtection: true });
    expect(s.defaultReentryHours).toBeNull();
  }, 20000);

  it("reentrada negativa se rechaza en el servicio, antes de la base", async () => {
    await expect(crearMaterial(gestorId, { ...base(), name: `Neg ${RUN_ID}`, defaultReentryHours: -1 }))
      .rejects.toThrow(MaterialValidationError);
  }, 20000);
});
