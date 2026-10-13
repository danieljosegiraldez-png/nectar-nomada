/**
 * `/recipes` devuelve a `/lots` a quien `listRecipes` rechaza, en vez de enseñar la página de error.
 * Daniel, 2026-10-12; `PENDING_IMPLEMENTATIONS/027`.
 *
 * `listRecipes` rechaza con `TraceabilityAccessError` a quien no opera ningún lote ni puede escribir
 * recetas (Ruling C4, Parte 2a). La página no lo atrapaba y salía un 500. Ahora atrapa ESA clase y
 * sólo ésa. El control dice que cualquier otro error sigue subiendo tal cual: atrapar de más es
 * esconder un fallo de verdad detrás de una redirección.
 *
 * Hermética: el servicio está simulado, porque lo que se prueba es lo que hace la página con su
 * rechazo, no quién lo recibe (eso lo prueban las de `listRecipes`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  class TraceabilityAccessError extends Error {}
  return { TraceabilityAccessError, listRecipes: vi.fn() };
});

vi.mock("next-intl/server", () => ({ getTranslations: async () => (clave: string) => clave }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: async () => ({ userAccountId: "cuenta-de-prueba" }) }));
vi.mock("../../lib/traceability/lots", () => ({ TraceabilityAccessError: h.TraceabilityAccessError }));
vi.mock("../../lib/traceability/processTargets", () => ({ listRecipes: h.listRecipes, puedeCrearRecetaEnAlguna: async () => false }));
vi.mock("../../lib/recetas/autoria", () => ({ puedeAutoriaDeReceta: async () => false }));

import RecipesPage from "../../app/recipes/page";

beforeEach(() => h.listRecipes.mockReset());

describe("la lista de recetas sin acceso", () => {
  it("el rechazo de acceso vuelve a /lots, no a la página de error", async () => {
    h.listRecipes.mockRejectedValueOnce(new h.TraceabilityAccessError("no_lot_access"));
    await expect(RecipesPage()).rejects.toMatchObject({ digest: expect.stringContaining(";/lots;") });
  });

  it("control: cualquier otro error sube tal cual, sin redirigir", async () => {
    h.listRecipes.mockRejectedValueOnce(new Error("la base no contesta"));
    const error = await RecipesPage().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("la base no contesta");
    expect((error as { digest?: string }).digest).toBeUndefined();
  });
});
