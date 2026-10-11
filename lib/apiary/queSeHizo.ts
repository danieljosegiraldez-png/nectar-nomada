import { infestacionPorCiento } from "./infestacion";

/**
 * **Qué se le hizo a qué caja, en una línea** — V-6 de la revisión del Apiario (2026-10-10).
 *
 * La pantalla de la visita pintaba cada registro como su clase («observacion»), la hora y la nota:
 * una visita de diez cajas era diez «observacion» seguidas, sin decir cuál ni qué. Esto toma lo
 * que el lector de la visita (`getFieldSessionTimeline`) trae de cada registro del apiario y lo
 * dice: la caja y lo hecho.
 *
 * **Sólo lo que la fila declara**, la misma regla que `detalleDe` en `reporteDeVisita.ts`: un
 * manejo sin producto anotado dice su tipo y nada más, una cosecha sin peso no inventa uno.
 *
 * Pura y sin `prisma`, para que la prueba corra sin base. Los registros que no son del apiario
 * (mediciones, cosecha de café…) devuelven `null` y la línea sigue como antes.
 */

interface DeUnaCaja {
  colony: { hive: { identifier: string } };
}

export interface RegistroDelApiario {
  inspection: ({ outcome: string } & DeUnaCaja) | null;
  colonyEvent: ({ eventType: string; treatmentProduct: string | null; feedingMaterial: string | null } & DeUnaCaja) | null;
  apiaryHarvestEvent: ({ extractedWeightKg: { toString(): string } | null } & DeUnaCaja) | null;
  varroaCount: ({ mitesCounted: number; sampleBees: number } & DeUnaCaja) | null;
}

type Traducir = (clave: string, valores?: Record<string, string | number>) => string;

export function cajaDelRegistro(r: RegistroDelApiario): string | null {
  return (r.inspection ?? r.colonyEvent ?? r.apiaryHarvestEvent ?? r.varroaCount)?.colony.hive.identifier ?? null;
}

/** `t` es el traductor del espacio `Apiary`. */
export function queSeHizo(r: RegistroDelApiario, t: Traducir): string | null {
  if (r.inspection) return `${t("reportSujeto_inspeccion")}: ${t(`inspectionOutcome_${r.inspection.outcome}`)}`;
  if (r.colonyEvent) {
    const e = r.colonyEvent;
    const detalle = e.eventType === "treatment" ? e.treatmentProduct : e.eventType === "feeding" ? e.feedingMaterial : null;
    return detalle ? `${t(`colonyEventType_${e.eventType}`)}: ${detalle}` : t(`colonyEventType_${e.eventType}`);
  }
  if (r.apiaryHarvestEvent) {
    const kg = r.apiaryHarvestEvent.extractedWeightKg;
    return kg != null ? `${t("reportSujeto_cosecha")}: ${kg.toString()} kg` : t("reportSujeto_cosecha");
  }
  if (r.varroaCount) {
    const v = r.varroaCount;
    // Derivado al pintar, como en la ficha: lo que se guarda es lo contado.
    return t("registroVarroa", { acaros: v.mitesCounted, abejas: v.sampleBees, porCiento: infestacionPorCiento(v.sampleBees, v.mitesCounted) });
  }
  return null;
}
