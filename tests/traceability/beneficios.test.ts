import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";

describe("el tipo de ubicación beneficio", () => {
  it("existe en el enum de Postgres, y el control positivo es meliponary", async () => {
    const filas = await prisma.$queryRaw<{ valor: string }[]>`
      SELECT e.enumlabel AS valor
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE t.typname = 'LocationType' AND n.nspname = 'core'
    `;
    const valores = filas.map((f) => f.valor);
    // Control positivo: si la consulta no ve el enum, esto también falla y el
    // veredicto de arriba no se lee como «el tipo falta».
    expect(valores).toContain("meliponary");
    expect(valores).toContain("beneficio");
  });
});

describe("el permiso de crear un sitio", () => {
  it("está en el catálogo", () => {
    expect(PERMISSIONS.some((p) => p.resourceType === "location" && p.action === "create_site")).toBe(true);
  });

  it("lo tiene Farm Manager y NO lo tiene Farm Operator", () => {
    const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre)!;
    const tiene = (nombre: string) =>
      perfil(nombre).permissions.some(([r, a]) => r === "location" && a === "create_site");
    expect(tiene("Farm Manager")).toBe(true);
    expect(tiene("Farm Operator")).toBe(false);
    // Control positivo del mismo lector: un permiso que el operario SÍ tiene.
    expect(perfil("Farm Operator").permissions.some(([r, a]) => r === "lot" && a === "manage")).toBe(true);
  });
});
