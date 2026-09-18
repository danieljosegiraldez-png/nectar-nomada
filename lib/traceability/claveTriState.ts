/**
 * La clave i18n de un booleano opcional — sí / no / sin registrar (ADR-080:
 * `null` nunca se muestra como 0 ni como «no»).
 *
 * F2 fix-final (PR #413) lo escribió como `estadoTri`, una función local sin
 * exportar dentro de `app/plots/[id]/page.tsx`. La Tarea 3 de vistas de finca
 * y parcela la quitó como huérfana al mover la sección de trampas a su
 * pestaña — y con la función se fue también los datos que mostraba
 * (conteo, otros insectos, mantenimiento, observador), una regresión sobre
 * el propio F2. Fix round 1 de la revisión de esa tarea: se restaura aquí,
 * como función pura y exportada en `lib/`, para que un test la ejerza sin
 * pasarle `t()` — antes el llamador pasaba la función de traducción y sólo
 * se podía comprobar renderizando la página entera.
 */
export function claveTriState(v: boolean | null): "triStateYes" | "triStateNo" | "notRecorded" {
  return v === true ? "triStateYes" : v === false ? "triStateNo" : "notRecorded";
}
