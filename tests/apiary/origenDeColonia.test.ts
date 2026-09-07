/**
 * A9.10 (D6) — el origen de una colonia deja de ser prosa.
 *
 * Lo que estas pruebas afirman, y que ninguna lectura del código puede
 * afirmar: que el catálogo está SEMBRADO (no sólo declarado en
 * `lib/research/catalogs.ts`), que la FK guarda de verdad, y que con dos
 * colonias de orígenes distintos «compará Parita contra Santa Fe» es una
 * consulta — que es literalmente lo que D6 pide y lo que `originNote`, siendo
 * texto libre, no podía dar.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { createColony, createHive } from "../../lib/apiary/hives";
import { CATALOGO_DE_ORIGEN_DE_COLONIA, origenesDeColonia } from "../../lib/apiary/origenDeColonia";
import { VARIABLE_CATALOGS } from "../../lib/research/catalogs";
import { assertDefinedWhere } from "../helpers/assertDefinedWhere";

const RUN_ID = `a910-org-${Date.now()}`;

describe("A9.10 — el catálogo de orígenes", () => {
  it("está sembrado, no sólo declarado", async () => {
    const declarado = VARIABLE_CATALOGS.find((c) => c.key === CATALOGO_DE_ORIGEN_DE_COLONIA);
    expect(declarado, "el catálogo no está declarado en lib/research/catalogs.ts").toBeTruthy();

    const sembrado = await origenesDeColonia();
    // La comprobación que importa: declarado y sembrado dicen lo mismo. Sin
    // esto, añadir un valor al archivo y olvidar el `db:seed` deja el
    // desplegable corto y nadie se entera.
    expect(sembrado.map((v) => v.value).sort()).toEqual(declarado!.values.map((v) => v.value).sort());
  });

  it("trae los dos orígenes reales que el dueño nombró, y no otros", async () => {
    const valores = (await origenesDeColonia()).map((v) => v.value);
    expect(valores).toContain("Santa Fe, Veraguas");
    expect(valores).toContain("Parita, Chitré");
    // Control de que no se inventaron sitios: los otros tres apiarios que el
    // prompt nombra (línea 395) NO están aquí.
    expect(valores).not.toContain("Los Asientos");
    expect(valores).not.toContain("Toabré");
  });

  it("«desconocido» existe y se marca como identidad desconocida", async () => {
    const fila = await prisma.variableCatalogValue.findFirst({
      where: { catalog: { key: CATALOGO_DE_ORIGEN_DE_COLONIA }, value: "desconocido" },
      select: { impliesUnknownIdentity: true },
    });
    expect(fila?.impliesUnknownIdentity).toBe(true);
  });
});

describe("A9.10 — la comparación que D6 pide", () => {
  let organizationId: string;
  let projectId: string;
  let locationId: string;
  let userAccountId: string;
  let personId: string;
  let colonySantaFeId: string;
  let colonyParitaId: string;

  beforeAll(async () => {
    const organization = await prisma.organization.create({
      data: { organizationType: "farm", name: `TEST Farm (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    organizationId = organization.id;

    const person = await prisma.person.create({
      data: { givenName: "TEST", familyName: "Origen", displayName: `TEST Origen (${RUN_ID})`, locale: "es" },
    });
    personId = person.id;
    const userAccount = await prisma.userAccount.create({
      data: { personId: person.id, authProvider: "credentials", status: "active" },
    });
    userAccountId = userAccount.id;

    const project = await prisma.project.create({
      data: { name: `TEST Proyecto (${RUN_ID})`, status: "approved", classification: "internal" },
    });
    projectId = project.id;

    const location = await prisma.location.create({
      data: { locationType: "apiary_site", name: `TEST Sitio (${RUN_ID})`, organizationId, status: "approved", classification: "internal" },
    });
    locationId = location.id;

    const farmOperator = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Farm Operator" } });
    const scope = await prisma.scope.create({ data: { scopeType: "project", scopeRefId: projectId } });
    await prisma.assignment.create({ data: { userAccountId, roleProfileId: farmOperator.id, scopeId: scope.id } });

    const origenes = await origenesDeColonia();
    const santaFe = origenes.find((o) => o.value === "Santa Fe, Veraguas")!;
    const parita = origenes.find((o) => o.value === "Parita, Chitré")!;

    const hiveA = await createHive(userAccountId, { projectId, locationId, identifier: `A-${RUN_ID.slice(-4)}` });
    const hiveB = await createHive(userAccountId, { projectId, locationId, identifier: `B-${RUN_ID.slice(-4)}` });

    const a = await createColony(userAccountId, {
      hiveId: hiveA.id,
      originType: "purchased",
      startedAt: new Date("2026-01-01"),
      originSourceValueId: santaFe.id,
      provenanceClass: "direct_observation",
    });
    colonySantaFeId = a.id;

    const b = await createColony(userAccountId, {
      hiveId: hiveB.id,
      originType: "purchased",
      startedAt: new Date("2026-09-01"),
      originSourceValueId: parita.id,
      provenanceClass: "direct_observation",
    });
    colonyParitaId = b.id;
  });

  // Prisma descarta en silencio las claves `undefined` de un `where`, así que un
  // `beforeAll` roto convertiría cada borrado en un borrado sin filtro sobre la
  // base COMPARTIDA. `assertDefinedWhere` lanza en vez de borrar.
  afterAll(async () => {
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: { in: [colonySantaFeId, colonyParitaId] } }) });
    await prisma.hive.deleteMany({ where: assertDefinedWhere({ locationId }) });
    await prisma.location.deleteMany({ where: assertDefinedWhere({ id: locationId }) });
    await prisma.assignment.deleteMany({ where: assertDefinedWhere({ userAccountId }) });
    await prisma.userAccount.deleteMany({ where: assertDefinedWhere({ id: userAccountId }) });
    await prisma.person.deleteMany({ where: assertDefinedWhere({ id: personId }) });
    await prisma.project.deleteMany({ where: assertDefinedWhere({ id: projectId }) });
    await prisma.organization.deleteMany({ where: assertDefinedWhere({ id: organizationId }) });
  });

  it("«Parita contra Santa Fe» es una consulta, no leer prosa", async () => {
    const porOrigen = await prisma.colony.groupBy({
      by: ["originSourceValueId"],
      where: { hive: { locationId } },
      _count: { _all: true },
    });
    // Dos grupos, uno por origen. Esto es lo que `originNote` en texto libre no
    // puede dar: agrupar por «Parita, Chitré» dependería de que nadie lo
    // escribiera «Parita (Chitré)» ni «parita».
    expect(porOrigen).toHaveLength(2);
    expect(porOrigen.every((g) => g._count._all === 1)).toBe(true);
  });

  it("guarda la FK y la resuelve a su nombre", async () => {
    const colonia = await prisma.colony.findUniqueOrThrow({
      where: { id: colonyParitaId },
      include: { originSource: { select: { value: true } } },
    });
    expect(colonia.originSource?.value).toBe("Parita, Chitré");
  });

  it("una colonia sin origen en el catálogo se registra igual", async () => {
    // El campo es opcional a propósito: el catálogo no puede tener todavía
    // todos los orígenes que existen, y bloquear la instalación por eso sería
    // peor que un «sin registro».
    const hive = await createHive(userAccountId, { projectId, locationId, identifier: `C-${RUN_ID.slice(-4)}` });
    const sinOrigen = await createColony(userAccountId, {
      hiveId: hive.id,
      originType: "captured",
      startedAt: new Date("2026-05-01"),
      originNote: "enjambre capturado en el camino, sin procedencia conocida",
      provenanceClass: "direct_observation",
    });
    expect(sinOrigen.originSourceValueId).toBeNull();
    // Y `originNote` sigue vivo para lo que el catálogo no cubre.
    expect(sinOrigen.originNote).toContain("enjambre");
    await prisma.colony.deleteMany({ where: assertDefinedWhere({ id: sinOrigen.id }) });
  });
});
