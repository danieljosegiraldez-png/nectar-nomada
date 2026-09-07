import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "../../../../lib/auth/session";
import { getApiaryDetail, ApiaryAccessError } from "../../../../lib/apiary/hives";
import { urlDeColmena, svgDeQr } from "../../../../lib/apiary/etiquetasQr";
import { PrintButton } from "../../../components/traceability/PrintButton";

export const dynamic = "force-dynamic";

/**
 * A9.7 (D8) — la hoja de calcomanías de un apiario.
 *
 * **Lo que ahorra.** Hoy, para registrar en la caja N-01 hay que abrir la
 * aplicación, encontrar el apiario, encontrar la colmena y entrar. Con la
 * calcomanía puesta, la cámara del teléfono abre esa página directamente — sin
 * aplicación instalada, y sin señal, porque `/apiaries` ya está precacheado.
 *
 * **El QR se genera en el servidor y va incrustado como SVG.** Nada se pide a
 * la red al imprimir: una hoja que dependiera de un servicio externo no se
 * imprimiría en el sitio donde hace falta.
 *
 * **Debajo de cada código va la URL en texto.** Cuando la cámara falla —y falla
 * con sol de mediodía— alguien la teclea. Un código sin su texto es un código
 * que sólo funciona en buenas condiciones.
 */
export default async function EtiquetasDeApiarioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("Apiary");

  let apiary;
  try {
    apiary = await getApiaryDetail(user.userAccountId, id);
  } catch (error) {
    if (error instanceof ApiaryAccessError) notFound();
    throw error;
  }

  // El origen sale de la petición: la misma hoja impresa desde el móvil de
  // campo y desde la laptop tiene que apuntar al mismo sitio, y codificar
  // `localhost` en cien calcomanías sería irreversible.
  const cabeceras = await headers();
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host") ?? "";
  const protocolo = cabeceras.get("x-forwarded-proto") ?? "https";
  const base = `${protocolo}://${host}`;

  return (
    <div>
      <p className="nn-back-link">
        <Link href={`/apiaries/${apiary.id}`}>{t("backToApiary")}</Link>
      </p>

      <div className="nn-report-actions">
        <PrintButton />
      </div>

      <h1>{t("labelsHeading", { sitio: apiary.name })}</h1>
      <p className="nn-detail-meta">{t("labelsIntro", { count: apiary.hives.length })}</p>

      {apiary.hives.length === 0 ? (
        <p className="nn-muted">{t("noHives")}</p>
      ) : (
        <div className="nn-grid nn-etiquetas">
          {apiary.hives.map((hive) => {
            const url = urlDeColmena(base, apiary.id, hive.id);
            return (
              <div key={hive.id} className="nn-etiqueta">
                <h2>{hive.identifier}</h2>
                <p className="nn-detail-meta">{apiary.name}</p>
                {/* El SVG viene de nuestro propio codificador sobre datos
                    nuestros: no hay entrada de usuario en este marcado. */}
                <div dangerouslySetInnerHTML={{ __html: svgDeQr(url) }} />
                <p className="nn-etiqueta-url">{url}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
