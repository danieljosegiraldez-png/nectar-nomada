import { describe, expect, it } from "vitest";

import { PERFILES } from "../../lib/beneficio/perfiles";

/**
 * Los dos umbrales del reposo viven en el perfil de beneficio, junto a los de
 * pH y Brix que ya estaban ahí — no en una constante suelta. Spec §A.1.
 *
 * **Los números son `[PROVISIONAL]`.** Salen de lo que Daniel dio de memoria el
 * 2026-09-16 y `P-F` sigue abierta, así que estas pruebas NO guardan los
 * valores: guardan la relación entre ellos, que es lo que el diseño sostiene.
 */
describe("el perfil de reposo", () => {
  it("los perfiles con umbrales declaran sus dos días", () => {
    for (const clave of ["WASHED_STANDARD", "NATURAL"] as const) {
      const r = PERFILES[clave].reposo;
      expect(r, `${clave} no declara reposo`).toBeTruthy();
      expect(r!.diasParaMuestra).toBeGreaterThan(0);
      expect(r!.diasParaVenta).toBeGreaterThan(0);
    }
  });

  it("muestra SIEMPRE antes que venta, que es lo que las hace dos compuertas", () => {
    // Si alguien invierte estos números, la venta se habilitaría antes que la
    // muestra y el diseño entero deja de tener sentido: no se puede cerrar una
    // venta sin haber tostado y catado una muestra primero. Éste es el guardia
    // de esa inversión, no una comprobación de rango.
    for (const clave of ["WASHED_STANDARD", "NATURAL"] as const) {
      const r = PERFILES[clave].reposo!;
      expect(r.diasParaMuestra, clave).toBeLessThan(r.diasParaVenta);
    }
  });

  it("lavado pide más reposo que natural — la diferencia que Daniel describió", () => {
    // «lavado 60–90 días; natural Catuaí óptimo entre 45 y 60». Si alguien
    // iguala los dos perfiles, se pierde la única distinción que hoy tienen.
    expect(PERFILES.WASHED_STANDARD.reposo!.diasParaVenta)
      .toBeGreaterThan(PERFILES.NATURAL.reposo!.diasParaVenta);
  });
});
