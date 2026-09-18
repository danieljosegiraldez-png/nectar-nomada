import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { avisosDeBotiquin } from "../../../lib/inventario/avisos";

/**
 * El aviso del botiquín en el tablero — botiquín, Tarea 8.
 *
 * Va en las pantallas donde se ATERRIZA (`/lots`, `/apiaries` y la ficha de cada
 * apiario), no en `/start`: ésa sólo redirige y no pinta nada (ADR-082). El
 * filtro por permiso vive en `avisosDeBotiquin`; sin avisos, no se pinta nada.
 *
 * Con palabras, no con fechas: «vencido hace 7 días» se entiende de un vistazo.
 */
export async function AvisosDeBotiquin({ userAccountId }: { userAccountId: string }) {
  const avisos = await avisosDeBotiquin(userAccountId);
  if (avisos.length === 0) return null;
  const t = await getTranslations("Inventario");

  return (
    <section className="nn-section" aria-labelledby="avisos-de-botiquin">
      <h2 id="avisos-de-botiquin">{t("avisosTitulo")}</h2>
      <ul>
        {avisos.map((a) => (
          <li key={a.consumableLotId}>
            <strong>{a.producto}</strong> · {a.batchLabel} —{" "}
            {a.estado === "VENCIDO" ? t("avisoVencido", { dias: a.dias }) : t("avisoPorVencer", { dias: a.dias })}
            {a.sitio ? <span className="nn-muted"> · {t("avisoEnSitio", { sitio: a.sitio })}</span> : null}
          </li>
        ))}
      </ul>
      <p className="nn-muted">
        {t("avisosPie")} <Link href="/inventario">{t("avisosVerInventario")}</Link>
      </p>
    </section>
  );
}
