import { getTranslations } from "next-intl/server";
import type { SnapshotDeVisita } from "../../../lib/traceability/reporteDeVisita";
import { infestacionPorCiento } from "../../../lib/apiary/infestacion";

/**
 * **`enCuadros` decide si el informe pregunta por cuadros, y lo calcula quien llama** desde
 * `snapshot.sitio.tipo` con `seManejaEnCuadros`. Los meliponinos no se manejan en cuadros: una
 * fila «Cuadros cubiertos: Sin registrar» en el informe de un meliponario afirma que alguien
 * miró y no contó, cuando la pregunta no existe ahí.
 *
 * **El tipo sale del SNAPSHOT y no de la ubicacion de hoy**, que es lo correcto para un
 * documento congelado: si el sitio se reclasificara después, un informe ya emitido no debe
 * cambiar de preguntas.
 *
 * Es la otra mitad del #690, que sólo pudo arreglar el FORMULARIO porque este componente no
 * existía en `main` cuando se escribió.
 */
export async function DetallesDelReporte({ registro, enCuadros }: { registro: SnapshotDeVisita["registros"][number]; enCuadros: boolean }) {
  const t = await getTranslations("Apiary");
  const r = registro.inspeccion;
  const filas: Array<[string, string | number | null]> = r ? [
    [t("populationLabel"), r.poblacion == null ? null : t(`population_${r.poblacion}`)],
    ...(enCuadros ? ([[t("beeCoveredFramesLabel"), r.cuadrosCubiertos]] as Array<[string, string | number | null]>) : []),
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
  // V-7: el conteo de varroa congelado. La infestación se deriva aquí, no se guarda.
  const v = registro.varroa;
  if (v) filas.push([t("varroaMethodLabel"), t(`varroaMethod_${v.metodo}`)], [t("varroaMitesLabel"), v.acaros], [t("varroaSampleBeesLabel"), v.abejas], [t("reportVarroaInfestacion"), v.abejas > 0 ? t("reportPorCiento", { valor: infestacionPorCiento(v.abejas, v.acaros) }) : null]);
  if (!filas.length) return null;
  return <dl>{filas.map(([etiqueta, valor]) => <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor ?? t("reportNotRecorded")}</dd></div>)}</dl>;
}
