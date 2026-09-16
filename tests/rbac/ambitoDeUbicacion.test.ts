/**
 * Un ámbito de ubicación alcanza a sus DESCENDIENTES, y **sólo** a ellos.
 *
 * **Decisión de Daniel, 2026-09-16.** El caso que la obligó: el árbol de secado es
 * sitio → instalación → cama, y un operario con ámbito sobre la finca podía crear
 * el invernadero —cuyo padre es el sitio— pero **no las camas de dentro**, porque
 * el guardia comprueba contra el padre directo. Medido antes de cambiar nada:
 * ámbito en el sitio daba `true` sobre el sitio y `false` sobre su hija.
 *
 * **Este archivo existe por la mitad negativa.** Ensanchar una autorización sin
 * fijar dónde termina es como se abren agujeros: lo que importa no es que la nieta
 * alcance, es que el HERMANO no. Si algún día alguien sustituye la subida por la
 * cadena por algo más simple —«cualquier ubicación de la misma organización», por
 * ejemplo— estas pruebas tienen que caer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/db";
import { can } from "../../lib/rbac/service";

const marca = `TEST-AMB-${randomUUID()}`;
const locationIds: string[] = [];
let sitioId: string;
let hermanoId: string;
let instalacionId: string;
let camaId: string;
let actorId: string;
let personId: string;
let scopeId: string;

async function ubicacion(locationType: "site" | "drying_facility" | "drying_bed", parentLocationId?: string) {
  const row = await prisma.location.create({
    data: { name: `${marca}-${locationIds.length}`, locationType, parentLocationId: parentLocationId ?? null, classification: "internal" },
  });
  locationIds.push(row.id);
  return row.id;
}

beforeAll(async () => {
  sitioId = await ubicacion("site");
  hermanoId = await ubicacion("site");                 // otra finca, fuera del ámbito
  instalacionId = await ubicacion("drying_facility", sitioId);
  camaId = await ubicacion("drying_bed", instalacionId); // nieta del sitio

  const person = await prisma.person.create({ data: { givenName: "TEST", familyName: "Ambito", displayName: marca } });
  personId = person.id;
  const cuenta = await prisma.userAccount.create({ data: { personId, status: "active", authProvider: "credentials" } });
  actorId = cuenta.id;
  const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: sitioId } });
  scopeId = scope.id;
  await prisma.assignment.create({ data: { userAccountId: actorId, scopeId, roleProfileId: profile.id } });
});

afterAll(async () => {
  await prisma.assignment.deleteMany({ where: { userAccountId: actorId } });
  await prisma.scope.deleteMany({ where: { id: scopeId } });
  await prisma.userAccount.deleteMany({ where: { id: actorId } });
  await prisma.person.deleteMany({ where: { id: personId } });
  // Hijas antes que padres: `parentLocationId` lo impide al revés.
  for (const id of [...locationIds].reverse()) await prisma.location.deleteMany({ where: { id } });
});

const puede = (locationId: string) =>
  can(actorId, "manage_attributes", "location", { scopeType: "location", scopeRefId: locationId }, "internal");

describe("un ámbito de ubicación baja por el árbol, y no salta a los lados", () => {
  it("alcanza la propia ubicación del ámbito", async () => {
    expect(await puede(sitioId)).toBe(true);
  });

  it("alcanza a la hija", async () => {
    expect(await puede(instalacionId)).toBe(true);
  });

  it("alcanza a la nieta — el caso que obligó al cambio", async () => {
    // La cama dentro del invernadero dentro de la finca. Sin esto, cada
    // instalación construida exigía una asignación a mano, y en la práctica las
    // camas sólo las habría creado un administrador de plataforma.
    expect(await puede(camaId)).toBe(true);
  });

  it("NO alcanza a un HERMANO, y ésta es la mitad que importa", async () => {
    // Otra finca, al mismo nivel. Si esto pasara a `true`, el cambio habría
    // ensanchado el permiso en vez de reconocer la contención.
    expect(await puede(hermanoId)).toBe(false);
  });

  it("no baja: quien manda en la cama NO manda en la finca", async () => {
    // Control de dirección. La contención es de arriba abajo; al revés sería
    // conceder a un operario de una cama el gobierno de todo el sitio.
    const p2 = await prisma.person.create({ data: { givenName: "TEST", familyName: "AmbitoCama", displayName: `${marca}-cama` } });
    const c2 = await prisma.userAccount.create({ data: { personId: p2.id, status: "active", authProvider: "credentials" } });
    const profile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const s2 = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: camaId } });
    const a2 = await prisma.assignment.create({ data: { userAccountId: c2.id, scopeId: s2.id, roleProfileId: profile.id } });
    try {
      expect(await can(c2.id, "manage_attributes", "location", { scopeType: "location", scopeRefId: camaId }, "internal")).toBe(true);
      expect(await can(c2.id, "manage_attributes", "location", { scopeType: "location", scopeRefId: sitioId }, "internal")).toBe(false);
    } finally {
      await prisma.assignment.deleteMany({ where: { id: a2.id } });
      await prisma.scope.deleteMany({ where: { id: s2.id } });
      await prisma.userAccount.deleteMany({ where: { id: c2.id } });
      await prisma.person.deleteMany({ where: { id: p2.id } });
    }
  });
});
