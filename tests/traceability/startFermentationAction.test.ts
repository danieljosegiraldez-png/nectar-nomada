/**
 * `startFermentationAction`: el tanque elegido llega al servicio, y los dos rechazos de D2 salen con su frase en vez de un 500
 * (Parte 2c, arreglos previos §4.1, 2026-10-04).
 *
 * **Por qué existe.** `friendlyError` (`app/actions/traceability.ts`) relanza toda clase que no conoce. `RecipienteError` es una clase
 * nueva que `startFermentationRun` lanza al empezar sin tanque ni nombre, o con un tanque que no se puede usar: sin su rama, el
 * formulario recibe un 500 en vez de «Elige un tanque registrado o escribe el nombre…» (la trampa del PR #433). Lo vigila también
 * `tests/arquitectura/acciones-traducen-sus-errores.test.ts`; esto prueba además la frase, la lista de códigos y que la acción pase
 * el tanque.
 *
 * Hermético (mocks, sin base), mismo patrón que `startFieldSessionAction.test.ts`: el servicio se simula, la clase de error es la
 * REAL, y `getTranslations` devuelve la clave, así que la prueba afirma sobre la clave. No va a `scripts/pruebas-por-compuerta.txt`.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CODIGOS_DE_RECIPIENTE, RecipienteError } from "../../lib/traceability/recipientes";

const deps = vi.hoisted(() => ({ user: vi.fn(), start: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/traceability/fermentation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/traceability/fermentation")>()),
  startFermentationRun: deps.start,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve((key: string) => key) }));

import { startFermentationAction } from "../../app/actions/traceability";

const RAIZ = new URL("../..", import.meta.url).pathname;
const traceability = (idioma: string) =>
  JSON.parse(readFileSync(`${RAIZ}messages/${idioma}.json`, "utf8")).Traceability as Record<string, string>;

function formulario(campos: Record<string, string>) {
  const data = new FormData();
  data.set("lotId", "lote-1");
  for (const [clave, valor] of Object.entries(campos)) data.set(clave, valor);
  return data;
}

describe("los códigos del recipiente tienen su frase en es y en", () => {
  // Escrita a mano, a propósito: si alguien ENCOGE la lista de la fuente, las demás pruebas recorrerían menos códigos y seguirían en verde.
  it("control: la lista es la que el diseño nombra", () => {
    expect([...CODIGOS_DE_RECIPIENTE]).toEqual(["recipiente_o_nota_obligatorio", "recipiente_no_disponible"]);
  });

  it("cada código tiene `Traceability.error_<código>` en los dos idiomas", () => {
    const es = traceability("es");
    const en = traceability("en");
    const faltan: string[] = [];
    for (const codigo of CODIGOS_DE_RECIPIENTE) {
      if (!es[`error_${codigo}`]) faltan.push(`es:error_${codigo}`);
      if (!en[`error_${codigo}`]) faltan.push(`en:error_${codigo}`);
    }
    expect(faltan).toEqual([]);
  });
});

describe("startFermentationAction — el tanque elegido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deps.user.mockResolvedValue({ userAccountId: "actor" });
    deps.start.mockResolvedValue({ run: { id: "corrida-1" } });
  });

  it("manda al servicio el tanque elegido y la nota, sin espacios de más", async () => {
    await expect(
      startFermentationAction({}, formulario({ vesselEquipmentId: "tanque-1", vesselNote: "  Tanque de la esquina  " })),
    ).rejects.toThrow("redirect:/lots/lote-1");
    expect(deps.start).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ lotId: "lote-1", vesselEquipmentId: "tanque-1", vesselNote: "Tanque de la esquina" }),
    );
  });

  it("un select sin elegir llega como null, no como cadena vacía", async () => {
    await expect(
      startFermentationAction({}, formulario({ vesselEquipmentId: "", vesselNote: "Tanque de la esquina" })),
    ).rejects.toThrow("redirect:/lots/lote-1");
    expect(deps.start).toHaveBeenCalledWith(
      "actor",
      expect.objectContaining({ vesselEquipmentId: null, vesselNote: "Tanque de la esquina" }),
    );
  });

  it.each([...CODIGOS_DE_RECIPIENTE])("%s sale con su frase, no como un 500", async (codigo) => {
    deps.start.mockRejectedValue(new RecipienteError(codigo));
    await expect(startFermentationAction({}, formulario({}))).resolves.toEqual({ error: `error_${codigo}` });
  });

  it("un código de recipiente que no está en la lista no se traduce a una clave que no existe: se relanza", async () => {
    deps.start.mockRejectedValue(new RecipienteError("otro_codigo"));
    await expect(startFermentationAction({}, formulario({}))).rejects.toThrow("otro_codigo");
  });
});
