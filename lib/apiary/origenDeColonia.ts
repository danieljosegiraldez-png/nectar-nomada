/**
 * A9.10 (D6) — el vocabulario de orígenes de colonia, del catálogo y no de una
 * lista escrita a mano.
 *
 * **Filtra por `catalog.key`, no por el nombre visible**, por la misma razón que
 * `getFieldEventKinds`: el nombre es texto de interfaz, puede cambiar o
 * traducirse, y el día que cambiara este desplegable ofrecería valores que no
 * existen. La clave es lo que el catálogo garantiza único.
 *
 * Vive aparte de `hives.ts` porque es una **lectura sin sujeto**: no hay colonia
 * ni ubicación contra la que comprobar permisos, y meterla ahí la dejaría sin
 * compuerta entre funciones que sí la tienen — o forzaría a inventarle una.
 *
 * `aliasOfId: null` deja fuera los alias: apuntan a una fila canónica y
 * ofrecerlos duplicaría la misma opción con dos nombres.
 */
import { prisma } from "../db";

/** La misma clave que siembra `VARIABLE_CATALOGS` en `lib/research/catalogs.ts`. */
export const CATALOGO_DE_ORIGEN_DE_COLONIA = "origen_de_colonia";

export async function origenesDeColonia() {
  return prisma.variableCatalogValue.findMany({
    where: { catalog: { key: CATALOGO_DE_ORIGEN_DE_COLONIA }, aliasOfId: null },
    select: { id: true, value: true },
    orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
  });
}
