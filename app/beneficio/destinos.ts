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
    // Lotes y el informe son de lectura: los ve quien entra a la sección.
    { href: "/lots", clave: "lotes", visible: true },
    // Recetas, sólo quien gestiona lotes: `listRecipes` exige `manage` sobre un
    // lote. Así estaba en la barra de Lotes antes del #383, y el índice lo perdió.
    { href: "/recipes", clave: "recetas", visible: granted.has("lot:manage") },
    { href: "/reports/proceso", clave: "informe", visible: true },
    { href: "/instalaciones", clave: "instalaciones", visible: granted.has("location:manage_attributes") },
    { href: "/equipos", clave: "equipos", visible: granted.has("equipment:view") },
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
