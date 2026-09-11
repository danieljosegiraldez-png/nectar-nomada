/**
 * Las irregularidades de inspección: el vocabulario, y el reporte que lo
 * justifica.
 *
 * **Por qué existe el reporte y no sólo el vocabulario.** Un catálogo sin nadie
 * que lo consulte es la misma cadena de texto con más pasos. El Anexo B §2.3
 * dice qué pregunta hay que poder contestar —*«todas las colonias con varroa
 * esta temporada»*— así que `coloniasPorIrregularidad` es el motivo del cambio,
 * no un extra.
 *
 * Mismo molde que `origenDeColonia.ts` y `causaDePerdida.ts`: filtra por
 * `catalog.key` —el nombre visible es texto de interfaz y puede cambiar— y vive
 * aparte de `inspections.ts` porque son **lecturas sin sujeto**, sin colonia ni
 * ubicación contra la que comprobar permisos. Quien llama ya obtuvo el
 * `locationId` de una lectura que sí autoriza.
 */
import { prisma } from "../db";

/** La misma clave que siembra `VARIABLE_CATALOGS` en `lib/research/catalogs.ts`. */
export const CATALOGO_DE_IRREGULARIDAD = "irregularidad_de_inspeccion";

export async function irregularidadesOfrecidas() {
  return prisma.variableCatalogValue.findMany({
    where: { catalog: { key: CATALOGO_DE_IRREGULARIDAD }, aliasOfId: null },
    select: { id: true, value: true, definition: true },
    orderBy: [{ displayOrder: "asc" }, { value: "asc" }],
  });
}

export interface ConteoDeIrregularidad {
  valueId: string;
  value: string;
  /** Inspecciones en que se marcó, dentro de la ventana. */
  inspecciones: number;
  /**
   * Colonias DISTINTAS afectadas. Es el número que el Anexo B pide: tres
   * inspecciones de la misma colmena con varroa son un problema, no tres.
   */
  colonias: number;
}

/**
 * Cuántas colonias de un sitio presentaron cada irregularidad en una ventana.
 *
 * **No pide un principal y no autoriza**, misma disciplina que
 * `vitalesDeSitios` y `leerEnmiendas`: un lector que pide principal parece una
 * compuerta y termina usándose como tal. Quien llama ya pasó el `locationId`
 * por `getApiaryDetail`.
 *
 * **Devuelve las trece filas, también las que valen cero.** Un reporte que sólo
 * enseña lo encontrado no distingue «no hay varroa» de «nadie miró varroa», y
 * ésa es justo la diferencia que el dueño necesita ver.
 */
export async function coloniasPorIrregularidad(
  locationId: string,
  desde: Date,
  hasta: Date,
): Promise<ConteoDeIrregularidad[]> {
  const [vocabulario, marcas] = await Promise.all([
    irregularidadesOfrecidas(),
    prisma.inspectionIrregularity.findMany({
      where: {
        inspection: {
          occurredAt: { gte: desde, lt: hasta },
          colony: { hive: { locationId } },
        },
      },
      select: { valueId: true, inspectionId: true, inspection: { select: { colonyId: true } } },
    }),
  ]);

  const porValor = new Map<string, { inspecciones: Set<string>; colonias: Set<string> }>();
  for (const m of marcas) {
    const acc = porValor.get(m.valueId) ?? { inspecciones: new Set<string>(), colonias: new Set<string>() };
    acc.inspecciones.add(m.inspectionId);
    acc.colonias.add(m.inspection.colonyId);
    porValor.set(m.valueId, acc);
  }

  return vocabulario.map((v) => ({
    valueId: v.id,
    value: v.value,
    inspecciones: porValor.get(v.id)?.inspecciones.size ?? 0,
    colonias: porValor.get(v.id)?.colonias.size ?? 0,
  }));
}
