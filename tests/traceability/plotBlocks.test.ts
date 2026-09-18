/**
 * Bloques de una parcela — servicio puro de alta/listado.
 *
 * Base real, en el grupo `base-sembrada` (ver scripts/pruebas-por-compuerta.txt).
 * Cada `it` crea su propio usuario y parcela con los helpers de
 * `tests/helpers/traceability.ts`, y encola sus ids en los arreglos de este
 * archivo; la limpieza corre en `afterEach` — nunca al final del cuerpo del
 * `it` — para que una aserción fallida no salte el borrado y deje basura en
 * la base compartida.
 */
import { afterEach, describe, expect, it } from "vitest";
import { createPlotBlock, listPlotBlocks, PlotBlockValidationError } from "../../lib/traceability/plotBlocks";
import { LocationAccessError } from "../../lib/traceability/locations";
import { prisma } from "../../lib/db";
import { crearUsuarioConAcceso, crearParcela, crearUsuarioSinAcceso } from "../helpers/traceability";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

let userAccountIds: string[] = [];
let personIds: string[] = [];
let scopeIds: string[] = [];
let locationIds: string[] = [];
let organizationIds: string[] = [];

afterEach(async () => {
  await prisma.auditEvent.deleteMany({ where: assertDefinedWhere({ actorUserAccountId: { in: userAccountIds } }) });
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

describe("bloques de una parcela", () => {
  it("crea un bloque con su nombre y lo lista", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const bloque = await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Norte" });
    expect(bloque.name).toBe("Norte");
    const lista = await listPlotBlocks(userAccountId, parcela.id);
    expect(lista.map((b) => b.name)).toEqual(["Norte"]);
  });

  it("escribe la auditoría en la misma transacción", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const bloque = await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Alto" });
    const evento = await prisma.auditEvent.findFirst({
      where: { entityType: "plot_block", entityId: bloque.id, operation: "plot_block.create" },
    });
    expect(evento).not.toBeNull();
  });

  it("rechaza un nombre vacío", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(createPlotBlock(userAccountId, { locationId: parcela.id, name: "   " })).rejects.toThrow(
      PlotBlockValidationError,
    );
  });

  it("rechaza dos bloques con el mismo nombre en la misma parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Bajo" });
    await expect(createPlotBlock(userAccountId, { locationId: parcela.id, name: "Bajo" })).rejects.toThrow(
      PlotBlockValidationError,
    );
  });

  it("createPlotBlock rechaza a un usuario sin acceso a esa parcela", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(createPlotBlock(ajeno.userAccountId, { locationId: parcela.id, name: "Sur" })).rejects.toThrow(
      LocationAccessError,
    );
  });

  it("listPlotBlocks rechaza a un usuario sin acceso a esa parcela", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(listPlotBlocks(ajeno.userAccountId, parcela.id)).rejects.toThrow(LocationAccessError);
  });
});
