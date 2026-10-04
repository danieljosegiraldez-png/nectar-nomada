/**
 * Las cuatro acciones de existencias: el tramo «formulario → servicio».
 *
 * **El servicio ya está probado y no se vuelve a probar aquí.**
 * `tests/inventario/negativo.test.ts` cubre que cuadrar exige razón —en el
 * servicio y en la base—, que botar y perder la exigen, y la aritmética;
 * `tests/inventario/existencias.test.ts` cubre el saldo derivado y el permiso de
 * lectura. Contarlas otra vez las contaría dos veces.
 *
 * **Lo que NO estaba cubierto es este tramo**, y es donde esta casa ya se cortó:
 * la acción que crea una muestra no manda `massAtExtraction`, así que el tueste
 * desde muestra revienta con un error sin traducir — medido el 2026-10-04. Una
 * acción que se deja un campo no falla al escribirse: falla mucho después, en una
 * pantalla distinta. Por eso cada caso afirma el OBJETO ENTERO que llega al
 * servicio, no sólo que se llamó.
 *
 * Hermético, con el patrón de `tests/territorio/accionesDeLaRejilla.test.ts`: se
 * mockean la sesión, el servicio, `next/cache`, `next/navigation` y
 * `getTranslations`, y se importa la acción de verdad. No toca la base, así que
 * corre en `scripts/ci.sh` y NO va al grupo `base-sembrada`.
 *
 * `getTranslations` devuelve la clave y sus parámetros en vez de la frase: lo que
 * se vigila es qué clave se elige y con qué valores, no la redacción.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// La clase va DENTRO de `vi.hoisted`: `vi.mock` se eleva, y una clase declarada
// fuera todavía no existe cuando la factoría corre — vitest lo reporta como
// «no tests», que se lee igual que «no falló».
const deps = vi.hoisted(() => ({
  user: vi.fn(),
  registrarConteo: vi.fn(),
  reconciliar: vi.fn(),
  registrarMerma: vi.fn(),
  registrarPerdida: vi.fn(),
  revalidate: vi.fn(),
  ExistenciasError: class extends Error {},
}));

vi.mock("../../lib/auth/session", () => ({ getCurrentUser: deps.user }));
vi.mock("../../lib/inventario/existencias", () => ({
  registrarConteo: deps.registrarConteo,
  reconciliar: deps.reconciliar,
  registrarMerma: deps.registrarMerma,
  registrarPerdida: deps.registrarPerdida,
  ExistenciasError: deps.ExistenciasError,
  // El módulo exporta más cosas que otros importan: un mock incompleto rompe la
  // CARGA y vitest dice «no tests».
  existencias: vi.fn(),
  saldoDeEventos: () => ({}),
  registrarConsumo: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: deps.revalidate }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("next-intl/server", () => ({
  getTranslations: () =>
    Promise.resolve((clave: string, params?: Record<string, unknown>) =>
      params ? `${clave}|${JSON.stringify(params)}` : clave,
    ),
}));

import {
  botarFormAction,
  contarFormAction,
  cuadrarFormAction,
  perderFormAction,
} from "../../app/actions/existencias";

const datos = (pares: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(pares)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  deps.user.mockResolvedValue({ userAccountId: "cuenta-1" });
});

describe("cada acción manda al servicio lo que el formulario trae", () => {
  it("contar manda cantidad y unidad", async () => {
    await contarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "12.5", unit: "kg" }));
    expect(deps.registrarConteo).toHaveBeenCalledWith("cuenta-1", {
      consumableLotId: "lote-1",
      quantity: 12.5,
      unit: "kg",
    });
  });

  /**
   * **El caso que vigila el campo que se cae.** Si la acción se dejara `reason`,
   * el servicio lo rechazaría con «una reconciliación sin razón no se puede
   * auditar» y el operario vería un error que no entiende, habiendo escrito la
   * razón. Y si se dejara `direccion`, cuadrar un sobrante restaría en vez de sumar.
   */
  it("cuadrar manda la razón Y la dirección", async () => {
    await cuadrarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "3", unit: "kg", reason: "apareció un bidón", direccion: "alza" }));
    expect(deps.reconciliar).toHaveBeenCalledWith("cuenta-1", {
      consumableLotId: "lote-1",
      quantity: 3,
      unit: "kg",
      reason: "apareció un bidón",
      direccion: "alza",
    });
  });

  it("y cuadrar a la baja manda «baja», no el valor por defecto", async () => {
    await cuadrarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "2", unit: "kg", reason: "se derramó", direccion: "baja" }));
    expect(deps.reconciliar).toHaveBeenCalledWith("cuenta-1", expect.objectContaining({ direccion: "baja" }));
  });

  it("botar manda el motivo", async () => {
    await botarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "1", unit: "frasco", reason: "vencido" }));
    expect(deps.registrarMerma).toHaveBeenCalledWith("cuenta-1", {
      consumableLotId: "lote-1",
      quantity: 1,
      unit: "frasco",
      reason: "vencido",
    });
  });

  it("perder manda el motivo, y llama a SU servicio y no al de botar", async () => {
    await perderFormAction({}, datos({ consumableLotId: "lote-1", quantity: "1", unit: "frasco", reason: "no apareció en la bodega" }));
    expect(deps.registrarPerdida).toHaveBeenCalledWith("cuenta-1", expect.objectContaining({ reason: "no apareció en la bodega" }));
    // El control: botar y perder son eventos distintos, y confundirlos no falla en rojo.
    expect(deps.registrarMerma, "perder no debe llamar a botar").not.toHaveBeenCalled();
  });
});

describe("lo que vuelve a la pantalla", () => {
  it("un error del servicio vuelve traducido, no reventado", async () => {
    deps.reconciliar.mockRejectedValueOnce(new deps.ExistenciasError("una reconciliación sin razón no se puede auditar"));
    const r = await cuadrarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "1", unit: "kg", reason: "", direccion: "alza" }));
    expect(r.error, "la clave y su detalle, no un 500").toContain("error_existencias");
    expect(r.error).toContain("no se puede auditar");
  });

  it("el camino bueno no deja error y repinta la lista", async () => {
    const r = await contarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "4", unit: "kg" }));
    expect(r.error).toBeUndefined();
    expect(deps.revalidate).toHaveBeenCalledWith("/inventario");
  });

  /** Sin sesión no se escribe nada: la acción corta antes de tocar el servicio. */
  it("sin sesión no llama al servicio", async () => {
    deps.user.mockResolvedValueOnce(null);
    await expect(contarFormAction({}, datos({ consumableLotId: "lote-1", quantity: "1", unit: "kg" }))).rejects.toThrow(/redirect:\/login/);
    expect(deps.registrarConteo).not.toHaveBeenCalled();
  });
});
