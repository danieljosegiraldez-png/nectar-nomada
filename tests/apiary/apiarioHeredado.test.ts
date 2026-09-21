/**
 * Un apiario que cuelga de una finca hereda su organización (2026-09-21).
 *
 * «Apiario 1 — Finca Rosina» y «Apiario 2 — Finca Rosina» no llevan `organizationId` propio: lo
 * heredan de Finca Rosina. `leyendaDeCera`, `ceraDeExtraccionDelApiario` y `alzasDelApiario`
 * leían el del apiario a secas, lanzaban `sitio_sin_finca` y la página entera daba 500 en
 * producción. Visto en el log de Vercel con `digest: '3015771708'`.
 *
 * Grupo `base-sembrada`: necesita el perfil Platform Admin sembrado.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { leyendaDeCera } from "../../lib/apiary/cera";
import { ceraDeExtraccionDelApiario } from "../../lib/apiary/ceraDeExtraccion";
import { alzasDelApiario } from "../../lib/apiary/alzas";

const RUN = `aph-${Date.now()}`;
let org: string;
let finca: string;
let apiario: string;
let persona: string;
let cuenta: string;
let asignacion: string;

beforeAll(async () => {
  org = (await prisma.organization.create({ data: { organizationType: "farm", name: `TEST Finca (${RUN})`, status: "approved", classification: "internal" } })).id;
  finca = (await prisma.location.create({ data: { name: `TEST Finca (${RUN})`, locationType: "site", organizationId: org, classification: "internal" } })).id;
  // Sin organización propia, como los apiarios de Finca Rosina.
  apiario = (await prisma.location.create({ data: { name: `TEST Apiario (${RUN})`, locationType: "apiary_site", parentLocationId: finca, classification: "internal" } })).id;
  persona = (await prisma.person.create({ data: { givenName: "TEST", familyName: "Admin", displayName: `TEST Admin (${RUN})` } })).id;
  cuenta = (await prisma.userAccount.create({ data: { personId: persona, status: "active", authProvider: "credentials" } })).id;
  const perfil = await prisma.roleProfile.findUniqueOrThrow({ where: { name: "Platform Admin" } });
  const scope = await prisma.scope.findFirstOrThrow({ where: { scopeType: "platform", scopeRefId: null } });
  asignacion = (await prisma.assignment.create({ data: { id: randomUUID(), userAccountId: cuenta, scopeId: scope.id, roleProfileId: perfil.id } })).id;
});

afterAll(async () => {
  await prisma.assignment.deleteMany({ where: { id: asignacion } });
  await prisma.userAccount.deleteMany({ where: { id: cuenta } });
  await prisma.person.deleteMany({ where: { id: persona } });
  await prisma.location.deleteMany({ where: { id: { in: [apiario, finca] } } });
  await prisma.organization.deleteMany({ where: { id: org } });
});

describe("apiario sin organización propia, colgado de una finca", () => {
  it("la leyenda de cera se lee con la finca heredada", async () => {
    await expect(leyendaDeCera(cuenta, apiario)).resolves.toBeDefined();
  });

  it("la cera de extracción se lee con la finca heredada", async () => {
    await expect(ceraDeExtraccionDelApiario(cuenta, apiario)).resolves.toBeDefined();
  });

  it("las alzas son las de la finca heredada, no una lista vacía por defecto", async () => {
    const alza = await prisma.hiveSuper.create({ data: { organizationId: org, code: `T${Date.now() % 100000}` } });
    try {
      const alzas = await alzasDelApiario(cuenta, apiario);
      expect(alzas.map((a) => a.id)).toContain(alza.id);
    } finally {
      await prisma.hiveSuper.delete({ where: { id: alza.id } });
    }
  });
});
