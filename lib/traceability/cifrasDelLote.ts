import type { EstadoDeProduccion } from "./estadoDeProduccion";

/**
 * Las cifras del estado del lote — tablero de parcela, spec §3.2.
 *
 * **Un conteo ausente nunca suma 0 en silencio (ADR-080).** Se suman sólo las
 * plantas conocidas y se cuentan aparte las siembras sin conteo, para que la
 * pantalla diga «al menos N» en vez de un total que parece medido.
 *
 * Lo mismo por estado: `enProduccion` y `sinMarcar` son plantas CONOCIDAS, y
 * al lado van cuántas siembras hay en ese estado y cuántas no tienen conteo.
 * Sin eso, una siembra marcada sin conteo pintaba «en producción: 0».
 *
 * Recibe SÓLO siembras activas: filtrarlas es cosa de quien llama, igual que
 * hace la página con `status === "active"`.
 */
export interface CohorteParaCifras {
  id: string;
  plantCount: number | null;
  cultivarValue: { value: string } | null;
}

export interface CifrasDelLote {
  plantasConocidas: number;
  cohortesSinConteo: number;
  /** Plantas CONOCIDAS de siembras en producción. */
  enProduccion: number;
  siembrasEnProduccion: number;
  enProduccionSinConteo: number;
  /** Plantas CONOCIDAS de siembras sin marcar. */
  sinMarcar: number;
  siembrasSinMarcar: number;
  sinMarcarSinConteo: number;
  variedades: { nombre: string | null; plantas: number; cohortesSinConteo: number }[];
}

export function cifrasDelLote(
  cohortes: readonly CohorteParaCifras[],
  estados: ReadonlyMap<string, EstadoDeProduccion>,
): CifrasDelLote {
  let plantasConocidas = 0;
  let cohortesSinConteo = 0;
  let enProduccion = 0;
  let siembrasEnProduccion = 0;
  let enProduccionSinConteo = 0;
  let sinMarcar = 0;
  let siembrasSinMarcar = 0;
  let sinMarcarSinConteo = 0;
  const porVariedad = new Map<string | null, { plantas: number; cohortesSinConteo: number }>();

  for (const c of cohortes) {
    const nombre = c.cultivarValue?.value ?? null;
    const grupo = porVariedad.get(nombre) ?? { plantas: 0, cohortesSinConteo: 0 };
    // Sin evento es «sin marcar», nunca «en producción» ni «en levante».
    const marcada = estados.get(c.id)?.estado === "en_produccion";
    if (marcada) siembrasEnProduccion += 1;
    else siembrasSinMarcar += 1;
    if (c.plantCount == null) {
      cohortesSinConteo += 1;
      grupo.cohortesSinConteo += 1;
      if (marcada) enProduccionSinConteo += 1;
      else sinMarcarSinConteo += 1;
    } else {
      plantasConocidas += c.plantCount;
      grupo.plantas += c.plantCount;
      if (marcada) enProduccion += c.plantCount;
      else sinMarcar += c.plantCount;
    }
    porVariedad.set(nombre, grupo);
  }

  const variedades = [...porVariedad.entries()]
    .map(([nombre, g]) => ({ nombre, ...g }))
    .sort((a, b) => {
      if (a.nombre == null) return 1;
      if (b.nombre == null) return -1;
      return b.plantas - a.plantas;
    });

  return {
    plantasConocidas,
    cohortesSinConteo,
    enProduccion,
    siembrasEnProduccion,
    enProduccionSinConteo,
    sinMarcar,
    siembrasSinMarcar,
    sinMarcarSinConteo,
    variedades,
  };
}
