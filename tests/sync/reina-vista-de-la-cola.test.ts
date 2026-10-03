/**
 * **Una mutación vieja de la cola manda `true`/`false`, y tiene que seguir significando lo mismo.**
 * `PENDING_IMPLEMENTATIONS/010`, requisito 4.
 *
 * **Por qué existe.** La columna `queen_sighted` pasó de `Boolean?` a un enum de tres valores, y la
 * migración de la base traduce lo que hubiera: `true` → `vista`, `false` → `no_vista`, `NULL` →
 * `NULL`. Pero la cola offline **no se puede migrar**: vive en el IndexedDB del teléfono de quien
 * capturó, sin red, y puede subir semanas después del despliegue. Así que se traduce al leerla.
 *
 * **Lo que esto guarda no es la conversión: es que las DOS sean la misma.** Si la cola tradujera
 * `true` a otra cosa que la migración, una inspección que subió antes y otra que sube después
 * significarían distinto y nadie lo notaría — las dos tendrían un valor válido.
 *
 * Y el caso que importa de verdad: **`null` NO se convierte a `no_se_busco`**. Con la columna
 * booleana «no se buscó» no se podía decir, así que convertirlo sería inventar que alguien miró la
 * pregunta y decidió no buscar la reina. Es el defecto de `PENDING_IMPLEMENTATIONS/019` con otra
 * cara: una ausencia presentada como un hecho.
 *
 * Hermético: una función pura, sin base y sin red.
 */
import { describe, expect, it } from "vitest";
import { reinaVistaDeLaCola } from "../../lib/sync/pushFieldEvents";

describe("reinaVistaDeLaCola", () => {
  it("traduce los dos booleanos con la MISMA correspondencia que la migración", () => {
    expect(reinaVistaDeLaCola(true)).toBe("vista");
    expect(reinaVistaDeLaCola(false)).toBe("no_vista");
  });

  /**
   * **El caso que este cambio existe para no romper.** Las tres entradas que significan «no se
   * contestó» tienen que salir `null`, y **ninguna** puede salir `no_se_busco`.
   */
  it("lo que no se contestó sigue siendo null, y nunca «no se buscó»", () => {
    expect(reinaVistaDeLaCola(null)).toBeNull();
    expect(reinaVistaDeLaCola(undefined)).toBeNull();
    expect(reinaVistaDeLaCola("")).toBeNull();
    // El control explícito, porque es el error que importa: inventar que alguien miró.
    expect([reinaVistaDeLaCola(null), reinaVistaDeLaCola(undefined), reinaVistaDeLaCola("")])
      .not.toContain("no_se_busco");
  });

  it("una mutación NUEVA ya manda el vocabulario del protocolo, y pasa tal cual", () => {
    expect(reinaVistaDeLaCola("vista")).toBe("vista");
    expect(reinaVistaDeLaCola("no_vista")).toBe("no_vista");
    expect(reinaVistaDeLaCola("no_se_busco")).toBe("no_se_busco");
  });

  /**
   * **No valida, y eso es deliberado: lo valida `estadoDeColonia` en la frontera.** Esta prueba lo
   * fija para que nadie añada aquí una segunda validación —dos sitios que validan lo mismo es cómo
   * se pierde— y para que quien lea el `return` sepa que una cadena rara **no** se silencia aquí:
   * llega al servicio y éste la rechaza con `reina_vista_desconocido`.
   */
  it("una cadena desconocida pasa, para que la rechace quien valida", () => {
    expect(reinaVistaDeLaCola("cualquier_cosa")).toBe("cualquier_cosa");
  });
});
