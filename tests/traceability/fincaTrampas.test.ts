/**
 * Lectura de las trampas de toda la finca (Tarea 7, vistas de finca y parcela).
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 *
 * A propósito **no** usa `crearUsuarioConAcceso()` (Platform Admin de ámbito
 * `platform`): esa cuenta ve la base compartida entera, y un recuento exacto de
 * trampas sobre ella queda a merced de lo que otro archivo tenga vivo en ese
 * instante (CLAUDE.md, «Un admin de plataforma ve la base compartida entera»).
 * En su lugar, `crearUsuarioConAccesoAlLote` da un Farm Operator escopado a UN
 * lote concreto — el mismo perfil que ya usa `crearUsuarioSinAcceso`, pero
 * apuntando al lote que la prueba sí quiere que vea.
 */
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  elegirFincaDeTrampas,
  FincaTrapAccessError,
  getFincasConTrampas,
  getFincaTrampas,
  puedeVerTrampasDeFinca,
} from "../../lib/traceability/fincaTrampas";
import { createTrap } from "../../lib/traceability/traps";
import { prisma } from "../../lib/db";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { crearFinca, crearParcela, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

/**
 * La elección de finca que comparten `/finca/trampas` y `/finca/trampas/ronda`
 * (Tarea 9) — pura, sin base. Vive en este archivo por estar junto a las demás
 * pruebas de `fincaTrampas.ts`, aunque no necesite `afterEach`.
 */
describe("elegirFincaDeTrampas", () => {
  const FINCAS = [{ id: "f1", name: "Uno" }, { id: "f2", name: "Dos" }];

  it("con una sola finca accesible, entra directo sin necesitar ?finca=", () => {
    expect(elegirFincaDeTrampas([FINCAS[0]!], undefined)).toBe("f1");
  });

  it("con varias y sin ?finca=, no elige ninguna: hace falta el selector", () => {
    expect(elegirFincaDeTrampas(FINCAS, undefined)).toBeNull();
  });

  it("?finca= manda, incluso con una sola finca accesible", () => {
    expect(elegirFincaDeTrampas([FINCAS[0]!], "f2")).toBe("f2");
  });
});

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
  await prisma.specimenObservation.deleteMany({ where: assertDefinedWhere({ specimen: { locationId: { in: locationIds } } }) });
  await prisma.specimen.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
  await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId: { in: userAccountIds } }) });
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds } }) });
  await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: { in: userAccountIds } }) });
  await prisma.person.deleteMany({ where: assertDefinedWhere({ id: { in: personIds } }) });
  await prisma.location.deleteMany({ where: assertDefinedWhere({ id: { in: locationIds } }) });
  await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: { in: organizationIds } }) });
  userAccountIds = [];
  personIds = [];
  scopeIds = [];
  locationIds = [];
  organizationIds = [];
});

/** Farm Operator escopado a UNA location concreta — igual que `crearUsuarioSinAcceso`, pero al lote que la prueba sí quiere que vea. */
async function crearUsuarioConAccesoAlLote(locationId: string) {
  const persona = await prisma.person.create({
    data: { givenName: "TEST", familyName: "LoteA", displayName: `TEST LoteA (${Date.now()}-${Math.random()})`, locale: "es" },
  });
  const cuenta = await prisma.userAccount.create({
    data: { personId: persona.id, authProvider: "credentials", status: "active" },
  });
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
  const scope = await prisma.scope.create({ data: { scopeType: "location", scopeRefId: locationId } });
  await prisma.assignment.create({
    data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id },
  });
  return { userAccountId: cuenta.id, personId: persona.id, scopeId: scope.id };
}

describe("getFincaTrampas", () => {
  it("lista sólo las trampas de los lotes que la persona puede ver", async () => {
    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);

    const parcelaA = await crearParcela(finca);
    const parcelaB = await crearParcela(finca);
    locationIds.push(parcelaA.id, parcelaB.id);

    const usuarioAcceso = await crearUsuarioConAccesoAlLote(parcelaA.id);
    userAccountIds.push(usuarioAcceso.userAccountId);
    personIds.push(usuarioAcceso.personId);
    scopeIds.push(usuarioAcceso.scopeId);

    const trampaA = await createTrap(usuarioAcceso.userAccountId, {
      locationId: parcelaA.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    // La trampa de la parcela B la crea la propia cuenta con acceso ahí, para
    // que exista de verdad antes de comprobar que no aparece — nunca ausencia
    // sobre contenido ausente.
    const usuarioB = await crearUsuarioConAccesoAlLote(parcelaB.id);
    userAccountIds.push(usuarioB.userAccountId);
    personIds.push(usuarioB.personId);
    scopeIds.push(usuarioB.scopeId);
    await createTrap(usuarioB.userAccountId, {
      locationId: parcelaB.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });

    const resultado = await getFincaTrampas(usuarioAcceso.userAccountId, finca.id);
    expect(resultado.trampas.map((t) => t.plotId)).toEqual([parcelaA.id]);
    expect(resultado.trampas).toHaveLength(1);
    expect(resultado.trampas[0]!.id).toBe(trampaA.id);
    expect(resultado.plots).toEqual([{ id: parcelaA.id, name: parcelaA.name }]);
  });

  it("deniega sin ningún acceso de specimen en la finca", async () => {
    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);
    const parcelaA = await crearParcela(finca);
    locationIds.push(parcelaA.id);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(getFincaTrampas(ajeno.userAccountId, finca.id)).rejects.toThrow(FincaTrapAccessError);
  });
});

describe("getFincasConTrampas", () => {
  it("sólo devuelve fincas con al menos un lote accesible", async () => {
    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);
    const parcelaA = await crearParcela(finca);
    locationIds.push(parcelaA.id);

    const usuarioAcceso = await crearUsuarioConAccesoAlLote(parcelaA.id);
    userAccountIds.push(usuarioAcceso.userAccountId);
    personIds.push(usuarioAcceso.personId);
    scopeIds.push(usuarioAcceso.scopeId);

    const fincas = await getFincasConTrampas(usuarioAcceso.userAccountId);
    expect(fincas.map((f) => f.id)).toContain(finca.id);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    const ninguna = await getFincasConTrampas(ajeno.userAccountId);
    expect(ninguna).toEqual([]);
  });
});

/**
 * La visibilidad del destino «Trampas» en `/finca` — Fix round 1, Tarea 8.
 *
 * A propósito **no** usa Platform Admin para el caso negativo: esa cuenta
 * tiene `specimen:view` de fábrica (CLAUDE.md, «Un admin de plataforma ve la
 * base compartida entera»), así que probaría lo contrario de lo que el nombre
 * del test dice. `Sensory Judge` es el perfil real sin ningún permiso de
 * `specimen` (`lib/rbac/catalog.ts`), scopeado a una sesión — el scope no
 * necesita existir de verdad porque `permissionKeysAnywhere` sólo resuelve
 * permisos, nunca visibilidad de una fila concreta.
 */
describe("puedeVerTrampasDeFinca — visibilidad del destino en /finca", () => {
  it("un Farm Operator con acceso a un lote SÍ ve el destino", async () => {
    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);
    const parcela = await crearParcela(finca);
    locationIds.push(parcela.id);

    const usuario = await crearUsuarioConAccesoAlLote(parcela.id);
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);

    const granted = await permissionKeysAnywhere(usuario.userAccountId);
    expect(puedeVerTrampasDeFinca(granted)).toBe(true);
  });

  it("un Sensory Judge, sin ningún permiso de specimen, NO ve el destino", async () => {
    const persona = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Juez", displayName: `TEST Juez (${Date.now()}-${Math.random()})`, locale: "es" },
    });
    personIds.push(persona.id);
    const cuenta = await prisma.userAccount.create({
      data: { personId: persona.id, authProvider: "credentials", status: "active" },
    });
    userAccountIds.push(cuenta.id);
    const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Sensory Judge" } });
    const scope = await prisma.scope.create({ data: { scopeType: "session", scopeRefId: randomUUID() } });
    scopeIds.push(scope.id);
    await prisma.assignment.create({ data: { userAccountId: cuenta.id, roleProfileId: perfil.id, scopeId: scope.id } });

    const granted = await permissionKeysAnywhere(cuenta.id);
    expect(puedeVerTrampasDeFinca(granted)).toBe(false);
  });
});
