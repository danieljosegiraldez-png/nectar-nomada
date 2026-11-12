import { mostrarInstante } from "../time/mostrarInstante";
import type { SnapshotDeVisita } from "./reporteDeVisita";

/** Los reportes antiguos no guardaban zona. No atribuirles una zona local. */
export function fechaDelReporte(iso: string, zona?: string | null): string {
  const z = zona ?? "UTC";
  return `${mostrarInstante(new Date(iso), z)} (${z})`;
}

/** Los sujetos que `emitirReporteDeVisita` congela, y que la pantalla sabe decir. */
export const SUJETOS_DEL_REPORTE = ["inspeccion", "evento_de_colonia", "cosecha", "medicion", "conteo_de_varroa"] as const;

/**
 * El sujeto de una línea del informe, **con palabras y no con su código** — V-7 de la revisión
 * del Apiario (2026-10-10). Hasta entonces el informe, también el del cliente, imprimía
 * `evento_de_colonia` tal cual. Con el tipo de manejo congelado dice cuál fue; lo emitido antes,
 * sin él, dice «manejo de colonia». Un código que no conoce se deja como está: no se inventa una
 * etiqueta. `traducir` es el del espacio `Apiary`.
 */
export function sujetoDelReporte(r: SnapshotDeVisita["registros"][number], traducir: (clave: string) => string): string | null {
  if (r.manejo) return traducir(`colonyEventType_${r.manejo}`);
  if (r.sujeto && (SUJETOS_DEL_REPORTE as readonly string[]).includes(r.sujeto)) return traducir(`reportSujeto_${r.sujeto}`);
  return r.sujeto;
}

export function detalleDelReporte(r: SnapshotDeVisita["registros"][number], traducir: (clave: string) => string): string | null {
  if ((r.inspeccion || r.sujeto === "inspeccion") && (r.detalle === "nothing_unusual" || r.detalle === "issue_observed")) {
    return traducir(`inspectionOutcome_${r.detalle}`);
  }
  return r.detalle ?? null;
}
