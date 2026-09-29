/**
 * Los enlaces del índice `/beneficio`, según los permisos de quien mira
 * (`permissionKeysAnywhere`). Función pura para que una prueba pueda decir qué ve
 * cada perfil; la página sólo los pinta.
 *
 * `clave` es la del namespace `SeccionBeneficio`: la página pinta `t(clave)` y
 * `t(`${clave}Ayuda`)`.
 */
export function destinosDelBeneficio(granted: Set<string>) {
  return [
    // Spec recepción de cereza §4: la entrada del beneficio. Ver pendientes y lo recibido pide
    // `lot:view` sobre el beneficio; recibir y pedir, `lot:manage`, que exige cada servicio.
    { href: "/beneficio/recepcion", clave: "recepcion", visible: true },
    // **Pedidos ya NO es una entrada del índice. Decisión de Daniel, 2026-09-27.** A este volumen
    // se recibe lo que salga por parcela o microparcela, **sin pedido de por medio**, y forzar uno
    // sobraba: recepción es lo que más se usa y el pedido es opcional —`pedidoId` es
    // `string | null` en `recibirCereza`, y las dos entradas de `RecibirCerezaForm` pasan los
    // pedidos abiertos como lista para elegir, no como requisito—.
    //
    // Lo que se consulta MIENTRAS se recibe —los pedidos abiertos con sus cifras, y cerrarlos—
    // vive ahora dentro de `/beneficio/recepcion`. `/beneficio/pedidos` sigue existiendo para dar
    // de alta uno y ver el histórico, y se llega desde ahí. Que no esté aquí lo fija
    // `tests/beneficio/destinos-del-indice.test.ts`.
    // Lotes y el informe son de lectura: los ve quien entra a la sección.
    // La cola de secado va ANTES de la lista de lotes: es la pantalla de inicio del operario de
    // secado (Daniel, 2026-09-27), y `/lots` es la lista general. Se ve con `lot:view`, como la
    // sección: la cola misma sólo trae lo que la visibilidad de lotes alcanza.
    { href: "/beneficio/secado", clave: "secado", visible: true },
    { href: "/lots", clave: "lotes", visible: true },
    // Recetas, sólo quien gestiona lotes: `listRecipes` exige `manage` sobre un
    // lote. Así estaba en la barra de Lotes antes del #383, y el índice lo perdió.
    { href: "/recipes", clave: "recetas", visible: granted.has("lot:manage") },
    { href: "/reports/proceso", clave: "informe", visible: true },
    { href: "/instalaciones", clave: "instalaciones", visible: granted.has("location:manage_attributes") },
    { href: "/equipos", clave: "equipos", visible: granted.has("equipment:view") },
    { href: "/beneficio/bandejas", clave: "bandejas", visible: granted.has("equipment:view") },
    {
      href: "/beneficio/ajustes",
      clave: "ajustes",
      // Los mismos dos permisos que exige el servicio de ajustes, pero preguntados
      // en CUALQUIER asignación, no juntos sobre el mismo sitio como hace el
      // servicio. Pueden divergir con overrides por asignación; si divergen, la
      // pantalla de ajustes responde 404 y ése es el respaldo.
      visible: granted.has("location:manage_attributes") && granted.has("location:create_site"),
    },
  ].filter((d) => d.visible);
}
