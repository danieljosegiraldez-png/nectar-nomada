/**
 * `crearApiarioFormAction` llamaba a `crearApiario` **sin `catch`**: crear un
 * sitio con el nombre en blanco subía un `ApiaryAccessError` hasta el navegador
 * y el apicultor veía un 500 (`PENDING_IMPLEMENTATIONS/013`).
 *
 * Hermético (sin base), mismo patrón que
 * `tests/traceability/startFieldSessionAction.test.ts`. `crearApiario` **no está
 * mockeado**: su comprobación del nombre es la primera línea de la función y no
 * toca Prisma, así que la clase que llega al `catch` es la real. `crearApiario.test.ts`
 * es el que prueba el servicio contra la base; esto prueba la puerta.
 *
 * No va al grupo `base-sembrada`: no toca la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string, params?: { detalle?: string }) =>
      params?.detalle ? `${key}|${params.detalle}` : key,
    ),
}));

import { crearApiarioFormAction } from "../../app/actions/apiary";

function form(name: string) {
  const data = new FormData();
  data.set("name", name);
  data.set("organizationId", "org-1");
  data.set("tipo", "apiary_site");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
});

describe("crearApiarioFormAction", () => {
  it("con el nombre en blanco devuelve un error legible, no un 500", async () => {
    await expect(crearApiarioFormAction({}, form("   "))).resolves.toEqual({
      error: "crearApiarioError|name_required",
    });
  });

  /**
   * Control positivo: lo único que cambia es el nombre, y el veredicto cambia
   * con él. Sin esto, la prueba de arriba pasaría igual si la acción se cayera
   * SIEMPRE por otro motivo.
   *
   * Se afirma sobre el valor devuelto y no sobre el texto: el error de Prisma
   * trae las líneas de alrededor del archivo y `name_required` es una de ellas.
   * Y no se afirma «no llegó a la base» porque esta prueba corre en los dos
   * mundos — sin base en el carril de CI, con base en local.
   */
  it("con nombre ya no es el nombre lo que la corta", async () => {
    const resultado = await crearApiarioFormAction({}, form("Apiario 3")).catch(() => "lanzó" as const);
    expect(resultado).not.toEqual({ error: "crearApiarioError|name_required" });
  });
});
