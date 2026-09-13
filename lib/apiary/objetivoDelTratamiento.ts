/**
 * Contra qué y cómo se trató: el vocabulario, y el reporte que lo justifica.
 *
 * **Qué cierra.** `48_A9_ANEXO_B_CATALOGO_DE_CAMPOS.md` §4 marca «Objetivo» como
 * **obligatorio** —el último de esa columna que seguía sin existir— y dice para
 * qué: *«eficacia por objetivo; hoy no se puede agrupar»*. Sin este campo, «qué se
 * trató contra varroa esta temporada» no es una consulta, igual que antes de
 * ADR-114 no lo era «todas las colonias con varroa».
 *
 * **Vocabulario propio, no el catálogo de irregularidades**, aunque cuatro valores
 * se llamen igual. Misma distinción que ADR-114: **lo que se observa no es lo que
 * se trata**. La lista de irregularidades tiene trece valores y ninguno de los
 * otros nueve —moho, loque, alas deformadas, obrera ponedora— es algo contra lo
 * que se aplique un producto.
 *
 * Pura y sin base de datos en su mitad de arriba, porque el formulario de campo es
 * `"use client"`; el reporte, abajo, sí lee.
 */
import { prisma } from "../db";
import { OBJETIVOS_DE_TRATAMIENTO } from "./vocabularioDeTratamiento";
import type { TreatmentTarget } from "../../generated/prisma/client";

/**
 * El vocabulario vive en `./vocabularioDeTratamiento`, sin `prisma` detrás, porque
 * el formulario de campo es `"use client"`. Se re-exporta para que nadie más tenga
 * que saberlo — pero **un componente de cliente debe importarlo de allí**, no de
 * aquí: importarlo de aquí arrastra `lib/db` al navegador y rompe el build.
 */
export {
  TratamientoInvalido,
  OBJETIVOS_DE_TRATAMIENTO,
  VIAS_DE_TRATAMIENTO,
  VIAS_QUE_DEJAN_MATERIAL,
  exigeObjetivo,
  exigeVia,
} from "./vocabularioDeTratamiento";

export interface ConteoPorObjetivo {
  target: TreatmentTarget;
  /** Aplicaciones dentro de la ventana. */
  tratamientos: number;
  /**
   * Colonias DISTINTAS tratadas. Es el número que interesa: tres aplicaciones a
   * la misma caja son un problema de esa caja, no tres cajas con problema. Misma
   * decisión que `coloniasPorIrregularidad`.
   */
  colonias: number;
}

/**
 * Qué se trató, contra qué, en un sitio y una ventana.
 *
 * **Devuelve los cinco objetivos, también los que valen cero**, por la misma razón
 * que el reporte de irregularidades: «no se trató contra polilla» y «nadie
 * registró tratamientos contra polilla» no son lo mismo, y una fila ausente los
 * confunde.
 *
 * **No autoriza y no pide principal**, misma disciplina que sus hermanas del
 * módulo: quien llama ya obtuvo el `locationId` de una lectura que sí autoriza.
 */
export async function tratamientosPorObjetivo(
  locationId: string,
  desde: Date,
  hasta: Date,
): Promise<ConteoPorObjetivo[]> {
  const aplicaciones = await prisma.colonyEvent.findMany({
    where: {
      eventType: "treatment",
      occurredAt: { gte: desde, lt: hasta },
      colony: { hive: { locationId } },
    },
    select: { colonyId: true, treatmentTarget: true },
  });

  return OBJETIVOS_DE_TRATAMIENTO.map((target) => {
    const suyas = aplicaciones.filter((a) => a.treatmentTarget === target);
    return {
      target,
      tratamientos: suyas.length,
      colonias: new Set(suyas.map((a) => a.colonyId)).size,
    };
  });
}
