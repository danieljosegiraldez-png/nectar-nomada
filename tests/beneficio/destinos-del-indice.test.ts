import { describe, expect, it } from "vitest";
import { destinosDelBeneficio } from "../../app/beneficio/destinos";

/**
 * Qué enlaces ofrece el índice `/beneficio` según los permisos de quien mira.
 *
 * **El fallo que esto guarda, medido el 2026-09-18.** Al mudar la barra de Lotes
 * a este índice (#383), el enlace a Recetas quedó `visible: true`. Antes sólo lo
 * veía quien gestiona lotes (`canManageLots` en `app/lots/page.tsx`), porque
 * `listRecipes` exige `manage` sobre un lote: quien sólo lee lotes llegaba a una
 * pantalla que lo rechaza. Lo encontró la auditoría de Codex.
 */
const hrefs = (permisos: string[]) => destinosDelBeneficio(new Set(permisos)).map((d) => d.href);

describe("los enlaces del índice del beneficio", () => {
  it("quien sólo lee lotes NO ve Recetas", () => {
    const vistos = hrefs(["lot:view"]);
    expect(vistos).not.toContain("/recipes");
    // Control positivo del mismo lector: Lotes y el Informe, que son de lectura, sí.
    expect(vistos).toContain("/lots");
    expect(vistos).toContain("/reports/proceso");
  });

  /**
   * La cola de secado es la pantalla de inicio del operario (Daniel, 2026-09-27), así que se ve con
   * el mismo permiso que abre la sección. Si alguien la mueve detrás de un permiso de instalación,
   * cae esto y no otra cosa.
   */
  it("quien sólo lee lotes SÍ ve la cola de secado, y antes que la lista de lotes", () => {
    const vistos = hrefs(["lot:view"]);
    expect(vistos).toContain("/beneficio/secado");
    expect(vistos.indexOf("/beneficio/secado")).toBeLessThan(vistos.indexOf("/lots"));
  });

  it("quien entra a la sección ve Recepción", () => {
    expect(hrefs(["lot:view"])).toContain("/beneficio/recepcion");
  });

  /**
   * **Decisión de Daniel, 2026-09-27.** A este volumen se recibe lo que salga por parcela o
   * microparcela, **sin pedido de por medio**, así que Recepción es lo que más se usa y Pedidos
   * dejó de competir con ella en el índice. Lo que se consulta mientras se recibe —los abiertos y
   * cerrarlos— vive dentro de Recepción; dar de alta uno sigue en `/beneficio/pedidos`, a la que
   * se llega desde ahí.
   *
   * Esto fija la decisión en vez de sólo satisfacerla: si alguien devuelve la entrada al índice,
   * cae **este** test y no otro.
   */
  it("y NO ve Pedidos: salió del índice, con cualquier permiso", () => {
    for (const permisos of [["lot:view"], ["lot:manage"], ["lot:view", "lot:manage", "location:manage_attributes", "location:create_site", "equipment:view"]]) {
      expect(hrefs(permisos), `con ${permisos.join("+")}`).not.toContain("/beneficio/pedidos");
    }
    // Control positivo del mismo conjunto de permisos: Recepción sí sigue, así que el `not.toContain`
    // no está pasando sobre una lista vacía.
    expect(hrefs(["lot:view"])).toContain("/beneficio/recepcion");
  });

  it("quien gestiona lotes sí ve Recetas", () => {
    expect(hrefs(["lot:manage"])).toContain("/recipes");
  });

  it("los demás enlaces siguen con su permiso", () => {
    expect(hrefs(["lot:view"])).not.toContain("/instalaciones");
    expect(hrefs(["lot:view", "location:manage_attributes"])).toContain("/instalaciones");
    expect(hrefs(["lot:view", "equipment:view"])).toContain("/equipos");
    // Tarea 5 del plan 2a: bandejas cuelga del mismo permiso que equipos.
    expect(hrefs(["lot:view"])).not.toContain("/beneficio/bandejas");
    expect(hrefs(["lot:view", "equipment:view"])).toContain("/beneficio/bandejas");
    expect(hrefs(["lot:view", "location:manage_attributes"])).not.toContain("/beneficio/ajustes");
    expect(hrefs(["lot:view", "location:manage_attributes", "location:create_site"])).toContain("/beneficio/ajustes");
  });
});
