/**
 * Qué se trató, contra qué, en un sitio y una ventana.
 *
 * **Aparte del catálogo a propósito.** `objetivoDelTratamiento.ts` lo importa un
 * componente `"use client"`, así que no puede tocar la base: un
 * `import { prisma }` a nivel de módulo se traza aunque el cliente sólo use una
 * constante. Es el mismo reparto que `alimentacion.ts` / `alcanceDelAlimento.ts`.
 */
import { prisma } from "../db";
import type { TreatmentTarget } from "../../generated/prisma/client";
import { OBJETIVOS_DE_TRATAMIENTO } from "./objetivoDelTratamiento";

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
