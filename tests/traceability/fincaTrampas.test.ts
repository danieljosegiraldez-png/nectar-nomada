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
import { FincaTrapAccessError, getFincaTrampas, puedeVerTrampasDeFinca } from "../../lib/traceability/fincaTrampas";
import { createTrap } from "../../lib/traceability/traps";
import { createMicrolot } from "../../lib/traceability/locations";
import { prisma } from "../../lib/db";
import { permissionKeysAnywhere } from "../../lib/rbac/service";
import { crearFinca, crearParcela, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

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
  // El ámbito de plataforma es COMPARTIDO desde el 2026-09-27 y no se borra: ver
  // `tests/helpers/ambitoDePlataforma.ts`.
  await prisma.scope.deleteMany({ where: assertDefinedWhere({ id: { in: scopeIds }, scopeType: { not: "platform" as const } }) });
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
    expect(resultado.plots).toEqual([{ id: parcelaA.id, name: parcelaA.name, parentPlotId: null }]);
  });

  /**
   * Revisión del merge, hallazgo 4: una microparcela (spec fincas y parcelas
   * §3.3) es una Location `plot` cuyo padre es OTRA `plot`, creada con
   * `createMicrolot` — así que es NIETA del sitio de la finca, no hija
   * directa. La consulta anterior filtraba por `parentLocationId: sitio.id`,
   * que sólo alcanza hijos; una trampa instalada en una microparcela así no
   * aparecía ni en `/finca/trampas` ni en la ronda. Este test crea la
   * microparcela con `createMicrolot` (el camino real) y comprueba que su
   * trampa SÍ aparece — `idsBajoLaFinca` camina el árbol a cualquier
   * profundidad, así que la nieta entra igual que la hija.
   */
  it("una trampa en una microparcela (nieta del sitio, creada con createMicrolot) aparece en getFincaTrampas", async () => {
    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);

    const parcela = await crearParcela(finca);
    locationIds.push(parcela.id);

    // Un scope en la parcela alcanza a sus descendientes (decisión de Daniel
    // 2026-09-16, ver el comentario de `getFincaTrampas`), así que el
    // mismo Farm Operator crea la microparcela (exige manage_attributes
    // sobre la parcela) y después la trampa sobre ella (exige specimen
    // sobre la microparcela, heredado).
    const operador = await crearUsuarioConAccesoAlLote(parcela.id);
    userAccountIds.push(operador.userAccountId);
    personIds.push(operador.personId);
    scopeIds.push(operador.scopeId);

    const microparcela = await createMicrolot(operador.userAccountId, {
      parentLocationId: parcela.id,
      name: `TEST Microparcela (${Date.now()})`,
      subdivisionReason: "altitude",
    });
    locationIds.push(microparcela.id);
    // El camino real produce `plot`, nunca `micro_plot` — afirmarlo, no sólo
    // asumirlo (mismo hallazgo que en plotBlocks.test.ts).
    expect(microparcela.locationType).toBe("plot");
    expect(microparcela.parentLocationId).toBe(parcela.id);

    const trampa = await createTrap(operador.userAccountId, {
      locationId: microparcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });

    const resultado = await getFincaTrampas(operador.userAccountId, finca.id);
    expect(resultado.trampas.map((t) => t.id)).toEqual([trampa.id]);
    expect(resultado.trampas[0]!.plotId).toBe(microparcela.id);
    // `plots` lista todo lote accesible, no sólo los que tienen trampa: el
    // scope del operador está en la parcela y alcanza a su descendiente, así
    // que las dos son accesibles. Lo que este test afirma es que la
    // microparcela SÍ está — antes de este arreglo, no lo estaba.
    expect(resultado.plots.map((p) => p.id).sort()).toEqual([microparcela.id, parcela.id].sort());
    // La microparcela dice de qué parcela cuelga, y la parcela no cuelga de otro lote: con esto la
    // pantalla anida la una dentro de la otra en vez de listarlas como dos parcelas (Daniel, 2026-09-21).
    expect(resultado.plots.find((p) => p.id === microparcela.id)?.parentPlotId).toBe(parcela.id);
    expect(resultado.plots.find((p) => p.id === parcela.id)?.parentPlotId).toBeNull();
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
