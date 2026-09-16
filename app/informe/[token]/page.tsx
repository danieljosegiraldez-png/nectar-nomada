import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { abrirReportePorEnlace } from "../../../lib/traceability/reporteDeVisita";
import type { SnapshotDeVisita } from "../../../lib/traceability/reporteDeVisita";

export const dynamic = "force-dynamic";

/**
 * El informe de una visita, abierto por su enlace y **sin sesión**.
 *
 * **La puerta que faltaba** (medido el 2026-09-10): `publicarReporteConEnlace`
 * y `abrirReportePorEnlace` existían desde A9.6 y **ninguna pantalla los
 * llamaba**. Se podía emitir un token por código y no había dónde canjearlo, así
 * que «mandarle el informe al supervisor» no se podía hacer desde la aplicación.
 *
 * **El token ES la autorización**, y por eso esta página no consulta nada más
 * que el snapshot de esa versión: ni la visita, ni el sitio, ni la finca. El
 * servicio devuelve `null` en los tres casos —no existe, caducó, revocado— sin
 * decir cuál, y aquí se traduce en un 404 único: distinguirlos le diría a quien
 * prueba tokens si acertó el formato.
 *
 * `robots: noindex` porque el enlace es privado aunque no lleve sesión: no debe
 * acabar en un buscador.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function InformePorEnlacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const abierto = await abrirReportePorEnlace(token);
  if (!abierto) notFound();

  const t = await getTranslations("Traceability");
  // El tipo sale del servicio, no de aquí: la primera version invento un
  // `snapshot.eventos` que no existe —son `registros`— y sólo lo dijo leer la
  // interfaz. Con `SnapshotDeVisita` lo comprueba el compilador.
  const { version } = abierto;
  const snapshot: SnapshotDeVisita = abierto.snapshot;

  return (
    <div>
      <h1>{snapshot.sitio.nombre}</h1>
      <p className="nn-detail-meta">
        {t("reportVersionLine", { version, emitido: snapshot.emitidoEn })}
      </p>

      <section className="nn-section">
        <h2>{t("reportVisitHeading")}</h2>
        <p className="nn-detail-meta">
          <span>{t("fieldSessionOperatorLabel")}: {snapshot.visita.operador}</span>{" "}
          <span>{snapshot.visita.inicio}</span>
          {snapshot.visita.fin ? <span> — {snapshot.visita.fin}</span> : null}
        </p>
        {snapshot.visita.notas ? <p>{snapshot.visita.notas}</p> : null}
      </section>

      <section className="nn-section">
        {snapshot.registros.length === 0 ? (
          <p className="nn-muted">{t("reportNoRecords")}</p>
        ) : (
          <ul className="nn-list">
            {snapshot.registros.map((r, i) => (
              <li key={i}>
                {/* **Ésta es la página que ve el cliente por su enlace**, así que es la que
                    más necesitaba la colmena: decía la clase del registro —«inspección»— sin
                    decir de cuál caja ni qué se le hizo. Los reportes emitidos antes del
                    2026-09-15 no traen los dos campos nuevos y se dibujan igual: el snapshot
                    es inmutable y no se reescribe hacia atrás. */}
                {r.colmena ? (
                  <>
                    <strong>{r.colmena}</strong> ·{" "}
                  </>
                ) : null}
                <strong>{r.clase}</strong> · {r.cuando}
                {r.detalle ? ` · ${r.detalle}` : ""}
                {r.sujeto ? ` · ${r.sujeto}` : ""}
                {r.operador ? ` · ${r.operador}` : ""}
                {r.notas ? ` — ${r.notas}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
