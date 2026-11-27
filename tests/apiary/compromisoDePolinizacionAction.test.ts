/**
 * La puerta de la meta de polinización — paso 12 del plan del Apiario (ADR-200 §6). Hasta el
 * 2026-11-14 `crearCompromisoDePolinizacion` no tenía ningún llamador fuera de sus pruebas.
 *
 * Hermético (sin base). El servicio está mockeado —su conducta contra la base la prueba
 * `polinizacion.test.ts`, en el carril con base—, pero **su clase de error y su regla de procedencia
 * son las reales**, y los textos también (`traductorDePrueba` revienta si a un código le falta el
 * suyo).
 *
 * No va al grupo `base-sembrada`: no toca la base.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ user: vi.fn(), crear: vi.fn(), revalidar: vi.fn() }));
vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidar }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", async () => {
  const { traductorDePrueba } = await import("../helpers/traductorDePrueba");
  return { getTranslations: async (espacio: string) => traductorDePrueba(espacio) };
});
vi.mock("../../lib/apiary/polinizacion", async (original) => ({
  ...(await original<typeof import("../../lib/apiary/polinizacion")>()),
  crearCompromisoDePolinizacion: deps.crear,
}));

import { crearCompromisoDePolinizacionAction } from "../../app/actions/apiary";
import { ApiaryAccessError } from "../../lib/apiary/hives";
import { PolinizacionValidationError, procedenciaDelCompromiso } from "../../lib/apiary/polinizacion";
import { traductorDePrueba } from "../helpers/traductorDePrueba";

const t = traductorDePrueba("Apiary");

const COMPLETO = {
  locationId: "sitio-1",
  clientOrganizationId: "org-kiva",
  committedHectares: "10",
  targetHivesPerHectareMin: "4",
  targetHivesPerHectareMax: "6",
  crop: "  Café robusta ",
  parcelReference: "Lote 1",
  startsAt: "2026-11-01",
  endsAt: "2026-11-30",
  // Panamá: UTC−5. Es lo que escribe `TimezoneOffsetField` en el navegador.
  tzOffsetMinutes: "300",
  bloomStartsAt: "2027-02-10",
  bloomEndsAt: "2027-03-05",
  notes: "Meta del informe del 2026-06-29",
};
function form(campos: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(campos)) data.set(k, v);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.crear.mockResolvedValue({ id: "compromiso-1" });
});

describe("crearCompromisoDePolinizacionAction", () => {
  it("llama al servicio con las cifras como números, el servicio en instantes del sitio y lo vacío como null", async () => {
    await expect(crearCompromisoDePolinizacionAction({}, form(COMPLETO))).resolves.toEqual({ ok: true });
    expect(deps.crear).toHaveBeenCalledWith("actor", {
      locationId: "sitio-1",
      clientOrganizationId: "org-kiva",
      committedHectares: 10,
      targetHivesPerHectareMin: 4,
      targetHivesPerHectareMax: 6,
      // «Empieza» el 1 a las 00:00 de Panamá; «Termina» el 30 hasta su último milisegundo.
      startsAt: new Date("2026-11-01T05:00:00Z"),
      endsAt: new Date("2026-12-01T04:59:59.999Z"),
      crop: "Café robusta",
      parcelReference: "Lote 1",
      // La floración es un campo de DÍA en el esquema: medianoche UTC, como `fechaDeDia`.
      bloomStartsAt: new Date("2027-02-10T00:00:00Z"),
      bloomEndsAt: new Date("2027-03-05T00:00:00Z"),
      notes: "Meta del informe del 2026-06-29",
    });
    expect(deps.revalidar).toHaveBeenCalledWith("/apiaries/sitio-1");
  });

  it("una meta de un solo día dura el día entero, y sin fin queda abierta", async () => {
    // Era el defecto de la revisión: con medianoche UTC, `endsAt` (00:00Z) quedaba antes de la hora
    // de abrirla y la ficha no la enseñaba nunca.
    await crearCompromisoDePolinizacionAction({}, form({ ...COMPLETO, startsAt: "2026-11-14", endsAt: "2026-11-14" }));
    const unDia = deps.crear.mock.calls[0]![1] as { startsAt: Date; endsAt: Date };
    expect(unDia.startsAt).toEqual(new Date("2026-11-14T05:00:00Z"));
    expect(unDia.endsAt).toEqual(new Date("2026-11-15T04:59:59.999Z"));
    await crearCompromisoDePolinizacionAction({}, form({ ...COMPLETO, endsAt: "" }));
    expect((deps.crear.mock.calls[1]![1] as { endsAt: Date | null }).endsAt).toBeNull();
  });

  it("no manda referencia de contrato: la meta que entra por aquí no es un pacto", async () => {
    // Aunque alguien añada el campo a mano, la acción no lo lee: así la procedencia sale
    // `recommendation` (decisión 12b) hasta que exista un pacto y su pantalla.
    await crearCompromisoDePolinizacionAction({}, form({ ...COMPLETO, contractReference: "Contrato 7", committedHives: "40" }));
    const enviado = deps.crear.mock.calls[0]![1] as Record<string, unknown>;
    expect(enviado).not.toHaveProperty("contractReference");
    expect(enviado).not.toHaveProperty("committedHives");
  });

  it.each([
    ["sin cliente", { clientOrganizationId: "" }, "pollinationError_falta_el_cliente"],
    ["sin área", { committedHectares: "" }, "pollinationError_faltan_cifras"],
    ["sin la meta máxima", { targetHivesPerHectareMax: "  " }, "pollinationError_faltan_cifras"],
    ["un área que no es número", { committedHectares: "diez" }, "pollinationError_cifra_no_valida"],
    ["sin fecha de inicio", { startsAt: "" }, "pollinationError_falta_el_inicio"],
    ["un día que no existe", { bloomStartsAt: "2027-02-31" }, "pollinationError_fecha_invalida"],
    ["un fin de servicio que no existe", { endsAt: "2026-11-31" }, "pollinationError_fecha_invalida"],
    // Sin el desfase del dispositivo no se supone ninguna zona (`parseLocalDateTime`).
    ["sin el desfase del dispositivo", { tzOffsetMinutes: "" }, "pollinationError_sin_desfase"],
  ])("%s vuelve como frase y no llama al servicio", async (_caso, cambio, clave) => {
    await expect(crearCompromisoDePolinizacionAction({}, form({ ...COMPLETO, ...cambio }))).resolves.toEqual({ error: t(clave) });
    expect(deps.crear).not.toHaveBeenCalled();
    expect(deps.revalidar).not.toHaveBeenCalled();
  });

  it.each(["hectareas_no_positivas", "rango_invertido", "densidad_no_positiva", "cifra_demasiado_grande", "ventana_invertida", "floracion_invertida"])(
    "«%s» del servicio vuelve como frase, no como 500",
    async (codigo) => {
      deps.crear.mockRejectedValue(new PolinizacionValidationError(codigo));
      await expect(crearCompromisoDePolinizacionAction({}, form(COMPLETO))).resolves.toEqual({ error: t(`pollinationError_${codigo}`) });
      expect(deps.revalidar).not.toHaveBeenCalled();
    },
  );

  it("sin permiso sobre el sitio, también", async () => {
    deps.crear.mockRejectedValue(new ApiaryAccessError("no_apiary_access"));
    await expect(crearCompromisoDePolinizacionAction({}, form(COMPLETO))).resolves.toEqual({ error: t("pollinationError_sin_permiso") });
  });

  it("cualquier otro error sigue subiendo: no se disfraza de frase", async () => {
    deps.crear.mockRejectedValue(new Error("otra cosa"));
    await expect(crearCompromisoDePolinizacionAction({}, form(COMPLETO))).rejects.toThrow("otra cosa");
  });

  it("sin sesión, al login", async () => {
    deps.user.mockResolvedValue(null);
    await expect(crearCompromisoDePolinizacionAction({}, form(COMPLETO))).rejects.toThrow("redirect:/login");
    expect(deps.crear).not.toHaveBeenCalled();
  });
});

describe("la procedencia sale del dato (decisión 12b, ADR-200 §6)", () => {
  it("sin referencia de contrato es una recomendación; con ella, un registro original", () => {
    expect(procedenciaDelCompromiso(undefined)).toBe("recommendation");
    expect(procedenciaDelCompromiso(null)).toBe("recommendation");
    expect(procedenciaDelCompromiso("   ")).toBe("recommendation");
    expect(procedenciaDelCompromiso("Contrato 7")).toBe("original_record");
  });
});

describe("cada código del servicio tiene su frase", () => {
  it("los que lanza `polinizacion.ts`, leídos de la fuente, están en es y en en", () => {
    // Una clave que falta no la caza la prueba de arriba si el código es nuevo: aquí se descubren.
    const fuente = readFileSync(join(process.cwd(), "lib/apiary/polinizacion.ts"), "utf8");
    const codigos = [...fuente.matchAll(/new PolinizacionValidationError\("([a-z_]+)"\)/g)].map((m) => m[1]!);
    // Control del lector: los seis que se sabe que están.
    expect(codigos.length, `códigos leídos: ${codigos.join(", ")}`).toBeGreaterThanOrEqual(6);
    for (const idioma of ["es", "en"] as const) {
      const apiario = JSON.parse(readFileSync(join(process.cwd(), `messages/${idioma}.json`), "utf8")).Apiary as Record<string, string>;
      for (const c of codigos) expect(apiario[`pollinationError_${c}`], `${idioma}: pollinationError_${c}`).toBeTruthy();
    }
  });
});

describe("la ficha del apiario la ofrece", () => {
  it("con la sección también sin metas, y el formulario detrás de la lista que el servicio autoriza", () => {
    // La ficha es de servidor y arrastra la base entera: aquí se lee su fuente.
    const pagina = readFileSync(join(process.cwd(), "app/apiaries/[id]/page.tsx"), "utf8");
    expect(pagina).toContain("{polinizacion.length > 0 || vecinos.length > 0 ? (");
    expect(pagina).toMatch(/\{vecinos\.length > 0 \? \(\s*<details>\s*<summary>\{t\("pollinationNuevoSummary"\)\}<\/summary>\s*<CompromisoDePolinizacionForm/);
  });
});
