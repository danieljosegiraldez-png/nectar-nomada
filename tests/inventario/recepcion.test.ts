/**
 * Recibir un medicamento — botiquín, Tarea 9: las opciones de la pantalla y
 * completar un producto que aún no declara sus campos.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../../lib/db";
import { crearMaterial, MaterialAccessError, MaterialValidationError } from "../../lib/inventario/materiales";
import { camposDe, completarProducto, opcionesDeRecepcion } from "../../lib/inventario/recepcion";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { createTestOrganization, deleteTestOrganizations } from "../helpers/testOrganization";

const RUN_ID = `rec-${Date.now()}`;

let organizationId: string;
let otraOrganizationId: string;
let bodega: string;
let sitioAjeno: string;
let gestorId: string;
let operarioId: string;
let ajenoId: string;

beforeAll(async () => {
  organizationId = await createTestOrganization(RUN_ID);
  otraOrganizationId = await createTestOrganization(`${RUN_ID}-b`);
  bodega = (await prisma.location.create({ data: { name: `TEST Bodega (${RUN_ID})`, locationType: "site", classification: "internal", organizationId } })).id;
  sitioAjeno = (await prisma.location.create({ data: { name: `TEST Ajeno (${RUN_ID})`, locationType: "site", classification: "internal", organizationId: otraOrganizationId } })).id;
  const cuenta = async (n: string, perfil: string, sitio: string) => {
    const ua = await prisma.userAccount.create({
      data: {
        person: { create: { givenName: "TEST", familyName: n, displayName: `TEST ${n} (${RUN_ID})`, locale: "es" } },
        authProvider: "credentials", status: "active",
      },
    });
    const p = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    const scope =
      (await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: sitio } })) ??
      (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitio } }));
    await prisma.assignment.create({ data: { userAccountId: ua.id, roleProfileId: p.id, scopeId: scope.id } });
    return ua.id;
  };
  gestorId = await cuenta("Gestor", "Farm Manager", bodega);
  operarioId = await cuenta("Operario", "Farm Operator", bodega);
  ajenoId = await cuenta("Ajeno", "Farm Manager", sitioAjeno);
}, 30000);

afterAll(async () => {
  const personas = (await prisma.person.findMany({ where: { displayName: { contains: RUN_ID } }, select: { id: true } })).map((p) => p.id);
  const cuentas = (await prisma.userAccount.findMany({ where: { personId: { in: personas } }, select: { id: true } })).map((c) => c.id);
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: cuentas } }) });
  await prisma.consumableMaterial.deleteMany({ where: assertDefinedWhere({ organizationId: { in: [organizationId, otraOrganizationId] } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: cuentas } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ scopeRefId: { in: [bodega, sitioAjeno] } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: [bodega, sitioAjeno] } }) });
  await deleteTestOrganizations(RUN_ID);
}, 30000);

describe("recibir un medicamento", () => {
  it("las opciones traen los sitios donde se puede recibir y los medicamentos de esa finca, con lo que les falta", async () => {
    const m = await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Oxálico ${RUN_ID}`, defaultUnit: "g", isVeterinaryMedicine: true, manufacturer: "Lab X" });
    await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Cal ${RUN_ID}`, defaultUnit: "saco" });
    const o = await opcionesDeRecepcion(gestorId, "medicamento");
    expect(o.sitios.find((s) => s.id === bodega)).toMatchObject({ puedeDefinirProducto: true });
    expect(o.sitios.map((s) => s.id)).not.toContain(sitioAjeno);
    const nombres = o.productos.map((p) => p.name);
    expect(nombres).toContain(`Oxálico ${RUN_ID}`);
    expect(nombres).not.toContain(`Cal ${RUN_ID}`); // la cal no es del botiquín
    const ox = o.productos.find((p) => p.id === m.id)!;
    expect(ox.faltan).toContain("defaultWithdrawalDays");
    expect(ox.faltan).not.toContain("manufacturer");
    // El operario recibe, pero no define productos.
    expect((await opcionesDeRecepcion(operarioId, "medicamento")).sitios.find((s) => s.id === bodega)).toMatchObject({ puedeDefinirProducto: false });
  }, 20000);

  it("completar rellena los huecos y NO sobrescribe lo declarado", async () => {
    const m = await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Apivar ${RUN_ID}`, defaultUnit: "tira", isVeterinaryMedicine: true, manufacturer: "Véto-pharma" });
    const d = await completarProducto(gestorId, {
      materialId: m.id, locationId: bodega,
      campos: { manufacturer: "Otro", defaultWithdrawalDays: 0, safetyNotes: "Guantes" },
    });
    expect(d.manufacturer).toBe("Véto-pharma");
    expect(d.defaultWithdrawalDays).toBe(0); // cero es una respuesta
    expect(d.safetyNotes).toBe("Guantes");
    const ev = await prisma.auditEvent.findFirst({ where: { entityType: "consumable_material", entityId: m.id, operation: "consumable_material.complete" } });
    expect(ev).not.toBeNull();
  }, 20000);

  it("quien no gestiona el sitio, o gestiona el de OTRA finca, no completa — y el control positivo", async () => {
    const m = await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Timol ${RUN_ID}`, defaultUnit: "g", isVeterinaryMedicine: true });
    await expect(completarProducto(operarioId, { materialId: m.id, locationId: bodega, campos: { safetyNotes: "x" } })).rejects.toThrow(MaterialAccessError);
    await expect(completarProducto(ajenoId, { materialId: m.id, locationId: sitioAjeno, campos: { safetyNotes: "x" } })).rejects.toThrow(MaterialAccessError);
    const ok = await completarProducto(gestorId, { materialId: m.id, locationId: bodega, campos: { safetyNotes: "x" } });
    expect(ok.safetyNotes).toBe("x");
  }, 20000);
});

/**
 * Recibir un producto fitosanitario — aplicaciones fitosanitarias, Tarea 4.
 * Gemela del describe de arriba: la reentrada sólo tiene sentido aquí.
 */
describe("recibir un producto fitosanitario", () => {
  it("la recepción de fitosanitarios ofrece sólo fitosanitarios, y pide la reentrada", async () => {
    await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Fito ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true });
    const o = await opcionesDeRecepcion(gestorId, "fitosanitario");
    expect(o.productos.every((p) => p.name.startsWith("Fito"))).toBe(true);
    expect(o.productos.length).toBeGreaterThan(0); // control: no es una lista vacía
    expect(camposDe("fitosanitario")).toContain("defaultReentryHours");
    expect(camposDe("medicamento")).not.toContain("defaultReentryHours");
  }, 20000);

  it("la de medicamentos no cambia: sigue sin enseñar fitosanitarios", async () => {
    // Control positivo: sin él, un filtro roto que devolviera la lista VACÍA
    // pasaría igual esta prueba — «no aparece Fito» también es cierto cuando
    // no aparece nada.
    const m = await crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Med ${RUN_ID}`, defaultUnit: "tira", isVeterinaryMedicine: true });
    const o = await opcionesDeRecepcion(gestorId, "medicamento");
    expect(o.productos.some((p) => p.name.startsWith("Fito"))).toBe(false);
    expect(o.productos.length).toBeGreaterThan(0);
    expect(o.productos.map((p) => p.id)).toContain(m.id);
  }, 20000);
});

/**
 * La dosis y el uso del producto — Daniel, 2026-09-30.
 *
 * Lo que hace estos casos necesarios y no adorno: una dosis NO es un entero. Hasta que se separaron
 * `CAMPOS_ENTEROS` de `CAMPOS_DECIMALES`, `completarProducto` la validaba con `Number.isInteger` y
 * habría rechazado «1,5 L/ha» —la forma típica— con un mensaje sobre negativos.
 */
describe("la dosis y el uso de un fitosanitario", () => {
  const fito = (n: string) =>
    crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Fito ${n} ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true });

  it("completa una dosis con decimales, y el uso y las plagas de una lista cerrada", async () => {
    const m = await fito("dosis");
    const despues = await completarProducto(gestorId, {
      materialId: m.id,
      locationId: bodega,
      campos: { doseMin: 1.5, doseMax: 2.25, doseUnit: "L/ha", plantProtectionUse: "control" },
      plantProtectionTargets: ["broca", "arana_roja"],
    });
    expect(Number(despues.doseMin)).toBe(1.5);
    expect(Number(despues.doseMax)).toBe(2.25);
    expect(despues.doseUnit).toBe("L/ha");
    expect(despues.plantProtectionUse).toBe("control");
    expect([...despues.plantProtectionTargets].sort()).toEqual(["arana_roja", "broca"]);
  }, 20000);

  it("rechaza una dosis de cero, un uso que no está en la lista, y el rango al revés", async () => {
    const m = await fito("malas");
    await expect(completarProducto(gestorId, { materialId: m.id, locationId: bodega, campos: { doseMin: 0 } })).rejects.toBeInstanceOf(
      MaterialValidationError,
    );
    await expect(
      completarProducto(gestorId, { materialId: m.id, locationId: bodega, campos: { plantProtectionUse: "cuando-toque" } }),
    ).rejects.toBeInstanceOf(MaterialValidationError);
    // El rango lo vigila la BASE, con su CHECK: un importador o un SQL directo tampoco lo saltan.
    await expect(
      completarProducto(gestorId, { materialId: m.id, locationId: bodega, campos: { doseMin: 5, doseMax: 1 } }),
    ).rejects.toThrow();
    // Control: nada de lo anterior se escribió a medias.
    const quedo = await prisma.consumableMaterial.findUniqueOrThrow({ where: { id: m.id } });
    expect(quedo.doseMin).toBeNull();
    expect(quedo.plantProtectionUse).toBeNull();
  }, 20000);

  it("las plagas son un hueco que se rellena una vez, no un campo que se reemplaza", async () => {
    const m = await crearMaterial(gestorId, {
      locationId: bodega,
      organizationId,
      name: `Fito declarado ${RUN_ID}`,
      defaultUnit: "l",
      isPlantProtection: true,
      plantProtectionTargets: ["broca"],
    });
    const despues = await completarProducto(gestorId, {
      materialId: m.id,
      locationId: bodega,
      campos: {},
      plantProtectionTargets: ["roya", "nematodos"],
    });
    expect(despues.plantProtectionTargets).toEqual(["broca"]);
    // Control positivo del mismo servicio: sobre uno SIN declarar, sí escribe.
    const vacio = await fito("sin-plagas");
    const lleno = await completarProducto(gestorId, {
      materialId: vacio.id,
      locationId: bodega,
      campos: {},
      plantProtectionTargets: ["roya"],
    });
    expect(lleno.plantProtectionTargets).toEqual(["roya"]);
  }, 20000);

  it("crearMaterial rechaza el rango al revés con una frase, no con un error de Postgres", async () => {
    await expect(
      crearMaterial(gestorId, {
        locationId: bodega,
        organizationId,
        name: `Fito rango ${RUN_ID}`,
        defaultUnit: "l",
        isPlantProtection: true,
        doseMin: 9,
        doseMax: 2,
      }),
    ).rejects.toBeInstanceOf(MaterialValidationError);
  }, 20000);
});

/**
 * ¿Daña polinizadores? — Daniel, 2026-10-01.
 *
 * **El hueco tiene que sobrevivir, y es toda la razón de que el campo sea de TRES valores.** Su
 * corrección fue que lo que su finca aplica «no debe afectar las abejas, no es químico»: cierto de
 * un repelente de ajo o de un hongo, falso de un fipronil. Así que el aviso no puede depender de
 * que haya floración —saltaría con el uso correcto, que es como se enseña a ignorar un aviso—:
 * depende de qué producto es. Y «sin responder» no puede volverse «no daña», porque eso sería
 * afirmar algo sobre un producto real que nadie afirmó.
 */
describe("¿daña polinizadores?", () => {
  const fito = (n: string) =>
    crearMaterial(gestorId, { locationId: bodega, organizationId, name: `Fito ${n} ${RUN_ID}`, defaultUnit: "l", isPlantProtection: true });

  it("un producto que no lo declara queda NULO, no en falso", async () => {
    const m = await fito("sin-declarar");
    // Es la distinción entera: `false` diría «no daña», y nadie lo dijo.
    expect(m.harmfulToPollinators).toBeNull();
  });

  it("se puede declarar que SÍ y que NO, y los dos se guardan", async () => {
    const si = await crearMaterial(gestorId, {
      locationId: bodega, organizationId, name: `Fito dana ${RUN_ID}`, defaultUnit: "l",
      isPlantProtection: true, harmfulToPollinators: true,
    });
    const no = await crearMaterial(gestorId, {
      locationId: bodega, organizationId, name: `Fito inocuo ${RUN_ID}`, defaultUnit: "l",
      isPlantProtection: true, harmfulToPollinators: false,
    });
    expect(si.harmfulToPollinators).toBe(true);
    expect(no.harmfulToPollinators).toBe(false);
  });

  it("completar lo rellena desde la lista cerrada, y traduce «si» al booleano", async () => {
    const m = await fito("completar");
    const despues = await completarProducto(gestorId, {
      materialId: m.id, locationId: bodega, campos: { harmfulToPollinators: "si" },
    });
    expect(despues.harmfulToPollinators).toBe(true);
  });

  it("rechaza un valor fuera de la lista en vez de dejarlo llegar a Postgres", async () => {
    const m = await fito("mal-valor");
    await expect(
      completarProducto(gestorId, { materialId: m.id, locationId: bodega, campos: { harmfulToPollinators: "quiza" } }),
    ).rejects.toBeInstanceOf(MaterialValidationError);
    // Control: nada se escribió a medias.
    const quedo = await prisma.consumableMaterial.findUniqueOrThrow({ where: { id: m.id } });
    expect(quedo.harmfulToPollinators).toBeNull();
  });

  it("y un medicamento de colmena NO lo pregunta: es un campo de fitosanitario", async () => {
    expect(camposDe("fitosanitario")).toContain("harmfulToPollinators");
    expect(camposDe("medicamento")).not.toContain("harmfulToPollinators");
  });
});
