import { getTranslations } from "next-intl/server";
import type { SnapshotDeVisita } from "../../../lib/traceability/reporteDeVisita";

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
  // La sanidad (PR-2 del #674) sólo si el snapshot la congeló. Un informe emitido antes no la trae,
  // y pintarle «Sin registrar» afirmaría que nadie la contestó, cuando lo que pasa es que el
  // documento no la guardó.
  const siCongelado = (valor: unknown, fila: [string, string | number | null]) => (valor === undefined ? [] : [fila]);
  const siNo = (v: boolean | null | undefined) => (v == null ? null : t(v ? "triSi" : "triNo"));
  const filas: Array<[string, string | number | null]> = r ? [
    [t("populationLabel"), r.poblacion == null ? null : t(`population_${r.poblacion}`)],
    ...(enCuadros ? ([[t("beeCoveredFramesLabel"), r.cuadrosCubiertos]] as Array<[string, string | number | null]>) : []),
    // Sin `enCuadros`: el formulario pregunta por los marcos negros en todo sitio.
    ...siCongelado(r.marcosNegros, [t("darkFramesLabel"), r.marcosNegros ?? null]),
    [t("queenSightedLabel"), r.reina == null ? null : t(`queenSighting_${r.reina}`)],
    [t("broodPatternLabel"), r.patronCria == null ? null : t(`broodPattern_${r.patronCria}`)],
    [t("broodStagesLegend"), r.etapasCria.length ? r.etapasCria.map(v => t(`broodStage_${v}`)).join(", ") : null],
    ...siCongelado(r.celdasReales, [t("queenCellsLabel"), r.celdasReales?.tipo == null ? null : [t(`queenCell_${r.celdasReales.tipo}`), r.celdasReales.cuantas].filter((x) => x != null).join(" · ")]),
    ...siCongelado(r.criaDeZangano, [t("droneBroodLabel"), siNo(r.criaDeZangano)]),
    [t("honeyStoresLabel"), r.reservasMiel == null ? null : t(`storesLevel_${r.reservasMiel}`)],
    ...siCongelado(r.mielJuntoACria, [t("reportHoneyNextToBrood"), siNo(r.mielJuntoACria)]),
    [t("pollenStoresLabel"), r.reservasPolen == null ? null : t(`storesLevel_${r.reservasPolen}`)],
    ...siCongelado(r.polenJuntoACria, [t("reportPollenNextToBrood"), siNo(r.polenJuntoACria)]),
    // Casillas: una lista vacía no distingue «no se vio» de «no se miró», así que dice lo que hay.
    ...siCongelado(r.irregularidades, [t("irregularidadesLegend"), r.irregularidades?.length ? r.irregularidades.join(", ") : t("reportNoneMarked")]),
    ...siCongelado(r.otraSenal, [t("pestDiseaseFlagsLabel"), r.otraSenal ?? null]),
    [t("temperamentLabel"), r.temperamento == null ? null : t(`temperament_${r.temperamento}`)],
    [t("noteLabel"), r.nota],
    [t("reportAssessment"), r.valoracion],
  ] : [];
  const a = registro.alimentacion;
  if (a) filas.push([t("feedingMaterialLabel"), [a.tipo ? t(`feedingMaterial_${a.tipo}`) : null, a.material].filter(Boolean).join(" · ") || null], [t("feedingQuantityLabel"), a.cantidad], [t("unitLabel"), a.unidad]);
  if (!filas.length) return null;
  return <dl>{filas.map(([etiqueta, valor]) => <div key={etiqueta}><dt>{etiqueta}</dt><dd>{valor ?? t("reportNotRecorded")}</dd></div>)}</dl>;
}
