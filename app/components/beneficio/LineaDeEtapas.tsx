import { getTranslations } from "next-intl/server";
import type { Etapa } from "../../../lib/beneficio/lineaDeEtapas";

/**
 * La línea de seis etapas: recepción, flotación, selección, proceso, secado, almacén.
 *
 * Componente de servidor, sin JavaScript de cliente. Quien lo usa mira `sinAmbito` ANTES: con
 * `etapas` vacía **no se pinta ninguna línea**, porque una línea de ceros le diría a quien no ve
 * ningún lote que el beneficio no tiene café en ninguna etapa.
 *
 * **Por qué dos filas de tres en el celular** (y seis en una fila sólo en pantalla ancha): a unos
 * 375 px, seis etapas en fila dejan unos 55 px por etapa —se leen números, no etiquetas—. Con tres
 * por fila cada etapa tiene unos 110 px y cabe su nombre. El acomodo entero de la página, con la
 * decisión de Daniel del 2026-09-18, está en `app/beneficio/page.tsx` y en §4.5 del diseño.
 *
 * **Las dos reglas de color, que son la pieza pedagógica entera** (rúbrica 22):
 * - una etapa `sin_registro` **dice «sin registro de esta etapa»** y **no se colorea**: no es una
 *   alarma, es una ausencia. Se distingue por el borde discontinuo y la tinta apagada, nunca por
 *   un color de alerta, y **jamás pinta un `0`**: un cero diría «no hay nada ahí» y la flotación
 *   no puede decirlo, porque nadie la anota;
 * - una etapa se colorea sólo si `pidenDecision > 0`. Con `0`, no — y el aviso va también en
 *   texto, para quien no distingue el color.
 */
export async function LineaDeEtapas({ etapas }: { etapas: readonly Etapa[] }) {
  const t = await getTranslations("SeccionBeneficio");
  return (
    <ol className="nn-linea" aria-label={t("lineaTitulo")}>
      {etapas.map((e) => {
        const nombre = t(`etapa_${e.clave}`);
        if (e.estado.tipo === "sin_registro") {
          return (
            <li key={e.clave} className="nn-etapa nn-etapa-sin-registro">
              <span className="nn-etapa-nombre">{nombre}</span>
              <span className="nn-etapa-sin-registro-texto">{t("etapaSinRegistro")}</span>
            </li>
          );
        }
        const { lotes, pidenDecision } = e.estado;
        return (
          <li key={e.clave} className={pidenDecision > 0 ? "nn-etapa nn-etapa-decide" : "nn-etapa"}>
            <span className="nn-etapa-nombre">{nombre}</span>
            <span className="nn-etapa-cuenta">{lotes}</span>
            <span className="nn-etapa-unidad">{t("etapaLotes", { n: lotes })}</span>
            {pidenDecision > 0 ? (
              <span className="nn-etapa-decision">{t("etapaPidenDecision", { n: pidenDecision })}</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
