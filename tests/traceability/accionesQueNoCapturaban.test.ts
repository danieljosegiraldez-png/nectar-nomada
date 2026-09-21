/**
 * Tres acciones de `app/actions/traceability.ts` llamaban a su servicio **sin
 * `catch`**, así que un error de validación subía hasta el navegador y el
 * operario veía un 500 en vez de una frase (`PENDING_IMPLEMENTATIONS/013`,
 * hallazgo de la revisión de Codex sobre el PR #433).
 *
 * Hermético (sin base), mismo patrón que `startFieldSessionAction.test.ts`.
 *
 * **Los servicios NO están mockeados**, y ésa es la parte que hace que esto
 * pruebe algo: `recordLabourEntry`, `recordMaterialConsumptionEntry` y
 * `confirmarCoordenadasDelSitio` validan **antes** de tocar Prisma, así que se
 * les llama de verdad y la clase que llega a `friendlyError` es la real. Si se
 * mockeara el servicio, el `instanceof` compararía contra una clase inventada
 * por la propia prueba y pasaría aunque la rama no existiera. De
 * `confirmarCoordenadasDelSitio` se mockean sólo sus dos puertas de permiso,
 * que sí consultan la base y corren antes de la validación.
 *
 * `getTranslations` devuelve la clave, así que se afirma sobre la clave.
 *
 * No va al grupo `base-sembrada`: no toca la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ user: vi.fn(), jornada: vi.fn(), beneficio: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
// Las dos puertas de `confirmarCoordenadasDelSitio`, que consultan la base y
// corren antes de la validación de rangos. Lo que se prueba está después.
vi.mock("../../lib/traceability/jornadaDeCampo", () => ({ requireFieldSessionAccess: deps.jornada }));
vi.mock("../../lib/traceability/locations", async (original) => ({
  ...(await original<typeof import("../../lib/traceability/locations")>()),
  exigeEditarBeneficioSiLoEs: deps.beneficio,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((key: string, params?: { detail?: string }) =>
      params?.detail ? `${key}|${params.detail}` : key,
    ),
}));

import {
  recordLabourEntryFormAction,
  recordMaterialConsumptionEntryFormAction,
  confirmarCoordenadasAction,
} from "../../app/actions/traceability";

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.jornada.mockResolvedValue(undefined);
  deps.beneficio.mockResolvedValue(undefined);
});

describe("recordLabourEntryFormAction", () => {
  const form = (workerCount: string, hours: string) => {
    const data = new FormData();
    data.set("lotId", "lote-1");
    data.set("parentKind", "fermentationRun");
    data.set("parentId", "corrida-1");
    data.set("workerCount", workerCount);
    data.set("hours", hours);
    return data;
  };

  it("cero personas devuelve un error legible, no un 500", async () => {
    await expect(recordLabourEntryFormAction({}, form("0", "4"))).resolves.toEqual({
      error: "error_labour|worker_count_must_be_positive",
    });
  });

  it("cero horas devuelve un error legible, no un 500", async () => {
    await expect(recordLabourEntryFormAction({}, form("3", "0"))).resolves.toEqual({
      error: "error_labour|hours_must_be_positive",
    });
  });
});

describe("recordMaterialConsumptionEntryFormAction", () => {
  const form = (materialName: string, batchLabel: string) => {
    const data = new FormData();
    data.set("lotId", "lote-1");
    data.set("parentKind", "dryingRun");
    data.set("parentId", "secado-1");
    data.set("materialName", materialName);
    data.set("batchLabel", batchLabel);
    return data;
  };

  it("sin nombre de material devuelve un error legible, no un 500", async () => {
    await expect(recordMaterialConsumptionEntryFormAction({}, form("  ", "L-42"))).resolves.toEqual({
      error: "error_material_consumption|material_name_required",
    });
  });

  it("sin número de lote del envase devuelve un error legible, no un 500", async () => {
    await expect(recordMaterialConsumptionEntryFormAction({}, form("Levadura", "  "))).resolves.toEqual({
      error: "error_material_consumption|batch_label_required",
    });
  });
});

describe("confirmarCoordenadasAction", () => {
  const form = (latitude: string, longitude: string) => {
    const data = new FormData();
    data.set("locationId", "apiario-1");
    data.set("latitude", latitude);
    data.set("longitude", longitude);
    data.set("reason", "");
    return data;
  };

  // Los campos son editables a propósito, así que un 95 llega de verdad.
  it("una latitud imposible devuelve un error legible, no un 500", async () => {
    await expect(confirmarCoordenadasAction({}, form("95", "-80.1"))).resolves.toEqual({
      error: "error_coordenadas|latitud_fuera_de_rango",
    });
  });

  it("una longitud imposible devuelve un error legible, no un 500", async () => {
    await expect(confirmarCoordenadasAction({}, form("8.5", "-200"))).resolves.toEqual({
      error: "error_coordenadas|longitud_fuera_de_rango",
    });
  });

  /**
   * Control positivo: lo único que cambia respecto a las dos de arriba son los
   * números, y el veredicto cambia con ellos. Sin esto, las dos pasarían igual
   * si la acción fallara SIEMPRE por otra razón — un `locationId` que no le
   * gusta, una puerta mal mockeada — y estarían midiendo otra cosa.
   *
   * **Se afirma sobre el valor devuelto, no sobre el texto del error**, por dos
   * motivos. Uno: el error de Prisma trae las líneas de alrededor del archivo,
   * y `longitud_fuera_de_rango` es una de ellas, así que un
   * `not.toContain("fuera_de_rango")` medía el eco del código fuente. Dos:
   * pasada la validación lo siguiente es la base, y esta prueba corre en los dos
   * mundos — en el carril de CI no hay base y lanza, en local con
   * `test:db` la hay y devuelve `sitio_no_encontrado`. Afirmar «no llegó a la
   * base» habría puesto la prueba en rojo en una de las dos.
   */
  it("con coordenadas válidas ya no es la validación de rangos quien corta", async () => {
    const resultado = await confirmarCoordenadasAction({}, form("8.5", "-80.1")).catch(() => "lanzó" as const);
    expect(resultado).not.toEqual({ error: "error_coordenadas|latitud_fuera_de_rango" });
    expect(resultado).not.toEqual({ error: "error_coordenadas|longitud_fuera_de_rango" });
  });
});
