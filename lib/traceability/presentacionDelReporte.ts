import { mostrarInstante } from "../time/mostrarInstante";
import type { SnapshotDeVisita } from "./reporteDeVisita";

/** Los reportes antiguos no guardaban zona. No atribuirles una zona local. */
export function fechaDelReporte(iso: string, zona?: string | null): string {
  const z = zona ?? "UTC";
  return `${mostrarInstante(new Date(iso), z)} (${z})`;
}

export function detalleDelReporte(r: SnapshotDeVisita["registros"][number], traducir: (clave: string) => string): string | null {
  if ((r.inspeccion || r.sujeto === "inspeccion") && (r.detalle === "nothing_unusual" || r.detalle === "issue_observed")) {
    return traducir(`inspectionOutcome_${r.detalle}`);
  }
  return r.detalle ?? null;
}
