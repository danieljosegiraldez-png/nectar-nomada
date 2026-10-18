/**
 * `listRecipes` sólo toma por «esta cuenta no opera lotes» el rechazo de acceso a lotes; cualquier otro error SE RELANZA — Parte 2a, tarea 14, ronda de arreglo de la parte D.
 *
 * `listRecipes` (`lib/traceability/processTargets.ts`) pregunta, por cada organización con recetas, si la cuenta opera algún lote suyo (`opera()`), y lo que responda se suma a
 * «o puede escribir sus recetas». El comentario de `opera()` promete que un error que NO sea de acceso se relanza, y nada lo vigilaba: cambiar `throw error` por `return false`
 * dejaba verdes las 22 pruebas con base de `lecturasDeRecetas.test.ts`, porque ninguna hace que la guardia o la lectura de los ámbitos de los lotes lancen otra cosa que el
 * rechazo de acceso. Tragarse una caída de la base como «no opera» es peor que el error: la pantalla enseñaría una lista incompleta como si fuera la completa.
 *
 * Hermética por necesidad, y por eso es un archivo aparte: con base real no hay manera de que la guardia lance «la base no responde» en el sitio exacto, y este archivo simula
 * justo eso — la base (`prisma`), la guardia de acceso a lotes (`requireLotAccess`, con su clase de error) y la regla de autoría (`puedeAutoriaDeReceta`) —; el resto de
 * `listRecipes` es el código real. La cuenta SIEMPRE puede escribir las recetas (salvo en el último caso) para que, si la guardia dejara de relanzar, la lista saliera completa
 * en vez de fallar por otro camino: así el «no» de cada prueba es del `catch` de `opera()` y no de otra parte.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  recetas: [] as unknown[],
  /** La guardia de acceso a lotes: por omisión deja pasar. */
  guardia: async (): Promise<void> => {},
  /** La lectura de los ámbitos de los lotes de la organización. */
  ambitos: async (): Promise<unknown[]> => [],
  /** La regla de autoría de recetas. */
  puedeEscribir: async (): Promise<boolean> => false,
}));

vi.mock("../../lib/db", () => ({
  prisma: {
    processRecipe: { findMany: async () => estado.recetas },
    lot: { groupBy: async () => estado.ambitos() },
  },
}));
vi.mock("../../lib/traceability/lots", () => ({
  TraceabilityAccessError: class TraceabilityAccessError extends Error {},
  requireLotAccess: async () => estado.guardia(),
}));
vi.mock("../../lib/recetas/autoria", () => ({
  puedeAutoriaDeReceta: async () => estado.puedeEscribir(),
  exigeAutoriaDeReceta: async () => {},
}));

import { TraceabilityAccessError } from "../../lib/traceability/lots";
import { listRecipes } from "../../lib/traceability/processTargets";

beforeEach(() => {
  estado.recetas = [{ id: "r1", name: "Lavado tradicional", organizationId: "org1", esLibre: false }];
  estado.guardia = async () => {};
  estado.ambitos = async () => [{ projectId: "p1", locationId: "l1", classification: "green" }];
  estado.puedeEscribir = async () => true;
});

describe("listRecipes: qué errores de «¿opera esta cuenta lotes de la organización?» valen por un no", () => {
  it("el rechazo de acceso a lotes es un «no opera»: quien además escribe las recetas de la organización las ve", async () => {
    estado.guardia = async () => {
      throw new TraceabilityAccessError("no_lot_access");
    };
    const recetas = await listRecipes("cuenta");
    expect(recetas.map((r) => r.id)).toEqual(["r1"]);
  });

  it("cualquier otro error de la guardia SE RELANZA, aunque la cuenta pueda escribir las recetas", async () => {
    estado.guardia = async () => {
      throw new Error("la base no responde");
    };
    await expect(listRecipes("cuenta")).rejects.toThrow("la base no responde");
  });

  it("y lo mismo si el que falla es la lectura de los ámbitos de los lotes", async () => {
    estado.ambitos = async () => {
      throw new Error("los lotes no se pueden leer");
    };
    await expect(listRecipes("cuenta")).rejects.toThrow("los lotes no se pueden leer");
  });

  it("control: sin ningún error, quien opera ve la receta aunque no pueda escribirla", async () => {
    estado.puedeEscribir = async () => false;
    const recetas = await listRecipes("cuenta");
    expect(recetas.map((r) => r.id)).toEqual(["r1"]);
  });
});
