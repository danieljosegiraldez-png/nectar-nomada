import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CatalogoError,
  filtroVisible,
  organizacionesVisibles,
  requireCatalogoAccess,
  requireEntradaDeCatalogoAccess,
} from "../../lib/catalogos/propiedad";
import { montarFixtures, type Fixtures } from "../helpers/fixturesDeCatalogo";

const PERMISO = { resourceType: "equipment", action: "manage" } as const;
const VER = { resourceType: "equipment", action: "view" } as const;
let f: Fixtures;
let admin: string, jefeA: string, operarioA: string, orgA: string, orgB: string, sitioA: string, sitioB: string;

beforeAll(async () => {
  f = await montarFixtures("prop");
  ({ admin, jefeA, operarioA, orgA, orgB, sitioA, sitioB } = f);
});
afterAll(async () => {
  await f.limpiar();
});

describe("requireCatalogoAccess", () => {
  it("compartido: sólo con el permiso en ámbito de plataforma", async () => {
    await expect(requireCatalogoAccess(admin, { tipo: "compartido" }, PERMISO)).resolves.toBeNull();
    await expect(requireCatalogoAccess(jefeA, { tipo: "compartido" }, PERMISO)).rejects.toThrow(CatalogoError);
  });
  it("propio: el permiso se juzga en el sitio, y la organización sale del sitio", async () => {
    await expect(requireCatalogoAccess(jefeA, { tipo: "propio", locationId: sitioA }, PERMISO)).resolves.toBe(orgA);
    await expect(requireCatalogoAccess(jefeA, { tipo: "propio", locationId: sitioB }, PERMISO)).rejects.toThrow(CatalogoError);
    await expect(requireCatalogoAccess(operarioA, { tipo: "propio", locationId: sitioA }, PERMISO)).rejects.toThrow(CatalogoError);
  });
});

describe("requireEntradaDeCatalogoAccess", () => {
  it("una entrada propia se edita con el permiso en ALGÚN sitio de su organización", async () => {
    await expect(requireEntradaDeCatalogoAccess(jefeA, { organizationId: orgA }, PERMISO)).resolves.toBeUndefined();
    await expect(requireEntradaDeCatalogoAccess(jefeA, { organizationId: orgB }, PERMISO)).rejects.toThrow(CatalogoError);
  });
  it("una compartida, sólo con plataforma", async () => {
    await expect(requireEntradaDeCatalogoAccess(jefeA, { organizationId: null }, PERMISO)).rejects.toThrow(CatalogoError);
    await expect(requireEntradaDeCatalogoAccess(admin, { organizationId: null }, PERMISO)).resolves.toBeUndefined();
  });
});

describe("visibilidad", () => {
  it("el operario ve su organización y no la ajena", async () => {
    const orgs = await organizacionesVisibles(operarioA, VER);
    expect(orgs).toContain(orgA);
    expect(orgs).not.toContain(orgB);
  });
  it("el filtro deja pasar siempre lo compartido", () => {
    expect(filtroVisible([orgA])).toEqual({ OR: [{ organizationId: null }, { organizationId: { in: [orgA] } }] });
  });
});
