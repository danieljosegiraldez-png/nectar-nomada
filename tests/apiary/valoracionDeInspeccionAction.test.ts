/**
 * La puerta de la valoración del técnico — paso 8 del plan del Apiario (ADR-200, defectos sin
 * decisión). Hasta el 2026-10-19 `registrarValoracionDeInspeccion` no tenía ningún llamador fuera de
 * su archivo y de su prueba, así que cada informe decía «Valoración del técnico: Sin registrar».
 *
 * Hermético (sin base). El servicio está mockeado —su conducta contra la base la prueba
 * `valoracionDeInspeccion.test.ts`, en el carril con base—, pero **sus clases de error son las
 * reales**: lo que se prueba es que la acción traduce cada una, y los textos son los de verdad
 * (`traductorDePrueba` revienta si a un código le falta el suyo).
 *
 * No va al grupo `base-sembrada`: no toca la base.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ user: vi.fn(), registrar: vi.fn(), revalidar: vi.fn() }));
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
vi.mock("../../lib/apiary/valoracionDeInspeccion", async (original) => ({
  ...(await original<typeof import("../../lib/apiary/valoracionDeInspeccion")>()),
  registrarValoracionDeInspeccion: deps.registrar,
}));

import { registrarValoracionDeInspeccionAction } from "../../app/actions/apiary";
import { ApiaryAccessError } from "../../lib/apiary/hives";
import { ValoracionInvalida, ventanaDeValoracion } from "../../lib/apiary/valoracionDeInspeccion";
import { Prisma } from "../../generated/prisma/client";
import { traductorDePrueba } from "../helpers/traductorDePrueba";

const t = traductorDePrueba("Apiary");

function form(campos: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(campos)) data.set(k, v);
  return data;
}
const ENVIO = { fieldSessionId: "visita-1", inspectionId: "insp-1", assessment: "  Colonia fuerte, cría compacta  " };

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "actor" });
  deps.registrar.mockResolvedValue({ origenDeLaVentana: "visita" });
});

describe("registrarValoracionDeInspeccionAction", () => {
  it("llama al servicio con la cuenta y lo escrito, y repinta la visita", async () => {
    await expect(registrarValoracionDeInspeccionAction({}, form(ENVIO))).resolves.toEqual({ ok: true });
    // El texto llega tal cual: recortarlo y convertir el vacío en borrado es del servicio.
    expect(deps.registrar).toHaveBeenCalledWith("actor", { inspectionId: "insp-1", assessment: ENVIO.assessment });
    expect(deps.revalidar).toHaveBeenCalledWith("/field-sessions/visita-1");
  });

  it("vacía, se manda vacía: así borra la que hubiera (ADR-154)", async () => {
    await registrarValoracionDeInspeccionAction({}, form({ ...ENVIO, assessment: "" }));
    expect(deps.registrar).toHaveBeenCalledWith("actor", { inspectionId: "insp-1", assessment: "" });
  });

  it.each(["inspeccion_no_encontrada", "visita_cerrada", "ventana_de_edicion_vencida"])(
    "«%s» vuelve como frase, no como 500",
    async (codigo) => {
      deps.registrar.mockRejectedValue(new ValoracionInvalida(codigo));
      await expect(registrarValoracionDeInspeccionAction({}, form(ENVIO))).resolves.toEqual({ error: t(`valoracionError_${codigo}`) });
      expect(deps.revalidar).not.toHaveBeenCalled();
    },
  );

  it("sin permiso sobre la colmena, también", async () => {
    deps.registrar.mockRejectedValue(new ApiaryAccessError("no_apiary_access"));
    await expect(registrarValoracionDeInspeccionAction({}, form(ENVIO))).resolves.toEqual({ error: t("valoracionError_sin_permiso") });
  });

  it("dos escrituras a la vez (Serializable aborta una, P2034): pide guardar de nuevo", async () => {
    deps.registrar.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("conflicto", { code: "P2034", clientVersion: "7" }));
    await expect(registrarValoracionDeInspeccionAction({}, form(ENVIO))).resolves.toEqual({ error: t("valoracionError_a_la_vez") });
  });

  it("cualquier otro error sigue subiendo: no se disfraza de frase", async () => {
    // Control de que las ramas de arriba no son un `catch` que se lo traga todo.
    deps.registrar.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("otro", { code: "P2002", clientVersion: "7" }));
    await expect(registrarValoracionDeInspeccionAction({}, form(ENVIO))).rejects.toThrow("otro");
  });

  it("sin sesión, al login", async () => {
    deps.user.mockResolvedValue(null);
    await expect(registrarValoracionDeInspeccionAction({}, form(ENVIO))).rejects.toThrow("redirect:/login");
    expect(deps.registrar).not.toHaveBeenCalled();
  });
});

describe("la regla de plazo que comparten el servicio y la pantalla", () => {
  const AHORA = new Date("2026-10-19T12:00:00Z");
  it("abierta, cerrada por decisión y vencida por plazo se dicen distinto", () => {
    expect(ventanaDeValoracion([], AHORA)).toBeNull();
    expect(ventanaDeValoracion([{ status: "completed", editWindowExpiresAt: new Date("2026-10-20T00:00:00Z") }], AHORA)).toBeNull();
    expect(ventanaDeValoracion([{ status: "locked", editWindowExpiresAt: null }], AHORA)).toBe("visita_cerrada");
    expect(ventanaDeValoracion([{ status: "completed", editWindowExpiresAt: new Date("2026-10-19T11:59:59Z") }], AHORA)).toBe(
      "ventana_de_edicion_vencida",
    );
    // `locked` se dice antes que el plazo, como en el servicio: una visita cerrada por decisión no
    // se cuenta como vencida aunque también lo esté.
    expect(ventanaDeValoracion([{ status: "locked", editWindowExpiresAt: new Date("2026-01-01T00:00:00Z") }], AHORA)).toBe("visita_cerrada");
  });
});

describe("la pantalla de la visita la ofrece", () => {
  it("detrás del permiso del servicio y de la misma regla de plazo", () => {
    // La pantalla es de servidor y arrastra la base entera: aquí se lee su fuente. Las dos
    // condiciones son las que hacen que el formulario no prometa lo que el servicio negará.
    const pagina = readFileSync(join(process.cwd(), "app/field-sessions/[id]/page.tsx"), "utf8");
    expect(pagina).toContain('requireApiaryAccess(user.userAccountId, "manage", [{ locationId: session.locationId }])');
    expect(pagina).toContain("const valoracionAbierta = ventanaDeValoracion([session], new Date()) === null;");
    expect(pagina).toMatch(/\{puedeValorar \? \(\s*<section className="nn-section">\s*<h2>\{ta\("valoracionHeading"\)\}<\/h2>/);
    expect(pagina).toMatch(/\{valoracionAbierta \? \(\s*inspecciones\.map\(\(i\) => \(\s*<ValoracionDeInspeccionForm/);
  });
});
