/**
 * Todo perfil que puede LISTAR lotes tiene que poder ABRIR los que la lista le enseña.
 *
 * **El defecto que vigila, medido el 2026-09-25/26.** `requireLotAccess` —la ficha— pasa la
 * `classification` del lote a `can()`, que exige el permiso `classification:clear_<nivel>` exacto,
 * sin jerarquía (`lib/rbac/resolve.ts`). `lotWhereFromVisibility` —las listas— filtra **sólo** por
 * proyecto y ubicación: `scopeOrClauses` no menciona `classification` en ninguna línea. Las dos
 * mitades pueden discrepar, y se comprobó ejecutando: un lote `confidential` SALE en `getLotList`
 * y su ficha lo DENIEGA, con el lote `internal` de control saliendo y abriendo.
 *
 * **Hoy no ocurre, y por eso esto es un guardia y no un arreglo.** Lo cierran los DATOS, no el
 * código: `CreateLotInput` no acepta `classification`, así que todo lote nace en
 * `DEFAULT_NEW_RECORD_CLASSIFICATION`; y los perfiles que pueden listar limpian ese nivel. Cambiar
 * cualquiera de las dos cosas despierta la fuga **sin que falle nada** — que es exactamente la
 * forma que esta casa persigue. Esta prueba es la que falla en su lugar.
 *
 * **Qué hacer cuando caiga**, para que nadie la silencie: o se le da al perfil nuevo la limpieza
 * del nivel por defecto, o se decide que las listas filtren por `classification` como la ficha
 * —lo segundo toca `/lots`, el panel, la exportación y el reporte de proceso a la vez, así que es
 * decisión del dueño, no del que pasaba por aquí.
 *
 * **`lot:export` va en la lista a propósito.** `lib/traceability/export.ts` recorta con
 * `resolveLotVisibility(…, "export")` y **no re-comprueba por fila**: cero `requireLotAccess` en
 * todo el archivo. Es el camino por donde una fila de más no se queda en la pantalla, sale en un
 * CSV.
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
        `estos perfiles pueden LISTAR lotes pero no abrirlos: la lista se los enseñaría y la ficha ` +
          `se los negaría. Lee la cabecera de este archivo antes de tocar nada.`,
      ).toEqual([]);
    });
  }
});
