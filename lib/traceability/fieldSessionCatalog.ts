/**
 * El vocabulario de tipos de evento de campo, del catálogo y no de una lista
 * escrita a mano.
 *
 * **Filtra por `catalog.key`, no por el nombre visible**, porque eso es contra
 * lo que `recordFieldEvent` valida cuando rechaza `event_kind_wrong_catalog`.
 * Filtrar por nombre dejaría el desplegable y la validación mirando cosas
 * distintas: el nombre es texto de interfaz y puede cambiar o traducirse, y el
 * día que cambiara, este formulario ofrecería valores que el servicio rechaza
 * — un fallo que sólo aparecería al enviar.
 *
 * Vive aparte de `fieldSessions.ts` porque es una lectura sin sujeto: no hay
 * jornada ni ubicación contra la que comprobar permisos, y meterla ahí
 * obligaría a inventarle una compuerta o a dejarla sin ella entre funciones que
 * sí la tienen.
 */
import { prisma } from "../db";

/** El mismo valor que exige `recordFieldEvent`. */
export const FIELD_EVENT_CATALOG_KEY = "event_kind";

export async function getFieldEventKinds() {
  return prisma.variableCatalogValue.findMany({
    where: { catalog: { key: FIELD_EVENT_CATALOG_KEY }, aliasOfId: null },
    select: { id: true, value: true },
    orderBy: { value: "asc" },
  });
}

/**
 * Spec jornada y entrega §3.5 — los valores de `condicion_del_dia` (lluvia, neblina, otro), el
 * mismo catálogo contra el que valida `reportarCondicionDelDia`. Lectura sin sujeto, como la de
 * arriba.
 */
export async function getCondicionesDelDia() {
  return prisma.variableCatalogValue.findMany({
    where: { catalog: { key: "condicion_del_dia" }, aliasOfId: null },
    select: { id: true, value: true },
    orderBy: { value: "asc" },
  });
}
