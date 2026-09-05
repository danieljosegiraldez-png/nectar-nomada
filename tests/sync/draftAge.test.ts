import { describe, expect, it } from "vitest";
import {
  classifyDraftAge,
  STALE_WARNING_DAYS,
  STALE_PURGE_DAYS,
} from "../../lib/sync/draftAge";
import * as apiario from "../../lib/apiary/offlineQueue";

/**
 * P4 §10. La regla de edad, en su casa nueva.
 *
 * **Qué defiende esto que el test de apiario no defendía:** que las DOS colas
 * usan la misma regla. Antes había una sola cola y sus tests bastaban; ahora
 * hay dos, y dos copias de «7 y 21» se pueden separar sin que nadie lo note —
 * dos ventanas de exposición distintas para el mismo riesgo, y ninguna de las
 * dos evidente desde fuera.
 *
 * Hermético: la regla es pura y decide, no borra.
 */
const DIA = 24 * 60 * 60 * 1000;
const AHORA = 1_700_000_000_000;
const conEdad = (dias: number) => classifyDraftAge(AHORA - dias * DIA, AHORA);

describe("la regla de edad de un borrador", () => {
  /**
   * El invariante que la hace humana, heredado de A5.5: **se avisa antes de
   * borrar**. Si el aviso llegara a la vez que la purga, el borrado caería sin
   * que nadie hubiera visto una advertencia — y lo que se pierde es trabajo de
   * campo que no está en ningún otro sitio.
   */
  it("avisa antes de purgar", () => {
    expect(STALE_WARNING_DAYS).toBeLessThan(STALE_PURGE_DAYS);
    expect(STALE_WARNING_DAYS).toBeGreaterThan(0);
  });

  it("conserva lo reciente, avisa en la ventana, purga pasado el corte", () => {
    expect(conEdad(0)).toBe("keep");
    expect(conEdad(STALE_WARNING_DAYS - 0.1)).toBe("keep");
    expect(conEdad(STALE_WARNING_DAYS)).toBe("warn");
    expect(conEdad(STALE_PURGE_DAYS - 0.1)).toBe("warn");
    expect(conEdad(STALE_PURGE_DAYS)).toBe("purge");
    expect(conEdad(STALE_PURGE_DAYS + 100)).toBe("purge");
  });

  /**
   * LA razón de que este archivo exista. Apiario re-exporta desde aquí; si
   * alguien volviera a definir la regla allí, esto lo dice.
   */
  it("las dos colas usan exactamente la misma regla, no una copia", () => {
    expect(apiario.STALE_WARNING_DAYS).toBe(STALE_WARNING_DAYS);
    expect(apiario.STALE_PURGE_DAYS).toBe(STALE_PURGE_DAYS);
    expect(apiario.classifyDraftAge, "misma función, no una equivalente").toBe(classifyDraftAge);
  });
});
