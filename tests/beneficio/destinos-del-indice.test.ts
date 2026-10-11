import { describe, expect, it } from "vitest";
import { destinosDelBeneficio, repartirDestinos } from "../../app/beneficio/destinos";

/**
 * Qué enlaces ofrece el índice `/beneficio` según los permisos de quien mira.
 *
 * **El fallo que esto guarda, medido el 2026-09-18.** Al mudar la barra de Lotes
 * a este índice (#383), el enlace a Recetas quedó `visible: true`. Antes sólo lo
 * veía quien gestiona lotes (`canManageLots` en `app/lots/page.tsx`), porque
 * `listRecipes` exige `manage` sobre un lote: quien sólo lee lotes llegaba a una
 * pantalla que lo rechaza. Lo encontró la auditoría de Codex.
 *
 * **Y desde el 2026-10-10 Recetas ya no cuelga de `lot:manage`** (PENDING_IMPLEMENTATIONS/027): la
 * lista la decide `puedeCrearRecetaEnAlguna`, y el índice recibe ese mismo booleano en vez de
 * deducirlo de un permiso suelto. `hrefs` lo deja en `false` salvo que la prueba diga otra cosa.
 */
const hrefs = (permisos: string[], puedeVerRecetas = false) =>
  destinosDelBeneficio(new Set(permisos), puedeVerRecetas).map((d) => d.href);

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

  /**
   * Recetas sigue la regla de la lista, no un permiso. Las dos mitades hacen falta: con sólo la
   * primera, quitar el enlace del todo pasaría; con sólo la segunda, volver a `lot:manage` pasaría
   * si la prueba no le niega la regla a quien tiene ese permiso.
   */
  it("Recetas sale de la regla de crear recetas, no de lot:manage", () => {
    // Un Farm Operator: gestiona lotes y no puede crear una receta en ninguna parte.
    expect(hrefs(["lot:view", "lot:manage"], false)).not.toContain("/recipes");
    expect(hrefs(["lot:view"], true)).toContain("/recipes");
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

/**
 * El reparto del índice, por frecuencia de uso del operador (ADR-193).
 *
 * **Hasta hoy el reparto vivía DENTRO del JSX** de `app/beneficio/page.tsx`, así que ninguna
 * prueba podía llamarlo — y estaba roto: filtraba por `recepcion` **o `pedidos`**, y `pedidos`
 * salió del índice con ADR-192, así que «Operaciones» tenía UN enlace y «Herramientas» los otros
 * ocho, incluida la cola de secado, que es la pantalla de inicio del operario de secado (Daniel,
 * 2026-09-27). Extraerlo a función pura es lo que permite fijarlo.
 */
describe("repartirDestinos", () => {
  const TODOS = new Set([
    "lot:view",
    "lot:manage",
    "location:manage_attributes",
    "location:create_site",
    "equipment:view",
  ]);

  it("el secado es OPERACIÓN, no herramienta", () => {
    const { operaciones } = repartirDestinos(destinosDelBeneficio(TODOS, true));
    expect(operaciones.map((d) => d.href)).toContain("/beneficio/secado");
  });

  it("recepción y secado son las dos operaciones, y sólo ésas", () => {
    const { operaciones } = repartirDestinos(destinosDelBeneficio(TODOS, true));
    expect(operaciones.map((d) => d.href)).toEqual(["/beneficio/recepcion", "/beneficio/secado"]);
  });

  it("los lotes y el informe son de CONSULTAR, no de configurar", () => {
    const { consultar } = repartirDestinos(destinosDelBeneficio(TODOS, true));
    expect(consultar.map((d) => d.href)).toEqual(["/lots", "/reports/proceso"]);
  });

  it("los ajustes y el resto de la configuración van abajo", () => {
    const { herramientas } = repartirDestinos(destinosDelBeneficio(TODOS, true));
    expect(herramientas.map((d) => d.href)).toContain("/beneficio/ajustes");
    expect(herramientas.map((d) => d.href)).toContain("/equipos");
    expect(herramientas.map((d) => d.href)).not.toContain("/beneficio/recepcion");
  });

  it("ningún destino se pierde ni se duplica en el reparto", () => {
    const destinos = destinosDelBeneficio(TODOS, true);
    const r = repartirDestinos(destinos);
    const repartidos = [...r.operaciones, ...r.consultar, ...r.herramientas].map((d) => d.href);
    expect(repartidos.length).toBe(destinos.length);
    expect(new Set(repartidos).size).toBe(destinos.length);
  });

  it("un perfil que no ve equipos ni ajustes reparte lo que le queda, sin huecos", () => {
    const destinos = destinosDelBeneficio(new Set(["lot:view"]), false);
    const r = repartirDestinos(destinos);
    const repartidos = [...r.operaciones, ...r.consultar, ...r.herramientas];
    expect(repartidos).toHaveLength(destinos.length);
    expect(r.herramientas.map((d) => d.href)).not.toContain("/beneficio/ajustes");
  });
});
