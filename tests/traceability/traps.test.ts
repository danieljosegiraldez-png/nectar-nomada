/**
 * Alta de trampa con número correlativo por finca.
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 * Cada `it` crea su propio usuario y parcela con los helpers de
 * `tests/helpers/traceability.ts`, y encola sus ids en los arreglos de este
 * archivo; la limpieza corre en `afterEach` — nunca al final del cuerpo del
 * `it` — para que una aserción fallida no salte el borrado (ver la nota de
 * `polinizacion.test.ts` en CLAUDE.md sobre limpiezas que no llegan a correr).
 *
 * `crearParcela()` (tests/helpers/traceability.ts) cuelga la parcela de una
 * finca de VERDAD: crea (o reutiliza) una `Location` de tipo `site` y hace
 * `parentLocationId` de la parcela apuntar a ella — la misma jerarquía que
 * `tests/traceability/lots.test.ts` usa para sitio→parcela. Cada llamada a
 * `crearParcela()` sin argumento crea su PROPIA finca nueva (dos parcelas de
 * llamadas distintas NO comparten finca); para compartirla hay que pasar la
 * misma finca (de `crearFinca()`) a las dos llamadas — así se prueba en
 * "sigue la numeración de la finca aunque la parcela sea otra", con dos
 * parcelas HERMANAS bajo la misma finca, sin construir nada a mano con
 * `prisma.location.create`.
 *
 * Como `crearParcela()` crea dos filas de `Location` por llamada (la finca Y
 * la parcela) cuando no se le pasa una finca existente, cada `it` que la usa
 * sin argumento encola AMBOS ids —`parcela.id` y `parcela.parentLocationId`—
 * en `locationIds`, o la finca queda huérfana tras el `afterEach`.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createTrap, TrapAccessError, TrapValidationError } from "../../lib/traceability/traps";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela, crearFinca, crearUsuarioSinAcceso } from "../helpers/traceability";
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
  await prisma.plotBlock.deleteMany({ where: assertDefinedWhere({ locationId: { in: locationIds } }) });
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

describe("alta de trampa", () => {
  it("numera correlativo por finca, empezando en 1", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    // La parcela cuelga de una finca (Location de tipo site) que NO es ella
    // misma — si esto no se cumple, la aserción de abajo sobre
    // `farmLocationId` no estaría probando la jerarquía real.
    expect(parcela.parentLocationId).not.toBeNull();
    expect(parcela.parentLocationId).not.toBe(parcela.id);

    const a = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    const b = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-01"), provenanceClass: "direct_observation",
    });
    expect(a.trapNumber).toBe(1);
    expect(b.trapNumber).toBe(2);
    expect(a.farmLocationId).toBe(parcela.parentLocationId);
  });

  it("sigue la numeración de la finca aunque la parcela sea otra", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const finca = await crearFinca();
    locationIds.push(finca.id);
    organizationIds.push(finca.organizationId!);

    // Dos parcelas HERMANAS bajo la misma finca, las dos con el helper —
    // nada de `prisma.location.create` a mano.
    const uno = await crearParcela(finca);
    const otra = await crearParcela(finca);
    locationIds.push(uno.id, otra.id);

    await createTrap(userAccountId, { locationId: uno.id, installedAt: new Date(), provenanceClass: "direct_observation" });
    const segunda = await createTrap(userAccountId, { locationId: otra.id, installedAt: new Date(), provenanceClass: "direct_observation" });
    expect(segunda.trapNumber).toBe(2);
    expect(segunda.farmLocationId).toBe(finca.id);
  });

  it("deja la trampa activa y con su observación de instalación", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const trampa = await createTrap(userAccountId, {
      locationId: parcela.id, installedAt: new Date("2026-09-02"), provenanceClass: "direct_observation",
    });
    expect(trampa.status).toBe("active");
    const instalacion = await prisma.specimenObservation.findFirst({
      where: { specimenId: trampa.id, observationType: "installed" },
    });
    expect(instalacion).not.toBeNull();
  });

  it("rechaza una fecha de instalación en el futuro", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const manana = new Date(Date.now() + 86_400_000);
    await expect(createTrap(userAccountId, {
      locationId: parcela.id, installedAt: manana, provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  it("rechaza un bloque de otra parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);
    const otra = await crearParcela();
    locationIds.push(otra.id, otra.parentLocationId!);
    organizationIds.push(otra.organizationId!);

    const { createPlotBlock } = await import("../../lib/traceability/plotBlocks");
    const ajeno = await createPlotBlock(userAccountId, { locationId: otra.id, name: "Norte" });

    await expect(createTrap(userAccountId, {
      locationId: parcela.id, plotBlockId: ajeno.id, installedAt: new Date(), provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapValidationError);
  });

  it("rechaza a un usuario sin acceso a specimen en esa parcela", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(createTrap(ajeno.userAccountId, {
      locationId: parcela.id, installedAt: new Date(), provenanceClass: "direct_observation",
    })).rejects.toThrow(TrapAccessError);
  });
});
