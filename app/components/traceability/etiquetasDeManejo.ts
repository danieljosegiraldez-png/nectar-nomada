import type { getTranslations } from "next-intl/server";
import type { PlotInterventionKind, PlotInterventionMethod, PlotInterventionTarget } from "../../../generated/prisma/client";

/**
 * Las tres tablas `Record<Enum, string>` de manejo fitosanitario, en un solo
 * sitio — Tarea 8, ronda de arreglos 1 (menor #1 de la revisión).
 *
 * Vivían casi verbatim en cuatro archivos (`IntervencionForm.tsx`,
 * `/plots/[id]/manejo/[interventionId]/page.tsx`, `/plots/[id]/page.tsx`,
 * `/lots/[id]/page.tsx`): ~150 líneas duplicadas. Reunirlas aquí no renuncia
 * al tipado que las motivó — un valor nuevo del enum sin traducir sigue sin
 * compilar, porque el tipo de retorno sigue siendo `Record<Enum, string>`
 * completo.
 *
 * El parámetro `t` acepta tanto el `t` de servidor (`await
 * getTranslations("Traceability")`) como el de cliente
 * (`useTranslations("Traceability")`): los dos son, para el namespace
 * `"Traceability"`, la MISMA instanciación de `ReturnType<typeof
 * createTranslator<Messages, "Traceability">>` — `next-intl` define los dos
 * en términos de ese mismo tipo. No hace falta una unión ni un `any`.
 */
type TDeTraceability = Awaited<ReturnType<typeof getTranslations<"Traceability">>>;

export function textoDeTipoDeManejo(t: TDeTraceability): Record<PlotInterventionKind, string> {
  return {
    aplicacion: t("manejoKind_aplicacion"),
    liberacion: t("manejoKind_liberacion"),
    manejo_cultural: t("manejoKind_manejo_cultural"),
  };
}

/** spec §2.5 — la lista es de Daniel; crecerla es una migración de una línea. */
export function textoDeObjetivoDeManejo(t: TDeTraceability): Record<PlotInterventionTarget, string> {
  return {
    arana_roja: t("manejoTarget_arana_roja"),
    broca: t("manejoTarget_broca"),
    minador_hoja: t("manejoTarget_minador_hoja"),
    cochinillas: t("manejoTarget_cochinillas"),
    nematodos: t("manejoTarget_nematodos"),
    jobotos: t("manejoTarget_jobotos"),
    roya: t("manejoTarget_roya"),
    ojo_de_gallo: t("manejoTarget_ojo_de_gallo"),
    mancha_de_hierro: t("manejoTarget_mancha_de_hierro"),
    antracnosis: t("manejoTarget_antracnosis"),
    llaga_macana: t("manejoTarget_llaga_macana"),
    chasparria: t("manejoTarget_chasparria"),
    otro: t("manejoTarget_otro"),
  };
}

export function textoDeMetodoDeManejo(t: TDeTraceability): Record<PlotInterventionMethod, string> {
  return {
    follaje: t("manejoMethod_follaje"),
    tronco: t("manejoMethod_tronco"),
    suelo: t("manejoMethod_suelo"),
    riego: t("manejoMethod_riego"),
    cebo: t("manejoMethod_cebo"),
    liberacion: t("manejoMethod_liberacion"),
    manual: t("manejoMethod_manual"),
    otro: t("manejoMethod_otro"),
  };
}
