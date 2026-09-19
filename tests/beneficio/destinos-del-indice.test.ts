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

  it("quien entra a la sección ve Recepción y Pedidos; quien no, no llega aquí", () => {
    expect(hrefs(["lot:view"])).toContain("/beneficio/recepcion");
    expect(hrefs(["lot:view"])).toContain("/beneficio/pedidos");
  });

  it("quien gestiona lotes sí ve Recetas", () => {
    expect(hrefs(["lot:manage"])).toContain("/recipes");
  });

  it("los demás enlaces siguen con su permiso", () => {
    expect(hrefs(["lot:view"])).not.toContain("/instalaciones");
    expect(hrefs(["lot:view", "location:manage_attributes"])).toContain("/instalaciones");
    expect(hrefs(["lot:view", "equipment:view"])).toContain("/equipos");
    expect(hrefs(["lot:view", "location:manage_attributes"])).not.toContain("/beneficio/ajustes");
    expect(hrefs(["lot:view", "location:manage_attributes", "location:create_site"])).toContain("/beneficio/ajustes");
  });
});
