import { describe, expect, it } from "vitest";
import { reconciliarCosecha } from "../../lib/traceability/reconciliacionDeCosecha";

/**
 * La reconciliación de cosecha, extraída de la pantalla para poder probarla.
 *
 * **El defecto que motivó esto (2026-09-05).** `getHarvestSourceContext` pone
 * `alreadyRecordedKg = null` a propósito cuando ningún aporte se pesó —«decir 0
 * sería una afirmación», ADR-080— y el componente hacía `?? 0` para calcular la
 * diferencia. Con tres aportes SIN PESAR y uno nuevo de 120 contra un declarado
 * de 500, la pantalla decía «diferencia: 380 kg» en negrita, que un operador lee
 * como «faltan 380 kg de cereza».
 *
 * Lo encontró la quinta revisión —la de las páginas, la capa que ninguna de las
 * cuatro anteriores había mirado—. El servicio estaba bien; el fallo era que la
 * pantalla deshacía lo que el servicio se molestó en distinguir.
 *
 * Hermético: la regla es pura y no toca base, DOM ni red.
 */
const base = {
  declaredTotalKg: 500,
  alreadyRecordedKg: null as number | null,
  pesosEnPantalla: [] as number[],
  sinPesar: 0,
  ocultos: 0,
};

describe("reconciliación de una cosecha", () => {
  it("sin nada pesado no enseña un total: 0 se leería como «los bloques aportaron cero»", () => {
    const r = reconciliarCosecha(base);
    expect(r.totalDeBloques).toBeNull();
    expect(r.diferenciaKg).toBeNull();
    expect(r.incompleta).toBe(false);
  });

  it("sin peso declarado no hay diferencia que mostrar", () => {
    const r = reconciliarCosecha({ ...base, declaredTotalKg: null, pesosEnPantalla: [120] });
    expect(r.totalDeBloques).toBe(120);
    expect(r.diferenciaKg).toBeNull();
  });

  it("suma lo guardado y lo que se está escribiendo", () => {
    const r = reconciliarCosecha({ ...base, alreadyRecordedKg: 200, pesosEnPantalla: [120, 30] });
    expect(r.totalDeBloques).toBe(350);
    expect(r.diferenciaKg).toBe(150);
  });

  /** EL caso. La diferencia se sigue mostrando, pero deja de mentir por omisión. */
  it("marca la diferencia como incompleta cuando hay aportes sin pesar", () => {
    const r = reconciliarCosecha({ ...base, pesosEnPantalla: [120], sinPesar: 3 });
    expect(r.diferenciaKg, "la diferencia se muestra: verla es el punto del diseño").toBe(380);
    expect(r.incompleta, "…pero no como si contara todo lo que existe").toBe(true);
    expect(r.sinPesar).toBe(3);
  });

  it("y cuando el RBAC oculta aportes, por la misma razón", () => {
    const r = reconciliarCosecha({ ...base, pesosEnPantalla: [120], ocultos: 2 });
    expect(r.diferenciaKg).toBe(380);
    expect(r.incompleta).toBe(true);
    expect(r.ocultos).toBe(2);
  });

  /**
   * Control negativo: sin diferencia que cualificar, la advertencia sería ruido.
   * Sin este caso, `incompleta` podría estar cableada a `sinPesar > 0` y los
   * tests de arriba pasarían igual.
   */
  it("no avisa cuando no hay diferencia que corregir", () => {
    const r = reconciliarCosecha({ ...base, declaredTotalKg: null, pesosEnPantalla: [120], sinPesar: 3 });
    expect(r.diferenciaKg).toBeNull();
    expect(r.incompleta, "sin diferencia, la advertencia no corrige nada").toBe(false);
  });

  it("con todo pesado y nada oculto, la diferencia se muestra sin advertencia", () => {
    const r = reconciliarCosecha({ ...base, alreadyRecordedKg: 380, pesosEnPantalla: [120] });
    expect(r.diferenciaKg).toBe(0);
    expect(r.incompleta).toBe(false);
  });

  it("redondea a gramos y no arrastra basura de coma flotante", () => {
    const r = reconciliarCosecha({ ...base, declaredTotalKg: 0.3, pesosEnPantalla: [0.1, 0.2] });
    expect(r.totalDeBloques).toBe(0.3);
    expect(r.diferenciaKg).toBe(0);
  });
});
