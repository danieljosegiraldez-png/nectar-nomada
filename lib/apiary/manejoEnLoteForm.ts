import { fechaDeDia } from "../time/localDateTime";
import type { EventoEnLoteInput } from "./colonyEvents";

/**
 * Lee el formulario de manejo en lote (`ManejoEnLoteForm`) y lo convierte en la entrada de
 * `registrarEventoEnLote`, salvo el id de lote, que sigue naciendo en la acción (es la clave de
 * reintento y no puede cambiar entre reenvíos).
 *
 * **Por qué vive fuera de la acción.** Un archivo `"use server"` sólo puede exportar funciones
 * `async` (`tests/arquitectura/use-server-solo-async.test.ts`), y el defecto que esto arregla vivía
 * justo en la lectura: había que poder probarla sin sesión ni base.
 *
 * **El material de alimentación** (revisión de Apiario del 2026-10-08, V-5). El formulario envía
 * `feedingMaterialKind` y la acción no lo leía: cada colonia del lote quedaba con cantidad y unidad
 * pero sin decir si fue azúcar o jarabe, y con «Otro» se guardaba el texto sin el valor `otro`. La
 * ficha de una colonia (`ColonyEventQuickEntry`) y la cola sin conexión (`pushFieldEvents`) sí lo
 * pasaban, así que el dato dependía de la puerta por la que entrara.
 *
 * `occurredAt` y `coverageUntil` son campos de DÍA (medianoche UTC), no instantes: tratarlos como
 * instantes es el fallo que ADR-112 documenta.
 */
export function leerManejoEnLote(
  formData: FormData,
  ahora: Date = new Date(),
): Omit<EventoEnLoteInput, "loteDeClienteId"> & { apiaryId: string } {
  const numero = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    if (bruto === "") return null;
    const n = Number(bruto);
    return Number.isFinite(n) ? n : null;
  };
  const texto = (clave: string) => {
    const bruto = String(formData.get(clave) ?? "").trim();
    return bruto === "" ? null : bruto;
  };

  const dia = fechaDeDia(String(formData.get("occurredAt") ?? ""), "occurredAt");

  return {
    apiaryId: String(formData.get("apiaryId") ?? ""),
    colonyIds: formData.getAll("colonyIds").map((v) => String(v)).filter((v) => v.length > 0),
    eventType: String(formData.get("eventType") ?? "") as "feeding" | "treatment",
    occurredAt: dia ?? ahora,
    feedingMaterialKind: texto("feedingMaterialKind"),
    feedingMaterial: texto("feedingMaterial"),
    feedingQuantity: numero("feedingQuantity"),
    feedingUnit: texto("feedingUnit"),
    feedingMethod: texto("feedingMethod"),
    coverageUntil: fechaDeDia(String(formData.get("coverageUntil") ?? ""), "coverageUntil"),
    treatmentProduct: texto("treatmentProduct"),
    treatmentBatchLabel: texto("treatmentBatchLabel"),
    treatmentWithdrawalDays: numero("treatmentWithdrawalDays"),
    treatmentTarget: texto("treatmentTarget"),
    treatmentRoute: texto("treatmentRoute"),
    treatmentDose: numero("treatmentDose"),
    treatmentDoseUnit: texto("treatmentDoseUnit"),
    note: texto("note"),
  };
}
