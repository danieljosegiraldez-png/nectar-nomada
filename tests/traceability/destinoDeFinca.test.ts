/**
 * El destino de la cereza de una finca.
 *
 * Diseño: `docs/superpowers/specs/2026-09-30-destino-de-cereza-por-finca-design.md`. Decisión que
 * lo origina: **ADR-194** — «el cosechador no tiene que definir a quién le entrega; sólo entrega y
 * pesa». La finca lo declara **una vez** y la jornada lo **copia**.
 *
 * Grupo `base-sembrada`: necesita base, así que va en `scripts/pruebas-por-compuerta.txt`.
 *
 * **El usuario va acotado a SU sitio, nunca Platform Admin.** Con ámbito de plataforma la
 * visibilidad de lotes es `all` y los recuentos se vuelven aleatorios según lo que otras sesiones
 * tengan vivo en la base compartida — eso costó tres fallos intermitentes el 2026-09-17.
 *
 * **La base compartida del 55433 NO se resetea.** Esta prueba crea lo suyo con la etiqueta `RUN` y
 * lo borra envolviendo CADA paso en su propio `try`: un `afterAll` es una cadena, y el 2026-09-30
 * el primer borrado que lanzó abandonó los nueve siguientes y dejó 22 filas TEST con la suite en
 * verde.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";
import { listarFincas } from "../../lib/traceability/fincas";

const RUN = `dst-${Date.now()}`;
const nombre = (etiqueta: string) => `TEST ${etiqueta} (${RUN})`;

const personas: string[] = [];
const cuentas: string[] = [];
const scopes: string[] = [];
const asignaciones: string[] = [];
const organizaciones: string[] = [];
const ubicaciones: string[] = [];

let gestor: string;
let orgA: string;
let fincaA: string;
let beneficioA: string;

async function cuenta(etiqueta: string) {
  const person = await prisma.person.create({
    data: { givenName: "TEST", familyName: etiqueta, displayName: nombre(etiqueta) },
  });
  personas.push(person.id);
  const account = await prisma.userAccount.create({
    data: { personId: person.id, authProvider: "credentials", status: "active" },
  });
  cuentas.push(account.id);
  return account.id;
}

async function asignar(userAccountId: string, perfil: string, locationId: string) {
  const roleProfile = await prisma.roleProfile.findUniqueOrThrow({ where: { name: perfil } });
  const existente = await prisma.scope.findFirst({ where: { scopeType: "location", scopeRefId: locationId } });
  const scope = existente ?? (await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } }));
  if (!existente) scopes.push(scope.id);
  const a = await prisma.assignment.create({ data: { userAccountId, scopeId: scope.id, roleProfileId: roleProfile.id } });
  asignaciones.push(a.id);
}

beforeAll(async () => {
  const org = await prisma.organization.create({
    data: { organizationType: "farm", name: nombre("Finca A"), status: "approved", classification: "internal" },
  });
  organizaciones.push(org.id);
  orgA = org.id;

  const site = await prisma.location.create({
    data: {
      name: nombre("Sitio A"),
      locationType: "site",
      classification: "internal",
      status: "approved",
      organizationId: org.id,
    },
  });
  ubicaciones.push(site.id);
  fincaA = site.id;

  const ben = await prisma.location.create({
    data: {
      name: nombre("Beneficio A"),
      locationType: "beneficio",
      classification: "internal",
      status: "approved",
      organizationId: org.id,
      parentLocationId: site.id,
    },
  });
  ubicaciones.push(ben.id);
  beneficioA = ben.id;

  gestor = await cuenta("gestor");
  // Farm Manager de SU sitio. Nunca Platform Admin: ver la cabecera.
  await asignar(gestor, "Farm Manager", site.id);
});

afterAll(async () => {
  const pasos: [string, () => Promise<unknown>][] = [
    ["assignment", () => prisma.assignment.deleteMany({ where: assertDefinedWhere({ id: { in: asignaciones } }) })],
    ["scope", () => prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopes } }) })],
    ["location", () => prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: ubicaciones } }) })],
    ["organization", () => prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizaciones } }) })],
    ["userAccount", () => prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: cuentas } }) })],
    ["person", () => prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personas } }) })],
  ];
  const fallos: string[] = [];
  for (const [n, fn] of pasos) {
    try {
      await fn();
    } catch (e) {
      fallos.push(`${n}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  // `process.stdout.write` y no `console.log`: vitest intercepta la consola y sólo la saca para
  // las pruebas que FALLAN, así que un aviso de fuga en una corrida verde no se vería nunca.
  if (fallos.length > 0) process.stdout.write(`\n[FUGA] la limpieza de ${RUN} dejó filas: ${fallos.join(" | ")}\n`);
});

describe("el destino de una finca", () => {
  /**
   * `null` **no es un hueco**: una finca cuya cereza se compra y se traslada —Jaramillo,
   * Artillería— no lleva destino, y entra por el camino del proveedor. Un `NOT NULL` obligaría a
   * inventarle uno.
   */
  it("una finca sin destino declarado lo dice con null, no con un hueco", async () => {
    const finca = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(finca).toBeDefined();
    expect(finca!.beneficioDestino).toBeNull();
  });

  it("con el destino puesto, lo devuelve con su nombre", async () => {
    await prisma.location.update({ where: { id: fincaA }, data: { beneficioDestinoId: beneficioA } });
    const finca = (await listarFincas(gestor)).find((f) => f.siteId === fincaA);
    expect(finca!.beneficioDestino).toEqual({ id: beneficioA, name: nombre("Beneficio A") });
    // Se deja como estaba para no acoplar esta prueba con las que vengan después.
    await prisma.location.update({ where: { id: fincaA }, data: { beneficioDestinoId: null } });
  });
});
