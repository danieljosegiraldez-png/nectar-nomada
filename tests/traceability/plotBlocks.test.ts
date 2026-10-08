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
import {
  createPlotBlock,
  listPlotBlocks,
  setPlotBlockType,
  claveDeTituloDeBloque,
  PlotBlockValidationError,
} from "../../lib/traceability/plotBlocks";
import { LocationAccessError, createMicrolot } from "../../lib/traceability/locations";
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

    const bloque = await createPlotBlock(userAccountId, {
      locationId: parcela.id,
      name: "Norte",
      blockType: "trampa",
    });
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

    const bloque = await createPlotBlock(userAccountId, {
      locationId: parcela.id,
      name: "Alto",
      blockType: "trampa",
    });
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

    await expect(
      createPlotBlock(userAccountId, { locationId: parcela.id, name: "   ", blockType: "trampa" }),
    ).rejects.toThrow(PlotBlockValidationError);
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

    await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Bajo", blockType: "trampa" });
    await expect(
      createPlotBlock(userAccountId, { locationId: parcela.id, name: "Bajo", blockType: "trampa" }),
    ).rejects.toThrow(PlotBlockValidationError);
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

    await expect(
      createPlotBlock(ajeno.userAccountId, { locationId: parcela.id, name: "Sur", blockType: "trampa" }),
    ).rejects.toThrow(LocationAccessError);
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

  it("exige blockType al crear un bloque nuevo", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    await expect(
      createPlotBlock(userAccountId, { locationId: parcela.id, name: "Sur" } as never),
    ).rejects.toThrow(PlotBlockValidationError);
  });

  it("crea un bloque con su tipo y descripción", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const bloque = await createPlotBlock(userAccountId, {
      locationId: parcela.id,
      name: "Biochar A",
      blockType: "experimental",
      description: "Biochar aplicado frente a no aplicado",
    });
    expect(bloque.blockType).toBe("experimental");
    expect(bloque.description).toBe("Biochar aplicado frente a no aplicado");
  });

  it("deniega crear un bloque sin acceso de atributos de la parcela", async () => {
    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const otro = await crearUsuarioSinAcceso();
    userAccountIds.push(otro.userAccountId);
    personIds.push(otro.personId);
    scopeIds.push(otro.scopeId);
    locationIds.push(otro.locationId);
    organizationIds.push(otro.organizationId);

    await expect(
      createPlotBlock(otro.userAccountId, {
        locationId: parcela.id,
        name: "Norte",
        blockType: "trampa",
      }),
    ).rejects.toThrow(LocationAccessError);
  });

  it("setPlotBlockType cambia el tipo y la descripción de un bloque existente", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    // Un bloque anterior a esta migración: nace sin tipo (ADR-080).
    const bloque = await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Este", blockType: "trampa" });

    const actualizado = await setPlotBlockType(userAccountId, {
      plotBlockId: bloque.id,
      blockType: "experimental",
      description: "Comparación de riego",
    });
    expect(actualizado.blockType).toBe("experimental");
    expect(actualizado.description).toBe("Comparación de riego");
  });

  it("setPlotBlockType deniega a un usuario sin acceso a esa parcela", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const bloque = await createPlotBlock(userAccountId, { locationId: parcela.id, name: "Oeste", blockType: "trampa" });

    const ajeno = await crearUsuarioSinAcceso();
    userAccountIds.push(ajeno.userAccountId);
    personIds.push(ajeno.personId);
    scopeIds.push(ajeno.scopeId);
    locationIds.push(ajeno.locationId);
    organizationIds.push(ajeno.organizationId);

    await expect(
      setPlotBlockType(ajeno.userAccountId, { plotBlockId: bloque.id, blockType: "trampa" }),
    ).rejects.toThrow(LocationAccessError);
  });

  /**
   * Decisión de Daniel, 2026-09-19: una microparcela no es un tipo de bloque.
   * **Corregido tras la revisión del merge:** no es tampoco la Location
   * `micro_plot` del enum — ese valor existe en el esquema pero nada lo
   * produce (`2026-09-18-fincas-y-parcelas-design.md` §2 y §3.3). El camino
   * real de la aplicación es `createMicrolot`
   * (`crearMicroparcelaAction` → `createMicrolot`, spec fincas y parcelas
   * §3.3), que crea una Location `plot` cuyo padre es OTRA `plot` —copia el
   * `locationType` del padre—, no una Location `micro_plot`. Este test crea
   * la microparcela por ese camino, no fabricando el tipo a mano, para que
   * ejercite la entrada que la aplicación de verdad produce.
   */
  it("crea un bloque bajo una microparcela creada con createMicrolot, no sólo bajo una parcela de primer nivel", async () => {
    const usuario = await crearUsuarioConAcceso();
    userAccountIds.push(usuario.userAccountId);
    personIds.push(usuario.personId);
    scopeIds.push(usuario.scopeId);
    const { userAccountId } = usuario;

    const parcela = await crearParcela();
    locationIds.push(parcela.id, parcela.parentLocationId!);
    organizationIds.push(parcela.organizationId!);

    const microparcela = await createMicrolot(userAccountId, {
      parentLocationId: parcela.id,
      name: `TEST Microparcela (${Date.now()})`,
      motivoDeLaSeleccion: "altitude",
    });
    locationIds.push(microparcela.id);
    // El camino real produce una Location `plot`, no `micro_plot` — es la
    // afirmación que el hallazgo 1 de la revisión pedía comprobar, no sólo
    // asumir.
    expect(microparcela.locationType).toBe("plot");

    const bloque = await createPlotBlock(userAccountId, {
      locationId: microparcela.id,
      name: "Ladera",
      blockType: "experimental",
    });
    expect(bloque.locationId).toBe(microparcela.id);
    const lista = await listPlotBlocks(userAccountId, microparcela.id);
    expect(lista.map((b) => b.name)).toEqual(["Ladera"]);
  });
});

/**
 * Pura, sin I/O: no necesita base ni el grupo `base-sembrada`. Vive en este
 * archivo porque es la única cobertura directa de `claveDeTituloDeBloque` —
 * el brief de la Tarea 1 pedía su flip-test contra un caso que aún no
 * existía; éste es ese caso.
 */
describe("claveDeTituloDeBloque", () => {
  it("trampa", () => {
    expect(claveDeTituloDeBloque("trampa")).toBe("blockTitleTrampa");
  });

  it("experimental", () => {
    expect(claveDeTituloDeBloque("experimental")).toBe("blockTitleExperimental");
  });

  it("null cuando no hay tipo", () => {
    expect(claveDeTituloDeBloque(null)).toBeNull();
  });
});
