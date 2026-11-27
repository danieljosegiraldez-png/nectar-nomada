/**
 * Todo perfil que puede LISTAR lotes tiene que poder ver los lotes que se crean.
 *
 * **CORREGIDO EL 2026-10-14: lo que esto vigila ya no es una fuga.** Nació el 2026-09-25/26 para
 * una divergencia medida: la ficha (`requireLotAccess`) pasa la `classification` a `can()` y las
 * listas filtraban sólo por proyecto y ubicación, así que un lote `confidential` SALÍA en
 * `getLotList` y su ficha lo DENEGABA. Estaba dormida porque todo lote nace en
 * `DEFAULT_NEW_RECORD_CLASSIFICATION`, y esta prueba era la que caía si eso cambiaba.
 *
 * Daniel decidió cerrarla de raíz (`PENDING_IMPLEMENTATIONS/014`, ADR-063): desde ese día las listas
 * filtran por los niveles que la cuenta limpia en cada objetivo, con la misma regla que `can()`. Lo
 * prueba `tests/traceability/laListaVeLoQueVeCan.test.ts`. Así que un perfil que lista lotes sin
 * limpiar el nivel por defecto ya no ve de más: **no ve nada** de lo que se crea, ni en la lista ni
 * en la ficha. Eso es lo que esta prueba sigue impidiendo — un perfil de lectura que entrega una
 * pantalla vacía, que es la forma en que Project Viewer pasó semanas sin clearance (ADR-063).
 *
 * **`lot:export` va en la lista a propósito**: exportar es listar a un archivo, con la misma
 * visibilidad (`resolveLotVisibility(…, "export")`).
 */
import { describe, expect, it } from "vitest";
import { ROLE_PROFILES } from "../../lib/rbac/catalog";
import { DEFAULT_NEW_RECORD_CLASSIFICATION } from "../../lib/traceability/lots";

/** Las acciones cuyo alcance sale de `resolveLotVisibility`, o sea de una LISTA. */
const ACCIONES_QUE_LISTAN = ["view", "export"] as const;

function concede(perfil: (typeof ROLE_PROFILES)[number], resourceType: string, action: string) {
  return perfil.permissions.some(([r, a]) => r === resourceType && a === action);
}

describe("quien puede listar lotes limpia la clasificación con la que nacen", () => {
  it("el nivel por defecto sigue siendo `internal`", () => {
    // Si sube, la lista de perfiles de abajo deja de ser la pregunta correcta y hay que rehacerla.
    expect(DEFAULT_NEW_RECORD_CLASSIFICATION).toBe("internal");
  });

  for (const action of ACCIONES_QUE_LISTAN) {
    it(`todo perfil con lot:${action} limpia ${DEFAULT_NEW_RECORD_CLASSIFICATION}`, () => {
      const queListan = ROLE_PROFILES.filter((p) => concede(p, "lot", action));

      // **Control positivo, y no es adorno.** Sin él, un día en que el catálogo cambie de forma
      // —o en que este filtro deje de casar— la prueba recorrería una lista vacía y saldría verde
      // afirmando exactamente lo contrario de lo que comprueba.
      expect(queListan.length, `ningún perfil concede lot:${action}: la prueba no está midiendo nada`)
        .toBeGreaterThan(0);

      const sinLimpieza = queListan
        .filter((p) => !concede(p, "classification", `clear_${DEFAULT_NEW_RECORD_CLASSIFICATION}`))
        .map((p) => p.name);

      expect(
        sinLimpieza,
        `estos perfiles pueden LISTAR lotes pero no limpian el nivel con el que nacen: su lista y su ` +
          `ficha saldrían vacías. Lee la cabecera de este archivo antes de tocar nada.`,
      ).toEqual([]);
    });
  }
});
