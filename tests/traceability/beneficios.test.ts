import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";
import * as audit from "../../lib/audit";
import { BeneficioError, actualizarBeneficio, crearBeneficio, listarBeneficios, sitiosParaBeneficio } from "../../lib/traceability/beneficios";
import { LocationAccessError, puedeGestionarAtributosDeUbicacion } from "../../lib/traceability/locations";

describe("el tipo de ubicación beneficio", () => {
  it("existe en el enum de Postgres, y el control positivo es meliponary", async () => {
    const filas = await prisma.$queryRaw<{ valor: string }[]>`
      SELECT e.enumlabel AS valor
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'LocationType' AND n.nspname = 'core'
    `;
    const valores = filas.map((f) => f.valor);
    // Control positivo: si la consulta no ve el enum, esto también falla y el
    // veredicto de arriba no se lee como «el tipo falta».
    expect(valores).toContain("meliponary");
    expect(valores).toContain("beneficio");
  });
});

describe("el permiso de crear un sitio", () => {
  it("está en el catálogo", () => {
    expect(PERMISSIONS.some((p) => p.resourceType === "location" && p.action === "create_site")).toBe(true);
  });

  it("lo tiene Farm Manager y NO lo tiene Farm Operator", () => {
    const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre)!;
    const tiene = (nombre: string) =>
      perfil(nombre).permissions.some(([r, a]) => r === "location" && a === "create_site");
    expect(tiene("Farm Manager")).toBe(true);
    expect(tiene("Farm Operator")).toBe(false);
    // Control positivo del mismo lector: un permiso que el operario SÍ tiene.
    expect(perfil("Farm Operator").permissions.some(([r, a]) => r === "lot" && a === "manage")).toBe(true);
  });
});

const names: string[] = [];
const accountIds: string[] = [];
const personIds: string[] = [];
const scopeIds: string[] = [];
function nombre() { const n = `TEST-BEN-${randomUUID()}`; names.push(n); return n; }

async function sitio() {
  return prisma.location.create({ data: { name: nombre(), locationType: "site", classification: "internal" } });
}
async function parcela(parentLocationId: string) {
  return prisma.location.create({ data: { name: nombre(), locationType: "plot", classification: "internal", parentLocationId } });
}
async function cuenta(locationId: string | null, perfil: "Farm Manager" | "Farm Operator") {
  const personId = randomUUID();
  await prisma.person.create({ data: { id: personId, givenName: "TEST", familyName: "Beneficio", displayName: personId } });
  personIds.push(personId);
  const userAccountId = randomUUID();
  await prisma.userAccount.create({ data: { id: userAccountId, personId, status: "active", authProvider: "credentials" } });
  accountIds.push(userAccountId);
  if (locationId) {
    const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
    // `Scope` es único por (tipo, referencia): dos cuentas sobre el MISMO sitio
    // lo comparten, y crearlo a ciegas rompe la prueba que necesita dos actores
    // sobre el mismo sitio. El `id` se pasa explícito, como en instalaciones.test.ts.
    const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
    const scope = existente ?? await prisma.scope.create({ data: { id: randomUUID(), scopeType: "location", scopeRefId: locationId } });
    // Sólo se borra el que ESTA corrida creó: uno ya existente lo comparte otro
    // actor sobre el mismo sitio, y borrarlo se lo llevaría por delante.
    if (!existente) scopeIds.push(scope.id);
    await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  }
  return userAccountId;
}

afterEach(async () => {
  vi.restoreAllMocks();
  const rows = await prisma.location.findMany({ where: { name: { in: names } }, select: { id: true } });
  const ids = rows.map((r) => r.id);
  await prisma.auditEvent.deleteMany({ where: { entityType: "location", entityId: { in: ids } } });
  // Los hijos primero: no porque parentLocationId sea RESTRICT (no lo es, es
  // SET NULL — prisma/migrations/20260810002142_foundational_entities/
  // migration.sql:150), sino para que un hijo no sobreviva con el padre en
  // null, que es una fila huérfana que ninguna limpieza por nombre encuentra.
  await prisma.location.deleteMany({ where: { parentLocationId: { in: ids } } });
  await prisma.location.deleteMany({ where: { id: { in: ids } } });
  // Lo que crea `cuenta()`, en orden seguro para las FK: Assignment antes que
  // Scope y UserAccount, Scope antes que... nada más lo referencia aquí, y
  // UserAccount antes que Person.
  await prisma.assignment.deleteMany({ where: { userAccountId: { in: accountIds } } });
  await prisma.scope.deleteMany({ where: { id: { in: scopeIds } } });
  await prisma.userAccount.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  names.length = 0;
  accountIds.length = 0;
  personIds.length = 0;
  scopeIds.length = 0;
});

describe("crearBeneficio", () => {
  it("un Farm Manager lo crea bajo el sitio que gestiona", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    expect(ben.locationType).toBe("beneficio");
    expect(ben.parentLocationId).toBe(finca.id);
    expect(ben.organizationId).toBe(finca.organizationId);
    expect(ben.classification).toBe(finca.classification);
  });

  it("un capataz NO puede, aunque gestione el sitio", async () => {
    const finca = await sitio();
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(crearBeneficio(capataz, { name: nombre(), parentLocationId: finca.id }))
      .rejects.toThrow(LocationAccessError);
    // **Control positivo de verdad:** el capataz SÍ gestiona los atributos de
    // ese sitio. Sin esta línea, la negativa de arriba se cumpliría igual con un
    // capataz que no tiene acceso a NADA, y no probaría que lo que falta es el
    // permiso nuevo. (La primera versión de este plan ponía aquí una segunda
    // aserción negativa y la llamaba control positivo.)
    expect(await puedeGestionarAtributosDeUbicacion(capataz, finca.id)).toBe(true);
    // Y con eso, que no se le ofrezca ningún sitio donde crear es la consecuencia.
    await expect(sitiosParaBeneficio(capataz)).rejects.toThrow(LocationAccessError);
  });

  it("un Farm Manager de otra finca NO puede crear aquí", async () => {
    const mia = await sitio();
    const ajena = await sitio();
    const jefeAjeno = await cuenta(ajena.id, "Farm Manager");
    await expect(crearBeneficio(jefeAjeno, { name: nombre(), parentLocationId: mia.id }))
      .rejects.toThrow(LocationAccessError);
    // Control positivo: en SU finca sí puede.
    const suyo = await crearBeneficio(jefeAjeno, { name: nombre(), parentLocationId: ajena.id });
    expect(suyo.locationType).toBe("beneficio");
  });

  it("rechaza un sitio padre que no existe, y no es un error de Prisma", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearBeneficio(jefe, { name: nombre(), parentLocationId: randomUUID() }))
      .rejects.toThrow(LocationAccessError);
    // Control positivo: el mismo jefe, bajo su sitio REAL, sí puede.
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    expect(ben.locationType).toBe("beneficio");
  });

  it("no cuelga de una parcela", async () => {
    const finca = await sitio();
    const lote = await parcela(finca.id);
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearBeneficio(jefe, { name: nombre(), parentLocationId: lote.id }))
      .rejects.toThrow(new BeneficioError("padre_invalido"));
  });

  it("rechaza un nombre vacío o de más de 120 caracteres", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    await expect(crearBeneficio(jefe, { name: "   ", parentLocationId: finca.id }))
      .rejects.toThrow(new BeneficioError("datos_invalidos"));
    await expect(crearBeneficio(jefe, { name: "x".repeat(121), parentLocationId: finca.id }))
      .rejects.toThrow(new BeneficioError("datos_invalidos"));
  });

  it("escribe la auditoría en la MISMA transacción: si falla, no queda beneficio", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const n = nombre();
    vi.spyOn(audit, "recordAuditEvent").mockRejectedValueOnce(new Error("auditoría caída"));
    await expect(crearBeneficio(jefe, { name: n, parentLocationId: finca.id })).rejects.toThrow("auditoría caída");
    expect(await prisma.location.findFirst({ where: { name: n } })).toBeNull();
  });
});

describe("actualizarBeneficio", () => {
  it("renombra, y no acepta una ubicación que no es beneficio", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    const nuevo = nombre();
    expect((await actualizarBeneficio(jefe, { locationId: ben.id, name: nuevo })).name).toBe(nuevo);
    await expect(actualizarBeneficio(jefe, { locationId: finca.id, name: nombre() }))
      .rejects.toThrow(new BeneficioError("tipo_invalido"));
  });

  it("un capataz asignado en el sitio NO puede renombrar un beneficio", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    const capataz = await cuenta(finca.id, "Farm Operator");
    await expect(actualizarBeneficio(capataz, { locationId: ben.id, name: nombre() }))
      .rejects.toThrow(LocationAccessError);
    // Control positivo de verdad: el capataz SÍ gestiona los atributos de ESTE
    // beneficio (`manage_attributes` sube por ancestros desde su asignación en
    // el sitio). Sin esta línea, el rechazo de arriba se cumpliría igual con un
    // capataz sin ningún acceso, y no probaría que lo que falta es
    // `create_site` y no todo el acceso.
    expect(await puedeGestionarAtributosDeUbicacion(capataz, ben.id)).toBe(true);
  });
});

describe("listarBeneficios", () => {
  it("devuelve los del sitio con su sitio padre", async () => {
    const finca = await sitio();
    const jefe = await cuenta(finca.id, "Farm Manager");
    const ben = await crearBeneficio(jefe, { name: nombre(), parentLocationId: finca.id });
    const lista = await listarBeneficios(jefe);
    const fila = lista.find((b) => b.id === ben.id)!;
    expect(fila.sitio).toEqual({ id: finca.id, name: finca.name });
  });
});
