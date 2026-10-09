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
    // Recetas, sólo quien gestiona lotes (`lot:manage`). Así estaba en la barra de Lotes antes del #383, y el índice lo perdió. Ya no es lo único que abre
    // `/recipes`: desde la Parte 2a `listRecipes` también la abre a quien puede ESCRIBIR recetas (`puedeAutoriaDeReceta`: el Coffee Process Manager, que no lleva
    // `lot:manage`). A esa persona este índice no le ofrece el enlace, y el botón de `/lots` tampoco (también pide `lot:manage`): llega a `/recipes` si escribe la
    // dirección, y ningún menú la lleva ahí. Si se le ofrece es decisión de Daniel.
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

/**
 * El reparto del índice **por frecuencia de uso del operador** (ADR-193).
 *
 * Tres grupos, y los tres salen de lo que Daniel dijo: lo que se hace arriba, lo que se consulta
 * en medio, y la configuración abajo — «todo lo de abajo es ajustes o vista… lo frecuente para un
 * operador manda sobre definir parámetros o dar de alta».
 *
 * **Vivía dentro del JSX de `page.tsx` y estaba roto:** filtraba por `recepcion` **o `pedidos`**,
 * y `pedidos` salió del índice con ADR-192, así que «Operaciones» tenía UN enlace y
 * «Herramientas» los otros ocho — incluida la cola de secado, que es la pantalla de inicio del
 * operario de secado (Daniel, 2026-09-27). Aquí es una función pura, y por eso tiene prueba.
 *
 * **Se reparte por listas nombradas y el resto cae en configuración**, no al revés: así un
 * destino nuevo aparece abajo —donde estorba menos— en vez de colarse arriba sin que nadie lo
 * decida, y la prueba comprueba que ninguno se pierde ni se duplica.
 */
const OPERACIONES: readonly string[] = ["/beneficio/recepcion", "/beneficio/secado"];
const CONSULTAR: readonly string[] = ["/lots", "/reports/proceso"];

type Destinos = ReturnType<typeof destinosDelBeneficio>;

export function repartirDestinos(destinos: Destinos): {
  readonly operaciones: Destinos;
  readonly consultar: Destinos;
  readonly herramientas: Destinos;
} {
  const enOrden = (lista: readonly string[]) =>
    lista.flatMap((href) => destinos.filter((d) => d.href === href));
  return {
    operaciones: enOrden(OPERACIONES),
    consultar: enOrden(CONSULTAR),
    herramientas: destinos.filter(
      (d) => !OPERACIONES.includes(d.href) && !CONSULTAR.includes(d.href),
    ),
  };
}
