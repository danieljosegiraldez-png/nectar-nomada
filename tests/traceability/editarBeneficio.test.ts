import { describe, expect, it } from "vitest";
import { prisma } from "../../lib/db";
import { PERMISSIONS, ROLE_PROFILES } from "../../lib/rbac/catalog";

/**
 * «Editar beneficio» — spec #370 §4.3. Por defecto el capataz NO edita un
 * beneficio; lo hace sólo si el Farm Manager o el dueño se lo conceden
 * (Daniel, 2026-09-18). La regla es sobre escrituras: cada camino de la ficha
 * se prueba por su cuenta, con su control positivo.
 */

describe("el permiso de editar un beneficio", () => {
  it("está en el catálogo, aparte de create_site", () => {
    const acciones = PERMISSIONS.filter((p) => p.resourceType === "location").map((p) => p.action);
    expect(acciones).toContain("edit_beneficio");
    // Control positivo del mismo lector: el permiso hermano sí está.
    expect(acciones).toContain("create_site");
  });

  it("lo tiene Farm Manager y NO lo tiene Farm Operator", () => {
    const perfil = (nombre: string) => ROLE_PROFILES.find((p) => p.name === nombre)!;
    const tiene = (nombre: string, accion: string) =>
      perfil(nombre).permissions.some(([r, a]) => r === "location" && a === accion);
    expect(tiene("Farm Manager", "edit_beneficio")).toBe(true);
    expect(tiene("Farm Operator", "edit_beneficio")).toBe(false);
    // Control positivo: el operario SÍ tiene manage_attributes, que es
    // justo lo que hoy le deja editar el beneficio.
    expect(tiene("Farm Operator", "manage_attributes")).toBe(true);
  });

  it("está sembrado en la base", async () => {
    const fila = await prisma.permission.findFirst({ where: { resourceType: "location", action: "edit_beneficio" } });
    expect(fila).not.toBeNull();
  });
});
