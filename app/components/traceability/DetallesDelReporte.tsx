import { getTranslations } from "next-intl/server";
import type { SnapshotDeVisita } from "../../../lib/traceability/reporteDeVisita";

export async function DetallesDelReporte({ registro }: { registro: SnapshotDeVisita["registros"][number] }) {
  const t = await getTranslations("Apiary");
  const r = registro.inspeccion;
  const filas: Array<[string, string | number | null]> = r ? [
    [t("populationLabel"), r.poblacion == null ? null : t(`population_${r.poblacion}`)],
    [t("beeCoveredFramesLabel"), r.cuadrosCubiertos],
    [t("queenSightedLabel"), r.reina == null ? null : t(`queenSighting_${r.reina}`)],
    [t("broodPatternLabel"), r.patronCria == null ? null : t(`broodPattern_${r.patronCria}`)],
    [t("broodStagesLegend"), r.etapasCria.length ? r.etapasCria.map(v => t(`broodStage_${v}`)).join(", ") : null],
    [t("honeyStoresLabel"), r.reservasMiel == null ? null : t(`storesLevel_${r.reservasMiel}`)],
    [t("pollenStoresLabel"), r.reservasPolen == null ? null : t(`storesLevel_${r.reservasPolen}`)],
    [t("temperamentLabel"), r.temperamento == null ? null : t(`temperament_${r.temperamento}`)],
    [t("noteLabel"), r.nota],
    [t("reportAssessment"), r.valoracion],
  ] : [];
  const a = registro.alimentacion;
  if (a) filas.push([t("feedingMaterialLabel"), [a.tipo ? t(`feedingMaterial_${a.tipo}`) : null, a.material].filter(Boolean).join(" · ") || null], [t("feedingQuantityLabel"), a.cantidad], [t("unitLabel"), a.unidad]);
  if (!filas.length) return null;
  return <dl>{filas.map(([etiqueta, valor]) => <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor ?? t("reportNotRecorded")}</dd></div>)}</dl>;
}
